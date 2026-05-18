import { notFound } from "next/navigation";
import { BookOpen, Calendar } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEffectivePartnerPrice } from "@/lib/portal/partner-pricing";
import { resolvePartnerContext } from "../_resolve";
import { CatalogueList, type CatalogueSession } from "./_list-client";

type Params = { token: string };

type SessionRow = {
  id: string;
  internal_code: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  is_inter: boolean;
  modality: string | null;
  max_participants: number | null;
  formation:
    | {
        id: string;
        title: string;
        duration_hours: number | null;
        duration_days: number | null;
        subtitle: string | null;
        modality: string | null;
      }
    | Array<{
        id: string;
        title: string;
        duration_hours: number | null;
        duration_days: number | null;
        subtitle: string | null;
        modality: string | null;
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
  //   - show_inter_catalog → toutes les sessions distanciel INTER à venir
  //   - show_own_intra     → toutes ses sessions INTRA rattachées
  // Pour les OF, on garde uniquement distanciel INTER (modèle quiz only).
  const isPrescripteur = ctx.company.type === "prescripteur";
  const showInter = !isPrescripteur || ctx.company.show_inter_catalog;
  const showIntra = isPrescripteur && ctx.company.show_own_intra;

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
      id, internal_code, start_date, end_date, status, is_inter, modality, max_participants,
      formation:formations!inner(id, title, duration_hours, duration_days, subtitle, modality)
    `,
      )
      .eq("organization_id", ctx.company.organization_id)
      .eq("is_inter", true)
      .gte("start_date", today)
      .in("status", ["confirmed", "draft", "planned"])
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

  if (showIntra) {
    const { data: rows } = await supabase
      .from("sessions")
      .select(
        `
      id, internal_code, start_date, end_date, status, is_inter, modality, max_participants,
      formation:formations!inner(id, title, duration_hours, duration_days, subtitle, modality)
    `,
      )
      .eq("organization_id", ctx.company.organization_id)
      .eq("prescriber_company_id", ctx.company.id)
      .gte("start_date", today)
      .in("status", ["confirmed", "draft", "planned"])
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
      if (!formation) {
        return {
          id: s.id,
          reference: s.internal_code,
          start_date: s.start_date,
          end_date: s.end_date,
          is_intra: isIntra,
          modality: null,
          status: s.status,
          enrolled_count: enrolledBySession.get(s.id) ?? 0,
          max_participants: s.max_participants,
          formation: null,
          negotiated_price_ht: undefined,
          price_source: null,
          price_explain: null,
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
      });
      return {
        id: s.id,
        reference: s.internal_code,
        start_date: s.start_date,
        end_date: s.end_date,
        is_intra: isIntra,
        modality: formation.modality ?? null,
        status: s.status,
        enrolled_count: enrolledBySession.get(s.id) ?? 0,
        max_participants: s.max_participants,
        formation: {
          id: formation.id,
          title: formation.title,
          subtitle: formation.subtitle,
          duration_hours: formation.duration_hours,
        },
        negotiated_price_ht: effective.price ?? undefined,
        price_source: effective.source,
        price_explain: effective.explain,
      };
    },
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 inline-flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-cyan-600" />
          Catalogue distanciel
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Sessions <strong>INTER</strong> en <strong>distanciel</strong> à
          venir, proposées par {ctx.organization.name}.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Calendar className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-600">
            Aucune session distanciel INTER à venir pour le moment.
          </p>
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
        />
      )}
    </div>
  );
}
