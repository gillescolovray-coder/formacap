"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import type {
  FormStructure,
  Question,
  QuestionType,
  Section,
} from "@/lib/positioning/form-structure";
import { QUESTION_TYPE_LABELS } from "@/lib/positioning/form-structure";

type Props = {
  mode: "new" | "edit";
  initial: {
    title: string;
    description: string;
    isDefault: boolean;
    structure: FormStructure;
  };
  initiallyDefault?: boolean;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  initialError?: string;
};

/** Génère une structure vide pour démarrer. */
export function makeEmptyStructure(): FormStructure {
  return {
    intro: { instructions: "", important_note: "" },
    sections: [
      {
        title: "Votre expérience",
        questions: [
          {
            type: "radio",
            text: "Question 1 — modifier ce texte",
            required: true,
            options: ["Option 1", "Option 2", "Option 3"],
          },
        ],
      },
    ],
  };
}

/** Génère une question vierge du type demandé. */
function makeEmptyQuestion(type: QuestionType): Question {
  switch (type) {
    case "text_short":
      return { type, text: "", required: false };
    case "text_long":
      return { type, text: "", required: false, rows: 4 };
    case "radio":
      return {
        type,
        text: "",
        required: true,
        options: ["Option 1", "Option 2"],
      };
    case "checkbox":
      return { type, text: "", options: ["Option 1", "Option 2"], allow_other: false };
    case "yes_no":
      return { type, text: "", required: true };
    case "yes_no_text":
      return { type, text: "", required: true, followup_label: "Si oui, précisez :" };
    case "matrix":
      return {
        type,
        text: "",
        rows: ["Ligne 1", "Ligne 2"],
        cols: ["Colonne 1", "Colonne 2", "Colonne 3"],
      };
  }
}

