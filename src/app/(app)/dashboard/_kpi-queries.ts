/**
 * Queries KPI du dashboard refondu (Gilles 2026-05-23).
 *
 * V2 (2026-05-23 après-midi) : chaque query renvoie
 * `{ count, items[] }` au lieu d'un simple count.
 * - `count` : compteur affiché sur la card
 * - `items` : liste cliquable (label + href + sub-info) dépliable au clic
 *   La query ne renvoie que les 10 premiers (LIMIT) pour limiter
 *   le payload.
 *
 * Si `count === 0`, la card n'est pas affichée du tout dans le
 * dashboard (économie d'espace visuel — Gilles 2026-05-23).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (d: number) =>
  new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

const MAX_ITEMS = 10;

export type KpiItem = {
  /** Libellé principal cliquable. */
  label: string;
  /** Lien vers la fiche de l'élément (session, formateur, etc.). */
  href: string;
  /** Info secondaire en gris (date, statut, etc.). Optionnel. */
  meta?: string;
};

export type KpiData = {
  count: number;
  items: KpiItem[];
};

const EMPTY: KpiData = { count: 0, items: [] };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

// ============================================================
// 🚨 ALERTES URGENTES
// ============================================================

export async function listTrainersDocsExpiring(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const in90 = inDays(90);
  const { data } = await supabase
    .from("trainers")
    .select(
      "id, first_name, last_name, rc_pro_expires_on, urssaf_expires_on, qualiopi_expires_on, is_qualiopi",
    )
    .eq("is_active", true)
    .or(
      `rc_pro_expires_on.lte.${in90},urssaf_expires_on.lte.${in90},qualiopi_expires_on.lte.${in90}`,
    )
    .limit(MAX_ITEMS * 2);

  type Row = {
    id: string;
    first_name: string;
    last_name: string;
    rc_pro_expires_on: string | null;
    urssaf_expires_on: string | null;
    qualiopi_expires_on: string | null;
    is_qualiopi: boolean | null;
  };
  const rows = (data ?? []) as Row[];
  const todayIso = today();

  const items: KpiItem[] = [];
  for (const t of rows) {
    const alerts: string[] = [];
    if (t.rc_pro_expires_on && t.rc_pro_expires_on <= in90) {
      alerts.push(
        `RC pro ${t.rc_pro_expires_on < todayIso ? "expirée" : "expire"} le ${fmtDateShort(t.rc_pro_expires_on)}`,
      );
    }
    if (t.urssaf_expires_on && t.urssaf_expires_on <= in90) {
      alerts.push(
        `URSSAF ${t.urssaf_expires_on < todayIso ? "expirée" : "expire"} le ${fmtDateShort(t.urssaf_expires_on)}`,
      );
    }
    if (
      t.is_qualiopi &&
      t.qualiopi_expires_on &&
      t.qualiopi_expires_on <= in90
    ) {
      alerts.push(
        `Qualiopi ${t.qualiopi_expires_on < todayIso ? "expiré" : "expire"} le ${fmtDateShort(t.qualiopi_expires_on)}`,
      );
    }
    if (alerts.length === 0) continue;
    items.push({
      label: `${t.last_name.toUpperCase()} ${t.first_name}`,
      href: `/formateurs/${t.id}`,
      meta: alerts.join(" · "),
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return { count: items.length, items };
}

/**
 * Sessions confirmées vraiment sans formateur : ni au niveau session
 * (`sessions.trainer_id`), ni au niveau d'un de ses jours
 * (`session_days.trainer_id`). Règle alignée sur l'auto-promotion
 * du formateur dans confirmSession (Gilles 2026-05-22).
 */
export async function listSessionsConfirmedNoTrainer(
  supabase: SupabaseClient,
): Promise<KpiData> {
  // 1. Sessions confirmées sans trainer_id session
  const { data } = await supabase
    .from("sessions")
    .select("id, start_date, end_date, formation:formations(title)")
    .eq("status", "confirmed")
    .is("trainer_id", null)
    .order("start_date", { ascending: true });

  type Row = {
    id: string;
    start_date: string;
    end_date: string;
    formation: { title: string } | Array<{ title: string }> | null;
  };
  const candidates = (data ?? []) as Row[];
  if (candidates.length === 0) return EMPTY;

  // 2. Exclure celles qui ont un formateur sur AU MOINS un jour
  const candidateIds = candidates.map((s) => s.id);
  const { data: daysWithTrainer } = await supabase
    .from("session_days")
    .select("session_id")
    .in("session_id", candidateIds)
    .not("trainer_id", "is", null);
  const hasDayTrainer = new Set(
    ((daysWithTrainer ?? []) as Array<{ session_id: string }>).map(
      (d) => d.session_id,
    ),
  );

  const trulyNoTrainer = candidates.filter((s) => !hasDayTrainer.has(s.id));
  const items = trulyNoTrainer.slice(0, MAX_ITEMS).map((r) => {
    const f = Array.isArray(r.formation) ? r.formation[0] : r.formation;
    return {
      label: f?.title ?? "Session",
      href: `/sessions/${r.id}`,
      meta: `Démarre le ${fmtDate(r.start_date)}`,
    };
  });
  return { count: trulyNoTrainer.length, items };
}

export async function listSessionsConfirmedNoQuiz(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, formation_id, quiz_template_id, formation:formations(title, quiz_template_id)",
    )
    .eq("status", "confirmed")
    .is("quiz_template_id", null)
    .order("start_date", { ascending: true });

  type Row = {
    id: string;
    start_date: string;
    end_date: string;
    formation_id: string;
    quiz_template_id: string | null;
    formation:
      | { title: string; quiz_template_id: string | null }
      | Array<{ title: string; quiz_template_id: string | null }>
      | null;
  };
  const rows = (sessions ?? []) as Row[];

  const withoutQuiz = rows.filter((r) => {
    const f = Array.isArray(r.formation) ? r.formation[0] : r.formation;
    return !f?.quiz_template_id;
  });

  const items = withoutQuiz.slice(0, MAX_ITEMS).map((r) => {
    const f = Array.isArray(r.formation) ? r.formation[0] : r.formation;
    return {
      label: f?.title ?? "Session",
      href: `/sessions/${r.id}`,
      meta: `Démarre le ${fmtDate(r.start_date)}`,
    };
  });
  return { count: withoutQuiz.length, items };
}

export async function listSessionsConfirmedNoEnrollment(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, start_date, formation:formations(title)")
    .eq("status", "confirmed")
    .order("start_date", { ascending: true });
  if (!sessions || sessions.length === 0) return EMPTY;

  type Row = {
    id: string;
    start_date: string;
    formation: { title: string } | Array<{ title: string }> | null;
  };
  const rows = sessions as Row[];
  const sessionIds = rows.map((s) => s.id);

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("session_id")
    .in("session_id", sessionIds);
  const withLearners = new Set(
    ((enrollments ?? []) as Array<{ session_id: string }>).map(
      (e) => e.session_id,
    ),
  );

  const without = rows.filter((r) => !withLearners.has(r.id));
  const items = without.slice(0, MAX_ITEMS).map((r) => {
    const f = Array.isArray(r.formation) ? r.formation[0] : r.formation;
    return {
      label: f?.title ?? "Session",
      href: `/sessions/${r.id}`,
      meta: `Démarre le ${fmtDate(r.start_date)}`,
    };
  });
  return { count: without.length, items };
}

// ============================================================
// 📅 SESSIONS À SUIVRE
// ============================================================

export async function listSessionsStartingThisWeek(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const { data } = await supabase
    .from("sessions")
    .select("id, start_date, end_date, formation:formations(title)")
    .eq("status", "confirmed")
    .gte("start_date", today())
    .lte("start_date", inDays(7))
    .order("start_date", { ascending: true });

  type Row = {
    id: string;
    start_date: string;
    end_date: string;
    formation: { title: string } | Array<{ title: string }> | null;
  };
  const rows = (data ?? []) as Row[];
  const items = rows.slice(0, MAX_ITEMS).map((r) => {
    const f = Array.isArray(r.formation) ? r.formation[0] : r.formation;
    return {
      label: f?.title ?? "Session",
      href: `/sessions/${r.id}`,
      meta: `Démarre le ${fmtDate(r.start_date)}`,
    };
  });
  return { count: rows.length, items };
}

export async function listSessionsPositionnementIncomplete(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, start_date, formation:formations(title)")
    .eq("status", "confirmed")
    .gte("start_date", today())
    .lte("start_date", inDays(7));
  if (!sessions || sessions.length === 0) return EMPTY;

  type SRow = {
    id: string;
    start_date: string;
    formation: { title: string } | Array<{ title: string }> | null;
  };
  const rows = sessions as SRow[];
  const sessionIds = rows.map((s) => s.id);

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id, session_id")
    .in("session_id", sessionIds);
  if (!enrollments || enrollments.length === 0) return EMPTY;

  const enrollmentRows = enrollments as Array<{ id: string; session_id: string }>;
  const enrollmentIds = enrollmentRows.map((e) => e.id);

  const { data: positioning } = await supabase
    .from("positioning_responses")
    .select("enrollment_id, learner_submitted_at")
    .in("enrollment_id", enrollmentIds)
    .not("learner_submitted_at", "is", null);
  const filled = new Set(
    ((positioning ?? []) as Array<{ enrollment_id: string }>).map(
      (p) => p.enrollment_id,
    ),
  );

  const totalsBy = new Map<string, number>();
  const filledBy = new Map<string, number>();
  for (const e of enrollmentRows) {
    totalsBy.set(e.session_id, (totalsBy.get(e.session_id) ?? 0) + 1);
    if (filled.has(e.id)) {
      filledBy.set(e.session_id, (filledBy.get(e.session_id) ?? 0) + 1);
    }
  }

  const incomplete = rows.filter((r) => {
    const tot = totalsBy.get(r.id) ?? 0;
    const fill = filledBy.get(r.id) ?? 0;
    return tot > 0 && fill < tot;
  });
  const items = incomplete.slice(0, MAX_ITEMS).map((r) => {
    const f = Array.isArray(r.formation) ? r.formation[0] : r.formation;
    const tot = totalsBy.get(r.id) ?? 0;
    const fill = filledBy.get(r.id) ?? 0;
    return {
      label: f?.title ?? "Session",
      href: `/sessions/${r.id}/positionnement`,
      meta: `Démarre le ${fmtDate(r.start_date)} · ${fill}/${tot} remplis`,
    };
  });
  return { count: incomplete.length, items };
}

export async function listSessionsEmargementMissing(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const since = inDays(-90);
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, end_date, formation:formations(title)")
    .in("status", ["confirmed", "completed"])
    .lt("end_date", today())
    .gte("end_date", since);
  if (!sessions || sessions.length === 0) return EMPTY;

  type Row = {
    id: string;
    end_date: string;
    formation: { title: string } | Array<{ title: string }> | null;
  };
  const rows = sessions as Row[];
  const sessionIds = rows.map((s) => s.id);

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id, session_id")
    .in("session_id", sessionIds);
  if (!enrollments || enrollments.length === 0) return EMPTY;

  const enrollmentRows = enrollments as Array<{ id: string; session_id: string }>;
  const enrollmentIds = enrollmentRows.map((e) => e.id);
  const sessionByEnrollment = new Map(
    enrollmentRows.map((e) => [e.id, e.session_id]),
  );

  const { data: signatures } = await supabase
    .from("attendance_signatures")
    .select("enrollment_id")
    .in("enrollment_id", enrollmentIds);
  const sigBy = new Map<string, number>();
  for (const s of (signatures ?? []) as Array<{ enrollment_id: string }>) {
    const sid = sessionByEnrollment.get(s.enrollment_id);
    if (!sid) continue;
    sigBy.set(sid, (sigBy.get(sid) ?? 0) + 1);
  }

  const missing = rows.filter((r) => (sigBy.get(r.id) ?? 0) === 0);
  const items = missing.slice(0, MAX_ITEMS).map((r) => {
    const f = Array.isArray(r.formation) ? r.formation[0] : r.formation;
    return {
      label: f?.title ?? "Session",
      href: `/sessions/${r.id}/emargement`,
      meta: `Terminée le ${fmtDate(r.end_date)}`,
    };
  });
  return { count: missing.length, items };
}

export async function listSessionsWithoutTrainerReport(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const since = inDays(-90);
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, end_date, formation:formations(title)")
    .in("status", ["confirmed", "completed"])
    .lt("end_date", today())
    .gte("end_date", since);
  if (!sessions || sessions.length === 0) return EMPTY;

  type Row = {
    id: string;
    end_date: string;
    formation: { title: string } | Array<{ title: string }> | null;
  };
  const rows = sessions as Row[];
  const sessionIds = rows.map((s) => s.id);

  try {
    const { data: reports, error } = await supabase
      .from("session_trainer_reports")
      .select("session_id")
      .in("session_id", sessionIds)
      .not("signed_at", "is", null);
    if (error) return EMPTY;
    const withReport = new Set(
      ((reports ?? []) as Array<{ session_id: string }>).map(
        (r) => r.session_id,
      ),
    );
    const missing = rows.filter((r) => !withReport.has(r.id));
    const items = missing.slice(0, MAX_ITEMS).map((r) => {
      const f = Array.isArray(r.formation) ? r.formation[0] : r.formation;
      return {
        label: f?.title ?? "Session",
        href: `/sessions/${r.id}`,
        meta: `Terminée le ${fmtDate(r.end_date)}`,
      };
    });
    return { count: missing.length, items };
  } catch {
    return EMPTY;
  }
}

// ============================================================
// 💰 PIPELINE COMMERCIAL
// ============================================================

export async function listPreinscriptionsPending(
  supabase: SupabaseClient,
): Promise<KpiData> {
  try {
    const { data } = await supabase
      .from("inscription_requests")
      .select(
        "id, learner_first_name, learner_last_name, target_session_id, created_at, referrer:companies!referrer_company_id(name)",
      )
      .eq("stage", "preinscription")
      .order("created_at", { ascending: false })
      .limit(MAX_ITEMS);
    type Row = {
      id: string;
      learner_first_name: string | null;
      learner_last_name: string | null;
      target_session_id: string | null;
      created_at: string;
      referrer: { name: string } | Array<{ name: string }> | null;
    };
    const rows = (data ?? []) as Row[];
    const items = rows.map((r) => {
      const ref = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
      const name = [r.learner_first_name, r.learner_last_name]
        .filter(Boolean)
        .join(" ");
      return {
        label: name || "Apprenant (sans nom)",
        href: `/inscriptions/${r.id}`,
        meta: `Reçue le ${fmtDateShort(r.created_at)}${ref?.name ? ` · via ${ref.name}` : ""}`,
      };
    });
    const exact =
      items.length < MAX_ITEMS
        ? items.length
        : ((
            await supabase
              .from("inscription_requests")
              .select("id", { count: "exact", head: true })
              .eq("stage", "preinscription")
          ).count ?? items.length);
    return { count: exact, items };
  } catch {
    return EMPTY;
  }
}

export async function listEnrollmentsLearnerNoEmail(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("learner_id");
  if (!enrollments || enrollments.length === 0) return EMPTY;

  const learnerIds = Array.from(
    new Set(
      (enrollments as Array<{ learner_id: string | null }>)
        .map((e) => e.learner_id)
        .filter((x): x is string => !!x),
    ),
  );
  if (learnerIds.length === 0) return EMPTY;

  const { data: learners } = await supabase
    .from("learners")
    .select("id, first_name, last_name")
    .in("id", learnerIds)
    .is("email", null)
    .limit(MAX_ITEMS * 2);

  const items: KpiItem[] = [];
  for (const l of (learners ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
  }>) {
    items.push({
      label: `${l.last_name.toUpperCase()} ${l.first_name}`,
      href: `/apprenants/${l.id}`,
      meta: "Pas d'email — convocation impossible",
    });
    if (items.length >= MAX_ITEMS) break;
  }

  const { count } = await supabase
    .from("learners")
    .select("id", { count: "exact", head: true })
    .in("id", learnerIds)
    .is("email", null);
  return { count: count ?? items.length, items };
}

export async function listEnrollmentsLearnerNoCompany(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("learner_id");
  if (!enrollments || enrollments.length === 0) return EMPTY;

  const learnerIds = Array.from(
    new Set(
      (enrollments as Array<{ learner_id: string | null }>)
        .map((e) => e.learner_id)
        .filter((x): x is string => !!x),
    ),
  );
  if (learnerIds.length === 0) return EMPTY;

  const { data: learners } = await supabase
    .from("learners")
    .select("id, first_name, last_name")
    .in("id", learnerIds)
    .is("company_id", null)
    .limit(MAX_ITEMS * 2);

  const items: KpiItem[] = [];
  for (const l of (learners ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
  }>) {
    items.push({
      label: `${l.last_name.toUpperCase()} ${l.first_name}`,
      href: `/apprenants/${l.id}`,
      meta: "Indépendant ou rattachement à faire",
    });
    if (items.length >= MAX_ITEMS) break;
  }

  const { count } = await supabase
    .from("learners")
    .select("id", { count: "exact", head: true })
    .in("id", learnerIds)
    .is("company_id", null);
  return { count: count ?? items.length, items };
}

/** CA potentiel à venir : montant agrégé (pas une liste). */
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
  scorePercent: number;
  positioningOk: boolean;
  emargementOk: boolean;
  evaluationOk: boolean;
  bilanOk: boolean;
};

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
    formation: { title: string } | Array<{ title: string }> | null;
  };
  const rows = sessions as SRow[];
  const sessionIds = rows.map((r) => r.id);

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

