"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

/**
 * Bouton d'impression de la preuve Qualiopi (quiz pré/post).
 * Le titre du document est posé comme nom de fichier suggéré dans la
 * boîte « Enregistrer en PDF » du navigateur.
 */
export function PrintButton({ documentTitle }: { documentTitle?: string }) {
  useEffect(() => {
    if (documentTitle) document.title = documentTitle;
  }, [documentTitle]);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-md text-sm font-semibold hover:bg-cyan-700"
    >
      <Printer className="h-4 w-4" />
      Imprimer / Enregistrer en PDF
    </button>
  );
}
