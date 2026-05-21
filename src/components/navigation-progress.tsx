"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Barre de progression en haut de l'écran (style nprogress) qui
 * apparaît dès qu'on clique sur un lien et disparaît quand la nouvelle
 * page est rendue.
 *
 * Mécanique : on intercepte tous les clics sur les <a href>/Link pour
 * déclencher le démarrage de la barre, et on l'arrête quand le pathname
 * ou les searchParams changent (= la nouvelle page a fini son rendu).
 *
 * Gilles 2026-05-21 : feedback visuel instantané pour réduire la
 * sensation de lenteur sur les navigations entre pages.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);

  // Quand pathname / searchParams changent → la page de destination est
  // rendue, on cache la barre.
  useEffect(() => {
    setActive(false);
  }, [pathname, searchParams]);

  // Intercepte les clics sur <a> internes pour démarrer la barre.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Ne déclenche pas pour clic droit / touche modifier / cible new tab
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const target = (e.target as HTMLElement | null)?.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href) return;
      // Liens externes / ancres / mailto / tel → ignore
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        target.getAttribute("target") === "_blank"
      ) {
        return;
      }
      // Si on clique sur le lien de la page courante → pas de transition
      if (href === pathname) return;
      setActive(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  if (!active) return null;

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[9999] h-1 overflow-hidden bg-cyan-200/30 pointer-events-none"
    >
      <div className="h-full w-1/3 bg-gradient-to-r from-cyan-400 to-blue-500 animate-[slide_1.2s_ease-in-out_infinite] shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
      <style>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
