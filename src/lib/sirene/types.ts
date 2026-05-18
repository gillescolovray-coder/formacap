/**
 * Types pour les résultats de l'API "recherche-entreprises.api.gouv.fr"
 * (data.gouv.fr — gratuite, sans authentification, basée sur l'INSEE Sirene
 * + INPI). Documentation : https://recherche-entreprises.api.gouv.fr
 */

export type SireneLegalStatus = "A" | "C" | "D";
//  A = active
//  C = cessée
//  D = autre (dissolution, redressement, liquidation, sans activité…)

export const SIRENE_STATUS_LABELS: Record<SireneLegalStatus, string> = {
  A: "Active",
  C: "Cessée",
  D: "Procédure / radiée",
};

export const SIRENE_STATUS_BADGE_CLASSES: Record<SireneLegalStatus, string> = {
  A: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  C: "bg-slate-200 text-slate-700 border border-slate-300",
  D: "bg-red-100 text-red-800 border border-red-300",
};

/**
 * Résultat normalisé d'une recherche SIRENE — c'est ce que renvoie
 * `searchSirene()` au composant client.
 */
export type SireneCompany = {
  siren: string;
  siret: string | null;
  name: string;            // raison sociale / nom complet
  legal_form: string | null;
  naf_code: string | null;
  industry: string | null; // libellé du code NAF
  address: string | null;
  postal_code: string | null;
  city: string | null;
  legal_status: SireneLegalStatus;
  legal_status_label: string;
  pappers_url: string;
  /** Liste des dirigeants principaux. */
  directors: Array<{
    first_name: string | null;
    last_name: string | null;
    role: string | null;       // ex : "Président", "Gérant"
  }>;
};
