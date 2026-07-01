import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Crumb = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  /** Titre principal — string (cas usuel) ou JSX (pour styliser une
   *  partie du titre comme un sous-libellé). */
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
};

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  return (
    <header className="bg-white/80 backdrop-blur-xl border-b border-zinc-200/80 sticky top-0 z-10">
      {/* Responsive (Gilles 2026-06-17) : padding réduit sur mobile/tablette,
          passage en colonne, et décalage à gauche (pl-16) pour ne pas passer
          sous le bouton « hamburger » flottant (lg:hidden) de la coquille.
          La purge pl-16 s'applique jusqu'à lg (le burger est visible < lg). */}
      {/* Passage en LIGNE (titre | actions) seulement à partir de lg (1024px)
          — même seuil que le menu drawer. En dessous (téléphones, PLIABLES
          ~780px, tablettes), on EMPILE : titre pleine largeur puis actions
          dessous. Évite que les boutons d'action (shrink-0) écrasent le titre
          jusqu'à le rendre vertical sur écran large < lg (Gilles 2026-07-01). */}
      <div className="px-4 py-4 lg:px-10 lg:py-8 pl-16 lg:pl-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 lg:gap-6">
        <div className="min-w-0 flex-1">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav
              aria-label="Fil d'Ariane"
              className="flex items-center flex-wrap gap-x-1 gap-y-0.5 text-sm mb-2.5"
            >
              {breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <span key={i} className="inline-flex items-center gap-1">
                    {i > 0 && (
                      <ChevronRight
                        className="h-3.5 w-3.5 text-zinc-400 mx-0.5"
                        strokeWidth={2.5}
                      />
                    )}
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className="px-1.5 py-0.5 rounded text-zinc-600 hover:text-cyan-700 hover:bg-cyan-50 dark:text-zinc-400 dark:hover:text-cyan-400 dark:hover:bg-cyan-950/30 transition-colors font-medium"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        className={
                          isLast
                            ? "px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 font-semibold"
                            : "px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300 font-medium"
                        }
                        aria-current={isLast ? "page" : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </span>
                );
              })}
            </nav>
          )}
          <h1 className="text-lg md:text-xl font-black tracking-tight text-zinc-900 leading-[1.15] break-words">
            {title}
          </h1>
          {description && (
            <div className="text-[13px] text-zinc-500 mt-1 leading-relaxed">
              {description}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:shrink-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
