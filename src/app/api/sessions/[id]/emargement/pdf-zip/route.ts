/**
 * Route API : telecharge un ZIP contenant N PDF feuilles d emargement
 * individuelles (Gilles 2026-06-01).
 *
 * GET /api/sessions/[id]/emargement/pdf-zip?enrollment_ids=id1,id2,id3
 *
 * Genere 1 PDF par enrollment_id puis les zip dans 1 archive.
 * Nommage des fichiers PDF dans le ZIP :
 *   Emargement-NOM-Prenom-NomFormation-Date.pdf
 */
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";
import React from "react";
import { createClient } from "@/lib/supabase/server";
import {
  EmargementPdf,
  type EmargementPdfData,
} from "@/lib/emargement/pdf-template";

// Force le runtime Node (pas Edge — react-pdf necessite Node)
export const runtime = "nodejs";
// Max duration de la route (Vercel Hobby : 10s par defaut)
export const maxDuration = 60;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function slug(s: string | null | undefined, max = 40): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
}

function enumerateDates(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await ctx.params;
  if (!UUID_REGEX.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const enrollmentIdsRaw = req.nextUrl.searchParams.get("enrollment_ids");
  if (!enrollmentIdsRaw) {
    return NextResponse.json(
      { error: "Missing enrollment_ids" },
      { status: 400 },
    );
  }
  const enrollmentIds = enrollmentIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_REGEX.test(s));
  if (enrollmentIds.length === 0) {
    return NextResponse.json(
      { error: "No valid enrollment_ids" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Charge la session + formation + lieu + formateur
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, modality, formation:formations(id, title, duration_hours, duration_days), location_ref:formation_locations!location_id(name, address, postal_code, city), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Organisation : nom + logo + cachet + mentions legales
  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(name, logo_url, legal_mentions, signature_stamp_path)",
    )
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const organization = membership?.organization as unknown as {
    name: string;
    logo_url: string | null;
    legal_mentions: string | null;
    signature_stamp_path: string | null;
  } | null;
  const orgName = organization?.name ?? "CAP NUMERIQUE";

  // URL signee du cachet OF (bucket prive)
  let orgStampUrl: string | null = null;
  if (organization?.signature_stamp_path) {
    const { data: signed } = await supabase.storage
      .from("organization-signatures")
      .createSignedUrl(organization.signature_stamp_path, 3600);
    orgStampUrl = signed?.signedUrl ?? null;
  }

  // Strip HTML tags du legal_mentions (react-pdf ne supporte pas le HTML)
  const orgLegalText = organization?.legal_mentions
    ? organization.legal_mentions
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : null;

  const sessionTyped = session as unknown as {
    id: string;
    start_date: string;
    end_date: string;
    modality: string | null;
    formation: {
      title: string;
      duration_hours: number | null;
      duration_days: number | null;
    } | null;
    location_ref: {
      name: string;
      address: string | null;
      postal_code: string | null;
      city: string | null;
    } | null;
    trainer: { first_name: string; last_name: string } | null;
  };

  const formationTitle = sessionTyped.formation?.title ?? "Session";
  const durationHours = sessionTyped.formation?.duration_hours ?? null;
  const modalityLabel =
    sessionTyped.modality === "presentiel"
      ? "Présentiel"
      : sessionTyped.modality === "distanciel"
        ? "Distanciel"
        : sessionTyped.modality === "hybride"
          ? "Hybride"
          : null;
  const locationLabel = sessionTyped.location_ref
    ? [
        sessionTyped.location_ref.name,
        sessionTyped.location_ref.address,
        sessionTyped.location_ref.city,
      ]
        .filter(Boolean)
        .join(" — ")
    : null;
  const trainerName = sessionTyped.trainer
    ? `${sessionTyped.trainer.first_name} ${sessionTyped.trainer.last_name}`.trim()
    : null;

  // session_days
  const { data: sessionDays } = await supabase
    .from("session_days")
    .select("*")
    .eq("session_id", sessionId)
    .order("day_date", { ascending: true });
  const periodDates =
    sessionDays && sessionDays.length > 0
      ? sessionDays.map((d) => (d as { day_date: string }).day_date)
      : enumerateDates(sessionTyped.start_date, sessionTyped.end_date);
  const dayByDate = new Map<string, {
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
  }>();
  for (const d of (sessionDays ?? []) as Array<{
    day_date: string;
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
  }>) {
    dayByDate.set(d.day_date, {
      morning_start: d.morning_start,
      morning_end: d.morning_end,
      afternoon_start: d.afternoon_start,
      afternoon_end: d.afternoon_end,
    });
  }
  const days: EmargementPdfData["days"] = periodDates.map((date) => {
    const d = dayByDate.get(date);
    return {
      date,
      morningStart: d?.morning_start ?? null,
      morningEnd: d?.morning_end ?? null,
      afternoonStart: d?.afternoon_start ?? null,
      afternoonEnd: d?.afternoon_end ?? null,
    };
  });

  // Charge enrollments + signatures
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, company:companies(name, siret))",
    )
    .eq("session_id", sessionId)
    .in("id", enrollmentIds);

  const { data: signatures } = await supabase
    .from("attendance_signatures")
    .select(
      "enrollment_id, period_date, moment, signer_role, signature_data",
    )
    .in("enrollment_id", enrollmentIds);

  // Index signatures par enrollment + jour + moment
  const learnerSignaturesByEnrollment = new Map<
    string,
    Record<string, string>
  >();
  const trainerSignaturesByKey: Record<string, string> = {};
  for (const s of (signatures ?? []) as Array<{
    enrollment_id: string;
    period_date: string;
    moment: string;
    signer_role: string;
    signature_data: string;
  }>) {
    const key = `${s.period_date}|${s.moment}`;
    if (s.signer_role === "trainer") {
      // 1 signature formateur partagee — la derniere ecrase
      trainerSignaturesByKey[key] = s.signature_data;
    } else {
      const map =
        learnerSignaturesByEnrollment.get(s.enrollment_id) ??
        ({} as Record<string, string>);
      map[key] = s.signature_data;
      learnerSignaturesByEnrollment.set(s.enrollment_id, map);
    }
  }

  // Genere 1 PDF par enrollment + ajoute au ZIP
  const zip = new JSZip();
  const dateSlug = (sessionTyped.start_date ?? "").slice(0, 10);
  const formationSlug = slug(formationTitle, 50);

  for (const e of (enrollments ?? []) as unknown as Array<{
    id: string;
    learner: {
      first_name: string | null;
      last_name: string | null;
      company: { name: string | null; siret: string | null } | null;
    } | null;
  }>) {
    const lInfo = e.learner;
    if (!lInfo) continue;
    const lastName = (lInfo.last_name ?? "Inconnu").toUpperCase();
    const firstName = lInfo.first_name ?? "";
    const company = Array.isArray(lInfo.company)
      ? (lInfo.company[0] as
          | { name: string | null; siret: string | null }
          | undefined)
      : lInfo.company;

    const data: EmargementPdfData = {
      formationTitle,
      startDate: sessionTyped.start_date,
      endDate: sessionTyped.end_date,
      durationHours,
      modalityLabel,
      locationLabel,
      trainerName,
      orgName,
      orgLogoUrl: organization?.logo_url ?? null,
      orgStampUrl,
      orgLegalText,
      learner: {
        lastName,
        firstName,
        companyName: company?.name ?? null,
        companySiret: company?.siret ?? null,
        signatures: learnerSignaturesByEnrollment.get(e.id) ?? {},
      },
      trainerSignatures: trainerSignaturesByKey,
      days,
    };

    try {
      // Cast en unknown puis ReactElement DocumentProps : @react-pdf/renderer
      // attend un ReactElement<DocumentProps> mais notre composant a
      // un type plus large. C est OK car EmargementPdf renvoie bien
      // un <Document>.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element = React.createElement(EmargementPdf as any, { data });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfBuffer = await renderToBuffer(element as any);
      // Société entre le nom de l'apprenant et la formation (Gilles 2026-06-13).
      const companySlug = company?.name ? slug(company.name) : "";
      const filename = `Emargement-${slug(lastName)}-${slug(firstName)}${
        companySlug ? `-${companySlug}` : ""
      }-${formationSlug}-${dateSlug}.pdf`;
      zip.file(filename, pdfBuffer);
    } catch (err) {
      console.error(
        `[pdf-zip] Echec PDF pour enrollment ${e.id} :`,
        (err as Error).message,
      );
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  const zipName = `Emargement-${formationSlug}-${dateSlug}.zip`;

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store",
    },
  });
}
