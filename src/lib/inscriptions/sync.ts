/**
 * Helpers de synchronisation bidirectionnelle entre `inscription_requests`
 * (workflow CRM côté module Inscriptions) et `session_enrollments` (table
 * opérationnelle côté onglet Participants d'une session).
 *
 * Architecture décidée le 2026-05-13 (Option C). Voir memory/
 * project_inscription_enrollment_sync.md pour la philosophie complète.
 *
 * Règle métier : tant qu'une demande d'inscription cible une session ET
 * qu'un apprenant est identifié, les deux tables doivent rester en miroir
 * (création, mise à jour, suppression dans les deux sens).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnrollmentStatus } from "@/lib/sessions/types";
import { normalizeCompanyName } from "@/lib/companies/dedup";

/**
 * Mapping stage CRM → statut d'inscription session.
 * Les valeurs source sont les `key` de la table `inscription_stages`.
 */
export function mapStageKeyToStatus(
  stageKey: string | null | undefined,
): EnrollmentStatus {
  switch (stageKey) {
    case "convoked":
      return "convoque";
    case "confirmed":
      return "confirmed";
    case "cancelled":
    case "refused":
    case "lost":
      return "cancelled";
    case "new":
    case "to_qualify":
    case "pre_info_sent":
    case "quote_sent":
    case "contract_signed":
    default:
      return "preinscrit";
  }
}

/**
 * Mapping statut d'inscription session → key du stage CRM cible.
 * Plusieurs statuts peuvent retomber sur un même stage (in_progress et
 * completed se traduisent en "confirmed" côté CRM).
 */
export function mapStatusToStageKey(status: EnrollmentStatus): string {
  switch (status) {
    case "confirmed":
    case "in_progress":
    case "completed":
      return "confirmed";
    case "convoque":
      return "convoked";
    case "cancelled":
      return "cancelled";
    case "absent":
    case "abandoned":
      return "lost";
    case "option":
      return "quote_sent";
    case "preinscrit":
    default:
      return "to_qualify";
  }
}

/**
 * Récupère l'ID de stage pour une `key` donnée dans une organisation.
 * Renvoie null si le stage n'existe pas (organisation qui aurait
 * supprimé le stage standard du workflow par défaut).
 */
