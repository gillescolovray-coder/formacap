"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { reviewBlueprint } from "./actions";

/**
 * Porte 1 — le référent pédagogique valide les objectifs ou les renvoie
 * avec un commentaire.
 */
export function ReviewForm({ blueprintId }: { blueprintId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(decision: "approved" | "changes_requested") {
    if (decision === "changes_requested" && !comment.trim()) {
      setError("Indiquez un commentaire pour expliquer les modifications attendues.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await reviewBlueprint(blueprintId, decision, comment);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error ?? "Erreur");
      }
    });
  }

  return (
    <section className="rounded-2xl bg-amber-50 border border-amber-200 p-4 sm:p-5 space-y-3">
      <h2 className="text-sm font-bold text-amber-900">
        Validation des objectifs (référent pédagogique)
      </h2>
      <p className="text-xs text-amber-800">
        Relisez les objectifs ci-dessus. Validez-les pour passer à la
        génération du contenu, ou renvoyez-les avec un commentaire.
      </p>
      <textarea
        className="w-full rounded-md border border-amber-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Commentaire (obligatoire en cas de renvoi)…"
      />
      {error && (
        <div className="text-xs px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-800">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => act("approved")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Valider les objectifs
        </button>
        <button
          type="button"
          onClick={() => act("changes_requested")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-400 bg-white text-amber-800 text-sm font-bold hover:bg-amber-100 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Renvoyer pour modification
        </button>
      </div>
    </section>
  );
}
