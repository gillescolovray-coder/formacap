"use client";

import { Printer } from "lucide-react";

/**
 * Bouton "Imprimer" pour la page de detail quiz par apprenant
 * (Gilles 2026-05-28). Declenche window.print() — un CSS @media print
 * dans la page masque la sidebar, le header et le bouton lui-meme
 * pour rendre une feuille A4 propre.
 */
export function PrintQuizDetailButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-300 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 shadow-sm"
    >
      <Printer className="h-4 w-4" />
      Imprimer
    </button>
  );
}
