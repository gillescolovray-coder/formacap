"use client";

/**
 * Bouton « Prévenir tout le monde par Gmail » (Gilles 2026-05-22).
 *
 * Ouvre Gmail compose avec :
 *   - Les destinataires en CCI (Bcc) — préserve la confidentialité
 *     inter-entreprises (chaque contact ne voit pas les autres)
 *   - Sujet + corps anti-spam adaptés (1 seul mail pour tous)
 *
 * Marque toutes les conventions concernées comme pré-notifiées.
 */

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markConventionsPreNotified } from "./actions";

type Recipient = {
  conventionId: string;
  email: string;
  contactName: string;
};

type Props = {
  sessionId: string;
  recipients: Recipient[];
  formationTitle: string;
  dateRange: string;
  authUserEmail: string;
  trainerPhone?: string | null;
};

function buildSubject(formationTitle: string): string {
  return `Vos conventions de formation arrivent — merci de vérifier vos spams si besoin`;
}

function buildBody({
  formationTitle,
  dateRange,
  trainerPhone,
}: {
  formationTitle: string;
  dateRange: string;
  trainerPhone?: string | null;
}): string {
  const phoneLine = trainerPhone ? `\n📞 ${trainerPhone}` : "";
  return `Bonjour,

Je vous informe que vous allez recevoir d'ici quelques minutes votre convention de formation pour la formation « ${formationTitle} » (${dateRange}).

📧 L'email arrivera depuis l'adresse noreply@send.capnumerique.com — c'est notre service d'envoi sécurisé. Il contient un lien direct pour signer électroniquement votre convention en quelques clics.

⚠️ Si vous ne le voyez pas dans votre boîte de réception d'ici 15 minutes :

1. Vérifiez votre dossier « Courriers indésirables » ou « Spam »
2. Si vous le trouvez là, merci de marquer l'expéditeur comme fiable :
   - Outlook : clic droit sur le mail → « Courrier indésirable » → « Ne jamais bloquer l'expéditeur »
   - Gmail : ouvrir le mail → bouton « Signaler comme non spam »

Cela évitera que vos prochains documents (convocation, attestation, etc.) finissent aussi en spam.

Si vous ne le recevez pas du tout, répondez simplement à cet email — je vous renverrai le lien directement.

Bien cordialement,
Gilles Colovray
Dirigeant — CAP NUMÉRIQUE
Organisme de formation Qualiopi${phoneLine}
✉️ gilles.colovray@capnumerique.com`;
}

export function BulkPreNotifyGmailButton(props: Props) {
  const {
    sessionId,
    recipients,
    formationTitle,
    dateRange,
    authUserEmail,
    trainerPhone,
  } = props;
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  const validRecipients = recipients.filter((r) => Boolean(r.email));
  if (validRecipients.length === 0) return null;

  const onClick = () => {
    const bccList = validRecipients.map((r) => r.email).join(",");
    const subject = buildSubject(formationTitle);
    const body = buildBody({ formationTitle, dateRange, trainerPhone });
    const authUserParam = authUserEmail
      ? `&authuser=${encodeURIComponent(authUserEmail)}`
      : "";
    // BCC pour préserver la confidentialité, et 'to' rempli avec l'email
    // de l'admin pour respecter les exigences de Gmail (champ to requis).
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(authUserEmail)}&bcc=${encodeURIComponent(bccList)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${authUserParam}`;
    window.open(url, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      await markConventionsPreNotified(
        sessionId,
        validRecipients.map((r) => r.conventionId),
      );
      setConfirmed(true);
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      title={`Ouvre Gmail avec un email anti-spam pré-rempli à destination des ${validRecipients.length} contact(s) (en CCI pour préserver la confidentialité)`}
      className="border-cyan-300 text-cyan-700 hover:bg-cyan-50"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : confirmed ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <Mail className="h-3.5 w-3.5" />
      )}
      Prévenir tous par Gmail
      <span className="ml-1 text-[10px] font-normal text-cyan-600 bg-cyan-100 px-1.5 py-0.5 rounded">
        {validRecipients.length}
      </span>
    </Button>
  );
}
