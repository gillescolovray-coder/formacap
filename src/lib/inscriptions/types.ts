export type InscriptionSource =
  | "web_form"
  | "email"
  | "phone"
  | "salon"
  | "recommandation"
  | "partenaire"
  | "autre";

export const INSCRIPTION_SOURCE_LABELS: Record<InscriptionSource, string> = {
  web_form: "Formulaire web",
  email: "Email",
  phone: "Téléphone",
  salon: "Salon / événement",
  recommandation: "Recommandation",
  partenaire: "Partenaire",
  autre: "Autre",
};

export type FinancingMode =
  | "cpf"
  | "opco"
  | "employeur"
  | "autofinancement"
  | "france_travail"
  | "aif"
  | "aide_region"
  | "fse"
  | "mixte"
  | "autre";

export const FINANCING_MODE_LABELS: Record<FinancingMode, string> = {
  cpf: "CPF",
  opco: "OPCO",
  employeur: "Employeur",
  autofinancement: "Autofinancement",
  france_travail: "France Travail",
  aif: "AIF",
  aide_region: "Aide Région",
  fse: "FSE — Fonds Social Européen",
  mixte: "Mixte (plusieurs sources)",
  autre: "Autre",
};

export type InscriptionStage = {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  color: string | null;
  position: number;
  is_initial: boolean;
  is_terminal: boolean;
  is_won: boolean;
  is_lost: boolean;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InscriptionDocument = {
  kind: string;       // 'devis' | 'convention' | 'convocation' | 'attestation' | 'rib' | 'autre'
  file_url: string;
  file_name: string;
  label?: string;
  uploaded_at: string;
};

export type InscriptionRequest = {
  id: string;
  organization_id: string;
  reference: string | null;

  source: InscriptionSource;
  source_details: string | null;

  learner_id: string | null;
  prospect_first_name: string | null;
  prospect_last_name: string | null;
  prospect_email: string | null;
  prospect_phone: string | null;
  prospect_birth_date: string | null;

  company_id: string | null;
  company_name_freetext: string | null;

  target_session_id: string | null;
  target_parcours_id: string | null;
  target_formation_id: string | null;

  financing_mode: FinancingMode | null;
  financing_details: string | null;
  quote_amount_ht: number | null;
  /** OPCO choisi dans le référentiel (table `opcos`).
   *  Renseigné uniquement si financing_mode = "opco" (Gilles 2026-05-21). */
  opco_id: string | null;

  has_special_needs: boolean;
  special_needs_details: string | null;
  handicap_referent_notified: boolean;

  pre_info_sent: boolean;
  pre_info_sent_at: string | null;

  stage_id: string | null;
  assigned_to: string | null;

  received_at: string;
  qualified_at: string | null;
  quote_sent_at: string | null;
  contract_signed_at: string | null;
  convocation_sent_at: string | null;
  closed_at: string | null;

  contact_preference: string | null;

  request_message: string | null;
  notes_internal: string | null;
  tags: string[] | null;

  consent_rgpd_at: string | null;

  documents: InscriptionDocument[];

  // Canal d'inscription (chantier 1) — qui a apporté la demande ?
  inscription_channel: "direct" | "prescripteur" | "of";
  inscription_channel_company_id: string | null;

  // Facturation explicite (migration 0112 — refonte tarification
  // 2026-05-31). Renseignes par le helper computeBillingForInscription
  // ou manuellement par l utilisateur.
  billing_target_company_id?: string | null;
  billing_pricing_mode?:
    | "per_day_per_learner"
    | "flat_per_day"
    | "flat"
    | null;
  billing_unit_price_ht?: number | string | null;
  billing_total_ht?: number | string | null;
  billing_manually_overridden?: boolean | null;
  billing_notes?: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InscriptionEvent = {
  id: string;
  request_id: string;
  event_type: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  payload: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
};

export const INSCRIPTION_EVENT_LABELS: Record<string, string> = {
  created: "Demande créée",
  stage_changed: "Changement d'étape",
  email_sent: "Email envoyé",
  document_added: "Document ajouté",
  document_removed: "Document supprimé",
  note_added: "Note ajoutée",
  assigned: "Assignée à",
  handicap_referent_notified: "Référent handicap notifié",
  pre_info_sent: "Informations préalables envoyées",
};

export type InscriptionEmailTemplate = {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  trigger_stage_key: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
