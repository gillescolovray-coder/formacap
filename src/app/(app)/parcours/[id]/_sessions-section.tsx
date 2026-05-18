import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  Layers,
  Plus,
  Route as RouteIcon,
  Trash2,
  Video,
} from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  MODALITY_BADGE_CLASSES,
  MODALITY_LABELS,
  type FormationModality,
} from "@/lib/formations/types";
import { attachSession, detachSession, moveSession } from "../actions";

const MODALITY_ICONS: Record<FormationModality, typeof Building2> = {
  presentiel: Building2,
  distanciel: Video,
  hybride: Layers,
};

type SessionItem = {
  id: string;
  parcours_position: number | null;
  start_date: string;
  end_date: string;
  modality: FormationModality | null;
  location: string | null;
  trainer_name: string | null;
  formation: { id: string; title: string; duration_hours: number | null; duration_days: number | null } | null;
};

type StandaloneSession = {
  id: string;
  start_date: string;
  end_date: string;
  formation: { title: string } | null;
};

type Props = {
  parcoursId: string;
  sessions: SessionItem[];
  standaloneSessions: StandaloneSession[];
};

function formatRange(start: string, end: string) {
  const s = new Date(start).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
  const e = new Date(end).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return start === end ? e : `${s} → ${e}`;
}

export function ParcoursSessionsSection({
  parcoursId,
  sessions,
  standaloneSessions,
}: Props) {
  const attach = attachSession.bind(null, parcoursId);

  // Totaux
  const totalSessions = sessions.length;
  const totalHours = sessions.reduce(
    (sum, s) => sum + Number(s.formation?.duration_hours ?? 0),
    0,
  );
  const totalDays = sessions.reduce(
    (sum, s) => sum + Number(s.formation?.duration_days ?? 0),
    0,
  );

  // Compteur par modalité (pour la barre récap)
  const modalityCounts = sessions.reduce<Record<string, number>>((acc, s) => {
    if (s.modality) acc[s.modality] = (acc[s.modality] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <CollapsibleSection
      icon={RouteIcon}
      title="Sessions du parcours"
      description="Liste ordonnée des sessions composant ce parcours pédagogique."
      accent="emerald"
      defaultOpen
      id="sessions-parcours"
      headerExtra={
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 text-xs font-bold border border-cyan-200 dark:border-cyan-900">
          <Clock className="h-3.5 w-3.5" />
          {totalHours} h · {totalDays} j · {totalSessions} session
          {totalSessions > 1 ? "s" : ""}
        </span>
      }
    >
      <div className="space-y-5">
        {/* Synthèse modalités */}
        {sessions.length > 0 && Object.keys(modalityCounts).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Modalités :</span>
            {(Object.keys(modalityCounts) as FormationModality[]).map((m) => {
              const Icon = MODALITY_ICONS[m];
              return (
                <span
                  key={m}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium",
                    MODALITY_BADGE_CLASSES[m],
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {MODALITY_LABELS[m]}
                  <span className="font-bold tabular-nums">
                    × {modalityCounts[m]}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* Liste des sessions */}
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Aucune session attachée à ce parcours pour le moment.
          </p>
        ) : (
          <ol className="space-y-2">
            {sessions.map((s, idx) => {
              const remove = detachSession.bind(null, parcoursId, s.id);
              const moveUp = moveSession.bind(null, parcoursId, s.id, "up");
              const moveDown = moveSession.bind(null, parcoursId, s.id, "down");
              const ModalityIcon = s.modality
                ? MODALITY_ICONS[s.modality]
                : null;
              const isFirst = idx === 0;
              const isLast = idx === sessions.length - 1;
              const hours = s.formation?.duration_hours ?? 0;
              const days = s.formation?.duration_days ?? 0;
              return (
                <li
                  key={s.id}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-cyan-300 dark:hover:border-cyan-800 transition-colors"
                >
                  {/* Position */}
                  <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-sm font-bold flex items-center justify-center shadow-sm">
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/sessions/${s.id}`}
                      className="font-semibold text-slate-900 dark:text-slate-100 hover:text-cyan-700 hover:underline inline-flex items-center gap-1"
                    >
                      {s.formation?.title ?? "Session"}
                      <ExternalLink className="h-3 w-3 opacity-50" />
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatRange(s.start_date, s.end_date)}
                      </span>
                      {s.modality && ModalityIcon && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium",
                            MODALITY_BADGE_CLASSES[s.modality],
                          )}
                        >
                          <ModalityIcon className="h-2.5 w-2.5" />
                          {MODALITY_LABELS[s.modality]}
                        </span>
                      )}
                      {s.trainer_name && (
                        <span>👤 {s.trainer_name}</span>
                      )}
                      {s.location && (
                        <span>📍 {s.location}</span>
                      )}
                      {(hours > 0 || days > 0) && (
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <Clock className="h-3 w-3" />
                          {hours} h
                          {days > 0 && ` · ${days} j`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!isFirst && (
                      <form action={moveUp}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon-sm"
                          title="Monter"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    )}
                    {!isLast && (
                      <form action={moveDown}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon-sm"
                          title="Descendre"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    )}
                    <form action={remove}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        title="Retirer du parcours"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Totaux récapitulatifs */}
        {sessions.length > 0 && (
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-3 gap-3 text-right">
              <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Sessions
                </p>
                <p className="text-lg font-black tabular-nums">
                  {totalSessions}
                </p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                <p className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">
                  Total jours
                </p>
                <p className="text-lg font-black tabular-nums text-amber-900 dark:text-amber-200">
                  {totalDays}
                </p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border-2 border-cyan-300 dark:border-cyan-800">
                <p className="text-[10px] uppercase tracking-wider text-cyan-700 font-bold">
                  Total heures
                </p>
                <p className="text-lg font-black tabular-nums text-cyan-900 dark:text-cyan-200">
                  {totalHours}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Ajouter une session */}
        <form
          action={attach}
          className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3"
        >
          <p className="text-sm font-semibold inline-flex items-center gap-2">
            <Plus className="h-4 w-4 text-cyan-600" />
            Ajouter une session existante
          </p>
          {standaloneSessions.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              Aucune session disponible. Créez d&apos;abord une session via{" "}
              <Link
                href="/sessions/new"
                className="text-cyan-700 hover:underline"
              >
                Sessions → Nouvelle
              </Link>
              , puis revenez l&apos;ajouter ici.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
              <div className="space-y-1.5">
                <Label htmlFor="session_id" className="text-xs">
                  Session
                </Label>
                <select
                  id="session_id"
                  name="session_id"
                  required
                  defaultValue=""
                  className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
                >
                  <option value="" disabled>
                    — Choisir une session non encore rattachée —
                  </option>
                  {standaloneSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.formation?.title ?? "Session"} ·{" "}
                      {formatRange(s.start_date, s.end_date)}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit">
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
            </div>
          )}
        </form>
      </div>
    </CollapsibleSection>
  );
}
