"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateAnswer,
  maxScore,
  type QuizQuestion,
} from "@/lib/quiz/types";

export type SubmitQuizResult = {
  ok: boolean;
  error?: string;
  score?: number;
  maxScore?: number;
};

type AnswerInput = {
  question_id: string;
  answer: string | string[] | boolean | null;
};

/**
 * Soumet une tentative de quiz par un apprenant. Authentifié par
 * son token portail. La phase (pre/post) est déterminée par
 * l'absence de tentative existante (pre d'abord, post ensuite).
 */
export async function submitQuizAttempt(params: {
  portalToken: string;
  quizId: string;
  phase: "pre" | "post";
  answers: AnswerInput[];
}): Promise<SubmitQuizResult> {
  const { portalToken, quizId, phase, answers } = params;
  const supabase = createAdminClient();

  // 1. Token → enrollment
  const { data: portalRow } = await supabase
    .from("enrollment_portal_tokens")
    .select("enrollment_id")
    .eq("token", portalToken)
    .maybeSingle<{ enrollment_id: string }>();
  if (!portalRow) return { ok: false, error: "Lien invalide." };

  // 2. Vérif quiz appartient bien à la session de cet enrollment
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, session:sessions(quiz_template_id, formation:formations(quiz_template_id))",
    )
    .eq("id", portalRow.enrollment_id)
    .maybeSingle<{
      id: string;
      session: {
        quiz_template_id: string | null;
        formation: { quiz_template_id: string | null } | null;
      } | null;
    }>();
  if (!enrollment) return { ok: false, error: "Inscription introuvable." };

  const effectiveQuizId =
    enrollment.session?.quiz_template_id ??
    enrollment.session?.formation?.quiz_template_id ??
    null;
  if (effectiveQuizId !== quizId) {
    return { ok: false, error: "Quiz non rattaché à cette session." };
  }

  // 3. Pas de double tentative pour cette phase
  const { data: existing } = await supabase
    .from("quiz_attempts")
    .select("id")
    .eq("enrollment_id", portalRow.enrollment_id)
    .eq("quiz_template_id", quizId)
    .eq("phase", phase)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return {
      ok: false,
      error: "Vous avez déjà répondu à ce quiz pour cette phase.",
    };
  }

  // 4. Charger les questions pour scoring
  const { data: questionsRaw } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("quiz_template_id", quizId)
    .order("position", { ascending: true });
  const questions = (questionsRaw ?? []) as QuizQuestion[];

  // 5. Scorer
  const detailedAnswers = questions.map((q) => {
    const userAnswer =
      answers.find((a) => a.question_id === q.id)?.answer ?? null;
    const { is_correct, points_earned } = evaluateAnswer(q, userAnswer);
    return {
      question_id: q.id,
      answer: userAnswer,
      is_correct,
      points_earned,
    };
  });
  const score = detailedAnswers.reduce((s, a) => s + a.points_earned, 0);
  const max = maxScore(questions);

  // 6. Audit + INSERT
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const userAgent = h.get("user-agent") ?? null;

  const { error: insertError } = await supabase
    .from("quiz_attempts")
    .insert({
      enrollment_id: portalRow.enrollment_id,
      quiz_template_id: quizId,
      phase,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      score,
      max_score: max,
      data: detailedAnswers,
      submitted_ip: ip,
      submitted_user_agent: userAgent,
    });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return { ok: true, score, maxScore: max };
}
