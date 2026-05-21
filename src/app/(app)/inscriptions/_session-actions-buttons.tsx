"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  cancelSessionWithReport,
  confirmSessionOpening,
} from "./_session-actions";

/**
 * Deux boutons « Confirmer l'ouverture » et « Annuler la session »
 * affichés sur l'en-tête de chaque session de la page Inscriptions.
 *
 * Cachés si la session est déjà confirmée (pour le bouton « Confirmer »)
 * ou annulée (pour les deux).
 */
export function SessionActionsButtons({
  sessionId,
  currentStatus,
}: {
  sessionId: string;
  currentStatus: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const alreadyConfirmed = currentStatus === "confirmed";
  const alreadyCancelled = currentStatus === "cancelled";

  function doConfirm() {
    if (alreadyConfirmed) return;
    if (
      !confirm(
        "Confirmer l'ouverture de cette session ?\n\nLe statut passera à « Confirmée » et un email de confirmation sera envoyé à tous les apprenants inscrits.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await confirmSessionOpening(sessionId);
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      alert(
        `Session confirmée ✓\n${res.emailsSent} email${res.emailsSent > 1 ? "s envoyés" : " envoyé"} aux apprenants.`,
      );
      router.refresh();
    });
  }

  function doCancel() {
    if (alreadyCancelled) return;
    const reason = prompt(
      "Annuler définitivement cette session ?\n\nTous les apprenants inscrits seront notifiés par email. S'il existe une prochaine session de la même formation, ils pourront demander un report.\n\nMotif (optionnel) :",
      "",
    );
    if (reason === null) return; // utilisateur a cliqué Annuler du prompt
    setError(null);
    startTransition(async () => {
      const res = await cancelSessionWithReport(sessionId, reason || undefined);
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      alert(
        `Session annulée ✓\n${res.emailsSent} email${res.emailsSent > 1 ? "s envoyés" : " envoyé"} aux apprenants${res.nextSessionId ? " (avec proposition de report sur la prochaine session)" : ""}.`,
      );
      router.refresh();
    });
  }

  return (
    <>
      {!alreadyConfirmed && !alreadyCancelled && (
        <button
          type="button"
          onClick={doConfirm}
          disabled={pending}
          title="Confirme l'ouverture de la session et notifie les apprenants par email"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Confirmer l&apos;ouverture
        </button>
      )}
      {!alreadyCancelled && (
        <button
          type="button"
          onClick={doCancel}
          disabled={pending}
          title="Annule la session et propose un report aux apprenants"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-rose-300 bg-white text-rose-700 text-xs font-bold hover:bg-rose-50 disabled:opacity-50 whitespace-nowrap"
        >
          <XCircle className="h-3.5 w-3.5" />
          Annuler la session
        </button>
      )}
      {error && (
        <span className="text-[11px] text-rose-600 font-medium">
          {error}
        </span>
      )}
    </>
  );
}
