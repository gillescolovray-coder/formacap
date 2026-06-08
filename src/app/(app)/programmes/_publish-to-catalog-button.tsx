"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BookOpen, Loader2 } from "lucide-react";
import { publishBlueprintToCatalog } from "./actions";

/**
 * Bouton « Basculer au catalogue » (Gilles 2026-06-08) : crée la fiche
 * formation à partir d'un programme validé, puis redirige dessus.
 * Si déjà basculé, affiche le lien vers la fiche.
 */
export function PublishToCatalogButton({
  blueprintId,
  formationId,
}: {
  blueprintId: string;
  formationId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (formationId) {
    return (
      <Link
        href={`/formations/${formationId}`}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm font-bold hover:bg-emerald-100"
      >
        <BookOpen className="h-4 w-4" />
        Voir la fiche au catalogue
        <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await publishBlueprintToCatalog(blueprintId);
            if (res.ok && res.formationId) {
              router.push(`/formations/${res.formationId}?created=1`);
            } else {
              setError(res.error ?? "Bascule impossible.");
            }
          });
        }}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <BookOpen className="h-4 w-4" />
        )}
        Basculer au catalogue
      </button>
      <p className="text-[11px] text-zinc-500">
        Crée la fiche formation (brouillon) prête à planifier des sessions.
      </p>
      {error && <p className="text-[11px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
