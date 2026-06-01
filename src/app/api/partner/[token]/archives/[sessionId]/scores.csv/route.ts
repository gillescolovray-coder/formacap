/**
 * Route CSV : scores quiz pre/post des apprenants d une session,
 * pour le portail OF (Gilles 2026-06-01).
 *
 * Filtre : uniquement les apprenants inscrits via cet OF
 * (inscription_channel = of + inscription_channel_company_id = ma_company).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "@/app/partenaire/[token]/_resolve";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes(";")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function slug(s: string, max = 40): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
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

  // Session info + FK (subcontracting/prescriber) pour decider la
  // strategie de chargement (Gilles 2026-06-01).
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "start_date, subcontracting_company_id, prescriber_company_id, formation:formations(title)",
    )
    .eq("id", sessionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const sessionTyped = session as unknown as {
    start_date: string | null;
    subcontracting_company_id: string | null;
    prescriber_company_id: string | null;
    formation: { title: string } | null;
  };
  const formation = Array.isArray(sessionTyped.formation)
    ? sessionTyped.formation[0]
    : sessionTyped.formation;
  const formationTitle = formation?.title ?? "Session";

  const isMineSession =
    sessionTyped.subcontracting_company_id === companyId ||
    sessionTyped.prescriber_company_id === companyId;

  // Chargement des enrollments (avec learner joint) selon strategie :
  //   - Session "a moi" (subcontracting/prescriber) -> TOUS les enrollments
  //   - Sinon -> filtre via inscription_channel='of'
  type EnrollmentRow = {
    id: string;
    learner_id: string | null;
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
        "id, learner_id, learner:learners(first_name, last_name, email)",
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
          "id, learner_id, learner:learners(first_name, last_name, email)",
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
          .select("enrollment_id, phase, score, max_score, completed_at")
          .in("enrollment_id", enrollmentIds)
      : { data: [] };
  type Attempt = {
    enrollment_id: string;
    phase: "pre" | "post";
    score: number | null;
    max_score: number | null;
    completed_at: string | null;
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

  function pct(s: number | null, m: number | null): number | null {
    if (s === null || m === null || m === 0) return null;
    return Math.round((s / m) * 100);
  }

  const header = [
    "Nom",
    "Prenom",
    "Email",
    "Score pre (%)",
    "Score post (%)",
    "Progression (pts)",
    "Pre - points obtenus",
    "Pre - points max",
    "Post - points obtenus",
    "Post - points max",
    "Date completion pre",
    "Date completion post",
  ];

  const lines: string[] = [header.map(csvEscape).join(";")];

  // Tri par nom de famille
  const sortedEnrollments = [...enrollmentRows].sort((a, b) => {
    const la = Array.isArray(a.learner) ? a.learner[0] : a.learner;
    const lb = Array.isArray(b.learner) ? b.learner[0] : b.learner;
    return (la?.last_name ?? "").localeCompare(lb?.last_name ?? "");
  });

  for (const e of sortedEnrollments) {
    const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    const lastName = learner?.last_name ?? "";
    const firstName = learner?.first_name ?? "";
    const email = learner?.email ?? "";
    const scores = scoresByEnrollment.get(e.id) ?? null;
    const prePct = scores?.pre
      ? pct(scores.pre.score, scores.pre.max_score)
      : null;
    const postPct = scores?.post
      ? pct(scores.post.score, scores.post.max_score)
      : null;
    const progression =
      prePct !== null && postPct !== null ? postPct - prePct : null;

    lines.push(
      [
        lastName,
        firstName,
        email,
        prePct,
        postPct,
        progression,
        scores?.pre?.score,
        scores?.pre?.max_score,
        scores?.post?.score,
        scores?.post?.max_score,
        scores?.pre?.completed_at,
        scores?.post?.completed_at,
      ]
        .map(csvEscape)
        .join(";"),
    );
  }

  const csv = lines.join("\n");
  const filename = `Quiz-Scores-${slug(formationTitle)}-${(sessionTyped.start_date ?? "").slice(0, 10)}.csv`;

  // BOM UTF-8 pour Excel
  const bom = "﻿";

  return new NextResponse(bom + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
