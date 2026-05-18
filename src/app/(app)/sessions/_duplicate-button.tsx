"use client";

import { Copy } from "lucide-react";
import { duplicateSession } from "./actions";

type Props = {
  sessionId: string;
  sessionLabel?: string;
};

export function DuplicateSessionButton({ sessionId, sessionLabel }: Props) {
  const action = duplicateSession.bind(null, sessionId);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Dupliquer la session ${sessionLabel ? `« ${sessionLabel} »` : ""} ?\n\nUne nouvelle session sera créée en brouillon avec les mêmes dates et paramètres.`,
        );
        if (!ok) e.preventDefault();
      }}
    >
      <button
        type="submit"
        title="Dupliquer cette session"
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-zinc-500 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition-colors"
      >
        <Copy className="h-4 w-4" />
      </button>
    </form>
  );
}
