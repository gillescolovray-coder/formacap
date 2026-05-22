/**
 * Helpers de formatage du nom d'apprenant.
 *
 * Gilles 2026-05-22 : la civilité (M./Mme/Autre) doit apparaître devant
 * le nom partout où l'apprenant est listé : Participants, Conventions,
 * Convocations, Émargement, Attestations, etc.
 */

/**
 * Retourne "Mme Chloé BIEVRE" si civility renseignée, sinon
 * "Chloé BIEVRE". Tolère les valeurs null / undefined / vides.
 *
 * Note : la valeur "Autre" n'est pas affichée comme préfixe (peu
 * lisible) — on ne préfixe que pour "M." et "Mme".
 */
export function formatLearnerName(
  civility: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const fn = (firstName ?? "").trim();
  const ln = (lastName ?? "").trim();
  const base = [fn, ln].filter(Boolean).join(" ");
  const civ = (civility ?? "").trim();
  if (civ === "M." || civ === "Mme") {
    return `${civ} ${base}`.trim();
  }
  return base;
}
