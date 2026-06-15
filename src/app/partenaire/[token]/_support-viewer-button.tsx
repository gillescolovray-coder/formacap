"use client";

/**
 * Bouton « Support remis lors de la formation » + visionneuse en CONSULTATION
 * SEULE (Gilles 2026-06-15). Ouvre le support (lien Google Drive) dans un
 * aperçu intégré (iframe /preview), SANS bouton de téléchargement de notre
 * côté. Rendu via createPortal(document.body) + position fixed (cf. mémoire
 * feedback_dropdown_portal) pour couvrir tout l'écran sans clipping.
 *
 * ⚠️ Le verrouillage TOTAL du téléchargement dépend du réglage de partage
 * Google Drive du fichier (« Les lecteurs ne peuvent pas télécharger, imprimer
 * ni copier »). Côté app on masque tout bouton et on décourage le clic droit.
 */
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Eye, ShieldCheck, X } from "lucide-react";

export function SupportViewerButton({
  previewUrl,
  title,
}: {
  previewUrl: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Consulter le support remis aux apprenants (lecture seule)"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-cyan-300 bg-white hover:bg-cyan-50 text-cyan-700 text-sm font-medium"
      >
        <Eye className="h-4 w-4" />
        Support remis lors de la formation
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] flex flex-col bg-black/70"
            onClick={() => setOpen(false)}
          >
            {/* Barre supérieure */}
            <div
              className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border-b border-zinc-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-w-0">
                <p className="font-bold text-sm text-zinc-900 truncate">
                  Support — {title}
                </p>
                <p className="text-[11px] text-amber-700 inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Consultation uniquement — document confidentiel, merci de ne
                  pas le diffuser.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 text-sm font-medium"
              >
                <X className="h-4 w-4" />
                Fermer
              </button>
            </div>

            {/* Aperçu (clic droit désactivé pour décourager l'enregistrement) */}
            <div
              className="flex-1 bg-zinc-100"
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <iframe
                src={previewUrl}
                title="Support de formation"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
