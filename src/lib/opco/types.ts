/**
 * Types pour les accords de financement OPCO et leur lien aux
 * demandes d'inscription.
 */

export type OpcoFundingAgreement = {
  id: string;
  organization_id: string;
  opco_name: string;
  dossier_number: string | null;
  agreement_date: string | null; // ISO date YYYY-MM-DD
  total_amount_ht: number | null;
  pdf_url: string | null;
  pdf_filename: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InscriptionOpcoFunding = {
  agreement_id: string;
  inscription_id: string;
  amount_ht: number | null;
  created_at: string;
};

/** Liste des OPCO français les plus fréquents (autocomplete UI). */
export const COMMON_OPCO_NAMES = [
  "AFDAS",
  "AKTO",
  "ATLAS",
  "Constructys",
  "OCAPIAT",
  "OPCO 2i",
  "OPCO EP",
  "OPCO Mobilités",
  "OPCO Santé",
  "Uniformation",
];

/**
 * Résultat d'extraction PDF — toutes les valeurs sont optionnelles
 * car certains champs peuvent ne pas être détectés par le parseur.
 */
export type ExtractedAgreementData = {
  opco_name: string | null;
  dossier_number: string | null;
  agreement_date: string | null; // ISO YYYY-MM-DD
  total_amount_ht: number | null;
  /** Apprenants identifiés dans le PDF (nom prénom + montant si dispo). */
  learners: Array<{
    full_name: string;
    amount_ht: number | null;
  }>;
};
