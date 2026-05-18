import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Redirige l'apprenant (depuis son portail) vers la page d'émargement
 * publique de sa session. Génère un token session émargement à la volée
 * si nécessaire (cas où le formateur n'a pas encore projeté le QR).
 *
 * Passe `?eid=<enrollmentId>` pour permettre la pré-sélection du nom
 * de l'apprenant sur la page d'émargement.
 */
export default async function ParcoursEmargementRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 1. Token portail → enrollment + session
  const { data: portalRow } = await supabase
    .from("enrollment_portal_tokens")
    .select(
      "enrollment_id, enrollment:session_enrollments(session_id, session:sessions(end_date))",
    )
    .eq("token", token)
    .maybeSingle<{
      enrollment_id: string;
      enrollment: {
        session_id: string;
        session: { end_date: string } | null;
      } | null;
    }>();

  if (!portalRow || !portalRow.enrollment) {
    redirect("/mon-parcours/" + token);
  }

  const sessionId = portalRow.enrollment.session_id;
  const endDate = portalRow.enrollment.session?.end_date;
  if (!sessionId || !endDate) {
    redirect("/mon-parcours/" + token);
  }

  // 2. Existe-t-il un token session émargement actif ?
  const { data: existing } = await supabase
    .from("session_emargement_tokens")
    .select("token")
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string }>();

  let sessionToken = existing?.token;

  if (!sessionToken) {
    // 3. Pas de token actif → on en crée un (durée = end_date + TTL org)
    const { data: enrollment2 } = await supabase
      .from("session_enrollments")
      .select("session:sessions(organization_id)")
      .eq("id", portalRow.enrollment_id)
      .maybeSingle<{ session: { organization_id: string } | null }>();
    const orgId = enrollment2?.session?.organization_id;

    let ttlDays = 7;
    if (orgId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("emargement_token_ttl_days")
        .eq("id", orgId)
        .maybeSingle<{ emargement_token_ttl_days: number | null }>();
      ttlDays = org?.emargement_token_ttl_days ?? 7;
    }

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const expiresAt = new Date(end.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const newToken = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");

    await supabase.from("session_emargement_tokens").insert({
      session_id: sessionId,
      token: newToken,
      expires_at: expiresAt.toISOString(),
    });
    sessionToken = newToken;
  }

  redirect(`/emarger/${sessionToken}?eid=${portalRow.enrollment_id}`);
}
