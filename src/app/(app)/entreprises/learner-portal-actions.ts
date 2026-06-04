"use server";

/**
 * Server actions pour le bouton "Envoyer le lien d acces portail
 * apprenant par email" sur la fiche entreprise (Gilles 2026-06-04).
 *
 * Genere le token, fabrique un QR code (PNG via lib qrcode), construit
 * l email HTML et envoie le tout via Resend.
 */
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import {
  buildLearnerPortalUrl,
  getOrCreateLearnerPortalToken,
} from "@/lib/portal/learner-token";
import { headers } from "next/headers";

async function getAppOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SendLearnerPortalLinkResult =
  | { ok: true; recipient: string }
  | { ok: false; error: string };

export async function sendLearnerPortalLink(
  learnerId: string,
): Promise<SendLearnerPortalLinkResult> {
  if (!UUID_REGEX.test(learnerId)) {
    return { ok: false, error: "Identifiant apprenant invalide." };
  }
  if (!isResendConfigured()) {
    return { ok: false, error: "Resend non configuré." };
  }

  // Auth admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Non authentifié." };
  }

  const admin = createAdminClient();

  // Charge le learner + verifie membership
  const { data: learner } = await admin
    .from("learners")
    .select("id, organization_id, civility, first_name, last_name, email")
    .eq("id", learnerId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>();
  if (!learner) {
    return { ok: false, error: "Apprenant introuvable." };
  }
  if (!learner.email) {
    return {
      ok: false,
      error:
        "Aucun email renseigné pour cet apprenant. Ajoutez-le dans la fiche apprenant.",
    };
  }

  // Liste toutes les memberships actives (pas de .maybeSingle() qui
  // plante en cas de doublon -> faux "non autorise").
  const { data: memberships } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  const allowed = (memberships ?? []).some(
    (m) => m.organization_id === learner.organization_id,
  );
  if (!allowed) {
    return { ok: false, error: "Vous n'êtes pas autorisé pour cette organisation." };
  }

  // Genere le token + URL
  const { token } = await getOrCreateLearnerPortalToken(admin, learnerId);
  const origin = await getAppOrigin();
  const portalUrl = buildLearnerPortalUrl(origin, token);

  // Charge l organisation pour l email
  const { data: org } = await admin
    .from("organizations")
    .select("name, email, logo_url")
    .eq("id", learner.organization_id)
    .maybeSingle<{ name: string; email: string | null; logo_url: string | null }>();
  const orgName = org?.name ?? "CAP NUMERIQUE";

  // Genere le QR code (220x220 PNG buffer, ECC level M pour resistance)
  let qrBuffer: Buffer | null = null;
  try {
    qrBuffer = await QRCode.toBuffer(portalUrl, {
      type: "png",
      errorCorrectionLevel: "M",
      width: 220,
      margin: 1,
      color: { dark: "#0e7490", light: "#ffffff" },
    });
  } catch (e) {
    console.warn(
      "[sendLearnerPortalLink] QR generation failed:",
      (e as Error).message,
    );
    qrBuffer = null;
  }

  const civility = learner.civility ?? "";
  const fullName = [learner.first_name, learner.last_name]
    .filter(Boolean)
    .join(" ");
  const civilFullName = [civility, fullName].filter(Boolean).join(" ").trim();
  const upperLastName = (learner.last_name ?? "").toUpperCase();
  const civilUpperName = [civility, learner.first_name, upperLastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  // Sujet : CAP NUMERIQUE : Acces portail [Civilite Prenom NOM]
  const subject = `${orgName.toUpperCase()} : Acces portail ${civilUpperName}`;

  // QR : injecte en pieces jointes inline avec cid
  const qrCid = "learner-portal-qr";
  const qrImgTag = qrBuffer
    ? `<img src="cid:${qrCid}" alt="QR code portail" width="220" height="220" style="display:block;border:1px solid #e5e7eb;border-radius:8px;background:white;padding:8px;" />`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
      <p>Bonjour <strong>${civilFullName || "—"}</strong>,</p>

      <p><strong>${orgName}</strong> vous donne accès à votre espace
      personnel dédié.</p>

      <p>Vous y retrouverez à tout moment :</p>
      <ul style="padding-left:20px;">
        <li>La liste de vos formations (à venir et passées)</li>
        <li>Vos attestations de réalisation téléchargeables</li>
        <li>Vos programmes de formation</li>
        <li>Vos résultats de quiz (entrée / sortie + progression)</li>
      </ul>

      <p style="text-align:center;margin:24px 0;">
        <a href="${portalUrl}"
           style="display:inline-block;background:#0e7490;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;font-size:15px;">
          🎓 Accéder à mon espace
        </a>
      </p>

      ${qrImgTag ? `
      <p style="text-align:center;margin:16px 0 8px 0;font-size:13px;color:#6b7280;">
        Ou flashez ce QR code depuis votre smartphone :
      </p>
      <p style="text-align:center;margin:0 0 18px 0;">
        ${qrImgTag}
      </p>
      ` : ""}

      <p style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:10px 12px;border-radius:6px;">
        Lien direct (à conserver précieusement) :<br/>
        <a href="${portalUrl}" style="color:#0e7490;word-break:break-all;">${portalUrl}</a>
      </p>

      <p style="font-size:12px;color:#dc2626;border-left:3px solid #dc2626;padding-left:10px;margin-top:18px;">
        ⚠️ Ce lien est <strong>strictement personnel et confidentiel</strong>.
        Ne le partagez avec personne. Il vous donne accès à vos données de
        formation pour toute la durée de votre suivi.
      </p>

      <p style="margin-top:24px;">
        Bien cordialement,<br/>
        <strong>${orgName}</strong>
      </p>
    </div>
  `;

  const text = `Bonjour ${civilFullName || "—"},

${orgName} vous donne acces a votre espace personnel dedie.

Vous y retrouverez :
- La liste de vos formations
- Vos attestations de realisation
- Vos programmes de formation
- Vos resultats de quiz + progression

Lien direct : ${portalUrl}

⚠️ Ce lien est strictement personnel et confidentiel.

Cordialement,
${orgName}`;

  const result = await sendEmail({
    to: learner.email,
    toName: fullName,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
    attachments: qrBuffer
      ? [
          {
            filename: "qrcode-portail.png",
            content: qrBuffer,
            contentType: "image/png",
          },
        ]
      : undefined,
  });

  // Log envoi (best-effort)
  try {
    await admin.from("email_log").insert({
      organization_id: learner.organization_id,
      enrollment_id: null,
      type: "learner_portal_access",
      to_email: learner.email,
      to_name: fullName,
      subject,
      status: result.ok ? "sent" : "failed",
      error_message: result.ok ? null : result.error,
      provider_id: result.ok ? result.providerId : null,
    });
  } catch (e) {
    console.warn(
      "[sendLearnerPortalLink] email_log insert failed:",
      (e as Error).message,
    );
  }

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, recipient: learner.email };
}
