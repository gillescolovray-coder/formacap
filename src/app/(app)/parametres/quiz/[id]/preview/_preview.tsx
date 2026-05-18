"use client";

import { useState } from "react";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import {
  evaluateAnswer,
  maxScore,
  type QuizQuestion,
} from "@/lib/quiz/types";

/**
 * Aperçu apprenant en mode DÉMO : reproduit l'UX de la page de passation
 * (/mon-parcours/<token>/quiz) mais sans soumission serveur. Le score est
 * calculé côté client, rien n'est persisté.
 */
export function QuizPreview({
  quiz,
  questions,
}: {
  quiz: {
    id: string;
    title: string;
    description: string | null;
  };
  questions: QuizQuestion[];
}) {
  const [answers, setAnswers] = useState<
    Record<string, string | string[] | boolean | null>
  >({});
  const [submitted, setSubmitted] = useState(false);

  function setAnswer(qid: string, v: string | string[] | boolean | null) {
    setAnswers((p) => ({ ...p, [qid]: v }));
  }
  function toggleMulti(qid: string, opt: string) {
    setAnswers((p) => {
      const cur = p[qid];
      const arr = Array.isArray(cur) ? cur : [];
      return {
        ...p,
        [qid]: arr.includes(opt)
          ? arr.filter((x) => x !== opt)
          : [...arr, opt],
      };
    });
  }

  const max = maxScore(questions);

  if (submitted) {
    const details = questions.map((q) => {
      const a = answers[q.id] ?? null;
      const { is_correct, points_earned } = evaluateAnswer(q, a);
      return { q, a, is_correct, points_earned };
    });
    const score = details.reduce((s, d) => s + d.points_earned, 0);
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-2" />
          <h2 className="text-lg font-bold">Aperçu — score simulé</h2>
          <p className="text-sm text-zinc-700">
            <strong className="text-violet-700 text-2xl">
              {score}/{max}
            </strong>
          </p>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setAnswers({});
            }}
            className="mt-3 text-xs text-cyan-700 hover:underline"
          >
            Recommencer l&apos;aperçu
          </button>
        </div>

        <h3 className="font-bold text-sm text-zinc-900 pt-2">📝 Corrigé</h3>
        {details.map((d, idx) => (
          <section
            key={d.q.id}
            className={
              d.is_correct
                ? "rounded-xl bg-emerald-50/40 border border-emerald-200 p-4 space-y-2"
                : "rounded-xl bg-rose-50/40 border border-rose-200 p-4 space-y-2"
            }
          >
            <div className="flex items-start gap-2">
              {d.is_correct ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <h4 className="font-bold text-zinc-900 text-sm flex-1">
                <span
                  className={
                    d.is_correct ? "text-emerald-600" : "text-rose-600"
                  }
                >
                  {idx + 1}.
                </span>{" "}
                {d.q.text}
              </h4>
            </div>
            <dl className="text-xs space-y-1">
              <div>
                <dt className="inline font-semibold text-zinc-600">
                  Réponse simulée :{" "}
                </dt>
                <dd className="inline">{formatAnswer(d.q, d.a) || "—"}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-zinc-600">
                  Bonne réponse :{" "}
                </dt>
                <dd className="inline">
                  {formatAnswer(d.q, d.q.correct_answer)}
                </dd>
              </div>
              {d.q.explanation && (
                <div className="bg-white border border-zinc-200 rounded p-2 mt-2">
                  <strong>💡 Explication :</strong> {d.q.explanation}
                </div>
              )}
            </dl>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="text-center space-y-1">
        <div className="text-xs uppercase tracking-widest text-violet-700 font-bold">
          Quiz d&apos;évaluation
        </div>
        <h1 className="text-xl font-bold text-zinc-900">{quiz.title}</h1>
        {quiz.description && (
          <p className="text-sm text-zinc-600">{quiz.description}</p>
        )}
      </header>

      {questions.map((q, idx) => (
        <section
          key={q.id}
          className="rounded-xl bg-white border border-zinc-200 p-4 space-y-3"
        >
          <h3 className="font-bold text-zinc-900 text-sm">
            <span className="text-violet-600">{idx + 1}.</span> {q.text}
            <span className="text-xs text-zinc-500 ml-2">
              ({q.points} pt{q.points > 1 ? "s" : ""})
            </span>
          </h3>

          {q.type === "qcm_single" && q.options && (
            <div className="space-y-1.5">
              {q.options.map((o) => (
                <label
                  key={o.id}
                  className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-zinc-50"
                >
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === o.id}
                    onChange={() => setAnswer(q.id, o.id)}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          )}
          {q.type === "qcm_multiple" && q.options && (
            <div className="space-y-1.5">
              {q.options.map((o) => {
                const arr = Array.isArray(answers[q.id])
                  ? (answers[q.id] as string[])
                  : [];
                return (
                  <label
                    key={o.id}
                    className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      checked={arr.includes(o.id)}
                      onChange={() => toggleMulti(q.id, o.id)}
                    />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </div>
          )}
          {q.type === "true_false" && (
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === true}
                  onChange={() => setAnswer(q.id, true)}
                />
                Vrai
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === false}
                  onChange={() => setAnswer(q.id, false)}
                />
                Faux
              </label>
            </div>
          )}
          {q.type === "text_exact" && (
            <input
              type="text"
              value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Votre réponse…"
            />
          )}
          {q.type === "match_pairs" && q.options && (
            <MatchPairsInput
              questionId={q.id}
              pairs={
                q.options as unknown as Array<{
                  id: string;
                  left: string;
                  right: string;
                }>
              }
              value={answers[q.id]}
              onChange={(v) => setAnswer(q.id, v)}
            />
          )}
          {q.type === "reorder" && q.options && (
            <ReorderInput
              questionId={q.id}
              items={q.options as unknown as Array<{ id: string; label: string }>}
              value={answers[q.id]}
              onChange={(v) => setAnswer(q.id, v)}
            />
          )}
        </section>
      ))}

      <button
        type="button"
        onClick={() => setSubmitted(true)}
        className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-700"
      >
        <Send className="h-4 w-4" />
        Voir le score simulé
      </button>
    </div>
  );
}

function formatAnswer(
  q: QuizQuestion,
  ans: string | string[] | boolean | null | undefined,
): string {
  if (ans === null || ans === undefined) return "—";
  if (q.type === "true_false") return ans === true ? "Vrai" : ans === false ? "Faux" : "—";
  if (q.type === "qcm_single") {
    return q.options?.find((o) => o.id === ans)?.label ?? String(ans);
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
  return String(ans);
}

// ============================================================
// Inputs : MatchPairs et Reorder
// ============================================================

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
  value: string | string[] | boolean | null | undefined;
  onChange: (v: string | string[] | boolean | null) => void;
}) {
  const shuffledRights = seededShuffle(pairs.map((p) => p.right), questionId);
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
  value: string | string[] | boolean | null | undefined;
  onChange: (v: string | string[] | boolean | null) => void;
}) {
  const currentOrder = Array.isArray(value)
    ? (value as string[])
    : seededShuffle(items.map((i) => i.id), questionId);

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
