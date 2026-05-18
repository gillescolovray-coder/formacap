/**
 * Helper partagé pour récupérer/créer le token portail d'une
 * inscription (1 token par enrollment, persistant).
 *
 * Utilisé par :
 *  - la génération du PDF convocation (pour générer le QR code)
 *  - l'envoi de l'email convocation (pour mettre le lien "Cliquez ici")
 *
 * Pas d'expiration : le portail reste consultable à vie tant que
 * l'inscription existe (preuve Qualiopi).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type EnrollmentPortalToken = {
  token: string;
  createdAt: string;
};

/**
 * Renvoie le token portail de l'inscription, en le créant si nécessaire.
 * Idempotent : appelé plusieurs fois → renvoie toujours le même token.
 */
export async function getOrCreateEnrollmentPortalToken(
  supabase: SupabaseClient,
  enrollmentId: string,
): Promise<EnrollmentPortalToken> {
  // Existant ?
  const { data: existing } = await supabase
    .from("enrollment_portal_tokens")
    .select("token, created_at")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle<{ token: string; created_at: string }>();
  if (existing) {
    return { token: existing.token, createdAt: existing.created_at };
  }

  // Création
  const token = generateToken();
  const { data: inserted, error } = await supabase
    .from("enrollment_portal_tokens")
    .insert({ enrollment_id: enrollmentId, token })
    .select("token, created_at")
    .maybeSingle<{ token: string; created_at: string }>();

  if (error || !inserted) {
    // En cas de collision (rarissime mais possible), réessayer une fois
    const { data: retry } = await supabase
      .from("enrollment_portal_tokens")
      .select("token, created_at")
      .eq("enrollment_id", enrollmentId)
      .maybeSingle<{ token: string; created_at: string }>();
    if (retry) {
      return { token: retry.token, createdAt: retry.created_at };
    }
    throw new Error(
      `Impossible de créer le token portail pour l'inscription ${enrollmentId}: ${error?.message ?? "inconnu"}`,
    );
  }

  return { token: inserted.token, createdAt: inserted.created_at };
}

/**
 * Construit l'URL publique du portail à partir d'un token et d'un
 * origine (host). À appeler avec `getAppOrigin()` ou la valeur de
 * NEXT_PUBLIC_APP_URL.
 */
export function buildPortalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/mon-parcours/${token}`;
}
