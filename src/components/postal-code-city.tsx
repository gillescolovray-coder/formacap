"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MapPin } from "lucide-react";
import { HelpHint } from "@/components/help-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Commune = { nom: string; code: string };

type Props = {
  /** ID + name de l'input code postal (envoyé au formulaire). */
  postalCodeName: string;
  /** ID + name de l'input ville (envoyé au formulaire). */
  cityName: string;
  /** Mode non-contrôlé : valeurs initiales. */
  defaultPostalCode?: string;
  defaultCity?: string;
  /**
   * Mode contrôlé : si fournis, l'état est piloté par le parent.
   * Utile quand un autre composant (ex. SIRENE lookup) doit modifier
   * les valeurs après le mount.
   */
  postalCodeValue?: string;
  cityValue?: string;
  onPostalCodeChange?: (v: string) => void;
  onCityChange?: (v: string) => void;
  /** Largeur de la grille (par défaut [1fr_3fr] = CP étroit + ville large). */
  gridClassName?: string;
  /** Affiche les <Label> au-dessus (défaut true). */
  showLabels?: boolean;
  /** Tailwind size : "sm" pour les inputs compacts, "md" par défaut. */
  size?: "sm" | "md";
  /** ID & label personnalisé pour le code postal. */
  postalCodeLabel?: string;
  cityLabel?: string;
};

/**
 * Saisie code postal + ville avec auto-complétion via geo.api.gouv.fr.
 *
 * - Tape 5 chiffres → recherche communes
 * - 1 seule commune → ville auto-remplie
 * - Plusieurs communes → menu déroulant pour choisir
 * - CP inconnu → message d'erreur (ville reste libre)
 *
 * Le champ ville reste éditable manuellement (texte libre) — l'API ne
 * fait que suggérer.
 */
