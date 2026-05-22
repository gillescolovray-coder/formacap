"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function parseAmount(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const s = String(raw).trim().replace(",", ".");
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Variante : 0 ou vide → null (désactivation du défaut)
function parseAmountOrNull(raw: FormDataEntryValue | null): number | null {
  const v = parseAmount(raw);
  return v === null || v <= 0 ? null : v;
}

function parseInt0(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Met à jour les 6 tarifs par défaut + le seuil forfait INTRA pour
 * l'organisation courante. Règle métier R7 — Gilles 2026-05-14.
 *
 * Les valeurs invalides (null ou négatives) sont remplacées par les
 * valeurs par défaut CAP NUMERIQUE.
 */
export async function updatePricingDefaults(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!membership) {
    redirect("/parametres/tarification?error=Aucune+organisation");
  }
  const orgId = membership.organization_id as string;

  const payload = {
    inter_presentiel_per_day_ht:
      parseAmount(formData.get("inter_presentiel_per_day_ht")) ?? 340,
    inter_distanciel_per_day_ht:
      parseAmount(formData.get("inter_distanciel_per_day_ht")) ?? 305,
    intra_presentiel_forfait_ht:
      parseAmount(formData.get("intra_presentiel_forfait_ht")) ?? 1250,
    intra_presentiel_extra_per_day_ht:
      parseAmount(formData.get("intra_presentiel_extra_per_day_ht")) ?? 175,
    intra_distanciel_forfait_ht:
      parseAmount(formData.get("intra_distanciel_forfait_ht")) ?? 990,
    intra_distanciel_extra_per_day_ht:
      parseAmount(formData.get("intra_distanciel_extra_per_day_ht")) ?? 150,
    intra_forfait_threshold:
      parseInt0(formData.get("intra_forfait_threshold")) ?? 4,
    // Tarifs partenaires par défaut (Option A — Gilles 2026-05-22)
    // 0 ou vide → null (désactivation du défaut)
    partner_of_distanciel_per_day_ht: parseAmountOrNull(
      formData.get("partner_of_distanciel_per_day_ht"),
    ),
    partner_of_presentiel_per_day_ht: parseAmountOrNull(
      formData.get("partner_of_presentiel_per_day_ht"),
    ),
    partner_prescripteur_distanciel_per_day_ht: parseAmountOrNull(
      formData.get("partner_prescripteur_distanciel_per_day_ht"),
    ),
    partner_prescripteur_presentiel_per_day_ht: parseAmountOrNull(
      formData.get("partner_prescripteur_presentiel_per_day_ht"),
    ),
  };

  // Upsert : la ligne existe déjà via la migration 0063 (backfill auto),
  // mais on prévoit le cas d'une organisation créée après la migration.
  const { error } = await supabase
    .from("organization_pricing_defaults")
    .upsert(
      { organization_id: orgId, ...payload },
      { onConflict: "organization_id" },
    );

  if (error) {
    redirect(
      `/parametres/tarification?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/tarification");
  redirect("/parametres/tarification?updated=1");
}
