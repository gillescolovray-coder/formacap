"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import type { QuizAttempt, QuizQuestion } from "@/lib/quiz/types";
import { submitQuizAttempt } from "./actions";

type Props = {
  token: string;
  quizId: string;
  questions: QuizQuestion[];
  preAttempt: QuizAttempt | null;
  postAttempt: QuizAttempt | null;
};

export function QuizPlay({
  token,
  quizId,
  questions,
  preAttempt,
  postAttempt,
}: Props) {
  const router = useRouter();
  // Détermine la phase à jouer maintenant
  const phaseToPlay: "pre" | "post" | null = !preAttempt
    ? "pre"
    : !postAttempt
      ? "post"
      : null;

  const [answers, setAnswers] = useState<
    Record<string, string | string[] | boolean | number | null>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState<{
    phase: "pre" | "post";
    score: number;
    maxScore: number;
  } | null>(null);

  function setAnswer(
    questionId: string,
    value: string | string[] | boolean | number | null,
  ) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function toggleMultiAnswer(questionId: string, optionId: string) {
    setAnswers((prev) => {
      const current = prev[questionId];
      const arr = Array.isArray(current) ? current : [];
      const next = arr.includes(optionId)
        ? arr.filter((x) => x !== optionId)
        : [...arr, optionId];
      return { ...prev, [questionId]: next };
    });
  }

  async function handleSubmit() {
    if (!phaseToPlay) return;
    setError(null);
    setSubmitting(true);
    const res = await submitQuizAttempt({
      portalToken: token,
      quizId,
      phase: phaseToPlay,
      answers: questions.map((q) => ({
        question_id: q.id,
        answer: answers[q.id] ?? null,
      })),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "Erreur.");
      return;
    }
    setJustSubmitted({
      phase: phaseToPlay,
      score: res.score ?? 0,
      maxScore: res.maxScore ?? 0,
    });
    router.refresh();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Affichage après submit immédiat
  if (justSubmitted) {
    return (
      <ResultsView
        questions={questions}
        attempt={null}
        score={justSubmitted.score}
        maxScore={justSubmitted.maxScore}
        phase={justSubmitted.phase}
        otherAttempt={
          justSubmitted.phase === "pre" ? postAttempt : preAttempt
        }
        userAnswers={questions.map((q) => ({
          question_id: q.id,
          answer: answers[q.id] ?? null,
        }))}
      />
    );
  }

  // Si rien à faire, mode lecture pure (pré + post déjà faits)
  if (!phaseToPlay) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-2" />
          <h2 className="text-lg font-bold text-zinc-900">
            Quiz complété !
          </h2>
          <div className="grid grid-cols-2 gap-3 mt-4 max-w-md mx-auto">
            <ScoreCard label="Avant" attempt={preAttempt} />
            <ScoreCard label="Après" attempt={postAttempt} />
          </div>
          {preAttempt && postAttempt && (
            <ProgressBadge pre={preAttempt} post={postAttempt} />
          )}
        </div>
        {/* Corrigé du post si dispo */}
        {postAttempt && (
          <ResultsView
            questions={questions}
            attempt={postAttempt}
            score={postAttempt.score ?? 0}
            maxScore={postAttempt.max_score ?? 0}
            phase="post"
            otherAttempt={preAttempt}
          />
        )}
      </div>
    );
  }

  // Mode passation
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-sm text-violet-900">
        <strong>
          Phase {phaseToPlay === "pre" ? "1/2 — Avant la formation" : "2/2 — Après la formation"}
        </strong>{" "}
        — {questions.length} question{questions.length > 1 ? "s" : ""} ·
        Aucune note ne sera communiquée à votre employeur.
      </div>

      {questions.map((q, idx) => (
        <QuestionInput
          key={q.id}
          index={idx + 1}
          question={q}
          value={answers[q.id]}
          onChange={(v) => setAnswer(q.id, v)}
          onToggleMulti={(opt) => toggleMultiAnswer(q.id, opt)}
        />
      ))}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-700 disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {submitting ? "Envoi…" : "Envoyer mes réponses"}
      </button>
      <p className="text-[11px] text-zinc-500 text-center">
        Une fois envoyées, vos réponses ne pourront plus être modifiées.
      </p>
    </div>
  );
}

// ============================================================
// Saisie d'une question
// ============================================================