export function PostalCodeCity({
  postalCodeName,
  cityName,
  defaultPostalCode = "",
  defaultCity = "",
  postalCodeValue,
  cityValue,
  onPostalCodeChange,
  onCityChange,
  gridClassName = "grid gap-4 md:grid-cols-[1fr_3fr]",
  showLabels = true,
  size = "md",
  postalCodeLabel = "Code postal",
  cityLabel = "Ville",
}: Props) {
  const isControlled =
    postalCodeValue !== undefined && cityValue !== undefined;
  const [internalPostalCode, setInternalPostalCode] =
    useState(defaultPostalCode);
  const [internalCity, setInternalCity] = useState(defaultCity);
  const postalCode = isControlled ? (postalCodeValue ?? "") : internalPostalCode;
  const city = isControlled ? (cityValue ?? "") : internalCity;
  const setPostalCode = (v: string) => {
    if (isControlled) onPostalCodeChange?.(v);
    else setInternalPostalCode(v);
  };
  const setCity = (v: string) => {
    if (isControlled) onCityChange?.(v);
    else setInternalCity(v);
  };

  const [suggestions, setSuggestions] = useState<Commune[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Au tout premier rendu, on ne veut PAS ouvrir le dropdown même si
  // le CP est déjà rempli (ex. fiche existante chargée). Le dropdown
  // ne doit s'ouvrir qu'après une action de l'utilisateur.
  const isFirstRunRef = useRef(true);
  // Position calculée pour rendre le dropdown via portal (échappe à
  // l'overflow des sections repliables).
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const cityWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  // Mémorise le dernier CP pour lequel on a fait une requête, afin de
  // ne pas re-déclencher si l'utilisateur sort/revient sur le champ.
  const lastQueriedRef = useRef<string>(defaultPostalCode);

  // Repositionner le dropdown quand il s'ouvre + sur scroll/resize
  useEffect(() => {
    if (!showSuggestions) {
      setDropdownRect(null);
      return;
    }
    function updateRect() {
      const el = cityWrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [showSuggestions]);

  // Fermer au clic en dehors
  useEffect(() => {
    if (!showSuggestions) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        cityWrapRef.current?.contains(t) ||
        dropdownRef.current?.contains(t)
      ) {
        return;
      }
      setShowSuggestions(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showSuggestions]);

  useEffect(() => {
    const trimmed = postalCode.trim();
    if (trimmed.length !== 5 || !/^\d{5}$/.test(trimmed)) {
      setSuggestions([]);
      setShowSuggestions(false);
      setError(null);
      return;
    }
    if (trimmed === lastQueriedRef.current && suggestions.length > 0) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `https://geo.api.gouv.fr/communes?codePostal=${trimmed}&fields=nom,code`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error("API indisponible");
        const data = (await res.json()) as Commune[];
        if (cancelled) return;
        lastQueriedRef.current = trimmed;
        if (data.length === 0) {
          setError("Code postal inconnu.");
          setSuggestions([]);
          setShowSuggestions(false);
        } else if (data.length === 1) {
          // Auto-remplissage : on ne remplace que si la ville est vide
          // ou si elle correspond déjà à une autre commune (changement de CP).
          if (!city.trim()) {
            setCity(data[0].nom);
          }
          setSuggestions(data);
          setShowSuggestions(false);
        } else {
          setSuggestions(data);
          // Plusieurs communes pour ce CP : on ouvre le dropdown
          // uniquement après une action utilisateur (changement de CP).
          // Au premier rendu (chargement de fiche existante), on reste
          // silencieux — le badge "X" à droite du champ Ville reste
          // disponible si l'utilisateur veut voir/changer la commune.
          if (isFirstRunRef.current) {
            setShowSuggestions(false);
          } else {
            setShowSuggestions(!city.trim());
          }
        }
        isFirstRunRef.current = false;
      } catch {
        if (!cancelled) {
          setError("Erreur réseau.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // city volontairement absent des deps : on ne veut pas re-fetcher
    // chaque fois que la ville change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postalCode]);

  return (
    <div className={gridClassName}>
      {/* Code postal */}
      <div className="space-y-1.5">
        {showLabels && (
          <Label
            htmlFor={postalCodeName}
            className="inline-flex items-center gap-1"
          >
            {postalCodeLabel}
            <HelpHint
              tone="auto"
              text="Recherche automatique de la ville au-delà de 4 chiffres saisis."
              details={
                <ul className="space-y-1 list-disc list-inside">
                  <li>
                    Tapez le code postal — la liste des communes
                    correspondantes s&apos;affiche.
                  </li>
                  <li>
                    Sélectionnez une commune → champ Ville rempli
                    automatiquement.
                  </li>
                  <li>
                    Source : <strong>geo.api.gouv.fr</strong> (base
                    officielle des communes françaises).
                  </li>
                </ul>
              }
            />
          </Label>
        )}
        <div className="relative">
          <Input
            id={postalCodeName}
            name={postalCodeName}
            value={postalCode}
            onChange={(e) =>
              setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))
            }
            inputMode="numeric"
            placeholder="75001"
            className={size === "sm" ? "h-8 text-xs" : ""}
          />
          {loading && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-cyan-600" />
          )}
        </div>
        {error && (
          <p className="text-[11px] text-red-600">{error}</p>
        )}
      </div>

      {/* Ville (avec suggestions si plusieurs) */}
      <div className="space-y-1.5">
        {showLabels && <Label htmlFor={cityName}>{cityLabel}</Label>}
        <div className="relative" ref={cityWrapRef}>
          <Input
            id={cityName}
            name={cityName}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 1) setShowSuggestions(true);
            }}
            placeholder="Paris"
            className={size === "sm" ? "h-8 text-xs" : ""}
            autoComplete="address-level2"
          />
          {suggestions.length > 1 && (
            <button
              type="button"
              onClick={() => setShowSuggestions((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 hover:bg-cyan-200"
              title={`${suggestions.length} communes pour ce code postal`}
            >
              {suggestions.length}
            </button>
          )}
        </div>
      </div>

      {/* Dropdown rendu via portal pour échapper aux overflows parents */}
      {showSuggestions &&
        suggestions.length > 1 &&
        dropdownRect &&
        typeof window !== "undefined" &&
        createPortal(
          <ul
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              zIndex: 9999,
            }}
            className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
          >
            <li className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100 inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {suggestions.length} communes pour {postalCode}
            </li>
            {suggestions.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => {
                    setCity(c.nom);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-cyan-50 border-b border-slate-100 last:border-0"
                >
                  {c.nom}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
