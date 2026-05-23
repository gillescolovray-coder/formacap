/**
 * Helper : récupère ou crée le token portail formateur (1 par
 * `trainers.id`). Persistant à vie. Utilisé par :
 *  - l'envoi de convocation formateur (lien dans l'email)
 *  - la fiche formateur côté admin (bouton "Voir le portail")
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TrainerPortalToken = {
  token: string;
  createdAt: string;
};

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Lecture seule du token portail formateur. Renvoie null si pas de token
 * (= le portail n'a pas été activé par un admin pour ce formateur).
 *
 * À utiliser dans les flows où on ne veut PAS créer un token sans
 * activation explicite (ex: lien dans la convocation formateur depuis
 * 2026-05-23 : on n'envoie le lien que si l'admin a activé le portail).
 */
export async function getTrainerPortalToken(
  supabase: SupabaseClient,
  trainerId: string,
): Promise<TrainerPortalToken | null> {
  const { data } = await supabase
    .from("trainer_portal_tokens")
    .select("token, created_at")
    .eq("trainer_id", trainerId)
    .maybeSingle<{ token: string; created_at: string }>();
  if (!data) return null;
  return { token: data.token, createdAt: data.created_at };
}

/**
 * Supprime le token portail formateur (révocation par l'admin).
 * L'ancien lien portail cesse aussitôt de fonctionner.
 */
export async function deleteTrainerPortalToken(
  supabase: SupabaseClient,
  trainerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("trainer_portal_tokens")
    .delete()
    .eq("trainer_id", trainerId);
  if (error) {
    throw new Error(
      `Impossible de révoquer le token portail formateur ${trainerId}: ${error.message}`,
    );
  }
}

export async function getOrCreateTrainerPortalToken(
  supabase: SupabaseClient,
  trainerId: string,
): Promise<TrainerPortalToken> {
  const { data: existing } = await supabase
    .from("trainer_portal_tokens")
    .select("token, created_at")
    .eq("trainer_id", trainerId)
    .maybeSingle<{ token: string; created_at: string }>();
  if (existing) {
    return { token: existing.token, createdAt: existing.created_at };
  }

  const token = generateToken();
  const { data: inserted, error } = await supabase
    .from("trainer_portal_tokens")
    .insert({ trainer_id: trainerId, token })
    .select("token, created_at")
    .maybeSingle<{ token: string; created_at: string }>();

  if (error || !inserted) {
    const { data: retry } = await supabase
      .from("trainer_portal_tokens")
      .select("token, created_at")
      .eq("trainer_id", trainerId)
      .maybeSingle<{ token: string; created_at: string }>();
    if (retry) {
      return { token: retry.token, createdAt: retry.created_at };
    }
    throw new Error(
      `Impossible de créer le token portail formateur ${trainerId}: ${error?.message ?? "inconnu"}`,
    );
  }
  return { token: inserted.token, createdAt: inserted.created_at };
}

export function buildTrainerPortalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/formateur/${token}`;
}
