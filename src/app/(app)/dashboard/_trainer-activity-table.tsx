import Link from "next/link";
import { Users } from "lucide-react";

export type TrainerActivityRow = {
  trainerId: string;
  trainerName: string;
  /** Map année -> nombre de sessions confirmées terminées. */
  byYear: Record<number, number>;
  /** Total cumulé toutes années. */
  total: number;
};

type Props = {
  /** Années à afficher (ex: [2024, 2025, 2026]). */
  years: number[];
  rows: TrainerActivityRow[];
};

/**
 * Tableau "Activité formateurs sur 3 ans" du dashboard.
 *
 * Gilles 2026-05-24 : nombre de formations RÉALISÉES (= sessions
 * confirmées/terminées dont end_date est dans l'année civile
 * 01/01 → 31/12) par formateur sur les 3 dernières années.
 *
 * Mobile-first : scroll horizontal automatique sur petit écran.
 * Triable visuellement par le total décroissant côté code.
 */
export function TrainerActivityTable({ years, rows }: Props) {
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 mb-3 inline-flex items-center gap-2">
        <Users className="h-4 w-4" />
        Activité des formateurs sur 3 ans
        <span className="text-[10px] font-semibold text-zinc-500 normal-case">
          (sessions confirmées du 01/01 au 31/12)
        </span>
      </h2>
      {rows.length === 0 ? (
        <div className="rounded-xl bg-white border border-zinc-200 p-6 text-center text-sm text-zinc-500">
          Aucune session confirmée sur les 3 dernières années.
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-zinc-200 overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3 text-left min-w-[200px]">
                  Formateur
                </th>
                {years.map((y) => (
                  <th
                    key={y}
                    className="px-4 py-3 text-right tabular-nums"
                  >
                    {y}
                  </th>
                ))}
                <th className="px-4 py-3 text-right tabular-nums bg-zinc-100/50">
                  Total 3 ans
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {rows.map((r) => (
                <tr
                  key={r.trainerId}
                  className="hover:bg-zinc-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/formateurs/${r.trainerId}`}
                      className="text-zinc-800 hover:text-cyan-700 hover:underline"
                    >
                      {r.trainerName}
                    </Link>
                  </td>
                  {years.map((y) => {
                    const n = r.byYear[y] ?? 0;
                    return (
                      <td
                        key={y}
                        className={
                          "px-4 py-3 text-right tabular-nums " +
                          (n === 0 ? "text-zinc-400" : "text-zinc-700")
                        }
                      >
                        {n}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-cyan-700 bg-zinc-50/50">
                    {r.total}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-zinc-50 border-t-2 border-zinc-200">
              <tr>
                <td className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-bold text-zinc-600">
                  Total équipe
                </td>
                {years.map((y) => {
                  const total = rows.reduce(
                    (sum, r) => sum + (r.byYear[y] ?? 0),
                    0,
                  );
                  return (
                    <td
                      key={y}
                      className="px-4 py-2.5 text-right tabular-nums text-xs font-bold text-zinc-700"
                    >
                      {total}
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-right tabular-nums text-xs font-bold text-cyan-800 bg-zinc-100/80">
                  {rows.reduce((sum, r) => sum + r.total, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
