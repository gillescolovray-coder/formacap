/**
 * Queries KPI du dashboard refondu (Gilles 2026-05-23).
 *
 * Toutes les queries renvoient un compteur ou un petit résultat utilisé
 * pour les KpiCards. Les calculs complexes (% Qualiopi par session) sont
 * faits ici pour ne pas polluer page.tsx.
 *
 * Performance : on privilégie `count: 'exact', head: true` quand possible.
 * Les jointures lourdes (ex: positionnement par session) sont faites en
 * 1 round-trip via PostgREST + traitement côté code.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (d: number) =>
  new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

// ============================================================
// 🚨 ALERTES URGENTES
// ============================================================

/** Sessions confirmées sans formateur assigné (trainer_id IS NULL). */
export async function countSessionsConfirmedNoTrainer(
  supabase: SupabaseClient,
): Promise<number> {
  const { count } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed")
    .is("trainer_id", null);
  return count ?? 0;
}

/**
 * Sessions confirmées sans quiz pédagogique attaché. Une session a un quiz
 * si soit session.quiz_template_id est défini, soit la formation rattachée
 * en a un par défaut.
 */
export async function countSessionsConfirmedNoQuiz(
  supabase: SupabaseClient,
): Promise<number> {
  // 1. Récup sessions confirmées sans quiz_template_id propre
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, formation_id, quiz_template_id")
    .eq("status", "confirmed")
    .is("quiz_template_id", null);
  if (!sessions || sessions.length === 0) return 0;

  // 2. Pour ces sessions, voir lesquelles ont une formation avec quiz par défaut
  const formationIds = Array.from(
    new Set(
      (sessions as Array<{ formation_id: string }>).map((s) => s.formation_id),
    ),
  );
  if (formationIds.length === 0) return sessions.length;

  const { data: formations } = await supabase
    .from("formations")
    .select("id, quiz_template_id")
    .in("id", formationIds);

  const formationsWithQuiz = new Set(
    ((formations ?? []) as Array<{
      id: string;
      quiz_template_id: string | null;
    }>)
      .filter((f) => f.quiz_template_id !== null)
      .map((f) => f.id),
  );

  // Compter celles dont la formation N'A PAS de quiz par défaut
  return (sessions as Array<{ formation_id: string }>).filter(
    (s) => !formationsWithQuiz.has(s.formation_id),
  ).length;
}

/** Sessions confirmées sans aucun apprenant inscrit. */
export async function countSessionsConfirmedNoEnrollment(
  supabase: SupabaseClient,
): Promise<number> {
  // 1. Sessions confirmées
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("status", "confirmed");
  if (!sessions || sessions.length === 0) return 0;

  // 2. Sessions avec au moins un enrollment
  const sessionIds = (sessions as Array<{ id: string }>).map((s) => s.id);
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("session_id")
    .in("session_id", sessionIds);
  const sessionsWithLearners = new Set(
    ((enrollments ?? []) as Array<{ session_id: string }>).map(
      (e) => e.session_id,
    ),
  );
  return sessionIds.filter((id) => !sessionsWithLearners.has(id)).length;
}

// ============================================================
// 📅 SESSIONS À VENIR / SUIVI
// ============================================================

/** Sessions confirmées à démarrer dans les 7 prochains jours. */
export async function countSessionsStartingThisWeek(
  supabase: SupabaseClient,
): Promise<number> {
  const { count } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed")
    .gte("start_date", today())
    .lte("start_date", inDays(7));
  return count ?? 0;
}

/**
 * Sessions confirmées démarrant dans < 7j où tous les apprenants n'ont
 * pas encore rempli leur test de positionnement.
 */
export async function countSessionsPositionnementIncomplete(
  supabase: SupabaseClient,
): Promise<number> {
  // 1. Sessions confirmées proches du démarrage
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("status", "confirmed")
    .gte("start_date", today())
    .lte("start_date", inDays(7));
  if (!sessions || sessions.length === 0) return 0;

  const sessionIds = (sessions as Array<{ id: string }>).map((s) => s.id);

  // 2. Enrollments par session (id + session_id)
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id, session_id")
    .in("session_id", sessionIds);
  if (!enrollments || enrollments.length === 0) return 0;

  const enrollmentRows = enrollments as Array<{
    id: string;
    session_id: string;
  }>;
  const enrollmentIds = enrollmentRows.map((e) => e.id);

  // 3. Positionnement existants pour ces enrollments
  const { data: positioning } = await supabase
    .from("positioning_responses")
    .select("enrollment_id, learner_submitted_at")
    .in("enrollment_id", enrollmentIds)
    .not("learner_submitted_at", "is", null);
  const filledEnrollments = new Set(
    ((positioning ?? []) as Array<{ enrollment_id: string }>).map(
      (p) => p.enrollment_id,
    ),
  );

  // 4. Pour chaque session : total enrollments vs filled
  const totalsBySession = new Map<string, number>();
  const filledBySession = new Map<string, number>();
  for (const e of enrollmentRows) {
    totalsBySession.set(
      e.session_id,
      (totalsBySession.get(e.session_id) ?? 0) + 1,
    );
    if (filledEnrollments.has(e.id)) {
      filledBySession.set(
        e.session_id,
        (filledBySession.get(e.session_id) ?? 0) + 1,
      );
    }
  }

  let count = 0;
  for (const sid of sessionIds) {
    const tot = totalsBySession.get(sid) ?? 0;
    const fill = filledBySession.get(sid) ?? 0;
    if (tot > 0 && fill < tot) count++;
  }
  return count;
}

