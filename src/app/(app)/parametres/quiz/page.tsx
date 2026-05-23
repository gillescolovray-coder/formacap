import { redirect } from "next/navigation";
import { Brain, ListChecks, Plus, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParametresNav } from "../_nav";
import type { QuizStatus } from "@/lib/quiz/types";
import { createQuiz } from "./actions";
import { QuizListClient } from "./_list-client";

export default async function QuizListPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    deleted?: string;
  }>;
}) {
  const sp = await searchParams;
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
  if (!membership) {
    return (
      <>
        <PageHeader title="Bibliothèque de quiz" />
        <ParametresNav />
        <div className="p-8 text-sm text-zinc-500">
          Aucune organisation rattachée.
        </div>
      </>
    );
  }

  const { data: quizzes } = await supabase
    .from("quiz_templates")
    .select(
      "id, title, description, status, updated_at, created_by_profile_id, created_by_trainer_id",
    )
    .eq("organization_id", membership.organization_id as string)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  const rows = (quizzes ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    status: QuizStatus;
    updated_at: string;
    created_by_profile_id: string | null;
    created_by_trainer_id: string | null;
  }>;

  // Compter les questions par quiz (pour affichage liste)
  const ids = rows.map((q) => q.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: countsData } = await supabase
      .from("quiz_questions")
      .select("quiz_template_id")
      .in("quiz_template_id", ids);
    for (const r of (countsData ?? []) as Array<{ quiz_template_id: string }>) {
      counts.set(r.quiz_template_id, (counts.get(r.quiz_template_id) ?? 0) + 1);
    }
  }

  return (
    <>
      <PageHeader
        title="Bibliothèque de quiz"
        description="Créez des quiz d'évaluation à jouer en pré-formation (matin) et post-formation (soir) pour mesurer la progression."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres/organisation" },
          { label: "Quiz" },
        ]}
      />
      <ParametresNav />

      <div className="p-8 max-w-5xl space-y-4">
        {sp.error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {sp.error}
          </div>
        )}
        {sp.deleted && (
          <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-4 text-sm text-cyan-700">
            Quiz supprimé.
          </div>
        )}

        {/* ====== ZONE CRÉATION — carte cyan/violet accent ====== */}
        <section className="rounded-2xl bg-gradient-to-br from-violet-50 via-cyan-50/50 to-white border-2 border-violet-200 p-4 md:p-5 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-600 text-white inline-flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-violet-900 leading-tight">
                Créer un nouveau quiz
              </h2>
              <p className="text-[11px] md:text-xs text-violet-700/80 mt-0.5">
                Commencez avec un titre, vous ajouterez les questions ensuite
                (QCM, vrai/faux, échelle 0-10, etc.).
              </p>
            </div>
          </div>
          <form
            action={createQuiz}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 min-w-[260px] space-y-1.5">
              <Label htmlFor="title" className="text-xs font-semibold text-violet-900">
                Titre du quiz *
              </Label>
              <Input
                id="title"
                name="title"
                required
                placeholder="Ex : Évaluation gestion marchés publics"
                className="bg-white border-violet-200 focus-visible:border-violet-500 focus-visible:ring-violet-200"
              />
            </div>
            <div className="flex-[2] min-w-[260px] space-y-1.5">
              <Label htmlFor="description" className="text-xs font-semibold text-violet-900">
                Description (optionnelle)
              </Label>
              <Input
                id="description"
                name="description"
                placeholder="Quiz de positionnement et fin de formation"
                className="bg-white border-violet-200 focus-visible:border-violet-500 focus-visible:ring-violet-200"
              />
            </div>
            <Button
              type="submit"
              className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Créer le quiz
            </Button>
          </form>
        </section>

        {/* ====== ZONE LISTE — titre + tableau ====== */}
        <section className="space-y-2 pt-2">
          <div className="flex items-center gap-2 px-1">
            <ListChecks className="h-5 w-5 text-zinc-500" />
            <h2 className="text-base md:text-lg font-bold text-zinc-800">
              Quiz existants
            </h2>
            <span className="text-xs font-semibold text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full tabular-nums">
              {rows.length}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-xl bg-white border-2 border-dashed border-zinc-200 p-12 text-center">
              <Brain className="h-12 w-12 mx-auto text-zinc-300 mb-2" />
              <p className="text-sm text-zinc-600">
                Aucun quiz pour le moment. Créez votre premier quiz ci-dessus
                (zone violette).
              </p>
            </div>
          ) : (
            <QuizListClient
              rows={rows}
              questionsCount={Object.fromEntries(counts)}
            />
          )}
        </section>
      </div>
    </>
  );
}
