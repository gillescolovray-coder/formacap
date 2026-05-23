"use client";

import { useMemo, useState } from "react";
import { Hourglass, Search, X } from "lucide-react";
import {
  SessionCard,
  type SessionRow,
  type SessionScheduleSnapshot,
} from "./_session-card";

type PastSessionData = {
  session: SessionRow;
  participantCount: number;
  schedule: SessionScheduleSnapshot | null;
};

type Props = {
  token: string;
  sessions: PastSessionData[];
};

/**
 * Section "Sessions passées" du portail formateur :
 *  - Cachée par défaut derrière une case à cocher.
 *  - Quand cochée : barre de recherche (titre formation) + filtre
 *    date début / date fin pour fouiller dans l'historique.
 *
 * Gilles 2026-05-23.
 */
export function PastSessionsSection({ token, sessions }: Props) {
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    if (!show) return [];
    const term = search.trim().toLowerCase();
    return sessions.filter(({ session }) => {
      if (term) {
        const title = (session.formation?.title ?? "").toLowerCase();
        if (!title.includes(term)) return false;
      }
      // Filtre par chevauchement de plage. Une session est gardée si
      // elle chevauche [dateFrom, dateTo].
      if (dateFrom && session.end_date < dateFrom) return false;
      if (dateTo && session.start_date > dateTo) return false;
      return true;
    });
  }, [show, sessions, search, dateFrom, dateTo]);

  const hasActiveFilter = search.trim() || dateFrom || dateTo;
  const totalCount = sessions.length;

  return (
    <section className="pt-2 space-y-2">
      <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 select-none shadow-sm">
        <input
          type="checkbox"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
          className="w-4 h-4 rounded border-zinc-300 text-zinc-600 focus:ring-zinc-500 cursor-pointer"
        />
        <Hourglass className="h-4 w-4 text-zinc-500" />
        <span className="text-sm font-bold text-zinc-700">
          Afficher les sessions passées ({totalCount})
        </span>
      </label>

      {show && (
        <>
          {/* Barre de recherche + filtres date (mobile-first stacké) */}
          <div className="rounded-xl bg-white border border-zinc-200 p-3 space-y-2 shadow-sm">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une formation..."
                className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
                  Du
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-sm px-2.5 py-2 rounded-lg border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
                  Au
                </span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-sm px-2.5 py-2 rounded-lg border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                />
              </label>
            </div>
            {hasActiveFilter && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-zinc-500">
                  {filtered.length} résultat{filtered.length > 1 ? "s" : ""}{" "}
                  sur {totalCount}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="text-[11px] text-cyan-700 font-semibold hover:underline"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            )}
          </div>

          {/* Liste filtrée */}
          {filtered.length === 0 ? (
            <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 text-center">
              <p className="text-sm text-zinc-600">
                {hasActiveFilter
                  ? "Aucune session passée ne correspond aux filtres."
                  : "Aucune session passée."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => (
                <SessionCard
                  key={p.session.id}
                  token={token}
                  session={p.session}
                  participantCount={p.participantCount}
                  schedule={p.schedule}
                  prominence="low"
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
