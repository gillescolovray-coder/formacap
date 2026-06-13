"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

/** Bouton d'impression de la preuve Qualiopi (évaluation à chaud). */
export function PrintButton({ documentTitle }: { documentTitle?: string }) {
  useEffect(() => {
    if (documentTitle) document.title = documentTitle;
  }, [documentTitle]);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-md text-sm font-semibold hover:bg-pink-700"
    >
      <Printer className="h-4 w-4" />
      Imprimer / Enregistrer en PDF
    </button>
  );
}
