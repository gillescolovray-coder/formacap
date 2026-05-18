import { redirect } from "next/navigation";
import { Brain, Plus } from "lucide-react";
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

        {/* Formulaire de création rapide */}
        <section className="rounded-xl bg-white border border-zinc-200 p-5">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
            <Plus className="h-4 w-4" />
            Nouveau quiz
          </h2>
          <form action={createQuiz} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[280px] space-y-1.5">
              <Label htmlFor="title" className="text-xs">
                Titre du quiz *
              </Label>
              <Input
                id="title"
                name="title"
                required
                placeholder="Ex : Évaluation gestion marchés publics"
              />
            </div>
            <div className="flex-[2] min-w-[280px] space-y-1.5">
              <Label htmlFor="description" className="text-xs">
                Description (optionnelle)
              </Label>
              <Input
                id="description"
                name="description"
                placeholder="Quiz de positionnement et fin de formation"
              />
            </div>
            <Button type="submit">
              <Plus className="h-4 w-4" />
              Créer
            </Button>
          </form>
        </section>

        {/* Liste */}
        {rows.length === 0 ? (
          <div className="rounded-xl bg-white border border-zinc-200 p-12 text-center">
            <Brain className="h-12 w-12 mx-auto text-zinc-300 mb-2" />
            <p className="text-sm text-zinc-600">
              Aucun quiz pour le moment. Créez votre premier quiz ci-dessus.
            </p>
          </div>
        ) : (
          <QuizListClient
            rows={rows}
            questionsCount={Object.fromEntries(counts)}
          />
        )}
      </div>
    </>
  );
}
