"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquare, Send, Trash2, X } from "lucide-react";
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
  // Mini-popover de saisie d un message personnalise avant envoi
  // (Gilles 2026-06-02). Permet de signaler une correction, demander
  // une re-signature, etc.
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState("");

  const doSend = (msg: string) => {
    setResult(null);
    setPopoverOpen(false);
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
      const sent = await sendConvention(sessionId, id, msg || undefined);
      if (sent.ok) {
        setResult({ ok: true, msg: "Envoyée." });
        setCustomMessage("");
      } else {
        setResult({ ok: false, msg: sent.error });
      }
    });
  };

  return (
    <div className="relative inline-flex flex-col items-end gap-1 max-w-md">
      <div className="inline-flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => setPopoverOpen((v) => !v)}
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

      {/* Popover : message personnalise optionnel */}
      {popoverOpen && !pending && (
        <>
          {/* Overlay pour fermer en cliquant a cote */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setPopoverOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full mt-1 z-40 w-[380px] rounded-lg border border-zinc-200 bg-white shadow-xl p-3 text-left">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700">
                <MessageSquare className="h-3.5 w-3.5 text-amber-600" />
                Message personnalisé (optionnel)
              </div>
              <button
                type="button"
                onClick={() => setPopoverOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 p-0.5"
                title="Fermer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">
              Ajoutez un message qui apparaîtra en haut de l&apos;email
              (encadré ambre). Cliquez sur un modèle pour le charger,
              modifiez si besoin, puis Envoyez.
            </p>

            {/* Boutons modeles rapides — Gilles 2026-06-02 : pour ne pas
                avoir a retaper le message a chaque fois. Le texte est
                charge dans le textarea et reste editable. */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button
                type="button"
                onClick={() =>
                  setCustomMessage(
                    "Bonjour,\n\nSuite à votre signalement, voici la convention corrigée avec le bon représentant légal.\n\nMerci de détruire la version précédente et de signer uniquement cette nouvelle version.\n\nCordialement,",
                  )
                }
                className="text-[10px] px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 font-medium"
                title="Charger un modèle de correction de convention"
              >
                ✏️ Correction convention
              </button>
              <button
                type="button"
                onClick={() =>
                  setCustomMessage(
                    "Bonjour,\n\nMerci de me communiquer le nom et la fonction du nouveau dirigeant afin que je puisse corriger la convention avant signature.\n\nCordialement,",
                  )
                }
                className="text-[10px] px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 font-medium"
                title="Charger un modèle de demande d'info"
              >
                ❓ Demande d&apos;info représentant
              </button>
              <button
                type="button"
                onClick={() =>
                  setCustomMessage(
                    "Bonjour,\n\nVeuillez trouver ci-joint la convention de formation mise à jour.\n\nCordialement,",
                  )
                }
                className="text-[10px] px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 font-medium"
                title="Charger un modèle générique"
              >
                📄 Mise à jour
              </button>
              {customMessage && (
                <button
                  type="button"
                  onClick={() => setCustomMessage("")}
                  className="text-[10px] px-2 py-1 rounded border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 font-medium"
                  title="Effacer le message"
                >
                  ✕ Effacer
                </button>
              )}
            </div>

            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Tapez votre message ou cliquez sur un modèle ci-dessus…"
              rows={6}
              className="w-full text-xs px-2 py-1.5 rounded-md border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 resize-y"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-400">
                {customMessage
                  ? `${customMessage.length} caractères`
                  : "Laisser vide pour envoyer sans message"}
              </span>
              <Button
                type="button"
                size="sm"
                onClick={() => doSend(customMessage.trim())}
              >
                <Send className="h-3.5 w-3.5" />
                Envoyer
              </Button>
            </div>
          </div>
        </>
      )}

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
