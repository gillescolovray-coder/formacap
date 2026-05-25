/**
 * Extracteur Gemini pour les questionnaires de positionnement.
 * Reprend le pattern de @/lib/formations/gemini-extractor mais avec
 * un prompt + un schéma JSON dédiés à la structure form-builder.
 *
 * Phase D — Gilles 2026-05-25.
 */

import { GoogleGenAI } from "@google/genai";
import {
  parseFormStructure,
  type FormStructure,
} from "./form-structure";

const PROMPT = `Tu es un expert en extraction structurée de questionnaires de positionnement (Qualiopi, formation professionnelle continue, en français).

Lis le document fourni (PDF ou image d'un questionnaire de positionnement préalable) et renvoie **uniquement un objet JSON valide**, sans markdown, sans préambule, sans explication.

Format JSON attendu :
{
  "title": string,                 // Le titre suggéré du template (ex : "L'IA au service du conducteur de travaux")
  "intro": {
    "instructions": string | null, // Le texte d'introduction général (en haut du PDF), si présent.
    "important_note": string | null // L'encart marqué IMPORTANT (souvent en rouge ; CLE USB, prérequis…), sans le mot "IMPORTANT :" en préfixe.
  },
  "sections": [
    {
      "title": string,             // Titre de la section (ex : "Votre expérience", "Outils IA utilisés")
      "questions": [
        // 7 types disponibles — choisis le plus adapté pour chaque question :
        // 1) Texte court (ligne) :
        { "type": "text_short", "text": "…", "required": false, "placeholder": "…" },

        // 2) Texte long (paragraphe / champ multi-lignes) :
        { "type": "text_long", "text": "…", "required": false, "rows": 4 },

        // 3) Choix unique (case à cocher OU radio buttons avec une seule réponse) :
        { "type": "radio", "text": "…", "required": true,
          "options": ["Option 1", "Option 2", "Option 3"] },

        // 4) Choix multiple (plusieurs cases cochables) :
        { "type": "checkbox", "text": "…",
          "options": ["Option A", "Option B"],
          "allow_other": true },   // true si une option "Autres : ___" avec champ texte existe

        // 5) Oui / Non simple :
        { "type": "yes_no", "text": "…", "required": true },

        // 6) Oui / Non avec champ texte conditionnel si Oui (très fréquent : "Si oui, précisez…") :
        { "type": "yes_no_text", "text": "…", "required": true,
          "followup_label": "Si oui, précisez :" },

        // 7) Tableau / matrice (lignes × colonnes — apprenant choisit UNE colonne par ligne) :
        // Très fréquent pour : matrice 5 outils IA × 3 colonnes (gratuit/payant/non concerné),
        // matrice 8 documents × 3 fréquences (oui régulièrement / oui occasionnellement / non),
        // matrice critères × niveaux, etc.
        { "type": "matrix", "text": "…",
          "rows": ["Item 1", "Item 2", "Item 3"],
          "cols": ["Colonne 1", "Colonne 2", "Colonne 3"] }
      ]
    }
  ]
}

RÈGLES STRICTES :
- Conserve la langue française d'origine, ne traduis pas.
- IGNORE les sections "Informations participant" (Nom/Prénom, Fonction, Entreprise, Email, Date) et "Validation participant" (Nom, Signature, Date) en haut/bas du PDF : elles sont AUTO-GÉRÉES par l'application — ne les inclus PAS dans le tableau "sections".
- Pour les questions à choix multiple avec une option "Autres : ___" en dernier, mets allow_other=true et NE METS PAS "Autres" dans la liste options.
- Pour les questions oui/non suivies d'un champ "Si oui, précisez :" → utilise yes_no_text plutôt que yes_no + text_long.
- Pour les tableaux (matrices) : reconnais-les par les lignes répétées avec mêmes colonnes de cases à cocher (ex : 8 lignes de documents × 3 colonnes).
- intro.important_note : récupère uniquement le contenu après "IMPORTANT :", en GARDANT les bullets et sauts de ligne (utilise "\\n• " entre items).
- Si l'image/PDF est de mauvaise qualité ou si une section est illisible, mieux vaut omettre cette section que d'inventer du contenu.
- Réponds STRICTEMENT en JSON pur, rien d'autre.`;

export type ExtractedPositioning = {
  title: string | null;
  structure: FormStructure;
};

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "Clé API Gemini non configurée (GEMINI_API_KEY dans .env.local)",
    );
  }
  return key;
}

function extractJson(raw: string): {
  title?: unknown;
  intro?: unknown;
  sections?: unknown;
} {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Pas de JSON dans la réponse Gemini");
  }
  return JSON.parse(stripped.substring(start, end + 1));
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
 * Extrait un test de positionnement depuis un fichier PDF ou image.
 * Tente plusieurs modèles Gemini en fallback si surcharge.
 */
export async function extractPositioningWithGemini(
  buffer: Uint8Array,
  mimeType: string,
): Promise<ExtractedPositioning> {
  let lastError: unknown = null;

  for (const model of MODEL_FALLBACKS) {
    try {
      const text = await callGemini(buffer, mimeType, model);
      const obj = extractJson(text);
      const parsedStructure = parseFormStructure({
        intro: obj.intro,
        sections: obj.sections,
      });
      if (!parsedStructure) {
        throw new Error(
          "Aucune section valide trouvée dans la réponse Gemini.",
        );
      }
      const title =
        typeof obj.title === "string" && obj.title.trim() !== ""
          ? obj.title.trim()
          : null;
      return { title, structure: parsedStructure };
    } catch (err) {
      lastError = err;
      if (isOverloadError(err)) {
        console.warn(
          `Gemini ${model} surchargé, bascule sur le suivant…`,
        );
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Tous les modèles Gemini ont échoué");
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
