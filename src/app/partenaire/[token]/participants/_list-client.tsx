"use client";

import { useMemo, useState } from "react";
import { Building2, Search, Users, X } from "lucide-react";
import { ExportButtons } from "../_export-buttons";

export type ParticipantRow = {
  key: string;
  learnerName: string;
  companyName: string | null;
  formationTitle: string | null;
  startDate: string | null;
  endDate: string | null;
  modality: string | null;
  status: string | null;
  prePct: number | null;
  postPct: number | null;
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  if (!end || end === start) return formatDate(start);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameMonth =
    s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `${s.getDate()} – ${e.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function modalityLabel(m: string | null): string {
  return m === "presentiel"
    ? "Présentiel"
    : m === "hybride"
      ? "Hybride"
      : m === "distanciel"
        ? "Distanciel"
        : "—";
}

function statusLabel(s: string | null): string {
  return s === "confirmed"
    ? "Confirmée"
    : s === "cancelled"
      ? "Annulée"
      : s === "postponed"
        ? "Reportée"
        : s === "completed"
          ? "Terminée"
          : s === "in_progress"
            ? "En cours"
            : "Planifiée";
}

function rowStyle(
  s: string | null,
): "confirmed" | "cancelled" | "postponed" | null {
  return s === "confirmed"
    ? "confirmed"
    : s === "cancelled"
      ? "cancelled"
      : s === "postponed"
        ? "postponed"
        : null;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Badge de statut de session colore. */
function StatusBadge({ status }: { status: string | null }) {
  const label = statusLabel(status);
  const cls =
    status === "confirmed"
      ? "bg-emerald-100 text-emerald-800"
      : status === "cancelled"
        ? "bg-red-100 text-red-700"
        : status === "postponed"
          ? "bg-orange-100 text-orange-700"
          : status === "completed"
            ? "bg-zinc-100 text-zinc-600"
            : status === "in_progress"
              ? "bg-cyan-100 text-cyan-700"
              : "bg-amber-50 text-amber-700 border border-amber-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}

export function ParticipantsListClient({
  token,
  rows,
}: {
  token: string;
  rows: ParticipantRow[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return rows;
    return rows.filter((r) =>
      normalize(
        [
          r.learnerName,
          r.companyName ?? "",
          r.formationTitle ?? "",
          // Recherche par date : libellé FR (« 29 mai 2026 ») + ISO brut
          // (« 2026-05-29 ») pour couvrir « mai », « 2026 », « 29 mai »…
          formatDateRange(r.startDate, r.endDate),
          r.startDate ?? "",
          r.endDate ?? "",
        ].join(" "),
      ).includes(q),
    );
  }, [rows, query]);

  return (
    <div className="space-y-3">
      {/* Recherche */}
      <div className="rounded-2xl bg-white border border-zinc-200 p-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un apprenant, une société, une formation…"
            className="w-full h-10 pl-9 pr-9 rounded-md border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
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
      </div>

      {/* Compteur + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-zinc-500">
          {filtered.length} participation{filtered.length > 1 ? "s" : ""} sur{" "}
          {rows.length}
        </div>
        <ExportButtons
          token={token}
          disabled={filtered.length === 0}
          buildPayload={() => ({
            title: "Participants",
            subtitle: null,
            filterLabel: query.trim()
              ? `Recherche : « ${query.trim()} »`
              : "Tous les participants",
            filenameBase: "Participants",
            columns: [
              { header: "Apprenant", width: 2 },
              { header: "Société", width: 2 },
              { header: "Formation", width: 3 },
              { header: "Date(s)", width: 1.5 },
              { header: "Modalité", width: 1 },
              { header: "Statut", width: 1 },
            ],
            rows: filtered.map((r) => [
              r.learnerName,
              r.companyName ?? "—",
              r.formationTitle ?? "—",
              formatDateRange(r.startDate, r.endDate),
              modalityLabel(r.modality),
              statusLabel(r.status),
            ]),
            rowStyles: filtered.map((r) => rowStyle(r.status)),
          })}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Users className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-600">
            Aucun participant pour le moment. Les apprenants apparaîtront ici
            dès qu&apos;une session liée à votre structure aura des inscrits.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Search className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">
            Aucun participant ne correspond à votre recherche.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-zinc-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
              <tr>
                <th className="px-3 py-2 text-left">Apprenant</th>
                <th className="px-3 py-2 text-left">Société</th>
                <th className="px-3 py-2 text-left">Formation</th>
                <th className="px-3 py-2 text-left">Date(s)</th>
                <th className="px-3 py-2 text-left">Modalité</th>
                <th className="px-3 py-2 text-left">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((r) => (
                <tr key={r.key} className="hover:bg-zinc-50/50">
                  <td className="px-3 py-2 font-semibold text-zinc-900 whitespace-nowrap">
                    {r.learnerName}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {r.companyName ? (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-zinc-400 shrink-0" />
                        {r.companyName}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {r.formationTitle ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">
                    {formatDateRange(r.startDate, r.endDate)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">
                    {modalityLabel(r.modality)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
