/**
 * Route ZIP feuilles d emargement individuelles pour le portail OF
 * (Gilles 2026-06-01).
 *
 * Filtre : uniquement les apprenants inscrits via cet OF.
 * Reutilise le template PDF emargement existant.
 */
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";
import React from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "@/app/partenaire/[token]/_resolve";
import {
  EmargementPdf,
  type EmargementPdfData,
} from "@/lib/emargement/pdf-template";

export const runtime = "nodejs";
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
  _req: NextRequest,
  ctx: { params: Promise<{ token: string; sessionId: string }> },
) {
  const { token, sessionId } = await ctx.params;
  if (!UUID_REGEX.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  const partnerCtx = await resolvePartnerContext(token);
  if (!partnerCtx) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const orgId = partnerCtx.company.organization_id;
  const companyId = partnerCtx.company.id;

  // Session
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, modality, formation:formations(id, title, duration_days), location_ref:formation_locations!location_id(name, address, postal_code, city), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", sessionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Organisation
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, logo_url, legal_mentions, signature_stamp_path",
    )
    .eq("id", orgId)
    .maybeSingle();
  const orgName = (org as { name?: string } | null)?.name ?? "CAP NUMERIQUE";

  let orgStampUrl: string | null = null;
  const stampPath = (org as { signature_stamp_path?: string | null } | null)
    ?.signature_stamp_path;
  if (stampPath) {
    const { data: signed } = await supabase.storage
      .from("organization-signatures")
      .createSignedUrl(stampPath, 3600);
    orgStampUrl = signed?.signedUrl ?? null;
  }

  const orgLegalText = (org as { legal_mentions?: string | null } | null)
    ?.legal_mentions
    ? ((org as { legal_mentions: string }).legal_mentions ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : null;

  const sessionTyped = session as unknown as {
    id: string;
    start_date: string;
    end_date: string;
    modality: string | null;
    formation: { title: string; duration_days: number | null } | null;
    location_ref: {
      name: string;
      address: string | null;
      city: string | null;
    } | null;
    trainer: { first_name: string; last_name: string } | null;
  };

  const formationTitle = sessionTyped.formation?.title ?? "Session";
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
  const dayByDate = new Map<
    string,
    {
      morning_start: string | null;
      morning_end: string | null;
      afternoon_start: string | null;
      afternoon_end: string | null;
    }
  >();
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

  // Apprenants inscrits via cet OF UNIQUEMENT
  const { data: inscriptions } = await supabase
    .from("inscription_requests")
    .select("learner_id")
    .eq("organization_id", orgId)
    .eq("target_session_id", sessionId)
    .eq("inscription_channel", "of")
    .eq("inscription_channel_company_id", companyId)
    .not("learner_id", "is", null);

  const learnerIds = ((inscriptions ?? []) as Array<{
    learner_id: string;
  }>).map((r) => r.learner_id);

  if (learnerIds.length === 0) {
    return NextResponse.json(
      { error: "No learners for this partner" },
      { status: 404 },
    );
  }

  // Enrollments + learner info
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, company:companies(name, siret))",
    )
    .eq("session_id", sessionId)
    .in("learner_id", learnerIds);

  const enrollmentIds = ((enrollments ?? []) as Array<{ id: string }>).map(
    (e) => e.id,
  );

  // Signatures
  const { data: signatures } =
    enrollmentIds.length > 0
      ? await supabase
          .from("attendance_signatures")
          .select(
            "enrollment_id, period_date, moment, signer_role, signature_data",
          )
          .in("enrollment_id", enrollmentIds)
      : { data: [] };

  const learnerSigsByEnrollment = new Map<string, Record<string, string>>();
  const trainerSigsByKey: Record<string, string> = {};
  for (const s of (signatures ?? []) as Array<{
    enrollment_id: string;
    period_date: string;
    moment: string;
    signer_role: string;
    signature_data: string;
  }>) {
    const key = `${s.period_date}|${s.moment}`;
    if (s.signer_role === "trainer") {
      trainerSigsByKey[key] = s.signature_data;
    } else {
      const map =
        learnerSigsByEnrollment.get(s.enrollment_id) ??
        ({} as Record<string, string>);
      map[key] = s.signature_data;
      learnerSigsByEnrollment.set(s.enrollment_id, map);
    }
  }

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
      durationHours: null,
      modalityLabel,
      locationLabel,
      trainerName,
      orgName,
      orgLogoUrl: (org as { logo_url?: string | null } | null)?.logo_url ?? null,
      orgStampUrl,
      orgLegalText,
      learner: {
        lastName,
        firstName,
        companyName: company?.name ?? null,
        companySiret: company?.siret ?? null,
        signatures: learnerSigsByEnrollment.get(e.id) ?? {},
      },
      trainerSignatures: trainerSigsByKey,
      days,
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element = React.createElement(EmargementPdf as any, { data });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfBuffer = await renderToBuffer(element as any);
      const filename = `Emargement-${slug(lastName)}-${slug(firstName)}-${formationSlug}-${dateSlug}.pdf`;
      zip.file(filename, pdfBuffer);
    } catch (err) {
      console.error(
        `[partner emargement.zip] failed for enrollment ${e.id}:`,
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
