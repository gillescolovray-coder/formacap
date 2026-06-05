import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  BookOpen,
  FileText,
  GraduationCap,
  LayoutDashboard,
  User,
} from "lucide-react";
import { resolveLearnerContext } from "./_resolve";
import { createAdminClient } from "@/lib/supabase/admin";
import { logLearnerVisit } from "@/lib/portal/log-visit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace apprenant — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

export default async function LearnerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await resolveLearnerContext(token);
  if (!ctx) notFound();

  // Traçabilité : enregistre la visite (throttle 30 min). Best-effort.
  await logLearnerVisit(
    createAdminClient(),
    ctx.learner.organization_id,
    ctx.learner.id,
  );

  const base = `/apprenant/${token}`;
  const fullName =
    [ctx.learner.civility, ctx.learner.first_name, ctx.learner.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Apprenant";

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
          {/* Branding orga (gauche) */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {ctx.organization.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ctx.organization.logo_url}
                alt={ctx.organization.name}
                className="h-7 sm:h-9 w-auto shrink-0"
              />
            )}
            <div className="min-w-0 hidden xs:block sm:block">
              <p className="text-[9px] sm:text-[10px] uppercase tracking-widest text-cyan-700 font-bold">
                Espace apprenant
              </p>
              <p className="text-xs sm:text-sm font-bold text-zinc-900 leading-tight truncate">
                {ctx.organization.name}
              </p>
            </div>
          </div>
          {/* Identite apprenant (droite) */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="text-right min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Connecté en tant que
              </p>
              <p className="text-sm font-bold text-zinc-900 inline-flex items-center gap-1.5">
                <User className="h-4 w-4 text-cyan-600" />
                <span className="truncate max-w-[200px]">{fullName}</span>
              </p>
            </div>
          </div>
        </div>
        {/* Nav onglets */}
        <nav className="bg-zinc-50 border-t border-zinc-200">
          <div className="max-w-6xl mx-auto px-2 sm:px-4 flex gap-0.5 sm:gap-1 overflow-x-auto">
            <NavLink href={base} icon={LayoutDashboard} label="Tableau de bord" />
            <NavLink
              href={`${base}/sessions`}
              icon={BookOpen}
              label="Mes formations"
            />
            <NavLink
              href={`${base}/documents`}
              icon={FileText}
              label="Mes documents"
            />
            <NavLink
              href={`${base}/quiz`}
              icon={GraduationCap}
              label="Mes résultats"
            />
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto p-3 sm:p-6">{children}</main>

      <footer className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-7 text-center">
        <p className="text-sm sm:text-base font-semibold text-zinc-700">
          Espace réservé aux apprenants de {ctx.organization.name}.
        </p>
        <p className="text-sm sm:text-base text-zinc-600 mt-1">
          Pour toute question :{" "}
          {ctx.organization.email ? (
            <a
              href={`mailto:${ctx.organization.email}`}
              className="font-bold text-cyan-700 hover:underline break-all"
            >
              {ctx.organization.email}
            </a>
          ) : (
            "—"
          )}
        </p>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-2.5 text-[11px] sm:text-xs font-bold text-zinc-600 hover:text-cyan-700 hover:bg-white border-b-2 border-transparent hover:border-cyan-500 whitespace-nowrap transition-colors"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Link>
  );
}
