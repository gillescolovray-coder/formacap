import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Archive,
  BookOpen,
  ClipboardList,
  Handshake,
  LayoutDashboard,
  ListChecks,
  Users,
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
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
          {/* Branding orga (gauche) — logo plus petit + texte caché
              sur très petit écran pour libérer l'espace. */}
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
                Espace partenaire
              </p>
              <p className="text-xs sm:text-sm font-bold text-zinc-900 leading-tight truncate">
                {ctx.organization.name}
              </p>
            </div>
          </div>
          {/* Branding partenaire (droite) — logo seul visible sur
              mobile pour gagner de la place. */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="text-right hidden sm:block min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Connecté en tant que
              </p>
              <p className="text-sm font-bold text-zinc-900 inline-flex items-center gap-1.5">
                <Handshake className="h-4 w-4 text-cyan-600" />
                <span className="truncate max-w-[200px]">
                  {ctx.company.name}
                </span>
              </p>
            </div>
            {ctx.company.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ctx.company.logo_url}
                alt={ctx.company.name}
                className="h-8 sm:h-10 w-auto max-w-[80px] sm:max-w-[120px] object-contain shrink-0"
              />
            )}
          </div>
        </div>
        {/* Nav onglets — labels raccourcis sur mobile via `sm:hidden` */}
        <nav className="bg-zinc-50 border-t border-zinc-200">
          <div className="max-w-6xl mx-auto px-2 sm:px-4 flex gap-0.5 sm:gap-1 overflow-x-auto">
            <NavLink
              href={base}
              icon={LayoutDashboard}
              label="Tableau de bord"
              labelShort="Accueil"
            />
            <NavLink
              href={`${base}/catalogue`}
              icon={BookOpen}
              label={
                ctx.company.type === "of" ? "Catalogue distanciel" : "Catalogue"
              }
              labelShort="Catalogue"
            />
            <NavLink
              href={`${base}/preinscriptions`}
              icon={ClipboardList}
              label="À valider"
              labelShort="À valider"
              badge={preinscriptionsCount > 0 ? preinscriptionsCount : undefined}
            />
            <NavLink
              href={`${base}/inscriptions`}
              icon={ListChecks}
              label="Mes inscriptions"
              labelShort="Mes insc."
            />
            <NavLink
              href={`${base}/participants`}
              icon={Users}
              label="Participants"
              labelShort="Particip."
            />
            <NavLink
              href={`${base}/archives`}
              icon={Archive}
              label="Archives"
              labelShort="Archives"
            />
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto p-3 sm:p-6">{children}</main>

      <footer className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-6 text-center text-sm sm:text-base font-medium text-zinc-600">
        Espace réservé aux partenaires de {ctx.organization.name}. Pour toute
        question :{" "}
        {ctx.organization.email && (
          <>
            <a
              href={`mailto:${ctx.organization.email}`}
              className="font-semibold text-cyan-700 hover:underline"
            >
              {ctx.organization.email}
            </a>
            {" · "}
          </>
        )}
        <a
          href="tel:+33665023132"
          className="font-semibold text-cyan-700 hover:underline whitespace-nowrap"
        >
          06 65 02 31 32
        </a>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  labelShort,
  badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** Libellé court pour mobile (par défaut : `label`). */
  labelShort?: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-2.5 text-[11px] sm:text-xs font-bold text-zinc-600 hover:text-cyan-700 hover:bg-white border-b-2 border-transparent hover:border-cyan-500 whitespace-nowrap transition-colors"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {/* Libellé long en desktop, court (ou idem) sur mobile */}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{labelShort ?? label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-1 sm:px-1.5 rounded-full bg-amber-500 text-white text-[9px] sm:text-[10px] font-black">
          {badge}
        </span>
      )}
    </Link>
  );
}
