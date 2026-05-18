"use client";

import * as React from "react";
import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";
import { Input } from "@/components/ui/input";

/**
 * Champ de saisie de numéro de téléphone avec formatage international
 * (E.164) à la volée. La valeur stockée et soumise est en E.164
 * `+33612345678` ; l'affichage est formaté lisiblement (`+33 6 12 34 56 78`
 * ou `06 12 34 56 78` si pays par défaut FR et préfixe national absent).
 *
 * - Saisie `06...`         → reformaté `06 12 34 56 78` (interprété FR)
 * - Saisie `+44 20 ...`    → reformaté avec le préfixe pays détecté
 * - Stockage soumis        → toujours E.164 (`+33612345678`)
 *
 * Usage dans un form :
 *   <PhoneInput name="phone" defaultValue={contact?.phone ?? ""} />
 */
type PhoneInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  /** Pays par défaut quand l'utilisateur n'écrit pas le préfixe `+`. */
  defaultCountry?: "FR" | "BE" | "CH" | "LU" | "DE" | "ES" | "IT" | "GB" | "US";
  /** Valeur initiale (E.164 ou format libre). */
  defaultValue?: string;
  /** Callback optionnel renvoyant la valeur E.164 (ou `""`). */
  onValueChange?: (e164: string) => void;
};

function formatForDisplay(raw: string, country: PhoneInputProps["defaultCountry"]): string {
  if (!raw) return "";
  const formatter = new AsYouType(country);
  return formatter.input(raw);
}

function toE164(
  raw: string,
  country: PhoneInputProps["defaultCountry"],
): string {
  if (!raw) return "";
  const parsed = parsePhoneNumberFromString(raw, country);
  return parsed?.isValid() ? parsed.number : raw;
}

function PhoneInput({
  defaultCountry = "FR",
  defaultValue = "",
  name,
  onValueChange,
  ...rest
}: PhoneInputProps) {
  const [display, setDisplay] = React.useState(() =>
    formatForDisplay(defaultValue, defaultCountry),
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    const formatted = formatForDisplay(next, defaultCountry);
    setDisplay(formatted);
    if (onValueChange) {
      onValueChange(toE164(formatted, defaultCountry));
    }
  };

  const handleBlur = () => {
    if (!display) return;
    const e164 = toE164(display, defaultCountry);
    const parsed = parsePhoneNumberFromString(e164, defaultCountry);
    if (parsed?.isValid()) {
      // Reformatage propre via le numéro parsé.
      setDisplay(parsed.formatInternational());
    }
  };

  // La valeur soumise au form est toujours E.164 → champ caché.
  const e164 = toE164(display, defaultCountry);

  return (
    <>
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={defaultCountry === "FR" ? "06 12 34 56 78" : "+44 20 ..."}
        {...rest}
      />
      {name ? <input type="hidden" name={name} value={e164} /> : null}
    </>
  );
}

export { PhoneInput };
