"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import {
  buildTrainerPortalUrl,
  deleteTrainerPortalToken,
  getOrCreateTrainerPortalToken,
  getTrainerPortalToken,
} from "@/lib/portal/trainer-token";

/**
 * Actions admin pour gérer l'accès au portail formateur.
 * Calque le pattern partenaire (cf. entreprises/[id]/partner-actions.ts)
 * avec en plus un email d'invitation automatique (demande Gilles 2026-05-23).
 *
 * Workflow :
 *  - activateTrainerPortal : crée le token (idempotent) + envoie l'email
 *  - resendTrainerPortalInvitation : renvoie l'email pour le token existant
 *  - revokeTrainerPortal : DELETE physique du token (sans email)
 */

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

type TrainerInfo = {
  firstName: string;
  lastName: string;
  email: string | null;
  organizationName: string;
  organizationEmail: string | null;
};

async function loadTrainerInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  trainerId: string,
): Promise<TrainerInfo | null> {
  const { data: trainer } = await supabase
    .from("trainers")
    .select("first_name, last_name, email, organization_id")
    .eq("id", trainerId)
    .maybeSingle<{
      first_name: string;
      last_name: string;
      email: string | null;
      organization_id: string;
    }>();
  if (!trainer) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("name, email")
    .eq("id", trainer.organization_id)
    .maybeSingle<{ name: string; email: string | null }>();

  return {
    firstName: trainer.first_name,
    lastName: trainer.last_name,
    email: trainer.email,
    organizationName: org?.name ?? "Notre organisme",
    organizationEmail: org?.email ?? null,
  };
}

function buildInvitationEmail({
  trainer,
  portalUrl,
}: {
  trainer: TrainerInfo;
  portalUrl: string;
}): { subject: string; html: string; text: string } {
  const fullName = `${trainer.firstName} ${trainer.lastName}`.trim();
  const orgName = trainer.organizationName;

  const subject = `Votre espace formateur — ${orgName}`;

  const html = `
    <div style="font-family: system-ui, sans-serif; color: #18181b; max-width: 560px;">
      <p>Bonjour ${fullName},</p>

      <p><strong>${orgName}</strong> vous donne accès à votre <strong>espace formateur en ligne</strong>.</p>

      <p>Ce lien personnel et permanent vous permet de gérer toutes vos sessions
      depuis votre téléphone ou votre ordinateur, à tout moment :</p>

      <p style="margin: 28px 0; text-align: center;">
        <a href="${portalUrl}"
           style="display:inline-block;background:#0e7490;color:white;
                  text-decoration:none;padding:14px 28px;border-radius:8px;
                  font-weight:bold;font-size:15px;">
          Accéder à mon espace formateur
        </a>
      </p>

      <p style="margin-top: 24px;"><strong>Ce que vous pouvez faire dans votre espace :</strong></p>
      <ul style="line-height: 1.6;">
        <li>📅 Voir <strong>l'agenda de vos sessions</strong> (à venir et passées) avec horaires, lieu et lien visio</li>
        <li>🗓 <strong>Ajouter une session à votre agenda</strong> Google Calendar, Outlook ou via un fichier .ics</li>
        <li>👥 Consulter <strong>la liste des participants</strong> de chaque session avec leurs coordonnées</li>
        <li>🎯 Voir les <strong>tests de positionnement</strong> remplis par les apprenants + saisir votre observation pédagogique</li>
        <li>✍ Gérer <strong>l'émargement</strong> électronique : QR code (présentiel), envoi de lien par email (distanciel) ou pointage manuel</li>
        <li>📎 Téléverser et partager <strong>les supports de cours</strong> avec vos apprenants</li>
        <li>📊 Consulter les <strong>évaluations à chaud</strong> et les <strong>quiz pré/post</strong></li>
        <li>📝 Saisir votre <strong>bilan formateur</strong> de fin de session (preuve Qualiopi)</li>
        <li>🖨 Télécharger la <strong>feuille d'émargement PDF</strong> imprimable</li>
      </ul>

      <p style="margin-top: 24px; font-size: 13px; color: #52525b;">
        <strong>Conservez ce lien</strong> dans vos favoris ou les notes de votre téléphone :
        il est strictement personnel et vous donne accès en permanence à toutes
        vos sessions.
      </p>

      <p style="margin-top: 16px; font-size: 12px; color: #71717a; word-break: break-all;">
        Lien d'accès direct : <a href="${portalUrl}" style="color:#0e7490;">${portalUrl}</a>
      </p>

      <p style="margin-top: 28px; border-top: 1px solid #e4e4e7; padding-top: 14px;">
        Bien cordialement,<br/>
        <strong>${orgName}</strong>
      </p>
    </div>
  `.trim();

  const text = [
    `Bonjour ${fullName},`,
    "",
    `${orgName} vous donne accès à votre espace formateur en ligne.`,
    "",
    `Lien d'accès personnel et permanent : ${portalUrl}`,
    "",
    "Vous pouvez :",
    "- Voir l'agenda de vos sessions (à venir et passées)",
    "- Ajouter une session à votre agenda Google Calendar / Outlook / .ics",
    "- Consulter la liste des participants",
    "- Voir les tests de positionnement + saisir votre observation",
    "- Gérer l'émargement (QR code, email distanciel, pointage manuel)",
    "- Téléverser et partager les supports de cours",
    "- Consulter les évaluations à chaud + quiz pré/post",
    "- Saisir votre bilan formateur de fin de session",
    "- Télécharger la feuille d'émargement PDF",
    "",
    "Conservez ce lien : il est strictement personnel et vous donne accès en permanence à toutes vos sessions.",
    "",
    `Bien cordialement,\n${orgName}`,
  ].join("\n");

  return { subject, html, text };
}

