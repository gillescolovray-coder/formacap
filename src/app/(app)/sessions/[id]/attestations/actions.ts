"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/pdf/render";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { getReferentEmailsForEnrollment } from "@/lib/inscriptions/referents";

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function getCookies() {
  const c = await cookies();
  return c.getAll().map((x) => ({ name: x.name, value: x.value }));
}

export type SendAttestationResult = {
  enrollmentId: string;
  ok: boolean;
  error?: string;
};

export async function sendAttestationEmail(
  sessionId: string,
  enrollmentId: string,
): Promise<SendAttestationResult> {
  if (!isResendConfigured()) {
    return {
      enrollmentId,
      ok: false,
      error: "Resend non configuré.",
    };
  }

  const supabase = await createClient();

  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, email, civility), session:sessions(id, organization_id, formation:formations(title), start_date, end_date)",
    )
    .eq("id", enrollmentId)
    .maybeSingle<{
      id: string;
      learner: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        civility: string | null;
      } | null;
      session: {
        id: string;
        organization_id: string;
        formation: { title: string } | null;
        start_date: string;
        end_date: string;
      } | null;
    }>();

  if (!enrollment) {
    return { enrollmentId, ok: false, error: "Inscription introuvable." };
  }
  if (!enrollment.learner?.email) {
    return {
      enrollmentId,
      ok: false,
      error: "Apprenant sans email.",
    };
  }

  // Génération du PDF (page print authentifiée)
  const origin = await getAppOrigin();
  const printUrl = `${origin}/sessions/${sessionId}/attestations/${enrollmentId}/print`;
  const cookieList = await getCookies();

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf({ url: printUrl, cookies: cookieList });
  } catch (e) {
    return {
      enrollmentId,
      ok: false,
      error: `PDF échec : ${(e as Error).message}`,
    };
  }

  const orgId = enrollment.session?.organization_id ?? null;
  const { data: org } = orgId
    ? await supabase
        .from("organizations")
        .select("name, email")
        .eq("id", orgId)
        .maybeSingle<{ name: string; email: string | null }>()
    : { data: null };
  const orgName = org?.name ?? "Notre organisme";

  const learnerName = [
    enrollment.learner.first_name,
    enrollment.learner.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const formationTitle =
    enrollment.session?.formation?.title ?? "votre formation";

  const subject = `Attestation de réalisation — ${formationTitle}`;
  const html = `
    <p>Bonjour ${enrollment.learner.civility ?? ""} ${learnerName},</p>
    <p>Nous vous félicitons pour la réalisation de la formation
    <strong>« ${formationTitle} »</strong>.</p>
    <p>Vous trouverez ci-joint votre <strong>attestation de réalisation</strong>,
    document officiel à conserver pour vos démarches (Qualiopi, OPCO, CPF…).</p>
    <p>Nous vous remercions de la confiance accordée et restons à votre
    disposition pour tout besoin futur.</p>
    <p>Bien cordialement,<br/><strong>${orgName}</strong></p>
  `;
  const text = `Bonjour ${learnerName},\n\nVeuillez trouver ci-joint votre attestation de réalisation pour la formation « ${formationTitle} ».\n\nCordialement,\n${orgName}`;

  const safeName = learnerName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  const fileName = `attestation-${safeName || enrollmentId.slice(0, 8)}.pdf`;

  // R6 : référents pédagogiques en CC
  const referentCc = await getReferentEmailsForEnrollment(
    supabase,
    enrollmentId,
  );
  const result = await sendEmail({
    to: enrollment.learner.email,
    toName: learnerName,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
    cc: referentCc,
    attachments: [
      { filename: fileName, content: pdfBuffer, contentType: "application/pdf" },
    ],
  });

  await supabase.from("email_log").insert({
    organization_id: orgId,
    enrollment_id: enrollmentId,
    type: "attestation",
    to_email: enrollment.learner.email,
    to_name: learnerName,
    subject,
    status: result.ok ? "sent" : "failed",
    provider: "resend",
    provider_id: result.ok ? result.providerId : null,
    error: result.ok ? null : result.error,
    sent_at: result.ok ? new Date().toISOString() : null,
  });

  if (result.ok) {
    await supabase
      .from("session_enrollments")
      .update({ attestation_sent_at: new Date().toISOString() })
      .eq("id", enrollmentId);
  }

  revalidatePath(`/sessions/${sessionId}/attestations`);

  if (!result.ok) return { enrollmentId, ok: false, error: result.error };
  return { enrollmentId, ok: true };
}

export async function sendBulkAttestations(sessionId: string) {
  const supabase = await createClient();
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id, attestation_sent_at, learner:learners(email)")
    .eq("session_id", sessionId);

  type Row = {
    id: string;
    attestation_sent_at: string | null;
    learner: { email: string | null } | null;
  };
  const rows = (enrollments ?? []) as unknown as Row[];

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ id: string; reason: string }> = [];

  for (const r of rows) {
    if (r.attestation_sent_at) {
      skipped++;
      continue;
    }
    if (!r.learner?.email) {
      skipped++;
      errors.push({ id: r.id, reason: "Pas d'email" });
      continue;
    }
    const res = await sendAttestationEmail(sessionId, r.id);
    if (res.ok) sent++;
    else {
      failed++;
      errors.push({ id: r.id, reason: res.error ?? "Erreur" });
    }
  }

  return { total: rows.length, sent, failed, skipped, errors };
}
