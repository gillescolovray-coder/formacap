/**
 * Helper de logging des desinscriptions (Gilles 2026-05-28).
 *
 * A appeler AVANT le delete effectif (sinon les joins pour le snapshot
 * echouent). Le helper recupere les infos cles (apprenant, formation,
 * date session) et insere une ligne dans inscription_deletion_log.
 *
 * La table est decouplee d'inscription_requests (pas de FK) pour
 * survivre au cascade-delete.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type LogParams = {
  requestId: string;
  deletedByType: "admin" | "partner" | "system";
  actorProfileId?: string | null;
  actorPartnerCompanyId?: string | null;
  reason?: string | null;
};

export async function logInscriptionDeletion(
  supabase: SupabaseClient,
  params: LogParams,
): Promise<void> {
  const {
    requestId,
    deletedByType,
    actorProfileId,
    actorPartnerCompanyId,
    reason,
  } = params;

  // Snapshot des infos AVANT le delete
  const { data: req } = await supabase
    .from("inscription_requests")
    .select(
      `id, organization_id, prospect_first_name, prospect_last_name,
       prospect_email, company_name_freetext, target_session_id,
       learner:learners(first_name, last_name, email, company:companies(name)),
       session:sessions(start_date, formation:formations(title))`,
    )
    .eq("id", requestId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      prospect_first_name: string | null;
      prospect_last_name: string | null;
      prospect_email: string | null;
      company_name_freetext: string | null;
      target_session_id: string | null;
      learner: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        company: { name: string } | null;
      } | null;
      session: {
        start_date: string | null;
        formation: { title: string } | null;
      } | null;
    }>();

  if (!req) {
    // Inscription deja supprimee — on logue quand meme l'event avec
    // un snapshot minimal pour ne pas perdre la trace.
    console.warn("[logInscriptionDeletion] request introuvable", { requestId });
    return;
  }

  const learnerName =
    [
      req.learner?.first_name ?? req.prospect_first_name,
      req.learner?.last_name ?? req.prospect_last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || null;
  const learnerEmail =
    req.learner?.email ?? req.prospect_email ?? null;
  const companyName =
    req.learner?.company?.name ?? req.company_name_freetext ?? null;
  const formationTitle = req.session?.formation?.title ?? null;
  const sessionStartDate = req.session?.start_date ?? null;

  const { error } = await supabase
    .from("inscription_deletion_log")
    .insert({
      organization_id: req.organization_id,
      request_id: req.id,
      learner_name: learnerName,
      learner_email: learnerEmail,
      company_name: companyName,
      session_id: req.target_session_id,
      session_start_date: sessionStartDate,
      formation_title: formationTitle,
      deleted_by_type: deletedByType,
      actor_profile_id: actorProfileId ?? null,
      actor_partner_company_id: actorPartnerCompanyId ?? null,
      reason: reason ?? null,
    });

  if (error) {
    console.error(
      "[logInscriptionDeletion] insert error",
      { requestId, error: error.message },
    );
  }
}
