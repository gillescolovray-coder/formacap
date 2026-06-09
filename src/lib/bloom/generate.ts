/**
 * Génération IA des objectifs opérationnels étiquetés selon la taxonomie
 * de Bloom, à partir des informations de base d'un programme.
 *
 * Moteur :
 *  - Gemini (cloud) si GEMINI_API_KEY est configurée — fonctionne en prod.
 *  - sinon LM Studio (serveur local OpenAI-compatible) — dev / hors-ligne.
 *
 * Sortie : tableau d'objectifs { text, bloom_level, action_verb }.
 */
import { GoogleGenAI } from "@google/genai";
import {
  BLOOM_LEVELS,
  isBloomLevel,
  type BloomLevelKey,
  type BloomObjective,
} from "./types";

export type BloomGenerationInput = {
  title: string;
  theme?: string | null;
  targetAudience?: string | null;
  durationHours?: number | null;
  generalObjective?: string | null;
  /** Objectifs existants à RÉADAPTER (cas import d'un programme PDF). */
  existingObjectives?: string[] | null;
};

const LEVELS_DESC = BLOOM_LEVELS.map(
  (l) => `- "${l.key}" (${l.label}) : verbes ex. ${l.verbs.slice(0, 4).join(", ")}`,
).join("\n");

function buildPrompt(input: BloomGenerationInput): string {
  const existing =
    input.existingObjectives && input.existingObjectives.length > 0
      ? `\n\nObjectifs ACTUELS du programme (à RÉADAPTER pour les rendre mesurables et conformes Bloom — conserve l'intention, reformule, fusionne/scinde si besoin) :\n${input.existingObjectives
          .map((o) => `- ${o}`)
          .join("\n")}`
      : "";

  return `Tu es un ingénieur pédagogique expert en formation professionnelle continue (France) et en taxonomie de Bloom.

À partir des informations d'une formation${existing ? " et de ses objectifs actuels" : ""}, ${existing ? "RÉADAPTE-les en" : "génère des"} OBJECTIFS OPÉRATIONNELS mesurables, formulés du point de vue de l'apprenant ("À l'issue, l'apprenant sera capable de ...").${existing}

Règles :
- Chaque objectif commence par un VERBE D'ACTION à l'infinitif, observable et évaluable.
- Étiquette chaque objectif avec son niveau de Bloom le plus pertinent.
- Couvre une progression cohérente (plusieurs niveaux), du plus simple au plus complexe.
- Entre 4 et 7 objectifs. Reste en français. Pas de jargon inutile.
- N'invente pas de contenu hors du thème fourni.

Niveaux de Bloom autorisés (clé à utiliser) :
${LEVELS_DESC}

Informations de la formation :
- Titre : ${input.title}
- Thème : ${input.theme ?? "—"}
- Public visé : ${input.targetAudience ?? "—"}
- Durée (heures) : ${input.durationHours ?? "—"}
- Objectif général : ${input.generalObjective ?? "—"}

Réponds STRICTEMENT en JSON pur (aucun texte autour, pas de markdown), au format :
{
  "objectives": [
    { "text": "Réaliser un dossier de candidature dématérialisé conforme", "bloom_level": "apply", "action_verb": "réaliser" }
  ]
}`;
}

type RawObjective = {
  text?: unknown;
  bloom_level?: unknown;
  action_verb?: unknown;
};

function parseObjectives(raw: string): BloomObjective[] {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Réponse IA sans JSON exploitable");
  }
  const parsed = JSON.parse(stripped.substring(start, end + 1)) as {
    objectives?: RawObjective[];
  };
  const list = Array.isArray(parsed.objectives) ? parsed.objectives : [];
  return list
    .map((o): BloomObjective | null => {
      const text = typeof o.text === "string" ? o.text.trim() : "";
      if (!text) return null;
      const lvl = typeof o.bloom_level === "string" ? o.bloom_level : "";
      const bloom_level: BloomLevelKey = isBloomLevel(lvl) ? lvl : "understand";
      const verb =
        typeof o.action_verb === "string" && o.action_verb.trim()
          ? o.action_verb.trim().toLowerCase()
          : null;
      return {
        id: crypto.randomUUID(),
        text,
        bloom_level,
        action_verb: verb,
      };
    })
    .filter((x): x is BloomObjective => x !== null);
}

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-001",
];

function isOverloadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /503|overload|UNAVAILABLE|high demand/i.test(msg);
}

async function generateWithGemini(prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  let lastError: unknown = null;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      const text = response.text;
      if (text) return text;
      lastError = new Error(`Réponse Gemini vide (${model})`);
    } catch (err) {
      lastError = err;
      if (isOverloadError(err)) continue;
      throw err;
    }
  }
  throw lastError ?? new Error("Échec génération Gemini");
}

async function generateWithLmStudio(prompt: string): Promise<string> {
  const base = process.env.LM_STUDIO_URL ?? "http://localhost:1234/v1";
  const model = process.env.LM_STUDIO_MODEL ?? "local-model";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    throw new Error(`LM Studio erreur ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Réponse LM Studio vide");
  return text;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.LM_STUDIO_URL);
}

export async function generateBloomObjectives(
  input: BloomGenerationInput,
): Promise<BloomObjective[]> {
  const prompt = buildPrompt(input);
  const raw = process.env.GEMINI_API_KEY
    ? await generateWithGemini(prompt)
    : await generateWithLmStudio(prompt);
  return parseObjectives(raw);
}

/**
 * Propose UNE phrase d'objectif général, à partir du titre/thème/public et
 * surtout des objectifs opérationnels déjà définis (programme réadapté).
 * Gilles 2026-06-08.
 */
export async function generateGeneralObjective(
  input: BloomGenerationInput,
): Promise<string> {
  const prompt = [
    "Tu es ingénieur pédagogique en formation professionnelle (référentiel Qualiopi).",
    "Rédige UNE SEULE phrase d'objectif général de formation, claire et professionnelle (commence par un verbe à l'infinitif ou par « Permettre de … »).",
    "Pas de liste, pas de guillemets, pas de préambule : réponds UNIQUEMENT par la phrase.",
    "",
    `Titre : ${input.title}`,
    input.theme ? `Thème : ${input.theme}` : "",
    input.targetAudience ? `Public visé : ${input.targetAudience}` : "",
    input.durationHours ? `Durée : ${input.durationHours} h` : "",
    input.existingObjectives && input.existingObjectives.length > 0
      ? `Objectifs opérationnels du programme :\n- ${input.existingObjectives.join("\n- ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const raw = process.env.GEMINI_API_KEY
    ? await generateWithGemini(prompt)
    : await generateWithLmStudio(prompt);
  // Nettoyage : 1re ligne non vide, sans guillemets encadrants.
  const line =
    raw
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  return line.replace(/^["'«»]+|["'«»]+$/g, "").trim();
}

// ===========================================================================
// Génération du CONTENU COMPLET + DÉROULÉ (Gilles 2026-06-09)
// ===========================================================================

async function runAI(prompt: string): Promise<string> {
  return process.env.GEMINI_API_KEY
    ? await generateWithGemini(prompt)
    : await generateWithLmStudio(prompt);
}

/** Extrait un objet JSON d'une réponse modèle (retire les ```json …```). */
function parseJsonLoose<T>(raw: string): T | null {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.search(/[[{]/);
  if (start > 0) s = s.slice(start);
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** Transforme une liste de points en HTML (<ul><li>…</li></ul>). */
function listToHtml(items: unknown): string {
  if (!Array.isArray(items)) return "";
  const lis = items
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("");
  return lis ? `<ul>${lis}</ul>` : "";
}

function escapeHtml(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type ProgramContent = {
  generalObjective: string;
  prerequisites: string; // HTML
  evaluationMethods: string; // HTML
  teachingMethods: string; // HTML
};

/**
 * Rédige le contenu complet du programme (objectif général + prérequis +
 * modalités d'évaluation + méthodes pédagogiques) — éditable ensuite.
 */
export async function generateProgramContent(
  input: BloomGenerationInput,
): Promise<ProgramContent> {
  const prompt = [
    "Tu es ingénieur pédagogique en formation professionnelle (Qualiopi).",
    "À partir des informations ci-dessous, rédige le contenu d'un programme de formation.",
    "Réponds UNIQUEMENT en JSON valide, sans texte autour, au format :",
    '{ "generalObjective": "une phrase", "prerequisites": ["...","..."], "evaluationMethods": ["...","..."], "teachingMethods": ["...","..."] }',
    "Chaque liste = 2 à 5 puces courtes et professionnelles.",
    "",
    `Titre : ${input.title}`,
    input.theme ? `Thème : ${input.theme}` : "",
    input.targetAudience ? `Public visé : ${input.targetAudience}` : "",
    input.durationHours ? `Durée : ${input.durationHours} h` : "",
    input.existingObjectives && input.existingObjectives.length > 0
      ? `Objectifs opérationnels :\n- ${input.existingObjectives.join("\n- ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await runAI(prompt);
  const parsed = parseJsonLoose<{
    generalObjective?: string;
    prerequisites?: unknown;
    evaluationMethods?: unknown;
    teachingMethods?: unknown;
  }>(raw);
  return {
    generalObjective: (parsed?.generalObjective ?? "").toString().trim(),
    prerequisites: listToHtml(parsed?.prerequisites),
    evaluationMethods: listToHtml(parsed?.evaluationMethods),
    teachingMethods: listToHtml(parsed?.teachingMethods),
  };
}

export type ProgramDay = { morning: string; afternoon: string };

/**
 * Génère le DÉROULÉ pédagogique (Matin / Après-midi par jour), structuré par
 * sections rattachées aux objectifs Bloom. Retourne du HTML riche par
 * demi-journée (titres + puces).
 */
export async function generateProgramDeroule(
  input: BloomGenerationInput & { durationDays?: number | null },
): Promise<ProgramDay[]> {
  const nbDays =
    input.durationDays && input.durationDays >= 1
      ? Math.round(input.durationDays)
      : 1;
  const prompt = [
    "Tu es ingénieur pédagogique (Qualiopi). Construis le DÉROULÉ pédagogique",
    `d'une formation de ${nbDays} jour(s), réparti Matin / Après-midi.`,
    "Chaque demi-journée = 2 à 4 SECTIONS ; chaque section a un titre et 2 à 5 points.",
    "Les sections doivent couvrir progressivement les objectifs (logique Bloom : mémoriser → comprendre → appliquer → analyser…).",
    "Réponds UNIQUEMENT en JSON valide au format :",
    '{ "days": [ { "morning": [ {"title":"…","points":["…"]} ], "afternoon": [ {"title":"…","points":["…"]} ] } ] }',
    `Il doit y avoir exactement ${nbDays} élément(s) dans "days".`,
    "",
    `Titre : ${input.title}`,
    input.theme ? `Thème : ${input.theme}` : "",
    input.targetAudience ? `Public visé : ${input.targetAudience}` : "",
    input.existingObjectives && input.existingObjectives.length > 0
      ? `Objectifs opérationnels :\n- ${input.existingObjectives.join("\n- ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await runAI(prompt);
  const parsed = parseJsonLoose<{
    days?: Array<{
      morning?: Array<{ title?: string; points?: unknown }>;
      afternoon?: Array<{ title?: string; points?: unknown }>;
    }>;
  }>(raw);

  const sectionsToHtml = (
    sections: Array<{ title?: string; points?: unknown }> | undefined,
  ): string => {
    if (!Array.isArray(sections)) return "";
    return sections
      .map((s) => {
        const title = (s.title ?? "").toString().trim();
        const list = listToHtml(s.points);
        return `${title ? `<p><strong>${escapeHtml(title)}</strong></p>` : ""}${list}`;
      })
      .filter(Boolean)
      .join("");
  };

  const days = Array.isArray(parsed?.days) ? parsed!.days : [];
  const result: ProgramDay[] = days.map((d) => ({
    morning: sectionsToHtml(d.morning),
    afternoon: sectionsToHtml(d.afternoon),
  }));
  // Garantit au moins nbDays entrées (même vides) pour l'édition.
  while (result.length < nbDays) result.push({ morning: "", afternoon: "" });
  return result;
}
