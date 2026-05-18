import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Normalise un numéro de téléphone en E.164 (`+33612345678`) si possible.
 * Si le numéro est invalide ou vide, retourne `null` (pour `""` /  espaces)
 * ou la valeur originale nettoyée si elle ne peut être parsée mais n'est pas
 * vide — cela évite de perdre une saisie atypique.
 *
 * @param raw      Saisie brute (peut contenir espaces, tirets, parenthèses).
 * @param country  Pays par défaut quand le préfixe `+` est absent (FR par défaut).
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  country: "FR" | "BE" | "CH" | "LU" | "DE" | "ES" | "IT" | "GB" | "US" = "FR",
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, country);
  if (parsed?.isValid()) return parsed.number;
  return trimmed;
}
