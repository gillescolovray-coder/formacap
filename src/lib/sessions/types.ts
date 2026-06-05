import type { FormationModality } from "@/lib/formations/types";

/**
 * Horaires par défaut "maison" définis au niveau de l'organisation
 * (Paramètres). Servent de valeurs initiales pour le planning d'une
 * nouvelle session, surchargeables jour par jour ensuite.
 *
 * Format attendu : "HH:MM" (déjà trimé côté serveur ; les colonnes
 * Postgres TIME sont retournées en "HH:MM:SS").
 */
export type OrgDefaultHours = {
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
};

export type SessionStatus =
  | "draft"
  | "planned"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "postponed"
  | "archived";

export type SessionActionType =
  | "action_formation"
  | "bilan_competences"
  | "vae"
  | "apprentissage";

export const SESSION_ACTION_TYPE_LABELS: Record<SessionActionType, string> = {
  action_formation: "Action de formation",
  bilan_competences: "Bilan de compétences",
  vae: "Validation des acquis (VAE)",
  apprentissage: "Formation par apprentissage",
};

export type EnrollmentStatus =
  | "preinscrit"
  | "option"
  | "confirmed"
  | "convoque"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "absent"
  | "abandoned";

export type TrainingSession = {
  id: string;
  organization_id: string;
  formation_id: string;
  formation?: { id: string; title: string } | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  default_morning_start: string | null;
  default_morning_end: string | null;
  default_afternoon_start: string | null;
  default_afternoon_end: string | null;
  modality: FormationModality | null;
  /** Pour les sessions hybrides : % de temps en présentiel (0-100).
   *  Le distanciel se déduit comme 100 - presentiel_percent. Null si
   *  la modalité n'est pas hybride ou si pas encore renseigné. */
  presentiel_percent: number | null;
  location: string | null;
  location_id: string | null;
  video_app: string | null;
  video_link: string | null;
  video_instructions: string | null;
  support_drive_url: string | null;
  trainer_id: string | null;
  trainer_name: string | null;
  trainer_notes: string | null;
  /** Quiz d'évaluation pré/post rattaché à la session (migration 0084).
   *  Override du quiz par défaut de la formation parent. */
  quiz_template_id?: string | null;
  /** Test de positionnement Qualiopi rattaché à cette session
   *  (migration 0105). NULL = hérite de la formation, puis du
   *  template default de l'organisation. */
  positioning_template_id?: string | null;
  min_participants: number | null;
  max_participants: number | null;
  status: SessionStatus;
  notes: string | null;
  internal_code: string | null;
  action_type: SessionActionType | null;
  nsf_specialty: string | null;
  target_diploma: string | null;
  target_certification: string | null;
  is_inter: boolean;
  is_subcontracted: boolean;
  subcontractor_name: string | null;
  /** Entreprise prescriptrice référente (rend la session visible dans son
   *  portail partenaire). Typiquement utilisé pour les sessions INTRA. */
  prescriber_company_id: string | null;
  /** Montant HT global de la session (en €). Saisie manuelle.
   *  @deprecated Remplacé par la tarification cascade R7 (per_learner/forfait).
   *  Conservé pour compatibilité avec les anciennes sessions. */
  amount_ht: number | null;
  /** Mode de tarification de la session.
   *  - per_learner : INTER, prix × nb apprenants × nb jours
   *  - forfait     : INTRA, forfait × nb jours + extras au-delà du seuil
   *  null = pas encore configuré (session ancienne, à compléter). */
  pricing_mode: "per_learner" | "forfait" | null;
  /** Prix HT par jour et par apprenant (mode per_learner). */
  price_per_day_ht: number | null;
  /** Forfait HT par jour (mode forfait). */
  price_forfait_ht: number | null;
  /** Prix HT par apprenant supplémentaire au-delà du seuil (mode forfait). */
  price_extra_per_day_ht: number | null;
  /** Seuil au-dessus duquel on facture l'extra (mode forfait, défaut 4). */
  pricing_threshold: number | null;
  /** Responsable pédagogique de la session (texte libre). */
  pedagogy_lead: string | null;
  /** Adaptations prévues pour l'accessibilité (PMR, support visuel…). */
  accessibility_notes: string | null;
  /** Mode de financement principal indicatif (entreprise/opco/cpf/...). */
  financing_mode: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionDay = {
  id: string;
  session_id: string;
  day_date: string;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
  notes: string | null;
  /** Formateur affecté à ce jour. NULL = formateur par défaut de la session. */
  trainer_id: string | null;
  /** Consignes/recommandations destinées au formateur pour ce jour (libre). */
  trainer_notes: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Canal d'inscription d'un apprenant sur une session :
 * - direct       : inscription directe via CAP NUMERIQUE (default)
 * - prescripteur : inscription apportée par un OF / prescripteur
 * - of           : inscription via un autre OF (sous-traitance entrante)
 */
export type InscriptionChannel = "direct" | "prescripteur" | "of";

export const INSCRIPTION_CHANNEL_LABELS: Record<InscriptionChannel, string> = {
  direct: "CAP NUMERIQUE (direct)",
  prescripteur: "Via un prescripteur",
  of: "Via un OF",
};

export const INSCRIPTION_CHANNEL_BADGE_CLASSES: Record<
  InscriptionChannel,
  string
> = {
  direct:
    "bg-emerald-100 text-emerald-800 border border-emerald-200",
  prescripteur:
    "bg-blue-100 text-blue-800 border border-blue-200",
  of:
    "bg-violet-100 text-violet-800 border border-violet-200",
};

/** Niveau initial d'un apprenant pour une session donnée. */
export type InitialLevel =
  | "debutant"
  | "intermediaire"
  | "confirme"
  | "expert";

export const INITIAL_LEVEL_LABELS: Record<InitialLevel, string> = {
  debutant: "Débutant",
  intermediaire: "Intermédiaire",
  confirme: "Confirmé",
  expert: "Expert",
};

export const INITIAL_LEVEL_BADGE_CLASSES: Record<InitialLevel, string> = {
  debutant:
    "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  intermediaire:
    "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
  confirme:
    "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
  expert:
    "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
};

export type Enrollment = {
  id: string;
  session_id: string;
  learner_id: string;
  learner?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    company?: { name: string } | null;
  } | null;
  status: EnrollmentStatus;
  notes: string | null;
  inscription_channel: InscriptionChannel;
  inscription_channel_company_id: string | null;
  inscription_channel_company?: { id: string; name: string } | null;
  /** Niveau initial déclaré pour cet apprenant sur cette session. */
  initial_level: InitialLevel | null;
  enrolled_at: string;
  updated_at: string;
};

/**
 * Statut de session personnalise par organisation (table session_statuses).
 * Utilise comme override des libelles/descriptions/couleurs hardcodes.
 */
export type SessionStatusDef = {
  id: string;
  organization_id: string;
  code: string;
  label: string;
  description: string | null;
  color: string | null;
  position: number;
  is_active: boolean;
};

/**
 * Palette de couleurs autorisees pour un statut personnalise.
 * Doit correspondre aux classes Tailwind utilisees dans
 * `getStatusBadgeClasses` et `getStatusRowClasses` (cf. utils).
 */
export const SESSION_STATUS_COLOR_KEYS = [
  "zinc",
  "amber",
  "blue",
  "cyan",
  "violet",
  "rose",
  "emerald",
  "orange",
  "red",
  "slate",
] as const;
export type SessionStatusColor = (typeof SESSION_STATUS_COLOR_KEYS)[number];

/** Descriptions par defaut alignees avec la migration 0043 (seed). */
export const SESSION_STATUS_DESCRIPTIONS: Record<SessionStatus, string> = {
  draft:
    "Session en cours de saisie. Les informations ne sont pas encore complètes ou validées.",
  planned:
    "Session définie (dates, formation, lieu) mais sans engagement ferme — en attente d'un nombre minimum d'inscrits.",
  confirmed:
    "Session validée, le seuil de participants est atteint, les convocations peuvent partir.",
  in_progress:
    "Session en train de se dérouler entre la date de début et la date de fin.",
  completed:
    "Session achevée. Émargements complets, attestations délivrées, place pour la facturation.",
  postponed:
    "Session décalée à une date ultérieure. Les inscriptions sont conservées.",
  cancelled:
    "Session abandonnée avant son début (manque d'inscrits, indisponibilité formateur, etc.).",
  archived:
    "Session ancienne sortie de la liste active. Reste consultable via son URL.",
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  draft: "Brouillon",
  planned: "Planifiée",
  confirmed: "Confirmée",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
  postponed: "Reportée",
  archived: "Archivée",
};

export const SESSION_STATUS_BADGE_VARIANTS: Record<
  SessionStatus,
  "default" | "secondary" | "outline"
> = {
  draft: "outline",
  planned: "outline",
  confirmed: "default",
  in_progress: "default",
  completed: "secondary",
  cancelled: "secondary",
  postponed: "secondary",
  archived: "outline",
};

export const SESSION_STATUS_BADGE_CLASSES: Record<SessionStatus, string> = {
  draft:
    "bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  planned:
    "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
  confirmed:
    "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
  in_progress:
    "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  completed:
    "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
  cancelled:
    "bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900",
  postponed:
    "bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-900",
  archived:
    "bg-slate-200 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

export const SESSION_STATUS_ROW_CLASSES: Record<SessionStatus, string> = {
  draft: "hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
  planned:
    "bg-amber-50/30 dark:bg-amber-950/10 hover:bg-amber-50 dark:hover:bg-amber-950/30",
  confirmed:
    "bg-blue-50/30 dark:bg-blue-950/10 hover:bg-blue-50 dark:hover:bg-blue-950/30",
  in_progress:
    "bg-cyan-50/40 dark:bg-cyan-950/15 hover:bg-cyan-50 dark:hover:bg-cyan-950/30",
  completed:
    "bg-violet-50/30 dark:bg-violet-950/10 hover:bg-violet-50 dark:hover:bg-violet-950/30 text-zinc-500",
  cancelled:
    "bg-red-50/30 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-500",
  postponed:
    "bg-orange-50/30 dark:bg-orange-950/10 hover:bg-orange-50 dark:hover:bg-orange-950/30",
  archived:
    "bg-slate-50/40 dark:bg-slate-950/20 hover:bg-slate-100 dark:hover:bg-slate-900/40 text-zinc-400 italic",
};

/**
 * Mapping cle de palette -> classes Tailwind pour un badge de statut.
 * Permet aux statuts personnalises (table session_statuses) d'utiliser
 * la meme charte que les statuts hardcodes.
 */
export const SESSION_STATUS_COLOR_BADGE_CLASSES: Record<string, string> = {
  zinc: "bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  amber:
    "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
  blue: "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
  cyan: "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  violet:
    "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
  rose: "bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900",
  emerald:
    "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900",
  orange:
    "bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-900",
  red: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900",
  slate:
    "bg-slate-200 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

export const SESSION_STATUS_COLOR_ROW_CLASSES: Record<string, string> = {
  zinc: "hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
  amber:
    "bg-amber-50/30 dark:bg-amber-950/10 hover:bg-amber-50 dark:hover:bg-amber-950/30",
  blue: "bg-blue-50/30 dark:bg-blue-950/10 hover:bg-blue-50 dark:hover:bg-blue-950/30",
  cyan: "bg-cyan-50/40 dark:bg-cyan-950/15 hover:bg-cyan-50 dark:hover:bg-cyan-950/30",
  violet:
    "bg-violet-50/30 dark:bg-violet-950/10 hover:bg-violet-50 dark:hover:bg-violet-950/30",
  rose: "bg-rose-50/30 dark:bg-rose-950/10 hover:bg-rose-50 dark:hover:bg-rose-950/30",
  emerald:
    "bg-emerald-50/30 dark:bg-emerald-950/10 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
  orange:
    "bg-orange-50/30 dark:bg-orange-950/10 hover:bg-orange-50 dark:hover:bg-orange-950/30",
  red: "bg-red-50/30 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/30",
  slate:
    "bg-slate-50/40 dark:bg-slate-950/20 hover:bg-slate-100 dark:hover:bg-slate-900/40",
};

/**
 * Couleur par defaut associee a un statut systeme (utilise comme
 * fallback si aucun statut personnalise n'est defini pour l'org).
 */
const SESSION_STATUS_DEFAULT_COLOR: Record<SessionStatus, SessionStatusColor> = {
  draft: "zinc",
  planned: "amber",
  confirmed: "blue",
  in_progress: "cyan",
  completed: "violet",
  postponed: "orange",
  cancelled: "red",
  archived: "slate",
};

/**
 * Resout les metadonnees d'affichage d'un statut de session :
 * - utilise les valeurs personnalisees (table session_statuses) si presentes
 *   pour l'organisation et si le code correspond
 * - sinon : libelle / description / couleur hardcodes
 *
 * `code` est le champ `sessions.status` (text). `customStatuses` est la
 * liste des statuts persos chargee depuis Supabase pour l'organisation.
 */
export function resolveSessionStatus(
  code: string,
  customStatuses?: SessionStatusDef[] | null,
): {
  code: string;
  label: string;
  description: string;
  color: SessionStatusColor;
  badgeClasses: string;
  rowClasses: string;
} {
  const custom = customStatuses?.find(
    (s) => s.code === code && s.is_active,
  );
  const fallbackKnown = (Object.keys(SESSION_STATUS_LABELS) as SessionStatus[]).includes(
    code as SessionStatus,
  );
  const label = custom?.label ?? (fallbackKnown
    ? SESSION_STATUS_LABELS[code as SessionStatus]
    : code);
  const description =
    custom?.description ??
    (fallbackKnown ? SESSION_STATUS_DESCRIPTIONS[code as SessionStatus] : "");
  const colorRaw = (custom?.color ??
    (fallbackKnown
      ? SESSION_STATUS_DEFAULT_COLOR[code as SessionStatus]
      : "zinc")) as string;
  const color = (
    SESSION_STATUS_COLOR_KEYS as readonly string[]
  ).includes(colorRaw)
    ? (colorRaw as SessionStatusColor)
    : "zinc";
  return {
    code,
    label,
    description,
    color,
    badgeClasses:
      SESSION_STATUS_COLOR_BADGE_CLASSES[color] ??
      SESSION_STATUS_COLOR_BADGE_CLASSES.zinc,
    rowClasses:
      SESSION_STATUS_COLOR_ROW_CLASSES[color] ??
      SESSION_STATUS_COLOR_ROW_CLASSES.zinc,
  };
}

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  preinscrit: "Préinscrit",
  option: "En option",
  confirmed: "Confirmé",
  convoque: "Convoqué",
  in_progress: "En formation",
  completed: "Terminé",
  cancelled: "Annulé",
  absent: "Absent",
  abandoned: "Abandonné",
};

/**
 * Descriptions pédagogiques de chaque statut d'inscription.
 * Affichées en info-bulle pour aider l'utilisateur à choisir.
 */
export const ENROLLMENT_STATUS_DESCRIPTIONS: Record<
  EnrollmentStatus,
  string
> = {
  preinscrit:
    "Première étape : l'apprenant a manifesté son intérêt mais rien n'est encore engagé.",
  option:
    "L'apprenant a réservé une place provisoirement (option à confirmer avant une date butoir).",
  confirmed:
    "Inscription validée : place confirmée, contrat ou convention signé(e).",
  convoque:
    "Convocation envoyée à l'apprenant (mail/courrier avec lieu, dates et horaires).",
  in_progress:
    "Formation en cours : l'apprenant est présent et participe activement.",
  completed:
    "Formation terminée avec succès. Émargement complet, attestation délivrée.",
  cancelled:
    "Inscription annulée avant le démarrage (par l'apprenant, l'OF ou le financeur).",
  absent:
    "L'apprenant ne s'est pas présenté ou a manqué la majorité des séances.",
  abandoned:
    "L'apprenant a démarré mais a abandonné en cours de formation.",
};

/**
 * Classes pastel pour afficher un statut d'inscription comme un badge.
 */
export const ENROLLMENT_STATUS_BADGE_CLASSES: Record<EnrollmentStatus, string> =
  {
    preinscrit:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    option:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
    confirmed:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
    convoque:
      "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-900",
    in_progress:
      "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
    completed:
      "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
    cancelled:
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900",
    absent:
      "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-900",
    abandoned:
      "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900",
  };
