/**
 * Composant de rendu d'un test de positionnement rempli (lecture seule).
 * Partagé entre côté admin et côté formateur.
 */
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  ADEQUACY_OPTIONS,
  EQUIPMENT_OPTIONS,
  EXPECTATION_CHOICES,
  LEVEL_OPTIONS,
  MASTERY_CRITERIA,
  MASTERY_OPTIONS,
  PRACTICE_OPTIONS,
  PREREQ_OPTIONS,
  TRAINER_ADAPTATIONS,
  type AdequacyValue,
  type EquipmentValue,
  type ExpectationValue,
  type LevelValue,
  type MasteryCriteriaKey,
  type MasteryValue,
  type PositioningLearnerData,
  type PositioningTrainerObservation,
  type PracticeValue,
  type PrereqValue,
  type TrainerAdaptationValue,
} from "./types";

function lookup<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  v: T | undefined,
): string {
  if (!v) return "—";
  return options.find((o) => o.value === v)?.label ?? v;
}

function expectationLabels(values: ExpectationValue[] | undefined): string[] {
  if (!values || values.length === 0) return ["—"];
  return values.map((v) => lookup(EXPECTATION_CHOICES, v));
}

export function PositioningResponseView({
  data,
  learnerSignatureDataUrl,
  submittedAt,
  trainerObservation,
  trainerFilledAt,
}: {
  data: PositioningLearnerData;
  learnerSignatureDataUrl?: string | null;
  submittedAt?: string;
  /** Section 7 — observation formateur (Sprint D). Affichée si remplie. */
  trainerObservation?: PositioningTrainerObservation | null;
  trainerFilledAt?: string | null;
}) {
  return (
    <div className="space-y-4">
      {data.has_adaptation_need && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-orange-900">
              Besoin d&apos;adaptation déclaré
            </div>
            {data.adaptation_details && (
              <p className="text-orange-800 mt-0.5">
                {data.adaptation_details}
              </p>
            )}
            <p className="text-xs text-orange-700 mt-1">
              Souhait d&apos;être contacté :{" "}
              <strong>{data.wants_contact ? "Oui" : "Non"}</strong>
            </p>
          </div>
        </div>
      )}

      <Section number={1} title="Niveau initial">
        <Row label="Niveau actuel">
          {lookup<LevelValue>(LEVEL_OPTIONS, data.current_level)}
        </Row>
        <Row label="Pratique professionnelle">
          {lookup<PracticeValue>(PRACTICE_OPTIONS, data.practice_frequency)}
        </Row>
      </Section>

      <Section number={2} title="Attentes et besoins">
        <Row label="Attentes">
          <ul className="list-disc ml-4 space-y-0.5">
            {expectationLabels(data.expectations).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Row>
        {data.expectations_comment && (
          <Row label="Précisions">
            <p className="whitespace-pre-wrap">{data.expectations_comment}</p>
          </Row>
        )}
      </Section>

      <Section number={3} title="Prérequis et conditions">
        <Row label="Prérequis programme">
          {lookup<PrereqValue>(PREREQ_OPTIONS, data.prereq_meets)}
        </Row>
        <Row label="Matériel">
          {lookup<EquipmentValue>(EQUIPMENT_OPTIONS, data.remote_equipment)}
        </Row>
      </Section>

      <Section
        number={4}
        title="Handicap / adaptation"
        accent={data.has_adaptation_need ? "orange" : undefined}
      >
        <Row label="Besoin signalé">
          {data.has_adaptation_need ? (
            <span className="font-bold text-orange-700">Oui</span>
          ) : (
            "Non"
          )}
        </Row>
        {data.has_adaptation_need && data.adaptation_details && (
          <Row label="Détails">
            <p className="whitespace-pre-wrap">{data.adaptation_details}</p>
          </Row>
        )}
        {data.has_adaptation_need && (
          <Row label="Souhait contact">
            {data.wants_contact ? "Oui" : "Non"}
          </Row>
        )}
      </Section>

      <Section number={5} title="Auto-évaluation rapide">
        <ul className="divide-y divide-zinc-100 -mx-1">
          {MASTERY_CRITERIA.map((c) => {
            const v = data.mastery?.[c.key as MasteryCriteriaKey];
            return (
              <li
                key={c.key}
                className="flex items-center justify-between py-1.5 px-1 text-sm"
              >
                <span className="text-zinc-700">{c.label}</span>
                <span
                  className={
                    v === "ok"
                      ? "bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-semibold"
                      : v === "partial"
                        ? "bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs font-semibold"
                        : v === "none"
                          ? "bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-xs font-semibold"
                          : "text-zinc-400 text-xs"
                  }
                >
                  {lookup<MasteryValue>(MASTERY_OPTIONS, v)}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section number={6} title="Adéquation">
        <Row label="Formation adaptée">
          {lookup<AdequacyValue>(ADEQUACY_OPTIONS, data.adequacy)}
        </Row>
        {data.learner_comment && (
          <Row label="Commentaire">
            <p className="whitespace-pre-wrap">{data.learner_comment}</p>
          </Row>
        )}
      </Section>

      {learnerSignatureDataUrl && (
        <Section number={7} title="Signature apprenant">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={learnerSignatureDataUrl}
              alt="Signature apprenant"
              style={{
                maxHeight: "20mm",
                maxWidth: "60mm",
                objectFit: "contain",
                mixBlendMode: "multiply",
              }}
            />
            {submittedAt && (
              <span className="text-xs text-zinc-500">
                Signé le {new Date(submittedAt).toLocaleString("fr-FR")}
              </span>
            )}
          </div>
        </Section>
      )}

      {submittedAt && !learnerSignatureDataUrl && (
        <div className="text-xs text-zinc-500 text-right">
          <CheckCircle2 className="inline h-3 w-3 text-emerald-600 mr-1" />
          Test envoyé le {new Date(submittedAt).toLocaleString("fr-FR")}
        </div>
      )}

      {/* Section 7 — Observation formateur (Sprint D). Affichée
          uniquement si remplie. La saisie se fait via le formulaire
          dédié (TrainerObservationForm), pas via ce composant lecture. */}
      {trainerObservation && (
        <section className="rounded-xl bg-violet-50/40 border border-violet-200 p-4 space-y-2">
          <h3 className="font-bold text-sm text-zinc-900 flex items-center justify-between gap-2 flex-wrap">
            <span>
              <span className="text-violet-700">7.</span> Observation du
              formateur
            </span>
            {trainerFilledAt && (
              <span className="text-[11px] font-normal text-zinc-500">
                Rempli le {new Date(trainerFilledAt).toLocaleDateString("fr-FR")}
              </span>
            )}
          </h3>
          {trainerObservation.adaptations &&
            trainerObservation.adaptations.length > 0 && (
              <Row label="Adaptations">
                <ul className="list-disc ml-4 space-y-0.5">
                  {trainerObservation.adaptations.map(
                    (v: TrainerAdaptationValue) => (
                      <li key={v}>
                        {TRAINER_ADAPTATIONS.find((o) => o.value === v)
                          ?.label ?? v}
                        {v === "other" &&
                          trainerObservation.other_adaptation_text && (
                            <span className="text-zinc-600">
                              {" "}— {trainerObservation.other_adaptation_text}
                            </span>
                          )}
                      </li>
                    ),
                  )}
                </ul>
              </Row>
            )}
          {trainerObservation.trainer_comment && (
            <Row label="Commentaire">
              <p className="whitespace-pre-wrap">
                {trainerObservation.trainer_comment}
              </p>
            </Row>
          )}
        </section>
      )}
    </div>
  );
}

function Section({
  number,
  title,
  accent,
  children,
}: {
  number: number;
  title: string;
  accent?: "orange";
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        accent === "orange"
          ? "rounded-xl bg-orange-50/40 border border-orange-200 p-4 space-y-2"
          : "rounded-xl bg-white border border-zinc-200 p-4 space-y-2"
      }
    >
      <h3 className="font-bold text-sm text-zinc-900">
        <span className="text-amber-600">{number}.</span> {title}
      </h3>
      <dl className="space-y-1.5 text-sm">{children}</dl>
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
    <div className="flex gap-3 text-sm">
      <dt className="font-semibold text-zinc-600 w-40 shrink-0">{label}</dt>
      <dd className="text-zinc-800 flex-1 min-w-0">{children}</dd>
    </div>
  );
}
