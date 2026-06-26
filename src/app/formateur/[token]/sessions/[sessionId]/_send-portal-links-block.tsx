"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { sendPortalLinkToLearners } from "./actions";

export type PortalLinkLearner = {
  enrollmentId: string;
  fullName: string;
  hasEmail: boolean;
  lastSentAt: string | null;
};

/**
 * Envoi groupé du lien d'accès apprenant (/mon-parcours + QR) depuis le
 * portail formateur (Gilles 2026-06-26). Sélection multiple + 1 email par
 * apprenant. Pensé mobile (cases à cocher larges).
 */
export function SendPortalLinksBlock({
  token,
  sessionId,
  learners,
}: {
  token: string;
  sessionId: string;
  learners: PortalLinkLearner[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const selectable = learners.filter((l) => l.hasEmail);
  const allSelected =
    selectable.length > 0 && selectable.every((l) => selected.has(l.enrollmentId));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(selectable.map((l) => l.enrollmentId)),
    );
  }

  function send() {
    setMsg(null);
    const ids = [...selected];
    if (ids.length === 0) {
      setMsg({ ok: false, text: "Sélectionnez au moins un apprenant." });
      return;
    }
    startTransition(async () => {
      const res = await sendPortalLinkToLearners(token, sessionId, ids);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error ?? "Échec de l'envoi." });
        return;
      }
      const parts = [`${res.sent} lien(s) envoyé(s)`];
      if (res.failed > 0) parts.push(`${res.failed} échec(s)`);
      setMsg({ ok: res.failed === 0, text: parts.join(" · ") + "." });
      setSelected(new Set());
      router.refresh();
    });
  }

  if (learners.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs font-semibold text-cyan-700 hover:underline"
        >
          {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={pending || selected.size === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700 disabled:opacity-60 min-h-[40px]"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Envoyer le lien ({selected.size})
        </button>
      </div>

      {msg && (
        <p
          className={`text-xs font-medium ${
            msg.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}

      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
        {learners.map((l) => (
          <li key={l.enrollmentId}>
            <label
              className={`flex items-center gap-3 px-3 py-2.5 ${
                l.hasEmail ? "cursor-pointer" : "opacity-60"
              }`}
            >
              <input
                type="checkbox"
                disabled={!l.hasEmail}
                checked={selected.has(l.enrollmentId)}
                onChange={() => toggle(l.enrollmentId)}
                className="h-5 w-5 rounded border-zinc-300 text-cyan-600"
              />
              <span className="flex-1 min-w-0">
                <span className="text-sm font-medium text-zinc-800 truncate block">
                  {l.fullName || "Apprenant"}
                </span>
                {!l.hasEmail ? (
                  <span className="text-[11px] text-amber-600">
                    Email manquant
                  </span>
                ) : l.lastSentAt ? (
                  <span className="text-[11px] text-emerald-600">
                    Envoyé le{" "}
                    {new Date(l.lastSentAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
