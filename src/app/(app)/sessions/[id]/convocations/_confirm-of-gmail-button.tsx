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

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bold, PROMO_BLOCK, signature } from "@/lib/email/_unicode-bold";

type Props = {
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
    toEmail,
    learnerCivility,
    learnerName,
    formationTitle,
    dateRange,
    authUserEmail,
    trainerPhone,
    partnerOfName,
    partnerType,
  } = props;

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
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={!toEmail}
      title={
        toEmail
          ? `Confirmer l'inscription de ${learnerName} via Gmail (apprenant inscrit par ${partnerOfName})`
          : "Aucun email apprenant renseigné"
      }
      className="border-violet-300 text-violet-700 hover:bg-violet-50"
    >
      <Mail className="h-3.5 w-3.5" />
      Confirmer via Gmail
    </Button>
  );
}
