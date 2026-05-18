import Link from "next/link";
import {
  Archive,
  Building2,
  FileText,
  GraduationCap,
  Layers,
  Plus,
  Tag,
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
  MODALITY_BADGE_CLASSES,
  MODALITY_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  STATUS_ROW_CLASSES,
  categoryColor,
  type Formation,
  type FormationCategory,
  type FormationModality,
  type FormationStatus,
} from "@/lib/formations/types";

const MODALITY_ICONS: Record<FormationModality, typeof Building2> = {
  presentiel: Building2,
  distanciel: Video,
  hybride: Layers,
};

type SearchParams = {
  q?: string;
  status?: FormationStatus | "";
  modality?: FormationModality | "";
  category_id?: string;
  show_archived?: string;
};

function escapeForIlike(value: string) {
  return value.replace(/[%_,()]/g, " ").trim();
}

function buildQueryString(
  base: Partial<SearchParams>,
  override: Partial<SearchParams>,
) {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...base, ...override })) {
    if (v !== undefined && v !== "") merged[k] = String(v);
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `?${qs}` : "";
}

export default async function FormationsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const statusFilter = params.status ?? "";
  const modalityFilter = params.modality ?? "";
  const categoryFilter = params.category_id ?? "";
  const showArchived = params.show_archived === "1";
  const isFiltered =
    Boolean(q) ||
    statusFilter !== "" ||
    modalityFilter !== "" ||
    categoryFilter !== "" ||
    showArchived;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: categories },
    totalCount,
    publishedCount,
    draftCount,
    archivedCount,
  ] = await Promise.all([
    supabase
      .from("formation_categories")
      .select("*")
      .order("name", { ascending: true }),
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

  let query = supabase
    .from("formations")
    .select("*, category:formation_categories(id, name)")
    .order("title", { ascending: true });

  if (q) {
    const safe = escapeForIlike(q);
    if (safe.length > 0) {
      query = query.or(
        `title.ilike.%${safe}%,internal_code.ilike.%${safe}%,description.ilike.%${safe}%`,
      );
    }
  }
  if (statusFilter) {
    query = query.eq("status", statusFilter);
  } else if (!showArchived) {
    // Par défaut on masque les archivées (sauf si statusFilter === "archived"
    // où l'utilisateur les demande explicitement via la carte stat)
    query = query.neq("status", "archived");
  }
  if (modalityFilter) query = query.eq("modality", modalityFilter);
  if (categoryFilter) query = query.eq("category_id", categoryFilter);

  const { data: formations, error } = await query;
  const cats = (categories ?? []) as FormationCategory[];

  const stats = [
    {
      label: "Total",
      value: totalCount.count ?? 0,
      accent:
        "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800",
      icon: GraduationCap,
      iconClass: "text-zinc-600 dark:text-zinc-400",
      href: "/formations",
      active: statusFilter === "",
    },
    {
      label: "Publiées",
      value: publishedCount.count ?? 0,
      accent:
        "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-900",
      icon: GraduationCap,
      iconClass: "text-cyan-600 dark:text-cyan-400",
      href: "/formations?status=published",
      active: statusFilter === "published",
    },
    {
      label: "Brouillons",
      value: draftCount.count ?? 0,
      accent:
        "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
      icon: FileText,
      iconClass: "text-amber-600 dark:text-amber-400",
      href: "/formations?status=draft",
      active: statusFilter === "draft",
    },
    {
      label: "Archivées",
      value: archivedCount.count ?? 0,
      accent:
        "bg-zinc-100 dark:bg-zinc-800/50 border-zinc-300 dark:border-zinc-700",
      icon: Archive,
      iconClass: "text-zinc-500 dark:text-zinc-500",
      href: "/formations?status=archived",
      active: statusFilter === "archived",
    },
  ];

  return (
    <>
      <PageHeader
        title="Catalogue des formations"
        description="Fiches formation utilisables pour planifier des sessions."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Catalogue" },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/formations/categories" />}
            >
              <Tag className="h-4 w-4" />
              Catégories
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/formations/new" />}
            >
              <Plus className="h-4 w-4" />
              Nouvelle formation
            </Button>
          </>
        }
      />

      <div className="p-8 space-y-6">
        {/* Stat cards cliquables */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={cn(
                "rounded-xl border p-4 transition-all hover:shadow-sm",
                s.accent,
                s.active
                  ? "ring-2 ring-zinc-900 dark:ring-white shadow-sm"
                  : "opacity-90 hover:opacity-100",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
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

        {/* Recherche */}
        <form
          method="get"
          className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
        >
          <input type="hidden" name="status" value={statusFilter} />
          {showArchived && (
            <input type="hidden" name="show_archived" value="1" />
          )}
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto] items-end">
            <div className="space-y-1.5">
              <Label htmlFor="q" className="text-xs">
                Rechercher
              </Label>
              <Input
                id="q"
                name="q"
                type="search"
                placeholder="Titre, code, description…"
                defaultValue={q}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modality" className="text-xs">
                Modalité
              </Label>
              <select
                id="modality"
                name="modality"
                defaultValue={modalityFilter}
                className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              >
                <option value="">Toutes</option>
                {(
                  Object.keys(MODALITY_LABELS) as Array<keyof typeof MODALITY_LABELS>
                ).map((key) => (
                  <option key={key} value={key}>
                    {MODALITY_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Filtrer</Button>
              {isFiltered && (
                <Button
                  type="button"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/formations" />}
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>

          {/* Toggle afficher archivées */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                name="show_archived"
                value="1"
                defaultChecked={showArchived}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <span className="text-zinc-600 dark:text-zinc-400">
                Afficher les formations archivées
              </span>
            </label>
            {!showArchived && statusFilter !== "archived" && (
              <span className="text-xs text-zinc-400">
                Les formations archivées sont masquées par défaut
              </span>
            )}
          </div>

          {/* Chips catégories */}
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <Link
                href={`/formations${buildQueryString(params, { category_id: "" })}`}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  categoryFilter === ""
                    ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white"
                    : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 hover:border-zinc-500",
                )}
              >
                Toutes catégories
              </Link>
              {cats.map((c) => {
                const cc = categoryColor(c.name);
                const isSelected = categoryFilter === c.id;
                return (
                  <Link
                    key={c.id}
                    href={`/formations${buildQueryString(params, { category_id: c.id })}`}
                    className={cn(
                      "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-all",
                      isSelected
                        ? cn(
                            cc.bg,
                            cc.text,
                            cc.border,
                            "ring-2 ring-offset-1 ring-zinc-900 dark:ring-white shadow-sm",
                          )
                        : cn(
                            "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700",
                            cc.text,
                            "hover:" + cc.bg.split(" ")[0],
                            "hover:" + cc.border.split(" ")[0],
                          ),
                    )}
                  >
                    <Tag className="h-3 w-3" />
                    {c.name}
                  </Link>
                );
              })}
            </div>
          )}
        </form>

        {/* Résultats */}
        {error ? (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            Erreur lors du chargement : {error.message}
          </div>
        ) : !formations || formations.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
            {isFiltered ? (
              <>
                <p className="text-sm font-medium mb-1">Aucun résultat</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Aucune formation ne correspond à votre recherche.
                </p>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/formations" />}
                >
                  Réinitialiser les filtres
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">Catalogue vide</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Créez votre première fiche formation pour démarrer.
                </p>
                <Button
                  nativeButton={false}
                  render={<Link href="/formations/new" />}
                >
                  <Plus className="h-4 w-4" />
                  Créer ma première formation
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 px-1">
              {formations.length} formation{formations.length > 1 ? "s" : ""}
              {isFiltered
                ? " (filtrée" + (formations.length > 1 ? "s" : "") + ")"
                : ""}
            </p>
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Intitulé</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Catégorie</th>
                    <th className="px-4 py-3 text-right">Jours</th>
                    <th className="px-4 py-3 text-right">Heures</th>
                    <th className="px-4 py-3">Modalité</th>
                    <th className="px-4 py-3 text-right">Tarif HT</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {(formations as Formation[]).map((f) => {
                    const catColor = categoryColor(f.category?.name);
                    const ModalityIcon = f.modality
                      ? MODALITY_ICONS[f.modality]
                      : null;
                    return (
                      <tr
                        key={f.id}
                        className={cn(
                          "transition-colors",
                          STATUS_ROW_CLASSES[f.status],
                        )}
                      >
                        <td className="px-4 py-3 font-medium">
                          <Link
                            href={`/formations/${f.id}`}
                            className="hover:underline"
                          >
                            {f.title}
                          </Link>
                          {f.subtitle && (
                            <p className="text-[11px] text-zinc-500 font-normal mt-0.5 line-clamp-1">
                              {f.subtitle}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {f.internal_code ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-mono text-[11px] font-semibold">
                              {f.internal_code}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {f.category?.name ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap",
                                catColor.bg,
                                catColor.text,
                                catColor.border,
                              )}
                            >
                              <Tag className="h-3 w-3" />
                              {f.category.name}
                            </span>
                          ) : (
                            <span className="text-zinc-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                          {f.duration_days ? (
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                              {f.duration_days}{" "}
                              <span className="text-xs text-zinc-400 font-normal">
                                j
                              </span>
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                          {f.duration_hours ? (
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                              {f.duration_hours}{" "}
                              <span className="text-xs text-zinc-400 font-normal">
                                h
                              </span>
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {f.modality && ModalityIcon ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                                MODALITY_BADGE_CLASSES[f.modality],
                              )}
                            >
                              <ModalityIcon className="h-3 w-3" />
                              {MODALITY_LABELS[f.modality]}
                            </span>
                          ) : (
                            <span className="text-zinc-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                          {f.public_price_excl_tax !== null ? (
                            <span className="font-bold text-zinc-900 dark:text-zinc-100">
                              {Number(f.public_price_excl_tax).toLocaleString(
                                "fr-FR",
                                { minimumFractionDigits: 2 },
                              )}{" "}
                              <span className="text-xs text-zinc-400 font-normal">
                                €
                              </span>
                            </span>
                          ) : f.pricing_note ? (
                            <span className="text-xs italic text-zinc-500">
                              {f.pricing_note}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                          {f.is_cpf_eligible && (
                            <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 align-middle">
                              CPF
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                              STATUS_BADGE_CLASSES[f.status],
                            )}
                          >
                            {STATUS_LABELS[f.status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
