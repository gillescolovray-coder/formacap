"use client";

import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";

/**
 * Toggle pour afficher / masquer les outils d'émargement de secours
 * (grille signature au doigt sur PC + envoi lien par email).
 *
 * Par défaut le formateur ne voit QUE le QR code en haut (méthode
 * recommandée). Il coche cette case pour révéler les outils de secours
 * uniquement quand il en a besoin (Gilles 2026-05-24).
 */
export function SecondaryToolsToggle({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <label
        className={
          "flex items-start gap-3 rounded-xl border-2 p-3 sm:p-4 cursor-pointer transition select-none " +
          (open
            ? "bg-zinc-50 border-zinc-300"
            : "bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50")
        }
      >
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => setOpen(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-cyan-600 cursor-pointer shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
            <Settings2 className="h-4 w-4 text-zinc-500" />
            Afficher les autres outils d&apos;émargement
            <ChevronDown
              className={
                "h-4 w-4 text-zinc-400 transition-transform ml-auto " +
                (open ? "rotate-180" : "")
              }
            />
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Cas particuliers — à utiliser uniquement si le QR code ne
            convient pas :
            <br />
            <strong>•</strong> grille de signature au doigt sur votre PC
            (apprenant qui ne peut pas scanner)
            <br />
            <strong>•</strong> envoi d&apos;un lien par email à
            l&apos;apprenant (signature à distance, valable 30 jours)
          </p>
        </div>
      </label>
      {open && <div className="space-y-4">{children}</div>}
    </div>
  );
}
