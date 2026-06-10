"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileQuestion, X, Eye, EyeOff, Printer } from "lucide-react";

/**
 * Consultation du QUIZ VIERGE par le formateur (Gilles 2026-06-09).
 * Affiche le questionnaire tel que l'apprenant le voit (sans réponses).
 * Un interrupteur permet d'afficher les réponses attendues pour préparer
 * l'animation. Rendu en portal (règle projet).
 */
export type BlankQuizQuestion = {
  id: string;
  position: number;
  type: string;
  text: string;
  options: unknown;
  correct_answer: unknown;
  points: number | null;
  explanation: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  single: "Choix unique",
  multiple: "Choix multiple",
  boolean: "Vrai / Faux",
  text: "Réponse libre",
  open: "Réponse libre",
};

function optionList(options: unknown): string[] {
  if (Array.isArray(options)) {
    return options.map((o) =>
      typeof o === "string"
        ? o
        : o && typeof o === "object" && "label" in o
          ? String((o as { label: unknown }).label ?? "")
          : String(o ?? ""),
    );
  }
  return [];
}

function answerText(correct: unknown): string {
  if (correct === null || correct === undefined) return "";
  if (typeof correct === "string" || typeof correct === "number")
    return String(correct);
  if (Array.isArray(correct)) return correct.map((c) => String(c)).join(", ");
  return JSON.stringify(correct);
}

export function BlankQuizButton({
  questions,
  quizTitle,
}: {
  questions: BlankQuizQuestion[];
  quizTitle?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  useEffect(() => setMounted(true), []);

  if (questions.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-800 text-sm font-semibold hover:bg-indigo-100"
        title="Voir le questionnaire vierge (tel que l'apprenant le voit)"
      >
        <FileQuestion className="h-4 w-4" />
        Consulter le quiz vierge
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] bg-black/40 flex items-start justify-center p-3 sm:p-6 overflow-y-auto print:bg-white print:p-0"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4 print:shadow-none print:my-0 print:max-w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <style>{`@media print { body * { visibility: hidden !important; } .blank-quiz, .blank-quiz * { visibility: visible !important; } .blank-quiz { position:absolute; inset:0; } .no-print { display:none !important; } }`}</style>

              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 no-print">
                <h3 className="font-bold text-sm text-zinc-900 inline-flex items-center gap-1.5">
                  <FileQuestion className="h-4 w-4 text-indigo-600" />
                  Quiz vierge {quizTitle ? `— ${quizTitle}` : ""}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAnswers((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-zinc-300 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    {showAnswers ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    {showAnswers ? "Masquer les réponses" : "Afficher les réponses"}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-zinc-300 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    title="Imprimer le questionnaire"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimer
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="blank-quiz p-4 sm:p-6 space-y-5">
                <h2 className="text-base font-bold text-zinc-900 hidden print:block">
                  Quiz {quizTitle ? `— ${quizTitle}` : ""}
                </h2>
                {questions
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((q, i) => {
                    const opts = optionList(q.options);
                    const ans = showAnswers ? answerText(q.correct_answer) : "";
                    return (
                      <div key={q.id} className="space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-indigo-900 shrink-0">
                            {i + 1}.
                          </span>
                          <div className="flex-1">
                            <p className="font-medium text-zinc-900">
                              {q.text}
                              <span className="ml-2 text-[10px] uppercase tracking-wider text-zinc-400">
                                {TYPE_LABELS[q.type] ?? q.type}
                                {q.points ? ` · ${q.points} pt` : ""}
                              </span>
                            </p>
                            {opts.length > 0 ? (
                              <ul className="mt-1.5 space-y-1">
                                {opts.map((o, oi) => (
                                  <li
                                    key={oi}
                                    className="flex items-center gap-2 text-sm text-zinc-700"
                                  >
                                    <span className="inline-block h-3.5 w-3.5 rounded-sm border border-zinc-400 shrink-0" />
                                    {o}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="mt-1.5 h-12 rounded-md border border-dashed border-zinc-300 bg-zinc-50" />
                            )}
                            {showAnswers && ans && (
                              <p className="mt-1.5 text-xs font-semibold text-emerald-700">
                                ✓ Réponse attendue : {ans}
                              </p>
                            )}
                            {showAnswers && q.explanation && (
                              <p className="mt-0.5 text-[11px] text-zinc-500 italic">
                                {q.explanation}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