/**
 * Sessions terminées (status=confirmed ou completed, end_date < today)
 * sans émargement complet : on considère qu'une session est "complète"
 * si le ratio (signatures formateur + signatures apprenant) atteint au
 * moins 50% du total attendu (formateur × demi-journées + apprenants ×
 * demi-journées). Heuristique : on compte les sessions qui ont 0
 * signature attendance.
 */
export async function countSessionsEmargementMissing(
  supabase: SupabaseClient,
): Promise<number> {
  // 1. Sessions terminées récentes (90 derniers jours pour limiter le scope)
  const ninetyDaysAgo = inDays(-90);
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id")
    .in("status", ["confirmed", "completed"])
    .lt("end_date", today())
    .gte("end_date", ninetyDaysAgo);
  if (!sessions || sessions.length === 0) return 0;

  const sessionIds = (sessions as Array<{ id: string }>).map((s) => s.id);

  // 2. Récup enrollments → enrollment_ids pour join attendance
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id, session_id")
    .in("session_id", sessionIds);
  if (!enrollments || enrollments.length === 0) return 0;

  const enrollmentRows = enrollments as Array<{
    id: string;
    session_id: string;
  }>;
  const enrollmentIds = enrollmentRows.map((e) => e.id);
  const sessionByEnrollment = new Map(
    enrollmentRows.map((e) => [e.id, e.session_id]),
  );

  // 3. Compter signatures par session
  const { data: signatures } = await supabase
    .from("attendance_signatures")
    .select("enrollment_id")
    .in("enrollment_id", enrollmentIds);
  const signaturesBySession = new Map<string, number>();
  for (const s of (signatures ?? []) as Array<{ enrollment_id: string }>) {
    const sid = sessionByEnrollment.get(s.enrollment_id);
    if (!sid) continue;
    signaturesBySession.set(sid, (signaturesBySession.get(sid) ?? 0) + 1);
  }

  // 4. Sessions avec 0 signature
  return sessionIds.filter((sid) => (signaturesBySession.get(sid) ?? 0) === 0)
    .length;
}

/**
 * Sessions terminées sans bilan formateur (Module 7 / session_trainer_reports).
 * Fallback silencieux si la table n'existe pas (avant migration 0101).
 */
export async function countSessionsWithoutTrainerReport(
  supabase: SupabaseClient,
): Promise<number> {
  const ninetyDaysAgo = inDays(-90);
  // Sessions terminées récentes
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id")
    .in("status", ["confirmed", "completed"])
    .lt("end_date", today())
    .gte("end_date", ninetyDaysAgo);
  if (!sessions || sessions.length === 0) return 0;

  const sessionIds = (sessions as Array<{ id: string }>).map((s) => s.id);

  try {
    const { data: reports, error } = await supabase
      .from("session_trainer_reports")
      .select("session_id")
      .in("session_id", sessionIds)
      .not("signed_at", "is", null);
    if (error) return 0; // table absente → on ignore
    const withReport = new Set(
      ((reports ?? []) as Array<{ session_id: string }>).map(
        (r) => r.session_id,
      ),
    );
    return sessionIds.filter((id) => !withReport.has(id)).length;
  } catch {
    return 0;
  }
}

// ============================================================
// 💰 PIPELINE COMMERCIAL
// ============================================================

