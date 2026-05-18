"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "cap-of-sidebar-collapsed";

/**
 * Context exposant l'état « collapsed » de la sidebar à toute son
 * arborescence. Utilisé par SidebarNav (icônes seules + tooltip) et
 * par d'autres composants internes de la sidebar.
 */
const SidebarCollapsedContext = createContext(false);

export function useSidebarCollapsed() {
  return useContext(SidebarCollapsedContext);
}

type AppShellClientProps = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

export function AppShellClient({ sidebar, children }: AppShellClientProps) {
  // Initialize from localStorage on first render (client-only)
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    setHydrated(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  // Avant hydratation, on est en mode étendu pour éviter un flash visuel
  const isCollapsed = hydrated && collapsed;

  return (
    <SidebarCollapsedContext.Provider value={isCollapsed}>
      <div className="flex min-h-screen bg-slate-50">
        {/* Sidebar — réduite à 64px en mode collapsed (icônes seules avec
            tooltip), 288px en mode étendu. */}
        <aside
          className={cn(
            "shrink-0 sticky top-0 h-screen overflow-hidden transition-[width] duration-300 ease-out",
            isCollapsed ? "w-16" : "w-72",
          )}
        >
          <div
            className={cn(
              "h-full transition-[width] duration-300 ease-out",
              isCollapsed ? "w-16" : "w-72",
            )}
          >
            {sidebar}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 bg-gradient-to-br from-slate-50 via-white to-cyan-50/50 relative">
          {/* Bouton de bascule sticky en haut à gauche */}
          <button
            type="button"
            onClick={toggle}
            title={isCollapsed ? "Afficher le menu" : "Masquer le menu"}
            aria-label={
              isCollapsed ? "Afficher le menu" : "Masquer le menu"
            }
            className="sticky top-4 left-4 z-30 ml-4 mt-4 h-9 w-9 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-md hover:shadow-lg hover:bg-slate-50 transition-all text-slate-700"
            style={{ float: "left" }}
          >
            {isCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <div className="relative">{children}</div>
        </main>
      </div>
    </SidebarCollapsedContext.Provider>
  );
}
