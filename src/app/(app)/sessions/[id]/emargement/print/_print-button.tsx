"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

export function PrintButton({ documentTitle }: { documentTitle?: string }) {
  // Set le title du document => suggere comme nom de fichier dans
  // la boite "Enregistrer en PDF" du navigateur (Gilles 2026-06-01).
  useEffect(() => {
    if (documentTitle) {
      document.title = documentTitle;
    }
  }, [documentTitle]);

  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-md text-sm hover:bg-zinc-800"
    >
      <Printer className="h-4 w-4" />
      Imprimer cette feuille
    </button>
  );
}
