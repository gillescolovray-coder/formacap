/**
 * Enregistre une "visite" d'un apprenant sur son portail (traçabilité
 * des accès — Gilles 2026-06-05). Throttle : au plus 1 ligne par
 * apprenant et par tranche de 30 min, pour refléter les venues réelles
 * sans gonfler les chiffres. Best-effort : n'échoue jamais la page.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const THROTTLE_MS = 30 * 60 * 1000; // 30 min

export async function logLearnerVisit(
  supabase: SupabaseClient,
  organizationId: string,
  learnerId: string,
  /** Inscription/session visitée (Gilles 2026-06-25) — permet de savoir SUR
   *  QUELLE SESSION l'apprenant a cliqué. Throttle alors par (apprenant, inscription). */
  enrollmentId?: string | null,
): Promise<void> {
  try {
    let q = supabase
      .from("learner_portal_visits")
      .select("visited_at")
      .eq("learner_id", learnerId)
      .order("visited_at", { ascending: false })
      .limit(1);
    // Throttle par inscription si on la connaît (sinon par apprenant).
    if (enrollmentId) q = q.eq("enrollment_id", enrollmentId);
    const { data: last } = await q.maybeSingle<{ visited_at: string }>();
    if (
      last?.visited_at &&
      Date.now() - new Date(last.visited_at).getTime() < THROTTLE_MS
    ) {
      return; // visite récente -> on ne réenregistre pas
    }
    await supabase.from("learner_portal_visits").insert({
      organization_id: organizationId,
      learner_id: learnerId,
      enrollment_id: enrollmentId ?? null,
    });
  } catch {
    // La traçabilité ne doit jamais casser l'accès au portail.
  }
}
