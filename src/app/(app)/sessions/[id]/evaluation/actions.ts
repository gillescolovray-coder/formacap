"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { buildGoogleReviewEmail } from "@/lib/google-review/email";

/**
 * Envoie une demande d'avis Google aux apprenants sélectionnés (envoi MANUEL —
 * Gilles 2026-06-23). Éligibilité revérifiée côté serveur : éval à chaud
 * « Très satisfait » + email présent + pas déjà sollicité (1 par enrollment).
 * Trace chaque envoi dans google_review_requests (qui, quand, mode manuel).
 */
export async function sendGoogleReviewRequests(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const enrollmentIds = formData
    .getAll("enrollmentId")
    .map((v) => String(v))
    .filter(Boolean);
  const redirectBase = `/sessions/${sessionId}/evaluation`;

  if (!sessionId || enrollmentIds.length === 0) {
    redirect(`${redirectBase}?gerror=${encodeURIComponent("Aucun apprenant sélectionné.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Session + organisation (lien Google + branding)
  const { data: session } = await supabase
    .from("sessions")
    .select("id, organization_id")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (!session) {
    redirect(`${redirectBase}?gerror=${encodeURIComponent("Session introuvable.")}`);
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url, email, google_review_url")
    .eq("id", session!.organization_id)
    .maybeSingle<{
      name: string;
      logo_url: string | null;
      email: string | null;
      google_review_url: string | null;
    }>();

  const reviewUrl = org?.google_review_url?.trim();
  if (!reviewUrl) {
    redirect(
      `${redirectBase}?gerror=${encodeURIComponent(
        "Aucun lien d'avis Google configuré (Paramètres > Organisation).",
      )}`,
    );
  }

  // Apprenants ciblés (avec email) sur cette session.
  const { data: enrollRows } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner_id, learner:learners(first_name, last_name, email)",
    )
    .eq("session_id", sessionId)
    .in("id", enrollmentIds);

  type Row = {
    id: string;
    learner_id: string | null;
    learner: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  };
  const rows = (enrollRows ?? []) as unknown as Row[];

  // Éligibilité : éval à chaud « Très satisfait ».
  const { data: evals } = await supabase
    .from("evaluation_responses")
    .select("enrollment_id, satisfaction_overall")
    .eq("evaluation_type", "hot")
    .in("enrollment_id", enrollmentIds);
  const verySatisfied = new Set(
    ((evals ?? []) as Array<{
      enrollment_id: string;
      satisfaction_overall: string | null;
    }>)
      .filter((e) => e.satisfaction_overall === "very_satisfied")
      .map((e) => e.enrollment_id),
  );

  // Déjà sollicités (anti-doublon).
  const { data: already } = await supabase
    .from("google_review_requests")
    .select("enrollment_id")
    .in("enrollment_id", enrollmentIds);
  const alreadySent = new Set(
    ((already ?? []) as Array<{ enrollment_id: string }>).map(
      (r) => r.enrollment_id,
    ),
  );

  let sent = 0;
  let skipped = 0;
  for (const r of rows) {
    const learner = Array.isArray(r.learner) ? r.learner[0] : r.learner;
    const email = learner?.email?.trim();
    if (
      !email ||
      !verySatisfied.has(r.id) ||
      alreadySent.has(r.id)
    ) {
      skipped += 1;
      continue;
    }
    const { subject, html } = buildGoogleReviewEmail({
      learnerFirstName: learner?.first_name ?? null,
      orgName: org?.name ?? "CAP NUMERIQUE",
      orgLogoUrl: org?.logo_url ?? null,
      reviewUrl: reviewUrl!,
    });
    const res = await sendEmail({
      to: email,
      toName: [learner?.first_name, learner?.last_name]
        .filter(Boolean)
        .join(" "),
      subject,
      html,
      replyTo: org?.email ?? undefined,
    });
    if (!res.ok) {
      skipped += 1;
      continue;
    }
    await supabase.from("google_review_requests").insert({
      organization_id: session!.organization_id,
      enrollment_id: r.id,
      session_id: sessionId,
      learner_id: r.learner_id,
      email,
      channel: "manual",
      sent_by: user.id,
      status: "sent",
      resend_message_id: res.providerId || null,
    });
    sent += 1;
  }

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?gsent=${sent}&gskipped=${skipped}`);
}

export async function toggleEvaluationOpen(
  sessionId: string,
  open: boolean,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ evaluation_open: open })
    .eq("id", sessionId);
  if (error) {
    redirect(
      `/sessions/${sessionId}/evaluation?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/sessions/${sessionId}/evaluation`);
  redirect(
    `/sessions/${sessionId}/evaluation?${open ? "opened=1" : "closed=1"}`,
  );
}
