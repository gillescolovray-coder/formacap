import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParametresNav } from "../../_nav";
import {
  QUIZ_STATUS_COLORS,
  QUIZ_STATUS_LABELS,
  type QuizQuestion,
  type QuizStatus,
} from "@/lib/quiz/types";
import { updateQuizMeta } from "../actions";
import { QuizEditor } from "./_editor";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuizEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: quiz } = await supabase
    .from("quiz_templates")
    .select(
      "id, title, description, status, organization_id, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      title: string;
      description: string | null;
      status: QuizStatus;
      organization_id: string;
      created_at: string;
      updated_at: string;
    }>();
  if (!quiz) notFound();

  const { data: questionsData } = await supabase
    .from("quiz_questions")
    .select(
      "id, quiz_template_id, position, type, text, options, correct_answer, points, explanation",
    )
    .eq("quiz_template_id", id)
    .order("position", { ascending: true });
  const questions = (questionsData ?? []) as QuizQuestion[];
  const questionsCount = questions.length;
  const totalPoints = questions.reduce((s, q) => s + q.points, 0);

  const save = updateQuizMeta.bind(null, id);

  return (
    <>
      <PageHeader
        title={quiz.title}
        description={`Éditeur de quiz · ${questionsCount} question${questionsCount > 1 ? "s" : ""} · ${totalPoints} point${totalPoints > 1 ? "s" : ""} au total`}
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres/organisation" },
          { label: "Quiz", href: "/parametres/quiz" },
          { label: quiz.title },
        ]}
        actions={
          <Link
            href="/parametres/quiz"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour à la liste
          </Link>
        }
      />
      <ParametresNav />

      <div className="p-8 max-w-4xl space-y-4">
        {sp.error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {sp.error}
          </div>
        )}
        {sp.saved && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700">
            Quiz enregistré.
          </div>
        )}

        {/* Métadonnées du quiz */}
        <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
          <h2 className="text-base font-semibold">Informations générales</h2>
          <form action={save} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Titre *</Label>
              <Input
                id="title"
                name="title"
                required
                defaultValue={quiz.title}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                defaultValue={quiz.description ?? ""}
                placeholder="Quiz d'évaluation pré/post formation"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Statut</Label>
              <select
                id="status"
                name="status"
                defaultValue={quiz.status}
                className="h-9 w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 text-sm"
              >
                <option value="draft">
                  Brouillon (non utilisable)
                </option>
                <option value="pending_review">
                  À valider (proposé par formateur)
                </option>
                <option value="published">
                  Publié (utilisable sur formations/sessions)
                </option>
                <option value="archived">
                  Archivé (retiré de la liste active)
                </option>
              </select>
              <p className="text-xs text-zinc-500">
                État actuel :{" "}
                <span
                  className={
                    "inline-block text-[10px] px-1.5 py-0.5 rounded-full border font-semibold " +
                    QUIZ_STATUS_COLORS[quiz.status]
                  }
                >
                  {QUIZ_STATUS_LABELS[quiz.status]}
                </span>
              </p>
            </div>
            <Button type="submit">Enregistrer</Button>
          </form>
        </section>

        {/* Éditeur de questions (Q2) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-zinc-900">
                📝 Questions
              </h2>
              <span className="inline-flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-cyan-100 text-cyan-800 font-bold">
                  {questionsCount} question{questionsCount > 1 ? "s" : ""}
                </span>
                <span className="px-2 py-1 rounded-full bg-violet-100 text-violet-800 font-bold">
                  {totalPoints} pt{totalPoints > 1 ? "s" : ""} au total
                </span>
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Glissez-déposez dans la liste de droite pour réordonner.
            </p>
          </div>
          <QuizEditor quizId={id} initialQuestions={questions} />
        </section>
      </div>
    </>
  );
}
