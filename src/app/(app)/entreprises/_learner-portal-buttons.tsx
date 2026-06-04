"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Mail } from "lucide-react";
import { sendLearnerPortalLink } from "./learner-portal-actions";

/**
 * 2 boutons icone affiches a droite de la ligne contact "Apprenant" :
 * - 🎓 Ouvrir le portail apprenant (nouvel onglet)
 * - ✉️ Envoyer le lien d acces par email (avec QR code)
 *
 * Gilles 2026-06-04.
 */
export function LearnerPortalButtons({
  learnerId,
  hasEmail,
}: {
  learnerId: string;
  hasEmail: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  function handleEmail(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!hasEmail) {
      setFeedback({
        type: "error",
        msg: "Aucun email renseigné pour cet apprenant. Modifiez sa fiche apprenant.",
      });
      setTimeout(() => setFeedback(null), 5000);
      return;
    }
    const ok = window.confirm(
      "Envoyer le lien d'accès au portail apprenant par email ?",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await sendLearnerPortalLink(learnerId);
      if (res.ok) {
        setFeedback({
          type: "success",
          msg: `Email envoyé à ${res.recipient}`,
        });
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setFeedback({ type: "error", msg: `Erreur : ${res.error}` });
        setTimeout(() => setFeedback(null), 7000);
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-end gap-1 shrink-0">
      <div className="inline-flex items-center gap-1">
        <a
          href={`/api/admin/learners/${learnerId}/portal-redirect`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-cyan-700 hover:text-cyan-900 hover:bg-cyan-50 border border-cyan-200 bg-white"
          title="Ouvrir le portail apprenant dans un nouvel onglet"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={handleEmail}
          disabled={pending}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 border border-emerald-200 bg-white disabled:opacity-50"
          title={
            hasEmail
              ? "Envoyer le lien d'accès au portail par email (avec QR code)"
              : "Aucun email renseigné pour cet apprenant"
          }
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Mail className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {feedback && (
        <div
          className={
            feedback.type === "success"
              ? "text-[10px] px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 max-w-[280px] text-right"
              : "text-[10px] px-2 py-1 rounded bg-rose-50 border border-rose-200 text-rose-800 max-w-[280px] text-right"
          }
        >
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
