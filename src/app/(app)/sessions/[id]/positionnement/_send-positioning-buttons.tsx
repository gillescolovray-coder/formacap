"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Users } from "lucide-react";
import {
  sendPositioningTest,
  sendPositioningToAllPending,
} from "./actions";

/** Bouton par apprenant : Envoyer / Renvoyer le test de positionnement. */
export function SendPositioningButton({
  sessionId,
  enrollmentId,
  hasEmail,
  alreadySent,
}: {
  sessionId: string;
  enrollmentId: string;
  hasEmail: boolean;
  alreadySent: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!hasEmail) {
    return (
      <span
        className="text-[10px] text-zinc-400 italic"
        title="Aucun email : utilisez le QR sur place / la garde à l'émargement."
      >
        pas d&apos;email
      </span>
    );
  }

  function go() {
    setMsg(null);
    start(async () => {
      const res = await sendPositioningTest(sessionId, enrollmentId);
      if (res.ok) {
        setMsg("Envoyé ✓");
        router.refresh();
      } else {
        setMsg(res.error ?? "Erreur");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-cyan-300 bg-cyan-50 text-cyan-700 text-[11px] font-semibold hover:bg-cyan-100 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Send className="h-3 w-3" />
        )}
        {alreadySent ? "Renvoyer" : "Envoyer"}
      </button>
      {msg && <span className="text-[10px] text-zinc-500">{msg}</span>}
    </span>
  );
}

/** Bouton global : envoyer à tous les inscrits en attente (avec email). */
export function SendPositioningAllButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function go() {
    if (
      !confirm(
        "Envoyer le test de positionnement à tous les inscrits en attente (qui ont un email) ?",
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const res = await sendPositioningToAllPending(sessionId);
      if (res.ok) {
        const parts = [`${res.sent ?? 0} envoyé(s)`];
        if (res.skippedNoEmail) parts.push(`${res.skippedNoEmail} sans email`);
        if (res.failed) parts.push(`${res.failed} échec(s)`);
        setMsg(parts.join(" · "));
        router.refresh();
      } else {
        setMsg(res.error ?? "Erreur");
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Users className="h-4 w-4" />
        )}
        Envoyer aux apprenants en attente
      </button>
      {msg && <span className="text-xs text-zinc-600">{msg}</span>}
    </div>
  );
}
