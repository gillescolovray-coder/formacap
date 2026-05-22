"use client";

/**
 * Bouton « Prévenir par Gmail » (anti-spam — Gilles 2026-05-22).
 *
 * Workflow :
 *   1. Au clic, ouvre Gmail compose (mail.google.com) dans un nouvel
 *      onglet, pré-rempli avec :
 *        - destinataire = email du contact RH
 *        - sujet et corps anti-spam
 *        - authuser = email du compte connecté Gilles (force compte pro)
 *   2. Marque en BDD la convention comme "pré-notifiée" (timestamp)
 *      → affiche une coche verte sur la ligne et masque le rappel.
 *
 * L'envoi effectif se fait dans Gmail (l'utilisateur clique "Envoyer").
 * On ne peut pas savoir si l'envoi est vraiment parti — on fait
 * confiance à l'utilisateur (le clic du bouton = engagement à envoyer).
 */

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bold, PROMO_BLOCK, signature } from "@/lib/email/_unicode-bold";
import { markConventionPreNotified } from "./actions";

type Props = {
  sessionId: string;
  conventionId: string;
  toEmail: string;
  contactName: string;
  formationTitle: string;
  dateRange: string;
  /** Email du compte Gmail connecté (pour le param authuser) */
  authUserEmail: string;
  /** Numéro de téléphone du dirigeant — optionnel (signature) */
  trainerPhone?: string | null;
  /** Si déjà pré-notifié, on affiche juste un état "✓ Prévenu" */
  alreadySent: boolean;
};

function buildSubject(formationTitle: string): string {
  return `CAP NUMÉRIQUE — Votre convention de formation arrive — merci de vérifier vos spams si besoin`;
}

function buildBody({
  contactName,
  formationTitle,
  dateRange,
  trainerPhone,
}: {
  contactName: string;
  formationTitle: string;
  dateRange: string;
  trainerPhone?: string | null;
}): string {
  return `Bonjour ${contactName},

Je vous informe que vous allez recevoir d'ici quelques minutes votre ${bold("convention de formation")} pour la formation ${bold(`« ${formationTitle} »`)} qui aura lieu ${bold(dateRange)}.

📧 L'email arrivera depuis l'adresse ${bold("noreply@send.capnumerique.com")} — c'est notre service d'envoi sécurisé. Il contient un lien direct pour signer électroniquement votre convention en quelques clics.

⚠️ Si vous ne le voyez pas dans votre boîte de réception d'ici 15 minutes :

1. Vérifiez votre dossier « Courriers indésirables » ou « Spam »
2. Si vous le trouvez là, merci de marquer l'expéditeur comme fiable :
   - Outlook : clic droit sur le mail → « Courrier indésirable » → « Ne jamais bloquer l'expéditeur »
   - Gmail : ouvrir le mail → bouton « Signaler comme non spam »

Cela évitera que vos prochains documents (convocation, attestation, etc.) finissent aussi en spam.

Si vous ne le recevez pas du tout, répondez simplement à cet email — je vous renverrai le lien directement.

Bien cordialement,
${signature(trainerPhone)}

${PROMO_BLOCK}`;
}

export function PreNotifyGmailButton(props: Props) {
  const {
    sessionId,
    conventionId,
    toEmail,
    contactName,
    formationTitle,
    dateRange,
    authUserEmail,
    trainerPhone,
    alreadySent,
  } = props;
  const [pending, startTransition] = useTransition();
  const [doneLocal, setDoneLocal] = useState(alreadySent);

  const onClick = () => {
    const subject = buildSubject(formationTitle);
    const body = buildBody({
      contactName,
      formationTitle,
      dateRange,
      trainerPhone,
    });
    const authUserParam = authUserEmail
      ? `&authuser=${encodeURIComponent(authUserEmail)}`
      : "";
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${authUserParam}`;
    window.open(url, "_blank", "noopener,noreferrer");
    // Marquage BDD en arrière-plan
    startTransition(async () => {
      await markConventionPreNotified(sessionId, conventionId);
      setDoneLocal(true);
    });
  };

  if (doneLocal) {
    return (
      <div
        className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900"
        title="Email de pré-notification envoyé via votre Gmail"
      >
        <CheckCircle2 className="h-3 w-3" />
        Prévenu·e
        <button
          type="button"
          onClick={onClick}
          className="ml-1 text-[10px] underline hover:text-emerald-900 dark:hover:text-emerald-300"
        >
          re-prévenir
        </button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending || !toEmail}
      title={
        toEmail
          ? "Ouvrir Gmail (compte pro) pour envoyer un mail de pré-notification anti-spam"
          : "Aucun email de contact défini"
      }
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Mail className="h-3.5 w-3.5" />
      )}
      Prévenir par Gmail
    </Button>
  );
}
