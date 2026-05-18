"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type SignAttendanceResult = {
  ok: boolean;
  error?: string;
  /** Date ISO de la signature pour mise à jour optimiste côté client. */
  signedAt?: string;
};

type SignParams = {
  token: string;
  enrollmentId: string;
  periodDate: string; // YYYY-MM-DD
  moment: "morning" | "afternoon";
  signerName: string;
  /** Image PNG signée, data URL "data:image/png;base64,..." */
  signatureDataUrl: string;
};

/**
 * Enregistre la signature d'un apprenant pour une demi-journée donnée.
 *
 * Sécurité : la possession du token vaut authentification (l'apprenant
 * n'a pas de compte). On vérifie :
 *  1. Le token existe et n'est pas expiré
 *  2. L'enrollment appartient bien à la session du token
 *  3. La date demandée est un jour de la session
 *
 * Une fois posée, la signature est figée (anti-fraude). Pour ressigner,
 * il faudrait passer par un admin qui supprime la ligne (action admin
 * future, hors Phase A).
 */
export async function signAttendancePublic(
  params: SignParams,
): Promise<SignAttendanceResult> {
  const {
    token,
    enrollmentId,
    periodDate,
    moment,
    signerName,
    signatureDataUrl,
  } = params;

  // Sanity checks
  if (!token || token.length < 32) {
    return { ok: false, error: "Lien d'émargement invalide." };
  }
  if (!enrollmentId || !periodDate) {
    return { ok: false, error: "Paramètres manquants." };
  }
  if (moment !== "morning" && moment !== "afternoon") {
    return { ok: false, error: "Demi-journée invalide." };
  }
  if (!signerName || signerName.trim().length < 2) {
    return { ok: false, error: "Nom du signataire manquant." };
  }
  if (!signatureDataUrl || !signatureDataUrl.startsWith("data:image/")) {
    return { ok: false, error: "Signature invalide." };
  }
  // Limite raisonnable pour éviter abus (PNG canvas ~30Ko en général)
  if (signatureDataUrl.length > 500_000) {
    return { ok: false, error: "Signature trop volumineuse." };
  }

  const supabase = createAdminClient();

  // 1. Valider le token
  const { data: tokenRow } = await supabase
    .from("session_emargement_tokens")
    .select("session_id, expires_at")
    .eq("token", token)
    .maybeSingle<{ session_id: string; expires_at: string }>();
  if (!tokenRow) {
    return { ok: false, error: "Lien d'émargement introuvable." };
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return { ok: false, error: "Ce lien d'émargement a expiré." };
  }

  // 2. Valider que l'enrollment appartient à la session du token
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select("id, session_id")
    .eq("id", enrollmentId)
    .maybeSingle<{ id: string; session_id: string }>();
  if (!enrollment || enrollment.session_id !== tokenRow.session_id) {
    return {
      ok: false,
      error: "Cet apprenant n'est pas inscrit à cette session.",
    };
  }

  // 3. Valider que la date demandée correspond à un jour de la session
  const { data: day } = await supabase
    .from("session_days")
    .select("day_date")
    .eq("session_id", tokenRow.session_id)
    .eq("day_date", periodDate)
    .maybeSingle<{ day_date: string }>();
  if (!day) {
    return { ok: false, error: "Cette date ne fait pas partie de la session." };
  }

  // 4. Vérifier qu'aucune signature n'existe déjà (anti-fraude : figée)
  const { data: existing } = await supabase
    .from("attendance_signatures")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("period_date", periodDate)
    .eq("moment", moment)
    .eq("signer_role", "learner")
    .maybeSingle<{ id: string }>();
  if (existing) {
    return {
      ok: false,
      error:
        "Une signature a déjà été posée pour cette demi-journée. Demandez à votre formateur si vous devez la modifier.",
    };
  }

  // 5. Récupérer IP + user agent pour traçabilité Qualiopi
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const userAgent = h.get("user-agent") ?? null;

  // 6. Insérer la signature
  const signedAt = new Date().toISOString();
  const { error: insertError } = await supabase
    .from("attendance_signatures")
    .insert({
      enrollment_id: enrollmentId,
      period_date: periodDate,
      moment,
      signer_role: "learner",
      signer_name: signerName.trim(),
      signature_data: signatureDataUrl,
      signed_ip: ip,
      signed_user_agent: userAgent,
      signed_at: signedAt,
    });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return { ok: true, signedAt };
}
