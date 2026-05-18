/**
 * Définition typée du questionnaire d'évaluation À CHAUD.
 * Qualiopi indicateur 11 (recueil de la satisfaction stagiaire).
 *
 * Le contenu est figé en code (pas configurable en V1). Pour le faire
 * évoluer, modifier ce fichier et NE PAS toucher les réponses
 * historiques en BDD (elles restent dans data.jsonb avec leur
 * structure d'origine).
 */

// ============================================================
// Échelles de réponse réutilisables
// ============================================================

/** Échelle satisfaction 4 niveaux (sans neutre). */
export const SATISFACTION_OPTIONS = [
  { value: "very_satisfied", label: "Très satisfait" },
  { value: "satisfied", label: "Satisfait" },
  { value: "medium", label: "Moyennement satisfait" },
  { value: "unsatisfied", label: "Insatisfait" },
] as const;
export type SatisfactionValue = (typeof SATISFACTION_OPTIONS)[number]["value"];

/** Échelle "objectifs atteints" 4 niveaux. */
export const OBJECTIVES_OPTIONS = [
  { value: "fully", label: "Oui totalement" },
  { value: "mostly", label: "Oui en grande partie" },
  { value: "partial", label: "Partiellement" },
  { value: "no", label: "Non" },
] as const;
export type ObjectivesValue = (typeof OBJECTIVES_OPTIONS)[number]["value"];

/** Échelle "attentes répondues" 4 niveaux. */
export const EXPECTATIONS_OPTIONS = [
  { value: "fully", label: "Oui totalement" },
  { value: "partial", label: "Oui partiellement" },
  { value: "insufficient", label: "Non pas suffisamment" },
  { value: "no", label: "Non" },
] as const;
export type ExpectationsValue = (typeof EXPECTATIONS_OPTIONS)[number]["value"];

/** Échelle critères pédagogiques 4 niveaux. */
export const RATING_OPTIONS = [
  { value: "very_good", label: "Très satisfaisant" },
  { value: "good", label: "Satisfaisant" },
  { value: "medium", label: "Moyen" },
  { value: "poor", label: "Insuffisant" },
] as const;
export type RatingValue = (typeof RATING_OPTIONS)[number]["value"];

/** Comme RATING_OPTIONS mais avec "Non concerné" pour les critères pas applicables. */
export const RATING_OPTIONS_WITH_NA = [
  ...RATING_OPTIONS,
  { value: "na", label: "Non concerné" },
] as const;
export type RatingValueNA = (typeof RATING_OPTIONS_WITH_NA)[number]["value"];

/** Échelle utilité professionnelle 4 niveaux. */
export const USEFULNESS_OPTIONS = [
  { value: "immediate", label: "Oui immédiatement" },
  { value: "partial", label: "Oui partiellement" },
  { value: "later", label: "Pas encore" },
  { value: "no", label: "Non" },
] as const;
export type UsefulnessValue = (typeof USEFULNESS_OPTIONS)[number]["value"];

/** Échelle recommandation (équivalent qualitatif du NPS). */
export const RECOMMENDATION_OPTIONS = [
  { value: "yes_for_sure", label: "Oui, tout à fait" },
  { value: "probably_yes", label: "Oui, probablement" },
  { value: "probably_no", label: "Non, probablement pas" },
  { value: "no", label: "Non, pas du tout" },
] as const;
export type RecommendationValue =
  (typeof RECOMMENDATION_OPTIONS)[number]["value"];

// ============================================================
// Clés des critères des grilles (sections 3, 4, 5)
// ============================================================

export const CONTENT_CRITERIA = [
  { key: "program_clarity", label: "Clarté du programme" },
  { key: "content_quality", label: "Qualité du contenu présenté" },
  { key: "level_adaptation", label: "Adaptation à votre niveau" },
  { key: "examples_usefulness", label: "Utilité des exemples pratiques" },
  { key: "pace", label: "Rythme de la formation" },
] as const;
export type ContentCriteriaKey = (typeof CONTENT_CRITERIA)[number]["key"];

