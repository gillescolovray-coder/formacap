"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Variante Textarea du pattern UpperCaseInput. Auto-grow grâce à
 * `field-sizing-content` côté Textarea — pratique pour les titres
 * longs qu'on ne veut pas voir tronqués (Gilles 2026-05-24).
 *
 * Empêche le retour à la ligne via touche Entrée (sinon le champ
 * deviendrait multi-ligne par erreur de frappe alors que le contenu
 * stocké côté DB est un text simple). Le copier-coller multi-ligne
 * est aplati en une seule ligne.
 */
type Props = Omit<React.ComponentProps<"textarea">, "ref"> & {
  className?: string;
};

export function UpperCaseTextarea({
  defaultValue,
  value,
  onChange,
  onKeyDown,
  className,
  rows = 1,
  ...rest
}: Props) {
  const upper = (raw: string) =>
    raw.replace(/[\r\n]+/g, " ").toLocaleUpperCase("fr-FR");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
    }
    onKeyDown?.(e);
  };

  if (value !== undefined) {
    return (
      <Textarea
        {...rest}
        rows={rows}
        value={typeof value === "string" ? upper(value) : value}
        onChange={(e) => {
          e.target.value = upper(e.target.value);
          onChange?.(e);
        }}
        onKeyDown={handleKeyDown}
        className={cn("uppercase resize-none min-h-9 leading-tight", className)}
      />
    );
  }

  return (
    <Textarea
      {...rest}
      rows={rows}
      defaultValue={
        typeof defaultValue === "string" ? upper(defaultValue) : defaultValue
      }
      onChange={(e) => {
        e.target.value = upper(e.target.value);
        onChange?.(e);
      }}
      onKeyDown={handleKeyDown}
      className={cn("uppercase resize-none min-h-9 leading-tight", className)}
    />
  );
}
