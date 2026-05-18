export type ParcoursStatus =
  | "draft"
  | "planned"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "archived";

export const PARCOURS_STATUS_LABELS: Record<ParcoursStatus, string> = {
  draft: "Brouillon",
  planned: "Planifié",
  in_progress: "En cours",
  completed: "Terminé",
  cancelled: "Annulé",
  archived: "Archivé",
};

export const PARCOURS_STATUS_BADGE_CLASSES: Record<ParcoursStatus, string> = {
  draft:
    "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  planned:
    "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
  in_progress:
    "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  completed:
    "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
  cancelled:
    "bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900",
  archived:
    "bg-zinc-200 text-zinc-700 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
};

export type Parcours = {
  id: string;
  organization_id: string;
  name: string;
  internal_code: string | null;
  description: string | null;
  target_audience: string | null;
  general_objective: string | null;
  prerequisites: string | null;
  notes: string | null;
  status: ParcoursStatus;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