/** Pré-inscriptions partenaires en attente de validation. */
export async function countPreinscriptionsPending(
  supabase: SupabaseClient,
): Promise<number> {
  // Selon le schéma (cf. project_preinscription_publique) : stage='preinscription'
  // signifie en attente. Fallback : on compte les requests via_partner_portal
  // sans target_session_id confirmée.
  try {
    const { count } = await supabase
      .from("inscription_requests")
      .select("id", { count: "exact", head: true })
      .eq("stage", "preinscription");
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Inscriptions (session_enrollments) dont le learner n'a pas d'email. */
export async function countEnrollmentsLearnerNoEmail(
  supabase: SupabaseClient,
): Promise<number> {
  // Approche : récup tous les learner_id distincts des enrollments actifs,
  // puis compter ceux dont email IS NULL.
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("learner_id");
  if (!enrollments || enrollments.length === 0) return 0;

  const learnerIds = Array.from(
    new Set(
      (enrollments as Array<{ learner_id: string | null }>)
        .map((e) => e.learner_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (learnerIds.length === 0) return 0;

  const { count } = await supabase
    .from("learners")
    .select("id", { count: "exact", head: true })
    .in("id", learnerIds)
    .is("email", null);
  return count ?? 0;
}

/** Inscriptions dont le learner n'a pas d'entreprise rattachée. */
export async function countEnrollmentsLearnerNoCompany(
  supabase: SupabaseClient,
): Promise<number> {
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("learner_id");
  if (!enrollments || enrollments.length === 0) return 0;

  const learnerIds = Array.from(
    new Set(
      (enrollments as Array<{ learner_id: string | null }>)
        .map((e) => e.learner_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (learnerIds.length === 0) return 0;

  const { count } = await supabase
    .from("learners")
    .select("id", { count: "exact", head: true })
    .in("id", learnerIds)
    .is("company_id", null);
  return count ?? 0;
}

/**
 * CA potentiel à venir : somme HT des montants devisés sur les inscriptions
 * dont la session est confirmée et pas encore terminée.
 */
export async function computeUpcomingRevenueHt(
  supabase: SupabaseClient,
): Promise<number> {
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("status", "confirmed")
    .gte("end_date", today());
  if (!sessions || sessions.length === 0) return 0;

  const sessionIds = (sessions as Array<{ id: string }>).map((s) => s.id);

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "inscription_request_id, request:inscription_requests(quote_amount_ht)",
    )
    .in("session_id", sessionIds);

  let total = 0;
  for (const e of (enrollments ?? []) as Array<{
    inscription_request_id: string | null;
    request:
      | { quote_amount_ht: number | null }
      | Array<{ quote_amount_ht: number | null }>
      | null;
  }>) {
    const req = Array.isArray(e.request) ? e.request[0] : e.request;
    const n = req?.quote_amount_ht;
    if (n !== null && n !== undefined) {
      const v = Number(n);
      if (Number.isFinite(v)) total += v;
    }
  }
  return total;
}

// ============================================================
// ✅ ÉTAT QUALIOPI
// ============================================================

export type SessionQualiopiScore = {
  sessionId: string;
  title: string;
  endDate: string;
  scorePercent: number; // 0-100
  positioningOk: boolean;
  emargementOk: boolean;
  evaluationOk: boolean;
  bilanOk: boolean;
};

/**
 * Calcule un score Qualiopi simplifié pour les 30 dernières sessions
 * terminées. Chaque indicateur compte pour 25% :
 *  - positionnement : tous les apprenants ont rempli leur positionnement
 *  - émargement : au moins 1 signature par enrollment
 *  - évaluation à chaud : au moins 1 réponse par enrollment
 *  - bilan formateur : ligne session_trainer_reports signée
 */
export async function computeQualiopiScores(
  supabase: SupabaseClient,
  limit = 30,
): Promise<SessionQualiopiScore[]> {
  const ninetyDaysAgo = inDays(-90);
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, end_date, formation:formations(title)")
    .in("status", ["confirmed", "completed"])
    .lt("end_date", today())
    .gte("end_date", ninetyDaysAgo)
    .order("end_date", { ascending: false })
    .limit(limit);
  if (!sessions || sessions.length === 0) return [];

  type SRow = {
    id: string;
    end_date: string;
    formation:
      | { title: string }
      | Array<{ title: string }>
      | null;
  };
  const rows = sessions as SRow[];
  const sessionIds = rows.map((r) => r.id);

  // Enrollments par session
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id, session_id")
    .in("session_id", sessionIds);
  const enrollmentRows = (enrollments ?? []) as Array<{
    id: string;
    session_id: string;
  }>;
  const enrollmentIds = enrollmentRows.map((e) => e.id);
  const enrollmentsBySession = new Map<string, string[]>();
  for (const e of enrollmentRows) {
    if (!enrollmentsBySession.has(e.session_id)) {
      enrollmentsBySession.set(e.session_id, []);
    }
    enrollmentsBySession.get(e.session_id)!.push(e.id);
  }

  // En parallèle : positionnement, signatures, évals, bilans
  const [posRes, sigRes, evalRes, reportsRes] = await Promise.all([
    enrollmentIds.length > 0
      ? supabase
          .from("positioning_responses")
          .select("enrollment_id, learner_submitted_at")
          .in("enrollment_id", enrollmentIds)
          .not("learner_submitted_at", "is", null)
      : Promise.resolve({ data: [] as Array<{ enrollment_id: string }> }),
    enrollmentIds.length > 0
      ? supabase
          .from("attendance_signatures")
          .select("enrollment_id")
          .in("enrollment_id", enrollmentIds)
          .eq("signer_role", "learner")
      : Promise.resolve({ data: [] as Array<{ enrollment_id: string }> }),
    enrollmentIds.length > 0
      ? supabase
          .from("evaluation_responses")
          .select("enrollment_id, submitted_at")
          .in("enrollment_id", enrollmentIds)
          .eq("evaluation_type", "hot")
          .not("submitted_at", "is", null)
      : Promise.resolve({ data: [] as Array<{ enrollment_id: string }> }),
    (async () => {
      try {
        const { data, error } = await supabase
          .from("session_trainer_reports")
          .select("session_id")
          .in("session_id", sessionIds)
          .not("signed_at", "is", null);
        if (error) return { data: [] };
        return { data: data ?? [] };
      } catch {
        return { data: [] };
      }
    })(),
  ]);

  const posFilled = new Set(
    ((posRes.data ?? []) as Array<{ enrollment_id: string }>).map(
      (p) => p.enrollment_id,
    ),
  );
  const sigBy = new Set(
    ((sigRes.data ?? []) as Array<{ enrollment_id: string }>).map(
      (s) => s.enrollment_id,
    ),
  );
  const evalFilled = new Set(
    ((evalRes.data ?? []) as Array<{ enrollment_id: string }>).map(
      (e) => e.enrollment_id,
    ),
  );
  const reportsSigned = new Set(
    ((reportsRes.data ?? []) as Array<{ session_id: string }>).map(
      (r) => r.session_id,
    ),
  );

  return rows.map((r) => {
    const enrollments = enrollmentsBySession.get(r.id) ?? [];
    const total = enrollments.length;
    const positioningOk =
      total > 0 && enrollments.every((id) => posFilled.has(id));
    const emargementOk =
      total > 0 && enrollments.every((id) => sigBy.has(id));
    const evaluationOk =
      total > 0 && enrollments.every((id) => evalFilled.has(id));
    const bilanOk = reportsSigned.has(r.id);

    const score =
      ((positioningOk ? 1 : 0) +
        (emargementOk ? 1 : 0) +
        (evaluationOk ? 1 : 0) +
        (bilanOk ? 1 : 0)) /
      4;
    const formation = Array.isArray(r.formation) ? r.formation[0] : r.formation;
    return {
      sessionId: r.id,
      title: formation?.title ?? "Session",
      endDate: r.end_date,
      scorePercent: Math.round(score * 100),
      positioningOk,
      emargementOk,
      evaluationOk,
      bilanOk,
    };
  });
}

/** Formateurs actifs sans aucune formation animable liée. */
export async function countTrainersWithoutFormations(
  supabase: SupabaseClient,
): Promise<number> {
  const { data: trainers } = await supabase
    .from("trainers")
    .select("id")
    .eq("is_active", true);
  if (!trainers || trainers.length === 0) return 0;
  const trainerIds = (trainers as Array<{ id: string }>).map((t) => t.id);

  const { data: links } = await supabase
    .from("trainer_formations")
    .select("trainer_id")
    .in("trainer_id", trainerIds);
  const withLinks = new Set(
    ((links ?? []) as Array<{ trainer_id: string }>).map((l) => l.trainer_id),
  );
  return trainerIds.filter((id) => !withLinks.has(id)).length;
}

/** Formateurs actifs sans token portail (accès non activé). */
export async function countTrainersWithoutPortal(
  supabase: SupabaseClient,
): Promise<number> {
  const { data: trainers } = await supabase
    .from("trainers")
    .select("id")
    .eq("is_active", true);
  if (!trainers || trainers.length === 0) return 0;
  const trainerIds = (trainers as Array<{ id: string }>).map((t) => t.id);

  const { data: tokens } = await supabase
    .from("trainer_portal_tokens")
    .select("trainer_id")
    .in("trainer_id", trainerIds);
  const withToken = new Set(
    ((tokens ?? []) as Array<{ trainer_id: string }>).map((t) => t.trainer_id),
  );
  return trainerIds.filter((id) => !withToken.has(id)).length;
}
