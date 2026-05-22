import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
function formatIcsDate(iso: string, time: string | null): string {
  const d = new Date(iso);
  const [hh, mm] = (time ?? "09:00").split(":").map((n) => Number(n));
  d.setHours(hh || 9, mm || 0, 0, 0);
  // Format UTC : YYYYMMDDTHHMMSSZ
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

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

  const start = formatIcsDate(s.start_date, s.default_morning_start ?? "09:00");
  const end = formatIcsDate(s.end_date, s.default_afternoon_end ?? "17:00");

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

  const description = [
    `Formation organisée par ${orgName}`,
    s.organization?.phone ? `Contact : ${s.organization.phone}` : null,
    s.organization?.email ? `Email : ${s.organization.email}` : null,
    s.video_link ? `Lien visio : ${s.video_link}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const uid = `formacap-${row.enrollment_id}@capnumerique.com`;
  const dtstamp = formatIcsDate(new Date().toISOString(), null);

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