function QuestionInput({
  index,
  question,
  value,
  onChange,
  onToggleMulti,
}: {
  index: number;
  question: QuizQuestion;
  value: string | string[] | boolean | number | null | undefined;
  onChange: (v: string | string[] | boolean | number | null) => void;
  onToggleMulti: (optionId: string) => void;
}) {
  return (
    <section className="rounded-xl bg-white border border-zinc-200 p-4 space-y-3">
      <h3 className="font-bold text-zinc-900 text-sm">
        <span className="text-violet-600">{index}.</span> {question.text}
        <span className="text-xs text-zinc-500 ml-2">
          ({question.points} pt{question.points > 1 ? "s" : ""})
        </span>
      </h3>

      {question.type === "qcm_single" && question.options && (
        <div className="space-y-1.5">
          {question.options.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-zinc-50"
            >
              <input
                type="radio"
                name={question.id}
                checked={value === o.id}
                onChange={() => onChange(o.id)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === "qcm_multiple" && question.options && (
        <div className="space-y-1.5">
          {question.options.map((o) => {
            const arr = Array.isArray(value) ? value : [];
            return (
              <label
                key={o.id}
                className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={arr.includes(o.id)}
                  onChange={() => onToggleMulti(o.id)}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {question.type === "true_false" && (
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name={question.id}
              checked={value === true}
              onChange={() => onChange(true)}
            />
            Vrai
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name={question.id}
              checked={value === false}
              onChange={() => onChange(false)}
            />
            Faux
          </label>
        </div>
      )}

      {question.type === "text_exact" && (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Votre réponse…"
        />
      )}

      {question.type === "match_pairs" && question.options && (
        <MatchPairsInput
          questionId={question.id}
          pairs={
            question.options as unknown as Array<{
              id: string;
              left: string;
              right: string;
            }>
          }
          value={value}
          onChange={onChange}
        />
      )}

      {question.type === "reorder" && question.options && (
        <ReorderInput
          questionId={question.id}
          items={question.options as unknown as Array<{ id: string; label: string }>}
          value={value}
          onChange={onChange}
        />
      )}

      {question.type === "scale_0_10" && (
        <ScaleInput
          questionId={question.id}
          minLabel={
            question.options?.find((o) => o.id === "min")?.label ?? "Pas du tout"
          }
          maxLabel={
            question.options?.find((o) => o.id === "max")?.label ?? "Tout à fait"
          }
          value={typeof value === "number" ? value : null}
          onChange={(n) => onChange(n)}
        />
      )}
    </section>
  );
}

// ============================================================
// Saisie : Échelle 0 → 10
// ============================================================

function ScaleInput({
  questionId,
  minLabel,
  maxLabel,
  value,
  onChange,
}: {
  questionId: string;
  minLabel: string;
  maxLabel: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-11 gap-1"
        role="radiogroup"
        aria-label="Échelle de 0 à 10"
      >
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const checked = value === n;
          return (
            <label
              key={n}
              className={
                "cursor-pointer select-none flex items-center justify-center h-11 rounded-md border-2 text-sm font-bold transition-colors min-h-[44px] " +
                (checked
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white border-zinc-300 text-zinc-700 hover:border-indigo-400 hover:bg-indigo-50")
              }
            >
              <input
                type="radio"
                name={questionId}
                value={n}
                checked={checked}
                onChange={() => onChange(n)}
                className="sr-only"
              />
              {n}
            </label>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-zinc-500 px-0.5">
        <span className="italic">{minLabel}</span>
        <span className="italic">{maxLabel}</span>
      </div>
    </div>
  );
}

// ============================================================
// Saisie : MatchPairs et Reorder
// ============================================================

/** Shuffle déterministe basé sur une seed (la question id) pour que
 *  l'ordre mélangé soit STABLE entre les re-renders. */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const rand = () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return h / 0x7fffffff;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function MatchPairsInput({
  questionId,
  pairs,
  value,
  onChange,
}: {
  questionId: string;
  pairs: Array<{ id: string; left: string; right: string }>;
  value: string | string[] | boolean | number | null | undefined;
  onChange: (v: string | string[] | boolean | number | null) => void;
}) {
  // Liste mélangée des "right" (stable par question)
  const shuffledRights = seededShuffle(
    pairs.map((p) => p.right),
    questionId,
  );
  const answer =
    typeof value === "object" && !Array.isArray(value) && value !== null
      ? (value as unknown as Record<string, string>)
      : {};

  function setPair(leftId: string, right: string) {
    onChange({
      ...answer,
      [leftId]: right,
    } as unknown as string);
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-500">
        Pour chaque élément à gauche, choisissez sa correspondance dans la
        liste à droite.
      </p>
      <ul className="space-y-2">
        {pairs.map((p) => (
          <li
            key={p.id}
            className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center"
          >
            <span className="text-sm font-medium text-zinc-800 bg-zinc-50 rounded px-2 py-1.5 border border-zinc-200">
              {p.left}
            </span>
            <span className="text-pink-600 font-bold text-center">↔</span>
            <select
              value={answer[p.id] ?? ""}
              onChange={(e) => setPair(p.id, e.target.value)}
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
            >
              <option value="">— Choisir —</option>
              {shuffledRights.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReorderInput({
  questionId,
  items,
  value,
  onChange,
}: {
  questionId: string;
  items: Array<{ id: string; label: string }>;
  value: string | string[] | boolean | number | null | undefined;
  onChange: (v: string | string[] | boolean | number | null) => void;
}) {
  // Ordre actuel : valeur courante OU mélangé initial
  const currentOrder = Array.isArray(value)
    ? (value as string[])
    : seededShuffle(items.map((i) => i.id), questionId);

  // S'assurer que tous les ids sont présents (sinon initialise)
  const validOrder =
    currentOrder.length === items.length &&
    items.every((i) => currentOrder.includes(i.id))
      ? currentOrder
      : seededShuffle(items.map((i) => i.id), questionId);

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= validOrder.length) return;
    const arr = [...validOrder];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    onChange(arr);
  }

  const labelById = new Map(items.map((i) => [i.id, i.label]));

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-500">
        Réorganisez les éléments dans le bon ordre avec les flèches ▲▼.
      </p>
      <ol className="space-y-1.5">
        {validOrder.map((id, idx) => (
          <li
            key={id}
            className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center bg-zinc-50 rounded border border-zinc-200 px-2 py-1.5"
          >
            <span className="shrink-0 h-7 w-7 rounded bg-orange-600 text-white inline-flex items-center justify-center font-bold text-xs">
              {idx + 1}
            </span>
            <span className="text-sm font-medium text-zinc-800">
              {labelById.get(id) ?? id}
            </span>
            <button
              type="button"
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              className="text-zinc-600 hover:text-zinc-900 disabled:opacity-30 text-xs px-1.5 py-1 rounded hover:bg-white"
              title="Monter"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => move(idx, 1)}
              disabled={idx === validOrder.length - 1}
              className="text-zinc-600 hover:text-zinc-900 disabled:opacity-30 text-xs px-1.5 py-1 rounded hover:bg-white"
              title="Descendre"
            >
              ▼
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ============================================================
// Affichage des résultats après soumission
// ============================================================

function ResultsView({
  questions,
  attempt,
  score,
  maxScore,
  phase,
  otherAttempt,
  userAnswers,
}: {
  questions: QuizQuestion[];
  attempt: QuizAttempt | null;
  score: number;
  maxScore: number;
  phase: "pre" | "post";
  otherAttempt: QuizAttempt | null;
  userAnswers?: Array<{
    question_id: string;
    answer: string | string[] | boolean | number | null;
  }>;
}) {
  const data = attempt?.data ?? null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-2" />
        <h2 className="text-lg font-bold text-zinc-900">
          {phase === "pre" ? "Merci !" : "Bravo !"}
        </h2>
        <p className="text-sm text-zinc-600">
          Votre score :{" "}
          <strong className="text-violet-700 text-2xl">
            {score}/{maxScore}
          </strong>
        </p>
        {otherAttempt && (
          <p className="text-xs text-zinc-600 mt-1">
            Score précédent :{" "}
            <strong>
              {otherAttempt.score}/{otherAttempt.max_score}
            </strong>
          </p>
        )}
        {phase === "pre" && (
          <p className="text-xs text-violet-700 mt-2">
            Le quiz sera à rejouer en fin de session pour mesurer votre
            progression.
          </p>
        )}
      </div>

      <h3 className="font-bold text-zinc-900 text-sm pt-2">
        📝 Corrigé détaillé
      </h3>
      {questions.map((q, idx) => {
        const detail = data?.find((d) => d.question_id === q.id);
        const userInput =
          detail?.answer ??
          userAnswers?.find((a) => a.question_id === q.id)?.answer ??
          null;
        const isCorrect = detail?.is_correct ?? false;
        return (
          <section
            key={q.id}
            className={
              isCorrect
                ? "rounded-xl bg-emerald-50/40 border border-emerald-200 p-4 space-y-2"
                : "rounded-xl bg-rose-50/40 border border-rose-200 p-4 space-y-2"
            }
          >
            <div className="flex items-start gap-2">
              {isCorrect ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <h4 className="font-bold text-zinc-900 text-sm flex-1">
                <span
                  className={isCorrect ? "text-emerald-600" : "text-rose-600"}
                >
                  {idx + 1}.
                </span>{" "}
                {q.text}
              </h4>
            </div>
            <dl className="text-xs space-y-1">
              <div>
                <dt className="inline font-semibold text-zinc-600">
                  Votre réponse :{" "}
                </dt>
                <dd className="inline">
                  {formatAnswer(q, userInput) || "—"}
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold text-zinc-600">
                  {q.type === "scale_0_10" ? "Note saisie : " : "Bonne réponse : "}
                </dt>
                <dd className="inline">
                  {q.type === "scale_0_10"
                    ? "Auto-évaluation (pas de bonne réponse)"
                    : formatAnswer(q, q.correct_answer)}
                </dd>
              </div>
              {q.explanation && (
                <div className="bg-white border border-zinc-200 rounded p-2 mt-2">
                  <strong>💡 Explication :</strong> {q.explanation}
                </div>
              )}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

function formatAnswer(
  q: QuizQuestion,
  ans: string | string[] | boolean | number | null | undefined,
): string {
  if (ans === null || ans === undefined) return "—";
  if (q.type === "true_false") {
    return ans === true ? "Vrai" : ans === false ? "Faux" : "—";
  }
  if (q.type === "qcm_single") {
    const id = ans as string;
    return q.options?.find((o) => o.id === id)?.label ?? id;
  }
  if (q.type === "qcm_multiple") {
    const ids = ans as string[];
    return ids
      .map((id) => q.options?.find((o) => o.id === id)?.label ?? id)
      .join(", ");
  }
  if (q.type === "match_pairs") {
    const pairs = (q.options ?? []) as unknown as Array<{
      id: string;
      left: string;
      right: string;
    }>;
    if (typeof ans !== "object" || Array.isArray(ans)) return "—";
    const obj = ans as unknown as Record<string, string>;
    return pairs
      .map((p) => `${p.left} → ${obj[p.id] ?? "—"}`)
      .join(" · ");
  }
  if (q.type === "reorder") {
    const items = (q.options ?? []) as unknown as Array<{
      id: string;
      label: string;
    }>;
    const byId = new Map(items.map((i) => [i.id, i.label]));
    const ids = Array.isArray(ans) ? (ans as string[]) : [];
    return ids.map((id, i) => `${i + 1}. ${byId.get(id) ?? id}`).join(" → ");
  }
  if (q.type === "scale_0_10") {
    const n = typeof ans === "number" ? ans : Number(ans);
    if (!Number.isFinite(n)) return "—";
    return `${n} / 10`;
  }
  return String(ans);
}

function ScoreCard({
  label,
  attempt,
}: {
  label: string;
  attempt: QuizAttempt | null;
}) {
  if (!attempt) {
    return (
      <div className="rounded-lg bg-white border border-zinc-200 p-3 text-center opacity-50">
        <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
          {label}
        </div>
        <div className="text-xl font-bold text-zinc-400 mt-1">—</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-white border border-violet-200 p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider font-bold text-violet-700">
        {label}
      </div>
      <div className="text-2xl font-bold text-violet-900 mt-1 tabular-nums">
        {attempt.score}/{attempt.max_score}
      </div>
      <div className="text-[10px] text-zinc-500 mt-1">
        {new Date(attempt.completed_at ?? attempt.started_at).toLocaleDateString(
          "fr-FR",
        )}
      </div>
    </div>
  );
}

function ProgressBadge({
  pre,
  post,
}: {
  pre: QuizAttempt;
  post: QuizAttempt;
}) {
  const preScore = pre.score ?? 0;
  const postScore = post.score ?? 0;
  const delta = postScore - preScore;
  const max = post.max_score ?? 1;
  const pct = Math.round((delta / max) * 100);
  return (
    <div className="mt-3 text-sm">
      Progression :{" "}
      <strong
        className={
          delta > 0
            ? "text-emerald-700"
            : delta < 0
              ? "text-rose-700"
              : "text-zinc-700"
        }
      >
        {delta > 0 ? "+" : ""}
        {delta} pt{Math.abs(delta) > 1 ? "s" : ""} ({delta > 0 ? "+" : ""}
        {pct} %)
      </strong>
    </div>
  );
}
