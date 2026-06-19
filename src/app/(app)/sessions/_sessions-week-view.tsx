import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Vue PLANNING (semaine) des sessions — Option A (Gilles 2026-06-19).
 * 7 colonnes (Lun→Dim) ; chaque session apparaît dans la/les colonne(s) de
 * ses jours, sous forme de carte cliquable vers la fiche. Couleurs cohérentes
 * avec la liste (annulée grisée). Navigation par semaine (liens serveur).
 */
export type WeekCard = {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  statusLabel: string;
  statusBadgeClasses: string;
  isCancelled: boolean;
  modality: string | null;
  trainerLabel: string | null;
};

const MODALITY_SHORT: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

function dayHeader(iso: string): { weekday: string; dayNum: string } {
  const d = new Date(iso + "T00:00:00");
  return {
    weekday: d.toLocaleDateString("fr-FR", {
      weekday: "short",
      timeZone: "Europe/Paris",
    }),
    dayNum: d.toLocaleDateString("fr-FR", {
      day: "numeric",
      timeZone: "Europe/Paris",
    }),
  };
}

export function SessionsWeekView({
  weekDayIsos,
  cards,
  prevHref,
  nextHref,
  todayHref,
  todayIso,
}: {
  weekDayIsos: string[];
  cards: WeekCard[];
  prevHref: string;
  nextHref: string;
  todayHref: string;
  todayIso: string;
}) {
  const first = weekDayIsos[0]!;
  const last = weekDayIsos[6]!;
  const weekLabel = `${new Date(first + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" })} – ${new Date(last + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}`;

  return (
    <div className="space-y-3">
      {/* Barre de navigation semaine */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Link
            href={prevHref}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700"
            title="Semaine précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link
            href={todayHref}
            className="inline-flex items-center h-9 px-3 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-sm font-semibold text-zinc-700"
          >
            Aujourd&apos;hui
          </Link>
          <Link
            href={nextHref}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700"
            title="Semaine suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <span className="text-sm font-bold text-zinc-800 capitalize">
          {weekLabel}
        </span>
        <span className="text-xs text-zinc-500">
          {cards.length} session{cards.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Grille 7 jours (défile horizontalement sur mobile) */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-2 min-w-[840px]">
          {weekDayIsos.map((dayIso) => {
            const { weekday, dayNum } = dayHeader(dayIso);
            const isToday = dayIso === todayIso;
            const dayCards = cards.filter(
              (c) => c.startDate <= dayIso && c.endDate >= dayIso,
            );
            return (
              <div
                key={dayIso}
                className="rounded-lg border border-zinc-200 bg-white min-h-[140px] flex flex-col"
              >
                <div
                  className={cn(
                    "px-2 py-1.5 border-b text-center",
                    isToday
                      ? "bg-cyan-600 text-white border-cyan-600"
                      : "bg-zinc-50 text-zinc-600 border-zinc-200",
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wider font-bold">
                    {weekday}
                  </div>
                  <div className="text-lg font-black tabular-nums leading-none">
                    {dayNum}
                  </div>
                </div>
                <div className="flex-1 p-1.5 space-y-1.5">
                  {dayCards.length === 0 ? (
                    <div className="h-full" />
                  ) : (
                    dayCards.map((c) => {
                      const multiDay = c.startDate !== c.endDate;
                      return (
                        <Link
                          key={c.id}
                          href={`/sessions/${c.id}`}
                          className={cn(
                            "block rounded-md border p-1.5 text-[11px] leading-tight transition-colors",
                            c.isCancelled
                              ? "bg-zinc-100 border-zinc-200 text-zinc-400 line-through hover:bg-zinc-200"
                              : "bg-cyan-50/60 border-cyan-200 text-zinc-800 hover:bg-cyan-100",
                          )}
                          title={`${c.title}${c.trainerLabel ? ` — ${c.trainerLabel}` : ""}`}
                        >
                          <div className="font-bold line-clamp-3">
                            {c.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span
                              className={cn(
                                "inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold",
                                c.statusBadgeClasses,
                              )}
                            >
                              {c.statusLabel}
                            </span>
                            {multiDay && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] text-zinc-500">
                                <Clock className="h-2.5 w-2.5" />
                                pluri-jours
                              </span>
                            )}
                          </div>
                          {c.modality && (
                            <div className="mt-0.5 text-[9px] text-zinc-500">
                              {MODALITY_SHORT[c.modality] ?? c.modality}
                            </div>
                          )}
                          {c.trainerLabel && (
                            <div className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-zinc-500">
                              <User className="h-2.5 w-2.5" />
                              <span className="truncate">{c.trainerLabel}</span>
                            </div>
                          )}
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
