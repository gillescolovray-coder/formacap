"use client";

/**
 * Onglets de la page Émargement (Gilles 2026-05-22).
 *
 * 2 onglets sous les compteurs :
 *   1. ÉMARGEMENT ÉLECTRONIQUE (défaut) — flux principal recommandé :
 *      QR code session, signature à distance par email, suivi des
 *      signatures électroniques.
 *   2. AUTRES SIGNATURES — alternatives : grille manuelle de pointage
 *      (présent/absent/excusé/retard) + version imprimable papier.
 *
 * Les compteurs en haut restent visibles tout le temps. Seul le contenu
 * change.
 */

import { useState, type ReactNode } from "react";
import { Pen, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "electronique" | "autres";

export function EmargementTabs({
  electroniqueContent,
  autresContent,
}: {
  electroniqueContent: ReactNode;
  autresContent: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("electronique");

  return (
    <div className="space-y-4">
      {/* Barre d'onglets */}
      <div
        role="tablist"
        aria-label="Type d'émargement"
        className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 p-1 gap-1"
      >
        <TabButton
          isActive={activeTab === "electronique"}
          onClick={() => setActiveTab("electronique")}
          icon={<ScanLine className="h-4 w-4" />}
        >
          Émargement électronique
        </TabButton>
        <TabButton
          isActive={activeTab === "autres"}
          onClick={() => setActiveTab("autres")}
          icon={<Pen className="h-4 w-4" />}
        >
          Autres signatures
        </TabButton>
      </div>

      {/* Contenu de l'onglet actif */}
      <div>
        {activeTab === "electronique" ? electroniqueContent : autresContent}
      </div>
    </div>
  );
}

function TabButton({
  isActive,
  onClick,
  icon,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all",
        isActive
          ? "bg-white dark:bg-zinc-800 text-cyan-700 dark:text-cyan-300 shadow-sm border border-zinc-200 dark:border-zinc-700"
          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/60",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