export const TRAINER_CRITERIA = [
  { key: "explanations_clarity", label: "Clarté des explications" },
  { key: "subject_mastery", label: "Maîtrise du sujet" },
  { key: "exchanges_quality", label: "Qualité des échanges avec les participants" },
  { key: "questions_answers", label: "Réponses apportées aux questions" },
  { key: "group_adaptation", label: "Adaptation aux besoins du groupe" },
] as const;
export type TrainerCriteriaKey = (typeof TRAINER_CRITERIA)[number]["key"];

export const ORGANIZATION_CRITERIA = [
  { key: "pre_info", label: "Informations reçues avant la formation" },
  { key: "schedule_respect", label: "Respect des horaires" },
  { key: "materials_quality", label: "Qualité des supports remis" },
  { key: "in_person_welcome", label: "Conditions d'accueil en présentiel" },
  { key: "remote_connection", label: "Conditions de connexion en distanciel" },
  { key: "interaction_possibility", label: "Possibilité d'interagir avec le formateur" },
] as const;
export type OrganizationCriteriaKey =
  (typeof ORGANIZATION_CRITERIA)[number]["key"];

// ============================================================
// Forme des réponses
// ============================================================

/**
 * Structure attendue dans `evaluation_responses.data` (JSONB) pour
 * une évaluation à chaud. Les clés sont stables même si on ajoute
 * des questions dans le futur (rétrocompatibilité).
 */
export type HotEvaluationData = {
  // Section 1
  satisfaction_overall: SatisfactionValue;
  satisfaction_comment?: string;

  // Section 2
  objectives_reached: ObjectivesValue;
  expectations_met: ExpectationsValue;
  objectives_comment?: string;

  // Section 3 — grille contenu
  content: Partial<Record<ContentCriteriaKey, RatingValue>>;
  content_comment?: string;

  // Section 4 — grille formateur
  trainer: Partial<Record<TrainerCriteriaKey, RatingValue>>;
  trainer_comment?: string;

  // Section 5 — grille organisation (peut être "na")
  organization: Partial<Record<OrganizationCriteriaKey, RatingValueNA>>;
  organization_comment?: string;

  // Section 6
  usefulness: UsefulnessValue;
  usefulness_applications?: string;

  // Section 7
  recommendation: RecommendationValue;
  nps_score: number; // 0 à 10
  nps_reason?: string;

  // Section 8
  strengths?: string;
  improvements?: string;
  other_training_needs_yes: boolean;
  other_training_needs_text?: string;

  // Signature facultative (data URL PNG)
  signature_data?: string | null;
};

// ============================================================
// Helpers pour lire/résumer une réponse
// ============================================================

export function labelForSatisfaction(v: SatisfactionValue): string {
  return SATISFACTION_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function labelForRating(v: RatingValue | RatingValueNA): string {
  return (
    RATING_OPTIONS_WITH_NA.find((o) => o.value === v)?.label ?? v
  );
}

/**
 * Classification NPS standard à partir du score 0-10.
 * Détracteurs 0-6, Passifs 7-8, Promoteurs 9-10.
 */
export function npsCategory(score: number): "detractor" | "passive" | "promoter" {
  if (score <= 6) return "detractor";
  if (score <= 8) return "passive";
  return "promoter";
}

/**
 * Calcule le NPS (Net Promoter Score) global = % promoteurs - % détracteurs.
 * Range : -100 à +100.
 */
export function computeNps(scores: number[]): number | null {
  if (scores.length === 0) return null;
  let promoters = 0;
  let detractors = 0;
  for (const s of scores) {
    const cat = npsCategory(s);
    if (cat === "promoter") promoters++;
    else if (cat === "detractor") detractors++;
  }
  return Math.round(
    (promoters / scores.length) * 100 - (detractors / scores.length) * 100,
  );
}
