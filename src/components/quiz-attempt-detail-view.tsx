import { CheckCircle2, XCircle } from "lucide-react";
import type { QuizAttempt, QuizQuestion } from "@/lib/quiz/types";

/**
 * Composant partage de rendu du detail d'un quiz joue par un apprenant.
 * Affiche les 2 phases (pre / post) cote a cote, question par question,
 * avec reponse donnee, bonne reponse, points et explication.
 *
 * Utilise par :
 * - /formateur/[token]/sessions/[sessionId]/quiz/[enrollmentId] (portail
 *   formateur)
 * - /(app)/sessions/[id]/quiz/[enrollmentId] (portail admin OF)
 *
 * Garantit une parite parfaite des 2 vues (Gilles 2026-05-28).
 */
type Props = {
  questions: QuizQuestion[];
  preAttempt: QuizAttempt | null;
  postAttempt: QuizAttempt | null;
};

export function QuizAttemptDetailView({
  questions,
  preAttempt,
  postAttempt,
}: Props) {
  return (
    <div className="space-y-5">
      {/* Recap scores en haut */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ScoreSummary label="Quiz d'entrée" attempt={preAttempt} />
        <ScoreSummary label="Quiz de sortie" attempt={postAttempt} />
      </div>

      {!preAttempt && !postAttempt ? (
        <div className="rounded-xl bg-zinc-50 border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600">
          Cet apprenant n&apos;a joué aucun quiz pour cette session.
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-800 uppercase tracking-wider border-b border-zinc-200 pb-1">
            Détail question par question
          </h2>
          {questions.map((q, idx) => {
            const preDetail = preAttempt?.data?.find(
              (d) => d.question_id === q.id,
            );
            const postDetail = postAttempt?.data?.find(
              (d) => d.question_id === q.id,
            );
            return (
              <section
                key={q.id}
                className="rounded-xl bg-white border border-zinc-200 shadow-sm p-4 space-y-3"
              >
                <h3 className="font-bold text-sm text-zinc-900">
                  <span className="text-amber-700">{idx + 1}.</span> {q.text}
                  <span className="text-[11px] font-normal text-zinc-500 ml-2">
                    ({q.points} pt{q.points > 1 ? "s" : ""})
                  </span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <PhaseColumn phase="pre" question={q} detail={preDetail} />
                  <PhaseColumn phase="post" question={q} detail={postDetail} />
                </div>

                {q.type !== "scale_0_10" && (
                  <div className="text-[12px] bg-emerald-50 border border-emerald-200 rounded p-2">
                    <strong className="text-emerald-800">
                      Bonne réponse :
                    </strong>{" "}
                    <span className="text-emerald-900">
                      {formatAnswer(q, q.correct_answer)}
                    </span>
                  </div>
                )}

                {q.explanation && (
                  <div className="text-[12px] bg-blue-50 border border-blue-200 rounded p-2">
                    <strong className="text-blue-800">💡 Explication :</strong>{" "}
                    <span className="text-blue-900">{q.explanation}</span>
                  </div>
                )}
              </section>
            );
          })}
        </section>
      )}
    </div>
  );
}

function ScoreSummary({
  label,
  attempt,
}: {
  label: string;
  attempt: QuizAttempt | null;
}) {
  if (!attempt) {
    return (
      <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 text-center">
        <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
          {label}
        </div>
        <div className="text-2xl font-bold text-zinc-400 mt-1">—</div>
        <div className="text-[11px] text-zinc-400 italic mt-1">Non joué</div>
      </div>
    );
  }
  const pct =
    attempt.score !== null && attempt.max_score
      ? Math.round((attempt.score / attempt.max_score) * 100)
      : null;
  const color =
    pct === null
      ? "text-zinc-700"
      : pct >= 75
        ? "text-emerald-700"
        : pct >= 50
          ? "text-amber-700"
          : "text-rose-700";
  const dt = attempt.completed_at ?? attempt.started_at;
  return (
    <div className="rounded-xl bg-white border border-amber-200 p-4 text-center">
      <div className="text-[10px] uppercase tracking-wider font-bold text-amber-700">
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>
        {attempt.score ?? "—"} / {attempt.max_score ?? "—"}
        {pct !== null && (
          <span className="text-base ml-2 opacity-80">({pct} %)</span>
        )}
      </div>
      {dt && (
        <div className="text-[11px] text-zinc-500 mt-1 tabular-nums">
          {new Date(dt).toLocaleString("fr-FR", {
            timeZone: "Europe/Paris",
            dateStyle: "short",
            timeStyle: "short",
          })}
        </div>
      )}
    </div>
  );
}

function PhaseColumn({
  phase,
  question,
  detail,
}: {
  phase: "pre" | "post";
  question: QuizQuestion;
  detail:
    | {
        question_id: string;
        answer: string | string[] | boolean | number | null;
        is_correct: boolean;
        points_earned: number;
      }
    | null
    | undefined;
}) {
  const isPre = phase === "pre";
  const phaseLabel = isPre ? "Avant" : "Après";
  const headerCls = isPre
    ? "bg-indigo-50 text-indigo-800 border-indigo-200"
    : "bg-violet-50 text-violet-800 border-violet-200";

  if (!detail) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50/50 p-3">
        <div
          className={`text-[10px] uppercase tracking-wider font-bold mb-1.5 inline-block px-2 py-0.5 rounded ${headerCls}`}
        >
          {phaseLabel}
        </div>
        <div className="text-xs text-zinc-400 italic">Pas de réponse</div>
      </div>
    );
  }

  const correct = detail.is_correct;
  const isAutoEval = question.type === "scale_0_10";

  return (
    <div
      className={
        "rounded-md border p-3 " +
        (isAutoEval
          ? "border-indigo-200 bg-indigo-50/30"
          : correct
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-rose-200 bg-rose-50/40")
      }
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${headerCls}`}
        >
          {phaseLabel}
        </span>
        {!isAutoEval && (
          <span
            className={
              "inline-flex items-center gap-1 text-[11px] font-bold " +
              (correct ? "text-emerald-700" : "text-rose-700")
            }
          >
            {correct ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {detail.points_earned} / {question.points} pt
            {question.points > 1 ? "s" : ""}
          </span>
        )}
        {isAutoEval && (
          <span className="text-[11px] text-indigo-700 font-semibold italic">
            Auto-évaluation
          </span>
        )}
      </div>
      <div className="text-sm text-zinc-900">
        {formatAnswer(question, detail.answer) || (
          <span className="text-zinc-400 italic">—</span>
        )}
      </div>
    </div>
  );
}

function formatAnswer(
  q: QuizQuestion,
  ans: string | string[] | boolean | number | null | undefined,
): string {
  if (ans === null || ans === undefined || ans === "") return "—";
  if (q.type === "true_false") {
    return ans === true ? "Vrai" : ans === false ? "Faux" : "—";
  }
  if (q.type === "qcm_single") {
    const id = ans as string;
    return q.options?.find((o) => o.id === id)?.label ?? id;
  }
  if (q.type === "qcm_multiple") {
    const ids = Array.isArray(ans) ? (ans as string[]) : [];
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
    return pairs.map((p) => `${p.left} → ${obj[p.id] ?? "—"}`).join(" · ");
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
