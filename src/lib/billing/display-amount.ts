/**
 * Helper PARTAGE pour determiner le montant HT a AFFICHER pour
 * une inscription donnee (Gilles 2026-05-31, etape 6 refonte
 * tarification).
 *
 * Pourquoi : avant ce helper, la cascade de calcul etait dupliquee
 * dans :
 *   - _session-table.tsx (tableau Inscriptions / onglet Participants)
 *   - sessions/page.tsx (tableau Sessions)
 *   - dashboard/page.tsx (estimations CA)
 *   - conventions/actions.ts (montants convention)
 *   - conventions/[id]/print/page.tsx (PDF convention)
 *   - partner-pricing.ts (portail partenaire)
 *
 * Resultat : a chaque modif, on oubliait un fichier et les ecrans
 * divergeaient (incident 1175 € vs 1220 € — 2026-05-31).
 *
 * Solution : UN SEUL endroit qui implemente la cascade. Tous les
 * ecrans appellent ce helper. Plus jamais de divergence.
 *
 * CASCADE (ordre de priorite decroissante) :
 *   1. billing_total_ht (source de verite refonte 2026-05-31 —
 *      calculee par computeBillingForInscription ou saisie manuelle)
 *   2. quote_amount_ht (legacy explicit — souvent rempli par les
 *      portails partenaires avec le tarif negocie)
 *   3. derived (calcul R7 INTER/INTRA si session a un pricing_mode) :
 *      - INTER (per_learner) : price_per_day_ht × nbJours
 *      - INTRA (forfait)     : (forfait × nbJours + extras) /
 *                               nbApprenants  (forfait collectif imputable
 *                               proportionnellement)
 *   4. legacy fallback : formation.public_price_excl_tax (catalogue)
 *
 * Si aucune source n est disponible : retourne null + source='none'.
 */
import { computeSessionPrice } from "@/lib/pricing/compute";

export type DisplayAmountSource =
  | "billing"
  | "quote"
  | "derived_per_learner"
  | "derived_forfait"
  | "catalog"
  | "none";

export type DisplayAmountResult = {
  amount: number | null;
  source: DisplayAmountSource;
  /** Explication courte pour tooltip / debug (ex: "Tarif catalogue 305 €"). */
  explain: string;
  /** True si le montant est une ESTIMATION (catalogue, derive) et non un
   *  montant explicite (billing / quote). */
  isEstimated: boolean;
};

export type DisplayAmountInscription = {
  billing_total_ht?: number | string | null;
  quote_amount_ht?: number | string | null;
};

