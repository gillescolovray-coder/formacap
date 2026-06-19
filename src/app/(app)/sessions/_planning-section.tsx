"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  Sun,
  Sunset,
  Trash2,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoSyncBadge } from "@/components/auto-sync-badge";
import { cn } from "@/lib/utils";
import type {
  OrgDefaultHours,
  SessionDay,
  TrainingSession,
} from "@/lib/sessions/types";

type TrainerOption = {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
};

type Props = {
  session?: TrainingSession;
  /** Jours déjà persistés en base (table `session_days`). Source de
   *  vérité initiale en mode édition — évite la re-énumération entre
   *  start/end qui produit des faux jours pour les sessions à dates
   *  non consécutives. */
  existingDays?: SessionDay[];
  /** Liste des formateurs sélectionnables (chantier 0035 — formateur
   *  différent par jour). */
  trainers?: TrainerOption[];
  /** Horaires par défaut "maison" définis dans Paramètres. Servent de
   *  valeurs initiales pour une nouvelle session si la session n'a pas
   *  ses propres `default_*` (cas migration 0042). */
  orgDefaultHours?: OrgDefaultHours;
  /** Durée prévue de la formation sélectionnée (en jours). Borne
   *  supérieure pour l'ajout manuel de jours — au-delà, le bouton
   *  "Ajouter un jour" est désactivé. */
  initialFormationDurationDays?: number | null;
};

/**
 * Convertit "HH:MM" en minutes depuis 00:00. Retourne null si invalide.
 */
