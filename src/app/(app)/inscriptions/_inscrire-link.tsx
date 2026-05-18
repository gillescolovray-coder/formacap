"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";

type Props = {
  sessionId: string;
};

/**
 * Lien "Inscrire un apprenant à cette session" qui n'ouvre/ferme pas
 * le <details> parent (stopPropagation).
 */
export function InscrireLink({ sessionId }: Props) {
  return (
    <Link
      href={`/inscriptions/new?session_id=${sessionId}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-600 text-white text-xs font-bold border border-cyan-600 hover:bg-cyan-700 transition-colors"
      title="Inscrire un apprenant à cette session"
    >
      <UserPlus className="h-3 w-3" />
      Inscrire
    </Link>
  );
}
