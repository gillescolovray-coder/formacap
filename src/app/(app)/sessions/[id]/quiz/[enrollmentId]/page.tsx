import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { SessionTabs } from "../../_session-tabs";
import { SessionHeaderMeta } from "../../_session-header-meta";
import { QuizAttemptDetailView } from "@/components/quiz-attempt-detail-view";
import type { QuizAttempt, QuizQuestion } from "@/lib/quiz/types";
import { PrintQuizDetailButton } from "./_print-button";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Page admin OF : consultation du detail d'un quiz joue par un
 * apprenant. Meme rendu que cote formateur (composant partage
 * QuizAttemptDetailView) — Gilles 2026-05-28.
 *
 * Accessible depuis l'icone oeil dans le tableau Quiz de la session.
 */
export default async function AdminQuizDetailPage({
  params,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
}) {
  const { id, enrollmentId } = await params;
  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(enrollmentId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, quiz_template_id, formation:formations(title, quiz_template_id)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      quiz_template_id: string | null;
      formation: { title: string; quiz_template_id: string | null } | null;
    }>();
  if (!session) notFound();

  // Verifier l'enrollment + recuperer l'apprenant
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(civility, first_name, last_name, company:companies(name))",
    )
    .eq("id", enrollmentId)
    .eq("session_id", id)
    .maybeSingle<{
      id: string;
      learner: {
        civility: string | null;
        first_name: string | null;
        last_name: string | null;
        company: { name: string } | null;
      } | null;
    }>();
  if (!enrollment) notFound();

  const effectiveQuizId =
    session.quiz_template_id ?? session.formation?.quiz_template_id ?? null;
  if (!effectiveQuizId) {
    return (
      <NoQuiz id={id} />
    );
  }

  const [{ data: quizRow }, { data: questionsRaw }, { data: attempts }] =
    await Promise.all([
      supabase
        .from("quiz_templates")
        .select("title")
        .eq("id", effectiveQuizId)
        .maybeSingle<{ title: string }>(),
      supabase
        .from("quiz_questions")
        .select(
          "id, quiz_template_id, position, type, text, options, correct_answer, points, explanation",
        )
        .eq("quiz_template_id", effectiveQuizId)
        .order("position", { ascending: true }),
      supabase
        .from("quiz_attempts")
        .select(
          "id, enrollment_id, quiz_template_id, phase, score, max_score, started_at, completed_at, data",
        )
        .eq("enrollment_id", enrollmentId)
        .eq("quiz_template_id", effectiveQuizId),
    ]);

  const questions = (questionsRaw ?? []) as QuizQuestion[];
  const allAttempts = (attempts ?? []) as QuizAttempt[];
  const preAttempt = allAttempts.find((a) => a.phase === "pre") ?? null;
  const postAttempt = allAttempts.find((a) => a.phase === "post") ?? null;

  const fullName = [
    enrollment.learner?.first_name,
    enrollment.learner?.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const companyName = enrollment.learner?.company?.name ?? null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Styles d'impression : masque sidebar, header app, tabs,
          bouton imprimer, et le lien retour. Garde uniquement le
          contenu pour produire une feuille A4 propre (Gilles 2026-05-28). */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { margin: 12mm 10mm; size: A4; }
              body { background: white !important; }
              .no-print, aside, nav, header { display: none !important; }
              main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
              html, body { margin: 0 !important; padding: 0 !important; }
              /* Eviter de couper une question entre 2 pages */
              .quiz-detail-question { break-inside: avoid; page-break-inside: avoid; }
              /* Couleurs preservees en print pour les badges */
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
          `,
        }}
      />
      <div className="no-print">
        <PageHeader
          title={`Quiz : ${fullName || "Apprenant"}`}
          description={
            session.formation?.title
              ? `${session.formation.title}${companyName ? ` · ${companyName}` : ""}`
              : (companyName ?? "Session")
          }
          actions={<BackButton fallbackHref={`/sessions/${id}/quiz`} />}
        />
        <SessionHeaderMeta sessionId={id} />
        <SessionTabs sessionId={id} />
      </div>

      <div className="px-8 py-6 max-w-5xl mx-auto w-full space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap no-print">
          <Link
            href={`/sessions/${id}/quiz`}
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour au tableau Quiz
          </Link>
          <PrintQuizDetailButton />
        </div>

        {/* En-tete visible aussi a l'impression : nom apprenant +
            entreprise + intitule formation + titre du quiz */}
        <div className="space-y-1 border-b border-zinc-200 pb-3">
          <div className="text-xs uppercase tracking-widest text-amber-700 font-bold">
            Détail du quiz d&apos;évaluation
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            {fullName || "Apprenant"}
          </h1>
          {companyName && (
            <p className="text-sm text-zinc-600">{companyName}</p>
          )}
          {session.formation?.title && (
            <p className="text-xs text-zinc-500">
              Formation : <strong>{session.formation.title}</strong>
            </p>
          )}
          {quizRow?.title && (
            <p className="text-xs text-zinc-500">
              Quiz : <strong>{quizRow.title}</strong>
            </p>
          )}
        </div>

        <QuizAttemptDetailView
          questions={questions}
          preAttempt={preAttempt}
          postAttempt={postAttempt}
        />
      </div>
    </div>
  );
}

function NoQuiz({ id }: { id: string }) {
  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader
        title="Aucun quiz"
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />
      <SessionTabs sessionId={id} />
      <div className="px-8 py-6 max-w-3xl mx-auto w-full">
        <div className="rounded-xl bg-zinc-50 border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600">
          Aucun quiz n&apos;est rattaché à cette session.
        </div>
      </div>
    </div>
  );
}
