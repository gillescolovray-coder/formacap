import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildEventDateTime,
  formatUtcCalendarDate,
} from "@/lib/calendar/event-links";

export const runtime = "nodejs";

/**
 * Génère un fichier .ics (iCalendar) pour ajouter la session de
 * formation à l'agenda électronique de l'apprenant (Google Calendar,
 * Apple Calendar, Outlook, etc.).
 *
 * Auth : token portail apprenant.
 *
 * Gilles 2026-05-22.
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
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("enrollment_portal_tokens")
    .select(
      "enrollment_id, enrollment:session_enrollments(session_id, session:sessions(start_date, end_date, modality, location, video_link, default_morning_start, default_afternoon_end, location_ref:formation_locations!location_id(name, address, postal_code, city), formation:formations(title), organization:organizations(name, phone, email)))",
    )
    .eq("token", token)
    .maybeSingle<{
      enrollment_id: string;
      enrollment: {
        session_id: string;
        session: {
          start_date: string;
          end_date: string;
          modality: string | null;
          location: string | null;
          video_link: string | null;
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
        } | null;
      } | null;
    }>();

  if (!row || !row.enrollment?.session) {
    return new NextResponse("Lien invalide.", { status: 404 });
  }

  const s = row.enrollment.session;
  const title = s.formation?.title ?? "Formation";
  const orgName = s.organization?.name ?? "";

  // Horaires reels par jour (jour 1 matin / dernier jour aprem),
  // sinon fallback sur les valeurs par defaut de la session puis
  // "09:00"/"17:00".
  const { data: sessionDays } = await supabase
    .from("session_days")
    .select("day_date, morning_start, afternoon_end, morning_end")
    .eq("session_id", row.enrollment.session_id)
    .order("day_date", { ascending: true });
  const firstDay = sessionDays?.[0] ?? null;
  const lastDay = sessionDays?.[sessionDays.length - 1] ?? null;

  // Fix Gilles 2026-05-25 : avant on utilisait formatIcsDate local
  // qui depend du fuseau du serveur (UTC sur Vercel) -> Google
  // Calendar affichait +2h (CEST). Maintenant on passe par
  // buildEventDateTime qui calcule explicitement l'offset
  // Europe/Paris (DST aware).
  const start = formatUtcCalendarDate(
    buildEventDateTime(
      s.start_date,
      firstDay?.morning_start ?? s.default_morning_start,
      "09:00",
    ),
  );
  const end = formatUtcCalendarDate(
    buildEventDateTime(
      s.end_date,
      lastDay?.afternoon_end ??
        lastDay?.morning_end ??
        s.default_afternoon_end,
      "17:00",
    ),
  );

  // Lieu : adresse complète si présentiel, sinon URL visio
  let location = "";
  if (s.modality === "distanciel" || s.modality === "hybride") {
    location = s.video_link ?? "Distanciel";
  } else {
    const parts: string[] = [];
    if (s.location_ref?.name) parts.push(s.location_ref.name);
    if (s.location_ref?.address) parts.push(s.location_ref.address);
    const cityLine = [s.location_ref?.postal_code, s.location_ref?.city]
      .filter(Boolean)
      .join(" ");
    if (cityLine) parts.push(cityLine);
    location = parts.length > 0 ? parts.join(", ") : (s.location ?? "");
  }

  // Lien vers l'espace apprenant — affiché dans la description du
  // calendrier (Gilles 2026-05-22). On retire le lien visio car il
  // est déjà dans le champ Lieu.
  const portalUrl =
    (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com") +
    `/mon-parcours/${token}`;
  const description = [
    `Formation organisée par ${orgName}`,
    s.organization?.phone ? `Contact : ${s.organization.phone}` : null,
    s.organization?.email ? `Email : ${s.organization.email}` : null,
    `Mon espace apprenant (test de positionnement, émargement, supports, convocation, certificat) : ${portalUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const uid = `formacap-${row.enrollment_id}@capnumerique.com`;
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
    `ORGANIZER;CN=${escapeIcsText(orgName)}:mailto:${s.organization?.email ?? "noreply@capnumerique.com"}`,
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
      "Content-Disposition": `attachment; filename="formation-${row.enrollment_id.slice(0, 8)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
