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
    .select("id, inscription_request_id, status")
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
    const needsUpdate =
      existing.inscription_request_id !== request.id ||
      existing.status !== finalStatus;
    if (needsUpdate) {
      const { error: updErr } = await supabase
        .from("session_enrollments")
        .update({ inscription_request_id: request.id, status: finalStatus })
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
  const { data: created, error } = await supabase
    .from("session_enrollments")
    .insert({
      session_id: request.target_session_id,
      learner_id: request.learner_id,
      status,
      inscription_request_id: request.id,
    })
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
 * qui sont au stage `confirmed` (= won, terminal positif) MAIS qui n'ont
 * pas d'enrollment correspondant. Recrée ou re-rattache automatiquement
 * les enrollments manquants pour réparer les désynchronisations.
 *
 * Appelé au chargement de la page Participants — silencieux, pas
 * d'erreur côté UI. Renvoie le nombre d'enrollments réparés.
 */
export async function healEnrollmentsForSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ healed: number; checked: number }> {
  // 1) Trouve l'ID du stage "confirmed" pour cette orga via la session
  const { data: session } = await supabase
    .from("sessions")
    .select("organization_id")
    .eq("id", sessionId)
    .maybeSingle<{ organization_id: string }>();
  if (!session) return { healed: 0, checked: 0 };

  const { data: stage } = await supabase
    .from("inscription_stages")
    .select("id")
    .eq("organization_id", session.organization_id)
    .eq("key", "confirmed")
    .maybeSingle<{ id: string }>();
  if (!stage) return { healed: 0, checked: 0 };

  // 2) Récupère toutes les requests `confirmed` pour cette session avec
  //    un learner_id renseigné.
  const { data: requests } = await supabase
    .from("inscription_requests")
    .select("id, learner_id, target_session_id")
    .eq("target_session_id", sessionId)
    .eq("stage_id", stage.id)
    .not("learner_id", "is", null);
  const confirmedReqs = (requests ?? []) as Array<{
    id: string;
    learner_id: string;
    target_session_id: string;
  }>;
  if (confirmedReqs.length === 0) return { healed: 0, checked: 0 };

  // 3) Pour chaque request, vérifie qu'un enrollment existe et est lié.
  //    Sinon, appelle createMirroredEnrollmentForRequest (qui gère le
  //    cas existant / création).
  let healed = 0;
  for (const r of confirmedReqs) {
    const { data: enrollment } = await supabase
      .from("session_enrollments")
      .select("id, inscription_request_id")
      .eq("session_id", sessionId)
      .eq("learner_id", r.learner_id)
      .maybeSingle();
    // Si pas d'enrollment OU enrollment lié à une autre request → on
    // appelle la fonction de sync qui va re-rattacher.
    if (!enrollment || enrollment.inscription_request_id !== r.id) {
      await createMirroredEnrollmentForRequest(supabase, {
        id: r.id,
        target_session_id: r.target_session_id,
        learner_id: r.learner_id,
        stage_key: "confirmed",
      });
      healed++;
    }
  }
  return { healed, checked: confirmedReqs.length };
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
