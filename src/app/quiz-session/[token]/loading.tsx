/**
 * Ecran d'attente affiche INSTANTANEMENT pendant que la page publique
 * /quiz-session/[token] se charge (resolution token -> session +
 * liste des inscrits + statut des tentatives).
 *
 * Gilles 2026-05-27.
 */
import { Loader2 } from "lucide-react";

export default function QuizSessionLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-amber-100">
          <Loader2 className="h-8 w-8 text-amber-700 animate-spin" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-zinc-900">
            Chargement de la liste…
          </h1>
          <p className="text-sm text-zinc-600">
            Préparation des apprenants inscrits à cette session.
          </p>
        </div>
      </div>
    </div>
  );
}