export async function listTrainersWithoutFormations(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const { data: trainers } = await supabase
    .from("trainers")
    .select("id, first_name, last_name")
    .eq("is_active", true);
  if (!trainers || trainers.length === 0) return EMPTY;
  const trainerRows = trainers as Array<{
    id: string;
    first_name: string;
    last_name: string;
  }>;
  const trainerIds = trainerRows.map((t) => t.id);

  const { data: links } = await supabase
    .from("trainer_formations")
    .select("trainer_id")
    .in("trainer_id", trainerIds);
  const withLinks = new Set(
    ((links ?? []) as Array<{ trainer_id: string }>).map((l) => l.trainer_id),
  );
  const without = trainerRows.filter((t) => !withLinks.has(t.id));
  const items = without.slice(0, MAX_ITEMS).map((t) => ({
    label: `${t.last_name.toUpperCase()} ${t.first_name}`,
    href: `/formateurs/${t.id}`,
    meta: "Aucune formation animable liée",
  }));
  return { count: without.length, items };
}

export async function listTrainersWithoutPortal(
  supabase: SupabaseClient,
): Promise<KpiData> {
  const { data: trainers } = await supabase
    .from("trainers")
    .select("id, first_name, last_name")
    .eq("is_active", true);
  if (!trainers || trainers.length === 0) return EMPTY;
  const trainerRows = trainers as Array<{
    id: string;
    first_name: string;
    last_name: string;
  }>;
  const trainerIds = trainerRows.map((t) => t.id);

  const { data: tokens } = await supabase
    .from("trainer_portal_tokens")
    .select("trainer_id")
    .in("trainer_id", trainerIds);
  const withToken = new Set(
    ((tokens ?? []) as Array<{ trainer_id: string }>).map((t) => t.trainer_id),
  );
  const without = trainerRows.filter((t) => !withToken.has(t.id));
  const items = without.slice(0, MAX_ITEMS).map((t) => ({
    label: `${t.last_name.toUpperCase()} ${t.first_name}`,
    href: `/formateurs/${t.id}`,
    meta: "Portail formateur non activé",
  }));
  return { count: without.length, items };
}
