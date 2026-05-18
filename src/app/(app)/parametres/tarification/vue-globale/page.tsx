import {
  ArrowLeft,
  BookOpen,
  Building2,
  Euro,
  Globe,
  Handshake,
  MapPin,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ParametresNav } from "../../_nav";

export const dynamic = "force-dynamic";

function fmt(n: number | null | undefined, suffix = "€"): string {
  if (n === null || n === undefined) return "—";
  return `${Number(n).toFixed(2)} ${suffix}`;
}

export default async function PricingOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/parametres");
  const orgId = membership.organization_id as string;

  // 1) Tarifs publics par défaut de l'organisation
  const { data: defaults } = await supabase
    .from("organization_pricing_defaults")
    .select(
      "inter_presentiel_per_day_ht, inter_distanciel_per_day_ht, intra_presentiel_forfait_ht, intra_presentiel_extra_per_day_ht, intra_distanciel_forfait_ht, intra_distanciel_extra_per_day_ht, intra_forfait_threshold",
    )
    .eq("organization_id", orgId)
    .maybeSingle<{
      inter_presentiel_per_day_ht: number;
      inter_distanciel_per_day_ht: number;
      intra_presentiel_forfait_ht: number;
      intra_presentiel_extra_per_day_ht: number;
      intra_distanciel_forfait_ht: number;
      intra_distanciel_extra_per_day_ht: number;
      intra_forfait_threshold: number;
    }>();

  // 2) Catalogue formations (prix publics)
  const { data: formationsRaw } = await supabase
    .from("formations")
    .select(
      "id, title, modality, duration_hours, duration_days, public_price_excl_tax, price_company, price_individual, price_independent, status",
    )
    .eq("organization_id", orgId)
    .neq("status", "archived")
    .order("title", { ascending: true });
  const formations = (formationsRaw ?? []) as Array<{
    id: string;
    title: string;
    modality: string | null;
    duration_hours: number | null;
    duration_days: number | null;
    public_price_excl_tax: number | null;
    price_company: number | null;
    price_individual: number | null;
    price_independent: number | null;
  }>;

  // 3) Partenaires (OF + prescripteurs) avec leurs tarifs généraux
  const { data: partnersRaw } = await supabase
    .from("companies")
    .select(
      "id, name, type, partner_daily_rate_distanciel_ht, partner_daily_rate_presentiel_ht, partner_quiz_unit_price_ht",
    )
    .eq("organization_id", orgId)
    .in("type", ["of", "prescripteur"])
    .eq("is_active", true)
    .order("name", { ascending: true });
  const partners = (partnersRaw ?? []) as Array<{
    id: string;
    name: string;
    type: "of" | "prescripteur";
    partner_daily_rate_distanciel_ht: number | null;
    partner_daily_rate_presentiel_ht: number | null;
    partner_quiz_unit_price_ht: number | null;
  }>;
  const ofPartners = partners.filter((p) => p.type === "of");
  const prescripteurs = partners.filter((p) => p.type === "prescripteur");

  // 4) Overrides spécifiques partner_pricing
  const { data: overridesRaw } = await supabase
    .from("partner_pricing")
    .select(
      "company_id, formation_id, unit_price_ht, notes, company:companies(name, type), formation:formations(title, modality)",
    );
  type OverrideRow = {
    company_id: string;
    formation_id: string;
    unit_price_ht: string | number;
    notes: string | null;
    company:
      | { name: string; type: string }
      | Array<{ name: string; type: string }>
      | null;
    formation:
      | { title: string; modality: string | null }
      | Array<{ title: string; modality: string | null }>
      | null;
  };
  const overrides = ((overridesRaw ?? []) as unknown as OverrideRow[]).map(
    (r) => {
      const c = Array.isArray(r.company) ? r.company[0] : r.company;
      const f = Array.isArray(r.formation) ? r.formation[0] : r.formation;
      return {
        company_id: r.company_id,
        formation_id: r.formation_id,
        unit_price_ht: Number(r.unit_price_ht),
        notes: r.notes,
        company_name: c?.name ?? "—",
        company_type: c?.type ?? "—",
        formation_title: f?.title ?? "—",
        formation_modality: f?.modality ?? null,
      };
    },
  );

  return (
    <>
      <PageHeader
        title="Vue d'ensemble des tarifications"
        description="Vue consolidée de tous les prix appliqués : tarifs publics, catalogue, partenaires OF, prescripteurs et tarifs spécifiques."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres" },
          {
            label: "Tarification",
            href: "/parametres/tarification",
          },
          { label: "Vue d'ensemble" },
        ]}
      />
      <ParametresNav />

      <div className="p-8 max-w-6xl space-y-8">
        <Link
          href="/parametres/tarification"
          className="inline-flex items-center gap-1 text-sm text-amber-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l&apos;édition des tarifs par défaut
        </Link>

        {/* 1) Tarifs publics par défaut */}
        <Section
          icon={Euro}
          accent="amber"
          title="Tarifs publics par défaut"
          subtitle="Tarifs appliqués automatiquement aux nouvelles sessions selon leur configuration (INTER / INTRA × Présentiel / Distanciel)."
          href="/parametres/tarification"
          actionLabel="Modifier"
        >
          {defaults ? (
            <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <Th>Type</Th>
                    <Th>Modalité</Th>
                    <Th align="right">Tarif</Th>
                    <Th>Note</Th>
                  </tr>
                </thead>
                <tbody>
                  <Row>
                    <td className="px-3 py-2">
                      <Badge color="cyan">INTER</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <ModalityBadge modality="presentiel" />
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {fmt(defaults.inter_presentiel_per_day_ht)}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      HT / jour / apprenant
                    </td>
                  </Row>
                  <Row>
                    <td className="px-3 py-2">
                      <Badge color="cyan">INTER</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <ModalityBadge modality="distanciel" />
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {fmt(defaults.inter_distanciel_per_day_ht)}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      HT / jour / apprenant
                    </td>
                  </Row>
                  <Row>
                    <td className="px-3 py-2">
                      <Badge color="amber">INTRA</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <ModalityBadge modality="presentiel" />
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {fmt(defaults.intra_presentiel_forfait_ht)}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      Forfait HT / jour (jusqu&apos;à{" "}
                      {defaults.intra_forfait_threshold} apprenants), puis{" "}
                      {fmt(defaults.intra_presentiel_extra_per_day_ht)} /
                      apprenant supplémentaire / jour
                    </td>
                  </Row>
                  <Row>
                    <td className="px-3 py-2">
                      <Badge color="amber">INTRA</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <ModalityBadge modality="distanciel" />
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {fmt(defaults.intra_distanciel_forfait_ht)}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      Forfait HT / jour (jusqu&apos;à{" "}
                      {defaults.intra_forfait_threshold} apprenants), puis{" "}
                      {fmt(defaults.intra_distanciel_extra_per_day_ht)} /
                      apprenant supplémentaire / jour
                    </td>
                  </Row>
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Tarifs par défaut non configurés.</Empty>
          )}
        </Section>

        {/* 2) Catalogue formations */}
        <Section
          icon={BookOpen}
          accent="violet"
          title="Catalogue formations"
          subtitle={`Prix publics par formation (${formations.length} formation${formations.length > 1 ? "s" : ""} active${formations.length > 1 ? "s" : ""}).`}
          href="/formations"
          actionLabel="Gérer les formations"
        >
          {formations.length === 0 ? (
            <Empty>Aucune formation active.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <Th>Formation</Th>
                    <Th>Modalité</Th>
                    <Th align="right">Durée</Th>
                    <Th align="right">Prix public</Th>
                    <Th align="right">Entreprise</Th>
                    <Th align="right">Particulier</Th>
                    <Th align="right">Indép.</Th>
                  </tr>
                </thead>
                <tbody>
                  {formations.map((f) => (
                    <Row key={f.id}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/formations/${f.id}`}
                          className="font-medium text-zinc-800 hover:text-violet-700 hover:underline"
                        >
                          {f.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <ModalityBadge modality={f.modality} />
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-zinc-600 tabular-nums">
                        {f.duration_days
                          ? `${f.duration_days} j`
                          : f.duration_hours
                            ? `${f.duration_hours} h`
                            : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">
                        {fmt(f.public_price_excl_tax)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {fmt(f.price_company)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {fmt(f.price_individual)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {fmt(f.price_independent)}
                      </td>
                    </Row>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* 3) Partenaires OF */}
        <Section
          icon={Handshake}
          accent="cyan"
          title="OF partenaires"
          subtitle={
            ofPartners.length > 0
              ? `Forfait HT par apprenant pour l'accès aux quiz pré/post (${ofPartners.length} OF partenaire${ofPartners.length > 1 ? "s" : ""}).`
              : "Aucun OF partenaire configuré."
          }
          href="/entreprises"
          actionLabel="Gérer les entreprises"
        >
          {ofPartners.length === 0 ? (
            <Empty>Aucun OF partenaire avec tarif configuré.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <Th>Organisme de formation</Th>
                    <Th align="right">Forfait quiz HT / apprenant</Th>
                  </tr>
                </thead>
                <tbody>
                  {ofPartners.map((p) => (
                    <Row key={p.id}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/entreprises/${p.id}`}
                          className="font-medium text-zinc-800 hover:text-cyan-700 hover:underline inline-flex items-center gap-1.5"
                        >
                          <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.partner_quiz_unit_price_ht !== null ? (
                          <span className="font-bold text-emerald-700 tabular-nums">
                            {fmt(p.partner_quiz_unit_price_ht)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">
                            Non défini
                          </span>
                        )}
                      </td>
                    </Row>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* 4) Prescripteurs */}
        <Section
          icon={Handshake}
          accent="indigo"
          title="Prescripteurs"
          subtitle={
            prescripteurs.length > 0
              ? `Tarif HT par jour et par apprenant, différencié par modalité (${prescripteurs.length} prescripteur${prescripteurs.length > 1 ? "s" : ""}).`
              : "Aucun prescripteur configuré."
          }
          href="/entreprises"
          actionLabel="Gérer les entreprises"
        >
          {prescripteurs.length === 0 ? (
            <Empty>Aucun prescripteur avec tarif configuré.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <Th>Prescripteur</Th>
                    <Th align="right">Tarif jour DISTANCIEL</Th>
                    <Th align="right">Tarif jour PRÉSENTIEL</Th>
                  </tr>
                </thead>
                <tbody>
                  {prescripteurs.map((p) => (
                    <Row key={p.id}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/entreprises/${p.id}`}
                          className="font-medium text-zinc-800 hover:text-indigo-700 hover:underline inline-flex items-center gap-1.5"
                        >
                          <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.partner_daily_rate_distanciel_ht !== null ? (
                          <span className="font-bold text-cyan-700 tabular-nums">
                            {fmt(p.partner_daily_rate_distanciel_ht)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">
                            Non défini
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.partner_daily_rate_presentiel_ht !== null ? (
                          <span className="font-bold text-emerald-700 tabular-nums">
                            {fmt(p.partner_daily_rate_presentiel_ht)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">
                            Non défini
                          </span>
                        )}
                      </td>
                    </Row>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* 5) Tarifs spécifiques (overrides) */}
        <Section
          icon={Tag}
          accent="rose"
          title="Tarifs spécifiques par formation"
          subtitle={
            overrides.length > 0
              ? `Overrides qui remplacent le calcul automatique pour un partenaire et une formation précise (${overrides.length} ligne${overrides.length > 1 ? "s" : ""}).`
              : "Aucun tarif spécifique défini."
          }
          href="/entreprises"
          actionLabel="Gérer les entreprises"
        >
          {overrides.length === 0 ? (
            <Empty>Aucun tarif spécifique négocié.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <Th>Partenaire</Th>
                    <Th>Type</Th>
                    <Th>Formation</Th>
                    <Th>Modalité</Th>
                    <Th align="right">Prix HT</Th>
                    <Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((o) => (
                    <Row key={`${o.company_id}-${o.formation_id}`}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/entreprises/${o.company_id}`}
                          className="font-medium text-zinc-800 hover:text-rose-700 hover:underline"
                        >
                          {o.company_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {o.company_type === "of" ? (
                          <Badge color="cyan">OF</Badge>
                        ) : o.company_type === "prescripteur" ? (
                          <Badge color="indigo">Prescripteur</Badge>
                        ) : (
                          <span className="text-xs text-zinc-500">
                            {o.company_type}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">
                        {o.formation_title}
                      </td>
                      <td className="px-3 py-2">
                        <ModalityBadge modality={o.formation_modality} />
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-rose-700 tabular-nums">
                        {fmt(o.unit_price_ht)}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-600">
                        {o.notes ?? ""}
                      </td>
                    </Row>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

// ============================================================
// Composants helpers de présentation
// ============================================================

function Section({
  icon: Icon,
  accent,
  title,
  subtitle,
  href,
  actionLabel,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: "amber" | "violet" | "cyan" | "indigo" | "rose";
  title: string;
  subtitle: string;
  href?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  const accentClass = {
    amber: "text-amber-600 bg-amber-50 border-amber-200",
    violet: "text-violet-600 bg-violet-50 border-violet-200",
    cyan: "text-cyan-600 bg-cyan-50 border-cyan-200",
    indigo: "text-indigo-600 bg-indigo-50 border-indigo-200",
    rose: "text-rose-600 bg-rose-50 border-rose-200",
  }[accent];
  return (
    <section className="space-y-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 h-10 w-10 rounded-lg border flex items-center justify-center ${accentClass}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
            <p className="text-sm text-zinc-600">{subtitle}</p>
          </div>
        </div>
        {href && actionLabel && (
          <Link
            href={href}
            className="shrink-0 text-xs text-zinc-600 hover:text-zinc-900 hover:underline"
          >
            {actionLabel} →
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-zinc-600 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-t border-zinc-200 hover:bg-zinc-50/40">
      {children}
    </tr>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-zinc-50 border border-zinc-200 p-4 text-center text-xs text-zinc-500 italic">
      {children}
    </div>
  );
}

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "cyan" | "amber" | "indigo" | "rose" | "violet";
}) {
  const cls = {
    cyan: "bg-cyan-100 text-cyan-700 border-cyan-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
    rose: "bg-rose-100 text-rose-700 border-rose-200",
    violet: "bg-violet-100 text-violet-700 border-violet-200",
  }[color];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${cls}`}
    >
      {children}
    </span>
  );
}

function ModalityBadge({ modality }: { modality: string | null }) {
  if (modality === "presentiel") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
        <MapPin className="h-3 w-3" />
        Présentiel
      </span>
    );
  }
  if (modality === "distanciel") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold uppercase tracking-wider">
        <Globe className="h-3 w-3" />
        Distanciel
      </span>
    );
  }
  if (modality === "hybride") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase tracking-wider">
        <Globe className="h-3 w-3" />
        Hybride
      </span>
    );
  }
  return <span className="text-xs text-zinc-400">—</span>;
}
