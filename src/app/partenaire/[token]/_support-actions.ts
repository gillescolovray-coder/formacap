"use server";

import QRCode from "qrcode";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { ensureEnrollmentPortalToken } from "@/lib/portal/express-signup";
import { resolvePartnerContext } from "./_resolve";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getAppOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

/**
 * Renvoie le LIEN du portail apprenant (/mon-parcours) + son QR code, pour que
 * l'OF/prescripteur le diffuse PAR SES PROPRES MOYENS (Gilles 2026-06-27).
 * Ne touche JAMAIS à l'email de l'apprenant (confidentialité : l'OF ne doit
 * pas savoir que CAP dispose de l'email).
 */
export async function getLearnerPortalLinkForPartner(
  token: string,
  sessionId: string,
  enrollmentId: string,
): Promise<
  { ok: true; url: string; qrDataUrl: string } | { ok: false; error: string }
> {
  if (!UUID_REGEX.test(sessionId) || !UUID_REGEX.test(enrollmentId)) {
    return { ok: false, error: "Paramètre invalide." };
  }
  const ctx = await resolvePartnerContext(token);
  if (!ctx) return { ok: false, error: "Accès portail invalide." };
  const admin = createAdminClient();
  const orgId = ctx.company.organization_id;

  const { data: sess } = await admin
    .from("sessions")
    .select(
      "id, organization_id, subcontracting_company_id, prescriber_company_id",
    )
    .eq("id", sessionId)
    .eq("organization_id", orgId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      subcontracting_company_id: string | null;
      prescriber_company_id: string | null;
    }>();
  if (!sess) return { ok: false, error: "Session introuvable." };
  const isMine =
    sess.subcontracting_company_id === ctx.company.id ||
    sess.prescriber_company_id === ctx.company.id;

  const { data: enr } = await admin
    .from("session_enrollments")
    .select("id, session_id, learner_id")
    .eq("id", enrollmentId)
    .maybeSingle<{
      id: string;
      session_id: string;
      learner_id: string | null;
    }>();
  if (!enr || enr.session_id !== sessionId) {
    return { ok: false, error: "Apprenant introuvable sur cette session." };
  }
  if (!isMine) {
    const { count } = await admin
      .from("inscription_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("target_session_id", sessionId)
      .eq("inscription_channel", "of")
      .eq("inscription_channel_company_id", ctx.company.id)
      .eq("learner_id", enr.learner_id);
    if (!count || count === 0) {
      return { ok: false, error: "Apprenant non rattaché à votre organisme." };
    }
  }

  const learnerToken = await ensureEnrollmentPortalToken(admin, enrollmentId);
  const origin = await getAppOrigin();
  const url = `${origin}/mon-parcours/${learnerToken}`;
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      width: 220,
      margin: 1,
      color: { dark: "#0e7490", light: "#ffffff" },
    });
  } catch {
    qrDataUrl = "";
  }
  return { ok: true, url, qrDataUrl };
}

export type SendSupportResult =
  | { ok: true; recipient: string }
  | { ok: false; error: string };

/**
 * Envoi par un OF/prescripteur (depuis son portail) du lien portail apprenant,
 * pour que l'apprenant TÉLÉCHARGE les supports remis (Gilles 2026-06-26).
 * Trace l'envoi dans support_link_sends = preuve Qualiopi de remise.
 */
