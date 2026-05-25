import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trainerHasAccessToSession } from "@/lib/portal/trainer-session-access";
import {
  buildEventDateTime,
  formatUtcCalendarDate,
} from "@/lib/calendar/event-links";

export const runtime = "nodejs";

/**
 * Génère un fichier .ics (iCalendar) pour ajouter la session à
 * l'agenda du formateur (Google Calendar, Apple Calendar, Outlook…).
 *
 * Auth : token portail formateur + appartenance de la session
 * (trainer_id = formateur du token).
 *
 * Variante côté formateur : description orientée animation
 * (vs apprenant) + nombre d'apprenants inscrits.
 */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; sessionId: string }> },
) {
  const { token, sessionId } = await params;
  const supabase = createAdminClient();

  // 1. Vérifier token + récupérer trainer_id
  const { data: tokenRow } = await supabase
    .from("trainer_portal_tokens")
    .select("trainer_id")
    .eq("token", token)
    .maybeSingle<{ trainer_id: string }>();
  if (!tokenRow) {
    return new NextResponse("Lien invalide.", { status: 404 });
  }

  // 2. Charger la session + vérifier l'appartenance au formateur
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, trainer_id, start_date, end_date, modality, location, video_link, video_app, default_morning_start, default_afternoon_end, location_ref:formation_locations!location_id(name, address, postal_code, city), formation:formations(title), organization:organizations(name, phone, email)",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      trainer_id: string | null;
      start_date: string;
      end_date: string;
      modality: string | null;
      location: string | null;
      video_link: string | null;
      video_app: string | null;
      default_morning_start: string | null;
      default_afternoon_end: string | null;
      location_ref: {
        name: string | null;
        address: string | null;
        postal_code: string | null;
        city: string | null;
      } | null;
      formation: { title: string } | null;
      organization: {
        name: string;
        phone: string | null;
        email: string | null;
      } | null;
    }>();

  if (!session) {
    return new NextResponse("Session inaccessible.", { status: 404 });
  }
  const access = await trainerHasAccessToSession(
    supabase,
    tokenRow.trainer_id,
    sessionId,
    session.trainer_id,
  );
  if (!access) {
    return new NextResponse("Session inaccessible.", { status: 404 });
  }

  // 3. Compter les apprenants inscrits (info utile dans la description)
  const { count: enrollmentCount } = await supabase
    .from("session_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  // 3.b. Charger les jours de session pour obtenir les vrais horaires
  // (sinon on tomberait sur les valeurs par defaut globales, fausses).
  const { data: sessionDays } = await supabase
    .from("session_days")
    .select("day_date, morning_start, afternoon_end, morning_end")
    .eq("session_id", sessionId)
    .order("day_date", { ascending: true });
  const firstDay = sessionDays?.[0] ?? null;
  const lastDay = sessionDays?.[sessionDays.length - 1] ?? null;

  // 4. Composer l'événement
  const title = session.formation?.title ?? "Formation";
  const orgName = session.organization?.name ?? "";

  // Horaires reels (jour 1 matin / dernier jour aprem), avec fallback
  // sur les valeurs par defaut de session puis "09:00"/"17:00".
  // Fix Gilles 2026-05-25 : avant on utilisait formatIcsDate local qui
  // depend du fuseau du serveur (UTC sur Vercel) -> Google Calendar
  // affichait +2h (CEST). Maintenant on passe par buildEventDateTime
  // qui calcule explicitement l'offset Europe/Paris (DST aware).
  const start = formatUtcCalendarDate(
    buildEventDateTime(
      session.start_date,
      firstDay?.morning_start ?? session.default_morning_start,
      "09:00",
    ),
  );
  const end = formatUtcCalendarDate(
    buildEventDateTime(
      session.end_date,
      lastDay?.afternoon_end ??
        lastDay?.morning_end ??
        session.default_afternoon_end,
      "17:00",
    ),
  );

  let location = "";
  if (session.modality === "distanciel" || session.modality === "hybride") {
    const remoteLabel = session.video_app
      ? `Distanciel via ${session.video_app}`
      : "Distanciel";
    location = session.video_link ?? remoteLabel;
  } else {
    const parts: string[] = [];
    if (session.location_ref?.name) parts.push(session.location_ref.name);
    if (session.location_ref?.address) parts.push(session.location_ref.address);
    const cityLine = [session.location_ref?.postal_code, session.location_ref?.city]
      .filter(Boolean)
      .join(" ");
    if (cityLine) parts.push(cityLine);
    location = parts.length > 0 ? parts.join(", ") : (session.location ?? "");
  }

  const appBase =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";
  const agendaUrl = `${appBase}/formateur/${token}`;
  const portalUrl = `${appBase}/formateur/${token}/sessions/${sessionId}`;
  // Description : 2 liens utiles vers le portail formateur pour que
  // le rappel agenda (Apple Calendar, Outlook desktop, Thunderbird...)
  // ramene toujours le formateur a son espace (Gilles 2026-05-24).
  const description = [
    `Vous animez cette session pour ${orgName}.`,
    `${enrollmentCount ?? 0} apprenant${(enrollmentCount ?? 0) > 1 ? "s" : ""} inscrit${(enrollmentCount ?? 0) > 1 ? "s" : ""}.`,
    session.organization?.phone ? `Contact OF : ${session.organization.phone}` : null,
    session.organization?.email ? `Email OF : ${session.organization.email}` : null,
    "",
    "--- Acces a mon portail formateur ---",
    `Mon agenda : ${agendaUrl}`,
    `Cette session (participants, emargement, supports, bilan) : ${portalUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const uid = `formacap-trainer-${sessionId}@capnumerique.com`;
  const dtstamp = formatUtcCalendarDate(new Date());

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FORMACAP//CAP NUMERIQUE//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `ORGANIZER;CN=${escapeIcsText(orgName)}:mailto:${session.organization?.email ?? "noreply@capnumerique.com"}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:Rappel : ${escapeIcsText(title)} dans 1h`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="formation-${sessionId.slice(0, 8)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
