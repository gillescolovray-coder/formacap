import { Euro, Eye, Info, Save } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParametresNav } from "../_nav";
import { updatePricingDefaults } from "./actions";

type PricingDefaults = {
  inter_presentiel_per_day_ht: number;
  inter_distanciel_per_day_ht: number;
  intra_presentiel_forfait_ht: number;
  intra_presentiel_extra_per_day_ht: number;
  intra_distanciel_forfait_ht: number;
  intra_distanciel_extra_per_day_ht: number;
  intra_forfait_threshold: number;
  // Tarifs par défaut partenaires (Gilles 2026-05-22 — Option A)
  partner_of_distanciel_per_day_ht: number | null;
  partner_of_presentiel_per_day_ht: number | null;
  partner_prescripteur_distanciel_per_day_ht: number | null;
  partner_prescripteur_presentiel_per_day_ht: number | null;
};

export default async function PricingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const query = await searchParams;
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

  // Chargement des tarifs actuels (créés automatiquement par la migration
  // 0063 — backfill). On retombe sur les défauts CAP NUMERIQUE si jamais
  // la ligne n'existe pas (sécurité défensive).
  const { data: defaults } = await supabase
    .from("organization_pricing_defaults")
    .select(
      "inter_presentiel_per_day_ht, inter_distanciel_per_day_ht, intra_presentiel_forfait_ht, intra_presentiel_extra_per_day_ht, intra_distanciel_forfait_ht, intra_distanciel_extra_per_day_ht, intra_forfait_threshold, partner_of_distanciel_per_day_ht, partner_of_presentiel_per_day_ht, partner_prescripteur_distanciel_per_day_ht, partner_prescripteur_presentiel_per_day_ht",
    )
    .eq("organization_id", orgId)
    .maybeSingle<PricingDefaults>();
  const d: PricingDefaults = defaults ?? {
    inter_presentiel_per_day_ht: 340,
    inter_distanciel_per_day_ht: 305,
    intra_presentiel_forfait_ht: 1250,
    intra_presentiel_extra_per_day_ht: 175,
    intra_distanciel_forfait_ht: 990,
    intra_distanciel_extra_per_day_ht: 150,
    intra_forfait_threshold: 4,
    partner_of_distanciel_per_day_ht: null,
    partner_of_presentiel_per_day_ht: null,
    partner_prescripteur_distanciel_per_day_ht: null,
    partner_prescripteur_presentiel_per_day_ht: null,
  };

  return (
    <>
      <PageHeader
        title="Tarification par défaut"
        description="Tarifs publics par défaut appliqués aux nouvelles sessions"
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres/organisation" },
          { label: "Tarification" },
        ]}
      />
      <ParametresNav />

      <div className="p-8 max-w-4xl space-y-6">
        {query.updated && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
            ✓ Tarifs enregistrés. Ils s&apos;appliqueront aux nouvelles
            sessions. Les sessions déjà créées gardent les tarifs au moment
            de leur création.
          </div>
        )}
        {query.error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {query.error}
          </div>
        )}

        <div className="rounded-xl bg-cyan-50/50 border border-cyan-200 p-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-cyan-700 shrink-0 mt-0.5" />
          <p className="text-xs text-cyan-900 leading-relaxed">
            Ces 6 tarifs sont <strong>les tarifs publics par défaut</strong>{" "}
            de votre organisation. À la création d&apos;une session, l&apos;app
            utilise automatiquement le tarif correspondant au couple{" "}
            <em>(INTER/INTRA × Présentiel/Distanciel)</em>. Vous pouvez
            ensuite ajuster le tarif au cas par cas sur chaque session,
            et même par inscription (négociation commerciale).
          </p>
        </div>

        <form action={updatePricingDefaults} className="space-y-6">
          {/* ===== INTER ===== */}
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Euro className="h-5 w-5 text-cyan-700" />
              <h2 className="text-base font-bold">
                Sessions INTER (ouvertes à plusieurs entreprises)
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Tarification <strong>par apprenant et par jour</strong>.
              Total = prix unitaire × nb apprenants × nb jours.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <PriceField
                name="inter_presentiel_per_day_ht"
                label="Présentiel — prix par jour et par apprenant"
                defaultValue={d.inter_presentiel_per_day_ht}
                hint="Tarif public CAP NUMÉRIQUE : 340 € HT"
              />
              <PriceField
                name="inter_distanciel_per_day_ht"
                label="Distanciel — prix par jour et par apprenant"
                defaultValue={d.inter_distanciel_per_day_ht}
                hint="Tarif public CAP NUMÉRIQUE : 305 € HT"
              />
            </div>
          </section>

          {/* ===== INTRA ===== */}
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Euro className="h-5 w-5 text-amber-700" />
              <h2 className="text-base font-bold">
                Sessions INTRA (dédiées à une entreprise)
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Tarification <strong>forfaitaire à la journée</strong> jusqu&apos;à
              un certain seuil d&apos;apprenants, puis tarif par apprenant
              supplémentaire au-delà.
            </p>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] items-end">
              <PriceField
                name="intra_presentiel_forfait_ht"
                label="Présentiel — forfait par jour"
                defaultValue={d.intra_presentiel_forfait_ht}
                hint="Tarif public : 1 250 € HT"
              />
              <PriceField
                name="intra_presentiel_extra_per_day_ht"
                label="Présentiel — apprenant suppl. / jour"
                defaultValue={d.intra_presentiel_extra_per_day_ht}
                hint="Tarif public : 175 € HT"
              />
              <div className="space-y-1.5">
                <Label htmlFor="intra_forfait_threshold" className="text-xs">
                  Seuil forfait
                </Label>
                <Input
                  id="intra_forfait_threshold"
                  name="intra_forfait_threshold"
                  type="number"
                  min={1}
                  defaultValue={d.intra_forfait_threshold}
                  className="text-center"
                />
                <p className="text-[10px] text-slate-500 leading-tight">
                  Nb apprenants inclus dans le forfait. Au-delà, on
                  facture l&apos;extra.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <PriceField
                name="intra_distanciel_forfait_ht"
                label="Distanciel — forfait par jour"
                defaultValue={d.intra_distanciel_forfait_ht}
                hint="Tarif public : 990 € HT"
              />
              <PriceField
                name="intra_distanciel_extra_per_day_ht"
                label="Distanciel — apprenant suppl. / jour"
                defaultValue={d.intra_distanciel_extra_per_day_ht}
                hint="Tarif public : 150 € HT"
              />
            </div>
          </section>

          {/* ===== OF PARTENAIRES ===== */}
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Euro className="h-5 w-5 text-indigo-700" />
              <h2 className="text-base font-bold">
                Tarif par défaut OF partenaires
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Tarif HT <strong>par apprenant et par jour</strong> appliqué
              automatiquement à tous les <strong>OF partenaires</strong> qui
              n&apos;ont pas de tarif spécifique sur leur fiche entreprise.
              Laissez vide pour forcer la saisie manuelle sur chaque société.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <PriceField
                name="partner_of_distanciel_per_day_ht"
                label="Distanciel — prix par jour / apprenant"
                defaultValue={d.partner_of_distanciel_per_day_ht ?? 0}
                hint="Ex. 60 € HT — laissez 0 pour désactiver le défaut"
              />
              <PriceField
                name="partner_of_presentiel_per_day_ht"
                label="Présentiel — prix par jour / apprenant"
                defaultValue={d.partner_of_presentiel_per_day_ht ?? 0}
                hint="Ex. 80 € HT — laissez 0 pour désactiver le défaut"
              />
            </div>
          </section>

          {/* ===== PRESCRIPTEURS ===== */}
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Euro className="h-5 w-5 text-fuchsia-700" />
              <h2 className="text-base font-bold">
                Tarif par défaut prescripteurs
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Tarif HT <strong>par apprenant et par jour</strong> appliqué
              automatiquement à tous les <strong>prescripteurs</strong> qui
              n&apos;ont pas de tarif spécifique sur leur fiche entreprise.
              Laissez vide pour forcer la saisie manuelle sur chaque société.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <PriceField
                name="partner_prescripteur_distanciel_per_day_ht"
                label="Distanciel — prix par jour / apprenant"
                defaultValue={d.partner_prescripteur_distanciel_per_day_ht ?? 0}
                hint="Ex. 250 € HT — laissez 0 pour désactiver le défaut"
              />
              <PriceField
                name="partner_prescripteur_presentiel_per_day_ht"
                label="Présentiel — prix par jour / apprenant"
                defaultValue={d.partner_prescripteur_presentiel_per_day_ht ?? 0}
                hint="Ex. 280 € HT — laissez 0 pour désactiver le défaut"
              />
            </div>
          </section>

          <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Eye className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed">
                Besoin de voir <strong>tous les tarifs</strong> (publics,
                catalogue, OF partenaires, prescripteurs, surcharges) sur
                une même page de synthèse ?
              </p>
            </div>
            <Link
              href="/parametres/tarification/vue-globale"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-amber-300 bg-white text-amber-800 text-sm font-medium hover:bg-amber-100"
            >
              <Eye className="h-4 w-4" />
              Vue d&apos;ensemble des tarifications
            </Link>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit">
              <Save className="h-4 w-4" />
              Enregistrer les tarifs
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

function PriceField({
  name,
  label,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          type="number"
          step="0.01"
          min={0}
          defaultValue={defaultValue}
          className="pr-14"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
          € HT
        </span>
      </div>
      {hint && (
        <p className="text-[10px] text-slate-500 italic leading-tight">
          {hint}
        </p>
      )}
    </div>
  );
}
