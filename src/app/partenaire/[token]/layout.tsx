import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  Handshake,
  LayoutDashboard,
  ListChecks,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "./_resolve";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace partenaire — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

export default async function PartnerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const base = `/partenaire/${token}`;

  // Compteur des pré-inscriptions en attente — affiché en badge
  // sur l'onglet « À valider » pour attirer l'œil.
  const supabase = createAdminClient();
  const { data: stage } = await supabase
    .from("inscription_stages")
    .select("id")
    .eq("organization_id", ctx.company.organization_id)
    .eq("key", "partner_preinscription")
    .maybeSingle<{ id: string }>();
  let preinscriptionsCount = 0;
  if (stage?.id) {
    const { count } = await supabase
      .from("inscription_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.company.organization_id)
      .eq("referrer_company_id", ctx.company.id)
      .eq("stage_id", stage.id);
    preinscriptionsCount = count ?? 0;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {ctx.organization.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ctx.organization.logo_url}
                alt={ctx.organization.name}
                className="h-9 w-auto"
              />
            )}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-cyan-700 font-bold">
                Espace partenaire
              </p>
              <p className="text-sm font-bold text-zinc-900 leading-tight">
                {ctx.organization.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Connecté en tant que
              </p>
              <p className="text-sm font-bold text-zinc-900 inline-flex items-center gap-1.5">
                <Handshake className="h-4 w-4 text-cyan-600" />
                {ctx.company.name}
              </p>
            </div>
            {/* Logo du partenaire à droite (à côté de son nom). */}
            {ctx.company.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ctx.company.logo_url}
                alt={ctx.company.name}
                className="h-10 w-auto max-w-[120px] object-contain"
              />
            )}
          </div>
        </div>
        <nav className="bg-zinc-50 border-t border-zinc-200">
          <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
            <NavLink href={base} icon={LayoutDashboard} label="Tableau de bord" />
            <NavLink
              href={`${base}/catalogue`}
              icon={BookOpen}
              label={
                ctx.company.type === "of" ? "Catalogue distanciel" : "Catalogue"
              }
            />
            <NavLink
              href={`${base}/preinscriptions`}
              icon={ClipboardList}
              label="À valider"
              badge={preinscriptionsCount > 0 ? preinscriptionsCount : undefined}
            />
            <NavLink
              href={`${base}/inscriptions`}
              icon={ListChecks}
              label="Mes inscriptions"
            />
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6">{children}</main>

      <footer className="max-w-6xl mx-auto px-4 py-6 text-center text-[11px] text-zinc-500">
        Espace réservé aux partenaires de {ctx.organization.name}. Pour toute
        question : {ctx.organization.email ?? "—"}
      </footer>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-zinc-600 hover:text-cyan-700 hover:bg-white border-b-2 border-transparent hover:border-cyan-500 whitespace-nowrap transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-black">
          {badge}
        </span>
      )}
    </Link>
  );
}
