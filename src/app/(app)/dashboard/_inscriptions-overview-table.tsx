import Link from "next/link";
import { Calendar, Handshake, ListChecks, Users } from "lucide-react";

export type InscriptionOverviewRow = {
  enrollmentId: string;
  sessionId: string | null;
  // Apprenant
  learnerFirstName: string | null;
  learnerLastName: string | null;
  learnerJobTitle: string | null;
  learnerEmail: string | null;
  learnerPhone: string | null;
  // Entreprise (rattachée à l'apprenant)
  companyName: string | null;
  companyAddress: string | null;
  companyPostalCode: string | null;
  companyCity: string | null;
  // Session / formation
  startDate: string | null;
  endDate: string | null;
  formationTitle: string;
  durationDays: number | null;
  durationHours: number | null;
  /** Tarif HT applique pour cette inscription (quote_amount_ht).
   *  Le TTC est calcule cote affichage = HT * 1.20. */
  amountHt: number | null;
  /** Source de l'inscription :
   *  - direct       : saisie directe par l'admin CAP NUMÉRIQUE
   *  - partenaire   : via le portail d'un prescripteur (referrer.type = prescripteur)
   *  - of           : via le portail d'un OF partenaire (referrer.type = of)
   */
  sourceKind: "direct" | "partenaire" | "of";
  /** Nom du partenaire si sourceKind ≠ "direct" */
  partnerName: string | null;
};

const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

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
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-[11px] uppercase tracking-wider font-bold text-zinc-600 whitespace-nowrap">
            <tr>
              <th className="px-3 py-2.5">Date session</th>
              <th className="px-3 py-2.5">Formation</th>
              <th className="px-3 py-2.5 text-center">Jours</th>
              <th className="px-3 py-2.5 text-center">Heures</th>
              <th className="px-3 py-2.5">Nom</th>
              <th className="px-3 py-2.5">Prénom</th>
              <th className="px-3 py-2.5">Fonction</th>
              <th className="px-3 py-2.5">N° tél</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5 text-right">Coût TTC</th>
              <th className="px-3 py-2.5">Société</th>
              <th className="px-3 py-2.5">Adresse</th>
              <th className="px-3 py-2.5">CP</th>
              <th className="px-3 py-2.5">Ville</th>
              <th className="px-3 py-2.5">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => {
              const ttc =
                r.amountHt != null && Number.isFinite(r.amountHt)
                  ? Math.round(r.amountHt * 1.2 * 100) / 100
                  : null;
              return (
                <tr
                  key={r.enrollmentId}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                >
                  {/* Date session */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300">
                      <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                      {formatDate(r.startDate)}
                    </span>
                  </td>
                  {/* Formation */}
                  <td className="px-3 py-2 max-w-[260px]">
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
                  {/* Jours */}
                  <td className="px-3 py-2 text-center text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {r.durationDays != null && r.durationDays > 0
                      ? Number.isInteger(r.durationDays)
                        ? r.durationDays
                        : r.durationDays.toFixed(1)
                      : "—"}
                  </td>
                  {/* Heures */}
                  <td className="px-3 py-2 text-center text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {r.durationHours != null && r.durationHours > 0
                      ? r.durationHours
                      : "—"}
                  </td>
                  {/* Nom apprenant */}
                  <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                    {r.learnerLastName ?? "—"}
                  </td>
                  {/* Prénom apprenant */}
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                    {r.learnerFirstName ?? "—"}
                  </td>
                  {/* Fonction */}
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {r.learnerJobTitle ?? "—"}
                  </td>
                  {/* N° tél */}
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                    {r.learnerPhone ?? "—"}
                  </td>
                  {/* Email */}
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {r.learnerEmail ? (
                      <a
                        href={`mailto:${r.learnerEmail}`}
                        className="hover:text-cyan-700 hover:underline"
                      >
                        {r.learnerEmail}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  {/* Coût TTC */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-bold text-emerald-700 dark:text-emerald-400">
                    {ttc !== null ? currencyFormatter.format(ttc) : "—"}
                  </td>
                  {/* Société */}
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                    {r.companyName ?? "—"}
                  </td>
                  {/* Adresse */}
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {r.companyAddress ?? "—"}
                  </td>
                  {/* CP */}
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 tabular-nums whitespace-nowrap">
                    {r.companyPostalCode ?? "—"}
                  </td>
                  {/* Ville */}
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {r.companyCity ?? "—"}
                  </td>
                  {/* Source */}
                  <td className="px-3 py-2 whitespace-nowrap">
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