export function PositioningFormBuilderEditor({
  mode,
  initial,
  initiallyDefault = false,
  action,
  submitLabel,
  initialError,
}: Props) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [isDefault, setIsDefault] = useState(initial.isDefault);
  const [structure, setStructure] = useState<FormStructure>(
    initial.structure ?? makeEmptyStructure(),
  );
  const [pending, startTransition] = useTransition();

  const isBecomingDefault = isDefault && !initiallyDefault;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("structure", JSON.stringify(structure));
    startTransition(async () => {
      await action(fd);
    });
  }

  // === Manipulation de la structure ===

  function updateIntro(patch: Partial<FormStructure["intro"]>) {
    setStructure({
      ...structure,
      intro: { ...(structure.intro ?? {}), ...patch },
    });
  }

  function addSection() {
    setStructure({
      ...structure,
      sections: [
        ...structure.sections,
        { title: "Nouvelle section", questions: [] },
      ],
    });
  }

  function updateSection(idx: number, patch: Partial<Section>) {
    const next = [...structure.sections];
    next[idx] = { ...next[idx], ...patch };
    setStructure({ ...structure, sections: next });
  }

  function removeSection(idx: number) {
    const sec = structure.sections[idx];
    if (
      !confirm(
        `Supprimer la section « ${sec.title} » et toutes ses ${sec.questions.length} question(s) ?`,
      )
    )
      return;
    setStructure({
      ...structure,
      sections: structure.sections.filter((_, i) => i !== idx),
    });
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= structure.sections.length) return;
    const next = [...structure.sections];
    [next[idx], next[target]] = [next[target], next[idx]];
    setStructure({ ...structure, sections: next });
  }

  function addQuestion(sectionIdx: number, type: QuestionType) {
    const next = [...structure.sections];
    next[sectionIdx] = {
      ...next[sectionIdx],
      questions: [...next[sectionIdx].questions, makeEmptyQuestion(type)],
    };
    setStructure({ ...structure, sections: next });
  }

  function updateQuestion(
    sectionIdx: number,
    questionIdx: number,
    patch: Partial<Question>,
  ) {
    const next = [...structure.sections];
    const newQuestions = [...next[sectionIdx].questions];
    newQuestions[questionIdx] = {
      ...newQuestions[questionIdx],
      ...patch,
    } as Question;
    next[sectionIdx] = { ...next[sectionIdx], questions: newQuestions };
    setStructure({ ...structure, sections: next });
  }

  function removeQuestion(sectionIdx: number, questionIdx: number) {
    const next = [...structure.sections];
    next[sectionIdx] = {
      ...next[sectionIdx],
      questions: next[sectionIdx].questions.filter((_, i) => i !== questionIdx),
    };
    setStructure({ ...structure, sections: next });
  }

  function moveQuestion(
    sectionIdx: number,
    questionIdx: number,
    dir: -1 | 1,
  ) {
    const target = questionIdx + dir;
    const arr = structure.sections[sectionIdx].questions;
    if (target < 0 || target >= arr.length) return;
    const next = [...structure.sections];
    const newQuestions = [...arr];
    [newQuestions[questionIdx], newQuestions[target]] = [
      newQuestions[target],
      newQuestions[questionIdx],
    ];
    next[sectionIdx] = { ...next[sectionIdx], questions: newQuestions };
    setStructure({ ...structure, sections: next });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {initialError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {initialError}
        </div>
      )}

      {/* Identification */}
      <section className="rounded-xl bg-white border border-zinc-200 p-4 sm:p-5 space-y-3">
        <header>
          <h2 className="text-sm font-bold text-zinc-900">Identification</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Nom interne de ce template (visible dans les dropdowns
            formation/session).
          </p>
        </header>
        <label className="space-y-1 block">
          <span className="text-xs font-medium text-zinc-700">
            Titre <span className="text-red-500">*</span>
          </span>
          <input
            name="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex : Test BTP — Marchés publics"
            className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
          />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs font-medium text-zinc-700">
            Description (optionnelle)
          </span>
          <textarea
            name="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="À quoi sert ce template, à quelles formations le rattacher…"
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none resize-none"
          />
        </label>
        <label className="flex items-start gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            name="is_default"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-amber-600 cursor-pointer"
          />
          <span className="text-xs text-zinc-700 flex-1">
            <span className="font-semibold flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-amber-600" />
              Définir comme template « par défaut »
            </span>
            <span className="text-zinc-500 block mt-0.5">
              Appliqué automatiquement aux sessions sans assignation
              spécifique.
              {isBecomingDefault && (
                <span className="block text-amber-700 font-semibold mt-1">
                  ⚠ L&apos;ancien template par défaut sera automatiquement
                  déclassé.
                </span>
              )}
            </span>
          </span>
        </label>
      </section>

      {/* Introduction du test */}
      <section className="rounded-xl bg-white border border-zinc-200 p-4 sm:p-5 space-y-3">
        <header>
          <h2 className="text-sm font-bold text-zinc-900">
            Introduction (optionnelle)
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Texte affiché en haut du test, avant les sections.
          </p>
        </header>
        <label className="space-y-1 block">
          <span className="text-xs font-medium text-zinc-700">
            Instructions générales
          </span>
          <textarea
            rows={3}
            value={structure.intro?.instructions ?? ""}
            onChange={(e) => updateIntro({ instructions: e.target.value })}
            placeholder="Ex : Afin d'adapter la formation à votre niveau…"
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none resize-y"
          />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs font-medium text-zinc-700">
            Note importante (encart rouge ⚠)
          </span>
          <textarea
            rows={3}
            value={structure.intro?.important_note ?? ""}
            onChange={(e) => updateIntro({ important_note: e.target.value })}
            placeholder="Ex : Apporter une CLE USB contenant les pièces du marché…"
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-200 outline-none resize-y bg-red-50/30"
          />
          <span className="text-[10px] text-zinc-500">
            Utile pour indiquer un prérequis matériel ou un document à
            apporter le jour J.
          </span>
        </label>
      </section>

      {/* Sections + questions */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900">
            Sections et questions
          </h2>
          <span className="text-[11px] text-zinc-500">
            {structure.sections.length} section
            {structure.sections.length > 1 ? "s" : ""} ·{" "}
            {structure.sections.reduce(
              (acc, s) => acc + s.questions.length,
              0,
            )}{" "}
            question
            {structure.sections.reduce(
              (acc, s) => acc + s.questions.length,
              0,
            ) > 1
              ? "s"
              : ""}
          </span>
        </header>

        {structure.sections.map((section, sIdx) => (
          <SectionEditor
            key={sIdx}
            section={section}
            sectionIdx={sIdx}
            isFirst={sIdx === 0}
            isLast={sIdx === structure.sections.length - 1}
            onUpdate={(patch) => updateSection(sIdx, patch)}
            onRemove={() => removeSection(sIdx)}
            onMove={(dir) => moveSection(sIdx, dir)}
            onAddQuestion={(type) => addQuestion(sIdx, type)}
            onUpdateQuestion={(qIdx, patch) =>
              updateQuestion(sIdx, qIdx, patch)
            }
            onRemoveQuestion={(qIdx) => removeQuestion(sIdx, qIdx)}
            onMoveQuestion={(qIdx, dir) => moveQuestion(sIdx, qIdx, dir)}
          />
        ))}

        <button
          type="button"
          onClick={addSection}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-amber-800 bg-white border-2 border-dashed border-amber-400 hover:border-amber-600 hover:bg-amber-50 px-4 py-3 rounded-lg"
        >
          <Plus className="h-4 w-4" />
          Ajouter une section
        </button>
      </section>

      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Sparkles className="h-4 w-4" />
          {pending ? "Enregistrement…" : submitLabel}
        </button>
      </div>
      <p className="text-[11px] text-zinc-400 text-right">
        💡 Les sections « Informations participant » (en haut) et
        « Validation participant » (signature en bas) sont ajoutées
        automatiquement par l&apos;app — pas besoin de les recréer ici.
      </p>
    </form>
  );
}

