"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import {
  ADEQUACY_OPTIONS,
  EQUIPMENT_OPTIONS,
  EXPECTATION_CHOICES,
  LEVEL_OPTIONS,
  MASTERY_CRITERIA,
  MASTERY_OPTIONS,
  PRACTICE_OPTIONS,
  PREREQ_OPTIONS,
  type AdequacyValue,
  type EquipmentValue,
  type ExpectationValue,
  type LevelValue,
  type MasteryCriteriaKey,
  type MasteryValue,
  type PositioningLearnerData,
  type PracticeValue,
  type PrereqValue,
} from "@/lib/positioning/types";
import type { PositioningChoice } from "@/lib/positioning/templates";
import { submitPositioning } from "./actions";

type Context = {
  orgName: string;
  formationTitle: string;
  startDate: string;
  endDate: string;
  modality: string | null;
  learnerName: string;
  civility: string | null;
  companyName: string | null;
  jobTitle: string | null;
};

type Props = {
  portalToken: string;
  context: Context;
  /** Mode aperçu : le submit ne sauvegarde pas, affiche un message
   *  "Aperçu — pas d'enregistrement" (Gilles 2026-05-25). */
  previewMode?: boolean;
  /** Choix proposés à la section 2 'Attentes' — issus du template
   *  positionnement assigné à la session. Fallback : valeurs hardcodées
   *  d'origine (migration 0105). */
  expectationChoices?: PositioningChoice[];
  /** Critères de la section 5 'Compétences à auto-évaluer' — idem,
   *  issus du template positionnement assigné à la session. */
  masteryCriteria?: PositioningChoice[];
};

function modalityLabel(m: string | null): string {
  if (m === "presentiel") return "Présentiel";
  if (m === "distanciel") return "Distanciel";
  if (m === "hybride") return "Hybride";
  return "—";
}

