"use client";

/**
 * Formulaire d'observation formateur (section 7 — Sprint D).
 * Le formateur le remplit APRÈS lecture du test apprenant pour
 * déclarer les adaptations qu'il prévoit (Qualiopi indicateur 12).
 *
 * Réutilisable côté admin (auth Supabase) et côté formateur portal
 * (token URL). La server action est injectée en prop pour permettre
 * les 2 contextes d'authentification.
 */

import { useState, useTransition } from "react";
import { CheckCircle2, Save } from "lucide-react";
import {
  TRAINER_ADAPTATIONS,
  type PositioningTrainerObservation,
  type TrainerAdaptationValue,
} from "./types";

type Props = {
  /** Si l'observation a déjà été remplie, on pré-remplit le formulaire. */
  initial?: PositioningTrainerObservation | null;
  initialFilledAt?: string | null;
  /** Server action appelée au submit. Renvoie { ok } ou { error }. */
  action: (
    observation: PositioningTrainerObservation,
  ) => Promise<{ ok: boolean; error?: string }>;
};

export function TrainerObservationForm({
  initial,
  initialFilledAt,
  action,
}: Props) {
  const [adaptations, setAdaptations] = useState<TrainerAdaptationValue[]>(
    initial?.adaptations ?? [],
  );
  const [otherText, setOtherText] = useState<string>(
    initial?.other_adaptation_text ?? "",
  );
  const [trainerComment, setTrainerComment] = useState<string>(
    initial?.trainer_comment ?? "",
  );
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  function toggle(v: TrainerAdaptationValue) {
    setAdaptations((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  function handleSubmit() {
    setFeedback(null);
    const payload: PositioningTrainerObservation = {
      adaptations,
      other_adaptation_text: adaptations.includes("other")
        ? otherText.trim() || undefined
        : undefined,
      trainer_comment: trainerComment.trim() || undefined,
    };
    startTransition(async () => {
      const res = await action(payload);
      if (res.ok) {
        setFeedback({ ok: true, msg: "Observation enregistrée." });
      } else {
        setFeedback({
          ok: false,
          msg: res.error ?? "Erreur lors de l'enregistrement.",
        });
      }
    });
  }

  return (
    <section className="rounded-xl bg-violet-50/40 border border-violet-200 p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-sm text-zinc-900">
          <span className="text-violet-700">7.</span> Observation du formateur
          <span className="ml-2 text-[11px] font-normal text-zinc-500">
            (à remplir APRÈS lecture du test apprenant)
          </span>
        </h3>
        {initialFilledAt && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Rempli le{" "}
            {new Date(initialFilledAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        )}
      </header>

      <div className="space-y-2">
        <div className="text-sm font-medium text-zinc-800">
          Adaptations prévues (plusieurs choix possibles) :
        </div>
        <div className="space-y-1.5">
          {TRAINER_ADAPTATIONS.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-white/60"
            >
              <input
                type="checkbox"
                checked={adaptations.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="rounded"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      {adaptations.includes("other") && (
        <div className="space-y-1.5">
          <label className="text-xs text-zinc-600 block">
            Précisez l&apos;autre adaptation :
          </label>
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
            placeholder="Ex : support distribué en gros caractères"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs text-zinc-600 block">
          Commentaire libre (facultatif) :
        </label>
        <textarea
          value={trainerComment}
          onChange={(e) => setTrainerComment(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm bg-white"
          placeholder="Remarques pédagogiques, points à surveiller…"
        />
      </div>

      {feedback && (
        <div
          className={
            feedback.ok
              ? "rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800"
              : "rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800"
          }
        >
          {feedback.msg}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {pending
            ? "Enregistrement…"
            : initialFilledAt
              ? "Mettre à jour l'observation"
              : "Enregistrer l'observation"}
        </button>
      </div>
    </section>
  );
}
