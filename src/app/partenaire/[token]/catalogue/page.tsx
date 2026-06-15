import { notFound } from "next/navigation";
import { BookOpen, Calendar } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeEffectivePartnerPrice,
  loadOrgPartnerDefaults,
} from "@/lib/portal/partner-pricing";
import { resolvePartnerContext } from "../_resolve";
import { InviteBlock } from "../_invite-block";
import { CatalogueList, type CatalogueSession } from "./_list-client";

// Rendu toujours frais : reflète immédiatement les tarifs de Paramètres
// (grille prescripteur/OF) — Gilles 2026-06-09.
export const dynamic = "force-dynamic";

type Params = { token: string };

type LocationObj = {
  id: string;
  name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
};

type SessionRow = {
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
  /** Texte libre rétro-compat si pas de lieu référencé. */
  location: string | null;
  /** Application visio (Zoom, Teams, Meet, …) pour le distanciel. */
  video_app: string | null;
  /** Lien direct de connexion à la visio. */
  video_link: string | null;
  location_obj: LocationObj | LocationObj[] | null;
  formation:
    | {
        id: string;
        title: string;
        duration_hours: number | null;
        duration_days: number | null;
        subtitle: string | null;
        modality: string | null;
        programme_pdf_url: string | null;
      }
    | Array<{
        id: string;
        title: string;
        duration_hours: number | null;
        duration_days: number | null;
        subtitle: string | null;
        modality: string | null;
        programme_pdf_url: string | null;
      }>
    | null;
};

