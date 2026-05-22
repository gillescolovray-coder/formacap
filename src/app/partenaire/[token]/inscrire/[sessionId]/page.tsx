import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Euro,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeEffectivePartnerPrice,
  loadOrgPartnerDefaults,
} from "@/lib/portal/partner-pricing";
import { resolvePartnerContext } from "../../_resolve";
import { PartnerInscribeForm } from "./_form-client";

type Params = { token: string; sessionId: string };

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PartnerInscribePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ error?: string; prefillCompanyId?: string }>;
}) {
  const { token, sessionId } = await params;
  const { error, prefillCompanyId } = await searchParams;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();

  // Session + formation + tarif effectif (override ou calculé).
  // Éligibilité :
  //   - INTER distanciel public (tout partenaire)
  //   - OU INTRA rattachée à ce partenaire (prescripteur uniquement)
  const { data: sessionRaw } = await supabase
    .from("sessions")
    .select(
      `
      id, internal_code, start_date, end_date, status, is_inter, prescriber_company_id,
      formation:formations!inner(id, title, subtitle, duration_hours, duration_days, modality)
    `,
    )
    .eq("id", sessionId)
    .eq("organization_id", ctx.company.organization_id)
    .maybeSingle();
  if (!sessionRaw) notFound();
  const session = sessionRaw as unknown as {
    id: string;
    internal_code: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string;
    is_inter: boolean;
    prescriber_company_id: string | null;
    formation:
      | {
          id: string;
          title: string;
          subtitle: string | null;
          duration_hours: number | null;
          duration_days: number | null;
          modality: string;
        }
      | Array<{
          id: string;
          title: string;
          subtitle: string | null;
          duration_hours: number | null;
          duration_days: number | null;
          modality: string;
        }>;
  };
  const formation = Array.isArray(session.formation)
    ? session.formation[0]
    : session.formation;
  if (!formation) notFound();
  const isInterDistanciel =
    session.is_inter && formation.modality === "distanciel";
  const isOwnIntra = session.prescriber_company_id === ctx.company.id;
  if (!isInterDistanciel && !isOwnIntra) notFound();
  if (ctx.company.type === "of" && !isInterDistanciel) notFound();

  // Cherche un override formation, puis applique le helper
  const { data: priceRow } = await supabase
    .from("partner_pricing")
    .select("unit_price_ht")
    .eq("company_id", ctx.company.id)
    .eq("formation_id", formation.id)
    .maybeSingle<{ unit_price_ht: string | number }>();

  const orgDefaults = await loadOrgPartnerDefaults(
    supabase,
    ctx.company.organization_id,
  );
  const effective = computeEffectivePartnerPrice({
    partnerType: ctx.company.type,
    dailyRateDistancielHt: ctx.company.daily_rate_distanciel_ht,
    dailyRatePresentielHt: ctx.company.daily_rate_presentiel_ht,
    quizUnitPriceHt: ctx.company.quiz_unit_price_ht,
    overrideHt: priceRow ? Number(priceRow.unit_price_ht) : undefined,
    durationDays: formation.duration_days,
    durationHours: formation.duration_hours,
    modality: (formation.modality ?? null) as
      | "presentiel"
      | "distanciel"
      | "hybride"
      | null,
    ...orgDefaults,
  });

  if (effective.price === null) {
    return (
      <div className="space-y-4">
        <Link
          href={`/partenaire/${token}/catalogue`}
          className="inline-flex items-center gap-1 text-sm text-cyan-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au catalogue
        </Link>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6">
          <p className="text-sm text-amber-900">
            Aucun tarif n&apos;est défini pour cette formation. Merci de
            contacter {ctx.organization.name} avant inscription.
          </p>
        </div>
      </div>
    );
  }
  const unitPriceHt = effective.price;

  // Pré-remplissage de l'entreprise (Gilles 2026-05-22) — quand le
  // partenaire clique sur "+ Ajouter un apprenant" depuis Mes inscriptions,
  // on charge les infos de l'entreprise + son contact référent principal
  // pour qu'il n'ait qu'à saisir le nouvel apprenant.
  type PrefillData = {
    company: {
      siret: string;
      name: string;
      address: string;
      postalCode: string;
      city: string;
    };
    contactReferent: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      role: string;
    } | null;
  } | null;
  let prefillData: PrefillData = null;
  if (prefillCompanyId) {
    const { data: prefillCompany } = await supabase
      .from("companies")
      .select("id, siret, name, address, postal_code, city")
      .eq("id", prefillCompanyId)
      .eq("organization_id", ctx.company.organization_id)
      .maybeSingle<{
        id: string;
        siret: string | null;
        name: string;
        address: string | null;
        postal_code: string | null;
        city: string | null;
      }>();
    if (prefillCompany) {
      // Contact principal de l'entreprise (= contact référent par défaut)
      const { data: primaryContact } = await supabase
        .from("company_contacts")
        .select("first_name, last_name, email, phone, job_title")
        .eq("company_id", prefillCompanyId)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle<{
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          job_title: string | null;
        }>();
      prefillData = {
        company: {
          siret: prefillCompany.siret ?? "",
          name: prefillCompany.name,
          address: prefillCompany.address ?? "",
          postalCode: prefillCompany.postal_code ?? "",
          city: prefillCompany.city ?? "",
        },
        contactReferent: primaryContact
          ? {
              firstName: primaryContact.first_name ?? "",
              lastName: primaryContact.last_name ?? "",
              email: primaryContact.email ?? "",
              phone: primaryContact.phone ?? "",
              role: primaryContact.job_title ?? "",
            }
          : null,
      };
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <Link
        href={`/partenaire/${token}/catalogue`}
        className="inline-flex items-center gap-1 text-sm text-cyan-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au catalogue
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-zinc-900">
          Inscrire des apprenants
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Recherchez l&apos;entreprise des apprenants par SIRET, ajoutez un ou
          plusieurs apprenants, puis validez. L&apos;inscription est{" "}
          <strong>immédiate</strong>.
        </p>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Récap session */}
      <section className="rounded-2xl bg-gradient-to-br from-cyan-50 to-indigo-50 border border-cyan-200 p-5">
        <p className="text-[10px] uppercase tracking-widest text-cyan-700 font-bold">
          Session sélectionnée
        </p>
        <h2 className="text-lg font-bold text-zinc-900 mt-1">
          {formation.title}
        </h2>
        {formation.subtitle && (
          <p className="text-sm text-zinc-600">{formation.subtitle}</p>
        )}
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-xs">
          <div>
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px] font-bold mb-0.5">
              Début
            </dt>
            <dd className="font-medium inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-zinc-400" />
              {formatDate(session.start_date)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px] font-bold mb-0.5">
              Durée
            </dt>
            <dd className="font-medium inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-zinc-400" />
              {formation.duration_hours ? `${formation.duration_hours} h` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px] font-bold mb-0.5">
              Tarif partenaire
            </dt>
            <dd className="font-bold text-emerald-700 tabular-nums inline-flex items-center gap-1">
              <Euro className="h-3.5 w-3.5" />
              {unitPriceHt.toFixed(2)} HT
            </dd>
            {effective.explain && (
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {effective.explain}
              </p>
            )}
          </div>
        </dl>
      </section>

      {/* Formulaire client : SIRET + plusieurs apprenants */}
      <PartnerInscribeForm
        token={token}
        sessionId={sessionId}
        unitPriceHt={unitPriceHt}
        partnerType={ctx.company.type as "of" | "prescripteur"}
        prefill={prefillData}
      />

      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 inline-flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
        <span>
          Les inscriptions sont validées automatiquement. Vous retrouverez
          les apprenants dans <strong>Mes inscriptions</strong> dès l&apos;envoi.
        </span>
      </div>
    </div>
  );
}
