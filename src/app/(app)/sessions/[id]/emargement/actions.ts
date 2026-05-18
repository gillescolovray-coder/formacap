"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import type {
  AttendanceMoment,
  AttendanceStatus,
} from "@/lib/attendances/types";

export async function setAttendance(
  sessionId: string,
  enrollmentId: string,
  periodDate: string,
  moment: AttendanceMoment,
  formData: FormData,
) {
  const statusRaw = formData.get("status");
  const status =
    (typeof statusRaw === "string" ? statusRaw : "not_recorded") as AttendanceStatus;
  const noteRaw = formData.get("note");
  const note =
    typeof noteRaw === "string" && noteRaw.trim() !== ""
      ? noteRaw.trim()
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("attendances").upsert(
    {
      enrollment_id: enrollmentId,
      period_date: periodDate,
      moment,
      status,
      note,
      marked_by: user?.id ?? null,
    },
    { onConflict: "enrollment_id,period_date,moment" },
  );

  if (error) {
    console.error("setAttendance error:", error, {
      sessionId,
      enrollmentId,
      periodDate,
      moment,
    });
  }

  revalidatePath(`/sessions/${sessionId}/emargement`);
}

// ============================================================
// Signature à distance : génération de token + envoi email
// ============================================================

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export type SendSignatureLinkResult = {
  ok: boolean;
  error?: string;
  /** URL publique générée (pour l'admin qui pourrait copier-coller le lien). */
  publicUrl?: string;
};

/**
 * Crée un lien de signature à distance pour un apprenant et l'envoie par
 * email. Le lien expire après 30 jours et permet à l'apprenant de signer
 * chaque demi-journée éligible jusqu'à expiration.
 */
