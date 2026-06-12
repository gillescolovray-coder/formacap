"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  Calendar,
  CalendarRange,
  ChevronRight,
  Clock,
  Euro,
  TrendingUp,
  Users,
} from "lucide-react";

export type MonthlyStats = {
  month: string; // "2026-01", "2026-02"…
  monthLabel: string; // "Jan", "Fév"…
  participantsCount: number;
  hoursCount: number;
  companiesCount: number;
  amountHt: number;
  /** CA réalisé HT = sessions dont la date de fin est passée. */
  amountHtRealise: number;
  /** Prévisionnel HT = sessions à venir / en cours (fin non dépassée). */
  amountHtPrevi: number;
  amountTtc: number;
};

export type MonthlyDetailSession = {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  modality: string | null;
  isInter: boolean;
  isRealise: boolean;
  days: number;
  amountHt: number;
  amountTtc: number;
  hours: number;
  /** Libellé de la source : "CAP NUMÉRIQUE", "Prescripteur · …", "OF · …". */
  source: string;
  sourceKind: "direct" | "of" | "partenaire";
  learners: { name: string; amountHt: number; perDayHt: number }[];
};

const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const currencyFormatterPrecise = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

/** "YYYY-MM-DD" -> "DD/MM". */
function frDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return d && m ? `${d}/${m}` : iso;
}

