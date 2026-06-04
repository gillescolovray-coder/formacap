"use client";

/**
 * Info-bulle (popover au clic) listant les formations engagées.
 * Deux variantes :
 *  - "company"  : compteur Formations d'une ligne entreprise (vue table).
 *                 Affiche le nom de l'apprenant pour chaque session.
 *  - "learner"  : nouveau badge 📚 sur une ligne apprenant. Affiche la
 *                 recommandation (NPS à chaud) de chaque session.
 *
 * Rendu via createPortal(document.body) + position:fixed (cf. mémoire
 * feedback_dropdown_portal) pour éviter tout clipping par les overflow
 * des parents (table, cartes). Ouverture au CLIC (identique PC/mobile,
 * le survol n'existe pas sur smartphone — choix Gilles 2026-06-04).
 */
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Calendar, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FormationEntry = {
  enrollmentId: string;
  /** Session de rattachement — sert au regroupement (variante company). */
  sessionId: string | null;
  startDate: string | null;
  endDate: string | null;
  durationHours: number | null;
  title: string | null;
  trainerName: string | null;
  /** Nom de l'apprenant — utilisé par la variante "company". */
  learnerName: string | null;
  /** Recommandation (NPS à chaud, 0-10). */
  npsScore: number | null;
};

const MAX_VISIBLE = 5;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

function formatHours(h: number | null): string | null {
  if (h == null) return null;
  if (Number.isInteger(h)) return `${h}h`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins ? `${whole}h${String(mins).padStart(2, "0")}` : `${whole}h`;
}

export function FormationsTooltip({
  count,
  entries,
  headerLabel,
  variant,
}: {
  count: number;
  entries: FormationEntry[];
  headerLabel: string;
  variant: "company" | "learner";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  function place() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 16);
    // Aligné à droite du badge, borné dans la fenêtre.
    let left = r.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 6, left, width });
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen((v) => {
      if (!v) place();
      return !v;
    });
  }

  // Ferme au scroll de la PAGE / resize pour éviter un popover « décroché ».
  // IMPORTANT : on ignore le scroll INTERNE de la fenêtre (la liste a son
  // propre ascenseur) — sinon scroller la liste fermait la fenêtre.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e.type === "scroll" &&
        dialogRef.current &&
        e.target instanceof Node &&
        dialogRef.current.contains(e.target)
      ) {
        return; // scroll à l'intérieur du popover → ne pas fermer
      }
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const isCompany = variant === "company";

  // Variante "company" : on regroupe les inscriptions par formation
  // (session) -> 1 formation, puis la liste des participants + reco.
  type Group = {
    key: string;
    title: string | null;
    startDate: string | null;
    durationHours: number | null;
    participants: { name: string; nps: number | null }[];
  };
  const groups: Group[] = [];
  if (isCompany) {
    const byKey = new Map<string, Group>();
    for (const e of entries) {
      const key = e.sessionId ?? e.enrollmentId;
      let g = byKey.get(key);
      if (!g) {
        g = {
          key,
          title: e.title,
          startDate: e.startDate,
          durationHours: e.durationHours,
          participants: [],
        };
        byKey.set(key, g);
        groups.push(g);
      }
      g.participants.push({ name: e.learnerName ?? "—", nps: e.npsScore });
    }
  }

  const headerCount = isCompany ? groups.length : entries.length;
  const visibleGroups = groups.slice(0, MAX_VISIBLE);
  const visibleEntries = entries.slice(0, MAX_VISIBLE);
  const rest = isCompany
    ? groups.length - visibleGroups.length
    : entries.length - visibleEntries.length;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        title={`${count} formation${count > 1 ? "s" : ""} — cliquer pour le détail`}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border font-bold tabular-nums transition-colors",
          "bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-200",
          isCompany ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs",
        )}
      >
        {isCompany ? (
          <Calendar className="h-3.5 w-3.5" />
        ) : (
          <BookOpen className="h-3 w-3" />
        )}
        {count}
      </button>

      {mounted &&
        open &&
        pos &&
        createPortal(
          <>
            {/* Capteur de clic extérieur */}
            <div
              className="fixed inset-0 z-[998]"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            />
            <div
              ref={dialogRef}
              role="dialog"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: pos.width,
              }}
              className="z-[999] rounded-xl border border-zinc-200 bg-white shadow-xl overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 bg-violet-50 border-b border-violet-100 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-violet-800 truncate">
                  Formations — {headerLabel} ({headerCount})
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                  }}
                  className="shrink-0 text-violet-400 hover:text-violet-700"
                  aria-label="Fermer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {headerCount === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-zinc-400">
                  Aucune formation.
                </p>
              ) : isCompany ? (
                /* Variante entreprise : 1 formation -> participants + reco */
                <ul className="max-h-[320px] overflow-y-auto divide-y divide-zinc-100">
                  {visibleGroups.map((g) => {
                    const hours = formatHours(g.durationHours);
                    return (
                      <li key={g.key} className="px-3 py-2">
                        <p className="text-[11px] font-bold text-zinc-700 tabular-nums">
                          {formatDate(g.startDate)}
                          {hours ? ` · ${hours}` : ""}
                        </p>
                        <p className="text-xs font-semibold text-zinc-900 italic">
                          «&nbsp;{g.title ?? "Formation"}&nbsp;»
                        </p>
                        <ul className="mt-1 space-y-1">
                          {g.participants.map((p, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-2 text-[11px]"
                            >
                              <span className="text-zinc-700 truncate">
                                {p.name}
                              </span>
                              {p.nps != null ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-amber-600 shrink-0">
                                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                  {p.nps}/10
                                </span>
                              ) : (
                                <span className="text-zinc-400 italic shrink-0">
                                  reco. n/r
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                /* Variante apprenant : liste de ses formations + reco */
                <ul className="max-h-[320px] overflow-y-auto divide-y divide-zinc-100">
                  {visibleEntries.map((f) => {
                    const hours = formatHours(f.durationHours);
                    return (
                      <li key={f.enrollmentId} className="px-3 py-2">
                        <p className="text-[11px] font-bold text-zinc-700 tabular-nums">
                          {formatDate(f.startDate)}
                          {hours ? ` · ${hours}` : ""}
                        </p>
                        <p className="text-xs text-zinc-600 italic">
                          «&nbsp;{f.title ?? "Formation"}&nbsp;»
                        </p>
                        <p className="text-[11px] mt-0.5">
                          {f.npsScore != null ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              Recommandation&nbsp;: {f.npsScore}/10
                            </span>
                          ) : (
                            <span className="text-zinc-400 italic">
                              Recommandation&nbsp;: non renseignée
                            </span>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}

              {rest > 0 && (
                <div className="px-3 py-1.5 text-center text-[11px] font-semibold text-violet-700 bg-violet-50/60 border-t border-violet-100">
                  +{rest} autre{rest > 1 ? "s" : ""} formation{rest > 1 ? "s" : ""}
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
