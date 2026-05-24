/**
 * Composant partagé : taux de progression par question (pre vs post).
 *
 * Utilisé côté admin (/sessions/[id]/quiz) et côté portail formateur
 * (module Quiz dans la session). Le formateur peut ainsi identifier
 * les questions où la cohorte a peu progressé et adapter les futures
 * sessions.
 *
 * Gilles 2026-05-24 : "Le formateur peut consulter les résultats du
 * quiz d'entrée et de sortie et afficher un taux de progression par
 * question et sur l'ensemble."
 */

import { TrendingDown, TrendingUp } from "lucide-react";
import type { QuizAttempt, QuizQuestion } from "./types";

type Props = {
  questions: QuizQuestion[];
  attempts: QuizAttempt[];
};

type QuestionStat = {
  question: QuizQuestion;
  preCount: number;
  preCorrect: number;
  postCount: number;
  postCorrect: number;
};

function computeStats(
  questions: QuizQuestion[],
  attempts: QuizAttempt[],
): QuestionStat[] {
  return questions.map((q) => {
    let preCount = 0;
    let preCorrect = 0;
    let postCount = 0;
    let postCorrect = 0;
    for (const a of attempts) {
      const detail = (a.data ?? []).find((d) => d.question_id === q.id);
      if (!detail) continue;
      if (a.phase === "pre") {
        preCount++;
        if (detail.is_correct) preCorrect++;
      } else if (a.phase === "post") {
        postCount++;
        if (detail.is_correct) postCorrect++;
      }
    }
    return { question: q, preCount, preCorrect, postCount, postCorrect };
  });
}

function pct(num: number, denom: number): number | null {
  if (denom <= 0) return null;
  return Math.round((num / denom) * 100);
}

/**
 * Tableau par question : % bonnes réponses pré, % bonnes réponses post,
 * delta (en points de pourcentage). Les questions de type scale_0_10
 * (auto-évaluation) sont affichées avec la moyenne au lieu d'un %.
 */
