import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Brain,
  Calendar,
  ChevronRight,
  GraduationCap,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLearnerContext } from "../_resolve";

type Params = { token: string };

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function LearnerQuizPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const ctx = await resolveLearnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();

  // Charger les enrollments de l apprenant
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, status, session:sessions(id, start_date, end_date, formation:formations(id, title))",
    )
    .eq("learner_id", ctx.learner.id)
    .neq("status", "cancelled");

  type EnrollRow = {
    id: string;
    status: string | null;
    session: {
      id: string;
      start_date: string | null;
      end_date: string | null;
      formation: { id: string; title: string } | Array<{ id: string; title: string }> | null;
    } | null;
  };

  const items = ((enrollments ?? []) as unknown as EnrollRow[])
    .map((r) => {
      const session = Array.isArray(r.session) ? r.session[0] : r.session;
      if (!session) return null;
      const formation = Array.isArray(session.formation)
        ? session.formation[0]
        : session.formation;
      return {
        enrollmentId: r.id,
        sessionId: session.id,
        startDate: session.start_date,
        endDate: session.end_date,
        title: formation?.title ?? "(formation supprimée)",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => {
      const da = a.startDate ?? "9999";
      const db = b.startDate ?? "9999";
      return db.localeCompare(da);
    });

  // Tous les quiz_attempts de cet apprenant
  const enrollmentIds = items.map((i) => i.enrollmentId);
  const { data: attempts } =
    enrollmentIds.length > 0
      ? await supabase
          .from("quiz_attempts")
          .select(
            "id, enrollment_id, phase, score, max_score, completed_at, started_at",
          )
          .in("enrollment_id", enrollmentIds)
      : { data: [] };

  type Attempt = {
    id: string;
    enrollment_id: string;
    phase: "pre" | "post";
    score: number | null;
    max_score: number | null;
    completed_at: string | null;
    started_at: string | null;
  };
  const attemptsByEnrollment = new Map<
    string,
    { pre: Attempt | null; post: Attempt | null }
  >();
  for (const a of (attempts ?? []) as Attempt[]) {
    const cur =
      attemptsByEnrollment.get(a.enrollment_id) ??
      ({ pre: null, post: null } as {
        pre: Attempt | null;
        post: Attempt | null;
      });
    if (a.phase === "pre") cur.pre = a;
    else if (a.phase === "post") cur.post = a;
    attemptsByEnrollment.set(a.enrollment_id, cur);
  }

  // Garder uniquement les sessions ou l apprenant a fait au moins 1 quiz
  const itemsWithQuiz = items.filter((i) => {
    const a = attemptsByEnrollment.get(i.enrollmentId);
    return a && (a.pre || a.post);
  });

  function pct(score: number | null, max: number | null): number | null {
    if (score === null || max === null || max === 0) return null;
    return Math.round((score / max) * 100);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 inline-flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-violet-600" />
          Mes résultats
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Vos scores aux quiz d&apos;entrée et de sortie de chaque formation
          + votre progression.
        </p>
      </header>

      {itemsWithQuiz.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Brain className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-600">
            Aucun résultat de quiz pour le moment.
          </p>
          <p className="text-xs text-zinc-500 mt-2">
            Les quiz d&apos;entrée et de sortie apparaîtront ici une fois
            complétés.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {itemsWithQuiz.map((item) => {
            const att = attemptsByEnrollment.get(item.enrollmentId);
            const prePct = att?.pre ? pct(att.pre.score, att.pre.max_score) : null;
            const postPct = att?.post
              ? pct(att.post.score, att.post.max_score)
              : null;
            const progression =
              prePct !== null && postPct !== null ? postPct - prePct : null;
            return (
              <article
                key={item.enrollmentId}
                className="rounded-2xl bg-white border border-zinc-200 p-4 sm:p-5 space-y-4"
              >
                {/* Header session */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/apprenant/${token}/sessions/${item.sessionId}`}
                      className="font-bold text-zinc-900 leading-snug hover:text-cyan-700 inline-flex items-center gap-1"
                    >
                      {item.title}
                      <ChevronRight className="h-3.5 w-3.5 opacity-50" />
                    </Link>
                    <div className="text-xs text-zinc-500 mt-0.5 inline-flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />
                      {formatDate(item.startDate)}
                      {item.endDate &&
                        item.endDate !== item.startDate &&
                        ` – ${formatDate(item.endDate)}`}
                    </div>
                  </div>
                </div>

                {/* Stats : pre / post / progression */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  <ScoreCard
                    label="Quiz d'entrée"
                    pct={prePct}
                    score={att?.pre?.score ?? null}
                    maxScore={att?.pre?.max_score ?? null}
                    color="amber"
                  />
                  <ScoreCard
                    label="Quiz de sortie"
                    pct={postPct}
                    score={att?.post?.score ?? null}
                    maxScore={att?.post?.max_score ?? null}
                    color="cyan"
                  />
                  <ProgressionCard progression={progression} />
                </div>

                {/* Synthèse */}
                {prePct !== null && postPct !== null && progression !== null && (
                  <div
                    className={
                      "rounded-lg p-3 text-xs flex items-center gap-2 " +
                      (progression > 0
                        ? "bg-emerald-50 text-emerald-900"
                        : progression < 0
                          ? "bg-rose-50 text-rose-900"
                          : "bg-zinc-50 text-zinc-700")
                    }
                  >
                    {progression > 0 ? (
                      <TrendingUp className="h-4 w-4 text-emerald-700" />
                    ) : progression < 0 ? (
                      <TrendingDown className="h-4 w-4 text-rose-700" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-zinc-500" />
                    )}
                    <span>
                      Votre progression :{" "}
                      <strong>
                        {progression > 0 ? "+" : ""}
                        {progression} %
                      </strong>{" "}
                      entre le quiz d&apos;entrée ({prePct} %) et le quiz de
                      sortie ({postPct} %).
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScoreCard({
  label,
  pct,
  score,
  maxScore,
  color,
}: {
  label: string;
  pct: number | null;
  score: number | null;
  maxScore: number | null;
  color: "amber" | "cyan";
}) {
  const cls = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    cyan: "bg-cyan-50 border-cyan-200 text-cyan-700",
  }[color];
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <Brain className="h-4 w-4 mb-1" />
      <div className="text-[10px] uppercase tracking-wider font-bold leading-tight mb-1">
        {label}
      </div>
      {pct !== null ? (
        <>
          <div className="text-2xl font-bold text-zinc-900 tabular-nums">
            {pct} %
          </div>
          <div className="text-[10px] text-zinc-600">
            {score} / {maxScore} points
          </div>
        </>
      ) : (
        <div className="text-sm italic text-zinc-500">Non complété</div>
      )}
    </div>
  );
}

function ProgressionCard({ progression }: { progression: number | null }) {
  if (progression === null) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <TrendingUp className="h-4 w-4 mb-1 text-zinc-400" />
        <div className="text-[10px] uppercase tracking-wider font-bold leading-tight mb-1 text-zinc-600">
          Progression
        </div>
        <div className="text-sm italic text-zinc-400">À venir</div>
      </div>
    );
  }
  const cls =
    progression > 0
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : progression < 0
        ? "bg-rose-50 border-rose-200 text-rose-700"
        : "bg-zinc-50 border-zinc-200 text-zinc-700";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      {progression > 0 ? (
        <TrendingUp className="h-4 w-4 mb-1" />
      ) : (
        <TrendingDown className="h-4 w-4 mb-1" />
      )}
      <div className="text-[10px] uppercase tracking-wider font-bold leading-tight mb-1">
        Progression
      </div>
      <div className="text-2xl font-bold text-zinc-900 tabular-nums">
        {progression > 0 ? "+" : ""}
        {progression} %
      </div>
      <div className="text-[10px] text-zinc-600">entre entrée et sortie</div>
    </div>
  );
}
