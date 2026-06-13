"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadAndComputeBillingForInscription,
  persistComputedBilling,
} from "@/lib/billing/compute-billing";
import { assertInscriptionSessionEditable } from "@/lib/sessions/lock";

/**
 * Recalcule le billing par defaut a partir des regles metier et
 * persiste dans inscription_requests.billing_*.
 *
 * - force=false (defaut) : respecte billing_manually_overridden
 * - force=true : ecrase meme si manual override (utile bouton "Reset")
 *
 * Apres recalc force, on reset aussi billing_manually_overridden=false.
 */
export async function recomputeBillingForInscription(
  inscriptionId: string,
  opts?: { force?: boolean },
): Promise<{
  ok: boolean;
  error?: string;
  explain?: string;
  warnings?: string[];
}> {
  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };
  const lock = await assertInscriptionSessionEditable(userSupabase, inscriptionId);
  if (!lock.ok) return lock;

  const supabaseAdmin = createAdminClient();
  const result = await loadAndComputeBillingForInscription(
    supabaseAdmin,
    inscriptionId,
  );

  const persistRes = await persistComputedBilling(
    supabaseAdmin,
    inscriptionId,
    result,
    { force: !!opts?.force },
  );
  if (!persistRes.ok) {
    return { ok: false, error: persistRes.error ?? "Erreur de persistance" };
  }

  // Si force=true, on remet le flag manual=false (le calcul auto reprend
  // la main).
  if (opts?.force) {
    await supabaseAdmin
      .from("inscription_requests")
      .update({ billing_manually_overridden: false })
      .eq("id", inscriptionId);
  }

  revalidatePath(`/inscriptions/${inscriptionId}`);
  return {
    ok: true,
    explain: result.explain,
    warnings: result.warnings,
  };
}

/**
 * Modification manuelle des champs billing_*. Active automatiquement
 * billing_manually_overridden=true pour empecher le recalcul auto.
 */
export type ManualBillingPatch = {
  billingTargetCompanyId?: string | null;
  billingPricingMode?: "per_day_per_learner" | "flat_per_day" | "flat" | null;
  billingUnitPriceHt?: number | null;
  billingTotalHt?: number | null;
  billingNotes?: string | null;
};

export async function saveManualBilling(
  inscriptionId: string,
  patch: ManualBillingPatch,
): Promise<{ ok: boolean; error?: string }> {
  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };
  const lock = await assertInscriptionSessionEditable(userSupabase, inscriptionId);
  if (!lock.ok) return lock;

  const supabase = createAdminClient();
  const update: Record<string, unknown> = {
    billing_manually_overridden: true,
  };
  if (patch.billingTargetCompanyId !== undefined) {
    update.billing_target_company_id = patch.billingTargetCompanyId;
  }
  if (patch.billingPricingMode !== undefined) {
    update.billing_pricing_mode = patch.billingPricingMode;
  }
  if (patch.billingUnitPriceHt !== undefined) {
    const n = patch.billingUnitPriceHt;
    update.billing_unit_price_ht =
      n === null || (Number.isFinite(n) && n >= 0) ? n : null;
  }
  if (patch.billingTotalHt !== undefined) {
    const n = patch.billingTotalHt;
    update.billing_total_ht =
      n === null || (Number.isFinite(n) && n >= 0) ? n : null;
  }
  if (patch.billingNotes !== undefined) {
    update.billing_notes = patch.billingNotes ?? null;
  }

  const { data: updated, error } = await supabase
    .from("inscription_requests")
    .update(update)
    .eq("id", inscriptionId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Aucune ligne modifiée." };
  }
  revalidatePath(`/inscriptions/${inscriptionId}`);
  return { ok: true };
}
