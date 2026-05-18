"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HotEvaluationData } from "@/lib/evaluations/hot";

export type SubmitEvaluationResult = {
  ok: boolean;
  error?: string;
  submittedAt?: string;
};

type SubmitParams = {
  token: string;
  enrollmentId: string;
  data: HotEvaluationData;
};

/**
 * Soumet une évaluation à chaud pour un apprenant.
 *
 * Sécurité : la possession du token vaut authentification. On
 * vérifie :
 *  1. Le token existe et n'est pas expiré
 *  2. L'enrollment appartient bien à la session du token
 *  3. L'apprenant n'a pas déjà soumis (unique constraint en BDD
 *     mais on retourne un message clair côté UI avant le INSERT)
 *
 * Extraction de `nps_score` + `satisfaction_overall` dans des
 * colonnes dédiées pour agrégation rapide (KPI Qualiopi).
 */
export async function submitEvaluation(
  params: SubmitParams,
): Promise<SubmitEvaluationResult> {
  const { token, enrollmentId, data } = params;

  // Sanity checks
  if (!token || token.length < 32) {
    return { ok: false, error: "Lien d'évaluation invalide." };
  }
  if (!enrollmentId) {
    return { ok: false, error: "Apprenant non identifié." };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Réponses manquantes." };
  }
  // Validations minimales : les champs OBLIGATOIRES de la V1
  if (!data.satisfaction_overall) {
    return { ok: false, error: "Veuillez indiquer votre niveau de satisfaction global." };
  }
  if (typeof data.nps_score !== "number" || data.nps_score < 0 || data.nps_score > 10) {
    return { ok: false, error: "Veuillez indiquer une note de recommandation entre 0 et 10." };
  }

  const supabase = createAdminClient();

  // 1. Valider le token
  const { data: tokenRow } = await supabase
    .from("session_evaluation_tokens")
    .select("session_id, expires_at")
    .eq("token", token)
    .maybeSingle<{ session_id: string; expires_at: string }>();
  if (!tokenRow) {
    return { ok: false, error: "Lien d'évaluation introuvable." };
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return { ok: false, error: "Ce lien d'évaluation a expiré." };
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

  // 3. Vérifier qu'il n'a pas déjà répondu
  const { data: existing } = await supabase
    .from("evaluation_responses")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("evaluation_type", "hot")
    .maybeSingle<{ id: string }>();
  if (existing) {
    return {
      ok: false,
      error:
        "Une évaluation a déjà été enregistrée pour cet apprenant. Merci !",
    };
  }

  // 4. Audit
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const userAgent = h.get("user-agent") ?? null;

  // 5. INSERT
  const submittedAt = new Date().toISOString();
  const { error: insertError } = await supabase
    .from("evaluation_responses")
    .insert({
      enrollment_id: enrollmentId,
      evaluation_type: "hot",
      data,
      nps_score: data.nps_score,
      satisfaction_overall: data.satisfaction_overall,
      submitted_at: submittedAt,
      submitted_ip: ip,
      submitted_user_agent: userAgent,
    });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return { ok: true, submittedAt };
}
