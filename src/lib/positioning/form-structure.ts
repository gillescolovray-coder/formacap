/**
 * Types TypeScript pour le form-builder du test de positionnement
 * (migration 0106, Phase 3 — Gilles 2026-05-25).
 *
 * Une `FormStructure` représente le contenu PERSONNALISABLE d'un
 * test de positionnement : sections + questions de tous types.
 * Les sections fixes (Informations participant en haut, Validation
 * participant en bas) restent gérées par l'application — elles
 * n'apparaissent pas dans la structure.
 */

// ============================================================
// Types de questions supportés
// ============================================================

export type QuestionTextShort = {
  type: "text_short";
  text: string;
  required?: boolean;
  placeholder?: string;
};

export type QuestionTextLong = {
  type: "text_long";
  text: string;
  required?: boolean;
  rows?: number;
  placeholder?: string;
};

export type QuestionRadio = {
  type: "radio";
  text: string;
  required?: boolean;
  options: string[];
};

export type QuestionCheckbox = {
  type: "checkbox";
  text: string;
  options: string[];
  /** Si true, on ajoute une option "Autres :" avec champ texte. */
  allow_other?: boolean;
};

export type QuestionYesNo = {
  type: "yes_no";
  text: string;
  required?: boolean;
};

/** Oui/Non avec champ texte conditionnel visible uniquement si "oui". */
export type QuestionYesNoText = {
  type: "yes_no_text";
  text: string;
  required?: boolean;
  followup_label?: string;
  followup_required?: boolean;
  /** Inverser : champ texte visible si NON (rare). */
  show_if_no?: boolean;
};

/** Tableau / matrice : rows × cols. Pour chaque ligne, l'apprenant
 *  choisit UNE colonne (radio par ligne). Ex : 8 documents × Oui
 *  régulièrement / Oui occasionnellement / Non. */
export type QuestionMatrix = {
  type: "matrix";
  text: string;
  rows: string[];
  cols: string[];
};

export type Question =
  | QuestionTextShort
  | QuestionTextLong
  | QuestionRadio
  | QuestionCheckbox
  | QuestionYesNo
  | QuestionYesNoText
  | QuestionMatrix;

export type QuestionType = Question["type"];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text_short: "Texte court (ligne)",
  text_long: "Texte long (paragraphe)",
  radio: "Choix unique",
  checkbox: "Choix multiple (cases à cocher)",
  yes_no: "Oui / Non",
  yes_no_text: "Oui / Non avec précisions si Oui",
  matrix: "Tableau (lignes × colonnes)",
};

// ============================================================
// Sections + structure globale
// ============================================================

export type Section = {
  title: string;
  /** Intro courte affichée sous le titre. */
  intro?: string;
  questions: Question[];
};

export type FormStructure = {
  intro?: {
    /** Instructions générales en haut du test. */
    instructions?: string;
    /** Encart en rouge important (CLE USB, prérequis matériel…). */
    important_note?: string;
  };
  sections: Section[];
};

// ============================================================
// Validation / parsing
// ============================================================

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parseQuestion(raw: unknown): Question | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = typeof r.text === "string" ? r.text : null;
  if (!text) return null;
  switch (r.type) {
    case "text_short":
      return {
        type: "text_short",
        text,
        required: r.required === true,
        placeholder: typeof r.placeholder === "string" ? r.placeholder : undefined,
      };
    case "text_long":
      return {
        type: "text_long",
        text,
        required: r.required === true,
        rows: typeof r.rows === "number" ? r.rows : undefined,
        placeholder: typeof r.placeholder === "string" ? r.placeholder : undefined,
      };
    case "radio":
      if (!isStringArray(r.options) || r.options.length === 0) return null;
      return {
        type: "radio",
        text,
        required: r.required === true,
        options: r.options,
      };
    case "checkbox":
      if (!isStringArray(r.options) || r.options.length === 0) return null;
      return {
        type: "checkbox",
        text,
        options: r.options,
        allow_other: r.allow_other === true,
      };
    case "yes_no":
      return { type: "yes_no", text, required: r.required === true };
    case "yes_no_text":
      return {
        type: "yes_no_text",
        text,
        required: r.required === true,
        followup_label:
          typeof r.followup_label === "string" ? r.followup_label : undefined,
        followup_required: r.followup_required === true,
        show_if_no: r.show_if_no === true,
      };
    case "matrix":
      if (!isStringArray(r.rows) || !isStringArray(r.cols)) return null;
      if (r.rows.length === 0 || r.cols.length === 0) return null;
      return { type: "matrix", text, rows: r.rows, cols: r.cols };
    default:
      return null;
  }
}

