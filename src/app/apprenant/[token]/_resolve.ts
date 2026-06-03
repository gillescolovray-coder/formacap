/**
 * Résout un token portail apprenant vers son contexte complet
 * (learner + organization). A appeler en tete de chaque Server
 * Component sous /apprenant/[token]/.
 *
 * Utilise le client admin (service_role) car les pages /apprenant
 * sont publiques (pas de session Supabase Auth — la possession du
 * token vaut authentification).
 *
 * Pattern identique au /partenaire/[token]/_resolve.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type LearnerContext = {
  token: string;
  learner: {
    id: string;
    organization_id: string;
    civility: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    job_title: string | null;
    company_id: string | null;
    company_name: string | null;
  };
  organization: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    logo_url: string | null;
  };
};

export async function resolveLearnerContext(
  token: string,
): Promise<LearnerContext | null> {
  const supabase = createAdminClient();

  const { data: tokenRow } = await supabase
    .from("learner_portal_tokens")
    .select("learner_id")
    .eq("token", token)
    .maybeSingle<{ learner_id: string }>();
  if (!tokenRow) return null;

  const { data: learner } = await supabase
    .from("learners")
    .select(
      "id, organization_id, civility, first_name, last_name, email, phone, mobile, job_title, company_id, company:companies(name)",
    )
    .eq("id", tokenRow.learner_id)
    .maybeSingle<{
      id: string;
      organization_id: string;
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      mobile: string | null;
      job_title: string | null;
      company_id: string | null;
      company:
        | { name: string }
        | Array<{ name: string }>
        | null;
    }>();
  if (!learner) return null;

  const companyObj = Array.isArray(learner.company)
    ? learner.company[0]
    : learner.company;

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, email, phone, logo_url")
    .eq("id", learner.organization_id)
    .maybeSingle<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      logo_url: string | null;
    }>();
  if (!org) return null;

  return {
    token,
    learner: {
      id: learner.id,
      organization_id: learner.organization_id,
      civility: learner.civility,
      first_name: learner.first_name,
      last_name: learner.last_name,
      email: learner.email,
      phone: learner.phone,
      mobile: learner.mobile,
      job_title: learner.job_title,
      company_id: learner.company_id,
      company_name: companyObj?.name ?? null,
    },
    organization: org,
  };
}
