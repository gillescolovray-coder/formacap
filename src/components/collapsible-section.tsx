import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "blue" | "amber" | "rose" | "violet" | "zinc";

const ACCENT_CLASSES: Record<Accent, string> = {
  emerald:
    "bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-700 dark:from-cyan-950 dark:to-cyan-900 dark:text-cyan-300 ring-1 ring-cyan-200/50 dark:ring-cyan-800/50",
  blue: "bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 dark:from-blue-950 dark:to-blue-900 dark:text-blue-300 ring-1 ring-blue-200/50 dark:ring-blue-800/50",
  amber:
    "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 dark:from-amber-950 dark:to-amber-900 dark:text-amber-300 ring-1 ring-amber-200/50 dark:ring-amber-800/50",
  rose: "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-700 dark:from-rose-950 dark:to-rose-900 dark:text-rose-300 ring-1 ring-rose-200/50 dark:ring-rose-800/50",
  violet:
    "bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 dark:from-violet-950 dark:to-violet-900 dark:text-violet-300 ring-1 ring-violet-200/50 dark:ring-violet-800/50",
  zinc: "bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-700 dark:from-zinc-800 dark:to-zinc-700 dark:text-zinc-300 ring-1 ring-zinc-200/50 dark:ring-zinc-700/50",
};

type CollapsibleSectionProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  accent?: Accent;
  defaultOpen?: boolean;
  /** ID stable utilisé pour la persistance d'état (sinon dérivé du titre). */
  id?: string;
  /** Élément optionnel affiché à droite du titre (compteur, badge, etc.). */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function CollapsibleSection({
  icon: Icon,
  title,
  description,
  accent = "emerald",
  defaultOpen = false,
  id,
  headerExtra,
  children,
}: CollapsibleSectionProps) {
  const sectionId = id ?? slugify(title);
  return (
    <details
      open={defaultOpen}
      data-section-id={sectionId}
      className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden transition-shadow open:shadow-md"
    >
      <summary className="cursor-pointer list-none px-5 py-4 flex items-start gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50 transition-colors">
        <div
          className={cn(
            "h-11 w-11 shrink-0 rounded-xl flex items-center justify-center shadow-sm",
            ACCENT_CLASSES[accent],
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {description}
            </p>
          )}
        </div>
        {headerExtra && <div className="shrink-0 mt-1">{headerExtra}</div>}
        <ChevronDown className="h-5 w-5 text-zinc-400 mt-2 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-5 border-t border-zinc-100 dark:border-zinc-800/50">
        <div className="pt-5">{children}</div>
      </div>
    </details>
  );
}
