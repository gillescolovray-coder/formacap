"use client";

import { useSidebarCollapsed } from "./app-shell-client";
import { cn } from "@/lib/utils";

/**
 * Wrapper client de la sidebar : adapte le rendu du logo / titre
 * d'organisation / pied de page selon le mode (collapsed ou non).
 *
 * - Mode étendu  : logo + nom complet de l'organisation + footer user.
 * - Mode compact : mini-logo carré, pas de texte, pas de footer
 *                  (l'avatar utilisateur reste accessible via tooltip).
 */
export function SidebarShell({
  brand,
  brandCompact,
  nav,
  footer,
  footerCompact,
}: {
  brand: React.ReactNode;
  brandCompact: React.ReactNode;
  nav: React.ReactNode;
  footer: React.ReactNode;
  footerCompact: React.ReactNode;
}) {
  const collapsed = useSidebarCollapsed();

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-blue-900 via-blue-950 to-slate-950 text-white">
      {/* Brand */}
      <div className={cn(collapsed ? "px-2 pt-3 pb-3" : "px-6 pt-7 pb-6")}>
        {collapsed ? brandCompact : brand}
      </div>

      <div
        className={cn(
          "h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent",
          collapsed ? "mx-2" : "mx-6",
        )}
      />

      <div className="flex-1 overflow-y-auto py-4">{nav}</div>

      <div
        className={cn(
          "border-t border-blue-950/80",
          collapsed ? "p-2" : "p-3",
        )}
      >
        {collapsed ? footerCompact : footer}
      </div>
    </div>
  );
}