export async function sendSignatureLink(
  sessionId: string,
  enrollmentId: string,
): Promise<SendSignatureLinkResult> {
  const supabase = await createClient();

  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, email, civility), session:sessions(organization_id, formation:formations(title), start_date, end_date)",
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
        organization_id: string;
        formation: { title: string } | null;
        start_date: string;
        end_date: string;
      } | null;
    }>();

  if (!enrollment) return { ok: false, error: "Inscription introuvable." };
  if (!enrollment.learner?.email) {
    return {
      ok: false,
      error: "L'apprenant n'a pas d'adresse email renseignée.",
    };
  }
  if (!isResendConfigured()) {
    return {
      ok: false,
      error: "L'envoi automatique n'est pas configuré (Resend).",
    };
  }

  const token = generateToken();
  const { error: insertError } = await supabase.from("signature_links").insert({
    enrollment_id: enrollmentId,
    token,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  const origin = await getAppOrigin();
  const publicUrl = `${origin}/signer/${token}`;
  const learnerName = [
    enrollment.learner.first_name,
    enrollment.learner.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const formationTitle =
    enrollment.session?.formation?.title ?? "votre formation";

  const orgId = enrollment.session?.organization_id ?? null;
  const { data: org } = orgId
    ? await supabase
        .from("organizations")
        .select("name, email")
        .eq("id", orgId)
        .maybeSingle<{ name: string; email: string | null }>()
    : { data: null };
  const orgName = org?.name ?? "Notre organisme";

  const subject = `Signature de votre feuille d'émargement — ${formationTitle}`;
  const html = `
    <p>Bonjour ${enrollment.learner.civility ?? ""} ${learnerName},</p>
    <p>Pour finaliser le suivi administratif de votre formation
    <strong>« ${formationTitle} »</strong>, merci de bien vouloir signer
    votre feuille d'émargement en cliquant sur le lien ci-dessous :</p>
    <p style="margin: 24px 0;">
      <a href="${publicUrl}"
         style="display:inline-block;background:#1e40af;color:white;
                text-decoration:none;padding:12px 24px;border-radius:8px;
                font-weight:bold;">
        Signer ma feuille d'émargement
      </a>
    </p>
    <p>Ce lien est strictement personnel et restera valable pendant 30 jours.</p>
    <p>Bien cordialement,<br/><strong>${orgName}</strong></p>
  `;
  const text = `Bonjour ${learnerName},\n\nMerci de signer votre feuille d'émargement à l'adresse suivante :\n${publicUrl}\n\nLien valable 30 jours.\n\nCordialement,\n${orgName}`;

  const result = await sendEmail({
    to: enrollment.learner.email,
    toName: learnerName,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
  });

  await supabase.from("email_log").insert({
    organization_id: orgId,
    enrollment_id: enrollmentId,
    type: "signature_link",
    to_email: enrollment.learner.email,
    to_name: learnerName,
    subject,
    status: result.ok ? "sent" : "failed",
    provider: "resend",
    provider_id: result.ok ? result.providerId : null,
    error: result.ok ? null : result.error,
    sent_at: result.ok ? new Date().toISOString() : null,
  });

  revalidatePath(`/sessions/${sessionId}/emargement`);

  if (!result.ok) {
    return { ok: false, error: result.error, publicUrl };
  }
  return { ok: true, publicUrl };
}

// ============================================================
// QR code session : token couvrant toute la session pour signature
// publique (un apprenant scanne, choisit son nom, signe).
// ============================================================

export type SessionQrTokenResult = {
  ok: boolean;
  error?: string;
  /** URL publique à encoder dans le QR code. */
  publicUrl?: string;
  /** Token brut (utile pour debug / copier-coller). */
  token?: string;
  /** Date d'expiration ISO (pour afficher à l'utilisateur). */
  expiresAt?: string;
};

/**
 * Renvoie le token QR actif de la session si présent et non expiré,
 * sinon en crée un nouveau. Calcule la date d'expiration depuis la
 * fin de session + N jours (paramètre organisation
 * `emargement_token_ttl_days`).
 *
 * Pour rafraîchir/régénérer, utiliser `regenerateSessionQrToken`.
 */
export async function getOrCreateSessionQrToken(
  sessionId: string,
): Promise<SessionQrTokenResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  const { data: session } = await supabase
    .from("sessions")
    .select("id, organization_id, end_date")
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      end_date: string;
    }>();
  if (!session) return { ok: false, error: "Session introuvable." };

  // Cherche un token encore valide
  const { data: existing } = await supabase
    .from("session_emargement_tokens")
    .select("token, expires_at")
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string; expires_at: string }>();

  const origin = await getAppOrigin();

  if (existing) {
    return {
      ok: true,
      token: existing.token,
      publicUrl: `${origin}/emarger/${existing.token}`,
      expiresAt: existing.expires_at,
    };
  }

  // Lit la durée TTL paramétrée sur l'organisation
  const { data: org } = await supabase
    .from("organizations")
    .select("emargement_token_ttl_days")
    .eq("id", session.organization_id)
    .maybeSingle<{ emargement_token_ttl_days: number | null }>();
  const ttlDays = org?.emargement_token_ttl_days ?? 7;

  // Expire à fin de session + TTL jours
  const endDate = new Date(session.end_date);
  endDate.setHours(23, 59, 59, 999);
  const expiresAt = new Date(
    endDate.getTime() + ttlDays * 24 * 60 * 60 * 1000,
  );

  const token = generateToken();
  const { error: insertError } = await supabase
    .from("session_emargement_tokens")
    .insert({
      session_id: sessionId,
      token,
      expires_at: expiresAt.toISOString(),
      created_by: user.id,
    });
  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return {
    ok: true,
    token,
    publicUrl: `${origin}/emarger/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Force la création d'un nouveau token : expire d'abord tous les
 * tokens actifs de la session, puis crée un nouveau. Utile si
 * l'OF veut invalider l'ancien QR code (ex: ancien QR diffusé
 * par erreur).
 */
export async function regenerateSessionQrToken(
  sessionId: string,
): Promise<SessionQrTokenResult> {
  const supabase = await createClient();

  // Expire les tokens actifs (on garde l'historique en BDD)
  await supabase
    .from("session_emargement_tokens")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString());

  const result = await getOrCreateSessionQrToken(sessionId);
  if (result.ok) {
    revalidatePath(`/sessions/${sessionId}/emargement`);
  }
  return result;
}
