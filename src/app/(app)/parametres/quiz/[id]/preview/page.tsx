import Link from "next/link";
import { ChevronLeft, Eye } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ParametresNav } from "../../../_nav";
import type { QuizQuestion } from "@/lib/quiz/types";
import { QuizPreview } from "./_preview";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuizPreviewPage({
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

  const { data: quiz } = await supabase
    .from("quiz_templates")
    .select("id, title, description, status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      title: string;
      description: string | null;
      status: string;
    }>();
  if (!quiz) notFound();

  const { data: questionsRaw } = await supabase
    .from("quiz_questions")
    .select(
      "id, quiz_template_id, position, type, text, options, correct_answer, points, explanation",
    )
    .eq("quiz_template_id", id)
    .order("position", { ascending: true });
  const questions = (questionsRaw ?? []) as QuizQuestion[];

  return (
    <>
      <PageHeader
        title={`Aperçu apprenant : ${quiz.title}`}
        description="Mode démo — aucune réponse n'est enregistrée."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres/organisation" },
          { label: "Quiz", href: "/parametres/quiz" },
          { label: quiz.title, href: `/parametres/quiz/${id}` },
          { label: "Aperçu" },
        ]}
        actions={
          <Link
            href={`/parametres/quiz/${id}`}
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour à l&apos;éditeur
          </Link>
        }
      />
      <ParametresNav />

      <div className="p-8 max-w-2xl space-y-4">
        <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-3 text-sm text-cyan-900 flex items-center gap-2">
          <Eye className="h-4 w-4" />
          <span>
            <strong>Mode aperçu</strong> — voici le quiz tel qu&apos;il
            apparaîtra à l&apos;apprenant. Aucune réponse n&apos;est
            enregistrée.
          </span>
        </div>

        {questions.length === 0 ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
            <p className="text-sm text-amber-900">
              Ce quiz n&apos;a pas encore de questions. Ajoutez-en depuis
              l&apos;éditeur.
            </p>
          </div>
        ) : (
          <QuizPreview quiz={quiz} questions={questions} />
        )}
      </div>
    </>
  );
}
