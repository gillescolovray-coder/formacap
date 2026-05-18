"use client";

import { useEffect, useState } from "react";
import { Calculator, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  computeSessionPrice,
  type SessionPricingConfig,
} from "@/lib/pricing/compute";

type Props = {
  /** Mode héritage depuis la table sessions (peut être null à la création). */
  defaultMode: "per_learner" | "forfait" | null;
  defaultPricePerDayHt: number | null;
  defaultPriceForfaitHt: number | null;
  defaultPriceExtraPerDayHt: number | null;
  defaultThreshold: number | null;
  /** Pour le preview du total : combien d'apprenants facturables sont
   *  actuellement inscrits sur la session (les autres champs viennent
   *  des contrôles du formulaire). */
  currentNbApprenants: number;
  /** Pour le preview : nombre de jours de la session (planning). */
  currentNbJours: number;
  /** Valeurs par défaut de l'organisation, injectées par le serveur,
   *  pour permettre à l'utilisateur de "Réinitialiser" depuis les
   *  paramètres globaux s'il a override la session par erreur. */
  orgDefaults: {
    interPresentielPerDay: number;
    interDistancielPerDay: number;
    intraPresentielForfait: number;
    intraPresentielExtraPerDay: number;
    intraDistancielForfait: number;
    intraDistancielExtraPerDay: number;
    threshold: number;
  };
};

/**
 * Bloc Tarification de la fiche session (R7 — Gilles 2026-05-14).
 *
 * Comportement :
 *   • Le mode (per_learner vs forfait) est déterminé par INTER/INTRA
 *     (lu en live depuis le DOM via #is_inter_inter pour s'adapter
 *     dès que l'utilisateur change le toggle Inter/Intra).
 *   • Les champs affichés dépendent du mode.
 *   • Un preview en temps réel affiche le calcul (formule + total).
 *   • Bouton "Réinitialiser depuis les paramètres" repart des défauts
 *     org selon le couple (INTER/INTRA × Présentiel/Distanciel).
 */
