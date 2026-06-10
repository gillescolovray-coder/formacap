"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Calendar,
  Check,
  Clock,
  FileSignature,
  FileSpreadsheet,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Printer,
  Search,
  Send,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { deleteInscription, updateInscription } from "./actions";

export type InscriptionRow = {
  id: string;
  received_at: string;
  learnerName: string;
  /** Découpé pour permettre l'édition dans le modal */
  learnerFirstName: string | null;
  learnerLastName: string | null;
  learnerJobTitle: string | null;
  learnerEmail: string | null;
  learnerPhone: string | null;
  companyName: string | null;
  companyCity: string | null;
  /** Pour le bouton "+ Ajouter un apprenant" (Gilles 2026-05-22). */
  companyId: string | null;
  sessionId: string | null;
  contact_referent: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    role: string | null;
  } | null;
  sessionRef: string | null;
  startDate: string | null;
  endDate: string | null;
  modality: string | null;
  /** Vrai statut de la session : confirmed, postponed, cancelled,
   *  planned, in_progress, completed, draft, archived (Gilles 2026-05-28). */
  sessionStatus: string | null;
  formationTitle: string;
  durationHours: number | null;
  durationDays: number | null;
  // Suivi metier des etapes — Gilles 2026-05-28
  isConfirmed: boolean;
  conventionStatus: string | null;
  conventionSentAt: string | null;
  conventionSignedAt: string | null;
  convocationSentAt: string | null;
};

type DateFilter = "all" | "upcoming" | "this_week" | "this_month" | "past";

const MODALITY_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

// Statut REEL de la session (Gilles 2026-05-28 : remplace l'ancien
// calcul base sur les dates qui ne correspondait pas a la realite
// metier). On simplifie l'affichage cote partenaire : seuls 3
// statuts sont parlants pour lui (les autres sont regroupes).
const SESSION_STATUS_DISPLAY: Record<
  string,
  { label: string; cls: string }
