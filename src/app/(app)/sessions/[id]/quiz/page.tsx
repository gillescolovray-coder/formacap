import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  Brain,
  CheckCircle2,
  Eye,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import type { QuizAttempt } from "@/lib/quiz/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionQuizDashboardPage({
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
      "id, quiz_template_id, formation:formations(title, quiz_template_id)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      quiz_template_id: string | null;
      formation: {
        title: string;
        quiz_template_id: string | null;
      } | null;
    }>();
  if (!session) notFound();

  const effectiveQuizId =
    session.quiz_template_id ?? session.formation?.quiz_template_id ?? null;

  const title = session.formation?.title ?? "Session";

  // Cas : aucun quiz rattaché
  if (!effectiveQuizId) {
    return (
      <>
        <PageHeader
          title="Quiz d'évaluation"
          description={
            <>
              <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                {title}
              </span>
              <SessionHeaderMeta sessionId={id} />
            </>
          }
          breadcrumbs={[
            { label: "Tableau de bord", href: "/dashboard" },
            { label: "Sessions", href: "/sessions" },
            { label: title, href: `/sessions/${id}` },
            { label: "Quiz" },
          ]}
          actions={<BackButton fallbackHref={`/sessions/${id}`} />}
        />
        <SessionTabs sessionId={id} />
        <div className="p-8 max-w-3xl">
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center space-y-2">
            <AlertCircle className="h-10 w-10 mx-auto text-amber-600" />
            <h2 className="text-base font-bold">Aucun quiz rattaché</h2>
            <p className="text-sm text-zinc-700">
              Cette session n&apos;a pas de quiz d&apos;évaluation rattaché.
            </p>
            <div className="text-xs text-zinc-600 space-y-1 mt-3">
              <p>
                Pour activer ce module, rattache un quiz sur la fiche session
                (champ « Quiz d&apos;évaluation »).
              </p>
              <p>
                Tu peux d&apos;abord créer un quiz dans{" "}
                <Link
                  href="/parametres/quiz"
                  className="text-cyan-700 underline"
                >
                  Paramètres → Quiz
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Chargement quiz + apprenants + tentatives
  const { data: quiz } = await supabase
    .from("quiz_templates")
    .select("id, title, description")
    .eq("id", effectiveQuizId)
    .maybeSingle<{
      id: string;
      title: string;
      description: string | null;
    }>();

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(civility, first_name, last_name, company:companies(name))",
    )
    .eq("session_id", id);

  const participants = ((enrollments ?? []) as unknown as Array<{
    id: string;
    learner: {
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
      company: { name: string } | null;
    } | null;
  }>).map((e) => ({
    enrollmentId: e.id,
    fullName: [e.learner?.first_name, e.learner?.last_name]
      .filter(Boolean)
      .join(" "),
    civility: e.learner?.civility ?? null,
    companyName: e.learner?.company?.name ?? null,
  }));

  const enrollmentIds = participants.map((p) => p.enrollmentId);

  const { data: attemptsRaw } =
    enrollmentIds.length > 0
      ? await supabase
          .from("quiz_attempts")
          .select(
            "id, enrollment_id, quiz_template_id, phase, score, max_score, completed_at, started_at, data",
          )
          .in("enrollment_id", enrollmentIds)
          .eq("quiz_template_id", effectiveQuizId)
      : { data: [] as QuizAttempt[] };

  const attempts = (attemptsRaw ?? []) as QuizAttempt[];

  // Index : enrollment_id → { pre, post }
  const byEnrollment = new Map<
    string,
    { pre: QuizAttempt | null; post: QuizAttempt | null }
  >();
  for (const p of participants) {
    byEnrollment.set(p.enrollmentId, { pre: null, post: null });
  }
  for (const a of attempts) {
    const slot = byEnrollment.get(a.enrollment_id);
    if (!slot) continue;
    if (a.phase === "pre") slot.pre = a;
    if (a.phase === "post") slot.post = a;
  }

  // KPIs
  const total = participants.length;
  const nbPre = attempts.filter((a) => a.phase === "pre").length;
  const nbPost = attempts.filter((a) => a.phase === "post").length;

  const preScores = attempts
    .filter((a) => a.phase === "pre" && a.score !== null && a.max_score)
    .map((a) => ((a.score ?? 0) / (a.max_score ?? 1)) * 100);
  const postScores = attempts
    .filter((a) => a.phase === "post" && a.score !== null && a.max_score)
    .map((a) => ((a.score ?? 0) / (a.max_score ?? 1)) * 100);

  const avgPre =
    preScores.length > 0
      ? Math.round(preScores.reduce((a, b) => a + b, 0) / preScores.length)
      : null;
  const avgPost =
    postScores.length > 0
      ? Math.round(postScores.reduce((a, b) => a + b, 0) / postScores.length)
      : null;
  const progression =
    avgPre !== null && avgPost !== null ? avgPost - avgPre : null;

  return (
    <>
      <PageHeader
        title={`Quiz : ${quiz?.title ?? "—"}`}
        description={
          <>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
              {title}
            </span>
            <SessionHeaderMeta sessionId={id} />
          </>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Sessions", href: "/sessions" },
          { label: title, href: `/sessions/${id}` },
          { label: "Quiz" },
        ]}
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />
      <SessionTabs sessionId={id} counts={{ participants: total }} />

      <div className="p-8 max-w-5xl space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Pré-test"
            value={`${nbPre} / ${total}`}
            sub={avgPre !== null ? `moyenne ${avgPre} %` : null}
            color="amber"
            icon={<Brain className="h-4 w-4" />}
          />
          <Stat
            label="Post-test"
            value={`${nbPost} / ${total}`}
            sub={avgPost !== null ? `moyenne ${avgPost} %` : null}
            color="cyan"
            icon={<Brain className="h-4 w-4" />}
          />
          <Stat
            label="Progression"
            value={
              progression === null
                ? "—"
                : `${progression > 0 ? "+" : ""}${progression} pts`
            }
            sub={progression !== null ? "moyenne classe" : null}
            color={
              progression === null
                ? "slate"
                : progression > 0
                  ? "emerald"
                  : progression < 0
                    ? "rose"
                    : "slate"
            }
            icon={
              progression !== null && progression > 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )
            }
          />
          <Stat
            label="Cycle complet"
            value={`${
              participants.filter((p) => {
                const s = byEnrollment.get(p.enrollmentId);
                return s?.pre && s?.post;
              }).length
            } / ${total}`}
            sub="apprenants pré+post"
            color="violet"
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
        </div>

        {/* Tableau apprenants */}
        <section className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
          {participants.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              Aucun apprenant inscrit.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-3">Apprenant</th>
                    <th className="px-4 py-3">Entreprise</th>
                    <th className="px-4 py-3">Quiz d&apos;entrée</th>
                    <th className="px-4 py-3">Quiz de sortie</th>
                    <th className="px-4 py-3 text-right">Progression</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {participants.map((p) => {
                    const slot = byEnrollment.get(p.enrollmentId);
                    const pre = slot?.pre;
                    const post = slot?.post;
                    const prePct =
                      pre && pre.max_score
                        ? Math.round(((pre.score ?? 0) / pre.max_score) * 100)
                        : null;
                    const postPct =
                      post && post.max_score
                        ? Math.round(((post.score ?? 0) / post.max_score) * 100)
                        : null;
                    // Delta % = comparaison du score relatif (Qualiopi)
                    const delta =
                      prePct !== null && postPct !== null
                        ? postPct - prePct
                        : null;
                    // Delta brut = nombre de points supplementaires bien
                    // repondus, plus parlant pour un formateur (Gilles
                    // 2026-05-25 : "ajouter une progression en pourcentage
                    // en plus des points").
                    const deltaPoints =
                      pre && post && pre.score !== null && post.score !== null
                        ? (post.score ?? 0) - (pre.score ?? 0)
                        : null;
                    return (
                      <tr key={p.enrollmentId}>
                        <td className="px-4 py-3 font-medium align-top">
                          {p.civility ? `${p.civility} ` : ""}
                          {p.fullName}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 align-top">
                          {p.companyName ?? "—"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-2">
                            <AttemptCell attempt={pre} />
                            {pre && (
                              <Link
                                href={`/sessions/${id}/quiz/${p.enrollmentId}`}
                                title="Voir le détail des réponses (pré + post)"
                                className="p-1 rounded text-amber-700 hover:bg-amber-50 shrink-0"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-2">
                            <AttemptCell attempt={post} />
                            {post && (
                              <Link
                                href={`/sessions/${id}/quiz/${p.enrollmentId}`}
                                title="Voir le détail des réponses (pré + post)"
                                className="p-1 rounded text-amber-700 hover:bg-amber-50 shrink-0"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          {delta === null ? (
                            <span className="text-zinc-300 text-xs">—</span>
                          ) : (
                            <div
                              className={
                                "tabular-nums " +
                                (delta > 0
                                  ? "text-emerald-700"
                                  : delta < 0
                                    ? "text-rose-700"
                                    : "text-zinc-600")
                              }
                            >
                              {deltaPoints !== null && (
                                <div className="text-sm font-bold">
                                  {deltaPoints > 0 ? "+" : ""}
                                  {deltaPoints} pts
                                </div>
                              )}
                              <div className="text-xs opacity-80">
                                ({delta > 0 ? "+" : ""}
                                {delta} %)
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Synthèse comparée pré/post */}
        {(nbPre > 0 || nbPost > 0) && (
          <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
            <header className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-bold text-zinc-900">
                Synthèse des scores
              </h2>
            </header>

            <div className="space-y-3">
              <ScoreBar
                title="Moyenne pré-test"
                pct={avgPre}
                color="bg-amber-500"
                count={nbPre}
                total={total}
              />
              <ScoreBar
                title="Moyenne post-test"
                pct={avgPost}
                color="bg-cyan-500"
                count={nbPost}
                total={total}
              />
            </div>

            {progression !== null && (
              <div
                className={
                  "rounded-lg p-3 text-sm flex items-center gap-2 " +
                  (progression > 0
                    ? "bg-emerald-50 text-emerald-800"
                    : progression < 0
                      ? "bg-rose-50 text-rose-800"
                      : "bg-zinc-50 text-zinc-700")
                }
              >
                {progression > 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>
                  Progression moyenne de la cohorte :{" "}
                  <strong>
                    {progression > 0 ? "+" : ""}
                    {progression} points
                  </strong>{" "}
                  entre le pré-test ({avgPre} %) et le post-test ({avgPost} %).
                </span>
              </div>
            )}
          </section>
        )}

      </div>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub: string | null;
  color: "amber" | "cyan" | "emerald" | "rose" | "slate" | "violet";
  icon: React.ReactNode;
}) {
  const colors: Record<typeof color, { bg: string; text: string }> = {
    amber: { bg: "bg-amber-50", text: "text-amber-700" },
    cyan: { bg: "bg-cyan-50", text: "text-cyan-700" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700" },
    rose: { bg: "bg-rose-50", text: "text-rose-700" },
    slate: { bg: "bg-slate-50", text: "text-slate-700" },
    violet: { bg: "bg-violet-50", text: "text-violet-700" },
  };
  const c = colors[color];
  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-4 flex items-center gap-3">
      <div
        className={`h-10 w-10 rounded-lg ${c.bg} ${c.text} flex items-center justify-center shrink-0`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
          {label}
        </div>
        <div className="text-xl font-bold text-zinc-900 tabular-nums truncate">
          {value}
        </div>
        {sub && <div className="text-[10px] text-zinc-500">{sub}</div>}
      </div>
    </div>
  );
}

/**
 * Cellule d'un quiz (pré ou post) : badge score + horodatage de la
 * complétion. L'horodatage permet au formateur de voir QUAND chaque
 * apprenant a joué (utile pour relancer ceux qui n'ont pas fait le
 * post, ou repérer ceux qui jouent trop tôt / trop tard).
 */
function AttemptCell({ attempt }: { attempt: QuizAttempt | null | undefined }) {
  if (!attempt) {
    return <span className="text-zinc-400 text-xs">⏳ Non joué</span>;
  }
  const at = attempt.completed_at ?? attempt.started_at;
  // Fix Gilles 2026-05-25 : sans timeZone explicite, le formateur
  // toLocaleString s'aligne sur le fuseau du serveur (UTC sur Vercel)
  // -> ecart de 2h en ete / 1h en hiver vs heure Paris reelle.
  const dateLabel = at
    ? new Date(at).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  if (attempt.score === null || !attempt.max_score) {
    return (
      <div className="space-y-0.5">
        <span className="text-xs text-amber-700">En cours</span>
        {dateLabel && (
          <div className="text-[10px] text-zinc-400 tabular-nums">
            démarré {dateLabel}
          </div>
        )}
      </div>
    );
  }
  const pct = Math.round((attempt.score / attempt.max_score) * 100);
  const color =
    pct >= 75
      ? "bg-emerald-100 text-emerald-800"
      : pct >= 50
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return (
    <div className="space-y-0.5">
      <span
        className={
          "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full " +
          color
        }
      >
        {attempt.score}/{attempt.max_score}
        <span className="text-[10px] font-normal opacity-80">({pct} %)</span>
      </span>
      {dateLabel && (
        <div className="text-[10px] text-zinc-500 tabular-nums">
          {dateLabel}
        </div>
      )}
    </div>
  );
}

function ScoreBar({
  title,
  pct,
  color,
  count,
  total,
}: {
  title: string;
  pct: number | null;
  color: string;
  count: number;
  total: number;
}) {
  return (
    <div className="text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="text-zinc-700 font-semibold">{title}</span>
        <span className="text-zinc-600 tabular-nums">
          {pct === null ? "—" : `${pct} %`} ·{" "}
          <span className="text-zinc-400">
            ({count} / {total} réponses)
          </span>
        </span>
      </div>
      <div className="h-3 bg-zinc-100 rounded overflow-hidden">
        {pct !== null && (
          <div
            className={`h-full ${color}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
