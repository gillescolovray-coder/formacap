"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Save } from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import {
  OBJECTIVES_OPTIONS,
  type ObjectivesReached,
  type TrainerReport,
} from "@/lib/trainer-report/types";
import { saveTrainerReportFromPortal } from "./actions";

type Props = {
  token: string;
  sessionId: string;
  trainerName: string;
  initial: TrainerReport;
  initialSignedAt: string | null;
  /** Signature déjà enregistrée (data URL) — réaffichée pour rassurer le
   *  formateur qui revient sur un bilan signé (Gilles 2026-06-19). */
  initialSignature?: string | null;
};

/**
 * Module 7 — Formulaire "Bilan formateur" (Qualiopi RNQ ind. 11/22/32).
 *
 * Rempli depuis le portail formateur en fin de session. Signature
 * obligatoire pour validation finale (R9 : signature en direct via
 * SignaturePad). Re-modifiable tant que le formateur le souhaite —
 * l'horodatage de signature est mis à jour à chaque enregistrement
 * avec signature.
 */
export function TrainerReportForm({
  token,
  sessionId,
  trainerName,
  initial,
  initialSignedAt,
  initialSignature = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // États contrôlés des champs
  const [objectives, setObjectives] = useState<ObjectivesReached | "">(
    initial.objectives_reached ?? "",
  );
  const [objectivesComment, setObjectivesComment] = useState(
    initial.objectives_comment ?? "",
  );
  const [groupLevel, setGroupLevel] = useState(initial.group_level ?? "");
  const [adaptations, setAdaptations] = useState(initial.adaptations_made ?? "");
  const [engagement, setEngagement] = useState(
    initial.engagement_dynamics ?? "",
  );
  const [difficulties, setDifficulties] = useState(initial.difficulties ?? "");
  const [improvements, setImprovements] = useState(initial.improvements ?? "");
  const [recommendations, setRecommendations] = useState(
    initial.learner_recommendations ?? "",
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const signature = hasDrawn ? padRef.current?.getDataURL() ?? null : null;

    const report: TrainerReport = {
      objectives_reached: (objectives || undefined) as
        | ObjectivesReached
        | undefined,
      objectives_comment: objectivesComment,
      group_level: groupLevel,
      adaptations_made: adaptations,
      engagement_dynamics: engagement,
      difficulties,
      improvements,
      learner_recommendations: recommendations,
    };

    startTransition(async () => {
      const res = await saveTrainerReportFromPortal(
        token,
        sessionId,
        report,
        trainerName,
        signature,
      );
      if (!res.ok) {
        setError(res.error ?? "Erreur inconnue.");
        return;
      }
      setSuccess(true);
      if (signature) {
        padRef.current?.clear();
        setHasDrawn(false);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-2">
      {initialSignedAt && (
        <div className="rounded-lg bg-emerald-50 border-2 border-emerald-300 p-3.5 text-sm text-emerald-900">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">
                ✅ Vous avez signé votre bilan le{" "}
                {new Date(initialSignedAt).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                .
              </p>
              <p className="text-emerald-800 leading-relaxed">
                Vous n&apos;avez plus rien à faire. Si vous souhaitez{" "}
                <strong>modifier</strong> ce bilan, apportez vos changements
                ci-dessous puis <strong>re-signez</strong> en bas pour valider
                la nouvelle version.
              </p>
            </div>
          </div>
          {initialSignature && (
            <div className="mt-2.5 pt-2.5 border-t border-emerald-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
                Votre signature enregistrée
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={initialSignature}
                alt="Votre signature"
                className="h-20 w-auto max-w-[260px] bg-white rounded border border-emerald-200 p-1"
              />
            </div>
          )}
        </div>
      )}

      {/* 1. Atteinte des objectifs */}
      <Field label="Atteinte des objectifs pédagogiques">
        <div className="flex flex-wrap gap-2">
          {OBJECTIVES_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={
                "cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold border-2 transition-colors " +
                (objectives === o.value
                  ? "bg-cyan-600 text-white border-cyan-600"
                  : "bg-white text-zinc-700 border-zinc-300 hover:border-cyan-400")
              }
            >
              <input
                type="radio"
                name="objectives"
                value={o.value}
                checked={objectives === o.value}
                onChange={() => setObjectives(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          ))}
        </div>
        <Textarea
          value={objectivesComment}
          onChange={setObjectivesComment}
          placeholder="Commentaire libre sur l'atteinte des objectifs"
          rows={2}
          className="mt-2"
        />
      </Field>

      <Field label="Niveau et homogénéité du groupe">
        <Textarea
          value={groupLevel}
          onChange={setGroupLevel}
          placeholder="Ex : groupe hétérogène (2 débutants, 3 confirmés), bonne cohésion."
          rows={2}
        />
      </Field>

      <Field label="Adaptations effectuées">
        <Textarea
          value={adaptations}
          onChange={setAdaptations}
          placeholder="Rythme, supports adaptés, accompagnement individuel, handicap…"
          rows={2}
        />
      </Field>

      <Field label="Engagement et dynamique du groupe">
        <Textarea
          value={engagement}
          onChange={setEngagement}
          placeholder="Participation, attention, dynamique d'équipe, ambiance…"
          rows={2}
        />
      </Field>

      <Field label="Difficultés rencontrées">
        <Textarea
          value={difficulties}
          onChange={setDifficulties}
          placeholder="Techniques, pédagogiques, organisationnelles, comportementales…"
          rows={2}
        />
      </Field>

      <Field label="Pistes d'amélioration pour la prochaine session">
        <Textarea
          value={improvements}
          onChange={setImprovements}
          placeholder="Ce que vous ajusteriez la prochaine fois."
          rows={2}
        />
      </Field>

      <Field label="Recommandations individuelles par apprenant">
        <Textarea
          value={recommendations}
          onChange={setRecommendations}
          placeholder="Ex : Sylvain → parcours complémentaire VBA, Mikaël → certification PIX."
          rows={3}
        />
      </Field>

      {/* Signature en direct */}
      <div className="pt-2 border-t border-zinc-100">
        <p className="text-xs font-semibold text-zinc-700 mb-1.5">
          Signature ({trainerName})
        </p>
        <p className="text-[11px] text-zinc-500 mb-2">
          Signez ci-dessous pour valider le bilan. La signature est tracée en
          direct (preuve Qualiopi R9). Sans signature, le bilan est enregistré
          en brouillon.
          {initialSignedAt && (
            <>
              {" "}
              <span className="text-amber-700 font-medium">
                Ce cadre est volontairement vide : re-signez ici uniquement si
                vous venez de modifier le bilan.
              </span>
            </>
          )}
        </p>
        <div className="flex justify-center">
          <SignaturePad
            ref={padRef}
            width={320}
            height={120}
            onChange={(empty) => setHasDrawn(!empty)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Bilan enregistré{hasDrawn ? " et signé" : " (brouillon, non signé)"}.
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Save className="h-4 w-4" />
        {pending
          ? "Enregistrement…"
          : hasDrawn
            ? "Enregistrer et signer"
            : "Enregistrer (brouillon)"}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-700 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 2,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={
        "w-full text-sm rounded-md border border-zinc-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 resize-y " +
        className
      }
    />
  );
}
