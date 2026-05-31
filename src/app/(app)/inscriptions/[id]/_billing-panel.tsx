"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Calculator, Euro, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  recomputeBillingForInscription,
  saveManualBilling,
} from "./billing-actions";

/**
 * Bloc Facturation sur la fiche inscription (refonte 2026-05-31).
 *
 * Affiche l etat FIGE en BDD (billing_*) + bouton pour recalculer
 * automatiquement OU saisir manuellement.
 *
 * Si billing_manually_overridden=true : on affiche un badge "Manuel"
 * et un bouton "Reinitialiser" pour repartir du calcul automatique.
 */

type Props = {
  inscriptionId: string;
  billingTargetCompanyId: string | null;
  billingTargetCompanyName: string | null;
  billingPricingMode: "per_day_per_learner" | "flat_per_day" | "flat" | null;
  billingUnitPriceHt: number | null;
  billingTotalHt: number | null;
  billingManuallyOverridden: boolean;
  billingNotes: string | null;
};

const MODE_LABELS: Record<string, string> = {
  per_day_per_learner: "Tarif jour × durée (par apprenant)",
  flat_per_day: "Forfait jour (par session, indépendant nb apprenants)",
  flat: "Forfait global",
};

export function BillingPanel(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Editable fields (initialisés depuis props)
  const [unitPrice, setUnitPrice] = useState<string>(
    props.billingUnitPriceHt !== null ? String(props.billingUnitPriceHt) : "",
  );
  const [total, setTotal] = useState<string>(
    props.billingTotalHt !== null ? String(props.billingTotalHt) : "",
  );
  const [mode, setMode] = useState<string>(props.billingPricingMode ?? "flat");
  const [notes, setNotes] = useState<string>(props.billingNotes ?? "");

  const isEmpty =
    props.billingTargetCompanyId === null &&
    props.billingTotalHt === null &&
    !props.billingManuallyOverridden;

  function autoRecompute(force = false) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await recomputeBillingForInscription(props.inscriptionId, {
        force,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setInfo(res.explain ?? "Calcul effectué.");
      if (res.warnings && res.warnings.length > 0) {
        setError(res.warnings.join(" — "));
      }
      router.refresh();
    });
  }

  function saveManual() {
    setError(null);
    setInfo(null);
    const parseNum = (raw: string): number | null | "invalid" => {
      const t = raw.trim();
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) return "invalid";
      return n;
    };
    const u = parseNum(unitPrice);
    const t = parseNum(total);
    if (u === "invalid" || t === "invalid") {
      setError("Tarif invalide (nombre positif attendu).");
      return;
    }
    startTransition(async () => {
      const res = await saveManualBilling(props.inscriptionId, {
        billingUnitPriceHt: u,
        billingTotalHt: t,
        billingPricingMode: mode as
          | "per_day_per_learner"
          | "flat_per_day"
          | "flat",
        billingNotes: notes.trim() ? notes.trim() : null,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      setInfo("Modifications enregistrées (mode manuel).");
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-950 border border-emerald-200 dark:border-emerald-900 p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold inline-flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <Euro className="h-4 w-4" />
            Facturation
            {props.billingManuallyOverridden && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 border border-amber-200">
                <Pencil className="h-3 w-3" />
                Manuel
              </span>
            )}
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Qui CAP NUMÉRIQUE facture pour cette inscription et combien.
            {props.billingManuallyOverridden
              ? " (Modifié manuellement — le système ne recalcule plus automatiquement.)"
              : " (Calculé automatiquement à partir des règles métier.)"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!editing && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => autoRecompute(false)}
              disabled={pending}
              title={
                props.billingManuallyOverridden
                  ? "Recalcul ignoré tant que le mode Manuel est actif"
                  : "Recalcule depuis les règles métier"
              }
            >
              <Calculator className="h-3.5 w-3.5" />
              {pending ? "..." : "Calculer auto"}
            </Button>
          )}
          {!editing && props.billingManuallyOverridden && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (
                  !confirm(
                    "Réinitialiser ? Le tarif manuel sera écrasé par le calcul automatique.",
                  )
                )
                  return;
                autoRecompute(true);
              }}
              disabled={pending}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Réinitialiser
            </Button>
          )}
          {!editing && (
            <Button
              type="button"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={pending}
            >
              <Pencil className="h-3.5 w-3.5" />
              Modifier
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 flex-none mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {info && !error && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
          {info}
        </div>
      )}

      {isEmpty && !editing && (
        <div className="rounded-md bg-zinc-50 border border-zinc-200 p-3 text-xs text-zinc-600">
          Aucune facturation calculée pour cette inscription. Cliquez sur
          <strong> Calculer auto </strong> pour appliquer les règles métier
          ou <strong> Modifier </strong> pour saisir manuellement.
        </div>
      )}

      {!editing && !isEmpty && (
        <div className="space-y-2 text-sm">
          <Row
            label="Payeur (CAP facture)"
            value={
              props.billingTargetCompanyName ?? (
                <span className="text-zinc-400 italic">Non défini</span>
              )
            }
          />
          <Row
            label="Mode de calcul"
            value={
              props.billingPricingMode
                ? MODE_LABELS[props.billingPricingMode]
                : "—"
            }
          />
          <Row
            label="Tarif unitaire HT"
            value={
              props.billingUnitPriceHt !== null
                ? `${props.billingUnitPriceHt.toFixed(2)} €`
                : "—"
            }
          />
          <Row
            label="Total HT"
            value={
              props.billingTotalHt !== null ? (
                <strong className="text-emerald-700 text-base tabular-nums">
                  {props.billingTotalHt.toFixed(2)} €
                </strong>
              ) : (
                "—"
              )
            }
          />
          {props.billingNotes && (
            <Row
              label="Notes"
              value={
                <span className="italic text-zinc-600">{props.billingNotes}</span>
              }
            />
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Mode de calcul">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"
              >
                <option value="flat">Forfait global</option>
                <option value="per_day_per_learner">
                  Tarif jour × durée (par apprenant)
                </option>
                <option value="flat_per_day">
                  Forfait jour (par session)
                </option>
              </select>
            </Field>
            <Field label="Tarif unitaire HT (€)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm tabular-nums"
              />
            </Field>
            <Field label="Total HT (€)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm tabular-nums font-bold"
              />
            </Field>
            <Field label="Payeur (qui facturer)">
              <div className="text-xs text-zinc-500 italic h-9 flex items-center">
                {props.billingTargetCompanyName ??
                  "Calculé auto au prochain recalc"}
              </div>
            </Field>
          </div>
          <Field label="Notes (raison de la modif, conditions, etc.)">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex : Remise commerciale exceptionnelle 10%."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setError(null);
                setInfo(null);
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
              {pending ? "..." : "Enregistrer (manuel)"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px,1fr] sm:grid-cols-[180px,1fr] gap-2 items-baseline">
      <span className="text-[11px] uppercase tracking-wider font-bold text-zinc-500">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider font-bold text-zinc-500 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
