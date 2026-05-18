/**
 * Helpers : tarifs négociés par partenaire (OF/prescripteur).
 *
 * Règle métier (cf. décisions Sprint Partenaire) :
 *  - Le portail partenaire n'affiche JAMAIS le prix public.
 *  - Si un tarif négocié existe pour (company × formation), il est affiché.
 *  - Sinon, la session est listée mais le prix est masqué et un bouton
 *    "Nous consulter" propose un mailto vers l'OF organisateur.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PartnerPriceRow = {
  formation_id: string;
  unit_price_ht: number;
  notes: string | null;
};

/** Récupère tous les tarifs négociés d'un partenaire. */
export async function listPartnerPricing(
  supabase: SupabaseClient,
  companyId: string,
): Promise<PartnerPriceRow[]> {
  const { data } = await supabase
    .from("partner_pricing")
    .select("formation_id, unit_price_ht, notes")
    .eq("company_id", companyId);
  return (data as PartnerPriceRow[] | null) ?? [];
}

/** Map formation_id -> prix négocié, pratique côté UI. */
export function pricingByFormationId(
  rows: PartnerPriceRow[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.formation_id, Number(r.unit_price_ht));
  return m;
}

/** Upsert d'un tarif négocié. */
export async function upsertPartnerPrice(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    formationId: string;
    unitPriceHt: number;
    notes?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("partner_pricing").upsert(
    {
      company_id: input.companyId,
      formation_id: input.formationId,
      unit_price_ht: input.unitPriceHt,
      notes: input.notes ?? null,
    },
    { onConflict: "company_id,formation_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Calcule le prix HT effectif d'une formation pour un partenaire,
 * selon les règles métier du portail :
 *
 *   1) Override spécifique (`partner_pricing`) → utilise le prix override
 *   2) Sinon, selon le type :
 *        - prescripteur : daily_rate × duration_days
 *        - of           : quiz_unit_price (forfait par apprenant)
 *   3) Sinon → null (l'UI affichera "Nous consulter")
 */
export type PartnerType = "of" | "prescripteur";

export type EffectivePriceResult = {
  /** Prix HT final par apprenant, ou null si pas de tarif disponible. */
  price: number | null;
  /** Source du prix : "override" | "auto" | null. */
  source: "override" | "auto" | null;
  /** Explication courte pour affichage UI (ex: "85 € × 2 j"). */
  explain: string | null;
};

export function computeEffectivePartnerPrice(input: {
  partnerType: PartnerType;
  /** Tarif HT par jour pour les formations DISTANCIEL (prescripteur). */
  dailyRateDistancielHt: number | null;
  /** Tarif HT par jour pour les formations PRÉSENTIEL (prescripteur). */
  dailyRatePresentielHt: number | null;
  /** Forfait HT par apprenant (OF). null si non défini. */
  quizUnitPriceHt: number | null;
  /** Override spécifique formation × partenaire. undefined si pas d'override. */
  overrideHt: number | undefined;
  /** Durée en jours de la formation (si connue). */
  durationDays: number | null;
  /** Durée en heures (fallback si pas de duration_days). */
  durationHours: number | null;
  /** Modalité de la formation, pour choisir le bon tarif jour. */
  modality: "presentiel" | "distanciel" | "hybride" | null;
}): EffectivePriceResult {
  // 1) Override
  if (typeof input.overrideHt === "number" && Number.isFinite(input.overrideHt)) {
    return {
      price: input.overrideHt,
      source: "override",
      explain: "Tarif négocié spécifique",
    };
  }

  // 2) Calcul auto selon type
  if (input.partnerType === "of") {
    if (
      typeof input.quizUnitPriceHt === "number" &&
      Number.isFinite(input.quizUnitPriceHt)
    ) {
      return {
        price: input.quizUnitPriceHt,
        source: "auto",
        explain: "Forfait quiz / apprenant",
      };
    }
  } else {
    // prescripteur : tarif jour différencié selon la modalité.
    // Pour "hybride", on prend le tarif présentiel par défaut (plus élevé),
    // sinon fallback distanciel si présentiel non défini.
    let dailyRate: number | null = null;
    let modalityLabel = "";
    if (input.modality === "presentiel") {
      dailyRate = input.dailyRatePresentielHt;
      modalityLabel = "présentiel";
    } else if (input.modality === "distanciel") {
      dailyRate = input.dailyRateDistancielHt;
      modalityLabel = "distanciel";
    } else if (input.modality === "hybride") {
      dailyRate =
        input.dailyRatePresentielHt ?? input.dailyRateDistancielHt;
      modalityLabel = "hybride";
    } else {
      // Modalité inconnue : tente distanciel en premier, sinon présentiel.
      dailyRate =
        input.dailyRateDistancielHt ?? input.dailyRatePresentielHt;
    }

    if (typeof dailyRate === "number" && Number.isFinite(dailyRate)) {
      // Détermine la durée en jours : duration_days > duration_hours/7
      let days = input.durationDays;
      if (!days && input.durationHours) {
        days = input.durationHours / 7;
      }
      if (days && days > 0) {
        const total = Math.round(dailyRate * days * 100) / 100;
        const daysLabel = Number.isInteger(days)
          ? `${days} j`
          : `${days.toFixed(1)} j`;
        return {
          price: total,
          source: "auto",
          explain: modalityLabel
            ? `${dailyRate.toFixed(2)} € × ${daysLabel} (tarif ${modalityLabel})`
            : `${dailyRate.toFixed(2)} € × ${daysLabel}`,
        };
      }
    }
  }

  // 3) Rien
  return { price: null, source: null, explain: null };
}

/** Suppression d'un tarif négocié. */
export async function deletePartnerPrice(
  supabase: SupabaseClient,
  companyId: string,
  formationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("partner_pricing")
    .delete()
    .eq("company_id", companyId)
    .eq("formation_id", formationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
