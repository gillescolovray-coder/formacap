/**
 * Ecran d'attente affiche INSTANTANEMENT par Next.js pendant que la
 * page /mon-parcours/[token]/quiz se charge cote serveur (chargement
 * du quiz, questions et tentatives existantes).
 *
 * Gilles 2026-05-27 : retour terrain — sans cet ecran, l'apprenant
 * attendait jusqu'a 3 secondes sans aucun feedback visuel apres son
 * clic, ce qui faisait croire que l'app ne reagissait pas.
 */
import { Loader2 } from "lucide-react";

export default function QuizLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-violet-100">
          <Loader2 className="h-8 w-8 text-violet-700 animate-spin" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-zinc-900">
            Préparation de votre quiz…
          </h1>
          <p className="text-sm text-zinc-600">
            Quelques secondes le temps de charger les questions et votre
            progression.
          </p>
        </div>
      </div>
    </div>
  );
}
