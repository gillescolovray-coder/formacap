"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, MapPin, Sun, Sunset, X } from "lucide-react";

type LocationFull = {
  id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
};

type Props = {
  /** Lieu structuré (formation_locations). Priorité 1. */
  locationFull: LocationFull | null;
  /** Champ texte legacy (sessions.location). Fallback si pas de FK. */
  locationText: string | null;
  /** Horaires par défaut de la session (matin / après-midi). */
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
};

/** "09:00:00" → "09:00" */
function fmtTime(t: string | null): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}

/**
 * Bouton-icône (📍) qui ouvre au clic un popover propre détaillant
 * le lieu de la session et ses horaires types matin / après-midi.
 *
 * Positionné via portal pour échapper aux overflows parents (le
 * <details>/<summary> de la liste d'inscriptions).
 */
export function LocationPopover({
  locationFull,
  locationText,
  morningStart,
  morningEnd,
  afternoonStart,
  afternoonEnd,
}: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Données dérivées (calculées après les hooks pour respecter les
  // règles React)
  const lf = locationFull;
  const cityLine = [lf?.postal_code, lf?.city].filter(Boolean).join(" ");
  const mStart = fmtTime(morningStart);
  const mEnd = fmtTime(morningEnd);
  const aStart = fmtTime(afternoonStart);
  const aEnd = fmtTime(afternoonEnd);
  const hasMorning = Boolean(mStart && mEnd);
  const hasAfternoon = Boolean(aStart && aEnd);
  const hasSchedule = hasMorning || hasAfternoon;
  const hasLocation = Boolean(
    lf?.name || lf?.address || cityLine || locationText,
  );

  // Rien à afficher : pas d'icône fantôme
  if (!hasLocation && !hasSchedule) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center text-slate-500 hover:text-cyan-700 cursor-pointer"
        title="Voir le lieu et les horaires"
        aria-label="Voir le lieu et les horaires"
      >
        <MapPin className="h-3.5 w-3.5" />
      </button>

      {open &&
        rect &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              zIndex: 9999,
            }}
            className="w-80 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-cyan-50 to-blue-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                  <MapPin className="h-4 w-4 text-cyan-700" />
                </div>
                <p className="font-bold text-sm text-slate-800">
                  Lieu &amp; horaires
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-red-600"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Bloc Lieu */}
            {hasLocation && (
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">
                  Adresse
                </p>
                {lf?.name ? (
                  <>
                    <p className="text-sm font-bold text-slate-900">
                      {lf.name}
                    </p>
                    {lf.address && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        {lf.address}
                      </p>
                    )}
                    {cityLine && (
                      <p className="text-xs text-slate-600">{cityLine}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-700">{locationText}</p>
                )}
              </div>
            )}

            {/* Bloc Horaires */}
            {hasSchedule && (
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Horaires de la session
                </p>
                <div className="space-y-1.5">
                  {hasMorning && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-100">
                      <Sun className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 w-20">
                        Matin
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-800 ml-auto">
                        {mStart} – {mEnd}
                      </span>
                    </div>
                  )}
                  {hasAfternoon && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-violet-50 border border-violet-100">
                      <Sunset className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                      <span className="text-[10px] uppercase tracking-wider font-bold text-violet-700 w-20">
                        Après-midi
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-800 ml-auto">
                        {aStart} – {aEnd}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
