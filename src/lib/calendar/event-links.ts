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
 * Construit un Date à partir d'une date ISO (YYYY-MM-DD) et d'un
 * horaire (HH:MM). Si time est null, applique le fallback.
 */
export function buildEventDateTime(
  dateIso: string,
  time: string | null,
  fallbackHHMM: string,
): Date {
  const d = new Date(dateIso);
  const [hh, mm] = (time ?? fallbackHHMM).split(":").map((x) => Number(x));
  d.setHours(hh || 9, mm || 0, 0, 0);
  return d;
}
