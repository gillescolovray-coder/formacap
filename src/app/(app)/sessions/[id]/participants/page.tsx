import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { EnrollmentsSection } from "../_enrollments";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import type { Enrollment, TrainingSession } from "@/lib/sessions/types";
import type { Learner } from "@/lib/learners/types";
import {
  computeConventionAmount,
  type SessionPricingConfig,
} from "@/lib/pricing/compute";

// Force le rechargement à chaque accès pour que la liste des apprenants
// disponibles soit toujours à jour (sinon, un apprenant qu'on vient de
// créer dans le module Apprenants n'apparaît pas dans le picker).
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, max_participants, pricing_mode, price_per_day_ht, price_forfait_ht, price_extra_per_day_ht, pricing_threshold, formation:formations(id, title)",
    )
    .eq("id", id)
    .maybeSingle<
      Pick<
        TrainingSession,
        | "id"
        | "max_participants"
        | "pricing_mode"
        | "price_per_day_ht"
        | "price_forfait_ht"
        | "price_extra_per_day_ht"
        | "pricing_threshold"
      > & {
        formation: { id: string; title: string } | null;
      }
    >();
  if (!session) notFound();

  // Récupération de l'organization_id via la session pour la requête OPCO
  const { data: sessionOrg } = await supabase
    .from("sessions")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();
  const orgId = (sessionOrg?.organization_id as string | null) ?? null;

  const [
    { data: companies },
    { data: learners },
    { data: enrollments },
    { data: inscriptionRequests },
    { data: inscriptionStages },
    { data: opcoAgreements },
    { data: conventions },
    { count: sessionDaysCount },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, type")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("learners")
      .select(
        "id, first_name, last_name, email, job_title, company:companies(id, name)",
      )
      .eq("is_active", true)
      .order("last_name", { ascending: true }),
    supabase
      .from("session_enrollments")
      .select(
        "*, learner:learners(id, first_name, last_name, email, phone, mobile, job_title, company:companies(id, name)), inscription_request:inscription_requests(id, financing_mode, financing_details, quote_amount_ht, via_partner_portal, referrer:companies!referrer_company_id(id, name, type), opco_fundings:inscription_opco_fundings(agreement_id, amount_ht, agreement:opco_funding_agreements(opco_name, dossier_number)))",
      )
      .eq("session_id", id)
      .order("enrolled_at", { ascending: true }),
    supabase
      .from("inscription_requests")
      .select(
        "id, learner_id, prospect_first_name, prospect_last_name, prospect_email, prospect_phone, has_special_needs, financing_mode, quote_amount_ht, stage_id, received_at, company_name_freetext, learner:learners(first_name, last_name, email, phone, job_title, company:companies(name))",
      )
      .eq("target_session_id", id)
      .order("received_at", { ascending: true }),
    supabase
      .from("inscription_stages")
      .select("id, name, color, is_won")
      .eq("is_active", true)
      .order("position", { ascending: true }),
    // Accords OPCO disponibles pour le picker financement (mode = opco)
    orgId
      ? supabase
          .from("opco_funding_agreements")
          .select("id, opco_name, dossier_number")
          .eq("organization_id", orgId)
          .order("opco_name", { ascending: true })
      : Promise.resolve({ data: [] }),
    // Conventions de session pour le calcul du prix unitaire HT par
    // apprenant (le prix est porté par la convention société, pas par
    // l'enrollment individuel — cf. règle métier R2).
    supabase
      .from("session_conventions")
      .select("company_id, amount_ht_unit")
      .eq("session_id", id),
    // Jours de session pour la cascade tarification R7 (count vs.
    // amplitude start_date → end_date qui peut inclure des jours non
    // programmés).
    supabase.from("session_days").select("id", { count: "exact", head: true }).eq("session_id", id),
  ]);
  const nbJours = sessionDaysCount ?? 0;

  // ============================================================
  // Calcul du prix unitaire HT par société (R7 — Gilles 2026-05-14)
  //
  // Priorité :
  //   1. Convention société (amount_ht_unit) — figé après création
  //   2. Cascade R7 (pricing_mode + price_*) avec split forfait par société
  //   3. (rien) — la cellule affichera "—"
  //
  // On bâtit la map company_id → prix unitaire HT par apprenant.
  // ============================================================
  const unitPriceByCompanyId: Record<string, number> = {};

  // 1) Conventions existantes (priorité absolue : montant figé)
  for (const c of (conventions ?? []) as Array<{
    company_id: string | null;
    amount_ht_unit: number | null;
  }>) {
    if (c.company_id && c.amount_ht_unit !== null) {
      unitPriceByCompanyId[c.company_id] = Number(c.amount_ht_unit);
    }
  }

  // 2) Fallback R7 : pour les sociétés sans convention encore créée,
  //    on dérive le prix unitaire depuis la cascade tarification.
  if (session.pricing_mode && nbJours > 0) {
    // Compter les apprenants par société sur cette session
    const learnerCountByCompany = new Map<string, number>();
    let totalLearners = 0;
    for (const e of (enrollments ?? []) as Array<{
      learner: { company: { id: string } | null } | null;
    }>) {
      const cid = e.learner?.company?.id ?? null;
      if (cid) {
        learnerCountByCompany.set(
          cid,
          (learnerCountByCompany.get(cid) ?? 0) + 1,
        );
      }
      totalLearners += 1;
    }
    const cfg: SessionPricingConfig = {
      mode: session.pricing_mode,
      pricePerDayHt: session.price_per_day_ht,
      priceForfaitHt: session.price_forfait_ht,
      priceExtraPerDayHt: session.price_extra_per_day_ht,
      threshold: session.pricing_threshold,
    };
    for (const [companyId, nbCompany] of learnerCountByCompany) {
      if (unitPriceByCompanyId[companyId] !== undefined) continue; // déjà figé via convention
      const { unitHt } = computeConventionAmount(
        cfg,
        nbCompany,
        totalLearners,
        nbJours,
      );
      if (unitHt > 0) unitPriceByCompanyId[companyId] = unitHt;
    }
  }

  // Compteur dédupliqué : avec la sync bidirectionnelle (migration 0057),
  // chaque session_enrollment a sa inscription_request miroir liée. On
  // doit donc compter UNIQUEMENT les personnes uniques pour la session,
  // pas la somme brute des deux tables (qui doublonnerait).
  //
  // Règle : on compte chaque enrollment + chaque request qui n'a PAS
  // d'enrollment correspondant (cas des prospects anonymes ou des
  // demandes ciblant la session mais sans learner_id encore identifié).
  const enrolledLearnerIds = new Set(
    (enrollments ?? [])
      .map((e) => (e as { learner_id: string | null }).learner_id)
      .filter((id): id is string => Boolean(id)),
  );
  const trulyPendingRequests = (inscriptionRequests ?? []).filter((r) => {
    const lid = (r as { learner_id: string | null }).learner_id;
    // Si l'apprenant est déjà inscrit, c'est un doublon visuel — on l'écarte.
    return !lid || !enrolledLearnerIds.has(lid);
  });
  const totalParticipants =
    (enrollments?.length ?? 0) + trulyPendingRequests.length;
  const title = session.formation?.title ?? "Session";

  return (
    <>
      <PageHeader
        title="Participants"
        description={
          <>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
              {title}
            </span>
            <SessionHeaderMeta sessionId={id} />
          </>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Sessions", href: "/sessions" },
          { label: title, href: `/sessions/${id}` },
          { label: "Participants" },
        ]}
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />

      <SessionTabs
        sessionId={id}
        counts={{ participants: totalParticipants }}
      />

      <div className="p-8 max-w-7xl space-y-4">
        {query.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {query.error}
          </div>
        )}
        <EnrollmentsSection
          sessionId={id}
          enrollments={(enrollments ?? []) as unknown as Enrollment[]}
          availableLearners={
            (learners ?? []) as unknown as Pick<
              Learner,
              | "id"
              | "first_name"
              | "last_name"
              | "email"
              | "job_title"
              | "company"
            >[]
          }
          companies={(companies ?? []).map((c) => ({
            id: c.id as string,
            name: c.name as string,
            type: (c.type as string | null) ?? null,
          }))}
          opcoAgreements={(opcoAgreements ?? []).map((a) => ({
            id: a.id as string,
            opco_name: a.opco_name as string,
            dossier_number: (a.dossier_number as string | null) ?? null,
          }))}
          unitPriceByCompanyId={unitPriceByCompanyId}
          maxParticipants={session.max_participants}
          inscriptionRequests={(inscriptionRequests ?? []) as unknown as Array<{
            id: string;
            learner_id: string | null;
            prospect_first_name: string | null;
            prospect_last_name: string | null;
            prospect_email: string | null;
            prospect_phone: string | null;
            has_special_needs: boolean;
            financing_mode: string | null;
            quote_amount_ht: number | null;
            stage_id: string | null;
            received_at: string;
            company_name_freetext: string | null;
            learner: {
              first_name: string | null;
              last_name: string | null;
              email: string | null;
              phone: string | null;
              job_title: string | null;
              company: { name: string } | null;
            } | null;
          }>}
          inscriptionStages={(inscriptionStages ?? []) as Array<{
            id: string;
            name: string;
            color: string | null;
            is_won: boolean;
          }>}
        />
      </div>
    </>
  );
}