export async function sendSupportLinkToLearner(
  token: string,
  sessionId: string,
  enrollmentId: string,
): Promise<SendSupportResult> {
  if (!UUID_REGEX.test(sessionId) || !UUID_REGEX.test(enrollmentId)) {
    return { ok: false, error: "Paramètre invalide." };
  }
  if (!isResendConfigured()) {
    return { ok: false, error: "Envoi d'email non configuré." };
  }
  const ctx = await resolvePartnerContext(token);
  if (!ctx) return { ok: false, error: "Accès portail invalide." };

  const admin = createAdminClient();
  const orgId = ctx.company.organization_id;

  // Charge la session (vérifie l'organisation + droit d'accès du partenaire).
  const { data: sess } = await admin
    .from("sessions")
    .select("id, organization_id, subcontracting_company_id, prescriber_company_id")
    .eq("id", sessionId)
    .eq("organization_id", orgId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      subcontracting_company_id: string | null;
      prescriber_company_id: string | null;
    }>();
  if (!sess) return { ok: false, error: "Session introuvable." };

  const isMine =
    sess.subcontracting_company_id === ctx.company.id ||
    sess.prescriber_company_id === ctx.company.id;

  // Charge l'inscription (enrollment) + apprenant ; vérifie le rattachement.
  const { data: enr } = await admin
    .from("session_enrollments")
    .select(
      "id, session_id, learner:learners(id, organization_id, first_name, last_name, email)",
    )
    .eq("id", enrollmentId)
    .maybeSingle<{
      id: string;
      session_id: string;
      learner: {
        id: string;
        organization_id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      } | null;
    }>();
  if (!enr || enr.session_id !== sessionId) {
    return { ok: false, error: "Apprenant introuvable sur cette session." };
  }
  const learner = enr.learner;
  if (!learner || learner.organization_id !== orgId) {
    return { ok: false, error: "Apprenant introuvable." };
  }

  // Si ce n'est pas SA session (sous-traitance/prescripteur), vérifie qu'il a
  // bien inscrit cet apprenant via son canal.
  if (!isMine) {
    const { count } = await admin
      .from("inscription_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("target_session_id", sessionId)
      .eq("inscription_channel", "of")
      .eq("inscription_channel_company_id", ctx.company.id)
      .eq("learner_id", learner.id);
    if (!count || count === 0) {
      return { ok: false, error: "Apprenant non rattaché à votre organisme." };
    }
  }

  if (!learner.email) {
    return {
      ok: false,
      error: "Aucun email pour cet apprenant (à compléter dans sa fiche).",
    };
  }

  // Lien vers l'espace DE LA SESSION (/mon-parcours/{token}/documents) — le
  // même que le QR/convocation, déjà public (Gilles 2026-06-26). L'apprenant
  // atterrit direct sur ses supports, sans compte.
  const enrollmentToken = await ensureEnrollmentPortalToken(admin, enrollmentId);
  const origin = await getAppOrigin();
  const portalUrl = `${origin.replace(/\/$/, "")}/mon-parcours/${enrollmentToken}/documents`;

  const orgName = ctx.organization.name;
  const fullName = [learner.first_name, learner.last_name]
    .filter(Boolean)
    .join(" ");
  const subject = `${orgName} : vos supports de formation`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
      <p>Bonjour <strong>${fullName || "—"}</strong>,</p>
      <p>Les <strong>supports de votre formation</strong> sont disponibles dans
      votre espace personnel. Vous pouvez les y consulter et les télécharger.</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${portalUrl}" style="display:inline-block;background:#0e7490;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;font-size:15px;">
          🎓 Accéder à mes supports
        </a>
      </p>
      <p style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:10px 12px;border-radius:6px;">
        Lien direct :<br/>
        <a href="${portalUrl}" style="color:#0e7490;word-break:break-all;">${portalUrl}</a>
      </p>
      <p style="font-size:12px;color:#dc2626;border-left:3px solid #dc2626;padding-left:10px;margin-top:18px;">
        ⚠️ Ce lien est strictement personnel et confidentiel.
      </p>
      <p style="margin-top:24px;">Bien cordialement,<br/><strong>${orgName}</strong></p>
    </div>`;
  const text = `Bonjour ${fullName || "—"},

Les supports de votre formation sont disponibles dans votre espace personnel :
${portalUrl}

Ce lien est strictement personnel et confidentiel.

Cordialement,
${orgName}`;

  const result = await sendEmail({
    to: learner.email,
    toName: fullName,
    subject,
    html,
    text,
    replyTo: ctx.organization.email ?? undefined,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Trace Qualiopi : qui (OF/presc.) a transmis, à qui, quand.
  try {
    await admin.from("support_link_sends").insert({
      organization_id: orgId,
      session_id: sessionId,
      enrollment_id: enrollmentId,
      learner_id: learner.id,
      learner_email: learner.email,
      sent_by_company_id: ctx.company.id,
      sent_by_label: ctx.company.name,
    });
  } catch {
    /* migration 0139 non appliquée -> envoi quand même réussi */
  }
  // Trace générique sur l'apprenant (best-effort).
  try {
    const { data: cur } = await admin
      .from("learners")
      .select("portal_link_sent_count")
      .eq("id", learner.id)
      .maybeSingle<{ portal_link_sent_count: number | null }>();
    await admin
      .from("learners")
      .update({
        portal_link_sent_at: new Date().toISOString(),
        portal_link_sent_count: (cur?.portal_link_sent_count ?? 0) + 1,
      })
      .eq("id", learner.id);
  } catch {
    /* ignore */
  }

  return { ok: true, recipient: learner.email };
}
