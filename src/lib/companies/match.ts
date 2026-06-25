/**
 * Rapprochement « flou » d'un nom d'entreprise (Gilles 2026-06-25).
 *
 * Sert au rattachement des apprenants « Express » : on saisit l'entreprise
 * en texte libre (company_name_temp), et on veut retrouver la fiche existante
 * même si le nom n'est pas EXACTEMENT identique (« SAS T-LEC » vs « T LEC »,
 * « MCO Renov concept » vs « MCO RENOV CONCEPT »…).
 *
 * Score 0..1. 1 = identique après normalisation (= « quasi-certain » → on
 * peut rattacher automatiquement). Entre min et 1 = « proche » → on propose
 * et l'utilisateur confirme.
 */
import { normalizeCompanyName } from "./dedup";

/** Mots vides ignorés dans le calcul (formes juridiques, articles…). */
const STOPWORDS = new Set([
  "sas",
  "sasu",
  "sarl",
  "eurl",
  "sa",
  "sci",
  "snc",
  "scop",
  "ste",
  "societe",
  "ets",
  "etablissements",
  "entreprise",
  "et",
  "le",
  "la",
  "les",
  "de",
  "du",
  "des",
]);

function meaningfulTokens(normalized: string): Set<string> {
  return new Set(
    normalized
      .split(" ")
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

/**
 * Score de ressemblance entre deux noms d'entreprise (0..1).
 * - identique (après normalisation) -> 1
 * - l'un contient l'autre (hors mots vides) -> 0.9
 * - sinon : indice de Jaccard sur les mots significatifs
 */
export function companyNameScore(
  query: string | null | undefined,
  candidate: string | null | undefined,
): number {
  const a = normalizeCompanyName(query);
  const b = normalizeCompanyName(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const ta = meaningfulTokens(a);
  const tb = meaningfulTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;

  // Sous-ensemble (tous les mots significatifs de l'un sont dans l'autre).
  const aInB = [...ta].every((w) => tb.has(w));
  const bInA = [...tb].every((w) => ta.has(w));
  if (aInB || bInA) return 0.9;

  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

export type RankedCompany<T> = {
  company: T;
  score: number;
  /** true si correspondance quasi-certaine (identique après normalisation). */
  exact: boolean;
};

/**
 * Classe les entreprises par ressemblance avec `query`. Retourne celles dont
 * le score atteint `min` (défaut 0.34), triées du plus proche au moins proche.
 */
export function rankCompanyMatches<T extends { name: string }>(
  query: string | null | undefined,
  companies: T[],
  opts?: { min?: number; limit?: number },
): RankedCompany<T>[] {
  const min = opts?.min ?? 0.34;
  const limit = opts?.limit ?? 5;
  const nq = normalizeCompanyName(query);
  if (!nq) return [];
  return companies
    .map((c) => ({
      company: c,
      score: companyNameScore(query, c.name),
      exact: normalizeCompanyName(c.name) === nq,
    }))
    .filter((m) => m.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
