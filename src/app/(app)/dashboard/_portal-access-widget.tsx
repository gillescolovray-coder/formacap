"use client";

import { useMemo, useState } from "react";
import { Users, Calendar } from "lucide-react";

/**
 * Widget "Accès à l'espace apprenant" (Gilles 2026-06-05).
 * Reçoit la liste des visites (timestamp ISO + learner_id) et permet de
 * consulter dynamiquement : par MOIS sur une année sélectionnée, ou par
 * ANNÉE. Agrégation 100% client (pas de requête au changement d'année).
 */
type Visit = { at: string; learner: string };

const MONTHS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

export function PortalAccessWidget({ visits }: { visits: Visit[] }) {
  // Années présentes dans les données (desc), + année courante garantie.
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const v of visits) {
      const y = Number(v.at.slice(0, 4));
      if (Number.isFinite(y)) set.add(y);
    }
    if (set.size === 0) set.add(Number(new Date().toISOString().slice(0, 4)));
    return Array.from(set).sort((a, b) => b - a);
  }, [visits]);

  const [mode, setMode] = useState<"month" | "year">("month");
  const [year, setYear] = useState<number>(years[0]!);

  // Agrégats
  const { monthly, byYear, totalYear, uniqueYear } = useMemo(() => {
    const monthly = new Array(12).fill(0) as number[];
    const byYear = new Map<number, number>();
    const uniqueSetYear = new Set<string>();
    let totalYear = 0;
    for (const v of visits) {
      const y = Number(v.at.slice(0, 4));
      const m = Number(v.at.slice(5, 7)) - 1;
      byYear.set(y, (byYear.get(y) ?? 0) + 1);
      if (y === year) {
        if (m >= 0 && m < 12) monthly[m]++;
        totalYear++;
        uniqueSetYear.add(v.learner);
      }
    }
    return { monthly, byYear, totalYear, uniqueYear: uniqueSetYear.size };
  }, [visits, year]);

  const yearSeries = years
    .slice()
    .sort((a, b) => a - b)
    .map((y) => ({ year: y, count: byYear.get(y) ?? 0 }));

  const series =
    mode === "month"
      ? monthly.map((c, i) => ({ label: MONTHS[i]!, count: c }))
      : yearSeries.map((y) => ({ label: String(y.year), count: y.count }));
  const max = Math.max(1, ...series.map((s) => s.count));

  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1.5">
            <Users className="h-4 w-4 text-cyan-600" />
            Accès à l&apos;espace apprenant
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Venues des apprenants sur leur portail (1 visite / 30 min).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bascule mois / année */}
          <div className="inline-flex rounded-lg border border-zinc-300 overflow-hidden text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("month")}
              className={
                mode === "month"
                  ? "px-2.5 py-1 bg-cyan-600 text-white"
                  : "px-2.5 py-1 text-zinc-600 hover:bg-zinc-50"
              }
            >
              Par mois
            </button>
            <button
              type="button"
              onClick={() => setMode("year")}
              className={
                mode === "year"
                  ? "px-2.5 py-1 bg-cyan-600 text-white"
                  : "px-2.5 py-1 text-zinc-600 hover:bg-zinc-50"
              }
            >
              Par année
            </button>
          </div>
          {/* Sélecteur d'année (mode mois) */}
          {mode === "month" && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-7 rounded-md border border-zinc-300 text-xs px-2"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* KPIs (mode mois = année sélectionnée) */}
      {mode === "month" && (
        <div className="flex gap-3 mb-3">
          <div className="rounded-lg bg-cyan-50 border border-cyan-200 px-3 py-1.5">
            <div className="text-lg font-bold text-cyan-800 tabular-nums">
              {totalYear}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-cyan-700 font-bold">
              Visites {year}
            </div>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
            <div className="text-lg font-bold text-emerald-800 tabular-nums">
              {uniqueYear}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">
              Apprenants actifs
            </div>
          </div>
        </div>
      )}

      {/* Barres */}
      <div className="flex items-end gap-1.5 h-32">
        {series.map((s) => (
          <div key={s.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="text-[10px] tabular-nums text-zinc-500 font-semibold">
              {s.count > 0 ? s.count : ""}
            </div>
            <div
              className="w-full rounded-t bg-cyan-500/80 hover:bg-cyan-600 transition-colors"
              style={{
                height: `${Math.round((s.count / max) * 100)}%`,
                minHeight: s.count > 0 ? 4 : 1,
              }}
              title={`${s.label} : ${s.count} visite${s.count > 1 ? "s" : ""}`}
            />
            <div className="text-[9px] text-zinc-400 truncate w-full text-center">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {visits.length === 0 && (
        <p className="text-xs text-zinc-400 text-center mt-3 inline-flex items-center gap-1.5 justify-center w-full">
          <Calendar className="h-3.5 w-3.5" />
          Aucune visite enregistrée pour le moment.
        </p>
      )}
    </div>
  );
}
