"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Bouton "Retour" qui ramène à la page précédente via l'historique
 * navigateur. À placer en haut des fiches détail pour permettre à
 * l'utilisateur de revenir d'où il vient (peu importe la page).
 *
 * Si l'utilisateur est arrivé directement sur la page (pas d'historique),
 * le bouton renvoie vers le `fallbackHref` fourni.
 */
export function BackButton({
  fallbackHref = "/dashboard",
  label = "Retour",
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        // history.length vaut au moins 1 même sans navigation préalable.
        // On tente router.back ; si ça ne fait rien (pas d'historique
        // exploitable au sein de l'app), on retombe sur le fallback.
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      title="Revenir à la page précédente"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
