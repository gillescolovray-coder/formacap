import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Redirige l'apprenant (depuis son portail) vers la page d'évaluation
 * à chaud publique de sa session. Génère un token à la volée si besoin.
 * Passe ?eid= pour pré-sélectionner l'apprenant.
 */
export default async function ParcoursEvaluationRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: portalRow } = await supabase
    .from("enrollment_portal_tokens")
    .select(
      "enrollment_id, enrollment:session_enrollments(session_id, session:sessions(end_date, organization_id))",
    )
    .eq("token", token)
    .maybeSingle<{
      enrollment_id: string;
      enrollment: {
        session_id: string;
        session: { end_date: string; organization_id: string } | null;
      } | null;
    }>();

  if (!portalRow || !portalRow.enrollment || !portalRow.enrollment.session) {
    redirect("/mon-parcours/" + token);
  }

  const sessionId = portalRow.enrollment.session_id;
  const { end_date: endDate, organization_id: orgId } =
    portalRow.enrollment.session;

  // Token actif ?
  const { data: existing } = await supabase
    .from("session_evaluation_tokens")
    .select("token")
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string }>();

  let sessionToken = existing?.token;

  if (!sessionToken) {
    const { data: org } = await supabase
      .from("organizations")
      .select("emargement_token_ttl_days")
      .eq("id", orgId)
      .maybeSingle<{ emargement_token_ttl_days: number | null }>();
    const ttlDays = org?.emargement_token_ttl_days ?? 7;

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const expiresAt = new Date(end.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const newToken = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");

    await supabase.from("session_evaluation_tokens").insert({
      session_id: sessionId,
      token: newToken,
      expires_at: expiresAt.toISOString(),
    });
    sessionToken = newToken;
  }

  redirect(`/evaluation/${sessionToken}?eid=${portalRow.enrollment_id}`);
}
