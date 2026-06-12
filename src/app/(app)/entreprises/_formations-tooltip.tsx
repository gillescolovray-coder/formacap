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
import { BookOpen, Calendar, Clock, Star, X } from "lucide-react";
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
  entries,
  headerLabel,
  variant,
}: {
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

  // "Réalisée" = session TERMINÉE (date de fin passée). Le compteur ne
  // prend en compte QUE les réalisées ; les "à venir" sont affichées à
  // part, sans recommandation, et non comptées (Gilles 2026-06-04).
  const today = new Date().toISOString().slice(0, 10);
  const isRealized = (e: FormationEntry) =>
    Boolean(e.endDate && e.endDate < today);
  // Réalisées : plus récente en haut (historique décroissant — ordre
  // d'entrée déjà trié desc par les loaders).
  const realized = entries.filter(isRealized);
  // À venir : la PROCHAINE date d'abord (ordre chronologique croissant).
  const upcoming = entries
    .filter((e) => !isRealized(e))
    .slice()
    .sort((a, b) =>
      (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"),
    );

  // Variante "company" : regroupement par formation (session) -> 1
  // formation, puis la liste des participants (+ reco si réalisée).
  type Group = {
    key: string;
    title: string | null;
    startDate: string | null;
    durationHours: number | null;
    participants: { name: string; nps: number | null }[];
  };
  const groupBySession = (list: FormationEntry[]): Group[] => {
    const byKey = new Map<string, Group>();
    const out: Group[] = [];
    for (const e of list) {
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
        out.push(g);
      }
      // Sessions prescripteur / sous-traitance : pas de salarié de cet
      // organisme -> learnerName null -> on n'ajoute pas de participant.
      if (e.learnerName) {
        g.participants.push({ name: e.learnerName, nps: e.npsScore });
      }
    }
    return out;
  };
  const realizedGroups = isCompany ? groupBySession(realized) : [];
  const upcomingGroups = isCompany ? groupBySession(upcoming) : [];

  // Compteur AFFICHÉ = formations réalisées (sessions distinctes côté
  // entreprise). Si 0 réalisée mais des à venir -> badge "à venir".
  const realizedCount = isCompany ? realizedGroups.length : realized.length;
  const upcomingCount = isCompany ? upcomingGroups.length : upcoming.length;
  const hasRealized = realizedCount > 0;

  // Récap PAR ANNÉE des formations réalisées (Gilles 2026-06-12) :
  // « 2026 : 12 · 2025 : 15 … ». Compté sur les sessions distinctes réalisées.
  const yearSource: Array<{ startDate: string | null }> = isCompany
    ? realizedGroups
    : realized;
  const yearCounts = new Map<number, number>();
  for (const it of yearSource) {
    const y = Number((it.startDate ?? "").slice(0, 4));
    if (y) yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
  }
  const yearSummary = Array.from(yearCounts.entries()).sort(
    (a, b) => b[0] - a[0],
  );

  const visibleRealizedGroups = realizedGroups.slice(0, MAX_VISIBLE);
  const visibleRealizedEntries = realized.slice(0, MAX_VISIBLE);
  const restRealized =
    (isCompany ? realizedGroups.length : realized.length) -
    (isCompany ? visibleRealizedGroups.length : visibleRealizedEntries.length);

  // Rendu d'une formation (variante apprenant) — muted = section "à venir".
  const renderEntry = (f: FormationEntry, muted: boolean) => {
    const hours = formatHours(f.durationHours);
    return (
      <li key={f.enrollmentId} className="px-3 py-2">
        <p
          className={cn(
            "text-[11px] font-bold tabular-nums",
            muted ? "text-zinc-400" : "text-zinc-700",
          )}
        >
          {formatDate(f.startDate)}
          {hours ? ` · ${hours}` : ""}
        </p>
        <p
          className={cn("text-xs italic", muted ? "text-zinc-400" : "text-zinc-600")}
        >
          «&nbsp;{f.title ?? "Formation"}&nbsp;»
        </p>
        {!muted && (
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
        )}
      </li>
    );
  };

  // Rendu d'une formation groupée (variante entreprise).
  const renderGroup = (g: Group, muted: boolean) => {
    const hours = formatHours(g.durationHours);
    return (
      <li key={g.key} className="px-3 py-2">
        <p
          className={cn(
            "text-[11px] font-bold tabular-nums",
            muted ? "text-zinc-400" : "text-zinc-700",
          )}
        >
          {formatDate(g.startDate)}
          {hours ? ` · ${hours}` : ""}
        </p>
        <p
          className={cn(
            "text-xs italic",
            muted ? "text-zinc-400 font-medium" : "text-zinc-900 font-semibold",
          )}
        >
          «&nbsp;{g.title ?? "Formation"}&nbsp;»
        </p>
        {g.participants.length > 0 && (
        <ul className="mt-1 space-y-1">
          {g.participants.map((p, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span
                className={cn(
                  "truncate",
                  muted ? "text-zinc-400" : "text-zinc-700",
                )}
              >
                {p.name}
              </span>
              {muted ? null : p.nps != null ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-600 shrink-0">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {p.nps}/10
                </span>
              ) : (
                <span className="text-zinc-400 italic shrink-0">reco. n/r</span>
              )}
            </li>
          ))}
        </ul>
        )}
      </li>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        title={
          hasRealized
            ? `${realizedCount} formation${realizedCount > 1 ? "s" : ""} réalisée${realizedCount > 1 ? "s" : ""}${upcomingCount > 0 ? ` · ${upcomingCount} à venir` : ""} — cliquer pour le détail`
            : `${upcomingCount} formation${upcomingCount > 1 ? "s" : ""} à venir (aucune réalisée) — cliquer pour le détail`
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-md border font-bold tabular-nums transition-colors",
          hasRealized
            ? "bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-200"
            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
          isCompany ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs",
        )}
      >
        {hasRealized ? (
          isCompany ? (
            <Calendar className="h-3.5 w-3.5" />
          ) : (
            <BookOpen className="h-3 w-3" />
          )
        ) : (
          <Clock className={isCompany ? "h-3.5 w-3.5" : "h-3 w-3"} />
        )}
        {hasRealized ? realizedCount : upcomingCount}
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
                  Formations — {headerLabel} ({realizedCount} réalisée
                  {realizedCount > 1 ? "s" : ""}
                  {upcomingCount > 0 ? `, ${upcomingCount} à venir` : ""})
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

              {/* Récap par année (réalisées) — demandé par Gilles. */}
              {yearSummary.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-violet-50/40 border-b border-violet-100">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700 mr-0.5">
                    Par année
                  </span>
                  {yearSummary.map(([y, n]) => (
                    <span
                      key={y}
                      className="inline-flex items-center gap-1 rounded-md bg-white border border-violet-200 px-2 py-0.5 text-[11px]"
                    >
                      <span className="font-semibold text-zinc-700">{y}</span>
                      <span className="font-black tabular-nums text-violet-800">
                        {n}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {realized.length === 0 && upcoming.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-zinc-400">
                  Aucune formation.
                </p>
              ) : (
                <div className="max-h-[340px] overflow-y-auto">
                  {/* Formations réalisées (comptées) */}
                  {(isCompany ? realizedGroups.length : realized.length) > 0 && (
                    <ul className="divide-y divide-zinc-100">
                      {isCompany
                        ? visibleRealizedGroups.map((g) => renderGroup(g, false))
                        : visibleRealizedEntries.map((f) => renderEntry(f, false))}
                    </ul>
                  )}
                  {restRealized > 0 && (
                    <div className="px-3 py-1.5 text-center text-[11px] font-semibold text-violet-700 bg-violet-50/60 border-t border-violet-100">
                      +{restRealized} autre{restRealized > 1 ? "s" : ""} réalisée
                      {restRealized > 1 ? "s" : ""}
                    </div>
                  )}

                  {/* Formations à venir (NON comptées) */}
                  {upcoming.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 bg-zinc-50 border-t border-zinc-200 text-[10px] font-bold uppercase tracking-wide text-zinc-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        À venir ({upcomingCount}) — non comptée
                        {upcomingCount > 1 ? "s" : ""}
                      </div>
                      <ul className="divide-y divide-zinc-100">
                        {isCompany
                          ? upcomingGroups
                              .slice(0, MAX_VISIBLE)
                              .map((g) => renderGroup(g, true))
                          : upcoming
                              .slice(0, MAX_VISIBLE)
                              .map((f) => renderEntry(f, true))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
