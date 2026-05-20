import { Fragment } from "react";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  Calendar,
  Clock,
  Handshake,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  Users,
} from "lucide-react";

export type InscriptionOverviewRow = {
  enrollmentId: string;
  sessionId: string | null;
  inscriptionRequestId: string | null;
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
  isInter: boolean | null;
  modality: string | null;
  formationTitle: string;
  durationDays: number | null;
  durationHours: number | null;
  /** Tarif HT applique pour cette inscription (quote_amount_ht). */
  amountHt: number | null;
  /** Source de l'inscription. */
  sourceKind: "direct" | "partenaire" | "of";
  /** Nom du partenaire si sourceKind ≠ "direct" */
  partnerName: string | null;
};

const MODALITY_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

/** Taux de TVA par defaut (modifiable par l'admin si besoin). */
const DEFAULT_VAT_RATE = 0.2;

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
  // Index du 1er apprenant d'une session deja PASSEE (start_date < aujourd'hui).
  // Le tri amont place les a-venir en tete, les passees a la fin.
  // On insere un bandeau separateur juste avant ce 1er apprenant passe.
  const todayIso = new Date().toISOString().slice(0, 10);
  const firstPastIdx = rows.findIndex(
    (r) => r.startDate !== null && r.startDate < todayIso,
  );
  const pastCount = firstPastIdx === -1 ? 0 : rows.length - firstPastIdx;

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

  // Index unique par session pour la coloration alternee (groupement
  // visuel : tous les apprenants d'une meme session partagent la meme
  // teinte de fond).
  const sessionColorIdx = new Map<string, number>();
  {
    let counter = 0;
    for (const row of rows) {
      const sid = row.sessionId ?? `_no_session_${row.enrollmentId}`;
      if (!sessionColorIdx.has(sid)) {
        sessionColorIdx.set(sid, counter++);
      }
    }
  }
  // Palette de 4 nuances tres claires, en rotation modulo 4
  const SESSION_BG_PALETTE = [
    "bg-white dark:bg-zinc-900",
    "bg-cyan-50/40 dark:bg-cyan-950/20",
    "bg-emerald-50/40 dark:bg-emerald-950/20",
    "bg-amber-50/40 dark:bg-amber-950/20",
  ];

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
              <th className="px-3 py-2.5">Apprenant</th>
              <th className="px-3 py-2.5 text-right">Budget</th>
              <th className="px-3 py-2.5">Entreprise</th>
              <th className="px-3 py-2.5">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              // Detection du changement de session pour la separation
              // visuelle : on epaissit la bordure entre deux groupes.
              const prev = idx > 0 ? rows[idx - 1] : null;
              const newSession = !prev || prev.sessionId !== r.sessionId;
              const tva =
                r.amountHt != null
                  ? Math.round(r.amountHt * DEFAULT_VAT_RATE * 100) / 100
                  : null;
              const ttc =
                r.amountHt != null && tva != null
                  ? Math.round((r.amountHt + tva) * 100) / 100
                  : null;
              // Le nom de la formation est cliquable :
              //   - si on a un inscription_request_id → ouvre la fiche
              //     inscription (vue 360° de cet apprenant sur cette session)
              //   - sinon → ouvre la fiche session
              const formationHref = r.inscriptionRequestId
                ? `/inscriptions/${r.inscriptionRequestId}`
                : r.sessionId
                  ? `/sessions/${r.sessionId}`
                  : null;
              // Couleur de fond selon l'index de session (rotation 4 couleurs)
              const sid = r.sessionId ?? `_no_session_${r.enrollmentId}`;
              const colorIdx = sessionColorIdx.get(sid) ?? 0;
              const bgClass = SESSION_BG_PALETTE[colorIdx % SESSION_BG_PALETTE.length];
              // Session deja passee : fond gris + opacite reduite pour
              // bien distinguer de la zone "a venir".
              const isPast = r.startDate !== null && r.startDate < todayIso;
              const rowBg = isPast
                ? "bg-zinc-100/60 dark:bg-zinc-900/40 text-zinc-500 dark:text-zinc-500"
                : bgClass;
              const isFirstPast = idx === firstPastIdx;
              return (
                <Fragment key={r.enrollmentId}>
                  {/* Bandeau separateur juste avant la 1ere ligne passee */}
                  {isFirstPast && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-2 bg-zinc-200 dark:bg-zinc-800 text-[11px] uppercase tracking-wider font-bold text-zinc-700 dark:text-zinc-300 border-y-2 border-zinc-400 dark:border-zinc-600"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          Sessions passées ({pastCount})
                        </span>
                      </td>
                    </tr>
                  )}
                <tr
                  className={
                    newSession
                      ? `border-t-2 border-zinc-300 dark:border-zinc-700 hover:brightness-95 ${rowBg}`
                      : `border-t border-zinc-100 dark:border-zinc-800/40 hover:brightness-95 ${rowBg}`
                  }
                >
                  {/* Date session */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300">
                      <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                      {formatDate(r.startDate)}
                    </span>
                  </td>
                  {/* Formation + INTER/INTRA + Modalite + duree j/h */}
                  <td className="px-3 py-2 max-w-[320px]">
                    {formationHref ? (
                      <Link
                        href={formationHref}
                        className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-cyan-700 hover:underline"
                        title="Ouvrir la fiche inscription"
                      >
                        {r.formationTitle}
                      </Link>
                    ) : (
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {r.formationTitle}
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {r.isInter !== null && (
                        <span
                          className={
                            r.isInter
                              ? "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cyan-50 text-cyan-700 border border-cyan-200"
                              : "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200"
                          }
                        >
                          {r.isInter ? "INTER" : "INTRA"}
                        </span>
                      )}
                      {r.modality && (
                        <span
                          className={
                            r.modality === "presentiel"
                              ? "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : r.modality === "hybride"
                                ? "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200"
                                : "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cyan-50 text-cyan-700 border border-cyan-200"
                          }
                        >
                          {MODALITY_LABELS[r.modality] ?? r.modality}
                        </span>
                      )}
                      {r.durationDays != null && r.durationDays > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400"
                          title="Nombre de jours"
                        >
                          <Calendar className="h-3 w-3 text-zinc-400" />
                          {Number.isInteger(r.durationDays)
                            ? `${r.durationDays} j`
                            : `${r.durationDays.toFixed(1)} j`}
                        </span>
                      )}
                      {r.durationHours != null && r.durationHours > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400"
                          title="Nombre d'heures"
                        >
                          <Clock className="h-3 w-3 text-zinc-400" />
                          {r.durationHours} h
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Apprenant : nom + prenom + fonction + tel + email */}
                  <td className="px-3 py-2 max-w-[260px]">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {[r.learnerLastName, r.learnerFirstName]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </div>
                    {r.learnerJobTitle && (
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1 mt-0.5">
                        <Briefcase className="h-3 w-3 text-zinc-400" />
                        {r.learnerJobTitle}
                      </div>
                    )}
                    {r.learnerPhone && (
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1">
                        <Phone className="h-3 w-3 text-zinc-400" />
                        {r.learnerPhone}
                      </div>
                    )}
                    {r.learnerEmail && (
                      <a
                        href={`mailto:${r.learnerEmail}`}
                        className="block text-[11px] text-cyan-700 hover:underline truncate"
                      >
                        <Mail className="h-3 w-3 inline mr-1 text-zinc-400" />
                        {r.learnerEmail}
                      </a>
                    )}
                  </td>

                  {/* Budget HT / TVA / TTC sur 3 lignes */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {r.amountHt != null ? (
                      <div className="space-y-0.5">
                        <div className="text-xs">
                          <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1">
                            HT
                          </span>
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            {currencyFormatter.format(r.amountHt)}
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1">
                            TVA 20%
                          </span>
                          <span className="text-zinc-600 dark:text-zinc-400">
                            {tva != null
                              ? currencyFormatter.format(tva)
                              : "—"}
                          </span>
                        </div>
                        <div className="text-xs">
                          <span className="text-[10px] uppercase tracking-wider text-emerald-700 mr-1">
                            TTC
                          </span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            {ttc != null
                              ? currencyFormatter.format(ttc)
                              : "—"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>

                  {/* Entreprise : nom + adresse + CP + Ville dans la meme cellule */}
                  <td className="px-3 py-2 max-w-[240px]">
                    {r.companyName ? (
                      <>
                        <div className="font-medium text-zinc-900 dark:text-zinc-100 inline-flex items-start gap-1">
                          <Building2 className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                          <span>{r.companyName}</span>
                        </div>
                        {(r.companyAddress ||
                          r.companyPostalCode ||
                          r.companyCity) && (
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-0.5 pl-4.5">
                            {r.companyAddress && (
                              <div className="inline-flex items-start gap-1">
                                <MapPin className="h-3 w-3 text-zinc-400 shrink-0 mt-0.5" />
                                <span>{r.companyAddress}</span>
                              </div>
                            )}
                            <div className="pl-4">
                              {[r.companyPostalCode, r.companyCity]
                                .filter(Boolean)
                                .join(" ")}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
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
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
