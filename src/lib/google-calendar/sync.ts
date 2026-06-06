/**
 * Synchro temps réel des sessions vers Google Agenda (agenda partagé
 * "Sessions CAP"). Appelée en best-effort après création / modification /
 * annulation / archivage d'une session. Ne casse JAMAIS l'enregistrement.
 *
 * Règles (Gilles 2026-06-06) :
 *  - On synchronise les sessions PLANIFIÉES, CONFIRMÉES, EN COURS et
 *    TERMINÉES (historique). Les brouillons / annulées / reportées /
 *    archivées ne sont pas sur l'agenda (l'événement est supprimé si besoin).
 *  - Maximum d'infos dans le RDV : réf + titre, horaires par jour, modalité
 *    (INTER/INTRA · présentiel/distanciel), lieu/adresse ou visio + lien,
 *    formateur, nb participants, statut, lien vers la fiche session.
 */
import type { calendar_v3 } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCalendarClient,
  getCalendarId,
  isCalendarConfigured,
} from "./client";

// Statuts dont la session doit figurer sur l'agenda. Gilles veut TOUTES les
// sessions visibles (brouillons, annulées, reportées comprises), le statut
// étant indiqué dans le titre. Seules les sessions ARCHIVÉES sont exclues
// (elles sont volontairement masquées partout).
const SYNCABLE_STATUSES = new Set([
  "draft",
  "planned",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "postponed",
]);

const STATUS_META: Record<string, { emoji: string; label: string }> = {
  draft: { emoji: "📝", label: "Brouillon" },
  planned: { emoji: "🗓️", label: "Planifiée" },
  confirmed: { emoji: "✅", label: "Confirmée" },
  in_progress: { emoji: "▶️", label: "En cours" },
  completed: { emoji: "✔️", label: "Terminée" },
  cancelled: { emoji: "❌", label: "ANNULÉE" },
  postponed: { emoji: "⏸️", label: "REPORTÉE" },
};

const MODALITY_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.capnumerique.com"
  );
}

/** Normalise une heure "HH:MM" / "HH:MM:SS" -> "HH:MM:SS". */
function toFullTime(t: string | null | undefined, fallback: string): string {
  const v = (t ?? "").trim();
  if (!v) return fallback;
  const parts = v.split(":");
  if (parts.length === 2) return `${v}:00`;
  return v;
}

/** "HH:MM" pour affichage. */
function hm(t: string | null | undefined): string | null {
  const v = (t ?? "").trim();
  if (!v) return null;
  return v.slice(0, 5);
}

function frDate(iso: string): string {
  // iso "YYYY-MM-DD" -> "DD/MM/YYYY"
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

type DayRow = {
  day_date: string;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
};

type SessionRow = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  modality: string | null;
  is_inter: boolean | null;
  location: string | null;
  video_app: string | null;
  video_link: string | null;
  default_morning_start: string | null;
  default_afternoon_end: string | null;
  trainer_name: string | null;
  max_participants: number | null;
  google_calendar_event_id: string | null;
  formation?: { title: string | null; internal_code: string | null } | null;
  trainer?: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    mobile: string | null;
  } | null;
  location_full?: {
    name: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
};

