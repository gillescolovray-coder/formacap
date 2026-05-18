"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendBulkEnrollmentNotifications } from "@/lib/email/enrollment-notifications";

export function NotifyInscriptionsButton({
  sessionId,
  disabled,
}: {
  sessionId: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<{
    apprenantSent: number;
    rhSent: number;
    failed: number;
  } | null>(null);
  const [crashError, setCrashError] = useState<string | null>(null);

  const onClick = () => {
    if (
      !confirm(
        "Envoyer les emails de confirmation d'inscription à TOUS les apprenants + leurs RH (non encore notifiés) ?",
      )
    )
      return;
    setSummary(null);
    setCrashError(null);
    startTransition(async () => {
      try {
        const res = await sendBulkEnrollmentNotifications(sessionId);
        setSummary({
          apprenantSent: res.apprenantSent,
          rhSent: res.rhSent,
          failed: res.failed,
        });
      } catch (e) {
        // Capture toute exception côté serveur pour la rendre visible
        const msg = e instanceof Error ? e.message : String(e);
        setCrashError(msg);
        console.error("[NotifyInscriptionsButton] crash:", e);
      }
    });
  };

  return (
    <div className="inline-flex items-center gap-3">
      <Button type="button" onClick={onClick} disabled={pending || disabled}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
        Notifier les inscriptions par email
      </Button>
      {summary && (
        <div className="text-xs">
          <span className="text-emerald-700 font-semibold">
            ✓ {summary.apprenantSent} apprenant
            {summary.apprenantSent > 1 ? "s" : ""}
          </span>
          {" · "}
          <span className="text-emerald-700 font-semibold">
            ✓ {summary.rhSent} RH
          </span>
          {summary.failed > 0 && (
            <span className="ml-2 text-rose-700">
              ✗ {summary.failed} échec
            </span>
          )}
        </div>
      )}
      {crashError && (
        <div className="max-w-md text-xs rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-rose-900">
          <strong>Erreur côté serveur :</strong>
          <pre className="whitespace-pre-wrap break-words mt-1 text-[10px] font-mono">
            {crashError}
          </pre>
        </div>
      )}
    </div>
  );
}
