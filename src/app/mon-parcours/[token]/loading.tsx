/**
 * Ecran d'attente du portail apprenant principal. Affiche par Next.js
 * pendant que /mon-parcours/[token]/page.tsx charge (token -> enrollment
 * + session + documents + tentatives + etc.).
 *
 * Gilles 2026-05-27 retour terrain.
 */
import { Loader2 } from "lucide-react";

export default function MonParcoursLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-white flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-cyan-100">
          <Loader2 className="h-8 w-8 text-cyan-700 animate-spin" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-zinc-900">
            Chargement de votre espace…
          </h1>
          <p className="text-sm text-zinc-600">
            Préparation de vos modules (positionnement, émargement, quiz,
            supports).
          </p>
        </div>
      </div>
    </div>
  );
}
