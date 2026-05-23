/**
 * Schéma du "Bilan formateur" (Module 7 du portail formateur).
 *
 * Couvre les indicateurs Qualiopi RNQ :
 *  - 11 (atteinte des objectifs)
 *  - 22 (mesures d'engagement)
 *  - 32 (amélioration continue)
 *
 * Persisté dans `session_trainer_reports.report` (JSONB). Pattern
 * identique à positioning_responses.data — souple pour évoluer.
 */

export type ObjectivesReached = "full" | "partial" | "none";

export const OBJECTIVES_OPTIONS: Array<{
  value: ObjectivesReached;
  label: string;
}> = [
  { value: "full", label: "Oui, totalement" },
  { value: "partial", label: "Partiellement" },
  { value: "none", label: "Non" },
];

export type TrainerReport = {
  /** Atteinte des objectifs pédagogiques (Qualiopi 11). */
  objectives_reached?: ObjectivesReached;
  objectives_comment?: string;

  /** Niveau / homogénéité du groupe. */
  group_level?: string;

  /** Adaptations effectuées (rythme, supports, handicap, accompagnement…). */
  adaptations_made?: string;

  /** Engagement & dynamique du groupe (Qualiopi 22). */
  engagement_dynamics?: string;

  /** Difficultés rencontrées (techniques, pédagogiques, organisationnelles). */
  difficulties?: string;

  /** Pistes d'amélioration pour la prochaine session (Qualiopi 32). */
  improvements?: string;

  /** Recommandations individuelles par apprenant (parcours complémentaire, certif…). */
  learner_recommendations?: string;
};

export function isReportEmpty(r: TrainerReport | null | undefined): boolean {
  if (!r) return true;
  return (
    !r.objectives_reached &&
    !r.objectives_comment?.trim() &&
    !r.group_level?.trim() &&
    !r.adaptations_made?.trim() &&
    !r.engagement_dynamics?.trim() &&
    !r.difficulties?.trim() &&
    !r.improvements?.trim() &&
    !r.learner_recommendations?.trim()
  );
}

export function labelObjectives(v: ObjectivesReached | undefined): string {
  return OBJECTIVES_OPTIONS.find((o) => o.value === v)?.label ?? "—";
}
