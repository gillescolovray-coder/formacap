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
import { KpiCard } from "./_kpi-card";
import {
  computeQualiopiScores,
  computeUpcomingRevenueHt,
  countEnrollmentsLearnerNoCompany,
  countEnrollmentsLearnerNoEmail,
  countPreinscriptionsPending,
  countSessionsConfirmedNoEnrollment,
  countSessionsConfirmedNoQuiz,
  countSessionsConfirmedNoTrainer,
  countSessionsEmargementMissing,
  countSessionsPositionnementIncomplete,
  countSessionsStartingThisWeek,
  countSessionsWithoutTrainerReport,
  countTrainersWithoutFormations,
  countTrainersWithoutPortal,
} from "./_kpi-queries";

export default async function DashboardPage() {
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

  const { data: recentFormations } = await supabase
    .from("formations")
    .select(
      "id, title, status, duration_hours, updated_at, category:formation_categories(name)",
    )
    .order("updated_at", { ascending: false })
    .limit(5);

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
  // 16 KPI groupés en 4 sections : Alertes / Sessions / Pipeline / Qualiopi
  // ============================================================
  const [
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
  ] = await Promise.all([
    countSessionsConfirmedNoTrainer(supabase),
    countSessionsConfirmedNoQuiz(supabase),
    countSessionsConfirmedNoEnrollment(supabase),
    countSessionsStartingThisWeek(supabase),
    countSessionsPositionnementIncomplete(supabase),
    countSessionsEmargementMissing(supabase),
    countSessionsWithoutTrainerReport(supabase),
    countPreinscriptionsPending(supabase),
    countEnrollmentsLearnerNoEmail(supabase),
    countEnrollmentsLearnerNoCompany(supabase),
    computeUpcomingRevenueHt(supabase),
    computeQualiopiScores(supabase, 30),
    countTrainersWithoutFormations(supabase),
    countTrainersWithoutPortal(supabase),
  ]);

  // Compteur "sessions 100% Qualiopi sur 30 derniers jours"
  const qualiopiFull = qualiopiScores.filter((s) => s.scorePercent === 100).length;
  // Top 5 sessions à compléter (score < 100%) pour aperçu rapide
  const qualiopiWorst = qualiopiScores
    .filter((s) => s.scorePercent < 100)
    .sort((a, b) => a.scorePercent - b.scorePercent)
    .slice(0, 5);

  // Format CA HT (sans décimales pour cards compactes)
  const upcomingRevenueLabel = upcomingRevenueHt.toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
  });

  const totalNewAlerts =
    sessionsNoTrainer +
    sessionsNoQuiz +
    sessionsNoEnrollment +
    rcAlerts.length +
    urssafsAlerts.length +
    qualiopisAlerts.length;

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
        formation:formations(title, duration_hours, duration_days)
      ),
      inscription_request:inscription_requests(
        id, via_partner_portal,
        quote_amount_ht,
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
  type EnrollmentRaw = {
    id: string;
    status: string;
    enrolled_at: string;
    learner: LearnerShape | Array<LearnerShape> | null;
    session:
      | {
          id: string;
          start_date: string | null;
          end_date: string | null;
          is_inter: boolean | null;
          modality: string | null;
          formation:
            | { title: string; duration_hours: number | null; duration_days: number | null }
            | Array<{ title: string; duration_hours: number | null; duration_days: number | null }>
            | null;
        }
      | Array<{
          id: string;
          start_date: string | null;
          end_date: string | null;
          is_inter: boolean | null;
          modality: string | null;
          formation:
            | { title: string; duration_hours: number | null; duration_days: number | null }
            | Array<{ title: string; duration_hours: number | null; duration_days: number | null }>
            | null;
        }>
      | null;
    inscription_request:
      | {
          id: string;
          via_partner_portal: boolean | null;
          quote_amount_ht: number | string | null;
          referrer:
            | { name: string | null; type: string | null }
            | Array<{ name: string | null; type: string | null }>
            | null;
        }
      | Array<{
          id: string;
          via_partner_portal: boolean | null;
          quote_amount_ht: number | string | null;
          referrer:
            | { name: string | null; type: string | null }
            | Array<{ name: string | null; type: string | null }>
            | null;
        }>
      | null;
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
      const amountRaw = req?.quote_amount_ht;
      const amountHt =
        amountRaw === null || amountRaw === undefined
          ? null
          : typeof amountRaw === "number"
            ? amountRaw
            : Number(amountRaw);
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
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear + 1}-01-01`;
  const { data: yearEnrollments } = await supabase
    .from("session_enrollments")
    .select(
      `
      id, learner_id,
      learner:learners(company_id),
      session:sessions!inner(start_date,
        formation:formations(duration_hours)
      ),
      inscription_request:inscription_requests(quote_amount_ht)
    `,
    )
    .neq("status", "cancelled")
    .gte("session.start_date", yearStart)
    .lt("session.start_date", yearEnd);

  const MONTH_LABELS = [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
    "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
  ];
  const monthlyAcc: Record<
    number,
    {
      participants: Set<string>;
      companies: Set<string>;
      hours: number;
      amountHt: number;
    }
  > = {};
  for (let m = 0; m < 12; m++) {
    monthlyAcc[m] = {
      participants: new Set(),
      companies: new Set(),
      hours: 0,
      amountHt: 0,
    };
  }

  type YearEnr = {
    id: string;
    learner_id: string | null;
    learner: { company_id: string | null } | Array<{ company_id: string | null }> | null;
    session:
      | {
          start_date: string | null;
          formation:
            | { duration_hours: number | null }
            | Array<{ duration_hours: number | null }>
            | null;
        }
      | Array<{
          start_date: string | null;
          formation:
            | { duration_hours: number | null }
            | Array<{ duration_hours: number | null }>
            | null;
        }>
      | null;
    inscription_request:
      | { quote_amount_ht: number | string | null }
      | Array<{ quote_amount_ht: number | string | null }>
      | null;
  };

  ((yearEnrollments ?? []) as unknown as YearEnr[]).forEach((e) => {
    const sess = Array.isArray(e.session) ? e.session[0] : e.session;
    if (!sess?.start_date) return;
    const monthIdx = new Date(sess.start_date + "T00:00:00").getMonth();
    const bucket = monthlyAcc[monthIdx];
    if (!bucket) return;
    bucket.participants.add(e.id);
    const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    if (learner?.company_id) bucket.companies.add(learner.company_id);
    const form = sess.formation
      ? Array.isArray(sess.formation)
        ? sess.formation[0]
        : sess.formation
      : null;
    if (form?.duration_hours) bucket.hours += Number(form.duration_hours);
    const req = Array.isArray(e.inscription_request)
      ? e.inscription_request[0]
      : e.inscription_request;
    const amt = req?.quote_amount_ht;
    if (amt !== null && amt !== undefined) {
      const n = Number(amt);
      if (Number.isFinite(n)) bucket.amountHt += n;
    }
  });

  const VAT_RATE = 0.2;
  const monthlyStats: MonthlyStatsType[] = MONTH_LABELS.map((label, i) => ({
    month: `${currentYear}-${String(i + 1).padStart(2, "0")}`,
    monthLabel: label,
    participantsCount: monthlyAcc[i].participants.size,
    hoursCount: monthlyAcc[i].hours,
    companiesCount: monthlyAcc[i].companies.size,
    amountHt: Math.round(monthlyAcc[i].amountHt * 100) / 100,
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
            KPI Dashboard — 4 sections thématiques (Gilles 2026-05-23)
        ============================================================ */}

        {/* 🚨 ALERTES URGENTES */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-rose-700 mb-3 inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Alertes urgentes
            {totalNewAlerts > 0 && (
              <span className="text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full">
                {totalNewAlerts} à traiter
              </span>
            )}
          </h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Docs formateurs expirés/<90j"
              value={
                rcAlerts.length + urssafsAlerts.length + qualiopisAlerts.length
              }
              hint="RC pro, URSSAF ou Qualiopi à renouveler"
              icon={ShieldCheck}
              accent="red"
              href="/formateurs"
              pill={
                rcAlerts.length + urssafsAlerts.length + qualiopisAlerts.length >
                0
                  ? { text: "Urgent", tone: "red" }
                  : undefined
              }
            />
            <KpiCard
              label="Sessions confirmées sans formateur"
              value={sessionsNoTrainer}
              hint="Personne n'anime ! À assigner d'urgence."
              icon={UserX}
              accent="red"
              href="/sessions"
              pill={
                sessionsNoTrainer > 0
                  ? { text: "Urgent", tone: "red" }
                  : undefined
              }
            />
            <KpiCard
              label="Sessions confirmées sans quiz"
              value={sessionsNoQuiz}
              hint="Mesure pré/post manquante (Qualiopi ind. 11)"
              icon={Target}
              accent="amber"
              href="/sessions"
            />
            <KpiCard
              label="Sessions confirmées sans apprenants"
              value={sessionsNoEnrollment}
              hint="Risque d'annulation : aucune inscription"
              icon={Inbox}
              accent="amber"
              href="/sessions"
            />
          </div>
        </section>

        {/* 📅 SESSIONS À SUIVRE */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-700 mb-3 inline-flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Sessions à suivre
          </h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="À démarrer cette semaine"
              value={sessionsThisWeek}
              hint="Sessions confirmées dans les 7 prochains jours"
              icon={Calendar}
              accent="cyan"
              href="/sessions"
            />
            <KpiCard
              label="Positionnement incomplet (<7j)"
              value={sessionsPositionnementMissing}
              hint="Apprenants n'ayant pas rempli leur positionnement, alors que la session démarre dans moins de 7j"
              icon={ClipboardList}
              accent="amber"
              href="/sessions"
              pill={
                sessionsPositionnementMissing > 0
                  ? { text: "Qualiopi 12", tone: "amber" }
                  : undefined
              }
            />
            <KpiCard
              label="Émargement manquant (terminées 90j)"
              value={sessionsEmargementMissing}
              hint="Sessions terminées sans aucune signature recueillie"
              icon={PenTool}
              accent="amber"
              href="/sessions"
              pill={
                sessionsEmargementMissing > 0
                  ? { text: "Qualiopi R9", tone: "amber" }
                  : undefined
              }
            />
            <KpiCard
              label="Bilan formateur manquant (terminées 90j)"
              value={sessionsNoBilan}
              hint="Sessions sans bilan formateur signé (Module 7)"
              icon={PenSquare}
              accent="amber"
              href="/sessions"
              pill={
                sessionsNoBilan > 0
                  ? { text: "Qualiopi 22", tone: "amber" }
                  : undefined
              }
            />
          </div>
        </section>

        {/* 💰 PIPELINE COMMERCIAL */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700 mb-3 inline-flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Pipeline commercial
          </h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Pré-inscriptions partenaires en attente"
              value={preinscriptionsPending}
              hint="OF/Prescripteurs : à valider de votre côté"
              icon={Inbox}
              accent="violet"
              href="/inscriptions"
              pill={
                preinscriptionsPending > 0
                  ? { text: "À valider", tone: "amber" }
                  : undefined
              }
            />
            <KpiCard
              label="Inscriptions sans email apprenant"
              value={enrollmentsNoEmail}
              hint="Pas de convocation possible par email"
              icon={MailX}
              accent="amber"
              href="/inscriptions"
            />
            <KpiCard
              label="Inscriptions sans entreprise"
              value={enrollmentsNoCompany}
              hint="Apprenants indépendants ou rattachement oublié"
              icon={Mail}
              accent="zinc"
              href="/inscriptions"
            />
            <KpiCard
              label="CA potentiel à venir"
              value={`${upcomingRevenueLabel} €`}
              hint="Somme HT des sessions confirmées non terminées"
              icon={Banknote}
              accent="emerald"
            />
          </div>
        </section>

        {/* ✅ ÉTAT QUALIOPI */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-violet-700 mb-3 inline-flex items-center gap-2">
            <Award className="h-4 w-4" />
            État Qualiopi
          </h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Sessions 100% Qualiopi (90j)"
              value={qualiopiFull}
              hint="Positionnement + émargement + éval à chaud + bilan formateur tous complets"
              icon={CheckCircle2}
              accent="emerald"
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
              value={qualiopiScores.length - qualiopiFull}
              hint="Sessions terminées (90j) avec au moins 1 indicateur Qualiopi manquant"
              icon={ClipboardCheck}
              accent="amber"
            />
            <KpiCard
              label="Formateurs sans formation animable"
              value={trainersNoFormations}
              hint="Qualiopi ind. 21 : adéquation formateur ↔ formations à renseigner"
              icon={FileWarning}
              accent="amber"
              href="/formateurs"
            />
            <KpiCard
              label="Formateurs sans accès portail activé"
              value={trainersNoPortal}
              hint="Module activable depuis la fiche formateur (à venir)"
              icon={Key}
              accent="zinc"
              href="/formateurs"
            />
          </div>

          {/* Top 5 sessions à compléter (score Qualiopi < 100%) */}
          {qualiopiWorst.length > 0 && (
            <div className="mt-3 rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Top 5 sessions à compléter (90 derniers jours)
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

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Formations récentes */}
          <div className="lg:col-span-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">
                  Formations récentes
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Les 5 dernières modifiées
                </p>
              </div>
              <Link
                href="/formations"
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1"
              >
                Voir tout
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recentFormations && recentFormations.length > 0 ? (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {recentFormations.map((f) => {
                  const cat = f.category as unknown as { name: string } | null;
                  return (
                    <li key={f.id}>
                      <Link
                        href={`/formations/${f.id}`}
                        className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {f.title}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">
                            {cat?.name ?? "Sans catégorie"}
                            {f.duration_hours
                              ? ` · ${f.duration_hours} h`
                              : ""}
                          </p>
                        </div>
                        <Badge
                          variant={
                            STATUS_BADGE_VARIANTS[f.status as FormationStatus]
                          }
                        >
                          {STATUS_LABELS[f.status as FormationStatus]}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-zinc-500 mb-4">
                  Aucune formation pour le moment.
                </p>
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/formations/new" />}
                >
                  <Plus className="h-4 w-4" />
                  Créer une formation
                </Button>
              </div>
            )}
          </div>

          {/* Actions rapides */}
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 lg:col-span-1">
            <h2 className="text-sm font-semibold mb-4">Actions rapides</h2>
            <div className="space-y-2">
              <Button
                className="w-full justify-start"
                nativeButton={false}
                render={<Link href="/formations/new" />}
              >
                <Plus className="h-4 w-4" />
                Nouvelle formation
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                nativeButton={false}
                render={<Link href="/formations" />}
              >
                <GraduationCap className="h-4 w-4" />
                Voir le catalogue
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                nativeButton={false}
                render={<Link href="/formations/categories" />}
              >
                <Building2 className="h-4 w-4" />
                Gérer les catégories
              </Button>
            </div>
          </div>
        </div>

        {/* Statistiques mensuelles : 5 KPI annuels + graphique en barres
            + tableau récap mois par mois (annee en cours). */}
        <div className="mt-6">
          <MonthlyStats year={currentYear} monthly={monthlyStats} />
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
