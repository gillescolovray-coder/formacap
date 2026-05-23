"use client";

import { useFormStatus } from "react-dom";
import { Brain, FileScan, Loader2, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { importFormationFromDocument } from "./import-action";

function ImportButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:from-cyan-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-wait w-full md:w-auto"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Extraction en cours…
        </>
      ) : (
        <>
          <Upload className="h-4 w-4" />
          Extraire et créer la formation
        </>
      )}
    </button>
  );
}

export function PdfImportCard() {
  return (
    <form
      action={importFormationFromDocument}
      className="rounded-2xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 border-2 border-cyan-200 dark:border-cyan-900 p-6"
    >
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30">
          <FileScan className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold tracking-tight">
            Import automatique depuis un document
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
            Uploadez un programme existant en <strong>PDF</strong>,{" "}
            <strong>JPG</strong>, <strong>PNG</strong> ou{" "}
            <strong>WebP</strong>. Le logiciel lit le contenu (OCR pour les
            images) et pré-remplit la fiche.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-400 bg-white/60 dark:bg-zinc-900/40 rounded-lg px-3 py-2">
            <Brain className="h-3.5 w-3.5 shrink-0" />
            <span>
              Le logiciel essaie d&apos;abord une analyse <strong>IA</strong>{" "}
              avancée ; en cas d&apos;indisponibilité il bascule
              automatiquement sur un parseur classique. Le résultat est
              toujours <strong>modifiable</strong> avant enregistrement.
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="space-y-2">
          <Label htmlFor="document" className="text-xs font-semibold">
            Document de programme
          </Label>
          <input
            id="document"
            name="document"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            required
            className="block w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-900 file:text-white hover:file:bg-zinc-800 dark:file:bg-white dark:file:text-zinc-900 dark:hover:file:bg-zinc-200 cursor-pointer"
          />
          <p className="text-xs text-zinc-500">
            Max 10 Mo. L&apos;analyse peut prendre 30 secondes à 2 minutes
            selon la taille du document.
          </p>
        </div>
        <ImportButton />
      </div>
    </form>
  );
}
