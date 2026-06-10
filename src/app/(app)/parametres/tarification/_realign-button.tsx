"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { realignPrescripteurPricing } from "./realign-actions";

/**
 * Bouton « Réaligner les tarifs prescripteurs » : recalcule les montants des
 * inscriptions prescripteurs existantes sur la grille en vigueur. Gilles
 * 2026-06-09. Respecte les montants saisis manuellement.
 */
export function RealignPrescripteurButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="rounded-xl bg-fuchsia-50/60 border border-fuchsia-200 p-4 space-y-2">
      <h3 className="text-sm font-bold text-fuchsia-900">
        Réaligner les tarifs prescripteurs
      </h3>
      <p className="text-xs text-fuchsia-900/80">
        Recalcule le montant des <strong>inscriptions prescripteurs déjà
        enregistrées</strong> selon la grille en vigueur (tarif société, sinon
        grille prescripteur par défaut). Les montants saisis manuellement ne
        sont pas modifiés.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              "Réaligner les montants des inscriptions prescripteurs sur la grille en vigueur ?\n\nLes montants saisis manuellement seront conservés.",
            )
          )
            return;
          setMsg(null);
          startTransition(async () => {
            const res = await realignPrescripteurPricing();
            if (res.ok) {
              setMsg({
                ok: true,
                text: `${res.updated} inscription(s) réalignée(s)${res.skipped ? `, ${res.skipped} conservée(s)/ignorée(s)` : ""}.`,
              });
            } else {
              setMsg({ ok: false, text: res.error ?? "Échec du réalignement." });
            }
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-300 bg-white px-3 py-2 text-sm font-semibold text-fuchsia-800 hover:bg-fuchsia-100 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCcw className="h-4 w-4" />
        )}
        Réaligner les tarifs prescripteurs
      </button>
      {msg && (
        <p
          className={`text-xs font-medium ${msg.ok ? "text-emerald-700" : "text-red-600"}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
