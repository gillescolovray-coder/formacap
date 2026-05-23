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
