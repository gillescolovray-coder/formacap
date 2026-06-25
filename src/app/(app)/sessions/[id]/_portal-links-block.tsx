"use client";

import { useState } from "react";
import { Send, Smartphone } from "lucide-react";
import { sendLearnerPortalLinkBulk } from "@/app/(app)/entreprises/learner-portal-actions";

export type PortalLinkLearner = {
  id: string;
  name: string;
  email: string | null;
  sentAt: string | null;
  sentCount: number;
};

/**
 * Bloc « Liens portail apprenant » (Gilles 2026-06-25) : sélection multiple
 * + envoi groupé du lien d'accès au portail. Pensé tactile (mobile/tablette).
 * Pré-coche par défaut les apprenants AVEC email JAMAIS sollicités.
 */
export function PortalLinksBlock({
  sessionId,
  learners,
}: {
  sessionId: string;
  learners: PortalLinkLearner[];
}) {
  const sendable = learners.filter((l) => l.email);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(sendable.filter((l) => !l.sentAt).map((l) => l.id)),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(sendable.map((l) => l.id)));
  }
  function selectNone() {
    setSelected(new Set());
  }

  const selectedCount = sendable.filter((l) => selected.has(l.id)).length;

  if (learners.length === 0) return null;

  return (
    <details className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-cyan-600" />
        Liens portail apprenant — envoi groupé
        <span className="text-xs font-normal text-zinc-500">
          ({sendable.filter((l) => !l.sentAt).length} jamais envoyé
          {sendable.filter((l) => !l.sentAt).length > 1 ? "s" : ""})
        </span>
      </summary>

      <form action={sendLearnerPortalLinkBulk} className="border-t border-zinc-200 dark:border-zinc-800">
        <input type="hidden" name="sessionId" value={sessionId} />

        <div className="flex items-center gap-3 px-4 py-2 bg-zinc-50 dark:bg-zinc-950 text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="font-semibold text-cyan-700 hover:underline"
          >
            Tout sélectionner
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="font-semibold text-zinc-500 hover:underline"
          >
            Aucun
          </button>
        </div>

        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {learners.map((l) => {
            const noEmail = !l.email;
            return (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  name="learnerId"
                  value={l.id}
                  disabled={noEmail}
                  checked={!noEmail && selected.has(l.id)}
                  onChange={() => toggle(l.id)}
                  className="h-5 w-5 rounded border-zinc-300 text-cyan-600 disabled:opacity-40 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                    {l.name}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {l.email ?? "Pas d'email — envoi impossible"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {l.sentAt ? (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium whitespace-nowrap">
                      📧 Envoyé le{" "}
                      {new Date(l.sentAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                      {l.sentCount > 1 ? ` (${l.sentCount}×)` : ""}
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400 whitespace-nowrap">
                      Jamais envoyé
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="submit"
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
            Envoyer le lien portail ({selectedCount})
          </button>
        </div>
      </form>
    </details>
  );
}
