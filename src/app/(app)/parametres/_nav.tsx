"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  Building2,
  Cloud,
  Euro,
  FileText,
  Landmark,
  Tag,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  /** Couleur d'accent pour l'icône (token Tailwind sans préfixe). */
  accent: "cyan" | "indigo" | "amber" | "violet" | "emerald" | "rose" | "slate";
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

/**
 * Menu Paramètres organisé par thème.
 * Chaque groupe correspond à un axe métier — l'utilisateur trouve plus
 * vite ce qu'il cherche.
 */
const GROUPS: NavGroup[] = [
  {
    id: "structure",
    label: "Mon organisme",
    items: [
      {
        href: "/parametres/organisation",
        label: "Organisation",
        description: "Identité, logo, mentions légales, signature",
        icon: Building2,
        accent: "cyan",
      },
    ],
  },
  {
    id: "catalogue",
    label: "Catalogue & tarifs",
    items: [
      {
        href: "/parametres/competences",
        label: "Compétences & catalogue",
        description: "Référentiel de compétences et catégories",
        icon: Wrench,
        accent: "indigo",
      },
      {
        href: "/parametres/tarification",
        label: "Tarification",
        description: "Tarifs par défaut INTER/INTRA, présentiel/distanciel",
        icon: Euro,
        accent: "amber",
      },
      {
        href: "/parametres/statuts-sessions",
        label: "Statuts de session",
        description: "Cycle de vie des sessions (brouillon, confirmée…)",
        icon: Tag,
        accent: "slate",
      },
      {
        href: "/parametres/opcos",
        label: "OPCO",
        description: "Référentiel des Opérateurs de Compétences",
        icon: Landmark,
        accent: "emerald",
      },
    ],
  },
  {
    id: "communications",
    label: "Communications",
    items: [
      {
        href: "/parametres/modeles-documents",
        label: "Modèles documents",
        description: "Convocation, convention, attestation, emails",
        icon: FileText,
        accent: "violet",
      },
    ],
  },
  {
    id: "pedagogie",
    label: "Évaluation pédagogique",
    items: [
      {
        href: "/parametres/quiz",
        label: "Bibliothèque de quiz",
        description: "Quiz pré/post session, scoring automatique",
        icon: Brain,
        accent: "rose",
      },
    ],
  },
  {
    id: "integrations",
    label: "Intégrations",
    items: [
      {
        href: "/parametres/google",
        label: "Google",
        description: "Calendar, Drive, comptes Workspace",
        icon: Cloud,
        accent: "emerald",
      },
    ],
  },
];

const ACCENT_CLASSES: Record<
  NavItem["accent"],
  {
    bg: string;
    text: string;
    activeBg: string;
    activeRing: string;
    hoverBg: string;
  }
> = {
  cyan: {
    bg: "bg-cyan-100 dark:bg-cyan-950/40",
    text: "text-cyan-700 dark:text-cyan-400",
    activeBg: "bg-cyan-600",
    activeRing: "ring-cyan-200 dark:ring-cyan-900",
    hoverBg: "hover:bg-cyan-50 dark:hover:bg-cyan-950/30",
  },
  indigo: {
    bg: "bg-indigo-100 dark:bg-indigo-950/40",
    text: "text-indigo-700 dark:text-indigo-400",
    activeBg: "bg-indigo-600",
    activeRing: "ring-indigo-200 dark:ring-indigo-900",
    hoverBg: "hover:bg-indigo-50 dark:hover:bg-indigo-950/30",
  },
  amber: {
    bg: "bg-amber-100 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-400",
    activeBg: "bg-amber-500",
    activeRing: "ring-amber-200 dark:ring-amber-900",
    hoverBg: "hover:bg-amber-50 dark:hover:bg-amber-950/30",
  },
  violet: {
    bg: "bg-violet-100 dark:bg-violet-950/40",
    text: "text-violet-700 dark:text-violet-400",
    activeBg: "bg-violet-600",
    activeRing: "ring-violet-200 dark:ring-violet-900",
    hoverBg: "hover:bg-violet-50 dark:hover:bg-violet-950/30",
  },
  emerald: {
    bg: "bg-emerald-100 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-400",
    activeBg: "bg-emerald-600",
    activeRing: "ring-emerald-200 dark:ring-emerald-900",
    hoverBg: "hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
  },
  rose: {
    bg: "bg-rose-100 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-400",
    activeBg: "bg-rose-600",
    activeRing: "ring-rose-200 dark:ring-rose-900",
    hoverBg: "hover:bg-rose-50 dark:hover:bg-rose-950/30",
  },
  slate: {
    bg: "bg-slate-100 dark:bg-slate-800/40",
    text: "text-slate-700 dark:text-slate-300",
    activeBg: "bg-slate-700",
    activeRing: "ring-slate-200 dark:ring-slate-800",
    hoverBg: "hover:bg-slate-50 dark:hover:bg-slate-800/40",
  },
};

export function ParametresNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sous-sections Paramètres"
      className="border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-white to-zinc-50/40 dark:from-zinc-900 dark:to-zinc-950 px-8 py-5"
    >
      <div className="flex flex-wrap gap-x-8 gap-y-5">
        {GROUPS.map((group) => (
          <div key={group.id} className="flex-1 min-w-[220px]">
            <h3 className="text-[10px] uppercase tracking-[0.12em] font-bold text-zinc-400 dark:text-zinc-500 mb-2">
              {group.label}
            </h3>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                const a = ACCENT_CLASSES[item.accent];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-all",
                        isActive
                          ? `ring-1 ${a.activeRing} bg-white dark:bg-zinc-900 shadow-sm`
                          : cn(
                              "border border-transparent",
                              a.hoverBg,
                            ),
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
                          isActive
                            ? `${a.activeBg} text-white shadow-md`
                            : `${a.bg} ${a.text} group-hover:scale-105`,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block font-semibold leading-tight",
                            isActive
                              ? "text-zinc-900 dark:text-zinc-100"
                              : "text-zinc-700 dark:text-zinc-300",
                          )}
                        >
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5">
                            {item.description}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
