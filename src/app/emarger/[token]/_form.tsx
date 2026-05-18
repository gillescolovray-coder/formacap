"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, Pen, Sun, Sunset, X } from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { signAttendancePublic } from "./actions";

export type Learner = {
  enrollmentId: string;
  learnerId: string;
  civility: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
};

export type SessionDay = {
  day_date: string;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
};

export type ExistingSignature = {
  enrollment_id: string;
  period_date: string;
  moment: "morning" | "afternoon";
  signer_role: "learner" | "trainer";
  signer_name: string;
  signed_at: string;
};

type Props = {
  token: string;
  sessionId: string;
  /** Si fourni (via ?eid= depuis le portail apprenant), pré-sélectionne
   *  l'apprenant et passe directement à l'étape 2. */
  initialEnrollmentId?: string | null;
  learners: Learner[];
  days: SessionDay[];
  existingSignatures: ExistingSignature[];
};

type Moment = "morning" | "afternoon";

type ActiveSlot = {
  enrollmentId: string;
  signerName: string;
  periodDate: string;
  moment: Moment;
  dayLabel: string;
  momentLabel: string;
};

function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function shortTime(t: string | null): string {
  if (!t) return "—";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function EmargementPublicForm({
  token,
  initialEnrollmentId,
  learners,
  days,
  existingSignatures: initialSignatures,
}: Props) {
  // Si on arrive depuis le portail apprenant avec ?eid=, on
  // pré-sélectionne l'apprenant pour sauter l'étape 1.
  const [selectedLearnerId, setSelectedLearnerId] = useState<string | null>(
    initialEnrollmentId &&
      learners.some((l) => l.enrollmentId === initialEnrollmentId)
      ? initialEnrollmentId
      : null,
  );
  const [signatures, setSignatures] =
    useState<ExistingSignature[]>(initialSignatures);
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const selectedLearner = learners.find(
    (l) => l.enrollmentId === selectedLearnerId,
  );
  const today = todayIso();

  // Index des signatures par (enrollment, date, moment, role)
  const signaturesByKey = useMemo(() => {
    const map = new Map<string, ExistingSignature>();
    for (const s of signatures) {
      map.set(`${s.enrollment_id}|${s.period_date}|${s.moment}|${s.signer_role}`, s);
    }
    return map;
  }, [signatures]);

  // Compte les signatures par apprenant (pour les badges dans la liste)
  const signedCountByEnrollment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of signatures) {
      if (s.signer_role !== "learner") continue;
      counts.set(s.enrollment_id, (counts.get(s.enrollment_id) ?? 0) + 1);
    }
    return counts;
  }, [signatures]);

  // Nombre total de demi-journées (= 2 par jour)
  const totalSlots = days.length * 2;

  function isSlotSigned(
    enrollmentId: string,
    date: string,
    moment: Moment,
  ): ExistingSignature | undefined {
    return signaturesByKey.get(`${enrollmentId}|${date}|${moment}|learner`);
  }

  function openSlot(slot: ActiveSlot) {
    setActiveSlot(slot);
    setHasDrawn(false);
    setError(null);
  }

  function closeSlot() {
    setActiveSlot(null);
    setHasDrawn(false);
    setError(null);
    padRef.current?.clear();
  }

  async function handleSubmit() {
    if (!activeSlot) return;
    const data = padRef.current?.getDataURL();
    if (!data) {
      setError("Veuillez signer dans la zone prévue.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await signAttendancePublic({
      token,
      enrollmentId: activeSlot.enrollmentId,
      periodDate: activeSlot.periodDate,
      moment: activeSlot.moment,
      signerName: activeSlot.signerName,
      signatureDataUrl: data,
    });

    setSubmitting(false);

    if (!res.ok) {
      setError(res.error ?? "Erreur inconnue.");
      return;
    }

    // Mise à jour optimiste : on ajoute la nouvelle signature à l'état
    setSignatures((prev) => [
      ...prev,
      {
        enrollment_id: activeSlot.enrollmentId,
        period_date: activeSlot.periodDate,
        moment: activeSlot.moment,
        signer_role: "learner",
        signer_name: activeSlot.signerName,
        signed_at: res.signedAt ?? new Date().toISOString(),
      },
    ]);
    closeSlot();
  }

  // -------- Étape 1 : choix de l'apprenant --------
  if (!selectedLearner) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4">
          <h2 className="text-sm font-bold text-zinc-900 mb-1">
            1. Sélectionnez votre nom
          </h2>
          <p className="text-xs text-zinc-500 mb-3">
            Touchez votre nom dans la liste ci-dessous.
          </p>
          <ul className="divide-y divide-zinc-100 -mx-4">
            {learners.length === 0 && (
              <li className="px-4 py-3 text-sm text-zinc-500 italic">
                Aucun apprenant inscrit à cette session.
              </li>
            )}
            {learners.map((l) => {
              const signed = signedCountByEnrollment.get(l.enrollmentId) ?? 0;
              const allDone = signed >= totalSlots && totalSlots > 0;
              return (
                <li key={l.enrollmentId}>
                  <button
                    type="button"
                    onClick={() => setSelectedLearnerId(l.enrollmentId)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 active:bg-zinc-100 text-left"
                  >
                    <span className="font-medium text-zinc-900">
                      {l.civility ? `${l.civility} ` : ""}
                      {l.fullName}
                    </span>
                    <span className="flex items-center gap-2">
                      {totalSlots > 0 && (
                        <span
                          className={
                            allDone
                              ? "text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"
                              : signed > 0
                                ? "text-xs font-medium text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full"
                                : "text-xs text-zinc-400"
                          }
                        >
                          {signed}/{totalSlots} signé{signed > 1 ? "s" : ""}
                        </span>
                      )}
                      {allDone && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  // -------- Étape 2 : signatures par demi-journée --------
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-4">
        <button
          type="button"
          onClick={() => setSelectedLearnerId(null)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 mb-2"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Changer d&apos;apprenant
        </button>
        <h2 className="text-sm text-zinc-500">Vous signez en tant que</h2>
        <p className="text-lg font-bold text-zinc-900">
          {selectedLearner.civility ? `${selectedLearner.civility} ` : ""}
          {selectedLearner.fullName}
        </p>
      </div>

      {days.map((day) => {
        const isFuture = day.day_date > today;
        const morningSigned = isSlotSigned(
          selectedLearner.enrollmentId,
          day.day_date,
          "morning",
        );
        const afternoonSigned = isSlotSigned(
          selectedLearner.enrollmentId,
          day.day_date,
          "afternoon",
        );

        return (
          <div
            key={day.day_date}
            className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
              <div className="text-sm font-semibold text-zinc-900 capitalize">
                {formatDayLabel(day.day_date)}
              </div>
              {isFuture && (
                <div className="text-[11px] text-amber-700 mt-0.5">
                  Jour à venir — signature impossible pour le moment.
                </div>
              )}
            </div>
            <div className="divide-y divide-zinc-100">
              <SlotRow
                icon={<Sun className="h-4 w-4 text-amber-500" />}
                label="Matin"
                timeRange={
                  day.morning_start && day.morning_end
                    ? `${shortTime(day.morning_start)} – ${shortTime(day.morning_end)}`
                    : null
                }
                signed={morningSigned}
                disabled={isFuture}
                onClick={() =>
                  openSlot({
                    enrollmentId: selectedLearner.enrollmentId,
                    signerName: selectedLearner.fullName,
                    periodDate: day.day_date,
                    moment: "morning",
                    dayLabel: formatDayLabel(day.day_date),
                    momentLabel: "Matin",
                  })
                }
              />
              <SlotRow
                icon={<Sunset className="h-4 w-4 text-orange-500" />}
                label="Après-midi"
                timeRange={
                  day.afternoon_start && day.afternoon_end
                    ? `${shortTime(day.afternoon_start)} – ${shortTime(day.afternoon_end)}`
                    : null
                }
                signed={afternoonSigned}
                disabled={isFuture}
                onClick={() =>
                  openSlot({
                    enrollmentId: selectedLearner.enrollmentId,
                    signerName: selectedLearner.fullName,
                    periodDate: day.day_date,
                    moment: "afternoon",
                    dayLabel: formatDayLabel(day.day_date),
                    momentLabel: "Après-midi",
                  })
                }
              />
            </div>
          </div>
        );
      })}

      {/* Modale signature */}
      {activeSlot && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-zinc-900 text-sm capitalize">
                  {activeSlot.dayLabel}
                </h3>
                <p className="text-xs text-zinc-600">
                  {activeSlot.momentLabel} · {activeSlot.signerName}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSlot}
                disabled={submitting}
                className="p-1.5 rounded hover:bg-zinc-100 text-zinc-500"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex justify-center">
              <SignaturePad
                ref={padRef}
                width={320}
                height={160}
                onChange={(empty) => setHasDrawn(!empty)}
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeSlot}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-300 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !hasDrawn}
                className="flex-1 px-4 py-2.5 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Envoi…" : "Valider ma signature"}
              </button>
            </div>
            <p className="text-[10px] text-zinc-400 text-center pt-1">
              Une fois validée, la signature ne peut plus être modifiée
              (preuve Qualiopi).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

type SlotRowProps = {
  icon: React.ReactNode;
  label: string;
  timeRange: string | null;
  signed: ExistingSignature | undefined;
  disabled: boolean;
  onClick: () => void;
};

function SlotRow({ icon, label, timeRange, signed, disabled, onClick }: SlotRowProps) {
  if (signed) {
    return (
      <div className="px-4 py-3 flex items-center justify-between bg-emerald-50/50">
        <div className="flex items-center gap-2.5">
          {icon}
          <div>
            <div className="text-sm font-medium text-zinc-900">
              {label}
              {timeRange && (
                <span className="text-xs text-zinc-500 ml-2 font-normal">
                  ({timeRange})
                </span>
              )}
            </div>
            <div className="text-[11px] text-emerald-700">
              Signé le{" "}
              {new Date(signed.signed_at).toLocaleString("fr-FR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed text-left"
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <div>
          <div className="text-sm font-medium text-zinc-900">
            {label}
            {timeRange && (
              <span className="text-xs text-zinc-500 ml-2 font-normal">
                ({timeRange})
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400">À signer</div>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 px-2.5 py-1 rounded-full">
        <Pen className="h-3 w-3" />
        Signer
      </span>
    </button>
  );
}
