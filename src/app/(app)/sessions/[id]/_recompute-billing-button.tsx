"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2 } from "lucide-react";
import { recomputeSessionBilling } from "@/lib/billing/backfill-actions";

/**
 * Bouton « Recalculer la facturation » d'une session (Gilles 2026-06-25).
 * Réaligne le montant de chaque inscription sur le tarif de la fiche (forfait
 * = total ÷ nb apprenants, tarifs sous-traitance/prescripteur via le moteur).
 * Ne touche JAMAIS une session clôturée (montants gelés).
 */
export function RecomputeBillingButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function handleClick() {
    setMsg(null);
    startTransition(async () => {
      const res = await recomputeSessionBilling(sessionId);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error ?? "Échec du recalcul." });
        return;
      }
      if (res.closed) {
        setMsg({
          ok: true,
          text: "Session clôturée : montants gelés, rien n'a été modifié.",
        });
      } else {
        const skip =
          res.skipped && res.skipped > 0
            ? ` (${res.skipped} en tarif manuel, conservé${res.skipped > 1 ? "s" : ""})`
            : "";
        setMsg({
          ok: true,
          text: `Facturation recalculée : ${res.computed ?? 0} inscription(s)${skip}.`,
        });
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 disabled:opacity-60 min-h-[40px]"
        title="Réaligner les montants des inscriptions sur le tarif de la fiche (forfait, sous-traitance…). Sans effet sur une session clôturée."
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Calculator className="h-4 w-4" />
        )}
        Recalculer la facturation
      </button>
      {msg && (
        <p
          className={`text-[11px] font-medium ${
            msg.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
