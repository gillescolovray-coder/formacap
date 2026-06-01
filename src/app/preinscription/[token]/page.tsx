import { notFound } from "next/navigation";
import { BookOpen, Calendar } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "@/app/partenaire/[token]/_resolve";
import { PreinscriptionClient, type PublicSession } from "./_client";

type Params = { token: string };
type SearchParams = { filter?: string };

/**
 * Filtres possibles sur le lien public — paramètre `?filter=` dans l'URL :
 *   - undefined / "all" : tout le catalogue du partenaire (défaut)
 *   - "distanciel"      : uniquement les sessions distanciel
 *   - "mine"            : uniquement les sessions dont le partenaire
 *                         est prescripteur (INTER + INTRA propres)
 *
 * Permet au partenaire de diffuser des liens ciblés selon son
 * destinataire (ex: « voici nos formations distanciel » vs « voici les
 * sessions que je porte »).
 */
type PageFilter = "all" | "distanciel" | "mine";
function parseFilter(raw: string | undefined): PageFilter {
  if (raw === "distanciel" || raw === "mine") return raw;
  return "all";
}

/**
 * Page publique de pré-inscription via lien partenaire.
 *
 * Affiche les sessions du catalogue du partenaire (mêmes règles de
 * visibilité que `/partenaire/[token]/catalogue` pour qu'il y ait
 * cohérence), MAIS sans aucun tarif — c'est le partenaire qui négocie
 * ses propres prix avec ses entreprises clientes.
 *
 * À la soumission, une `inscription_request` est créée au stage
 * `partner_preinscription` (cf. migration 0090). Le prescripteur/OF la
 * valide ensuite depuis son portail.
 */
