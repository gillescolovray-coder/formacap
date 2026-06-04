/**
 * Outils de dédoublonnage des fiches entreprises.
 *
 * normalizeCompanyName : ramène un nom à une clé comparable (sans
 * accents, sans ponctuation, casse et espaces normalisés) pour rapprocher
 * « SMMM », « S.M.M.M », « smmm  » → même clé.
 *
 * normalizeSiret : ne garde que les chiffres (un SIRET identique = même
 * entreprise, quel que soit le formatage).
 */
export function normalizeCompanyName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // supprime les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ") // ponctuation -> espace
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeSiret(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}
