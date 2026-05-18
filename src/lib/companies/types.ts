export type CompanyType =
  | "prospect"
  | "client"
  | "prescripteur"
  | "of"
  | "financeur"
  | "opco";

export type Company = {
  id: string;
  organization_id: string;
  name: string;
  legal_form: string | null;
  siret: string | null;
  siren: string | null;
  nda: string | null;
  industry: string | null;
  naf_code: string | null;
  /** A = active, C = cessée, D = procédure / radiée. */
  legal_status: "A" | "C" | "D" | null;
  pappers_url: string | null;
  type: CompanyType;
  lead_source: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  /** Société mère (NULL si cette entreprise est elle-même au sommet
   *  de la chaîne). Auto-référence sur companies.id. */
  parent_company_id: string | null;
  // Coordonnées GPS (calculées via api-adresse.data.gouv.fr ou saisies)
  latitude: number | null;
  longitude: number | null;
  gps_source: "auto" | "manual" | null;
  gps_updated_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyContactRole =
  | "rh"
  | "admin"
  | "manager"
  | "comptable"
  | "referent_pedago"
  | "direction"
  | "autre";

export const COMPANY_CONTACT_ROLE_LABELS: Record<CompanyContactRole, string> = {
  rh: "RH",
  admin: "Administratif",
  manager: "Responsable de service",
  comptable: "Comptabilité",
  referent_pedago: "Référent pédagogique",
  direction: "Direction",
  autre: "Autre",
};

export const COMPANY_CONTACT_ROLE_BADGE_CLASSES: Record<
  CompanyContactRole,
  string
> = {
  rh: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  admin:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
  manager:
    "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
  comptable:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
  referent_pedago:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900",
  direction:
    "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-900",
  autre:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export type CompanyContact = {
  id: string;
  company_id: string;
  /** Civilité (M. / Mme / Autre) — aligné avec learners.civility. */
  civility: string | null;
  first_name: string | null;
  last_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  notes: string | null;
  is_primary: boolean;

  role: CompanyContactRole;
  service: string | null;

  notify_inscription_validated: boolean;
  notify_session_opened: boolean;
  notify_session_cancelled: boolean;
  notify_session_completed: boolean;
  notify_admin_documents: boolean;
  notify_invoices: boolean;
  notify_certificates: boolean;

  created_at: string;
  updated_at: string;
};

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  prospect: "Prospect",
  client: "Client",
  prescripteur: "Prescripteur",
  of: "Organisme de formation",
  financeur: "Financeur",
  opco: "OPCO",
};

export const COMPANY_TYPE_BADGE_VARIANTS: Record<
  CompanyType,
  "default" | "secondary" | "outline"
> = {
  prospect: "outline",
  client: "default",
  prescripteur: "secondary",
  of: "secondary",
  financeur: "secondary",
  opco: "secondary",
};

/**
 * Classes pastel pour afficher le type d'entreprise sous forme de badge
 * coloré (cohérent avec le style du catalogue formations).
 */
export const COMPANY_TYPE_BADGE_CLASSES: Record<CompanyType, string> = {
  prospect:
    "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
  client:
    "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  prescripteur:
    "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
  of:
    "bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-900",
  financeur:
    "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
  opco:
    "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900",
};

/**
 * Teinte pastel très légère appliquée à la ligne du tableau entreprises.
 */
// =========================================================
// Notes datées sur fiche entreprise
// =========================================================

export type CompanyNoteAction =
  | "a_rappeler"
  | "a_relancer"
  | "rdv_planifie"
  | "devis_envoye"
  | "email_envoye"
  | "document_recu"
  | "info"
  | "autre";

export const COMPANY_NOTE_ACTION_LABELS: Record<CompanyNoteAction, string> = {
  a_rappeler: "À rappeler",
  a_relancer: "À relancer",
  rdv_planifie: "RDV planifié",
  devis_envoye: "Devis envoyé",
  email_envoye: "Email envoyé",
  document_recu: "Document reçu",
  info: "Information",
  autre: "Autre",
};

export const COMPANY_NOTE_ACTION_BADGE_CLASSES: Record<
  CompanyNoteAction,
  string
> = {
  a_rappeler:
    "bg-amber-100 text-amber-800 border border-amber-300",
  a_relancer:
    "bg-orange-100 text-orange-800 border border-orange-300",
  rdv_planifie:
    "bg-cyan-100 text-cyan-800 border border-cyan-300",
  devis_envoye:
    "bg-violet-100 text-violet-800 border border-violet-300",
  email_envoye:
    "bg-blue-100 text-blue-800 border border-blue-300",
  document_recu:
    "bg-emerald-100 text-emerald-800 border border-emerald-300",
  info: "bg-slate-100 text-slate-700 border border-slate-200",
  autre: "bg-slate-100 text-slate-700 border border-slate-200",
};

export type CompanyNote = {
  id: string;
  company_id: string;
  content: string;
  action_type: CompanyNoteAction | null;
  due_date: string | null;
  created_at: string;
  created_by: string | null;
  /** Nom du rédacteur (résolu depuis la table profiles, pas une colonne
   *  de la table company_notes elle-même). */
  author_name?: string | null;
};

export const COMPANY_TYPE_ROW_CLASSES: Record<CompanyType, string> = {
  prospect:
    "bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50 dark:hover:bg-amber-950/30",
  client:
    "bg-cyan-50/40 dark:bg-cyan-950/10 hover:bg-cyan-50 dark:hover:bg-cyan-950/30",
  prescripteur:
    "bg-blue-50/40 dark:bg-blue-950/10 hover:bg-blue-50 dark:hover:bg-blue-950/30",
  of:
    "bg-indigo-50/40 dark:bg-indigo-950/10 hover:bg-indigo-50 dark:hover:bg-indigo-950/30",
  financeur:
    "bg-violet-50/40 dark:bg-violet-950/10 hover:bg-violet-50 dark:hover:bg-violet-950/30",
  opco:
    "bg-emerald-50/40 dark:bg-emerald-950/10 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
};
