"use client";

import { useState } from "react";
import {
  Check,
  Download,
  Loader2,
  Printer,
  Square,
  SquareCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sélecteur batch pour imprimer plusieurs feuilles individuelles
 * d'un coup (Gilles 2026-06-01).
 *
 * Fonctionnement :
 * - Cases à cocher devant chaque apprenant
 * - Bouton "Tout cocher / Tout décocher"
 * - Bouton "Ouvrir les N feuilles" → ouvre N onglets via window.open()
 *   Chaque onglet a le nom de fichier suggéré dans le titre, donc
 *   Ctrl+P → "Enregistrer en PDF" → enregistre dans le dossier choisi
 *   avec le bon nom.
 *
 * NB : les navigateurs limitent l'ouverture multiple d'onglets à
 * partir d'un seul clic. On utilise un léger délai pour éviter le
 * popup blocker. Au-delà de 10 onglets, l'utilisateur sera invité
 * à autoriser les popups.
 */

type Participant = {
  enrollmentId: string;
  name: string;
};

export function BatchPrintSelector({
  sessionId,
  participants,
}: {
  sessionId: string;
  participants: Participant[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opening, setOpening] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  if (participants.length === 0) return null;

  const allChecked =
    selected.size === participants.length && participants.length > 0;
  const someChecked = selected.size > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(participants.map((p) => p.enrollmentId)));
    }
  }

  async function openSelected() {
    if (selected.size === 0) return;
    setOpening(true);
    // Tri pour respecter l ordre alphabetique
    const ids = participants
      .filter((p) => selected.has(p.enrollmentId))
      .map((p) => p.enrollmentId);
    // Ouvre chaque feuille avec un leger delai pour eviter le popup blocker
    for (let i = 0; i < ids.length; i++) {
      const url = `/sessions/${sessionId}/emargement/print?enrollment_id=${ids[i]}`;
      window.open(url, "_blank", "noopener");
      // Petit delai entre chaque ouverture
      if (i < ids.length - 1) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    setOpening(false);
  }

  async function downloadZip() {
    if (selected.size === 0) return;
    setDownloadingZip(true);
    setZipError(null);
    try {
      const ids = participants
        .filter((p) => selected.has(p.enrollmentId))
        .map((p) => p.enrollmentId)
        .join(",");
      const url = `/api/sessions/${sessionId}/emargement/pdf-zip?enrollment_ids=${ids}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const errText = await res.text().catch(() => "Erreur inconnue");
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      // Extract filename from Content-Disposition or fallback
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? "Emargements.zip";
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      setZipError(e instanceof Error ? e.message : "Erreur ZIP");
    } finally {
      setDownloadingZip(false);
    }
  }

  return (
    <details className="relative">
      <summary className="list-none cursor-pointer inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800">
        <Printer className="h-4 w-4" />
        Feuille individuelle ▾
        {someChecked && (
          <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-cyan-600 text-white text-[10px] font-bold">
            {selected.size}
          </span>
        )}
      </summary>
      <div className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-50 flex flex-col">
        {/* Header : tout cocher + nb selectionnes */}
        <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 sticky top-0 bg-white dark:bg-zinc-900">
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 hover:underline"
          >
            {allChecked ? (
              <>
                <SquareCheck className="h-3.5 w-3.5" />
                Tout décocher
              </>
            ) : (
              <>
                <Square className="h-3.5 w-3.5" />
                Tout cocher
              </>
            )}
          </button>
          <span className="text-[11px] text-zinc-500">
            {selected.size} / {participants.length}
          </span>
        </div>

        {/* Liste */}
        <ul className="py-1 flex-1 overflow-auto">
          {participants.map((p) => {
            const isChecked = selected.has(p.enrollmentId);
            return (
              <li key={p.enrollmentId}>
                <label className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(p.enrollmentId)}
                    className="w-4 h-4 accent-cyan-600"
                  />
                  <span className="flex-1 truncate">{p.name}</span>
                  <a
                    href={`/sessions/${sessionId}/emargement/print?enrollment_id=${p.enrollmentId}`}
                    target="_blank"
                    rel="noopener"
                    className="text-[10px] text-zinc-500 hover:text-cyan-700 px-1"
                    onClick={(e) => e.stopPropagation()}
                    title="Ouvrir seulement cette feuille"
                  >
                    Ouvrir →
                  </a>
                </label>
              </li>
            );
          })}
        </ul>

        {/* Footer : actions batch */}
        <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 sticky bottom-0 bg-white dark:bg-zinc-900 space-y-1.5">
          {/* Bouton principal : telecharge ZIP */}
          <Button
            type="button"
            size="sm"
            onClick={downloadZip}
            disabled={!someChecked || downloadingZip || opening}
            className="w-full"
          >
            {downloadingZip ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Télécharger le ZIP ({selected.size} PDF
                {selected.size > 1 ? "s" : ""})
              </>
            )}
          </Button>
          {/* Bouton secondaire : ouvrir dans des onglets */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openSelected}
            disabled={!someChecked || opening || downloadingZip}
            className="w-full"
          >
            {opening ? (
              <>...</>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Ouvrir en onglets séparés
              </>
            )}
          </Button>
          {zipError && (
            <p className="text-[10px] text-red-600 mt-1 leading-snug">
              ⚠️ {zipError}
            </p>
          )}
          {someChecked && !zipError && (
            <p className="text-[10px] text-zinc-500 mt-1 leading-snug">
              💡 Le ZIP contient {selected.size} PDF
              {selected.size > 1 ? "s" : ""}, 1 par apprenant.
            </p>
          )}
        </div>
      </div>
    </details>
  );
}
