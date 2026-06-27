"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, QrCode, X } from "lucide-react";
import { getLearnerPortalLinkForPartner } from "./_support-actions";

/**
 * Bouton « Lien / QR » côté portail OF/prescripteur (Gilles 2026-06-27).
 * Récupère le lien du portail apprenant + un QR code, que le partenaire copie
 * et diffuse LUI-MÊME. Aucun email n'est envoyé, l'email de l'apprenant n'est
 * jamais exposé.
 */
export function SupportLinkButton({
  token,
  sessionId,
  enrollmentId,
}: {
  token: string;
  sessionId: string;
  enrollmentId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<{ url: string; qrDataUrl: string } | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function load() {
    setError(null);
    setOpen(true);
    if (data) return; // déjà chargé
    startTransition(async () => {
      const res = await getLearnerPortalLinkForPartner(
        token,
        sessionId,
        enrollmentId,
      );
      if (res.ok) setData({ url: res.url, qrDataUrl: res.qrDataUrl });
      else setError(res.error);
    });
  }

  async function copy() {
    if (!data?.url) return;
    await navigator.clipboard.writeText(data.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={load}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-cyan-300 bg-white hover:bg-cyan-50 text-cyan-700 text-xs font-semibold whitespace-nowrap"
        title="Obtenir le lien d'accès de l'apprenant (à transmettre par vos propres moyens) + QR code"
      >
        <QrCode className="h-3.5 w-3.5" />
        Lien / QR
      </button>

      {open && (
        <div className="rounded-lg border border-cyan-200 bg-white p-2.5 w-56 shadow-sm space-y-2 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-bold text-cyan-700">
              Lien d&apos;accès apprenant
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {pending ? (
            <p className="text-[11px] text-zinc-500 inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Génération…
            </p>
          ) : error ? (
            <p className="text-[11px] text-red-600">{error}</p>
          ) : data ? (
            <>
              {data.qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.qrDataUrl}
                  alt="QR code accès apprenant"
                  className="mx-auto h-32 w-32"
                />
              )}
              <code className="block text-[10px] bg-zinc-50 border border-zinc-200 rounded p-1.5 break-all text-zinc-600">
                {data.url}
              </code>
              <button
                type="button"
                onClick={copy}
                className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-md bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-700"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copié
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copier le lien
                  </>
                )}
              </button>
              <p className="text-[10px] text-zinc-400">
                Transmettez ce lien à l&apos;apprenant par vos propres moyens.
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
