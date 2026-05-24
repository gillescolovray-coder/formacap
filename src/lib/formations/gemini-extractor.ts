/**
 * Extracteur IA via Google Gemini (cloud, gratuit jusqu'à 1500 req/jour).
 *
 * Avantage : Gemini accepte directement les PDF et images en entrée,
 * pas besoin d'OCR ou de pré-extraction de texte. Qualité d'extraction
 * très supérieure au parseur regex.
 *
 * Configuration :
 * 1. https://aistudio.google.com/app/apikey
 * 2. Créer une clé API (gratuite, pas de carte bancaire)
 * 3. Ajouter dans .env.local : GEMINI_API_KEY=AIza...
 * 4. Redémarrer le serveur
 */

import { GoogleGenAI } from "@google/genai";
import type { ParsedFormation } from "./text-parser";

const PROMPT = `Tu es un expert en extraction structurée de programmes de formation professionnelle continue, en français.

Lis le document fourni (PDF ou image) et renvoie **uniquement un objet JSON valide**, sans markdown, sans préambule, sans explication.

Format JSON attendu :
{
  "title": string,
  "internal_code": string | null,
  "duration_days": number | null,    // Multiple de 0.5 (ex: 0.5 pour une demi-journée, 1, 1.5, 2…)
  "duration_hours": number | null,    // Décimal accepté (ex: 3.5 pour une demi-journée)
  "min_participants": number | null,
  "max_participants": number | null,
  "public_price_excl_tax": number | null,
  "pricing_note": string | null,
  "target_audience": string | null,
  "prerequisites": string | null,
  "general_objective": string | null,
  "operational_objectives": string[],
  "pedagogy_approach": string | null,
  "teaching_methods": string | null,
  "technical_means": string | null,
  "evaluation_methods": string | null,
  "accessibility": string | null,
  "modality": "presentiel" | "distanciel" | "hybride" | null,
  "programme_days": [
    { "morning": "texte avec sauts de ligne", "afternoon": "texte avec sauts de ligne" }
  ]
}

Règles strictes :
- Conserve la langue française d'origine, ne traduis pas.
- Champs absents : null (ou [] / "" selon le type).
- operational_objectives : un élément par puce, sans le tiret en préfixe.
- programme_days : un élément par journée, contenu matin/après-midi.
- Si le tarif est "Sur devis" : pricing_note = "Sur devis", public_price_excl_tax = null.
- modality :
    * "distanciel" si FOAD, e-learning, classe virtuelle, Zoom/Teams/Meet, ou mention "à distance".
    * "presentiel" si "en salle", "sur site", "présentiel" uniquement.
    * "hybride" si les deux modalités sont mentionnées.
    * null sinon (l'utilisateur choisira manuellement).
- Réponds STRICTEMENT en JSON pur, rien d'autre.`;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "Clé API Gemini non configurée (GEMINI_API_KEY dans .env.local)",
    );
  }
  return key;
}

function extractJson(raw: string): ParsedFormation {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Pas de JSON dans la réponse Gemini");
  }
  return JSON.parse(stripped.substring(start, end + 1)) as ParsedFormation;
}

// Modèles tentés dans l'ordre — fallback si le précédent est surchargé
const MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-001",
];

function isOverloadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /503|overload|UNAVAILABLE|high demand/i.test(msg);
}

async function callGemini(
  buffer: Uint8Array,
  mimeType: string,
  model: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const base64 = Buffer.from(buffer).toString("base64");

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
  });

  const text = response.text;
  if (!text) {
    throw new Error(`Réponse Gemini vide (modèle ${model})`);
  }
  return text;
}

/**
 * Extrait un programme depuis un fichier PDF ou image en utilisant Gemini.
 * Tente plusieurs modèles Gemini en fallback si l'un est surchargé.
 */
export async function extractWithGemini(
  buffer: Uint8Array,
  mimeType: string,
): Promise<ParsedFormation> {
  let lastError: unknown = null;

  for (const model of MODEL_FALLBACKS) {
    try {
      const text = await callGemini(buffer, mimeType, model);
      return extractJson(text);
    } catch (err) {
      lastError = err;
      if (isOverloadError(err)) {
        // 503 / surchargé → on essaie le modèle suivant
        console.warn(`Gemini ${model} surchargé, bascule sur le suivant…`);
        continue;
      }
      // Autre erreur (clé invalide, JSON invalide…) → stop
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Tous les modèles Gemini sont indisponibles");
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