export async function findStageIdByKey(
  supabase: SupabaseClient,
  organizationId: string,
  key: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("inscription_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("key", key)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

/**
 * Crée une `inscription_request` miroir pour un enrollment qui n'en
 * a pas encore. Utilisé quand un participant est ajouté directement
 * depuis l'onglet Participants d'une session.
 *
 * Renvoie l'ID de la request créée, ou null si la création a échoué.
 */
export async function createMirroredRequestForEnrollment(
  supabase: SupabaseClient,
  enrollment: {
    id: string;
    session_id: string;
    learner_id: string;
    status: EnrollmentStatus;
    enrolled_at?: string | null;
  },
): Promise<string | null> {
  // Idempotence : une seule inscription_request peut exister pour un
  // couple (session, apprenant) — l'index unique mis en place par la
  // migration 0059 le garantit côté BDD. On vérifie d'abord pour
  // réutiliser, plutôt que de tenter un insert qui violerait la
  // contrainte.
  const { data: existing } = await supabase
    .from("inscription_requests")
    .select("id, prospect_first_name, prospect_last_name, prospect_email, prospect_phone")
    .eq("target_session_id", enrollment.session_id)
    .eq("learner_id", enrollment.learner_id)
    .maybeSingle();
  if (existing?.id) {
    // Sync 2026-05-13 : si on réutilise une request existante, on
    // rafraîchit le snapshot prospect_* avec les données apprenant
    // actuelles. Sans ça, un snapshot ancien (ex : ancien nom de test
    // "fffff FFFFF") continuerait à s'afficher alors que la fiche
    // apprenant a été corrigée. La fiche apprenant est la source de
    // vérité pour le nom/prénom/email/téléphone.
    const { data: learner } = await supabase
      .from("learners")
      .select("first_name, last_name, email, phone, mobile")
      .eq("id", enrollment.learner_id)
      .maybeSingle();
    if (learner) {
      const refresh: Record<string, string | null> = {};
      if (learner.first_name)
        refresh.prospect_first_name = learner.first_name as string;
      if (learner.last_name)
        refresh.prospect_last_name = learner.last_name as string;
      if (learner.email) refresh.prospect_email = learner.email as string;
      if (learner.phone) refresh.prospect_phone = learner.phone as string;
      if (
        (learner as unknown as { mobile?: string | null }).mobile
      ) {
        refresh.prospect_mobile = (
          learner as unknown as { mobile: string }
        ).mobile;
      }
      if (Object.keys(refresh).length > 0) {
        await supabase
          .from("inscription_requests")
          .update(refresh)
          .eq("id", existing.id as string);
      }
    }
    return existing.id as string;
  }

  // On a besoin de l'organization_id (via la session) + des infos
  // apprenant (nom, contact, entreprise) pour pré-remplir le snapshot
  // prospect_* utilisé par les listes/tableaux du module Inscriptions.
  const [{ data: session }, { data: learner }] = await Promise.all([
    supabase
      .from("sessions")
      .select("organization_id")
      .eq("id", enrollment.session_id)
      .maybeSingle(),
    supabase
      .from("learners")
      .select(
        "first_name, last_name, email, phone, mobile, birth_date, company_id",
      )
      .eq("id", enrollment.learner_id)
      .maybeSingle(),
  ]);

  const organizationId = session?.organization_id as string | undefined;
  if (!organizationId) return null;

  const stageKey = mapStatusToStageKey(enrollment.status);
  const stageId = await findStageIdByKey(supabase, organizationId, stageKey);

  const { data: created, error } = await supabase
    .from("inscription_requests")
    .insert({
      organization_id: organizationId,
      source: "autre",
      source_details: "Inscription créée depuis l'onglet Participants",
      learner_id: enrollment.learner_id,
      // Snapshot prospect_* : sans ces champs, les tableaux du module
      // Inscriptions affichent "—" à la place du nom de l'apprenant.
      prospect_first_name: (learner?.first_name as string | null) ?? null,
      prospect_last_name: (learner?.last_name as string | null) ?? null,
      prospect_email: (learner?.email as string | null) ?? null,
      prospect_phone: (learner?.phone as string | null) ?? null,
      prospect_mobile: (learner?.mobile as string | null) ?? null,
      prospect_birth_date: (learner?.birth_date as string | null) ?? null,
      company_id: (learner?.company_id as string | null) ?? null,
      target_session_id: enrollment.session_id,
      financing_mode: "autofinancement",
      stage_id: stageId,
      received_at: enrollment.enrolled_at ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) return null;
  return created.id as string;
}

/**
 * Crée un `session_enrollment` miroir pour une demande d'inscription
 * qui cible une session ET dont l'apprenant est identifié. Utilisé
 * quand une demande est créée depuis le module Inscriptions.
 *
 * Si un enrollment existe déjà pour (session, learner), on le réutilise
 * et on met juste à jour son `inscription_request_id`.
 *
 * Renvoie l'ID de l'enrollment créé/lié, ou null.
 */
export async function createMirroredEnrollmentForRequest(
  supabase: SupabaseClient,
  request: {
    id: string;
    target_session_id: string;
    learner_id: string;
    stage_key?: string | null;
    /** Canal d'inscription (Fix Gilles 2026-05-22) : permet aux flux
     *  portail partenaire (OF / prescripteur) de renseigner directement
     *  la colonne SOURCE de l'onglet Participants. Si omis, valeur DB
     *  par défaut ("direct" = CAP NUMERIQUE). */
    inscription_channel?: "direct" | "prescripteur" | "of" | null;
    inscription_channel_company_id?: string | null;
  },
): Promise<string | null> {
  const status = mapStageKeyToStatus(request.stage_key);

  // Garde-fou : sans learner_id valide, on ne peut pas créer d'enrollment.
  if (!request.learner_id || !request.target_session_id) {
    console.warn(
      "[createMirroredEnrollmentForRequest] manque learner_id ou session_id",
      { request_id: request.id, learner_id: request.learner_id, session_id: request.target_session_id },
    );
    return null;
  }

  // 1) Enrollment existant pour ce couple (session, learner) ?
  const { data: existing } = await supabase
    .from("session_enrollments")
    .select("id, inscription_request_id, status, inscription_channel")
    .eq("session_id", request.target_session_id)
    .eq("learner_id", request.learner_id)
    .maybeSingle();

  if (existing) {
    // Cas A : enrollment libre → on le rattache à la request actuelle.
    // Cas B (BUG corrigé Gilles 2026-05-21) : enrollment deja lié à une
    // AUTRE request → on RE-LIE à la request actuelle pour eviter de
    // laisser des requests confirmees orphelines (visibles a tort
    // dans le bloc « Demandes en cours » de la page Participants).
    // Note : on conserve le status existant si plus avance que celui
    // de la nouvelle request (ex : enrollment deja `convoque` et nouvelle
    // request `confirmed`).
    const currentStatusRank: Record<string, number> = {
      preinscrit: 0,
      option: 1,
      confirmed: 2,
      convoque: 3,
      in_progress: 4,
      completed: 5,
      cancelled: -1,
      absent: -1,
      abandoned: -1,
    };
    const existingRank = currentStatusRank[existing.status as string] ?? 0;
    const newRank = currentStatusRank[status] ?? 0;
    const finalStatus = existingRank > newRank ? existing.status : status;
    // Fix Gilles 2026-05-22 : on écrase le canal "direct" si on a une
    // info plus précise (portail OF/prescripteur). Si l'admin a déjà
    // choisi un autre canal manuellement, on respecte son choix.
    const shouldOverrideChannel =
      request.inscription_channel &&
      request.inscription_channel !== "direct" &&
      (existing as { inscription_channel?: string | null }).inscription_channel ===
        "direct";
    const updatePatch: Record<string, unknown> = {
      inscription_request_id: request.id,
      status: finalStatus,
    };
    if (shouldOverrideChannel) {
      updatePatch.inscription_channel = request.inscription_channel;
      updatePatch.inscription_channel_company_id =
        request.inscription_channel_company_id ?? null;
    }
    const needsUpdate =
      existing.inscription_request_id !== request.id ||
      existing.status !== finalStatus ||
      shouldOverrideChannel;
    if (needsUpdate) {
      const { error: updErr } = await supabase
        .from("session_enrollments")
        .update(updatePatch)
        .eq("id", existing.id);
      if (updErr) {
        console.error(
          "[createMirroredEnrollmentForRequest] update rattachement echec",
          { enrollment_id: existing.id, request_id: request.id, error: updErr.message },
        );
      }
    }
    return existing.id as string;
  }

  // 2) Sinon, on en crée un.
  const insertPayload: Record<string, unknown> = {
    session_id: request.target_session_id,
    learner_id: request.learner_id,
    status,
    inscription_request_id: request.id,
  };
  if (request.inscription_channel) {
    insertPayload.inscription_channel = request.inscription_channel;
    insertPayload.inscription_channel_company_id =
      request.inscription_channel_company_id ?? null;
  }
  const { data: created, error } = await supabase
    .from("session_enrollments")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !created) {
    console.error(
      "[createMirroredEnrollmentForRequest] insert enrollment echec",
      { request_id: request.id, session_id: request.target_session_id, learner_id: request.learner_id, error: error?.message },
    );
    return null;
  }
  return created.id as string;
}

/**
 * Self-healing : pour une session donnée, détecte les inscription_requests
 * qui ciblent cette session ET qui ont un learner_id, mais qui n'ont pas
 * d'enrollment correspondant. Recrée ou re-rattache automatiquement les
 * enrollments manquants pour réparer les désynchronisations.
 *
 * v2 (Gilles 2026-05-22) : on ne filtre plus uniquement sur le stage
 * "confirmed" — on traite TOUTES les inscriptions avec learner_id pour
 * couvrir aussi les cas "convoké", "devis envoyé", etc. Le bug observé :
 * 3 inscriptions confirmées en multi-apprenants → 1 seul enrollment visible
 * dans Conventions / Convocations, car le healing ne couvrait pas tous
 * les cas. Le statut de l'enrollment est dérivé du stage de la request.
 *
 * Appelé au chargement de la page Participants ET des onglets dépendants
 * (Conventions, Convocations, Émargement, Documents, etc.) — silencieux,
 * pas d'erreur côté UI. Renvoie le nombre d'enrollments réparés.
 */
/**
 * Self-healing companies : pour une session donnée, répare les
 * inscription_requests qui ont un `company_name_freetext` mais pas de
 * `company_id`, et synchronise le `company_id` sur le learner lié.
 *
 * Sans ça, le tableau Conventions / Convocations groupe par
 * `learner.company_id` et ignore les apprenants sans entreprise
 * rattachée — alors que le module Inscriptions les affiche
 * correctement via le fallback `company_name_freetext`.
 *
 * Stratégie :
 *  1) Pour chaque inscription cassée (company_id NULL + freetext) :
 *     - chercher une entreprise homonyme dans l'organisation
 *     - sinon, en créer une (type "client", nom = freetext)
 *     - lier inscription.company_id ET learner.company_id (si null)
 *  2) Pour chaque enrollment dont le learner n'a pas de company_id
 *     mais dont la request liée en a un : recopier le company_id sur
 *     le learner.
 *
 * Silencieux : log juste les erreurs côté serveur, ne casse pas l'UI.
 * Renvoie le nombre d'enregistrements modifiés.
 *
 * Gilles 2026-05-26 : sur une session de 9 inscriptions, seules 2
 * apparaissaient dans Conventions car les autres avaient juste un
 * nom d'entreprise en freetext (sans company_id).
 */
export async function healCompanyLinksForSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ companiesCreated: number; linkedLearners: number }> {
  let companiesCreated = 0;
  let linkedLearners = 0;

  // Cache des entreprises par organisation (id + nom normalisé) pour un
  // dédoublonnage robuste : « SMMM », « S.M.M.M », « smmm » -> même fiche.
  // On y ajoute les fiches créées dans CE passage pour éviter qu'une même
  // entreprise saisie 2x crée 2 doublons (race intra-run). Gilles 2026-06-04.
  const orgCompaniesCache = new Map<
    string,
    Array<{ id: string; norm: string }>
  >();
  async function findOrCreateCompanyByName(
    orgId: string,
    rawName: string,
  ): Promise<string | null> {
    const name = rawName.trim();
    if (!name) return null;
    const norm = normalizeCompanyName(name);

    let list = orgCompaniesCache.get(orgId);
    if (!list) {
      const { data: all } = await supabase
        .from("companies")
        .select("id, name")
        .eq("organization_id", orgId);
      list = (all ?? []).map((c) => ({
        id: c.id as string,
        norm: normalizeCompanyName(c.name as string),
      }));
      orgCompaniesCache.set(orgId, list);
    }

    const match = list.find((c) => c.norm === norm);
    if (match) return match.id;

    const { data: created, error: createErr } = await supabase
      .from("companies")
      .insert({
        organization_id: orgId,
        name,
        type: "client",
        is_active: true,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      console.warn("[healCompanyLinksForSession] create company failed", {
        name,
        error: createErr?.message,
      });
      return null;
    }
    const newId = created.id as string;
    list.push({ id: newId, norm }); // alimente le cache (anti-doublon intra-run)
    companiesCreated++;
    return newId;
  }

  try {
    // 1) Inscriptions avec freetext mais sans company_id
    const { data: broken } = await supabase
      .from("inscription_requests")
      .select(
        "id, organization_id, learner_id, company_name_freetext",
      )
      .eq("target_session_id", sessionId)
      .is("company_id", null)
      .not("company_name_freetext", "is", null);

    for (const ins of (broken ?? []) as Array<{
      id: string;
      organization_id: string;
      learner_id: string | null;
      company_name_freetext: string | null;
    }>) {
      const name = (ins.company_name_freetext ?? "").trim();
      if (!name) continue;

      // Cherche un homonyme (nom normalisé) sinon crée une fiche minimale.
      const companyId = await findOrCreateCompanyByName(
        ins.organization_id,
        name,
      );

      if (!companyId) continue;

      // c) Lie l'inscription
      await supabase
        .from("inscription_requests")
        .update({ company_id: companyId })
        .eq("id", ins.id);

      // d) Lie le learner SEULEMENT s'il n'a pas déjà une entreprise
      if (ins.learner_id) {
        const { data: updated } = await supabase
          .from("learners")
          .update({ company_id: companyId })
          .eq("id", ins.learner_id)
          .is("company_id", null)
          .select("id");
        if ((updated ?? []).length > 0) linkedLearners++;
      }
    }

    // 2) Learners de la session sans company_id mais dont la request
    //    associée a un company_id → recopie
    const { data: enrollments } = await supabase
      .from("session_enrollments")
      .select(
        "learner_id, request:inscription_requests!inscription_request_id(company_id)",
      )
      .eq("session_id", sessionId);

    for (const e of (enrollments ?? []) as Array<{
      learner_id: string | null;
      request:
        | { company_id: string | null }
        | Array<{ company_id: string | null }>
        | null;
    }>) {
      const reqRel = Array.isArray(e.request) ? e.request[0] : e.request;
      const reqCompanyId = reqRel?.company_id ?? null;
      if (!reqCompanyId || !e.learner_id) continue;
      const { data: updated } = await supabase
        .from("learners")
        .update({ company_id: reqCompanyId })
        .eq("id", e.learner_id)
        .is("company_id", null)
        .select("id");
      if ((updated ?? []).length > 0) linkedLearners++;
    }
  } catch (err) {
    console.warn(
      "[healCompanyLinksForSession] failed silently",
      (err as Error).message,
    );
  }

  return { companiesCreated, linkedLearners };
}

/**
 * Self-healing learners : crée les learners MANQUANTS pour les
 * inscriptions de la session qui n'ont pas de `learner_id` mais qui
 * ont les infos minimales (prénom + nom). Sans ça, healEnrollmentsForSession
 * skip ces inscriptions (parce qu'il filtre sur learner_id NOT NULL),
 * donc aucun enrollment n'est créé → invisible côté Conventions /
 * Convocations / Émargement.
 *
 * Gilles 2026-05-26 : session de 9 inscriptions toutes "Confirmé" côté
 * Participants, mais seules 2 visibles côté Conventions car les 7 autres
 * avaient inscription_request.learner_id = NULL (probablement un bug
 * antérieur de la création d'inscription).
 *
 * Silencieux. Renvoie le nombre de learners créés + liés.
 */
export async function healLearnersForSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ created: number; checked: number }> {
  let created = 0;
  try {
    const { data: broken } = await supabase
      .from("inscription_requests")
      .select(
        "id, organization_id, company_id, prospect_first_name, prospect_last_name, prospect_email, prospect_phone, prospect_mobile, prospect_birth_date, prospect_civility",
      )
      .eq("target_session_id", sessionId)
      .is("learner_id", null)
      .not("prospect_first_name", "is", null)
      .not("prospect_last_name", "is", null);

    const list = (broken ?? []) as Array<{
      id: string;
      organization_id: string;
      company_id: string | null;
      prospect_first_name: string | null;
      prospect_last_name: string | null;
      prospect_email: string | null;
      prospect_phone: string | null;
      prospect_mobile: string | null;
      prospect_birth_date: string | null;
      prospect_civility: string | null;
    }>;

    for (const ins of list) {
      // a) Cherche un learner existant par email (dans l'org)
      let learnerId: string | null = null;
      if (ins.prospect_email) {
        const { data: byEmail } = await supabase
          .from("learners")
          .select("id")
          .eq("organization_id", ins.organization_id)
          .ilike("email", ins.prospect_email)
          .limit(1)
          .maybeSingle<{ id: string }>();
        learnerId = byEmail?.id ?? null;
      }
      // b) Sinon crée le learner
      if (!learnerId) {
        const civility =
          ins.prospect_civility === "M." ||
          ins.prospect_civility === "Mme" ||
          ins.prospect_civility === "Autre"
            ? ins.prospect_civility
            : null;
        const { data: createdLearner, error: createErr } = await supabase
          .from("learners")
          .insert({
            organization_id: ins.organization_id,
            first_name: ins.prospect_first_name,
            last_name: ins.prospect_last_name,
            email: ins.prospect_email,
            phone: ins.prospect_phone,
            mobile: ins.prospect_mobile,
            birth_date: ins.prospect_birth_date,
            civility,
            company_id: ins.company_id,
            is_active: true,
          })
          .select("id")
          .single();
        if (createErr) {
          console.warn(
            "[healLearnersForSession] create learner failed",
            { inscription_id: ins.id, error: createErr.message },
          );
          continue;
        }
        learnerId = createdLearner?.id ?? null;
        if (learnerId) created++;
      }
      // c) Lie l'inscription
      if (learnerId) {
        await supabase
          .from("inscription_requests")
          .update({ learner_id: learnerId })
          .eq("id", ins.id);
      }
    }
  } catch (err) {
    console.warn(
      "[healLearnersForSession] failed silently",
      (err as Error).message,
    );
  }
  return { created, checked: 0 };
}

export async function healEnrollmentsForSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ healed: number; checked: number }> {
  // 1) Récupère toutes les inscriptions de la session avec un learner_id
  //    et leur stage (pour calculer le statut enrollment cible).
  const { data: requests } = await supabase
    .from("inscription_requests")
    .select(
      "id, learner_id, target_session_id, stage:inscription_stages(key)",
    )
    .eq("target_session_id", sessionId)
    .not("learner_id", "is", null);
  const reqs = (requests ?? []) as unknown as Array<{
    id: string;
    learner_id: string;
    target_session_id: string;
    stage: { key: string | null } | null;
  }>;
  if (reqs.length === 0) return { healed: 0, checked: 0 };

  // 2) Pour chaque request, vérifie qu'un enrollment existe et est lié.
  //    Sinon, appelle createMirroredEnrollmentForRequest qui gère
  //    création / re-rattachement.
  let healed = 0;
  for (const r of reqs) {
    const { data: enrollment } = await supabase
      .from("session_enrollments")
      .select("id, inscription_request_id")
      .eq("session_id", sessionId)
      .eq("learner_id", r.learner_id)
      .maybeSingle();
    if (!enrollment || enrollment.inscription_request_id !== r.id) {
      await createMirroredEnrollmentForRequest(supabase, {
        id: r.id,
        target_session_id: r.target_session_id,
        learner_id: r.learner_id,
        stage_key: r.stage?.key ?? null,
      });
      healed++;
    }
  }
  return { healed, checked: reqs.length };
}

