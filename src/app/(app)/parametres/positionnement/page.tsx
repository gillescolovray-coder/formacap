import Link from "next/link";
import { CheckCircle2, Eye, Star, Target } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";

export const dynamic = "force-dynamic";

type TemplateRow = {
  id: string;
  title: string;
  description: string | null;
  is_default: boolean;
  status: "draft" | "published" | "archived";
  expectation_choices: Array<{ key: string; label: string }> | null;
  mastery_criteria: Array<{ key: string; label: string }> | null;
  updated_at: string;
};

export default async function PositioningTemplatesListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<{ organization_id: string }>();
  if (!orgMember) redirect("/login");

  // Charge la bibliothèque. Fallback gracieux si la table n'existe pas
  // encore (migration 0105 pas appliquée).
  let templates: TemplateRow[] = [];
  let tableMissing = false;
  try {
    const { data, error } = await supabase
      .from("positioning_templates")
      .select(
        "id, title, description, is_default, status, expectation_choices, mastery_criteria, updated_at",
      )
      .eq("organization_id", orgMember.organization_id)
      .neq("status", "archived")
      .order("is_default", { ascending: false })
      .order("title", { ascending: true });
    if (error && /relation .* does not exist/i.test(error.message)) {
      tableMissing = true;
    } else {
      templates = (data ?? []) as TemplateRow[];
    }
  } catch {
    tableMissing = true;
  }

  return (
    <>
      <PageHeader
        title="Tests de positionnement"
        description="Bibliothèque des modèles de tests Qualiopi. Le test par défaut s'applique automatiquement à toutes les sessions ; vous pouvez en créer d'autres et les rattacher à une formation ou à une session précise."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres" },
          { label: "Tests de positionnement" },
        ]}
        actions={<BackButton fallbackHref="/parametres" />}
      />

      <div className="p-8 max-w-4xl space-y-4">
        {tableMissing && (
          <div className="rounded-xl bg-amber-50 border-2 border-amber-300 p-4 text-sm text-amber-900">
            <strong>Migration BDD à appliquer.</strong> La table{" "}
            <code className="bg-white px-1.5 py-0.5 rounded text-xs">
              positioning_templates
            </code>{" "}
            n&apos;existe pas encore. Appliquez la migration{" "}
            <code>0105_positioning_templates.sql</code> dans le SQL Editor
            de Supabase pour activer la bibliothèque. En attendant, le
            formulaire apprenant tourne sur les valeurs codées en dur
            historiques (rien n&apos;est cassé).
          </div>
        )}

        {!tableMissing && templates.length === 0 && (
          <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-8 text-center text-sm text-zinc-600">
            Aucun template disponible. La migration 0105 doit avoir seedé
            un template par défaut — vérifiez son application.
          </div>
        )}

        {templates.map((t) => (
          <Link
            key={t.id}
            href={`/parametres/positionnement/${t.id}`}
            className="block rounded-xl bg-white border border-zinc-200 hover:border-amber-400 hover:shadow-sm transition p-4"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-100 text-amber-700 h-10 w-10 flex items-center justify-center shrink-0">
                <Target className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-zinc-900">{t.title}</h3>
                  {t.is_default && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                      <Star className="h-3 w-3" />
                      Par défaut
                    </span>
                  )}
                  {t.status === "published" && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">
                      <CheckCircle2 className="h-3 w-3" />
                      Publié
                    </span>
                  )}
                  {t.status === "draft" && (
                    <span className="text-[10px] uppercase tracking-wider font-bold bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded-full">
                      Brouillon
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-zinc-600 mt-1">{t.description}</p>
                )}
                <div className="flex gap-3 text-[11px] text-zinc-500 mt-2">
                  <span>
                    <strong>{t.expectation_choices?.length ?? 0}</strong>{" "}
                    attente{(t.expectation_choices?.length ?? 0) > 1 ? "s" : ""}
                  </span>
                  <span>
                    <strong>{t.mastery_criteria?.length ?? 0}</strong>{" "}
                    compétence{(t.mastery_criteria?.length ?? 0) > 1 ? "s" : ""}{" "}
                    à auto-évaluer
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-zinc-400 group-hover:text-amber-600">
                <Eye className="h-5 w-5" />
              </div>
            </div>
          </Link>
        ))}

        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-xs text-blue-900 space-y-1.5">
          <p>
            <strong>📝 Édition à venir (Phase 2)</strong>
          </p>
          <p>
            Aujourd&apos;hui les templates sont en{" "}
            <strong>lecture seule</strong>. La création / modification
            des compétences et attentes par template arrivera dans la
            prochaine itération (Sprint Édition).
          </p>
          <p>
            En attendant : le template par défaut s&apos;applique
            automatiquement à toutes les sessions, et la résolution{" "}
            <em>session &gt; formation &gt; default</em> fonctionne déjà
            si vous attribuez un template via SQL.
          </p>
        </div>
      </div>
    </>
  );
}
