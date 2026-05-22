/**
 * Mini-timeline du cycle de vie email d'une convention (Gilles 2026-05-22).
 *
 * Affiche 5 étapes sous forme d'icônes alignées :
 *   📤 envoyée → ✅ reçue → 👁️ ouverte → 🔗 cliquée → ✍️ signée
 *
 * Chaque icône est colorée :
 *   - gris : non encore atteinte
 *   - vert : franchie (avec date au survol)
 *
 * Si l'email est rejeté (bounce) ou marqué spam (complain), un badge
 * rouge apparaît à la place.
 *
 * Server component pur — pas de JS client requis.
 */

import {
  AlertTriangle,
  Check,
  Eye,
  MailCheck,
  MousePointerClick,
  PenLine,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  sentAt?: string | null;
  deliveredAt?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  signedAt?: string | null;
  bouncedAt?: string | null;
  complainedAt?: string | null;
  preNotifiedAt?: string | null;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function EmailStatusTimeline(props: Props) {
  const {
    sentAt,
    deliveredAt,
    openedAt,
    clickedAt,
    signedAt,
    bouncedAt,
    complainedAt,
    preNotifiedAt,
  } = props;

  // Cas erreur : on affiche un badge alerte rouge
  if (bouncedAt || complainedAt) {
    const errLabel = bouncedAt ? "Email rejeté" : "Marqué comme spam";
    const errDate = bouncedAt ?? complainedAt;
    return (
      <div
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-[11px] font-bold text-rose-700 dark:text-rose-300"
        title={`${errLabel} le ${formatDate(errDate)}`}
      >
        <AlertTriangle className="h-3 w-3" />
        {errLabel}
      </div>
    );
  }

  if (!sentAt && !preNotifiedAt) {
    return (
      <span className="text-[11px] text-zinc-400 italic">
        Pas encore envoyé
      </span>
    );
  }

  const steps = [
    {
      key: "sent",
      icon: Send,
      label: "Envoyée",
      time: sentAt,
    },
    {
      key: "delivered",
      icon: MailCheck,
      label: "Reçue",
      time: deliveredAt,
    },
    {
      key: "opened",
      icon: Eye,
      label: "Ouverte",
      time: openedAt,
    },
    {
      key: "clicked",
      icon: MousePointerClick,
      label: "Cliquée",
      time: clickedAt,
    },
    {
      key: "signed",
      icon: PenLine,
      label: "Signée",
      time: signedAt,
    },
  ] as const;

  return (
    <div className="inline-flex items-center gap-0.5">
      {preNotifiedAt && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200 mr-1"
          title={`Pré-notifié·e par Gmail le ${formatDate(preNotifiedAt)}`}
        >
          <Check className="h-2.5 w-2.5" />
          Prév.
        </span>
      )}
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const reached = Boolean(step.time);
        return (
          <span
            key={step.key}
            className={cn(
              "inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold transition-colors",
              reached
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-300 dark:bg-zinc-800 dark:text-zinc-600",
            )}
            title={
              reached
                ? `${step.label} le ${formatDate(step.time)}`
                : `${step.label} : en attente`
            }
            aria-label={`${step.label} ${reached ? "✓" : "✗"}`}
          >
            <Icon className="h-3 w-3" />
            <span className="sr-only">
              {step.label} {reached ? "✓" : ""}
            </span>
            {idx < steps.length - 1 && (
              <span aria-hidden className="hidden" />
            )}
          </span>
        );
      })}
    </div>
  );
}
