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
  if (!currentFreetext) return null;

  const supabase = await createClient();

  // 1) Réutilisation d'une entreprise homonyme déjà en base
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", currentFreetext)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  // 2) Création avec les éventuelles données SIRENE / saisies manuellement
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

  const { data: created } = await supabase
    .from("companies")
    .insert({
      organization_id: organizationId,
      name: currentFreetext,
      type: "prospect",
      created_by: userId,
      siret: parseText(formData.get("new_company_siret")),
      siren,
      legal_form: parseText(formData.get("new_company_legal_form")),
      industry: parseText(formData.get("new_company_industry")),
      naf_code: parseText(formData.get("new_company_naf_code")),
      legal_status,
      pappers_url,
      address: parseText(formData.get("new_company_address")),
      postal_code: parseText(formData.get("new_company_postal_code")),
      city: parseText(formData.get("new_company_city")),
    })
    .select("id")
    .single();
  return (created?.id as string | null) ?? null;
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
      return ((selected || override) as FinancingMode | null) ?? "autofinancement";
    })(),
    financing_details: parseText(formData.get("financing_details")),
    quote_amount_ht: parseFloat0(formData.get("quote_amount_ht")),

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
 * Si l'utilisateur annule, la fiche est supprimée via `deleteInscription`.
 * Si l'utilisateur quitte sans sauvegarder, le brouillon reste en BDD
 * — à nettoyer manuellement ou via un cron (sujet pour plus tard).
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
      financing_mode: "autofinancement",
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
      // a) Sync demande → apprenant. Règle (Gilles 2026-05-21) : si
      //    l'utilisateur saisit une valeur non-vide ET différente de
      //    ce qui est sur la fiche apprenant, on ÉCRASE la fiche. Sinon
      //    le RH qui corrige une civilité ou un mobile depuis la fiche
      //    inscription voyait sa modif perdue (le code conservateur
      //    précédent ne mettait à jour QUE si le champ était vide).
      //    On ne touche jamais quand la valeur saisie est vide / null.
      const learnerUpdates: Record<string, unknown> = {};
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
      const learnerMobile = (learner as unknown as { mobile?: string | null })
        .mobile;
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

export async function updateInscription(id: string, formData: FormData) {
  const { organizationId, userId } = await getOrgId();
  const payload = buildPayload(formData);

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
    // Une fois rattachée à une vraie fiche, on nettoie le freetext pour
    // éviter d'avoir les deux sources renseignées.
    payload.company_name_freetext = null;
  }

  const supabase = await createClient();

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
        "email, phone, mobile, birth_date, job_title, civility, company_id",
      )
      .eq("id", payload.learner_id)
      .maybeSingle();
    if (learner) {
      // Sync demande → apprenant : ecrase la fiche si la valeur saisie
      // differe de l'existante (Gilles 2026-05-21).
      const learnerUpdates: Record<string, unknown> = {};
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
    redirect(`/sessions/${sessionId}/participants?enrolled=1`);
  }
  redirect(`/inscriptions/${id}?updated=1`);
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
