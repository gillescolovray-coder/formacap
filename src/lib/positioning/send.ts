/**
 * Envoi du TEST DE POSITIONNEMENT à un apprenant (Gilles 2026-06-05).
 *
 * ─────────────────────────────────────────────────────────────────────
 * PROCESSUS RETENU (résumé pour maintenance) :
 *  • Le test de positionnement n'était jamais "envoyé" : l'apprenant n'y
 *    accédait que via son portail perso (lien dans la convocation). Les
 *    apprenants sans convocation (sous-traitance / saisie express) ne le
 *    recevaient donc jamais → onglet POSITIONNEMENT bloqué "en attente".
 *  • Désormais on ENVOIE le test par email (lien direct vers la page de
 *    positionnement du portail apprenant), avec TRAÇABILITÉ (email_log,
 *    type 'positionnement'). Déclencheurs : confirmation de session +
 *    envoi de convocation + bouton manuel (renvoi). Les apprenants SANS
 *    email passent par le QR sur place / la garde à l'émargement.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Cette fonction envoie l'invitation à UN enrollment et la trace. Elle est
 * idempotente côté token (réutilise le token portail existant).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, isResendConfigured } from "@/lib/email/resend";
import {
  getOrCreateEnrollmentPortalToken,
  buildPortalUrl,
} from "@/lib/portal/enrollment-token";

export type SendPositioningResult =
  | { ok: true; recipient: string }
  | { ok: false; error: string; reason?: "no_email" | "not_configured" };

export async function sendPositioningInvite(
  supabase: SupabaseClient,
  enrollmentId: string,
  origin: string,
): Promise<SendPositioningResult> {
  if (!isResendConfigured()) {
    return { ok: false, error: "Envoi email non configuré.", reason: "not_configured" };
  }

  const { data: enr } = await supabase
    .from("session_enrollments")
    .select(
      "id, session:sessions(organization_id, formation:formations(title)), learner:learners(first_name, last_name, civility, email)",
    )
    .eq("id", enrollmentId)
    .maybeSingle<{
      id: string;
      session: {
        organization_id: string;
        formation: { title: string } | null;
      } | null;
      learner: {
        first_name: string | null;
        last_name: string | null;
        civility: string | null;
        email: string | null;
      } | null;
    }>();
  if (!enr || !enr.session) {
    return { ok: false, error: "Inscription introuvable." };
  }
  const email = enr.learner?.email?.trim();
  if (!email) {
    return {
      ok: false,
      error: "Aucun email pour cet apprenant (utilisez le QR sur place).",
      reason: "no_email",
    };
  }

  const orgId = enr.session.organization_id;
  const formationTitle = enr.session.formation?.title ?? "votre formation";

  const { data: org } = await supabase
    .from("organizations")
    .select("name, email, logo_url")
    .eq("id", orgId)
    .maybeSingle<{ name: string; email: string | null; logo_url: string | null }>();
  const orgName = org?.name ?? "CAP NUMÉRIQUE";

  const { token } = await getOrCreateEnrollmentPortalToken(supabase, enrollmentId);
  const url = `${buildPortalUrl(origin, token)}/positionnement`;

  const civility = enr.learner?.civility ?? "";
  const fullName = [enr.learner?.first_name, enr.learner?.last_name]
    .filter(Boolean)
    .join(" ");
  const civilName = [civility, fullName].filter(Boolean).join(" ").trim() || "—";

  const subject = `${orgName} : votre test de positionnement — ${formationTitle}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
      ${org?.logo_url ? `<p style="text-align:center;"><img src="${org.logo_url}" alt="${orgName}" style="max-height:60px;"/></p>` : ""}
      <p>Bonjour <strong>${civilName}</strong>,</p>
      <p>Avant votre formation <strong>«&nbsp;${formationTitle}&nbsp;»</strong>, merci de
      compléter votre <strong>test de positionnement</strong>. Il nous permet d'adapter
      la formation à votre niveau et à vos attentes (quelques minutes).</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${url}" style="display:inline-block;background:#0e7490;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;font-size:15px;">
          📝 Faire mon test de positionnement
        </a>
      </p>
      <p style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:10px 12px;border-radius:6px;">
        Lien direct :<br/>
        <a href="${url}" style="color:#0e7490;word-break:break-all;">${url}</a>
      </p>
      <p style="margin-top:24px;">Bien cordialement,<br/><strong>${orgName}</strong></p>
    </div>`;
  const text = `Bonjour ${civilName},

Avant votre formation "${formationTitle}", merci de completer votre test de positionnement.

Lien : ${url}

Cordialement,
${orgName}`;

  const result = await sendEmail({
    to: email,
    toName: fullName || undefined,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
  });

  // Traçabilité (best-effort)
  try {
    await supabase.from("email_log").insert({
      organization_id: orgId,
      enrollment_id: enrollmentId,
      type: "positionnement",
      to_email: email,
      to_name: fullName || null,
      subject,
      status: result.ok ? "sent" : "failed",
      provider: "resend",
      provider_id: result.ok ? result.providerId : null,
      error: result.ok ? null : result.error,
      sent_at: result.ok ? new Date().toISOString() : null,
    });
  } catch {
    /* le log ne doit pas bloquer l'envoi */
  }

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, recipient: email };
}
