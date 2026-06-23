import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { SessionTabs } from "../../_session-tabs";
import { SessionHeaderMeta } from "../../_session-header-meta";
import { QuizAttemptDetailView } from "@/components/quiz-attempt-detail-view";
import type { QuizAttempt, QuizQuestion } from "@/lib/quiz/types";
import { PrintQuizDetailButton } from "./_print-button";
import { QuizCorrectionEditor } from "./_correction-editor";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Page admin OF : consultation du detail d'un quiz joue par un
 * apprenant. Meme rendu que cote formateur (composant partage
 * QuizAttemptDetailView) — Gilles 2026-05-28.
 *
 * Accessible depuis l'icone oeil dans le tableau Quiz de la session.
 */
export default async function AdminQuizDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
  searchParams: Promise<{ qsaved?: string; qerror?: string }>;
}) {
  const { id, enrollmentId } = await params;
  const sp = await searchParams;
  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(enrollmentId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, quiz_template_id, quiz_results_locked_at, formation:formations(title, quiz_template_id)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      quiz_template_id: string | null;
      quiz_results_locked_at: string | null;
      formation: { title: string; quiz_template_id: string | null } | null;
    }>();
  if (!session) notFound();
  const quizLocked = Boolean(session.quiz_results_locked_at);

  // Verifier l'enrollment + recuperer l'apprenant
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(civility, first_name, last_name, company:companies(name))",
    )
    .eq("id", enrollmentId)
    .eq("session_id", id)
    .maybeSingle<{
      id: string;
      learner: {
        civility: string | null;
        first_name: string | null;
        last_name: string | null;
        company: { name: string } | null;
      } | null;
    }>();
  if (!enrollment) notFound();

  const effectiveQuizId =
    session.quiz_template_id ?? session.formation?.quiz_template_id ?? null;
  if (!effectiveQuizId) {
    return (
      <NoQuiz id={id} />
    );
  }

  const [
    { data: quizRow },
    { data: questionsRaw },
    { data: attempts },
    { data: historyRows },
  ] = await Promise.all([
    supabase
      .from("quiz_templates")
      .select("title")
      .eq("id", effectiveQuizId)
      .maybeSingle<{ title: string }>(),
    supabase
      .from("quiz_questions")
      .select(
        "id, quiz_template_id, position, type, text, options, correct_answer, points, explanation",
      )
      .eq("quiz_template_id", effectiveQuizId)
      .order("position", { ascending: true }),
    supabase
      .from("quiz_attempts")
      .select(
        "id, enrollment_id, quiz_template_id, phase, score, max_score, started_at, completed_at, data, edited_at",
      )
      .eq("enrollment_id", enrollmentId)
      .eq("quiz_template_id", effectiveQuizId),
    supabase
      .from("quiz_attempt_history")
      .select("phase, score, max_score, archived_at")
      .eq("enrollment_id", enrollmentId)
      .eq("quiz_template_id", effectiveQuizId)
      .order("archived_at", { ascending: true }),
  ]);

  const questions = (questionsRaw ?? []) as QuizQuestion[];
  const allAttempts = (attempts ?? []) as Array<
    QuizAttempt & { edited_at?: string | null }
  >;
  const preAttempt = allAttempts.find((a) => a.phase === "pre") ?? null;
  const postAttempt = allAttempts.find((a) => a.phase === "post") ?? null;

  type HistRow = {
    phase: "pre" | "post";
    score: number | null;
    max_score: number | null;
    archived_at: string;
  };
  const history = (historyRows ?? []) as HistRow[];
  const pctOf = (s: number | null, m: number | null) =>
    s === null || m === null || m === 0 ? null : Math.round((s / m) * 100);

  const fullName = [
    enrollment.learner?.first_name,
    enrollment.learner?.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const companyName = enrollment.learner?.company?.name ?? null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Styles d'impression : masque sidebar, header app, tabs,
          bouton imprimer, et le lien retour. Garde uniquement le
          contenu pour produire une feuille A4 propre (Gilles 2026-05-28). */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { margin: 12mm 10mm; size: A4; }
              body { background: white !important; }
              .no-print, aside, nav, header { display: none !important; }
              main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
              html, body { margin: 0 !important; padding: 0 !important; }
              /* Eviter de couper une question entre 2 pages */
              .quiz-detail-question { break-inside: avoid; page-break-inside: avoid; }
              /* Couleurs preservees en print pour les badges */
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
          `,
        }}
      />
      <div className="no-print">
        <PageHeader
          title={`Quiz : ${fullName || "Apprenant"}`}
          description={
            session.formation?.title
              ? `${session.formation.title}${companyName ? ` · ${companyName}` : ""}`
              : (companyName ?? "Session")
          }
          actions={<BackButton fallbackHref={`/sessions/${id}/quiz`} />}
        />
        <SessionHeaderMeta sessionId={id} />
        <SessionTabs sessionId={id} />
      </div>

      <div className="px-8 py-6 max-w-5xl mx-auto w-full space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap no-print">
          <Link
            href={`/sessions/${id}/quiz`}
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour au tableau Quiz
          </Link>
          <PrintQuizDetailButton />
        </div>

        {/* En-tete visible aussi a l'impression : nom apprenant +
            entreprise + intitule formation + titre du quiz */}
        <div className="space-y-1 border-b border-zinc-200 pb-3">
          <div className="text-xs uppercase tracking-widest text-amber-700 font-bold">
            Détail du quiz d&apos;évaluation
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            {fullName || "Apprenant"}
          </h1>
          {companyName && (
            <p className="text-sm text-zinc-600">{companyName}</p>
          )}
          {session.formation?.title && (
            <p className="text-xs text-zinc-500">
              Formation : <strong>{session.formation.title}</strong>
            </p>
          )}
          {quizRow?.title && (
            <p className="text-xs text-zinc-500">
              Quiz : <strong>{quizRow.title}</strong>
            </p>
          )}
        </div>

        <QuizAttemptDetailView
          questions={questions}
          preAttempt={preAttempt}
          postAttempt={postAttempt}
        />

        {/* === Correction admin (Gilles 2026-06-23) === */}
        <div className="no-print space-y-3 border-t border-zinc-200 pt-4">
          {sp.qsaved && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
              ✅ Réponses corrigées et score recalculé.
            </div>
          )}
          {sp.qerror === "locked" && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">
              Résultats verrouillés — déverrouillez d&apos;abord depuis l&apos;onglet
              Quiz de la session.
            </div>
          )}

          <h2 className="text-sm font-bold text-zinc-800">
            Correction des résultats
          </h2>

          {/* Historique des rejeux (1er essai conservé) */}
          {history.length > 0 && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-xs text-zinc-600">
              <span className="font-semibold">Essais précédents (rejeu) :</span>{" "}
              {history.map((h, i) => {
                const p = pctOf(h.score, h.max_score);
                return (
                  <span key={i}>
                    {i > 0 ? " · " : ""}
                    {h.phase === "pre" ? "Pré" : "Post"}{" "}
                    {p !== null ? `${p}%` : "—"} (le{" "}
                    {new Date(h.archived_at).toLocaleDateString("fr-FR")})
                  </span>
                );
              })}
            </div>
          )}

          {preAttempt && (
            <div className="space-y-1">
              {preAttempt.edited_at && (
                <p className="text-[11px] text-amber-700">
                  ✎ Pré ajusté le{" "}
                  {new Date(preAttempt.edited_at).toLocaleDateString("fr-FR")}
                </p>
              )}
              <QuizCorrectionEditor
                sessionId={id}
                enrollmentId={enrollmentId}
                phase="pre"
                phaseLabel="Pré-formation"
                questions={questions}
                attempt={preAttempt}
                locked={quizLocked}
              />
            </div>
          )}
          {postAttempt && (
            <div className="space-y-1">
              {postAttempt.edited_at && (
                <p className="text-[11px] text-amber-700">
                  ✎ Post ajusté le{" "}
                  {new Date(postAttempt.edited_at).toLocaleDateString("fr-FR")}
                </p>
              )}
              <QuizCorrectionEditor
                sessionId={id}
                enrollmentId={enrollmentId}
                phase="post"
                phaseLabel="Post-formation"
                questions={questions}
                attempt={postAttempt}
                locked={quizLocked}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoQuiz({ id }: { id: string }) {
  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader
        title="Aucun quiz"
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />
      <SessionTabs sessionId={id} />
      <div className="px-8 py-6 max-w-3xl mx-auto w-full">
        <div className="rounded-xl bg-zinc-50 border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600">
          Aucun quiz n&apos;est rattaché à cette session.
        </div>
      </div>
    </div>
  );
}
