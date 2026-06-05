"use client";

import { useState, useTransition } from "react";
import { Eye, Loader2 } from "lucide-react";
import { getConvocationLinkFromPortal } from "./actions";

/**
 * Icône œil sur la liste des participants (portail formateur) : ouvre la
 * convocation de l'apprenant dans un nouvel onglet (Gilles 2026-06-05).
 * On ouvre l'onglet de façon SYNCHRONE au clic (sinon bloqué par le
 * navigateur après l'await), puis on le dirige vers l'URL signée.
 */
export function ViewConvocationButton({
  token,
  sessionId,
  enrollmentId,
}: {
  token: string;
  sessionId: string;
  enrollmentId: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);

  function open() {
    setErr(false);
    const win = window.open("", "_blank", "noopener");
    start(async () => {
      const res = await getConvocationLinkFromPortal(
        token,
        sessionId,
        enrollmentId,
      );
      if ("url" in res) {
        if (win) win.location.href = res.url;
      } else {
        win?.close();
        setErr(true);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      title={err ? "Convocation indisponible" : "Voir la convocation"}
      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-blue-700 hover:text-blue-900 hover:bg-blue-50 border border-blue-200 bg-white disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Eye className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
