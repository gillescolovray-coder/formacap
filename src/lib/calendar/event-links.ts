/**
 * Helpers pour générer les liens d'ajout d'événement aux agendas
 * électroniques (Google Calendar, Outlook web) à partir d'un
 * événement métier "session de formation".
 *
 * Utilisé par les portails apprenant ET formateur. La génération
 * du .ics universel est faite côté API route séparée (cf.
 * /api/public/parcours/[token]/calendar.ics et
 * /api/public/formateur/[token]/sessions/[sessionId]/calendar.ics).
 */

export type CalendarEvent = {
  title: string;
  start: Date;
  end: Date;
  description: string;
  location: string;
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Format Google Calendar : YYYYMMDDTHHMMSSZ (UTC) */
function googleDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function buildGoogleCalendarUrl(e: CalendarEvent): string {
  return (
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(e.title)}` +
    `&dates=${googleDate(e.start)}/${googleDate(e.end)}` +
    `&details=${encodeURIComponent(e.description)}` +
    `&location=${encodeURIComponent(e.location)}`
  );
}

export function buildOutlookCalendarUrl(e: CalendarEvent): string {
  return (
    `https://outlook.office.com/calendar/0/deeplink/compose` +
    `?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent` +
    `&subject=${encodeURIComponent(e.title)}` +
    `&body=${encodeURIComponent(e.description)}` +
    `&location=${encodeURIComponent(e.location)}` +
    `&startdt=${encodeURIComponent(e.start.toISOString())}` +
    `&enddt=${encodeURIComponent(e.end.toISOString())}`
  );
}

/**
 * Calcule l'offset de Europe/Paris vs UTC (en heures) à une date donnée.
 * Gère automatiquement le passage CET (+1, hiver) <-> CEST (+2, été).
 *
 * Méthode robuste sans dépendance externe : on formate une date UTC en
 * Europe/Paris et on lit l'heure résultante.
 */
function parisOffsetHoursAt(dateIso: string): number {
  // Date midi UTC, sûre pour la détection DST (pas de transition à midi).
  const baseUtc = new Date(`${dateIso}T12:00:00Z`);
  const parisHour = Number.parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hour12: false,
    }).format(baseUtc),
    10,
  );
  // Robustness : si format renvoie "24", on ramène à 0
  const ph = parisHour === 24 ? 0 : parisHour;
  return ph - baseUtc.getUTCHours();
}

/**
 * Construit un Date qui représente "dateIso à HH:MM heure de Paris".
 *
 * Bug Gilles 2026-05-26 : avant, l'ancienne version utilisait
 * `setHours(...)` qui dépend du fuseau du serveur. Sur Vercel (UTC),
 * "08:45" était traité comme 08:45 UTC, puis Google Calendar
 * l'affichait à +2h (= 10:45 Paris) → bug d'horaire visible.
 *
 * Nouvelle version : construit explicitement le moment UTC qui
 * correspond à l'horaire Paris demandé, en tenant compte du DST.
 */
export function buildEventDateTime(
  dateIso: string,
  time: string | null,
  fallbackHHMM: string,
): Date {
  const [hh, mm] = (time ?? fallbackHHMM)
    .split(":")
    .map((x) => Number(x));
  const offset = parisOffsetHoursAt(dateIso);
  // Construit le moment UTC qui correspond à hh:mm Paris ce jour-là :
  // UTC = ParisLocal - offset (CEST: -2h, CET: -1h)
  const utc = new Date(`${dateIso}T${pad(hh)}:${pad(mm)}:00Z`);
  utc.setUTCHours(utc.getUTCHours() - offset);
  return utc;
}

/**
 * Format ICS / Google : YYYYMMDDTHHMMSSZ depuis un objet Date.
 * Exporté pour pouvoir être réutilisé par la route .ics publique
 * (pour éviter de dupliquer la logique de format).
 */
export function formatUtcCalendarDate(d: Date): string {
  return googleDate(d);
}
