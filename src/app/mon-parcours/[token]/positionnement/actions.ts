"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PositioningLearnerData } from "@/lib/positioning/types";

export type SubmitPositioningResult = {
  ok: boolean;
  error?: string;
  submittedAt?: string;
};

/**
 * Soumet le test de positionnement d'un apprenant. Authentifié par
 * le token portail apprenant.
 *
 * Une seule soumission par apprenant (contrainte unique BDD). Si
 * déjà soumis, on retourne une erreur claire.
 */
export async function submitPositioning(params: {
  portalToken: string;
  data: PositioningLearnerData;
  signatureDataUrl?: string | null;
}): Promise<SubmitPositioningResult> {
  const { portalToken, data, signatureDataUrl } = params;

  if (!portalToken || portalToken.length < 32) {
    return { ok: false, error: "Lien invalide." };
  }
  if (!data || !data.current_level || !data.practice_frequency) {
    return { ok: false, error: "Veuillez compléter la section 1." };
  }
  if (
    signatureDataUrl &&
    (!signatureDataUrl.startsWith("data:image/") ||
      signatureDataUrl.length > 500_000)
  ) {
    return { ok: false, error: "Signature invalide." };
  }

  const supabase = createAdminClient();

  // Token → enrollment
  const { data: portalRow } = await supabase
    .from("enrollment_portal_tokens")
    .select("enrollment_id")
    .eq("token", portalToken)
    .maybeSingle<{ enrollment_id: string }>();
  if (!portalRow) {
    return { ok: false, error: "Lien introuvable." };
  }
  const enrollmentId = portalRow.enrollment_id;

  // Vérifier qu'il n'y a pas déjà une réponse
  const { data: existing } = await supabase
    .from("positioning_responses")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return {
      ok: false,
      error: "Vous avez déjà rempli votre test de positionnement. Merci !",
    };
  }

  // Audit
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const userAgent = h.get("user-agent") ?? null;

  const submittedAt = new Date().toISOString();
  const { error: insertError } = await supabase
    .from("positioning_responses")
    .insert({
      enrollment_id: enrollmentId,
      data,
      learner_signature: signatureDataUrl ?? null,
      learner_submitted_at: submittedAt,
      submitted_ip: ip,
      submitted_user_agent: userAgent,
    });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return { ok: true, submittedAt };
}
