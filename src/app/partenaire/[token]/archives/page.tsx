import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Calendar, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "../_resolve";

/**
 * Archives du portail partenaire OF/Prescripteur (Gilles 2026-06-01).
 *
 * Affiche les sessions passees (start_date < today) ou cet OF a un
 * lien actif :
 *   - subcontracting_company_id = ma_company.id (sous-traitance)
 *   - OU prescriber_company_id = ma_company.id (prescripteur referent)
 *   - OU au moins 1 inscription via cet OF
 *     (inscription_channel = 'of' ET inscription_channel_company_id =
 *     ma_company.id)
 *
 * Filtre validé Gilles 2026-06-01 : afficher uniquement les apprenants
 * ayant comme source d inscription cet OF.
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
      "id, internal_code, start_date, end_date, status, is_inter, modality, formation:formations(title, duration_hours)",
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

  let sessionsFromInscriptions: typeof directSessions = [];
  if (sessionIdsFromInscriptions.length > 0) {
    const { data } = await supabase
      .from("sessions")
      .select(
        "id, internal_code, start_date, end_date, status, is_inter, modality, formation:formations(title, duration_hours)",
      )
      .in("id", sessionIdsFromInscriptions)
      .lt("start_date", today)
      .order("start_date", { ascending: false });
    sessionsFromInscriptions = data ?? [];
  }

  // Dedup
  const seen = new Set<string>();
  const allSessions = [
    ...(directSessions ?? []),
    ...(sessionsFromInscriptions ?? []),
  ]
    .filter((s) => {
      const id = (s as { id: string }).id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => {
      const da = (a as { start_date: string | null }).start_date ?? "";
      const db = (b as { start_date: string | null }).start_date ?? "";
      return db.localeCompare(da); // desc (plus recent en haut)
    });

  // Compte le nb d apprenants par session (uniquement ceux inscrits via cet OF)
  const sessionIds = allSessions.map((s) => (s as { id: string }).id);
  const learnersCountBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const { data: counts } = await supabase
      .from("inscription_requests")
      .select("target_session_id")
      .eq("inscription_channel", "of")
      .eq("inscription_channel_company_id", companyId)
      .in("target_session_id", sessionIds);
    for (const r of (counts ?? []) as Array<{ target_session_id: string }>) {
      learnersCountBySession.set(
        r.target_session_id,
        (learnersCountBySession.get(r.target_session_id) ?? 0) + 1,
      );
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

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

      {allSessions.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Aucune session archivée pour le moment. Les sessions apparaîtront
          ici une fois passées.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Formation</th>
                <th className="px-3 py-2 text-left">Modalité</th>
                <th className="px-3 py-2 text-center">Apprenants</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {allSessions.map((s) => {
                const typed = s as unknown as {
                  id: string;
                  start_date: string | null;
                  end_date: string | null;
                  is_inter: boolean | null;
                  modality: string | null;
                  formation: { title: string } | null;
                };
                const formation = Array.isArray(typed.formation)
                  ? typed.formation[0]
                  : typed.formation;
                const nbLearners =
                  learnersCountBySession.get(typed.id) ?? 0;
                return (
                  <tr
                    key={typed.id}
                    className="hover:bg-zinc-50/50"
                  >
                    <td className="px-3 py-2 text-xs">
                      <div className="inline-flex items-center gap-1.5 text-zinc-700 font-medium">
                        <Calendar className="h-3 w-3" />
                        {formatDate(typed.start_date)}
                      </div>
                      {typed.end_date &&
                        typed.end_date !== typed.start_date && (
                          <div className="text-[10px] text-zinc-500">
                            au {formatDate(typed.end_date)}
                          </div>
                        )}
                    </td>
                    <td className="px-3 py-2 font-semibold text-zinc-900">
                      {formation?.title ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {typed.modality === "distanciel"
                        ? "Distanciel"
                        : typed.modality === "presentiel"
                          ? "Présentiel"
                          : typed.modality === "hybride"
                            ? "Hybride"
                            : "—"}
                      {typed.is_inter !== null && (
                        <span className="ml-1 text-[10px] text-zinc-400">
                          {typed.is_inter ? "(INTER)" : "(INTRA)"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-cyan-100 text-cyan-700">
                        <Users className="h-3 w-3" />
                        {nbLearners}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/partenaire/${token}/archives/${typed.id}`}
                        className="text-xs text-cyan-700 hover:underline font-medium"
                      >
                        Voir détails →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
