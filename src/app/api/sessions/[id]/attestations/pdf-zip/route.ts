/**
 * Route API : telecharge un ZIP de N attestations PDF individuelles
 * (Gilles 2026-06-01).
 *
 * GET /api/sessions/[id]/attestations/pdf-zip?enrollment_ids=id1,id2,id3
 *
 * Genere 1 PDF par enrollment + zip dans 1 archive.
 * Nommage : Attestation-NOM-Prenom-Formation-Date.pdf
 */
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";
import React from "react";
import { createClient } from "@/lib/supabase/server";
import {
  AttestationPdf,
  type AttestationPdfData,
} from "@/lib/attestations/pdf-template";
import type { SessionDay } from "@/lib/sessions/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODALITY_FR: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

function slug(s: string | null | undefined, max = 40): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
}

function timeToMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}
function diffMin(start: string | null, end: string | null): number {
  const s = timeToMin(start);
  const e = timeToMin(end);
  if (s === null || e === null || e <= s) return 0;
  return e - s;
}
function formatHours(h: number): string {
  if (h <= 0) return "0 h";
  const whole = Math.floor(h);
  const frac = Math.round((h - whole) * 60);
  if (frac === 0) return `${whole} heures`;
  return `${whole} h ${frac.toString().padStart(2, "0")}`;
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

  // Session + formation + lieu + trainer
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, modality, trainer_name, formation:formations(id, title), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const sessionTyped = session as unknown as {
    id: string;
    start_date: string;
    end_date: string;
    modality: string | null;
    trainer_name: string | null;
    formation: { title: string } | null;
    trainer: { first_name: string; last_name: string } | null;
  };

  // Organisation
  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(name, logo_url, legal_mentions, signature_stamp_path, legal_representative_name, legal_representative_role)",
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
    legal_representative_name: string | null;
    legal_representative_role: string | null;
  } | null;
  const orgName = organization?.name ?? "CAP NUMERIQUE";

  let orgStampUrl: string | null = null;
  if (organization?.signature_stamp_path) {
    const { data: signed } = await supabase.storage
      .from("organization-signatures")
      .createSignedUrl(organization.signature_stamp_path, 3600);
    orgStampUrl = signed?.signedUrl ?? null;
  }

  const orgLegalText = organization?.legal_mentions
    ? organization.legal_mentions
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : null;

  // Session days (pour calcul heures planifiees + assiduite)
  const { data: sessionDays } = await supabase
    .from("session_days")
    .select("*")
    .eq("session_id", sessionId)
    .order("day_date", { ascending: true });
  const sortedDays = (sessionDays ?? []).slice() as SessionDay[];
  const totalPlannedMin = sortedDays.reduce(
    (sum, d) =>
      sum +
      diffMin(d.morning_start, d.morning_end) +
      diffMin(d.afternoon_start, d.afternoon_end),
    0,
  );
  const totalPlannedHours = totalPlannedMin / 60;

  // Enrollments + attendances pour chacun
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, civility, birth_date, birth_place, company:companies(name))",
    )
    .eq("session_id", sessionId)
    .in("id", enrollmentIds);

  const { data: attendancesAll } = await supabase
    .from("attendances")
    .select("enrollment_id, period_date, moment, status")
    .in("enrollment_id", enrollmentIds);

  // FIX Gilles 2026-06-03 : la signature d apprenant sur la feuille
  // d emargement vaut preuve de presence (cf. /attestations/[id]/print).
  const { data: signaturesAll } = await supabase
    .from("attendance_signatures")
    .select("enrollment_id, period_date, moment, signer_role")
    .in("enrollment_id", enrollmentIds)
    .eq("signer_role", "learner");

  const attByEnrollment = new Map<string, Map<string, string>>();
  for (const a of (attendancesAll ?? []) as Array<{
    enrollment_id: string;
    period_date: string;
    moment: string;
    status: string;
  }>) {
    const m =
      attByEnrollment.get(a.enrollment_id) ?? new Map<string, string>();
    m.set(`${a.period_date}:${a.moment}`, a.status);
    attByEnrollment.set(a.enrollment_id, m);
  }
  const signedByEnrollment = new Map<string, Set<string>>();
  for (const s of (signaturesAll ?? []) as Array<{
    enrollment_id: string;
    period_date: string;
    moment: string;
  }>) {
    const set = signedByEnrollment.get(s.enrollment_id) ?? new Set<string>();
    set.add(`${s.period_date}:${s.moment}`);
    signedByEnrollment.set(s.enrollment_id, set);
  }

  const startDateLabel = new Date(sessionTyped.start_date).toLocaleDateString(
    "fr-FR",
  );
  const endDateLabel = new Date(sessionTyped.end_date).toLocaleDateString(
    "fr-FR",
  );
  const todayLabel = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formationTitle = sessionTyped.formation?.title ?? "Action de formation";
  const dateSlug = (sessionTyped.start_date ?? "").slice(0, 10);
  const formationSlug = slug(formationTitle, 50);
  const modalityLabel = sessionTyped.modality
    ? MODALITY_FR[sessionTyped.modality] ?? null
    : null;
  const trainerName =
    sessionTyped.trainer_name ??
    (sessionTyped.trainer
      ? `${sessionTyped.trainer.first_name} ${sessionTyped.trainer.last_name}`.trim()
      : null);

  const zip = new JSZip();

  for (const e of (enrollments ?? []) as unknown as Array<{
    id: string;
    learner: {
      first_name: string | null;
      last_name: string | null;
      civility: string | null;
      birth_date: string | null;
      birth_place: string | null;
      company: { name: string | null } | null;
    } | null;
  }>) {
    const lInfo = e.learner;
    if (!lInfo) continue;

    // Heures suivies pour cet apprenant : on cumule attendances status
    // present/late ET signatures graphiques (preuve forte de presence).
    const attMap = attByEnrollment.get(e.id) ?? new Map<string, string>();
    const signedSet = signedByEnrollment.get(e.id) ?? new Set<string>();
    const isPresentLocal = (key: string) => {
      if (signedSet.has(key)) return true;
      const s = attMap.get(key);
      return s === "present" || s === "late";
    };
    let actualMinutes = 0;
    for (const d of sortedDays) {
      if (isPresentLocal(`${d.day_date}:morning`)) {
        actualMinutes += diffMin(d.morning_start, d.morning_end);
      }
      if (isPresentLocal(`${d.day_date}:afternoon`)) {
        actualMinutes += diffMin(d.afternoon_start, d.afternoon_end);
      }
    }
    // Si aucune donnee de presence (ni attendance, ni signature),
    // on suppose 100 %.
    if (attMap.size === 0 && signedSet.size === 0) {
      actualMinutes = totalPlannedMin;
    }
    const actualHours = actualMinutes / 60;
    const ratePct =
      totalPlannedHours > 0
        ? Math.round((actualHours / totalPlannedHours) * 100)
        : null;

    const lastName = (lInfo.last_name ?? "Inconnu").toUpperCase();
    const firstName = lInfo.first_name ?? "";
    const company = Array.isArray(lInfo.company)
      ? (lInfo.company[0] as { name: string | null } | undefined)
      : lInfo.company;

    const data: AttestationPdfData = {
      orgName,
      orgLogoUrl: organization?.logo_url ?? null,
      orgStampUrl,
      orgLegalText,
      orgLegalRepName: organization?.legal_representative_name ?? null,
      orgLegalRepRole: organization?.legal_representative_role ?? null,
      formationTitle,
      startDateLabel,
      endDateLabel,
      modalityLabel,
      trainerName,
      totalPlannedHoursLabel: formatHours(totalPlannedHours),
      actualHoursLabel: formatHours(actualHours),
      attendanceRatePct: ratePct,
      todayLabel,
      learner: {
        civility: lInfo.civility,
        fullName: [firstName, lastName].filter(Boolean).join(" "),
        birthDateLabel: lInfo.birth_date
          ? new Date(lInfo.birth_date).toLocaleDateString("fr-FR")
          : null,
        birthPlace: lInfo.birth_place,
        companyName: company?.name ?? null,
      },
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element = React.createElement(AttestationPdf as any, { data });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfBuffer = await renderToBuffer(element as any);
      const filename = `Attestation-${slug(lastName)}-${slug(firstName)}-${formationSlug}-${dateSlug}.pdf`;
      zip.file(filename, pdfBuffer);
    } catch (err) {
      console.error(
        `[attestations/pdf-zip] Echec PDF pour enrollment ${e.id} :`,
        (err as Error).message,
      );
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  const zipName = `Attestations-${formationSlug}-${dateSlug}.zip`;

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store",
    },
  });
}
