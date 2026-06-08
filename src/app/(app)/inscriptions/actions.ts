"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  FinancingMode,
  InscriptionSource,
} from "@/lib/inscriptions/types";
import {
  cascadeDeleteEnrollmentsFromRequest,
  createMirroredEnrollmentForRequest,
  syncStageChangeToEnrollment,
} from "@/lib/inscriptions/sync";
import { cleanupUserEmptyDrafts } from "@/lib/inscriptions/cleanup";
import { logInscriptionDeletion } from "@/lib/inscriptions/deletion-log";

async function getOrgId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Aucune organisation");
  return { organizationId: data.organization_id as string, userId: user.id };
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function parseFloat0(raw: FormDataEntryValue | null): number | null {
  const s = parseText(raw);
  if (!s) return null;
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseBool(raw: FormDataEntryValue | null): boolean {
  if (raw === null) return false;
  return raw === "on" || raw === "true";
}

/**
 * Si l'utilisateur a saisi une nouvelle entreprise (texte libre, ou via
 * SIRENE) et que `company_id` est vide, on la crée — ou on réutilise
 * une entreprise homonyme existante. Renvoie l'ID à utiliser, ou null.
 *
 * Utilisé par createInscription ET updateInscription pour garantir le
 * même comportement de création / rattachement d'entreprise.
 */
async function resolveCompanyId(
  formData: FormData,
  organizationId: string,
  userId: string,
  currentCompanyId: string | null,
  currentFreetext: string | null,
): Promise<string | null> {
  if (currentCompanyId) return currentCompanyId;

  // Étape C (Gilles 2026-05-21) : depuis l'embarquement du CompanyForm
  // complet sous le picker entreprise, le nom officiel se trouve dans
  // `new_company_name`. On retombe sur `company_name_freetext` si ce
  // champ est absent (cas legacy ou submission externe).
  const newCompanyName = parseText(formData.get("new_company_name"));
  const resolvedName = newCompanyName ?? currentFreetext;
  if (!resolvedName) return null;

  const supabase = await createClient();

  // 1) Réutilisation d'une entreprise homonyme déjà en base
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", resolvedName)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  // 2) Création avec toutes les données du CompanyForm embarqué.
  const rawStatus = parseText(formData.get("new_company_legal_status"));
  const legal_status =
    rawStatus === "A" || rawStatus === "C" || rawStatus === "D"
      ? rawStatus
      : null;
  let pappers_url = parseText(formData.get("new_company_pappers_url"));
  const siren = parseText(formData.get("new_company_siren"));
  if (!pappers_url && siren) {
    pappers_url = `https://www.pappers.fr/entreprise/${siren}`;
  }

  const companyType =
    parseText(formData.get("new_company_type")) ?? "prospect";
  // Checkbox HTML : on lit la présence de la valeur (browser n'envoie le
  // champ que si coché). On défaut à true côté création.
  const isActiveRaw = formData.get("new_company_is_active");
  const is_active = isActiveRaw !== null ? parseBool(isActiveRaw) : true;
  // Country : par défaut "France" si non saisi (CompanyForm pré-remplit
  // mais on garde la sécurité côté serveur).
  const country = parseText(formData.get("new_company_country")) ?? "France";

  const { data: created } = await supabase
    .from("companies")
    .insert({
      organization_id: organizationId,
      name: resolvedName,
      type: companyType,
      created_by: userId,
      is_active,
      lead_source: parseText(formData.get("new_company_lead_source")),
      siret: parseText(formData.get("new_company_siret")),
      siren,
      legal_form: parseText(formData.get("new_company_legal_form")),
      industry: parseText(formData.get("new_company_industry")),
      naf_code: parseText(formData.get("new_company_naf_code")),
      legal_status,
      pappers_url,
      nda: parseText(formData.get("new_company_nda")),
      address: parseText(formData.get("new_company_address")),
      postal_code: parseText(formData.get("new_company_postal_code")),
      city: parseText(formData.get("new_company_city")),
      country,
      email: parseText(formData.get("new_company_email")),
      phone: parseText(formData.get("new_company_phone")),
      website: parseText(formData.get("new_company_website")),
      notes: parseText(formData.get("new_company_notes")),
    })
    .select("id")
    .single();
  return (created?.id as string | null) ?? null;
}

/**
 * Propage les 4 champs representant_* du formulaire d'inscription vers
 * la fiche entreprise (companies). Si l'utilisateur a saisi/modifie le
 * rep legal dans le bloc dedie de l'inscription, on met a jour la
 * companies pour que les futures conventions reprennent ces valeurs.
 *
 * Logique :
 * - Si AUCUN champ saisi -> on ne touche pas (preserve l'existant).
 * - Si au moins 1 champ saisi -> UPDATE complet (les 4 champs).
 *
 * Gilles 2026-05-28.
 */
async function propagateLegalRepToCompany(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string | null,
  formData: FormData,
): Promise<void> {
  if (!companyId) return;
  const civRaw = parseText(formData.get("representant_civility"));
  const civ = civRaw === "M." || civRaw === "Mme" ? civRaw : null;
  const fn = parseText(formData.get("representant_first_name"));
  const ln = parseText(formData.get("representant_last_name"));
  const jt = parseText(formData.get("representant_job_title"));
  // Tous vides -> ne rien faire (on n'efface pas l'existant)
  if (!civ && !fn && !ln && !jt) return;
  await supabase
    .from("companies")
    .update({
      representant_civility: civ,
      representant_first_name: fn,
      representant_last_name: ln,
      representant_job_title: jt,
    })
    .eq("id", companyId);
}

async function logEvent(
  requestId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  fromStageId?: string | null,
  toStageId?: string | null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("inscription_events").insert({
    request_id: requestId,
    event_type: eventType,
    from_stage_id: fromStageId ?? null,
    to_stage_id: toStageId ?? null,
    payload,
    actor_id: user?.id ?? null,
  });
}

function buildPayload(formData: FormData) {
  return {
    source:
      (parseText(formData.get("source")) as InscriptionSource | null) ??
      "email",
    source_details: parseText(formData.get("source_details")),

    learner_id: parseText(formData.get("learner_id")),
    prospect_first_name: parseText(formData.get("prospect_first_name")),
    prospect_last_name: parseText(formData.get("prospect_last_name")),
    prospect_email: parseText(formData.get("prospect_email")),
    prospect_phone: parseText(formData.get("prospect_phone")),
    prospect_mobile: parseText(formData.get("prospect_mobile")),
    prospect_birth_date: parseText(formData.get("prospect_birth_date")),
    // Civilité (migration 0098). Bug Gilles 2026-05-26 : la valeur
    // saisie n'était pas reportée sur la colonne, donc l'affichage
    // de l'inscription après save montrait toujours une civilité vide.
    prospect_civility: (() => {
      const raw = parseText(formData.get("prospect_civility"));
      return raw === "M." || raw === "Mme" || raw === "Autre" ? raw : null;
    })(),

    company_id: parseText(formData.get("company_id")),
    company_name_freetext: parseText(formData.get("company_name_freetext")),

    target_session_id: parseText(formData.get("target_session_id")),
    target_parcours_id: parseText(formData.get("target_parcours_id")),
    target_formation_id: parseText(formData.get("target_formation_id")),

    financing_mode: ((): FinancingMode => {
      // Le choix utilisateur (select #financing_mode) prime TOUJOURS.
      // L'override injecté par _channel-field.tsx selon le canal :
      //   - of      → "autre"
      //   - direct  → "autofinancement"
      // n'intervient que comme FALLBACK quand le select est vide. Sinon
      // un canal "direct" écrasait silencieusement un choix manuel "opco"
      // de l'utilisateur (bug constaté le 2026-05-13 par Gilles).
      const override = parseText(formData.get("financing_mode_override"));
      const selected = parseText(formData.get("financing_mode"));
      // Fallback "employeur" (Gilles 2026-05-26) — cohérent avec le
      // défaut du draft et du state React de la section Financement.
      return ((selected || override) as FinancingMode | null) ?? "employeur";
    })(),
    financing_details: parseText(formData.get("financing_details")),
    quote_amount_ht: parseFloat0(formData.get("quote_amount_ht")),
    // OPCO choisi dans le référentiel (Gilles 2026-05-21 — Phase 2 OPCO).
    // Persisté uniquement si mode = "opco" ; sinon l'input caché envoie "".
    opco_id: parseText(formData.get("opco_id")),

    has_special_needs: parseBool(formData.get("has_special_needs")),
    special_needs_details: parseText(formData.get("special_needs_details")),

    contact_preference:
      parseText(formData.get("contact_preference")) ?? "email",

    request_message: parseText(formData.get("request_message")),
    notes_internal: parseText(formData.get("notes_internal")),

    assigned_to: parseText(formData.get("assigned_to")),

    // Canal d'inscription (chantier 1) — qui a apporté la demande ?
    inscription_channel: ((): "direct" | "prescripteur" | "of" => {
      const raw = parseText(formData.get("inscription_channel"));
      return raw === "prescripteur" || raw === "of" ? raw : "direct";
    })(),
    inscription_channel_company_id: ((): string | null => {
      const ch = parseText(formData.get("inscription_channel"));
      const cid = parseText(formData.get("inscription_channel_company_id"));
      // Pas de société rattachée si canal direct
      if (ch !== "prescripteur" && ch !== "of") return null;
      return cid;
    })(),
    // Synchronise referrer_company_id avec la société du canal (OF /
    // prescripteur). Indispensable : le PORTAIL du partenaire filtre ses
    // inscriptions sur referrer_company_id. Sans ça, une inscription saisie
    // par CAP pour un prescripteur n'apparaissait pas sur son portail
    // (bug Gilles 2026-06-05). Pour le partenaire qui s'inscrit lui-même,
    // les deux champs sont déjà posés à la même valeur (cf. partenaire/actions).
    referrer_company_id: ((): string | null => {
      const ch = parseText(formData.get("inscription_channel"));
      const cid = parseText(formData.get("inscription_channel_company_id"));
      if (ch !== "prescripteur" && ch !== "of") return null;
      return cid;
    })(),
  };
}

/**
 * Crée un BROUILLON d'inscription_request vide (stage initial du
 * workflow) et renvoie son id. Utilisé par /inscriptions/new pour
 * permettre à l'utilisateur de remplir le formulaire directement sur
 * la fiche détail (qui sait gérer le panneau OPCO réactif, l'upload
 * PDF + OCR, etc.). Évite ainsi d'avoir deux méthodes de saisie
 * différentes entre la création et l'édition (décision Gilles 2026-05-13).
 *
 * AVANT la création, on nettoie les brouillons vides précédents de
 * l'utilisateur (anti-pollution BDD si l'utilisateur quitte sans
 * sauvegarder). Voir `cleanupUserEmptyDrafts`.
 */
export async function createDraftInscription(
  preset?: {
    sessionId?: string | null;
    parcoursId?: string | null;
    formationId?: string | null;
  },
): Promise<string> {
  const { organizationId, userId } = await getOrgId();
  const supabase = await createClient();

  // Nettoyage anti-pollution : on supprime les brouillons vides
  // précédents de l'utilisateur avant d'en créer un nouveau.
  await cleanupUserEmptyDrafts(supabase, organizationId, userId);

  // Stage initial du workflow ("Nouvelle demande" par défaut).
  const { data: initial } = await supabase
    .from("inscription_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_initial", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("inscription_requests")
    .insert({
      organization_id: organizationId,
      source: "autre",
      stage_id: initial?.id ?? null,
      target_session_id: preset?.sessionId ?? null,
      target_parcours_id: preset?.parcoursId ?? null,
      target_formation_id: preset?.formationId ?? null,
      // Defaut "employeur" — cas le plus frequent pour CAP NUMERIQUE
      // (formations financees par l'entreprise du salarie). Gilles
      // 2026-05-26 — bug d'affichage : le draft cree en BDD avec
      // 'autofinancement' s'affichait sur la fiche meme si le state
      // React etait initialise sur 'employeur'.
      financing_mode: "employeur",
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(
      `Création du brouillon impossible : ${error?.message ?? "erreur inconnue"}`,
    );
  }
  return created.id as string;
}

export async function createInscription(formData: FormData) {
  const { organizationId, userId } = await getOrgId();
  const payload = buildPayload(formData);

  const supabase = await createClient();

  // 1) Création / rattachement d'entreprise (logique factorisée)
  const resolvedCompanyId = await resolveCompanyId(
    formData,
    organizationId,
    userId,
    payload.company_id,
    payload.company_name_freetext,
  );
  if (resolvedCompanyId) {
    payload.company_id = resolvedCompanyId;
  }

  // 2) Si un apprenant n'est pas sélectionné mais qu'on a nom + prénom,
  //    on le crée dans le module Apprenants. Si email existe déjà, on
  //    réutilise le learner correspondant.
  const prospectJobTitle = parseText(formData.get("prospect_job_title"));
  const prospectCivilityRaw = parseText(formData.get("prospect_civility"));
  // Whitelist : on n'accepte que les 3 valeurs autorisées par l'enum UI.
  const prospectCivility =
    prospectCivilityRaw === "M." ||
    prospectCivilityRaw === "Mme" ||
    prospectCivilityRaw === "Autre"
      ? prospectCivilityRaw
      : null;
  if (!payload.learner_id && payload.prospect_first_name && payload.prospect_last_name) {
    let foundId: string | null = null;
    if (payload.prospect_email) {
      const { data: byEmail } = await supabase
        .from("learners")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("email", payload.prospect_email)
        .limit(1)
        .maybeSingle();
      foundId = (byEmail?.id as string | null) ?? null;
    }
    // FIX Gilles 2026-06-02 : si pas d email, on cherche aussi par
    // (nom + prenom + entreprise) pour eviter de creer un doublon de
    // learner en cas de double-soumission du formulaire.
    if (
      !foundId &&
      payload.prospect_first_name &&
      payload.prospect_last_name
    ) {
      const baseQuery = supabase
        .from("learners")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("first_name", payload.prospect_first_name)
        .ilike("last_name", payload.prospect_last_name);
      const { data: byName } = payload.company_id
        ? await baseQuery
            .eq("company_id", payload.company_id)
            .limit(1)
            .maybeSingle()
        : await baseQuery.is("email", null).limit(1).maybeSingle();
      foundId = (byName?.id as string | null) ?? null;
    }
    if (!foundId) {
      const { data: newLearner } = await supabase
        .from("learners")
        .insert({
          organization_id: organizationId,
          first_name: payload.prospect_first_name,
          last_name: payload.prospect_last_name,
          email: payload.prospect_email,
          phone: payload.prospect_phone,
          birth_date: payload.prospect_birth_date,
          job_title: prospectJobTitle,
          civility: prospectCivility,
          company_id: payload.company_id,
          is_active: true,
        })
        .select("id")
        .single();
      foundId = (newLearner?.id as string | null) ?? null;
    }
    if (foundId) {
      payload.learner_id = foundId;
    }
  }

  // 3) Si learner_id fourni : on synchronise dans LES DEUX SENS la fiche
  //    apprenant et la demande d'inscription.
  //    a) Demande → Apprenant : si l'utilisateur a saisi une info (tél,
  //       email, fonction, date de naissance) qui n'est PAS encore
  //       enregistrée sur la fiche apprenant, on la remonte. Comme ça
  //       le module Apprenants est tenu à jour automatiquement.
  //    b) Apprenant → Demande : pour les champs qui restent vides côté
  //       formulaire, on copie les valeurs de la fiche apprenant pour
  //       que la demande affiche un snapshot complet.
  if (payload.learner_id) {
    const { data: learner } = await supabase
      .from("learners")
      .select(
        "first_name, last_name, email, phone, mobile, birth_date, job_title, civility, company_id",
      )
      .eq("id", payload.learner_id)
      .maybeSingle();
    if (learner) {
      // a) Sync demande → apprenant. Règle évoluée Gilles 2026-05-26 :
      //    l'utilisateur peut désormais choisir si la modification des
      //    coordonnées doit aussi mettre à jour la fiche apprenant (radio
      //    "OUI / NON" affiché côté form-picker quand des changements
      //    sont détectés). Si NON, on saute toute la sync vers learners
      //    et seul l'inscription_request stocke les nouvelles valeurs.
      const userChoseToUpdateLearner =
        parseText(formData.get("update_learner_contact")) !== "no";
      // Hoisted ici car réutilisé dans le bloc "snapshot" plus bas.
      const learnerMobile = (learner as unknown as { mobile?: string | null })
        .mobile;
      const learnerUpdates: Record<string, unknown> = {};
      if (userChoseToUpdateLearner) {
        // Gilles 2026-05-25 : on inclut maintenant prenom/nom dans la
        // sync demande -> apprenant (cas vecu : correction d'une typo
        // CELLAR -> CELLARD qui ne se propageait pas au module
        // Apprenants ni a la page Participants).
        if (
          payload.prospect_first_name &&
          payload.prospect_first_name !== learner.first_name
        )
          learnerUpdates.first_name = payload.prospect_first_name;
        if (
          payload.prospect_last_name &&
          payload.prospect_last_name !== learner.last_name
        )
          learnerUpdates.last_name = payload.prospect_last_name;
        if (
          payload.prospect_email &&
          payload.prospect_email !== learner.email
        )
          learnerUpdates.email = payload.prospect_email;
        if (
          payload.prospect_phone &&
          payload.prospect_phone !== learner.phone
        )
          learnerUpdates.phone = payload.prospect_phone;
        if (
          payload.prospect_mobile &&
          payload.prospect_mobile !== learnerMobile
        )
          learnerUpdates.mobile = payload.prospect_mobile;
        if (
          payload.prospect_birth_date &&
          payload.prospect_birth_date !== learner.birth_date
        )
          learnerUpdates.birth_date = payload.prospect_birth_date;
        if (prospectJobTitle && prospectJobTitle !== learner.job_title)
          learnerUpdates.job_title = prospectJobTitle;
        if (prospectCivility && prospectCivility !== learner.civility)
          learnerUpdates.civility = prospectCivility;
      }
      // company_id : reste synchronisé même si "non" (pas une coordonnée
      // de contact, mais un rattachement structurel)
      if (payload.company_id && payload.company_id !== learner.company_id)
        learnerUpdates.company_id = payload.company_id;
      if (Object.keys(learnerUpdates).length > 0) {
        await supabase
          .from("learners")
          .update(learnerUpdates)
          .eq("id", payload.learner_id);
      }
      // b) Compléter la demande avec les infos de l'apprenant (snapshot)
      payload.prospect_first_name =
        payload.prospect_first_name ?? (learner.first_name as string | null);
      payload.prospect_last_name =
        payload.prospect_last_name ?? (learner.last_name as string | null);
      payload.prospect_email =
        payload.prospect_email ?? (learner.email as string | null);
      payload.prospect_phone =
        payload.prospect_phone ?? (learner.phone as string | null);
      payload.prospect_mobile =
        payload.prospect_mobile ?? (learnerMobile ?? null);
      payload.prospect_birth_date =
        payload.prospect_birth_date ?? (learner.birth_date as string | null);
      if (!payload.company_id && learner.company_id) {
        payload.company_id = learner.company_id as string;
      }
    }
  }

  // Garde-fou contre les doublons : un apprenant ne peut avoir qu'une
  // seule demande pour une session donnée (cf. index unique de la
  // migration 0059). On le vérifie côté serveur AVANT l'insert pour
  // donner un message utile à l'utilisateur, plutôt que de laisser
  // remonter l'erreur de contrainte PostgreSQL.
  if (payload.target_session_id && payload.learner_id) {
    const { data: existing } = await supabase
      .from("inscription_requests")
      .select("id")
      .eq("target_session_id", payload.target_session_id)
      .eq("learner_id", payload.learner_id)
      .maybeSingle();
    if (existing?.id) {
      redirect(
        `/inscriptions/${existing.id}?error=${encodeURIComponent(
          "Cet apprenant a déjà une demande d'inscription pour cette session. La voici — vous pouvez la modifier ou changer son étape.",
        )}`,
      );
    }
  }

  // Trouver l'étape initiale du workflow
  const { data: initial } = await supabase
    .from("inscription_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_initial", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("inscription_requests")
    .insert({
      ...payload,
      organization_id: organizationId,
      created_by: userId,
      stage_id: initial?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // Filet de sécurité : si une condition de concurrence a quand même
    // créé un doublon (ou si l'utilisateur a contourné la vérification
    // ci-dessus), on traduit l'erreur PostgreSQL cryptique en message
    // humain.
    const friendly =
      error.code === "23505" &&
      error.message.includes("uniq_inscription_request_session_learner")
        ? "Cet apprenant est déjà inscrit (ou a déjà une demande) pour cette session. Retrouvez-le dans la liste des inscriptions."
        : error.message;
    redirect(`/inscriptions/new?error=${encodeURIComponent(friendly)}`);
  }

  // Propage le representant legal vers companies si saisi dans le
  // formulaire (Gilles 2026-05-28).
  await propagateLegalRepToCompany(supabase, resolvedCompanyId, formData);

  await logEvent(data.id, "created", { source: payload.source });

  // Sync 2026-05-13 : si la demande cible une session ET qu'un apprenant
  // est identifié, on crée immédiatement le session_enrollment miroir
  // (statut "preinscrit" par défaut au stage initial). Voir
  // memory/project_inscription_enrollment_sync.md.
  if (payload.target_session_id && payload.learner_id) {
    const { data: initialStage } = await supabase
      .from("inscription_stages")
      .select("key")
      .eq("id", initial?.id ?? "")
      .maybeSingle();
    await createMirroredEnrollmentForRequest(supabase, {
      id: data.id as string,
      target_session_id: payload.target_session_id,
      learner_id: payload.learner_id,
      stage_key: (initialStage?.key as string | null) ?? null,
    });
  }

  // Si besoin spécifique → notif handicap
  if (payload.has_special_needs) {
    await logEvent(data.id, "handicap_referent_notified", {
      details: payload.special_needs_details,
    });
  }

  // Synchronisation des modules dépendants : on invalide les caches
  // pour que les nouveaux apprenants/entreprises créés à la volée
  // apparaissent immédiatement dans leurs listes respectives.
  revalidatePath("/inscriptions");
  revalidatePath("/apprenants");
  revalidatePath("/entreprises");
  revalidatePath("/sessions");
  revalidatePath("/dashboard");

  // Contexte de retour : si l'utilisateur a démarré depuis l'onglet
  // Participants d'une session, on le ramène sur cet onglet plutôt que
  // sur la fiche d'inscription. Sinon redirection sur la fiche.
  // Note : depuis le refactor 2026-05-13, la création passe quasi
  // exclusivement par le mécanisme draft + updateInscription. Cette
  // branche reste pour les rares appels directs à createInscription.
  const returnTo = parseText(formData.get("return_to"));
  if (returnTo === "participants" && payload.target_session_id) {
    revalidatePath(`/sessions/${payload.target_session_id}/participants`);
    redirect(
      `/sessions/${payload.target_session_id}/participants?enrolled=1`,
    );
  }
  redirect(`/inscriptions/${data.id}?created=1`);
}

/**
 * Lit le bloc « Apprenants supplémentaires » du FormData (Gilles 2026-05-21)
 * et crée une inscription_request distincte pour chacun.
 *
 * Convention FormData (cf. _additional-learners.tsx) :
 *   - additional_learners_count : N
 *   - additional_learner_<i>_(learner_id|civility|first_name|last_name|
 *                            email|phone|mobile|job_title)
 *
 * Pour chaque ligne :
 *   1) Si learner_id fourni → utilise l'apprenant existant.
 *   2) Sinon : recherche par email puis création si nécessaire.
 *   3) Skip si déjà inscrit à la même session (anti-doublon).
 *   4) Crée une inscription_request avec les mêmes target/financement/source.
 *   5) Crée l'enrollment miroir si target_session_id.
 *
 * Retourne le nombre d'inscriptions créées (peut être < N en cas de skip).
 */
async function processAdditionalLearners(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  parent: {
    organizationId: string;
    userId: string;
    targetSessionId: string | null;
    targetParcoursId: string | null;
    targetFormationId: string | null;
    companyId: string | null;
    financingMode: FinancingMode | null;
    financingDetails: string | null;
    quoteAmountHt: number | null;
    /** OPCO choisi pour l'inscription principale — propagé aux miroirs. */
    opcoId: string | null;
    source: InscriptionSource;
    sourceDetails: string | null;
    inscriptionChannel: "direct" | "prescripteur" | "of";
    inscriptionChannelCompanyId: string | null;
    stageId: string | null;
    hasSpecialNeeds: boolean;
    specialNeedsDetails: string | null;
  },
): Promise<number> {
  const countRaw = parseText(formData.get("additional_learners_count"));
  const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
  if (!Number.isFinite(count) || count <= 0) return 0;

  // Récupère la clé du stage initial (pour le miroir enrollment).
  let stageKey: string | null = null;
  if (parent.stageId) {
    const { data: stage } = await supabase
      .from("inscription_stages")
      .select("key")
      .eq("id", parent.stageId)
      .maybeSingle();
    stageKey = (stage?.key as string | null) ?? null;
  }

  let created = 0;
  for (let i = 0; i < count; i++) {
    const learnerId = parseText(
      formData.get(`additional_learner_${i}_learner_id`),
    );
    const civilityRaw = parseText(
      formData.get(`additional_learner_${i}_civility`),
    );
    const civility =
      civilityRaw === "M." ||
      civilityRaw === "Mme" ||
      civilityRaw === "Autre"
        ? civilityRaw
        : null;
    const firstName = parseText(
      formData.get(`additional_learner_${i}_first_name`),
    );
    const lastName = parseText(
      formData.get(`additional_learner_${i}_last_name`),
    );
    const email = parseText(formData.get(`additional_learner_${i}_email`));
    const phone = parseText(formData.get(`additional_learner_${i}_phone`));
    const mobile = parseText(formData.get(`additional_learner_${i}_mobile`));
    const jobTitle = parseText(
      formData.get(`additional_learner_${i}_job_title`),
    );

    // Ligne vide : on saute (ni apprenant existant, ni nom complet).
    if (!learnerId && (!firstName || !lastName)) continue;

    // Résolution du learner_id : existant, par email, ou création.
    // FIX 2026-05-22 : on log les erreurs et on tente un fallback si la
    // création échoue (le bug initial perdait silencieusement le learner_id
    // → inscriptions orphelines invisibles dans Conventions/Convocations).
    let resolvedLearnerId: string | null = learnerId;
    if (!resolvedLearnerId && email) {
      const { data: byEmail } = await supabase
        .from("learners")
        .select("id")
        .eq("organization_id", parent.organizationId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      resolvedLearnerId = (byEmail?.id as string | null) ?? null;
    }
    // FIX Gilles 2026-06-02 : si pas d email saisi, on cherche par
    // (nom + prenom + entreprise) avant de creer. Sinon un double-clic
    // creait 2 learners distincts (cas PRO CLIM ENERGIES : Alexis BIBEY
    // et Emerick MARTIN dupliques) car la recherche par email ne match
    // pas avec email NULL.
    if (!resolvedLearnerId && firstName && lastName) {
      const queryNoEmail = supabase
        .from("learners")
        .select("id")
        .eq("organization_id", parent.organizationId)
        .ilike("first_name", firstName)
        .ilike("last_name", lastName);
      // On limite a l entreprise si elle est connue (evite de fusionner
      // 2 "Jean DUPONT" de societes differentes).
      const { data: byName } = parent.companyId
        ? await queryNoEmail.eq("company_id", parent.companyId).limit(1).maybeSingle()
        : await queryNoEmail.is("email", null).limit(1).maybeSingle();
      resolvedLearnerId = (byName?.id as string | null) ?? null;
    }
    if (!resolvedLearnerId) {
      const { data: newLearner, error: createErr } = await supabase
        .from("learners")
        .insert({
          organization_id: parent.organizationId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          mobile,
          job_title: jobTitle,
          civility,
          company_id: parent.companyId,
          is_active: true,
        })
        .select("id")
        .single();
      if (createErr) {
        console.error(
          "[processAdditionalLearners] échec création learner",
          {
            idx: i,
            email,
            firstName,
            lastName,
            error: createErr.message,
          },
        );
        // Fallback : essaie de re-trouver par email (cas race condition
        // avec contrainte unique sur email, par exemple).
        if (email) {
          const { data: retry } = await supabase
            .from("learners")
            .select("id")
            .eq("organization_id", parent.organizationId)
            .ilike("email", email)
            .limit(1)
            .maybeSingle();
          resolvedLearnerId = (retry?.id as string | null) ?? null;
        }
      } else {
        resolvedLearnerId = (newLearner?.id as string | null) ?? null;
      }
    }
    if (!resolvedLearnerId) {
      console.warn(
        "[processAdditionalLearners] skip ligne sans learner_id résolu",
        { idx: i, firstName, lastName, email },
      );
      continue;
    }

    // Anti-doublon : déjà inscrit à cette session ?
    if (parent.targetSessionId) {
      const { data: existing } = await supabase
        .from("inscription_requests")
        .select("id")
        .eq("organization_id", parent.organizationId)
        .eq("learner_id", resolvedLearnerId)
        .eq("target_session_id", parent.targetSessionId)
        .limit(1)
        .maybeSingle();
      if (existing) continue;
    }

    // Création de l'inscription_request miroir (même contexte que le parent)
    const { data: newRequest } = await supabase
      .from("inscription_requests")
      .insert({
        organization_id: parent.organizationId,
        source: parent.source,
        source_details: parent.sourceDetails,
        learner_id: resolvedLearnerId,
        prospect_first_name: firstName,
        prospect_last_name: lastName,
        prospect_email: email,
        prospect_phone: phone,
        prospect_mobile: mobile,
        company_id: parent.companyId,
        target_session_id: parent.targetSessionId,
        target_parcours_id: parent.targetParcoursId,
        target_formation_id: parent.targetFormationId,
        financing_mode: parent.financingMode,
        financing_details: parent.financingDetails,
        quote_amount_ht: parent.quoteAmountHt,
        opco_id: parent.opcoId,
        has_special_needs: parent.hasSpecialNeeds,
        special_needs_details: parent.specialNeedsDetails,
        stage_id: parent.stageId,
        inscription_channel: parent.inscriptionChannel,
        inscription_channel_company_id: parent.inscriptionChannelCompanyId,
        created_by: parent.userId,
        contact_preference: "email",
      })
      .select("id")
      .single();

    if (newRequest?.id) {
      created++;
      // Miroir enrollment si on a une session cible.
      if (parent.targetSessionId) {
        await createMirroredEnrollmentForRequest(supabase, {
          id: newRequest.id as string,
          target_session_id: parent.targetSessionId,
          learner_id: resolvedLearnerId,
          stage_key: stageKey,
        });
      }
    }
  }
  return created;
}

export async function updateInscription(id: string, formData: FormData) {
  const { organizationId, userId } = await getOrgId();
  const payload = buildPayload(formData);
  const supabase = await createClient();

  // Validation Gilles 2026-05-14 : on refuse l'enregistrement si
  // l'inscription est vide (ni apprenant lié, ni prénom+nom saisis).
  // Sans ce garde-fou, un brouillon créé par /inscriptions/new puis
  // vidé puis sauvegardé crée une ligne fantôme « Demandeur — » dans
  // la liste des inscriptions.
  const hasLearner = Boolean(payload.learner_id);
  const hasProspectName =
    Boolean(payload.prospect_first_name?.trim()) &&
    Boolean(payload.prospect_last_name?.trim());
  if (!hasLearner && !hasProspectName) {
    redirect(
      `/inscriptions/${id}?error=${encodeURIComponent(
        "Renseignez au moins un apprenant existant OU un prénom + nom de prospect avant d'enregistrer. Pour abandonner cette fiche, utilisez le bouton Annuler.",
      )}`,
    );
  }

  // Si l'utilisateur a sélectionné/saisi une nouvelle entreprise via le
  // picker (texte libre + données SIRENE éventuelles), on la
  // crée/rattache et on enregistre l'ID résolu sur la demande. Sans ça,
  // le freetext seul resterait orphelin → l'utilisateur a l'impression
  // que rien n'a été enregistré.
  const resolvedCompanyId = await resolveCompanyId(
    formData,
    organizationId,
    userId,
    payload.company_id,
    payload.company_name_freetext,
  );
  if (resolvedCompanyId) {
    payload.company_id = resolvedCompanyId;
    // Propage le representant legal vers companies si saisi
    // (Gilles 2026-05-28).
    await propagateLegalRepToCompany(supabase, resolvedCompanyId, formData);
    // Une fois rattachée à une vraie fiche, on nettoie le freetext pour
    // éviter d'avoir les deux sources renseignées.
    payload.company_name_freetext = null;
  }

  // Synchronisation Demande → Fiche apprenant : si un champ a été
  // renseigné sur la demande mais est vide sur la fiche apprenant, on
  // remonte l'info pour tenir le module Apprenants à jour.
  const prospectJobTitle = parseText(formData.get("prospect_job_title"));
  const prospectCivilityRaw = parseText(formData.get("prospect_civility"));
  const prospectCivility =
    prospectCivilityRaw === "M." ||
    prospectCivilityRaw === "Mme" ||
    prospectCivilityRaw === "Autre"
      ? prospectCivilityRaw
      : null;
  if (payload.learner_id) {
    const { data: learner } = await supabase
      .from("learners")
      .select(
        "first_name, last_name, email, phone, mobile, birth_date, job_title, civility, company_id",
      )
      .eq("id", payload.learner_id)
      .maybeSingle();
    if (learner) {
      // Sync demande → apprenant : ecrase la fiche si la valeur saisie
      // differe de l'existante. L'utilisateur peut DESACTIVER cette
      // sync via le radio "NON, uniquement sur cette inscription"
      // (Bug Gilles 2026-05-26 + ajout first_name/last_name Gilles 2026-06-01).
      const userChoseToUpdateLearner =
        parseText(formData.get("update_learner_contact")) !== "no";
      const learnerUpdates: Record<string, unknown> = {};
      if (userChoseToUpdateLearner) {
        // Fix Gilles 2026-06-01 : ajout sync first_name et last_name
        // (bug CELLAR -> CELLARD : modif nom sur l inscription ne
        // remontait pas a la fiche apprenant).
        const learnerFirst = (learner as unknown as { first_name?: string | null })
          .first_name;
        const learnerLast = (learner as unknown as { last_name?: string | null })
          .last_name;
        if (
          payload.prospect_first_name &&
          payload.prospect_first_name !== learnerFirst
        )
          learnerUpdates.first_name = payload.prospect_first_name;
        if (
          payload.prospect_last_name &&
          payload.prospect_last_name !== learnerLast
        )
          learnerUpdates.last_name = payload.prospect_last_name;
        if (payload.prospect_email && payload.prospect_email !== learner.email)
          learnerUpdates.email = payload.prospect_email;
        if (payload.prospect_phone && payload.prospect_phone !== learner.phone)
          learnerUpdates.phone = payload.prospect_phone;
        const learnerMobile = (learner as unknown as { mobile?: string | null })
          .mobile;
        if (payload.prospect_mobile && payload.prospect_mobile !== learnerMobile)
          learnerUpdates.mobile = payload.prospect_mobile;
        if (
          payload.prospect_birth_date &&
          payload.prospect_birth_date !== learner.birth_date
        )
          learnerUpdates.birth_date = payload.prospect_birth_date;
        if (prospectJobTitle && prospectJobTitle !== learner.job_title)
          learnerUpdates.job_title = prospectJobTitle;
        if (prospectCivility && prospectCivility !== learner.civility)
          learnerUpdates.civility = prospectCivility;
      }
      if (payload.company_id && payload.company_id !== learner.company_id)
        learnerUpdates.company_id = payload.company_id;
      if (Object.keys(learnerUpdates).length > 0) {
        await supabase
          .from("learners")
          .update(learnerUpdates)
          .eq("id", payload.learner_id);
      }
    }
  }

  const { error } = await supabase
    .from("inscription_requests")
    .update(payload)
    .eq("id", id);
  if (error) {
    redirect(`/inscriptions/${id}?error=${encodeURIComponent(error.message)}`);
  }

  // Apprenants supplémentaires : on crée une inscription miroir pour
  // chacun (Gilles 2026-05-21 — multi-inscription en une saisie).
  // Récupère le stage_id de l'inscription parent pour propagation.
  const { data: parentRow } = await supabase
    .from("inscription_requests")
    .select("stage_id")
    .eq("id", id)
    .maybeSingle();
  const additionalCreated = await processAdditionalLearners(
    supabase,
    formData,
    {
      organizationId,
      userId,
      targetSessionId: payload.target_session_id,
      targetParcoursId: payload.target_parcours_id,
      targetFormationId: payload.target_formation_id,
      companyId: payload.company_id,
      financingMode: payload.financing_mode,
      financingDetails: payload.financing_details,
      quoteAmountHt: payload.quote_amount_ht,
      opcoId:
        (payload as { opco_id?: string | null }).opco_id ?? null,
      source: payload.source,
      sourceDetails: payload.source_details,
      inscriptionChannel: payload.inscription_channel,
      inscriptionChannelCompanyId: payload.inscription_channel_company_id,
      stageId: (parentRow?.stage_id as string | null) ?? null,
      hasSpecialNeeds: payload.has_special_needs,
      specialNeedsDetails: payload.special_needs_details,
    },
  );

  revalidatePath("/inscriptions");
  revalidatePath(`/inscriptions/${id}`);
  revalidatePath("/apprenants");
  revalidatePath("/entreprises");
  revalidatePath("/sessions");
  revalidatePath("/dashboard");

  // Contexte de retour : si l'inscription vient d'être créée depuis
  // l'onglet Participants d'une session (cas typique du flux
  // draft→update où le return_to a été préservé dans le formulaire),
  // on renvoie l'utilisateur sur cet onglet après l'enregistrement.
  const returnTo = parseText(formData.get("return_to"));
  const sessionId = parseText(formData.get("session_id"));
  if (returnTo === "participants" && sessionId) {
    revalidatePath(`/sessions/${sessionId}/participants`);
    const suffix =
      additionalCreated > 0 ? `&additional=${additionalCreated}` : "";
    redirect(
      `/sessions/${sessionId}/participants?enrolled=1${suffix}`,
    );
  }
  const suffix =
    additionalCreated > 0 ? `&additional=${additionalCreated}` : "";
  redirect(`/inscriptions/${id}?updated=1${suffix}`);
}

export async function changeStage(
  id: string,
  newStageId: string,
  comment?: string,
) {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("inscription_requests")
    .select("stage_id")
    .eq("id", id)
    .maybeSingle();

  const fromStageId = (current?.stage_id as string | null) ?? null;

  // Mise à jour des dates clés selon la cible
  const { data: stage } = await supabase
    .from("inscription_stages")
    .select("key")
    .eq("id", newStageId)
    .maybeSingle();

  const updates: Record<string, unknown> = { stage_id: newStageId };
  const now = new Date().toISOString();
  switch (stage?.key) {
    case "to_qualify":
      updates.qualified_at = now;
      break;
    case "pre_info_sent":
      updates.pre_info_sent = true;
      updates.pre_info_sent_at = now;
      break;
    case "quote_sent":
      updates.quote_sent_at = now;
      break;
    case "contract_signed":
      updates.contract_signed_at = now;
      break;
    case "convoked":
      updates.convocation_sent_at = now;
      break;
    case "confirmed":
    case "cancelled":
    case "refused":
    case "lost":
      updates.closed_at = now;
      break;
  }

  await supabase.from("inscription_requests").update(updates).eq("id", id);

  // Sync 2026-05-13 : propage le changement de stage vers le statut
  // du session_enrollment miroir (si présent).
  if (stage?.key) {
    await syncStageChangeToEnrollment(supabase, id, stage.key as string);
  }

  await logEvent(
    id,
    "stage_changed",
    { comment: comment ?? null },
    fromStageId,
    newStageId,
  );

  revalidatePath(`/inscriptions/${id}`);
  redirect(`/inscriptions/${id}?stageChanged=1`);
}

/**
 * Variante de `changeStage` utilisée par le tableau d'inscriptions :
 * pas de redirection vers la fiche apprenant, juste un revalidate de la
 * liste pour rafraîchir l'affichage. L'utilisateur reste dans son flux
 * de travail (parcourir la liste, qualifier en série…).
 */
/**
 * Met à jour la liste des contacts entreprise rattachés comme
 * "référents pédagogiques" d'une inscription. Ces référents reçoivent
 * en CC tous les emails liés à l'apprenant (confirmation, convocation,
 * convention, attestation).
 *
 * Règle métier R6 (Gilles 2026-05-13) :
 *   - Un référent doit être un contact de la société liée à l'apprenant.
 *     L'UI filtre les options en conséquence, mais ici on fait confiance
 *     aux contact_ids fournis (validé par la sélection client).
 *   - Pour un particulier (pas de société), aucun référent possible —
 *     l'UI masque le bloc.
 *
 * Implémentation : on remplace l'ensemble (delete + insert) plutôt que
 * de faire un diff, c'est plus simple et la table est petite.
 */
export async function setInscriptionReferents(
  inscriptionId: string,
  contactIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();

    // 1. Purge des liaisons existantes
    const { error: delErr } = await supabase
      .from("inscription_referent_contacts")
      .delete()
      .eq("inscription_id", inscriptionId);
    if (delErr) return { ok: false, error: delErr.message };

    // 2. Insert des nouvelles (si la liste n'est pas vide)
    const clean = contactIds.filter((id) => Boolean(id));
    if (clean.length > 0) {
      const { error: insErr } = await supabase
        .from("inscription_referent_contacts")
        .insert(
          clean.map((cid) => ({
            inscription_id: inscriptionId,
            contact_id: cid,
          })),
        );
      if (insErr) return { ok: false, error: insErr.message };
    }

    revalidatePath(`/inscriptions/${inscriptionId}`);
    revalidatePath("/inscriptions");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function changeStageFromForm(id: string, formData: FormData) {
  const newStageId = parseText(formData.get("stage_id"));
  const comment = parseText(formData.get("comment")) ?? undefined;
  if (!newStageId) return;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("inscription_requests")
    .select("stage_id")
    .eq("id", id)
    .maybeSingle();
  const fromStageId = (current?.stage_id as string | null) ?? null;

  const { data: stage } = await supabase
    .from("inscription_stages")
    .select("key")
    .eq("id", newStageId)
    .maybeSingle();

  const updates: Record<string, unknown> = { stage_id: newStageId };
  const now = new Date().toISOString();
  switch (stage?.key) {
    case "to_qualify":
      updates.qualified_at = now;
      break;
    case "pre_info_sent":
      updates.pre_info_sent = true;
      updates.pre_info_sent_at = now;
      break;
    case "quote_sent":
      updates.quote_sent_at = now;
      break;
    case "contract_signed":
      updates.contract_signed_at = now;
      break;
    case "convoked":
      updates.convocation_sent_at = now;
      break;
    case "confirmed":
    case "cancelled":
    case "refused":
    case "lost":
      updates.closed_at = now;
      break;
  }

  await supabase.from("inscription_requests").update(updates).eq("id", id);

  // Sync 2026-05-13 : propage le changement de stage vers le statut
  // du session_enrollment miroir (si présent).
  if (stage?.key) {
    await syncStageChangeToEnrollment(supabase, id, stage.key as string);
  }

  await logEvent(
    id,
    "stage_changed",
    { comment: comment ?? null },
    fromStageId,
    newStageId,
  );

  // Pas de redirect — on rafraîchit juste la page courante.
  revalidatePath("/inscriptions");
  revalidatePath(`/inscriptions/${id}`);
}

export async function addNote(id: string, formData: FormData) {
  const note = parseText(formData.get("note"));
  if (!note) return;
  await logEvent(id, "note_added", { note });
  revalidatePath(`/inscriptions/${id}`);
  redirect(`/inscriptions/${id}?noteAdded=1`);
}

export async function deleteInscription(id: string) {
  const supabase = await createClient();
  // Audit : tracer la suppression AVANT le delete (cascade detruit le
  // snapshot sinon). Gilles 2026-05-28.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await logInscriptionDeletion(supabase, {
    requestId: id,
    deletedByType: "admin",
    actorProfileId: user?.id ?? null,
  });
  // Sync 2026-05-13 : cascade vers les session_enrollments miroirs AVANT
  // de supprimer la request. La FK étant `on delete set null`, sans cette
  // étape, l'enrollment perdrait simplement son lien et resterait orphelin.
  await cascadeDeleteEnrollmentsFromRequest(supabase, id);
  await supabase.from("inscription_requests").delete().eq("id", id);
  revalidatePath("/inscriptions");
  revalidatePath("/sessions");
  redirect("/inscriptions");
}

/**
 * Convertit une demande "confirmée" en inscription réelle dans la session.
 * Crée le learner si c'est un prospect, puis l'enrolle.
 */
export async function convertToEnrollment(id: string) {
  const { organizationId } = await getOrgId();
  const supabase = await createClient();

  const { data: req } = await supabase
    .from("inscription_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!req) {
    redirect(`/inscriptions/${id}?error=Demande+introuvable`);
  }

  if (!req.target_session_id) {
    redirect(
      `/inscriptions/${id}?error=${encodeURIComponent("Aucune session cible")}`,
    );
  }

  let learnerId = req.learner_id as string | null;

  // Créer le learner si nécessaire
  if (!learnerId) {
    if (!req.prospect_first_name || !req.prospect_last_name) {
      redirect(
        `/inscriptions/${id}?error=${encodeURIComponent("Nom et prénom du prospect requis")}`,
      );
    }
    const { data: newLearner, error: learnerError } = await supabase
      .from("learners")
      .insert({
        organization_id: organizationId,
        first_name: req.prospect_first_name,
        last_name: req.prospect_last_name,
        email: req.prospect_email,
        phone: req.prospect_phone,
        birth_date: req.prospect_birth_date,
        company_id: req.company_id,
        is_active: true,
      })
      .select("id")
      .single();
    if (learnerError || !newLearner) {
      redirect(
        `/inscriptions/${id}?error=${encodeURIComponent(learnerError?.message ?? "Erreur création apprenant")}`,
      );
    }
    learnerId = newLearner.id;
    await supabase
      .from("inscription_requests")
      .update({ learner_id: learnerId })
      .eq("id", id);
  }

  // Sync 2026-05-13 : depuis l'ajout de la sync bidirectionnelle, le
  // session_enrollment miroir est déjà créé à la création de la demande.
  // On vérifie donc s'il existe déjà avant de l'insérer pour éviter le
  // doublon (la contrainte UNIQUE(session_id, learner_id) sécurise de
  // toute façon la table). On force surtout le passage en "confirmed".
  const { data: existingEnrollment } = await supabase
    .from("session_enrollments")
    .select("id")
    .eq("session_id", req.target_session_id)
    .eq("learner_id", learnerId)
    .maybeSingle();

  if (existingEnrollment?.id) {
    await supabase
      .from("session_enrollments")
      .update({ status: "confirmed", inscription_request_id: id })
      .eq("id", existingEnrollment.id);
  } else {
    await supabase.from("session_enrollments").insert({
      session_id: req.target_session_id,
      learner_id: learnerId,
      status: "confirmed",
      inscription_request_id: id,
    });
  }

  await logEvent(id, "converted_to_enrollment", {
    learner_id: learnerId,
    session_id: req.target_session_id,
  });

  revalidatePath("/inscriptions");
  revalidatePath(`/inscriptions/${id}`);
  revalidatePath("/sessions");
  revalidatePath(`/sessions/${req.target_session_id}`);
  revalidatePath("/apprenants");
  revalidatePath("/entreprises");
  revalidatePath("/dashboard");
  redirect(`/inscriptions/${id}?converted=1`);
}

// ============================================================
// Rattachement manuel d'une inscription "express" à une entreprise
// (Gilles 2026-06-08). Choix validé : on garde le nom saisi en texte
// libre et l'utilisateur rattache lui-même à une fiche existante OU en
// crée une. Évite les doublons de franchises (AVIPUR, Avipur…).
// ============================================================

export type AttachCompanyCandidate = {
  id: string;
  name: string;
  postal_code: string | null;
  city: string | null;
};

/** Recherche des entreprises de l'organisation par nom (rattachement). */
export async function searchCompaniesForAttach(
  query: string,
): Promise<AttachCompanyCandidate[]> {
  const { organizationId } = await getOrgId();
  const supabase = await createClient();
  let req = supabase
    .from("companies")
    .select("id, name, postal_code, city")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .limit(20);
  const q = query.trim();
  if (q.length > 0) {
    const safe = q.replace(/[%_,()]/g, " ").trim();
    req = req.or(`name.ilike.%${safe}%,siret.ilike.%${safe}%`);
  }
  const { data } = await req;
  return (data ?? []) as AttachCompanyCandidate[];
}

/** Rattache l'inscription (et l'apprenant) à une entreprise existante. */
export async function attachInscriptionToCompany(
  inscriptionId: string,
  companyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { organizationId } = await getOrgId();
  const supabase = await createClient();
  // Vérifie que l'entreprise appartient bien à l'organisation.
  const { data: comp } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!comp) return { ok: false, error: "Entreprise introuvable." };

  const { data: req } = await supabase
    .from("inscription_requests")
    .select("id, learner_id, target_session_id")
    .eq("id", inscriptionId)
    .maybeSingle<{
      id: string;
      learner_id: string | null;
      target_session_id: string | null;
    }>();
  if (!req) return { ok: false, error: "Inscription introuvable." };

  await supabase
    .from("inscription_requests")
    .update({ company_id: companyId })
    .eq("id", inscriptionId);
  if (req.learner_id) {
    await supabase
      .from("learners")
      .update({ company_id: companyId })
      .eq("id", req.learner_id);
  }
  revalidatePath(`/inscriptions/${inscriptionId}`);
  revalidatePath("/inscriptions");
  if (req.target_session_id)
    revalidatePath(`/sessions/${req.target_session_id}`);
  return { ok: true };
}

/** Crée une entreprise (au nom donné) puis rattache l'inscription. */
export async function createCompanyAndAttach(
  inscriptionId: string,
  name: string,
): Promise<{ ok: boolean; error?: string; companyId?: string }> {
  const { organizationId } = await getOrgId();
  const supabase = await createClient();
  const cleanName = name.trim();
  if (!cleanName) return { ok: false, error: "Nom d'entreprise vide." };

  const { data: created, error } = await supabase
    .from("companies")
    .insert({ organization_id: organizationId, name: cleanName, type: "client" })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "Création impossible." };
  }
  const res = await attachInscriptionToCompany(inscriptionId, created.id);
  return res.ok
    ? { ok: true, companyId: created.id }
    : { ok: false, error: res.error };
}
