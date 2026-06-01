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

  // Session info pour le nom de fichier
  const { data: session } = await supabase
    .from("sessions")
    .select("start_date, formation:formations(title)")
    .eq("id", sessionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const sessionTyped = session as unknown as {
    start_date: string | null;
    formation: { title: string } | null;
  };
  const formation = Array.isArray(sessionTyped.formation)
    ? sessionTyped.formation[0]
    : sessionTyped.formation;
  const formationTitle = formation?.title ?? "Session";

  // Inscriptions via cet OF
  const { data: inscriptions } = await supabase
    .from("inscription_requests")
    .select(
      "learner_id, prospect_first_name, prospect_last_name, prospect_email, learner:learners(first_name, last_name, email)",
    )
    .eq("organization_id", orgId)
    .eq("target_session_id", sessionId)
    .eq("inscription_channel", "of")
    .eq("inscription_channel_company_id", companyId);

  type Row = {
    learner_id: string | null;
    prospect_first_name: string | null;
    prospect_last_name: string | null;
    prospect_email: string | null;
    learner: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  };

  const learnerIds = ((inscriptions ?? []) as unknown as Row[])
    .map((r) => r.learner_id)
    .filter((id): id is string => !!id);

  // Enrollments
  const { data: enrollments } =
    learnerIds.length > 0
      ? await supabase
          .from("session_enrollments")
          .select("id, learner_id")
          .eq("session_id", sessionId)
          .in("learner_id", learnerIds)
      : { data: [] };
  const enrollmentByLearner = new Map<string, string>();
  for (const e of (enrollments ?? []) as Array<{
    id: string;
    learner_id: string;
  }>) {
    enrollmentByLearner.set(e.learner_id, e.id);
  }
  const enrollmentIds = Array.from(enrollmentByLearner.values());

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

  for (const r of (inscriptions ?? []) as unknown as Row[]) {
    const learner = Array.isArray(r.learner) ? r.learner[0] : r.learner;
    const lastName = learner?.last_name ?? r.prospect_last_name ?? "";
    const firstName = learner?.first_name ?? r.prospect_first_name ?? "";
    const email = learner?.email ?? r.prospect_email ?? "";
    const enrollmentId = r.learner_id
      ? enrollmentByLearner.get(r.learner_id) ?? null
      : null;
    const scores = enrollmentId
      ? scoresByEnrollment.get(enrollmentId) ?? null
      : null;
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