export function MonthlyStats({
  year,
  monthly,
  detail,
  yearChoices = [],
  currentYear,
}: {
  year: number;
  monthly: MonthlyStats[];
  detail?: Record<string, MonthlyDetailSession[]>;
  yearChoices?: number[];
  currentYear?: number;
}) {
  const router = useRouter();
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [openSessions, setOpenSessions] = useState<Set<string>>(new Set());
  const toggleMonth = (k: string) =>
    setOpenMonths((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const toggleSession = (k: string) =>
    setOpenSessions((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // Total annuel
  const totalParticipants = monthly.reduce(
    (acc, m) => acc + m.participantsCount,
    0,
  );
  const totalHours = monthly.reduce((acc, m) => acc + m.hoursCount, 0);
  const totalCompanies = monthly.reduce(
    (acc, m) => acc + m.companiesCount,
    0,
  );
  const totalHt = monthly.reduce((acc, m) => acc + m.amountHt, 0);
  const totalTtc = monthly.reduce((acc, m) => acc + m.amountTtc, 0);
  const totalRealise = monthly.reduce((acc, m) => acc + m.amountHtRealise, 0);
  const totalPrevi = monthly.reduce((acc, m) => acc + m.amountHtPrevi, 0);

  // Echelle pour le graphique : on prend le max participants/mois
  const maxParticipants = Math.max(
    1,
    ...monthly.map((m) => m.participantsCount),
  );
  const maxAmount = Math.max(1, ...monthly.map((m) => m.amountHt));

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between gap-2 p-4 border-b border-zinc-200 dark:border-zinc-800 flex-wrap">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-cyan-600" />
          Statistiques mensuelles {year}
        </h2>
        {/* Sélecteur d'année */}
        {yearChoices.length > 0 && (
          <div className="inline-flex items-center gap-2">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Année
            </label>
            <select
              value={year}
              onChange={(e) => {
                const y = Number(e.target.value);
                router.push(
                  currentYear && y === currentYear
                    ? "/dashboard"
                    : `/dashboard?year=${y}`,
                );
              }}
              className="h-8 rounded-lg border border-zinc-300 text-sm px-2 font-semibold"
            >
              {yearChoices.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* === KPI annuels === */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 p-4 border-b border-zinc-200 dark:border-zinc-800">
        <KpiCard
          icon={Users}
          label="Participants (an)"
          value={totalParticipants.toString()}
          color="cyan"
        />
        <KpiCard
          icon={Clock}
          label="Heures (an)"
          value={`${Math.round(totalHours)}`}
          color="indigo"
        />
        <KpiCard
          icon={Building2}
          label="Entreprises"
          value={totalCompanies.toString()}
          color="emerald"
        />
        <KpiCard
          icon={Euro}
          label="CA réalisé HT"
          value={currencyFormatter.format(totalRealise)}
          color="emerald"
        />
        <KpiCard
          icon={CalendarRange}
          label="Prévisionnel HT"
          value={currencyFormatter.format(totalPrevi)}
          color="amber"
        />
        <KpiCard
          icon={Briefcase}
          label="Total TTC (an)"
          value={currencyFormatter.format(totalTtc)}
          color="violet"
        />
      </div>
      <div className="px-4 pt-2 -mb-1 text-[10px] text-zinc-400">
        CA réalisé = sessions terminées (date de fin dépassée) · Prévisionnel =
        sessions à venir / en cours.
      </div>

      {/* === Graphique en barres : participants + montant HT par mois === */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-600 mb-3 inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Volume mensuel
        </p>
        {(() => {
          // Hauteur en PIXELS (et non %) : sur un conteneur flex, les hauteurs
          // en % ne se résolvent pas de façon fiable -> barres écrasées.
          const BAR_AREA = 110; // px
          return (
            <div
              className="flex items-end gap-1"
              style={{ height: BAR_AREA + 18 }}
            >
              {monthly.map((m) => {
                const partPx =
                  m.participantsCount > 0
                    ? Math.max(
                        2,
                        Math.round(
                          (m.participantsCount / maxParticipants) * BAR_AREA,
                        ),
                      )
                    : 0;
                const amtPx =
                  m.amountHt > 0
                    ? Math.max(
                        2,
                        Math.round((m.amountHt / maxAmount) * BAR_AREA),
                      )
                    : 0;
                return (
                  <div
                    key={m.month}
                    className="flex-1 flex flex-col items-center justify-end gap-1"
                    title={`${m.monthLabel}\n${m.participantsCount} participants\n${currencyFormatterPrecise.format(m.amountHt)} HT`}
                  >
                    <div
                      className="flex items-end gap-0.5 w-full justify-center"
                      style={{ height: BAR_AREA }}
                    >
                      {/* Barre participants (cyan) */}
                      <div
                        className="flex-1 bg-cyan-500 rounded-t-sm transition-all hover:bg-cyan-600"
                        style={{ height: partPx }}
                      />
                      {/* Barre montant HT (amber) */}
                      <div
                        className="flex-1 bg-amber-500 rounded-t-sm transition-all hover:bg-amber-600"
                        style={{ height: amtPx }}
                      />
                    </div>
                    <div className="text-[10px] text-zinc-500 font-medium">
                      {m.monthLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
        <div className="flex items-center gap-3 mt-3 text-[10px] text-zinc-600">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-cyan-500" />
            Participants
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-amber-500" />
            Montant HT
          </span>
        </div>
      </div>

      {/* === Tableau détaillé par mois === */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-[11px] uppercase tracking-wider font-bold text-zinc-600 whitespace-nowrap">
            <tr>
              <th className="px-3 py-2.5">Mois</th>
              <th className="px-3 py-2.5 text-right">Participants</th>
              <th className="px-3 py-2.5 text-right">Heures</th>
              <th className="px-3 py-2.5 text-right">Entreprises</th>
              <th className="px-3 py-2.5 text-right">Montant HT</th>
              <th className="px-3 py-2.5 text-right">Montant TTC</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => {
              const sessions = detail?.[m.month] ?? [];
              const canExpand = sessions.length > 0;
              const isOpen = openMonths.has(m.month);
              return (
                <Fragment key={m.month}>
                  <tr
                    className={`border-t border-zinc-100 dark:border-zinc-800/40 ${
                      canExpand
                        ? "cursor-pointer hover:bg-cyan-50/50"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                    }`}
                    onClick={() => canExpand && toggleMonth(m.month)}
                  >
                    <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                      <span className="inline-flex items-center gap-1">
                        {canExpand && (
                          <ChevronRight
                            className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          />
                        )}
                        {m.monthLabel} {year}
                        {canExpand && (
                          <span className="text-[10px] text-zinc-400 font-normal ml-1">
                            ({sessions.length} session
                            {sessions.length > 1 ? "s" : ""})
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.participantsCount}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Math.round(m.hoursCount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.companiesCount}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.amountHt > 0 ? (
                        <>
                          <div>{currencyFormatterPrecise.format(m.amountHt)}</div>
                          {(m.amountHtRealise > 0 || m.amountHtPrevi > 0) && (
                            <div className="text-[10px] font-normal leading-tight mt-0.5">
                              {m.amountHtRealise > 0 && (
                                <span className="text-emerald-600">
                                  ✓ {currencyFormatter.format(m.amountHtRealise)}
                                </span>
                              )}
                              {m.amountHtRealise > 0 && m.amountHtPrevi > 0 && (
                                <span className="text-zinc-300"> · </span>
                              )}
                              {m.amountHtPrevi > 0 && (
                                <span className="text-amber-600">
                                  ⏳ {currencyFormatter.format(m.amountHtPrevi)}
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                      {m.amountTtc > 0
                        ? currencyFormatterPrecise.format(m.amountTtc)
                        : "—"}
                    </td>
                  </tr>

                  {/* Détail : une ligne par session du mois */}
                  {isOpen &&
                    sessions.map((s) => {
                      const sOpen = openSessions.has(s.id);
                      return (
                        <Fragment key={s.id}>
                          <tr
                            className="bg-zinc-50/70 dark:bg-zinc-900/30 border-t border-zinc-100 cursor-pointer hover:bg-cyan-50/60"
                            onClick={() => toggleSession(s.id)}
                          >
                            <td className="px-3 py-1.5 pl-8">
                              <span className="inline-flex items-center gap-1.5 text-xs flex-wrap">
                                <ChevronRight
                                  className={`h-3 w-3 text-zinc-400 transition-transform ${
                                    sOpen ? "rotate-90" : ""
                                  }`}
                                />
                                <span className="font-mono text-[11px] text-zinc-500">
                                  {frDay(s.date)}
                                </span>
                                <span className="font-medium text-zinc-700">
                                  {s.title}
                                </span>
                                <SourceBadge
                                  kind={s.sourceKind}
                                  label={s.source}
                                />
                                <span
                                  className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                    s.isRealise
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {s.isRealise ? "✓ réalisé" : "⏳ prévi"}
                                </span>
                                <span className="text-[10px] uppercase text-zinc-400">
                                  {s.isInter ? "INTER" : "INTRA"}
                                  {s.modality ? ` · ${s.modality}` : ""} ·{" "}
                                  {s.days} j
                                </span>
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-xs text-zinc-500">
                              {s.learners.length}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-xs text-zinc-500">
                              {s.hours > 0 ? Math.round(s.hours) : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-[10px] text-zinc-400">
                              —
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                              {s.amountHt > 0
                                ? currencyFormatterPrecise.format(s.amountHt)
                                : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="tabular-nums text-xs font-medium text-emerald-700">
                                {s.amountTtc > 0
                                  ? currencyFormatterPrecise.format(s.amountTtc)
                                  : "—"}
                              </div>
                              <Link
                                href={`/sessions/${s.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] text-cyan-700 hover:underline"
                              >
                                Ouvrir →
                              </Link>
                            </td>
                          </tr>

                          {/* Détail journée : coût par apprenant / jour */}
                          {sOpen &&
                            s.learners.map((l, i) => (
                              <tr
                                key={`${s.id}-${i}`}
                                className="bg-white dark:bg-zinc-950/40 border-t border-zinc-50"
                              >
                                <td
                                  className="px-3 py-1 pl-14 text-xs text-zinc-600"
                                  colSpan={3}
                                >
                                  {l.name}
                                </td>
                                <td className="px-3 py-1 text-right text-[11px] text-zinc-400">
                                  {s.days} j
                                </td>
                                <td className="px-3 py-1 text-right tabular-nums text-xs">
                                  {l.amountHt > 0
                                    ? currencyFormatterPrecise.format(l.amountHt)
                                    : "—"}
                                </td>
                                <td className="px-3 py-1 text-right tabular-nums text-[11px] text-zinc-500">
                                  {l.perDayHt > 0
                                    ? `${currencyFormatterPrecise.format(l.perDayHt)}/j`
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}
            {/* Ligne TOTAL */}
            <tr className="border-t-2 border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900/60 font-bold">
              <td className="px-3 py-2 uppercase text-[11px] tracking-wider">
                Total {year}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {totalParticipants}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {Math.round(totalHours)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {totalCompanies}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <div>{currencyFormatterPrecise.format(totalHt)}</div>
                {(totalRealise > 0 || totalPrevi > 0) && (
                  <div className="text-[10px] font-normal leading-tight mt-0.5">
                    <span className="text-emerald-600">
                      ✓ {currencyFormatter.format(totalRealise)}
                    </span>
                    <span className="text-zinc-300"> · </span>
                    <span className="text-amber-600">
                      ⏳ {currencyFormatter.format(totalPrevi)}
                    </span>
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                {currencyFormatterPrecise.format(totalTtc)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Petit badge indiquant la source de la session (Gilles 2026-06-12). */
function SourceBadge({
  kind,
  label,
}: {
  kind: "direct" | "of" | "partenaire";
  label: string;
}) {
  const cls = {
    direct: "bg-cyan-100 text-cyan-800",
    of: "bg-amber-100 text-amber-800",
    partenaire: "bg-violet-100 text-violet-800",
  }[kind];
  return (
    <span
      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cls}`}
      title={`Source : ${label}`}
    >
      {label}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: "cyan" | "indigo" | "emerald" | "amber" | "violet";
}) {
  const cls = {
    cyan: "bg-cyan-50 border-cyan-200 text-cyan-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
  }[color];
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <Icon className="h-4 w-4 mb-1.5" />
      <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 tabular-nums leading-tight">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider font-bold mt-0.5 leading-tight">
        {label}
      </div>
    </div>
  );
}
