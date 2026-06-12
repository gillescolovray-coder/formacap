import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Banknote,
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  GraduationCap,
  Inbox,
  Key,
  Mail,
  MailX,
  PenSquare,
  PenTool,
  Plus,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  UserX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  computeInscriptionDisplayAmount,
  type DisplayAmountSessionContext,
} from "@/lib/billing/display-amount";
import { computeSessionPrice } from "@/lib/pricing/compute";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_BADGE_VARIANTS,
  STATUS_LABELS,
  type FormationStatus,
} from "@/lib/formations/types";
import {
  InscriptionsOverviewTable,
  type InscriptionOverviewRow,
} from "./_inscriptions-overview-table";
import { MonthlyStats, type MonthlyStats as MonthlyStatsType } from "./_monthly-stats";
import { PortalAccessWidget } from "./_portal-access-widget";
import { KpiCard } from "./_kpi-card";
import { TrainerActivityTable } from "./_trainer-activity-table";
import {
  computeQualiopiScores,
  computeUpcomingRevenueHt,
  listEnrollmentsLearnerNoCompany,
  listEnrollmentsLearnerNoEmail,
  listPreinscriptionsPending,
  listSessionsConfirmedNoEnrollment,
  listSessionsConfirmedNoQuiz,
  listSessionsConfirmedNoTrainer,
  listSessionsEmargementMissing,
  listSessionsPositionnementIncomplete,
  listSessionsStartingThisWeek,
  listSessionsWithoutTrainerReport,
  listTrainerActivityByYear,
  listTrainersDocsExpiring,
  listTrainersWithoutFormations,
  listTrainersWithoutPortal,
} from "./_kpi-queries";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name")
    .eq("id", user.id)
    .maybeSingle();

  const firstName = profile?.first_name ?? "";

  // Visites du portail apprenant (traçabilité des accès) — RLS scope l'org.
  // Limité aux 5000 plus récentes (largement suffisant pour le widget).
  const { data: portalVisitsRaw } = await supabase
    .from("learner_portal_visits")
    .select("visited_at, learner_id")
    .order("visited_at", { ascending: false })
    .limit(5000);
  const portalVisits = ((portalVisitsRaw ?? []) as Array<{
    visited_at: string;
    learner_id: string;
  }>).map((v) => ({ at: v.visited_at, learner: v.learner_id }));

  const [totalFormations, publishedFormations, drafts, archived] =
    await Promise.all([
      supabase.from("formations").select("id", { count: "exact", head: true }),
      supabase
        .from("formations")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      supabase
        .from("formations")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),
      supabase
        .from("formations")
        .select("id", { count: "exact", head: true })
        .eq("status", "archived"),
    ]);

  // Alertes Qualiopi : RC pro / URSSAF expirées ou à <90 jours
  const today = new Date().toISOString().slice(0, 10);
  const in90Days = new Date(Date.now() + 90 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const [
    { data: rcProAlerts },
    { data: urssafAlerts },
    { data: qualiopiAlerts },
    { data: locationsToVerify },
  ] = await Promise.all([
    supabase
      .from("trainers")
      .select("id, first_name, last_name, rc_pro_expires_on")
      .eq("is_active", true)
      .not("rc_pro_expires_on", "is", null)
      .lte("rc_pro_expires_on", in90Days)
      .order("rc_pro_expires_on", { ascending: true }),
    supabase
      .from("trainers")
      .select("id, first_name, last_name, urssaf_expires_on")
      .eq("is_active", true)
      .not("urssaf_expires_on", "is", null)
      .lte("urssaf_expires_on", in90Days)
      .order("urssaf_expires_on", { ascending: true }),
    supabase
      .from("trainers")
      .select("id, first_name, last_name, qualiopi_expires_on")
      .eq("is_active", true)
      .eq("is_qualiopi", true)
      .not("qualiopi_expires_on", "is", null)
      .lte("qualiopi_expires_on", in90Days)
      .order("qualiopi_expires_on", { ascending: true }),
    supabase
      .from("formation_locations")
      .select("id, name, pmr_accessible")
      .eq("is_active", true)
      .eq("pmr_accessible", "a_verifier")
      .limit(5),
  ]);

  const rcAlerts = (rcProAlerts ?? []).map((t) => ({
    id: t.id as string,
    name: `${t.last_name} ${t.first_name}`,
    expires_on: t.rc_pro_expires_on as string,
    expired: (t.rc_pro_expires_on as string) < today,
  }));
  const urssafsAlerts = (urssafAlerts ?? []).map((t) => ({
    id: t.id as string,
    name: `${t.last_name} ${t.first_name}`,
    expires_on: t.urssaf_expires_on as string,
    expired: (t.urssaf_expires_on as string) < today,
  }));
  const qualiopisAlerts = (qualiopiAlerts ?? []).map((t) => ({
    id: t.id as string,
    name: `${t.last_name} ${t.first_name}`,
    expires_on: t.qualiopi_expires_on as string,
    expired: (t.qualiopi_expires_on as string) < today,
  }));
  const totalAlerts =
    rcAlerts.length +
    urssafsAlerts.length +
    qualiopisAlerts.length +
    (locationsToVerify?.length ?? 0);

  // ============================================================
  // KPI Dashboard — refonte 2026-05-23 (Gilles)
  // V2 : chaque query renvoie { count, items[] } pour accordéon
  // dépliable + KPI à 0 masqué automatiquement (économie d'espace).
  // ============================================================
  // Années pour le tableau "Activité formateurs sur 3 ans" (Gilles 2026-05-24)
  const currYear = new Date().getFullYear();
  const activityYears = [currYear - 2, currYear - 1, currYear];

  const [
    docsExpiring,
    sessionsNoTrainer,
    sessionsNoQuiz,
    sessionsNoEnrollment,
    sessionsThisWeek,
    sessionsPositionnementMissing,
    sessionsEmargementMissing,
    sessionsNoBilan,
    preinscriptionsPending,
    enrollmentsNoEmail,
    enrollmentsNoCompany,
    upcomingRevenueHt,
    qualiopiScores,
    trainersNoFormations,
    trainersNoPortal,
    trainerActivity,
  ] = await Promise.all([
    listTrainersDocsExpiring(supabase),
    listSessionsConfirmedNoTrainer(supabase),
    listSessionsConfirmedNoQuiz(supabase),
    listSessionsConfirmedNoEnrollment(supabase),
    listSessionsStartingThisWeek(supabase),
    listSessionsPositionnementIncomplete(supabase),
    listSessionsEmargementMissing(supabase),
    listSessionsWithoutTrainerReport(supabase),
    listPreinscriptionsPending(supabase),
    listEnrollmentsLearnerNoEmail(supabase),
    listEnrollmentsLearnerNoCompany(supabase),
    computeUpcomingRevenueHt(supabase),
    computeQualiopiScores(supabase, 30),
    listTrainersWithoutFormations(supabase),
    listTrainersWithoutPortal(supabase),
    listTrainerActivityByYear(supabase, activityYears),
  ]);

  const qualiopiFull = qualiopiScores.filter((s) => s.scorePercent === 100).length;
  const qualiopiToComplete = qualiopiScores.filter((s) => s.scorePercent < 100);
  const qualiopiWorst = [...qualiopiToComplete]
    .sort((a, b) => a.scorePercent - b.scorePercent)
    .slice(0, 5);

  const upcomingRevenueLabel = upcomingRevenueHt.toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
  });

  // Compteurs par section (pour afficher la section seulement si > 0)
  const totalAlertesUrgentes =
    docsExpiring.count +
    sessionsNoTrainer.count +
    sessionsNoQuiz.count +
    sessionsNoEnrollment.count;
  const totalSessionsASuivre =
    sessionsThisWeek.count +
    sessionsPositionnementMissing.count +
    sessionsEmargementMissing.count +
    sessionsNoBilan.count;
  const totalPipeline =
    preinscriptionsPending.count +
    enrollmentsNoEmail.count +
    enrollmentsNoCompany.count +
    upcomingRevenueHt;
  const totalQualiopi =
    qualiopiFull +
    qualiopiToComplete.length +
    trainersNoFormations.count +
    trainersNoPortal.count;

  // Tableau « Apprenants inscrits par session » (Gilles 2026-05-20)
  // Source : session_enrollments (= apprenants réellement confirmés).
  // Limité aux 100 derniers pour ne pas surcharger le dashboard ;
  // un lien « Voir toutes » mène à /inscriptions pour la vue complète.
  const { data: enrollmentsRaw } = await supabase
    .from("session_enrollments")
    .select(
      `
      id, status, enrolled_at,
      learner:learners(
        first_name, last_name, email, phone, mobile, job_title,
        company:companies(name, address, postal_code, city)
      ),
      session:sessions(id, start_date, end_date, is_inter, modality,
        pricing_mode, price_per_day_ht, price_forfait_ht,
        price_extra_per_day_ht, pricing_threshold,
        formation:formations(title, duration_hours, duration_days, public_price_excl_tax, price_company)
      ),
      inscription_request:inscription_requests(
        id, via_partner_portal,
        quote_amount_ht,
        billing_total_ht,
        referrer:companies!referrer_company_id(name, type)
      )
    `,
    )
    .neq("status", "cancelled")
    .limit(100);

  type CompanyShape = {
    name: string;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  };
  type LearnerShape = {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    job_title: string | null;
    company: CompanyShape | Array<CompanyShape> | null;
  };
  type OverviewFormationShape = {
    title: string;
    duration_hours: number | null;
    duration_days: number | null;
    public_price_excl_tax: number | string | null;
    price_company: number | string | null;
  };
  type OverviewSessionShape = {
    id: string;
    start_date: string | null;
    end_date: string | null;
    is_inter: boolean | null;
    modality: string | null;
    pricing_mode: "per_learner" | "forfait" | null;
    price_per_day_ht: number | string | null;
    price_forfait_ht: number | string | null;
    price_extra_per_day_ht: number | string | null;
    pricing_threshold: number | string | null;
    formation: OverviewFormationShape | OverviewFormationShape[] | null;
  };
  type OverviewReqShape = {
    id: string;
    via_partner_portal: boolean | null;
    quote_amount_ht: number | string | null;
    billing_total_ht: number | string | null;
    referrer:
      | { name: string | null; type: string | null }
      | Array<{ name: string | null; type: string | null }>
      | null;
  };
  type EnrollmentRaw = {
    id: string;
    status: string;
    enrolled_at: string;
    learner: LearnerShape | Array<LearnerShape> | null;
    session: OverviewSessionShape | OverviewSessionShape[] | null;
    inscription_request: OverviewReqShape | OverviewReqShape[] | null;
  };

  const inscriptionRows: InscriptionOverviewRow[] = (
    (enrollmentsRaw ?? []) as unknown as EnrollmentRaw[]
  )
    .map((e) => {
      const learner = Array.isArray(e.learner) ? e.learner[0] ?? null : e.learner;
      const company =
        learner?.company
          ? Array.isArray(learner.company)
            ? learner.company[0] ?? null
            : learner.company
          : null;
      const session = Array.isArray(e.session) ? e.session[0] ?? null : e.session;
      const formation = session?.formation
        ? Array.isArray(session.formation)
          ? session.formation[0] ?? null
          : session.formation
        : null;
      const req = Array.isArray(e.inscription_request)
        ? e.inscription_request[0] ?? null
        : e.inscription_request;
      const referrer = req?.referrer
        ? Array.isArray(req.referrer)
          ? req.referrer[0] ?? null
          : req.referrer
        : null;
      const sourceKind: InscriptionOverviewRow["sourceKind"] = referrer?.name
        ? referrer.type === "of"
          ? "of"
          : "partenaire"
        : "direct";
      // Budget HT (refonte tarification 2026-05-31 + alignement 2026-06-12) :
      // on délègue au helper partagé computeInscriptionDisplayAmount qui gère
      //   1) billing_total_ht  2) quote_amount_ht (montants explicites)
      //   3) tarif R7 dérivé de la session (INTER per_learner / INTRA forfait)
      // Avant, ce tableau ignorait la tarification R7 de la session : les
      // sessions sans devis NI prix catalogue (ex. CHORUS 11/06) restaient à
      // "—" même quand la session avait un prix/jour. Repli final = prix
      // catalogue × jours (estimation, en italique).
      const sessionCtx: DisplayAmountSessionContext = {
        pricing_mode: session?.pricing_mode ?? null,
        price_per_day_ht: session?.price_per_day_ht ?? null,
        price_forfait_ht: session?.price_forfait_ht ?? null,
        price_extra_per_day_ht: session?.price_extra_per_day_ht ?? null,
        pricing_threshold: session?.pricing_threshold ?? null,
        duration_days: formation?.duration_days ?? null,
        // pas de formation_public_price ici : on garde le repli "× jours"
        // ci-dessous pour ne pas changer l'estimation catalogue existante.
      };
      const disp = computeInscriptionDisplayAmount(req ?? {}, sessionCtx);
      let amountHt: number | null = disp.amount;
      let amountHtEstimated = disp.isEstimated;
      if (amountHt === null) {
        const publicPrice =
          formation?.price_company ?? formation?.public_price_excl_tax;
        const days = formation?.duration_days;
        if (
          publicPrice !== null &&
          publicPrice !== undefined &&
          days !== null &&
          days !== undefined
        ) {
          const p = Number(publicPrice);
          const d = Number(days);
          if (Number.isFinite(p) && Number.isFinite(d) && p > 0 && d > 0) {
            amountHt = p * d;
            amountHtEstimated = true;
          }
        }
      }
      return {
        enrollmentId: e.id,
        sessionId: session?.id ?? null,
        inscriptionRequestId: req?.id ?? null,
        learnerFirstName: learner?.first_name ?? null,
        learnerLastName: learner?.last_name ?? null,
        learnerJobTitle: learner?.job_title ?? null,
        learnerEmail: learner?.email ?? null,
        learnerPhone: learner?.mobile ?? learner?.phone ?? null,
        companyName: company?.name ?? null,
        companyAddress: company?.address ?? null,
        companyPostalCode: company?.postal_code ?? null,
        companyCity: company?.city ?? null,
        startDate: session?.start_date ?? null,
        endDate: session?.end_date ?? null,
        isInter: session?.is_inter ?? null,
        modality: session?.modality ?? null,
        formationTitle: formation?.title ?? "—",
        durationDays: formation?.duration_days ?? null,
        durationHours: formation?.duration_hours ?? null,
        amountHt: amountHt != null && Number.isFinite(amountHt) ? amountHt : null,
        amountHtEstimated,
        sourceKind,
        partnerName: referrer?.name ?? null,
      };
    })
    // Tri : sessions a venir d'abord (start_date asc), puis passees a
    // la fin (start_date desc). Plus proche = en tete.
    .sort((a, b) => {
      const aStart = a.startDate ?? "";
      const bStart = b.startDate ?? "";
      if (!aStart && !bStart) return 0;
      if (!aStart) return 1;
      if (!bStart) return -1;
      const aFuture = aStart >= today;
      const bFuture = bStart >= today;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      return aFuture
        ? aStart.localeCompare(bStart)
        : bStart.localeCompare(aStart);
    });

  // === Stats mensuelles : nb participants / heures / entreprises / HT / TTC
  // par mois de l'annee en cours. Query separee SANS limite, sur toutes
  // les sessions de l'annee.
  const currentYear = new Date().getFullYear();
  // Année sélectionnée (bouton). Bornée pour éviter les valeurs absurdes.
  const parsedYear = Number(sp?.year);
  const selectedYear =
    Number.isInteger(parsedYear) &&
    parsedYear >= currentYear - 5 &&
    parsedYear <= currentYear + 5
      ? parsedYear
      : currentYear;
  // Années proposées dans le sélecteur.
  const yearChoices: number[] = [];
  for (let y = currentYear + 2; y >= currentYear - 3; y--) yearChoices.push(y);
  const todayIso = new Date().toISOString().slice(0, 10);

  const yearStart = `${selectedYear}-01-01`;
  const yearEnd = `${selectedYear + 1}-01-01`;
  // Refonte 2026-06-12 (Gilles) — calcul SESSION-CENTRÉ pour corriger :
  //  1. Montants : même cascade que le tableau /sessions (amount_ht →
  //     sous-traitance forfait jour OF → forfait INTRA → somme inscriptions →
  //     R7 per_learner → catalogue × inscrits). Avant on ne sommait que
  //     billing/quote des inscriptions -> INTRA forfait & sous-traitance "—".
  //  2. Heures-stagiaires : CAP NUMÉRIQUE & prescripteur = nb PRÉSENTS
  //     (émargement) × heures ; OF (CAP sous-traitant) = nb INSCRITS × heures.
  //  3. Source affichée par session (CAP NUMÉRIQUE / Prescripteur / OF).
  const { data: yearEnrollments } = await supabase
    .from("session_enrollments")
    .select(
      `
      id, learner_id,
      learner:learners(company_id, first_name, last_name, company_name_temp),
      session:sessions!inner(
        id, start_date, end_date, status, modality, is_inter,
        amount_ht, pricing_mode, price_per_day_ht, price_forfait_ht,
        price_extra_per_day_ht, pricing_threshold,
        is_subcontracted, subcontracting_company_id, prescriber_company_id,
        prescriber:companies!prescriber_company_id(name, type),
        formation:formations(title, duration_hours, duration_days, public_price_excl_tax, price_company)
      ),
      inscription_request:inscription_requests(
        quote_amount_ht, billing_total_ht,
        referrer:companies!referrer_company_id(name, type)
      )
    `,
    )
    .neq("status", "cancelled")
    .gte("session.start_date", yearStart)
    .lt("session.start_date", yearEnd);

  const MONTH_LABELS = [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
    "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
  ];
  const VAT_RATE = 0.2;
  const monthlyAcc: Record<
    number,
    {
      participants: Set<string>;
      companies: Set<string>;
      hours: number;
      amountHt: number;
      // CA réalisé = sessions dont la date de fin est passée.
      amountHtRealise: number;
      // Prévisionnel = sessions à venir / en cours (fin non dépassée).
      amountHtPrevi: number;
    }
  > = {};
  for (let m = 0; m < 12; m++) {
    monthlyAcc[m] = {
      participants: new Set(),
      companies: new Set(),
      hours: 0,
      amountHt: 0,
      amountHtRealise: 0,
      amountHtPrevi: 0,
    };
  }

  // Détail pour le dépliage (mois -> sessions -> apprenants + coût/jour).
  type DetailSession = {
    id: string;
    title: string;
    date: string;
    modality: string | null;
    isInter: boolean;
    isRealise: boolean;
    days: number;
    amountHt: number;
    amountTtc: number;
    hours: number;
    source: string;
    sourceKind: "direct" | "of" | "partenaire";
    learners: { name: string; amountHt: number; perDayHt: number }[];
  };
  const monthlyDetailAcc: Record<number, Map<string, DetailSession>> = {};
  for (let m = 0; m < 12; m++) monthlyDetailAcc[m] = new Map();

  // Statuts de session retenus = sessions CONFIRMÉES (Gilles 2026-06-08).
  // On exclut les brouillons, planifiées non confirmées, ANNULÉES et surtout
  // REPORTÉES (postponed) — sinon une session reportée reste comptée à sa date
  // d'origine (bug constaté sur CHORUS reporté de juin à octobre).
  const COUNTED_SESSION_STATUSES = new Set([
    "confirmed",
    "in_progress",
    "completed",
  ]);

  // --- Helpers d'extraction (les jointures Supabase arrivent en objet ou
  //     en tableau selon la cardinalité). ---
  const pick = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? v[0] ?? null : v ?? null;
  const numOrNull = (v: number | string | null | undefined): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  type CoNm = { name: string | null; type?: string | null };
  type FormJoin = {
    title: string | null;
    duration_hours: number | string | null;
    duration_days: number | string | null;
    public_price_excl_tax: number | string | null;
    price_company: number | string | null;
  };
  type SessJoin = {
    id: string;
    start_date: string | null;
    end_date: string | null;
    status: string | null;
    modality: string | null;
    is_inter: boolean | null;
    amount_ht: number | string | null;
    pricing_mode: "per_learner" | "forfait" | null;
    price_per_day_ht: number | string | null;
    price_forfait_ht: number | string | null;
    price_extra_per_day_ht: number | string | null;
    pricing_threshold: number | string | null;
    is_subcontracted: boolean | null;
    subcontracting_company_id: string | null;
    prescriber_company_id: string | null;
    prescriber: CoNm | CoNm[] | null;
    formation: FormJoin | FormJoin[] | null;
  };
  type EnrLearner = {
    company_id: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name_temp: string | null;
  };
  type EnrReq = {
    quote_amount_ht: number | string | null;
    billing_total_ht: number | string | null;
    referrer: CoNm | CoNm[] | null;
  };
  type EnrRow = {
    id: string;
    learner_id: string | null;
    learner: EnrLearner | EnrLearner[] | null;
    session: SessJoin | SessJoin[] | null;
    inscription_request: EnrReq | EnrReq[] | null;
  };

  const enrRows = (yearEnrollments ?? []) as unknown as EnrRow[];

  // Présence (émargement apprenant) pour le calcul des heures-stagiaires
  // CAP NUMÉRIQUE / prescripteur.
  const enrIds = enrRows.map((e) => e.id);
  const presentEnrollments = new Set<string>();
  if (enrIds.length > 0) {
    const { data: sigRows } = await supabase
      .from("attendance_signatures")
      .select("enrollment_id")
      .in("enrollment_id", enrIds)
      .eq("signer_role", "learner");
    for (const s of (sigRows ?? []) as Array<{ enrollment_id: string }>) {
      presentEnrollments.add(s.enrollment_id);
    }
  }

  // Regroupement par session : on calcule le montant UNE fois par session
  // (la cascade peut être un forfait ou un montant sous-traitance, dus une
  // seule fois), pas par inscription.
  type SessEnr = {
    id: string;
    name: string;
    companyId: string | null;
    amount: number | null;
    present: boolean;
    referrer: CoNm | null;
  };
  type SessGroup = {
    id: string;
    start_date: string;
    end_date: string | null;
    isSubcontracted: boolean;
    ofCompanyId: string | null;
    ofName: string | null;
    modality: string | null;
    isInter: boolean;
    title: string;
    durationDays: number | null;
    durationHours: number;
    pubUnit: number | null;
    amountHtManual: number | null;
    pricingMode: "per_learner" | "forfait" | null;
    pricePerDay: number | null;
    priceForfait: number | null;
    priceExtra: number | null;
    threshold: number | null;
    enrollments: SessEnr[];
  };
  const sessGroups = new Map<string, SessGroup>();

  for (const e of enrRows) {
    const sess = pick(e.session);
    if (!sess?.start_date || !sess.id) continue;
    if (!COUNTED_SESSION_STATUSES.has(sess.status ?? "")) continue;
    let g = sessGroups.get(sess.id);
    if (!g) {
      const form = pick(sess.formation);
      const pres = pick(sess.prescriber);
      const pubUnit =
        numOrNull(form?.price_company) ??
        numOrNull(form?.public_price_excl_tax);
      g = {
        id: sess.id,
        start_date: sess.start_date,
        end_date: sess.end_date,
        isSubcontracted: sess.is_subcontracted === true,
        ofCompanyId:
          sess.subcontracting_company_id ?? sess.prescriber_company_id ?? null,
        // Nom de l'OF donneur d'ordre : prescriber (embed) en 1er, complété
        // ensuite par ofNameById (cf. requête tarifs sous-traitance).
        ofName: pres?.name ?? null,
        modality: sess.modality,
        isInter: sess.is_inter === true,
        title: (form?.title ?? "").trim() || "Session",
        durationDays: numOrNull(form?.duration_days),
        durationHours: numOrNull(form?.duration_hours) ?? 0,
        pubUnit: pubUnit && pubUnit > 0 ? pubUnit : null,
        amountHtManual: numOrNull(sess.amount_ht),
        pricingMode: sess.pricing_mode ?? null,
        pricePerDay: numOrNull(sess.price_per_day_ht),
        priceForfait: numOrNull(sess.price_forfait_ht),
        priceExtra: numOrNull(sess.price_extra_per_day_ht),
        threshold: numOrNull(sess.pricing_threshold),
        enrollments: [],
      };
      sessGroups.set(sess.id, g);
    }
    const learner = pick(e.learner);
    const req = pick(e.inscription_request);
    const referrer = req ? pick(req.referrer) : null;
    const ctx: DisplayAmountSessionContext = {
      pricing_mode: g.pricingMode,
      price_per_day_ht: g.pricePerDay,
      price_forfait_ht: g.priceForfait,
      price_extra_per_day_ht: g.priceExtra,
      pricing_threshold: g.threshold,
      duration_days: g.durationDays,
      formation_public_price_excl_tax: g.pubUnit,
    };
    const res = computeInscriptionDisplayAmount(req ?? {}, ctx);
    const name =
      [learner?.first_name, learner?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      learner?.company_name_temp ||
      "Apprenant";
    g.enrollments.push({
      id: e.id,
      name,
      companyId: learner?.company_id ?? null,
      amount: res.amount,
      present: presentEnrollments.has(e.id),
      referrer,
    });
  }

  // Tarifs sous-traitance des OF donneurs d'ordre (forfait jour).
  const ofIds = Array.from(
    new Set(
      Array.from(sessGroups.values())
        .filter((g) => g.isSubcontracted && g.ofCompanyId)
        .map((g) => g.ofCompanyId as string),
    ),
  );
  const ofRates = new Map<
    string,
    { distanciel: number | null; presentiel: number | null }
  >();
  const ofNameById = new Map<string, string>();
  if (ofIds.length > 0) {
    const { data: rc } = await supabase
      .from("companies")
      .select(
        "id, name, subcontracting_daily_rate_distanciel_ht, subcontracting_daily_rate_presentiel_ht",
      )
      .in("id", ofIds);
    for (const c of (rc ?? []) as Array<{
      id: string;
      name: string | null;
      subcontracting_daily_rate_distanciel_ht: number | string | null;
      subcontracting_daily_rate_presentiel_ht: number | string | null;
    }>) {
      ofRates.set(c.id, {
        distanciel: numOrNull(c.subcontracting_daily_rate_distanciel_ht),
        presentiel: numOrNull(c.subcontracting_daily_rate_presentiel_ht),
      });
      if (c.name) ofNameById.set(c.id, c.name);
    }
  }

  const daysOf = (g: SessGroup): number =>
    g.durationDays && g.durationDays > 0
      ? g.durationDays
      : g.end_date
        ? Math.max(
            1,
            Math.round(
              (new Date(g.end_date).getTime() -
                new Date(g.start_date).getTime()) /
                86_400_000,
            ) + 1,
          )
        : 1;

  const subcontractAmountOf = (g: SessGroup): number | null => {
    if (!g.isSubcontracted || !g.ofCompanyId) return null;
    const rates = ofRates.get(g.ofCompanyId);
    if (!rates) return null;
    const rate =
      g.modality === "distanciel"
        ? rates.distanciel ?? rates.presentiel
        : rates.presentiel ?? rates.distanciel;
    if (!rate || rate <= 0) return null;
    return Math.round(rate * daysOf(g) * 100) / 100;
  };

  const r7AmountOf = (g: SessGroup, nbInscrits: number): number | null => {
    if (!g.pricingMode) return null;
    const days = daysOf(g);
    const nbForPrice =
      g.pricingMode === "forfait" ? Math.max(nbInscrits, 1) : nbInscrits;
    const breakdown = computeSessionPrice(
      {
        mode: g.pricingMode,
        pricePerDayHt: g.pricePerDay,
        priceForfaitHt: g.priceForfait,
        priceExtraPerDayHt: g.priceExtra,
        threshold: g.threshold,
      },
      nbForPrice,
      days,
    );
    return breakdown.totalHt > 0 ? breakdown.totalHt : null;
  };

  // Calcul final par session puis ventilation dans le mois.
  for (const g of sessGroups.values()) {
    const monthIdx = new Date(g.start_date + "T00:00:00").getMonth();
    const bucket = monthlyAcc[monthIdx];
    if (!bucket) continue;

    const nbInscrits = g.enrollments.length;
    const inscriptionTotal = g.enrollments.reduce(
      (acc, e) => acc + (e.amount && e.amount > 0 ? e.amount : 0),
      0,
    );
    const r7 = r7AmountOf(g, nbInscrits);
    const isForfait = g.pricingMode === "forfait";
    const useForfaitFirst =
      g.amountHtManual === null && isForfait && r7 !== null;
    const sc = g.amountHtManual === null ? subcontractAmountOf(g) : null;
    // Cascade alignée sur le tableau /sessions (Gilles 2026-06-12).
    const amount =
      g.amountHtManual !== null
        ? g.amountHtManual
        : sc !== null
          ? sc
          : useForfaitFirst
            ? r7
            : inscriptionTotal > 0
              ? inscriptionTotal
              : r7 !== null
                ? r7
                : g.pubUnit && g.pubUnit > 0 && nbInscrits > 0
                  ? g.pubUnit * nbInscrits
                  : null;
    const amountFromInscriptions =
      g.amountHtManual === null &&
      sc === null &&
      !useForfaitFirst &&
      inscriptionTotal > 0;

    // Source : OF (sous-traitance) / Prescripteur / CAP NUMÉRIQUE.
    let sourceKind: "direct" | "of" | "partenaire";
    let sourceLabel: string;
    if (g.isSubcontracted) {
      sourceKind = "of";
      const ofNm =
        (g.ofCompanyId ? ofNameById.get(g.ofCompanyId) : null) ?? g.ofName;
      sourceLabel = ofNm ? `OF · ${ofNm}` : "OF (donneur d'ordre)";
    } else {
      const ref =
        g.enrollments.map((e) => e.referrer).find((r) => r && r.name) ?? null;
      if (ref?.name) {
        if (ref.type === "of") {
          sourceKind = "of";
          sourceLabel = `OF · ${ref.name}`;
        } else {
          sourceKind = "partenaire";
          sourceLabel = `Prescripteur · ${ref.name}`;
        }
      } else {
        sourceKind = "direct";
        sourceLabel = "CAP NUMÉRIQUE";
      }
    }

    // Heures-stagiaires (Gilles 2026-06-12) : OF = nb inscrits × heures ;
    // CAP NUMÉRIQUE & prescripteur = nb PRÉSENTS (émargement) × heures.
    const nbForHours =
      sourceKind === "of"
        ? nbInscrits
        : g.enrollments.filter((e) => e.present).length;
    const sessionHours = g.durationHours * nbForHours;

    // Réalisé (fin dépassée) vs prévisionnel.
    const sessEnd = g.end_date ?? g.start_date;
    const isRealise = sessEnd ? sessEnd.slice(0, 10) < todayIso : false;

    for (const e of g.enrollments) {
      bucket.participants.add(e.id);
      if (e.companyId) bucket.companies.add(e.companyId);
    }
    bucket.hours += sessionHours;
    if (amount !== null) {
      bucket.amountHt += amount;
      if (isRealise) bucket.amountHtRealise += amount;
      else bucket.amountHtPrevi += amount;
    }

    // Détail dépliage : coût par apprenant. Si le montant vient des
    // inscriptions on garde le montant réel par apprenant, sinon on répartit
    // le montant session à parts égales (forfait / sous-traitance).
    const days = daysOf(g);
    const perLearnerEven =
      amount !== null && nbInscrits > 0 ? amount / nbInscrits : 0;
    const learners = g.enrollments.map((e) => {
      const a = amountFromInscriptions
        ? e.amount && e.amount > 0
          ? e.amount
          : 0
        : perLearnerEven;
      return {
        name: e.name,
        amountHt: Math.round(a * 100) / 100,
        perDayHt: days > 0 ? Math.round((a / days) * 100) / 100 : a,
      };
    });

    monthlyDetailAcc[monthIdx].set(g.id, {
      id: g.id,
      title: g.title,
      date: g.start_date,
      modality: g.modality,
      isInter: g.isInter,
      isRealise,
      days,
      amountHt: amount !== null ? Math.round(amount * 100) / 100 : 0,
      amountTtc:
        amount !== null
          ? Math.round(amount * (1 + VAT_RATE) * 100) / 100
          : 0,
      hours: Math.round(sessionHours),
      source: sourceLabel,
      sourceKind,
      learners,
    });
  }

  // Conversion du détail en tableaux triés par date, prêts pour le client.
  const monthlyDetail: Record<string, DetailSession[]> = {};
  for (let m = 0; m < 12; m++) {
    const key = `${selectedYear}-${String(m + 1).padStart(2, "0")}`;
    monthlyDetail[key] = Array.from(monthlyDetailAcc[m].values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }

  const monthlyStats: MonthlyStatsType[] = MONTH_LABELS.map((label, i) => ({
    month: `${selectedYear}-${String(i + 1).padStart(2, "0")}`,
    monthLabel: label,
    participantsCount: monthlyAcc[i].participants.size,
    hoursCount: monthlyAcc[i].hours,
    companiesCount: monthlyAcc[i].companies.size,
    amountHt: Math.round(monthlyAcc[i].amountHt * 100) / 100,
    amountHtRealise: Math.round(monthlyAcc[i].amountHtRealise * 100) / 100,
    amountHtPrevi: Math.round(monthlyAcc[i].amountHtPrevi * 100) / 100,
    amountTtc: Math.round(monthlyAcc[i].amountHt * (1 + VAT_RATE) * 100) / 100,
  }));

  return (
    <>
      <PageHeader
        title={firstName ? `Bonjour ${firstName}` : "Bienvenue"}
        description="Vue d'ensemble de votre activité de formation."
      />

      <div className="p-8 space-y-8">
        {/* Alertes Qualiopi */}
        {totalAlerts > 0 && (
          <section className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Alertes Qualiopi
              </h2>
              <span className="text-xs text-amber-700 dark:text-amber-400">
                {totalAlerts} point{totalAlerts > 1 ? "s" : ""} à traiter
              </span>
            </div>
            <ul className="space-y-1.5 text-sm">
              {rcAlerts.map((a) => (
                <li key={`rc-${a.id}`} className="flex items-center gap-2">
                  <span
                    className={
                      a.expired
                        ? "text-red-700 dark:text-red-400 font-semibold"
                        : "text-amber-700 dark:text-amber-300"
                    }
                  >
                    RC pro
                  </span>
                  <span>·</span>
                  <Link
                    href={`/formateurs/${a.id}`}
                    className="hover:underline font-medium"
                  >
                    {a.name}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {a.expired ? "expirée le " : "expire le "}
                    {new Date(a.expires_on).toLocaleDateString("fr-FR")}
                  </span>
                </li>
              ))}
              {urssafsAlerts.map((a) => (
                <li key={`urssaf-${a.id}`} className="flex items-center gap-2">
                  <span
                    className={
                      a.expired
                        ? "text-red-700 dark:text-red-400 font-semibold"
                        : "text-amber-700 dark:text-amber-300"
                    }
                  >
                    URSSAF
                  </span>
                  <span>·</span>
                  <Link
                    href={`/formateurs/${a.id}`}
                    className="hover:underline font-medium"
                  >
                    {a.name}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {a.expired ? "expirée le " : "expire le "}
                    {new Date(a.expires_on).toLocaleDateString("fr-FR")}
                  </span>
                </li>
              ))}
              {qualiopisAlerts.map((a) => (
                <li
                  key={`qualiopi-${a.id}`}
                  className="flex items-center gap-2"
                >
                  <span
                    className={
                      a.expired
                        ? "text-red-700 dark:text-red-400 font-semibold"
                        : "text-violet-700 dark:text-violet-300 font-semibold"
                    }
                  >
                    Qualiopi
                  </span>
                  <span>·</span>
                  <Link
                    href={`/formateurs/${a.id}`}
                    className="hover:underline font-medium"
                  >
                    {a.name}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {a.expired ? "expiré le " : "expire le "}
                    {new Date(a.expires_on).toLocaleDateString("fr-FR")}
                  </span>
                </li>
              ))}
              {(locationsToVerify ?? []).map((l) => (
                <li key={`loc-${l.id}`} className="flex items-center gap-2">
                  <span className="text-amber-700 dark:text-amber-300">
                    Lieu à vérifier (PMR)
                  </span>
                  <span>·</span>
                  <Link
                    href={`/lieux/${l.id}`}
                    className="hover:underline font-medium"
                  >
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ============================================================
            KPI Dashboard — accordéons dépliables (Gilles 2026-05-23 V2)
            Carte = null si count=0, section = null si total=0
        ============================================================ */}

        {totalAlertesUrgentes > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-rose-700 mb-3 inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Alertes urgentes
              <span className="text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full">
                {totalAlertesUrgentes} à traiter
              </span>
            </h2>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Docs formateurs expirés/<90j"
                value={docsExpiring.count}
                items={docsExpiring.items}
                hint="RC pro, URSSAF ou Qualiopi à renouveler"
                icon={ShieldCheck}
                accent="red"
                pill={{ text: "Urgent", tone: "red" }}
              />
              <KpiCard
                label="Sessions sans formateur"
                value={sessionsNoTrainer.count}
                items={sessionsNoTrainer.items}
                hint="Confirmées mais personne n'anime"
                icon={UserX}
                accent="red"
                pill={{ text: "Urgent", tone: "red" }}
              />
              <KpiCard
                label="Sessions sans quiz"
                value={sessionsNoQuiz.count}
                items={sessionsNoQuiz.items}
                hint="Mesure pré/post manquante (Qualiopi ind. 11)"
                icon={Target}
                accent="amber"
              />
              <KpiCard
                label="Sessions sans apprenants"
                value={sessionsNoEnrollment.count}
                items={sessionsNoEnrollment.items}
                hint="Risque d'annulation : aucune inscription"
                icon={Inbox}
                accent="amber"
              />
            </div>
          </section>
        )}

        {totalSessionsASuivre > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-700 mb-3 inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Sessions à suivre
            </h2>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="À démarrer cette semaine"
                value={sessionsThisWeek.count}
                items={sessionsThisWeek.items}
                hint="Sessions confirmées dans les 7 prochains jours"
                icon={Calendar}
                accent="cyan"
              />
              <KpiCard
                label="Positionnement incomplet (<7j)"
                value={sessionsPositionnementMissing.count}
                items={sessionsPositionnementMissing.items}
                hint="Apprenants n'ayant pas rempli leur positionnement (<7j du démarrage)"
                icon={ClipboardList}
                accent="amber"
                pill={{ text: "Qualiopi 12", tone: "amber" }}
              />
              <KpiCard
                label="Émargement manquant (terminées 90j)"
                value={sessionsEmargementMissing.count}
                items={sessionsEmargementMissing.items}
                hint="Sessions terminées sans aucune signature recueillie"
                icon={PenTool}
                accent="amber"
                pill={{ text: "Qualiopi R9", tone: "amber" }}
              />
              <KpiCard
                label="Bilan formateur manquant (terminées 90j)"
                value={sessionsNoBilan.count}
                items={sessionsNoBilan.items}
                hint="Sessions sans bilan formateur signé (Module 7)"
                icon={PenSquare}
                accent="amber"
                pill={{ text: "Qualiopi 22", tone: "amber" }}
              />
            </div>
          </section>
        )}

        {totalPipeline > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700 mb-3 inline-flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Pipeline commercial
            </h2>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Pré-inscriptions partenaires en attente"
                value={preinscriptionsPending.count}
                items={preinscriptionsPending.items}
                hint="OF/Prescripteurs : à valider de votre côté"
                icon={Inbox}
                accent="violet"
                pill={{ text: "À valider", tone: "amber" }}
              />
              <KpiCard
                label="Inscriptions sans email apprenant"
                value={enrollmentsNoEmail.count}
                items={enrollmentsNoEmail.items}
                hint="Pas de convocation possible par email"
                icon={MailX}
                accent="amber"
              />
              <KpiCard
                label="Inscriptions sans entreprise"
                value={enrollmentsNoCompany.count}
                items={enrollmentsNoCompany.items}
                hint="Apprenants indépendants ou rattachement oublié"
                icon={Mail}
                accent="zinc"
              />
              <KpiCard
                label="CA potentiel à venir"
                value={`${upcomingRevenueLabel} €`}
                hint="Somme HT des sessions confirmées non terminées"
                icon={Banknote}
                accent="emerald"
                showWhenZero
              />
            </div>
          </section>
        )}

        {totalQualiopi > 0 && (
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-violet-700 mb-3 inline-flex items-center gap-2">
              <Award className="h-4 w-4" />
              État Qualiopi
            </h2>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Sessions 100% Qualiopi (90j)"
                value={qualiopiFull}
                hint="Positionnement + émargement + éval à chaud + bilan formateur tous complets"
                icon={CheckCircle2}
                accent="emerald"
                showWhenZero
                pill={
                  qualiopiFull > 0 && qualiopiScores.length > 0
                    ? {
                        text: `${Math.round((qualiopiFull / qualiopiScores.length) * 100)}% du total`,
                        tone: "emerald",
                      }
                    : undefined
                }
              />
              <KpiCard
                label="Sessions à compléter"
                value={qualiopiToComplete.length}
                items={qualiopiToComplete.slice(0, 10).map((s) => ({
                  label: s.title,
                  href: `/sessions/${s.sessionId}`,
                  meta: `${s.scorePercent}% complet · ${new Date(s.endDate).toLocaleDateString("fr-FR")}`,
                }))}
                hint="Sessions terminées (90j) avec au moins 1 indicateur Qualiopi manquant"
                icon={ClipboardCheck}
                accent="amber"
              />
              <KpiCard
                label="Formateurs sans formation animable"
                value={trainersNoFormations.count}
                items={trainersNoFormations.items}
                hint="Qualiopi ind. 21 : adéquation formateur ↔ formations"
                icon={FileWarning}
                accent="amber"
              />
              <KpiCard
                label="Formateurs sans accès portail"
                value={trainersNoPortal.count}
                items={trainersNoPortal.items}
                hint="Activer depuis la fiche formateur"
                icon={Key}
                accent="zinc"
              />
            </div>

            {qualiopiWorst.length > 0 && (
              <div className="mt-3 rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                    Top 5 sessions à compléter — détail des indicateurs manquants
                  </h3>
                </div>
                <ul className="divide-y divide-zinc-100">
                  {qualiopiWorst.map((s) => (
                    <li key={s.sessionId} className="px-4 py-2.5">
                      <Link
                        href={`/sessions/${s.sessionId}`}
                        className="flex items-center justify-between gap-3 hover:bg-zinc-50 -mx-4 px-4 -my-2.5 py-2.5 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-zinc-800 truncate">
                            {s.title}
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>
                              {new Date(s.endDate).toLocaleDateString("fr-FR")}
                            </span>
                            <span
                              className={
                                s.positioningOk
                                  ? "text-emerald-700"
                                  : "text-rose-600 font-semibold"
                              }
                            >
                              {s.positioningOk ? "✓" : "✗"} Positionnement
                            </span>
                            <span
                              className={
                                s.emargementOk
                                  ? "text-emerald-700"
                                  : "text-rose-600 font-semibold"
                              }
                            >
                              {s.emargementOk ? "✓" : "✗"} Émargement
                            </span>
                            <span
                              className={
                                s.evaluationOk
                                  ? "text-emerald-700"
                                  : "text-rose-600 font-semibold"
                              }
                            >
                              {s.evaluationOk ? "✓" : "✗"} Éval à chaud
                            </span>
                            <span
                              className={
                                s.bilanOk
                                  ? "text-emerald-700"
                                  : "text-rose-600 font-semibold"
                              }
                            >
                              {s.bilanOk ? "✓" : "✗"} Bilan
                            </span>
                          </div>
                        </div>
                        <span
                          className={
                            "text-lg font-bold tabular-nums shrink-0 " +
                            (s.scorePercent >= 75
                              ? "text-amber-600"
                              : "text-rose-600")
                          }
                        >
                          {s.scorePercent}%
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Statistiques */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4">
            Aperçu
          </h2>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Formations au catalogue"
              value={totalFormations.count ?? 0}
              hint={`${drafts.count ?? 0} brouillon${(drafts.count ?? 0) > 1 ? "s" : ""}, ${archived.count ?? 0} archivée${(archived.count ?? 0) > 1 ? "s" : ""}`}
              icon={GraduationCap}
              accent="emerald"
            />
            <StatCard
              label="Formations publiées"
              value={publishedFormations.count ?? 0}
              hint="Visibles dans votre catalogue"
              icon={GraduationCap}
              accent="blue"
            />
            <StatCard
              label="Sessions planifiées"
              value="—"
              hint="Module à venir"
              icon={Calendar}
              accent="amber"
            />
            <StatCard
              label="Apprenants inscrits"
              value="—"
              hint="Module à venir"
              icon={Users}
              accent="zinc"
            />
          </div>
        </section>

        {/* Actions rapides (Formations récentes retiré — Gilles 2026-05-23) */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold mb-3">Actions rapides</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              nativeButton={false}
              render={<Link href="/formations/new" />}
            >
              <Plus className="h-4 w-4" />
              Nouvelle formation
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/formations" />}
            >
              <GraduationCap className="h-4 w-4" />
              Voir le catalogue
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/formations/categories" />}
            >
              <Building2 className="h-4 w-4" />
              Gérer les catégories
            </Button>
          </div>
        </div>

        {/* Activité formateurs : nombre de sessions confirmées
            par formateur sur les 3 dernières années (Gilles 2026-05-24). */}
        <div className="mt-6">
          <TrainerActivityTable
            years={activityYears}
            rows={trainerActivity}
          />
        </div>

        {/* Statistiques mensuelles : 5 KPI annuels + graphique en barres
            + tableau récap mois par mois (annee en cours). */}
        <div className="mt-6">
          <MonthlyStats
            year={selectedYear}
            monthly={monthlyStats}
            detail={monthlyDetail}
            yearChoices={yearChoices}
            currentYear={currentYear}
          />
        </div>

        {/* Accès des apprenants à leur espace (traçabilité) */}
        <div className="mt-6">
          <PortalAccessWidget visits={portalVisits} />
        </div>

        {/* Tableau « Apprenants inscrits par session » : vue d'ensemble
            des 100 dernières inscriptions actives, avec la source
            (CAP NUMERIQUE direct / OF / Prescripteur partenaire). */}
        <div className="mt-6">
          <InscriptionsOverviewTable rows={inscriptionRows} />
        </div>
      </div>
    </>
  );
}
