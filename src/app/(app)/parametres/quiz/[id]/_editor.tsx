"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Plus, Trash2, Check } from "lucide-react";
import {
  QUESTION_TYPE_LABELS,
  type QuestionType,
  type QuizOption,
  type QuizPair,
  type QuizQuestion,
} from "@/lib/quiz/types";
import {
  addQuestion,
  deleteQuestion,
  reorderQuestions,
  updateQuestion,
} from "../actions";

type Props = {
  quizId: string;
  initialQuestions: QuizQuestion[];
};

export function QuizEditor({ quizId, initialQuestions }: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialQuestions[0]?.id ?? null,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setQuestions(initialQuestions);
    if (!selectedId && initialQuestions.length > 0) {
      setSelectedId(initialQuestions[0].id);
    }
  }, [initialQuestions, selectedId]);

  const selected = questions.find((q) => q.id === selectedId) ?? null;

  function handleAddQuestion(type: QuestionType) {
    startTransition(async () => {
      const res = await addQuestion(quizId, type);
      if (res.ok && res.questionId) {
        setSelectedId(res.questionId);
        router.refresh();
      }
    });
  }

  function handleDelete(questionId: string) {
    if (!confirm("Supprimer cette question ?")) return;
    startTransition(async () => {
      const res = await deleteQuestion(questionId);
      if (res.ok) {
        // Sélectionne la précédente ou la première
        const idx = questions.findIndex((q) => q.id === questionId);
        const remaining = questions.filter((q) => q.id !== questionId);
        const next = remaining[Math.max(0, idx - 1)] ?? remaining[0] ?? null;
        setSelectedId(next?.id ?? null);
        router.refresh();
      }
    });
  }

  function handleReorderLocal(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const next = [...questions];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setQuestions(next);
    startTransition(async () => {
      await reorderQuestions(
        quizId,
        next.map((q) => q.id),
      );
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px] gap-5">
      {/* Panneau gauche : bloc Ajout en HAUT puis éditeur de la question */}
      <div className="min-w-0 space-y-4">
        {/* Bloc "Ajouter une question" — désormais à gauche, au-dessus de l'éditeur */}
        <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-white border-2 border-cyan-200 p-3 space-y-2 shadow-sm">
          <div className="text-xs uppercase tracking-wider font-bold text-cyan-700 mb-2 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Ajouter une question
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(
              [
                "qcm_single",
                "qcm_multiple",
                "true_false",
                "text_exact",
              ] as QuestionType[]
            ).map((type) => {
              const t = TYPE_STYLES[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleAddQuestion(type)}
                  disabled={isPending}
                  className="text-left text-xs px-2.5 py-2 rounded-lg bg-white border border-zinc-200 hover:border-cyan-400 hover:bg-cyan-50 hover:shadow-sm disabled:opacity-50 flex flex-col items-start gap-1 transition-all"
                >
                  <span className={`h-6 w-6 rounded ${t.bg} ${t.text} inline-flex items-center justify-center font-bold text-[10px] shrink-0`}>
                    {t.short}
                  </span>
                  <span className="text-zinc-700 font-medium leading-tight">
                    {QUESTION_TYPE_LABELS[type]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Éditeur de la question sélectionnée */}
        {selected ? (
          <QuestionEditor
            key={selected.id}
            question={selected}
            index={questions.findIndex((q) => q.id === selected.id) + 1}
            isPending={isPending}
            onSaved={(updated) => {
              setQuestions((prev) =>
                prev.map((q) => (q.id === updated.id ? updated : q)),
              );
              router.refresh();
            }}
            onDelete={() => handleDelete(selected.id)}
          />
        ) : (
          <div className="rounded-xl bg-gradient-to-b from-cyan-50/50 to-white border-2 border-dashed border-cyan-300 p-12 text-center">
            <div className="text-4xl mb-2">📝</div>
            <p className="text-sm font-bold text-zinc-700 mb-1">
              Aucune question pour ce quiz
            </p>
            <p className="text-xs text-zinc-500">
              Cliquez sur un type de question ci-dessus pour ajouter votre
              première question.
            </p>
          </div>
        )}
      </div>

      {/* Panneau droite : Liste des questions uniquement */}
      <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-gradient-to-r from-zinc-50 to-white border-b border-zinc-200">
            <div className="text-sm font-bold text-zinc-900">
              Liste des questions ({questions.length})
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Glissez-déposez pour réordonner
            </div>
          </div>
          <QuestionList
            questions={questions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={handleReorderLocal}
          />
        </div>
      </aside>
    </div>
  );
}

// ============================================================
// Styles par type de question
// ============================================================

const TYPE_STYLES: Record<
  QuestionType,
  { bg: string; text: string; badge: string; short: string }
> = {
  qcm_single: {
    bg: "bg-cyan-100",
    text: "text-cyan-700",
    badge: "bg-cyan-50 text-cyan-700 border-cyan-200",
    short: "1✓",
  },
  qcm_multiple: {
    bg: "bg-violet-100",
    text: "text-violet-700",
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    short: "N✓",
  },
  true_false: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    short: "V/F",
  },
  text_exact: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    short: "Aa",
  },
  match_pairs: {
    bg: "bg-pink-100",
    text: "text-pink-700",
    badge: "bg-pink-50 text-pink-700 border-pink-200",
    short: "↔",
  },
  reorder: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    badge: "bg-orange-50 text-orange-700 border-orange-200",
    short: "1→N",
  },
};

