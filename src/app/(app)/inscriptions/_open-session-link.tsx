"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

/**
 * Bouton "Ouvrir la session" rendu dans le <summary> d'un <details>.
 *
 * Sans ce composant client, cliquer sur le lien à l'intérieur d'un
 * <summary> déclenche aussi le toggle du <details> — comportement
 * confus pour l'utilisateur. On stoppe la propagation ici.
 */
export function OpenSessionLink({ sessionId }: { sessionId: string }) {
  return (
    <Link
      href={`/sessions/${sessionId}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:border-cyan-400 hover:text-cyan-700 hover:bg-cyan-50 transition-colors"
      title="Ouvrir la fiche complète de la session"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Ouvrir la session
    </Link>
  );
}
