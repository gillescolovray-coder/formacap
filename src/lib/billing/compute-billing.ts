/**
 * Helper unifié de calcul de FACTURATION pour une inscription
 * (Refonte tarification — Gilles 2026-05-31).
 *
 * BUT : centraliser la logique "qui CAP NUMERIQUE facture + combien"
 * pour toutes les inscriptions, quel que soit le scenario metier.
 * Cette fonction remplace les calculs eparpilles dans :
 *   - dashboard
 *   - convention de formation
 *   - attestation
 *   - portail partenaire
 *   - fiche inscription
 *
 * 4 scenarios metier (cf. memoire project_refonte_tarifaire_opco) :
 *
 *  CAS 1 — DIRECT CAP
 *    Inscription directe (pas de partenaire, pas de sous-traitance).
 *    Cible facture : entreprise de l'apprenant.
 *    Tarif : public_price_excl_tax de la formation (forfait par apprenant).
 *
 *  CAS 2a — OF ACHETE DES PLACES
 *    Inscription via un OF (referrer.type = 'of').
 *    Cible facture : l'OF lui-meme (referrer).
 *    Tarif : partner_daily_rate_*_ht × duration_days (par inscription).
 *
 *  CAS 2b — PRESCRIPTEUR
 *    Inscription via un Prescripteur (referrer.type = 'prescripteur').
 *    DEFAUT : cible facture = entreprise de l'apprenant (client final).
 *    Tarif : si partner_daily_rate_*_ht negocie -> tarif jour x duree
 *            sinon -> tarif catalogue formation (forfait).
 *    NB : le prescripteur peut etre remunere via commission_*
 *         (calculee a part, pas dans le billing inscription).
 *
 *  CAS 3 — CAP SOUS-TRAITE POUR UN OF
 *    Session avec subcontracting_company_id renseigne (l'OF organisateur).
 *    Cible facture : l'OF organisateur.
 *    Tarif : subcontracting_daily_rate_*_ht × duration_days
 *    Mode FORFAIT JOUR : independant du nombre d'apprenants
 *    (-> a facturer 1 seule fois pour TOUTE la session).
 *
 * IMPORTANT : ce helper est PUR (pas d'I/O). Il prend toutes les
 * donnees deja chargees en input. Une fonction async wrapper
 * `loadAndComputeBillingForInscription` (separee, plus bas) charge
 * les donnees depuis Supabase.
 *
 * Pour la SOURCE DE VERITE : on stocke le resultat de ce helper
 * dans inscription_requests.billing_* a la creation/modification de
 * l'inscription. Si Gilles modifie a la main (billing_manually_overridden
 * = true), le helper ne touche plus, on lit juste ce qui est stocke.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeSessionPrice } from "@/lib/pricing/compute";

export type BillingPricingMode =
  | "per_day_per_learner"
  | "flat_per_day"
  | "flat";

export type BillingScenario =
  | "direct"
  | "partner_of"
  | "prescripteur_default"
  | "prescripteur_negotiated"
  | "subcontracting";

export type ComputeBillingInput = {
  /** Modalite de la session. */
  sessionModality: "presentiel" | "distanciel" | "hybride" | null;
  /** Duree de la formation en jours (numeric, peut etre 0.5). */
  formationDurationDays: number | null;
  /** Prix public HT de la formation (forfait par apprenant). */
  formationPublicPriceHt: number | null;
  /** Si la session est sous-traitee, l'OF organisateur. */
  subcontractingCompany: {
    id: string;
    name: string | null;
    subcontractingDailyRateDistancielHt: number | null;
    subcontractingDailyRatePresentielHt: number | null;
  } | null;
  /** Entreprise de l'apprenant (peut etre null si inscription perso). */
  learnerCompany: {
    id: string;
    name: string | null;
  } | null;
  /** Entreprise referrer (le partenaire qui a inscrit). null si direct. */
  referrerCompany: {
    id: string;
    name: string | null;
    type: string | null; // 'of' | 'prescripteur' | ...
    partnerDailyRateDistancielHt: number | null;
    partnerDailyRatePresentielHt: number | null;
    partnerQuizUnitPriceHt: number | null;
  } | null;
  /** Override eventuel partner_pricing (par formation × company). */
  partnerPriceOverrideHt: number | null;
  /**
   * Tarification R7 de la SESSION (« la fiche fait foi » — Gilles 2026-06-25).
   * En CAS DIRECT, on facture au tarif de la fiche session (per_learner ou
   * forfait) PLUTÔT qu'au catalogue formation. null = pas de R7 -> catalogue.
   */
  sessionPricing?: {
    mode: "per_learner" | "forfait" | null;
    pricePerDayHt: number | null;
    priceForfaitHt: number | null;
    priceExtraPerDayHt: number | null;
    threshold: number | null;
  } | null;
  /** Nb d'apprenants facturables de la session (pour répartir un forfait INTRA). */
  sessionBillableLearners?: number | null;
};

