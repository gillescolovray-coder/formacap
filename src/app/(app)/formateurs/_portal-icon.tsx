"use client";

import { GraduationCap } from "lucide-react";

type Props = {
  /** Token portail formateur. null si le portail n'est pas activé. */
  token: string | null;
};

/**
 * Icône "Accès portail formateur" dans la liste admin (/formateurs).
 *
 * Gilles 2026-05-24 :
 * - icône verte si portail activé → double-clic ouvre /formateur/<token>
 *   dans un nouvel onglet
 * - icône grisée si portail non activé (info visuelle seulement)
 *
 * Le double-clic (au lieu d'un simple clic) évite l'ouverture
 * accidentelle quand on parcourt le tableau à la souris.
 */
export function PortalIcon({ token }: Props) {
  const active = !!token;

  if (!active) {
    return (
      <span
        className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-zinc-50 text-zinc-300 cursor-not-allowed"
        title="Portail non activé pour ce formateur — activez-le depuis sa fiche"
        aria-label="Portail non activé"
      >
        <GraduationCap className="h-4 w-4" />
      </span>
    );
  }

  const url = `/formateur/${token}`;

  function openPortal() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onDoubleClick={openPortal}
      onClick={(e) => {
        // Empêche le clic simple de propager (sinon focus = sélection
        // de la ligne). Mais ne navigue pas non plus — double-clic
        // explicitement demandé par Gilles 2026-05-24.
        e.stopPropagation();
      }}
      className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
      title="Portail activé · Double-cliquez pour ouvrir dans un nouvel onglet"
      aria-label="Ouvrir le portail formateur (double-clic)"
    >
      <GraduationCap className="h-4 w-4" />
    </button>
  );
}
