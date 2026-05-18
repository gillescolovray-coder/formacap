"use client";

import { useState } from "react";
import { CalendarCheck2, Plus, Sun, Sunset, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { ProgrammeDay } from "@/lib/formations/types";

type ProgrammeBuilderProps = {
  initialDays?: ProgrammeDay[];
  name?: string;
};

export function ProgrammeBuilder({
  initialDays,
  name = "programme_days",
}: ProgrammeBuilderProps) {
  const [days, setDays] = useState<ProgrammeDay[]>(
    initialDays && initialDays.length > 0
      ? initialDays
      : [{ morning: "", afternoon: "" }],
  );

  const addDay = () => {
    setDays((current) => [...current, { morning: "", afternoon: "" }]);
  };

  const removeDay = (index: number) => {
    setDays((current) => current.filter((_, i) => i !== index));
  };

  const updateField = (
    index: number,
    field: keyof ProgrammeDay,
    value: string,
  ) => {
    setDays((current) =>
      current.map((d, i) => (i === index ? { ...d, [field]: value } : d)),
    );
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={JSON.stringify(days)} />

      {days.map((day, index) => (
        <div
          key={index}
          className="rounded-xl border-2 border-amber-200 dark:border-amber-900 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/30 dark:to-zinc-900 overflow-hidden"
        >
          {/* En-tête de la journée */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-amber-600 text-white flex items-center justify-center">
                <CalendarCheck2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Journée {index + 1}
                </h3>
                <p className="text-[10px] uppercase tracking-wider text-amber-700/70 dark:text-amber-400/70">
                  Matin & Après-midi
                </p>
              </div>
            </div>
            {days.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeDay(index)}
              >
                <Trash2 className="h-4 w-4" />
                Retirer
              </Button>
            )}
          </div>

          {/* Contenu matin + après-midi */}
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-amber-200 dark:divide-amber-900">
            {/* Matin */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                <Sun className="h-4 w-4" />
                <Label className="text-sm font-semibold">Matin</Label>
              </div>
              <RichTextEditor
                value={day.morning}
                onChange={(html) => updateField(index, "morning", html)}
                placeholder="Saisissez le déroulé de la matinée…"
              />
            </div>

            {/* Après-midi */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-orange-800 dark:text-orange-300">
                <Sunset className="h-4 w-4" />
                <Label className="text-sm font-semibold">Après-midi</Label>
              </div>
              <RichTextEditor
                value={day.afternoon}
                onChange={(html) => updateField(index, "afternoon", html)}
                placeholder="Saisissez le déroulé de l'après-midi…"
              />
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-zinc-500">
          💡 Utilisez la barre d&apos;outils (gras, italique, titres, listes,
          couleurs, police…) pour mettre en forme le programme.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={addDay}>
          <Plus className="h-4 w-4" />
          Ajouter une journée
        </Button>
      </div>
    </div>
  );
}
