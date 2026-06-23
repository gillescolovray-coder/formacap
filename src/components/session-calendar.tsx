"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  List as ListIcon,
} from "lucide-react";

/**
 * Calendrier de sessions reutilisable (Gilles 2026-06-23).
 * Selecteur de vue Liste / Mois / Semaine (type Google Agenda) avec fleches
 * de defilement + bouton « Aujourd'hui ». La vue « Liste » affiche le contenu
 * existant passe en `children` (aucune regression sur l'affichage actuel).
 *
 * Utilise sur les portails OF, prescripteur (catalogue) et formateur.
 */

export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO yyyy-mm-dd (jour de debut). */
  startDate: string | null;
  /** ISO yyyy-mm-dd (jour de fin, = start si absent). */
  endDate: string | null;
  status?: string | null;
  modality?: string | null;
  /** Destination au clic (facultatif). */
  href?: string | null;
  /** Petite info secondaire (lieu / visio). */
  meta?: string | null;
};

type View = "list" | "month" | "week";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function parseDay(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
/** Lundi de la semaine de `d`. */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = lundi
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Numéro de semaine ISO 8601 (semaines commençant le lundi). */
function isoWeek(d: Date): number {
  const date = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  );
  const day = (date.getUTCDay() + 6) % 7; // 0 = lundi
  date.setUTCDate(date.getUTCDate() - day + 3); // jeudi de la semaine
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return (
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / (7 * DAY_MS),
    )
  );
}

/** Clé "YYYY-MM-DD" d'une date (composantes locales = date civile affichée). */
function ymdKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Couleur de pastille selon le statut de la session. */
function chipClass(status?: string | null): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200";
    case "cancelled":
      return "bg-red-100 text-red-700 border-red-300 line-through hover:bg-red-200";
    case "postponed":
      return "bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200";
    case "in_progress":
      return "bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200";
    case "completed":
      return "bg-zinc-100 text-zinc-600 border-zinc-300 hover:bg-zinc-200";
    default:
      return "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200";
  }
}

type Positioned = { event: CalendarEvent; start: Date; end: Date };

