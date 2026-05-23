import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiItem } from "./_kpi-queries";

/**
 * Carte KPI dépliable du dashboard (Gilles 2026-05-23).
 *
 * Comportement :
 * - Affiche le compteur et le label en mode replié
 * - Au clic (<details>), déplie la liste des items concernés
 *   (chaque item cliquable vers sa fiche)
 * - Si `items.length === 0` mais `count > 0`, pas de dépliage
 * - Si `count === 0`, retourne `null` (carte non affichée, économie
 *   d'espace visuel — Gilles).
 */

type Accent = "red" | "amber" | "cyan" | "emerald" | "violet" | "zinc";

const ACCENT_STYLES: Record<
  Accent,
  { border: string; iconBg: string; iconText: string; value: string }
> = {
  red: {
    border: "border-l-rose-500",
    iconBg: "bg-rose-50",
    iconText: "text-rose-600",
    value: "text-rose-700",
  },
  amber: {
    border: "border-l-amber-500",
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    value: "text-amber-700",
  },
  cyan: {
    border: "border-l-cyan-500",
    iconBg: "bg-cyan-50",
    iconText: "text-cyan-600",
    value: "text-cyan-700",
  },
  emerald: {
    border: "border-l-emerald-500",
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    value: "text-emerald-700",
  },
  violet: {
    border: "border-l-violet-500",
    iconBg: "bg-violet-50",
    iconText: "text-violet-600",
    value: "text-violet-700",
  },
  zinc: {
    border: "border-l-zinc-400",
    iconBg: "bg-zinc-100",
    iconText: "text-zinc-600",
    value: "text-zinc-800",
  },
};

type Props = {
  label: string;
  value: number | string;
  items?: KpiItem[];
  hint?: string;
  icon?: LucideIcon;
  accent?: Accent;
  pill?: { text: string; tone: "red" | "amber" | "emerald" | "zinc" };
  /** Si true, la card s'affiche même avec count=0 (ex: CA potentiel,
   *  Sessions 100% Qualiopi qui restent informatifs même à 0). */
  showWhenZero?: boolean;
};

export function KpiCard({
  label,
  value,
  items = [],
  hint,
  icon: Icon,
  accent = "zinc",
  pill,
  showWhenZero = false,
}: Props) {
  const s = ACCENT_STYLES[accent];
  const numeric = typeof value === "number" ? value : Number(value);
  const isNumericZero = Number.isFinite(numeric) && numeric === 0;
  const isStringZero =
    typeof value === "string" && (value === "0 €" || value === "0");

  if ((isNumericZero || isStringZero) && !showWhenZero) {
    return null;
  }

  const canExpand = items.length > 0;

  const headerContent = (
    <div className="flex flex-col gap-2 flex-1 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 leading-tight">
          {label}
        </span>
        {Icon && (
          <span
            className={cn(
              "h-7 w-7 rounded-lg inline-flex items-center justify-center shrink-0",
              s.iconBg,
              s.iconText,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={cn(
            "text-3xl font-bold tabular-nums leading-none",
            s.value,
          )}
        >
          {value}
        </span>
        {pill && (
          <span
            className={cn(
              "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border",
              pill.tone === "red" &&
                "bg-rose-100 text-rose-800 border-rose-200",
              pill.tone === "amber" &&
                "bg-amber-100 text-amber-800 border-amber-200",
              pill.tone === "emerald" &&
                "bg-emerald-100 text-emerald-800 border-emerald-200",
              pill.tone === "zinc" &&
                "bg-zinc-100 text-zinc-600 border-zinc-200",
            )}
          >
            {pill.text}
          </span>
        )}
      </div>
      {hint && (
        <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2">
          {hint}
        </p>
      )}
    </div>
  );

  const containerClass = cn(
    "rounded-xl bg-white border border-zinc-200 border-l-4 p-3.5 shadow-sm h-full",
    s.border,
  );

  if (!canExpand) {
    return <div className={containerClass}>{headerContent}</div>;
  }

  return (
    <details className={cn("group", containerClass)}>
      <summary className="cursor-pointer list-none flex items-start gap-2 hover:opacity-90">
        {headerContent}
        <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0 mt-1 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-3 pt-3 border-t border-zinc-100 space-y-1 max-h-64 overflow-y-auto">
        {items.map((item, i) => (
          <li key={`${item.href}-${i}`}>
            <Link
              href={item.href}
              className="block px-2 py-1.5 rounded-md hover:bg-zinc-50 -mx-2"
            >
              <div className="text-xs font-medium text-zinc-800 truncate">
                {item.label}
              </div>
              {item.meta && (
                <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                  {item.meta}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
