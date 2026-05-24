/**
 * Helper centralisé : un formateur a-t-il accès à une session ?
 *
 * Règle métier (Gilles 2026-05-24) :
 * Accès autorisé si soit :
 *  - le formateur est le formateur principal (sessions.trainer_id)
 *  - le formateur intervient sur au moins un jour du planning détaillé
 *    (session_days.trainer_id)
 *
 * Utilisé par les pages portail formateur (détail session, émargement,
 * positionnement, imprimable, ICS) et par les server actions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function trainerHasAccessToSession(
  supabase: SupabaseClient,
  trainerId: string,
  sessionId: string,
  /** Si déjà connu (ex : la page a déjà chargé la session), on évite
   *  une requête. Si égal au trainerId, c'est OK immédiatement. */
  sessionMainTrainerId?: string | null,
): Promise<boolean> {
  if (sessionMainTrainerId === trainerId) return true;
  if (sessionMainTrainerId === undefined) {
    // Vérifier le formateur principal si pas déjà connu
    const { data: session } = await supabase
      .from("sessions")
      .select("trainer_id")
      .eq("id", sessionId)
      .maybeSingle<{ trainer_id: string | null }>();
    if (!session) return false;
    if (session.trainer_id === trainerId) return true;
  }
  // Vérifier sur session_days
  const { data: dayAssign } = await supabase
    .from("session_days")
    .select("id")
    .eq("session_id", sessionId)
    .eq("trainer_id", trainerId)
    .limit(1)
    .maybeSingle();
  return !!dayAssign;
}
