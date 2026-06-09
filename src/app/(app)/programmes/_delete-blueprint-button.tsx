"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteBlueprint } from "./actions";

/**
 * Bouton « Supprimer » un programme (brouillon Bloom) avec confirmation.
 * Gilles 2026-06-09.
 */
export function DeleteBlueprintButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            "Supprimer définitivement ce programme ?\n\nCette action est irréversible.",
          )
        )
          return;
        startTransition(async () => {
          const res = await deleteBlueprint(id);
          if (res.ok) router.push("/programmes");
          else window.alert(res.error ?? "Suppression impossible.");
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      Supprimer
    </button>
  );
}
