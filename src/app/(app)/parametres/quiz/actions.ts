"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { QuestionType, QuizQuestion, QuizStatus } from "@/lib/quiz/types";

async function getCurrentOrgId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!data) throw new Error("Aucune organisation rattachée");
  return { organizationId: data.organization_id as string, userId: user.id };
}

export async function createQuiz(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrgId();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    redirect("/parametres/quiz?error=Titre%20requis");
  }
  const description = String(formData.get("description") ?? "").trim();

  const { data: quiz, error } = await supabase
    .from("quiz_templates")
    .insert({
      organization_id: organizationId,
      title,
      description: description || null,
      status: "draft" as QuizStatus,
      created_by_profile_id: userId,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !quiz) {
    redirect(
      `/parametres/quiz?error=${encodeURIComponent(error?.message ?? "Erreur")}`,
    );
  }

  revalidatePath("/parametres/quiz");
  redirect(`/parametres/quiz/${quiz!.id}`);
}

export async function updateQuizMeta(
  quizId: string,
  formData: FormData,
) {
  const supabase = await createClient();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "draft") as QuizStatus;

  const allowed: QuizStatus[] = ["draft", "pending_review", "published", "archived"];
  const safeStatus = allowed.includes(status) ? status : "draft";

  if (!title) {
    redirect(`/parametres/quiz/${quizId}?error=Titre%20requis`);
  }

  const { error } = await supabase
    .from("quiz_templates")
    .update({ title, description: description || null, status: safeStatus })
    .eq("id", quizId);

  if (error) {
    redirect(
      `/parametres/quiz/${quizId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/parametres/quiz/${quizId}`);
  revalidatePath("/parametres/quiz");
  redirect(`/parametres/quiz/${quizId}?saved=1`);
}

export async function deleteQuiz(quizId: string) {
  const supabase = await createClient();
  await supabase.from("quiz_templates").delete().eq("id", quizId);
  revalidatePath("/parametres/quiz");
  redirect("/parametres/quiz?deleted=1");
}

// ============================================================
// Questions (Q2)
// ============================================================

export type AddQuestionResult = { ok: boolean; questionId?: string; error?: string };

/**
 * Crée une nouvelle question vide à la fin du quiz. Retourne son id
 * pour permettre au client de la sélectionner et l'éditer.
 */