function formatDateRange(start: string, end: string): string {
  if (start === end) {
    return new Date(start).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  return `du ${new Date(start).toLocaleDateString("fr-FR")} au ${new Date(end).toLocaleDateString("fr-FR")}`;
}

export function PositioningForm({
  portalToken,
  context,
  previewMode = false,
  expectationChoices,
  masteryCriteria,
}: Props) {
  // Fallback sur les valeurs hardcodées historiques si aucun template
  // n'a été fourni (compat ascendante + sécurité).
  const expectationOpts: ReadonlyArray<{
    key?: string;
    value?: string;
    label: string;
  }> =
    expectationChoices && expectationChoices.length > 0
      ? expectationChoices
      : (EXPECTATION_CHOICES as ReadonlyArray<{ value: string; label: string }>);
  const masteryItems: ReadonlyArray<{ key: string; label: string }> =
    masteryCriteria && masteryCriteria.length > 0
      ? masteryCriteria
      : (MASTERY_CRITERIA as ReadonlyArray<{ key: string; label: string }>);

  // Helper : extrait la "key" depuis un item d'expectation choices,
  // qu'il vienne du template (key) ou des constantes historiques (value).
  const expKey = (o: { key?: string; value?: string }) =>
    (o.key ?? o.value ?? "") as ExpectationValue;
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const [data, setData] = useState<Partial<PositioningLearnerData>>({
    expectations: [],
    mastery: {},
    has_adaptation_need: false,
    wants_contact: false,
    remote_equipment: context.modality === "presentiel" ? "na" : undefined,
  });

  function update<K extends keyof PositioningLearnerData>(
    key: K,
    value: PositioningLearnerData[K],
  ) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleExpectation(v: ExpectationValue) {
    setData((prev) => {
      const list = prev.expectations ?? [];
      return {
        ...prev,
        expectations: list.includes(v)
          ? list.filter((x) => x !== v)
          : [...list, v],
      };
    });
  }

  function setMastery(key: MasteryCriteriaKey, v: MasteryValue) {
    setData((prev) => ({
      ...prev,
      mastery: { ...(prev.mastery ?? {}), [key]: v },
    }));
  }

  async function handleSubmit() {
    setError(null);
    if (!data.current_level || !data.practice_frequency) {
      setError("Veuillez répondre à la section 1 (niveau initial).");
      return;
    }
    if (!data.prereq_meets || !data.remote_equipment) {
      setError("Veuillez répondre à la section 3 (prérequis).");
      return;
    }
    if (data.has_adaptation_need === undefined) {
      setError("Veuillez répondre à la section 4 (handicap / adaptation).");
      return;
    }
    if (!data.adequacy) {
      setError("Veuillez répondre à la section 6 (adéquation).");
      return;
    }

    setSubmitting(true);
    const signatureDataUrl = padRef.current?.getDataURL() ?? null;

    // Mode aperçu : on simule un submit sans appel serveur
    if (previewMode) {
      await new Promise((r) => setTimeout(r, 300));
      setSubmitting(false);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const res = await submitPositioning({
      portalToken,
      data: {
        current_level: data.current_level,
        practice_frequency: data.practice_frequency,
        expectations: data.expectations ?? [],
        expectations_comment: data.expectations_comment,
        prereq_meets: data.prereq_meets,
        remote_equipment: data.remote_equipment,
        has_adaptation_need: data.has_adaptation_need ?? false,
        adaptation_details: data.adaptation_details,
        wants_contact: data.wants_contact ?? false,
        mastery: data.mastery ?? {},
        adequacy: data.adequacy,
        learner_comment: data.learner_comment,
      },
      signatureDataUrl,
    });

    setSubmitting(false);

    if (!res.ok) {
      setError(res.error ?? "Erreur inconnue.");
      return;
    }
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (submitted) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-6 text-center space-y-3">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
        <h2 className="text-lg font-bold text-zinc-900">
          {previewMode ? "Aperçu — soumission simulée" : "Merci !"}
        </h2>
        <p className="text-sm text-zinc-600">
          {previewMode
            ? "En conditions réelles, les réponses seraient enregistrées ici et accessibles au formateur. Rien n'a été sauvegardé en base."
            : "Votre test de positionnement a bien été enregistré. Le formateur en tiendra compte pour adapter la session."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête identification auto-rempli */}
      <Section number={0} title="Vos informations">
        <dl className="grid grid-cols-1 gap-y-1 text-xs">
          <Row label="Apprenant">
            {context.civility ? `${context.civility} ` : ""}
            {context.learnerName}
          </Row>
          {context.companyName && <Row label="Entreprise">{context.companyName}</Row>}
          {context.jobTitle && <Row label="Fonction">{context.jobTitle}</Row>}
          <Row label="Formation">{context.formationTitle}</Row>
          <Row label="Dates">
            {formatDateRange(context.startDate, context.endDate)}
          </Row>
          <Row label="Modalité">{modalityLabel(context.modality)}</Row>
          <Row label="Organisme">{context.orgName}</Row>
        </dl>
      </Section>

      {/* Section 1 — Niveau initial */}
      <Section number={1} title="Niveau initial">
        <RadioGroup
          legend="Quel est votre niveau actuel sur le thème de la formation ?"
          required
          options={LEVEL_OPTIONS}
          value={data.current_level}
          onChange={(v) => update("current_level", v as LevelValue)}
        />
        <RadioGroup
          legend="Avez-vous déjà pratiqué ce sujet dans votre activité professionnelle ?"
          required
          options={PRACTICE_OPTIONS}
          value={data.practice_frequency}
          onChange={(v) => update("practice_frequency", v as PracticeValue)}
        />
      </Section>

      {/* Section 2 — Attentes et besoins */}
      <Section number={2} title="Attentes et besoins">
        <div className="space-y-2">
          <div className="text-sm font-medium text-zinc-800">
            Qu&apos;attendez-vous principalement de cette formation ? (plusieurs
            choix possibles)
          </div>
          <div className="space-y-1.5">
            {expectationOpts.map((o) => {
              const k = expKey(o);
              return (
                <label
                  key={k}
                  className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={(data.expectations ?? []).includes(k)}
                    onChange={() => toggleExpectation(k)}
                  />
                  <span>{o.label}</span>
                </label>
              );
            })}
          </div>
        </div>
        <CommentField
          label="Précisez si besoin"
          value={data.expectations_comment}
          onChange={(v) => update("expectations_comment", v)}
        />
      </Section>

      {/* Section 3 — Prérequis */}
      <Section number={3} title="Prérequis et conditions de participation">
        <RadioGroup
          legend="Disposez-vous des prérequis indiqués dans le programme ?"
          required
          options={PREREQ_OPTIONS}
          value={data.prereq_meets}
          onChange={(v) => update("prereq_meets", v as PrereqValue)}
        />
        <RadioGroup
          legend="Pour une formation à distance ou hybride, disposez-vous du matériel nécessaire ?"
          required
          options={EQUIPMENT_OPTIONS}
          value={data.remote_equipment}
          onChange={(v) => update("remote_equipment", v as EquipmentValue)}
        />
      </Section>

      {/* Section 4 — Handicap / adaptation */}
      <Section number={4} title="Situation de handicap ou besoin d'adaptation">
        <div className="space-y-2">
          <div className="text-sm font-medium text-zinc-800">
            Avez-vous une situation de handicap, une contrainte particulière
            ou un besoin d&apos;adaptation à signaler pour suivre la formation
            dans de bonnes conditions ?
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              checked={data.has_adaptation_need === false}
              onChange={() => update("has_adaptation_need", false)}
            />
            Non
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              checked={data.has_adaptation_need === true}
              onChange={() => update("has_adaptation_need", true)}
            />
            Oui
          </label>
        </div>
        {data.has_adaptation_need && (
          <>
            <CommentField
              label="Précisez les adaptations souhaitées"
              value={data.adaptation_details}
              onChange={(v) => update("adaptation_details", v)}
            />
            <div className="space-y-2">
              <div className="text-sm font-medium text-zinc-800">
                Souhaitez-vous être contacté(e) par {context.orgName} afin
                d&apos;étudier les aménagements possibles ?
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={data.wants_contact === true}
                  onChange={() => update("wants_contact", true)}
                />
                Oui
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={data.wants_contact === false}
                  onChange={() => update("wants_contact", false)}
                />
                Non
              </label>
            </div>
          </>
        )}
      </Section>

      {/* Section 5 — Auto-évaluation */}
      <Section number={5} title="Auto-évaluation rapide">
        <div className="space-y-3">
          {masteryItems.map((c) => (
            <div key={c.key} className="space-y-1.5">
              <div className="text-sm font-medium text-zinc-800">{c.label}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {MASTERY_OPTIONS.map((o) => {
                  const checked =
                    data.mastery?.[c.key as MasteryCriteriaKey] === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() =>
                        setMastery(c.key as MasteryCriteriaKey, o.value)
                      }
                      className={
                        checked
                          ? "text-xs px-2.5 py-2 rounded-lg bg-cyan-600 text-white font-semibold"
                          : "text-xs px-2.5 py-2 rounded-lg bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
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
      </Section>

      {/* Section 6 — Adéquation */}
      <Section number={6} title="Adéquation de la formation">
        <RadioGroup
          legend="Cette formation vous semble-t-elle adaptée à votre besoin ?"
          required
          options={ADEQUACY_OPTIONS}
          value={data.adequacy}
          onChange={(v) => update("adequacy", v as AdequacyValue)}
        />
        <CommentField
          label="Commentaires éventuels"
          value={data.learner_comment}
          onChange={(v) => update("learner_comment", v)}
        />
      </Section>

      {/* Signature facultative */}
      <Section number={7} title="Signature (facultative)">
        <p className="text-xs text-zinc-600 mb-2">
          Vous pouvez signer ici pour valider vos réponses, mais ce n&apos;est
          pas obligatoire.
        </p>
        <div className="flex justify-center">
          <SignaturePad ref={padRef} width={320} height={140} />
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
        className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-50 shadow-md"
      >
        <Send className="h-4 w-4" />
        {submitting ? "Envoi…" : "Envoyer mon test"}
      </button>
      <p className="text-[11px] text-zinc-500 text-center">
        Une fois envoyé, le test ne peut plus être modifié.
      </p>
    </div>
  );
}

// ============================================================
// Composants utilitaires
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
        {number > 0 && <span className="text-amber-600">{number}.</span>}{" "}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex">
      <dt className="font-semibold text-zinc-700 w-28 shrink-0">{label}</dt>
      <dd className="text-zinc-600">{children}</dd>
    </div>
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