/** Parse + valide une structure venant de la BDD (jsonb). Filtre
 *  silencieusement les questions invalides. */
export function parseFormStructure(raw: unknown): FormStructure | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.sections)) return null;

  const sections: Section[] = [];
  for (const s of r.sections) {
    if (!s || typeof s !== "object") continue;
    const so = s as Record<string, unknown>;
    const title = typeof so.title === "string" ? so.title : "";
    if (!title) continue;
    if (!Array.isArray(so.questions)) continue;
    const questions = so.questions
      .map(parseQuestion)
      .filter((q): q is Question => q !== null);
    if (questions.length === 0) continue;
    sections.push({
      title,
      intro: typeof so.intro === "string" ? so.intro : undefined,
      questions,
    });
  }

  if (sections.length === 0) return null;

  const intro =
    r.intro && typeof r.intro === "object"
      ? {
          instructions:
            typeof (r.intro as Record<string, unknown>).instructions ===
            "string"
              ? ((r.intro as Record<string, unknown>).instructions as string)
              : undefined,
          important_note:
            typeof (r.intro as Record<string, unknown>).important_note ===
            "string"
              ? ((r.intro as Record<string, unknown>).important_note as string)
              : undefined,
        }
      : undefined;

  return { intro, sections };
}

// ============================================================
// Format de stockage des réponses (positioning_responses.data)
// ============================================================

/** Réponse à une question identifiée par sa position dans la
 *  structure (section_idx + question_idx). On stocke la position
 *  plutôt qu'un ID stable, car les structures sont immuables une
 *  fois soumises (les apprenants jouent toujours sur la version
 *  publiée au moment de leur réponse). */
export type DynamicAnswerValue =
  | string // text_short, text_long
  | string[] // checkbox (liste de options sélectionnées)
  | boolean // yes_no
  | Record<string, string>; // matrix (clé = row, valeur = col)

export type DynamicAnswer = {
  section_idx: number;
  question_idx: number;
  value: DynamicAnswerValue | null;
  /** Pour yes_no_text : précisions si la condition de followup est remplie. */
  followup_text?: string;
  /** Pour checkbox + allow_other : texte saisi dans "Autres :". */
  other_text?: string;
};

export type DynamicResponsePayload = {
  /** Toutes les réponses, dans l'ordre. */
  answers: DynamicAnswer[];
  /** Snapshot de la structure jouée par cet apprenant (immuable même
   *  si l'admin modifie le template plus tard). Indispensable pour
   *  rendre les réponses côté formateur sans risque de désync. */
  structure_snapshot: FormStructure;
};

// ============================================================
// Factories (utilisables depuis Server Components ET Client)
// ============================================================

/** Structure de démarrage pour un nouveau template (1 section vide).
 *  Définie ici (lib partagée, pas de "use client") pour pouvoir être
 *  appelée depuis les server components des pages /new + /import. */
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

/** Génère une question vierge du type demandé. Utilisée par
 *  l'éditeur client lors d'un "+ Ajouter une question". */
export function makeEmptyQuestion(type: QuestionType): Question {
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
      return {
        type,
        text: "",
        options: ["Option 1", "Option 2"],
        allow_other: false,
      };
    case "yes_no":
      return { type, text: "", required: true };
    case "yes_no_text":
      return {
        type,
        text: "",
        required: true,
        followup_label: "Si oui, précisez :",
      };
    case "matrix":
      return {
        type,
        text: "",
        rows: ["Ligne 1", "Ligne 2"],
        cols: ["Colonne 1", "Colonne 2", "Colonne 3"],
      };
  }
}
