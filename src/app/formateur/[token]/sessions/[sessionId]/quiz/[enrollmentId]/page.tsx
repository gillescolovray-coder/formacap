import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuizAttempt, QuizQuestion } from "@/lib/quiz/types";
import { QuizAttemptDetailView } from "@/components/quiz-attempt-detail-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Détail quiz apprenant — Espace formateur",
  robots: "noindex, nofollow",
};

/**
 * Page de consultation FORMATEUR du detail d'un quiz joue par un
 * apprenant. Affiche les 2 phases (pre / post) avec, pour chaque
 * question : reponse donnee, bonne reponse, points obtenus,
 * explication eventuelle.
 *
 * Auth : token portail formateur + verification que l'enrollment
 * appartient bien a la session accessible par ce formateur.
 *
 * Rendu via le composant partage QuizAttemptDetailView (utilise aussi
 * cote admin OF). Gilles 2026-05-27.
 */
type Params = {
  token: string;
  sessionId: string;
  enrollmentId: string;
};

export default async function FormateurQuizDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token, sessionId, enrollmentId } = await params;
  const supabase = createAdminClient();

  // 1. Verifier token formateur + acces a la session
  const { data: tokenRow } = await supabase
    .from("trainer_portal_tokens")
    .select("trainer_id")
    .eq("token", token)
    .maybeSingle<{ trainer_id: string }>();
  if (!tokenRow) return <NotFound reason="Lien formateur invalide." />;

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, trainer_id, quiz_template_id, formation:formations(title, quiz_template_id)",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      trainer_id: string | null;
      quiz_template_id: string | null;
      formation: { title: string; quiz_template_id: string | null } | null;
    }>();
  if (!session) return <NotFound reason="Session introuvable." />;

  let authorized = session.trainer_id === tokenRow.trainer_id;
  if (!authorized) {
    const { data: dayAssign } = await supabase
      .from("session_days")
      .select("id")
      .eq("session_id", sessionId)
      .eq("trainer_id", tokenRow.trainer_id)
      .limit(1)
      .maybeSingle();
    authorized = !!dayAssign;
  }
  if (!authorized) {
    return <NotFound reason="Vous n'avez pas accès à cette session." />;
  }

  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(civility, first_name, last_name, company:companies(name))",
    )
    .eq("id", enrollmentId)
    .eq("session_id", sessionId)
    .maybeSingle<{
      id: string;
      learner: {
        civility: string | null;
        first_name: string | null;
        last_name: string | null;
        company: { name: string } | null;
      } | null;
    }>();
  if (!enrollment) {
    return <NotFound reason="Inscription introuvable pour cette session." />;
  }

  const effectiveQuizId =
    session.quiz_template_id ?? session.formation?.quiz_template_id ?? null;
  if (!effectiveQuizId) {
    return <NotFound reason="Aucun quiz rattaché à cette session." />;
  }

  const [{ data: quizRow }, { data: questionsRaw }, { data: attempts }] =
    await Promise.all([
      supabase
        .from("quiz_templates")
        .select("title, description")
        .eq("id", effectiveQuizId)
        .maybeSingle<{ title: string; description: string | null }>(),
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

  const fullName = [enrollment.learner?.first_name, enrollment.learner?.last_name]
    .filter(Boolean)
    .join(" ");
  const companyName = enrollment.learner?.company?.name ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-5">
        <Link
          href={`/formateur/${token}/sessions/${sessionId}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour à la session
        </Link>

        <header className="space-y-1">
          <div className="text-xs uppercase tracking-widest text-amber-700 font-bold">
            Détail du quiz d&apos;évaluation
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            {enrollment.learner?.civility
              ? `${enrollment.learner.civility} `
              : ""}
            {fullName || "Apprenant"}
          </h1>
          {companyName && (
            <p className="text-sm text-zinc-600">{companyName}</p>
          )}
          {quizRow?.title && (
            <p className="text-xs text-zinc-500 pt-1">
              Quiz : <strong>{quizRow.title}</strong>
            </p>
          )}
        </header>

        <QuizAttemptDetailView
          questions={questions}
          preAttempt={preAttempt}
          postAttempt={postAttempt}
        />

        <footer className="text-center text-[11px] text-zinc-400 pt-4">
          Consultation réservée au formateur — données confidentielles
          apprenant.
        </footer>
      </div>
    </div>
  );
}

function NotFound({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">Accès impossible</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
      </div>
    </div>
  );
}
