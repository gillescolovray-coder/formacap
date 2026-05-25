import Link from "next/link";
import { ChevronLeft, Eye, Star, Target } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PositioningTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tpl } = await supabase
    .from("positioning_templates")
    .select(
      "id, title, description, is_default, status, expectation_choices, mastery_criteria, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      title: string;
      description: string | null;
      is_default: boolean;
      status: "draft" | "published" | "archived";
      expectation_choices: Array<{ key: string; label: string }> | null;
      mastery_criteria: Array<{ key: string; label: string }> | null;
      created_at: string;
      updated_at: string;
    }>();
  if (!tpl) notFound();

  const expectations = tpl.expectation_choices ?? [];
  const criteria = tpl.mastery_criteria ?? [];

  return (
    <>
      <PageHeader
        title={tpl.title}
        description={
          tpl.is_default
            ? "Template par défaut — appliqué automatiquement à toutes les sessions sans template spécifique."
            : "Template personnalisé — à rattacher manuellement à une formation ou à une session."
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres" },
          {
            label: "Tests de positionnement",
            href: "/parametres/positionnement",
          },
          { label: tpl.title },
        ]}
        actions={
          <>
            <Link
              href="/parametres/positionnement"
              className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
            >
              <ChevronLeft className="h-4 w-4" />
              Retour
            </Link>
            <Button
              nativeButton={false}
              render={
                <Link
                  href={`/parametres/positionnement-preview?template=${tpl.id}`}
                />
              }
              variant="default"
              size="sm"
              title="Voir le test tel que le verra l'apprenant"
            >
              <Eye className="h-4 w-4" />
              Aperçu apprenant
            </Button>
          </>
        }
      />

      <div className="p-8 max-w-3xl space-y-4">
        {tpl.description && (
          <p className="text-sm text-zinc-600">{tpl.description}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {tpl.is_default && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
              <Star className="h-3 w-3" />
              Par défaut
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">
            {tpl.status}
          </span>
          <span className="text-[10px] text-zinc-500">
            Modifié le{" "}
            {new Date(tpl.updated_at).toLocaleDateString("fr-FR")}
          </span>
        </div>

        {/* Section 2 — Attentes proposées */}
        <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-3">
          <header className="flex items-start gap-3">
            <div className="rounded-lg bg-cyan-100 text-cyan-700 h-9 w-9 flex items-center justify-center shrink-0 font-bold">
              2
            </div>
            <div>
              <h2 className="font-bold text-zinc-900">Attentes proposées</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Multi-choix proposés à l&apos;apprenant pour décrire ce
                qu&apos;il attend de la formation.
              </p>
            </div>
          </header>
          {expectations.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">
              Aucune attente définie.
            </p>
          ) : (
            <ul className="space-y-1">
              {expectations.map((e) => (
                <li
                  key={e.key}
                  className="flex items-center gap-2 text-sm text-zinc-800 bg-zinc-50 rounded px-3 py-2"
                >
                  <input type="checkbox" disabled />
                  <span>{e.label}</span>
                  <code className="ml-auto text-[10px] text-zinc-400">
                    {e.key}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Section 5 — Compétences à auto-évaluer */}
        <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-3">
          <header className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 text-amber-700 h-9 w-9 flex items-center justify-center shrink-0">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-bold text-zinc-900">
                Compétences à auto-évaluer
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Pour chaque compétence, l&apos;apprenant choisit Non maîtrisé /
                Partiellement / Maîtrisé.
              </p>
            </div>
          </header>
          {criteria.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">
              Aucun critère défini.
            </p>
          ) : (
            <ul className="space-y-1">
              {criteria.map((c) => (
                <li
                  key={c.key}
                  className="flex items-center gap-2 text-sm text-zinc-800 bg-zinc-50 rounded px-3 py-2"
                >
                  <span>{c.label}</span>
                  <code className="ml-auto text-[10px] text-zinc-400">
                    {c.key}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-xs text-blue-900 space-y-1.5">
          <p>
            <strong>📝 Édition à venir (Phase 2)</strong>
          </p>
          <p>
            Pour modifier les attentes et compétences de ce template,
            l&apos;éditeur visuel arrivera dans la prochaine itération.
            En attendant, utilisez le SQL Editor de Supabase (table{" "}
            <code>positioning_templates</code>).
          </p>
        </div>
      </div>
    </>
  );
}
