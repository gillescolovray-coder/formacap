"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Globe,
  MapPin,
  Search,
  Users,
  X,
} from "lucide-react";
import { ExportButtons } from "../_export-buttons";

export type ArchivedSession = {
  id: string;
  internal_code: string | null;
  start_date: string | null;
  end_date: string | null;
  is_inter: boolean | null;
  modality: string | null;
  formation_title: string | null;
  nb_learners: number;
  /** Lieu de la formation (objet référencé OU texte libre fallback).
   *  Affiché sous la date dans la carte. Gilles 2026-06-01. */
  location_detail: {
    name: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
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
  const sameYear = s.getFullYear() === e.getFullYear();
  if (sameYear) {
    return `${s.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
    })} – ${e.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
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

function placeCell(s: ArchivedSession): string {
  if (s.modality === "distanciel") return "Distanciel";
  const loc = s.location_detail;
  if (!loc) return "—";
  return (
    [loc.name, [loc.postal_code, loc.city].filter(Boolean).join(" ")]
      .filter((x) => x && x.length > 0)
      .join(", ") || "—"
  );
}

/**
 * Liste des sessions archivees avec moteur de recherche
 * (Gilles 2026-06-01). Mise en forme harmonisee avec le catalogue :
 * cartes plutot que tableau, badges modalite/INTER-INTRA, badge
 * "Archivee" + compteur apprenants.
 */
export function ArchivesListClient({
  token,
  sessions,
}: {
  token: string;
  sessions: ArchivedSession[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return sessions;
    return sessions.filter((s) => {
      const haystack = normalize(
        [
          s.formation_title ?? "",
          s.internal_code ?? "",
          s.start_date ?? "",
          s.modality ?? "",
        ].join(" "),
      );
      return haystack.includes(q);
    });
  }, [sessions, query]);

  return (
    <div className="space-y-3">
      {/* Barre de recherche */}
      <div className="rounded-2xl bg-white border border-zinc-200 p-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une formation, un code, une date (2026)…"
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
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-zinc-500">
          {filtered.length} session{filtered.length > 1 ? "s" : ""} sur{" "}
          {sessions.length}
        </div>
        <ExportButtons
          token={token}
          disabled={filtered.length === 0}
          buildPayload={() => ({
            title: "Sessions archivées",
            subtitle: null,
            filterLabel: query.trim()
              ? `Recherche : « ${query.trim()} »`
              : "Toutes les sessions archivées",
            filenameBase: "Archives-sessions",
            columns: [
              { header: "Formation", width: 3 },
              { header: "Code", width: 1.2 },
              { header: "Date(s)", width: 1.5 },
              { header: "Modalité", width: 1 },
              { header: "Lieu", width: 2 },
              { header: "Apprenants", width: 1 },
            ],
            rows: filtered.map((s) => [
              s.formation_title ?? "(formation supprimée)",
              s.internal_code ?? "—",
              formatDateRange(s.start_date, s.end_date),
              modalityLabel(s.modality),
              placeCell(s),
              `${s.nb_learners}`,
            ]),
          })}
        />
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Calendar className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-600">
            Aucune session archivée pour le moment. Les sessions apparaîtront
            ici une fois passées.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Search className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">
            Aucune session ne correspond à votre recherche.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((s) => (
            <article
              key={s.id}
              className="rounded-2xl bg-white border-2 border-zinc-200 p-3 sm:p-5 flex flex-col gap-3 hover:border-cyan-400 hover:shadow-md transition-all"
            >
              {/* Header : titre + badges (Gilles 2026-06-01 : badges sur
                  une seule ligne pour gagner de la place vertical) */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-zinc-900 leading-snug">
                    {s.formation_title ?? "(formation supprimée)"}
                  </h2>
                  {s.internal_code && (
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {s.internal_code}
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex flex-row items-center gap-1 flex-wrap justify-end">
                  {s.modality === "presentiel" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                      <MapPin className="h-3 w-3" />
                      Présentiel
                    </span>
                  ) : s.modality === "hybride" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase tracking-wider">
                      <Globe className="h-3 w-3" />
                      Hybride
                    </span>
                  ) : s.modality === "distanciel" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold uppercase tracking-wider">
                      <Globe className="h-3 w-3" />
                      Distanciel
                    </span>
                  ) : null}
                  {s.is_inter !== null && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase tracking-wider">
                      {s.is_inter ? "INTER" : "INTRA"}
                    </span>
                  )}
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-200"
                    title="Session terminée"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Archivée
                  </span>
                </div>
              </div>

              {/* Date + lieu (presentiel/hybride) */}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div className="flex items-center gap-2 col-span-2 flex-wrap">
                  <Calendar className="h-4 w-4 text-zinc-500 shrink-0" />
                  <span className="text-sm font-bold text-zinc-900">
                    {formatDateRange(s.start_date, s.end_date)}
                  </span>
                </div>
                {(s.modality === "presentiel" ||
                  s.modality === "hybride") &&
                  s.location_detail && (
                    <div className="flex items-start gap-1.5 text-zinc-600 col-span-2">
                      <MapPin className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
                      <span className="text-zinc-700">
                        {s.location_detail.name && (
                          <span className="font-semibold">
                            {s.location_detail.name}
                          </span>
                        )}
                        {(() => {
                          const addrLine = [
                            s.location_detail.address,
                            [
                              s.location_detail.postal_code,
                              s.location_detail.city,
                            ]
                              .filter(Boolean)
                              .join(" "),
                          ]
                            .filter((x) => x && x.length > 0)
                            .join(", ");
                          if (!addrLine) return null;
                          return (
                            <span
                              className={
                                s.location_detail.name
                                  ? "block text-[11px] text-zinc-500"
                                  : ""
                              }
                            >
                              {addrLine}
                            </span>
                          );
                        })()}
                      </span>
                    </div>
                  )}
              </dl>

              {/* Footer : compteur apprenants + bouton */}
              <div className="mt-auto pt-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="inline-flex items-center gap-2">
                  <span
                    className={
                      s.nb_learners > 0
                        ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-100 text-cyan-800 text-sm font-bold"
                        : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-500 text-sm font-bold"
                    }
                  >
                    <Users className="h-4 w-4" />
                    {s.nb_learners}{" "}
                    {s.nb_learners > 1 ? "apprenants" : "apprenant"}
                  </span>
                  {s.nb_learners === 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 italic">
                      <Clock className="h-3 w-3" />
                      Aucune inscription
                    </span>
                  )}
                </div>
                <Link
                  href={`/partenaire/${token}/archives/${s.id}`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700"
                  title="Consulter le détail (apprenants + scores quiz)"
                >
                  Voir détails
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
