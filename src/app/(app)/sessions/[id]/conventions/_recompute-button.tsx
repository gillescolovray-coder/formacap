"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recomputeConventionAmount } from "./actions";

/**
 * Bouton « Recalculer le montant » sur une convention persistée à 0 €.
 *
 * Gilles 2026-05-22 (bug Mme TORRES) : utile quand l'auto-update
 * silencieux au chargement n'a pas pu UPDATE la BDD (RLS, cache…) et
 * que la convention reste à 0 alors qu'on devrait avoir 305 €.
 */
export function RecomputeAmountButton({
  sessionId,
  conventionId,
}: {
  sessionId: string;
  conventionId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const onClick = () => {
    setResult(null);
    startTransition(async () => {
      const res = await recomputeConventionAmount(sessionId, conventionId);
      if (res.ok) {
        setResult({
          ok: true,
          msg: `✓ Recalculé : ${res.totalHt.toLocaleString("fr-FR")} € HT`,
        });
        router.refresh();
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-stretch gap-0.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={pending}
        title="Force le recalcul du montant + sauve en BDD"
        className="text-amber-700 border-amber-300 hover:bg-amber-50"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Recalculer
      </Button>
      {result && (
        <p
          className={`text-[10px] text-center ${result.ok ? "text-emerald-700" : "text-rose-700"}`}
        >
          {result.msg}
        </p>
      )}
    </div>
  );
}
