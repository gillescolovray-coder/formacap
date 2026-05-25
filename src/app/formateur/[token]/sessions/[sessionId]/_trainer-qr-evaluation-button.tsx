"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { ClipboardList, Maximize2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getOrCreateSessionEvaluationTokenAsTrainer,
  regenerateSessionEvaluationTokenAsTrainer,
  type TrainerSessionQrTokenResult,
} from "./actions";

type Props = {
  token: string;
  sessionId: string;
};

/**
 * Bouton "QR code évaluation à chaud" — variante portail formateur.
 *
 * Le formateur projette ce QR à la fin de la session pour que chaque
 * apprenant remplisse l'évaluation Qualiopi sur son téléphone avant
 * de quitter la salle.
 *
 * Pendant du QR code émargement, mais avec une couleur violette pour
 * distinguer visuellement les 2 actions de fin de session.
 */
export function TrainerQrEvaluationButton({ token, sessionId }: Props) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrainerSessionQrTokenResult | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    setLoading(true);
    getOrCreateSessionEvaluationTokenAsTrainer(token, sessionId).then((res) => {
      if (cancelled) return;
      setData(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, data, token, sessionId]);

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

  async function handleRegenerate() {
    if (!confirm("Régénérer un nouveau QR code ? L'ancien sera invalidé."))
      return;
    setLoading(true);
    const res = await regenerateSessionEvaluationTokenAsTrainer(
      token,
      sessionId,
    );
    setData(res);
    setLoading(false);
  }

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

              <div className="text-center space-y-1">
                <div className="text-xs uppercase tracking-widest text-violet-700 font-semibold">
                  Évaluation à chaud
                </div>
                <h2 className="text-lg font-bold text-zinc-900">
                  Scannez ce QR code
                </h2>
                <p className="text-sm text-zinc-600">
                  Avant de partir, scannez avec votre téléphone, choisissez
                  votre nom puis remplissez le questionnaire de satisfaction.
                </p>
              </div>

              {loading || !data ? (
                <div className="aspect-square max-w-xs mx-auto flex items-center justify-center bg-zinc-50 rounded-lg">
                  <div className="text-sm text-zinc-500">
                    Génération du QR code…
                  </div>
                </div>
              ) : !data.ok || !data.publicUrl ? (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {data.error ?? "Impossible de générer le QR code."}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center bg-white rounded-lg border-2 border-zinc-200 p-3">
                    <QRCodeSVG
                      value={data.publicUrl}
                      size={220}
                      level="M"
                      marginSize={2}
                    />
                  </div>

                  <div className="text-center space-y-1">
                    <a
                      href={data.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-violet-700 hover:underline break-all"
                    >
                      {data.publicUrl}
                    </a>
                    {data.expiresAt && (
                      <p className="text-[11px] text-zinc-500">
                        Valable jusqu&apos;au{" "}
                        {new Date(data.expiresAt).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFullscreen(true)}
                    >
                      <Maximize2 className="h-4 w-4" />
                      Plein écran
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerate}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Régénérer
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {open && fullscreen && data?.publicUrl && (
        <div
          className="fixed inset-0 z-[60] bg-white flex flex-col items-center justify-between p-4 sm:p-6 cursor-pointer"
          style={{ height: "100dvh" }}
          onClick={() => setFullscreen(false)}
        >
          <div className="text-xs uppercase tracking-widest text-violet-700 font-semibold text-center shrink-0">
            Évaluation à chaud — Scannez avec votre téléphone
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
                value={data.publicUrl}
                level="M"
                marginSize={2}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>
          <div className="shrink-0 text-center space-y-1">
            <a
              href={data.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-violet-700 hover:underline font-mono break-all px-2"
            >
              {data.publicUrl}
            </a>
            <div className="text-xs text-zinc-400">
              Cliquez n&apos;importe où pour quitter
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <Button
        variant="default"
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-violet-600 hover:bg-violet-700 text-white"
      >
        <ClipboardList className="h-4 w-4" />
        QR code évaluation
      </Button>
      {mounted ? createPortal(overlays, document.body) : null}
    </>
  );
}
