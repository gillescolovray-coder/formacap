"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Save,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  BLOOM_LEVELS,
  type BloomObjective,
  type BloomLevelKey,
} from "@/lib/bloom/types";
import {
  createBlueprint,
  saveBlueprint,
  submitForReview,
  generateObjectivesAction,
  generateGeneralObjectiveAction,
  listThemesAction,
  type BlueprintFields,
} from "./actions";

const LEVEL_BADGE: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  sky: "bg-sky-100 text-sky-700 border-sky-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  violet: "bg-violet-100 text-violet-700 border-violet-200",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
};

type Initial = {
  id?: string;
  internal_code?: string | null;
  title?: string | null;
  theme?: string | null;
  target_audience?: string | null;
  duration_hours?: number | null;
  duration_days?: number | null;
  general_objective?: string | null;
  bloom_objectives?: BloomObjective[];
  status?: string;
};

export function BlueprintEditor({
  initial,
  canEdit,
}: {
  initial: Initial;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | undefined>(initial.id);
  const [fields, setFields] = useState<BlueprintFields>({
    internal_code: initial.internal_code ?? null,
    title: initial.title ?? "",
    theme: initial.theme ?? null,
    target_audience: initial.target_audience ?? null,
    duration_hours: initial.duration_hours ?? null,
    duration_days: initial.duration_days ?? null,
    general_objective: initial.general_objective ?? null,
  });
  const [objectives, setObjectives] = useState<BloomObjective[]>(
    initial.bloom_objectives ?? [],
  );
  const [status, setStatus] = useState<string>(initial.status ?? "draft");
  const [generating, startGen] = useTransition();
  const [generatingObj, startGenObj] = useTransition();
  const [saving, startSave] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [themeOptions, setThemeOptions] = useState<string[]>([]);

  // Charge la liste des thèmes déjà utilisés (pour le menu déroulant).
  useEffect(() => {
    listThemesAction().then(setThemeOptions).catch(() => {});
  }, []);

  function setField<K extends keyof BlueprintFields>(
    k: K,
    v: BlueprintFields[K],
  ) {
    setFields((f) => ({ ...f, [k]: v }));
  }

  function generate() {
    setMsg(null);
    startGen(async () => {
      const res = await generateObjectivesAction({
        title: fields.title,
        theme: fields.theme,
        targetAudience: fields.target_audience,
        durationHours: fields.duration_hours,
        generalObjective: fields.general_objective,
      });
      if (res.ok) {
        setObjectives((prev) => [...prev, ...res.objectives]);
        setMsg({ t: "ok", m: `${res.objectives.length} objectif(s) proposé(s) par l'IA.` });
      } else {
        setMsg({ t: "err", m: res.error });
      }
    });
  }

  function generateGeneral() {
    setMsg(null);
    startGenObj(async () => {
      const res = await generateGeneralObjectiveAction({
        title: fields.title,
        theme: fields.theme,
        targetAudience: fields.target_audience,
        durationHours: fields.duration_hours,
        // On s'appuie sur les objectifs opérationnels (programme réadapté).
        existingObjectives: objectives.map((o) => o.text).filter(Boolean),
      });
      if (res.ok) {
        setField("general_objective", res.objective);
        setMsg({ t: "ok", m: "Objectif général proposé par l'IA." });
      } else {
        setMsg({ t: "err", m: res.error });
      }
    });
  }

  function addManual() {
    setObjectives((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: "",
        bloom_level: "understand" as BloomLevelKey,
        action_verb: null,
      },
    ]);
  }

  function updateObj(oid: string, patch: Partial<BloomObjective>) {
    setObjectives((prev) =>
      prev.map((o) => (o.id === oid ? { ...o, ...patch } : o)),
    );
  }
  function removeObj(oid: string) {
    setObjectives((prev) => prev.filter((o) => o.id !== oid));
  }

  function save(then?: () => void) {
    setMsg(null);
    startSave(async () => {
      if (!id) {
        const res = await createBlueprint(fields);
        if (!res.ok) return setMsg({ t: "err", m: res.error });
        // Sauve les objectifs déjà saisis sur la fiche fraîchement créée.
        const res2 = await saveBlueprint(res.id, fields, objectives);
        if (!res2.ok) return setMsg({ t: "err", m: res2.error ?? "Erreur" });
        setId(res.id);
        router.replace(`/programmes/${res.id}`);
        setMsg({ t: "ok", m: "Programme créé." });
        then?.();
      } else {
        const res = await saveBlueprint(id, fields, objectives);
        if (!res.ok) return setMsg({ t: "err", m: res.error ?? "Erreur" });
        setMsg({ t: "ok", m: "Enregistré." });
        then?.();
      }
    });
  }

  function submit() {
    if (objectives.length === 0) {
      setMsg({ t: "err", m: "Ajoutez au moins un objectif avant de soumettre." });
      return;
    }
    startSubmit(async () => {
      // On sauvegarde d'abord pour ne rien perdre.
      const sid = id;
      if (!sid) {
        const res = await createBlueprint(fields);
        if (!res.ok) return setMsg({ t: "err", m: res.error });
        await saveBlueprint(res.id, fields, objectives);
        setId(res.id);
        const sub = await submitForReview(res.id);
        if (!sub.ok) return setMsg({ t: "err", m: sub.error ?? "Erreur" });
        router.replace(`/programmes/${res.id}`);
      } else {
        await saveBlueprint(sid, fields, objectives);
        const sub = await submitForReview(sid);
        if (!sub.ok) return setMsg({ t: "err", m: sub.error ?? "Erreur" });
      }
      setStatus("pending_review");
      setMsg({ t: "ok", m: "Soumis au référent pédagogique pour validation." });
      router.refresh();
    });
  }

  const locked = !canEdit;
  const canSubmit = status === "draft" || status === "changes_requested";

  return (
    <div className="space-y-5">
      {msg && (
        <div
          className={
            msg.t === "ok"
              ? "rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2"
              : "rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm px-3 py-2"
          }
        >
          {msg.m}
        </div>
      )}

      {/* Informations de base */}
      <section className="rounded-2xl bg-white border border-zinc-200 p-4 sm:p-5 space-y-3">
        <h2 className="text-sm font-bold text-zinc-800">Informations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Titre *">
            <input
              className={inputCls}
              value={fields.title}
              disabled={locked}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Ex. Savoir bien répondre aux appels d'offres"
            />
          </Field>
          <Field label="Référence">
            <input
              className={inputCls}
              value={fields.internal_code ?? ""}
              disabled={locked}
              onChange={(e) => setField("internal_code", e.target.value || null)}
              placeholder="Ex. FP-AOV1"
            />
          </Field>
          <Field label="Thème">
            <input
              className={inputCls}
              list="blueprint-theme-options"
              value={fields.theme ?? ""}
              disabled={locked}
              onChange={(e) => setField("theme", e.target.value || null)}
              placeholder="Choisissez ou saisissez un thème…"
            />
            <datalist id="blueprint-theme-options">
              {themeOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {!locked && (
              <p className="text-[11px] text-zinc-500 mt-1">
                Choisissez un thème existant dans la liste, ou{" "}
                <strong>tapez un nouveau thème</strong> : il sera ajouté
                automatiquement et proposé pour les prochains programmes.
              </p>
            )}
          </Field>
          <Field label="Public visé">
            <input
              className={inputCls}
              value={fields.target_audience ?? ""}
              disabled={locked}
              onChange={(e) =>
                setField("target_audience", e.target.value || null)
              }
              placeholder="Ex. Responsables commerciaux, chargés d'affaires"
            />
          </Field>
          <Field label="Durée (heures)">
            <input
              type="number"
              step="0.5"
              className={inputCls}
              value={fields.duration_hours ?? ""}
              disabled={locked}
              onChange={(e) =>
                setField(
                  "duration_hours",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              placeholder="7"
            />
          </Field>
          <Field label="Durée (jours)">
            <input
              type="number"
              step="0.5"
              className={inputCls}
              value={fields.duration_days ?? ""}
              disabled={locked}
              onChange={(e) =>
                setField(
                  "duration_days",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              placeholder="1"
            />
          </Field>
        </div>
        <Field label="Objectif général">
          {!locked && (
            <div className="flex justify-end mb-1.5">
              <button
                type="button"
                onClick={generateGeneral}
                disabled={generatingObj}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-50"
                title="Proposer un objectif général à partir du titre, du thème et des objectifs opérationnels"
              >
                {generatingObj ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                Proposer (IA)
              </button>
            </div>
          )}
          <textarea
            className={inputCls + " min-h-[70px]"}
            value={fields.general_objective ?? ""}
            disabled={locked}
            onChange={(e) =>
              setField("general_objective", e.target.value || null)
            }
            placeholder="Décrivez en une phrase ce que la formation permet d'atteindre."
          />
        </Field>
      </section>

      {/* Objectifs Bloom */}
      <section className="rounded-2xl bg-white border border-zinc-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-bold text-zinc-800">
            Objectifs opérationnels (taxonomie de Bloom)
          </h2>
          {!locked && (
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Proposer les objectifs (IA)
            </button>
          )}
        </div>

        {objectives.length === 0 ? (
          <div className="rounded-lg bg-zinc-50 border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
            <Sparkles className="h-6 w-6 text-violet-400 mx-auto mb-1" />
            Aucun objectif. Renseignez le titre/thème puis cliquez «&nbsp;Proposer
            les objectifs (IA)&nbsp;», ou ajoutez-les à la main.
          </div>
        ) : (
          <ul className="space-y-2">
            {objectives.map((o, idx) => {
              const lvl = BLOOM_LEVELS.find((l) => l.key === o.bloom_level);
              return (
                <li
                  key={o.id}
                  className="rounded-lg border border-zinc-200 p-3 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold text-zinc-400 mt-2 tabular-nums">
                      {idx + 1}.
                    </span>
                    <textarea
                      className={inputCls + " min-h-[44px]"}
                      value={o.text}
                      disabled={locked}
                      onChange={(e) => updateObj(o.id, { text: e.target.value })}
                      placeholder="À l'issue, l'apprenant sera capable de…"
                    />
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => removeObj(o.id)}
                        className="shrink-0 mt-1 text-zinc-400 hover:text-rose-600"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pl-6">
                    <span
                      className={
                        "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border " +
                        (lvl ? LEVEL_BADGE[lvl.color] : "")
                      }
                    >
                      {lvl?.label ?? o.bloom_level}
                    </span>
                    <select
                      className="h-8 rounded-md border border-zinc-300 text-xs px-2"
                      value={o.bloom_level}
                      disabled={locked}
                      onChange={(e) =>
                        updateObj(o.id, {
                          bloom_level: e.target.value as BloomLevelKey,
                        })
                      }
                    >
                      {BLOOM_LEVELS.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.order}. {l.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="h-8 rounded-md border border-zinc-300 text-xs px-2 w-36"
                      value={o.action_verb ?? ""}
                      disabled={locked}
                      onChange={(e) =>
                        updateObj(o.id, { action_verb: e.target.value || null })
                      }
                      placeholder="verbe d'action"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!locked && (
          <button
            type="button"
            onClick={addManual}
            className="inline-flex items-center gap-1.5 text-sm text-cyan-700 hover:text-cyan-900 font-semibold"
          >
            <Plus className="h-4 w-4" />
            Ajouter un objectif manuellement
          </button>
        )}
      </section>

      {/* Actions */}
      {!locked && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-300 bg-white text-sm font-bold hover:bg-zinc-50 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Enregistrer le brouillon
          </button>
          {canSubmit && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Soumettre au référent
            </button>
          )}
        </div>
      )}

      {/* Aperçu du rendu final (programme imprimable / PDF) */}
      {id && (
        <div className="flex flex-col gap-1">
          <a
            href={`/programmes/${id}/apercu`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-800 text-sm font-bold hover:bg-indigo-100 w-fit"
          >
            <Eye className="h-4 w-4" />
            Visualiser le rendu (PDF)
          </a>
          {!locked && (
            <p className="text-[11px] text-zinc-500">
              Enregistrez d&apos;abord pour voir vos dernières modifications
              dans l&apos;aperçu.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-zinc-600">{label}</span>
      {children}
    </label>
  );
}
