/**
 * Composant de rendu d'une évaluation à chaud remplie (lecture seule).
 * Partagé entre côté admin et côté formateur.
 */
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
  type HotEvaluationData,
} from "./hot";

function lookup<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  v: T | undefined | null,
): string {
  if (!v) return "—";
  return options.find((o) => o.value === v)?.label ?? v;
}

export function EvaluationResponseView({
  data,
  submittedAt,
}: {
  data: HotEvaluationData;
  submittedAt?: string;
}) {
  return (
    <div className="space-y-4">
      {/* KPI NPS + satisfaction en haut */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-violet-700 font-bold">
            Recommandation NPS
          </div>
          <div className="text-3xl font-bold text-violet-900 tabular-nums">
            {data.nps_score}/10
          </div>
        </div>
        <div className="rounded-xl bg-pink-50 border border-pink-200 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-pink-700 font-bold">
            Satisfaction
          </div>
          <div className="text-base font-bold text-pink-900 mt-1">
            {lookup(SATISFACTION_OPTIONS, data.satisfaction_overall)}
          </div>
        </div>
      </div>

      <Section number={1} title="Satisfaction générale">
        <Row label="Niveau">
          {lookup(SATISFACTION_OPTIONS, data.satisfaction_overall)}
        </Row>
        {data.satisfaction_comment && (
          <Row label="Commentaire">
            <p className="whitespace-pre-wrap">{data.satisfaction_comment}</p>
          </Row>
        )}
      </Section>

      <Section number={2} title="Objectifs pédagogiques">
        <Row label="Objectifs atteints">
          {lookup(OBJECTIVES_OPTIONS, data.objectives_reached)}
        </Row>
        <Row label="Attentes répondues">
          {lookup(EXPECTATIONS_OPTIONS, data.expectations_met)}
        </Row>
        {data.objectives_comment && (
          <Row label="Précisions">
            <p className="whitespace-pre-wrap">{data.objectives_comment}</p>
          </Row>
        )}
      </Section>

      <GridSection
        number={3}
        title="Contenu de la formation"
        criteria={CONTENT_CRITERIA}
        options={RATING_OPTIONS}
        values={data.content}
        comment={data.content_comment}
      />

      <GridSection
        number={4}
        title="Animation du formateur"
        criteria={TRAINER_CRITERIA}
        options={RATING_OPTIONS}
        values={data.trainer}
        comment={data.trainer_comment}
      />

      <GridSection
        number={5}
        title="Organisation et moyens"
        criteria={ORGANIZATION_CRITERIA}
        options={RATING_OPTIONS_WITH_NA}
        values={data.organization}
        comment={data.organization_comment}
      />

      <Section number={6} title="Utilité professionnelle">
        <Row label="Réutilisation">
          {lookup(USEFULNESS_OPTIONS, data.usefulness)}
        </Row>
        {data.usefulness_applications && (
          <Row label="Applications">
            <p className="whitespace-pre-wrap">
              {data.usefulness_applications}
            </p>
          </Row>
        )}
      </Section>

      <Section number={7} title="Recommandation">
        <Row label="Choix">
          {lookup(RECOMMENDATION_OPTIONS, data.recommendation)}
        </Row>
        <Row label="Note NPS">
          <span className="font-bold text-violet-700">
            {data.nps_score}/10
          </span>
        </Row>
        {data.nps_reason && (
          <Row label="Pourquoi cette note">
            <p className="whitespace-pre-wrap">{data.nps_reason}</p>
          </Row>
        )}
      </Section>

      <Section number={8} title="Amélioration continue">
        {data.strengths && (
          <Row label="Points forts">
            <p className="whitespace-pre-wrap">{data.strengths}</p>
          </Row>
        )}
        {data.improvements && (
          <Row label="Points à améliorer">
            <p className="whitespace-pre-wrap">{data.improvements}</p>
          </Row>
        )}
        <Row label="Autres besoins de formation">
          {data.other_training_needs_yes ? (
            <span className="text-amber-700 font-semibold">
              Oui
              {data.other_training_needs_text && (
                <span className="font-normal text-zinc-700">
                  {" "}
                  — {data.other_training_needs_text}
                </span>
              )}
            </span>
          ) : (
            "Non"
          )}
        </Row>
      </Section>

      {submittedAt && (
        <div className="text-xs text-zinc-500 text-right">
          Évaluation envoyée le{" "}
          {new Date(submittedAt).toLocaleString("fr-FR")}
        </div>
      )}
    </div>
  );
}

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
    <section className="rounded-xl bg-white border border-zinc-200 p-4 space-y-2">
      <h3 className="font-bold text-sm text-zinc-900">
        <span className="text-pink-600">{number}.</span> {title}
      </h3>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </section>
  );
}

function GridSection({
  number,
  title,
  criteria,
  options,
  values,
  comment,
}: {
  number: number;
  title: string;
  criteria: ReadonlyArray<{ key: string; label: string }>;
  options: ReadonlyArray<{ value: string; label: string }>;
  values: Record<string, string | undefined>;
  comment?: string;
}) {
  return (
    <section className="rounded-xl bg-white border border-zinc-200 p-4 space-y-2">
      <h3 className="font-bold text-sm text-zinc-900">
        <span className="text-pink-600">{number}.</span> {title}
      </h3>
      <ul className="divide-y divide-zinc-100 -mx-1">
        {criteria.map((c) => {
          const v = values[c.key];
          const label = options.find((o) => o.value === v)?.label ?? "—";
          const bgClass = ratingColor(v);
          return (
            <li
              key={c.key}
              className="flex items-center justify-between py-1.5 px-1 text-sm"
            >
              <span className="text-zinc-700">{c.label}</span>
              <span className={bgClass}>{label}</span>
            </li>
          );
        })}
      </ul>
      {comment && (
        <div className="text-xs text-zinc-600 italic mt-2 whitespace-pre-wrap">
          « {comment} »
        </div>
      )}
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

function ratingColor(v: string | undefined): string {
  const base = "px-2 py-0.5 rounded-full text-xs font-semibold";
  if (v === "very_good") return `${base} bg-emerald-50 text-emerald-700`;
  if (v === "good") return `${base} bg-cyan-50 text-cyan-700`;
  if (v === "medium") return `${base} bg-amber-50 text-amber-700`;
  if (v === "poor") return `${base} bg-rose-50 text-rose-700`;
  if (v === "na") return `${base} bg-slate-50 text-slate-500`;
  return `${base} text-zinc-300`;
}
