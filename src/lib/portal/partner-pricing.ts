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
 *   2) Sinon : daily_rate × duration_days (selon la modalité), pour OF
 *      ET prescripteur. Modèle harmonisé depuis 2026-05-18.
 *   3) NOUVEAU (Option A — 2026-05-22) : tarif par défaut au niveau
 *      organisation (organization_pricing_defaults.partner_*_per_day_ht)
 *      selon partnerType × modalité. Évite la saisie manuelle sur
 *      chaque société partenaire.
 *   4) Fallback OF legacy : quiz_unit_price (forfait par apprenant) si
 *      l'OF n'a pas encore migré vers les tarifs jour.
 *   5) Sinon → null (l'UI affichera "Nous consulter")
 */
export type PartnerType = "of" | "prescripteur";

export type EffectivePriceResult = {
  /** Prix HT final. En mode "per_learner" = prix par apprenant.
   *  En mode "flat_per_day" = total forfaitaire pour la session (peu
   *  importe le nombre d apprenants). Null si pas de tarif disponible. */
  price: number | null;
  /** Source du prix : "override" | "auto" | null. */
  source: "override" | "auto" | null;
  /** Mode de tarification (Gilles 2026-06-01) :
   *  - "per_learner" : prix multiplie par chaque apprenant (catalogue
   *    classique : CAP organise, l OF/prescripteur revend).
   *  - "flat_per_day" : forfait journalier, independant du nombre
   *    d apprenants (sous-traitance : l OF organise, CAP intervient). */
  pricingMode: "per_learner" | "flat_per_day" | null;
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
  /** Tarifs par défaut au niveau organisation (Option A — 2026-05-22). */
  orgDefaultOfDistancielHt?: number | null;
  orgDefaultOfPresentielHt?: number | null;
  orgDefaultPrescripteurDistancielHt?: number | null;
  orgDefaultPrescripteurPresentielHt?: number | null;
  /** TRUE si la session est en sous-traitance (cet OF/prescripteur est
   *  donneur d ordre, CAP intervient). Active le mode forfait journalier.
   *  Gilles 2026-06-01. */
  isSubcontracting?: boolean;
  /** Tarif HT par jour DISTANCIEL en sous-traitance (sur companies).
   *  Fallback sur dailyRateDistancielHt si null. */
  subcontractingDailyRateDistancielHt?: number | null;
  /** Tarif HT par jour PRESENTIEL en sous-traitance. */
  subcontractingDailyRatePresentielHt?: number | null;
}): EffectivePriceResult {
  // 0) Mode sous-traitance (Gilles 2026-06-01) : prix = forfait
  //    journalier (independant du nb d apprenants). Tarif = champ
  //    subcontracting_daily_rate_X_ht ; fallback sur daily_rate_X_ht
  //    standard si vide (decision Gilles 2026-06-01).
  if (input.isSubcontracting) {
    let subDaily: number | null = null;
    let modalityLabel = "";
    if (input.modality === "presentiel") {
      subDaily =
        input.subcontractingDailyRatePresentielHt ??
        input.dailyRatePresentielHt;
      modalityLabel = "présentiel";
    } else if (input.modality === "distanciel") {
      subDaily =
        input.subcontractingDailyRateDistancielHt ??
        input.dailyRateDistancielHt;
      modalityLabel = "distanciel";
    } else if (input.modality === "hybride") {
      subDaily =
        input.subcontractingDailyRatePresentielHt ??
        input.subcontractingDailyRateDistancielHt ??
        input.dailyRatePresentielHt ??
        input.dailyRateDistancielHt;
      modalityLabel = "hybride";
    } else {
      subDaily =
        input.subcontractingDailyRateDistancielHt ??
        input.subcontractingDailyRatePresentielHt ??
        input.dailyRateDistancielHt ??
        input.dailyRatePresentielHt;
    }
    if (typeof subDaily === "number" && Number.isFinite(subDaily) && subDaily > 0) {
      let days = input.durationDays;
      if (!days && input.durationHours) days = input.durationHours / 7;
      if (days && days > 0) {
        const total = Math.round(subDaily * days * 100) / 100;
        const daysLabel = Number.isInteger(days)
          ? `${days} j`
          : `${days.toFixed(1)} j`;
        return {
          price: total,
          source: "auto",
          pricingMode: "flat_per_day",
          explain: `${subDaily.toFixed(2)} € × ${daysLabel} (forfait sous-traitance${modalityLabel ? ` ${modalityLabel}` : ""})`,
        };
      }
    }
    // Si on n a aucun tarif sous-traitance ni standard utilisable on
    // tombe naturellement sur null en sortie (les branches suivantes
    // ne s appliquent pas en mode sous-traitance).
    return { price: null, source: null, pricingMode: null, explain: null };
  }

  // 1) Override
  if (typeof input.overrideHt === "number" && Number.isFinite(input.overrideHt)) {
    return {
      price: input.overrideHt,
      source: "override",
      pricingMode: "per_learner",
      explain: "Tarif négocié spécifique",
    };
  }

  // 2) Calcul auto : tarif jour × durée (OF ET prescripteur depuis
  //    l'harmonisation 2026-05-18).
  // Choix du tarif jour selon la modalité. Pour "hybride", on prend le
  // présentiel par défaut (plus élevé), fallback distanciel sinon.
  let dailyRate: number | null = null;
  let modalityLabel = "";
  if (input.modality === "presentiel") {
    dailyRate = input.dailyRatePresentielHt;
    modalityLabel = "présentiel";
  } else if (input.modality === "distanciel") {
    dailyRate = input.dailyRateDistancielHt;
    modalityLabel = "distanciel";
  } else if (input.modality === "hybride") {
    dailyRate = input.dailyRatePresentielHt ?? input.dailyRateDistancielHt;
    modalityLabel = "hybride";
  } else {
    // Modalité inconnue : tente distanciel en premier, sinon présentiel.
    dailyRate = input.dailyRateDistancielHt ?? input.dailyRatePresentielHt;
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
        pricingMode: "per_learner",
        explain: modalityLabel
          ? `${dailyRate.toFixed(2)} € × ${daysLabel} (tarif ${modalityLabel})`
          : `${dailyRate.toFixed(2)} € × ${daysLabel}`,
      };
    }
  }

  // 3) Tarif par défaut au niveau organisation (Option A — 2026-05-22).
  //    Permet à un admin de définir un tarif générique pour TOUS les OF
  //    (ou TOUS les prescripteurs) sans avoir à saisir chaque société.
  let orgDaily: number | null | undefined = null;
  let orgLabel = "";
  if (input.partnerType === "of") {
    if (input.modality === "presentiel") {
      orgDaily = input.orgDefaultOfPresentielHt;
      orgLabel = "présentiel — défaut OF";
    } else if (input.modality === "distanciel") {
      orgDaily = input.orgDefaultOfDistancielHt;
      orgLabel = "distanciel — défaut OF";
    } else if (input.modality === "hybride") {
      orgDaily =
        input.orgDefaultOfPresentielHt ?? input.orgDefaultOfDistancielHt;
      orgLabel = "hybride — défaut OF";
    } else {
      orgDaily =
        input.orgDefaultOfDistancielHt ?? input.orgDefaultOfPresentielHt;
      orgLabel = "défaut OF";
    }
  } else {
    // prescripteur
    if (input.modality === "presentiel") {
      orgDaily = input.orgDefaultPrescripteurPresentielHt;
      orgLabel = "présentiel — défaut prescripteur";
    } else if (input.modality === "distanciel") {
      orgDaily = input.orgDefaultPrescripteurDistancielHt;
      orgLabel = "distanciel — défaut prescripteur";
    } else if (input.modality === "hybride") {
      orgDaily =
        input.orgDefaultPrescripteurPresentielHt ??
        input.orgDefaultPrescripteurDistancielHt;
      orgLabel = "hybride — défaut prescripteur";
    } else {
      orgDaily =
        input.orgDefaultPrescripteurDistancielHt ??
        input.orgDefaultPrescripteurPresentielHt;
      orgLabel = "défaut prescripteur";
    }
  }
  if (typeof orgDaily === "number" && Number.isFinite(orgDaily) && orgDaily > 0) {
    let days = input.durationDays;
    if (!days && input.durationHours) {
      days = input.durationHours / 7;
    }
    if (days && days > 0) {
      const total = Math.round(orgDaily * days * 100) / 100;
      const daysLabel = Number.isInteger(days)
        ? `${days} j`
        : `${days.toFixed(1)} j`;
      return {
        price: total,
        source: "auto",
        pricingMode: "per_learner",
        explain: `${orgDaily.toFixed(2)} € × ${daysLabel} (${orgLabel})`,
      };
    }
  }

  // 4) Fallback OF legacy : forfait quiz par apprenant (rétrocompat
  //    pour les OF qui n'ont pas encore renseigné les tarifs jour).
  if (
    input.partnerType === "of" &&
    typeof input.quizUnitPriceHt === "number" &&
    Number.isFinite(input.quizUnitPriceHt)
  ) {
    return {
      price: input.quizUnitPriceHt,
      source: "auto",
      pricingMode: "per_learner",
      explain: "Forfait quiz / apprenant (legacy)",
    };
  }

  // 5) Rien
  return { price: null, source: null, pricingMode: null, explain: null };
}

