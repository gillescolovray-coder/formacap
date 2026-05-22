"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}: {
  enrollmentId: string;
  toEmail: string;
  subject: string;
  authUserEmail: string;
  formationTitle: string;
  dateRange: string;
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
      const body = `Bonjour,\n\nVous trouverez votre convocation à la formation « ${formationTitle} » ${dateRange} via le lien ci-dessous :\n\n${res.url}\n\nBien cordialement,`;
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
        title="Ouvre Gmail (compte pro) avec le lien de la convocation déjà inséré dans le body"
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