export default async function PreinscriptionPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const filter = parseFilter(sp.filter);
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const isPrescripteur = ctx.company.type === "prescripteur";
  // Le filtre `mine` force à n'afficher QUE les sessions où le partenaire
  // est prescripteur — peu importe `show_inter_catalog` (utile pour les OF
  // qui voudraient diffuser uniquement « leurs » sessions).
  const showInter =
    filter !== "mine" && (!isPrescripteur || ctx.company.show_inter_catalog);
  // Filtre `distanciel` désactive la branche « own » : seul le catalogue
  // INTER distanciel public reste.
  const showOwn =
    filter !== "distanciel" &&
    (filter === "mine" || (isPrescripteur && ctx.company.show_own_intra));

  type RawRow = {
    id: string;
    internal_code: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string;
    is_inter: boolean;
    modality: string | null;
    max_participants: number | null;
    prescriber_company_id: string | null;
    subcontracting_company_id: string | null;
    location: string | null;
    video_app: string | null;
    formation:
      | {
          id: string;
          title: string;
          subtitle: string | null;
          duration_hours: number | null;
          duration_days: number | null;
          modality: string | null;
          programme_pdf_url: string | null;
        }
      | Array<{
          id: string;
          title: string;
          subtitle: string | null;
          duration_hours: number | null;
          duration_days: number | null;
          modality: string | null;
          programme_pdf_url: string | null;
        }>
      | null;
    location_obj:
      | {
          name: string | null;
          address: string | null;
          postal_code: string | null;
          city: string | null;
        }
      | Array<{
          name: string | null;
          address: string | null;
          postal_code: string | null;
          city: string | null;
        }>
      | null;
  };

  const collected: RawRow[] = [];

  if (showInter) {
    const { data: rows } = await supabase
      .from("sessions")
      .select(
        `
      id, internal_code, start_date, end_date, status, is_inter, modality, max_participants, prescriber_company_id, subcontracting_company_id, location, video_app,
      formation:formations!inner(id, title, subtitle, duration_hours, duration_days, modality, programme_pdf_url),
      location_obj:formation_locations!location_id(name, address, postal_code, city)
    `,
      )
      .eq("organization_id", ctx.company.organization_id)
      .eq("is_inter", true)
      .gte("start_date", today)
      .in("status", ["confirmed", "draft", "planned"])
      .order("start_date", { ascending: true });
    if (rows) {
      const filtered = (rows as unknown as RawRow[]).filter((s) => {
        const f = Array.isArray(s.formation) ? s.formation[0] : s.formation;
        return f?.modality === "distanciel";
      });
      collected.push(...filtered);
    }
  }

  if (showOwn) {
    const { data: rows } = await supabase
      .from("sessions")
      .select(
        `
      id, internal_code, start_date, end_date, status, is_inter, modality, max_participants, prescriber_company_id, subcontracting_company_id, location, video_app,
      formation:formations!inner(id, title, subtitle, duration_hours, duration_days, modality, programme_pdf_url),
      location_obj:formation_locations!location_id(name, address, postal_code, city)
    `,
      )
      .eq("organization_id", ctx.company.organization_id)
      .eq("prescriber_company_id", ctx.company.id)
      .gte("start_date", today)
      .in("status", ["confirmed", "draft", "planned"])
      .order("start_date", { ascending: true });
    if (rows) collected.push(...(rows as unknown as RawRow[]));
  }

  // Branche sous-traitance (Gilles 2026-06-01) : on charge aussi les
  // sessions ou le partenaire (typiquement un OF) est donneur d ordre.
  // S applique au filtre `mine` (= mes sessions) ET au mode `all`
  // (= tout le catalogue, qui doit inclure les sessions visibles dans
  // le portail). Le filtre `distanciel` reste limite au catalogue INTER
  // public distanciel.
  const showSubcontracting = filter !== "distanciel";
  if (showSubcontracting) {
    const { data: rows } = await supabase
      .from("sessions")
      .select(
        `
      id, internal_code, start_date, end_date, status, is_inter, modality, max_participants, prescriber_company_id, subcontracting_company_id, location, video_app,
      formation:formations!inner(id, title, subtitle, duration_hours, duration_days, modality, programme_pdf_url),
      location_obj:formation_locations!location_id(name, address, postal_code, city)
    `,
      )
      .eq("organization_id", ctx.company.organization_id)
      .eq("subcontracting_company_id", ctx.company.id)
      .gte("start_date", today)
      .in("status", ["confirmed", "draft", "planned"])
      .order("start_date", { ascending: true });
    if (rows) collected.push(...(rows as unknown as RawRow[]));
  }

  // Dédupliquer + trier par date
  const seen = new Set<string>();
  const sessions: PublicSession[] = collected
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    })
    .sort((a, b) => {
      const da = a.start_date ?? "9999-12-31";
      const db = b.start_date ?? "9999-12-31";
      return da.localeCompare(db);
    })
    .map((s) => {
      const formation = Array.isArray(s.formation)
        ? s.formation[0] ?? null
        : s.formation;
      const locObj = Array.isArray(s.location_obj)
        ? s.location_obj[0] ?? null
        : s.location_obj;
      return {
        id: s.id,
        reference: s.internal_code,
        start_date: s.start_date,
        end_date: s.end_date,
        modality: formation?.modality ?? null,
        formation: formation
          ? {
              id: formation.id,
              title: formation.title,
              subtitle: formation.subtitle,
              duration_hours: formation.duration_hours,
              duration_days: formation.duration_days,
              programme_pdf_url: formation.programme_pdf_url,
            }
          : null,
        location_detail: locObj
          ? {
              name: locObj.name,
              address: locObj.address,
              postal_code: locObj.postal_code,
              city: locObj.city,
            }
          : s.location
            ? {
                name: s.location,
                address: null,
                postal_code: null,
                city: null,
              }
            : null,
        video_app: s.video_app,
      };
    });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 inline-flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-cyan-600" />
          Pré-inscription à une formation
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Sélectionnez la formation qui vous intéresse et renseignez les
          coordonnées de l&apos;apprenant. Votre demande sera validée par{" "}
          <strong>{ctx.company.name}</strong> avant confirmation définitive.
        </p>
      </header>

      {sessions.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Calendar className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-600">
            Aucune session ouverte à la pré-inscription pour le moment.
          </p>
          <p className="text-xs text-zinc-500 mt-2">
            Contactez {ctx.company.name} pour connaître les prochaines
            sessions.
          </p>
        </div>
      ) : (
        <PreinscriptionClient
          token={token}
          partnerName={ctx.company.name}
          sessions={sessions}
        />
      )}
    </div>
  );
}
