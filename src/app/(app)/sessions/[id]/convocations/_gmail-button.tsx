"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bold, PROMO_BLOCK, signature } from "@/lib/email/_unicode-bold";
import { getConvocationPublicLink } from "./share-actions";

/**
 * Bouton « Gmail » (Option B Gilles 2026-05-22).
 *
 * Workflow :
 *   1. Au clic, récupère un lien public stable vers le PDF de la
 *      convocation (token portail apprenant, persistent).
 *   2. Ouvre Gmail compose dans un nouvel onglet, avec ce lien
 *      directement intégré dans le body du brouillon.
 *   3. Le destinataire reçoit l'email envoyé depuis le compte Gmail
 *      pro de l'utilisateur (délivrabilité parfaite, pas de spam) et
 *      clique sur le lien pour télécharger sa convocation.
 *
 * Contenu enrichi (Gilles 2026-05-22 v2) :
 *   - Salutation avec civilité + nom apprenant
 *   - Gras Unicode sur formation et dates
 *   - Signature complète CAP NUMÉRIQUE (téléphone, site, avis Google)
 *   - Bloc promo BTPBOX + Suivi Chantier
 *
 * Pourquoi pas une pièce jointe ? Gmail compose URL n'autorise PAS
 * d'attacher un fichier via params (limitation officielle Google).
 * On contourne avec un lien de téléchargement direct dans le corps.
 */
export function GmailButton({
  enrollmentId,
  toEmail,
  subject,
  authUserEmail,
  formationTitle,
  dateRange,
  learnerCivility,
  learnerName,
  trainerPhone,
}: {
  enrollmentId: string;
  toEmail: string;
  subject: string;
  authUserEmail: string;
  formationTitle: string;
  dateRange: string;
  /** Civilité de l'apprenant (M./Mme). Optionnel. */
  learnerCivility?: string | null;
  /** Nom complet de l'apprenant pour la salutation personnalisée. */
  learnerName?: string;
  /** Téléphone du dirigeant — optionnel (signature) */
  trainerPhone?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await getConvocationPublicLink(enrollmentId);
      if (!res.ok) {
        setError(res.error || "Impossible de générer le lien.");
        return;
      }
      const civilityPrefix =
        learnerCivility === "M." || learnerCivility === "Mme"
          ? `${learnerCivility} `
          : "";
      const greeting = learnerName
        ? `Bonjour ${civilityPrefix}${learnerName},`
        : "Bonjour,";
      const body = `${greeting}

Vous trouverez ci-dessous votre ${bold("convocation")} à la formation ${bold(`« ${formationTitle} »`)} qui aura lieu ${bold(dateRange)}.

📎 ${bold("Lien direct vers votre convocation")} (PDF) :
${res.url}

⚠️ Si le lien n'apparaît pas comme cliquable, copiez-collez-le dans la barre d'adresse de votre navigateur.

💡 Si l'email arrive en spam, marquez-le comme "Non spam" pour bien recevoir les prochains documents (programme, attestation, etc.).

En cas de question, répondez simplement à cet email — je vous répondrai personnellement.

Bien cordialement,
${signature(trainerPhone)}

${PROMO_BLOCK}`;
      const authUserParam = authUserEmail
        ? `&authuser=${encodeURIComponent(authUserEmail)}`
        : "";
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        toEmail,
      )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${authUserParam}`;
      window.open(gmailUrl, "_blank", "noopener,noreferrer");
    });
  };

  return (
    <div className="inline-flex flex-col items-stretch gap-0.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={pending}
        title="Ouvre Gmail (compte pro) avec le lien de la convocation et un email pré-rédigé"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Mail className="h-3.5 w-3.5" />
        )}
        Gmail
      </Button>
      {error && (
        <p className="text-[10px] text-rose-700">{error}</p>
      )}
    </div>
  );
}
