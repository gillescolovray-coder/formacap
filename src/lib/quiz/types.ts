/**
 * Types du module Quiz d'évaluation (Q1).
 * Sprint Q : bibliothèque de quiz pré/post session.
 */

export type QuizStatus = "draft" | "pending_review" | "published" | "archived";

export const QUIZ_STATUS_LABELS: Record<QuizStatus, string> = {
  draft: "Brouillon",
  pending_review: "À valider",
  published: "Publié",
  archived: "Archivé",
};

export const QUIZ_STATUS_COLORS: Record<QuizStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  pending_review: "bg-amber-100 text-amber-800 border-amber-200",
  published: "bg-emerald-100 text-emerald-800 border-emerald-200",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
};

// ============================================================
// Types de questions
// ============================================================

export type QuestionType =
  | "qcm_single"
  | "qcm_multiple"
  | "true_false"
  | "text_exact"
  | "match_pairs"
  | "reorder";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  qcm_single: "QCM (1 bonne réponse)",
  qcm_multiple: "QCM (plusieurs bonnes réponses)",
  true_false: "Vrai / Faux",
  text_exact: "Réponse texte exacte",
  match_pairs: "Associer par paires",
  reorder: "Remettre dans l'ordre",
};

export type QuizOption = { id: string; label: string };

/** Paire pour les questions de type `match_pairs`. */
export type QuizPair = { id: string; left: string; right: string };
/** Item pour les questions de type `reorder` (ordre = ordre dans le tableau). */
export type QuizOrderItem = { id: string; label: string };

export type QuizQuestion = {
  id: string;
  quiz_template_id: string;
  position: number;
  type: QuestionType;
  text: string;
  /** QCM : tableau d'options. Null pour true_false / text_exact. */
  options: QuizOption[] | null;
  /**
   * Bonne(s) réponse(s).
   * - qcm_single   : id de l'option (string)
   * - qcm_multiple : ids d'options (string[])
   * - true_false   : boolean
   * - text_exact   : string attendu (comparaison insensible casse/accents)
   */
  correct_answer: string | string[] | boolean;
  points: number;
  explanation: string | null;
};

export type QuizTemplate = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  created_by_profile_id: string | null;
  created_by_trainer_id: string | null;
  created_at: string;
  updated_at: string;
};

// ============================================================
// Réponses apprenant (stockage dans quiz_attempts.data)
// ============================================================

export type QuizAttemptAnswer = {
  question_id: string;
  answer: string | string[] | boolean | null;
  is_correct: boolean;
  points_earned: number;
};

export type QuizAttempt = {
  id: string;
  enrollment_id: string;
  quiz_template_id: string;
  phase: "pre" | "post";
  started_at: string;
  completed_at: string | null;
  score: number | null;
  max_score: number | null;
  data: QuizAttemptAnswer[] | null;
};

// ============================================================
// Helpers de scoring
// ============================================================

/**
 * Normalise une chaîne pour la comparaison text_exact :
 * minuscules + supprime les accents + trim.
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Évalue la réponse d'un apprenant pour une question. Retourne
 * `{ is_correct, points_earned }`.
 *
 * - qcm_single   : exact match
 * - qcm_multiple : exact ensemble (ni plus ni moins). Partiel = 0.
 * - true_false   : exact match
 * - text_exact   : normalizeText match
 */
export function evaluateAnswer(
  question: QuizQuestion,
  answer: string | string[] | boolean | null,
): { is_correct: boolean; points_earned: number } {
  if (answer === null || answer === undefined) {
    return { is_correct: false, points_earned: 0 };
  }
  switch (question.type) {
    case "qcm_single": {
      const ok = answer === question.correct_answer;
      return { is_correct: ok, points_earned: ok ? question.points : 0 };
    }
    case "qcm_multiple": {
      const expected = (question.correct_answer as string[]) ?? [];
      const got = Array.isArray(answer) ? answer : [];
      const expectedSet = new Set(expected);
      const gotSet = new Set(got);
      const ok =
        expectedSet.size === gotSet.size &&
        Array.from(expectedSet).every((x) => gotSet.has(x));
      return { is_correct: ok, points_earned: ok ? question.points : 0 };
    }
    case "true_false": {
      const ok = answer === question.correct_answer;
      return { is_correct: ok, points_earned: ok ? question.points : 0 };
    }
    case "text_exact": {
      if (typeof answer !== "string") {
        return { is_correct: false, points_earned: 0 };
      }
      const expected = String(question.correct_answer ?? "");
      const ok = normalizeText(answer) === normalizeText(expected);
      return { is_correct: ok, points_earned: ok ? question.points : 0 };
    }
    case "match_pairs": {
      // correct_answer = { leftId: rightValueAttendu, ... } encodé dans
      // les `options` (chaque paire a son right correct). On compare
      // l'objet réponse de l'apprenant avec ce qui est attendu.
      const pairs = (question.options ?? []) as unknown as QuizPair[];
      if (typeof answer !== "object" || Array.isArray(answer)) {
        return { is_correct: false, points_earned: 0 };
      }
      const a = answer as unknown as Record<string, string>;
      let allOk = pairs.length > 0;
      for (const p of pairs) {
        if (normalizeText(a[p.id] ?? "") !== normalizeText(p.right)) {
          allOk = false;
          break;
        }
      }
      return { is_correct: allOk, points_earned: allOk ? question.points : 0 };
    }
    case "reorder": {
      // correct_answer = tableau d'ids dans l'ordre attendu.
      // L'apprenant fournit aussi un tableau d'ids dans l'ordre choisi.
      const expected = (question.correct_answer as string[]) ?? [];
      if (!Array.isArray(answer)) {
        return { is_correct: false, points_earned: 0 };
      }
      const got = answer as string[];
      const ok =
        expected.length > 0 &&
        expected.length === got.length &&
        expected.every((v, i) => v === got[i]);
      return { is_correct: ok, points_earned: ok ? question.points : 0 };
    }
  }
}

/** Score total possible d'un quiz. */
export function maxScore(questions: QuizQuestion[]): number {
  return questions.reduce((sum, q) => sum + q.points, 0);
}