> = {
  confirmed: {
    label: "Confirmée",
    cls: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  postponed: {
    label: "Reportée",
    cls: "bg-amber-100 text-amber-800 border-amber-200",
  },
  cancelled: {
    label: "Annulée",
    cls: "bg-rose-100 text-rose-700 border-rose-200",
  },
  in_progress: {
    label: "En cours",
    cls: "bg-cyan-100 text-cyan-700 border-cyan-200",
  },
  completed: {
    label: "Terminée",
    cls: "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
  planned: {
    label: "Planifiée",
    cls: "bg-blue-100 text-blue-700 border-blue-200",
  },
  draft: {
    label: "Brouillon",
    cls: "bg-zinc-100 text-zinc-500 border-zinc-200",
  },
  archived: {
    label: "Archivée",
    cls: "bg-zinc-100 text-zinc-500 border-zinc-200",
  },
};

function sessionStatusInfo(status: string | null): {
  label: string;
  cls: string;
} {
  if (!status) {
    return {
      label: "—",
      cls: "bg-zinc-100 text-zinc-500 border-zinc-200",
    };
  }
  return (
    SESSION_STATUS_DISPLAY[status] ?? {
      label: status,
      cls: "bg-zinc-100 text-zinc-600 border-zinc-200",
    }
  );
}

function fmtDateTime(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/**
 * Composant des 4 mini-badges d'etapes par apprenant
 * (Gilles 2026-05-28) :
 *   1. Inscription confirmee (stage_id = 'confirmed')
 *   2. Convention envoyee (session_conventions.sent_at)
 *   3. Convention signee (session_conventions.signed_at)
 *   4. Convocation envoyee (session_enrollments.inscription_email_sent_at)
 *
 * Chaque badge : vert avec icone + check si etape OK, gris vide
 * sinon. Tooltip au survol pour le label complet + date.
 */
function StepBadges({ row }: { row: InscriptionRow }) {
  const steps: Array<{
    done: boolean;
    label: string;
    title: string;
    icon: React.ReactNode;
  }> = [
    {
      done: row.isConfirmed,
      label: "Insc",
      icon: <Check className="h-3 w-3" />,
      title: row.isConfirmed
        ? "Inscription confirmée"
        : "Inscription en attente de confirmation",
    },
    {
      done: !!row.conventionSentAt,
      label: "Env",
      icon: <Send className="h-3 w-3" />,
      title: row.conventionSentAt
        ? `Convention envoyée le ${fmtDateTime(row.conventionSentAt)}`
        : "Convention non encore envoyée",
    },
    {
      done: !!row.conventionSignedAt,
      label: "Sig",
      icon: <FileSignature className="h-3 w-3" />,
      title: row.conventionSignedAt
        ? `Convention signée le ${fmtDateTime(row.conventionSignedAt)}`
        : row.conventionStatus === "cancelled"
          ? "Convention annulée"
          : "Convention non encore signée",
    },
    {
      done: !!row.convocationSentAt,
      label: "Conv",
      icon: <Mail className="h-3 w-3" />,
      title: row.convocationSentAt
        ? `Convocation envoyée le ${fmtDateTime(row.convocationSentAt)}`
        : "Convocation non encore envoyée à l'apprenant",
    },
  ];
  return (
    <div className="flex flex-col gap-0.5 items-start">
      {steps.map((s, i) => (
        <span
          key={i}
          title={s.title}
          className={
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap " +
            (s.done
              ? "bg-emerald-100 text-emerald-700 border-emerald-300"
              : "bg-zinc-50 text-zinc-400 border-zinc-200")
          }
        >
          {s.icon}
          <span>{s.label}</span>
        </span>
      ))}
    </div>
  );
}

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

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function InscriptionsList({
  token,
  rows,
}: {
  token: string;
  rows: InscriptionRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = editingId ? rows.find((r) => r.id === editingId) ?? null : null;
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  // Période personnalisée (date de session) — Gilles 2026-06-09
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [editedAt, setEditedAt] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  // Impression : on horodate l'édition (date + heure) puis on imprime.
  function handlePrint() {
    const now = new Date();
    setEditedAt(
      `${now.toLocaleDateString("fr-FR")} à ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    );
    setTimeout(() => window.print(), 80);
  }

  // Calcul des bornes pour les filtres "Cette semaine" et "Ce mois"
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const monthEnd = new Date(now);
  monthEnd.setMonth(now.getMonth() + 1);
  const weekEndIso = weekEnd.toISOString().slice(0, 10);
  const monthEndIso = monthEnd.toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const base = rows.filter((r) => {
      // Filtre date
      if (dateFilter !== "all" && r.startDate) {
        if (dateFilter === "upcoming" && r.startDate < today) return false;
        if (dateFilter === "past" && r.startDate >= today) return false;
        if (
          dateFilter === "this_week" &&
          (r.startDate < today || r.startDate > weekEndIso)
        )
          return false;
        if (
          dateFilter === "this_month" &&
          (r.startDate < today || r.startDate > monthEndIso)
        )
          return false;
      }
      // Période personnalisée (sur la date de session)
      if (fromDate && (!r.startDate || r.startDate < fromDate)) return false;
      if (toDate && (!r.startDate || r.startDate > toDate)) return false;
      // Filtre texte
      if (!q) return true;
      const haystack = normalize(
        [
          r.learnerName,
          r.learnerEmail ?? "",
          r.learnerPhone ?? "",
          r.companyName ?? "",
          r.companyCity ?? "",
          r.formationTitle,
          r.sessionRef ?? "",
          r.contact_referent
            ? `${r.contact_referent.first_name ?? ""} ${r.contact_referent.last_name ?? ""} ${r.contact_referent.email ?? ""}`
            : "",
        ].join(" "),
      );
      return haystack.includes(q);
    });
    // Tri : « A venir » d'abord (start_date asc), puis passees a la fin
    // (start_date desc). Sessions sans start_date a la toute fin.
    return base.sort((a, b) => {
      const aStart = a.startDate ?? "";
      const bStart = b.startDate ?? "";
      if (!aStart && !bStart) return 0;
      if (!aStart) return 1;
      if (!bStart) return -1;
      const aFuture = aStart >= today;
      const bFuture = bStart >= today;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      // Memes camps : a venir asc, passees desc
      return aFuture
        ? aStart.localeCompare(bStart)
        : bStart.localeCompare(aStart);
    });
  }, [rows, query, dateFilter, fromDate, toDate, today, weekEndIso, monthEndIso]);

  const periodLabel =
    fromDate || toDate
      ? `Période : ${fromDate ? formatDate(fromDate) : "…"} → ${toDate ? formatDate(toDate) : "…"}`
      : dateFilter === "all"
        ? "Toutes les dates"
        : "Période filtrée";

  // Export Excel (.xlsx) — envoie les lignes filtrées à la route serveur.
  async function exportExcel() {
    setExporting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/partner/${token}/inscriptions/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: filtered, periodLabel }),
      });
      if (!res.ok) throw new Error("Export impossible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inscriptions-${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setActionError("Export Excel impossible. Réessayez.");
    } finally {
      setExporting(false);
    }
  }

  function doDelete(r: InscriptionRow) {
    if (
      !confirm(
        `Supprimer définitivement l'inscription de « ${r.learnerName} » à la formation « ${r.formationTitle} » ?\n\nL'apprenant ne recevra plus de convocation pour cette session. Cette action est irréversible.`,
      )
    )
      return;
    setActionError(null);
    startTransition(async () => {
      const res = await deleteInscription(token, r.id);
      if (!res.ok) {
        setActionError(res.error ?? "Erreur");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <style>{`
        /* Impression : format PAYSAGE + texte réduit (tableau large). */
        @page { size: A4 landscape; margin: 8mm; }
        @media print {
          body * { visibility: hidden !important; }
          .ins-print, .ins-print * { visibility: visible !important; }
          .ins-print {
            position: absolute; left: 0; top: 0; right: 0;
            border: 0 !important; border-radius: 0 !important;
            overflow: visible !important;
          }
          .no-print { display: none !important; }
          /* Police plus petite + cellules compactes pour tout faire tenir. */
          .ins-print table { font-size: 8.5px; width: 100%; }
          .ins-print th, .ins-print td {
            padding: 3px 5px !important; white-space: normal !important;
          }
          /* On masque les boutons d'action (modifier/supprimer/relance) dans le PDF. */
          .ins-print button { display: none !important; }
          /* Force les couleurs (statuts, en-tête). */
          .ins-print, .ins-print * {
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
        }
        .ins-print-header { display: none; }
        @media print { .ins-print-header { display: block; margin-bottom: 10px; } }
      `}</style>
      {/* Filtre texte + filtre date */}
      <div className="rounded-xl bg-white border border-zinc-200 p-3 flex items-center gap-2 flex-wrap no-print">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un apprenant, une entreprise, une formation…"
            className="w-full h-10 pl-9 pr-9 rounded-md border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1"
              title="Effacer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilter)}
          className="h-10 rounded-md border border-zinc-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
          title="Filtrer par date de session"
        >
          <option value="all">Toutes les dates</option>
          <option value="upcoming">À venir uniquement</option>
          <option value="this_week">Dans les 7 jours</option>
          <option value="this_month">Dans le mois</option>
          <option value="past">Sessions passées</option>
        </select>
        {/* Période personnalisée (date de session) */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-zinc-500">Du</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 px-2 text-sm"
            title="Date de début (session)"
          />
          <span className="text-zinc-500">au</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 px-2 text-sm"
            title="Date de fin (session)"
          />
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              className="text-zinc-400 hover:text-zinc-700 p-1"
              title="Effacer la période"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="text-xs text-zinc-500 px-1">
          {filtered.length} sur {rows.length}
        </div>
        {/* Exports */}
        <div className="flex items-center gap-2 ml-auto no-print">
          <button
            type="button"
            onClick={exportExcel}
            disabled={exporting || filtered.length === 0}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm font-semibold hover:bg-emerald-100 disabled:opacity-50"
            title="Exporter le tableau filtré au format Excel (.xlsx)"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Exporter Excel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50"
            title="Imprimer / Enregistrer en PDF le tableau filtré (format paysage)"
          >
            <Printer className="h-4 w-4" />
            Imprimer / PDF
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6 text-center text-sm text-zinc-600">
          Aucun résultat pour votre recherche.
        </div>
      ) : (
        <>
        {/* === VUE MOBILE : cartes empilées (≤ md) === */}
        <div className="md:hidden space-y-3">
          {(() => {
            // Alternance fond mobile par session — Gilles 2026-05-28
            const seenSessionsMobile = new Map<string, number>();
            let toggleMobile = 0;
            filtered.forEach((r) => {
              const sid = r.sessionId ?? "no-session";
              if (!seenSessionsMobile.has(sid)) {
                seenSessionsMobile.set(sid, toggleMobile);
                toggleMobile = toggleMobile === 0 ? 1 : 0;
              }
            });
            return filtered.map((r) => {
            const statusInfo = sessionStatusInfo(r.sessionStatus);
            const sid = r.sessionId ?? "no-session";
            const bgClass =
              seenSessionsMobile.get(sid) === 0 ? "bg-cyan-50/40" : "bg-white";
            const modalityLabel = r.modality
              ? MODALITY_LABELS[r.modality] ?? r.modality
              : null;
            const d = r.durationDays;
            const h = r.durationHours;
            const dayLabel =
              d != null && d > 0
                ? Number.isInteger(d) ? `${d} j` : `${d.toFixed(1)} j`
                : null;
            const hourLabel = h != null && h > 0 ? `${h} h` : null;
            const durationLabel =
              dayLabel && hourLabel ? `${dayLabel} / ${hourLabel}` : dayLabel ?? hourLabel ?? null;
            return (
              <article
                key={r.id}
                className={`rounded-xl border border-zinc-200 p-3 space-y-2 ${bgClass}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm text-zinc-900 leading-snug flex-1 min-w-0">
                    {r.formationTitle}
                  </h3>
                  <span
                    className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusInfo.cls}`}
                  >
                    {statusInfo.label}
                  </span>
                </div>
                {/* Etapes apprenant — 4 mini-badges */}
                <div>
                  <StepBadges row={r} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {modalityLabel && (
                    <span
                      className={
                        r.modality === "presentiel"
                          ? "inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold uppercase tracking-wider"
                          : r.modality === "hybride"
                            ? "inline-flex items-center px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold uppercase tracking-wider"
                            : "inline-flex items-center px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 font-bold uppercase tracking-wider"
                      }
                    >
                      {modalityLabel}
                    </span>
                  )}
                  {durationLabel && (
                    <span className="inline-flex items-center gap-0.5 text-zinc-600">
                      <Clock className="h-3 w-3 text-zinc-400" />
                      {durationLabel}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-zinc-900 font-extrabold text-sm">
                    <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                    {formatDate(r.startDate)}
                  </span>
                </div>
                <div className="pt-2 border-t border-zinc-100 space-y-1.5 text-xs">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
                      Apprenant
                    </span>
                    <p className="font-bold text-zinc-900">{r.learnerName}</p>
                    {r.learnerEmail && (
                      <a
                        href={`mailto:${r.learnerEmail}`}
                        className="inline-flex items-center gap-1 text-cyan-700 hover:underline break-all"
                      >
                        <Mail className="h-3 w-3" />
                        {r.learnerEmail}
                      </a>
                    )}
                    {r.learnerPhone && (
                      <span className="inline-flex items-center gap-1 text-zinc-600 ml-2">
                        <Phone className="h-3 w-3" />
                        {r.learnerPhone}
                      </span>
                    )}
                  </div>
                  {r.companyName && (
                    <div className="pt-1.5 border-t border-zinc-100">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        Entreprise
                      </span>
                      <p className="text-zinc-800">{r.companyName}</p>
                      {r.contact_referent && (
                        <div className="mt-1 pl-2 border-l-2 border-blue-200">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-blue-700 inline-flex items-center gap-1">
                            <UserCheck className="h-3 w-3" />
                            Référent
                          </span>
                          <p className="text-zinc-700">
                            {r.contact_referent.first_name}{" "}
                            {r.contact_referent.last_name}
                          </p>
                          {r.contact_referent.email && (
                            <a
                              href={`mailto:${r.contact_referent.email}`}
                              className="text-cyan-700 hover:underline break-all text-[11px]"
                            >
                              {r.contact_referent.email}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Actions Modifier / Supprimer en bas de carte */}
                <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100">
                  {/* Bouton "+ Ajouter un apprenant pour cette entreprise"
                      (Gilles 2026-05-22). Redirige vers le formulaire
                      d'inscription pré-rempli avec SIRET + référent. */}
                  {r.companyId && r.sessionId && (
                    <Link
                      href={`/partenaire/${token}/inscrire/${r.sessionId}?prefillCompanyId=${r.companyId}`}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Ajouter un apprenant pour {r.companyName ?? "cette entreprise"}
                    </Link>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(r.id)}
                      disabled={pending}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-zinc-300 bg-white text-zinc-700 text-xs font-medium hover:bg-cyan-50 hover:border-cyan-300 hover:text-cyan-700 disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => doDelete(r)}
                      disabled={pending}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-zinc-300 bg-white text-zinc-700 text-xs font-medium hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  </div>
                </div>
              </article>
            );
            });
          })()}
        </div>

        {/* === VUE DESKTOP : tableau (≥ md) === */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-zinc-200 bg-white ins-print">
          {/* En-tête imprimé (visible uniquement à l'impression / PDF) */}
          <div className="ins-print-header px-4 pt-3">
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>Mes inscriptions</h2>
            <div style={{ fontSize: 12, color: "#555" }}>
              {periodLabel} · {filtered.length} inscription
              {filtered.length > 1 ? "s" : ""}
            </div>
            {editedAt && (
              <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                Édité le {editedAt}
              </div>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <Th>Apprenant</Th>
                <Th>Entreprise</Th>
                <Th>Formation</Th>
                <Th>Date session</Th>
                <Th>Statut session</Th>
                <Th>Étapes apprenant</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Alternance fond par SESSION (Option A — Gilles 2026-05-28).
                // 2 sessions consecutives ont des fonds differents pour les
                // identifier visuellement.
                const seenSessions = new Map<string, number>();
                let toggle = 0;
                filtered.forEach((r) => {
                  const sid = r.sessionId ?? "no-session";
                  if (!seenSessions.has(sid)) {
                    seenSessions.set(sid, toggle);
                    toggle = toggle === 0 ? 1 : 0;
                  }
                });
                return filtered.map((r) => {
                const statusInfo = sessionStatusInfo(r.sessionStatus);
                const sid = r.sessionId ?? "no-session";
                const bgClass =
                  seenSessions.get(sid) === 0
                    ? "bg-cyan-50/40"
                    : "bg-white";

                const modalityLabel = r.modality
                  ? MODALITY_LABELS[r.modality] ?? r.modality
                  : null;
                const durDays = r.durationDays;
                const durHours = r.durationHours;
                const dayLabel =
                  durDays != null && durDays > 0
                    ? Number.isInteger(durDays)
                      ? `${durDays} j`
                      : `${durDays.toFixed(1)} j`
                    : null;
                const hourLabel =
                  durHours != null && durHours > 0 ? `${durHours} h` : null;
                const durationLabel =
                  dayLabel && hourLabel
                    ? `${dayLabel} / ${hourLabel}`
                    : dayLabel ?? hourLabel ?? null;

                return (
                  <tr
                    key={r.id}
                    className={`border-t border-zinc-200 align-top transition-colors hover:bg-amber-50/30 ${bgClass}`}
                  >
                    {/* Apprenant + email + téléphone */}
                    <td className="px-3 py-3">
                      <div className="font-bold text-zinc-900 text-sm">
                        {r.learnerName}
                      </div>
                      {r.learnerEmail && (
                        <div className="text-[11px] text-zinc-600 mt-1 inline-flex items-center gap-1">
                          <Mail className="h-3 w-3 text-zinc-400" />
                          <a
                            href={`mailto:${r.learnerEmail}`}
                            className="hover:underline break-all"
                          >
                            {r.learnerEmail}
                          </a>
                        </div>
                      )}
                      {r.learnerPhone && (
                        <div className="text-[11px] text-zinc-600 inline-flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3 text-zinc-400" />
                          {r.learnerPhone}
                        </div>
                      )}
                    </td>

                    {/* Entreprise + référent pédagogique en dessous */}
                    <td className="px-3 py-3">
                      <div className="font-medium text-zinc-900 inline-flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                        {r.companyName ?? "—"}
                      </div>
                      {r.companyCity && (
                        <div className="text-[11px] text-zinc-500 mt-0.5 pl-5">
                          {r.companyCity}
                        </div>
                      )}
                      {r.contact_referent && (
                        <div className="mt-1.5 pl-5 border-l-2 border-blue-200 ml-1.5 pl-2">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-blue-700 inline-flex items-center gap-1">
                            <UserCheck className="h-3 w-3" />
                            Référent
                          </p>
                          <div className="text-[11px] text-zinc-700">
                            {r.contact_referent.first_name}{" "}
                            {r.contact_referent.last_name}
                          </div>
                          {r.contact_referent.email && (
                            <a
                              href={`mailto:${r.contact_referent.email}`}
                              className="text-[11px] text-cyan-700 hover:underline break-all"
                            >
                              {r.contact_referent.email}
                            </a>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Formation + modalité + durée */}
                    <td className="px-3 py-3">
                      <div className="font-medium text-zinc-800">
                        {r.formationTitle}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
                        {modalityLabel && (
                          <span
                            className={
                              r.modality === "presentiel"
                                ? "inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold uppercase tracking-wider"
                                : r.modality === "hybride"
                                  ? "inline-flex items-center px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold uppercase tracking-wider"
                                  : "inline-flex items-center px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 font-bold uppercase tracking-wider"
                            }
                          >
                            {modalityLabel}
                          </span>
                        )}
                        {durationLabel && (
                          <span className="inline-flex items-center gap-0.5 text-zinc-600">
                            <Clock className="h-3 w-3 text-zinc-400" />
                            {durationLabel}
                          </span>
                        )}
                      </div>
                      {r.sessionRef && (
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          Réf. {r.sessionRef}
                        </div>
                      )}
                    </td>

                    {/* Date session (en GRAS — Gilles 2026-05-28) */}
                    <td className="px-3 py-3 text-xs">
                      <div className="inline-flex items-center gap-1 text-zinc-900 font-bold text-sm">
                        <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                        {formatDate(r.startDate)}
                      </div>
                      {r.endDate && r.endDate !== r.startDate && (
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          → {formatDate(r.endDate)}
                        </div>
                      )}
                      <div className="text-[10px] text-zinc-400 mt-1 inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Inscrit le{" "}
                        {new Date(r.received_at).toLocaleDateString("fr-FR")}
                      </div>
                    </td>

                    {/* Statut SESSION reel (confirmee / reportee /
                        annulee... — Gilles 2026-05-28). */}
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusInfo.cls}`}
                      >
                        {statusInfo.label}
                      </span>
                    </td>

                    {/* Etapes par apprenant (4 mini-badges) */}
                    <td className="px-3 py-3">
                      <StepBadges row={r} />
                    </td>

                    {/* Actions Ajouter / Modifier / Supprimer
                        (Gilles 2026-05-22 : icônes agrandies + couleurs
                        plus contrastées pour meilleure lisibilité). */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {/* Bouton "+ Ajouter apprenant pour entreprise" */}
                        {r.companyId && r.sessionId && (
                          <Link
                            href={`/partenaire/${token}/inscrire/${r.sessionId}?prefillCompanyId=${r.companyId}`}
                            className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500 transition-colors"
                            title={`Ajouter un autre apprenant pour ${r.companyName ?? "cette entreprise"}`}
                          >
                            <UserPlus className="h-5 w-5" strokeWidth={2.25} />
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingId(r.id)}
                          disabled={pending}
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-cyan-50 border border-cyan-300 text-cyan-700 hover:bg-cyan-100 hover:border-cyan-500 transition-colors disabled:opacity-30"
                          title="Modifier les coordonnées de l'apprenant"
                        >
                          <Pencil className="h-5 w-5" strokeWidth={2.25} />
                        </button>
                        <button
                          type="button"
                          onClick={() => doDelete(r)}
                          disabled={pending}
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 hover:border-rose-500 transition-colors disabled:opacity-30"
                          title="Supprimer l'inscription"
                        >
                          <Trash2 className="h-5 w-5" strokeWidth={2.25} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              });
              })()}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Modal d'édition réutilisé depuis l'onglet À valider */}
      {editingRow && (
        <EditInscriptionModal
          token={token}
          requestId={editingRow.id}
          initial={{
            first_name: editingRow.learnerFirstName,
            last_name: editingRow.learnerLastName,
            email: editingRow.learnerEmail,
            phone: editingRow.learnerPhone,
            job_title: editingRow.learnerJobTitle,
          }}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// Modal d'édition (inline) — reprend le pattern de l'onglet À valider
// ============================================================

function EditInscriptionModal({
  token,
  requestId,
  initial,
  onClose,
}: {
  token: string;
  requestId: string;
  initial: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    job_title: string | null;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(initial.first_name ?? "");
  const [lastName, setLastName] = useState(initial.last_name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [jobTitle, setJobTitle] = useState(initial.job_title ?? "");

  function submit() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Prénom et nom obligatoires.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Email invalide.");
      return;
    }
    startTransition(async () => {
      const res = await updateInscription(token, requestId, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        job_title: jobTitle.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 sticky top-0 bg-white">
          <h2 className="font-bold text-zinc-900 text-base">
            Modifier l&apos;apprenant
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-zinc-500 italic">
            Corrigez les informations de l&apos;apprenant. La modification
            sera synchronisée avec la fiche admin de CAP NUMÉRIQUE.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModalField label="Prénom" required value={firstName} onChange={setFirstName} />
            <ModalField label="Nom" required value={lastName} onChange={setLastName} />
            <ModalField
              label="Email"
              required
              type="email"
              value={email}
              onChange={setEmail}
              className="sm:col-span-2"
            />
            <ModalField label="Téléphone" value={phone} onChange={setPhone} placeholder="06 …" />
            <ModalField
              label="Fonction"
              value={jobTitle}
              onChange={setJobTitle}
              placeholder="Ex : Chargé de mission"
            />
          </div>
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end p-4 border-t border-zinc-200 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-md border border-zinc-300 bg-white text-zinc-700 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700 disabled:opacity-50"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] uppercase tracking-wider font-bold text-zinc-600 mb-1">
        {label}
        {required && <span className="text-rose-600 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full px-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
      />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[11px] uppercase tracking-wider font-bold text-zinc-600 px-3 py-2.5">
      {children}
    </th>
  );
}
