"use client";

import { useState } from "react";
import { ExternalLink, Landmark } from "lucide-react";
import { HelpHint } from "@/components/help-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FINANCING_MODE_LABELS,
  type FinancingMode,
} from "@/lib/inscriptions/types";
import type { Opco } from "@/lib/opcos/types";

type Props = {
  defaultFinancingMode: FinancingMode | null;
  defaultFinancingDetails: string | null;
  defaultQuoteAmount: number | null;
  defaultOpcoId: string | null;
  /** Liste des OPCO du référentiel (triée alphabétiquement côté serveur). */
  opcos: Opco[];
  /** Si true, on est en mode création — message d'info OPCO ajusté. */
  isCreate: boolean;
};

/**
 * Section Financement du formulaire d'inscription (Gilles 2026-05-21).
 *
 * Le mode de financement est piloté en client afin d'afficher
 * dynamiquement le dropdown OPCO du référentiel quand l'utilisateur
 * choisit « OPCO ». Un bouton « Ouvrir le portail » apparaît à côté
 * de l'OPCO sélectionné pour aller chercher la PEC.
 */
export function FinancingSection({
  defaultFinancingMode,
  defaultFinancingDetails,
  defaultQuoteAmount,
  defaultOpcoId,
  opcos,
  isCreate,
}: Props) {
  // Défaut : "employeur" (Gilles 2026-05-22 — le cas le plus fréquent
  // pour CAP NUMERIQUE, formations payées par l'entreprise du salarié).
  const [mode, setMode] = useState<FinancingMode>(
    defaultFinancingMode ?? "employeur",
  );
  const [opcoId, setOpcoId] = useState(defaultOpcoId ?? "");

  const selectedOpco = opcoId ? opcos.find((o) => o.id === opcoId) : null;
  const showOpcoPicker = mode === "opco";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label
            htmlFor="financing_mode"
            className="inline-flex items-center gap-1"
          >
            Mode de financement
            <HelpHint
              tone="auto"
              text="Choisissez librement le mode — indépendant de la source d'inscription"
              details={
                <ul className="space-y-1 list-disc list-inside">
                  <li>
                    Par défaut <strong>Employeur</strong> pour une
                    nouvelle inscription (cas le plus fréquent).
                  </li>
                  <li>
                    Si vous sélectionnez <strong>OPCO</strong> : un menu
                    déroulant apparaît pour choisir l&apos;OPCO dans le
                    référentiel.
                  </li>
                  <li>
                    Cliquez sur « Ouvrir le portail » pour accéder
                    directement au site de l&apos;OPCO et récupérer la PEC.
                  </li>
                </ul>
              }
            />
          </Label>
          <select
            id="financing_mode"
            name="financing_mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as FinancingMode)}
            className="flex h-9 w-full rounded-md border border-slate-300 bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            {/* On affiche Employeur en TÊTE car c'est le défaut (Gilles
                2026-05-26) — puis le reste dans l'ordre du référentiel. */}
            <option value="employeur">Employeur (par défaut)</option>
            {Object.entries(FINANCING_MODE_LABELS)
              .filter(([k]) => k !== "employeur")
              .map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quote_amount_ht">Montant prévu (€ HT)</Label>
          <Input
            id="quote_amount_ht"
            name="quote_amount_ht"
            type="number"
            step="0.01"
            min={0}
            defaultValue={defaultQuoteAmount ?? ""}
            placeholder=" "
          />
        </div>
      </div>

      {/* Champ caché : on préserve la valeur legacy `financing_details`
          (utilisé avant l'arrivée du dropdown OPCO, Gilles 2026-05-21).
          Évite d'écraser les données historiques au save. */}
      <input
        type="hidden"
        name="financing_details"
        value={defaultFinancingDetails ?? ""}
      />

      {/* === Dropdown OPCO + lien portail (visible si mode=opco) === */}
      {showOpcoPicker && (
        <div className="rounded-lg bg-emerald-50/60 border-2 border-emerald-300 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-bold text-emerald-800">
              Sélection de l&apos;OPCO
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opco_id" required>
              Choisir l&apos;OPCO dans le référentiel
            </Label>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                id="opco_id"
                name="opco_id"
                value={opcoId}
                onChange={(e) => setOpcoId(e.target.value)}
                data-filled={opcoId ? "true" : "false"}
                className="flex-1 min-w-[280px] h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
              >
                <option value="">— Sélectionner un OPCO —</option>
                {opcos.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.sectors ? ` — ${o.sectors.slice(0, 60)}${o.sectors.length > 60 ? "…" : ""}` : ""}
                  </option>
                ))}
              </select>
              {selectedOpco?.portal_url && (
                <a
                  href={selectedOpco.portal_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors whitespace-nowrap shadow-sm"
                  title="Ouvrir le portail OPCO dans un nouvel onglet — récupération PEC"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ouvrir le portail
                </a>
              )}
            </div>
            <p className="text-[11px] text-slate-600">
              💡 Référentiel modifiable dans{" "}
              <a
                href="/parametres/opcos"
                target="_blank"
                className="text-cyan-700 hover:underline font-semibold"
              >
                Paramètres → OPCO
              </a>
              .
            </p>
          </div>

          {/* Détails du contact OPCO (utile pour appeler / écrire) */}
          {selectedOpco && (
            <div className="rounded-md bg-white border border-emerald-200 p-3 space-y-1 text-xs">
              {selectedOpco.address && (
                <p className="text-slate-700">
                  <strong className="text-slate-900">Adresse :</strong>{" "}
                  {selectedOpco.address}
                </p>
              )}
              {selectedOpco.phone && (
                <p className="text-slate-700">
                  <strong className="text-slate-900">Téléphone :</strong>{" "}
                  <span className="font-mono">{selectedOpco.phone}</span>
                </p>
              )}
              {selectedOpco.email && (
                <p className="text-slate-700">
                  <strong className="text-slate-900">Email :</strong>{" "}
                  {selectedOpco.email}
                </p>
              )}
            </div>
          )}

          {isCreate && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-tight">
              💡 Après enregistrement, la modale d&apos;upload PDF
              (extraction OCR automatique de l&apos;accord OPCO) s&apos;ouvrira
              automatiquement.
            </p>
          )}
        </div>
      )}

      {/* Si OPCO mais aucun choisi → input caché vide */}
      {!showOpcoPicker && <input type="hidden" name="opco_id" value="" />}
    </div>
  );
}
