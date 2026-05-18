import { Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SessionDay } from "@/lib/sessions/types";
import {
  applyHoursToAllDays,
  updateSessionDay,
} from "./days/actions";

type ScheduleSectionProps = {
  sessionId: string;
  days: SessionDay[];
};

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const parts = time.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function rangeMinutes(start: string | null, end: string | null): number {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null || e <= s) return 0;
  return e - s;
}

function dayTotalMinutes(day: SessionDay): number {
  return (
    rangeMinutes(day.morning_start, day.morning_end) +
    rangeMinutes(day.afternoon_start, day.afternoon_end)
  );
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m.toString().padStart(2, "0")}`;
}

export function ScheduleSection({ sessionId, days }: ScheduleSectionProps) {
  const applyAll = applyHoursToAllDays.bind(null, sessionId);

  const totalMinutes = days.reduce(
    (sum, day) => sum + dayTotalMinutes(day),
    0,
  );

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Horaires par jour</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {days.length} jour{days.length > 1 ? "s" : ""} dans cette session.
            Précisez le matin et l&apos;après-midi pour chaque date.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 px-3 py-2">
          <Clock className="h-4 w-4 text-cyan-700 dark:text-cyan-400" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-cyan-700 dark:text-cyan-400 font-semibold">
              Durée totale
            </div>
            <div className="text-sm font-semibold text-cyan-800 dark:text-cyan-300">
              {formatDuration(totalMinutes)}
            </div>
          </div>
        </div>
      </div>

      {/* Appliquer à tous les jours */}
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        <details>
          <summary className="list-none cursor-pointer flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100">
            <Copy className="h-4 w-4" />
            Appliquer les mêmes horaires à tous les jours
          </summary>
          <form
            action={applyAll}
            className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end"
          >
            <div className="space-y-1.5">
              <Label className="text-xs">Matin début</Label>
              <Input type="time" name="morning_start" defaultValue="08:30" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Matin fin</Label>
              <Input type="time" name="morning_end" defaultValue="12:00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">A-M début</Label>
              <Input type="time" name="afternoon_start" defaultValue="13:30" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">A-M fin</Label>
              <Input type="time" name="afternoon_end" defaultValue="17:00" />
            </div>
            <Button type="submit" size="sm">
              Appliquer
            </Button>
          </form>
        </details>
      </div>

      {/* Liste des jours */}
      {days.length === 0 ? (
        <div className="p-8 text-center text-sm text-zinc-500">
          Pas de jour enregistré. Vérifiez les dates de début et de fin de la
          session.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {days.map((day) => {
            const update = updateSessionDay.bind(null, sessionId, day.id);
            const dayMinutes = dayTotalMinutes(day);
            return (
              <li key={day.id} className="px-6 py-4">
                <form
                  action={update}
                  className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto_auto] items-end"
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-zinc-500">
                      {formatDayLabel(day.day_date)}
                    </Label>
                    <p className="text-xs text-zinc-400 italic">
                      {day.day_date}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Matin début</Label>
                    <Input
                      type="time"
                      name="morning_start"
                      defaultValue={day.morning_start ?? ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Matin fin</Label>
                    <Input
                      type="time"
                      name="morning_end"
                      defaultValue={day.morning_end ?? ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">A-M début</Label>
                    <Input
                      type="time"
                      name="afternoon_start"
                      defaultValue={day.afternoon_start ?? ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">A-M fin</Label>
                    <Input
                      type="time"
                      name="afternoon_end"
                      defaultValue={day.afternoon_end ?? ""}
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                      Total
                    </div>
                    <div className="text-sm font-semibold tabular-nums whitespace-nowrap">
                      {formatDuration(dayMinutes)}
                    </div>
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    Enregistrer
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-6 py-3 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        💡 Laissez une case vide si cette demi-journée n&apos;est pas travaillée.
        Le total se recalcule automatiquement après chaque enregistrement.
      </div>
    </div>
  );
}
