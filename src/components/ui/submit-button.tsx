"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

/**
 * Bouton de soumission "intelligent" : detecte automatiquement la
 * soumission du form parent via React 19 useFormStatus, et :
 *   - desactive le bouton pendant la requete
 *   - affiche un spinner a la place / a cote du contenu
 *   - empeche le double-clic
 *
 * Gilles 2026-06-01 : pour ameliorer la perception de fluidite quand
 * l app est lente (boutons critiques qui creaient des doublons).
 *
 * Usage : remplacer <Button type="submit">...</Button> par
 * <SubmitButton>...</SubmitButton> dans tous les forms server actions.
 */
type SubmitButtonProps = React.ComponentProps<typeof Button> & {
  /** Texte affiche pendant la soumission. Si absent, on garde le children
   *  mais on prefixe avec un spinner. */
  pendingLabel?: string;
};

export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  className,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      {...props}
      type="submit"
      disabled={pending || disabled}
      className={cn(className, pending && "pointer-events-none")}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
