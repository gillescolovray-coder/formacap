"use client";

/**
 * Bouton « Confirmer l'inscription via Gmail » (Gilles 2026-05-22).
 *
 * Réservé aux apprenants inscrits via un OF partenaire — CAP NUMERIQUE
 * ne génère pas de convocation classique pour eux, mais envoie un email
 * de CONFIRMATION D'INSCRIPTION depuis la boîte Gmail perso, avec
 * promesse d'envoyer le lien de connexion 48h avant la session.
 *
 * Ouvre Gmail compose pré-rempli — pas de marquage BDD, l'envoi est
 * un acte manuel de Gilles.
 */

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bold, PROMO_BLOCK, signature } from "@/lib/email/_unicode-bold";
import { markPartnerConfirmationSent } from "./actions";

type Props = {
  sessionId: string;
  enrollmentId: string;
  toEmail: string;
  learnerCivility: string | null;
  learnerName: string;
  formationTitle: string;
  dateRange: string;
  authUserEmail: string;
  trainerPhone?: string | null;
  partnerOfName: string;
  /** Type du partenaire (Gilles 2026-05-22) — sert à formuler "via votre
   *  OF" ou "via votre prescripteur". Par défaut "of". */
  partnerType?: "of" | "prescripteur";
  /** Si déjà envoyé, on affiche un badge ✓ "Confirmé·e" avec date.
   *  Pris depuis inscription_requests.partner_confirmation_email_sent_at. */
  alreadySentAt?: string | null;
};

function buildSubject(formationTitle: string): string {
  return `CAP NUMÉRIQUE — Votre inscription est confirmée — ${formationTitle}`;
}

function buildBody({
  learnerCivility,
  learnerName,
  formationTitle,
  dateRange,
  trainerPhone,
  partnerOfName,
  partnerType,
}: {
  learnerCivility: string | null;
  learnerName: string;
  formationTitle: string;
  dateRange: string;
  trainerPhone?: string | null;
  partnerOfName: string;
  partnerType: "of" | "prescripteur";
}): string {
  const civilityPrefix =
    learnerCivility === "M." || learnerCivility === "Mme"
      ? `${learnerCivility} `
      : "";
  const partnerLabel =
    partnerType === "prescripteur" ? "prescripteur" : "OF partenaire";
  return `Bonjour ${civilityPrefix}${learnerName},

Vous avez été inscrit·e par votre ${partnerLabel} ${bold(partnerOfName)} à la formation ${bold(`« ${formationTitle} »`)} qui aura lieu ${bold(dateRange)}. Votre inscription est bien ${bold("confirmée")} ✅

📨 Vous recevrez ${bold("48 heures avant le démarrage de la session")} un second email contenant :
- Le lien de connexion à la classe virtuelle
- Les codes d'accès et instructions de connexion
- Le programme détaillé de la session

💡 Cet email partira depuis l'adresse ${bold("noreply@send.capnumerique.com")} — pensez à vérifier votre dossier « Courriers indésirables » si vous ne le voyez pas dans votre boîte de réception. Marquez l'expéditeur comme fiable pour ne rien manquer.

En cas de question, répondez simplement à cet email — je vous répondrai personnellement.

Au plaisir de vous accueillir,
${signature(trainerPhone)}

${PROMO_BLOCK}`;
}

export function ConfirmInscriptionGmailButton(props: Props) {
  const {
    sessionId,
    enrollmentId,
    toEmail,
    learnerCivility,
    learnerName,
    formationTitle,
    dateRange,
    authUserEmail,
    trainerPhone,
    partnerOfName,
    partnerType,
    alreadySentAt,
  } = props;

  const [pending, startTransition] = useTransition();
  const [doneLocal, setDoneLocal] = useState<string | null>(
    alreadySentAt ?? null,
  );

  const onClick = () => {
    const subject = buildSubject(formationTitle);
    const body = buildBody({
      learnerCivility,
      learnerName,
      formationTitle,
      dateRange,
      trainerPhone,
      partnerOfName,
      partnerType: partnerType ?? "of",
    });
    const authUserParam = authUserEmail
      ? `&authuser=${encodeURIComponent(authUserEmail)}`
      : "";
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${authUserParam}`;
    window.open(url, "_blank", "noopener,noreferrer");
    // Marque en BDD côté serveur (Gilles 2026-05-22 — migration 0100)
    startTransition(async () => {
      const res = await markPartnerConfirmationSent(sessionId, enrollmentId);
      if (res.ok) {
        setDoneLocal(new Date().toISOString());
      }
    });
  };

  // Si déjà envoyé : badge ✓ Confirmé·e + bouton "re-confirmer" discret
  if (doneLocal) {
    const dateLabel = (() => {
      try {
        return new Date(doneLocal).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "short",
        });
      } catch {
        return "";
      }
    })();
    return (
      <div
        className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900"
        title={`Email de confirmation envoyé via Gmail le ${new Date(doneLocal).toLocaleString("fr-FR")}`}
      >
        <CheckCircle2 className="h-3 w-3" />
        Confirmé·e {dateLabel}
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="ml-1 text-[10px] underline hover:text-emerald-900 dark:hover:text-emerald-300 disabled:opacity-50"
        >
          re-confirmer
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
      disabled={!toEmail || pending}
      title={
        toEmail
          ? `Confirmer l'inscription de ${learnerName} via Gmail (apprenant inscrit par ${partnerOfName})`
          : "Aucun email apprenant renseigné"
      }
      className="border-violet-300 text-violet-700 hover:bg-violet-50"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Mail className="h-3.5 w-3.5" />
      )}
      Confirmer via Gmail
    </Button>
  );
}
