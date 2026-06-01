/**
 * Route PDF : synthese des resultats quiz pre/post pour le portail
 * OF Archives (Gilles 2026-06-01). Remplace l ancien export CSV
 * /scores.csv.
 *
 * Strategie de chargement des apprenants (cf. archives/[sessionId]/page.tsx) :
 *   - Si le partenaire est subcontracting OU prescriber de la session :
 *     TOUS les enrollments actifs.
 *   - Sinon : filtre via inscription_channel='of' + canal_company_id.
 */
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "@/app/partenaire/[token]/_resolve";
import {
  SyntheseScoresPdf,
  type SyntheseScoresPdfData,
  type SyntheseScoresPdfRow,
} from "@/lib/synthese-scores/pdf-template";

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

function pct(score: number | null, max: number | null): number | null {
  if (score === null || max === null || max === 0) return null;
  return Math.round((score / max) * 100);
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
      "id, start_date, end_date, modality, is_inter, subcontracting_company_id, prescriber_company_id, location, location_obj:formation_locations!location_id(name, city), formation:formations(title)",
    )
    .eq("id", sessionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const sessionTyped = session as unknown as {
    id: string;
    start_date: string | null;
    end_date: string | null;
    modality: string | null;
    is_inter: boolean | null;
    subcontracting_company_id: string | null;
    prescriber_company_id: string | null;
    location: string | null;
    location_obj: { name: string; city: string | null } | null;
    formation: { title: string } | null;
  };
  const formation = Array.isArray(sessionTyped.formation)
    ? sessionTyped.formation[0]
    : sessionTyped.formation;
  const formationTitle = formation?.title ?? "Session";
  const locObj = Array.isArray(sessionTyped.location_obj)
    ? sessionTyped.location_obj[0]
    : sessionTyped.location_obj;
  const locationLabel = locObj
    ? [locObj.name, locObj.city].filter(Boolean).join(" — ")
    : sessionTyped.location;
  const modalityLabel =
    sessionTyped.modality === "presentiel"
      ? "Présentiel"
      : sessionTyped.modality === "distanciel"
        ? "Distanciel"
        : sessionTyped.modality === "hybride"
          ? "Hybride"
          : null;

  const isMineSession =
    sessionTyped.subcontracting_company_id === companyId ||
    sessionTyped.prescriber_company_id === companyId;

  // Organisation (logo + cachet + mentions)
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url, legal_mentions, signature_stamp_path")
    .eq("id", orgId)
    .maybeSingle();
  const orgName = (org as { name?: string } | null)?.name ?? "CAP NUMERIQUE";
  const orgLogoUrl =
    (org as { logo_url?: string | null } | null)?.logo_url ?? null;

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

  // Charge les enrollments selon strategie
  type EnrollmentRow = {
    id: string;
    learner: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  };

  let enrollmentRows: EnrollmentRow[] = [];

  if (isMineSession) {
    const { data } = await supabase
      .from("session_enrollments")
      .select(
        "id, learner:learners(first_name, last_name, email)",
      )
      .eq("session_id", sessionId)
      .neq("status", "cancelled");
    enrollmentRows = (data ?? []) as unknown as EnrollmentRow[];
  } else {
    const { data: inscriptions } = await supabase
      .from("inscription_requests")
      .select("learner_id")
      .eq("organization_id", orgId)
      .eq("target_session_id", sessionId)
      .eq("inscription_channel", "of")
      .eq("inscription_channel_company_id", companyId);
    const learnerIds = ((inscriptions ?? []) as Array<{
      learner_id: string | null;
    }>)
      .map((r) => r.learner_id)
      .filter((id): id is string => !!id);
    if (learnerIds.length > 0) {
      const { data } = await supabase
        .from("session_enrollments")
        .select(
          "id, learner:learners(first_name, last_name, email)",
        )
        .eq("session_id", sessionId)
        .in("learner_id", learnerIds)
        .neq("status", "cancelled");
      enrollmentRows = (data ?? []) as unknown as EnrollmentRow[];
    }
  }

  const enrollmentIds = enrollmentRows.map((e) => e.id);

  // Quiz attempts
  const { data: attempts } =
    enrollmentIds.length > 0
      ? await supabase
          .from("quiz_attempts")
          .select("enrollment_id, phase, score, max_score")
          .in("enrollment_id", enrollmentIds)
      : { data: [] };
  type Attempt = {
    enrollment_id: string;
    phase: "pre" | "post";
    score: number | null;
    max_score: number | null;
  };
  const scoresByEnrollment = new Map<
    string,
    { pre: Attempt | null; post: Attempt | null }
  >();
  for (const a of (attempts ?? []) as Attempt[]) {
    const cur = scoresByEnrollment.get(a.enrollment_id) ?? {
      pre: null,
      post: null,
    };
    if (a.phase === "pre") cur.pre = a;
    else cur.post = a;
    scoresByEnrollment.set(a.enrollment_id, cur);
  }

  // Tri alphabetique par nom
  const sortedRows = [...enrollmentRows].sort((a, b) => {
    const la = Array.isArray(a.learner) ? a.learner[0] : a.learner;
    const lb = Array.isArray(b.learner) ? b.learner[0] : b.learner;
    return (la?.last_name ?? "").localeCompare(lb?.last_name ?? "");
  });

  const rows: SyntheseScoresPdfRow[] = sortedRows.map((e) => {
    const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    const lastName = learner?.last_name ?? "";
    const firstName = learner?.first_name ?? "";
    const email = learner?.email ?? null;
    const scores = scoresByEnrollment.get(e.id) ?? null;
    const prePct = scores?.pre
      ? pct(scores.pre.score, scores.pre.max_score)
      : null;
    const postPct = scores?.post
      ? pct(scores.post.score, scores.post.max_score)
      : null;
    const progression =
      prePct !== null && postPct !== null ? postPct - prePct : null;
    return {
      fullName:
        [firstName, lastName].filter(Boolean).join(" ").trim() || "—",
      email,
      prePct,
      postPct,
      progression,
    };
  });

  const data: SyntheseScoresPdfData = {
    formationTitle,
    startDate: sessionTyped.start_date,
    endDate: sessionTyped.end_date,
    modalityLabel,
    isInter: sessionTyped.is_inter,
    locationLabel,
    orgName,
    orgLogoUrl,
    orgStampUrl,
    orgLegalText,
    partnerName: partnerCtx.company.name,
    rows,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(SyntheseScoresPdf as any, { data });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(element as any);

  const dateSlug = (sessionTyped.start_date ?? "").slice(0, 10);
  const filename = `Synthese-Resultats-${slug(formationTitle)}-${dateSlug}.pdf`;

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
