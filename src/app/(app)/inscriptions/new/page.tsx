import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createDraftInscription } from "../actions";

/**
 * Route `/inscriptions/new` — refactor 2026-05-13 :
 *
 * Au lieu d'afficher un formulaire dédié (qui différait visuellement
 * de la fiche détail et empêchait le bloc OPCO d'apparaître à la
 * volée), cette route crée immédiatement un BROUILLON
 * d'inscription_request vide et redirige l'utilisateur vers la fiche
 * détail avec le marqueur `?fresh=1`.
 *
 * Avantages :
 *   - UNE seule méthode de saisie (la fiche détail), peu importe si
 *     on crée ou si on édite.
 *   - Le panneau « Accords de financement OPCO » apparaît instantanément
 *     dès qu'OPCO est sélectionné dans le mode de financement.
 *   - L'upload PDF + extraction OCR est fonctionnel dès le premier
 *     instant (la fiche existe en BDD donc on peut y lier un accord).
 *
 * Le bouton « Annuler » de la fiche détail (quand `?fresh=1`) supprimera
 * le brouillon. Si l'utilisateur quitte sans rien faire, le brouillon
 * reste en BDD (vide) — à nettoyer plus tard via un cron si nécessaire.
 */
export default async function NewInscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{
    session_id?: string;
    parcours_id?: string;
    formation_id?: string;
    return_to?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;

  // Création du brouillon avec les éventuels paramètres de cible
  // (session/parcours/formation pré-sélectionnés). On lui passe aussi
  // un return_to pour que la fiche détail sache où renvoyer l'utilisateur
  // après save ou annulation.
  const draftId = await createDraftInscription({
    sessionId: params.session_id ?? null,
    parcoursId: params.parcours_id ?? null,
    formationId: params.formation_id ?? null,
  });

  const queryParts: string[] = ["fresh=1"];
  if (params.return_to) {
    queryParts.push(`return_to=${encodeURIComponent(params.return_to)}`);
  }
  if (params.session_id) {
    queryParts.push(`session_id=${encodeURIComponent(params.session_id)}`);
  }
  redirect(`/inscriptions/${draftId}?${queryParts.join("&")}`);
}
