"use client";

import { useState } from "react";
import { Pencil, Save, X } from "lucide-react";
import type { QuizQuestion, QuizAttempt } from "@/lib/quiz/types";
import { saveQuizCorrection } from "../actions";

/**
 * Éditeur de correction d'une tentative quiz (réponse par réponse) — admin.
 * Le score est recalculé côté serveur. Masqué si résultats verrouillés.
 */
export function QuizCorrectionEditor({
  sessionId,
  enrollmentId,
  phase,
  phaseLabel,
  questions,
  attempt,
  locked,
}: {
  sessionId: string;
  enrollmentId: string;
  phase: "pre" | "post";
  phaseLabel: string;
  questions: QuizQuestion[];
  attempt: QuizAttempt | null;
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!attempt) return null;

  const current = new Map(
    (attempt.data ?? []).map((a) => [a.question_id, a.answer]),
  );

  if (locked) {
    return (
      <p className="text-[11px] text-zinc-400 italic">
        🔒 Résultats verrouillés — correction désactivée.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-amber-300 bg-white hover:bg-amber-50 text-amber-700 text-xs font-semibold"
      >
        <Pencil className="h-3.5 w-3.5" />
        Modifier les réponses ({phaseLabel})
      </button>
    );
  }

  return (
    <form
      action={saveQuizCorrection}
      className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-4"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="phase" value={phase} />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-amber-800">
          Correction des réponses — {phaseLabel}
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-zinc-400 hover:text-zinc-700"
          title="Annuler"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ol className="space-y-3 list-decimal list-inside">
        {questions.map((q) => {
          const ans = current.get(q.id) ?? null;
          return (
            <li key={q.id} className="text-sm">
              <span className="font-semibold text-zinc-800">{q.text}</span>
              <div className="mt-1.5 ml-4">
                {renderInput(q, ans)}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-2 rounded-md border border-zinc-300 text-sm font-medium hover:bg-zinc-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-bold hover:bg-amber-700"
        >
          <Save className="h-4 w-4" />
          Enregistrer & recalculer
        </button>
      </div>
    </form>
  );
}

function renderInput(
  q: QuizQuestion,
  ans: string | string[] | boolean | number | null,
) {
  const name = `q:${q.id}`;
  const opts = q.options ?? [];
  switch (q.type) {
    case "qcm_single":
      return (
        <div className="space-y-1">
          {opts.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-zinc-700">
              <input
                type="radio"
                name={name}
                value={o.id}
                defaultChecked={ans === o.id}
                className="h-4 w-4 text-amber-600"
              />
              {o.label}
              {q.correct_answer === o.id && (
                <span className="text-[10px] text-emerald-600 font-semibold">
                  (bonne réponse)
                </span>
              )}
            </label>
          ))}
        </div>
      );
    case "qcm_multiple": {
      const arr = Array.isArray(ans) ? ans : [];
      const correct = Array.isArray(q.correct_answer) ? q.correct_answer : [];
      return (
        <div className="space-y-1">
          {opts.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-zinc-700">
              <input
                type="checkbox"
                name={name}
                value={o.id}
                defaultChecked={arr.includes(o.id)}
                className="h-4 w-4 rounded text-amber-600"
              />
              {o.label}
              {correct.includes(o.id) && (
                <span className="text-[10px] text-emerald-600 font-semibold">
                  (bonne réponse)
                </span>
              )}
            </label>
          ))}
        </div>
      );
    }
    case "true_false":
      return (
        <div className="flex gap-4">
          {[
            { v: "true", label: "Vrai" },
            { v: "false", label: "Faux" },
          ].map((o) => (
            <label key={o.v} className="flex items-center gap-1.5 text-zinc-700">
              <input
                type="radio"
                name={name}
                value={o.v}
                defaultChecked={String(ans) === o.v}
                className="h-4 w-4 text-amber-600"
              />
              {o.label}
            </label>
          ))}
          <span className="text-[10px] text-emerald-600 font-semibold self-center">
            (bonne réponse : {q.correct_answer === true ? "Vrai" : "Faux"})
          </span>
        </div>
      );
    case "text_exact":
      return (
        <div>
          <input
            type="text"
            name={name}
            defaultValue={typeof ans === "string" ? ans : ""}
            className="w-full h-9 px-3 rounded-md border border-zinc-300 text-sm"
          />
          <p className="text-[10px] text-emerald-600 mt-0.5">
            Réponse attendue : {String(q.correct_answer ?? "")}
          </p>
        </div>
      );
    case "scale_0_10":
      return (
        <input
          type="number"
          min={0}
          max={10}
          name={name}
          defaultValue={typeof ans === "number" ? ans : ""}
          className="w-24 h-9 px-3 rounded-md border border-zinc-300 text-sm"
        />
      );
    default:
      return (
        <p className="text-[11px] text-zinc-400 italic">
          Type non éditable ici (réponse conservée).
        </p>
      );
  }
}
