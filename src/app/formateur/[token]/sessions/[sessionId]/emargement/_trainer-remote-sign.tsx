"use client";

import { useState, useTransition } from "react";
import { Info, Loader2, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendSignatureLinkAsTrainer } from "../actions";

type Learner = {
  enrollmentId: string;
  name: string;
  email: string | null;
  partnerOfName?: string | null;
};

type Props = {
  token: string;
  sessionId: string;
  learners: Learner[];
  resendConfigured: boolean;
};

/**
 * Variante trainer de RemoteSignSection (admin).
 * Auth par token portail formateur.
 */
export function TrainerRemoteSignSection({
  token,
  sessionId,
  learners,
  resendConfigured,
}: Props) {
  if (learners.length === 0) return null;
  const hasPartnerOf = learners.some((l) => l.partnerOfName);

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

      {hasPartnerOf && (
        <div className="rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 p-2.5 flex items-start gap-2 text-xs">
          <Info className="h-3.5 w-3.5 text-violet-700 dark:text-violet-400 shrink-0 mt-0.5" />
          <p className="text-violet-900 dark:text-violet-200 leading-relaxed">
            <strong>Apprenants inscrits via un OF partenaire :</strong>{" "}
            l&apos;envoi du lien est désactivé — l&apos;OF gère la
            signature de son côté.
          </p>
        </div>
      )}

      <ul className="space-y-1.5">
        {learners.map((l) => (
          <Row
            key={l.enrollmentId}
            token={token}
            sessionId={sessionId}
            learner={l}
            disabled={!resendConfigured}
          />
        ))}
      </ul>
    </section>
  );
}

function Row({
  token,
  sessionId,
  learner,
  disabled,
}: {
  token: string;
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
      const res = await sendSignatureLinkAsTrainer(
        token,
        sessionId,
        learner.enrollmentId,
      );
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
  const isPartnerOf = Boolean(learner.partnerOfName);

  return (
    <li className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950/40 text-sm">
      <span className="font-medium flex-1 min-w-0 truncate flex items-center gap-1.5">
        {learner.name}
        {isPartnerOf && (
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-800 border border-violet-200"
            title={`Inscrit via ${learner.partnerOfName}.`}
          >
            via {learner.partnerOfName}
          </span>
        )}
      </span>
      <span className="text-xs text-zinc-500 hidden sm:inline truncate max-w-[180px]">
        {learner.email ?? "Pas d'email"}
      </span>
      <Button
        type="button"
        size="sm"
        variant={result?.ok ? "outline" : "default"}
        onClick={onClick}
        disabled={disabled || noEmail || pending || isPartnerOf}
        title={
          isPartnerOf
            ? `Apprenant inscrit via ${learner.partnerOfName} — sa signature est gérée par l'OF.`
            : noEmail
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
