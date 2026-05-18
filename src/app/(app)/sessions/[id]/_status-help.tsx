"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ENROLLMENT_STATUS_BADGE_CLASSES,
  ENROLLMENT_STATUS_DESCRIPTIONS,
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentStatus,
} from "@/lib/sessions/types";

/**
 * Petit bouton "?" qui ouvre une info-bulle listant tous les statuts
 * d'inscription avec leurs descriptions.
 */
export function EnrollmentStatusHelp() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function show() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 8,
      left: Math.max(8, rect.left - 120),
    });
    setOpen(true);
  }

  function hide() {
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => e.preventDefault()}
        className="inline-flex items-center justify-center h-5 w-5 rounded-full text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors cursor-help"
        aria-label="Voir l'explication des statuts"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {mounted &&
        open &&
        coords &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 9999,
            }}
            className="w-96 max-h-[480px] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-xl">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Cycle de vie d&apos;une inscription
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Faites évoluer le statut tout au long du parcours.
              </p>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(
                Object.keys(ENROLLMENT_STATUS_LABELS) as EnrollmentStatus[]
              ).map((status) => (
                <li
                  key={status}
                  className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span
                    className={cn(
                      "inline-block px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap mb-1",
                      ENROLLMENT_STATUS_BADGE_CLASSES[status],
                    )}
                  >
                    {ENROLLMENT_STATUS_LABELS[status]}
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {ENROLLMENT_STATUS_DESCRIPTIONS[status]}
                  </p>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