// ============================================================
// SectionEditor
// ============================================================

function SectionEditor({
  section,
  sectionIdx,
  isFirst,
  isLast,
  onUpdate,
  onRemove,
  onMove,
  onAddQuestion,
  onUpdateQuestion,
  onRemoveQuestion,
  onMoveQuestion,
}: {
  section: Section;
  sectionIdx: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (patch: Partial<Section>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onAddQuestion: (type: QuestionType) => void;
  onUpdateQuestion: (qIdx: number, patch: Partial<Question>) => void;
  onRemoveQuestion: (qIdx: number) => void;
  onMoveQuestion: (qIdx: number, dir: -1 | 1) => void;
}) {
  const [addType, setAddType] = useState<QuestionType>("radio");

  return (
    <section className="rounded-xl bg-zinc-50 border border-zinc-300 p-3 sm:p-4 space-y-3">
      <header className="flex items-start gap-2">
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 h-5 w-5 flex items-center justify-center"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 h-5 w-5 flex items-center justify-center"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 h-6 w-6 rounded bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
              {sectionIdx + 1}
            </span>
            <input
              type="text"
              value={section.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="Titre de la section"
              className="flex-1 h-8 rounded-md border border-zinc-300 px-2 text-sm font-bold focus:border-blue-500 outline-none bg-white"
            />
          </div>
          <input
            type="text"
            value={section.intro ?? ""}
            onChange={(e) => onUpdate({ intro: e.target.value })}
            placeholder="Sous-titre (optionnel)"
            className="w-full h-7 rounded border border-zinc-200 px-2 text-xs focus:border-blue-500 outline-none bg-white"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded p-1 shrink-0"
          title="Supprimer cette section"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      {/* Questions */}
      <div className="space-y-2 pl-2">
        {section.questions.length === 0 ? (
          <p className="text-xs text-zinc-500 italic">Aucune question.</p>
        ) : (
          section.questions.map((q, qIdx) => (
            <QuestionEditor
              key={qIdx}
              question={q}
              qIdx={qIdx}
              isFirst={qIdx === 0}
              isLast={qIdx === section.questions.length - 1}
              onUpdate={(patch) => onUpdateQuestion(qIdx, patch)}
              onRemove={() => onRemoveQuestion(qIdx)}
              onMove={(dir) => onMoveQuestion(qIdx, dir)}
            />
          ))
        )}

        <div className="flex items-center gap-2 pt-1">
          <select
            value={addType}
            onChange={(e) => setAddType(e.target.value as QuestionType)}
            className="h-8 rounded-md border border-zinc-300 px-2 text-xs bg-white"
          >
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map(
              (t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t]}
                </option>
              ),
            )}
          </select>
          <button
            type="button"
            onClick={() => onAddQuestion(addType)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-white border border-dashed border-blue-400 hover:border-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-md"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter cette question
          </button>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// QuestionEditor
// ============================================================

function QuestionEditor({
  question,
  qIdx,
  isFirst,
  isLast,
  onUpdate,
  onRemove,
  onMove,
}: {
  question: Question;
  qIdx: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (patch: Partial<Question>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="bg-white rounded-md border border-zinc-200 p-2 sm:p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex flex-col shrink-0">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 h-4 w-4 flex items-center justify-center"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 h-4 w-4 flex items-center justify-center"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        <GripVertical className="h-4 w-4 text-zinc-300 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold shrink-0">
              Q{qIdx + 1} · {QUESTION_TYPE_LABELS[question.type]}
            </span>
          </div>
          <input
            type="text"
            value={question.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            placeholder="Texte de la question"
            className="w-full h-8 rounded border border-zinc-200 px-2 text-sm focus:border-blue-500 outline-none"
          />
          <QuestionTypeSpecific question={question} onUpdate={onUpdate} />
          {(question.type === "text_short" ||
            question.type === "text_long" ||
            question.type === "radio" ||
            question.type === "yes_no" ||
            question.type === "yes_no_text") && (
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <input
                type="checkbox"
                checked={"required" in question && question.required === true}
                onChange={(e) =>
                  onUpdate({ required: e.target.checked } as Partial<Question>)
                }
                className="h-3.5 w-3.5"
              />
              Réponse obligatoire
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded p-1 shrink-0"
          title="Supprimer cette question"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Champs spécifiques selon le type de question
// ============================================================

function QuestionTypeSpecific({
  question,
  onUpdate,
}: {
  question: Question;
  onUpdate: (patch: Partial<Question>) => void;
}) {
  switch (question.type) {
    case "text_short":
      return (
        <input
          type="text"
          value={question.placeholder ?? ""}
          onChange={(e) =>
            onUpdate({ placeholder: e.target.value } as Partial<Question>)
          }
          placeholder="Placeholder du champ (optionnel)"
          className="w-full h-7 rounded border border-zinc-200 px-2 text-xs focus:border-blue-500 outline-none"
        />
      );
    case "text_long":
      return (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={question.placeholder ?? ""}
            onChange={(e) =>
              onUpdate({ placeholder: e.target.value } as Partial<Question>)
            }
            placeholder="Placeholder (optionnel)"
            className="flex-1 h-7 rounded border border-zinc-200 px-2 text-xs focus:border-blue-500 outline-none"
          />
          <label className="text-[11px] text-zinc-600 flex items-center gap-1 shrink-0">
            Lignes
            <input
              type="number"
              min={2}
              max={20}
              value={question.rows ?? 4}
              onChange={(e) =>
                onUpdate({
                  rows: Number(e.target.value) || 4,
                } as Partial<Question>)
              }
              className="w-12 h-7 rounded border border-zinc-200 px-1 text-xs text-center"
            />
          </label>
        </div>
      );
    case "radio":
    case "checkbox":
      return (
        <OptionListEditor
          options={question.options}
          onChange={(opts) =>
            onUpdate({ options: opts } as Partial<Question>)
          }
          allowOther={
            question.type === "checkbox" ? question.allow_other ?? false : null
          }
          onChangeAllowOther={
            question.type === "checkbox"
              ? (v) => onUpdate({ allow_other: v } as Partial<Question>)
              : undefined
          }
        />
      );
    case "yes_no":
      return null;
    case "yes_no_text":
      return (
        <input
          type="text"
          value={question.followup_label ?? ""}
          onChange={(e) =>
            onUpdate({
              followup_label: e.target.value,
            } as Partial<Question>)
          }
          placeholder="Libellé du champ de précision (ex : Si oui, précisez :)"
          className="w-full h-7 rounded border border-zinc-200 px-2 text-xs focus:border-blue-500 outline-none"
        />
      );
    case "matrix":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <RowsColsEditor
            label="Lignes (items)"
            items={question.rows}
            onChange={(rows) =>
              onUpdate({ rows } as Partial<Question>)
            }
            placeholder="Ex : Word"
          />
          <RowsColsEditor
            label="Colonnes (échelle)"
            items={question.cols}
            onChange={(cols) =>
              onUpdate({ cols } as Partial<Question>)
            }
            placeholder="Ex : Oui régulièrement"
          />
        </div>
      );
  }
}

// ============================================================
// Éditeur de liste d'options (radio / checkbox)
// ============================================================

function OptionListEditor({
  options,
  onChange,
  allowOther,
  onChangeAllowOther,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
  allowOther: boolean | null;
  onChangeAllowOther?: (v: boolean) => void;
}) {
  function update(idx: number, value: string) {
    const next = [...options];
    next[idx] = value;
    onChange(next);
  }
  function remove(idx: number) {
    onChange(options.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...options, `Option ${options.length + 1}`]);
  }
  function move(idx: number, dir: -1 | 1) {
    const t = idx + dir;
    if (t < 0 || t >= options.length) return;
    const next = [...options];
    [next[idx], next[t]] = [next[t], next[idx]];
    onChange(next);
  }

  return (
    <div className="space-y-1">
      {options.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => move(idx, -1)}
            disabled={idx === 0}
            className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 h-5 w-5 flex items-center justify-center"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => move(idx, 1)}
            disabled={idx === options.length - 1}
            className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 h-5 w-5 flex items-center justify-center"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          <input
            type="text"
            value={opt}
            onChange={(e) => update(idx, e.target.value)}
            className="flex-1 h-7 rounded border border-zinc-200 px-2 text-xs focus:border-blue-500 outline-none"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            className="text-rose-500 hover:text-rose-700 h-6 w-6 flex items-center justify-center rounded hover:bg-rose-50"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
      >
        <Plus className="h-3 w-3" />
        Ajouter une option
      </button>
      {allowOther !== null && onChangeAllowOther && (
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 pt-1">
          <input
            type="checkbox"
            checked={allowOther}
            onChange={(e) => onChangeAllowOther(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Activer le champ « Autres : ___ » (texte libre)
        </label>
      )}
    </div>
  );
}

function RowsColsEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  function update(idx: number, value: string) {
    const next = [...items];
    next[idx] = value;
    onChange(next);
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...items, ""]);
  }
  function move(idx: number, dir: -1 | 1) {
    const t = idx + dir;
    if (t < 0 || t >= items.length) return;
    const next = [...items];
    [next[idx], next[t]] = [next[t], next[idx]];
    onChange(next);
  }

  return (
    <div className="rounded-md bg-zinc-50 border border-zinc-200 p-2 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
        {label}
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => move(idx, -1)}
            disabled={idx === 0}
            className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 h-5 w-5 flex items-center justify-center"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => move(idx, 1)}
            disabled={idx === items.length - 1}
            className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 h-5 w-5 flex items-center justify-center"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          <input
            type="text"
            value={item}
            onChange={(e) => update(idx, e.target.value)}
            placeholder={placeholder}
            className="flex-1 h-6 rounded border border-zinc-200 px-1.5 text-[11px] focus:border-blue-500 outline-none bg-white"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            className="text-rose-500 hover:text-rose-700 h-5 w-5 flex items-center justify-center rounded hover:bg-rose-50"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:underline"
      >
        <Plus className="h-3 w-3" />
        Ajouter
      </button>
    </div>
  );
}