/**
 * Charge les tarifs partenaires par défaut au niveau organisation
 * (Option A — 2026-05-22). Renvoie un objet vide si la ligne ou les
 * colonnes n'existent pas encore (migration 0096 pas encore appliquée).
 */
export type OrgPartnerDefaults = {
  orgDefaultOfDistancielHt: number | null;
  orgDefaultOfPresentielHt: number | null;
  orgDefaultPrescripteurDistancielHt: number | null;
  orgDefaultPrescripteurPresentielHt: number | null;
};

export async function loadOrgPartnerDefaults(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrgPartnerDefaults> {
  try {
    const { data } = await supabase
      .from("organization_pricing_defaults")
      .select(
        "partner_of_distanciel_per_day_ht, partner_of_presentiel_per_day_ht, partner_prescripteur_distanciel_per_day_ht, partner_prescripteur_presentiel_per_day_ht",
      )
      .eq("organization_id", organizationId)
      .maybeSingle();
    const row = data as {
      partner_of_distanciel_per_day_ht: number | string | null;
      partner_of_presentiel_per_day_ht: number | string | null;
      partner_prescripteur_distanciel_per_day_ht: number | string | null;
      partner_prescripteur_presentiel_per_day_ht: number | string | null;
    } | null;
    const toNum = (v: number | string | null | undefined): number | null => {
      if (v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      orgDefaultOfDistancielHt: toNum(row?.partner_of_distanciel_per_day_ht),
      orgDefaultOfPresentielHt: toNum(row?.partner_of_presentiel_per_day_ht),
      orgDefaultPrescripteurDistancielHt: toNum(
        row?.partner_prescripteur_distanciel_per_day_ht,
      ),
      orgDefaultPrescripteurPresentielHt: toNum(
        row?.partner_prescripteur_presentiel_per_day_ht,
      ),
    };
  } catch {
    return {
      orgDefaultOfDistancielHt: null,
      orgDefaultOfPresentielHt: null,
      orgDefaultPrescripteurDistancielHt: null,
      orgDefaultPrescripteurPresentielHt: null,
    };
  }
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
