import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Award,
  Building2,
  Calendar,
  Download,
  FileSpreadsheet,
  GraduationCap,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "../../_resolve";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fiche detail d une session archivee dans le portail partenaire OF
 * (Gilles 2026-06-01).
 *
 * Affiche :
 *   - Header session (titre, dates, modalite)
 *   - Liste apprenants (uniquement ceux inscrits via cet OF)
 *   - Scores quiz pre/post + progression par apprenant
 *   - Boutons telecharger :
 *     - Resultats quiz au format CSV
 *     - Feuilles emargement (ZIP) — reutilise la route API existante
 */
export default async function ArchiveSessionDetailPage({
  params,
}: {
  params: Promise<{ token: string; sessionId: string }>;
}) {
  const { token, sessionId } = await params;
  if (!UUID_REGEX.test(sessionId)) notFound();
  const ctx = await resolvePartnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();
  const orgId = ctx.company.organization_id;
  const companyId = ctx.company.id;

  // Charge la session (+ FK subcontracting/prescriber pour decider la
  // strategie de chargement des apprenants)
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, internal_code, start_date, end_date, is_inter, modality, subcontracting_company_id, prescriber_company_id, location, location_obj:formation_locations!location_id(name, address, postal_code, city), formation:formations(title, duration_hours, duration_days)",
    )
    .eq("id", sessionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!session) notFound();

  const sess = session as unknown as {
    id: string;
    internal_code: string | null;
    start_date: string | null;
    end_date: string | null;
    is_inter: boolean | null;
    modality: string | null;
    subcontracting_company_id: string | null;
    prescriber_company_id: string | null;
    location: string | null;
    location_obj: {
      name: string;
      address: string | null;
      postal_code: string | null;
      city: string | null;
    } | null;
    formation: { title: string; duration_hours: number | null } | null;
  };
  const formation = Array.isArray(sess.formation)
    ? sess.formation[0]
    : sess.formation;
  const locationObj = Array.isArray(sess.location_obj)
    ? sess.location_obj[0]
    : sess.location_obj;

  // Strategie de chargement (Gilles 2026-06-01) :
  //   - Si cet OF/Prescripteur est subcontracting OU prescriber de la
  //     session : il voit TOUS les apprenants (la session est integralement
  //     a lui).
  //   - Sinon : il voit uniquement les apprenants qu il a inscrits via
  //     son canal (inscription_channel='of' + inscription_channel_company_id).
  const isMineSession =
    sess.subcontracting_company_id === companyId ||
    sess.prescriber_company_id === companyId;

  type EnrollmentRow = {
    id: string;
    learner_id: string | null;
    status: string | null;
    learner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  };

  let enrollmentRows: EnrollmentRow[] = [];

  if (isMineSession) {
    // Cas 1 : ma session — je liste TOUS les enrollments actifs
    const { data } = await supabase
      .from("session_enrollments")
      .select(
        "id, learner_id, status, learner:learners(id, first_name, last_name, email)",
      )
      .eq("session_id", sessionId)
      .neq("status", "cancelled");
    enrollmentRows = (data ?? []) as unknown as EnrollmentRow[];
  } else {
    // Cas 2 : je suis juste un canal d inscription — filtre via mes
    // inscription_requests
    const { data: inscriptions } = await supabase
      .from("inscription_requests")
      .select("learner_id")
      .eq("organization_id", orgId)
      .eq("target_session_id", sessionId)
      .eq("inscription_channel", "of")
      .eq("inscription_channel_company_id", companyId);
    const learnerIds = ((inscriptions ?? []) as Array<{
      learner_id: string | null;
    }>)
      .map((r) => r.learner_id)
      .filter((id): id is string => !!id);
    if (learnerIds.length > 0) {
      const { data } = await supabase
        .from("session_enrollments")
        .select(
          "id, learner_id, status, learner:learners(id, first_name, last_name, email)",
        )
        .eq("session_id", sessionId)
        .in("learner_id", learnerIds)
        .neq("status", "cancelled");
      enrollmentRows = (data ?? []) as unknown as EnrollmentRow[];
    }
  }

  const enrollmentIds = enrollmentRows.map((e) => e.id);

  // Scores quiz pre/post pour ces enrollments
  const { data: quizAttempts } =
    enrollmentIds.length > 0
      ? await supabase
          .from("quiz_attempts")
          .select("enrollment_id, phase, score, max_score, completed_at")
          .in("enrollment_id", enrollmentIds)
      : { data: [] };
  type QuizAttempt = {
    enrollment_id: string;
    phase: "pre" | "post";
    score: number | null;
    max_score: number | null;
    completed_at: string | null;
  };
  const scoresByEnrollment = new Map<
    string,
    { pre: QuizAttempt | null; post: QuizAttempt | null }
  >();
  for (const q of (quizAttempts ?? []) as QuizAttempt[]) {
    const cur =
      scoresByEnrollment.get(q.enrollment_id) ?? {
        pre: null,
        post: null,
      };
    if (q.phase === "pre") cur.pre = q;
    else if (q.phase === "post") cur.post = q;
    scoresByEnrollment.set(q.enrollment_id, cur);
  }

  function pct(score: number | null, max: number | null): number | null {
    if (score === null || max === null || max === 0) return null;
    return Math.round((score / max) * 100);
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  const rows = enrollmentRows.map((e) => {
    const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
    const lastName = learner?.last_name ?? "";
    const firstName = learner?.first_name ?? "";
    const email = learner?.email ?? null;
    const scores = scoresByEnrollment.get(e.id) ?? null;
    const prePct = scores?.pre
      ? pct(scores.pre.score, scores.pre.max_score)
      : null;
    const postPct = scores?.post
      ? pct(scores.post.score, scores.post.max_score)
      : null;
    const progression =
      prePct !== null && postPct !== null ? postPct - prePct : null;
    return {
      enrollmentId: e.id,
      fullName: [firstName, lastName].filter(Boolean).join(" ").trim() || "—",
      email,
      prePct,
      postPct,
      progression,
    };
  });

  // Trier par nom de famille
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName));

  const enrollmentIdsCsv = rows
    .map((r) => r.enrollmentId)
    .filter((id): id is string => !!id)
    .join(",");

  return (
    <div className="space-y-4">
      {/* Retour */}
      <Link
        href={`/partenaire/${token}/archives`}
        className="inline-flex items-center gap-1.5 text-xs text-cyan-700 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour aux archives
      </Link>

      {/* Header session */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-cyan-100 text-cyan-700">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-zinc-900">
              {formation?.title ?? "Session"}
            </h1>
            <div className="mt-1 text-xs text-zinc-500 space-y-0.5">
              <div className="inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                {formatDate(sess.start_date)}
                {sess.end_date &&
                  sess.end_date !== sess.start_date &&
                  ` → ${formatDate(sess.end_date)}`}
              </div>
              <div>
                {sess.modality === "distanciel"
                  ? "Distanciel"
                  : sess.modality === "presentiel"
                    ? "Présentiel"
                    : sess.modality === "hybride"
                      ? "Hybride"
                      : "—"}
                {sess.is_inter !== null &&
                  ` · ${sess.is_inter ? "INTER" : "INTRA"}`}
                {formation?.duration_hours
                  ? ` · ${formation.duration_hours} h`
                  : ""}
              </div>
              {(locationObj || sess.location) && (
                <div className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  {locationObj
                    ? [locationObj.name, locationObj.city]
                        .filter(Boolean)
                        .join(" — ")
                    : sess.location}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Boutons telechargements */}
      {rows.length > 0 && enrollmentIdsCsv.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/partner/${token}/archives/${sessionId}/scores.csv`}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700 text-sm font-medium"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Télécharger scores (CSV)
          </a>
          <a
            href={`/api/partner/${token}/archives/${sessionId}/emargement.zip`}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-cyan-300 bg-white hover:bg-cyan-50 text-cyan-700 text-sm font-medium"
          >
            <Download className="h-4 w-4" />
            Télécharger feuilles d&apos;émargement (ZIP)
          </a>
        </div>
      )}

      {/* Tableau apprenants + scores */}
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider font-bold text-zinc-600 inline-flex items-center gap-2">
          <Award className="h-3 w-3" />
          {isMineSession
            ? `Apprenants de la session (${rows.length})`
            : `Apprenants inscrits via ${ctx.company.name} (${rows.length})`}
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500 italic">
            {isMineSession
              ? "Aucun apprenant inscrit sur cette session."
              : "Aucun apprenant inscrit via votre organisme pour cette session."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
              <tr>
                <th className="px-3 py-2 text-left">Apprenant</th>
                <th className="px-3 py-2 text-right">Quiz pré</th>
                <th className="px-3 py-2 text-right">Quiz post</th>
                <th className="px-3 py-2 text-right">Progression</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.enrollmentId} className="hover:bg-zinc-50/50">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-zinc-900">
                      {r.fullName}
                    </div>
                    {r.email && (
                      <div className="text-[11px] text-zinc-500">
                        {r.email}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.prePct !== null ? (
                      <span className="font-bold text-violet-700">
                        {r.prePct} %
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-xs italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.postPct !== null ? (
                      <span className="font-bold text-emerald-700">
                        {r.postPct} %
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-xs italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.progression !== null ? (
                      <span
                        className={
                          r.progression > 0
                            ? "font-bold text-emerald-600"
                            : r.progression < 0
                              ? "font-bold text-red-600"
                              : "font-bold text-zinc-600"
                        }
                      >
                        {r.progression > 0 ? "+" : ""}
                        {r.progression} pts
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-xs italic">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