export type DisplayAmountSessionContext = {
  pricing_mode?: "per_learner" | "forfait" | null;
  price_per_day_ht?: number | string | null;
  price_forfait_ht?: number | string | null;
  price_extra_per_day_ht?: number | string | null;
  pricing_threshold?: number | string | null;
  /** Nb de jours réel (planning/session_days). Peut être 0 si planning vide. */
  duration_days?: number | string | null;
  /** Repli : durée nominale de la formation, utilisée si duration_days = 0
   *  (sinon le tarif/jour était ignoré et on retombait sur le catalogue —
   *  bug « 1425 €/j affiché 340 € » Gilles 2026-06-25). */
  formation_duration_days?: number | string | null;
  formation_public_price_excl_tax?: number | string | null;
  nb_billable_inscriptions?: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const toNum = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Nb de jours effectif : planning réel sinon durée nominale de la formation. */
function effectiveDays(session: DisplayAmountSessionContext): number | null {
  const sessDays = toNum(session.duration_days);
  return sessDays && sessDays > 0
    ? sessDays
    : toNum(session.formation_duration_days);
}

/**
 * Montant par apprenant pour un forfait INTRA = forfait collectif ÷ nb
 * apprenants (la somme égale donc le forfait). Retourne null si données
 * insuffisantes.
 */
function deriveForfaitPerLearner(
  session: DisplayAmountSessionContext,
): DisplayAmountResult | null {
  const days = effectiveDays(session);
  if (!days || days <= 0) return null;
  const nbApprenants = session.nb_billable_inscriptions ?? 0;
  if (nbApprenants <= 0) return null;
  const breakdown = computeSessionPrice(
    {
      mode: "forfait",
      pricePerDayHt: null,
      priceForfaitHt: toNum(session.price_forfait_ht),
      priceExtraPerDayHt: toNum(session.price_extra_per_day_ht),
      threshold: toNum(session.pricing_threshold) ?? 4,
    },
    nbApprenants,
    days,
  );
  if (breakdown.totalHt <= 0) return null;
  const amt = round2(breakdown.totalHt / nbApprenants);
  return {
    amount: amt,
    source: "derived_forfait",
    explain: `Forfait INTRA partage : ${breakdown.totalHt.toFixed(2)} € ÷ ${nbApprenants} apprenant(s) = ${amt.toFixed(2)} €`,
    isEstimated: true,
  };
}

/**
 * Calcule le montant HT a afficher pour UNE inscription donnee
 * dans le contexte d une session.
 */
export function computeInscriptionDisplayAmount(
  inscription: DisplayAmountInscription,
  session: DisplayAmountSessionContext,
): DisplayAmountResult {
  // 1) billing_total_ht (refonte 2026-05-31)
  const billing = toNum(inscription.billing_total_ht);
  if (billing !== null) {
    return {
      amount: billing,
      source: "billing",
      explain: `Facturation calculee : ${billing.toFixed(2)} €`,
      isEstimated: false,
    };
  }

  // 2) quote_amount_ht (legacy explicit)
  const quote = toNum(inscription.quote_amount_ht);
  if (quote !== null) {
    return {
      amount: quote,
      source: "quote",
      explain: `Devis saisi : ${quote.toFixed(2)} €`,
      isEstimated: false,
    };
  }

  // 3) Derive R7 (INTER per_learner / INTRA forfait) — repli si ni billing
  //    ni devis. Nb de jours = planning réel sinon durée nominale formation.
  const days = effectiveDays(session);
  if (session.pricing_mode && days && days > 0) {
    if (session.pricing_mode === "per_learner") {
      const perDay = toNum(session.price_per_day_ht);
      if (perDay !== null && perDay > 0) {
        const amt = round2(perDay * days);
        return {
          amount: amt,
          source: "derived_per_learner",
          explain: `Tarif INTER : ${perDay.toFixed(2)} €/J × ${days} j = ${amt.toFixed(2)} €`,
          isEstimated: true,
        };
      }
    } else if (session.pricing_mode === "forfait") {
      const live = deriveForfaitPerLearner(session);
      if (live) return live;
    }
  }

  // 4) Legacy fallback : tarif catalogue formation
  const catalog = toNum(session.formation_public_price_excl_tax);
  if (catalog !== null) {
    return {
      amount: catalog,
      source: "catalog",
      explain: `Tarif catalogue : ${catalog.toFixed(2)} €`,
      isEstimated: true,
    };
  }

  // 5) Rien
  return {
    amount: null,
    source: "none",
    explain: "Tarif non determine",
    isEstimated: true,
  };
}

/**
 * Calcule le total HT pour une session = somme des montants
 * d affichage de toutes ses inscriptions. Retourne aussi un flag
 * `isExact` (false si au moins une inscription a un montant null).
 */
export function computeSessionDisplayTotal(
  inscriptions: DisplayAmountInscription[],
  session: DisplayAmountSessionContext,
): {
  totalHt: number;
  isExact: boolean;
  isAnyEstimated: boolean;
  count: number;
} {
  let total = 0;
  let isExact = true;
  let isAnyEstimated = false;
  for (const insc of inscriptions) {
    const res = computeInscriptionDisplayAmount(insc, session);
    if (res.amount === null) {
      isExact = false;
    } else {
      total += res.amount;
      if (res.isEstimated) isAnyEstimated = true;
    }
  }
  return {
    totalHt: round2(total),
    isExact,
    isAnyEstimated,
    count: inscriptions.length,
  };
}
