"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  Clock,
  Mail,
  Phone,
  Search,
  UserCheck,
  X,
} from "lucide-react";

export type InscriptionRow = {
  id: string;
  received_at: string;
  learnerName: string;
  learnerEmail: string | null;
  learnerPhone: string | null;
  companyName: string | null;
  companyCity: string | null;
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
  formationTitle: string;
  durationHours: number | null;
  durationDays: number | null;
};

const MODALITY_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
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

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function InscriptionsList({ rows }: { rows: InscriptionRow[] }) {
  const [query, setQuery] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return rows;
    return rows.filter((r) => {
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
  }, [rows, query]);

  return (
    <div className="space-y-3">
      {/* Filtre texte */}
      <div className="rounded-xl bg-white border border-zinc-200 p-3 flex items-center gap-2 flex-wrap">
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
        <div className="text-xs text-zinc-500 px-1">
          {filtered.length} sur {rows.length}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6 text-center text-sm text-zinc-600">
          Aucun résultat pour votre recherche.
        </div>
      ) : (
        <>
        {/* === VUE MOBILE : cartes empilées (≤ md) === */}
        <div className="md:hidden space-y-3">
          {filtered.map((r) => {
            const isFinished = r.endDate && r.endDate < today;
            const isStarted = r.startDate && r.startDate <= today;
            const statusBadge = isFinished
              ? { label: "Terminée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" }
              : isStarted
                ? { label: "En cours", cls: "bg-amber-100 text-amber-700 border-amber-200" }
                : { label: "À venir", cls: "bg-cyan-100 text-cyan-700 border-cyan-200" };
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
                className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm text-zinc-900 leading-snug flex-1 min-w-0">
                    {r.formationTitle}
                  </h3>
                  <span
                    className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusBadge.cls}`}
                  >
                    {statusBadge.label}
                  </span>
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
                  <span className="inline-flex items-center gap-1 text-zinc-700 font-bold">
                    <Calendar className="h-3 w-3 text-zinc-400" />
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
              </article>
            );
          })}
        </div>

        {/* === VUE DESKTOP : tableau (≥ md) === */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <Th>Apprenant</Th>
                <Th>Entreprise</Th>
                <Th>Formation</Th>
                <Th>Dates</Th>
                <Th>Statut</Th>
                <Th>Inscrit le</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isFinished = r.endDate && r.endDate < today;
                const isStarted = r.startDate && r.startDate <= today;
                const statusBadge = isFinished
                  ? {
                      label: "Terminée",
                      cls: "bg-emerald-100 text-emerald-700 border-emerald-200",
                    }
                  : isStarted
                    ? {
                        label: "En cours",
                        cls: "bg-amber-100 text-amber-700 border-amber-200",
                      }
                    : {
                        label: "À venir",
                        cls: "bg-cyan-100 text-cyan-700 border-cyan-200",
                      };

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
                    className="border-t border-zinc-200 hover:bg-zinc-50/50 align-top"
                  >
                    {/* Apprenant + email + téléphone */}
                    <td className="px-3 py-3">
                      <div className="font-medium text-zinc-900">
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

                    {/* Dates */}
                    <td className="px-3 py-3 text-xs">
                      <div className="inline-flex items-center gap-1 text-zinc-700">
                        <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                        {formatDate(r.startDate)}
                      </div>
                      {r.endDate && r.endDate !== r.startDate && (
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          → {formatDate(r.endDate)}
                        </div>
                      )}
                    </td>

                    {/* Statut */}
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusBadge.cls}`}
                      >
                        {statusBadge.label}
                      </span>
                    </td>

                    {/* Inscrit le */}
                    <td className="px-3 py-3 text-xs text-zinc-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-zinc-400" />
                        {new Date(r.received_at).toLocaleDateString("fr-FR")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
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
