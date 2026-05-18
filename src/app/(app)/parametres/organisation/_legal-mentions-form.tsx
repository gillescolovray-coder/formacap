"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/rich-text-editor";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  initialHtml: string;
};

export function LegalMentionsForm({ action, initialHtml }: Props) {
  // On garde le HTML dans un state local puis on le pousse dans un
  // <input type="hidden"> qui sera lu par la server action au submit.
  const [html, setHtml] = useState<string>(initialHtml);

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="legal_mentions_editor">
          Texte des mentions légales
        </Label>
        <RichTextEditor
          value={html}
          onChange={setHtml}
          minHeight={200}
          placeholder="CAP NUMÉRIQUE — SARL au capital de … € · SIRET 123 456 789 00012 · NDA 11 75 12345 75…"
        />
        {/* Valeur réellement envoyée au serveur */}
        <input type="hidden" name="legal_mentions" value={html} />
        <p className="text-xs text-zinc-500">
          Astuce : sélectionne du texte puis utilise les boutons de la barre
          pour mettre en gras, italique, souligné, changer la couleur,
          centrer, etc.
        </p>
      </div>
      <Button type="submit">
        <FileText className="h-4 w-4" />
        Enregistrer les mentions légales
      </Button>
    </form>
  );
}
