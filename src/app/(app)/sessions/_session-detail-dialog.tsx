"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Clock,
  FileSignature,
  GraduationCap,
  Mail,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modal large "Synthese Inscriptions / Conventions" affichee au clic
 * depuis le tableau Sessions (Gilles 2026-05-31, refonte UI Option A).
 *
 * But : permettre a l utilisateur de voir d un coup tous les apprenants
 * d une session + leur statut Convention + Convocation + Attestation
 * + Montant HT, sans devoir ouvrir la fiche session.
 *
 * Largeur ~900px, scroll vertical si beaucoup d apprenants.
 */

export type SessionDetailItem = {
  key: string;
  learnerId: string | null;
  fullName: string;
  companyName: string | null;
  /** Source de l inscription : "direct" (CAP), "OF — nom", "Prescripteur — nom" */
  sourceLabel: string;
  stageName: string | null;
  stageColor: string | null;
  amountHt: number | null;
  convention: "signed" | "sent" | "draft" | "cancelled" | "none";
  convocationSent: boolean;
  attestationSent: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  sessionTitle: string;
  sessionDate: string | null;
  items: SessionDetailItem[];
};

const CONVENTION_LABELS: Record<SessionDetailItem["convention"], string> = {
  signed: "Signée",
  sent: "Envoyée",
  draft: "Brouillon",
  cancelled: "Annulée",
  none: "—",
};

const CONVENTION_COLORS: Record<SessionDetailItem["convention"], string> = {
  signed:
    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300",
  sent:
    "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300",
  draft:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300",
  cancelled:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300",
  none:
    "bg-zinc-100 text-zinc-500 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-500",
};

export function SessionDetailDialog({
  open,
  onClose,
  sessionTitle,
  sessionDate,
  items,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fermeture sur Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  // Resumes
  const totalAmount = items.reduce(
    (acc, it) => acc + (it.amountHt ?? 0),
    0,
  );
  const nbSigned = new Set(
    items
      .filter((it) => it.convention === "signed")
      .map((it) => it.companyName ?? `__solo_${it.key}`),
  ).size;
  const nbSent = new Set(
    items
      .filter((it) => it.convention === "sent")
      .map((it) => it.companyName ?? `__solo_${it.key}`),
  ).size;
  const nbConvocations = items.filter((it) => it.convocationSent).length;
  const nbAttestations = items.filter((it) => it.attestationSent).length;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-[900px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">
              {sessionTitle}
            </h2>
            {sessionDate && (
              <p className="text-xs text-zinc-500 mt-0.5">{sessionDate}</p>
            )}
            <p className="text-[11px] text-zinc-500 mt-1">
              Synthèse des inscriptions et conventions
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Résumé chiffré */}
        {items.length > 0 && (
          <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Chip
                icon={<GraduationCap className="h-3 w-3" />}
                label={`${items.length} apprenant${items.length > 1 ? "s" : ""}`}
                color="bg-cyan-100 text-cyan-800 border-cyan-300"
              />
              <Chip
                icon={<FileSignature className="h-3 w-3" />}
                label={`${nbSigned} convention${nbSigned > 1 ? "s" : ""} signée${nbSigned > 1 ? "s" : ""}`}
                color="bg-emerald-100 text-emerald-800 border-emerald-300"
              />
              <Chip
                icon={<Mail className="h-3 w-3" />}
                label={`${nbSent} envoyée${nbSent > 1 ? "s" : ""}`}
                color="bg-cyan-100 text-cyan-800 border-cyan-300"
              />
              <Chip
                icon={<Mail className="h-3 w-3" />}
                label={`${nbConvocations} convocation${nbConvocations > 1 ? "s" : ""} envoyée${nbConvocations > 1 ? "s" : ""}`}
                color="bg-violet-100 text-violet-800 border-violet-300"
              />
              <Chip
                icon={<Check className="h-3 w-3" />}
                label={`${nbAttestations} attestation${nbAttestations > 1 ? "s" : ""} envoyée${nbAttestations > 1 ? "s" : ""}`}
                color="bg-teal-100 text-teal-800 border-teal-300"
              />
              <Chip
                label={`Total HT : ${totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`}
                color="bg-zinc-900 text-white border-zinc-900"
              />
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {items.length === 0 ? (
            <p className="p-8 text-center text-sm text-zinc-500 italic">
              Aucun apprenant inscrit pour cette session.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-950 sticky top-0 text-[10px] uppercase tracking-wider font-bold text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Apprenant</th>
                  <th className="px-3 py-2 text-left">Entreprise</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Étape</th>
                  <th className="px-3 py-2 text-center">Convention</th>
                  <th className="px-3 py-2 text-center">Convoc.</th>
                  <th className="px-3 py-2 text-center">Attest.</th>
                  <th className="px-3 py-2 text-right">Montant HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((it) => (
                  <tr
                    key={it.key}
                    className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30"
                  >
                    <td className="px-3 py-2 font-semibold">{it.fullName}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {it.companyName ?? (
                        <span className="text-zinc-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 text-[11px]">
                      {it.sourceLabel}
                    </td>
                    <td className="px-3 py-2">
                      {it.stageName ? (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border"
                          style={{
                            backgroundColor: `${it.stageColor ?? "#94a3b8"}15`,
                            borderColor: it.stageColor ?? "#94a3b8",
                            color: it.stageColor ?? "#475569",
                          }}
                        >
                          {it.stageName}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap",
                          CONVENTION_COLORS[it.convention],
                        )}
                      >
                        {CONVENTION_LABELS[it.convention]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {it.convocationSent ? (
                        <Check className="inline h-4 w-4 text-emerald-600" />
                      ) : (
                        <Clock className="inline h-4 w-4 text-zinc-300" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {it.attestationSent ? (
                        <Check className="inline h-4 w-4 text-emerald-600" />
                      ) : (
                        <Clock className="inline h-4 w-4 text-zinc-300" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {it.amountHt !== null ? (
                        `${it.amountHt.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-9 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-sm font-medium"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Chip({
  label,
  color,
  icon,
}: {
  label: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded border font-semibold",
        color,
      )}
    >
      {icon}
      {label}
    </span>
  );
}
