import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MODALITY_LABELS } from "@/lib/formations/types";
import type { QuizAttempt } from "@/lib/quiz/types";
import { PrintButton } from "./_print-button";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pickOne<T>(v: unknown): T | null {
  return (Array.isArray(v) ? (v[0] ?? null) : (v ?? null)) as T | null;
}

function frDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function pct(score: number | null, max: number | null): number | null {
  if (score === null || !max) return null;
  return Math.round((score / max) * 100);
}

export default async function QuizProofPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, modality, is_inter, trainer_name, quiz_template_id, formation:formations(title, duration_hours, quiz_template_id), prescriber:companies!prescriber_company_id(name), location_obj:formation_locations!location_id(name, city), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();

  const sAny = session as Record<string, unknown>;
  const formation = pickOne<{
    title: string;
    duration_hours: number | null;
    quiz_template_id: string | null;
  }>(sAny.formation);
  const effectiveQuizId =
    (sAny.quiz_template_id as string | null) ??
    formation?.quiz_template_id ??
    null;
  const title = formation?.title ?? "Session";
  const prescriber = pickOne<{ name: string | null }>(sAny.prescriber);
  const location = pickOne<{ name: string | null; city: string | null }>(
    sAny.location_obj,
  );
  const trainerObj = pickOne<{ first_name: string | null; last_name: string | null }>(
    sAny.trainer,
  );
  const trainerName =
    (sAny.trainer_name as string | null)?.trim() ||
    [trainerObj?.first_name, trainerObj?.last_name].filter(Boolean).join(" ") ||
    "—";

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .limit(1)
    .maybeSingle<{ name: string | null }>();

  const { data: quiz } = effectiveQuizId
    ? await supabase
        .from("quiz_templates")
        .select("title")
        .eq("id", effectiveQuizId)
        .maybeSingle<{ title: string }>()
    : { data: null };

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, company_name_temp, company:companies(name)), inscription_request:inscription_requests(company_name_freetext, company:companies!inscription_requests_company_id_fkey(name))",
    )
    .eq("session_id", id);

  const participants = ((enrollments ?? []) as unknown[]).map((row) => {
    const e = row as {
      id: string;
      learner: unknown;
      inscription_request: unknown;
    };
    const learner = pickOne<{
      first_name: string | null;
      last_name: string | null;
      company_name_temp: string | null;
      company: unknown;
    }>(e.learner);
    const req = pickOne<{
      company_name_freetext: string | null;
      company: unknown;
    }>(e.inscription_request);
    const companyName =
      pickOne<{ name: string }>(req?.company)?.name ??
      pickOne<{ name: string }>(learner?.company)?.name ??
      learner?.company_name_temp ??
      req?.company_name_freetext ??
      null;
    return {
      enrollmentId: e.id,
      fullName:
        [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") ||
        "—",
      companyName,
    };
  });

  const enrollmentIds = participants.map((p) => p.enrollmentId);
  const { data: attemptsRaw } =
    enrollmentIds.length > 0 && effectiveQuizId
      ? await supabase
          .from("quiz_attempts")
          .select(
            "id, enrollment_id, quiz_template_id, phase, score, max_score, completed_at",
          )
          .in("enrollment_id", enrollmentIds)
          .eq("quiz_template_id", effectiveQuizId)
      : { data: [] as QuizAttempt[] };
  const attempts = (attemptsRaw ?? []) as QuizAttempt[];

  const byEnrollment = new Map<
    string,
    { pre: QuizAttempt | null; post: QuizAttempt | null }
  >();
  for (const p of participants)
    byEnrollment.set(p.enrollmentId, { pre: null, post: null });
  for (const a of attempts) {
    const slot = byEnrollment.get(a.enrollment_id);
    if (!slot) continue;
    if (a.phase === "pre") slot.pre = a;
    if (a.phase === "post") slot.post = a;
  }

  const preScores = attempts
    .filter((a) => a.phase === "pre" && a.score !== null && a.max_score)
    .map((a) => ((a.score ?? 0) / (a.max_score ?? 1)) * 100);
  const postScores = attempts
    .filter((a) => a.phase === "post" && a.score !== null && a.max_score)
    .map((a) => ((a.score ?? 0) / (a.max_score ?? 1)) * 100);
  const avg = (arr: number[]) =>
    arr.length > 0
      ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
      : null;
  const avgPre = avg(preScores);
  const avgPost = avg(postScores);
  const progression =
    avgPre !== null && avgPost !== null ? avgPost - avgPre : null;

  const editedAt = new Date().toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const metaLine = [
    session.is_inter ? "INTER" : "INTRA",
    sAny.modality
      ? (MODALITY_LABELS as Record<string, string>)[sAny.modality as string] ??
        (sAny.modality as string)
      : null,
    formation?.duration_hours ? `${formation.duration_hours} h` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto max-w-[800px] p-8 text-zinc-900 bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print mb-6 flex items-center justify-between gap-3">
        <Link
          href={`/sessions/${id}/quiz`}
          className="text-sm text-cyan-700 hover:underline"
        >
          ← Retour au quiz
        </Link>
        <PrintButton
          documentTitle={`Preuve Qualiopi - Quiz - ${title}`}
        />
      </div>

      {/* En-tête */}
      <header className="border-b-2 border-zinc-800 pb-3 mb-5">
        <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-500">
          {org?.name ?? "Organisme de formation"} — Preuve Qualiopi (indicateur
          11)
        </p>
        <h1 className="text-xl font-black mt-1">
          Évaluation des acquis — Quiz pré-formation / post-formation
        </h1>
        <p className="text-sm font-semibold text-zinc-700 mt-2">{title}</p>
        <p className="text-xs text-zinc-600 mt-1">
          {metaLine}
          {session.start_date
            ? ` · ${frDate(session.start_date as string)}${
                session.end_date && session.end_date !== session.start_date
                  ? ` → ${frDate(session.end_date as string)}`
                  : ""
              }`
            : ""}
          {location?.name ? ` · ${location.name}` : ""}
          {location?.city ? ` (${location.city})` : ""}
        </p>
        <p className="text-xs text-zinc-600 mt-0.5">
          Formateur : {trainerName}
          {prescriber?.name ? ` · Partenaire / OF : ${prescriber.name}` : ""}
          {quiz?.title ? ` · Quiz : ${quiz.title}` : ""}
        </p>
      </header>

      {/* Synthèse */}
      <section className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-lg border border-zinc-300 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            Moyenne pré-test
          </div>
          <div className="text-2xl font-black tabular-nums">
            {avgPre !== null ? `${avgPre} %` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-300 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            Moyenne post-test
          </div>
          <div className="text-2xl font-black tabular-nums">
            {avgPost !== null ? `${avgPost} %` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-300 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            Progression
          </div>
          <div className="text-2xl font-black tabular-nums">
            {progression === null
              ? "—"
              : `${progression > 0 ? "+" : ""}${progression} %`}
          </div>
        </div>
      </section>

      {/* Tableau */}
      <table className="w-full text-sm border border-zinc-300 border-collapse">
        <thead>
          <tr className="bg-zinc-100 text-left">
            <th className="border border-zinc-300 px-2 py-1.5">Apprenant</th>
            <th className="border border-zinc-300 px-2 py-1.5">Entreprise</th>
            <th className="border border-zinc-300 px-2 py-1.5 text-center">
              Quiz d&apos;entrée
            </th>
            <th className="border border-zinc-300 px-2 py-1.5 text-center">
              Quiz de sortie
            </th>
            <th className="border border-zinc-300 px-2 py-1.5 text-center">
              Progression
            </th>
          </tr>
        </thead>
        <tbody>
          {participants.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="border border-zinc-300 px-2 py-3 text-center text-zinc-500"
              >
                Aucun apprenant inscrit.
              </td>
            </tr>
          ) : (
            participants.map((p) => {
              const slot = byEnrollment.get(p.enrollmentId);
              const prePct = slot?.pre
                ? pct(slot.pre.score, slot.pre.max_score)
                : null;
              const postPct = slot?.post
                ? pct(slot.post.score, slot.post.max_score)
                : null;
              const prog =
                prePct !== null && postPct !== null ? postPct - prePct : null;
              return (
                <tr key={p.enrollmentId}>
                  <td className="border border-zinc-300 px-2 py-1.5 font-medium">
                    {p.fullName}
                  </td>
                  <td className="border border-zinc-300 px-2 py-1.5">
                    {p.companyName ?? "—"}
                  </td>
                  <td className="border border-zinc-300 px-2 py-1.5 text-center tabular-nums">
                    {slot?.pre
                      ? `${slot.pre.score}/${slot.pre.max_score}${
                          prePct !== null ? ` (${prePct} %)` : ""
                        }`
                      : "Non joué"}
                  </td>
                  <td className="border border-zinc-300 px-2 py-1.5 text-center tabular-nums">
                    {slot?.post
                      ? `${slot.post.score}/${slot.post.max_score}${
                          postPct !== null ? ` (${postPct} %)` : ""
                        }`
                      : "Non joué"}
                  </td>
                  <td className="border border-zinc-300 px-2 py-1.5 text-center tabular-nums font-semibold">
                    {prog === null ? "—" : `${prog > 0 ? "+" : ""}${prog} %`}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {progression !== null && (
        <p className="text-xs text-zinc-700 mt-3">
          Progression moyenne de la cohorte :{" "}
          <strong>
            {progression > 0 ? "+" : ""}
            {progression} %
          </strong>{" "}
          entre le pré-test ({avgPre} %) et le post-test ({avgPost} %).
        </p>
      )}

      <footer className="mt-8 pt-3 border-t border-zinc-300 text-[10px] text-zinc-500">
        Document édité le {editedAt} — {org?.name ?? "Organisme de formation"}.
        Pièce justificative Qualiopi (mesure de l&apos;atteinte des objectifs,
        indicateur 11).
      </footer>
    </main>
  );
}
