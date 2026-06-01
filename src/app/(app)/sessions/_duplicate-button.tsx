"use client";

import { useState, useTransition } from "react";
import { Copy, Loader2 } from "lucide-react";
import { duplicateSession } from "./actions";

type Props = {
  sessionId: string;
  sessionLabel?: string;
};

/**
 * Bouton "Dupliquer la session" avec protection anti-double-clic
 * (Gilles 2026-06-01 : l app est parfois lente, l utilisateur clique
 * plusieurs fois en pensant que rien ne se passe, ce qui creait des
 * sessions en double).
 *
 * Protection : useTransition + disabled={pending} + spinner visuel +
 * cooldown 3s apres action pour eviter les clics repetes.
 */
export function DuplicateSessionButton({ sessionId, sessionLabel }: Props) {
  const [pending, startTransition] = useTransition();
  const [cooldown, setCooldown] = useState(false);
  const disabled = pending || cooldown;

  function handleClick() {
    if (disabled) return;
    const ok = window.confirm(
      `Dupliquer la session ${sessionLabel ? `« ${sessionLabel} »` : ""} ?\n\nUne nouvelle session sera créée en brouillon avec les mêmes dates et paramètres.`,
    );
    if (!ok) return;
    setCooldown(true);
    startTransition(async () => {
      try {
        await duplicateSession(sessionId);
      } finally {
        // Cooldown 3s apres pour eviter une rafale de clics meme apres
        // que l action soit terminee (le user attend la redirection).
        setTimeout(() => setCooldown(false), 3000);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={
        disabled ? "Duplication en cours…" : "Dupliquer cette session"
      }
      className={
        disabled
          ? "inline-flex items-center justify-center h-7 w-7 rounded-md text-zinc-300 cursor-not-allowed"
          : "inline-flex items-center justify-center h-7 w-7 rounded-md text-zinc-500 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition-colors"
      }
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}
