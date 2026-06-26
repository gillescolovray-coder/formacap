"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { sendSupportLinkToLearner } from "./_support-actions";

/**
 * Bouton « Envoyer le support à l'apprenant » côté portail OF/prescripteur
 * (Gilles 2026-06-26). Envoie à l'apprenant le lien de son portail pour
 * télécharger les supports + trace l'envoi (preuve Qualiopi).
 */
export function SendSupportButton({
  token,
  sessionId,
  enrollmentId,
  hasEmail,
  lastSentAt,
}: {
  token: string;
  sessionId: string;
  enrollmentId: string;
  hasEmail: boolean;
  lastSentAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(lastSentAt);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await sendSupportLinkToLearner(token, sessionId, enrollmentId);
      if (res.ok) setDone(new Date().toISOString());
      else setError(res.error);
    });
  }

  const sentLabel = done
    ? `Envoyé le ${new Date(done).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })}`
    : null;

  if (!hasEmail) {
    return (
      <span className="text-[11px] text-zinc-400 italic" title="Aucun email sur la fiche apprenant">
        Email manquant
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-cyan-300 bg-white hover:bg-cyan-50 text-cyan-700 text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
        title="Envoyer à l'apprenant le lien de son portail pour télécharger les supports"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : done ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        {done ? "Renvoyer" : "Envoyer le support"}
      </button>
      {sentLabel && (
        <span className="text-[10px] text-emerald-600">{sentLabel}</span>
      )}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
