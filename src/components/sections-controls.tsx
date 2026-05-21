"use client";

import { useEffect, useRef } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  /** Clé de persistance dans localStorage. */
  storageKey: string;
  /** Sections ouvertes par défaut (utilisé si rien en localStorage). */
  defaultOpenIds?: string[];
  /** Si true, on ignore le localStorage et on force `defaultOpenIds`.
   *  Utilisé pour une nouvelle fiche (ex: ?fresh=1) afin que les blocs
   *  essentiels soient systématiquement dépliés à l'arrivée. */
  forceDefaultOpen?: boolean;
  children: React.ReactNode;
};

export function SectionsControls({
  storageKey,
  defaultOpenIds,
  forceDefaultOpen = false,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  function getDetails(): HTMLDetailsElement[] {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLDetailsElement>(
        "details[data-section-id]",
      ),
    );
  }

  function applyOpen(ids: string[]) {
    getDetails().forEach((d) => {
      const id = d.dataset.sectionId;
      if (!id) return;
      d.open = ids.includes(id);
    });
  }

  function persistCurrentState() {
    const ids = getDetails()
      .filter((d) => d.open && d.dataset.sectionId)
      .map((d) => d.dataset.sectionId!);
    localStorage.setItem(storageKey, JSON.stringify(ids));
  }

  useEffect(() => {
    const details = getDetails();
    // Restauration depuis localStorage — sauf si forceDefaultOpen est true
    // (cas d'une nouvelle inscription : on impose les blocs essentiels).
    let openIds: string[] | null = null;
    if (forceDefaultOpen) {
      openIds = defaultOpenIds ?? [];
      // On nettoie aussi le localStorage pour repartir sur une base saine.
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    } else {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) openIds = JSON.parse(raw);
      } catch {
        openIds = null;
      }
      if (openIds === null) openIds = defaultOpenIds ?? [];
    }
    applyOpen(openIds);

    // Sauvegarde à chaque toggle
    const handler = () => persistCurrentState();
    details.forEach((d) => d.addEventListener("toggle", handler));
    return () => {
      details.forEach((d) => d.removeEventListener("toggle", handler));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function expandAll() {
    getDetails().forEach((d) => {
      d.open = true;
    });
    persistCurrentState();
  }

  function collapseAll() {
    getDetails().forEach((d) => {
      d.open = false;
    });
    persistCurrentState();
  }

  function reset() {
    localStorage.removeItem(storageKey);
    applyOpen(defaultOpenIds ?? []);
  }

  return (
    <div ref={containerRef} className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-2">
          Affichage :
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={expandAll}
        >
          <ChevronsUpDown className="h-4 w-4" />
          Tout déplier
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={collapseAll}
        >
          <ChevronsDownUp className="h-4 w-4" />
          Tout replier
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          title="Réinitialiser à la disposition par défaut"
        >
          <RotateCcw className="h-4 w-4" />
          Réinitialiser
        </Button>
      </div>
      {children}
    </div>
  );
}