async function sendInvitationEmail(params: {
  trainerId: string;
  trainer: TrainerInfo;
  portalUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { trainerId, trainer, portalUrl } = params;
  if (!trainer.email) {
    return { ok: false, error: "Le formateur n'a pas d'adresse email." };
  }
  if (!isResendConfigured()) {
    return {
      ok: false,
      error: "L'envoi automatique n'est pas configuré (Resend).",
    };
  }
  const { subject, html, text } = buildInvitationEmail({ trainer, portalUrl });
  const result = await sendEmail({
    to: trainer.email,
    toName: `${trainer.firstName} ${trainer.lastName}`.trim(),
    subject,
    html,
    text,
    replyTo: trainer.organizationEmail ?? undefined,
  });
  // Best-effort log dans email_log si la table existe — on ne fait
  // pas échouer l'invitation si le log échoue.
  try {
    const supabase = await createClient();
    const { data: t } = await supabase
      .from("trainers")
      .select("organization_id")
      .eq("id", trainerId)
      .maybeSingle<{ organization_id: string }>();
    if (t) {
      await supabase.from("email_log").insert({
        organization_id: t.organization_id,
        type: "trainer_portal_invitation",
        to_email: trainer.email,
        to_name: `${trainer.firstName} ${trainer.lastName}`.trim(),
        subject,
        status: result.ok ? "sent" : "failed",
        provider: "resend",
        provider_id: result.ok ? result.providerId : null,
        error: result.ok ? null : result.error,
        sent_at: result.ok ? new Date().toISOString() : null,
      });
    }
  } catch (e) {
    console.warn(
      "[trainer-portal] email_log insert failed (non-bloquant)",
      (e as Error).message,
    );
  }
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * Active (génère si besoin) le token portail formateur + envoie l'email
 * d'invitation au formateur. Idempotent côté token : si le token existait
 * déjà, on le réutilise (mais l'email est tout de même renvoyé).
 */
export async function activateTrainerPortal(
  trainerId: string,
): Promise<{
  ok: boolean;
  token?: string;
  emailSent?: boolean;
  emailError?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const trainer = await loadTrainerInfo(supabase, trainerId);
    if (!trainer) return { ok: false, error: "Formateur introuvable." };

    const { token } = await getOrCreateTrainerPortalToken(supabase, trainerId);
    const origin = await getAppOrigin();
    const portalUrl = buildTrainerPortalUrl(origin, token);

    const emailRes = await sendInvitationEmail({
      trainerId,
      trainer,
      portalUrl,
    });

    revalidatePath(`/formateurs/${trainerId}`);
    return {
      ok: true,
      token,
      emailSent: emailRes.ok,
      emailError: emailRes.ok ? undefined : emailRes.error,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur inconnue",
    };
  }
}

/**
 * Renvoie l'email d'invitation pour le token existant. Aucun token créé
 * si le portail n'a pas été activé (renvoie une erreur).
 */
export async function resendTrainerPortalInvitation(
  trainerId: string,
): Promise<{ ok: boolean; emailError?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const trainer = await loadTrainerInfo(supabase, trainerId);
    if (!trainer) return { ok: false, error: "Formateur introuvable." };

    const existing = await getTrainerPortalToken(supabase, trainerId);
    if (!existing) {
      return {
        ok: false,
        error: "Le portail n'est pas activé pour ce formateur.",
      };
    }
    const origin = await getAppOrigin();
    const portalUrl = buildTrainerPortalUrl(origin, existing.token);

    const emailRes = await sendInvitationEmail({
      trainerId,
      trainer,
      portalUrl,
    });

    revalidatePath(`/formateurs/${trainerId}`);
    if (!emailRes.ok) {
      return { ok: false, emailError: emailRes.error };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur inconnue",
    };
  }
}

/**
 * Révoque le token portail formateur. L'ancien lien cesse de fonctionner.
 * Pas d'email de notification (calque le comportement partenaire).
 */
export async function revokeTrainerPortal(
  trainerId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await deleteTrainerPortalToken(supabase, trainerId);
    revalidatePath(`/formateurs/${trainerId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur inconnue",
    };
  }
}
