/**
 * Extracteur IA via LM Studio (serveur local OpenAI-compatible).
 * Fonctionne avec n'importe quel modèle chargé : Llama 3, Mistral, Qwen, etc.
 *
 * Configuration : démarrer LM Studio en local, charger un modèle
 * (Llama 3.1 8B Instruct ou Mistral 7B recommandés en français), puis
 * activer le serveur local sur http://localhost:1234.
 *
 * Variables d'environnement (optionnelles) :
 *   LM_STUDIO_URL  (défaut : http://localhost:1234/v1)
 *   LM_STUDIO_MODEL (défaut : "local-model" — LM Studio ignore ce champ
 *                   en pratique, le modèle utilisé est celui chargé)
 */

import type { ParsedFormation } from "./text-parser";

const SYSTEM_PROMPT = `Tu es un expert en extraction structurée de données depuis des programmes de formation professionnelle continue, en français.

L'utilisateur va te fournir le texte d'un programme. Tu dois renvoyer **uniquement un objet JSON** valide, sans markdown, sans préambule, sans explication.

Format JSON attendu :
{
  "title": string,
  "internal_code": string | null,
  "duration_days": number | null,
  "duration_hours": number | null,
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
  "programme_days": [
    { "morning": "texte plat avec sauts de ligne", "afternoon": "texte plat" }
  ]
}

Règles :
- Conserve la langue française d'origine, ne traduis pas.
- Pour les champs absents : null (ou [] / "").
- Pour operational_objectives : un élément par puce du document, sans le tiret.
- Pour programme_days : un élément par journée, avec le contenu matin/après-midi.
- Si le tarif est "Sur devis" ou similaire, mets ce texte dans pricing_note et public_price_excl_tax à null.
- Réponds STRICTEMENT en JSON, rien d'autre.`;

function getLmStudioUrl(): string {
  return process.env.LM_STUDIO_URL ?? "http://localhost:1234/v1";
}

function getLmStudioModel(): string {
  return process.env.LM_STUDIO_MODEL ?? "local-model";
}

function extractJsonFromContent(raw: string): ParsedFormation {
  // Supprime les éventuels ```json ... ```
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Pas de JSON dans la réponse de l'IA");
  }
  const jsonStr = stripped.substring(start, end + 1);
  return JSON.parse(jsonStr) as ParsedFormation;
}

export async function extractWithLmStudio(
  text: string,
): Promise<ParsedFormation> {
  const url = `${getLmStudioUrl()}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: getLmStudioModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extrais les données structurées de ce programme :\n\n${text}`,
        },
      ],
      temperature: 0,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(180_000), // 3 min timeout
  });

  if (!response.ok) {
    throw new Error(`LM Studio HTTP ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Réponse LM Studio vide");
  }

  return extractJsonFromContent(content);
}

/**
 * Vérifie rapidement (timeout court) si LM Studio est joignable.
 */
export async function isLmStudioAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${getLmStudioUrl()}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
