"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { syncAllSessionsToCalendar } from "./actions";

/**
 * Bouton "Synchroniser l'agenda" : pousse toutes les sessions existantes
 * vers Google Agenda (rattrapage initial). Gilles 2026-06-06.
 */
export function SyncCalendarButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function handleClick() {
    setMsg(null);
    startTransition(async () => {
      const res = await syncAllSessionsToCalendar();
      if (res.ok) {
        setMsg({
          ok: true,
          text: `${res.count} session${res.count > 1 ? "s" : ""} synchronisée${res.count > 1 ? "s" : ""} avec Google Agenda.`,
        });
      } else {
        setMsg({ ok: false, text: res.error ?? "Échec de la synchronisation." });
      }
    });
  }

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 transition-colors min-h-[44px]"
        title="Pousser toutes les sessions existantes vers l'agenda Google « Sessions CAP »"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarCheck className="h-4 w-4" />
        )}
        {pending ? "Synchronisation…" : "Synchroniser l'agenda"}
      </button>
      {msg && (
        <p
          className={`text-[11px] leading-tight ${
            msg.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
