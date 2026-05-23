"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Loader2, PenLine, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { cn } from "@/lib/utils";
import {
  clearSignatureAsTrainer,
  saveSignatureAsTrainer,
} from "../actions";

/**
 * Variante portail formateur de SignatureGrid (cf. admin
 * src/app/(app)/sessions/[id]/emargement/electronique/_signature-grid.tsx).
 *
 * Différences :
 *  - Auth par token (passé en prop, transmis à chaque action serveur)
 *  - Actions trainer qui valident le token avant écriture
 *  - Retour { ok, error } au lieu de throw (rollback géré explicitement)
 */

export type Moment = "morning" | "afternoon";
export type SignerRole = "learner" | "trainer";

export type DayPeriod = {
  date: string;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
};

export type LearnerRow = {
  enrollmentId: string;
  fullName: string;
  company: string | null;
};

export type SignatureSnapshot = {
  enrollment_id: string;
  period_date: string;
  moment: Moment;
  signer_role: SignerRole;
  signer_name: string;
  signature_data: string;
  signed_at: string;
};

type Props = {
  token: string;
  sessionId: string;
  periods: DayPeriod[];
  learners: LearnerRow[];
  initialSignatures: SignatureSnapshot[];
  trainerDisplayName: string | null;
  modalityShortLabel: string | null;
};

const MOMENTS: Moment[] = ["morning", "afternoon"];

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}
function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function formatTime(t: string | null) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return t;
  if (mm === 0) return `${hh}h`;
  return `${hh}h${mm.toString().padStart(2, "0")}`;
}
function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return "—";
  return `${formatTime(start)} → ${formatTime(end)}`;
}

function sigKey(
  enrollmentId: string | null,
  date: string,
  moment: Moment,
  role: SignerRole,
): string {
  const eid = enrollmentId ?? "trainer";
  return `${eid}|${date}|${moment}|${role}`;
}

type ModalState = {
  enrollmentId: string;
  signerName: string;
  signerRole: SignerRole;
  periodDate: string;
  moment: Moment;
} | null;

