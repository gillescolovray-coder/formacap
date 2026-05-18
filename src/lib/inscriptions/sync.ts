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

  // 1) Enrollment existant ?
  const { data: existing } = await supabase
    .from("session_enrollments")
    .select("id, inscription_request_id")
    .eq("session_id", request.target_session_id)
    .eq("learner_id", request.learner_id)
    .maybeSingle();

  if (existing) {
    // S'il n'est pas encore lié à une request, on le rattache.
    if (!existing.inscription_request_id) {
      await supabase
        .from("session_enrollments")
        .update({ inscription_request_id: request.id, status })
        .eq("id", existing.id);
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

  if (error || !created) return null;
  return created.id as string;
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
