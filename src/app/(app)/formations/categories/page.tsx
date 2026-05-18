import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormationCategory } from "@/lib/formations/types";
import { addCategory, deleteCategory, renameCategory } from "./actions";

export default async function CategoriesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    created?: string;
    updated?: string;
    deleted?: string;
  }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: categories } = await supabase
    .from("formation_categories")
    .select("*")
    .order("name", { ascending: true });

  const { data: usageRows } = await supabase
    .from("formations")
    .select("category_id")
    .not("category_id", "is", null);

  const usageByCategory = new Map<string, number>();
  (usageRows ?? []).forEach((r) => {
    const id = r.category_id as string;
    usageByCategory.set(id, (usageByCategory.get(id) ?? 0) + 1);
  });

  const cats = (categories ?? []) as FormationCategory[];

  return (
    <>
      <PageHeader
        title="Catégories de formations"
        description="Gérez la liste des catégories disponibles dans le catalogue."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Catalogue", href: "/formations" },
          { label: "Catégories" },
        ]}
      />

      <div className="p-8 max-w-3xl space-y-6">
        {params.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {params.error}
          </div>
        )}
        {params.created && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Catégorie ajoutée.
          </div>
        )}
        {params.updated && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Catégorie renommée.
          </div>
        )}
        {params.deleted && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Catégorie supprimée.
          </div>
        )}

        {/* Formulaire d'ajout */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4">
            Ajouter une catégorie
          </h2>
          <form action={addCategory} className="flex gap-2 items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-category-name">Nom</Label>
              <Input
                id="new-category-name"
                name="name"
                required
                placeholder="Ex: Cybersécurité"
              />
            </div>
            <Button type="submit">Ajouter</Button>
          </form>
        </section>

        {/* Liste */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Catégories existantes ({cats.length})
            </h2>
          </div>
          {cats.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              Aucune catégorie pour le moment. Ajoutez-en une ci-dessus.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {cats.map((cat) => {
                const rename = renameCategory.bind(null, cat.id);
                const remove = deleteCategory.bind(null, cat.id);
                const usage = usageByCategory.get(cat.id) ?? 0;
                return (
                  <li
                    key={cat.id}
                    className="px-6 py-4 flex items-center gap-3 flex-wrap"
                  >
                    <form action={rename} className="flex-1 flex gap-2 min-w-0">
                      <Input
                        name="name"
                        defaultValue={cat.name}
                        required
                        className="flex-1"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Renommer
                      </Button>
                    </form>
                    <span className="text-xs text-zinc-500 whitespace-nowrap">
                      {usage === 0
                        ? "Aucune formation"
                        : `${usage} formation${usage > 1 ? "s" : ""}`}
                    </span>
                    <form action={remove}>
                      <Button type="submit" size="sm" variant="destructive">
                        Supprimer
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
          {cats.some((c) => (usageByCategory.get(c.id) ?? 0) > 0) && (
            <div className="px-6 py-3 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
              ℹ️ Supprimer une catégorie utilisée retire simplement son rattachement des formations concernées — les formations ne sont pas supprimées.
            </div>
          )}
        </section>
      </div>
    </>
  );
}
