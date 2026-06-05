export type FormationModality = "presentiel" | "distanciel" | "hybride";
export type FormationStatus = "draft" | "published" | "archived";

export type FormationCategory = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ProgrammeDay = {
  morning: string;
  afternoon: string;
};

export type Formation = {
  id: string;
  organization_id: string;
  internal_code: string | null;
  title: string;
  category_id: string | null;
  category?: { id: string; name: string } | null;
  description: string | null;
  general_objective: string | null;
  operational_objectives: string[];
  target_audience: string | null;
  prerequisites: string | null;
  program: string | null;
  programme_days: ProgrammeDay[];
  programme_pdf_url: string | null;
  programme_pdf_name: string | null;
  pedagogy_approach: string | null;
  teaching_methods: string | null;
  technical_means: string | null;
  evaluation_methods: string | null;
  accessibility: string | null;
  support_drive_url: string | null;
  duration_hours: number | null;
  duration_days: number | null;
  modality: FormationModality | null;
  min_participants: number | null;
  max_participants: number | null;
  public_price_excl_tax: number | null;
  pricing_note: string | null;
  vat_rate: number | null;
  version: number;
  status: FormationStatus;
  // Lot 1 — Métadonnées commerciales
  subtitle: string | null;
  cover_image_url: string | null;
  version_date: string | null;
  price_company: number | null;
  price_individual: number | null;
  price_independent: number | null;
  is_cpf_eligible: boolean;
  is_published_online: boolean;
  // Lot 2 — Qualiopi avancé
  execution_followup: string | null;
  certification_terms: string | null;
  quality_indicators: string | null;
  competence_domains: string[];
  // Lot 3 — Comptabilité
  accounting_product_code: string | null;
  accounting_analytic_code: string | null;
  /** Template de test de positionnement Qualiopi attache a la formation
   *  (migration 0105). Null = utilise le template default de l'organisme.
   *  Override possible au niveau session via sessions.positioning_template_id. */
  positioning_template_id?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const MODALITY_LABELS: Record<FormationModality, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

/**
 * Pastilles colorées par modalité (Présentiel = vert, Distanciel = bleu, Hybride = violet).
 */
export const MODALITY_BADGE_CLASSES: Record<FormationModality, string> = {
  presentiel:
    "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900",
  distanciel:
    "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
  hybride:
    "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
};

/**
 * Renvoie une teinte stable et lisible pour un nom de catégorie,
 * à partir d'une palette douce. La même catégorie aura toujours la même couleur.
 */
const CATEGORY_PALETTE: Array<{ bg: string; text: string; border: string }> = [
  { bg: "bg-cyan-100 dark:bg-cyan-950/60",     text: "text-cyan-800 dark:text-cyan-300",     border: "border-cyan-300 dark:border-cyan-800" },
  { bg: "bg-blue-100 dark:bg-blue-950/60",     text: "text-blue-800 dark:text-blue-300",     border: "border-blue-300 dark:border-blue-800" },
  { bg: "bg-indigo-100 dark:bg-indigo-950/60", text: "text-indigo-800 dark:text-indigo-300", border: "border-indigo-300 dark:border-indigo-800" },
  { bg: "bg-violet-100 dark:bg-violet-950/60", text: "text-violet-800 dark:text-violet-300", border: "border-violet-300 dark:border-violet-800" },
  { bg: "bg-fuchsia-100 dark:bg-fuchsia-950/60", text: "text-fuchsia-800 dark:text-fuchsia-300", border: "border-fuchsia-300 dark:border-fuchsia-800" },
  { bg: "bg-rose-100 dark:bg-rose-950/60",     text: "text-rose-800 dark:text-rose-300",     border: "border-rose-300 dark:border-rose-800" },
  { bg: "bg-amber-100 dark:bg-amber-950/60",   text: "text-amber-800 dark:text-amber-300",   border: "border-amber-300 dark:border-amber-800" },
  { bg: "bg-emerald-100 dark:bg-emerald-950/60", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-800" },
  { bg: "bg-teal-100 dark:bg-teal-950/60",     text: "text-teal-800 dark:text-teal-300",     border: "border-teal-300 dark:border-teal-800" },
  { bg: "bg-sky-100 dark:bg-sky-950/60",       text: "text-sky-800 dark:text-sky-300",       border: "border-sky-300 dark:border-sky-800" },
];

export function categoryColor(name: string | null | undefined) {
  if (!name) return CATEGORY_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % CATEGORY_PALETTE.length;
  return CATEGORY_PALETTE[idx];
}

export const STATUS_LABELS: Record<FormationStatus, string> = {
  draft: "Brouillon",
  published: "Publiée",
  archived: "Archivée",
};

export const STATUS_BADGE_VARIANTS: Record<
  FormationStatus,
  "default" | "secondary" | "outline"
> = {
  draft: "outline",
  published: "default",
  archived: "secondary",
};

/**
 * Classes pastel pour afficher un statut de manière visuelle.
 * Utilisé sur le badge dans le tableau catalogue.
 */
export const STATUS_BADGE_CLASSES: Record<FormationStatus, string> = {
  draft:
    "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
  published:
    "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  archived:
    "bg-zinc-200 text-zinc-700 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
};

/**
 * Teinte pastel très légère appliquée à la ligne du tableau
 * (pour rendre le statut immédiatement visible d'un coup d'œil).
 */
export const STATUS_ROW_CLASSES: Record<FormationStatus, string> = {
  draft: "bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50 dark:hover:bg-amber-950/30",
  published:
    "bg-cyan-50/40 dark:bg-cyan-950/10 hover:bg-cyan-50 dark:hover:bg-cyan-950/30",
  archived:
    "bg-zinc-100/60 dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 text-zinc-500",
};
