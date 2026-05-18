export type TrainerStatus =
  | "salarie"
  | "independant"
  | "sous_traitant"
  | "vacataire"
  | "organisme_partenaire";

export type TrainerValidationStatus =
  | "a_valider"
  | "valide"
  | "suspendu"
  | "archive";

export const TRAINER_STATUS_LABELS: Record<TrainerStatus, string> = {
  salarie: "Salarié",
  independant: "Indépendant",
  sous_traitant: "Sous-traitant",
  vacataire: "Vacataire",
  organisme_partenaire: "Organisme partenaire",
};

export const TRAINER_VALIDATION_STATUS_LABELS: Record<
  TrainerValidationStatus,
  string
> = {
  a_valider: "À valider",
  valide: "Validé",
  suspendu: "Suspendu",
  archive: "Archivé",
};

export const TRAINER_STATUS_BADGE_CLASSES: Record<TrainerStatus, string> = {
  salarie:
    "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  independant:
    "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
  sous_traitant:
    "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
  vacataire:
    "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
  organisme_partenaire:
    "bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-900",
};

export const TRAINER_VALIDATION_BADGE_CLASSES: Record<
  TrainerValidationStatus,
  string
> = {
  a_valider:
    "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
  valide:
    "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  suspendu:
    "bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900",
  archive:
    "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export type TrainerDiplomaType =
  | "diplome"
  | "titre_pro"
  | "certification"
  | "habilitation"
  | "attestation"
  | "autre";

export const TRAINER_DIPLOMA_TYPE_LABELS: Record<TrainerDiplomaType, string> = {
  diplome: "Diplôme",
  titre_pro: "Titre professionnel",
  certification: "Certification",
  habilitation: "Habilitation",
  attestation: "Attestation",
  autre: "Autre",
};

export type TrainerDiploma = {
  type: TrainerDiplomaType;
  title: string;
  year?: number | null;
  issuer?: string | null;
  expires_on?: string | null;
  file_url?: string | null;
};

export type TrainerDocumentKind =
  | "cv"
  | "diplome"
  | "contrat"
  | "rc_pro"
  | "urssaf"
  | "kbis"
  | "rib"
  | "charte"
  | "qualiopi"
  | "autre";

export const TRAINER_DOCUMENT_KIND_LABELS: Record<TrainerDocumentKind, string> =
  {
    cv: "CV",
    diplome: "Diplôme / certification",
    contrat: "Contrat / convention",
    rc_pro: "Attestation RC pro",
    urssaf: "Attestation URSSAF",
    kbis: "Kbis / avis SIRENE",
    rib: "RIB",
    charte: "Charte formateur signée",
    qualiopi: "Certificat Qualiopi",
    autre: "Autre",
  };

export type TrainerDocument = {
  kind: TrainerDocumentKind;
  file_url: string;
  file_name: string;
  label?: string;
  uploaded_at: string;
  expires_on?: string | null;
};

export type Trainer = {
  id: string;
  organization_id: string;

  // Identification
  first_name: string;
  last_name: string;
  status: TrainerStatus;
  birth_date: string | null;

  // Coordonnées
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;

  // Externe
  siret: string | null;
  legal_form: string | null;
  company_name: string | null;
  nda: string | null;
  is_qualiopi: boolean;
  qualiopi_expires_on: string | null;
  rib_on_file: boolean;
  company_address: string | null;
  company_postal_code: string | null;
  company_city: string | null;
  company_country: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_address_same: boolean;

  // Contractuel
  contract_type: string | null;
  contract_reference: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;

  // Domaines
  intervention_domains: string[] | null;
  target_audiences: string[] | null;
  intervention_levels: string[] | null;
  modalities: string[] | null;
  intervention_radius_km: number | null;
  intervention_nationwide: boolean;

  // Compétences
  technical_skills: string | null;
  pedagogical_skills: string | null;
  years_pro_experience: number | null;
  years_training_experience: number | null;
  example_trainings: string | null;

  // Diplômes
  diplomas: TrainerDiploma[];

  // Adéquation
  competence_justification: string | null;

  // Évaluation
  satisfaction_avg: number | null;
  satisfaction_scale: number | null;
  last_evaluation_date: string | null;
  evaluation_notes: string | null;
  has_complaints: boolean;
  complaints_notes: string | null;

  // CPD
  cpd_actions: string | null;
  last_cpd_date: string | null;

  // Documents administratifs
  urssaf_attestation_on_file: boolean;
  urssaf_expires_on: string | null;
  rc_pro_on_file: boolean;
  rc_pro_expires_on: string | null;
  kbis_on_file: boolean;

  // Engagement qualité
  charter_signed: boolean;
  charter_signed_on: string | null;
  handicap_procedure_ack: boolean;
  ri_ack: boolean;

  // Documents
  documents: TrainerDocument[];

  // Méta
  validation_status: TrainerValidationStatus;
  validated_by: string | null;
  validated_on: string | null;
  is_active: boolean;
  notes_internal: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TrainerFormation = {
  trainer_id: string;
  formation_id: string;
  justification: string | null;
  created_at: string;
};

export type SkillDomain = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SkillLevel = {
  id: string;
  organization_id: string;
  name: string;
  rank: number;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TrainerCompetence = {
  id: string;
  trainer_id: string;
  domain_id: string;
  level_id: string;
  notes: string | null;
  created_at: string;
};

export type TrainerCompetenceWithLabels = TrainerCompetence & {
  domain: { id: string; name: string } | null;
  level: { id: string; name: string; rank: number; color: string | null } | null;
};

export type AudienceCatalogItem = {
  id: string;
  organization_id: string;
  name: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ModalityCatalogItem = {
  id: string;
  organization_id: string;
  name: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
