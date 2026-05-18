"use client";

import { Printer } from "lucide-react";

/**
 * Bouton "Imprimer / Télécharger en PDF" pour le certificat.
 * Utilise window.print() — l'apprenant peut choisir "Sauvegarder en PDF"
 * dans le dialogue d'impression natif du navigateur.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
    >
      <Printer className="h-4 w-4" />
      Imprimer / Sauvegarder en PDF
    </button>
  );
}