function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hours = Number.parseInt(h, 10);
  const minutes = Number.parseInt(m, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Affiche une durée en minutes au format "Xh Ymin" (ou "Xh", "Ymin").
 */
function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m.toString().padStart(2, "0")}`;
}

function diffMinutes(start: string, end: string): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return null;
  if (e <= s) return null;
  return e - s;
}

type DayPlan = {
  /** Identifiant local stable (pour les opérations de modif/suppression
   *  dans la liste, indépendant de la date qui peut changer). */
  key: string;
  date: string;
  enabled: boolean;
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  /** Formateur du jour. Vide → on utilise le formateur par défaut de la
   *  session (sessions.trainer_id). */
  trainer_id: string;
  /** Consignes destinées au formateur pour ce jour (texte libre). */
  trainer_notes: string;
};

function dayMinutes(d: DayPlan): number {
  if (!d.enabled) return 0;
  return (
    (diffMinutes(d.morning_start, d.morning_end) ?? 0) +
    (diffMinutes(d.afternoon_start, d.afternoon_end) ?? 0)
  );
}

function nextKey(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Ajoute N jours à une date YYYY-MM-DD (renvoie YYYY-MM-DD). */
function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function PlanningSection({
  session,
  existingDays,
  trainers = [],
  orgDefaultHours,
  initialFormationDurationDays = null,
}: Props) {
  // Nombre de jours maximum autorisé par la durée de la formation
  // sélectionnée. Mis à jour quand l'utilisateur change la formation
  // (event "session:formation-picked").
  const [maxDays, setMaxDays] = useState<number | null>(
    initialFormationDurationDays,
  );
  // Priorité des valeurs initiales :
  //   1) horaires propres à la session (si édition)
  //   2) horaires "maison" de l'organisation (Paramètres)
  //   3) fallback codé en dur
  // Ces valeurs sont fixes : la modification se fait jour-par-jour
  // dans le planning détaillé, et globalement dans Paramètres.
  const morningStart =
    session?.default_morning_start ??
    orgDefaultHours?.morning_start ??
    "08:30";
  const morningEnd =
    session?.default_morning_end ??
    orgDefaultHours?.morning_end ??
    "12:00";
  const afternoonStart =
    session?.default_afternoon_start ??
    orgDefaultHours?.afternoon_start ??
    "13:30";
  const afternoonEnd =
    session?.default_afternoon_end ??
    orgDefaultHours?.afternoon_end ??
    "17:00";

  // Liste des jours de la session — c'est désormais la SOURCE de vérité.
  // Les dates de début / fin sont auto-calculées comme min/max de cette
  // liste pour rester compatible avec les colonnes start_date / end_date
  // de la table `sessions`.
  function makeDay(date: string): DayPlan {
    return {
      key: nextKey(),
      date,
      enabled: true,
      morning_start: morningStart,
      morning_end: morningEnd,
      afternoon_start: afternoonStart,
      afternoon_end: afternoonEnd,
      trainer_id: "",
      trainer_notes: "",
    };
  }
  const [dayPlans, setDayPlans] = useState<DayPlan[]>(() => {
    // Priorité 1 : les jours réellement persistés (édition d'une session
    // existante). Préserve les dates non consécutives.
    if (existingDays && existingDays.length > 0) {
      return existingDays
        .slice()
        .sort((a, b) => a.day_date.localeCompare(b.day_date))
        .map((d) => ({
          key: nextKey(),
          date: d.day_date,
          enabled: true,
          morning_start: d.morning_start ?? "08:30",
          morning_end: d.morning_end ?? "12:00",
          afternoon_start: d.afternoon_start ?? "13:30",
          afternoon_end: d.afternoon_end ?? "17:00",
          trainer_id: d.trainer_id ?? "",
          trainer_notes: d.trainer_notes ?? "",
        }));
    }
    // Priorité 2 : nouvelle session — pas de jours pré-créés.
    return [];
  });

  // Marque les jours dont les horaires ont été ajustés à la main : on
  // évite alors de leur réappliquer les défauts si l'utilisateur change
  // les horaires globaux.
  const customizedRef = useRef<Set<string>>(new Set());

  /**
   * Mise à jour d'un jour par sa clé locale (la date peut elle-même
   * être éditée — pas utilisable comme identifiant stable).
   *
   * IMPORTANT (Bug Gilles 2026-05-26) :
   * 1) On NE TRIE PAS la liste après une modification. Le tri provoquait
   *    la fermeture intempestive du date picker natif quand l'utilisateur
   *    changeait la date du 1er jour vers un mois ultérieur (la ligne
   *    était déplacée dans le DOM, ce qui déconnecte le widget de son
   *    input source). Le serveur trie de toute façon par day_date ASC
   *    à l'enregistrement.
   *
   * 2) CASCADE : si l'utilisateur modifie la date d'un jour, on décale
   *    tous les jours SUIVANTS (en position dans la liste) du même
   *    nombre de jours. Préserve les écarts (ex. session lundi+mardi
   *    → user change lundi en mercredi → mardi devient automatiquement
   *    jeudi). L'utilisateur peut toujours réajuster chaque jour ensuite.
   */
  function updateDay(key: string, patch: Partial<DayPlan>) {
    customizedRef.current.add(key);
    setDayPlans((prev) => {
      const idx = prev.findIndex((p) => p.key === key);
      if (idx === -1) return prev;
      const old = prev[idx];
      // Calcul du delta en jours si la date a changé
      let deltaDays = 0;
      if (patch.date && patch.date !== old.date && old.date) {
        const oldTs = new Date(old.date).getTime();
        const newTs = new Date(patch.date).getTime();
        if (Number.isFinite(oldTs) && Number.isFinite(newTs)) {
          deltaDays = Math.round((newTs - oldTs) / 86_400_000);
        }
      }
      return prev.map((p, i) => {
        if (i === idx) return { ...p, ...patch };
        // Cascade : décale les jours suivants du même delta. Préserve
        // l'écart entre jours.
        if (i > idx && deltaDays !== 0 && p.date) {
          return { ...p, date: addDays(p.date, deltaDays) };
        }
        return p;
      });
    });
  }

  function removeDay(key: string) {
    setDayPlans((prev) => prev.filter((p) => p.key !== key));
    customizedRef.current.delete(key);
  }

  function addDay() {
    setDayPlans((prev) => {
      // Date proposée : lendemain du dernier jour, sinon aujourd'hui
      const last = prev.length > 0 ? prev[prev.length - 1].date : "";
      const proposed = last
        ? addDays(last, 1)
        : new Date().toISOString().slice(0, 10);
      return [
        ...prev,
        {
          key: nextKey(),
          date: proposed,
          enabled: true,
          morning_start: morningStart,
          morning_end: morningEnd,
          afternoon_start: afternoonStart,
          afternoon_end: afternoonEnd,
          trainer_id: "",
          trainer_notes: "",
        },
      ];
    });
  }

  // Note : les horaires "modèles" (morningStart, etc.) sont désormais
  // figés pour la durée de vie du composant. Inutile de propager leurs
  // changements aux jours non personnalisés (ils n'ont plus de bouton
  // d'édition globale ici — ça se fait jour par jour, ou globalement
  // depuis Paramètres).

  // Écoute la sélection de formation : crée N jours vides à partir
  // d'aujourd'hui (ou conserve les jours existants si déjà saisis).
  useEffect(() => {
    function onFormationPicked(e: Event) {
      const evt = e as CustomEvent<{ duration_days: number | null }>;
      const dur = evt.detail?.duration_days ?? null;
      // Met à jour la borne supérieure (utilisée pour désactiver
      // le bouton "Ajouter un jour" au-delà de la durée formation).
      setMaxDays(dur);
      if (!dur || dur < 1) return;
      setDayPlans((prev) => {
        // Si on a déjà autant ou plus de jours, on ne touche à rien.
        if (prev.length >= dur) return prev;
        // Sinon on complète à partir du dernier jour (ou d'aujourd'hui).
        const out = [...prev];
        const todayIso = new Date().toISOString().slice(0, 10);
        let cursor =
          out.length > 0 ? out[out.length - 1].date : addDays(todayIso, -1);
        while (out.length < dur) {
          cursor = addDays(cursor, 1);
          out.push(makeDay(cursor));
        }
        return out;
      });
    }
    window.addEventListener("session:formation-picked", onFormationPicked);
    return () =>
      window.removeEventListener(
        "session:formation-picked",
        onFormationPicked,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morningStart, morningEnd, afternoonStart, afternoonEnd]);

  // Dates de début / fin auto-calculées depuis la liste
  const sortedDates = dayPlans
    .filter((d) => d.enabled)
    .map((d) => d.date)
    .filter(Boolean)
    .sort();
  const startDate = sortedDates[0] ?? "";
  const endDate = sortedDates[sortedDates.length - 1] ?? "";

  const days =
    startDate && endDate && startDate <= endDate
      ? Math.round(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) /
            (24 * 3600 * 1000),
        ) + 1
      : 0;

  // Total session : somme effective des minutes de chaque jour
  // (respecte les jours désactivés et les ajustements personnalisés).
  const totalSessionMinutes = useMemo(() => {
    if (dayPlans.length === 0) return null;
    return dayPlans.reduce((sum, d) => sum + dayMinutes(d), 0);
  }, [dayPlans]);

  const enabledDaysCount = dayPlans.filter((d) => d.enabled).length;

  return (
    <div className="space-y-5">
      {/* Indicateur des automatismes du planning. Au clic, l'utilisateur
          voit la liste exacte des règles. */}
      <div className="flex items-center gap-2">
        <AutoSyncBadge
          title="Automatismes du planning"
          rules={[
            {
              field: "Nb de jours",
              target: "Liste des jours",
              condition:
                "Pré-créés automatiquement à partir de la durée de la formation sélectionnée.",
            },
            {
              field: "Premier / dernier jour",
              target: "Dates de la session",
              condition:
                "Auto-calculés comme min / max des dates saisies dans la liste.",
            },
            {
              field: "Horaires par défaut",
              target: "Chaque jour ajouté",
              condition:
                "Appliqués aux nouveaux jours, sauf si vous les ajustez individuellement.",
            },
          ]}
          footnote={
            <>
              Les jours peuvent être <strong>non consécutifs</strong> : un
              jour de formation le 04/05 puis un autre le 21/05 sont
              parfaitement supportés.
            </>
          }
        />
      </div>
      {/* Récap dates de la session — calculées automatiquement depuis la
          liste des jours plus bas. Les dates sont transmises au serveur
          via des inputs cachés (start_date / end_date) — la table
          `sessions` continue de stocker la fenêtre min/max pour la
          compatibilité des autres modules (catalogue, kanban…). */}
      <input type="hidden" name="start_date" value={startDate} />
      <input type="hidden" name="end_date" value={endDate} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-slate-500">
            Premier jour
          </Label>
          <div className="h-9 inline-flex items-center px-3 rounded-md bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900 text-sm font-bold text-cyan-700 dark:text-cyan-400 w-full">
            {startDate ? (
              new Date(startDate).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })
            ) : (
              <span className="text-slate-400 font-normal">
                — Ajoutez un jour ci-dessous
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-slate-500">
            Dernier jour
          </Label>
          <div className="h-9 inline-flex items-center px-3 rounded-md bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900 text-sm font-bold text-cyan-700 dark:text-cyan-400 w-full">
            {endDate ? (
              new Date(endDate).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })
            ) : (
              <span className="text-slate-400 font-normal">—</span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-slate-500">
            Nombre de jours
          </Label>
          <div className="h-9 inline-flex items-center px-3 rounded-md bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900 text-sm font-bold text-cyan-700 dark:text-cyan-400">
            {enabledDaysCount > 0 ? (
              <>
                {enabledDaysCount} jour{enabledDaysCount > 1 ? "s" : ""}
              </>
            ) : (
              <span className="text-slate-400 font-normal">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Horaires par défaut — UI supprimée. Les valeurs sont conservées
          en BDD pour rétrocompat (et utilisées comme template lorsqu'un
          nouveau jour est ajouté), mais ne sont plus modifiables ici :
          tout passe désormais par le planning détaillé jour-par-jour. */}
      <input
        type="hidden"
        name="default_morning_start"
        value={morningStart}
      />
      <input type="hidden" name="default_morning_end" value={morningEnd} />
      <input
        type="hidden"
        name="default_afternoon_start"
        value={afternoonStart}
      />
      <input
        type="hidden"
        name="default_afternoon_end"
        value={afternoonEnd}
      />

      {/* Total session si plusieurs jours */}
      {totalSessionMinutes !== null && days > 1 && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="text-xs text-slate-500">
            Total session ({enabledDaysCount} jour
            {enabledDaysCount > 1 ? "s" : ""} actif
            {enabledDaysCount > 1 ? "s" : ""}) :
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 text-sm font-black">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(totalSessionMinutes)}
          </span>
        </div>
      )}

      {/* Planning jour-par-jour — la liste est désormais autoritaire :
          chaque jour a sa propre date (potentiellement non consécutive),
          ses horaires, et peut être supprimé. */}
      <div className="rounded-lg bg-white dark:bg-slate-900 border border-cyan-200 dark:border-cyan-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-cyan-200 dark:border-cyan-900 bg-cyan-50/50 dark:bg-cyan-950/20 flex items-center gap-2 flex-wrap">
          <CalendarDays className="h-4 w-4 text-cyan-700 dark:text-cyan-400" />
          <p className="text-xs uppercase tracking-wider font-bold text-cyan-800 dark:text-cyan-300">
            Planning détaillé — jour par jour
          </p>
          <p className="text-[11px] text-slate-500 hidden md:block">
            Les jours peuvent être non consécutifs.
          </p>
          {maxDays != null && dayPlans.length >= maxDays && (
            <span
              className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded"
              title={`La formation est planifiée sur ${maxDays} jour${
                maxDays > 1 ? "s" : ""
              }. Pour étendre la session, augmente d'abord la durée de la formation dans le catalogue.`}
            >
              Durée max atteinte ({maxDays} j)
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addDay}
            disabled={maxDays != null && dayPlans.length >= maxDays}
            title={
              maxDays != null && dayPlans.length >= maxDays
                ? `Impossible d'ajouter un jour : la formation sélectionnée dure ${maxDays} jour${
                    maxDays > 1 ? "s" : ""
                  }.`
                : undefined
            }
            className={cn(
              maxDays != null && dayPlans.length >= maxDays
                ? "opacity-50 cursor-not-allowed"
                : "",
              maxDays == null || dayPlans.length < maxDays ? "ml-auto" : "",
            )}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Ajouter un jour
          </Button>
        </div>
        {dayPlans.length === 0 ? (
          <div className="p-6 text-center">
            <CalendarDays className="h-8 w-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-600">
              Aucun jour planifié
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Cliquez sur <strong>« Ajouter un jour »</strong> ci-dessus,
              ou sélectionnez d&apos;abord une formation pour générer
              automatiquement le bon nombre de jours.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {dayPlans.map((d, idx) => {
              const minutes = dayMinutes(d);
              return (
                <li
                  key={d.key}
                  className={cn(
                    "px-4 py-3 flex flex-wrap items-end gap-3 transition-colors",
                    !d.enabled && "bg-slate-50 dark:bg-slate-950/40 opacity-60",
                  )}
                >
                  {/* Case d'activation + date éditable */}
                  <div className="flex items-end gap-2 flex-1 min-w-[230px]">
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={(e) =>
                        updateDay(d.key, { enabled: e.target.checked })
                      }
                      className="h-4 w-4 mb-2.5 rounded border-slate-300 text-cyan-600 cursor-pointer"
                      title="Décocher pour exclure ce jour (sans le supprimer)"
                    />
                    <div className="space-y-0.5 flex-1">
                      <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                        Jour {idx + 1}
                      </Label>
                      <Input
                        type="date"
                        value={d.date}
                        onChange={(e) =>
                          updateDay(d.key, { date: e.target.value })
                        }
                        className="h-8 text-sm font-bold"
                      />
                      {d.date && (
                        <p className="text-[10px] text-slate-500 capitalize">
                          {new Date(d.date).toLocaleDateString("fr-FR", {
                            weekday: "long",
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Matin */}
                  <div className="flex items-end gap-1">
                    <Sun className="h-3.5 w-3.5 text-amber-600 mb-2.5 shrink-0" />
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-slate-500">
                        Matin début
                      </Label>
                      <Input
                        type="time"
                        value={d.morning_start}
                        disabled={!d.enabled}
                        onChange={(e) =>
                          updateDay(d.key, { morning_start: e.target.value })
                        }
                        className="h-7 w-[90px] text-xs"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-slate-500">
                        Matin fin
                      </Label>
                      <Input
                        type="time"
                        value={d.morning_end}
                        disabled={!d.enabled}
                        onChange={(e) =>
                          updateDay(d.key, { morning_end: e.target.value })
                        }
                        className="h-7 w-[90px] text-xs"
                      />
                    </div>
                  </div>
                  {/* Après-midi */}
                  <div className="flex items-end gap-1">
                    <Sunset className="h-3.5 w-3.5 text-violet-600 mb-2.5 shrink-0" />
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-slate-500">
                        A-M début
                      </Label>
                      <Input
                        type="time"
                        value={d.afternoon_start}
                        disabled={!d.enabled}
                        onChange={(e) =>
                          updateDay(d.key, {
                            afternoon_start: e.target.value,
                          })
                        }
                        className="h-7 w-[90px] text-xs"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-slate-500">
                        A-M fin
                      </Label>
                      <Input
                        type="time"
                        value={d.afternoon_end}
                        disabled={!d.enabled}
                        onChange={(e) =>
                          updateDay(d.key, { afternoon_end: e.target.value })
                        }
                        className="h-7 w-[90px] text-xs"
                      />
                    </div>
                  </div>
                  {/* Formateur du jour (override le formateur par défaut
                      de la session si renseigné) */}
                  <div className="flex items-end gap-1">
                    <UserCog className="h-3.5 w-3.5 text-amber-700 mb-2.5 shrink-0" />
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-slate-500">
                        Formateur du jour
                      </Label>
                      <select
                        value={d.trainer_id}
                        disabled={!d.enabled || trainers.length === 0}
                        onChange={(e) =>
                          updateDay(d.key, { trainer_id: e.target.value })
                        }
                        className="h-7 w-[170px] rounded-md border border-slate-300 bg-white px-2 text-xs"
                        title="Laissez vide pour utiliser le formateur par défaut de la session"
                      >
                        <option value="">— Par défaut —</option>
                        {trainers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.last_name} {t.first_name}
                            {t.company_name ? ` · ${t.company_name}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* Consignes formateur du jour — champ agrandi (Gilles
                      2026-06-19) : sur sa propre ligne, en zone de saisie
                      multi-lignes. Ces consignes remontent dans le portail
                      formateur ET dans son agenda. */}
                  <div className="space-y-0.5 w-full">
                    <Label className="text-[10px] text-slate-500">
                      Consignes formateur (code salle, accès, matériel… —
                      transmises au formateur)
                    </Label>
                    <textarea
                      value={d.trainer_notes}
                      disabled={!d.enabled}
                      onChange={(e) =>
                        updateDay(d.key, { trainer_notes: e.target.value })
                      }
                      placeholder="Ex : Code salle 1234 · parking visiteurs au sous-sol · apporter le support v2…"
                      rows={3}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:opacity-50 resize-y min-h-[4.5rem]"
                      title="Consignes/recommandations destinées au formateur pour ce jour (affichées dans son portail et son agenda)"
                    />
                  </div>
                  {/* Total du jour */}
                  <div className="text-center min-w-[60px]">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      Total
                    </div>
                    <div
                      className={cn(
                        "text-sm font-black tabular-nums",
                        minutes > 0 ? "text-cyan-700" : "text-slate-300",
                      )}
                    >
                      {formatDuration(minutes)}
                    </div>
                  </div>
                  {/* Bouton supprimer */}
                  <button
                    type="button"
                    onClick={() => removeDay(d.key)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 hover:border-red-300 hover:bg-red-50 hover:text-red-700 text-slate-500 transition-colors mb-0.5"
                    title="Supprimer ce jour"
                    aria-label="Supprimer ce jour"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sérialisation côté client → serveur (lue par createSession /
          updateSession via la clé "custom_days"). */}
      <input
        type="hidden"
        name="custom_days"
        value={JSON.stringify(dayPlans)}
      />
    </div>
  );
}
