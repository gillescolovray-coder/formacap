/**
 * Helpers serveur pour les tokens d'émargement par session (QR code).
 * Un token unique par session permet à n'importe quel apprenant de
 * scanner et accéder à la page publique d'émargement, où il choisit
 * son nom dans la liste et signe.
 */
"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Récupère le token actif (non expiré) de la session, ou en crée un
 * nouveau si aucun n'existe / si tous sont expirés. Date d'expiration
 * = fin de session + 7 jours (laisse le formateur le temps de finaliser
 * les signatures même après la dernière journée).
 *
 * Renvoie le token brut. L'URL publique se construit avec
 * `${origin}/emarger/${token}`.
 */
export async function getOrCreateSessionEmargementToken(
  sessionId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  // 1. Cherche un token actif
  const { data: existing } = await supabase
    .from("session_emargement_tokens")
    .select("token, expires_at")
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string; expires_at: string }>();
  if (existing?.token) {
    return { ok: true, token: existing.token };
  }

  // 2. Calcul expiration = end_date session + 7 jours
  const { data: session } = await supabase
    .from("sessions")
    .select("end_date")
    .eq("id", sessionId)
    .maybeSingle<{ end_date: string }>();
  if (!session) return { ok: false, error: "Session introuvable." };
  const endDate = new Date(session.end_date);
  endDate.setDate(endDate.getDate() + 7);
  // Si la fin de session est passée, on garde au moins 7 jours à partir
  // d'aujourd'hui pour ne pas créer un token déjà expiré.
  const minExpiry = new Date();
  minExpiry.setDate(minExpiry.getDate() + 7);
  const expiresAt = endDate > minExpiry ? endDate : minExpiry;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const token = generateToken();
  const { error } = await supabase
    .from("session_emargement_tokens")
    .insert({
      session_id: sessionId,
      token,
      expires_at: expiresAt.toISOString(),
      created_by: user?.id ?? null,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true, token };
}

/**
 * Récupère la session associée à un token PUBLIC (utilisé par la page
 * publique d'émargement). Pas d'auth requise — la possession du token
 * suffit. Renvoie null si token invalide ou expiré.
 *
 * Utilise un client Supabase normal (pas service role) parce que la
 * table session_emargement_tokens a un SELECT public via RLS… non en
 * fait elle n'a pas. On utilise donc le fait que la page publique
 * fait le requête, et que la RLS empêchera. Du coup il faut faire le
 * requête en service role OU exposer une lecture publique.
 *
 * On ouvre la lecture publique via la fonction RPC. Pour rester
 * simple ici, on fait le requête avec le client de session courant
 * (donc pas authentifié = pas autorisé).
 *
 * Solution finale : faire le requête via le client courant mais sans
 * RLS check sur la table token (== exposer SELECT public sur cette
 * table seule, qui ne contient que le token et l'expires_at).
 */
export async function resolveEmargementToken(
  supabase: SupabaseClient,
  token: string,
): Promise<
  | { ok: true; sessionId: string; expiresAt: string }
  | { ok: false; reason: "invalid" | "expired" }
> {
  const { data } = await supabase
    .from("session_emargement_tokens")
    .select("session_id, expires_at")
    .eq("token", token)
    .maybeSingle<{ session_id: string; expires_at: string }>();
  if (!data) return { ok: false, reason: "invalid" };
  if (new Date(data.expires_at) < new Date()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, sessionId: data.session_id, expiresAt: data.expires_at };
}
