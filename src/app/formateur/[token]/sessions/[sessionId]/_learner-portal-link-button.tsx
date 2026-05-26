"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Link as LinkIcon, Maximize2, QrCode, X } from "lucide-react";

type Result = { url: string; token: string } | { error: string };

/**
 * Petit bouton "lien apprenant" affiché à droite de chaque participant
 * dans la liste du portail formateur. Au clic : ouvre une modale avec
 * un QR code + l'URL du portail personnel de l'apprenant.
 *
 * Cas d'usage (Gilles 2026-05-24) : le formateur a saisi un apprenant
 * lui-même (sans QR rapide d'inscription) et veut maintenant lui
 * permettre d'accéder à son portail pour faire le quiz d'entrée /
 * sortie, émarger, etc.
 *
 * Disponible pour TOUS les apprenants, pas seulement les temporaires :
 * pratique aussi si un apprenant régulier a perdu sa convocation.
 */
export function LearnerPortalLinkButton({
  learnerName,
  getLinkAction,
}: {
  learnerName: string;
  getLinkAction: () => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    setLoading(true);
    getLinkAction().then((res) => {
      if (cancelled) return;
      setData(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, data, getLinkAction]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, fullscreen]);

  const url = data && "url" in data ? data.url : null;
  const err = data && "error" in data ? data.error : null;

  const overlays = (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div className="min-h-full flex items-start sm:items-center justify-center p-4 py-8">
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-3 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>

              <header className="text-center space-y-1">
                <div className="text-xs uppercase tracking-widest text-cyan-700 font-semibold">
                  Lien personnel
                </div>
                <h2 className="text-base font-bold text-zinc-900">
                  Portail de {learnerName}
                </h2>
                <p className="text-xs text-zinc-600">
                  À scanner si <strong>{learnerName}</strong> n&apos;a pas
                  sa convocation avec lui : lui donne accès à son espace
                  personnel pour cette formation (
                  <strong>quiz d&apos;entrée / sortie</strong>, émargement,
                  supports, évaluation à chaud).
                </p>
              </header>

              {loading || !data ? (
                <div className="aspect-square max-w-xs mx-auto flex items-center justify-center bg-zinc-50 rounded-lg">
                  <div className="text-sm text-zinc-500">Génération…</div>
                </div>
              ) : err ? (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {err}
                </div>
              ) : url ? (
                <>
                  <div className="flex items-center justify-center bg-white rounded-lg border-2 border-zinc-200 p-3">
                    <QRCodeSVG
                      value={url}
                      size={220}
                      level="M"
                      marginSize={2}
                    />
                  </div>

                  <div className="text-center space-y-1">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-cyan-700 hover:underline break-all"
                    >
                      {url}
                    </a>
                  </div>

                  <div className="flex gap-2 justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => setFullscreen(true)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-zinc-300 hover:bg-zinc-50"
                    >
                      <Maximize2 className="h-3 w-3" />
                      Plein écran
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(url);
                      }}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-zinc-300 hover:bg-zinc-50"
                    >
                      <LinkIcon className="h-3 w-3" />
                      Copier le lien
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {open && fullscreen && url && (
        <div
          className="fixed inset-0 z-[110] bg-white flex flex-col items-center justify-between p-4 sm:p-6 cursor-pointer"
          style={{ height: "100dvh" }}
          onClick={() => setFullscreen(false)}
        >
          <div className="text-xs uppercase tracking-widest text-cyan-700 font-semibold text-center shrink-0">
            Portail de {learnerName} — Scannez pour accéder au quiz
          </div>
          <div className="flex items-center justify-center min-h-0 flex-1 w-full">
            <div
              className="aspect-square"
              style={{
                width: "min(70dvh, 90vw, 600px)",
                height: "min(70dvh, 90vw, 600px)",
              }}
            >
              <QRCodeSVG
                value={url}
                level="M"
                marginSize={2}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>
          <div className="shrink-0 text-center text-xs text-zinc-400">
            Cliquez n&apos;importe où pour quitter
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`QR code personnel de ${learnerName} — à scanner s'il n'a pas sa convocation : lui donne accès à son espace personnel pour cette formation (quiz, émargement, supports, évaluation à chaud).`}
        className="p-1 rounded-md text-cyan-700 hover:bg-cyan-50"
      >
        <QrCode className="h-3.5 w-3.5" />
      </button>
      {mounted ? createPortal(overlays, document.body) : null}
    </>
  );
}
