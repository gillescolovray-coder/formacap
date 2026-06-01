import { notFound } from "next/navigation";
import { Archive } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "../_resolve";
import { ArchivesListClient, type ArchivedSession } from "./_list-client";

/**
 * Archives du portail partenaire OF/Prescripteur.
 *
 * Affiche les sessions passees (start_date < today) ou cet OF/Prescripteur
 * a un lien actif :
 *   - subcontracting_company_id = ma_company.id (sous-traitance)
 *   - OU prescriber_company_id = ma_company.id (prescripteur referent)
 *   - OU au moins 1 inscription via cet OF
 *     (inscription_channel = 'of' ET inscription_channel_company_id =
 *     ma_company.id)
 *
 * Strategie de comptage des apprenants (Gilles 2026-06-01) :
 *   - Si la session a subcontracting_company_id OU prescriber_company_id =
 *     ma_company.id : on compte TOUS les session_enrollments actifs (la
 *     session est integralement la mienne).
 *   - Sinon (j ai juste inscrit quelques apprenants) : on compte
 *     uniquement les inscription_requests tagues sur mon canal.
 */
export default async function ArchivesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const orgId = ctx.company.organization_id;
  const companyId = ctx.company.id;

  // 1) Sessions passees ou cet OF est sous-traitant OU prescripteur
  const { data: directSessions } = await supabase
    .from("sessions")
    .select(
      "id, internal_code, start_date, end_date, status, is_inter, modality, subcontracting_company_id, prescriber_company_id, formation:formations(title, duration_hours)",
    )
    .eq("organization_id", orgId)
    .or(
      `subcontracting_company_id.eq.${companyId},prescriber_company_id.eq.${companyId}`,
    )
    .lt("start_date", today)
    .order("start_date", { ascending: false });

  // 2) Sessions passees ou cet OF a inscrit au moins 1 apprenant
  const { data: viaInscriptions } = await supabase
    .from("inscription_requests")
    .select("target_session_id")
    .eq("organization_id", orgId)
    .eq("inscription_channel", "of")
    .eq("inscription_channel_company_id", companyId)
    .not("target_session_id", "is", null);
  const sessionIdsFromInscriptions = Array.from(
    new Set(
      ((viaInscriptions ?? []) as Array<{ target_session_id: string }>).map(
        (r) => r.target_session_id,
      ),
    ),
  );

  type RawSession = {
    id: string;
    internal_code: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string | null;
    is_inter: boolean | null;
    modality: string | null;
    subcontracting_company_id: string | null;
    prescriber_company_id: string | null;
    formation: { title: string } | Array<{ title: string }> | null;
  };

  let sessionsFromInscriptions: RawSession[] = [];
  if (sessionIdsFromInscriptions.length > 0) {
    const { data } = await supabase
      .from("sessions")
      .select(
        "id, internal_code, start_date, end_date, status, is_inter, modality, subcontracting_company_id, prescriber_company_id, formation:formations(title, duration_hours)",
      )
      .in("id", sessionIdsFromInscriptions)
      .lt("start_date", today)
      .order("start_date", { ascending: false });
    sessionsFromInscriptions = (data ?? []) as unknown as RawSession[];
  }

  // Dedup
  const seen = new Set<string>();
  const allSessions: RawSession[] = [
    ...((directSessions ?? []) as unknown as RawSession[]),
    ...sessionsFromInscriptions,
  ]
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    })
    .sort((a, b) => {
      const da = a.start_date ?? "";
      const db = b.start_date ?? "";
      return db.localeCompare(da);
    });

  // Comptage apprenants par session — strategie :
  //   - Si la session est "a moi" (subcontracting OU prescriber) :
  //     compter via session_enrollments (tous, non cancelled).
  //   - Sinon : compter inscription_requests sur mon canal.
  const sessionIds = allSessions.map((s) => s.id);
  const learnersCountBySession = new Map<string, number>();

  if (sessionIds.length > 0) {
    // Sessions qui sont "miennes" (subcontracting OU prescriber)
    const mineSessionIds = new Set(
      allSessions
        .filter(
          (s) =>
            s.subcontracting_company_id === companyId ||
            s.prescriber_company_id === companyId,
        )
        .map((s) => s.id),
    );

    if (mineSessionIds.size > 0) {
      const { data: enrolls } = await supabase
        .from("session_enrollments")
        .select("session_id")
        .in("session_id", Array.from(mineSessionIds))
        .neq("status", "cancelled");
      for (const e of (enrolls ?? []) as Array<{ session_id: string }>) {
        learnersCountBySession.set(
          e.session_id,
          (learnersCountBySession.get(e.session_id) ?? 0) + 1,
        );
      }
    }

    // Sessions ou je suis "juste un canal" (pas subcontracting/prescriber)
    const otherSessionIds = sessionIds.filter((id) => !mineSessionIds.has(id));
    if (otherSessionIds.length > 0) {
      const { data: counts } = await supabase
        .from("inscription_requests")
        .select("target_session_id")
        .eq("inscription_channel", "of")
        .eq("inscription_channel_company_id", companyId)
        .in("target_session_id", otherSessionIds);
      for (const r of (counts ?? []) as Array<{ target_session_id: string }>) {
        learnersCountBySession.set(
          r.target_session_id,
          (learnersCountBySession.get(r.target_session_id) ?? 0) + 1,
        );
      }
    }
  }

  const archivedSessions: ArchivedSession[] = allSessions.map((s) => {
    const formation = Array.isArray(s.formation)
      ? (s.formation[0] ?? null)
      : s.formation;
    return {
      id: s.id,
      internal_code: s.internal_code,
      start_date: s.start_date,
      end_date: s.end_date,
      is_inter: s.is_inter,
      modality: s.modality,
      formation_title: formation?.title ?? null,
      nb_learners: learnersCountBySession.get(s.id) ?? 0,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 pb-3 border-b border-zinc-200">
        <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
          <Archive className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-900">
            Sessions archivées
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5 max-w-2xl">
            Historique des sessions de formation passées sur lesquelles{" "}
            {ctx.company.name} est intervenu(e). Cliquez sur une session pour
            consulter les apprenants, les résultats quiz, et télécharger les
            documents (émargements, scores Excel).
          </p>
        </div>
      </div>

      <ArchivesListClient token={token} sessions={archivedSessions} />
    </div>
  );
}