export default async function PartnerCataloguePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Pour les PRESCRIPTEURS, on combine selon les toggles :
  //   - show_inter_catalog → catalogue distanciel INTER public à venir
  //   - show_own_intra     → toutes ses sessions propres (INTRA + INTER)
  //                          où il est prescriber_company_id (toutes
  //                          modalités confondues)
  // Pour les OF, on garde uniquement distanciel INTER (modèle quiz only).
  const isPrescripteur = ctx.company.type === "prescripteur";
  const showInter = !isPrescripteur || ctx.company.show_inter_catalog;
  const showOwn = isPrescripteur && ctx.company.show_own_intra;

  type RawRow = SessionRow;
  const collected: RawRow[] = [];

  if (showInter) {
    // On ne filtre PAS sur formation.modality dans la requete Supabase
    // (le client JS a un bug avec les filtres sur relations aliasees
    // qui retourne silencieusement 0). On filtre en JS apres.
    const { data: rows } = await supabase
      .from("sessions")
      .select(
        `
      id, internal_code, start_date, end_date, status, is_inter, modality, max_participants, prescriber_company_id, subcontracting_company_id, location, video_app, video_link,
      formation:formations!inner(id, title, duration_hours, duration_days, subtitle, modality, programme_pdf_url),
      location_obj:formation_locations!location_id(id, name, address, postal_code, city)
    `,
      )
      .eq("organization_id", ctx.company.organization_id)
      .eq("is_inter", true)
      // FIX Gilles 2026-06-15 : le catalogue distanciel PARTAGÉ ne doit
      // contenir QUE les sessions proposées par CAP NUMÉRIQUE en direct.
      // Les sessions sous-traitées à un OF appartiennent à CET OF (elles
      // remontent via le 3e bloc subcontracting_company_id = lui) et ne
      // doivent jamais fuiter vers un autre OF.
      .is("subcontracting_company_id", null)
      .gte("start_date", today)
      .in("status", ["confirmed", "draft", "planned", "cancelled", "postponed"])
      .order("start_date", { ascending: true });
    if (rows) {
      // Filtre JS : ne garder que les formations DISTANCIEL
      const filtered = (rows as unknown as RawRow[]).filter((s) => {
        const f = Array.isArray(s.formation) ? s.formation[0] : s.formation;
        return f?.modality === "distanciel";
      });
      collected.push(...filtered);
    }
  }

  if (showOwn) {
    // Toutes les sessions rattachées au prescripteur (INTER + INTRA, toutes
    // modalités) — quel que soit le statut public du catalogue.
    const { data: rows } = await supabase
      .from("sessions")
      .select(
        `
      id, internal_code, start_date, end_date, status, is_inter, modality, max_participants, prescriber_company_id, subcontracting_company_id, location, video_app, video_link,
      formation:formations!inner(id, title, duration_hours, duration_days, subtitle, modality, programme_pdf_url),
      location_obj:formation_locations!location_id(id, name, address, postal_code, city)
    `,
      )
      .eq("organization_id", ctx.company.organization_id)
      .eq("prescriber_company_id", ctx.company.id)
      .gte("start_date", today)
      .in("status", ["confirmed", "draft", "planned", "cancelled", "postponed"])
      .order("start_date", { ascending: true });
    if (rows) collected.push(...(rows as unknown as RawRow[]));
  }

  // 3e source : sessions ou cet OF/Prescripteur est SOUS-TRAITANT donneur
  // d ordre (Gilles 2026-06-01). Toutes les sessions ou
  // subcontracting_company_id = cette company. Quelle que soit la modalite
  // / INTER ou INTRA / statut public.
  {
    const { data: rows } = await supabase
      .from("sessions")
      .select(
        `
      id, internal_code, start_date, end_date, status, is_inter, modality, max_participants, prescriber_company_id, subcontracting_company_id, location, video_app, video_link,
      formation:formations!inner(id, title, duration_hours, duration_days, subtitle, modality, programme_pdf_url),
      location_obj:formation_locations!location_id(id, name, address, postal_code, city)
    `,
      )
      .eq("organization_id", ctx.company.organization_id)
      .eq("subcontracting_company_id", ctx.company.id)
      .gte("start_date", today)
      .in("status", ["confirmed", "draft", "planned", "cancelled", "postponed"])
      .order("start_date", { ascending: true });
    if (rows) collected.push(...(rows as unknown as RawRow[]));
  }

  // Déduplique + retrie par date croissante (au cas où on aurait mixé
  // 2 requetes INTER + INTRA, l'ordre serait perdu).
  const seen = new Set<string>();
  const sessions = collected
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    })
    .sort((a, b) => {
      const da = a.start_date ?? "9999-12-31";
      const db = b.start_date ?? "9999-12-31";
      return da.localeCompare(db);
    });

  // Overrides spécifiques par formation
  const { data: pricingRows } = await supabase
    .from("partner_pricing")
    .select("formation_id, unit_price_ht")
    .eq("company_id", ctx.company.id);
  const overrideMap = new Map<string, number>();
  for (const p of (pricingRows ?? []) as Array<{
    formation_id: string;
    unit_price_ht: string | number;
  }>) {
    overrideMap.set(p.formation_id, Number(p.unit_price_ht));
  }

  // Tarifs par défaut au niveau organisation (Option A — 2026-05-22).
  // Permet à un OF/Prescripteur sans tarif spécifique de voir quand même
  // un prix calculé à partir des défauts admin.
  const orgDefaults = await loadOrgPartnerDefaults(
    supabase,
    ctx.company.organization_id,
  );

  // Comptage des apprenants inscrits par session (statut != "cancelled")
  // pour afficher "X / Y inscrits" sur chaque carte.
  const enrolledBySession = new Map<string, number>();
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length > 0) {
    const { data: enrollments } = await supabase
      .from("session_enrollments")
      .select("session_id")
      .in("session_id", sessionIds)
      .neq("status", "cancelled");
    (enrollments ?? []).forEach((e) => {
      const sid = e.session_id as string;
      enrolledBySession.set(sid, (enrolledBySession.get(sid) ?? 0) + 1);
    });
  }

  const rows: CatalogueSession[] = (sessions as unknown as SessionRow[]).map(
    (s) => {
      const formation = Array.isArray(s.formation)
        ? (s.formation[0] ?? null)
        : s.formation;
      const isIntra = s.is_inter === false;
      // is_own = ce partenaire est le prescripteur référent de cette session
      // (true qu'elle soit INTRA ou INTER). Permet au client de filtrer
      // « Mes sessions ».
      const isOwn = s.prescriber_company_id === ctx.company.id;
      // is_subcontracting = cet OF est le donneur d ordre (CAP est
      // sous-traitant). Gilles 2026-06-01 — affichage badge specifique.
      const isSubcontracting =
        s.subcontracting_company_id === ctx.company.id;
      // Lieu détaillé : la jointure peut renvoyer un objet ou un tableau.
      const locObj = Array.isArray(s.location_obj)
        ? (s.location_obj[0] ?? null)
        : s.location_obj;
      const locationDetail = locObj
        ? {
            name: locObj.name,
            address: locObj.address,
            postal_code: locObj.postal_code,
            city: locObj.city,
          }
        : s.location
          ? // Fallback texte libre (legacy avant la table formation_locations)
            {
              name: s.location,
              address: null,
              postal_code: null,
              city: null,
            }
          : null;
      const visio =
        s.video_app || s.video_link
          ? { app: s.video_app, link: s.video_link }
          : null;
      if (!formation) {
        return {
          id: s.id,
          reference: s.internal_code,
          start_date: s.start_date,
          end_date: s.end_date,
          is_intra: isIntra,
          is_own: isOwn,
          is_subcontracting: isSubcontracting,
          modality: null,
          status: s.status,
          enrolled_count: enrolledBySession.get(s.id) ?? 0,
          max_participants: s.max_participants,
          formation: null,
          location_detail: locationDetail,
          visio,
          negotiated_price_ht: undefined,
          price_source: null,
          price_explain: null,
          pricing_mode: null,
        };
      }
      const effective = computeEffectivePartnerPrice({
        partnerType: ctx.company.type,
        dailyRateDistancielHt: ctx.company.daily_rate_distanciel_ht,
        dailyRatePresentielHt: ctx.company.daily_rate_presentiel_ht,
        quizUnitPriceHt: ctx.company.quiz_unit_price_ht,
        overrideHt: overrideMap.get(formation.id),
        durationDays: formation.duration_days,
        durationHours: formation.duration_hours,
        modality: (formation.modality ?? null) as
          | "presentiel"
          | "distanciel"
          | "hybride"
          | null,
        // Sous-traitance (Gilles 2026-06-01) : tarif forfait jour si
        // ce partenaire est donneur d ordre sur cette session.
        isSubcontracting,
        subcontractingDailyRateDistancielHt:
          ctx.company.subcontracting_daily_rate_distanciel_ht,
        subcontractingDailyRatePresentielHt:
          ctx.company.subcontracting_daily_rate_presentiel_ht,
        ...orgDefaults,
      });
      return {
        id: s.id,
        reference: s.internal_code,
        start_date: s.start_date,
        end_date: s.end_date,
        is_intra: isIntra,
        is_own: isOwn,
        is_subcontracting: isSubcontracting,
        modality: formation.modality ?? null,
        status: s.status,
        enrolled_count: enrolledBySession.get(s.id) ?? 0,
        max_participants: s.max_participants,
        formation: {
          id: formation.id,
          title: formation.title,
          subtitle: formation.subtitle,
          duration_hours: formation.duration_hours,
          duration_days: formation.duration_days,
          programme_pdf_url: formation.programme_pdf_url,
        },
        location_detail: locationDetail,
        visio,
        negotiated_price_ht: effective.price ?? undefined,
        price_source: effective.source,
        price_explain: effective.explain,
        pricing_mode: effective.pricingMode,
      };
    },
  );

  // Libelles adaptes au type de partenaire : un OF (workflow quiz only) ne
  // voit QUE le distanciel ; un prescripteur peut voir INTER distanciel public
  // + ses sessions propres (INTRA + INTER) toutes modalites. On evite ainsi
  // le titre "distanciel" alors que des sessions presentielles peuvent y
  // figurer (sessions dediees).
  //
  // Cas particulier OF avec sous-traitance (Gilles 2026-06-01) :
  // si un OF est donneur d ordre sur une ou plusieurs sessions, son
  // catalogue peut contenir du presentiel/INTRA, donc on bascule sur
  // les libelles « Catalogue » non-distanciel-only.
  const isOf = ctx.company.type === "of";
  const hasSubcontractingSessions = rows.some((s) => s.is_subcontracting);
  const hasNonDistancielSubcontract = rows.some(
    (s) => s.is_subcontracting && s.modality !== "distanciel",
  );
  const ofWithSubcontract = isOf && hasNonDistancielSubcontract;
  const catalogTitle =
    isOf && !ofWithSubcontract ? "Catalogue distanciel" : "Catalogue";
  const catalogDescription =
    isOf && ofWithSubcontract ? (
      <>
        Sessions <strong>INTER distanciel</strong> de {ctx.organization.name} et{" "}
        <strong>vos sessions de sous-traitance</strong> (toutes modalités) où{" "}
        {ctx.company.name} est donneur d&apos;ordre.
      </>
    ) : isOf ? (
      <>
        Sessions <strong>INTER</strong> en <strong>distanciel</strong> à venir,
        proposées par {ctx.organization.name}.
      </>
    ) : showOwn && showInter ? (
      <>
        Sessions <strong>INTER distanciel</strong> du catalogue et{" "}
        <strong>vos sessions dédiées</strong> (INTRA et INTER) où{" "}
        {ctx.company.name} est prescripteur, proposées par {ctx.organization.name}
        .
      </>
    ) : showInter ? (
      <>
        Sessions <strong>INTER</strong> en <strong>distanciel</strong> à venir,
        proposées par {ctx.organization.name}.
      </>
    ) : (
      <>
        Vos <strong>sessions dédiées</strong> où {ctx.company.name} est
        prescripteur, proposées par {ctx.organization.name}.
      </>
    );
  const emptyText =
    isOf && !ofWithSubcontract
      ? "Aucune session distanciel INTER à venir pour le moment."
      : "Aucune session à venir dans votre catalogue pour le moment.";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 inline-flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-cyan-600" />
          {catalogTitle}
        </h1>
        <p className="text-sm text-zinc-600 mt-1">{catalogDescription}</p>
      </header>

      {/* Bloc de diffusion publique « Inviter mes entreprises » :
          place ici (dans le catalogue) car c'est le bon contexte pour
          choisir ce qu'on diffuse. */}
      <InviteBlock
        token={token}
        partnerName={ctx.company.name}
        organizationName={ctx.organization.name}
        showOwnSessionsFilter={showOwn || hasSubcontractingSessions}
        partnerType={ctx.company.type}
      />

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Calendar className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-600">{emptyText}</p>
          <p className="text-xs text-zinc-500 mt-2">
            Revenez prochainement ou contactez {ctx.organization.name} pour
            connaître les sessions à venir.
          </p>
        </div>
      ) : (
        <CatalogueList
          token={token}
          partnerName={ctx.company.name}
          organizationEmail={ctx.organization.email}
          sessions={rows}
          partnerType={ctx.company.type}
        />
      )}
    </div>
  );
}
