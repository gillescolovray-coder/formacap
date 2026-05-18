/**
 * Types partagés pour les notes datées (entreprise / apprenant / session
 * / inscription). Le système est identique sur les 4 entités : un type
 * d'action optionnel, une date d'échéance optionnelle, un texte libre,
 * un horodatage et un auteur résolu depuis `profiles`.
 */

export type NoteAction =
  | "a_rappeler"
  | "a_relancer"
  | "rdv_planifie"
  | "devis_envoye"
  | "email_envoye"
  | "document_recu"
  | "info"
  | "autre";

export const NOTE_ACTION_LABELS: Record<NoteAction, string> = {
  a_rappeler: "À rappeler",
  a_relancer: "À relancer",
  rdv_planifie: "RDV planifié",
  devis_envoye: "Devis envoyé",
  email_envoye: "Email envoyé",
  document_recu: "Document reçu",
  info: "Information",
  autre: "Autre",
};

export const NOTE_ACTION_BADGE_CLASSES: Record<NoteAction, string> = {
  a_rappeler: "bg-amber-100 text-amber-800 border border-amber-300",
  a_relancer: "bg-orange-100 text-orange-800 border border-orange-300",
  rdv_planifie: "bg-cyan-100 text-cyan-800 border border-cyan-300",
  devis_envoye: "bg-violet-100 text-violet-800 border border-violet-300",
  email_envoye: "bg-blue-100 text-blue-800 border border-blue-300",
  document_recu: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  info: "bg-slate-100 text-slate-700 border border-slate-200",
  autre: "bg-slate-100 text-slate-700 border border-slate-200",
};

export type LearnerNote = {
  id: string;
  learner_id: string;
  content: string;
  action_type: NoteAction | null;
  due_date: string | null;
  created_at: string;
  created_by: string | null;
  author_name?: string | null;
};

export type SessionNote = {
  id: string;
  session_id: string;
  content: string;
  action_type: NoteAction | null;
  due_date: string | null;
  created_at: string;
  created_by: string | null;
  author_name?: string | null;
};

export type SessionEnrollmentNote = {
  id: string;
  enrollment_id: string;
  content: string;
  action_type: NoteAction | null;
  due_date: string | null;
  created_at: string;
  created_by: string | null;
  author_name?: string | null;
  /** Métadonnées résolues côté serveur pour l'affichage. */
  session_id?: string;
  session_label?: string | null;
  learner_id?: string;
  learner_label?: string | null;
};
