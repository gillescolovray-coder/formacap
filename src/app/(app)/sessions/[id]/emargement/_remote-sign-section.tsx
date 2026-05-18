"use client";

import { useState, useTransition } from "react";
import { Loader2, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendSignatureLink } from "./actions";

type Learner = {
  enrollmentId: string;
  name: string;
  email: string | null;
};

export function RemoteSignSection({
  sessionId,
  learners,
  resendConfigured,
}: {
  sessionId: string;
  learners: Learner[];
  resendConfigured: boolean;
}) {
  if (learners.length === 0) return null;

  return (
    <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <MailCheck className="h-4 w-4 text-cyan-600" />
            Signature à distance par email
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Envoie à chaque apprenant un lien personnel pour signer
            sa feuille d&apos;émargement depuis son téléphone (lien
            valable 30 jours).
          </p>
        </div>
        {!resendConfigured && (
          <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded">
            Resend requis
          </span>
        )}
      </header>

      <ul className="space-y-1.5">
        {learners.map((l) => (
          <RemoteSignRow
            key={l.enrollmentId}
            sessionId={sessionId}
            learner={l}
            disabled={!resendConfigured}
          />
        ))}
      </ul>
    </section>
  );
}

function RemoteSignRow({
  sessionId,
  learner,
  disabled,
}: {
  sessionId: string;
  learner: Learner;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    msg: string;
    publicUrl?: string;
  } | null>(null);

  const onClick = () => {
    setResult(null);
    startTransition(async () => {
      const res = await sendSignatureLink(sessionId, learner.enrollmentId);
      if (res.ok) {
        setResult({
          ok: true,
          msg: "Lien envoyé.",
          publicUrl: res.publicUrl,
        });
      } else {
        setResult({
          ok: false,
          msg: res.error ?? "Erreur",
          publicUrl: res.publicUrl,
        });
      }
    });
  };

  const noEmail = !learner.email;

  return (
    <li className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950/40 text-sm">
      <span className="font-medium flex-1 min-w-0 truncate">{learner.name}</span>
      <span className="text-xs text-zinc-500 hidden sm:inline truncate max-w-[180px]">
        {learner.email ?? "Pas d'email"}
      </span>
      <Button
        type="button"
        size="sm"
        variant={result?.ok ? "outline" : "default"}
        onClick={onClick}
        disabled={disabled || noEmail || pending}
        title={
          noEmail
            ? "L'apprenant n'a pas d'email"
            : disabled
              ? "Resend non configuré"
              : "Envoyer le lien de signature"
        }
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        {result?.ok ? "Renvoyer" : "Envoyer le lien"}
      </Button>
      {result && (
        <span
          className={
            result.ok
              ? "text-[11px] text-emerald-700 dark:text-emerald-400"
              : "text-[11px] text-rose-700 dark:text-rose-400"
          }
          title={result.publicUrl ?? result.msg}
        >
          {result.ok ? "✓ envoyé" : `✗ ${truncate(result.msg, 40)}`}
        </span>
      )}
    </li>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
