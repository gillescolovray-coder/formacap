/**
 * Parseur regex de programmes de formation, à partir de texte brut
 * (extrait d'un PDF avec unpdf, ou d'une image via Tesseract OCR).
 * Conçu pour le format de fiche CAP NUMÉRIQUE et formats similaires.
 */

import type { ProgrammeDay } from "./types";

export type ParsedFormation = {
  title?: string;
  internal_code?: string;
  duration_days?: number;
  duration_hours?: number;
  min_participants?: number;
  max_participants?: number;
  public_price_excl_tax?: number;
  pricing_note?: string;
  target_audience?: string;
  prerequisites?: string;
  general_objective?: string;
  operational_objectives?: string[];
  pedagogy_approach?: string;
  teaching_methods?: string;
  technical_means?: string;
  evaluation_methods?: string;
  accessibility?: string;
  programme_days?: ProgrammeDay[];
};

const SECTION_LABELS = [
  "Objectifs",
  "Objectifs pédagogiques",
  "Prérequis",
  "Pédagogie",
  "Méthodes pédagogiques",
  "Méthodes et modalités d'évaluation",
  "Modalités d'évaluation",
  "Moyens techniques",
  "Publics visés",
  "Public visé",
  "Accessibilité",
  "Programme",
  "PROGRAMME",
];

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[  ]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(
  text: string,
  label: string,
  allLabels: string[],
): string | null {
  const labelPattern = new RegExp(
    `(?:^|\\n)\\s*${escapeRegex(label)}\\s*:?\\s*\\n`,
    "i",
  );
  const startMatch = text.match(labelPattern);
  if (!startMatch || startMatch.index === undefined) return null;
  const contentStart = startMatch.index + startMatch[0].length;

  let endIndex = text.length;
  for (const other of allLabels) {
    if (other === label) continue;
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${escapeRegex(other)}\\s*:?\\s*\\n`,
      "i",
    );
    const match = text.substring(contentStart).match(pattern);
    if (match && match.index !== undefined) {
      const idx = contentStart + match.index;
      if (idx < endIndex) endIndex = idx;
    }
  }
  return text.substring(contentStart, endIndex).trim();
}

function stripBullets(line: string): string {
  return line.replace(/^\s*[-–—•·*◦▪►▸o]\s*/, "").trim();
}

function sectionToText(raw: string | null): string | null {
  if (!raw) return null;
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function sectionToBulletList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((l) => stripBullets(l))
    .filter((l) => l.length > 2);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  const blocks: string[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      blocks.push(
        `<ul>${currentList
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul>`,
      );
      currentList = [];
    }
  };

  for (const line of lines) {
    if (/^[-–—•·*◦▪►▸o]/.test(line)) {
      currentList.push(stripBullets(line));
    } else {
      flushList();
      blocks.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  flushList();
  return blocks.join("");
}

function parseProgramme(text: string): ProgrammeDay[] {
  const dayRegex = /(\d+)\s*(?:ère|ere|ème|eme|er)\s*journée/gi;
  const dayMatches = [...text.matchAll(dayRegex)];
  if (dayMatches.length === 0) {
    return [{ morning: textToHtml(text), afternoon: "" }];
  }

  const days: ProgrammeDay[] = [];
  for (let i = 0; i < dayMatches.length; i++) {
    const startIdx = dayMatches[i].index! + dayMatches[i][0].length;
    const endIdx =
      i + 1 < dayMatches.length ? dayMatches[i + 1].index! : text.length;
    const dayContent = text.substring(startIdx, endIdx);

    const morningMatch = dayContent.match(/(?:^|\n)\s*Matin\s*:?\s*\n?/i);
    const afternoonMatch = dayContent.match(
      /(?:^|\n)\s*Apr[èe]s[\s-]?midi\s*:?\s*\n?/i,
    );

    let morning = "";
    let afternoon = "";

    if (morningMatch && morningMatch.index !== undefined) {
      const mStart = morningMatch.index + morningMatch[0].length;
      const mEnd =
        afternoonMatch && afternoonMatch.index !== undefined
          ? afternoonMatch.index
          : dayContent.length;
      morning = dayContent.substring(mStart, mEnd).trim();
    }
    if (afternoonMatch && afternoonMatch.index !== undefined) {
      const aStart = afternoonMatch.index + afternoonMatch[0].length;
      afternoon = dayContent.substring(aStart).trim();
    }

    days.push({
      morning: morning ? textToHtml(morning) : "",
      afternoon: afternoon ? textToHtml(afternoon) : "",
    });
  }
  return days;
}

export function parseFormationFromText(rawText: string): ParsedFormation {
  const text = normalize(rawText);
  const result: ParsedFormation = {};

  // Titre : première ligne significative non vide
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    // Évite les en-têtes type "CAP NUMÉRIQUE" ou "Page X / Y"
    const candidate = lines.find(
      (l) =>
        l.length > 8 &&
        l.length < 150 &&
        !/^page\s*\d/i.test(l) &&
        !/^cap\s+num/i.test(l) &&
        !/^\d+\s*\//.test(l),
    );
    if (candidate) result.title = candidate;
  }

  // Référence interne (motif "FP-XXX" ou "Réf : XXX")
  const refMatch = text.match(/(?:Réf\.?|Référence|Code)\s*:?\s*([A-Z0-9-]+)/i);
  if (refMatch) result.internal_code = refMatch[1];

  // Durée combinée — accepte les décimaux dans "jours" pour gérer
  // les demi-journées (0.5 j, 1.5 j…) — Gilles 2026-05-23.
  const durationBoth = text.match(
    /(\d+(?:[.,]\d+)?)\s*jours?\s*(?:soit|=|\(|de)?\s*(\d+(?:[.,]\d+)?)\s*heures?/i,
  );
  if (durationBoth) {
    result.duration_days = parseFloat(durationBoth[1].replace(",", "."));
    result.duration_hours = parseFloat(durationBoth[2].replace(",", "."));
  } else {
    // Match "½ journée" / "demi-journée" → 0.5
    if (/(?:½\s*journ[ée]e|demi[-\s]journ[ée]e)/i.test(text)) {
      result.duration_days = 0.5;
    } else {
      const daysOnly = text.match(/(\d+(?:[.,]\d+)?)\s*jours?/i);
      if (daysOnly)
        result.duration_days = parseFloat(daysOnly[1].replace(",", "."));
    }
    const hoursOnly = text.match(/(\d+(?:[.,]\d+)?)\s*heures?/i);
    if (hoursOnly)
      result.duration_hours = parseFloat(hoursOnly[1].replace(",", "."));
  }

  // Effectif "De X à Y"
  const effectif = text.match(/De\s*(\d+)\s*à\s*(\d+)\s*personnes?/i);
  if (effectif) {
    result.min_participants = parseInt(effectif[1], 10);
    result.max_participants = parseInt(effectif[2], 10);
  }

  // Tarif
  const tarifMatch = text.match(/Tarif\s*:?\s*([^\n]+)/i);
  if (tarifMatch) {
    const tarifText = tarifMatch[1].trim();
    const priceNum = tarifText.match(/(\d+(?:[.,]\d+)?)\s*€?/);
    if (priceNum && !/devis|consulter|demande/i.test(tarifText)) {
      result.public_price_excl_tax = parseFloat(
        priceNum[1].replace(",", "."),
      );
    } else {
      result.pricing_note = tarifText;
    }
  }

  // Sections textuelles
  const objectifs =
    extractSection(text, "Objectifs", SECTION_LABELS) ??
    extractSection(text, "Objectifs pédagogiques", SECTION_LABELS);
  if (objectifs) {
    const bullets = sectionToBulletList(objectifs);
    if (bullets.length > 0) {
      result.operational_objectives = bullets;
    } else {
      result.general_objective = sectionToText(objectifs) ?? undefined;
    }
  }

  const prereq = sectionToText(
    extractSection(text, "Prérequis", SECTION_LABELS),
  );
  if (prereq) result.prerequisites = prereq;

  const pedagogy = sectionToText(
    extractSection(text, "Pédagogie", SECTION_LABELS),
  );
  if (pedagogy) result.pedagogy_approach = pedagogy;

  const methods = sectionToText(
    extractSection(text, "Méthodes pédagogiques", SECTION_LABELS),
  );
  if (methods) result.teaching_methods = methods;

  const evaluation = sectionToText(
    extractSection(
      text,
      "Méthodes et modalités d'évaluation",
      SECTION_LABELS,
    ) ?? extractSection(text, "Modalités d'évaluation", SECTION_LABELS),
  );
  if (evaluation) result.evaluation_methods = evaluation;

  const technical = sectionToText(
    extractSection(text, "Moyens techniques", SECTION_LABELS),
  );
  if (technical) result.technical_means = technical;

  const audience = sectionToText(
    extractSection(text, "Publics visés", SECTION_LABELS) ??
      extractSection(text, "Public visé", SECTION_LABELS),
  );
  if (audience) result.target_audience = audience;

  const accessibility = sectionToText(
    extractSection(text, "Accessibilité", SECTION_LABELS),
  );
  if (accessibility) result.accessibility = accessibility;

  // Programme
  const programme =
    extractSection(text, "PROGRAMME", SECTION_LABELS) ??
    extractSection(text, "Programme", SECTION_LABELS);
  if (programme) {
    result.programme_days = parseProgramme(programme);
  }

  return result;
}
