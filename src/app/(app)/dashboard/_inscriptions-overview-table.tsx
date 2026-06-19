"use client";

import { Fragment, useMemo, useState } from "react";
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
  /** Tarif HT applique pour cette inscription (quote_amount_ht ou
   *  fallback prix catalogue × jours si null). Mode "per_learner" uniquement. */
  amountHt: number | null;
  /** true si le tarif vient du fallback (pas saisi explicitement). */
  amountHtEstimated?: boolean;
  /** Mode de facturation : "per_learner" (par apprenant) ou "forfait"
   *  (montant global de session : forfait INTRA ou sous-traitance). */
  amountMode?: "per_learner" | "forfait";
  /** Montant HT du forfait de session (mode "forfait"). Affiché UNE SEULE
   *  fois, sur la 1re ligne de la session (Gilles 2026-06-12). */
  sessionAmount?: number | null;
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
  rows: allRows,
}: {
  rows: InscriptionOverviewRow[];
}) {
  // ── Filtre mois / année (Gilles 2026-06-19) — agrégation côté client ─────
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const r of allRows) {
      const y = r.startDate ? Number(r.startDate.slice(0, 4)) : NaN;
      if (Number.isFinite(y)) set.add(y);
    }
    if (set.size === 0) set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [allRows]);
  const [mode, setMode] = useState<"month" | "year">("month");
  const [year, setYear] = useState<number>(years[0]!);
  const [month, setMonth] = useState<number>(new Date().getMonth()); // 0-11

  // Lignes filtrées sur la période choisie (par date de session).
  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (!r.startDate) return false;
        if (Number(r.startDate.slice(0, 4)) !== year) return false;
        if (mode === "month" && Number(r.startDate.slice(5, 7)) - 1 !== month)
          return false;
        return true;
      }),
    [allRows, mode, year, month],
  );

  // Totaux de la période. Le forfait (INTRA/sous-traitance) est compté UNE
  // fois par session ; le per_learner est sommé par apprenant.
  const totals = useMemo(() => {
    let directHt = 0;
    let ofHt = 0;
    let totalHours = 0;
    const seenForfait = new Set<string>();
    for (const r of rows) {
      totalHours += r.durationHours ?? 0;
      const isOf = r.sourceKind === "of";
      let amt = 0;
      if (r.amountMode === "forfait") {
        const sid = r.sessionId ?? r.enrollmentId;
        if (seenForfait.has(sid)) continue;
        seenForfait.add(sid);
        amt = r.sessionAmount ?? 0;
      } else {
        amt = r.amountHt ?? 0;
      }
      if (isOf) ofHt += amt;
      else directHt += amt;
    }
    return {
      directHt,
      ofHt,
      totalHt: directHt + ofHt,
      nbApprenants: rows.length,
      totalHours,
    };
  }, [rows]);

  const MONTHS_FR = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];
  const periodLabel =
    mode === "month" ? `${MONTHS_FR[month]} ${year}` : `Année ${year}`;

  // Index du 1er apprenant d'une session deja PASSEE (start_date < aujourd'hui).
  const todayIso = new Date().toISOString().slice(0, 10);
  const firstPastIdx = rows.findIndex(
    (r) => r.startDate !== null && r.startDate < todayIso,
  );
  const pastCount = firstPastIdx === -1 ? 0 : rows.length - firstPastIdx;

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
  // 1re ligne (index) de chaque session : le forfait n'est affiché QUE là
  // (Gilles 2026-06-12 : "forfait affiché une seule fois").
  const firstRowIdxBySession = new Map<string, number>();
  rows.forEach((r, i) => {
    const sid = r.sessionId ?? `_no_session_${r.enrollmentId}`;
    if (!firstRowIdxBySession.has(sid)) firstRowIdxBySession.set(sid, i);
  });

  // Palette de 4 nuances tres claires, en rotation modulo 4
  const SESSION_BG_PALETTE = [
    "bg-white dark:bg-zinc-900",
    "bg-cyan-50/40 dark:bg-cyan-950/20",
    "bg-emerald-50/40 dark:bg-emerald-950/20",
    "bg-amber-50/40 dark:bg-amber-950/20",
  ];

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-start justify-between gap-2 p-4 border-b border-zinc-200 dark:border-zinc-800 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-cyan-600" />
            Apprenants inscrits par session
            <span className="text-xs font-medium text-zinc-500">
              ({rows.length} · {periodLabel})
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtre Par mois / Par année + sélecteurs */}
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
          {mode === "month" && (
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-7 rounded-md border border-zinc-300 text-xs px-2"
            >
              {MONTHS_FR.map((m, i) => (
                <option key={i} value={i}>
                  {m}
                </option>
              ))}
            </select>
          )}
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
          <Link
            href="/inscriptions"
            className="text-xs text-cyan-700 hover:underline"
          >
            Voir toutes →
          </Link>
        </div>
      </div>

      {/* Bandeau de totaux de la période */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 text-xs">
        <span className="inline-flex items-center gap-1">
          <span className="text-zinc-500">Apprenants :</span>
          <span className="font-bold tabular-nums">{totals.nbApprenants}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-zinc-500">Heures :</span>
          <span className="font-bold tabular-nums">{totals.totalHours} h</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-zinc-500">HT direct (CAP + presc.) :</span>
          <span className="font-bold tabular-nums text-cyan-700">
            {currencyFormatter.format(totals.directHt)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-zinc-500">Sous-total OF :</span>
          <span className="font-bold tabular-nums text-indigo-700">
            {currencyFormatter.format(totals.ofHt)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-zinc-500">Total HT :</span>
          <span className="font-black tabular-nums text-zinc-900 dark:text-zinc-100">
            {currencyFormatter.format(totals.totalHt)}
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-[11px] uppercase tracking-wider font-bold text-zinc-600 whitespace-nowrap">
            <tr>
              <th className="px-3 py-2.5">Date session</th>
              <th className="px-3 py-2.5">Formation</th>
              <th className="px-3 py-2.5">Apprenant</th>
              <th className="px-3 py-2.5 text-right">Heures</th>
              <th className="px-3 py-2.5 text-right">Budget</th>
              <th className="px-3 py-2.5">Entreprise</th>
              <th className="px-3 py-2.5">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="p-6 text-center text-sm text-zinc-500"
                >
                  Aucune inscription pour {periodLabel}.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => {
              // Detection du changement de session pour la separation
              // visuelle : on epaissit la bordure entre deux groupes.
              const prev = idx > 0 ? rows[idx - 1] : null;
              const newSession = !prev || prev.sessionId !== r.sessionId;
              // Mode forfait (INTRA / sous-traitance) : montant global de
              // session affiché UNE SEULE fois (1re ligne) ; les autres lignes
              // montrent « — forfait session » (Gilles 2026-06-12).
              const isForfaitMode = r.amountMode === "forfait";
              const sidAmt = r.sessionId ?? `_no_session_${r.enrollmentId}`;
              const isFirstOfSession =
                firstRowIdxBySession.get(sidAmt) === idx;
              const showForfaitHere = isForfaitMode && isFirstOfSession;
              const showForfaitPlaceholder = isForfaitMode && !isFirstOfSession;
              // Montant affiché dans la cellule : forfait (1re ligne) ou
              // montant par apprenant (mode per_learner).
              const cellAmount = isForfaitMode
                ? showForfaitHere
                  ? (r.sessionAmount ?? null)
                  : null
                : r.amountHt;
              const tva =
                cellAmount != null
                  ? Math.round(cellAmount * DEFAULT_VAT_RATE * 100) / 100
                  : null;
              const ttc =
                cellAmount != null && tva != null
                  ? Math.round((cellAmount + tva) * 100) / 100
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
                        colSpan={7}
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

                  {/* Heures par apprenant (durée de la session) — Gilles
                      2026-06-19. */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                    {r.durationHours != null && r.durationHours > 0 ? (
                      <span className="font-semibold">{r.durationHours} h</span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>

                  {/* Budget HT / TVA / TTC sur 3 lignes.
                      Mode forfait : montant de session affiché 1 seule fois. */}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {showForfaitPlaceholder ? (
                      <span
                        className="text-[10px] italic text-zinc-400"
                        title="Session au forfait : le montant global est indiqué sur la 1re ligne de la session."
                      >
                        — forfait session
                      </span>
                    ) : cellAmount != null ? (
                      <div className="space-y-0.5">
                        {isForfaitMode ? (
                          <div
                            className="text-[9px] uppercase tracking-wider font-bold text-indigo-700"
                            title="Montant global de la session (forfait journalier ou sous-traitance), pas un tarif par apprenant."
                          >
                            Forfait session
                          </div>
                        ) : (
                          r.amountHtEstimated && (
                            <div
                              className="text-[9px] uppercase tracking-wider font-bold text-amber-700"
                              title="Estimation = prix catalogue × jours. Saisissez un montant dans la fiche inscription pour fixer le prix réel."
                            >
                              ≈ estimé
                            </div>
                          )
                        )}
                        <div className="text-xs">
                          <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1">
                            HT
                          </span>
                          <span
                            className={
                              !isForfaitMode && r.amountHtEstimated
                                ? "font-bold text-zinc-600 dark:text-zinc-400 italic"
                                : "font-bold text-zinc-900 dark:text-zinc-100"
                            }
                          >
                            {currencyFormatter.format(cellAmount)}
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
                  {/* Source : 2 lignes (type + nom partenaire) pour
                      limiter la largeur quand le nom est long. */}
                  <td className="px-3 py-2 max-w-[180px]">
                    {r.sourceKind === "direct" ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200 text-[10px] font-bold uppercase tracking-wider dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                        CAP NUMÉRIQUE
                      </span>
                    ) : (
                      <div
                        className={
                          r.sourceKind === "of"
                            ? "inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 max-w-full"
                            : "inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded-md bg-violet-50 text-violet-700 border border-violet-200 max-w-full"
                        }
                        title={`Inscription via le portail ${r.sourceKind === "of" ? "OF" : "prescripteur"} ${r.partnerName ?? ""}`}
                      >
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
                          <Handshake className="h-3 w-3 shrink-0" />
                          {r.sourceKind === "of" ? "OF" : "Prescripteur"}
                        </span>
                        <span className="text-[11px] font-medium leading-tight break-words">
                          {r.partnerName ?? "?"}
                        </span>
                      </div>
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
