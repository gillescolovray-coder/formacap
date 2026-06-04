/**
 * Charge la liste des formations (sessions non annulées) par apprenant,
 * au format FormationEntry attendu par le composant FormationsTooltip.
 *
 * Sert à la colonne "Portail apprenant" de l'onglet Participants et,
 * potentiellement, partout où l'on veut le compteur de formations d'un
 * apprenant. Une seule requête (pas de N+1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormationEntry } from "@/app/(app)/entreprises/_formations-tooltip";

export async function loadFormationsByLearner(
  supabase: SupabaseClient,
  learnerIds: string[],
): Promise<Map<string, FormationEntry[]>> {
  const map = new Map<string, FormationEntry[]>();
  if (learnerIds.length === 0) return map;

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner_id, session:sessions(id, start_date, end_date, trainer:trainers!trainer_id(first_name, last_name), formation:formations(title, duration_hours)), evaluation_responses(nps_score, evaluation_type)",
    )
    .in("learner_id", learnerIds)
    .neq("status", "cancelled");

  const pick = <T,>(v: unknown): T | null =>
    (Array.isArray(v) ? (v[0] ?? null) : (v ?? null)) as T | null;

  for (const row of enrollments ?? []) {
    const e = row as unknown as {
      id: string;
      learner_id: string;
      session: unknown;
      evaluation_responses:
        | Array<{ nps_score: number | null; evaluation_type: string }>
        | null;
    };
    const s = pick<{
      id: string | null;
      start_date: string | null;
      end_date: string | null;
      trainer: unknown;
      formation: unknown;
    }>(e.session);
    const trainer = pick<{
      first_name: string | null;
      last_name: string | null;
    }>(s?.trainer);
    const formation = pick<{
      title: string | null;
      duration_hours: number | null;
    }>(s?.formation);
    const hot = (e.evaluation_responses ?? []).find(
      (r) => r.evaluation_type === "hot",
    );
    const entry: FormationEntry = {
      enrollmentId: e.id,
      sessionId: s?.id ?? null,
      startDate: s?.start_date ?? null,
      endDate: s?.end_date ?? null,
      durationHours: formation?.duration_hours ?? null,
      title: formation?.title ?? null,
      trainerName: trainer
        ? `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim() ||
          null
        : null,
      learnerName: null,
      npsScore: hot?.nps_score ?? null,
    };
    const arr = map.get(e.learner_id) ?? [];
    arr.push(entry);
    map.set(e.learner_id, arr);
  }

  // Tri par date décroissante (plus récente en haut).
  for (const list of map.values())
    list.sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));

  return map;
}
