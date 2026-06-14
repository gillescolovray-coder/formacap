import Link from "next/link";
import type { Metadata } from "next";
import { Clock, MapPin, Search, Calendar, GraduationCap } from "lucide-react";
import {
  getPublicCatalogue,
  type PublicFormationCard,
} from "@/lib/public-catalogue/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catalogue de formations â€” CAP NumÃ©rique",
  description:
    "DÃ©couvrez les formations CAP NumÃ©rique : BTP, marchÃ©s publics, compte prorata, montÃ©e en compÃ©tences. Organisme certifiÃ© Qualiopi.",
};

function modalityLabel(m: string | null): string {
  switch ((m ?? "").toLowerCase()) {
    case "presentiel":
    case "prÃ©sentiel":
      return "PrÃ©sentiel";
    case "distanciel":
    case "visio":
      return "Ã€ distance";
    case "mixte":
    case "hybride":
      return "Mixte";
    default:
      return m ?? "PrÃ©sentiel";
  }
}

function durationLabel(c: PublicFormationCard): string | null {
  if (c.durationDays && c.durationDays > 0) {
    const h = c.durationHours ? ` Â· ${c.durationHours} h` : "";
    return `${c.durationDays} jour${c.durationDays > 1 ? "s" : ""}${h}`;
  }
  if (c.durationHours && c.durationHours > 0) return `${c.durationHours} h`;
  return null;
}

function priceLabel(c: PublicFormationCard): string {
  if (c.publicPriceHt && c.publicPriceHt > 0) {
    return `${c.publicPriceHt.toLocaleString("fr-FR")} â‚¬ HT`;
  }
  return "Sur devis";
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

function matches(c: PublicFormationCard, q: string): boolean {
  const hay = [
    c.title,
    c.subtitle ?? "",
    c.categoryName ?? "",
    ...c.competenceDomains,
  ]
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => hay.includes(tok));
}

function FormationCard({ c }: { c: PublicFormationCard }) {
  const duration = durationLabel(c);
  return (
    <Link
      href={`/portail/${c.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-lg hover:border-[#9d1b51]/40 transition"
    >
      <div className="relative h-40 bg-gradient-to-br from-[#1e3a8a] to-[#9d1b51] flex items-center justify-center">
        {c.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.coverImageUrl}
            alt={c.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <GraduationCap className="h-12 w-12 text-white/70" />
        )}
        {c.isCpfEligible && (
          <span className="absolute top-3 right-3 rounded-full bg-white/95 text-[#9d1b51] text-[11px] font-bold px-2.5 py-1 shadow">
            CPF
          </span>
        )}
      </div>
      <div className="flex flex-col flex-1 p-4">
        {c.categoryName && (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9d1b51] mb-1">
            {c.categoryName}
          </span>
        )}
        <h3 className="font-bold text-slate-900 leading-snug group-hover:text-[#1e3a8a]">
          {c.title}
        </h3>
        {c.subtitle && (
          <p className="mt-1 text-sm text-slate-500 line-clamp-2">
            {c.subtitle}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          {duration && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              {duration}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
            {modalityLabel(c.modality)}
          </span>
          {c.nextSession && (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <Calendar className="h-3.5 w-3.5" />
              DÃ¨s le {formatDate(c.nextSession.start_date)}
            </span>
          )}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="font-bold text-[#1e3a8a]">{priceLabel(c)}</span>
          <span className="text-sm font-semibold text-[#9d1b51] group-hover:underline">
            Voir la fiche â†’
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const all = await getPublicCatalogue();
  const formations = query ? all.filter((c) => matches(c, query)) : all;

  return (
    <div>
      {/* Hero + recherche */}
      <section className="bg-gradient-to-br from-[#1e3a8a] via-[#3b2a8a] to-[#9d1b51] text-white">
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16 text-center">
          <h1 className="text-2xl sm:text-4xl font-black leading-tight">
            Nos formations
          </h1>
          <p className="mt-3 text-white/85 max-w-2xl mx-auto">
            Montez en compÃ©tences avec un organisme certifiÃ© Qualiopi. Trouvez
            la formation adaptÃ©e Ã  vos besoins.
          </p>
          <form
            action="/portail"
            method="get"
            className="mt-6 max-w-xl mx-auto flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Rechercher une formation, un thÃ¨meâ€¦"
                className="w-full rounded-full pl-11 pr-4 py-3 text-slate-800 bg-white shadow-lg outline-none focus:ring-2 focus:ring-[#9d1b51]"
              />
            </div>
            <button
              type="submit"
              className="rounded-full bg-[#9d1b51] hover:bg-[#82154299] px-5 py-3 font-semibold shadow-lg"
            >
              Rechercher
            </button>
          </form>
        </div>
      </section>

      {/* RÃ©sultats */}
      <section className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-slate-500">
            {formations.length} formation{formations.length > 1 ? "s" : ""}
            {query && (
              <>
                {" "}
                pour Â«&nbsp;<strong className="text-slate-700">{query}</strong>
                &nbsp;Â»{" "}
                <Link href="/portail" className="text-[#9d1b51] underline ml-1">
                  rÃ©initialiser
                </Link>
              </>
            )}
          </p>
        </div>

        {formations.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <GraduationCap className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium">Aucune formation ne correspond.</p>
            <p className="text-sm mt-1">
              Essayez d&apos;autres mots-clÃ©s ou{" "}
              <Link href="/portail" className="text-[#9d1b51] underline">
                voir tout le catalogue
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {formations.map((c) => (
              <FormationCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