function buildLocationString(s: SessionRow): string {
  if (s.modality === "distanciel") {
    const app = s.video_app?.trim();
    const link = s.video_link?.trim();
    if (app && link) return `${app} — ${link}`;
    return link || app || "Distanciel";
  }
  // présentiel / hybride
  const loc = s.location_full;
  if (loc) {
    const parts = [
      loc.name,
      loc.address,
      [loc.postal_code, loc.city].filter(Boolean).join(" "),
    ]
      .map((p) => (p ?? "").trim())
      .filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return s.location?.trim() || "Lieu à préciser";
}

function buildEvent(
  s: SessionRow,
  days: DayRow[],
  participantCount: number,
): calendar_v3.Schema$Event {
  const meta = STATUS_META[s.status] ?? { emoji: "🗓️", label: s.status };
  const ref = s.formation?.internal_code?.trim();
  const title = s.formation?.title?.trim() || "Session de formation";
  const summary = `${meta.emoji} ${ref ? `${ref} — ` : ""}${title}`;

  // Horaires : première heure de début, dernière heure de fin.
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const startTime = toFullTime(
    firstDay?.morning_start ?? s.default_morning_start,
    "09:00:00",
  );
  const endTime = toFullTime(
    lastDay?.afternoon_end ?? s.default_afternoon_end,
    "17:00:00",
  );

  const modalityLabel = s.modality
    ? MODALITY_LABELS[s.modality] ?? s.modality
    : "—";
  const interLabel = s.is_inter ? "INTER" : "INTRA";

  // Détail des horaires jour par jour (depuis session_days si dispo).
  const horairesLines =
    days.length > 0
      ? days.map((d) => {
          const mat =
            hm(d.morning_start) && hm(d.morning_end)
              ? `${hm(d.morning_start)}–${hm(d.morning_end)}`
              : null;
          const apm =
            hm(d.afternoon_start) && hm(d.afternoon_end)
              ? `${hm(d.afternoon_start)}–${hm(d.afternoon_end)}`
              : null;
          const horaires = [mat, apm].filter(Boolean).join(" / ") || "—";
          return `  • ${frDate(d.day_date)} : ${horaires}`;
        })
      : [`  • ${frDate(s.start_date)} → ${frDate(s.end_date)}`];

  const trainerName =
    [s.trainer?.first_name, s.trainer?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    s.trainer_name?.trim() ||
    "À affecter";
  const trainerPhone = (s.trainer?.mobile || s.trainer?.phone || "").trim();

  const locationStr = buildLocationString(s);

  const lieuLine =
    s.modality === "distanciel"
      ? `Distanciel : ${locationStr}`
      : `Lieu : ${locationStr}`;

  const descriptionLines = [
    `Statut : ${meta.label}`,
    `Modalité : ${interLabel} · ${modalityLabel}`,
    "",
    "Horaires :",
    ...horairesLines,
    "",
    `Formateur : ${trainerName}${trainerPhone ? ` (${trainerPhone})` : ""}`,
    `Participants : ${participantCount}${s.max_participants ? ` / ${s.max_participants}` : ""}`,
    lieuLine,
    s.modality !== "distanciel" && s.video_link
      ? `Visio : ${s.video_link}`
      : null,
    "",
    `Fiche session : ${appOrigin()}/sessions/${s.id}`,
  ].filter((l): l is string => l !== null);

  return {
    summary,
    location: locationStr,
    description: descriptionLines.join("\n"),
    start: {
      dateTime: `${s.start_date.slice(0, 10)}T${startTime}`,
      timeZone: "Europe/Paris",
    },
    end: {
      dateTime: `${s.end_date.slice(0, 10)}T${endTime}`,
      timeZone: "Europe/Paris",
    },
  };
}

export type CalendarSyncResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

/**
 * Synchronise une session avec l'agenda Google. Best-effort : ne lève jamais,
 * mais RENVOIE le résultat réel (ok / erreur Google) pour pouvoir l'afficher.
 */
export async function syncSessionCalendar(
  sessionId: string,
): Promise<CalendarSyncResult> {
  if (!isCalendarConfigured()) return { ok: false, skipped: true };
  try {
    const admin = createAdminClient();
    const { data: s } = await admin
      .from("sessions")
      .select(
        "id, start_date, end_date, status, modality, is_inter, location, video_app, video_link, default_morning_start, default_afternoon_end, trainer_name, max_participants, google_calendar_event_id, formation:formations(title, internal_code), trainer:trainers(first_name, last_name, phone, mobile), location_full:formation_locations(name, address, postal_code, city)",
      )
      .eq("id", sessionId)
      .maybeSingle<SessionRow>();
    if (!s) return { ok: false, error: "Session introuvable." };

    const calendar = getCalendarClient();
    const calendarId = getCalendarId();
    const eventId = s.google_calendar_event_id;

    // Session non synchronisable -> on retire l'événement s'il existe.
    if (!SYNCABLE_STATUSES.has(s.status)) {
      if (eventId) {
        try {
          await calendar.events.delete({ calendarId, eventId });
        } catch {
          // déjà supprimé côté agenda : on ignore
        }
        await admin
          .from("sessions")
          .update({ google_calendar_event_id: null })
          .eq("id", sessionId);
      }
      return { ok: true, skipped: true };
    }

    // Détails (jours + nb participants)
    const [{ data: days }, { count }] = await Promise.all([
      admin
        .from("session_days")
        .select(
          "day_date, morning_start, morning_end, afternoon_start, afternoon_end",
        )
        .eq("session_id", sessionId)
        .order("day_date", { ascending: true }),
      admin
        .from("session_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .neq("status", "cancelled"),
    ]);

    const event = buildEvent(s, (days ?? []) as DayRow[], count ?? 0);

    if (eventId) {
      try {
        await calendar.events.patch({
          calendarId,
          eventId,
          requestBody: event,
        });
        return { ok: true };
      } catch {
        // l'événement a pu être supprimé manuellement côté agenda -> on recrée
      }
    }

    const res = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });
    const newId = res.data.id;
    if (newId) {
      await admin
        .from("sessions")
        .update({ google_calendar_event_id: newId })
        .eq("id", sessionId);
    }
    return { ok: true };
  } catch (e) {
    const error = (e as Error).message;
    console.warn("[google-calendar] synchro échouée", { sessionId, error });
    return { ok: false, error };
  }
}