export function QuizQuestionProgression({ questions, attempts }: Props) {
  const stats = computeStats(questions, attempts);

  // KPI global : moyenne des pourcentages corrects par question
  const validPreStats = stats.filter(
    (s) => s.preCount > 0 && s.question.type !== "scale_0_10",
  );
  const validPostStats = stats.filter(
    (s) => s.postCount > 0 && s.question.type !== "scale_0_10",
  );
  const globalPre =
    validPreStats.length > 0
      ? Math.round(
          validPreStats.reduce(
            (acc, s) => acc + (s.preCorrect / s.preCount) * 100,
            0,
          ) / validPreStats.length,
        )
      : null;
  const globalPost =
    validPostStats.length > 0
      ? Math.round(
          validPostStats.reduce(
            (acc, s) => acc + (s.postCorrect / s.postCount) * 100,
            0,
          ) / validPostStats.length,
        )
      : null;
  const globalDelta =
    globalPre !== null && globalPost !== null ? globalPost - globalPre : null;

  // Moyennes pour les questions d'auto-évaluation (scale_0_10)
  function avgScale(q: QuizQuestion, phase: "pre" | "post"): number | null {
    let sum = 0;
    let n = 0;
    for (const a of attempts) {
      if (a.phase !== phase) continue;
      const detail = (a.data ?? []).find((d) => d.question_id === q.id);
      if (!detail) continue;
      const v =
        typeof detail.answer === "number"
          ? detail.answer
          : Number(detail.answer);
      if (Number.isFinite(v)) {
        sum += v;
        n++;
      }
    }
    return n > 0 ? Math.round((sum / n) * 10) / 10 : null;
  }

  return (
    <section className="rounded-xl bg-white border border-zinc-200 p-4 sm:p-5 space-y-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-zinc-900">
            Progression par question
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Pourcentage d&apos;apprenants ayant la bonne réponse au pré-test
            vs au post-test.
          </p>
        </div>
        {globalDelta !== null && (
          <div
            className={
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold shrink-0 " +
              (globalDelta > 0
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : globalDelta < 0
                  ? "bg-rose-50 text-rose-800 border border-rose-200"
                  : "bg-zinc-50 text-zinc-700 border border-zinc-200")
            }
          >
            {globalDelta > 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            Progression globale :{" "}
            {globalDelta > 0 ? "+" : ""}
            {globalDelta} pts ({globalPre}% → {globalPost}%)
          </div>
        )}
      </header>

      {stats.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">Aucune question.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-xs sm:text-sm min-w-[640px]">
            <thead className="bg-zinc-50 text-left text-[10px] sm:text-xs uppercase tracking-wider text-zinc-500 font-bold border-b border-zinc-200">
              <tr>
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">Question</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Pré</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Post</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">
                  Δ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {stats.map((s, idx) => {
                const isScale = s.question.type === "scale_0_10";
                if (isScale) {
                  const a = avgScale(s.question, "pre");
                  const b = avgScale(s.question, "post");
                  const d =
                    a !== null && b !== null
                      ? Math.round((b - a) * 10) / 10
                      : null;
                  return (
                    <tr key={s.question.id}>
                      <td className="px-3 py-2 text-zinc-500 tabular-nums align-top">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-zinc-900">
                          {s.question.text}
                        </div>
                        <div className="text-[10px] text-violet-700 mt-0.5 font-semibold">
                          Auto-évaluation 0-10 — moyenne sur la cohorte
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums align-top">
                        {a !== null ? (
                          <span className="font-semibold">{a}/10</span>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                        <div className="text-[10px] text-zinc-400">
                          {s.preCount} rép.
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums align-top">
                        {b !== null ? (
                          <span className="font-semibold">{b}/10</span>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                        <div className="text-[10px] text-zinc-400">
                          {s.postCount} rép.
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums align-top">
                        {d === null ? (
                          <span className="text-zinc-300">—</span>
                        ) : (
                          <span
                            className={
                              d > 0
                                ? "text-emerald-700 font-bold"
                                : d < 0
                                  ? "text-rose-700 font-bold"
                                  : "text-zinc-600"
                            }
                          >
                            {d > 0 ? "+" : ""}
                            {d}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                }
                const prePct = pct(s.preCorrect, s.preCount);
                const postPct = pct(s.postCorrect, s.postCount);
                const delta =
                  prePct !== null && postPct !== null ? postPct - prePct : null;
                return (
                  <tr key={s.question.id}>
                    <td className="px-3 py-2 text-zinc-500 tabular-nums align-top">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-zinc-900">
                        {s.question.text}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        {s.question.points} pt
                        {s.question.points > 1 ? "s" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      {prePct !== null ? (
                        <span
                          className={
                            "font-semibold " +
                            (prePct >= 75
                              ? "text-emerald-700"
                              : prePct >= 50
                                ? "text-amber-700"
                                : "text-rose-700")
                          }
                        >
                          {prePct}%
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                      <div className="text-[10px] text-zinc-400">
                        {s.preCorrect}/{s.preCount}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      {postPct !== null ? (
                        <span
                          className={
                            "font-semibold " +
                            (postPct >= 75
                              ? "text-emerald-700"
                              : postPct >= 50
                                ? "text-amber-700"
                                : "text-rose-700")
                          }
                        >
                          {postPct}%
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                      <div className="text-[10px] text-zinc-400">
                        {s.postCorrect}/{s.postCount}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      {delta === null ? (
                        <span className="text-zinc-300">—</span>
                      ) : (
                        <span
                          className={
                            delta > 0
                              ? "text-emerald-700 font-bold"
                              : delta < 0
                                ? "text-rose-700 font-bold"
                                : "text-zinc-600"
                          }
                        >
                          {delta > 0 ? "+" : ""}
                          {delta} pts
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-zinc-400">
        Δ = progression en points de pourcentage entre le pré-test et le
        post-test. Les questions d&apos;auto-évaluation (0-10) affichent la
        moyenne au lieu d&apos;un %.
      </p>
    </section>
  );
}
