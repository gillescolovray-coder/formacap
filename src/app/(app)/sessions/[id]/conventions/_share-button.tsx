"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Link as LinkIcon, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { ensureConventionShareLink } from "./actions";

/**
 * Bouton « Partager le lien » sur une convention. Au clic, ouvre une
 * modale contenant :
 *   • L'URL publique de signature, copiable en un clic
 *   • Un QR code (pour partage par téléphone / impression / WhatsApp)
 *   • Conseil d'usage : utile quand l'email est bloqué par Outlook /
 *     Mailinblack ou tout autre anti-spam.
 *
 * Gilles 2026-05-22 : contournement des filtres anti-spam.
 */
export function ShareConventionButton({
  conventionId,
}: {
  conventionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Au 1er ouverture, on charge / génère le lien
  useEffect(() => {
    if (!open || url) return;
    startTransition(async () => {
      const res = await ensureConventionShareLink(conventionId);
      if (res.ok) setUrl(res.url);
      else setError(res.error);
    });
  }, [open, url, conventionId]);

  function copy() {
    if (!url) return;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        setError("Copie impossible — copiez le lien manuellement.");
      });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Partager le lien de signature (QR code + lien direct, utile si l'email est filtré par l'anti-spam)"
      >
        <LinkIcon className="h-3.5 w-3.5" />
        Partager
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 text-zinc-400 hover:text-zinc-700"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-zinc-900">
                Lien de signature
              </h2>
              <p className="text-xs text-zinc-600">
                Utile si l&apos;email est bloqué par un anti-spam
                (Mailinblack, Outlook…). Envoie ce lien par SMS, WhatsApp
                ou téléphone.
              </p>
            </div>

            {pending && !url && (
              <div className="text-xs text-zinc-500 italic">
                Génération du lien…
              </div>
            )}

            {error && (
              <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                {error}
              </div>
            )}

            {url && (
              <>
                {/* QR code centré */}
                <div className="flex justify-center bg-zinc-50 border border-zinc-200 rounded-lg p-4">
                  <QRCodeSVG
                    value={url}
                    size={200}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                {/* URL + bouton copier */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Lien direct
                  </label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={url}
                      onClick={(e) =>
                        (e.target as HTMLInputElement).select()
                      }
                      className="flex-1 h-9 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-mono shadow-sm"
                    />
                    <Button
                      type="button"
                      onClick={copy}
                      size="sm"
                      className={
                        copied
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : ""
                      }
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copié
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copier
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-full h-9 px-3 rounded-md bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700"
                >
                  Ouvrir le lien dans un nouvel onglet
                </a>

                <p className="text-[11px] text-zinc-500 italic">
                  💡 Le lien expire après 30 jours.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
