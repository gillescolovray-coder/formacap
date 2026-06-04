/**
 * Taxonomie de Bloom (révisée) — 6 niveaux cognitifs croissants, avec
 * des verbes d'action mesurables. Sert à structurer et étiqueter les
 * objectifs opérationnels d'un programme de formation.
 */
export type BloomLevelKey =
  | "remember"
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate"
  | "create";

export type BloomLevel = {
  key: BloomLevelKey;
  label: string;
  order: number;
  /** Couleur (badge) — clé tailwind logique. */
  color: "slate" | "sky" | "emerald" | "amber" | "violet" | "rose";
  verbs: string[];
};

export const BLOOM_LEVELS: BloomLevel[] = [
  {
    key: "remember",
    label: "Mémoriser",
    order: 1,
    color: "slate",
    verbs: ["citer", "lister", "définir", "nommer", "décrire", "identifier"],
  },
  {
    key: "understand",
    label: "Comprendre",
    order: 2,
    color: "sky",
    verbs: ["expliquer", "reformuler", "illustrer", "résumer", "interpréter"],
  },
  {
    key: "apply",
    label: "Appliquer",
    order: 3,
    color: "emerald",
    verbs: ["utiliser", "réaliser", "appliquer", "exécuter", "calculer"],
  },
  {
    key: "analyze",
    label: "Analyser",
    order: 4,
    color: "amber",
    verbs: ["comparer", "distinguer", "décomposer", "analyser", "différencier"],
  },
  {
    key: "evaluate",
    label: "Évaluer",
    order: 5,
    color: "violet",
    verbs: ["juger", "argumenter", "recommander", "évaluer", "critiquer"],
  },
  {
    key: "create",
    label: "Créer",
    order: 6,
    color: "rose",
    verbs: ["concevoir", "élaborer", "produire", "construire", "rédiger"],
  },
];

export const BLOOM_BY_KEY: Record<BloomLevelKey, BloomLevel> = Object.fromEntries(
  BLOOM_LEVELS.map((l) => [l.key, l]),
) as Record<BloomLevelKey, BloomLevel>;

export function bloomLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return BLOOM_BY_KEY[key as BloomLevelKey]?.label ?? key;
}

export function isBloomLevel(k: string): k is BloomLevelKey {
  return k in BLOOM_BY_KEY;
}

/** Un objectif opérationnel étiqueté Bloom. */
export type BloomObjective = {
  id: string;
  text: string;
  bloom_level: BloomLevelKey;
  action_verb: string | null;
};

export const BLUEPRINT_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  pending_review: "En attente de validation",
  objectives_approved: "Objectifs validés",
  changes_requested: "Modifications demandées",
};
