import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Carte KPI compacte du dashboard.
 * - nombre grand au centre
 * - label au-dessus
 * - hint (texte optionnel sous le nombre)
 * - accent couleur (impacte le bord gauche + l'icône)
 * - cliquable si `href` fourni
 *
 * Mobile-first : 1 colonne en xs, grilles plus larges au-delà.
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
  hint?: string;
  icon?: LucideIcon;
  accent?: Accent;
  href?: string;
  /** Affiche un badge "URGENT" / "À TRAITER" / "OK" / etc. */
  pill?: { text: string; tone: "red" | "amber" | "emerald" | "zinc" };
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "zinc",
  href,
  pill,
}: Props) {
  const s = ACCENT_STYLES[accent];
  const numeric = typeof value === "number" ? value : Number(value);
  const isZero = Number.isFinite(numeric) && numeric === 0;

  const content = (
    <div
      className={cn(
        "rounded-xl bg-white border border-zinc-200 border-l-4 p-3.5 shadow-sm h-full flex flex-col gap-2",
        s.border,
        href && !isZero
          ? "hover:bg-zinc-50 hover:shadow-md transition-all cursor-pointer"
          : "",
        isZero ? "opacity-70" : "",
      )}
    >
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
            isZero ? "text-zinc-400" : s.value,
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

  if (href && !isZero) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }
  return content;
}