export type ComputeBillingResult = {
  scenario: BillingScenario;
  /** Qui CAP NUMERIQUE facture pour cette inscription. */
  targetCompanyId: string | null;
  /** Nom lisible (pour l'UI). */
  targetCompanyName: string | null;
  /** Mode de tarification. */
  mode: BillingPricingMode;
  /** Tarif unitaire HT (interpretation depend du mode). */
  unitPriceHt: number | null;
  /** Total HT pour CETTE inscription. */
  totalHt: number | null;
  /** Explication courte (1 ligne) pour affichage UI. */
  explain: string;
  /** Avertissements eventuels (tarif manquant, fallback applique, etc.). */
  warnings: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Choisit le tarif jour selon la modalite (presentiel / distanciel /
 * hybride). Pour hybride : prefere presentiel (plus eleve), fallback
 * distanciel.
 */
function pickDailyRate(
  modality: ComputeBillingInput["sessionModality"],
  distanciel: number | null,
  presentiel: number | null,
): number | null {
  if (modality === "presentiel") return presentiel;
  if (modality === "distanciel") return distanciel;
  if (modality === "hybride") return presentiel ?? distanciel;
  return distanciel ?? presentiel;
}

/**
 * Helper PUR : calcule le billing par defaut pour une inscription
 * a partir des donnees deja chargees.
 */
export function computeBillingForInscription(
  input: ComputeBillingInput,
): ComputeBillingResult {
  const warnings: string[] = [];
  const days = input.formationDurationDays ?? null;
  if (!days || days <= 0) {
    warnings.push("Duree de formation non definie : tarif non calculable.");
  }

  // ============================================================
  // CAS 3 — SOUS-TRAITANCE (priorite la plus haute : si la session
  // est marquee comme sous-traitee, on ignore le referrer).
  // ============================================================
  if (input.subcontractingCompany) {
    const sub = input.subcontractingCompany;
    const rate = pickDailyRate(
      input.sessionModality,
      sub.subcontractingDailyRateDistancielHt,
      sub.subcontractingDailyRatePresentielHt,
    );
    if (rate == null) {
      warnings.push(
        `Tarif sous-traitance manquant pour ${sub.name ?? "l'OF organisateur"} (modalite ${input.sessionModality ?? "n/d"}).`,
      );
    }
    // Total JOURNALIER de la session (indépendant du nb d'apprenants).
    const sessionTotal =
      rate != null && days && days > 0 ? round2(rate * days) : null;
    // On RÉPARTIT ce total sur les apprenants facturables : billing_total_ht
    // est stocké PAR inscription, et la somme des inscriptions doit égaler le
    // total session (sinon l'onglet Participants affiche total × nb apprenants
    // — bug Gilles 2026-06-26 : 650 €/apprenant au lieu de 650 € pour 4).
    const nb = Math.max(input.sessionBillableLearners ?? 1, 1);
    const perHead = sessionTotal != null ? round2(sessionTotal / nb) : null;
    return {
      scenario: "subcontracting",
      targetCompanyId: sub.id,
      targetCompanyName: sub.name,
      mode: "flat_per_day",
      unitPriceHt: perHead,
      totalHt: perHead,
      explain:
        rate != null && days && sessionTotal != null
          ? `Sous-traitance : ${rate.toFixed(2)} EUR/j × ${days} j = ${sessionTotal.toFixed(2)} EUR pour la session (forfait, indépendant du nb d'apprenants), réparti sur ${nb} apprenant(s) = ${perHead?.toFixed(2)} EUR/inscription`
          : "Sous-traitance : tarif a definir sur la fiche OF",
      warnings,
    };
  }

  // ============================================================
  // CAS 2a — OF ACHETE DES PLACES (referrer.type = 'of')
  // ============================================================
  if (input.referrerCompany && input.referrerCompany.type === "of") {
    const ref = input.referrerCompany;
    // 1) Override partner_pricing prioritaire
    if (input.partnerPriceOverrideHt != null) {
      return {
        scenario: "partner_of",
        targetCompanyId: ref.id,
        targetCompanyName: ref.name,
        mode: "flat",
        unitPriceHt: input.partnerPriceOverrideHt,
        totalHt: input.partnerPriceOverrideHt,
        explain: `OF ${ref.name ?? ""} : tarif negocie ${input.partnerPriceOverrideHt.toFixed(2)} EUR (override formation)`,
        warnings,
      };
    }
    // 2) Tarif jour partenaire
    const rate = pickDailyRate(
      input.sessionModality,
      ref.partnerDailyRateDistancielHt,
      ref.partnerDailyRatePresentielHt,
    );
    if (rate != null && days && days > 0) {
      const total = round2(rate * days);
      return {
        scenario: "partner_of",
        targetCompanyId: ref.id,
        targetCompanyName: ref.name,
        mode: "per_day_per_learner",
        unitPriceHt: rate,
        totalHt: total,
        explain: `OF ${ref.name ?? ""} : ${rate.toFixed(2)} EUR/j × ${days} j (par apprenant)`,
        warnings,
      };
    }
    // 3) Fallback legacy : quiz unit price
    if (ref.partnerQuizUnitPriceHt != null) {
      warnings.push(
        "Fallback legacy 'partner_quiz_unit_price_ht' — renseigner partner_daily_rate.",
      );
      return {
        scenario: "partner_of",
        targetCompanyId: ref.id,
        targetCompanyName: ref.name,
        mode: "flat",
        unitPriceHt: ref.partnerQuizUnitPriceHt,
        totalHt: ref.partnerQuizUnitPriceHt,
        explain: `OF ${ref.name ?? ""} : ${ref.partnerQuizUnitPriceHt.toFixed(2)} EUR (forfait legacy)`,
        warnings,
      };
    }
    warnings.push(
      `Aucun tarif defini pour l'OF ${ref.name ?? ""} (renseigner partner_daily_rate sur la fiche entreprise).`,
    );
    return {
      scenario: "partner_of",
      targetCompanyId: ref.id,
      targetCompanyName: ref.name,
      mode: "per_day_per_learner",
      unitPriceHt: null,
      totalHt: null,
      explain: `OF ${ref.name ?? ""} : tarif a definir`,
      warnings,
    };
  }

  // ============================================================
  // CAS 2b — PRESCRIPTEUR
  // DEFAUT : CAP facture le CLIENT FINAL (entreprise apprenant).
  // Si tarif negocie partenaire -> tarif jour × duree
  // Sinon -> tarif catalogue formation (forfait)
  // ============================================================
  if (input.referrerCompany && input.referrerCompany.type === "prescripteur") {
    const ref = input.referrerCompany;
    const target = input.learnerCompany ?? null;
    if (!target) {
      warnings.push(
        "Inscription via prescripteur sans entreprise apprenant : impossible de determiner la cible de facturation.",
      );
    }
    // 1) Override formation × prescripteur
    if (input.partnerPriceOverrideHt != null) {
      return {
        scenario: "prescripteur_negotiated",
        targetCompanyId: target?.id ?? null,
        targetCompanyName: target?.name ?? null,
        mode: "flat",
        unitPriceHt: input.partnerPriceOverrideHt,
        totalHt: input.partnerPriceOverrideHt,
        explain: `Client de ${ref.name ?? "prescripteur"} : tarif negocie ${input.partnerPriceOverrideHt.toFixed(2)} EUR`,
        warnings,
      };
    }
    // 2) Tarif jour negocie au niveau prescripteur
    const negotiatedRate = pickDailyRate(
      input.sessionModality,
      ref.partnerDailyRateDistancielHt,
      ref.partnerDailyRatePresentielHt,
    );
    if (negotiatedRate != null && days && days > 0) {
      const total = round2(negotiatedRate * days);
      return {
        scenario: "prescripteur_negotiated",
        targetCompanyId: target?.id ?? null,
        targetCompanyName: target?.name ?? null,
        mode: "per_day_per_learner",
        unitPriceHt: negotiatedRate,
        totalHt: total,
        explain: `Client de ${ref.name ?? "prescripteur"} : ${negotiatedRate.toFixed(2)} EUR/j × ${days} j (tarif negocie)`,
        warnings,
      };
    }
    // 3) Fallback : tarif catalogue
    if (input.formationPublicPriceHt != null) {
      return {
        scenario: "prescripteur_default",
        targetCompanyId: target?.id ?? null,
        targetCompanyName: target?.name ?? null,
        mode: "flat",
        unitPriceHt: input.formationPublicPriceHt,
        totalHt: input.formationPublicPriceHt,
        explain: `Client de ${ref.name ?? "prescripteur"} : tarif catalogue ${input.formationPublicPriceHt.toFixed(2)} EUR`,
        warnings,
      };
    }
    warnings.push("Tarif catalogue formation manquant.");
    return {
      scenario: "prescripteur_default",
      targetCompanyId: target?.id ?? null,
      targetCompanyName: target?.name ?? null,
      mode: "flat",
      unitPriceHt: null,
      totalHt: null,
      explain: `Client de ${ref.name ?? "prescripteur"} : tarif a definir`,
      warnings,
    };
  }

  // ============================================================
  // CAS 1 — DIRECT CAP (pas de referrer, pas de sous-traitance)
  // « La fiche fait foi » (Gilles 2026-06-25) : on facture au tarif R7 de la
  // SESSION (per_learner ou forfait) si configuré ; catalogue en repli.
  // ============================================================
  const target = input.learnerCompany ?? null;
  if (!target) {
    warnings.push("Inscription sans entreprise apprenant (particulier ?).");
  }

  const sp = input.sessionPricing;
  const effDays = input.formationDurationDays; // = jours effectifs (planning sinon formation)
  if (sp?.mode && effDays && effDays > 0) {
    if (sp.mode === "per_learner" && sp.pricePerDayHt && sp.pricePerDayHt > 0) {
      const amt = round2(sp.pricePerDayHt * effDays);
      return {
        scenario: "direct",
        targetCompanyId: target?.id ?? null,
        targetCompanyName: target?.name ?? null,
        mode: "per_day_per_learner",
        unitPriceHt: sp.pricePerDayHt,
        totalHt: amt,
        explain: `Facture directe : ${sp.pricePerDayHt.toFixed(2)} EUR/j × ${effDays} j = ${amt.toFixed(2)} EUR`,
        warnings,
      };
    }
    if (sp.mode === "forfait" && sp.priceForfaitHt && sp.priceForfaitHt > 0) {
      const nb = Math.max(input.sessionBillableLearners ?? 1, 1);
      const breakdown = computeSessionPrice(
        {
          mode: "forfait",
          pricePerDayHt: null,
          priceForfaitHt: sp.priceForfaitHt,
          priceExtraPerDayHt: sp.priceExtraPerDayHt,
          threshold: sp.threshold ?? 4,
        },
        nb,
        effDays,
      );
      if (breakdown.totalHt > 0) {
        const perHead = round2(breakdown.totalHt / nb);
        return {
          scenario: "direct",
          targetCompanyId: target?.id ?? null,
          targetCompanyName: target?.name ?? null,
          mode: "flat",
          unitPriceHt: perHead,
          totalHt: perHead,
          explain: `Facture directe (forfait INTRA) : ${breakdown.totalHt.toFixed(2)} EUR ÷ ${nb} = ${perHead.toFixed(2)} EUR`,
          warnings,
        };
      }
    }
  }

  if (input.formationPublicPriceHt != null) {
    return {
      scenario: "direct",
      targetCompanyId: target?.id ?? null,
      targetCompanyName: target?.name ?? null,
      mode: "flat",
      unitPriceHt: input.formationPublicPriceHt,
      totalHt: input.formationPublicPriceHt,
      explain: target
        ? `Facture directe ${target.name ?? ""} : tarif catalogue ${input.formationPublicPriceHt.toFixed(2)} EUR`
        : `Facture directe : tarif catalogue ${input.formationPublicPriceHt.toFixed(2)} EUR`,
      warnings,
    };
  }
  warnings.push("Tarif catalogue formation non defini.");
  return {
    scenario: "direct",
    targetCompanyId: target?.id ?? null,
    targetCompanyName: target?.name ?? null,
    mode: "flat",
    unitPriceHt: null,
    totalHt: null,
    explain: "Tarif a definir (pas de prix catalogue)",
    warnings,
  };
}

/**
 * Calcule la commission prescripteur due au referrer pour une
 * inscription (CAS 2b avec remuneration). Retourne 0 si pas de
 * commission configuree ou si pas de prescripteur.
 *
 * Formule : (totalHt × rate%) + flatHt — les deux peuvent etre
 * cumules (rare mais possible).
 */
export function computePrescripteurCommission(input: {
  totalHt: number | null;
  referrerCompany: {
    type: string | null;
    prescripteurCommissionRatePct: number | null;
    prescripteurCommissionFlatHt: number | null;
  } | null;
}): number {
  const ref = input.referrerCompany;
  if (!ref || ref.type !== "prescripteur") return 0;
  let commission = 0;
  if (
    ref.prescripteurCommissionRatePct != null &&
    input.totalHt != null &&
    input.totalHt > 0
  ) {
    commission += (input.totalHt * ref.prescripteurCommissionRatePct) / 100;
  }
  if (ref.prescripteurCommissionFlatHt != null) {
    commission += ref.prescripteurCommissionFlatHt;
  }
  return round2(commission);
}

// ============================================================
// WRAPPER ASYNC : charge les donnees depuis Supabase
// ============================================================

/**
 * Charge toutes les donnees necessaires depuis Supabase puis calcule
 * le billing par defaut pour une inscription. A utiliser cote
 * server actions (creation/modification d'inscription).
 *
 * NB : ne met PAS a jour la BDD — c'est au caller de stocker le
 * resultat dans inscription_requests.billing_*.
 */
export async function loadAndComputeBillingForInscription(
  supabase: SupabaseClient,
  inscriptionId: string,
): Promise<ComputeBillingResult> {
  // Fix Gilles 2026-05-31 : la colonne sur inscription_requests s appelle
  // `target_formation_id` (pas `formation_id`). On la prend en priorite,
  // sinon fallback sur sessions.formation_id si une session est definie.
  const { data: insc, error } = await supabase
    .from("inscription_requests")
    .select(
      "id, company_id, referrer_company_id, target_session_id, target_formation_id",
    )
    .eq("id", inscriptionId)
    .maybeSingle<{
      id: string;
      company_id: string | null;
      referrer_company_id: string | null;
      target_session_id: string | null;
      target_formation_id: string | null;
    }>();
  if (error || !insc) {
    return {
      scenario: "direct",
      targetCompanyId: null,
      targetCompanyName: null,
      mode: "flat",
      unitPriceHt: null,
      totalHt: null,
      explain: "Inscription introuvable",
      warnings: [
        `Inscription ${inscriptionId} introuvable : ${error?.message ?? "n/d"}`,
      ],
    };
  }

  // Charge en parallele : session, learnerCompany, referrer
  // (la formation est chargee ensuite, car on a parfois besoin de la
  // recuperer via sessions.formation_id si target_formation_id null)
  const [sessRes, learnerRes, referrerRes] = await Promise.all([
    insc.target_session_id
      ? supabase
          .from("sessions")
          .select(
            "id, modality, subcontracting_company_id, formation_id, pricing_mode, price_per_day_ht, price_forfait_ht, price_extra_per_day_ht, pricing_threshold",
          )
          .eq("id", insc.target_session_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    insc.company_id
      ? supabase
          .from("companies")
          .select("id, name")
          .eq("id", insc.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    insc.referrer_company_id
      ? supabase
          .from("companies")
          .select(
            "id, name, type, partner_daily_rate_distanciel_ht, partner_daily_rate_presentiel_ht, partner_quiz_unit_price_ht",
          )
          .eq("id", insc.referrer_company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  // Resolution de la formation : priorite target_formation_id de
  // l inscription, sinon sessions.formation_id.
  const sessFormationId =
    (sessRes.data as { formation_id: string | null } | null)?.formation_id ??
    null;
  const resolvedFormationId =
    insc.target_formation_id ?? sessFormationId ?? null;
  const formationRes = resolvedFormationId
    ? await supabase
        .from("formations")
        .select("id, duration_days, public_price_excl_tax")
        .eq("id", resolvedFormationId)
        .maybeSingle()
    : { data: null, error: null };

  // Subcontracting company (si session sous-traitee)
  let subcontractingCompany: ComputeBillingInput["subcontractingCompany"] =
    null;
  const sessRow = sessRes.data as {
    id: string;
    modality: ComputeBillingInput["sessionModality"];
    subcontracting_company_id: string | null;
    formation_id: string | null;
    pricing_mode: "per_learner" | "forfait" | null;
    price_per_day_ht: number | string | null;
    price_forfait_ht: number | string | null;
    price_extra_per_day_ht: number | string | null;
    pricing_threshold: number | string | null;
  } | null;
  if (sessRow?.subcontracting_company_id) {
    const { data: subData } = await supabase
      .from("companies")
      .select(
        "id, name, subcontracting_daily_rate_distanciel_ht, subcontracting_daily_rate_presentiel_ht",
      )
      .eq("id", sessRow.subcontracting_company_id)
      .maybeSingle();
    const sub = subData as {
      id: string;
      name: string | null;
      subcontracting_daily_rate_distanciel_ht: number | string | null;
      subcontracting_daily_rate_presentiel_ht: number | string | null;
    } | null;
    if (sub) {
      subcontractingCompany = {
        id: sub.id,
        name: sub.name,
        subcontractingDailyRateDistancielHt: toNum(
          sub.subcontracting_daily_rate_distanciel_ht,
        ),
        subcontractingDailyRatePresentielHt: toNum(
          sub.subcontracting_daily_rate_presentiel_ht,
        ),
      };
    }
  }

  // Override partner_pricing (si referrer + formation)
  let partnerPriceOverrideHt: number | null = null;
  if (insc.referrer_company_id && resolvedFormationId) {
    const { data: overrideRow } = await supabase
      .from("partner_pricing")
      .select("unit_price_ht")
      .eq("company_id", insc.referrer_company_id)
      .eq("formation_id", resolvedFormationId)
      .maybeSingle();
    partnerPriceOverrideHt = toNum(
      (overrideRow as { unit_price_ht: number | string | null } | null)
        ?.unit_price_ht,
    );
  }

  const formationRow = formationRes.data as {
    id: string;
    duration_days: number | string | null;
    public_price_excl_tax: number | string | null;
  } | null;
  const learnerRow = learnerRes.data as {
    id: string;
    name: string | null;
  } | null;
  const referrerRow = referrerRes.data as {
    id: string;
    name: string | null;
    type: string | null;
    partner_daily_rate_distanciel_ht: number | string | null;
    partner_daily_rate_presentiel_ht: number | string | null;
    partner_quiz_unit_price_ht: number | string | null;
  } | null;

  // Jours effectifs = planning (session_days) si saisi, sinon durée nominale
  // de la formation (« planning sinon durée formation » — Gilles 2026-06-25).
  let effectiveDays = toNum(formationRow?.duration_days);
  let sessionBillableLearners: number | null = null;
  if (insc.target_session_id) {
    const [{ count: daysCount }, { count: learnersCount }] = await Promise.all([
      supabase
        .from("session_days")
        .select("id", { count: "exact", head: true })
        .eq("session_id", insc.target_session_id),
      supabase
        .from("session_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("session_id", insc.target_session_id)
        .neq("status", "cancelled"),
    ]);
    if (daysCount && daysCount > 0) effectiveDays = daysCount;
    sessionBillableLearners = learnersCount ?? null;
  }

  return computeBillingForInscription({
    sessionModality: sessRow?.modality ?? null,
    formationDurationDays: effectiveDays,
    formationPublicPriceHt: toNum(formationRow?.public_price_excl_tax),
    sessionPricing: sessRow?.pricing_mode
      ? {
          mode: sessRow.pricing_mode,
          pricePerDayHt: toNum(sessRow.price_per_day_ht),
          priceForfaitHt: toNum(sessRow.price_forfait_ht),
          priceExtraPerDayHt: toNum(sessRow.price_extra_per_day_ht),
          threshold: toNum(sessRow.pricing_threshold),
        }
      : null,
    sessionBillableLearners,
    subcontractingCompany,
    learnerCompany: learnerRow
      ? { id: learnerRow.id, name: learnerRow.name }
      : null,
    referrerCompany: referrerRow
      ? {
          id: referrerRow.id,
          name: referrerRow.name,
          type: referrerRow.type,
          partnerDailyRateDistancielHt: toNum(
            referrerRow.partner_daily_rate_distanciel_ht,
          ),
          partnerDailyRatePresentielHt: toNum(
            referrerRow.partner_daily_rate_presentiel_ht,
          ),
          partnerQuizUnitPriceHt: toNum(referrerRow.partner_quiz_unit_price_ht),
        }
      : null,
    partnerPriceOverrideHt,
  });
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Persiste le resultat du helper dans inscription_requests.billing_*.
 * A utiliser apres creation/modification d'inscription (sauf si
 * billing_manually_overridden = true).
 */
export async function persistComputedBilling(
  supabase: SupabaseClient,
  inscriptionId: string,
  result: ComputeBillingResult,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  // Verif override manuel : si oui, on ne touche pas (sauf force)
  if (!opts?.force) {
    const { data: cur } = await supabase
      .from("inscription_requests")
      .select("billing_manually_overridden")
      .eq("id", inscriptionId)
      .maybeSingle<{ billing_manually_overridden: boolean | null }>();
    if (cur?.billing_manually_overridden) {
      return { ok: true }; // no-op : on respecte l'override
    }
  }
  const { error } = await supabase
    .from("inscription_requests")
    .update({
      billing_target_company_id: result.targetCompanyId,
      billing_pricing_mode: result.mode,
      billing_unit_price_ht: result.unitPriceHt,
      billing_total_ht: result.totalHt,
    })
    .eq("id", inscriptionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
