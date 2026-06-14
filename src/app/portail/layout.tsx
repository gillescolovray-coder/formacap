import Link from "next/link";
import { Mail, Phone, Search } from "lucide-react";
import { getPublicOrganization } from "@/lib/public-catalogue/queries";

export const dynamic = "force-dynamic";

const ODOO_SITE = "https://www.capnumerique.com";

/**
 * Layout du PORTAIL PUBLIC de catalogue (Gilles 2026-06-14).
 * HabillÃ© aux couleurs CAP (charte du site Odoo) : en-tÃªte blanc + bandeau
 * marine, pied de page dÃ©gradÃ©. Public, sans login.
 */
export default async function CatalogueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const org = await getPublicOrganization();
  const orgName = org?.name ?? "CAP NumÃ©rique";

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-800">
      {/* En-tÃªte */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <a href={ODOO_SITE} className="flex items-center gap-2 shrink-0">
            {org?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logoUrl}
                alt={orgName}
                className="h-9 w-auto object-contain"
              />
            ) : (
              <span className="text-lg font-black text-[#1e3a8a]">
                {orgName}
              </span>
            )}
          </a>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/portail"
              className="text-sm font-semibold text-slate-700 hover:text-[#9d1b51] hidden sm:inline"
            >
              Nos formations
            </Link>
            <a
              href={`${ODOO_SITE}/contactus`}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#1e3a8a] to-[#9d1b51] text-white text-sm font-semibold px-4 py-2 shadow-sm hover:opacity-90"
            >
              <Mail className="h-4 w-4" />
              Contactez-nous
            </a>
          </nav>
        </div>
        {/* Bandeau marine de rÃ©assurance (comme le site Odoo) */}
        <div className="bg-[#1e3a8a] text-white text-[11px] sm:text-xs">
          <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 font-medium">
            <span>ðŸ“ 27 ans d&apos;expertise / BTP</span>
            <span>ðŸŽ“ Certification Qualiopi &amp; coaching</span>
            <span>
              â­ Triple compÃ©tence (Acheteur, Entreprise, Ã‰diteur de profil
              acheteur)
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Pied de page */}
      <footer className="bg-gradient-to-br from-cyan-50 to-indigo-100 border-t border-slate-200 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-8 grid gap-8 md:grid-cols-3 text-sm">
          <div>
            <h3 className="text-[#1e3a8a] font-bold mb-2">Liens utiles</h3>
            <ul className="space-y-1 text-slate-600">
              <li>
                <Link href="/portail" className="hover:text-[#9d1b51]">
                  Catalogue de formation
                </Link>
              </li>
              <li>
                <a href={ODOO_SITE} className="hover:text-[#9d1b51]">
                  Site CAP NumÃ©rique
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-[#1e3a8a] font-bold mb-2">Ã€ propos</h3>
            <p className="text-slate-600 leading-relaxed">
              <strong>{orgName}</strong>, organisme de formation certifiÃ©
              Qualiopi, accompagne les pros du BTP, du paysage et du secteur
              public dans leur montÃ©e en compÃ©tences.
            </p>
          </div>
          <div>
            <h3 className="text-[#1e3a8a] font-bold mb-2">
              AccÃ©lÃ©rez avec {orgName}
            </h3>
            <ul className="space-y-1.5 text-slate-700">
              {org?.email && (
                <li className="inline-flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#9d1b51]" />
                  <a href={`mailto:${org.email}`} className="hover:underline">
                    {org.email}
                  </a>
                </li>
              )}
              {org?.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[#9d1b51]" />
                  {org.phone}
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="bg-[#1e3a8a] text-white/80 text-[11px]">
          <div className="max-w-6xl mx-auto px-4 py-3 text-center">
            Â© {orgName} â€” Organisme de formation certifiÃ© Qualiopi.
          </div>
        </div>
      </footer>
    </div>
  );
}

// Ã‰vite l'avertissement "unused import" si Search venait Ã  ne pas servir.
void Search;

