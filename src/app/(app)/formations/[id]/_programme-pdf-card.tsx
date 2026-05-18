"use client";

import { Download, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  removeProgrammePdf,
  uploadProgrammePdf,
} from "./programme-pdf/actions";

type ProgrammePdfCardProps = {
  formationId: string;
  pdfUrl: string | null;
  pdfName: string | null;
};

/**
 * Carte d'upload/gestion du PDF du programme.
 * Conçu pour être placé DANS le formulaire principal de la formation.
 * Les boutons utilisent `formAction` pour surcharger l'action du formulaire
 * lors d'un clic spécifique (upload/remove).
 */
export function ProgrammePdfCard({
  formationId,
  pdfUrl,
  pdfName,
}: ProgrammePdfCardProps) {
  const uploadAction = uploadProgrammePdf.bind(null, formationId);
  const removeAction = removeProgrammePdf.bind(null, formationId);

  return (
    <div className="rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-900 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          <Paperclip className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold tracking-tight">
            Option A — Programme au format PDF
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Joignez un programme PDF déjà formaté. Utilisable en complément ou
            à la place du programme détaillé ci-dessous.
          </p>
        </div>
      </div>

      {/* État actuel */}
      {pdfUrl ? (
        <div className="flex items-center gap-3 rounded-lg bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900 p-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center">
            <FileText className="h-4 w-4 text-red-700 dark:text-red-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {pdfName ?? "Programme.pdf"}
            </p>
            <p className="text-xs text-zinc-500">Fichier joint</p>
          </div>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 underline"
          >
            <Download className="h-3.5 w-3.5" />
            Télécharger
          </a>
          <Button
            type="submit"
            formAction={removeAction}
            variant="outline"
            size="sm"
          >
            <Trash2 className="h-4 w-4" />
            Retirer
          </Button>
        </div>
      ) : null}

      {/* Upload */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="pdf">
            {pdfUrl ? "Remplacer le PDF" : "Ajouter un PDF"}
          </Label>
          <input
            id="pdf"
            name="pdf"
            type="file"
            accept="application/pdf"
            className="block w-full text-sm text-zinc-600 dark:text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-zinc-900 file:text-white hover:file:bg-zinc-800 dark:file:bg-white dark:file:text-zinc-900 dark:hover:file:bg-zinc-200 cursor-pointer"
          />
          <p className="text-xs text-zinc-500">
            PDF uniquement. Taille max : 10 Mo.
          </p>
        </div>
        <Button
          type="submit"
          formAction={uploadAction}
          size="sm"
          variant="outline"
        >
          <Upload className="h-4 w-4" />
          Envoyer le PDF
        </Button>
      </div>
    </div>
  );
}
