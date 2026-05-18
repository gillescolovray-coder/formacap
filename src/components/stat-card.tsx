import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: "emerald" | "blue" | "amber" | "zinc";
};

const ACCENT_CLASSES = {
  emerald:
    "bg-cyan-50 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "zinc",
}: StatCardProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <p className="text-3xl font-semibold tracking-tight mt-2 truncate">
            {value}
          </p>
          {hint && (
            <p className="text-xs text-zinc-500 mt-1 truncate">{hint}</p>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "h-10 w-10 shrink-0 rounded-lg flex items-center justify-center",
              ACCENT_CLASSES[accent],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
