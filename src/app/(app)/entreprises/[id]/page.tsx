import {
  Calendar,
  ClipboardList,
  Save,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyForm } from "../_form";
import { deleteCompany, updateCompany } from "../actions";
import { ContactsSection } from "./_contacts";
import { LearnersSection } from "./_learners";
import { NotesTimeline } from "./_notes-timeline";
import { ParentCompanyPicker } from "./_parent-company-picker";
import { PartnerPortalSection } from "./_partner-portal-section";
import { PricingSection } from "./_pricing-section";
import { SubsidiariesManager } from "./_subsidiaries-manager";
import { BackButton } from "@/components/back-button";
import { CollapsibleSection } from "@/components/collapsible-section";
import { PageHeader } from "@/components/page-header";
import { MergeCompanyButton } from "./_merge-company-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  COMPANY_TYPE_BADGE_CLASSES,
  COMPANY_TYPE_LABELS,
  type Company,
  type CompanyContact,
  type CompanyNote,
} from "@/lib/companies/types";

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    error?: string;
    contactAdded?: string;
    contactUpdated?: string;
    contactDeleted?: string;
    parentUpdated?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle<Company>();

  if (error) throw error;
  if (!company) notFound();

  const [
    { data: contacts },
    { data: notesData },
    { data: learnersOfCompany },
    { count: inscriptionsCount },
  ] = await Promise.all([
    supabase
      .from("company_contacts")
      .select("*")
      .eq("company_id", id)
      .order("is_primary", { ascending: false })
      .order("last_name", { ascending: true }),
    supabase
      .from("company_notes")
      .select("*")
      .eq("company_id", id)
      .order("created_at", { ascending: false }),
    // Apprenants rattachés à l'entreprise (utilisé à la fois pour le
    // calcul d'engagement et pour la nouvelle section « Apprenants
    // rattachés ») — on récupère donc les champs d'affichage.
    supabase
      .from("learners")
      .select(
        "id, first_name, last_name, job_title, email, phone, mobile, is_active",
      )
      .eq("company_id", id)
      .order("is_active", { ascending: false })
      .order("last_name", { ascending: true }),
    // Inscriptions associées (au moins une demande active)
    supabase
      .from("inscription_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", id),
  ]);
  // Résolution des noms d'auteur des notes via la table profiles.
  // Une seule requête pour tous les auteurs uniques.
  const rawNotes = (notesData ?? []) as CompanyNote[];
  const authorIds = Array.from(
    new Set(
      rawNotes
        .map((n) => n.created_by)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const authorNameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", authorIds);
    for (const p of (profiles ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>) {
      const name =
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        p.email ||
        null;
      if (name) authorNameById.set(p.id, name);
    }
  }
  // Société mère + filiales (chantier 0037)
  const [
    { data: parentRow },
    { data: subsidiariesRows },
    { data: candidatesRows },
  ] = await Promise.all([
    company.parent_company_id
      ? supabase
          .from("companies")
          .select("id, name, postal_code, city")
          .eq("id", company.parent_company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("companies")
      .select("id, name, postal_code, city, type")
      .eq("parent_company_id", id)
      .order("name", { ascending: true }),
    // Toutes les autres entreprises (excluant la société courante).
    // On charge aussi le parent_company_id pour signaler les candidats
    // déjà rattachés ailleurs (avant écrasement avec confirmation).
    supabase
      .from("companies")
      .select("id, name, postal_code, city, parent_company_id")
      .neq("id", id)
      .order("name", { ascending: true }),
  ]);
  const parentCompany = parentRow as {
    id: string;
    name: string;
    postal_code: string | null;
    city: string | null;
  } | null;
  const subsidiaries = (subsidiariesRows ?? []) as Array<{
    id: string;
    name: string;
    postal_code: string | null;
    city: string | null;
    type: string | null;
  }>;
  const candidatesRaw = (candidatesRows ?? []) as Array<{
    id: string;
    name: string;
    postal_code: string | null;
    city: string | null;
    parent_company_id: string | null;
  }>;
  // Map id → name pour résoudre le nom du parent actuel des candidats
  // (utile pour le manager de filiales : « ⚠ déjà rattachée à X »).
  const candidateNameById = new Map<string, string>();
  for (const c of candidatesRaw) candidateNameById.set(c.id, c.name);
  // Le parent actuel d'un candidat peut aussi être la société courante
  if (company.name) candidateNameById.set(id, company.name);
  const parentCandidates = candidatesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    postal_code: c.postal_code,
    city: c.city,
  }));
  // Liste enrichie pour le SubsidiariesManager : avec le nom du parent
  // actuel du candidat (pour proposer un déplacement avec confirmation).
  const subsidiaryCandidates = candidatesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    postal_code: c.postal_code,
    city: c.city,
    type: null as string | null,
    current_parent_name: c.parent_company_id
      ? (candidateNameById.get(c.parent_company_id) ?? null)
      : null,
  }));

  const notes: CompanyNote[] = rawNotes.map((n) => ({
    ...n,
    author_name: n.created_by
      ? (authorNameById.get(n.created_by) ?? null)
      : null,
  }));

  // Calcul de l'engagement : combien d'enrollments concernent cette
  // entreprise via ses apprenants (peu importe le statut, sauf annulé).
  const learnerIds = (learnersOfCompany ?? []).map((l) => l.id as string);
  let enrollmentCount = 0;
  if (learnerIds.length > 0) {
    const { count } = await supabase
      .from("session_enrollments")
      .select("session_id", { count: "exact", head: true })
      .in("learner_id", learnerIds)
      .neq("status", "cancelled");
    enrollmentCount = count ?? 0;
  }
  const learnerCount = learnerIds.length;
  const requestCount = inscriptionsCount ?? 0;

  // Règle métier : dès qu'une entreprise a réellement engagé une formation
  // (au moins un enrollment non annulé), elle passe automatiquement de
  // "prospect" à "client". Les autres types (financeur, OPCO, OF) ne sont
  // jamais écrasés — ils représentent un rôle, pas un statut commercial.
  let autoUpgraded = false;
  if (company.type === "prospect" && enrollmentCount > 0) {
    await supabase
      .from("companies")
      .update({ type: "client" })
      .eq("id", id);
    company.type = "client";
    autoUpgraded = true;
  }

  // Bloc « Portail partenaire » : uniquement pour OF/prescripteurs.
  const isPartner = company.type === "of" || company.type === "prescripteur";
  const partnerType = (
    isPartner ? company.type : "prescripteur"
  ) as "of" | "prescripteur";
  let partnerToken: string | null = null;
  let partnerDailyRateDistancielHt: number | null = null;
  let partnerDailyRatePresentielHt: number | null = null;
  let partnerQuizUnitPriceHt: number | null = null;
  let partnerShowInterCatalog = true;
  let partnerShowOwnIntra = true;
  let partnerLogoUrl: string | null = null;
  let partnerFormations: Array<{
    id: string;
    title: string;
    duration_hours: number | null;
    duration_days: number | null;
    public_price_excl_tax: number | null;
  }> = [];
  let partnerPricing: Array<{
    formation_id: string;
    unit_price_ht: number;
    notes: string | null;
  }> = [];
  // Refonte tarification 2026-05-31 : nouveaux champs (migration 0112).
  // Charges pour TOUTES les entreprises (pas uniquement les partenaires)
  // car la sous-traitance peut potentiellement concerner n importe qui.
  let subcontractingDistancielHt: number | null = null;
  let subcontractingPresentielHt: number | null = null;
  let prescripteurCommissionRatePct: number | null = null;
  let prescripteurCommissionFlatHt: number | null = null;
  {
    const { data: newRates } = await supabase
      .from("companies")
      .select(
        "subcontracting_daily_rate_distanciel_ht, subcontracting_daily_rate_presentiel_ht, prescripteur_commission_rate_pct, prescripteur_commission_flat_ht",
      )
      .eq("id", id)
      .maybeSingle<{
        subcontracting_daily_rate_distanciel_ht: string | number | null;
        subcontracting_daily_rate_presentiel_ht: string | number | null;
        prescripteur_commission_rate_pct: string | number | null;
        prescripteur_commission_flat_ht: string | number | null;
      }>();
    const toNum = (v: string | number | null | undefined) =>
      v === null || v === undefined ? null : Number(v);
    subcontractingDistancielHt = toNum(
      newRates?.subcontracting_daily_rate_distanciel_ht,
    );
    subcontractingPresentielHt = toNum(
      newRates?.subcontracting_daily_rate_presentiel_ht,
    );
    prescripteurCommissionRatePct = toNum(
      newRates?.prescripteur_commission_rate_pct,
    );
    prescripteurCommissionFlatHt = toNum(
      newRates?.prescripteur_commission_flat_ht,
    );
  }
  if (isPartner) {
    const [
      { data: tokenRow },
      { data: ratesRow },
      { data: formationsRows },
      { data: pricingRows },
    ] = await Promise.all([
      supabase
        .from("partner_portal_tokens")
        .select("token")
        .eq("company_id", id)
        .maybeSingle<{ token: string }>(),
      supabase
        .from("companies")
        .select(
          "partner_daily_rate_distanciel_ht, partner_daily_rate_presentiel_ht, partner_quiz_unit_price_ht, partner_portal_show_inter_catalog, partner_portal_show_own_intra",
        )
        .eq("id", id)
        .maybeSingle<{
          partner_daily_rate_distanciel_ht: string | number | null;
          partner_daily_rate_presentiel_ht: string | number | null;
          partner_quiz_unit_price_ht: string | number | null;
          partner_portal_show_inter_catalog: boolean | null;
          partner_portal_show_own_intra: boolean | null;
        }>(),
      // Toutes les formations actives (sauf archivées) pour permettre la
      // saisie de tarifs spécifiques. On garde toutes les modalités car
      // les prescripteurs peuvent maintenant accéder aussi à des INTRA
      // présentiel (cf. migration 0088), et le tarif jour présentiel
      // (migration 0089) s'applique à ces formations.
      supabase
        .from("formations")
        .select(
          "id, title, duration_hours, duration_days, public_price_excl_tax, modality, status",
        )
        .eq("organization_id", company.organization_id)
        .neq("status", "archived")
        .order("title", { ascending: true }),
      supabase
        .from("partner_pricing")
        .select("formation_id, unit_price_ht, notes")
        .eq("company_id", id),
    ]);
    partnerToken = tokenRow?.token ?? null;
    partnerDailyRateDistancielHt =
      ratesRow?.partner_daily_rate_distanciel_ht !== null &&
      ratesRow?.partner_daily_rate_distanciel_ht !== undefined
        ? Number(ratesRow.partner_daily_rate_distanciel_ht)
        : null;
    partnerDailyRatePresentielHt =
      ratesRow?.partner_daily_rate_presentiel_ht !== null &&
      ratesRow?.partner_daily_rate_presentiel_ht !== undefined
        ? Number(ratesRow.partner_daily_rate_presentiel_ht)
        : null;
    partnerQuizUnitPriceHt =
      ratesRow?.partner_quiz_unit_price_ht !== null &&
      ratesRow?.partner_quiz_unit_price_ht !== undefined
        ? Number(ratesRow.partner_quiz_unit_price_ht)
        : null;
    partnerShowInterCatalog =
      ratesRow?.partner_portal_show_inter_catalog ?? true;
    partnerShowOwnIntra = ratesRow?.partner_portal_show_own_intra ?? true;
    // Fetch séparé du logo : la colonne n'existe que si la migration
    // 0091 a été appliquée. Best-effort, ne casse pas la page si absente.
    const { data: logoRow } = await supabase
      .from("companies")
      .select("logo_url")
      .eq("id", id)
      .maybeSingle<{ logo_url: string | null }>();
    partnerLogoUrl = logoRow?.logo_url ?? null;
    partnerFormations = (
      (formationsRows ?? []) as Array<{
        id: string;
        title: string;
        duration_hours: number | null;
        duration_days: number | null;
        public_price_excl_tax: number | null;
      }>
    ).map((f) => ({
      id: f.id,
      title: f.title,
      duration_hours: f.duration_hours,
      duration_days: f.duration_days,
      public_price_excl_tax: f.public_price_excl_tax,
    }));
    partnerPricing = (
      (pricingRows ?? []) as Array<{
        formation_id: string;
        unit_price_ht: string | number;
        notes: string | null;
      }>
    ).map((p) => ({
      formation_id: p.formation_id,
      unit_price_ht: Number(p.unit_price_ht),
      notes: p.notes,
    }));
  }

  const update = updateCompany.bind(null, id);
  const remove = deleteCompany.bind(null, id);

  const notifs = [
    query.created && "Entreprise créée avec succès.",
    query.updated && "Modifications enregistrées.",
    query.contactAdded && "Contact ajouté.",
    query.contactUpdated && "Contact mis à jour.",
    query.contactDeleted && "Contact supprimé.",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title={company.name}
        description={company.industry ?? undefined}
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Entreprises", href: "/entreprises" },
          { label: company.name },
        ]}
        actions={
          <>
            <BackButton fallbackHref="/entreprises" />
            <MergeCompanyButton targetId={id} targetName={company.name} />
            <form action={remove}>
              <Button type="submit" variant="outline" size="sm">
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            </form>
            <Button
              type="submit"
              size="sm"
              form="form-company"
              title="Enregistrer les modifications"
            >
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </>
        }
      />

      <div className="p-8 max-w-4xl space-y-6">
        {notifs.map((msg, i) => (
          <div
            key={i}
            className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300"
          >
            {msg}
          </div>
        ))}
        {query.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {query.error}
          </div>
        )}

        {/* Bloc STATUT visible — badge gros + stats engagement */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border-2 border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "inline-flex items-center px-4 py-2 rounded-lg text-sm font-black uppercase tracking-wider whitespace-nowrap",
                  COMPANY_TYPE_BADGE_CLASSES[company.type],
                )}
              >
                {COMPANY_TYPE_LABELS[company.type]}
              </span>
              <div className="text-xs text-slate-500">
                Statut commercial actuel de l&apos;entreprise.
                {company.type === "prospect" && (
                  <span className="block">
                    Passera automatiquement à <strong>Client</strong> dès la
                    première formation engagée.
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold"
                title="Apprenants rattachés à cette entreprise"
              >
                <Users className="h-3.5 w-3.5" />
                {learnerCount} apprenant{learnerCount > 1 ? "s" : ""}
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-800 text-xs font-bold"
                title="Demandes d'inscription reçues"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                {requestCount} inscription{requestCount > 1 ? "s" : ""}
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 text-xs font-bold"
                title="Sessions effectivement engagées via les apprenants"
              >
                <Calendar className="h-3.5 w-3.5" />
                {enrollmentCount} formation{enrollmentCount > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {autoUpgraded && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 inline-flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
              <span>
                <strong>Statut mis à jour automatiquement</strong> : cette
                entreprise a engagé au moins une formation, son statut est
                désormais <strong>Client</strong>.
              </span>
            </div>
          )}
        </div>

        <ContactsSection
          companyId={id}
          contacts={(contacts ?? []) as CompanyContact[]}
        />

        <LearnersSection
          companyId={id}
          learners={
            (learnersOfCompany ?? []) as Array<{
              id: string;
              first_name: string | null;
              last_name: string;
              job_title: string | null;
              email: string | null;
              phone: string | null;
              mobile: string | null;
              is_active: boolean;
            }>
          }
        />

        {isPartner && (
          <PartnerPortalSection
            companyId={id}
            companyName={company.name}
            companyType={partnerType}
            token={partnerToken}
            dailyRateDistancielHt={partnerDailyRateDistancielHt}
            dailyRatePresentielHt={partnerDailyRatePresentielHt}
            quizUnitPriceHt={partnerQuizUnitPriceHt}
            showInterCatalog={partnerShowInterCatalog}
            showOwnIntra={partnerShowOwnIntra}
            logoUrl={partnerLogoUrl}
            formations={partnerFormations}
            pricing={partnerPricing}
            contacts={(contacts ?? []) as CompanyContact[]}
            linkSentAt={
              (company as { partner_portal_link_sent_at?: string | null })
                .partner_portal_link_sent_at ?? null
            }
            linkSentTo={
              (company as { partner_portal_link_sent_to?: string | null })
                .partner_portal_link_sent_to ?? null
            }
          />
        )}

        {/* Bloc unifie "Tarifs" — refonte 2026-05-31 (4 sous-sections
            selon le scenario metier). Affiche pour TOUTES les entreprises
            (la sous-section sous-traitance est utile meme pour les non
            partenaires). */}
        <PricingSection
          companyId={id}
          companyType={company.type}
          dailyRateDistancielHt={partnerDailyRateDistancielHt}
          dailyRatePresentielHt={partnerDailyRatePresentielHt}
          quizUnitPriceHt={partnerQuizUnitPriceHt}
          formations={partnerFormations}
          pricing={partnerPricing}
          subcontractingDistancielHt={subcontractingDistancielHt}
          subcontractingPresentielHt={subcontractingPresentielHt}
          prescripteurCommissionRatePct={prescripteurCommissionRatePct}
          prescripteurCommissionFlatHt={prescripteurCommissionFlatHt}
        />

        {/* Notes internes : timeline horodatée + ancien champ « notes »
            (legacy) affiché en encart au-dessus si non vide. */}
        <CollapsibleSection
          icon={StickyNote}
          title="Notes internes"
          description="Historique, points d'attention, suivi commercial. Chaque note peut être associée à une action (à rappeler, à relancer, RDV…)."
          accent="amber"
          defaultOpen
          id="notes"
          headerExtra={
            notes.length > 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {notes.length}
              </span>
            ) : undefined
          }
        >
          {company.notes && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400 mb-1">
                Note générale
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {company.notes}
              </p>
            </div>
          )}
          <NotesTimeline companyId={id} notes={notes} />
        </CollapsibleSection>

        <form id="form-company" action={update}>
          <CompanyForm
            company={company}
            hierarchySlot={
              <div className="space-y-5">
                {/* Rattachement à une société mère */}
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-violet-700 mb-2">
                    Rattachement à une société mère
                  </p>
                  <ParentCompanyPicker
                    companyId={id}
                    candidates={parentCandidates}
                    currentParent={parentCompany}
                  />
                </div>
                {/* Filiales rattachées à cette société */}
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-violet-700 mb-2">
                    Filiales rattachées à cette société
                    {subsidiaries.length > 0 && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-800 border border-violet-200">
                        {subsidiaries.length}
                      </span>
                    )}
                  </p>
                  <SubsidiariesManager
                    parentCompanyId={id}
                    subsidiaries={subsidiaries}
                    candidates={subsidiaryCandidates}
                  />
                </div>
                <p className="text-[11px] text-slate-500 italic">
                  Une entreprise est rattachée à une autre lorsqu&apos;elle
                  est contrôlée par elle. Exemple : la société A est la
                  société mère de la société B → la société B est une
                  filiale de la société A.
                </p>
              </div>
            }
          />
          <div className="mt-6 flex justify-end gap-3">
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </div>
    </>
  );
}
