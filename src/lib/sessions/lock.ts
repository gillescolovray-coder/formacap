import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verrou « session clôturée » (Gilles 2026-06-13).
 *
 * Quand une session a `admin_closed_at` renseigné (case « Clôturé » cochée
 * dans la colonne Dossier), TOUTE MODIFICATION de la session ou de ses enfants
 * (participants, émargement, montants/OPCO…) est REFUSÉE côté serveur.
 * La consultation et l'impression/envoi de documents restent autorisés.
 *
 * Exception : l'action qui DÉCOCHE la clôture (`toggleSessionAdminClosed`)
 * ne doit PAS utiliser ce garde-fou.
 */
export const SESSION_CLOSED_MESSAGE =
  "Session clôturée : décochez « Clôturé » (colonne Dossier de la liste des sessions) pour pouvoir la modifier.";

/** Vrai si la session est clôturée administrativement. */
export async function isSessionAdminClosed(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<boolean> {
  if (!sessionId) return false;
  const { data } = await supabase
    .from("sessions")
    .select("admin_closed_at")
    .eq("id", sessionId)
    .maybeSingle<{ admin_closed_at: string | null }>();
  return Boolean(data?.admin_closed_at);
}

/**
 * Garde-fou pour une action qui modifie une session.
 * Retourne `{ ok:false, error }` si la session est clôturée.
 */
export async function assertSessionEditable(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isSessionAdminClosed(supabase, sessionId)) {
    return { ok: false, error: SESSION_CLOSED_MESSAGE };
  }
  return { ok: true };
}

/**
 * Variante pour les actions rattachées à une INSCRIPTION : résout la session
 * cible (`inscription_requests.target_session_id`) puis vérifie le verrou.
 */
export async function assertInscriptionSessionEditable(
  supabase: SupabaseClient,
  inscriptionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!inscriptionId) return { ok: true };
  const { data } = await supabase
    .from("inscription_requests")
    .select("target_session_id")
    .eq("id", inscriptionId)
    .maybeSingle<{ target_session_id: string | null }>();
  const sid = data?.target_session_id ?? null;
  if (!sid) return { ok: true };
  return assertSessionEditable(supabase, sid);
}
