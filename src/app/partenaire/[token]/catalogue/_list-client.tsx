"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Euro,
  FileText,
  Globe,
  Handshake,
  Mail,
  MapPin,
  Search,
  Star,
  Users,
  X,
} from "lucide-react";
import { ExportButtons } from "../_export-buttons";
import {
  SessionCalendar,
  type CalendarEvent,
} from "@/components/session-calendar";

export type CatalogueSession = {
  id: string;
  reference: string | null;
  start_date: string | null;
  end_date: string | null;
  /** TRUE si format = intra (session dédiée au prescripteur). */
  is_intra: boolean;
  /** TRUE si ce partenaire est le prescripteur référent de la session
   *  (qu'elle soit INTRA ou INTER). Sert au filtre « Mes sessions ». */
  is_own: boolean;
  /** TRUE si cet OF est le donneur d'ordre (CAP est sous-traitant).
   *  Affichage avec couleur dédiée. Gilles 2026-06-01. */
  is_subcontracting: boolean;
  /** Modalité de la formation (presentiel, distanciel, hybride). */
  modality: string | null;
  /** Statut de la session : "planned" | "confirmed" | ... */
  status: string;
  /** Nombre d'apprenants déjà inscrits (non annulés). */
  enrolled_count: number;
  /** Capacité maximale de la session (peut être null si non défini). */
  max_participants: number | null;
  formation: {
    id: string;
    title: string;
    subtitle: string | null;
    duration_hours: number | null;
    /** Durée en jours pour l'affichage « N j / Hh ». */
    duration_days: number | null;
    /** URL publique du PDF du programme de formation (Qualiopi). */
    programme_pdf_url: string | null;
  } | null;
  /** Lieu détaillé pour le présentiel/hybride (référencé ou texte libre). */
  location_detail: {
    name: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
  /** Visio pour le distanciel/hybride : application + lien de connexion. */
  visio: {
    app: string | null;
    link: string | null;
  } | null;
  /** Prix HT effectif (override ou calculé), undefined si pas de tarif. */
  negotiated_price_ht: number | undefined;
  /** Source du prix : "override" (spécifique) ou "auto" (calculé). */
  price_source: "override" | "auto" | null;
  /** Explication courte pour l'utilisateur (ex: "85 € × 2 j"). */
  price_explain: string | null;
  /** Mode de tarification (Gilles 2026-06-01) :
   *  - "per_learner" : prix par apprenant (catalogue distanciel classique)
   *  - "flat_per_day" : forfait journalier (sous-traitance, indep. du nb
   *    d apprenants)
   *  - null : pas de tarif disponible */
  pricing_mode: "per_learner" | "flat_per_day" | null;
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Formate une plage de dates pour l'en-tête de carte session :
 *   - 1 jour              → « 3 juin 2026 »
 *   - même mois & année   → « 3 – 5 juin 2026 »
 *   - mois ou année ≠     → « 3 juin – 7 juillet 2026 »
 *   - sans end_date       → fallback formatDate(start_date)
 */
function formatDateRange(
  start: string | null,
  end: string | null,
): string {
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

function statusLabel(s: string): string {
  return s === "confirmed"
    ? "Confirmée"
    : s === "cancelled"
      ? "Annulée"
      : s === "postponed"
        ? "Reportée"
        : "Planifiée";
}

/**
 * Cellule « Lieu / Visio » pour l export (Gilles 2026-06-23) :
 *   - distanciel : uniquement le nom de l application visio (sans l URL)
 *   - présentiel / hybride : adresse complète du lieu de formation
 */
function placeCell(s: CatalogueSession): string {
  if (s.modality === "distanciel") return s.visio?.app ?? "Distanciel";
  const loc = s.location_detail;
  if (!loc) return s.visio?.app ?? "—";
  return (
    [
      loc.name,
      loc.address,
      [loc.postal_code, loc.city].filter(Boolean).join(" "),
    ]
      .filter((x) => x && x.length > 0)
      .join(", ") || "—"
  );
}

export function CatalogueList({
  token,
  partnerName,
  organizationEmail,
  sessions,
  partnerType,
  holidayDays,
  holidayZoneLabel,
}: {
  token: string;
  partnerName: string;
  organizationEmail: string | null;
  sessions: CatalogueSession[];
  /** Type du partenaire — change le libelle du filtre (Donneur d ordre
   *  pour les OF, Prescripteur pour les prescripteurs). Gilles 2026-06-01. */
  partnerType: "of" | "prescripteur";
  /** Jours de vacances scolaires { "YYYY-MM-DD": libellé } (zone partenaire). */
  holidayDays?: Record<string, string>;
  holidayZoneLabel?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [onlyOwn, setOnlyOwn] = useState(false);

  const isOf = partnerType === "of";
  // Selon le type de partenaire, "mes sessions" = sessions ou il est :
  //   - donneur d ordre (OF) -> is_subcontracting
  //   - prescripteur referent (Prescripteur) -> is_own
  // Inclut les 2 pour les edges cases (prescripteur qui est aussi
  // donneur d ordre, et reciproquement).
  const matchesMine = (s: CatalogueSession): boolean =>
    isOf ? s.is_subcontracting : s.is_own || s.is_subcontracting;

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return sessions.filter((s) => {
      if (onlyOwn && !matchesMine(s)) return false;
      if (!q) return true;
      const haystack = normalize(
        [
          s.formation?.title ?? "",
          s.formation?.subtitle ?? "",
          s.reference ?? "",
          // Recherche aussi sur le LIEU (présentiel) et l'appli visio
          // (distanciel) — Gilles 2026-06-15.
          s.location_detail?.name ?? "",
          s.location_detail?.address ?? "",
          s.location_detail?.postal_code ?? "",
          s.location_detail?.city ?? "",
          s.visio?.app ?? "",
          // Recherche par DATE (ex. « juin 2027 », « 23 juin ») — libellé FR +
          // ISO brut. Gilles 2026-06-23 (rétabli après ajout du calendrier).
          formatDateRange(s.start_date, s.end_date),
          s.start_date ?? "",
          s.end_date ?? "",
        ].join(" "),
      );
      return haystack.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, query, onlyOwn, isOf]);

  // Événements pour la vue calendrier (Mois/Semaine) — reflète le filtrage.
  const calendarEvents: CalendarEvent[] = useMemo(
    () =>
      filtered.map((s) => ({
        id: s.id,
        title: s.formation?.title ?? "(formation supprimée)",
        startDate: s.start_date,
        endDate: s.end_date,
        status: s.status,
        modality: s.modality,
        href:
          s.status === "cancelled"
            ? null
            : `/partenaire/${token}/inscrire/${s.id}`,
        meta: placeCell(s),
      })),
    [filtered, token],
  );

  const mineCount = sessions.filter(matchesMine).length;
  const mineLabel = isOf ? "Donneur d'ordre uniquement" : "Prescripteur uniquement";
  const mineTitle = isOf
    ? "Filtrer pour ne voir que les sessions où vous êtes donneur d'ordre"
    : "Filtrer pour ne voir que les sessions où vous êtes prescripteur référent";

  return (
    <div className="space-y-4">
      {/* Bloc filtres + recherche fusionnes sur une seule ligne
          (Gilles 2026-06-01) — gain de place vertical. Le segmented
          control "Tout / Mon role" est colle a gauche, la barre de
          recherche occupe le reste de la largeur. Sur mobile, le
          flex-wrap fait passer la recherche sous le segmented. */}
      <div className="rounded-2xl bg-white border border-zinc-200 p-2 flex items-center gap-2 flex-wrap">
        {mineCount > 0 && (
          <div className="rounded-full bg-zinc-50 border border-zinc-200 p-1 inline-flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setOnlyOwn(false)}
              className={
                !onlyOwn
                  ? "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-600 text-white text-xs font-bold shadow"
                  : "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-zinc-600 hover:text-cyan-700 text-xs font-medium"
              }
              title="Voir tout le catalogue"
            >
              Tout
              <span className={!onlyOwn ? "text-cyan-100" : "text-zinc-400"}>
                ({sessions.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setOnlyOwn(true)}
              className={
                onlyOwn
                  ? "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold shadow"
                  : "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-indigo-700 hover:bg-indigo-50 text-xs font-medium"
              }
              title={mineTitle}
            >
              <Handshake className="h-3.5 w-3.5" />
              {mineLabel}
              <span className={onlyOwn ? "text-indigo-100" : "text-indigo-400"}>
                ({mineCount})
              </span>
            </button>
          </div>
        )}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une formation, un sujet, un lieu, une référence…"
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
          buildPayload={() => {
            const filterParts: string[] = [];
            if (onlyOwn) filterParts.push(mineLabel);
            if (query.trim()) filterParts.push(`Recherche : « ${query.trim()} »`);
            const filterLabel =
              filterParts.length > 0 ? filterParts.join(" · ") : "Tout le catalogue";
            return {
              title: "Catalogue des sessions",
              subtitle: partnerName,
              filterLabel,
              filenameBase: "Catalogue-sessions",
              columns: [
                { header: "Formation", width: 3 },
                { header: "Date(s)", width: 1.5 },
                { header: "Modalité", width: 1 },
                { header: "Lieu / Visio", width: 2 },
                { header: "Statut", width: 1 },
                { header: "Inscrits", width: 1 },
              ],
              rows: filtered.map((s) => [
                s.formation?.title ?? "(formation supprimée)",
                formatDateRange(s.start_date, s.end_date),
                modalityLabel(s.modality),
                placeCell(s),
                statusLabel(s.status),
                s.max_participants !== null
                  ? `${s.enrolled_count} / ${s.max_participants}`
                  : `${s.enrolled_count}`,
              ]),
              rowStyles: filtered.map((s) =>
                s.status === "confirmed"
                  ? ("confirmed" as const)
                  : s.status === "cancelled"
                    ? ("cancelled" as const)
                    : s.status === "postponed"
                      ? ("postponed" as const)
                      : null,
              ),
            };
          }}
        />
      </div>

      <SessionCalendar
        events={calendarEvents}
        storageKey="partner-catalogue"
        holidayDays={holidayDays}
        holidayZoneLabel={holidayZoneLabel}
      >
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Search className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">
            Aucune session ne correspond à votre recherche.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
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
                className={(() => {
                  // Hierarchie visuelle (Gilles 2026-06-01) :
                  //   1. ANNULEE / REPORTEE -> tres atténué (opacity, gris,
                  //      titre barre pour cancelled)
                  //   2. CONFIRMEE -> forte mise en evidence (bordure 2px,
                  //      fond emerald sature, shadow visible).
                  //      Si "Mes sessions" + confirmee : indigo bien marque.
                  //   3. PLANIFIEE / DRAFT -> visibilite normale (bordure
                  //      pale, fond blanc/leger, pas de shadow).
                  //      Si "Mes sessions" : indigo pale.
                  const base =
                    "rounded-2xl p-3 sm:p-5 flex flex-col gap-3 transition-all";
                  if (s.status === "cancelled") {
                    return `${base} bg-zinc-50 border-2 border-dashed border-red-200 opacity-60 hover:opacity-80`;
                  }
                  if (s.status === "postponed") {
                    return `${base} bg-orange-50/40 border-2 border-dashed border-orange-300 opacity-75 hover:opacity-100`;
                  }
                  const isMine = s.is_own || s.is_subcontracting;
                  const isConfirmed = s.status === "confirmed";
                  if (isMine && isConfirmed) {
                    return `${base} bg-indigo-100 border-2 border-indigo-400 shadow-md hover:border-indigo-500 hover:shadow-lg`;
                  }
                  if (isMine) {
                    return `${base} bg-white border border-indigo-200 hover:border-indigo-300`;
                  }
                  if (isConfirmed) {
                    return `${base} bg-emerald-100 border-2 border-emerald-400 shadow-md hover:border-emerald-500 hover:shadow-lg`;
                  }
                  if (s.modality === "distanciel") {
                    return `${base} bg-white border border-cyan-200 hover:border-cyan-300`;
                  }
                  return `${base} bg-white border border-zinc-200 hover:border-zinc-300`;
                })()}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h2
                      className={
                        s.status === "cancelled"
                          ? "font-bold text-zinc-500 line-through leading-snug"
                          : "font-bold text-zinc-900 leading-snug"
                      }
                    >
                      {s.formation?.title ?? "(formation supprimée)"}
                    </h2>
                    {s.formation?.subtitle && (
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                        {s.formation.subtitle}
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
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold uppercase tracking-wider">
                        <Globe className="h-3 w-3" />
                        Distanciel
                      </span>
                    )}
                    {s.is_subcontracting && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider border border-indigo-200"
                        title="Vous êtes le donneur d'ordre — CAP NUMÉRIQUE est sous-traitant"
                      >
                        <Handshake className="h-3 w-3" />
                        Vous donneur d&apos;ordre
                      </span>
                    )}
                    {s.is_own && !s.is_subcontracting && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider border border-indigo-200"
                        title="Vous êtes le prescripteur référent de cette session"
                      >
                        <Handshake className="h-3 w-3" />
                        Vous prescripteur
                      </span>
                    )}
                    {s.is_intra && !s.is_own && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider"
                        title="Session INTRA dédiée"
                      >
                        <Star className="h-3 w-3" />
                        INTRA
                      </span>
                    )}
                    {s.status === "confirmed" ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 text-[10px] font-bold uppercase tracking-wider"
                        title="Session confirmée — démarrage garanti"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Confirmée
                      </span>
                    ) : s.status === "cancelled" ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider border border-red-200"
                        title="Session annulée"
                      >
                        Annulée
                      </span>
                    ) : s.status === "postponed" ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold uppercase tracking-wider border border-orange-200"
                        title="Session reportée à plus tard"
                      >
                        Reportée
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-200"
                        title="Session planifiée — démarrage selon atteinte du seuil d'apprenants"
                      >
                        Planifiée
                      </span>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  {/* Date(s) en gras et plus grosse, durée à la suite */}
                  <div className="flex items-center gap-2 col-span-2 flex-wrap">
                    <Calendar className="h-4 w-4 text-zinc-500 shrink-0" />
                    <span className="text-sm font-bold text-zinc-900">
                      {formatDateRange(s.start_date, s.end_date)}
                    </span>
                    {(() => {
                      const h = s.formation?.duration_hours;
                      const d = s.formation?.duration_days;
                      const dayLabel =
                        d != null && d > 0
                          ? Number.isInteger(d)
                            ? `${d} j`
                            : `${d.toFixed(1)} j`
                          : null;
                      const hourLabel =
                        h != null && h > 0 ? `${h} h` : null;
                      const dur =
                        dayLabel && hourLabel
                          ? `${dayLabel} / ${hourLabel}`
                          : dayLabel ?? hourLabel ?? null;
                      if (!dur) return null;
                      return (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                          <Clock className="h-3.5 w-3.5 text-zinc-400" />
                          {dur}
                        </span>
                      );
                    })()}
                  </div>
                  {/* Ligne lieu (présentiel/hybride) — passe en pleine largeur */}
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
                  {/* Ligne visio (distanciel/hybride) — appli + lien cliquable */}
                  {(s.modality === "distanciel" ||
                    s.modality === "hybride") &&
                    s.visio && (
                      <div className="flex items-start gap-1.5 text-zinc-600 col-span-2">
                        <Globe className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
                        <span className="text-zinc-700">
                          {s.visio.app && (
                            <span className="font-semibold">
                              {s.visio.app}
                            </span>
                          )}
                          {s.visio.link && (
                            <a
                              href={s.visio.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={
                                s.visio.app
                                  ? "block text-[11px] text-cyan-700 hover:underline break-all"
                                  : "text-cyan-700 hover:underline break-all"
                              }
                              title="Ouvrir le lien de connexion"
                            >
                              {s.visio.link}
                            </a>
                          )}
                        </span>
                      </div>
                    )}
                  <div className="flex items-center gap-1.5 text-zinc-600 col-span-2">
                    <Users className="h-3.5 w-3.5 text-zinc-400" />
                    {(() => {
                      const max = s.max_participants;
                      const cur = s.enrolled_count;
                      const isFull = max !== null && cur >= max;
                      return (
                        <span
                          className={
                            isFull
                              ? "font-bold text-rose-700"
                              : max !== null && cur >= max * 0.8
                                ? "font-bold text-amber-700"
                                : "text-zinc-700"
                          }
                        >
                          {cur}
                          {max !== null ? ` / ${max}` : ""} inscrit
                          {cur > 1 ? "s" : ""}
                          {isFull && " — Complet"}
                        </span>
                      );
                    })()}
                  </div>
                </dl>

                <div className="mt-auto pt-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                  {/* Zone tarification — masquee cote OF tant que la
                      facturation backoffice n est pas finalisee
                      (Gilles 2026-06-01). A reactiver via le helper
                      computeEffectivePartnerPrice quand le mode
                      flat_per_day sera repercute dans inscription_requests.
                      Cf. project_pending_of_tarif_unmask.md. */}
                  {isOf ? (
                    <div />
                  ) : negotiated !== undefined ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">
                        {s.pricing_mode === "flat_per_day"
                          ? "Tarif sous-traitance"
                          : "Tarif partenaire"}
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
                          {s.pricing_mode === "flat_per_day"
                            ? "HT (forfait pour la session)"
                            : "HT / apprenant"}
                        </span>
                      </p>
                      {s.pricing_mode === "flat_per_day" && (
                        <p className="text-[10px] text-zinc-500 mt-0.5 italic">
                          Forfait indépendant du nombre d&apos;apprenants
                        </p>
                      )}
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
                  <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap">
                    {s.formation?.programme_pdf_url && (
                      <a
                        href={s.formation.programme_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg border border-zinc-300 bg-white text-zinc-700 text-sm font-medium hover:bg-zinc-50 hover:border-zinc-400"
                        title="Ouvrir le programme detaille (PDF) dans un nouvel onglet"
                      >
                        <FileText className="h-4 w-4" />
                        Programme
                      </a>
                    )}
                    {/* Accès aux supports / documents partagés de la session
                        (Gilles 2026-06-25) : visible aussi pour les sessions
                        EN COURS, plus seulement les archives. */}
                    <Link
                      href={`/partenaire/${token}/archives/${s.id}`}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg border border-zinc-300 bg-white text-zinc-700 text-sm font-medium hover:bg-zinc-50 hover:border-zinc-400"
                      title="Voir les supports et documents partagés de cette session"
                    >
                      <FileText className="h-4 w-4" />
                      Documents
                    </Link>
                    {/* Dropdown statut « Statut » retiré du catalogue OF
                        (Gilles 2026-06-13) : il n'existe pas dans le portail
                        prescripteur -> les deux portails doivent avoir la même
                        mise en forme. Le statut reste géré côté back-office. */}
                    {/* Bouton inscription : TOUJOURS visible (Option B —
                        Gilles 2026-05-22). Si pas de tarif négocié, le
                        bouton est en couleur secondaire avec libellé
                        "Tarif à confirmer" et la page d'inscription
                        affichera un message si nécessaire.
                        Si session annulee (Gilles 2026-06-01) -> bouton
                        desactive avec tooltip explicite. */}
                    {s.status === "cancelled" ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-zinc-100 text-zinc-400 text-sm font-bold cursor-not-allowed"
                        title="Session annulée — inscription impossible"
                      >
                        Inscription fermée
                      </button>
                    ) : (
                      <Link
                        href={`/partenaire/${token}/inscrire/${s.id}`}
                        className={
                          isOf || negotiated !== undefined
                            ? "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700"
                            : "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-amber-500 text-white text-sm font-bold hover:bg-amber-600"
                        }
                        title={
                          isOf
                            ? "Inscrire un apprenant sur cette session"
                            : negotiated !== undefined
                              ? "Inscrire un apprenant sur cette session"
                              : "Aucun tarif spécifique défini — l'inscription sera possible après validation du tarif par CAP NUMERIQUE."
                        }
                      >
                        {isOf || negotiated !== undefined
                          ? "Inscrire un apprenant"
                          : "Inscrire (tarif à confirmer)"}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      </SessionCalendar>
    </div>
  );
}
