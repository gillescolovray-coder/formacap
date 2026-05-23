"use client";

import { useState, type ReactNode } from "react";
import { PenTool, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  electroniqueContent: ReactNode;
  manuelContent: ReactNode;
};

/**
 * Onglets émargement côté portail formateur.
 * - "Émargement électronique" : signatures + QR + envoi distanciel
 * - "Pointage manuel" : présent/absent/excusé/retard + imprimable
 *
 * Mobile-first : icônes visibles, libellés tronqués en xs.
 */
export function EmargementTabs({ electroniqueContent, manuelContent }: Props) {
  const [active, setActive] = useState<"electronique" | "manuel">("electronique");

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800"
      >
        <TabButton
          active={active === "electronique"}
          onClick={() => setActive("electronique")}
          icon={<PenTool className="h-4 w-4" />}
          label="Émargement électronique"
          shortLabel="Électronique"
        />
        <TabButton
          active={active === "manuel"}
          onClick={() => setActive("manuel")}
          icon={<ClipboardList className="h-4 w-4" />}
          label="Pointage manuel"
          shortLabel="Manuel"
        />
      </div>
      <div>
        {active === "electronique" ? electroniqueContent : manuelContent}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  shortLabel,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  shortLabel: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors min-h-[44px]",
        active
          ? "bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shadow-sm"
          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel}</span>
    </button>
  );
}
