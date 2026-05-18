"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendBulkConvocations, sendConvocationEmail } from "./actions";

/**
 * Bouton d'envoi pour une convocation individuelle. Affiche un état
 * "Envoi en cours…" puis un message succès / erreur.
 */
export function SendOneButton({
  sessionId,
  enrollmentId,
  disabled = false,
  disabledReason,
}: {
  sessionId: string;
  enrollmentId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  const onClick = () => {
    setResult(null);
    startTransition(async () => {
      const res = await sendConvocationEmail(sessionId, enrollmentId);
      if (res.ok) setResult({ ok: true, msg: "Convocation envoyée." });
      else setResult({ ok: false, msg: res.error ?? "Erreur." });
    });
  };

  if (disabled) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        title={disabledReason ?? "Indisponible"}
      >
        <Send className="h-3.5 w-3.5" />
        Envoyer
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={onClick}
        disabled={pending}
        title="Envoyer la convocation par email avec PDF en pièce jointe"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        Envoyer
      </Button>
      {result && (
        <span
          className={
            result.ok
              ? "text-[11px] text-emerald-700 dark:text-emerald-400"
              : "text-[11px] text-rose-700 dark:text-rose-400"
          }
          title={result.msg}
        >
          {result.ok ? "✓ Envoyée" : "✗ " + truncate(result.msg, 60)}
        </span>
      )}
    </div>
  );
}

/**
 * Bouton d'envoi groupé : envoie toutes les convocations non encore envoyées
 * de la session. Affiche un récap après exécution.
 */
export function BulkSendButton({
  sessionId,
  pendingCount,
  resendConfigured,
}: {
  sessionId: string;
  pendingCount: number;
  resendConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<{
    sent: number;
    failed: number;
    skipped: number;
    errors: Array<{ name: string; reason: string }>;
  } | null>(null);

  const onClick = () => {
    if (
      !confirm(
        `Envoyer ${pendingCount} convocation${pendingCount > 1 ? "s" : ""} par email maintenant ?`,
      )
    )
      return;
    setSummary(null);
    startTransition(async () => {
      const res = await sendBulkConvocations(sessionId);
      setSummary({
        sent: res.sent,
        failed: res.failed,
        skipped: res.skipped,
        errors: res.errors,
      });
    });
  };

  if (!resendConfigured) {
    return (
      <Button
        size="default"
        variant="outline"
        disabled
        title="Configurez Resend pour activer l'envoi automatique."
      >
        <Users className="h-4 w-4" />
        Envoi groupé indisponible
      </Button>
    );
  }

  if (pendingCount === 0) {
    return (
      <Button size="default" variant="outline" disabled>
        <Users className="h-4 w-4" />
        Toutes envoyées
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center gap-3">
      <Button type="button" onClick={onClick} disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Users className="h-4 w-4" />
        )}
        {pending
          ? "Envoi en cours…"
          : `Envoyer les ${pendingCount} convocation${pendingCount > 1 ? "s" : ""}`}
      </Button>
      {summary && (
        <div className="text-xs">
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
            ✓ {summary.sent} envoyée{summary.sent > 1 ? "s" : ""}
          </span>
          {summary.failed > 0 && (
            <span className="ml-2 text-rose-700 dark:text-rose-400 font-semibold">
              ✗ {summary.failed} échec{summary.failed > 1 ? "s" : ""}
            </span>
          )}
          {summary.skipped > 0 && (
            <span className="ml-2 text-zinc-500">
              · {summary.skipped} ignorée{summary.skipped > 1 ? "s" : ""}
            </span>
          )}
          {summary.errors.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-rose-700 dark:text-rose-400">
                Voir les erreurs
              </summary>
              <ul className="mt-1 ml-4 list-disc text-zinc-600 dark:text-zinc-400">
                {summary.errors.map((e, i) => (
                  <li key={i}>
                    <strong>{e.name}</strong> : {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
