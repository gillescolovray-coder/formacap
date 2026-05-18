"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
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
