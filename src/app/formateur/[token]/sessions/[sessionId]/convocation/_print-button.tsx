"use client";

import { Printer } from "lucide-react";

/** Bouton d'impression de la convocation formateur (Gilles 2026-06-19). */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
    >
      <Printer className="h-4 w-4" />
      Imprimer
    </button>
  );
}
