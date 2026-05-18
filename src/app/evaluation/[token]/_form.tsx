"use client";

import { useState } from "react";
import { CheckCircle2, ChevronLeft, Send } from "lucide-react";
import {
  CONTENT_CRITERIA,
  EXPECTATIONS_OPTIONS,
  OBJECTIVES_OPTIONS,
  ORGANIZATION_CRITERIA,
  RATING_OPTIONS,
  RATING_OPTIONS_WITH_NA,
  RECOMMENDATION_OPTIONS,
  SATISFACTION_OPTIONS,
  TRAINER_CRITERIA,
  USEFULNESS_OPTIONS,
  type ContentCriteriaKey,
  type ExpectationsValue,
  type HotEvaluationData,
  type ObjectivesValue,
  type OrganizationCriteriaKey,
  type RatingValue,
  type RatingValueNA,
  type RecommendationValue,
  type SatisfactionValue,
  type TrainerCriteriaKey,
  type UsefulnessValue,
} from "@/lib/evaluations/hot";
import { submitEvaluation } from "./actions";

export type Learner = {
  enrollmentId: string;
  learnerId: string;
  civility: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  companyName: string | null;
};

type SessionContext = {
  formationTitle: string;
  orgName: string;
  startDate: string;
  endDate: string;
  modality: string | null;
  location: string | null;
  trainerName: string;
};

type Props = {
  token: string;
  sessionId: string;
  /** Si fourni (via ?eid= depuis le portail apprenant), pré-sélectionne
   *  l'apprenant et passe directement au questionnaire. */
  initialEnrollmentId?: string | null;
  sessionContext: SessionContext;
  learners: Learner[];
  alreadySubmittedEnrollmentIds: string[];
};

