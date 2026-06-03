/**
 * Helper partage pour recuperer/creer le token portail apprenant
 * (1 token par learner, persistant).
 *
 * Utilise par :
 *  - l envoi de l email d attestation (lien vers le portail apprenant)
 *  - le bouton admin "Generer/copier le lien portail apprenant" sur la
 *    fiche apprenant
 *
 * Pas d expiration : le portail reste consultable a vie tant que le
 * learner existe (preuve Qualiopi).
 *
 * Pattern identique a getOrCreateEnrollmentPortalToken.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type LearnerPortalToken = {
  token: string;
  createdAt: string;
};

/**
 * Renvoie le token portail de l apprenant, en le creant si necessaire.
 * Idempotent : appele plusieurs fois -> renvoie toujours le meme token.
 */
export async function getOrCreateLearnerPortalToken(
  supabase: SupabaseClient,
  learnerId: string,
): Promise<LearnerPortalToken> {
  const { data: existing } = await supabase
    .from("learner_portal_tokens")
    .select("token, created_at")
    .eq("learner_id", learnerId)
    .maybeSingle<{ token: string; created_at: string }>();
  if (existing) {
    return { token: existing.token, createdAt: existing.created_at };
  }

  const token = generateToken();
  const { data: inserted, error } = await supabase
    .from("learner_portal_tokens")
    .insert({ learner_id: learnerId, token })
    .select("token, created_at")
    .maybeSingle<{ token: string; created_at: string }>();

  if (error || !inserted) {
    const { data: retry } = await supabase
      .from("learner_portal_tokens")
      .select("token, created_at")
      .eq("learner_id", learnerId)
      .maybeSingle<{ token: string; created_at: string }>();
    if (retry) {
      return { token: retry.token, createdAt: retry.created_at };
    }
    throw new Error(
      `Impossible de creer le token portail pour l apprenant ${learnerId}: ${error?.message ?? "inconnu"}`,
    );
  }

  return { token: inserted.token, createdAt: inserted.created_at };
}

/**
 * Construit l URL publique du portail apprenant.
 */
export function buildLearnerPortalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/apprenant/${token}`;
}
