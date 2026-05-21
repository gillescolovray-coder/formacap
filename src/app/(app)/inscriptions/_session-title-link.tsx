"use client";

import Link from "next/link";

/**
 * Titre de session cliquable dans le summary du <details>.
 *
 * Stoppe la propagation du clic pour que le summary ne toggle pas
 * le pli/dépli (Gilles 2026-05-21 : seul le chevron en debut de ligne
 * doit gerer le repli/dépli, le titre doit naviguer vers la fiche).
 */
export function SessionTitleLink({
  sessionId,
  title,
  className,
}: {
  sessionId: string;
  title: string;
  className?: string;
}) {
  return (
    <Link
      href={`/sessions/${sessionId}`}
      onClick={(e) => e.stopPropagation()}
      className={className}
      title="Ouvrir la fiche session"
    >
      {title}
    </Link>
  );
}
