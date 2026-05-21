import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supprime les brouillons d'inscription_request VIDES (aucune donnée
 * saisie) créés par l'utilisateur courant et plus vieux que `minAgeSeconds`.
 *
 * Un brouillon est "vide" si TOUS ces champs sont NULL :
 *   - learner_id
 *   - prospect_first_name
 *   - prospect_last_name
 *   - prospect_email
 *   - prospect_phone
 *   - quote_amount_ht
 *
 * Le buffer d'âge évite de supprimer un brouillon en cours de saisie
 * (utile si plusieurs onglets sont ouverts).
 *
 * Corrige le bug 2026-05-21 (Gilles) : "si je commande a inscrire une
 * personne et que j'arrete en cours d'inscription cela créé automatique
 * une inscription a vide".
 *
 * À appeler :
 *   - dans `createDraftInscription` (avant de créer un nouveau brouillon)
 *   - au chargement de `/sessions/[id]/participants` (consultation)
 *   - au chargement de `/inscriptions` (consultation)
 */
export async function cleanupUserEmptyDrafts(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  minAgeSeconds: number = 30,
): Promise<void> {
  const cutoff = new Date(Date.now() - minAgeSeconds * 1000).toISOString();
  await supabase
    .from("inscription_requests")
    .delete()
    .eq("organization_id", organizationId)
    .eq("created_by", userId)
    .is("learner_id", null)
    .is("prospect_first_name", null)
    .is("prospect_last_name", null)
    .is("prospect_email", null)
    .is("prospect_phone", null)
    .is("quote_amount_ht", null)
    .lt("received_at", cutoff);
}