/**
 * Sync stage → status : appelé quand le stage d'une `inscription_request`
 * change côté CRM.
 *
 * Comportement :
 *   - Si un `session_enrollment` lié existe → met à jour son statut.
 *   - Sinon, ET si la request a un target_session_id + learner_id →
 *     CRÉE l'enrollment manquant (cas des demandes confirmées qui
 *     n'avaient pas encore d'enrollment, typiquement pour les
 *     demandes créées avant la sync 2026-05-13 ou via un flux qui n'a
 *     pas appelé createMirroredEnrollmentForRequest).
 */
export async function syncStageChangeToEnrollment(
  supabase: SupabaseClient,
  requestId: string,
  newStageKey: string,
): Promise<void> {
  const newStatus = mapStageKeyToStatus(newStageKey);

  // 1) Mise à jour du statut si un enrollment lié existe.
  const { data: updated } = await supabase
    .from("session_enrollments")
    .update({ status: newStatus })
    .eq("inscription_request_id", requestId)
    .select("id");

  // 2) S'il n'y avait aucun enrollment lié, on tente d'en créer un
  //    pour rattraper le décalage. On a besoin de target_session_id +
  //    learner_id sur la request.
  if (!updated || updated.length === 0) {
    const { data: req } = await supabase
      .from("inscription_requests")
      .select("id, target_session_id, learner_id")
      .eq("id", requestId)
      .maybeSingle();
    if (
      req &&
      req.target_session_id &&
      req.learner_id
    ) {
      await createMirroredEnrollmentForRequest(supabase, {
        id: req.id as string,
        target_session_id: req.target_session_id as string,
        learner_id: req.learner_id as string,
        stage_key: newStageKey,
      });
    }
  }
}

