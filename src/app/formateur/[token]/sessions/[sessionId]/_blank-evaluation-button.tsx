"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, X } from "lucide-react";
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
} from "@/lib/evaluations/hot";

/**
 * Consultation de l'ÉVALUATION À CHAUD VIERGE par le formateur
 * (Gilles 2026-06-09). Reproduit le questionnaire Qualiopi (8 sections) tel
 * que l'apprenant le voit, en lecture seule. Rendu en portal.
 */
type Opt = { value: string; label: string };
type Crit = { key: string; label: string };

function Radio({ legend, options }: { legend: string; options: readonly Opt[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-zinc-800">{legend}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <span
            key={o.value}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-600"
          >
            <span className="inline-block h-3.5 w-3.5 rounded-full border border-zinc-400" />
            {o.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Grid({
  criteria,
  options,
}: {
  criteria: readonly Crit[];
  options: readonly Opt[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-zinc-200">
        <thead>
          <tr className="bg-zinc-50">
            <th className="text-left px-2 py-1.5 font-semibold text-zinc-600" />
            {options.map((o) => (
              <th
                key={o.value}
                className="px-2 py-1.5 font-semibold text-zinc-600 text-center whitespace-nowrap"
              >
                {o.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {criteria.map((c) => (
            <tr key={c.key} className="border-t border-zinc-100">
              <td className="px-2 py-1.5 text-zinc-700">{c.label}</td>
              {options.map((o) => (
                <td key={o.value} className="px-2 py-1.5 text-center">
                  <span className="inline-block h-3.5 w-3.5 rounded-full border border-zinc-400" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommentLine({ label }: { label: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-zinc-600">{label}</p>
      <div className="h-9 rounded-md border border-dashed border-zinc-300 bg-zinc-50" />
    </div>
  );
}

function Nps() {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-zinc-800">
        Sur une échelle de 0 à 10, quelle est la probabilité que vous
        recommandiez cette formation ?
      </p>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 11 }, (_, n) => (
          <span
            key={n}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-zinc-300 text-xs text-zinc-600"
          >
            {n}
          </span>
        ))}
      </div>
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
    <section className="space-y-2.5">
      <h4 className="text-sm font-bold text-violet-900">
        {number}. {title}
      </h4>
      {children}
    </section>
  );
}

export function BlankEvaluationButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-300 bg-violet-50 text-violet-800 text-sm font-semibold hover:bg-violet-100"
        title="Voir l'évaluation à chaud vierge (telle que l'apprenant la remplit)"
      >
        <ClipboardList className="h-4 w-4" />
        Consulter l&apos;évaluation à chaud vierge
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] bg-black/40 flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 sticky top-0 bg-white rounded-t-2xl">
                <h3 className="font-bold text-sm text-zinc-900 inline-flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4 text-violet-600" />
                  Évaluation à chaud (vierge)
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-zinc-400 hover:text-zinc-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-6">
                <Section number={1} title="Satisfaction générale">
                  <Radio
                    legend="Quel est votre niveau de satisfaction global concernant cette formation ?"
                    options={SATISFACTION_OPTIONS}
                  />
                  <CommentLine label="Commentaire éventuel" />
                </Section>

                <Section number={2} title="Objectifs pédagogiques">
                  <Radio
                    legend="Les objectifs annoncés en début de formation ont-ils été atteints ?"
                    options={OBJECTIVES_OPTIONS}
                  />
                  <Radio
                    legend="La formation a-t-elle répondu à vos attentes ?"
                    options={EXPECTATIONS_OPTIONS}
                  />
                  <CommentLine label="Précisez si besoin" />
                </Section>

                <Section number={3} title="Contenu de la formation">
                  <Grid criteria={CONTENT_CRITERIA} options={RATING_OPTIONS} />
                  <CommentLine label="Commentaire éventuel" />
                </Section>

                <Section number={4} title="Animation du formateur">
                  <Grid criteria={TRAINER_CRITERIA} options={RATING_OPTIONS} />
                  <CommentLine label="Commentaire éventuel" />
                </Section>

                <Section number={5} title="Organisation et moyens pédagogiques">
                  <Grid
                    criteria={ORGANIZATION_CRITERIA}
                    options={RATING_OPTIONS_WITH_NA}
                  />
                  <CommentLine label="Commentaire éventuel" />
                </Section>

                <Section number={6} title="Utilité professionnelle">
                  <Radio
                    legend="Pensez-vous pouvoir réutiliser les acquis de cette formation dans votre activité professionnelle ?"
                    options={USEFULNESS_OPTIONS}
                  />
                  <CommentLine label="Quels éléments principaux allez-vous pouvoir appliquer ?" />
                </Section>

                <Section number={7} title="Recommandation de la formation">
                  <Radio
                    legend="Recommanderiez-vous cette formation à un collègue, une entreprise ou un confrère ?"
                    options={RECOMMENDATION_OPTIONS}
                  />
                  <Nps />
                  <CommentLine label="Pourquoi cette note ?" />
                </Section>

                <Section number={8} title="Amélioration continue">
                  <CommentLine label="Quels sont les points forts de la formation ?" />
                  <CommentLine label="Quels sont les points à améliorer ?" />
                </Section>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
