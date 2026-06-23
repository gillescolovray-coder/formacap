"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, Send, AlertCircle } from "lucide-react";
import { sendGoogleReviewRequests } from "./actions";

export type ReviewEligible = {
  enrollmentId: string;
  name: string;
  email: string | null;
};

/**
 * Panneau « Demande d'avis Google » sur l'onglet Évaluation (Gilles 2026-06-23).
 * Liste les apprenants « Très satisfait » NON encore sollicités, avec
 * sélection (tout coché par défaut) + bouton d'envoi. Envoi manuel.
 */
export function GoogleReviewPanel({
  sessionId,
  reviewConfigured,
  eligible,
}: {
  sessionId: string;
  reviewConfigured: boolean;
  eligible: ReviewEligible[];
}) {
  const sendable = eligible.filter((e) => e.email);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(sendable.map((e) => e.enrollmentId)),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCount = sendable.filter((e) =>
    selected.has(e.enrollmentId),
  ).length;

  if (!reviewConfigured) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          Pour envoyer des demandes d&apos;avis Google, renseignez votre{" "}
          <strong>lien d&apos;avis Google</strong> dans{" "}
          <Link
            href="/parametres/organisation"
            className="underline font-semibold"
          >
            Paramètres &gt; Organisation
          </Link>
          .
        </div>
      </div>
    );
  }

  if (eligible.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-zinc-200 p-4 text-sm text-zinc-500 flex items-center gap-2">
        <Star className="h-4 w-4 text-zinc-300" />
        Aucun apprenant « Très satisfait » en attente de sollicitation (déjà
        sollicités ou pas encore évalués).
      </div>
    );
  }

  return (
    <form
      action={sendGoogleReviewRequests}
      className="rounded-xl bg-white border border-emerald-200 p-4 space-y-3"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
          <Star className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-zinc-900">
            Demande d&apos;avis Google
          </h3>
          <p className="text-[11px] text-zinc-500">
            Apprenants « Très satisfait » non encore sollicités. Cochez puis
            envoyez.
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {eligible.map((e) => {
          const noEmail = !e.email;
          return (
            <li
              key={e.enrollmentId}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                name="enrollmentId"
                value={e.enrollmentId}
                disabled={noEmail}
                checked={!noEmail && selected.has(e.enrollmentId)}
                onChange={() => toggle(e.enrollmentId)}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 disabled:opacity-40"
              />
              <span className={noEmail ? "text-zinc-400" : "text-zinc-800"}>
                {e.name}
              </span>
              {noEmail ? (
                <span className="text-[10px] text-rose-500 italic">
                  (pas d&apos;email — envoi impossible)
                </span>
              ) : (
                <span className="text-[11px] text-zinc-400">{e.email}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={selectedCount === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
          Envoyer la demande ({selectedCount})
        </button>
      </div>
    </form>
  );
}
