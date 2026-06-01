"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Building2, Calculator, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveEmployerAmount } from "./employer-amount-actions";

/**
 * Champ "Part employeur HT" sur la fiche inscription (Gilles 2026-06-01).
 *
 * Affiche la decomposition :
 *   Total HT  = OPCO  + Employeur
 *
 * Option C validee :
 *   - Mode AUTO par defaut : employer = total - Σ OPCO (calcul live)
 *   - Mode MANUEL : admin saisit, override stocke en BDD
 *
 * Visible uniquement si l inscription a un financement OPCO actif
 * (au moins 1 accord rattache). Sinon le total = part employeur directe,
 * pas de decomposition utile.
 */

type Props = {
  inscriptionId: string;
  /** Total HT a facturer (billing_total_ht ou quote_amount_ht). */
  totalHt: number | null;
  /** Somme des amount_ht des accords OPCO rattaches. */
  opcoTotalHt: number;
  /** Part employeur stockee en BDD (null = mode auto). */
  employerAmountStored: number | null;
  /** Nb d accords OPCO actifs — masque le bloc si 0. */
  hasOpcoFundings: boolean;
};

export function EmployerAmountField({
  inscriptionId,
  totalHt,
  opcoTotalHt,
  employerAmountStored,
  hasOpcoFundings,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [manualValue, setManualValue] = useState<string>(
    employerAmountStored !== null ? String(employerAmountStored) : "",
  );
  const [error, setError] = useState<string | null>(null);

  // Si pas de financement OPCO, on ne montre pas la decomposition
  // (le total est directement la part employeur).
  if (!hasOpcoFundings) return null;

  const isManual = employerAmountStored !== null;
  const employerAuto = Math.max(0, (totalHt ?? 0) - opcoTotalHt);
  const employerShown = isManual ? employerAmountStored! : employerAuto;
  const sumOk =
    totalHt !== null &&
    Math.abs(employerShown + opcoTotalHt - totalHt) < 0.01;

  function resetToAuto() {
    setError(null);
    startTransition(async () => {
      const res = await saveEmployerAmount(inscriptionId, null);
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function saveManual() {
    setError(null);
    const trimmed = manualValue.trim();
    if (trimmed === "") {
      // Valeur vide = repasser en auto
      resetToAuto();
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      setError("Montant invalide (nombre positif attendu).");
      return;
    }
    startTransition(async () => {
      const res = await saveEmployerAmount(inscriptionId, n);
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl bg-violet-50/40 border border-violet-200 dark:border-violet-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold inline-flex items-center gap-2 text-violet-800 dark:text-violet-300">
            <Banknote className="h-4 w-4" />
            Décomposition financement
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Répartition du total HT entre OPCO et part employeur.
            {isManual ? (
              <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 border border-amber-200">
                <Pencil className="h-3 w-3" />
                Manuel
              </span>
            ) : (
              <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-violet-100 text-violet-800 border border-violet-200">
                <Calculator className="h-3 w-3" />
                Auto
              </span>
            )}
          </p>
        </div>
        {!editing && (
          <div className="flex gap-2">
            {isManual && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={resetToAuto}
                disabled={pending}
                title="Repasser en calcul automatique"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Réinitialiser
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setManualValue(String(employerShown));
                setEditing(true);
              }}
              disabled={pending}
            >
              <Pencil className="h-3.5 w-3.5" />
              Modifier
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Decomposition Total = OPCO + Employeur */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Cell
          label="Part OPCO"
          value={opcoTotalHt}
          colorClass="text-violet-700 bg-violet-100 dark:bg-violet-950/40"
        />
        <Cell
          label="Part employeur"
          value={employerShown}
          colorClass="text-amber-700 bg-amber-100 dark:bg-amber-950/40"
          editable={editing}
          editValue={manualValue}
          onEditChange={setManualValue}
        />
        <Cell
          label="Total HT"
          value={totalHt}
          colorClass="text-emerald-700 bg-emerald-100 dark:bg-emerald-950/40"
          bold
        />
      </div>

      {editing && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(false);
              setError(null);
              setManualValue(
                employerAmountStored !== null
                  ? String(employerAmountStored)
                  : "",
              );
            }}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={saveManual}
            disabled={pending}
          >
            {pending ? "..." : "Enregistrer"}
          </Button>
        </div>
      )}

      {!sumOk && totalHt !== null && !editing && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          ⚠️ La somme OPCO + Employeur ({(opcoTotalHt + employerShown).toFixed(2)} €)
          ne correspond pas au total HT ({totalHt.toFixed(2)} €). Vérifiez les
          montants OPCO ou cliquez « Réinitialiser » pour recalculer auto.
        </p>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  colorClass,
  bold,
  editable,
  editValue,
  onEditChange,
}: {
  label: string;
  value: number | null;
  colorClass: string;
  bold?: boolean;
  editable?: boolean;
  editValue?: string;
  onEditChange?: (v: string) => void;
}) {
  return (
    <div className={`rounded-lg p-3 ${colorClass.split(" ").slice(1).join(" ")}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold opacity-70 mb-1">
        <Building2 className="h-3 w-3" />
        {label}
      </div>
      {editable ? (
        <input
          type="number"
          step="0.01"
          min="0"
          value={editValue}
          onChange={(e) => onEditChange?.(e.target.value)}
          className="w-full h-9 rounded-md border border-zinc-300 bg-white px-2 text-base font-bold tabular-nums"
          autoFocus
        />
      ) : (
        <div
          className={`text-base tabular-nums ${bold ? "font-black" : "font-bold"} ${colorClass.split(" ")[0]}`}
        >
          {value !== null
            ? `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`
            : "—"}
        </div>
      )}
    </div>
  );
}
