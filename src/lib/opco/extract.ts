/**
 * Extraction automatique des données depuis un PDF d'accord OPCO.
 *
 * Stratégie :
 *   1. Extraction du texte brut via `unpdf` (déjà installée pour les
 *      programmes de formation).
 *   2. Détection de l'OPCO par mots-clés / logos textuels.
 *   3. Application d'un parseur spécifique selon l'OPCO. Fallback :
 *      parseur générique avec regex courantes.
 *
 * Format de retour : `ExtractedAgreementData` — toutes les valeurs
 * peuvent être null si l'extraction n'a rien trouvé.
 */

import type { ExtractedAgreementData } from "./types";

// =========================================================
// Outils d'extraction texte (unpdf)
// =========================================================

async function extractText(buffer: ArrayBuffer): Promise<string> {
  const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await unpdfExtract(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

// =========================================================
// Outils communs (parsing dates, montants, OPCO)
// =========================================================

const FRENCH_MONTHS: Record<string, string> = {
  janvier: "01",
  février: "02",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  août: "08",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  décembre: "12",
  decembre: "12",
};

/** Convertit "11 mars 2026" → "2026-03-11" (ISO). Renvoie null si parse échoue. */
function parseFrenchDate(s: string): string | null {
  const m = s
    .toLowerCase()
    .match(/(\d{1,2})\s+([a-zéèûâîôç]+)\s+(\d{4})/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = FRENCH_MONTHS[m[2]];
  const year = m[3];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

/** Convertit "26/05/2026" → "2026-05-26" (ISO). Renvoie null si parse échoue. */
function parseSlashDate(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Parse "168,00" ou "1 250.50" → 168.0 / 1250.5. */
function parseFrenchAmount(s: string): number | null {
  const cleaned = s
    .replace(/\s+/g, "")
    .replace(/€/g, "")
    .replace(/,/g, ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// =========================================================
// Détection OPCO
// =========================================================

const OPCO_DETECTORS: Array<{ name: string; needles: RegExp[] }> = [
  {
    name: "Constructys",
    needles: [/constructys/i],
  },
  {
    name: "OCAPIAT",
    needles: [/ocapiat/i],
  },
  {
    name: "AKTO",
    needles: [/\bakto\b/i],
  },
  {
    name: "AFDAS",
    needles: [/\bafdas\b/i],
  },
  {
    name: "ATLAS",
    needles: [/\batlas\b/i, /opco\s+atlas/i],
  },
  {
    name: "OPCO 2i",
    needles: [/opco\s*2i/i],
  },
  {
    name: "OPCO EP",
    needles: [/opco\s*ep/i, /opco\s+entreprises\s+de\s+proximité/i],
  },
  {
    name: "OPCO Mobilités",
    needles: [/opco\s+mobilités/i],
  },
  {
    name: "OPCO Santé",
    needles: [/opco\s+santé/i],
  },
  {
    name: "Uniformation",
    needles: [/uniformation/i],
  },
];

function detectOpco(text: string): string | null {
  for (const detector of OPCO_DETECTORS) {
    if (detector.needles.some((rx) => rx.test(text))) {
      return detector.name;
    }
  }
  return null;
}

// =========================================================
// Parseur Constructys
// =========================================================

function parseConstructys(text: string): ExtractedAgreementData {
  // N° de dossier : "N/Réf.: 4026009528.01 - PLAN"
  const dossierMatch = text.match(/N\s*\/?\s*Réf\.?\s*:?\s*([\d.]+)/i);

  // Date accord : "LIMONEST, le 11 mars 2026"
  const dateMatch = text.match(/,\s*le\s+(\d{1,2}\s+\w+\s+\d{4})/i);
  const agreement_date = dateMatch ? parseFrenchDate(dateMatch[1]) : null;

  // Montant total : "Montant Total HT en €" suivi (ou précédé) par le nombre
  // L'extraction PDF peut produire l'ordre "Montant Total HT en € 168,00"
  // OU "168,00" puis "Montant Total HT en €" selon la structure du tableau.
  let total_amount_ht: number | null = null;
  const totalAfter = text.match(
    /Montant\s+Total\s+HT\s+en\s+€\s*([\d\s.,]+)/i,
  );
  if (totalAfter) {
    total_amount_ht = parseFrenchAmount(totalAfter[1].split(/\s+/)[0]);
  }
  if (total_amount_ht === null) {
    const totalBefore = text.match(
      /([\d\s.,]+)\s*Montant\s+Total\s+HT\s+en\s+€/i,
    );
    if (totalBefore) {
      const tokens = totalBefore[1].trim().split(/\s+/);
      total_amount_ht = parseFrenchAmount(tokens[tokens.length - 1]);
    }
  }

  // Apprenants : on cherche le bloc entre l'en-tête de tableau et la
  // ligne "Montant Total HT". Chaque ligne = "NOM Prénom 168,00".
  const learners: ExtractedAgreementData["learners"] = [];
  const tableMatch = text.match(
    /Coûts\s+pédagogiques\s+HT\s+en\s+€([\s\S]*?)Montant\s+Total\s+HT/i,
  );
  if (tableMatch) {
    const block = tableMatch[1];
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const line of lines) {
      // Pattern : "DA SILVA   CHRISTINE 168,00"  (nom en MAJUSCULES,
      // prénom mixte, montant à la fin)
      const m = line.match(/^(.+?)\s+([\d\s.,]+)$/);
      if (!m) continue;
      const namePart = m[1].trim();
      const amount = parseFrenchAmount(m[2].trim().split(/\s+/)[0]);
      if (
        namePart.length < 3 ||
        /coûts|pédagogiques|montant|raison\s+sociale|siret/i.test(namePart)
      ) {
        continue;
      }
      learners.push({
        full_name: namePart.replace(/\s+/g, " "),
        amount_ht: amount,
      });
    }
  }

  return {
    opco_name: "Constructys",
    dossier_number: dossierMatch ? dossierMatch[1] : null,
    agreement_date,
    total_amount_ht,
    learners,
  };
}

// =========================================================
// Parseur générique (fallback)
// =========================================================

function parseGeneric(text: string): ExtractedAgreementData {
  // N° dossier : recherche large
  const dossierMatch =
    text.match(/(?:N\s*\/?\s*Réf|n°\s+dossier|dossier\s+n°|référence)\s*:?\s*([\w\d.\-/]+)/i);

  // Date : essais successifs (français long, slash)
  let agreement_date: string | null = null;
  const frDate = text.match(/le\s+(\d{1,2}\s+\w+\s+\d{4})/i);
  if (frDate) agreement_date = parseFrenchDate(frDate[1]);
  if (!agreement_date) {
    const slashDate = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    if (slashDate) agreement_date = parseSlashDate(slashDate[1]);
  }

  // Montant total : recherche "Montant Total" + nombre
  let total_amount_ht: number | null = null;
  const totalMatch = text.match(
    /Montant\s+Total\s*(?:HT)?\s*(?:en\s*€)?\s*[:\s]*([\d\s.,]+)/i,
  );
  if (totalMatch) {
    total_amount_ht = parseFrenchAmount(
      totalMatch[1].trim().split(/\s+/)[0],
    );
  }

  return {
    opco_name: detectOpco(text),
    dossier_number: dossierMatch ? dossierMatch[1] : null,
    agreement_date,
    total_amount_ht,
    learners: [],
  };
}

// =========================================================
// Point d'entrée principal
// =========================================================

/**
 * Extrait les données d'un PDF d'accord OPCO. Sélectionne automatiquement
 * le parseur en fonction de l'OPCO détecté.
 */
export async function extractAgreementFromPdf(
  buffer: ArrayBuffer,
): Promise<ExtractedAgreementData> {
  let text: string;
  try {
    text = await extractText(buffer);
  } catch {
    // Si l'extraction échoue (PDF scanné en image, protégé…), on
    // renvoie une structure vide — l'utilisateur saisira manuellement.
    return {
      opco_name: null,
      dossier_number: null,
      agreement_date: null,
      total_amount_ht: null,
      learners: [],
    };
  }

  const opco = detectOpco(text);

  switch (opco) {
    case "Constructys":
      return parseConstructys(text);
    default:
      return parseGeneric(text);
  }
}
