import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  GraduationCap,
  Plus,
  Users,
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
