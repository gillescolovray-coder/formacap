"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pen, Sun, Sunset, X } from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { signSlotForAllAsTrainer } from "../actions";

type SessionDay = {
  day_date: string;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
};

type Moment = "morning" | "afternoon";

type ActiveSlot = {
  periodDate: string;
  moment: Moment;
  dayLabel: string;
  momentLabel: string;
};

type Props = {
  token: string;
  sessionId: string;
  trainerName: string;
  days: SessionDay[];
  enrollmentCount: number;
  /** "YYYY-MM-DD|morning" -> nombre de signatures formateur posées */
  signedCountBySlot: Record<string, number>;
};

function formatDayLabel(iso: string): string {
  const label = new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shortTime(t: string | null): string {
  if (!t) return "—";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function EmargementGrid({
  token,
  sessionId,
  trainerName,
  days,
  enrollmentCount,
  signedCountBySlot,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState<ActiveSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  function openSlot(slot: ActiveSlot) {
    setActive(slot);
    setHasDrawn(false);
    setError(null);
  }

  function closeSlot() {
    setActive(null);
    setHasDrawn(false);
    setError(null);
    padRef.current?.clear();
  }

  async function handleSubmit() {
    if (!active) return;
    const data = padRef.current?.getDataURL();
    if (!data) {
      setError("Veuillez signer dans la zone prévue.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await signSlotForAllAsTrainer({
      token,
      sessionId,
      periodDate: active.periodDate,
      moment: active.moment,
      signerName: trainerName,
      signatureDataUrl: data,
    });

    setSubmitting(false);

    if (!res.ok) {
      setError(res.error ?? "Erreur inconnue.");
      return;
    }
    closeSlot();
    router.refresh();
  }

  return (
    <>
      <div className="space-y-3">
        {days.map((day) => {
          const dayLabel = formatDayLabel(day.day_date);
          return (
            <div
              key={day.day_date}
              className="rounded-xl bg-white shadow-sm border border-zinc-200 overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 text-sm font-semibold text-zinc-900">
                {dayLabel}
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
                  signedCount={
                    signedCountBySlot[`${day.day_date}|morning`] ?? 0
                  }
                  totalCount={enrollmentCount}
                  onClick={() =>
                    openSlot({
                      periodDate: day.day_date,
                      moment: "morning",
                      dayLabel,
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
                  signedCount={
                    signedCountBySlot[`${day.day_date}|afternoon`] ?? 0
                  }
                  totalCount={enrollmentCount}
                  onClick={() =>
                    openSlot({
                      periodDate: day.day_date,
                      moment: "afternoon",
                      dayLabel,
                      momentLabel: "Après-midi",
                    })
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Modale signature */}
      {active && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-zinc-900 text-sm">
                  {active.dayLabel}
                </h3>
                <p className="text-xs text-zinc-600">
                  {active.momentLabel} · {trainerName}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Cette signature sera enregistrée pour les{" "}
                  {enrollmentCount} apprenant
                  {enrollmentCount > 1 ? "s" : ""}.
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
                {submitting ? "Envoi…" : "Valider"}
              </button>
            </div>
            <p className="text-[10px] text-zinc-400 text-center pt-1">
              Une fois validée, la signature ne peut plus être modifiée
              (preuve Qualiopi).
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function SlotRow({
  icon,
  label,
  timeRange,
  signedCount,
  totalCount,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  timeRange: string | null;
  signedCount: number;
  totalCount: number;
  onClick: () => void;
}) {
  const allSigned = totalCount > 0 && signedCount >= totalCount;

  if (allSigned) {
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
              ✓ Signé pour les {totalCount} apprenants
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
      className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 text-left"
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
          <div className="text-[11px] text-zinc-400">
            {signedCount > 0
              ? `${signedCount}/${totalCount} signatures (partiel)`
              : "À signer"}
          </div>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 px-2.5 py-1 rounded-full">
        <Pen className="h-3 w-3" />
        Signer
      </span>
    </button>
  );
}
