"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, Loader2, RotateCcw } from "lucide-react";
import {
  syncAllSessionsToCalendar,
  resetAndResyncCalendar,
} from "./actions";

/**
 * Bouton "Synchroniser l'agenda" (Gilles 2026-06-06).
 *
 * Principe : on clique UNE fois pour pousser toutes les sessions existantes
 * vers Google Agenda. Ensuite, chaque création / modification / confirmation /
 * annulation / report se synchronise AUTOMATIQUEMENT en temps réel. En cas de
 * doute, recliquer refait toute la synchro. La date/heure de la dernière
 * synchro complète est affichée sous le bouton.
 */
function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} à ${time}`;
}

export function SyncCalendarButton({
  lastSyncAt = null,
}: {
  lastSyncAt?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(lastSyncAt);

  function handleClick() {
    setMsg(null);
    startTransition(async () => {
      const res = await syncAllSessionsToCalendar();
      if (res.ok) {
        // Succès (éventuellement partiel : res.error signale des échecs).
        setMsg({
          ok: !res.error,
          text: res.error
            ? `${res.count} synchronisée(s). ⚠️ ${res.error}`
            : `${res.count} session${res.count > 1 ? "s" : ""} synchronisée${res.count > 1 ? "s" : ""}.`,
        });
        if (res.lastSyncAt) setLastSync(res.lastSyncAt);
      } else {
        setMsg({ ok: false, text: res.error ?? "Échec de la synchronisation." });
      }
    });
  }

  function handleReset() {
    const ok = window.confirm(
      "Réinitialiser l'agenda « Session FORMACAP » ?\n\n" +
        "⚠️ Cela SUPPRIME tous les événements de cet agenda (pour effacer les doublons), puis recrée proprement toutes les sessions.\n\n" +
        "À utiliser uniquement sur l'agenda dédié aux sessions. Continuer ?",
    );
    if (!ok) return;
    setMsg(null);
    startTransition(async () => {
      const res = await resetAndResyncCalendar();
      if (res.ok) {
        setMsg({
          ok: !res.error,
          text: res.error
            ? `Agenda vidé (${res.deleted} supprimé(s)), ${res.count} recréée(s). ⚠️ ${res.error}`
            : `Agenda réinitialisé : ${res.deleted} ancien(s) événement(s) supprimé(s), ${res.count} session(s) recréée(s) sans doublon.`,
        });
        if (res.lastSyncAt) setLastSync(res.lastSyncAt);
      } else {
        setMsg({
          ok: false,
          text: res.error ?? "Échec de la réinitialisation.",
        });
      }
    });
  }

  const lastSyncLabel = formatDateTime(lastSync);

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-1 max-w-xs">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 transition-colors min-h-[44px]"
          title="Pousser toutes les sessions vers l'agenda Google « Session FORMACAP »"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarCheck className="h-4 w-4" />
          )}
          {pending ? "Synchronisation…" : "Synchroniser l'agenda"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs sm:text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60 transition-colors min-h-[44px]"
          title="Vider l'agenda (supprimer les doublons) et tout reconstruire proprement"
        >
          <RotateCcw className="h-4 w-4" />
          Réinitialiser
        </button>
      </div>

      {/* Paragraphe explicatif retiré pour un en-tête épuré et aligné
          (Gilles 2026-06-19). L'info reste dans l'info-bulle des boutons. */}

      {/* Message de résultat */}
      {msg && (
        <p
          className={`text-[11px] leading-tight font-medium ${
            msg.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}

      {/* Dernière synchro complète */}
      {lastSyncLabel && (
        <p className="text-[11px] leading-tight text-zinc-400">
          Dernière synchronisation : {lastSyncLabel}
        </p>
      )}
    </div>
  );
}