export function TrainerSignatureGrid({
  token,
  sessionId,
  periods,
  learners,
  initialSignatures,
  trainerDisplayName,
  modalityShortLabel,
}: Props) {
  const [signatures, setSignatures] = useState<Map<string, SignatureSnapshot>>(
    () => {
      const m = new Map<string, SignatureSnapshot>();
      for (const s of initialSignatures) {
        m.set(sigKey(s.enrollment_id, s.period_date, s.moment, s.signer_role), s);
      }
      return m;
    },
  );
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();
  const padRef = useRef<SignaturePadHandle>(null);
  const [padFilled, setPadFilled] = useState(false);

  // Ancrage signature formateur sur le 1er apprenant (table NOT NULL)
  const trainerAnchor = learners[0]?.enrollmentId;

  function getSignature(
    enrollmentId: string,
    date: string,
    moment: Moment,
    role: SignerRole,
  ) {
    return signatures.get(sigKey(enrollmentId, date, moment, role));
  }

  function openSignerModalForLearner(
    learner: LearnerRow,
    date: string,
    moment: Moment,
  ) {
    setPadFilled(false);
    setModal({
      enrollmentId: learner.enrollmentId,
      signerName: learner.fullName,
      signerRole: "learner",
      periodDate: date,
      moment,
    });
  }

  function openSignerModalForTrainer(date: string, moment: Moment) {
    if (!trainerAnchor) return;
    setPadFilled(false);
    setModal({
      enrollmentId: trainerAnchor,
      signerName: trainerDisplayName ?? "Formateur",
      signerRole: "trainer",
      periodDate: date,
      moment,
    });
  }

  function closeModal() {
    setModal(null);
    padRef.current?.clear();
    setPadFilled(false);
  }

  function handleValidate() {
    if (!modal) return;
    const dataUrl = padRef.current?.getDataURL();
    if (!dataUrl) return;
    const key = sigKey(
      modal.enrollmentId,
      modal.periodDate,
      modal.moment,
      modal.signerRole,
    );
    setPending((p) => ({ ...p, [key]: true }));
    setSignatures((prev) => {
      const next = new Map(prev);
      next.set(key, {
        enrollment_id: modal.enrollmentId,
        period_date: modal.periodDate,
        moment: modal.moment,
        signer_role: modal.signerRole,
        signer_name: modal.signerName,
        signature_data: dataUrl,
        signed_at: new Date().toISOString(),
      });
      return next;
    });
    const snapshotInput = {
      enrollmentId: modal.enrollmentId,
      periodDate: modal.periodDate,
      moment: modal.moment,
      signerRole: modal.signerRole,
      signerName: modal.signerName,
      signatureData: dataUrl,
    };
    closeModal();

    startTransition(async () => {
      const res = await saveSignatureAsTrainer(token, sessionId, snapshotInput);
      if (!res.ok) {
        setSignatures((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        alert(
          `Échec de l'enregistrement : ${res.error ?? "erreur inconnue"}.`,
        );
      }
      setPending((p) => {
        const copy = { ...p };
        delete copy[key];
        return copy;
      });
    });
  }

  function handleClear(
    enrollmentId: string,
    date: string,
    moment: Moment,
    role: SignerRole,
  ) {
    if (!confirm("Supprimer cette signature ?")) return;
    const key = sigKey(enrollmentId, date, moment, role);
    const previous = signatures.get(key);
    setPending((p) => ({ ...p, [key]: true }));
    setSignatures((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });

    startTransition(async () => {
      const res = await clearSignatureAsTrainer(token, sessionId, {
        enrollmentId,
        periodDate: date,
        moment,
        signerRole: role,
      });
      if (!res.ok && previous) {
        setSignatures((prev) => {
          const next = new Map(prev);
          next.set(key, previous);
          return next;
        });
        alert(`Échec de la suppression : ${res.error ?? "erreur inconnue"}.`);
      }
      setPending((p) => {
        const copy = { ...p };
        delete copy[key];
        return copy;
      });
    });
  }

  return (
    <>
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th
                rowSpan={2}
                className="px-4 py-3 sticky left-0 bg-zinc-50 dark:bg-zinc-950 z-10 text-left border-r border-zinc-200 dark:border-zinc-800 align-middle min-w-[220px]"
              >
                Apprenant / Formateur
              </th>
              {periods.map((p) => (
                <th
                  key={p.date}
                  colSpan={2}
                  className="px-3 py-2 text-center border-l border-zinc-200 dark:border-zinc-800"
                >
                  <div className="text-[10px] font-normal text-zinc-500 capitalize">
                    {new Date(p.date).toLocaleDateString("fr-FR", {
                      weekday: "short",
                    })}
                  </div>
                  <div className="text-zinc-900 dark:text-zinc-100">
                    {formatDateShort(p.date)}
                  </div>
                  {modalityShortLabel && (
                    <div className="text-[10px] font-normal text-zinc-500 italic mt-0.5">
                      {modalityShortLabel}
                    </div>
                  )}
                </th>
              ))}
            </tr>
            <tr>
              {periods.flatMap((p) => [
                <th
                  key={`${p.date}-morning`}
                  className="px-2 py-2 text-center text-[10px] font-medium min-w-[170px] border-l border-zinc-200 dark:border-zinc-800"
                >
                  <div className="text-zinc-700 dark:text-zinc-300">Matin</div>
                  <div className="font-normal text-zinc-500 text-[10px]">
                    {formatRange(p.morning_start, p.morning_end)}
                  </div>
                </th>,
                <th
                  key={`${p.date}-afternoon`}
                  className="px-2 py-2 text-center text-[10px] font-medium min-w-[170px]"
                >
                  <div className="text-zinc-700 dark:text-zinc-300">A-M</div>
                  <div className="font-normal text-zinc-500 text-[10px]">
                    {formatRange(p.afternoon_start, p.afternoon_end)}
                  </div>
                </th>,
              ])}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {learners.map((l) => (
              <tr key={l.enrollmentId}>
                <td className="px-4 py-3 sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                  <div className="font-medium truncate max-w-[220px]">
                    {l.fullName}
                  </div>
                  {l.company && (
                    <div className="text-xs text-zinc-500 truncate max-w-[220px]">
                      {l.company}
                    </div>
                  )}
                </td>
                {periods.map((p) =>
                  MOMENTS.map((m) => {
                    const sig = getSignature(l.enrollmentId, p.date, m, "learner");
                    const key = sigKey(l.enrollmentId, p.date, m, "learner");
                    const isPending = Boolean(pending[key]);
                    return (
                      <td
                        key={key}
                        className={cn(
                          "px-1 py-2 text-center align-middle h-20",
                          m === "morning"
                            ? "border-l border-zinc-200 dark:border-zinc-800"
                            : "",
                        )}
                      >
                        {sig ? (
                          <SignatureCell
                            sig={sig}
                            onClear={() =>
                              handleClear(l.enrollmentId, p.date, m, "learner")
                            }
                            pending={isPending}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => openSignerModalForLearner(l, p.date, m)}
                            disabled={isPending}
                            className="inline-flex items-center justify-center gap-1 h-8 px-2 text-xs font-medium rounded-md border border-cyan-300 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-800 dark:text-cyan-400 dark:hover:bg-cyan-950/30 transition-colors disabled:opacity-40"
                          >
                            <PenLine className="h-3.5 w-3.5" />
                            Signer
                          </button>
                        )}
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
            {/* Ligne formateur */}
            <tr className="bg-violet-50/30 dark:bg-violet-950/10">
              <td className="px-4 py-3 sticky left-0 bg-violet-50/30 dark:bg-violet-950/10 z-10 border-r border-zinc-200 dark:border-zinc-800 align-middle">
                <div className="text-[10px] uppercase tracking-wider font-bold text-violet-700 dark:text-violet-400 mb-0.5">
                  Formateur
                </div>
                <div className="font-semibold truncate max-w-[220px]">
                  {trainerDisplayName ?? "—"}
                </div>
              </td>
              {periods.map((p) =>
                MOMENTS.map((m) => {
                  if (!trainerAnchor) {
                    return (
                      <td
                        key={`trainer-${p.date}-${m}`}
                        className={cn(
                          "px-1 py-2 text-center text-[10px] text-zinc-400 italic",
                          m === "morning"
                            ? "border-l border-zinc-200 dark:border-zinc-800"
                            : "",
                        )}
                      >
                        —
                      </td>
                    );
                  }
                  const sig = getSignature(trainerAnchor, p.date, m, "trainer");
                  const key = sigKey(trainerAnchor, p.date, m, "trainer");
                  const isPending = Boolean(pending[key]);
                  return (
                    <td
                      key={`trainer-${p.date}-${m}`}
                      className={cn(
                        "px-1 py-2 text-center align-middle h-20",
                        m === "morning"
                          ? "border-l border-zinc-200 dark:border-zinc-800"
                          : "",
                      )}
                    >
                      {sig ? (
                        <SignatureCell
                          sig={sig}
                          onClear={() =>
                            handleClear(trainerAnchor, p.date, m, "trainer")
                          }
                          pending={isPending}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => openSignerModalForTrainer(p.date, m)}
                          disabled={isPending || !trainerDisplayName}
                          className="inline-flex items-center justify-center gap-1 h-8 px-2 text-xs font-medium rounded-md border border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/30 transition-colors disabled:opacity-40"
                          title={
                            !trainerDisplayName
                              ? "Aucun formateur défini sur la session"
                              : undefined
                          }
                        >
                          <PenLine className="h-3.5 w-3.5" />
                          Signer
                        </button>
                      )}
                    </td>
                  );
                }),
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Modale signature */}
      {modal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">
                  Signature de {modal.signerName}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {modal.moment === "morning" ? "Matin" : "Après-midi"} du{" "}
                  {formatDateLong(modal.periodDate)}
                </p>
                {modal.signerRole === "trainer" && (
                  <p className="text-[11px] text-violet-700 dark:text-violet-400 italic mt-1">
                    Signature du formateur
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Fermer"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <SignaturePad
              ref={padRef}
              responsive
              maxWidth={360}
              height={160}
              onChange={(empty) => setPadFilled(!empty)}
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <Button type="button" variant="outline" onClick={closeModal}>
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleValidate}
                disabled={!padFilled}
              >
                <Check className="h-4 w-4" />
                Valider la signature
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SignatureCell({
  sig,
  onClear,
  pending,
}: {
  sig: SignatureSnapshot;
  onClear: () => void;
  pending: boolean;
}) {
  return (
    <div className="relative inline-flex flex-col items-center gap-0.5 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sig.signature_data}
        alt={`Signature de ${sig.signer_name}`}
        className="h-12 max-w-[140px] object-contain bg-white rounded border border-zinc-200"
      />
      <span className="text-[9px] text-zinc-500 truncate max-w-[140px]">
        {new Date(sig.signed_at).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        })}{" "}
        {new Date(sig.signed_at).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      {pending && (
        <Loader2 className="absolute right-0 top-0 h-3 w-3 animate-spin text-zinc-400" />
      )}
      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        title="Supprimer cette signature"
        className="absolute -top-1 -right-1 h-5 w-5 inline-flex items-center justify-center rounded-full bg-white border border-zinc-300 text-zinc-500 hover:text-red-700 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
