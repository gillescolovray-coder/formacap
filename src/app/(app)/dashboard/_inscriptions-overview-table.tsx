import Link from "next/link";
import { Calendar, Clock, Handshake, ListChecks, Users } from "lucide-react";

export type InscriptionOverviewRow = {
  enrollmentId: string;
  sessionId: string | null;
  learnerName: string;
  companyName: string | null;
  startDate: string | null;
  endDate: string | null;
  formationTitle: string;
  durationDays: number | null;
  durationHours: number | null;
  /** Source de l'inscription :
   *  - direct       : saisie directe par l'admin CAP NUMÉRIQUE
   *  - partenaire   : via le portail d'un prescripteur (referrer.type = prescripteur)
   *  - of           : via le portail d'un OF partenaire (referrer.type = of)
   */
  sourceKind: "direct" | "partenaire" | "of";
  /** Nom du partenaire si sourceKind ≠ "direct" */
  partnerName: string | null;
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  const iso = s.includes("T") ? s : `${s}T00:00:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function InscriptionsOverviewTable({
  rows,
}: {
  rows: InscriptionOverviewRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 text-center">
        <Users className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Aucune inscription pour le moment.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between gap-2 p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-cyan-600" />
          Apprenants inscrits par session
          <span className="text-xs font-medium text-zinc-500">
            ({rows.length})
          </span>
        </h2>
        <Link
          href="/inscriptions"
          className="text-xs text-cyan-700 hover:underline"
        >
          Voir toutes →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-[11px] uppercase tracking-wider font-bold text-zinc-600">
            <tr>
              <th className="px-3 py-2.5">Date session</th>
              <th className="px-3 py-2.5">Formation</th>
              <th className="px-3 py-2.5">Apprenant</th>
              <th className="px-3 py-2.5 text-center">Jours</th>
              <th className="px-3 py-2.5 text-center">Heures</th>
              <th className="px-3 py-2.5">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <tr
                key={r.enrollmentId}
                className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300">
                    <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                    {formatDate(r.startDate)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {r.sessionId ? (
                    <Link
                      href={`/sessions/${r.sessionId}`}
                      className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-cyan-700 hover:underline"
                    >
                      {r.formationTitle}
                    </Link>
                  ) : (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {r.formationTitle}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-zinc-800 dark:text-zinc-200">
                    {r.learnerName}
                  </div>
                  {r.companyName && (
                    <div className="text-[11px] text-zinc-500">
                      {r.companyName}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {r.durationDays != null && r.durationDays > 0
                    ? Number.isInteger(r.durationDays)
                      ? r.durationDays
                      : r.durationDays.toFixed(1)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-center text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {r.durationHours != null && r.durationHours > 0
                    ? r.durationHours
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  {r.sourceKind === "direct" ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200 text-[10px] font-bold uppercase tracking-wider dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                      CAP NUMÉRIQUE
                    </span>
                  ) : r.sourceKind === "of" ? (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold"
                      title={`Inscription via le portail OF ${r.partnerName ?? ""}`}
                    >
                      <Handshake className="h-3 w-3" />
                      OF · {r.partnerName ?? "?"}
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-bold"
                      title={`Inscription via le portail prescripteur ${r.partnerName ?? ""}`}
                    >
                      <Handshake className="h-3 w-3" />
                      Prescripteur · {r.partnerName ?? "?"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
