"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { cancelConvention, ensureConvention, sendConvention } from "./actions";

/**
 * Bouton d'annulation d'une convention (signée, envoyée ou brouillon).
 * Demande confirmation puis supprime la convention en base. La société
 * redevient "Non créée" dans le tableau ; on peut alors recréer une
 * convention propre (utile en cas de correction d'orthographe ou
 * d'ajout d'un apprenant après coup).
 */
export function CancelConventionButton({
  sessionId,
  conventionId,
  isSigned,
}: {
  sessionId: string;
  conventionId: string;
  isSigned: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    const msg = isSigned
      ? "Cette convention est SIGNÉE. L'annulation supprime la convention et permet d'en recréer une nouvelle (utile pour corriger une faute ou ajouter un apprenant). Continuer ?"
      : "Annuler et supprimer cette convention ?";
    if (!confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelConvention(sessionId, conventionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Fix Gilles 2026-05-22 : sans router.refresh, le tableau gardait
      // l'ancien statut Brouillon (le revalidatePath côté serveur ne
      // suffisait pas à invalider le rendu côté client).
      router.refresh();
    });
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={pending}
        title="Annuler cette convention (la société redevient 'Non créée')"
        className="text-rose-600 border-rose-200 hover:bg-rose-50"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Annuler
      </Button>
      {error && (
        <div className="text-[11px] text-rose-700 max-w-xs text-left">
          {error}
        </div>
      )}
    </div>
  );
}

export function EnsureAndSendConventionButton({
  sessionId,
  companyId,
  conventionId,
  disabled,
  disabledReason,
  alreadySent,
}: {
  sessionId: string;
  companyId: string;
  conventionId: string | null;
  disabled?: boolean;
  disabledReason?: string;
  alreadySent?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const onClick = () => {
    setResult(null);
    startTransition(async () => {
      let id = conventionId;
      if (!id) {
        const created = await ensureConvention(sessionId, companyId);
        if (!created.ok) {
          setResult({ ok: false, msg: created.error });
          return;
        }
        id = created.conventionId;
      }
      const sent = await sendConvention(sessionId, id);
      if (sent.ok) {
        setResult({ ok: true, msg: "Envoyée." });
      } else {
        setResult({ ok: false, msg: sent.error });
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-end gap-1 max-w-md">
      <div className="inline-flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onClick}
          disabled={disabled || pending}
          title={disabledReason ?? "Envoyer la convention par email au RH"}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {alreadySent ? "Renvoyer" : "Créer & envoyer"}
        </Button>
        {result?.ok && (
          <span className="text-[11px] text-emerald-700">✓ Envoyée</span>
        )}
      </div>
      {result && !result.ok && (
        <div className="text-[11px] rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-rose-900 max-w-md text-left whitespace-pre-wrap break-words">
          <strong>Erreur :</strong>
          <br />
          {result.msg}
        </div>
      )}
    </div>
  );
}
