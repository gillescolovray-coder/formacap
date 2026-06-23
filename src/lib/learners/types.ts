export type Learner = {
  id: string;
  organization_id: string;
  civility: string | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  birth_place: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  company_id: string | null;
  company?: { id: string; name: string } | null;
  job_title: string | null;
  special_needs: string | null;
  accessibility: string | null;
  lead_source: string | null;
  notes: string | null;
  is_active: boolean;
  /** Fiche express créée via QR formateur / saisie express (migration 0104),
   *  en attente de complétion. Affichée avec un badge dans la liste. */
  is_temporary?: boolean;
  /** Nom d'entreprise en texte libre tant que la fiche express n'est pas
   *  rattachée à une entreprise référencée (company_id). */
  company_name_temp?: string | null;
  company_siret_temp?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const CIVILITY_OPTIONS = ["M.", "Mme", "Autre"] as const;
