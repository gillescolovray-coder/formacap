"use client";

import { useState, useTransition } from "react";
import { ExternalLink, FolderPlus, Loader2 } from "lucide-react";
import { createDriveFolderForSession } from "./archive-actions";

type Props = {
  sessionId: string;
  /** ID Drive existant si la session est deja archivee (lien direct). */
  existingFolderId: string | null;
  existingArchivedAt: string | null;
};

/**
 * Bouton "Archiver sur Drive" — cree ou recupere le dossier de la
 * session sur Google Drive (cap numerique Workspace). Disponible
 * uniquement pour les sessions en cours ou terminees.
 *
 * Si la session a deja un dossier Drive, affiche un lien direct +
 * permet de re-synchroniser (recreera juste si supprime cote Drive).
 *
 * Gilles 2026-05-28 — etape 1 archivage Drive (juste la creation
 * du dossier avec le bon nommage ; les uploads PDFs viendront en V2).
 */
export function DriveArchiveButton({
  sessionId,
  existingFolderId,
  existingArchivedAt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    folderUrl?: string;
    folderName?: string;
    error?: string;
  } | null>(null);

  function trigger() {
    setResult(null);
    startTransition(async () => {
      const res = await createDriveFolderForSession(sessionId);
      setResult({
        ok: res.ok,
        folderUrl: res.folderUrl,
        folderName: res.folderName,
        error: res.error,
      });
    });
  }

  // Cas 1 : deja archive -> bouton "Voir sur Drive" + bouton "Synchroniser"
  if (existingFolderId && !result) {
    const driveUrl = `https://drive.google.com/drive/folders/${existingFolderId}`;
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs font-bold text-emerald-800 inline-flex items-center gap-1.5">
              <FolderPlus className="h-3.5 w-3.5" />
              Archivé sur Google Drive
            </div>
            {existingArchivedAt && (
              <div className="text-[11px] text-emerald-700 mt-0.5">
                Dernière sync :{" "}
                {new Date(existingArchivedAt).toLocaleString("fr-FR", {
                  timeZone: "Europe/Paris",
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Voir sur Drive
            </a>
            <button
              type="button"
              onClick={trigger}
              disabled={pending}
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border " +
                (pending
                  ? "border-zinc-300 bg-zinc-100 text-zinc-500 cursor-wait"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50")
              }
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderPlus className="h-3.5 w-3.5" />
              )}
              {pending ? "Sync…" : "Synchroniser"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Cas 2 : pas encore archive OU resultat d'une tentative
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs font-bold text-zinc-800 inline-flex items-center gap-1.5">
            <FolderPlus className="h-3.5 w-3.5 text-cyan-600" />
            Archiver cette session sur Google Drive
          </div>
          <div className="text-[11px] text-zinc-600 mt-0.5">
            Crée un dossier dédié sur le Drive cap numerique avec la
            codification standard
            (<code className="text-[10px] bg-zinc-100 px-1 rounded">[Date - durée] - [INTER/INTRA] - [Prescripteur] - [Titre]</code>).
          </div>
        </div>
        <button
          type="button"
          onClick={trigger}
          disabled={pending}
          className={
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md " +
            (pending
              ? "bg-cyan-400 text-white cursor-wait"
              : "bg-cyan-600 hover:bg-cyan-700 text-white")
          }
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Création…
            </>
          ) : (
            <>
              <FolderPlus className="h-3.5 w-3.5" />
              Créer le dossier Drive
            </>
          )}
        </button>
      </div>

      {result && result.ok && result.folderUrl && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 text-[11px] text-emerald-900">
          ✅ Dossier <strong>{result.folderName}</strong> créé avec succès.{" "}
          <a
            href={result.folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-emerald-700 hover:text-emerald-900"
          >
            Ouvrir sur Drive →
          </a>
        </div>
      )}
      {result && !result.ok && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-[11px] text-red-800">
          ❌ {result.error ?? "Erreur inconnue"}
        </div>
      )}
    </div>
  );
}
