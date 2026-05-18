"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_STYLES,
  type AttendanceMoment,
  type AttendanceStatus,
} from "@/lib/attendances/types";
import { setAttendance } from "./actions";

export type PeriodDay = {
  date: string;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
};

type CellKey = string; // `${enrollmentId}:${date}:${moment}`

type Row = {
  enrollmentId: string;
  learnerName: string;
  company: string | null;
  attendancesByKey: Record<string, AttendanceStatus>;
};

type AttendanceGridProps = {
  sessionId: string;
  periods: PeriodDay[];
  rows: Row[];
};

const MOMENTS: AttendanceMoment[] = ["morning", "afternoon"];

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

function formatDateWeekday(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short" });
}

function formatTimeShort(time: string | null) {
  if (!time) return "—";
  const [h, m] = time.split(":");
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${minutes.toString().padStart(2, "0")}`;
}

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return "—";
  return `${formatTimeShort(start)}–${formatTimeShort(end)}`;
}

function buildKey(
  enrollmentId: string,
  date: string,
  moment: AttendanceMoment,
): CellKey {
  return `${enrollmentId}:${date}:${moment}`;
}

export function AttendanceGrid({
  sessionId,
  periods,
  rows,
}: AttendanceGridProps) {
  // State LOCAL pour le statut de chaque cellule. Initialisé depuis les
  // données serveur, puis mis à jour au moindre changement (rendu
  // immédiat) AVANT le retour de l'action serveur. Si l'action échoue,
  // on rollback à la valeur précédente.
  const [statusMap, setStatusMap] = useState<Record<CellKey, AttendanceStatus>>(
    () => {
      const m: Record<CellKey, AttendanceStatus> = {};
      for (const row of rows) {
        for (const p of periods) {
          for (const moment of MOMENTS) {
            const dataKey = `${p.date}:${moment}`;
            const localKey = buildKey(row.enrollmentId, p.date, moment);
            m[localKey] =
              row.attendancesByKey[dataKey] ?? "not_recorded";
          }
        }
      }
      return m;
    },
  );
  const [pending, setPending] = useState<Record<CellKey, boolean>>({});
  const [, startTransition] = useTransition();

  function handleChange(
    row: Row,
    date: string,
    moment: AttendanceMoment,
    next: AttendanceStatus,
  ) {
    const key = buildKey(row.enrollmentId, date, moment);
    const previous = statusMap[key] ?? "not_recorded";
    if (previous === next) return;

    // Optimistic update : on applique immédiatement le nouveau statut.
    setStatusMap((prev) => ({ ...prev, [key]: next }));
    setPending((prev) => ({ ...prev, [key]: true }));

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("status", next);
        await setAttendance(
          sessionId,
          row.enrollmentId,
          date,
          moment,
          fd,
        );
      } catch (e) {
        // Rollback en cas d'échec serveur
        console.error("setAttendance failed, rolling back:", e);
        setStatusMap((prev) => ({ ...prev, [key]: previous }));
      } finally {
        setPending((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center text-sm text-zinc-500">
        Aucun apprenant inscrit à cette session. Confirmez les inscriptions
        depuis la fiche de session pour les voir apparaître ici.
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center text-sm text-zinc-500">
        Aucun jour planifié pour cette session. Ajoutez des jours dans le
        planning détaillé de la session.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-950 text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th
              rowSpan={2}
              className="px-4 py-3 sticky left-0 bg-zinc-50 dark:bg-zinc-950 z-10 text-left border-r border-zinc-200 dark:border-zinc-800 align-middle"
            >
              Apprenant
            </th>
            {periods.map((p) => (
              <th
                key={p.date}
                colSpan={2}
                className="px-3 py-2 text-center border-l border-zinc-200 dark:border-zinc-800"
              >
                <div className="text-[10px] font-normal text-zinc-500 capitalize">
                  {formatDateWeekday(p.date)}
                </div>
                <div className="text-zinc-900 dark:text-zinc-100">
                  {formatDateShort(p.date)}
                </div>
              </th>
            ))}
          </tr>
          <tr>
            {periods.flatMap((p) => [
              <th
                key={`${p.date}-morning`}
                className="px-2 py-2 text-center text-[10px] font-medium min-w-[120px] border-l border-zinc-200 dark:border-zinc-800"
              >
                <div className="text-zinc-700 dark:text-zinc-300">Matin</div>
                <div className="font-normal text-zinc-500 text-[10px]">
                  {formatRange(p.morning_start, p.morning_end)}
                </div>
              </th>,
              <th
                key={`${p.date}-afternoon`}
                className="px-2 py-2 text-center text-[10px] font-medium min-w-[120px]"
              >
                <div className="text-zinc-700 dark:text-zinc-300">A-M</div>
                <div className="font-normal text-zinc-500 text-[10px]">
                  {formatRange(p.afternoon_start, p.afternoon_end)}
                </div>
              </th>,
            ])}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.map((row) => (
            <tr key={row.enrollmentId}>
              <td className="px-4 py-3 sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-zinc-200 dark:border-zinc-800">
                <div className="font-medium truncate max-w-[240px]">
                  {row.learnerName}
                </div>
                {row.company && (
                  <div className="text-xs text-zinc-500 truncate max-w-[240px]">
                    {row.company}
                  </div>
                )}
              </td>
              {periods.map((p) =>
                MOMENTS.map((m) => {
                  const key = buildKey(row.enrollmentId, p.date, m);
                  const status = statusMap[key] ?? "not_recorded";
                  const isPending = Boolean(pending[key]);
                  return (
                    <td
                      key={key}
                      className={cn(
                        "px-1 py-2 text-center relative",
                        m === "morning"
                          ? "border-l border-zinc-200 dark:border-zinc-800"
                          : "",
                      )}
                    >
                      <select
                        value={status}
                        onChange={(e) =>
                          handleChange(
                            row,
                            p.date,
                            m,
                            e.target.value as AttendanceStatus,
                          )
                        }
                        disabled={isPending}
                        className={cn(
                          "h-8 w-full rounded-md border-0 text-xs font-medium px-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-60",
                          ATTENDANCE_STATUS_STYLES[status],
                        )}
                      >
                        {(
                          Object.keys(ATTENDANCE_STATUS_LABELS) as Array<
                            keyof typeof ATTENDANCE_STATUS_LABELS
                          >
                        ).map((k) => (
                          <option key={k} value={k}>
                            {ATTENDANCE_STATUS_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      {isPending && (
                        <Loader2
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-zinc-400 pointer-events-none"
                          aria-hidden
                        />
                      )}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
