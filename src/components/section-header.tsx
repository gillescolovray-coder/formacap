import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  accent?: "emerald" | "blue" | "amber" | "rose" | "violet" | "zinc";
};

// Palette CAP NUMÉRIQUE : bleu marine + cyan, avec accents complémentaires
// Les noms d'accent sont conservés pour compatibilité avec les appels existants.
const ACCENT_CLASSES: Record<NonNullable<SectionHeaderProps["accent"]>, string> = {
  // emerald → cyan (accent principal CAP NUMÉRIQUE)
  emerald:
    "bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-700 dark:from-cyan-950 dark:to-cyan-900 dark:text-cyan-300 ring-1 ring-cyan-200/60 dark:ring-cyan-800/50",
  // blue → bleu marine CAP
  blue: "bg-gradient-to-br from-blue-100 to-blue-200 text-blue-800 dark:from-blue-950 dark:to-blue-900 dark:text-blue-300 ring-1 ring-blue-200/60 dark:ring-blue-800/50",
  amber:
    "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 dark:from-amber-950 dark:to-amber-900 dark:text-amber-300 ring-1 ring-amber-200/60 dark:ring-amber-800/50",
  rose: "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-700 dark:from-rose-950 dark:to-rose-900 dark:text-rose-300 ring-1 ring-rose-200/60 dark:ring-rose-800/50",
  // violet → indigo (plus proche du bleu marine)
  violet:
    "bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700 dark:from-indigo-950 dark:to-indigo-900 dark:text-indigo-300 ring-1 ring-indigo-200/60 dark:ring-indigo-800/50",
  // zinc → slate (gris froid qui s'accorde au bleu marine)
  zinc: "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 dark:from-slate-800 dark:to-slate-700 dark:text-slate-300 ring-1 ring-slate-200/60 dark:ring-slate-700/50",
};

export function SectionHeader({
  icon: Icon,
  title,
  description,
  accent = "emerald",
}: SectionHeaderProps) {
  return (
    <div className="flex items-start gap-4 pb-3 border-b border-slate-100 dark:border-slate-800/50">
      <div
        className={cn(
          "h-11 w-11 shrink-0 rounded-xl flex items-center justify-center shadow-sm",
          ACCENT_CLASSES[accent],
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
