/**
 * Helper computeInscriptionTotalHt — decomposition OPCO + Employeur
 * (Gilles 2026-06-01, suite a la decision du 2026-05-24).
 *
 * Invariant business :
 *   billing_total_ht = Σ(inscription_opco_fundings.amount_ht)
 *                    + employer_amount_ht
 *
 * Exemple (Mme DA SILVA, session 26/05/2026) :
 *   - OPCO Constructys : 168,00 € HT
 *   - Employeur (reste a charge) : 172,00 € HT
 *   - Total HT : 340,00 €
 *
 * Comportement Option C (validé par Gilles 2026-06-01) :
 *   - Si `employer_amount_ht` est saisi en BDD : on l utilise (override manuel)
 *   - Sinon : calcul auto = billing_total_ht − Σ OPCO
 *     (fallback : public_price_excl_tax * duration_days − Σ OPCO)
 *
 * Ce helper est PUR (pas d I/O) pour la logique de decomposition.
 * Le wrapper async `loadAndComputeInscriptionTotalHt` charge depuis Supabase.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type InscriptionTotalBreakdown = {
  /** Somme des amounts_ht des accords OPCO rattaches a cette inscription. */
  opcoTotal: number;
  /** Part HT a la charge de l employeur. Soit saisie manuellement,
   *  soit calculee auto = total − opcoTotal. */
  employerAmount: number;
  /** Total HT = opcoTotal + employerAmount. */
  total: number;
  /** True si la repartition vient de saisies manuelles, false si auto. */
  isEmployerManual: boolean;
  /** True si au moins 1 accord OPCO est rattache. */
  hasOpcoFundings: boolean;
};

/**
 * Decompose le total HT a partir des donnees deja chargees.
 *
 * @param totalHt Le total a decomposer (souvent billing_total_ht ou
 *                 fallback catalogue × duration_days).
 * @param opcoAmounts Liste des amount_ht des accords OPCO rattaches.
 * @param employerAmountManual Valeur saisie a la main pour la part employeur
 *                              (null = calcul auto).
 */
export function computeInscriptionTotalHt(input: {
  totalHt: number | null;
  opcoAmounts: number[];
  employerAmountManual: number | null;
}): InscriptionTotalBreakdown {
  const opcoTotal = input.opcoAmounts.reduce(
    (acc, n) => acc + (Number.isFinite(n) && n > 0 ? n : 0),
    0,
  );
  const hasOpcoFundings = input.opcoAmounts.length > 0 && opcoTotal > 0;

  // Si l employeur a ete saisi manuellement, on l utilise tel quel
  if (
    input.employerAmountManual !== null &&
    Number.isFinite(input.employerAmountManual) &&
    input.employerAmountManual >= 0
  ) {
    return {
      opcoTotal: round2(opcoTotal),
      employerAmount: round2(input.employerAmountManual),
      total: round2(opcoTotal + input.employerAmountManual),
      isEmployerManual: true,
      hasOpcoFundings,
    };
  }

  // Sinon, calcul auto : employer = total − opco
  const total = input.totalHt ?? 0;
  const employerAuto = Math.max(0, total - opcoTotal);
  return {
    opcoTotal: round2(opcoTotal),
    employerAmount: round2(employerAuto),
    total: round2(total),
    isEmployerManual: false,
    hasOpcoFundings,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Wrapper async : charge les donnees OPCO + employer depuis Supabase
 * et appelle computeInscriptionTotalHt.
 */
export async function loadAndComputeInscriptionTotalHt(
  supabase: SupabaseClient,
  inscriptionId: string,
): Promise<InscriptionTotalBreakdown> {
  const { data: insc } = await supabase
    .from("inscription_requests")
    .select("billing_total_ht, employer_amount_ht, quote_amount_ht")
    .eq("id", inscriptionId)
    .maybeSingle<{
      billing_total_ht: number | string | null;
      employer_amount_ht: number | string | null;
      quote_amount_ht: number | string | null;
    }>();

  const { data: fundings } = await supabase
    .from("inscription_opco_fundings")
    .select("amount_ht")
    .eq("inscription_id", inscriptionId);

  const opcoAmounts = (
    (fundings ?? []) as Array<{ amount_ht: number | string | null }>
  )
    .map((f) => Number(f.amount_ht))
    .filter((n) => Number.isFinite(n) && n > 0);

  // Total prioritaire : billing_total_ht, sinon quote_amount_ht (legacy)
  const totalHt =
    insc?.billing_total_ht !== null && insc?.billing_total_ht !== undefined
      ? Number(insc.billing_total_ht)
      : insc?.quote_amount_ht !== null && insc?.quote_amount_ht !== undefined
        ? Number(insc.quote_amount_ht)
        : null;

  const employerAmountManual =
    insc?.employer_amount_ht !== null && insc?.employer_amount_ht !== undefined
      ? Number(insc.employer_amount_ht)
      : null;

  return computeInscriptionTotalHt({
    totalHt,
    opcoAmounts,
    employerAmountManual,
  });
}
