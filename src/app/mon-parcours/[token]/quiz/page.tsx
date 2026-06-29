import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuizAttempt, QuizQuestion } from "@/lib/quiz/types";
import { QuizPlay } from "./_play";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quiz d'évaluation — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string };

export default async function QuizPlayPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 1. Token portail → enrollment + session + formation + quiz id effectif
  const { data: portalRow } = await supabase
    .from("enrollment_portal_tokens")
    .select(
      "enrollment_id, enrollment:session_enrollments(id, learner:learners(civility, first_name, last_name), session:sessions(start_date, end_date, quiz_template_id, formation:formations(title, quiz_template_id), organization:organizations(name, logo_url)))",
    )
    .eq("token", token)
    .maybeSingle<{
      enrollment_id: string;
      enrollment: {
        id: string;
        learner: {
          civility: string | null;
          first_name: string | null;
          last_name: string | null;
        } | null;
        session: {
          start_date: string;
          end_date: string;
          quiz_template_id: string | null;
          formation: {
            title: string;
            quiz_template_id: string | null;
          } | null;
          organization: { name: string; logo_url: string | null } | null;
        } | null;
      } | null;
    }>();

  if (!portalRow || !portalRow.enrollment || !portalRow.enrollment.session) {
    return <Card title="Lien invalide" reason="Lien introuvable." />;
  }

  const enrollment = portalRow.enrollment;
  const session = enrollment.session!;
  const effectiveQuizId =
    session.quiz_template_id ??
    session.formation?.quiz_template_id ??
    null;

  if (!effectiveQuizId) {
    return (
      <Card
        title="Aucun quiz configuré"
        reason="Cette session n'a pas de quiz d'évaluation rattaché. Contactez votre formateur."
        backHref={`/mon-parcours/${token}`}
      />
    );
  }

  // 2. Charger quiz + questions
  const { data: quiz } = await supabase
    .from("quiz_templates")
    .select("id, title, description, status")
    .eq("id", effectiveQuizId)
    .maybeSingle<{
      id: string;
      title: string;
      description: string | null;
      status: string;
    }>();
  if (!quiz || quiz.status !== "published") {
    return (
      <Card
        title="Quiz indisponible"
        reason="Le quiz n'est pas encore publié."
        backHref={`/mon-parcours/${token}`}
      />
    );
  }

  const { data: questionsRaw } = await supabase
    .from("quiz_questions")
    .select(
      "id, quiz_template_id, position, type, text, options, correct_answer, points, explanation",
    )
    .eq("quiz_template_id", effectiveQuizId)
    .order("position", { ascending: true });
  const questions = (questionsRaw ?? []) as QuizQuestion[];

  if (questions.length === 0) {
    return (
      <Card
        title="Quiz vide"
        reason="Aucune question n'est encore définie. Contactez votre formateur."
        backHref={`/mon-parcours/${token}`}
      />
    );
  }

  // 3. Tentatives existantes de l'apprenant sur ce quiz
  const { data: attemptsRaw } = await supabase
    .from("quiz_attempts")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .eq("quiz_template_id", effectiveQuizId);
  const attempts = (attemptsRaw ?? []) as QuizAttempt[];

  // Détermine la phase à jouer
  // - Si pre absent → phase = pre
  // - Si pre fait + post absent → phase = post
  // - Sinon → tout fait, mode lecture
  const preAttempt = attempts.find((a) => a.phase === "pre") ?? null;
  const postAttempt = attempts.find((a) => a.phase === "post") ?? null;

  // Forcage de la phase par horaire Paris (Gilles 2026-05-25) :
  //   07:30 → 11:00 = quiz d'entree (matin) uniquement
  //   13:00 → 19:00 = quiz de sortie uniquement
  // Hors fenetre : on retombe sur la logique par defaut (auto-detect).
  const parisHourMinute = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [pH, pM] = parisHourMinute.split(":").map((x) => Number(x));
  const minutesNow = pH * 60 + pM;
  const inMorningWindow = minutesNow >= 7 * 60 + 30 && minutesNow < 11 * 60;
  const inAfternoonWindow = minutesNow >= 13 * 60 && minutesNow < 19 * 60;
  const forcedPhase: "pre" | "post" | null = inMorningWindow
    ? "pre"
    : inAfternoonWindow
      ? "post"
      : null;

  // Détail des réponses (corrigé) : anti-triche LE JOUR J uniquement
  // (Gilles 2026-06-29). Tant qu'on est sur/dans la journée de formation, le
  // corrigé n'apparaît qu'à partir de 18h00 Paris (pour ne pas révéler les
  // réponses entre le quiz du matin et celui de l'après-midi). Dès que la
  // session est PASSÉE (jour suivant et après), le détail est TOUJOURS
  // consultable. Corrige le bug où c'était bloqué tous les jours avant 18h.
  const parisDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
  }).format(new Date()); // YYYY-MM-DD
  const sessionOver = parisDateStr > session.end_date.slice(0, 10);
  const canSeeQuizDetail = sessionOver || minutesNow >= 18 * 60;

  const fullName = [
    enrollment.learner?.first_name,
    enrollment.learner?.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const orgName = session.organization?.name ?? "";
  const orgLogo = session.organization?.logo_url ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* max-w-4xl pour permettre l'affichage côte à côte des 2 corrigés
          (matin / après-midi) en mode lecture. Gilles 2026-06-29. */}
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-4">
        <Link
          href={`/mon-parcours/${token}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour à mon espace
        </Link>

        <header className="text-center space-y-2">
          {orgLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt={orgName}
              className="h-12 mx-auto mb-2 object-contain"
            />
          )}
          <div className="text-xs uppercase tracking-widest text-violet-700 font-bold">
            Quiz d&apos;évaluation
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            {quiz.title}
          </h1>
          {quiz.description && (
            <p className="text-sm text-zinc-600">{quiz.description}</p>
          )}
          <p className="text-xs text-zinc-500">
            {fullName} · {session.formation?.title}
          </p>
        </header>

        <QuizPlay
          token={token}
          quizId={effectiveQuizId}
          questions={questions}
          preAttempt={preAttempt}
          postAttempt={postAttempt}
          forcedPhase={forcedPhase}
          canSeeDetail={canSeeQuizDetail}
        />

        <footer className="text-center text-[11px] text-zinc-400">
          Ce quiz est joué une fois en début de session et une fois en fin
          pour mesurer votre progression.
        </footer>
      </div>
    </div>
  );
}

function Card({
  title,
  reason,
  backHref,
}: {
  title: string;
  reason: string;
  backHref?: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
        {backHref && (
          <Link
            href={backHref}
            className="inline-block mt-2 text-sm text-cyan-700 hover:underline"
          >
            Retour à mon espace
          </Link>
        )}
      </div>
    </div>
  );
}
