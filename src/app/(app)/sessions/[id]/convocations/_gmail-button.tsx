"use client";

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Bouton « Gmail » qui :
 *   1. Ouvre le PDF de la convocation dans un nouvel onglet (=
 *      téléchargement spontané + visu)
 *   2. Ouvre Gmail compose dans un autre onglet, avec un body adapté
 *      qui explique de joindre le PDF téléchargé.
 *
 * Pourquoi 2 étapes : Gmail compose URL n'autorise PAS l'attachement
 * de fichier via paramètre (limitation officielle Google, sécurité).
 * Le workflow le plus simple pour l'utilisateur est donc :
 *   PDF dans un onglet → Glisser-déposer dans Gmail.
 *
 * Gilles 2026-05-22 : remplace l'ancien lien direct Gmail qui ouvrait
 * un compose vide ce qui faisait perdre la pièce jointe.
 */
export function GmailButton({
  printUrl,
  toEmail,
  subject,
  body,
  authUserEmail,
}: {
  printUrl: string;
  toEmail: string;
  subject: string;
  body: string;
  authUserEmail: string;
}) {
  const authUserParam = authUserEmail
    ? `&authuser=${encodeURIComponent(authUserEmail)}`
    : "";
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    toEmail,
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${authUserParam}`;

  const onClick = () => {
    // 1. Ouvre le PDF dans un nouvel onglet (= téléchargement spontané)
    window.open(printUrl, "_blank", "noopener,noreferrer");
    // 2. Ouvre Gmail compose après un petit délai pour ne pas être
    //    bloqué par le filtre popup (le 1er onglet est l'action user)
    setTimeout(() => {
      window.open(gmailUrl, "_blank", "noopener,noreferrer");
    }, 200);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      title="Ouvre le PDF dans un onglet ET Gmail dans un autre — il vous reste à glisser-déposer le PDF dans Gmail."
    >
      <Mail className="h-3.5 w-3.5" />
      Gmail
    </Button>
  );
}
