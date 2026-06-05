import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  Users,
  Video,
} from "lucide-react";

export type SessionRow = {
  id: string;
  status: string | null;
  start_date: string;
  end_date: string;
  modality: string | null;
  location: string | null;
  /** Booléen saisi par l'admin au moment de créer/éditer la session
   *  (cf. _form.tsx, toggle INTER/INTRA dans le bloc "Type de session").
   *  true = INTER (apprenants de plusieurs entreprises)
   *  false = INTRA (1 seule entreprise client)
   *  null = non renseigné (session ancienne) → pas de badge affiché. */
  is_inter: boolean | null;
  formation: { title: string } | null;
  location_ref: {
    name: string;
    city: string | null;
    address?: string | null;
    postal_code?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
};

export type SessionScheduleSnapshot = {
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
};

const STATUS_STYLES: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  draft: {
    label: "Brouillon",
    bg: "bg-zinc-100",
    text: "text-zinc-600",
    border: "border-zinc-200",
  },
  planned: {
    label: "Planifiée",
    bg: "bg-sky-100",
    text: "text-sky-800",
    border: "border-sky-300",
  },
  confirmed: {
    label: "Confirmée",
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-300",
  },
  in_progress: {
    label: "En cours",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
  },
  completed: {
    label: "Terminée",
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
  },
  postponed: {
    label: "Reportée",
    bg: "bg-orange-100",
    text: "text-orange-900",
    border: "border-orange-400",
  },
  cancelled: {
    label: "Annulée",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
  archived: {
    label: "Archivée",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
  },
};

/**
 * Badge "INTER / INTRA / HYBRIDE" affiché à côté du badge statut.
 *
 * Règle métier (Gilles 2026-05-23) : 3 valeurs sur la même dimension.
 *  - HYBRIDE prime si modality === 'hybride' (modalité d'animation)
 *  - sinon INTER si is_inter === true (audience multi-entreprises)
 *  - sinon INTRA si is_inter === false (1 entreprise client)
 *  - sinon null (ancienne session sans is_inter renseigné)
 */
export function AudienceBadge({
  modality,
  isInter,
}: {
  modality: string | null;
  isInter: boolean | null;
}) {
  if (modality === "hybride") {
    return (
      <span
        className="text-[10px] font-bold bg-violet-100 text-violet-800 border border-violet-300 px-2 py-0.5 rounded-full uppercase tracking-wider"
        title="Session HYBRIDE : présentiel + distanciel"
      >
        HYBRIDE
      </span>
    );
  }
  if (isInter === true) {
    return (
      <span
        className="text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300 px-2 py-0.5 rounded-full uppercase tracking-wider"
        title="Session INTER : apprenants de plusieurs entreprises"
      >
        INTER
      </span>
    );
  }
  if (isInter === false) {
    return (
      <span
        className="text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-300 px-2 py-0.5 rounded-full uppercase tracking-wider"
        title="Session INTRA : apprenants d'une seule entreprise"
      >
        INTRA
      </span>
    );
  }
  return null;
}

export function formatDateRange(start: string, end: string): string {
  if (start === end) {
    return new Date(start).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  return `${new Date(start).toLocaleDateString("fr-FR")} → ${new Date(end).toLocaleDateString("fr-FR")}`;
}

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh)) return t;
  if (!mm) return `${hh}h`;
  return `${hh}h${mm.toString().padStart(2, "0")}`;
}

/** Construit "9h–12h · 14h–17h" à partir d'un planning de demi-journées. */
export function formatScheduleLine(
  s: SessionScheduleSnapshot | null,
): string | null {
  if (!s) return null;
  const parts: string[] = [];
  if (s.morning_start && s.morning_end) {
    parts.push(`${formatTime(s.morning_start)}–${formatTime(s.morning_end)}`);
  }
  if (s.afternoon_start && s.afternoon_end) {
    parts.push(
      `${formatTime(s.afternoon_start)}–${formatTime(s.afternoon_end)}`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Badge de proximité : "Aujourd'hui", "Demain", "Dans X j" — sinon null. */
export function relativeProximityLabel(startIso: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startIso);
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (start.getTime() - today.getTime()) / 86_400_000,
  );
  if (diffDays < 0) return null;
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";
  if (diffDays <= 7) return `Dans ${diffDays} j`;
  return null;
}

type Props = {
  token: string;
  session: SessionRow;
  participantCount: number;
  schedule?: SessionScheduleSnapshot | null;
  /** "high" = à venir (accent cyan), "low" = passée (atténué). */
  prominence?: "high" | "low";
  /** Distance km lieu <-> formateur (présentiel, test Gilles). */
  distanceKm?: number | null;
};

export function SessionCard({
  token,
  session,
  participantCount,
  schedule = null,
  prominence = "high",
  distanceKm = null,
}: Props) {
  const statusStyle =
    STATUS_STYLES[session.status ?? "draft"] ?? STATUS_STYLES.draft!;
  const dateLabel = formatDateRange(session.start_date, session.end_date);
  const scheduleLabel = formatScheduleLine(schedule);
  const proximity =
    prominence === "high" ? relativeProximityLabel(session.start_date) : null;
  const ModalityIcon = session.modality === "distanciel" ? Video : MapPin;

  let locationLabel = "—";
  if (session.modality === "distanciel") {
    locationLabel = "Distanciel";
  } else if (session.location_ref) {
    locationLabel = session.location_ref.city
      ? `${session.location_ref.name} (${session.location_ref.city})`
      : session.location_ref.name;
  } else if (session.location) {
    locationLabel = session.location;
  }

  const isHigh = prominence === "high";

  return (
    <Link
      href={`/formateur/${token}/sessions/${session.id}`}
      className={
        isHigh
          ? "block rounded-xl bg-white shadow-md border border-zinc-200 border-l-4 border-l-cyan-500 p-4 hover:bg-cyan-50/30 hover:border-l-cyan-600 transition-colors"
          : "block rounded-xl bg-white shadow-sm border border-zinc-200 p-3.5 hover:bg-zinc-50 opacity-75 hover:opacity-100 transition-opacity"
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-[10px] font-bold ${statusStyle.text} ${statusStyle.bg} ${statusStyle.border} border px-2 py-0.5 rounded-full uppercase tracking-wider`}
            >
              {statusStyle.label}
            </span>
            <AudienceBadge
              modality={session.modality}
              isInter={session.is_inter}
            />
            {session.status === "confirmed" && (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            )}
            {proximity && (
              <span className="text-[10px] font-bold bg-cyan-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                {proximity}
              </span>
            )}
          </div>
          <h3
            className={
              isHigh
                ? "font-bold text-zinc-900 truncate text-[15px]"
                : "font-semibold text-zinc-800 truncate text-sm"
            }
          >
            {session.formation?.title ?? "Session"}
          </h3>
          <div className="mt-1 space-y-0.5 text-xs text-zinc-600">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-zinc-400" />
              <span className="font-bold text-zinc-900">
                {dateLabel}
                {scheduleLabel && (
                  <span className="text-zinc-800"> · {scheduleLabel}</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <ModalityIcon className="h-3 w-3 text-zinc-400" />
              <span>{locationLabel}</span>
              {distanceKm != null && (
                <span className="inline-flex items-center gap-0.5 font-bold text-indigo-700">
                  · 📍 ≈ {Math.round(distanceKm)} km
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-zinc-400" />
              <span>
                {participantCount} participant{participantCount > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
        <ChevronRight
          className={`h-5 w-5 shrink-0 mt-1 ${isHigh ? "text-cyan-500" : "text-zinc-400"}`}
        />
      </div>
    </Link>
  );
}
