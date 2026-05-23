"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Champ mot de passe avec bouton œil pour afficher/masquer la saisie.
 * S'utilise comme <Input type="password" /> — props identiques.
 *
 * Le bouton œil est exclu du tab order (tabIndex=-1) pour ne pas casser
 * le flux clavier email → password → submit. type="button" pour ne pas
 * déclencher de submit du form.
 */
export function PasswordInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
