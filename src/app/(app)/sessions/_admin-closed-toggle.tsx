"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toggleSessionAdminClosed } from "./actions";

/**
 * Case à cocher « Dossier clôturé » (Gilles 2026-06-13) — marqueur de gestion
 * administrative post-formation, INDÉPENDANT du statut (n'impacte pas le CA).
 * Cochée -> pastille verte « Clôturé ».
 */
export function AdminClosedToggle({
  sessionId,
  closed,
}: {
  sessionId: string;
  closed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(closed);

  const toggle = () => {
    const next = !optimistic;
    setOptimistic(next);
    startTransition(async () => {
      const res = await toggleSessionAdminClosed(sessionId, next);
      if (res.ok) router.refresh();
      else {
        setOptimistic(!next);
        window.alert(res.error ?? "Action impossible.");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={
        optimistic
          ? "Dossier clôturé administrativement — cliquer pour rouvrir"
          : "Marquer le dossier comme clôturé (post-formation géré). Sans impact sur le CA."
      }
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors " +
        (optimistic
          ? "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200"
          : "bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-50")
      }
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <span
          className={
            "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border " +
            (optimistic
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "border-zinc-400")
          }
        >
          {optimistic && <CheckCircle2 className="h-3 w-3" />}
        </span>
      )}
      {optimistic ? "Clôturé" : "Clôturer"}
    </button>
  );
}
