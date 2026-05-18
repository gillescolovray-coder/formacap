"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePartnerPortalToken } from "@/lib/portal/partner-token";
import {
  deletePartnerPrice,
  upsertPartnerPrice,
} from "@/lib/portal/partner-pricing";

/**
 * Active (génère si besoin) le token portail partenaire pour une
 * entreprise OF/prescripteur. Idempotent : si le token existe déjà,
 * renvoie celui-ci.
 */
export async function activatePartnerPortal(
  companyId: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const { token } = await getOrCreatePartnerPortalToken(supabase, companyId);
    revalidatePath(`/entreprises/${companyId}`);
    return { ok: true, token };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur inconnue",
    };
  }
}

/**
 * Révoque le token portail (le partenaire ne pourra plus accéder
 * via l'ancienne URL). Un nouveau token sera généré au prochain
 * « Activer ».
 */
export async function revokePartnerPortal(
  companyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("partner_portal_tokens")
    .delete()
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true };
}

/**
 * Met à jour les tarifs généraux du partenaire selon son type :
 *
 *   - OF           → `partner_quiz_unit_price_ht` (forfait par apprenant)
 *   - Prescripteur → `partner_daily_rate_distanciel_ht` (tarif jour distanciel)
 *                  + `partner_daily_rate_presentiel_ht` (tarif jour présentiel)
 *
 * Les champs non concernés par le type de l'entreprise sont ignorés.
 */
export async function savePartnerGeneralRate(
  companyId: string,
  rates: {
    /** OF : forfait HT par apprenant pour l'accès aux quiz. */
    quizUnitPriceHt?: number | null;
    /** Prescripteur : tarif HT par jour pour les formations distanciel. */
    dailyRateDistancielHt?: number | null;
    /** Prescripteur : tarif HT par jour pour les formations présentiel. */
    dailyRatePresentielHt?: number | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("type")
    .eq("id", companyId)
    .maybeSingle<{ type: string }>();
  if (!company) return { ok: false, error: "Entreprise introuvable" };

  const sanitize = (n: number | null | undefined): number | null => {
    if (n === null || n === undefined) return null;
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  const patch: Record<string, number | null> = {};
  if (company.type === "of") {
    if (rates.quizUnitPriceHt !== undefined) {
      patch.partner_quiz_unit_price_ht = sanitize(rates.quizUnitPriceHt);
    }
  } else if (company.type === "prescripteur") {
    if (rates.dailyRateDistancielHt !== undefined) {
      patch.partner_daily_rate_distanciel_ht = sanitize(
        rates.dailyRateDistancielHt,
      );
    }
    if (rates.dailyRatePresentielHt !== undefined) {
      patch.partner_daily_rate_presentiel_ht = sanitize(
        rates.dailyRatePresentielHt,
      );
    }
  } else {
    return { ok: false, error: "Type d'entreprise non éligible." };
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true };
  }

  const { error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true };
}

/**
 * Met à jour les toggles de visibilité du catalogue dans le portail
 * partenaire (uniquement pertinent pour les prescripteurs).
 */
export async function savePartnerPortalVisibility(
  companyId: string,
  toggles: { showInterCatalog: boolean; showOwnIntra: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      partner_portal_show_inter_catalog: toggles.showInterCatalog,
      partner_portal_show_own_intra: toggles.showOwnIntra,
    })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true };
}

export async function savePartnerPrice(
  companyId: string,
  formationId: string,
  unitPriceHt: number,
  notes: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const res = await upsertPartnerPrice(supabase, {
    companyId,
    formationId,
    unitPriceHt,
    notes,
  });
  if (res.ok) revalidatePath(`/entreprises/${companyId}`);
  return res;
}

export async function removePartnerPrice(
  companyId: string,
  formationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const res = await deletePartnerPrice(supabase, companyId, formationId);
  if (res.ok) revalidatePath(`/entreprises/${companyId}`);
  return res;
}
