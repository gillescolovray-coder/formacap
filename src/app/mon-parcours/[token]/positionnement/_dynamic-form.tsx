"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/signature-pad";
import type {
  DynamicAnswer,
  DynamicAnswerValue,
  FormStructure,
  Question,
} from "@/lib/positioning/form-structure";
import { submitDynamicPositioning } from "./actions";

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
  structure: FormStructure;
  /** Mode aperçu admin : pas de submit serveur. */
  previewMode?: boolean;
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

/** Clé unique d'une réponse pour la Map locale. */
function answerKey(s: number, q: number): string {
  return `${s}:${q}`;
}

/**
 * Formulaire de positionnement dynamique : rend une FormStructure
 * (sections + questions de tous types). Gère la sauvegarde en
 * format DynamicResponsePayload (avec snapshot de la structure).
 *
 * Sections fixes (gérées par l'app, hors structure) :
 *   - "Vos informations" en haut (auto-rempli depuis le contexte)
 *   - "Validation participant" en bas (signature facultative)
 */
export function DynamicPositioningForm({
  portalToken,
  context,
  structure,
  previewMode = false,
}: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  // Stockage en mémoire des réponses : Map<"si:qi", DynamicAnswer>
  const [answers, setAnswers] = useState<Map<string, DynamicAnswer>>(
    new Map(),
  );

  function updateAnswer(
    sectionIdx: number,
    questionIdx: number,
    patch: Partial<DynamicAnswer>,
  ) {
    setAnswers((prev) => {
      const next = new Map(prev);
      const k = answerKey(sectionIdx, questionIdx);
      const existing = next.get(k) ?? {
        section_idx: sectionIdx,
        question_idx: questionIdx,
        value: null,
      };
      next.set(k, { ...existing, ...patch });
      return next;
    });
  }

  function getAnswer(
    sectionIdx: number,
    questionIdx: number,
  ): DynamicAnswer | undefined {
    return answers.get(answerKey(sectionIdx, questionIdx));
  }

  function validateRequired(): string | null {
    for (let si = 0; si < structure.sections.length; si++) {
      const sec = structure.sections[si];
      for (let qi = 0; qi < sec.questions.length; qi++) {
        const q = sec.questions[qi];
        const a = getAnswer(si, qi);
        const isRequired =
          ("required" in q && q.required === true) ||
          q.type === "matrix" || // toutes les lignes doivent être répondues
          (q.type === "radio" && q.required === true);
        if (!isRequired) continue;
        if (!a) return `Question manquante dans « ${sec.title} ».`;
        if (q.type === "matrix") {
          const v = a.value as Record<string, string> | null;
          if (!v) return `Tableau incomplet dans « ${sec.title} ».`;
          const missing = q.rows.find((r) => !v[r]);
          if (missing) {
            return `Tableau incomplet dans « ${sec.title} » : ${missing}.`;
          }
        } else if (q.type === "text_short" || q.type === "text_long") {
          if (
            typeof a.value !== "string" ||
            (a.value as string).trim() === ""
          ) {
            return `Réponse manquante dans « ${sec.title} ».`;
          }
        } else if (a.value === null || a.value === undefined) {
          return `Réponse manquante dans « ${sec.title} ».`;
        }
      }
    }
    return null;
  }

  async function handleSubmit() {
    setError(null);
    const err = validateRequired();
    if (err) {
      setError(err);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSubmitting(true);

    const signatureDataUrl = padRef.current?.getDataURL() ?? null;
    const payload = {
      answers: Array.from(answers.values()).sort(
        (a, b) =>
          a.section_idx - b.section_idx ||
          a.question_idx - b.question_idx,
      ),
      structure_snapshot: structure,
    };

    if (previewMode) {
      await new Promise((r) => setTimeout(r, 300));
      setSubmitting(false);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const res = await submitDynamicPositioning({
      portalToken,
      payload,
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
            ? "Rien n'a été sauvegardé en base."
            : "Votre test de positionnement a bien été enregistré. Le formateur en tiendra compte pour adapter la session."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Intro */}
      {structure.intro?.instructions && (
        <div className="rounded-xl bg-white border border-zinc-200 p-4">
          <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
            {structure.intro.instructions}
          </p>
        </div>
      )}
      {structure.intro?.important_note && (
        <div className="rounded-xl bg-red-50 border-2 border-red-200 p-4">
          <p className="text-sm text-red-900 leading-relaxed whitespace-pre-line">
            <strong>IMPORTANT :</strong> {structure.intro.important_note}
          </p>
        </div>
      )}

      {/* Section FIXE 0 — Informations participant */}
      <FixedInformationsSection context={context} />

      {/* Sections custom du template */}
      {structure.sections.map((sec, si) => (
        <section
          key={si}
          className="rounded-xl bg-white border border-zinc-200 overflow-hidden"
        >
          <header className="bg-blue-600 text-white px-4 py-2">
            <h2 className="font-bold text-sm">{sec.title}</h2>
            {sec.intro && (
              <p className="text-[11px] text-blue-100 mt-0.5">{sec.intro}</p>
            )}
          </header>
          <div className="p-4 space-y-4">
            {sec.questions.map((q, qi) => (
              <QuestionRenderer
                key={qi}
                index={qi + 1}
                question={q}
                answer={getAnswer(si, qi)}
                onChange={(patch) => updateAnswer(si, qi, patch)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Section FIXE Validation participant */}
      <section className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
        <header className="bg-blue-600 text-white px-4 py-2">
          <h2 className="font-bold text-sm">Validation participant</h2>
          <p className="text-[11px] text-blue-100 mt-0.5">
            Je confirme avoir complété ce questionnaire de positionnement
            préalable.
          </p>
        </header>
        <div className="p-4 space-y-3">
          <Row label="Nom">
            {context.civility ? `${context.civility} ` : ""}
            {context.learnerName}
          </Row>
          <Row label="Date">
            {new Date().toLocaleDateString("fr-FR")}
          </Row>
          <div>
            <div className="text-xs font-medium text-zinc-700 mb-1">
              Signature (facultative)
            </div>
            <div className="flex justify-center">
              <SignaturePad ref={padRef} width={320} height={140} />
            </div>
          </div>
        </div>
      </section>

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
// Section FIXE — Informations participant
// ============================================================

function FixedInformationsSection({ context }: { context: Context }) {
  return (
    <section className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
      <header className="bg-blue-600 text-white px-4 py-2">
        <h2 className="font-bold text-sm">Informations participant</h2>
      </header>
      <div className="p-4">
        <dl className="grid grid-cols-1 gap-y-1 text-xs">
          <Row label="Nom et prénom">
            {context.civility ? `${context.civility} ` : ""}
            {context.learnerName}
          </Row>
          {context.jobTitle && <Row label="Fonction">{context.jobTitle}</Row>}
          {context.companyName && (
            <Row label="Entreprise">{context.companyName}</Row>
          )}
          <Row label="Formation">{context.formationTitle}</Row>
          <Row label="Dates">
            {formatDateRange(context.startDate, context.endDate)}
          </Row>
          <Row label="Modalité">{modalityLabel(context.modality)}</Row>
          <Row label="Organisme">{context.orgName}</Row>
        </dl>
      </div>
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
    <div className="grid grid-cols-[120px_1fr] gap-2 py-0.5">
      <dt className="text-zinc-500 font-medium">{label}</dt>
      <dd className="text-zinc-900">{children}</dd>
    </div>
  );
}

// ============================================================
// Rendu d'UNE question selon son type
// ============================================================

function QuestionRenderer({
  index,
  question,
  answer,
  onChange,
}: {
  index: number;
  question: Question;
  answer: DynamicAnswer | undefined;
  onChange: (patch: Partial<DynamicAnswer>) => void;
}) {
  const requiredMark =
    "required" in question && question.required ? (
      <span className="text-red-500 ml-0.5">*</span>
    ) : null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-zinc-800">
        <span className="text-blue-700 mr-1">{index}.</span>
        {question.text}
        {requiredMark}
      </div>

      {question.type === "text_short" && (
        <input
          type="text"
          value={typeof answer?.value === "string" ? answer.value : ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={question.placeholder ?? ""}
          className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
        />
      )}

      {question.type === "text_long" && (
        <textarea
          rows={question.rows ?? 4}
          value={typeof answer?.value === "string" ? answer.value : ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={question.placeholder ?? ""}
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none resize-y"
        />
      )}

      {question.type === "radio" && (
        <div className="space-y-1.5">
          {question.options.map((opt) => (
            <label
              key={opt}
              className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-zinc-50"
            >
              <input
                type="radio"
                name={`q_${index}`}
                checked={answer?.value === opt}
                onChange={() => onChange({ value: opt })}
                className="mt-0.5"
              />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === "checkbox" && (
        <div className="space-y-1">
          {question.options.map((opt) => {
            const arr = Array.isArray(answer?.value) ? answer!.value : [];
            const checked = arr.includes(opt);
            return (
              <label
                key={opt}
                className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? arr.filter((x) => x !== opt)
                      : [...arr, opt];
                    onChange({ value: next });
                  }}
                  className="mt-0.5"
                />
                <span className="text-sm">{opt}</span>
              </label>
            );
          })}
          {question.allow_other && (
            <div className="flex items-start gap-2 p-1.5 mt-1">
              <span className="text-sm text-zinc-700 mt-0.5 shrink-0">
                Autres :
              </span>
              <input
                type="text"
                value={answer?.other_text ?? ""}
                onChange={(e) => onChange({ other_text: e.target.value })}
                className="flex-1 h-8 rounded-md border border-zinc-300 px-2 text-sm focus:border-blue-500 outline-none"
                placeholder="Précisez…"
              />
            </div>
          )}
        </div>
      )}

      {question.type === "yes_no" && (
        <div className="flex gap-4">
          {[
            { lab: "Oui", v: true },
            { lab: "Non", v: false },
          ].map((o) => (
            <label
              key={o.lab}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name={`q_${index}`}
                checked={answer?.value === o.v}
                onChange={() => onChange({ value: o.v })}
              />
              <span className="text-sm">{o.lab}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === "yes_no_text" && (
        <>
          <div className="flex gap-4">
            {[
              { lab: "Oui", v: true },
              { lab: "Non", v: false },
            ].map((o) => (
              <label
                key={o.lab}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name={`q_${index}`}
                  checked={answer?.value === o.v}
                  onChange={() => onChange({ value: o.v })}
                />
                <span className="text-sm">{o.lab}</span>
              </label>
            ))}
          </div>
          {(() => {
            const showOnYes = !question.show_if_no;
            const cond = showOnYes ? answer?.value === true : answer?.value === false;
            if (!cond) return null;
            return (
              <div className="space-y-1 pt-1">
                <span className="text-xs font-medium text-zinc-700">
                  {question.followup_label ?? "Si oui, précisez :"}
                </span>
                <textarea
                  rows={3}
                  value={answer?.followup_text ?? ""}
                  onChange={(e) =>
                    onChange({ followup_text: e.target.value })
                  }
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none resize-y"
                />
              </div>
            );
          })()}
        </>
      )}

      {question.type === "matrix" && (
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="w-full text-xs sm:text-sm min-w-[460px] border border-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold text-zinc-700">
                  &nbsp;
                </th>
                {question.cols.map((c) => (
                  <th
                    key={c}
                    className="px-2 py-1.5 text-center font-semibold text-zinc-700 text-[11px]"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {question.rows.map((row) => {
                const v = (answer?.value ?? {}) as Record<string, string>;
                return (
                  <tr key={row} className="border-t border-zinc-200">
                    <td className="px-2 py-1.5 text-zinc-800">{row}</td>
                    {question.cols.map((col) => (
                      <td key={col} className="px-2 py-1.5 text-center">
                        <input
                          type="radio"
                          name={`q_${index}_${row}`}
                          checked={v[row] === col}
                          onChange={() =>
                            onChange({ value: { ...v, [row]: col } })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Helper export pour la page apprenant (preview admin)
export type { Context as DynamicFormContext };