function formatDateRange(start: string, end: string): string {
  if (start === end) {
    return new Date(start).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  const s = new Date(start).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
  const e = new Date(end).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `du ${s} au ${e}`;
}

function modalityLabel(m: string | null): string | null {
  if (!m) return null;
  if (m === "distanciel") return "Distanciel";
  if (m === "hybride") return "Hybride";
  if (m === "presentiel") return "Présentiel";
  return m;
}

export function EvaluationPublicForm({
  token,
  initialEnrollmentId,
  sessionContext,
  learners,
  alreadySubmittedEnrollmentIds,
}: Props) {
  // Si on arrive depuis le portail apprenant avec ?eid=, on
  // pré-sélectionne l'apprenant et on saute directement au questionnaire.
  // (Sauf s'il a déjà répondu — dans ce cas on laisse l'écran de
  // sélection qui affichera l'état "Évaluation remplie".)
  const alreadyDoneInitial = initialEnrollmentId
    ? alreadySubmittedEnrollmentIds.includes(initialEnrollmentId)
    : false;
  const [selectedLearnerId, setSelectedLearnerId] = useState<string | null>(
    initialEnrollmentId &&
      !alreadyDoneInitial &&
      learners.some((l) => l.enrollmentId === initialEnrollmentId)
      ? initialEnrollmentId
      : null,
  );
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // État du questionnaire — partiel pendant la saisie, validé au submit
  const [data, setData] = useState<Partial<HotEvaluationData>>({
    content: {},
    trainer: {},
    organization: {},
    other_training_needs_yes: false,
  });

  const selectedLearner = learners.find(
    (l) => l.enrollmentId === selectedLearnerId,
  );
  const alreadyDone = new Set(alreadySubmittedEnrollmentIds);

  function update<K extends keyof HotEvaluationData>(
    key: K,
    value: HotEvaluationData[K],
  ) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function updateGridContent(key: ContentCriteriaKey, value: RatingValue) {
    setData((prev) => ({
      ...prev,
      content: { ...(prev.content ?? {}), [key]: value },
    }));
  }

  function updateGridTrainer(key: TrainerCriteriaKey, value: RatingValue) {
    setData((prev) => ({
      ...prev,
      trainer: { ...(prev.trainer ?? {}), [key]: value },
    }));
  }

  function updateGridOrg(
    key: OrganizationCriteriaKey,
    value: RatingValueNA,
  ) {
    setData((prev) => ({
      ...prev,
      organization: { ...(prev.organization ?? {}), [key]: value },
    }));
  }

  async function handleSubmit() {
    setError(null);
    if (!selectedLearner) return;
    if (!data.satisfaction_overall) {
      setError("Veuillez répondre à la question 1 (satisfaction générale).");
      return;
    }
    if (typeof data.nps_score !== "number") {
      setError("Veuillez choisir une note entre 0 et 10 à la question 7.");
      return;
    }

    setSubmitting(true);

    const res = await submitEvaluation({
      token,
      enrollmentId: selectedLearner.enrollmentId,
      data: {
        satisfaction_overall: data.satisfaction_overall,
        satisfaction_comment: data.satisfaction_comment,
        objectives_reached: data.objectives_reached as ObjectivesValue,
        expectations_met: data.expectations_met as ExpectationsValue,
        objectives_comment: data.objectives_comment,
        content: data.content ?? {},
        content_comment: data.content_comment,
        trainer: data.trainer ?? {},
        trainer_comment: data.trainer_comment,
        organization: data.organization ?? {},
        organization_comment: data.organization_comment,
        usefulness: data.usefulness as UsefulnessValue,
        usefulness_applications: data.usefulness_applications,
        recommendation: data.recommendation as RecommendationValue,
        nps_score: data.nps_score,
        nps_reason: data.nps_reason,
        strengths: data.strengths,
        improvements: data.improvements,
        other_training_needs_yes: data.other_training_needs_yes ?? false,
        other_training_needs_text: data.other_training_needs_text,
      },
    });

    setSubmitting(false);

    if (!res.ok) {
      setError(res.error ?? "Erreur inconnue.");
      return;
    }
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // -------- Confirmation après envoi --------
  if (submitted) {
    return (
      <div className="rounded-xl bg-white shadow-sm border border-emerald-200 p-6 text-center space-y-3">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
        <h2 className="text-lg font-bold text-zinc-900">Merci !</h2>
        <p className="text-sm text-zinc-600">
          Votre évaluation a bien été enregistrée. Vos retours nous
          aident à améliorer la qualité de nos formations.
        </p>
      </div>
    );
  }

  // -------- Étape 1 : choix de l'apprenant --------
  if (!selectedLearner) {
    return (
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4">
        <h2 className="text-sm font-bold text-zinc-900 mb-1">
          1. Sélectionnez votre nom
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          Touchez votre nom dans la liste.
        </p>
        <ul className="divide-y divide-zinc-100 -mx-4">
          {learners.length === 0 && (
            <li className="px-4 py-3 text-sm text-zinc-500 italic">
              Aucun apprenant inscrit à cette session.
            </li>
          )}
          {learners.map((l) => {
            const done = alreadyDone.has(l.enrollmentId);
            return (
              <li key={l.enrollmentId}>
                <button
                  type="button"
                  onClick={() => !done && setSelectedLearnerId(l.enrollmentId)}
                  disabled={done}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                >
                  <span>
                    <span className="font-medium text-zinc-900">
                      {l.civility ? `${l.civility} ` : ""}
                      {l.fullName}
                    </span>
                    {l.companyName && (
                      <span className="block text-xs text-zinc-500 mt-0.5">
                        {l.companyName}
                      </span>
                    )}
                  </span>
                  {done && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="h-3 w-3" />
                      Évaluation remplie
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // -------- Étape 2 : questionnaire --------
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4">
        <button
          type="button"
          onClick={() => setSelectedLearnerId(null)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 mb-2"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Changer d&apos;apprenant
        </button>
        <h2 className="text-sm text-zinc-500">Évaluation par</h2>
        <p className="text-lg font-bold text-zinc-900">
          {selectedLearner.civility ? `${selectedLearner.civility} ` : ""}
          {selectedLearner.fullName}
        </p>
        <dl className="mt-2 grid grid-cols-1 gap-y-1 text-xs text-zinc-600">
          <div><dt className="inline font-semibold">Formation :</dt> <dd className="inline">{sessionContext.formationTitle}</dd></div>
          <div><dt className="inline font-semibold">Dates :</dt> <dd className="inline">{formatDateRange(sessionContext.startDate, sessionContext.endDate)}</dd></div>
          <div><dt className="inline font-semibold">Formateur :</dt> <dd className="inline">{sessionContext.trainerName}</dd></div>
          {modalityLabel(sessionContext.modality) && (
            <div><dt className="inline font-semibold">Modalité :</dt> <dd className="inline">{modalityLabel(sessionContext.modality)}</dd></div>
          )}
        </dl>
      </div>

      {/* Section 1 — Satisfaction globale */}
      <Section number={1} title="Satisfaction générale">
        <RadioGroup
          legend="Quel est votre niveau de satisfaction global concernant cette formation ?"
          required
          options={SATISFACTION_OPTIONS}
          value={data.satisfaction_overall}
          onChange={(v) => update("satisfaction_overall", v as SatisfactionValue)}
        />
        <CommentField
          label="Commentaire éventuel"
          value={data.satisfaction_comment}
          onChange={(v) => update("satisfaction_comment", v)}
        />
      </Section>

      {/* Section 2 — Objectifs */}
      <Section number={2} title="Objectifs pédagogiques">
        <RadioGroup
          legend="Les objectifs annoncés en début de formation ont-ils été atteints ?"
          options={OBJECTIVES_OPTIONS}
          value={data.objectives_reached}
          onChange={(v) => update("objectives_reached", v as ObjectivesValue)}
        />
        <RadioGroup
          legend="La formation a-t-elle répondu à vos attentes ?"
          options={EXPECTATIONS_OPTIONS}
          value={data.expectations_met}
          onChange={(v) => update("expectations_met", v as ExpectationsValue)}
        />
        <CommentField
          label="Précisez si besoin"
          value={data.objectives_comment}
          onChange={(v) => update("objectives_comment", v)}
        />
      </Section>

      {/* Section 3 — Contenu (grille) */}
      <Section number={3} title="Contenu de la formation">
        <RatingGrid
          criteria={CONTENT_CRITERIA}
          options={RATING_OPTIONS}
          values={data.content ?? {}}
          onChange={(k, v) => updateGridContent(k as ContentCriteriaKey, v as RatingValue)}
        />
        <CommentField
          label="Commentaire éventuel"
          value={data.content_comment}
          onChange={(v) => update("content_comment", v)}
        />
      </Section>

      {/* Section 4 — Formateur (grille) */}
      <Section number={4} title="Animation du formateur">
        <RatingGrid
          criteria={TRAINER_CRITERIA}
          options={RATING_OPTIONS}
          values={data.trainer ?? {}}
          onChange={(k, v) => updateGridTrainer(k as TrainerCriteriaKey, v as RatingValue)}
        />
        <CommentField
          label="Commentaire éventuel"
          value={data.trainer_comment}
          onChange={(v) => update("trainer_comment", v)}
        />
      </Section>

      {/* Section 5 — Organisation (grille avec NA) */}
      <Section number={5} title="Organisation et moyens pédagogiques">
        <RatingGrid
          criteria={ORGANIZATION_CRITERIA}
          options={RATING_OPTIONS_WITH_NA}
          values={data.organization ?? {}}
          onChange={(k, v) => updateGridOrg(k as OrganizationCriteriaKey, v as RatingValueNA)}
        />
        <CommentField
          label="Commentaire éventuel"
          value={data.organization_comment}
          onChange={(v) => update("organization_comment", v)}
        />
      </Section>

      {/* Section 6 — Utilité pro */}
      <Section number={6} title="Utilité professionnelle">
        <RadioGroup
          legend="Pensez-vous pouvoir réutiliser les acquis de cette formation dans votre activité professionnelle ?"
          options={USEFULNESS_OPTIONS}
          value={data.usefulness}
          onChange={(v) => update("usefulness", v as UsefulnessValue)}
        />
        <CommentField
          label="Quels éléments principaux allez-vous pouvoir appliquer ?"
          value={data.usefulness_applications}
          onChange={(v) => update("usefulness_applications", v)}
        />
      </Section>

      {/* Section 7 — Recommandation + NPS */}
      <Section number={7} title="Recommandation de la formation">
        <RadioGroup
          legend="Recommanderiez-vous cette formation à un collègue, une entreprise ou un confrère ?"
          options={RECOMMENDATION_OPTIONS}
          value={data.recommendation}
          onChange={(v) => update("recommendation", v as RecommendationValue)}
        />
        <NpsScale
          value={data.nps_score}
          onChange={(v) => update("nps_score", v)}
        />
        <CommentField
          label="Pourquoi cette note ?"
          value={data.nps_reason}
          onChange={(v) => update("nps_reason", v)}
        />
      </Section>

      {/* Section 8 — Amélioration */}
      <Section number={8} title="Amélioration continue">
        <CommentField
          label="Quels sont les points forts de la formation ?"
          value={data.strengths}
          onChange={(v) => update("strengths", v)}
        />
        <CommentField
          label="Quels sont les points à améliorer ?"
          value={data.improvements}
          onChange={(v) => update("improvements", v)}
        />
        <div className="space-y-2">
          <div className="text-sm font-medium text-zinc-800">
            Avez-vous d&apos;autres besoins de formation ?
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="other_needs"
              checked={data.other_training_needs_yes === false}
              onChange={() => update("other_training_needs_yes", false)}
            />
            Non
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="other_needs"
              checked={data.other_training_needs_yes === true}
              onChange={() => update("other_training_needs_yes", true)}
            />
            Oui, lesquels :
          </label>
          {data.other_training_needs_yes && (
            <textarea
              value={data.other_training_needs_text ?? ""}
              onChange={(e) =>
                update("other_training_needs_text", e.target.value)
              }
              rows={3}
              className="w-full rounded-md border border-zinc-300 p-2 text-sm"
              placeholder="Précisez vos besoins…"
            />
          )}
        </div>
      </Section>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 text-white font-bold hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
      >
        <Send className="h-4 w-4" />
        {submitting ? "Envoi…" : "Envoyer mon évaluation"}
      </button>

      <p className="text-[11px] text-zinc-500 text-center">
        Une fois envoyée, l&apos;évaluation ne peut plus être modifiée.
      </p>
    </div>
  );
}

// ============================================================
// Composants internes
// ============================================================

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4 space-y-4">
      <h2 className="font-bold text-zinc-900 text-base">
        <span className="text-cyan-600">{number}.</span> {title}
      </h2>
      {children}
    </section>
  );
}

function RadioGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  required,
}: {
  legend: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | undefined;
  onChange: (v: T) => void;
  required?: boolean;
}) {
  const groupName = `g-${legend.replace(/\s/g, "-").slice(0, 30)}-${Math.random().toString(36).slice(2, 6)}`;
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-zinc-800">
        {legend}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </div>
      <div className="space-y-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-zinc-50"
          >
            <input
              type="radio"
              name={groupName}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RatingGrid({
  criteria,
  options,
  values,
  onChange,
}: {
  criteria: ReadonlyArray<{ key: string; label: string }>;
  options: ReadonlyArray<{ value: string; label: string }>;
  values: Record<string, string | undefined>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-3 -mx-1">
      {criteria.map((c) => (
        <div key={c.key} className="space-y-1.5 px-1">
          <div className="text-sm font-medium text-zinc-800">{c.label}</div>
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
            {options.map((o) => {
              const checked = values[c.key] === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChange(c.key, o.value)}
                  className={
                    checked
                      ? "text-xs px-2.5 py-1.5 rounded-full bg-cyan-600 text-white font-semibold"
                      : "text-xs px-2.5 py-1.5 rounded-full bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function NpsScale({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-zinc-800">
        Sur une échelle de 0 à 10, quelle note donneriez-vous ?
        <span className="text-red-500 ml-0.5">*</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const checked = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={
                checked
                  ? "h-9 w-9 rounded-md font-bold text-sm bg-cyan-600 text-white"
                  : "h-9 w-9 rounded-md font-bold text-sm bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }
              aria-label={`Note ${n}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500 px-0.5">
        <span>Pas du tout</span>
        <span>Absolument</span>
      </div>
    </div>
  );
}

function CommentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-zinc-500">{label}</label>
      <textarea
        rows={3}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 p-2 text-sm"
      />
    </div>
  );
}
