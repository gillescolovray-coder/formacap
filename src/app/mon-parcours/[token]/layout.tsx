import { createAdminClient } from "@/lib/supabase/admin";
import { logLearnerVisit } from "@/lib/portal/log-visit";

export const dynamic = "force-dynamic";

/**
 * Layout du portail apprenant `/mon-parcours/[token]` (Gilles 2026-06-19).
 *
 * Objectif : TRACER la visite ici aussi. Le compteur « Accès à l'espace
 * apprenant » du tableau de bord restait à 0 parce que le traçage n'était
 * branché que sur l'autre portail (`/apprenant/[token]`), alors que les
 * convocations diffusent ce lien `/mon-parcours`. On logge donc la venue
 * (dédup 30 min, best-effort) sans rien changer au rendu des pages.
 */
export default async function MonParcoursLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  try {
    const supabase = createAdminClient();
    const { data: tokenRow } = await supabase
      .from("enrollment_portal_tokens")
      .select("enrollment_id")
      .eq("token", token)
      .maybeSingle<{ enrollment_id: string }>();
    if (tokenRow?.enrollment_id) {
      const { data: enr } = await supabase
        .from("session_enrollments")
        .select("learner:learners(id, organization_id)")
        .eq("id", tokenRow.enrollment_id)
        .maybeSingle<{
          learner:
            | { id: string; organization_id: string }
            | Array<{ id: string; organization_id: string }>
            | null;
        }>();
      const learner = Array.isArray(enr?.learner)
        ? enr?.learner[0]
        : enr?.learner;
      if (learner?.id && learner?.organization_id) {
        await logLearnerVisit(supabase, learner.organization_id, learner.id);
      }
    }
  } catch {
    // La traçabilité ne doit jamais casser l'accès au portail.
  }

  return <>{children}</>;
}
