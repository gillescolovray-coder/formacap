"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  evaluateAnswer,
  maxScore,
  type QuizQuestion,
  type QuizAttemptAnswer,
} from "@/lib/quiz/types";

async function effectiveQuizId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<{ quizId: string | null; locked: boolean }> {
  const { data: s } = await supabase
    .from("sessions")
    .select("quiz_template_id, quiz_results_locked_at, formation:formations(quiz_template_id)")
    .eq("id", sessionId)
    .maybeSingle<{
      quiz_template_id: string | null;
      quiz_results_locked_at: string | null;
      formation: { quiz_template_id: string | null } | null;
    }>();
  return {
    quizId: s?.quiz_template_id ?? s?.formation?.quiz_template_id ?? null,
    locked: Boolean(s?.quiz_results_locked_at),
  };
}

/** Verrouille / déverrouille les résultats quiz d'une session. */
export async function toggleQuizLock(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const lock = formData.get("lock") === "1";
  if (!sessionId) redirect("/sessions");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("sessions")
    .update({
      quiz_results_locked_at: lock ? new Date().toISOString() : null,
      quiz_results_locked_by: lock ? user.id : null,
    })
    .eq("id", sessionId);

  revalidatePath(`/sessions/${sessionId}/quiz`);
  redirect(`/sessions/${sessionId}/quiz?${lock ? "qlocked=1" : "qunlocked=1"}`);
}

/**
 * Corrige manuellement les réponses d'un apprenant (réponse par réponse) et
 * recalcule le score. Bloqué si les résultats sont verrouillés.
 */
export async function saveQuizCorrection(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const phase = String(formData.get("phase") ?? "");
  const redirectBase = `/sessions/${sessionId}/quiz/${enrollmentId}`;
  if (!sessionId || !enrollmentId || (phase !== "pre" && phase !== "post")) {
    redirect(redirectBase);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { quizId, locked } = await effectiveQuizId(supabase, sessionId);
  if (!quizId) redirect(`${redirectBase}?qerror=noquiz`);
  if (locked) redirect(`${redirectBase}?qerror=locked`);

  const { data: questionsRaw } = await supabase
    .from("quiz_questions")
    .select(
      "id, quiz_template_id, position, type, text, options, correct_answer, points, explanation",
    )
    .eq("quiz_template_id", quizId!)
    .order("position", { ascending: true });
  const questions = (questionsRaw ?? []) as QuizQuestion[];

  // Tentative existante (pour préserver les réponses des types non éditables).
  const { data: existing } = await supabase
    .from("quiz_attempts")
    .select("id, data")
    .eq("enrollment_id", enrollmentId)
    .eq("quiz_template_id", quizId!)
    .eq("phase", phase)
    .maybeSingle<{ id: string; data: QuizAttemptAnswer[] | null }>();
  if (!existing) redirect(`${redirectBase}?qerror=noattempt`);
  const prevByQ = new Map<string, QuizAttemptAnswer>();
  for (const a of existing!.data ?? []) prevByQ.set(a.question_id, a);

  const EDITABLE = new Set([
    "qcm_single",
    "qcm_multiple",
    "true_false",
    "text_exact",
    "scale_0_10",
  ]);

  const detailed: QuizAttemptAnswer[] = questions.map((q) => {
    let answer: QuizAttemptAnswer["answer"];
    if (!EDITABLE.has(q.type)) {
      // Types complexes (paires / remise en ordre) : on garde la réponse.
      answer = prevByQ.get(q.id)?.answer ?? null;
    } else {
      const raw = formData.getAll(`q:${q.id}`).map((v) => String(v));
      if (q.type === "qcm_multiple") {
        answer = raw;
      } else if (q.type === "true_false") {
        answer = raw[0] === "true" ? true : raw[0] === "false" ? false : null;
      } else if (q.type === "scale_0_10") {
        const n = Number(raw[0]);
        answer = Number.isFinite(n) ? n : null;
      } else {
        answer = raw[0] ?? null;
        if (answer === "") answer = null;
      }
    }
    const { is_correct, points_earned } = evaluateAnswer(q, answer);
    return { question_id: q.id, answer, is_correct, points_earned };
  });

  const score = detailed.reduce((s, a) => s + a.points_earned, 0);
  const max = maxScore(questions);

  await supabase
    .from("quiz_attempts")
    .update({
      data: detailed,
      score,
      max_score: max,
      edited_at: new Date().toISOString(),
      edited_by: user.id,
    })
    .eq("id", existing!.id);

  revalidatePath(redirectBase);
  revalidatePath(`/sessions/${sessionId}/quiz`);
  redirect(`${redirectBase}?qsaved=1`);
}
