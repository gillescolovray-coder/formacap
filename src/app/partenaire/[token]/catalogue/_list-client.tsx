"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Clock,
  Euro,
  Globe,
  Mail,
  MapPin,
  Search,
  Star,
  X,
} from "lucide-react";

export type CatalogueSession = {
  id: string;
  reference: string | null;
  start_date: string | null;
  end_date: string | null;
  /** TRUE si format = intra (session dédiée au prescripteur). */
  is_intra: boolean;
  /** Modalité de la formation (presentiel, distanciel, hybride). */
  modality: string | null;
  formation: {
    id: string;
    title: string;
    subtitle: string | null;
    duration_hours: number | null;
  } | null;
  /** Prix HT effectif (override ou calculé), undefined si pas de tarif. */
  negotiated_price_ht: number | undefined;
  /** Source du prix : "override" (spécifique) ou "auto" (calculé). */
  price_source: "override" | "auto" | null;
  /** Explication courte pour l'utilisateur (ex: "85 € × 2 j"). */
  price_explain: string | null;
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function CatalogueList({
  token,
  partnerName,
  organizationEmail,
  sessions,
}: {
  token: string;
  partnerName: string;
  organizationEmail: string | null;
  sessions: CatalogueSession[];
}) {
  const [query, setQuery] = useState("");
  const [onlyNegotiated, setOnlyNegotiated] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return sessions.filter((s) => {
      if (onlyNegotiated && s.negotiated_price_ht === undefined) return false;
      if (!q) return true;
      const haystack = normalize(
        [
          s.formation?.title ?? "",
          s.formation?.subtitle ?? "",
          s.reference ?? "",
        ].join(" "),
      );
      return haystack.includes(q);
    });
  }, [sessions, query, onlyNegotiated]);

  const negotiatedCount = sessions.filter(
    (s) => s.negotiated_price_ht !== undefined,
  ).length;

  return (
    <div className="space-y-4">
      {/* Barre de recherche + filtre */}
      <div className="rounded-2xl bg-white border border-zinc-200 p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une formation, un sujet, une référence…"
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
        <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyNegotiated}
            onChange={(e) => setOnlyNegotiated(e.target.checked)}
            className="rounded border-zinc-300"
          />
          Tarif partenaire uniquement
          <span className="text-zinc-400">({negotiatedCount})</span>
        </label>
      </div>

      <div className="text-xs text-zinc-500">
        {filtered.length} session{filtered.length > 1 ? "s" : ""} sur{" "}
        {sessions.length}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Search className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">
            Aucune session ne correspond à votre recherche.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((s) => {
            const negotiated = s.negotiated_price_ht;
            const mailtoSubject = encodeURIComponent(
              `Demande de tarif partenaire — ${s.formation?.title ?? ""}`,
            );
            const mailtoBody = encodeURIComponent(
              `Bonjour,\n\nNous sommes intéressés par la session ${s.reference ?? ""} (${s.formation?.title ?? ""}) à partir du ${formatDate(s.start_date)}.\nPouvez-vous nous communiquer un tarif partenaire ?\n\nCordialement,\n${partnerName}`,
            );
            return (
              <article
                key={s.id}
                className="rounded-2xl bg-white border border-zinc-200 p-5 flex flex-col gap-3 hover:border-cyan-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-zinc-900 leading-snug">
                      {s.formation?.title ?? "(formation supprimée)"}
                    </h2>
                    {s.formation?.subtitle && (
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                        {s.formation.subtitle}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
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
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold uppercase tracking-wider">
                        <Globe className="h-3 w-3" />
                        Distanciel
                      </span>
                    )}
                    {s.is_intra && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider"
                        title="Session INTRA dédiée à votre structure"
                      >
                        <Star className="h-3 w-3" />
                        Session dédiée
                      </span>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-600">
                    <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                    {formatDate(s.start_date)}
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-600">
                    <Clock className="h-3.5 w-3.5 text-zinc-400" />
                    {s.formation?.duration_hours
                      ? `${s.formation.duration_hours} h`
                      : "—"}
                  </div>
                </dl>

                <div className="mt-auto pt-3 border-t border-zinc-100 flex items-end justify-between gap-3 flex-wrap">
                  {negotiated !== undefined ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">
                        Tarif partenaire
                        {s.price_source === "override" && (
                          <span className="ml-1 normal-case tracking-normal text-zinc-500 font-medium">
                            (négocié)
                          </span>
                        )}
                      </p>
                      <p className="text-xl font-bold text-emerald-700 tabular-nums inline-flex items-center gap-1">
                        <Euro className="h-4 w-4" />
                        {negotiated.toFixed(2)}{" "}
                        <span className="text-[11px] text-zinc-500 font-normal">
                          HT / apprenant
                        </span>
                      </p>
                      {s.price_explain && s.price_source === "auto" && (
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {s.price_explain}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                        Tarif à négocier
                      </p>
                      <a
                        href={`mailto:${organizationEmail ?? ""}?subject=${mailtoSubject}&body=${mailtoBody}`}
                        className="inline-flex items-center gap-1.5 text-sm text-cyan-700 hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Nous consulter
                      </a>
                    </div>
                  )}
                  {negotiated !== undefined ? (
                    <Link
                      href={`/partenaire/${token}/inscrire/${s.id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700"
                    >
                      Inscrire un apprenant
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
