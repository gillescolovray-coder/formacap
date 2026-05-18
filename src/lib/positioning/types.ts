/**
 * Définition typée du test de positionnement (Qualiopi indicateur 12).
 * 7 sections : 6 remplies par l'apprenant, 1 par le formateur après.
 *
 * Modèle fourni par Gilles (2026-05-16), figé en V1. Pour évolutions :
 * modifier ce fichier sans toucher aux réponses historiques en BDD
 * (data jsonb conserve la structure d'origine).
 */

// ============================================================
// Échelles de réponse
// ============================================================

export const LEVEL_OPTIONS = [
  { value: "debutant", label: "Débutant" },
  { value: "intermediaire", label: "Intermédiaire" },
  { value: "confirme", label: "Confirmé" },
  { value: "expert", label: "Expert" },
] as const;
export type LevelValue = (typeof LEVEL_OPTIONS)[number]["value"];

export const PRACTICE_OPTIONS = [
  { value: "regularly", label: "Oui régulièrement" },
  { value: "occasionally", label: "Oui occasionnellement" },
  { value: "rarely", label: "Très peu" },
  { value: "never", label: "Jamais" },
] as const;
export type PracticeValue = (typeof PRACTICE_OPTIONS)[number]["value"];

export const EXPECTATION_CHOICES = [
  { value: "discover", label: "Découvrir le sujet" },
  { value: "consolidate", label: "Consolider mes bases" },
  { value: "autonomy", label: "Gagner en autonomie" },
  { value: "secure_practice", label: "Sécuriser mes pratiques professionnelles" },
  { value: "perfect", label: "Me perfectionner" },
  { value: "solve_issue", label: "Résoudre une difficulté concrète" },
] as const;
export type ExpectationValue = (typeof EXPECTATION_CHOICES)[number]["value"];

export const PREREQ_OPTIONS = [
  { value: "yes", label: "Oui" },
  { value: "partial", label: "Partiellement" },
  { value: "no", label: "Non" },
  { value: "unknown", label: "Je ne sais pas" },
] as const;
export type PrereqValue = (typeof PREREQ_OPTIONS)[number]["value"];

export const EQUIPMENT_OPTIONS = [
  { value: "yes", label: "Oui" },
  { value: "no", label: "Non" },
  { value: "na", label: "Non concerné" },
] as const;
export type EquipmentValue = (typeof EQUIPMENT_OPTIONS)[number]["value"];

export const MASTERY_OPTIONS = [
  { value: "none", label: "Non maîtrisé" },
  { value: "partial", label: "Partiellement maîtrisé" },
  { value: "ok", label: "Maîtrisé" },
] as const;
export type MasteryValue = (typeof MASTERY_OPTIONS)[number]["value"];

export const ADEQUACY_OPTIONS = [
  { value: "fully", label: "Oui totalement" },
  { value: "partial", label: "Oui partiellement" },
  { value: "no", label: "Non" },
  { value: "to_check", label: "À vérifier avec le formateur" },
] as const;
export type AdequacyValue = (typeof ADEQUACY_OPTIONS)[number]["value"];

// Section 5 — critères d'auto-évaluation
export const MASTERY_CRITERIA = [
  { key: "basics", label: "Comprendre les notions de base" },
  { key: "rules", label: "Identifier les règles ou obligations principales" },
  { key: "best_practices", label: "Appliquer les bonnes pratiques" },
  { key: "errors", label: "Repérer les erreurs ou pièges à éviter" },
] as const;
export type MasteryCriteriaKey = (typeof MASTERY_CRITERIA)[number]["key"];

// Section 7 — adaptations prévues par le formateur (V2)
export const TRAINER_ADAPTATIONS = [
  { value: "none", label: "Aucune adaptation nécessaire" },
  { value: "pace", label: "Adaptation du rythme" },
  { value: "examples", label: "Adaptation des exemples" },
  { value: "deepen", label: "Approfondissement d'un point spécifique" },
  { value: "check_prereq", label: "Vérification des prérequis" },
  { value: "other", label: "Autre" },
] as const;
export type TrainerAdaptationValue =
  (typeof TRAINER_ADAPTATIONS)[number]["value"];

// ============================================================
// Forme des réponses APPRENANT (sections 1-6)
// ============================================================

export type PositioningLearnerData = {
  // Section 1 — Niveau initial
  current_level: LevelValue;
  practice_frequency: PracticeValue;

  // Section 2 — Attentes et besoins
  expectations: ExpectationValue[]; // multi-choix
  expectations_comment?: string;

  // Section 3 — Prérequis et conditions
  prereq_meets: PrereqValue;
  remote_equipment: EquipmentValue;

  // Section 4 — Handicap / adaptation (Qualiopi 26)
  has_adaptation_need: boolean;
  adaptation_details?: string;
  wants_contact: boolean;

  // Section 5 — Auto-évaluation rapide (grille)
  mastery: Partial<Record<MasteryCriteriaKey, MasteryValue>>;

  // Section 6 — Adéquation
  adequacy: AdequacyValue;
  learner_comment?: string;
};

// ============================================================
// Forme des données FORMATEUR (section 7, V2)
// ============================================================

export type PositioningTrainerObservation = {
  adaptations: TrainerAdaptationValue[]; // multi-choix
  other_adaptation_text?: string;
  trainer_comment?: string;
};

// ============================================================
// Helpers
// ============================================================

export function labelLevel(v: LevelValue): string {
  return LEVEL_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function labelMastery(v: MasteryValue): string {
  return MASTERY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function labelAdequacy(v: AdequacyValue): string {
  return ADEQUACY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function labelPractice(v: PracticeValue): string {
  return PRACTICE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function labelExpectation(v: ExpectationValue): string {
  return EXPECTATION_CHOICES.find((o) => o.value === v)?.label ?? v;
}
