"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { updateSessionStatusQuick } from "./actions";
import type { SessionStatus } from "@/lib/sessions/types";

/**
 * Sélecteur de statut inline dans le tableau Sessions (Gilles 2026-06-12).
 * Permet de changer le statut directement ; synchronisé avec la fiche session.
 */
export function SessionStatusSelect({
  sessionId,
  current,
  options,
  badgeClasses,
  locked = false,
}: {
  sessionId: string;
  current: string;
  options: { code: string; label: string }[];
  badgeClasses: string;
  /** Session clôturée : statut non modifiable (Gilles 2026-06-13). */
  locked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={current}
        disabled={pending || locked}
        title={
          locked
            ? "Session clôturée : décochez « Clôturé » pour modifier le statut"
            : "Changer le statut de la session"
        }
        onChange={(e) => {
          const next = e.target.value as SessionStatus;
          if (next === current) return;
          startTransition(async () => {
            const res = await updateSessionStatusQuick(sessionId, next);
            if (res.ok) router.refresh();
            else window.alert(res.error ?? "Changement de statut impossible.");
          });
        }}
        className={
          "appearance-none cursor-pointer rounded px-2 py-0.5 pr-5 text-xs font-medium border-0 focus:outline-none focus:ring-2 focus:ring-cyan-400 " +
          badgeClasses
        }
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 4px center",
        }}
      >
        {options.map((o) => (
          <option key={o.code} value={o.code} className="text-zinc-900">
            {o.label}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
    </span>
  );
}
