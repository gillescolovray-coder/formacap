"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

/**
 * Petit bouton "rejouer" affiché sous une tentative de quiz (pré ou
 * post). Au clic : confirme, supprime la tentative côté serveur, et
 * l'apprenant pourra rejouer la phase en allant sur son portail.
 *
 * Gilles 2026-05-24 : "supprimer un quiz ou le faire rejouer à
 * l'apprenant sans qu'il ait besoin de réinscrire".
 */
export function QuizAttemptResetButton({
  learnerName,
  phaseLabel,
  resetAction,
}: {
  learnerName: string;
  phaseLabel: string;
  resetAction: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    const ok = confirm(
      `Supprimer la tentative ${phaseLabel} de ${learnerName} ?\n\nLa note sera effacée et l'apprenant pourra rejouer cette phase depuis son portail (sans avoir à se réinscrire).`,
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const res = await resetAction();
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title="Supprimer cette tentative — l'apprenant pourra rejouer"
        className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-amber-700 hover:bg-amber-50 px-1.5 py-0.5 rounded disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" />
        Rejouer
      </button>
      {error && (
        <div className="text-[10px] text-red-700 mt-0.5">{error}</div>
      )}
    </div>
  );
}
