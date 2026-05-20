import {
  Briefcase,
  Building2,
  Calendar,
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
  amountTtc: number;
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

export function MonthlyStats({
  year,
  monthly,
}: {
  year: number;
  monthly: MonthlyStats[];
}) {
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
      </div>

      {/* === 5 KPI annuels === */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-4 border-b border-zinc-200 dark:border-zinc-800">
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
          label="Total HT (an)"
          value={currencyFormatter.format(totalHt)}
          color="amber"
        />
        <KpiCard
          icon={Briefcase}
          label="Total TTC (an)"
          value={currencyFormatter.format(totalTtc)}
          color="violet"
        />
      </div>

      {/* === Graphique en barres : participants + montant HT par mois === */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-600 mb-3 inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Volume mensuel
        </p>
        <div className="flex items-end gap-1 h-32">
          {monthly.map((m) => {
            const partHeight =
              maxParticipants > 0
                ? (m.participantsCount / maxParticipants) * 100
                : 0;
            const amtHeight =
              maxAmount > 0 ? (m.amountHt / maxAmount) * 100 : 0;
            return (
              <div
                key={m.month}
                className="flex-1 flex flex-col items-center gap-1"
                title={`${m.monthLabel}\n${m.participantsCount} participants\n${currencyFormatterPrecise.format(m.amountHt)} HT`}
              >
                <div className="flex-1 flex items-end gap-0.5 w-full">
                  {/* Barre participants (cyan) */}
                  <div
                    className="flex-1 bg-cyan-500 rounded-t-sm transition-all hover:bg-cyan-600 min-h-[2px]"
                    style={{ height: `${partHeight}%` }}
                  />
                  {/* Barre montant HT (amber) */}
                  <div
                    className="flex-1 bg-amber-500 rounded-t-sm transition-all hover:bg-amber-600 min-h-[2px]"
                    style={{ height: `${amtHeight}%` }}
                  />
                </div>
                <div className="text-[10px] text-zinc-500 font-medium">
                  {m.monthLabel}
                </div>
              </div>
            );
          })}
        </div>
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
            {monthly.map((m) => (
              <tr
                key={m.month}
                className="border-t border-zinc-100 dark:border-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
              >
                <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                  {m.monthLabel} {year}
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
                  {m.amountHt > 0
                    ? currencyFormatterPrecise.format(m.amountHt)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                  {m.amountTtc > 0
                    ? currencyFormatterPrecise.format(m.amountTtc)
                    : "—"}
                </td>
              </tr>
            ))}
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
                {currencyFormatterPrecise.format(totalHt)}
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
