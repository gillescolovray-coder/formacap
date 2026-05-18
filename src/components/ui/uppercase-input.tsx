"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Input qui force la mise en MAJUSCULES des caractères tapés (avec
 * préservation des accents grâce à toLocaleUpperCase("fr-FR") :
 *   é → É, è → È, à → À, ç → Ç, ô → Ô, etc.).
 *
 * Utilisé pour :
 *   - les champs « Nom de famille » (apprenants, formateurs, contacts,
 *     prospects d'inscription)
 *   - le champ « Titre de la formation » dans le module Catalogue
 *
 * Comportement :
 *   - non contrôlé (defaultValue) : applique l'uppercase sur la valeur
 *     initiale puis pousse via une réf au DOM
 *   - contrôlé (value + onChange) : passe la valeur en uppercase au
 *     parent dans onChange
 */
type Props = Omit<React.ComponentProps<"input">, "ref"> & {
  /** className additionnelle, fusionnée avec celle du <Input> de base. */
  className?: string;
};

export function UpperCaseInput({
  defaultValue,
  value,
  onChange,
  className,
  ...rest
}: Props) {
  const upper = (raw: string) => raw.toLocaleUpperCase("fr-FR");

  // Mode contrôlé
  if (value !== undefined) {
    return (
      <Input
        {...rest}
        value={typeof value === "string" ? upper(value) : value}
        onChange={(e) => {
          // Réécrit la valeur en majuscule avant de la propager au parent
          e.target.value = upper(e.target.value);
          onChange?.(e);
        }}
        className={cn("uppercase", className)}
      />
    );
  }

  // Mode non contrôlé
  return (
    <Input
      {...rest}
      defaultValue={
        typeof defaultValue === "string" ? upper(defaultValue) : defaultValue
      }
      onChange={(e) => {
        e.target.value = upper(e.target.value);
        onChange?.(e);
      }}
      className={cn("uppercase", className)}
    />
  );
}
