/**
 * Client Supabase avec service_role : bypass RLS, accès total.
 *
 * ⚠️ À utiliser UNIQUEMENT côté serveur (server components, server
 * actions, route handlers). JAMAIS dans du code client — la service_role
 * key ne doit pas fuiter au navigateur.
 *
 * Usage : pages publiques qui n'ont pas d'auth utilisateur mais doivent
 * accéder à des données BDD (ex: /emarger/[token] où le token tient
 * lieu d'authentification).
 *
 * Requiert la variable d'environnement SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Service role client non configuré : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.",
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
