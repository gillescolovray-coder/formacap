"use client";

import { createContext, Suspense, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavigationProgress } from "./navigation-progress";

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
  // Mode "print" / "kiosque" : sur toute URL contenant /print, on
  // RETIRE COMPLETEMENT le sidebar et le header admin (Gilles
  // 2026-06-03 — gros bug securite : un apprenant qui recevait une
  // attestation PDF voyait le sidebar admin complet avec tous les
  // modules cliquables). Le rendu devient un simple <main>{children}</main>
  // plein ecran, sans aucune trace de navigation admin.
  const pathname = usePathname() ?? "";
  const isPrintMode = pathname.includes("/print");
  // Initialize from localStorage on first render (client-only)
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Drawer mobile (Gilles 2026-05-22) : sur écrans < md, la sidebar
  // disparaît complètement et s'ouvre via un drawer overlay.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    setHydrated(true);
  }, []);

  // Ferme le drawer mobile à chaque navigation (changement d'URL).
  useEffect(() => {
    if (!mobileOpen) return;
    const handlePopState = () => setMobileOpen(false);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [mobileOpen]);

  // Empêche le scroll body quand le drawer mobile est ouvert.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  // Avant hydratation, on est en mode étendu pour éviter un flash visuel
  const isCollapsed = hydrated && collapsed;

  // Mode print : on ne rend QUE les children, dans un wrapper minimal.
  // Aucun acces au sidebar / navigation / user menu n est expose
  // (place ici APRES tous les hooks pour respecter les rules of hooks).
  if (isPrintMode) {
    return <main className="min-h-screen bg-white">{children}</main>;
  }

  return (
    <SidebarCollapsedContext.Provider value={isCollapsed}>
      {/* Barre de progression en haut sur chaque navigation
          (Gilles 2026-05-21 — feedback visuel anti-lenteur perçue).
          Suspense requis car NavigationProgress utilise useSearchParams. */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <div className="flex min-h-screen bg-slate-50">
        {/* === SIDEBAR DESKTOP (lg:+) ===
            Réduite à 64px en mode collapsed (icônes seules avec
            tooltip), 288px en mode étendu. Cachée sous lg (1024px) — donc
            téléphones, PLIABLES, tablettes et paysage utilisent le drawer.
            (Gilles 2026-06-17 : seuil relevé de md→lg car les pliables ~780px
            tombaient en mode bureau et écrasaient le contenu.) */}
        <aside
          className={cn(
            "hidden lg:block shrink-0 sticky top-0 h-screen overflow-hidden transition-[width] duration-300 ease-out",
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

        {/* === DRAWER MOBILE / TABLETTE / PLIABLE (< lg) ===
            Overlay sombre + sidebar slide-in depuis la gauche.
            Visible uniquement quand mobileOpen=true. */}
        {mobileOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}
        <aside
          className={cn(
            "lg:hidden fixed top-0 left-0 z-50 h-screen w-72 max-w-[85vw] bg-white shadow-xl transition-transform duration-300 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-hidden={!mobileOpen}
        >
          {/* Bouton fermer drawer en haut à droite */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
            className="absolute top-3 right-3 z-10 h-9 w-9 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="h-full overflow-y-auto" onClick={() => setMobileOpen(false)}>
            {sidebar}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 bg-gradient-to-br from-slate-50 via-white to-cyan-50/50 relative">
          {/* Boutons de bascule sticky en haut à gauche :
              - Mobile (< md) : burger menu qui ouvre le drawer
              - Desktop (md+) : bouton collapsed/expanded de la sidebar */}
          {/* Burger mobile : `fixed` (overlay) au lieu de `float` qui faisait
              rétrécir la colonne de contenu -> titre vertical sur mobile
              (Gilles 2026-06-23). PageHeader réserve la place via pl-16. */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            title="Ouvrir le menu"
            aria-label="Ouvrir le menu"
            className="lg:hidden fixed top-3 left-3 z-40 h-11 w-11 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-md hover:shadow-lg hover:bg-slate-50 transition-all text-slate-700"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggle}
            title={isCollapsed ? "Afficher le menu" : "Masquer le menu"}
            aria-label={
              isCollapsed ? "Afficher le menu" : "Masquer le menu"
            }
            className="hidden lg:inline-flex sticky top-4 left-4 z-30 ml-4 mt-4 h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 shadow-md hover:shadow-lg hover:bg-slate-50 transition-all text-slate-700"
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
