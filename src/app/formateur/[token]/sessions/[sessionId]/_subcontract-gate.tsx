"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { revealSubcontractBlock } from "./actions";

/**
 * Volet « géré par l'OF » sur le portail formateur en sous-traitance
 * (Gilles 2026-06-26). Masqué par défaut ; le formateur peut l'afficher via
 * une case à cocher, après confirmation. Le choix est mémorisé pour la session.
 */
export function SubcontractGate({
  token,
  sessionId,
  block,
  icon,
  title,
  description,
}: {
  token: string;
  sessionId: string;
  block: "positionnement" | "emargement" | "evaluation";
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmReveal() {
    setError(null);
    startTransition(async () => {
      const res = await revealSubcontractBlock(token, sessionId, block);
      if (res.ok) router.refresh();
      else {
        setError(res.error ?? "Échec.");
        setChecked(false);
      }
    });
  }

  return (
    <section className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 opacity-90">
      <div className="flex items-start gap-3 mb-2">
        <div className="shrink-0 h-10 w-10 rounded-lg bg-zinc-200 text-zinc-500 flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-zinc-700 text-sm">{title}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
        </div>
      </div>

      <div className="rounded-md bg-white border border-dashed border-zinc-300 p-2.5 text-[11px] text-zinc-600">
        <span className="inline-flex items-center gap-1 font-medium text-zinc-700">
          <Lock className="h-3 w-3" />
          Ce volet est généralement géré par l&apos;OF donneur d&apos;ordre.
        </span>
        <span className="block mt-0.5">
          Vous n&apos;avez normalement pas à l&apos;utiliser en sous-traitance.
        </span>
      </div>

      {!checked ? (
        <label className="mt-2 flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-300"
            onChange={(e) => {
              if (e.target.checked) {
                setChecked(true);
                setError(null);
              }
            }}
          />
          J&apos;ai besoin d&apos;utiliser ce volet
        </label>
      ) : (
        <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-2.5 space-y-2">
          <p className="text-[11px] text-amber-900">
            ⚠️ Remarque : ce point est généralement traité par les documents
            remis par l&apos;OF donneur d&apos;ordre. Souhaitez-vous continuer ?
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={confirmReveal}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-60"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Oui, afficher
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setChecked(false)}
              className="h-8 px-3 rounded-md border border-zinc-300 bg-white text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Annuler
            </button>
          </div>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