export function PricingBlock({
  defaultMode,
  defaultPricePerDayHt,
  defaultPriceForfaitHt,
  defaultPriceExtraPerDayHt,
  defaultThreshold,
  currentNbApprenants,
  currentNbJours,
  orgDefaults,
}: Props) {
  // Mode courant : on l'observe depuis le DOM (radio INTER/INTRA) +
  // la modalité (présentiel/distanciel via le LocationSection).
  const [isInter, setIsInter] = useState(defaultMode === "per_learner");
  const [modality, setModality] = useState<"presentiel" | "distanciel" | null>(
    null,
  );

  // Valeurs éditables
  const [pricePerDay, setPricePerDay] = useState<string>(
    defaultPricePerDayHt != null ? String(defaultPricePerDayHt) : "",
  );
  const [priceForfait, setPriceForfait] = useState<string>(
    defaultPriceForfaitHt != null ? String(defaultPriceForfaitHt) : "",
  );
  const [priceExtra, setPriceExtra] = useState<string>(
    defaultPriceExtraPerDayHt != null
      ? String(defaultPriceExtraPerDayHt)
      : "",
  );
  const [threshold, setThreshold] = useState<string>(
    defaultThreshold != null ? String(defaultThreshold) : "4",
  );

  // Synchronisation : on observe le toggle is_inter (radio dans le bloc
  // "Type de session" du même formulaire) ET le select modality.
  useEffect(() => {
    const update = () => {
      const interRadio = document.getElementById(
        "is_inter_inter",
      ) as HTMLInputElement | null;
      if (interRadio) setIsInter(interRadio.checked);
      const modalitySelect = document.querySelector(
        "select[name='modality']",
      ) as HTMLSelectElement | null;
      const v = modalitySelect?.value;
      if (v === "presentiel" || v === "distanciel") setModality(v);
      else setModality(null);
    };
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, []);

  const mode: "per_learner" | "forfait" = isInter ? "per_learner" : "forfait";

  function applyOrgDefaults() {
    if (isInter) {
      setPricePerDay(
        String(
          modality === "distanciel"
            ? orgDefaults.interDistancielPerDay
            : orgDefaults.interPresentielPerDay,
        ),
      );
    } else {
      setPriceForfait(
        String(
          modality === "distanciel"
            ? orgDefaults.intraDistancielForfait
            : orgDefaults.intraPresentielForfait,
        ),
      );
      setPriceExtra(
        String(
          modality === "distanciel"
            ? orgDefaults.intraDistancielExtraPerDay
            : orgDefaults.intraPresentielExtraPerDay,
        ),
      );
      setThreshold(String(orgDefaults.threshold));
    }
  }

  // Calcul preview
  const cfg: SessionPricingConfig = {
    mode,
    pricePerDayHt: parseFloat(pricePerDay) || null,
    priceForfaitHt: parseFloat(priceForfait) || null,
    priceExtraPerDayHt: parseFloat(priceExtra) || null,
    threshold: parseInt(threshold, 10) || 4,
  };
  const preview = computeSessionPrice(
    cfg,
    currentNbApprenants,
    currentNbJours,
  );

  return (
    <div className="space-y-4">
      {/* Hidden inputs : ce sont eux qui partent dans le POST */}
      <input type="hidden" name="pricing_mode" value={mode} />
      <input type="hidden" name="price_per_day_ht" value={pricePerDay} />
      <input type="hidden" name="price_forfait_ht" value={priceForfait} />
      <input
        type="hidden"
        name="price_extra_per_day_ht"
        value={priceExtra}
      />
      <input type="hidden" name="pricing_threshold" value={threshold} />

      <div className="rounded-md bg-slate-50 border border-slate-200 p-3 flex items-start gap-2 text-xs">
        <Info className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-slate-700 leading-relaxed">
          Mode actuel : <strong>{isInter ? "INTER" : "INTRA"}</strong>
          {modality && (
            <>
              {" "}· <strong className="capitalize">{modality}</strong>
            </>
          )}
          {!modality && (
            <span className="text-amber-700">
              {" "}· Modalité non définie (bloc Lieu & modalité)
            </span>
          )}
          .{" "}
          {isInter
            ? "Tarification au prorata : prix × nb apprenants × nb jours."
            : "Tarification forfaitaire : forfait × nb jours, + apprenants supplémentaires au-delà du seuil."}
        </p>
      </div>

      {isInter ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="price_per_day_ht_input">
              Prix par jour et par apprenant
            </Label>
            <PriceInput
              id="price_per_day_ht_input"
              value={pricePerDay}
              onChange={setPricePerDay}
              placeholder={
                modality === "distanciel"
                  ? String(orgDefaults.interDistancielPerDay)
                  : String(orgDefaults.interPresentielPerDay)
              }
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] items-end">
          <div className="space-y-1.5">
            <Label htmlFor="price_forfait_ht_input">Forfait par jour</Label>
            <PriceInput
              id="price_forfait_ht_input"
              value={priceForfait}
              onChange={setPriceForfait}
              placeholder={
                modality === "distanciel"
                  ? String(orgDefaults.intraDistancielForfait)
                  : String(orgDefaults.intraPresentielForfait)
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price_extra_per_day_ht_input">
              Apprenant supplémentaire / jour
            </Label>
            <PriceInput
              id="price_extra_per_day_ht_input"
              value={priceExtra}
              onChange={setPriceExtra}
              placeholder={
                modality === "distanciel"
                  ? String(orgDefaults.intraDistancielExtraPerDay)
                  : String(orgDefaults.intraPresentielExtraPerDay)
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pricing_threshold_input">Seuil forfait</Label>
            <Input
              id="pricing_threshold_input"
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="text-center"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={applyOrgDefaults}
          className="text-[11px] font-medium text-cyan-700 hover:text-cyan-900 hover:underline"
        >
          ↻ Réinitialiser depuis les paramètres organisation
        </button>
        {currentNbApprenants > 0 && currentNbJours > 0 && preview.totalHt > 0 && (
          <div className="rounded-lg bg-cyan-50 border border-cyan-200 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-cyan-700 mb-1">
              <Calculator className="h-3 w-3" />
              Total prévu ({currentNbApprenants} apprenant
              {currentNbApprenants > 1 ? "s" : ""} × {currentNbJours} j)
            </div>
            <div className="space-y-0.5">
              {preview.lines.map((line, i) => (
                <p key={i} className="text-[10px] text-slate-600">
                  {line.label} ={" "}
                  <span className="font-mono tabular-nums">
                    {formatEur(line.amount)}
                  </span>
                </p>
              ))}
              <p className="text-sm font-bold text-cyan-900 pt-1 border-t border-cyan-200 mt-1">
                = {formatEur(preview.totalHt)} HT
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        step="0.01"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("pr-14")}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
        € HT
      </span>
    </div>
  );
}

function formatEur(n: number): string {
  return n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}