// ============================================================
// Liste draggable des questions
// ============================================================

function QuestionList({
  questions,
  selectedId,
  onSelect,
  onReorder,
}: {
  questions: QuizQuestion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
}) {
  const dragIdxRef = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  return (
    <ul className="divide-y divide-zinc-100">
      {questions.map((q, idx) => {
        const isSelected = q.id === selectedId;
        const t = TYPE_STYLES[q.type];
        return (
          <li
            key={q.id}
            draggable
            onDragStart={() => {
              dragIdxRef.current = idx;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (overIdx !== idx) setOverIdx(idx);
            }}
            onDragLeave={() => {
              if (overIdx === idx) setOverIdx(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragIdxRef.current;
              dragIdxRef.current = null;
              setOverIdx(null);
              if (from === null || from === idx) return;
              onReorder(from, idx);
            }}
            onDragEnd={() => {
              dragIdxRef.current = null;
              setOverIdx(null);
            }}
            className={
              isSelected
                ? "border-l-4 border-cyan-500 bg-cyan-50/60"
                : overIdx === idx
                  ? "border-l-4 border-cyan-300 bg-cyan-50/30"
                  : "border-l-4 border-transparent hover:bg-zinc-50/60"
            }
          >
            <button
              type="button"
              onClick={() => onSelect(q.id)}
              className="w-full text-left px-3 py-3 flex items-start gap-2.5"
            >
              <GripVertical className="h-4 w-4 text-zinc-400 shrink-0 cursor-grab mt-0.5" />
              <span
                className={`shrink-0 h-7 w-7 rounded-md ${
                  isSelected ? "bg-cyan-600 text-white" : "bg-zinc-100 text-zinc-700"
                } inline-flex items-center justify-center font-bold text-xs`}
              >
                {idx + 1}
              </span>
              <span className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span
                    className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${t.badge}`}
                  >
                    {t.short} · {QUESTION_TYPE_LABELS[q.type].split(" ")[0]}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-semibold">
                    {q.points} pt{q.points > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="text-sm text-zinc-800 leading-snug">
                  {q.text || (
                    <span className="italic text-zinc-400">
                      (sans énoncé — cliquez pour éditer)
                    </span>
                  )}
                </div>
              </span>
            </button>
          </li>
        );
      })}
      {questions.length === 0 && (
        <li className="p-6 text-sm text-zinc-500 italic text-center">
          Aucune question pour le moment.
          <br />
          <span className="text-xs">Ajoutez-en une via le menu ci-dessous ↓</span>
        </li>
      )}
    </ul>
  );
}

// ============================================================
// Formulaire d'édition d'une question (panneau gauche)
// ============================================================

function QuestionEditor({
  question,
  index,
  isPending,
  onSaved,
  onDelete,
}: {
  question: QuizQuestion;
  index: number;
  isPending: boolean;
  onSaved: (q: QuizQuestion) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(question.text);
  const [type, setType] = useState<QuestionType>(question.type);
  // `options` est utilisé pour qcm_single / qcm_multiple / reorder (format
  // {id, label}). Pour match_pairs (format {id, left, right}), on stocke
  // séparément dans `pairs`. Au save, on choisit le bon selon le type.
  const [options, setOptions] = useState<QuizOption[]>(
    question.type === "match_pairs"
      ? []
      : ((question.options ?? []) as unknown as QuizOption[]),
  );
  const [pairs, setPairs] = useState<QuizPair[]>(
    question.type === "match_pairs"
      ? ((question.options ?? []) as unknown as QuizPair[])
      : [],
  );
  const [correct, setCorrect] = useState<string | string[] | boolean>(
    question.correct_answer,
  );
  const [points, setPoints] = useState(question.points);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [savePending, startSave] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Réinitialise quand on change de question
  useEffect(() => {
    setText(question.text);
    setType(question.type);
    if (question.type === "match_pairs") {
      setPairs((question.options ?? []) as unknown as QuizPair[]);
      setOptions([]);
    } else {
      setOptions((question.options ?? []) as unknown as QuizOption[]);
      setPairs([]);
    }
    setCorrect(question.correct_answer);
    setPoints(question.points);
    setExplanation(question.explanation ?? "");
    setError(null);
  }, [question.id, question]);

  function handleTypeChange(newType: QuestionType) {
    setType(newType);
    // Reset options/correct selon le nouveau type
    if (newType === "qcm_single") {
      const opts =
        options.length >= 2
          ? options
          : [
              { id: "a", label: "Option A" },
              { id: "b", label: "Option B" },
            ];
      setOptions(opts);
      setPairs([]);
      setCorrect(opts[0].id);
    } else if (newType === "qcm_multiple") {
      const opts =
        options.length >= 2
          ? options
          : [
              { id: "a", label: "Option A" },
              { id: "b", label: "Option B" },
              { id: "c", label: "Option C" },
            ];
      setOptions(opts);
      setPairs([]);
      setCorrect([opts[0].id]);
    } else if (newType === "true_false") {
      setOptions([]);
      setPairs([]);
      setCorrect(true);
    } else if (newType === "text_exact") {
      setOptions([]);
      setPairs([]);
      setCorrect("");
    } else if (newType === "match_pairs") {
      const pp =
        pairs.length >= 2
          ? pairs
          : [
              { id: "p1", left: "Gauche 1", right: "Droite 1" },
              { id: "p2", left: "Gauche 2", right: "Droite 2" },
            ];
      setPairs(pp);
      setOptions([]);
      setCorrect(null as unknown as string);
    } else if (newType === "reorder") {
      const opts =
        options.length >= 2
          ? options
          : [
              { id: "i1", label: "Étape 1" },
              { id: "i2", label: "Étape 2" },
              { id: "i3", label: "Étape 3" },
            ];
      setOptions(opts);
      setPairs([]);
      setCorrect(opts.map((o) => o.id));
    }
  }

  function addOption() {
    const usedIds = new Set(options.map((o) => o.id));
    const nextLetter = "abcdefghijklmnopqrstuvwxyz"
      .split("")
      .find((l) => !usedIds.has(l));
    const id = nextLetter ?? `o${options.length}`;
    setOptions([...options, { id, label: `Option ${id.toUpperCase()}` }]);
  }

  function removeOption(id: string) {
    if (options.length <= 2) return;
    const next = options.filter((o) => o.id !== id);
    setOptions(next);
    // Nettoyer la correct_answer si elle référence l'option supprimée
    if (type === "qcm_single" && correct === id) {
      setCorrect(next[0]?.id ?? "");
    } else if (
      type === "qcm_multiple" &&
      Array.isArray(correct)
    ) {
      setCorrect(correct.filter((x) => x !== id));
    }
  }

  function updateOption(id: string, label: string) {
    setOptions(options.map((o) => (o.id === id ? { ...o, label } : o)));
  }

  function toggleMultipleCorrect(id: string) {
    if (!Array.isArray(correct)) return;
    setCorrect(
      correct.includes(id)
        ? correct.filter((x) => x !== id)
        : [...correct, id],
    );
  }

  function handleSave() {
    setError(null);
    // Pour match_pairs : on envoie `pairs` à la place de `options`.
    // Pour reorder : on resynchronise correct_answer avec l'ordre des items.
    const effectiveOptions =
      type === "match_pairs"
        ? (pairs as unknown as QuizOption[])
        : options.length > 0
          ? options
          : null;
    const effectiveCorrect =
      type === "reorder"
        ? options.map((o) => o.id)
        : type === "match_pairs"
          ? (null as unknown as string)
          : correct;
    startSave(async () => {
      const res = await updateQuestion(question.id, {
        text,
        type,
        options: effectiveOptions,
        correct_answer: effectiveCorrect,
        points,
        explanation: explanation || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setSavedAt(Date.now());
      onSaved({
        ...question,
        text,
        type,
        options: effectiveOptions,
        correct_answer: effectiveCorrect,
        points,
        explanation: explanation || null,
      });
    });
  }

  const typeStyle = TYPE_STYLES[type];

  return (
    <div className="rounded-xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
      {/* Header de l'éditeur — bandeau coloré selon le type */}
      <div className="px-5 py-3 bg-gradient-to-r from-zinc-50 to-white border-b border-zinc-200 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`h-10 w-10 rounded-lg ${typeStyle.bg} ${typeStyle.text} inline-flex items-center justify-center font-bold text-base shrink-0`}
          >
            {typeStyle.short}
          </span>
          <div>
            <h3 className="font-bold text-zinc-900 text-base">
              Question n°{index}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {QUESTION_TYPE_LABELS[type]}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="text-xs text-red-600 hover:text-red-800 inline-flex items-center gap-1 shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Supprimer
        </button>
      </div>

      <div className="p-5 space-y-4">

      {/* Type */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-700">
          Type de question
        </label>
        <select
          value={type}
          onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
          className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
        >
          {(
            [
              "qcm_single",
              "qcm_multiple",
              "true_false",
              "text_exact",
            ] as QuestionType[]
          ).map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Énoncé */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-700">Énoncé *</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          placeholder="Saisissez l'énoncé de la question"
        />
      </div>

      {/* Options (QCM) */}
      {(type === "qcm_single" || type === "qcm_multiple") && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-700">
              Options de réponse
              {type === "qcm_multiple" && (
                <span className="text-zinc-500 font-normal ml-1">
                  (coche les bonnes réponses)
                </span>
              )}
            </label>
            <button
              type="button"
              onClick={addOption}
              className="text-xs text-cyan-700 hover:underline inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Ajouter
            </button>
          </div>
          <ul className="space-y-1.5">
            {options.map((opt) => (
              <li key={opt.id} className="flex items-center gap-2">
                {type === "qcm_single" ? (
                  <input
                    type="radio"
                    checked={correct === opt.id}
                    onChange={() => setCorrect(opt.id)}
                    title="Bonne réponse"
                  />
                ) : (
                  <input
                    type="checkbox"
                    checked={
                      Array.isArray(correct) && correct.includes(opt.id)
                    }
                    onChange={() => toggleMultipleCorrect(opt.id)}
                    title="Bonne réponse"
                  />
                )}
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => updateOption(opt.id, e.target.value)}
                  className="flex-1 h-8 rounded-md border border-zinc-300 px-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeOption(opt.id)}
                  disabled={options.length <= 2}
                  className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={
                    options.length <= 2
                      ? "Minimum 2 options"
                      : "Supprimer cette option"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* True/False */}
      {type === "true_false" && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-700">
            Bonne réponse
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={correct === true}
                onChange={() => setCorrect(true)}
              />
              Vrai
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={correct === false}
                onChange={() => setCorrect(false)}
              />
              Faux
            </label>
          </div>
        </div>
      )}

      {/* Text exact */}
      {type === "text_exact" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-700">
            Réponse attendue
          </label>
          <input
            type="text"
            value={typeof correct === "string" ? correct : ""}
            onChange={(e) => setCorrect(e.target.value)}
            className="h-9 w-full rounded-md border border-zinc-300 px-3 text-sm"
            placeholder="Mot ou expression attendu"
          />
          <p className="text-[11px] text-zinc-500">
            Comparaison insensible à la casse et aux accents.
          </p>
        </div>
      )}

      {/* Match pairs — paires gauche/droite à associer */}
      {type === "match_pairs" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-700">
              Paires à associer
              <span className="text-zinc-500 font-normal ml-1">
                (chaque gauche doit retrouver sa droite)
              </span>
            </label>
            <button
              type="button"
              onClick={() => {
                const ids = new Set(pairs.map((p) => p.id));
                let n = pairs.length + 1;
                while (ids.has(`p${n}`)) n++;
                setPairs([
                  ...pairs,
                  { id: `p${n}`, left: "", right: "" },
                ]);
              }}
              className="text-xs text-cyan-700 hover:underline inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Ajouter une paire
            </button>
          </div>
          <div className="rounded-lg border border-pink-200 bg-pink-50/30 p-2 space-y-1.5">
            <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 text-[10px] uppercase tracking-wider font-bold text-zinc-500 px-1">
              <span>Côté gauche</span>
              <span />
              <span>Côté droit (associé)</span>
              <span />
            </div>
            {pairs.map((p, idx) => (
              <div
                key={p.id}
                className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center"
              >
                <input
                  type="text"
                  value={p.left}
                  onChange={(e) =>
                    setPairs(
                      pairs.map((x, i) =>
                        i === idx ? { ...x, left: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Ex : France"
                  className="h-8 rounded-md border border-zinc-300 px-2 text-sm bg-white"
                />
                <span className="text-pink-600 font-bold">↔</span>
                <input
                  type="text"
                  value={p.right}
                  onChange={(e) =>
                    setPairs(
                      pairs.map((x, i) =>
                        i === idx ? { ...x, right: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Ex : Paris"
                  className="h-8 rounded-md border border-zinc-300 px-2 text-sm bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (pairs.length <= 2) return;
                    setPairs(pairs.filter((_, i) => i !== idx));
                  }}
                  disabled={pairs.length <= 2}
                  className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={
                    pairs.length <= 2
                      ? "Minimum 2 paires"
                      : "Supprimer cette paire"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500">
            L&apos;apprenant verra la liste des « côtés gauches » et devra
            choisir pour chacun le « côté droit » correspondant. Les
            réponses droites lui seront proposées dans un ordre aléatoire.
          </p>
        </div>
      )}

      {/* Reorder — liste d'éléments dans l'ordre correct */}
      {type === "reorder" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-700">
              Éléments à remettre dans l&apos;ordre
              <span className="text-zinc-500 font-normal ml-1">
                (ordre correct = ordre saisi ici)
              </span>
            </label>
            <button
              type="button"
              onClick={() => {
                const ids = new Set(options.map((o) => o.id));
                let n = options.length + 1;
                while (ids.has(`i${n}`)) n++;
                setOptions([
                  ...options,
                  { id: `i${n}`, label: `Élément ${n}` },
                ]);
              }}
              className="text-xs text-cyan-700 hover:underline inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Ajouter un élément
            </button>
          </div>
          <ol className="rounded-lg border border-orange-200 bg-orange-50/30 p-2 space-y-1.5">
            {options.map((o, idx) => (
              <li
                key={o.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center"
              >
                <span className="shrink-0 h-7 w-7 rounded-md bg-orange-600 text-white inline-flex items-center justify-center font-bold text-xs">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={o.label}
                  onChange={(e) =>
                    setOptions(
                      options.map((x, i) =>
                        i === idx ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                  className="h-8 rounded-md border border-zinc-300 px-2 text-sm bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (idx === 0) return;
                    const arr = [...options];
                    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                    setOptions(arr);
                  }}
                  disabled={idx === 0}
                  className="text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed text-xs px-1"
                  title="Monter"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (idx === options.length - 1) return;
                    const arr = [...options];
                    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                    setOptions(arr);
                  }}
                  disabled={idx === options.length - 1}
                  className="text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed text-xs px-1"
                  title="Descendre"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (options.length <= 2) return;
                    setOptions(options.filter((_, i) => i !== idx));
                  }}
                  disabled={options.length <= 2}
                  className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={
                    options.length <= 2
                      ? "Minimum 2 éléments"
                      : "Supprimer cet élément"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-zinc-500">
            L&apos;apprenant verra les éléments dans un ordre aléatoire et
            devra les remettre dans l&apos;ordre saisi ici.
          </p>
        </div>
      )}

      {/* Points */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-700">Points</label>
        <input
          type="number"
          min={0}
          step={1}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          className="h-9 w-24 rounded-md border border-zinc-300 px-3 text-sm"
        />
      </div>

      {/* Explication */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-700">
          Explication (affichée dans le corrigé)
        </label>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Ex : Selon l'article L.2151-1 du Code de la commande publique..."
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={savePending || isPending}
          className="px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {savePending ? "Enregistrement…" : "Enregistrer la question"}
        </button>
        {savedAt && Date.now() - savedAt < 3000 && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Enregistré
          </span>
        )}
      </div>
      </div>
    </div>
  );
}
