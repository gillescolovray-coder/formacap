import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "../_resolve";
import {
  ParticipantsListClient,
  type ParticipantRow,
} from "./_list-client";

export const dynamic = "force-dynamic";

/**
 * Page « Participants » du portail partenaire (Gilles 2026-06-23).
 *
 * Liste les apprenants ayant PARTICIPÉ aux sessions liées au partenaire
 * (a distinguer des inscriptions faites via le portail, cf. onglet « Mes
 * inscriptions »). Meme perimetre que le compteur « Participants » du
 * tableau de bord :
 *   (a) enrollments (non annules) sur les sessions ou le partenaire est
 *       donneur d ordre (sous-traitance) OU prescripteur referent,
 *   (b) + inscriptions faites via le portail (referrer_company_id).
 *
 * Granularite : 1 ligne par PARTICIPATION (apprenant × session), dedup
 * par (personne, session). Recherche par apprenant / societe / formation.
 */
export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();
  const companyId = ctx.company.id;
  const orgId = ctx.company.organization_id;

  type LearnerJoin = {
    first_name: string | null;
    last_name: string | null;
    company: { name: string | null } | { name: string | null }[] | null;
    company_name_temp: string | null;
  } | null;

  const resolveCompany = (learner: LearnerJoin): string | null => {
    if (!learner) return null;
    const raw = learner.company;
    const obj = Array.isArray(raw) ? raw[0] : raw;
    return obj?.name ?? learner.company_name_temp ?? null;
  };
  const resolveName = (learner: LearnerJoin): string =>
    [learner?.first_name, learner?.last_name].filter(Boolean).join(" ").trim() ||
    "—";

  // (1) Sessions « du partenaire » (donneur d ordre OU prescripteur).
  const { data: ownSessions } = await supabase
    .from("sessions")
    .select("id")
    .or(
      `subcontracting_company_id.eq.${companyId},prescriber_company_id.eq.${companyId}`,
    )
    .neq("status", "cancelled");
  const ownSessionIds = ((ownSessions ?? []) as Array<{ id: string }>).map(
    (s) => s.id,
  );

  // (2) Inscriptions portail (referrer = ce partenaire).
  const { data: portalRequests } = await supabase
    .from("inscription_requests")
    .select(
      "id, target_session_id, learner_id, prospect_first_name, prospect_last_name, prospect_email, learner:learners(first_name, last_name, company:companies(name), company_name_temp)",
    )
    .eq("referrer_company_id", companyId);

  // (3) Enrollments sur les sessions propres du partenaire.
  type EnrollRow = {
    id: string;
    session_id: string;
    learner_id: string | null;
    learner: LearnerJoin;
  };
  let ownEnrollments: EnrollRow[] = [];
  if (ownSessionIds.length > 0) {
    const { data } = await supabase
      .from("session_enrollments")
      .select(
        "id, session_id, learner_id, learner:learners(first_name, last_name, company:companies(name), company_name_temp)",
      )
      .in("session_id", ownSessionIds)
      .neq("status", "cancelled");
    ownEnrollments = (data ?? []) as unknown as EnrollRow[];
  }

  // (4) Detail des sessions impliquees (formation, dates, modalite, statut).
  const portalSessionIds = Array.from(
    new Set(
      ((portalRequests ?? []) as Array<{ target_session_id: string | null }>)
        .map((r) => r.target_session_id)
        .filter((x): x is string => !!x),
    ),
  );
  const allSessionIds = Array.from(
    new Set([...ownSessionIds, ...portalSessionIds]),
  );
  type SessionDetail = {
    id: string;
    start_date: string | null;
    end_date: string | null;
    modality: string | null;
    status: string | null;
    formation: { title: string | null } | { title: string | null }[] | null;
  };
  const sessionById = new Map<string, SessionDetail>();
  if (allSessionIds.length > 0) {
    const { data } = await supabase
      .from("sessions")
      .select("id, start_date, end_date, modality, status, formation:formations(title)")
      .in("id", allSessionIds);
    for (const s of (data ?? []) as unknown as SessionDetail[]) {
      sessionById.set(s.id, s);
    }
  }

  // (5) Pour relier les inscriptions portail a un enrollment (et donc aux
  //     scores quiz), on charge les enrollments cibles correspondants.
  const portalLearnerIds = Array.from(
    new Set(
      ((portalRequests ?? []) as Array<{ learner_id: string | null }>)
        .map((r) => r.learner_id)
        .filter((x): x is string => !!x),
    ),
  );
  const enrollmentByLearnerSession = new Map<string, string>(); // `${learnerId}|${sessionId}` -> enrollmentId
  for (const e of ownEnrollments) {
    if (e.learner_id)
      enrollmentByLearnerSession.set(`${e.learner_id}|${e.session_id}`, e.id);
  }
  if (portalLearnerIds.length > 0 && portalSessionIds.length > 0) {
    const { data } = await supabase
      .from("session_enrollments")
      .select("id, session_id, learner_id")
      .in("session_id", portalSessionIds)
      .in("learner_id", portalLearnerIds)
      .neq("status", "cancelled");
    for (const e of (data ?? []) as Array<{
      id: string;
      session_id: string;
      learner_id: string | null;
    }>) {
      if (e.learner_id)
        enrollmentByLearnerSession.set(`${e.learner_id}|${e.session_id}`, e.id);
    }
  }

  // (6) Construit les participations (dedup par (personne, session)).
  type Draft = {
    key: string;
    learnerName: string;
    companyName: string | null;
    sessionId: string | null;
    enrollmentId: string | null;
  };
  const drafts = new Map<string, Draft>();

  for (const e of ownEnrollments) {
    const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    const personKey = e.learner_id ? `l:${e.learner_id}` : `e:${e.id}`;
    const key = `${personKey}|${e.session_id}`;
    if (!drafts.has(key)) {
      drafts.set(key, {
        key,
        learnerName: resolveName(learner),
        companyName: resolveCompany(learner),
        sessionId: e.session_id,
        enrollmentId: e.id,
      });
    }
  }

  for (const r of (portalRequests ?? []) as unknown as Array<{
    id: string;
    target_session_id: string | null;
    learner_id: string | null;
    prospect_first_name: string | null;
    prospect_last_name: string | null;
    prospect_email: string | null;
    learner: LearnerJoin;
  }>) {
    const learner = Array.isArray(r.learner) ? r.learner[0] : r.learner;
    const personKey = r.learner_id
      ? `l:${r.learner_id}`
      : `p:${(r.prospect_email ?? "").trim().toLowerCase() || `${r.prospect_first_name ?? ""}|${r.prospect_last_name ?? ""}`}`;
    const key = `${personKey}|${r.target_session_id ?? "none"}`;
    if (drafts.has(key)) continue; // deja couvert par un enrollment
    const enrollmentId =
      r.learner_id && r.target_session_id
        ? enrollmentByLearnerSession.get(
            `${r.learner_id}|${r.target_session_id}`,
          ) ?? null
        : null;
    const learnerName = learner
      ? resolveName(learner)
      : [r.prospect_first_name, r.prospect_last_name]
          .filter(Boolean)
          .join(" ")
          .trim() || "—";
    drafts.set(key, {
      key,
      learnerName,
      companyName: resolveCompany(learner),
      sessionId: r.target_session_id,
      enrollmentId,
    });
  }

  // (7) Scores quiz pour les enrollments concernes.
  const enrollmentIds = Array.from(drafts.values())
    .map((d) => d.enrollmentId)
    .filter((x): x is string => !!x);
  const scoresByEnrollment = new Map<
    string,
    { pre: number | null; post: number | null }
  >();
  if (enrollmentIds.length > 0) {
    const { data: attempts } = await supabase
      .from("quiz_attempts")
      .select("enrollment_id, phase, score, max_score")
      .in("enrollment_id", enrollmentIds);
    const pct = (s: number | null, m: number | null): number | null =>
      s === null || m === null || m === 0 ? null : Math.round((s / m) * 100);
    for (const a of (attempts ?? []) as Array<{
      enrollment_id: string;
      phase: "pre" | "post";
      score: number | null;
      max_score: number | null;
    }>) {
      const cur = scoresByEnrollment.get(a.enrollment_id) ?? {
        pre: null,
        post: null,
      };
      if (a.phase === "pre") cur.pre = pct(a.score, a.max_score);
      else if (a.phase === "post") cur.post = pct(a.score, a.max_score);
      scoresByEnrollment.set(a.enrollment_id, cur);
    }
  }

  // (8) Lignes finales.
  const rows: ParticipantRow[] = Array.from(drafts.values()).map((d) => {
    const sess = d.sessionId ? sessionById.get(d.sessionId) : undefined;
    const formation = sess
      ? Array.isArray(sess.formation)
        ? sess.formation[0]
        : sess.formation
      : null;
    const scores = d.enrollmentId
      ? scoresByEnrollment.get(d.enrollmentId) ?? null
      : null;
    return {
      key: d.key,
      learnerName: d.learnerName,
      companyName: d.companyName,
      formationTitle: formation?.title ?? null,
      startDate: sess?.start_date ?? null,
      endDate: sess?.end_date ?? null,
      modality: sess?.modality ?? null,
      status: sess?.status ?? null,
      prePct: scores?.pre ?? null,
      postPct: scores?.post ?? null,
    };
  });

  // Tri : par nom d apprenant puis date de session descendante.
  rows.sort((a, b) => {
    const n = a.learnerName.localeCompare(b.learnerName);
    if (n !== 0) return n;
    return (b.startDate ?? "").localeCompare(a.startDate ?? "");
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 pb-3 border-b border-zinc-200">
        <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Participants</h1>
          <p className="text-xs text-zinc-500 mt-0.5 max-w-3xl">
            Apprenants ayant suivi une session liée à {ctx.company.name}{" "}
            (sous-traitance, prescription ou inscription via le portail).{" "}
            <strong>À ne pas confondre</strong> avec vos inscriptions faites via
            le portail (onglet « Mes inscriptions »). Une ligne par
            participation (apprenant × formation).
          </p>
        </div>
      </div>

      <ParticipantsListClient token={token} rows={rows} />
    </div>
  );
}
