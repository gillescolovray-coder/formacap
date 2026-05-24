import Link from "next/link";
import {
  Building2,
  CircleSlash,
  Mail,
  Phone,
  Plus,
  Smartphone,
  UserCircle,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Learner } from "@/lib/learners/types";
import type { Company } from "@/lib/companies/types";

type SearchParams = {
  q?: string;
  company_id?: string;
  active?: string;
};

function escapeForIlike(value: string) {
  return value.replace(/[%_,()]/g, " ").trim();
}

export default async function LearnersListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const companyFilter = params.company_id ?? "";
  const activeFilter = params.active ?? "";
  const isFiltered = Boolean(q) || companyFilter !== "" || activeFilter !== "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .order("name", { ascending: true });

  // Exclure les apprenants temporaires (saisie express sous-traitance)
  // tant qu'ils ne sont pas promus. Migration 0104, Gilles 2026-05-24.
  let query = supabase
    .from("learners")
    .select("*, company:companies(id, name)")
    .eq("is_temporary", false)
    .order("updated_at", { ascending: false });

  if (q) {
    const safe = escapeForIlike(q);
    if (safe.length > 0) {
      query = query.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,city.ilike.%${safe}%`,
      );
    }
  }
  if (companyFilter) {
    if (companyFilter === "none") {
      query = query.is("company_id", null);
    } else {
      query = query.eq("company_id", companyFilter);
    }
  }
  if (activeFilter === "yes") query = query.eq("is_active", true);
  if (activeFilter === "no") query = query.eq("is_active", false);

  const { data: learners, error } = await query;

  // Compteurs globaux pour les stat cards
  const [
    { count: totalCount },
    { count: activeCount },
    { count: inactiveCount },
    { count: companyCount },
    { count: privateCount },
  ] = await Promise.all([
    supabase
      .from("learners")
      .select("id", { count: "exact", head: true })
      .eq("is_temporary", false),
    supabase
      .from("learners")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_temporary", false),
    supabase
      .from("learners")
      .select("id", { count: "exact", head: true })
      .eq("is_active", false)
      .eq("is_temporary", false),
    supabase
      .from("learners")
      .select("id", { count: "exact", head: true })
      .not("company_id", "is", null)
      .eq("is_temporary", false),
    supabase
      .from("learners")
      .select("id", { count: "exact", head: true })
      .is("company_id", null)
      .eq("is_temporary", false),
  ]);

  function statCardClass(active: boolean, accent: string) {
    return cn(
      "rounded-xl border p-4 transition-all hover:shadow-sm",
      active
        ? "ring-2 ring-zinc-900 dark:ring-white border-zinc-900 dark:border-white"
        : "border-zinc-200 dark:border-zinc-800 opacity-90 hover:opacity-100",
      accent,
    );
  }

  return (
    <>
      <PageHeader
        title="Apprenants"
        description="Personnes formées par votre organisme."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Apprenants" },
        ]}
        actions={
          <Button nativeButton={false} render={<Link href="/apprenants/new" />}>
            <Plus className="h-4 w-4" />
            Nouvel apprenant
          </Button>
        }
      />

      <div className="p-8 space-y-4">
        {/* Stat cards */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          <Link
            href="/apprenants"
            className={statCardClass(
              !companyFilter && !activeFilter && !q,
              "bg-white dark:bg-zinc-900",
            )}
          >
            <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">
              <Users className="h-3.5 w-3.5" />
              Total
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {totalCount ?? 0}
            </div>
          </Link>
          <Link
            href="/apprenants?active=yes"
            className={statCardClass(
              activeFilter === "yes",
              "bg-cyan-50/50 dark:bg-cyan-950/20",
            )}
          >
            <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-400 text-xs font-medium uppercase tracking-wider mb-1">
              <UserCircle className="h-3.5 w-3.5" />
              Actifs
            </div>
            <div className="text-2xl font-bold tabular-nums text-cyan-800 dark:text-cyan-300">
              {activeCount ?? 0}
            </div>
          </Link>
          <Link
            href="/apprenants?active=no"
            className={statCardClass(
              activeFilter === "no",
              "bg-zinc-100 dark:bg-zinc-900",
            )}
          >
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">
              <CircleSlash className="h-3.5 w-3.5" />
              Inactifs
            </div>
            <div className="text-2xl font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
              {inactiveCount ?? 0}
            </div>
          </Link>
          <Link
            href="/apprenants"
            className={statCardClass(
              false,
              "bg-blue-50/50 dark:bg-blue-950/20",
            )}
          >
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-xs font-medium uppercase tracking-wider mb-1">
              <Building2 className="h-3.5 w-3.5" />
              En entreprise
            </div>
            <div className="text-2xl font-bold tabular-nums text-blue-800 dark:text-blue-300">
              {companyCount ?? 0}
            </div>
          </Link>
          <Link
            href="/apprenants?company_id=none"
            className={statCardClass(
              companyFilter === "none",
              "bg-violet-50/50 dark:bg-violet-950/20",
            )}
          >
            <div className="flex items-center gap-2 text-violet-700 dark:text-violet-400 text-xs font-medium uppercase tracking-wider mb-1">
              <UserCircle className="h-3.5 w-3.5" />
              Particuliers
            </div>
            <div className="text-2xl font-bold tabular-nums text-violet-800 dark:text-violet-300">
              {privateCount ?? 0}
            </div>
          </Link>
        </div>

        <form
          method="get"
          className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4"
        >
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] items-end">
            <div className="space-y-1.5">
              <Label htmlFor="q" className="text-xs">
                Rechercher
              </Label>
              <Input
                id="q"
                name="q"
                type="search"
                placeholder="Prénom, nom, email, ville…"
                defaultValue={q}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company_id" className="text-xs">
                Entreprise
              </Label>
              <select
                id="company_id"
                name="company_id"
                defaultValue={companyFilter}
                className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              >
                <option value="">Toutes</option>
                <option value="none">Particuliers (sans entreprise)</option>
                {((companies ?? []) as Pick<Company, "id" | "name">[]).map(
                  (c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ),
                )}
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
                className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
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
                  render={<Link href="/apprenants" />}
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
        ) : !learners || learners.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <Users className="h-12 w-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
            {isFiltered ? (
              <>
                <p className="text-sm font-medium mb-1">Aucun résultat</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Aucun apprenant ne correspond à votre recherche.
                </p>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/apprenants" />}
                >
                  Réinitialiser les filtres
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">Aucun apprenant</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Ajoutez votre premier apprenant pour démarrer.
                </p>
                <Button
                  nativeButton={false}
                  render={<Link href="/apprenants/new" />}
                >
                  <Plus className="h-4 w-4" />
                  Nouvel apprenant
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 px-1">
              {learners.length} apprenant{learners.length > 1 ? "s" : ""}
              {isFiltered
                ? " (filtré" + (learners.length > 1 ? "s" : "") + ")"
                : ""}
            </p>
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Nom</th>
                    <th className="px-4 py-3">Fonction</th>
                    <th className="px-4 py-3">Tél</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Société</th>
                    <th className="px-4 py-3">CP &amp; Ville</th>
                    <th className="px-4 py-3">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {(learners as Learner[]).map((l) => {
                    const isCompany = Boolean(l.company_id);
                    const fullName = [l.civility, l.first_name, l.last_name]
                      .filter(Boolean)
                      .join(" ");
                    const initials =
                      `${l.first_name?.[0] ?? ""}${l.last_name?.[0] ?? ""}`.toUpperCase() ||
                      "?";
                    // Couleur de ligne pastel selon la catégorie de l'apprenant.
                    // Inactif → gris atténué qui prime sur la couleur de catégorie.
                    const rowClass = !l.is_active
                      ? "bg-zinc-50/40 dark:bg-zinc-900/40 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 opacity-70"
                      : isCompany
                        ? "bg-cyan-50/30 dark:bg-cyan-950/10 hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
                        : "bg-violet-50/30 dark:bg-violet-950/10 hover:bg-violet-50 dark:hover:bg-violet-950/30";
                    const avatarClass = !l.is_active
                      ? "bg-gradient-to-br from-zinc-400 to-zinc-500"
                      : isCompany
                        ? "bg-gradient-to-br from-cyan-500 to-blue-600"
                        : "bg-gradient-to-br from-violet-500 to-purple-600";
                    return (
                      <tr
                        key={l.id}
                        className={cn("transition-colors", rowClass)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "h-9 w-9 shrink-0 rounded-full text-white text-xs font-bold flex items-center justify-center",
                                avatarClass,
                              )}
                              aria-hidden
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/apprenants/${l.id}`}
                                className="font-bold text-sm text-zinc-900 dark:text-zinc-100 hover:underline block"
                              >
                                {fullName}
                              </Link>
                              {isCompany ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900 mt-0.5">
                                  <Building2 className="h-2.5 w-2.5" />
                                  Entreprise
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900 mt-0.5">
                                  <UserCircle className="h-2.5 w-2.5" />
                                  Particulier
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 text-xs">
                          {l.job_title ?? <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                          <div className="flex flex-col gap-0.5">
                            {l.mobile && (
                              <a
                                href={`tel:${l.mobile}`}
                                className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300 hover:text-cyan-700 tabular-nums"
                                title="Mobile"
                              >
                                <Smartphone className="h-3 w-3 text-zinc-400" />
                                {l.mobile}
                              </a>
                            )}
                            {l.phone && (
                              <a
                                href={`tel:${l.phone}`}
                                className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300 hover:text-cyan-700 tabular-nums"
                                title="Téléphone fixe"
                              >
                                <Phone className="h-3 w-3 text-zinc-400" />
                                {l.phone}
                              </a>
                            )}
                            {!l.mobile && !l.phone && (
                              <span className="text-zinc-300">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {l.email ? (
                            <a
                              href={`mailto:${l.email}`}
                              className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300 hover:text-cyan-700 break-all"
                            >
                              <Mail className="h-3 w-3 text-zinc-400 shrink-0" />
                              <span className="break-all">{l.email}</span>
                            </a>
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {l.company ? (
                            <Link
                              href={`/entreprises/${l.company.id}`}
                              className="inline-flex items-center gap-1 font-semibold text-cyan-700 hover:text-cyan-900 hover:underline"
                              title="Ouvrir la fiche entreprise"
                            >
                              <Building2 className="h-3 w-3" />
                              <span className="truncate max-w-[180px]">
                                {l.company.name}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-zinc-400 italic text-xs">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 text-xs whitespace-nowrap">
                          {l.postal_code || l.city ? (
                            <div className="flex flex-col leading-tight">
                              <span className="tabular-nums font-semibold">
                                {l.postal_code ?? ""}
                              </span>
                              <span>{l.city ?? ""}</span>
                            </div>
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {l.is_active ? (
                            <span className="text-xs text-cyan-700 dark:text-cyan-400 font-semibold">
                              ● Actif
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">
                              ○ Inactif
                            </span>
                          )}
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