export async function addQuestion(
  quizId: string,
  type: QuestionType,
): Promise<AddQuestionResult> {
  const supabase = await createClient();

  // Position = max actuel + 1
  const { data: last } = await supabase
    .from("quiz_questions")
    .select("position")
    .eq("quiz_template_id", quizId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();
  const nextPos = (last?.position ?? -1) + 1;

  // Defaults par type
  let options: unknown = null;
  let correctAnswer: unknown = null;
  if (type === "qcm_single") {
    options = [
      { id: "a", label: "Option A" },
      { id: "b", label: "Option B" },
    ];
    correctAnswer = "a";
  } else if (type === "qcm_multiple") {
    options = [
      { id: "a", label: "Option A" },
      { id: "b", label: "Option B" },
      { id: "c", label: "Option C" },
    ];
    correctAnswer = ["a"];
  } else if (type === "true_false") {
    correctAnswer = true;
  } else if (type === "match_pairs") {
    // Pour match_pairs : options = paires {id, left, right}.
    // correct_answer reste null car la vérité est dans les paires
    // elles-mêmes (left correspond à right par construction).
    options = [
      { id: "p1", left: "Gauche 1", right: "Droite 1" },
      { id: "p2", left: "Gauche 2", right: "Droite 2" },
    ];
    correctAnswer = null;
  } else if (type === "reorder") {
    // Pour reorder : options = items dans l'ordre correct.
    // correct_answer = tableau d'ids dans cet ordre.
    options = [
      { id: "i1", label: "Étape 1" },
      { id: "i2", label: "Étape 2" },
      { id: "i3", label: "Étape 3" },
    ];
    correctAnswer = ["i1", "i2", "i3"];
  } else {
    correctAnswer = "";
  }

  const { data, error } = await supabase
    .from("quiz_questions")
    .insert({
      quiz_template_id: quizId,
      position: nextPos,
      type,
      text: "Nouvelle question",
      options,
      correct_answer: correctAnswer,
      points: 1,
      explanation: null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Erreur" };
  }

  revalidatePath(`/parametres/quiz/${quizId}`);
  return { ok: true, questionId: data.id };
}

export type UpdateQuestionPayload = {
  text: string;
  type: QuestionType;
  options: Array<{ id: string; label: string }> | null;
  correct_answer: string | string[] | boolean;
  points: number;
  explanation: string | null;
};

export async function updateQuestion(
  questionId: string,
  payload: UpdateQuestionPayload,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  if (!payload.text || payload.text.trim().length === 0) {
    return { ok: false, error: "L'énoncé est obligatoire." };
  }

  const { data: q, error: fetchError } = await supabase
    .from("quiz_questions")
    .select("quiz_template_id")
    .eq("id", questionId)
    .maybeSingle<{ quiz_template_id: string }>();
  if (fetchError || !q) {
    return { ok: false, error: "Question introuvable." };
  }

  const { error } = await supabase
    .from("quiz_questions")
    .update({
      text: payload.text.trim(),
      type: payload.type,
      options: payload.options,
      correct_answer: payload.correct_answer,
      points: Math.max(0, Math.round(payload.points)),
      explanation: payload.explanation?.trim() || null,
    })
    .eq("id", questionId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/parametres/quiz/${q.quiz_template_id}`);
  return { ok: true };
}

export async function deleteQuestion(
  questionId: string,
): Promise<{ ok: boolean; quizId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: q } = await supabase
    .from("quiz_questions")
    .select("quiz_template_id")
    .eq("id", questionId)
    .maybeSingle<{ quiz_template_id: string }>();
  if (!q) return { ok: false, error: "Question introuvable." };
  const { error } = await supabase
    .from("quiz_questions")
    .delete()
    .eq("id", questionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/parametres/quiz/${q.quiz_template_id}`);
  return { ok: true, quizId: q.quiz_template_id };
}

/**
 * Réordonne les questions d'un quiz selon l'ordre fourni. On UPDATE
 * la `position` de chaque ligne pour matcher l'index dans le tableau.
 */
export async function reorderQuestions(
  quizId: string,
  idsInOrder: string[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  // Update individuel — Supabase ne supporte pas l'UPDATE batch
  // multi-CASE en une requête simple, donc on boucle.
  for (let i = 0; i < idsInOrder.length; i++) {
    const { error } = await supabase
      .from("quiz_questions")
      .update({ position: i })
      .eq("id", idsInOrder[i])
      .eq("quiz_template_id", quizId);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath(`/parametres/quiz/${quizId}`);
  return { ok: true };
}

export async function duplicateQuiz(quizId: string) {
  const { organizationId, userId } = await getCurrentOrgId();
  const supabase = await createClient();

  const { data: src } = await supabase
    .from("quiz_templates")
    .select("title, description")
    .eq("id", quizId)
    .maybeSingle<{ title: string; description: string | null }>();
  if (!src) {
    redirect("/parametres/quiz");
  }

  const { data: copy } = await supabase
    .from("quiz_templates")
    .insert({
      organization_id: organizationId,
      title: `${src!.title} (copie)`,
      description: src!.description,
      status: "draft" as QuizStatus,
      created_by_profile_id: userId,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (!copy) {
    redirect("/parametres/quiz?error=Duplication%20impossible");
  }

  // Copier les questions
  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("quiz_template_id", quizId)
    .order("position", { ascending: true });
  if (questions && questions.length > 0) {
    const rows = (questions as Array<Partial<QuizQuestion>>).map((q) => ({
      quiz_template_id: copy!.id,
      position: q.position ?? 0,
      type: q.type,
      text: q.text,
      options: q.options ?? null,
      correct_answer: q.correct_answer,
      points: q.points ?? 1,
      explanation: q.explanation ?? null,
    }));
    await supabase.from("quiz_questions").insert(rows);
  }

  revalidatePath("/parametres/quiz");
  redirect(`/parametres/quiz/${copy!.id}`);
}