export function SessionCalendar({
  events,
  storageKey,
  holidayDays,
  holidayZoneLabel,
  children,
}: {
  events: CalendarEvent[];
  /** Cle de persistance de la vue choisie (localStorage). */
  storageKey?: string;
  /** Jours de vacances scolaires { "YYYY-MM-DD": "libellé" } (zone du partenaire). */
  holidayDays?: Record<string, string>;
  /** Libellé de la zone scolaire (ex. « Zone A ») pour la légende. */
  holidayZoneLabel?: string | null;
  /** Contenu de la vue « Liste » (affichage existant). */
  children: React.ReactNode;
}) {
  const [view, setView] = useState<View>("list");
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const [today, setToday] = useState<Date | null>(null);

  // Hydratation : lire la vue mémorisée + fixer « aujourd'hui » côté client
  // (évite tout décalage SSR/CSR).
  useEffect(() => {
    setToday(startOfDay(new Date()));
    if (storageKey) {
      const saved = window.localStorage.getItem(`cal-view:${storageKey}`);
      if (saved === "month" || saved === "week" || saved === "list")
        setView(saved);
    }
  }, [storageKey]);

  function changeView(v: View) {
    setView(v);
    if (storageKey) window.localStorage.setItem(`cal-view:${storageKey}`, v);
  }

  const positioned = useMemo<Positioned[]>(() => {
    const out: Positioned[] = [];
    for (const e of events) {
      const start = parseDay(e.startDate);
      if (!start) continue;
      const end = parseDay(e.endDate) ?? start;
      out.push({ event: e, start, end: end < start ? start : end });
    }
    return out;
  }, [events]);

  // Une session est posée UNIQUEMENT sur son jour de début (Gilles 2026-06-23) :
  // afficher une pastille sur chaque jour d'une plage longue (ex. 4 fév → 1 avr)
  // inondait le calendrier. Le jour de début suffit comme repère.
  function eventsOnDay(day: Date): CalendarEvent[] {
    return positioned
      .filter((p) => sameDay(p.start, day))
      .map((p) => p.event);
  }

  function shift(dir: -1 | 1) {
    setCursor((c) => (view === "week" ? addDays(c, 7 * dir) : addMonths(c, dir)));
  }

  const periodLabel = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      const sameMonth = s.getMonth() === e.getMonth();
      const range = sameMonth
        ? `${s.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
        : `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
      return `Sem. ${isoWeek(s)} · ${range}`;
    }
    return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }, [view, cursor]);

  const hasHolidays =
    Boolean(holidayZoneLabel) &&
    Boolean(holidayDays && Object.keys(holidayDays).length > 0);

  return (
    <div className="space-y-3">
      {/* Barre d'outils : sélecteur de vue + navigation */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
          <ViewBtn
            active={view === "list"}
            onClick={() => changeView("list")}
            icon={ListIcon}
            label="Liste"
          />
          <ViewBtn
            active={view === "month"}
            onClick={() => changeView("month")}
            icon={CalendarDays}
            label="Mois"
          />
          <ViewBtn
            active={view === "week"}
            onClick={() => changeView("week")}
            icon={CalendarRange}
            label="Semaine"
          />
        </div>

        {view !== "list" && (
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600"
              title={view === "week" ? "Semaine précédente" : "Mois précédent"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold text-zinc-800 capitalize min-w-[150px] text-center">
              {periodLabel}
            </span>
            <button
              type="button"
              onClick={() => shift(1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600"
              title={view === "week" ? "Semaine suivante" : "Mois suivant"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCursor(startOfDay(new Date()))}
              className="h-8 px-3 inline-flex items-center rounded-md border border-cyan-300 bg-white hover:bg-cyan-50 text-cyan-700 text-xs font-semibold"
            >
              Aujourd&apos;hui
            </button>
          </div>
        )}
      </div>

      {/* Rappel de la zone de congés scolaires — en ROUGE (Gilles 2026-06-23) */}
      {view !== "list" && hasHolidays && (
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 font-bold">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-200 border border-red-300" />
            Vacances scolaires — {holidayZoneLabel}
          </span>
          <span className="text-zinc-400">
            (jours sur fond rosé = congés de votre zone)
          </span>
        </div>
      )}

      {view === "list" ? (
        children
      ) : view === "month" ? (
        <MonthView
          cursor={cursor}
          today={today}
          eventsOnDay={eventsOnDay}
          holidayDays={holidayDays}
        />
      ) : (
        <WeekView
          cursor={cursor}
          today={today}
          eventsOnDay={eventsOnDay}
          holidayDays={holidayDays}
        />
      )}
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-bold"
          : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-zinc-600 hover:bg-zinc-50 text-xs font-medium"
      }
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/** Pastille événement (cliquable si href). Info-bulle = titre + lieu complet. */
function EventChip({ event }: { event: CalendarEvent }) {
  const cls = `block w-full text-left truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${chipClass(
    event.status,
  )}`;
  // Info-bulle : nom de la salle + adresse complète (event.meta).
  const tooltip = event.meta
    ? `${event.title}\n📍 ${event.meta}`
    : event.title;
  const content = (
    <span className="truncate block" title={tooltip}>
      {event.title}
    </span>
  );
  if (event.href)
    return (
      <Link href={event.href} className={cls} title={tooltip}>
        {content}
      </Link>
    );
  return <span className={cls}>{content}</span>;
}

function MonthView({
  cursor,
  today,
  eventsOnDay,
  holidayDays,
}: {
  cursor: Date;
  today: Date | null;
  eventsOnDay: (d: Date) => CalendarEvent[];
  holidayDays?: Record<string, string>;
}) {
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  // 6 semaines de 7 jours.
  const weeks: Date[][] = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  );
  const colCls = "grid grid-cols-[34px_repeat(7,minmax(0,1fr))]";
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-x-auto">
      <div className="min-w-[720px]">
        {/* En-tête : « Sem. » + jours */}
        <div
          className={`${colCls} border-b border-zinc-200 bg-zinc-50 text-[11px] font-bold uppercase tracking-wider text-zinc-500`}
        >
          <div className="px-1 py-1.5 text-center text-zinc-400">Sem.</div>
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-center">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className={colCls}>
            {/* Numéro de semaine */}
            <div className="flex items-start justify-center pt-1 border-b border-r border-zinc-100 bg-zinc-50/60 text-[11px] font-bold text-zinc-400 tabular-nums">
              {isoWeek(week[0])}
            </div>
            {week.map((day, di) => {
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = today && sameDay(day, today);
              const holiday = holidayDays?.[ymdKey(day)];
              const evs = eventsOnDay(day);
              return (
                <div
                  key={di}
                  title={holiday ? `${holiday} (vacances scolaires)` : undefined}
                  className={`min-h-[92px] border-b border-r border-zinc-100 p-1 align-top ${
                    holiday
                      ? "bg-red-50"
                      : inMonth
                        ? "bg-white"
                        : "bg-zinc-50/60"
                  }`}
                >
                  <div
                    className={`text-[11px] font-bold mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full ${
                      isToday
                        ? "bg-cyan-600 text-white"
                        : holiday
                          ? "text-red-600"
                          : inMonth
                            ? "text-zinc-700"
                            : "text-zinc-300"
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 4).map((e) => (
                      <EventChip key={e.id} event={e} />
                    ))}
                    {evs.length > 4 && (
                      <div className="text-[10px] text-zinc-400 px-1">
                        +{evs.length - 4} autre{evs.length - 4 > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekView({
  cursor,
  today,
  eventsOnDay,
  holidayDays,
}: {
  cursor: Date;
  today: Date | null;
  eventsOnDay: (d: Date) => CalendarEvent[];
  holidayDays?: Record<string, string>;
}) {
  const start = startOfWeek(cursor);
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      {/* Mobile : liste verticale par jour ; desktop : 7 colonnes */}
      <div className="grid grid-cols-1 sm:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-zinc-100">
        {days.map((day, i) => {
          const isToday = today && sameDay(day, today);
          const holiday = holidayDays?.[ymdKey(day)];
          const evs = eventsOnDay(day);
          return (
            <div
              key={i}
              title={holiday ? `${holiday} (vacances scolaires)` : undefined}
              className={`min-h-[120px] p-2 ${holiday ? "bg-red-50" : ""}`}
            >
              <div
                className={`text-xs font-bold mb-2 inline-flex items-center gap-1.5 ${
                  isToday ? "text-cyan-700" : "text-zinc-600"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                    isToday
                      ? "bg-cyan-600 text-white"
                      : holiday
                        ? "bg-red-100 text-red-700"
                        : "bg-zinc-100"
                  }`}
                >
                  {day.getDate()}
                </span>
                <span className="capitalize">
                  {WEEKDAYS[i]} {MONTHS[day.getMonth()].slice(0, 3)}.
                </span>
              </div>
              {holiday && (
                <p className="text-[9px] text-red-600 font-semibold px-0.5 mb-1 truncate">
                  {holiday}
                </p>
              )}
              <div className="space-y-1">
                {evs.length === 0 ? (
                  <p className="text-[10px] text-zinc-300 italic">—</p>
                ) : (
                  evs.map((e) => (
                    <div key={e.id}>
                      <EventChip event={e} />
                      {e.meta && (
                        <p className="text-[9px] text-zinc-400 px-1 truncate">
                          {e.meta}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
