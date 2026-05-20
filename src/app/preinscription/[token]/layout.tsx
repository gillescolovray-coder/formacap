import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolvePartnerContext } from "@/app/partenaire/[token]/_resolve";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pré-inscription — CAP NUMÉRIQUE",
  robots: "noindex, nofollow",
};

/**
 * Layout minimaliste pour la page publique de pré-inscription.
 *
 * Ce layout est volontairement TRÈS SOBRE : pas de menu, pas de mention
 * de tarif, pas d'indication CAP NUMÉRIQUE. C'est le partenaire qui
 * diffuse ce lien — il porte la relation commerciale avec ses clients
 * finaux (et applique ses propres marges).
 */
export default async function PreinscriptionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          {ctx.company.logo_url ? (
            // Cobranding partenaire + CAP NUMÉRIQUE.
            // MOBILE : 2 lignes pour ne pas déborder
            //   Ligne 1 = logo partenaire + nom partenaire (compact)
            //   Ligne 2 = « En partenariat avec » + logo CAP
            // DESKTOP : tout sur une ligne avec séparateur.
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ctx.company.logo_url}
                  alt={ctx.company.name}
                  className="h-10 sm:h-14 w-auto max-w-[120px] sm:max-w-[180px] object-contain shrink-0"
                />
                <div className="min-w-0 sm:hidden">
                  <p className="text-[10px] uppercase tracking-widest text-cyan-700 font-bold">
                    Pré-inscription
                  </p>
                  <p className="text-sm font-bold text-zinc-900 leading-tight truncate">
                    {ctx.company.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-3 flex-1 min-w-0">
                <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                    En partenariat avec
                  </span>
                  {ctx.organization.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ctx.organization.logo_url}
                      alt={ctx.organization.name}
                      className="h-8 sm:h-10 w-auto max-w-[110px] sm:max-w-[140px] object-contain mt-1"
                    />
                  ) : (
                    <span className="text-xs sm:text-sm font-bold text-zinc-900 mt-1">
                      {ctx.organization.name}
                    </span>
                  )}
                </div>
                <div className="hidden sm:block pl-3 border-l border-zinc-200 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-cyan-700 font-bold">
                    Pré-inscription
                  </p>
                  <p className="text-base font-bold text-zinc-900 leading-tight truncate">
                    {ctx.company.name}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // Pas de logo partenaire : juste logo orga + nom partenaire
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {ctx.organization.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ctx.organization.logo_url}
                  alt={ctx.organization.name}
                  className="h-8 sm:h-10 w-auto shrink-0"
                />
              )}
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-cyan-700 font-bold">
                  Pré-inscription
                </p>
                <p className="text-sm sm:text-base font-bold text-zinc-900 leading-tight truncate">
                  {ctx.company.name}
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-3 sm:p-6">{children}</main>

      <footer className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 text-center text-[10px] sm:text-[11px] text-zinc-500">
        Pour toute question, contactez {ctx.company.name}
        {ctx.company.email ? ` — ${ctx.company.email}` : ""}.
      </footer>
    </div>
  );
}
