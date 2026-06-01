"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Search, Users, X } from "lucide-react";

export type ArchivedSession = {
  id: string;
  internal_code: string | null;
  start_date: string | null;
  end_date: string | null;
  is_inter: boolean | null;
  modality: string | null;
  formation_title: string | null;
  nb_learners: number;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Liste client-side des sessions archivees avec moteur de recherche
 * (Gilles 2026-06-01). Filtre par titre de formation, code interne ou
 * annee (1ere 4 chiffres de la date).
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
      <div className="rounded-2xl bg-white border border-zinc-200 p-3">
        <div className="relative">
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

      <div className="text-xs text-zinc-500">
        {filtered.length} session{filtered.length > 1 ? "s" : ""} sur{" "}
        {sessions.length}
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Aucune session archivée pour le moment. Les sessions apparaîtront ici
          une fois passées.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Aucune session ne correspond à votre recherche.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Formation</th>
                <th className="px-3 py-2 text-left">Modalité</th>
                <th className="px-3 py-2 text-center">Apprenants</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50/50">
                  <td className="px-3 py-2 text-xs">
                    <div className="inline-flex items-center gap-1.5 text-zinc-700 font-medium">
                      <Calendar className="h-3 w-3" />
                      {formatDate(s.start_date)}
                    </div>
                    {s.end_date && s.end_date !== s.start_date && (
                      <div className="text-[10px] text-zinc-500">
                        au {formatDate(s.end_date)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-semibold text-zinc-900">
                    {s.formation_title ?? "—"}
                    {s.internal_code && (
                      <div className="text-[10px] text-zinc-400 font-normal">
                        {s.internal_code}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {s.modality === "distanciel"
                      ? "Distanciel"
                      : s.modality === "presentiel"
                        ? "Présentiel"
                        : s.modality === "hybride"
                          ? "Hybride"
                          : "—"}
                    {s.is_inter !== null && (
                      <span className="ml-1 text-[10px] text-zinc-400">
                        {s.is_inter ? "(INTER)" : "(INTRA)"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={
                        s.nb_learners > 0
                          ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-cyan-100 text-cyan-700"
                          : "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-100 text-zinc-500"
                      }
                    >
                      <Users className="h-3 w-3" />
                      {s.nb_learners}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/partenaire/${token}/archives/${s.id}`}
                      className="text-xs text-cyan-700 hover:underline font-medium"
                    >
                      Voir détails →
                    </Link>
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
