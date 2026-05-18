"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendAttestationEmail, sendBulkAttestations } from "./actions";

export function SendOneAttestation({
  sessionId,
  enrollmentId,
  disabled,
  alreadySent,
}: {
  sessionId: string;
  enrollmentId: string;
  disabled?: boolean;
  alreadySent?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  const onClick = () => {
    setResult(null);
    startTransition(async () => {
      const res = await sendAttestationEmail(sessionId, enrollmentId);
      if (res.ok) setResult({ ok: true, msg: "Envoyée." });
      else setResult({ ok: false, msg: res.error ?? "Erreur" });
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={onClick}
        disabled={disabled || pending}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        {alreadySent ? "Renvoyer" : "Envoyer"}
      </Button>
      {result && (
        <span
          className={
            result.ok
              ? "text-[11px] text-emerald-700"
              : "text-[11px] text-rose-700"
          }
          title={result.msg}
        >
          {result.ok ? "✓" : "✗ " + result.msg.slice(0, 40)}
        </span>
      )}
    </div>
  );
}

export function BulkSendAttestations({
  sessionId,
  pendingCount,
  disabled,
}: {
  sessionId: string;
  pendingCount: number;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<{
    sent: number;
    failed: number;
    skipped: number;
  } | null>(null);

  const onClick = () => {
    if (
      !confirm(
        `Envoyer ${pendingCount} attestation${pendingCount > 1 ? "s" : ""} par email aux apprenants ?`,
      )
    )
      return;
    setSummary(null);
    startTransition(async () => {
      const res = await sendBulkAttestations(sessionId);
      setSummary({
        sent: res.sent,
        failed: res.failed,
        skipped: res.skipped,
      });
    });
  };

  if (pendingCount === 0) {
    return (
      <Button variant="outline" disabled>
        <Users className="h-4 w-4" />
        Toutes envoyées
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center gap-3">
      <Button type="button" onClick={onClick} disabled={disabled || pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Users className="h-4 w-4" />
        )}
        {pending
          ? "Envoi en cours…"
          : `Envoyer les ${pendingCount} attestation${pendingCount > 1 ? "s" : ""}`}
      </Button>
      {summary && (
        <div className="text-xs">
          <span className="text-emerald-700 font-semibold">
            ✓ {summary.sent} envoyée{summary.sent > 1 ? "s" : ""}
          </span>
          {summary.failed > 0 && (
            <span className="ml-2 text-rose-700 font-semibold">
              ✗ {summary.failed} échec
            </span>
          )}
          {summary.skipped > 0 && (
            <span className="ml-2 text-zinc-500">
              · {summary.skipped} ignorée{summary.skipped > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
