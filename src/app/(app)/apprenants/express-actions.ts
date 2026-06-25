"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rankCompanyMatches } from "@/lib/companies/match";

async function getOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Aucune organisation");
  return { organizationId: data.organization_id as string, userId: user.id };
}

export type CompanySuggestion = {
  id: string;
  name: string;
  siret: string | null;
  postal_code: string | null;
  city: string | null;
  score: number;
  exact: boolean;
};

/**
 * Cherche dans la base Entreprises les fiches au nom PROCHE de `name`
 * (rapprochement flou). Sert à l'assistant de rattachement Express.
 */
export async function suggestCompaniesForName(
  name: string,
): Promise<CompanySuggestion[]> {
  const cleaned = (name ?? "").trim();
  if (!cleaned) return [];
  const { organizationId } = await getOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, name, siret, postal_code, city")
    .eq("organization_id", organizationId);
  const companies = (data ?? []) as Array<{
    id: string;
    name: string;
    siret: string | null;
    postal_code: string | null;
    city: string | null;
  }>;
  return rankCompanyMatches(cleaned, companies, { min: 0.34, limit: 6 }).map(
    (m) => ({
      id: m.company.id,
      name: m.company.name,
      siret: m.company.siret,
      postal_code: m.company.postal_code,
      city: m.company.city,
      score: m.score,
      exact: m.exact,
    }),
  );
}

/**
 * Rattache l'apprenant à une entreprise EXISTANTE et marque la fiche comme
 * complétée (is_temporary = false, on nettoie les champs texte libre).
 */
export async function attachLearnerToCompany(
  learnerId: string,
  companyId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!companyId) return { ok: false, error: "Entreprise manquante" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("learners")
    .update({
      company_id: companyId,
      is_temporary: false,
      company_name_temp: null,
      company_siret_temp: null,
    })
    .eq("id", learnerId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/apprenants");
  revalidatePath(`/apprenants/${learnerId}`);
  revalidatePath("/apprenants/express");
  revalidatePath("/entreprises");
  return { ok: true };
}

/** Données d'une entreprise issues de la recherche SIRENE/INSEE. */
export type SireneAttachInput = {
  name: string;
  siret?: string | null;
  siren?: string | null;
  legal_form?: string | null;
  industry?: string | null;
  naf_code?: string | null;
  legal_status?: string | null;
  pappers_url?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
};

/**
 * Crée une fiche entreprise (à partir d'un résultat SIRENE) si elle n'existe
 * pas déjà (dédup par SIRET puis par nom), puis rattache l'apprenant.
 */
export async function createCompanyFromSireneAndAttach(
  learnerId: string,
  input: SireneAttachInput,
): Promise<{ ok: boolean; error?: string; companyId?: string }> {
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Nom d'entreprise manquant" };
  const { organizationId, userId } = await getOrg();
  const supabase = await createClient();

  // Dédup : SIRET identique, sinon nom identique (insensible à la casse).
  let companyId: string | null = null;
  const siret = (input.siret ?? "").replace(/\D/g, "") || null;
  if (siret) {
    const { data: bySiret } = await supabase
      .from("companies")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("siret", siret)
      .limit(1)
      .maybeSingle();
    if (bySiret?.id) companyId = bySiret.id as string;
  }
  if (!companyId) {
    const { data: byName } = await supabase
      .from("companies")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (byName?.id) companyId = byName.id as string;
  }

  if (!companyId) {
    const rawStatus = input.legal_status;
    const legal_status =
      rawStatus === "A" || rawStatus === "C" || rawStatus === "D"
        ? rawStatus
        : null;
    const siren = (input.siren ?? "").replace(/\D/g, "") || null;
    const pappers_url =
      input.pappers_url ||
      (siren ? `https://www.pappers.fr/entreprise/${siren}` : null);
    const { data: created, error: createErr } = await supabase
      .from("companies")
      .insert({
        organization_id: organizationId,
        name,
        // Employeur de l'apprenant → fiche « client » par défaut.
        type: "client",
        created_by: userId,
        siret,
        siren,
        legal_form: input.legal_form ?? null,
        industry: input.industry ?? input.naf_code ?? null,
        naf_code: input.naf_code ?? null,
        legal_status,
        pappers_url,
        address: input.address ?? null,
        postal_code: input.postal_code ?? null,
        city: input.city ?? null,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return { ok: false, error: createErr?.message ?? "Création échouée" };
    }
    companyId = created.id as string;
  }

  const res = await attachLearnerToCompany(learnerId, companyId);
  return { ...res, companyId };
}