/**
 * Sync status → stage : appelé quand le statut d'un `session_enrollment`
 * change côté Participants. Met à jour le stage de l'`inscription_request`
 * liée.
 */
export async function syncStatusChangeToRequest(
  supabase: SupabaseClient,
  enrollmentId: string,
  newStatus: EnrollmentStatus,
): Promise<void> {
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "inscription_request_id, session:sessions(organization_id)",
    )
    .eq("id", enrollmentId)
    .maybeSingle<{
      inscription_request_id: string | null;
      session: { organization_id: string } | null;
    }>();

  const requestId = enrollment?.inscription_request_id;
  const organizationId = enrollment?.session?.organization_id;
  if (!requestId || !organizationId) return;

  const stageKey = mapStatusToStageKey(newStatus);
  const stageId = await findStageIdByKey(supabase, organizationId, stageKey);
  if (!stageId) return;

  await supabase
    .from("inscription_requests")
    .update({ stage_id: stageId })
    .eq("id", requestId);
}

/**
 * Cascade : suppression d'un `session_enrollment` → suppression de
 * l'`inscription_request` liée (si elle existe).
 */
export async function cascadeDeleteRequestFromEnrollment(
  supabase: SupabaseClient,
  enrollmentId: string,
): Promise<void> {
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select("inscription_request_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  const requestId = enrollment?.inscription_request_id as string | null;
  if (!requestId) return;
  await supabase.from("inscription_requests").delete().eq("id", requestId);
}

/**
 * Cascade : suppression d'une `inscription_request` → suppression des
 * `session_enrollments` liés (en théorie un seul, mais on traite la
 * relation comme un set pour robustesse).
 */
export async function cascadeDeleteEnrollmentsFromRequest(
  supabase: SupabaseClient,
  requestId: string,
): Promise<void> {
  await supabase
    .from("session_enrollments")
    .delete()
    .eq("inscription_request_id", requestId);
}
