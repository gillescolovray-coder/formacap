/**
 * Helper : récupère ou crée le token portail partenaire (1 par
 * `companies.id`, persistant à vie). Utilisé par :
 *  - le bloc « Portail partenaire » de la fiche entreprise (admin)
 *  - les pages /partenaire/<token> (côté partenaire OF/prescripteur)
 *
 * Pattern identique à `trainer-token.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PartnerPortalToken = {
  token: string;
  createdAt: string;
};

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getOrCreatePartnerPortalToken(
  supabase: SupabaseClient,
  companyId: string,
): Promise<PartnerPortalToken> {
  const { data: existing } = await supabase
    .from("partner_portal_tokens")
    .select("token, created_at")
    .eq("company_id", companyId)
    .maybeSingle<{ token: string; created_at: string }>();
  if (existing) {
    return { token: existing.token, createdAt: existing.created_at };
  }

  const token = generateToken();
  const { data: inserted, error } = await supabase
    .from("partner_portal_tokens")
    .insert({ company_id: companyId, token })
    .select("token, created_at")
    .maybeSingle<{ token: string; created_at: string }>();

  if (error || !inserted) {
    // Race condition possible : re-read
    const { data: retry } = await supabase
      .from("partner_portal_tokens")
      .select("token, created_at")
      .eq("company_id", companyId)
      .maybeSingle<{ token: string; created_at: string }>();
    if (retry) {
      return { token: retry.token, createdAt: retry.created_at };
    }
    throw new Error(
      `Impossible de créer le token portail partenaire ${companyId}: ${error?.message ?? "inconnu"}`,
    );
  }
  return { token: inserted.token, createdAt: inserted.created_at };
}

export function buildPartnerPortalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/partenaire/${token}`;
}

/** Résout un token vers la company correspondante (pour les routes publiques). */
export async function resolvePartnerToken(
  supabase: SupabaseClient,
  token: string,
): Promise<{ companyId: string } | null> {
  const { data } = await supabase
    .from("partner_portal_tokens")
    .select("company_id")
    .eq("token", token)
    .maybeSingle<{ company_id: string }>();
  if (!data) return null;
  return { companyId: data.company_id };
}
