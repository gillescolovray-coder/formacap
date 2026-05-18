/**
 * Calcul du prix total HT d'une session selon le mode de tarification.
 *
 * Règle métier R7 (Gilles 2026-05-14) — cf. memory/project_business_rules.md.
 *
 * Modes :
 *   • per_learner (INTER) : total = perDay × nbApprenants × nbJours
 *   • forfait    (INTRA)  : total = forfait × nbJours
 *                          + extraPerDay × max(0, nbApprenants − threshold) × nbJours
 *
 * Utilisé partout où on doit calculer ou afficher le total session :
 *   - Bloc Tarification de la fiche session (preview)
 *   - Calcul du total HT par société sur la convention
 *   - Affichage des montants sur l'onglet Participants
 */

export type SessionPricingConfig = {
  mode: "per_learner" | "forfait";
  /** Prix HT par jour par apprenant (mode per_learner). */
  pricePerDayHt: number | null;
  /** Forfait HT par jour (mode forfait). */
  priceForfaitHt: number | null;
  /** Prix HT par apprenant supplémentaire au-delà du seuil (mode forfait). */
  priceExtraPerDayHt: number | null;
  /** Seuil au-dessus duquel on facture l'extra (mode forfait). Défaut : 4. */
  threshold: number | null;
};

export type PriceBreakdown = {
  /** Total HT calculé. */
  totalHt: number;
  /** Détail pour affichage utilisateur (label + montant). */
  lines: Array<{ label: string; amount: number }>;
};

/**
 * Calcule le total HT d'une session selon ses paramètres de tarification.
 *
 * Renvoie 0 et un breakdown vide si le mode n'est pas configuré (la
 * session vient juste d'être créée et l'utilisateur n'a pas encore
 * complété — l'UI doit alors afficher "—" plutôt que 0 €).
 */
export function computeSessionPrice(
  cfg: SessionPricingConfig,
  nbApprenants: number,
  nbJours: number,
): PriceBreakdown {
  if (nbApprenants <= 0 || nbJours <= 0) {
    return { totalHt: 0, lines: [] };
  }

  if (cfg.mode === "per_learner") {
    const perDay = cfg.pricePerDayHt ?? 0;
    if (perDay <= 0) return { totalHt: 0, lines: [] };
    const total = perDay * nbApprenants * nbJours;
    return {
      totalHt: total,
      lines: [
        {
          label: `${formatEur(perDay)} × ${nbApprenants} apprenant${
            nbApprenants > 1 ? "s" : ""
          } × ${nbJours} j`,
          amount: total,
        },
      ],
    };
  }

  // Mode forfait (INTRA)
  const forfait = cfg.priceForfaitHt ?? 0;
  const extra = cfg.priceExtraPerDayHt ?? 0;
  const threshold = cfg.threshold ?? 4;

  if (forfait <= 0) return { totalHt: 0, lines: [] };

  const forfaitTotal = forfait * nbJours;
  const extraApprenants = Math.max(0, nbApprenants - threshold);
  const extraTotal = extra * extraApprenants * nbJours;
  const total = forfaitTotal + extraTotal;

  const lines = [
    {
      label: `Forfait ${formatEur(forfait)}/J × ${nbJours} j (jusqu'à ${threshold} apprenant${threshold > 1 ? "s" : ""})`,
      amount: forfaitTotal,
    },
  ];
  if (extraApprenants > 0) {
    lines.push({
      label: `+ ${formatEur(extra)}/J × ${extraApprenants} apprenant${extraApprenants > 1 ? "s" : ""} suppl. × ${nbJours} j`,
      amount: extraTotal,
    });
  }
  return { totalHt: total, lines };
}

function formatEur(n: number): string {
  return n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

/**
 * Helper inverse : à partir d'un total HT facturé et du nombre
 * d'apprenants/jours, retrouve le prix unitaire HT par apprenant.
 * Utile pour la convention : on a un total figé, on veut le décomposer.
 *
 * Renvoie null si le calcul n'est pas possible (mode forfait par
 * exemple — pas de prix unitaire significatif).
 */
export function inferUnitPriceHt(
  cfg: SessionPricingConfig,
  nbApprenants: number,
  nbJours: number,
): number | null {
  if (cfg.mode !== "per_learner") return null;
  if (nbApprenants <= 0 || nbJours <= 0) return null;
  return (cfg.pricePerDayHt ?? 0) * nbJours;
}

/**
 * Calcule le montant à facturer à UNE société sur une convention.
 *
 * Règle métier R7 (Gilles 2026-05-14) — convention par société :
 *
 *   • Mode per_learner (INTER) :
 *       unitHt   = perDay × nbJours       (prix par apprenant)
 *       totalHt  = unitHt × nbApprenantsCompany
 *
 *   • Mode forfait (INTRA) :
 *       Le forfait + extras est calculé sur la session entière puis
 *       réparti proportionnellement entre les sociétés (cas standard :
 *       1 seule société en INTRA → elle prend 100 % du forfait).
 *       unitHt  = totalHt / nbApprenantsCompany   (part par apprenant)
 *       totalHt = totalSessionHt × (nbApprenantsCompany / nbApprenantsTotal)
 *
 * Renvoie 0 si les paramètres sont insuffisants (mode non configuré,
 * planning manquant, etc.). L'appelant doit traiter ce cas (souvent en
 * affichant "—" sur la convention).
 */
export function computeConventionAmount(
  cfg: SessionPricingConfig,
  nbApprenantsCompany: number,
  nbApprenantsTotal: number,
  nbJours: number,
): { unitHt: number; totalHt: number; breakdown: PriceBreakdown } {
  const empty = {
    unitHt: 0,
    totalHt: 0,
    breakdown: { totalHt: 0, lines: [] },
  };
  if (nbApprenantsCompany <= 0 || nbJours <= 0) return empty;

  if (cfg.mode === "per_learner") {
    const perDay = cfg.pricePerDayHt ?? 0;
    if (perDay <= 0) return empty;
    const unitHt = perDay * nbJours;
    const totalHt = unitHt * nbApprenantsCompany;
    return {
      unitHt,
      totalHt,
      breakdown: computeSessionPrice(cfg, nbApprenantsCompany, nbJours),
    };
  }

  // Mode forfait
  if (nbApprenantsTotal <= 0) return empty;
  const sessionBreakdown = computeSessionPrice(
    cfg,
    nbApprenantsTotal,
    nbJours,
  );
  if (sessionBreakdown.totalHt <= 0) return empty;
  const companyShare = nbApprenantsCompany / nbApprenantsTotal;
  const totalHt = sessionBreakdown.totalHt * companyShare;
  const unitHt = totalHt / nbApprenantsCompany;
  return { unitHt, totalHt, breakdown: sessionBreakdown };
}
