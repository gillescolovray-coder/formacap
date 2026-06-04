"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { importBlueprintFromPdf } from "./import-actions";

function SubmitButton({ hasFile }: { hasFile: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !hasFile}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyse du document en cours…
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" />
          Importer &amp; réadapter à Bloom
        </>
      )}
    </button>
  );
}

/**
 * Dépôt d'un programme existant (PDF/image) pour le réadapter à Bloom.
 * L'IA extrait les infos + réécrit les objectifs, puis crée un brouillon.
 */
export function ImportBlueprint() {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form
      action={importBlueprintFromPdf}
      className="rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/40 p-4 sm:p-6 space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-violet-100 text-violet-700 shrink-0">
          <FileUp className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-zinc-900">
            Réadapter un programme existant
          </h2>
          <p className="text-xs text-zinc-600 mt-0.5">
            Déposez un programme actuel (PDF, ou image). L&apos;IA en extrait les
            informations et <strong>réécrit les objectifs en version Bloom
            mesurable</strong>, puis crée un brouillon que vous pourrez ajuster.
          </p>
        </div>
      </div>

      <label className="block">
        <input
          type="file"
          name="document"
          accept=".pdf,image/jpeg,image/png,image/webp"
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-violet-100 file:text-violet-700 hover:file:bg-violet-200 cursor-pointer"
        />
      </label>
      {fileName && (
        <p className="text-xs text-zinc-500">
          Fichier sélectionné : <strong>{fileName}</strong>
        </p>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SubmitButton hasFile={Boolean(fileName)} />
        <span className="text-[11px] text-zinc-400">
          PDF/JPG/PNG · 10 Mo max · l&apos;analyse peut prendre ~15 s
        </span>
      </div>
    </form>
  );
}
