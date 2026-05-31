"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Calculator, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  backfillBillingForAllInscriptions,
  type BackfillBillingResult,
} from "@/lib/billing/backfill-actions";

/**
 * Bouton admin "Recalculer la facturation en masse" — lance le helper
 * computeBillingForInscription sur TOUTES les inscriptions de l org.
 *
 * 2 modes :
 *  - "missing" (defaut) : ne traite que les inscriptions sans
 *    billing_total_ht (les nouvelles)
 *  - "force" (case a cocher) : ecrase tout, y compris les billings
 *    saisis manuellement
 *
 * Respect du flag billing_manually_overridden : skip par defaut
 * (sauf si force=true).
 */
export function BillingBackfillButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BackfillBillingResult | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [force, setForce] = useState(false);

  function run() {
    if (
      force &&
      !confirm(
        "Attention : le mode 'forcer' écrasera les tarifs saisis manuellement par-dessus. Continuer ?",
      )
    ) {
      return;
    }
    setResult(null);
    startTransition(async () => {
      const res = await backfillBillingForAllInscriptions({
        onlyMissing,
        force,
      });
      setResult(res);
    });
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Calculator className="h-5 w-5 text-emerald-700 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-300">
            Backfill facturation
          </h3>
          <p className="text-[11px] text-emerald-800 dark:text-emerald-400 mt-1 leading-snug">
            Recalcule le montant à facturer (billing_total_ht) pour les
            inscriptions de votre organisation à partir des règles métier
            (helper unifié <code>computeBillingForInscription</code>).
            Respecte les tarifs saisis manuellement (sauf si vous cochez
            « forcer »).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            disabled={pending}
          />
          <span>Uniquement les inscriptions sans tarif calculé</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-amber-800">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            disabled={pending}
          />
          <span>Forcer (écrase tout, y compris saisies manuelles)</span>
        </label>
        <div className="flex-1" />
        <Button
          type="button"
          onClick={run}
          disabled={pending}
          size="sm"
        >
          {pending ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Calcul en cours...
            </>
          ) : (
            <>
              <Calculator className="h-3.5 w-3.5" />
              Lancer le recalcul
            </>
          )}
        </Button>
      </div>

      {result && (
        <div className="mt-2 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 text-xs space-y-2">
          {!result.ok ? (
            <div className="flex items-start gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{result.error}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <Check className="h-4 w-4" />
                Terminé : {result.total} inscriptions traitées
              </div>
              <ul className="space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                <li>
                  ✅ {result.computed} calculées
                </li>
                <li>
                  ⏭️ {result.skippedManualOverride} ignorées (manuel)
                </li>
                <li>
                  ⚠️ {result.warnings} avec avertissements (tarif manquant)
                </li>
                {result.errors !== undefined && result.errors > 0 && (
                  <li className="text-red-600">
                    ❌ {result.errors} erreurs
                  </li>
                )}
              </ul>
              {result.details && result.details.some((d) => d.message) && (
                <details className="text-[11px] text-zinc-500 mt-2">
                  <summary className="cursor-pointer hover:text-zinc-700">
                    Voir le détail (max 50 lignes)
                  </summary>
                  <ul className="mt-1 space-y-0.5 max-h-40 overflow-auto">
                    {result.details
                      .filter((d) => d.message)
                      .map((d) => (
                        <li key={d.inscriptionId} className="font-mono">
                          [{d.status}] {d.inscriptionId.slice(0, 8)}… : {d.message}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
