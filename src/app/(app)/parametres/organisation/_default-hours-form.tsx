"use client";

import { useState } from "react";
import { Clock, Sun, Sunset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  defaults: {
    morning_start: string;
    morning_end: string;
    afternoon_start: string;
    afternoon_end: string;
  };
};

function timeToMinutes(t: string): number | null {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

function diffMinutes(start: string, end: string): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return null;
  if (e <= s) return null;
  return e - s;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m.toString().padStart(2, "0")}`;
}

export function DefaultHoursForm({ action, defaults }: Props) {
  const [morningStart, setMorningStart] = useState(defaults.morning_start);
  const [morningEnd, setMorningEnd] = useState(defaults.morning_end);
  const [afternoonStart, setAfternoonStart] = useState(defaults.afternoon_start);
  const [afternoonEnd, setAfternoonEnd] = useState(defaults.afternoon_end);

  const morningMinutes = diffMinutes(morningStart, morningEnd);
  const afternoonMinutes = diffMinutes(afternoonStart, afternoonEnd);
  const dailyMinutes =
    morningMinutes === null && afternoonMinutes === null
      ? null
      : (morningMinutes ?? 0) + (afternoonMinutes ?? 0);

  return (
    <form action={action} className="space-y-5">
      {/* Récap durées (live) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs">
          <Sun className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
          <span className="text-amber-700 dark:text-amber-400 font-medium">
            Matin
          </span>
          <span className="font-bold text-amber-900 dark:text-amber-200">
            {formatDuration(morningMinutes)}
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 text-xs">
          <Sunset className="h-3.5 w-3.5 text-violet-700 dark:text-violet-400" />
          <span className="text-violet-700 dark:text-violet-400 font-medium">
            A-M
          </span>
          <span className="font-bold text-violet-900 dark:text-violet-200">
            {formatDuration(afternoonMinutes)}
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-50 dark:bg-cyan-950/30 border-2 border-cyan-300 dark:border-cyan-800 text-xs shadow-sm">
          <Clock className="h-3.5 w-3.5 text-cyan-700 dark:text-cyan-400" />
          <span className="text-cyan-700 dark:text-cyan-400 font-medium">
            Journée
          </span>
          <span className="font-black text-cyan-900 dark:text-cyan-200">
            {formatDuration(dailyMinutes)}
          </span>
        </div>
      </div>

      {/* Matin */}
      <div className="rounded-lg bg-amber-50/40 dark:bg-amber-950/15 border border-amber-200 dark:border-amber-900/50 p-4 space-y-3">
        <p className="text-xs uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400">
          Matin
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="default_morning_start">Début</Label>
            <Input
              id="default_morning_start"
              name="default_morning_start"
              type="time"
              value={morningStart}
              onChange={(e) => setMorningStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default_morning_end">Fin</Label>
            <Input
              id="default_morning_end"
              name="default_morning_end"
              type="time"
              value={morningEnd}
              onChange={(e) => setMorningEnd(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Après-midi */}
      <div className="rounded-lg bg-violet-50/40 dark:bg-violet-950/15 border border-violet-200 dark:border-violet-900/50 p-4 space-y-3">
        <p className="text-xs uppercase tracking-wider font-bold text-violet-700 dark:text-violet-400">
          Après-midi
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="default_afternoon_start">Début</Label>
            <Input
              id="default_afternoon_start"
              name="default_afternoon_start"
              type="time"
              value={afternoonStart}
              onChange={(e) => setAfternoonStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default_afternoon_end">Fin</Label>
            <Input
              id="default_afternoon_end"
              name="default_afternoon_end"
              type="time"
              value={afternoonEnd}
              onChange={(e) => setAfternoonEnd(e.target.value)}
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Laissez les champs vides si vous ne voulez pas définir d&apos;horaires
        par défaut. Dans ce cas, les nouvelles sessions partiront sur 08:30 -
        12:00 / 13:30 - 17:00.
      </p>

      <Button type="submit">
        <Clock className="h-4 w-4" />
        Enregistrer les horaires
      </Button>
    </form>
  );
}
