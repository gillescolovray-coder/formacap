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
  getTrainerPortalToken,
  buildTrainerPortalUrl,
} from "@/lib/portal/trainer-token";
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
  trainer_id: string | null;
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

/** Échappe le texte inséré dans la description HTML de l'événement. */
function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildEvent(
  s: SessionRow,
  days: DayRow[],
  participantCount: number,
  portalUrl: string | null,
): calendar_v3.Schema$Event {
  const meta = STATUS_META[s.status] ?? { emoji: "🗓️", label: s.status };
  const title = s.formation?.title?.trim() || "Session de formation";
  // Dans le titre : nombre de participants (à la place du code formation).
  const maxPart = s.max_participants ? `/${s.max_participants}` : "";
  const summary = `${meta.emoji} 👥${participantCount}${maxPart} — ${title}`;

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
      ? `Distanciel : ${esc(locationStr)}`
      : `Lieu : ${esc(locationStr)}`;

  const ficheUrl = `${appOrigin()}/sessions/${s.id}`;

  // Description en HTML (Google Agenda gère le gras et les liens).
  // Les liens utiles sont placés TOUT EN HAUT.
  const descriptionLines = [
    `🔗 <b>Fiche session :</b> <a href="${ficheUrl}">ouvrir la fiche</a>`,
    portalUrl
      ? `👤 <b>Espace formateur :</b> <a href="${portalUrl}">ouvrir le portail</a>`
      : null,
    "",
    `Statut : ${esc(meta.label)}`,
    `Modalité : ${interLabel} · ${esc(modalityLabel)}`,
    "",
    "Horaires :",
    ...horairesLines.map((l) => esc(l)),
    "",
    `Formateur : ${esc(trainerName)}${trainerPhone ? ` (${esc(trainerPhone)})` : ""}`,
    `<b>Participants : ${participantCount}${s.max_participants ? ` / ${s.max_participants}` : ""}</b>`,
    lieuLine,
    s.modality !== "distanciel" && s.video_link
      ? `Visio : <a href="${esc(s.video_link)}">${esc(s.video_link)}</a>`
      : null,
  ].filter((l): l is string => l !== null);

  return {
    summary,
    location: locationStr,
    description: descriptionLines.join("<br>"),
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Statut HTTP d'une erreur googleapis (gaxios). */
function httpStatus(e: unknown): number | undefined {
  const a = e as { response?: { status?: number }; code?: unknown };
  if (a?.response?.status) return a.response.status;
  if (typeof a?.code === "number") return a.code;
  return undefined;
}

/** Erreur "l'événement n'existe plus" (404/410) -> recréation légitime. */
function isGoneError(e: unknown): boolean {
  const s = httpStatus(e);
  return s === 404 || s === 410;
}

/** Erreur de quota / cadence Google -> on réessaie avec backoff. */
function isRateLimitError(e: unknown): boolean {
  const s = httpStatus(e);
  const msg = String((e as Error)?.message ?? "").toLowerCase();
  return (
    s === 429 ||
    msg.includes("rate limit") ||
    msg.includes("ratelimitexceeded") ||
    msg.includes("user rate limit") ||
    msg.includes("quota")
  );
}

/** Exécute un appel Google avec réessais sur dépassement de cadence. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (isRateLimitError(e)) {
        await sleep(700 * (attempt + 1)); // 0.7s, 1.4s, 2.1s…
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/**
 * Synchronise une session avec l'agenda Google. Best-effort : ne lève jamais,
 * mais RENVOIE le résultat réel (ok / erreur Google) pour pouvoir l'afficher.
 *
 * Anti-doublon : si la MISE À JOUR (patch) d'un événement existant échoue pour
 * une raison AUTRE que "événement supprimé" (ex. rate limit), on NE recrée PAS
 * d'événement (sinon doublon) — on remonte l'erreur pour réessayer plus tard.
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
        "id, start_date, end_date, status, modality, is_inter, location, video_app, video_link, default_morning_start, default_afternoon_end, trainer_name, trainer_id, max_participants, google_calendar_event_id, formation:formations(title, internal_code), trainer:trainers(first_name, last_name, phone, mobile), location_full:formation_locations(name, address, postal_code, city)",
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
          await withRetry(() =>
            calendar.events.delete({ calendarId, eventId }),
          );
        } catch (e) {
          if (!isGoneError(e)) throw e; // déjà supprimé : on ignore
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

    // Lien du portail formateur (si le portail est activé pour ce formateur).
    let portalUrl: string | null = null;
    if (s.trainer_id) {
      const portal = await getTrainerPortalToken(admin, s.trainer_id);
      if (portal) portalUrl = buildTrainerPortalUrl(appOrigin(), portal.token);
    }

    const event = buildEvent(
      s,
      (days ?? []) as DayRow[],
      count ?? 0,
      portalUrl,
    );

    // 1) Mise à jour de l'événement existant.
    if (eventId) {
      try {
        await withRetry(() =>
          calendar.events.patch({ calendarId, eventId, requestBody: event }),
        );
        return { ok: true };
      } catch (e) {
        // On ne recrée QUE si l'événement n'existe vraiment plus (404/410).
        // Sinon (rate limit, réseau…) on remonte l'erreur -> PAS de doublon.
        if (!isGoneError(e)) {
          const error = (e as Error).message;
          return { ok: false, error };
        }
        // event supprimé côté agenda -> on tombe sur la création ci-dessous
      }
    }

    // 2) Création d'un nouvel événement.
    const res = await withRetry(() =>
      calendar.events.insert({ calendarId, requestBody: event }),
    );
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

/**
 * Vide TOUS les événements de l'agenda partagé (l'agenda est dédié aux
 * sessions, on peut donc tout supprimer) puis renvoie le nombre supprimé.
 * Sert au bouton "Réinitialiser l'agenda" pour repartir sans doublon.
 */
export async function purgeAllCalendarEvents(): Promise<{
  ok: boolean;
  deleted: number;
  error?: string;
}> {
  if (!isCalendarConfigured()) return { ok: false, deleted: 0 };
  try {
    const calendar = getCalendarClient();
    const calendarId = getCalendarId();
    let deleted = 0;
    let pageToken: string | undefined = undefined;
    // 1) Collecte de tous les IDs d'événements (pagination).
    const ids: string[] = [];
    do {
      const resp = await withRetry(() =>
        calendar.events.list({
          calendarId,
          maxResults: 2500,
          showDeleted: false,
          singleEvents: false,
          pageToken,
        }),
      );
      for (const ev of resp.data.items ?? []) {
        if (ev.id) ids.push(ev.id);
      }
      pageToken = resp.data.nextPageToken ?? undefined;
    } while (pageToken);

    // 2) Suppression par petits lots (anti rate-limit).
    const BATCH = 4;
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async (id) => {
          try {
            await withRetry(() =>
              calendar.events.delete({ calendarId, eventId: id }),
            );
            deleted++;
          } catch (e) {
            if (isGoneError(e)) deleted++; // déjà supprimé : OK
          }
        }),
      );
      await sleep(250);
    }
    return { ok: true, deleted };
  } catch (e) {
    return { ok: false, deleted: 0, error: (e as Error).message };
  }
}
