import Link from "next/link";
import {
  Accessibility,
  AlertTriangle,
  Building2,
  CheckCircle2,
  MapPin,
  Plus,
  Video,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  LOCATION_KIND_BADGE_CLASSES,
  LOCATION_KIND_LABELS,
  PMR_LEVEL_BADGE_CLASSES,
  PMR_LEVEL_LABELS,
  type FormationLocation,
  type LocationKind,
  type PmrLevel,
} from "@/lib/locations/types";

type SearchParams = {
  q?: string;
  kind?: LocationKind | "";
  pmr?: PmrLevel | "";
  active?: string;
};

function escapeForIlike(value: string) {
  return value.replace(/[%_,()]/g, " ").trim();
}

export default async function LocationsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const kindFilter = params.kind ?? "";
  const pmrFilter = params.pmr ?? "";
  const activeFilter = params.active ?? "";
  const isFiltered =
    Boolean(q) ||
    kindFilter !== "" ||
    pmrFilter !== "" ||
    activeFilter !== "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [totalCount, activeCount, pmrOkCount, visioCount, toVerifyCount] =
    await Promise.all([
      supabase
        .from("formation_locations")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("formation_locations")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("formation_locations")
        .select("id", { count: "exact", head: true })
        .eq("pmr_accessible", "oui"),
      supabase
        .from("formation_locations")
        .select("id", { count: "exact", head: true })
        .eq("kind", "visio"),
      supabase
        .from("formation_locations")
        .select("id", { count: "exact", head: true })
        .eq("pmr_accessible", "a_verifier"),
    ]);

  let query = supabase
    .from("formation_locations")
    .select("*")
    .order("name", { ascending: true });

  if (q) {
    const safe = escapeForIlike(q);
    if (safe.length > 0) {
      query = query.or(
        `name.ilike.%${safe}%,city.ilike.%${safe}%,address.ilike.%${safe}%,contact_name.ilike.%${safe}%`,
      );
    }
  }
  if (kindFilter) query = query.eq("kind", kindFilter);
  if (pmrFilter) query = query.eq("pmr_accessible", pmrFilter);
  if (activeFilter === "yes") query = query.eq("is_active", true);
  if (activeFilter === "no") query = query.eq("is_active", false);

  const { data: locations, error } = await query;

  const stats = [
    {
      label: "Total",
      value: totalCount.count ?? 0,
      accent:
        "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800",
      icon: Building2,
      iconClass: "text-slate-600 dark:text-slate-400",
      href: "/lieux",
      active: !isFiltered,
    },
    {
      label: "Actifs",
      value: activeCount.count ?? 0,
      accent:
        "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-900",
      icon: CheckCircle2,
      iconClass: "text-cyan-600 dark:text-cyan-400",
      href: "/lieux?active=yes",
      active: activeFilter === "yes",
    },
    {
      label: "PMR OK",
      value: pmrOkCount.count ?? 0,
      accent:
        "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
      icon: Accessibility,
      iconClass: "text-blue-600 dark:text-blue-400",
      href: "/lieux?pmr=oui",
      active: pmrFilter === "oui",
    },
    {
      label: "Visio",
      value: visioCount.count ?? 0,
      accent:
        "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900",
      icon: Video,
      iconClass: "text-violet-600 dark:text-violet-400",
      href: "/lieux?kind=visio",
      active: kindFilter === "visio",
    },
    {
      label: "À vérifier",
      value: toVerifyCount.count ?? 0,
      accent:
        "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
      icon: AlertTriangle,
      iconClass: "text-amber-600 dark:text-amber-400",
      href: "/lieux?pmr=a_verifier",
      active: pmrFilter === "a_verifier",
    },
  ];

  return (
    <>
      <PageHeader
        title="Lieux de formation"
        description="Référentiel des salles, locaux clients et visioconférences. Conforme aux exigences Qualiopi (indicateurs 19 et 22)."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Lieux" },
        ]}
        actions={
          <Button nativeButton={false} render={<Link href="/lieux/new" />}>
            <Plus className="h-4 w-4" />
            Nouveau lieu
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={cn(
                "rounded-xl border p-4 transition-all hover:shadow-sm",
                s.accent,
                s.active
                  ? "ring-2 ring-slate-900 dark:ring-white shadow-sm"
                  : "opacity-90 hover:opacity-100",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {s.label}
                  </p>
                  <p className="text-2xl font-bold mt-1 tabular-nums">
                    {s.value}
                  </p>
                </div>
                <s.icon className={cn("h-5 w-5 shrink-0", s.iconClass)} />
              </div>
            </Link>
          ))}
        </div>

        <form
          method="get"
          className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3"
        >
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] items-end">
            <div className="space-y-1.5">
              <Label htmlFor="q" className="text-xs">
                Rechercher
              </Label>
              <Input
                id="q"
                name="q"
                type="search"
                placeholder="Nom, ville, adresse, contact…"
                defaultValue={q}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kind" className="text-xs">
                Type
              </Label>
              <select
                id="kind"
                name="kind"
                defaultValue={kindFilter}
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                <option value="">Tous</option>
                {Object.entries(LOCATION_KIND_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pmr" className="text-xs">
                PMR
              </Label>
              <select
                id="pmr"
                name="pmr"
                defaultValue={pmrFilter}
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                <option value="">Tous</option>
                {Object.entries(PMR_LEVEL_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="active" className="text-xs">
                État
              </Label>
              <select
                id="active"
                name="active"
                defaultValue={activeFilter}
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                <option value="">Tous</option>
                <option value="yes">Actifs</option>
                <option value="no">Inactifs</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Filtrer</Button>
              {isFiltered && (
                <Button
                  type="button"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/lieux" />}
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </form>

        {error ? (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            Erreur lors du chargement : {error.message}
          </div>
        ) : !locations || locations.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-12 text-center">
            <MapPin className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
            {isFiltered ? (
              <>
                <p className="text-sm font-medium mb-1">Aucun résultat</p>
                <p className="text-xs text-slate-500 mb-4">
                  Aucun lieu ne correspond à votre recherche.
                </p>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/lieux" />}
                >
                  Réinitialiser les filtres
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">Aucun lieu enregistré</p>
                <p className="text-xs text-slate-500 mb-4">
                  Ajoutez votre première salle de formation ou un lien de visio.
                </p>
                <Button
                  nativeButton={false}
                  render={<Link href="/lieux/new" />}
                >
                  <Plus className="h-4 w-4" />
                  Nouveau lieu
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 px-1">
              {locations.length} lieu{locations.length > 1 ? "x" : ""}
              {isFiltered
                ? " (filtré" + (locations.length > 1 ? "s" : "") + ")"
                : ""}
            </p>
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Nom</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Ville</th>
                    <th className="px-4 py-3 text-right">Capacité</th>
                    <th className="px-4 py-3">PMR</th>
                    <th className="px-4 py-3">Vérifié le</th>
                    <th className="px-4 py-3">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(locations as FormationLocation[]).map((l) => (
                    <tr
                      key={l.id}
                      className={cn(
                        "transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50",
                        !l.is_active && "opacity-60",
                      )}
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/lieux/${l.id}`}
                          className="hover:underline"
                        >
                          {l.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                            LOCATION_KIND_BADGE_CLASSES[l.kind],
                          )}
                        >
                          {LOCATION_KIND_LABELS[l.kind]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {l.city ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                        {l.capacity ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                            PMR_LEVEL_BADGE_CLASSES[l.pmr_accessible],
                          )}
                        >
                          {PMR_LEVEL_LABELS[l.pmr_accessible]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {l.last_verified_at
                          ? new Date(l.last_verified_at).toLocaleDateString(
                              "fr-FR",
                            )
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {l.is_active ? (
                          <span className="text-xs text-cyan-600 dark:text-cyan-400">
                            ● Actif
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            ○ Inactif
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
