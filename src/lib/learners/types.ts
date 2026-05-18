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
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const CIVILITY_OPTIONS = ["M.", "Mme", "Autre"] as const;
