"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileText,
  FolderOpen,
  GraduationCap,
  Mail,
  MessageSquareText,
  ShieldCheck,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ColorScheme = {
  /** Bouton actif : fond plein. */
  active: string;
  /** Bouton inactif : couleur de l'icône. */
  iconIdle: string;
  /** Bouton inactif au survol : fond léger. */
  hover: string;
};

type Tab = {
  href: (id: string) => string;
  matches: (id: string, pathname: string) => boolean;
  label: string;
  icon: LucideIcon;
  count?: number | null;
  disabled?: boolean;
  scheme: ColorScheme;
};

type Props = {
  sessionId: string;
  counts?: {
    participants?: number;
    documents?: number;
    convocations?: number;
    conventions?: number;
    evaluations?: number;
    attestations?: number;
    positionnement?: number;
    quiz?: number;
  };
};

// Schémas de couleurs alignés sur la charte (cyan-CAP NUMÉRIQUE +
// accents complémentaires). Chaque onglet a sa propre teinte pour
// faciliter la mémorisation visuelle.
const SCHEMES = {
  slate: {
    active:
      "bg-slate-800 text-white shadow-md shadow-slate-800/20 ring-1 ring-slate-700",
    iconIdle: "text-slate-500",
    hover: "hover:bg-slate-100 dark:hover:bg-slate-800/40",
  },
  cyan: {
    active:
      "bg-cyan-600 text-white shadow-md shadow-cyan-600/30 ring-1 ring-cyan-500",
    iconIdle: "text-cyan-600",
    hover: "hover:bg-cyan-50 dark:hover:bg-cyan-950/30",
  },
  indigo: {
    active:
      "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-500",
    iconIdle: "text-indigo-600",
    hover: "hover:bg-indigo-50 dark:hover:bg-indigo-950/30",
  },
  emerald: {
    active:
      "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-500",
    iconIdle: "text-emerald-600",
    hover: "hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
  },
  violet: {
    active:
      "bg-violet-600 text-white shadow-md shadow-violet-600/30 ring-1 ring-violet-500",
    iconIdle: "text-violet-600",
    hover: "hover:bg-violet-50 dark:hover:bg-violet-950/30",
  },
  amber: {
    active:
      "bg-amber-500 text-white shadow-md shadow-amber-500/30 ring-1 ring-amber-400",
    iconIdle: "text-amber-600",
    hover: "hover:bg-amber-50 dark:hover:bg-amber-950/30",
  },
  orange: {
    active:
      "bg-orange-500 text-white shadow-md shadow-orange-500/30 ring-1 ring-orange-400",
    iconIdle: "text-orange-600",
    hover: "hover:bg-orange-50 dark:hover:bg-orange-950/30",
  },
  pink: {
    active:
      "bg-pink-600 text-white shadow-md shadow-pink-600/30 ring-1 ring-pink-500",
    iconIdle: "text-pink-600",
    hover: "hover:bg-pink-50 dark:hover:bg-pink-950/30",
  },
  rose: {
    active:
      "bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-1 ring-rose-500",
    iconIdle: "text-rose-600",
    hover: "hover:bg-rose-50 dark:hover:bg-rose-950/30",
  },
} satisfies Record<string, ColorScheme>;

export function SessionTabs({ sessionId, counts }: Props) {
  const pathname = usePathname();
  const tabs: Tab[] = [
    {
      href: (id) => `/sessions/${id}`,
      matches: (id, p) =>
        p === `/sessions/${id}` || p === `/sessions/${id}/fiche`,
      label: "Fiche",
      icon: ClipboardList,
      scheme: SCHEMES.slate,
    },
    {
      href: (id) => `/sessions/${id}/participants`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/participants`),
      label: "Participants",
      icon: Users,
      count: counts?.participants ?? null,
      scheme: SCHEMES.cyan,
    },
    {
      href: (id) => `/sessions/${id}/conventions`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/conventions`),
      label: "Conventions",
      icon: FileText,
      count: counts?.conventions ?? null,
      scheme: SCHEMES.violet,
    },
    {
      href: (id) => `/sessions/${id}/convocations`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/convocations`),
      label: "Convocations",
      icon: Mail,
      count: counts?.convocations ?? null,
      scheme: SCHEMES.indigo,
    },
    {
      href: (id) => `/sessions/${id}/emargement`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/emargement`),
      label: "Émargement",
      icon: FileSignature,
      scheme: SCHEMES.emerald,
    },
    {
      href: (id) => `/sessions/${id}/documents`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/documents`),
      label: "Documents",
      icon: FolderOpen,
      count: counts?.documents ?? null,
      scheme: SCHEMES.violet,
    },
    {
      href: (id) => `/sessions/${id}/positionnement`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/positionnement`),
      label: "Positionnement",
      icon: ClipboardCheck,
      count: counts?.positionnement ?? null,
      scheme: SCHEMES.amber,
    },
    {
      href: (id) => `/sessions/${id}/quiz`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/quiz`),
      label: "Quiz",
      icon: GraduationCap,
      count: counts?.quiz ?? null,
      scheme: SCHEMES.orange,
    },
    {
      href: (id) => `/sessions/${id}/evaluation`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/evaluation`),
      label: "Évaluation",
      icon: Star,
      count: counts?.evaluations ?? null,
      scheme: SCHEMES.pink,
    },
    {
      href: (id) => `/sessions/${id}/attestations`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/attestations`),
      label: "Attestations",
      icon: Award,
      count: counts?.attestations ?? null,
      scheme: SCHEMES.amber,
    },
    {
      // Consultation du bilan formateur (Module 7) — rempli depuis
      // le portail formateur. Gilles 2026-05-25.
      href: (id) => `/sessions/${id}/bilan`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/bilan`),
      label: "Bilan formateur",
      icon: MessageSquareText,
      scheme: SCHEMES.indigo,
    },
    {
      href: (id) => `/sessions/${id}/qualite`,
      matches: (id, p) => p.startsWith(`/sessions/${id}/qualite`),
      label: "Qualité",
      icon: ShieldCheck,
      disabled: true,
      scheme: SCHEMES.rose,
    },
  ];

  return (
    <nav
      aria-label="Sections de la session"
      className="bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-[88px] z-[5] backdrop-blur-sm"
    >
      <div className="px-8 py-3 overflow-x-auto">
        <ul className="flex items-center gap-1.5 flex-nowrap">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = !t.disabled && t.matches(sessionId, pathname);
            const hasCount = t.count !== undefined && t.count !== null;

            // Onglet désactivé (modules à venir)
            if (t.disabled) {
              return (
                <li key={t.label} className="shrink-0">
                  <span
                    className="group inline-flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-full text-sm font-medium border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed whitespace-nowrap transition-colors"
                    title={`${t.label} — bientôt disponible`}
                  >
                    <Icon className="h-4 w-4 opacity-60" />
                    {t.label}
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 font-bold">
                      Bientôt
                    </span>
                  </span>
                </li>
              );
            }

            return (
              <li key={t.label} className="shrink-0">
                <Link
                  href={t.href(sessionId)}
                  className={cn(
                    "group inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-150",
                    isActive
                      ? t.scheme.active
                      : cn(
                          "text-zinc-700 dark:text-zinc-300",
                          t.scheme.hover,
                          "hover:translate-y-[-1px]",
                        ),
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors shrink-0",
                      isActive
                        ? "text-white"
                        : cn(t.scheme.iconIdle, "group-hover:scale-110"),
                    )}
                  />
                  {t.label}
                  {hasCount && (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-bold tabular-nums",
                        isActive
                          ? "bg-white/25 text-white"
                          : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-700",
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
