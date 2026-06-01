"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, Loader2, XCircle } from "lucide-react";
import { updateSubcontractingSessionStatus } from "./_subcontract-status-actions";

type Props = {
  token: string;
  sessionId: string;
  currentStatus: string;
};

const STATUS_OPTIONS: Array<{
  value: "planned" | "confirmed" | "cancelled";
  label: string;
  description: string;
  cls: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "planned",
    label: "Planifiée",
    description: "En attente d'inscriptions",
    cls: "bg-amber-50 text-amber-700 hover:bg-amber-100",
    icon: CheckCircle2,
  },
  {
    value: "confirmed",
    label: "Confirmée",
    description: "Démarrage garanti",
    cls: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    icon: CheckCircle2,
  },
  {
    value: "cancelled",
    label: "Annulée",
    description: "Session annulée",
    cls: "bg-red-50 text-red-700 hover:bg-red-100",
    icon: XCircle,
  },
];

/**
 * Petit dropdown pour qu un OF/Prescripteur donneur d ordre puisse
 * changer le statut d une session de sous-traitance (Gilles 2026-06-01).
 *
 * Cible : carte session du catalogue, integre a cote du bouton
 * "Inscrire un apprenant".
 */
export function SubcontractStatusControl({
  token,
  sessionId,
  currentStatus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleChange(newStatus: "planned" | "confirmed" | "cancelled") {
    if (newStatus === currentStatus) {
      setOpen(false);
      return;
    }
    const ok = window.confirm(
      newStatus === "cancelled"
        ? "Annuler cette session ? Un email sera envoyé à CAP NUMERIQUE."
        : `Passer la session en « ${newStatus === "confirmed" ? "Confirmée" : "Planifiée"} » ? Un email sera envoyé à CAP NUMERIQUE.`,
    );
    if (!ok) return;
    setOpen(false);
    startTransition(async () => {
      const res = await updateSubcontractingSessionStatus(
        token,
        sessionId,
        newStatus,
      );
      if (!res.ok) {
        setFeedback(`Erreur : ${res.error ?? "inconnu"}`);
        setTimeout(() => setFeedback(null), 5000);
      } else {
        setFeedback("Statut mis à jour. Email envoyé.");
        setTimeout(() => setFeedback(null), 3500);
      }
    });
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-indigo-300 bg-white text-indigo-700 text-xs font-bold hover:bg-indigo-50 disabled:opacity-50"
        title="Modifier le statut de la session (sous-traitance)"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Statut
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && !pending && (
        <>
          {/* Overlay pour fermer en cliquant ailleurs */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full mt-1 z-40 w-60 rounded-lg border border-zinc-200 bg-white shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-100 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
              Changer le statut
            </div>
            {STATUS_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isCurrent = currentStatus === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleChange(opt.value)}
                  disabled={isCurrent}
                  className={
                    isCurrent
                      ? "w-full text-left px-3 py-2 text-sm bg-zinc-50 text-zinc-400 cursor-not-allowed flex items-center gap-2"
                      : `w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${opt.cls}`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">
                      {opt.label}
                      {isCurrent && (
                        <span className="ml-1 text-[10px] font-normal text-zinc-400">
                          (actuel)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] opacity-75">
                      {opt.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {feedback && (
        <div
          className={
            feedback.startsWith("Erreur")
              ? "absolute right-0 top-full mt-1 z-50 w-64 rounded-md border border-red-200 bg-red-50 text-red-700 text-xs px-3 py-2 shadow"
              : "absolute right-0 top-full mt-1 z-50 w-64 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs px-3 py-2 shadow"
          }
        >
          {feedback}
        </div>
      )}
    </div>
  );
}
