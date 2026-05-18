/**
 * Résout un token portail partenaire vers son contexte complet
 * (entreprise, organisation, etc.). À appeler en tête de chaque
 * Server Component sous /partenaire/[token]/.
 *
 * Utilise le client admin (service_role) car les pages /partenaire
 * sont publiques (pas de session Supabase Auth).
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type PartnerContext = {
  token: string;
  company: {
    id: string;
    name: string;
    type: "of" | "prescripteur";
    organization_id: string;
    email: string | null;
    city: string | null;
    postal_code: string | null;
    /** Tarif HT par jour pour les formations distanciel (prescripteur). */
    daily_rate_distanciel_ht: number | null;
    /** Tarif HT par jour pour les formations présentiel (prescripteur). */
    daily_rate_presentiel_ht: number | null;
    /** Forfait HT par apprenant pour ce partenaire (OF). */
    quiz_unit_price_ht: number | null;
    /** Voir le catalogue distanciel INTER public (prescripteur). */
    show_inter_catalog: boolean;
    /** Voir ses sessions INTRA rattachées (prescripteur). */
    show_own_intra: boolean;
  };
  organization: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    logo_url: string | null;
  };
};

export async function resolvePartnerContext(
  token: string,
): Promise<PartnerContext | null> {
  const supabase = createAdminClient();

  const { data: tokenRow } = await supabase
    .from("partner_portal_tokens")
    .select("company_id")
    .eq("token", token)
    .maybeSingle<{ company_id: string }>();
  if (!tokenRow) return null;

  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, type, organization_id, email, city, postal_code, partner_daily_rate_distanciel_ht, partner_daily_rate_presentiel_ht, partner_quiz_unit_price_ht, partner_portal_show_inter_catalog, partner_portal_show_own_intra",
    )
    .eq("id", tokenRow.company_id)
    .maybeSingle<{
      id: string;
      name: string;
      type: string;
      organization_id: string;
      email: string | null;
      city: string | null;
      postal_code: string | null;
      partner_daily_rate_distanciel_ht: string | number | null;
      partner_daily_rate_presentiel_ht: string | number | null;
      partner_quiz_unit_price_ht: string | number | null;
      partner_portal_show_inter_catalog: boolean | null;
      partner_portal_show_own_intra: boolean | null;
    }>();
  if (!company) return null;

  // Seuls les OF et prescripteurs ont accès au portail partenaire.
  if (company.type !== "of" && company.type !== "prescripteur") {
    return null;
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, email, phone, logo_url")
    .eq("id", company.organization_id)
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
    company: {
      id: company.id,
      name: company.name,
      type: company.type as "of" | "prescripteur",
      organization_id: company.organization_id,
      email: company.email,
      city: company.city,
      postal_code: company.postal_code,
      daily_rate_distanciel_ht:
        company.partner_daily_rate_distanciel_ht !== null &&
        company.partner_daily_rate_distanciel_ht !== undefined
          ? Number(company.partner_daily_rate_distanciel_ht)
          : null,
      daily_rate_presentiel_ht:
        company.partner_daily_rate_presentiel_ht !== null &&
        company.partner_daily_rate_presentiel_ht !== undefined
          ? Number(company.partner_daily_rate_presentiel_ht)
          : null,
      quiz_unit_price_ht:
        company.partner_quiz_unit_price_ht !== null &&
        company.partner_quiz_unit_price_ht !== undefined
          ? Number(company.partner_quiz_unit_price_ht)
          : null,
      show_inter_catalog: company.partner_portal_show_inter_catalog ?? true,
      show_own_intra: company.partner_portal_show_own_intra ?? true,
    },
    organization: org,
  };
}
