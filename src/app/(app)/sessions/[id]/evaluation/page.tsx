import Link from "next/link";
import { BarChart3, CheckCircle2, Eye, Star } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import {
  CONTENT_CRITERIA,
  EXPECTATIONS_OPTIONS,
  OBJECTIVES_OPTIONS,
  ORGANIZATION_CRITERIA,
  ORGANIZATION_CRITERIA as ORG_CRITERIA, // alias used below for clarity
  RATING_OPTIONS,
  RATING_OPTIONS_WITH_NA,
  RECOMMENDATION_OPTIONS,
  SATISFACTION_OPTIONS,
  TRAINER_CRITERIA,
  USEFULNESS_OPTIONS,
  computeNps,
  npsCategory,
  type HotEvaluationData,
  type SatisfactionValue,
} from "@/lib/evaluations/hot";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EvaluationAdminPage({
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
    .select("id, formation:formations(title)")
    .eq("id", id)
    .maybeSingle<{ id: string; formation: { title: string } | null }>();
  if (!session) notFound();

  // Apprenants
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(civility, first_name, last_name, company_name_temp, company:companies(name)), inscription_request:inscription_requests(company_name_freetext, company:companies!inscription_requests_company_id_fkey(name))",
    )
    .eq("session_id", id);

  const pickOne = <T,>(v: unknown): T | null =>
    (Array.isArray(v) ? (v[0] ?? null) : (v ?? null)) as T | null;

  const participants = ((enrollments ?? []) as unknown[]).map((row) => {
    const e = row as { id: string; learner: unknown; inscription_request: unknown };
    const learner = pickOne<{
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
      company_name_temp: string | null;
      company: unknown;
    }>(e.learner);
    const req = pickOne<{ company_name_freetext: string | null; company: unknown }>(
      e.inscription_request,
    );
    // Entreprise (employeur) — cascade alignée sur l'onglet Participants.
    const companyName =
      pickOne<{ name: string }>(req?.company)?.name ??
      pickOne<{ name: string }>(learner?.company)?.name ??
      learner?.company_name_temp ??
      req?.company_name_freetext ??
      null;
    return {
      enrollmentId: e.id,
      fullName: [learner?.first_name, learner?.last_name]
        .filter(Boolean)
        .join(" "),
      civility: learner?.civility ?? null,
      companyName,
    };
  });

  const enrollmentIds = participants.map((p) => p.enrollmentId);

  // Évaluations à chaud
  const { data: rows } =
    enrollmentIds.length > 0
      ? await supabase
          .from("evaluation_responses")
          .select("enrollment_id, data, nps_score, satisfaction_overall, submitted_at")
          .in("enrollment_id", enrollmentIds)
          .eq("evaluation_type", "hot")
      : { data: [] };

  const byEnrollment = new Map<
    string,
    {
      data: HotEvaluationData;
      nps_score: number | null;
      satisfaction: string;
      submittedAt: string;
    }
  >();
  const allData: HotEvaluationData[] = [];
  for (const r of (rows ?? []) as Array<{
    enrollment_id: string;
    data: HotEvaluationData;
    nps_score: number | null;
    satisfaction_overall: string;
    submitted_at: string;
  }>) {
    byEnrollment.set(r.enrollment_id, {
      data: r.data,
      nps_score: r.nps_score,
      satisfaction: r.satisfaction_overall,
      submittedAt: r.submitted_at,
    });
    allData.push(r.data);
  }

  const total = participants.length;
  const completed = byEnrollment.size;

  // Agrégats
  const npsScores = Array.from(byEnrollment.values())
    .map((v) => v.nps_score)
    .filter((s): s is number => s !== null);
  const npsValue = computeNps(npsScores);
  const npsAvg =
    npsScores.length > 0
      ? Math.round(
          (npsScores.reduce((a, b) => a + b, 0) / npsScores.length) * 10,
        ) / 10
      : null;
  const nbDetractors = npsScores.filter(
    (s) => npsCategory(s) === "detractor",
  ).length;
  const nbPassives = npsScores.filter(
    (s) => npsCategory(s) === "passive",
  ).length;
  const nbPromoters = npsScores.filter(
    (s) => npsCategory(s) === "promoter",
  ).length;

  const aggregates = computeAggregates(allData);

  const title = session.formation?.title ?? "Session";

  return (
    <>
      <PageHeader
        title="Évaluation à chaud"
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
          { label: "Évaluation" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/sessions/${id}/evaluation/print`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700"
              title="Imprimer / enregistrer en PDF la preuve Qualiopi (à envoyer à l'OF)"
            >
              <BarChart3 className="h-4 w-4" />
              Imprimer / PDF
            </Link>
            <BackButton fallbackHref={`/sessions/${id}`} />
          </div>
        }
      />

      <SessionTabs
        sessionId={id}
        counts={{ evaluations: completed, participants: total }}
      />

      <div className="p-8 max-w-5xl space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          <Stat
            label="Évaluations remplies"
            value={`${completed} / ${total}`}
            color="pink"
            icon={<Star className="h-4 w-4" />}
          />
          <Stat
            label="NPS"
            value={npsValue !== null ? `${npsValue >= 0 ? "+" : ""}${npsValue}` : "—"}
            color={
              npsValue === null
                ? "slate"
                : npsValue >= 50
                  ? "emerald"
                  : npsValue >= 0
                    ? "amber"
                    : "rose"
            }
            icon={<BarChart3 className="h-4 w-4" />}
          />
          <Stat
            label="Note moy. /10"
            value={npsAvg !== null ? String(npsAvg) : "—"}
            color="violet"
            icon={<BarChart3 className="h-4 w-4" />}
          />
          <Stat
            label="En attente"
            value={String(total - completed)}
            color="slate"
            icon={<Eye className="h-4 w-4" />}
          />
        </div>

        {/* Liste apprenants */}
        <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
          {participants.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              Aucun apprenant inscrit.
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-3">Apprenant</th>
                  <th className="px-4 py-3">Entreprise</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Note NPS</th>
                  <th className="px-4 py-3">Satisfaction</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {participants.map((p) => {
                  const ev = byEnrollment.get(p.enrollmentId);
                  return (
                    <tr key={p.enrollmentId}>
                      <td className="px-4 py-3 font-medium">
                        {p.civility ? `${p.civility} ` : ""}
                        {p.fullName}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {p.companyName ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {ev ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Remplie le{" "}
                            {new Date(ev.submittedAt).toLocaleDateString(
                              "fr-FR",
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700">
                            ⏳ En attente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ev?.nps_score !== null && ev?.nps_score !== undefined ? (
                          <span
                            className={
                              "text-xs px-2 py-0.5 rounded-full font-bold " +
                              npsBadgeColor(ev.nps_score)
                            }
                          >
                            {ev.nps_score}/10
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ev?.satisfaction ? (
                          <span
                            className={
                              "text-xs px-2 py-0.5 rounded-full " +
                              satisfactionBadgeColor(
                                ev.satisfaction as SatisfactionValue,
                              )
                            }
                          >
                            {labelSatisfaction(ev.satisfaction)}
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {ev ? (
                          <Link
                            href={`/sessions/${id}/evaluation/${p.enrollmentId}`}
                            className="text-xs text-cyan-700 hover:underline font-semibold"
                          >
                            Voir le détail →
                          </Link>
                        ) : (
                          <span className="text-zinc-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Synthèse */}
        {completed > 0 && (
          <SynthesisBlock
            aggregates={aggregates}
            npsBreakdown={{ nbDetractors, nbPassives, nbPromoters }}
            total={completed}
          />
        )}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: "pink" | "violet" | "emerald" | "amber" | "rose" | "slate";
  icon: React.ReactNode;
}) {
  const colors: Record<typeof color, { bg: string; text: string }> = {
    pink: { bg: "bg-pink-50", text: "text-pink-700" },
    violet: { bg: "bg-violet-50", text: "text-violet-700" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700" },
    amber: { bg: "bg-amber-50", text: "text-amber-700" },
    rose: { bg: "bg-rose-50", text: "text-rose-700" },
    slate: { bg: "bg-slate-50", text: "text-slate-700" },
  };
  const c = colors[color];
  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg ${c.bg} ${c.text} flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
          {label}
        </div>
        <div className="text-xl font-bold text-zinc-900">{value}</div>
      </div>
    </div>
  );
}

// ============================================================
// Helpers visuels
// ============================================================

function labelSatisfaction(v: string): string {
  return (
    SATISFACTION_OPTIONS.find((o) => o.value === v)?.label ?? v
  );
}

function npsBadgeColor(score: number): string {
  if (score >= 9) return "bg-emerald-100 text-emerald-800";
  if (score >= 7) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function satisfactionBadgeColor(v: SatisfactionValue): string {
  if (v === "very_satisfied") return "bg-emerald-50 text-emerald-700";
  if (v === "satisfied") return "bg-cyan-50 text-cyan-700";
  if (v === "medium") return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

// ============================================================
// Agrégats
// ============================================================

type Counter = Record<string, number>;
type Aggregates = {
  satisfaction: Counter;
  objectives_reached: Counter;
  expectations_met: Counter;
  usefulness: Counter;
  recommendation: Counter;
  content: Record<string, Counter>;
  trainer: Record<string, Counter>;
  organization: Record<string, Counter>;
};

function computeAggregates(rows: HotEvaluationData[]): Aggregates {
  const acc: Aggregates = {
    satisfaction: {},
    objectives_reached: {},
    expectations_met: {},
    usefulness: {},
    recommendation: {},
    content: {},
    trainer: {},
    organization: {},
  };
  const inc = (c: Counter, k: string | undefined) => {
    if (!k) return;
    c[k] = (c[k] ?? 0) + 1;
  };
  for (const r of rows) {
    inc(acc.satisfaction, r.satisfaction_overall);
    inc(acc.objectives_reached, r.objectives_reached);
    inc(acc.expectations_met, r.expectations_met);
    inc(acc.usefulness, r.usefulness);
    inc(acc.recommendation, r.recommendation);
    for (const crit of CONTENT_CRITERIA) {
      const v = r.content?.[crit.key];
      if (!v) continue;
      if (!acc.content[crit.key]) acc.content[crit.key] = {};
      inc(acc.content[crit.key], v);
    }
    for (const crit of TRAINER_CRITERIA) {
      const v = r.trainer?.[crit.key];
      if (!v) continue;
      if (!acc.trainer[crit.key]) acc.trainer[crit.key] = {};
      inc(acc.trainer[crit.key], v);
    }
    for (const crit of ORG_CRITERIA) {
      const v = r.organization?.[crit.key];
      if (!v) continue;
      if (!acc.organization[crit.key]) acc.organization[crit.key] = {};
      inc(acc.organization[crit.key], v);
    }
  }
  return acc;
}

// ============================================================
// Synthèse visuelle
// ============================================================

const SATISFACTION_COLORS: Record<string, string> = {
  very_satisfied: "bg-emerald-500",
  satisfied: "bg-cyan-500",
  medium: "bg-amber-500",
  unsatisfied: "bg-rose-500",
};

const OBJECTIVES_COLORS: Record<string, string> = {
  fully: "bg-emerald-500",
  mostly: "bg-cyan-500",
  partial: "bg-amber-500",
  no: "bg-rose-500",
};

const EXPECTATIONS_COLORS: Record<string, string> = {
  fully: "bg-emerald-500",
  partial: "bg-amber-500",
  insufficient: "bg-rose-500",
  no: "bg-rose-600",
};

const USEFULNESS_COLORS: Record<string, string> = {
  immediate: "bg-emerald-500",
  partial: "bg-cyan-500",
  later: "bg-amber-500",
  no: "bg-rose-500",
};

const RECOMMENDATION_COLORS: Record<string, string> = {
  yes_for_sure: "bg-emerald-500",
  probably_yes: "bg-cyan-500",
  probably_no: "bg-amber-500",
  no: "bg-rose-500",
};

const RATING_BAR_COLORS: Record<string, string> = {
  very_good: "bg-emerald-500",
  good: "bg-cyan-500",
  medium: "bg-amber-500",
  poor: "bg-rose-500",
  na: "bg-slate-400",
};

function SynthesisBlock({
  aggregates,
  npsBreakdown,
  total,
}: {
  aggregates: Aggregates;
  npsBreakdown: { nbDetractors: number; nbPassives: number; nbPromoters: number };
  total: number;
}) {
  return (
    <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-5">
      <header className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-pink-600" />
        <h2 className="text-lg font-bold text-zinc-900">
          Synthèse des évaluations
        </h2>
        <span className="text-xs text-zinc-500">
          ({total} réponse{total > 1 ? "s" : ""})
        </span>
      </header>

      {/* Légende */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
        <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-2">
          Légende des couleurs
        </div>
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1.5">
          <LegendItem color="bg-emerald-500" label="Très favorable" hint="Très satisfait / Totalement / Promoteur" />
          <LegendItem color="bg-cyan-500" label="Favorable" hint="Satisfait / En grande partie" />
          <LegendItem color="bg-amber-500" label="Moyen / Partiel" hint="Moyennement / À surveiller" />
          <LegendItem color="bg-rose-500" label="Défavorable" hint="Insatisfait / Non / Détracteur" />
          <LegendItem color="bg-slate-400" label="Non concerné" hint="Sans objet (présentiel/distanciel)" />
        </ul>
      </div>

      {/* Répartition NPS */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">
          Répartition NPS (recommandation 0-10)
        </h3>
        <div className="flex h-3 rounded overflow-hidden">
          {npsBreakdown.nbDetractors > 0 && (
            <div
              className="bg-rose-500"
              style={{ width: `${(npsBreakdown.nbDetractors / total) * 100}%` }}
              title={`Détracteurs (0-6) : ${npsBreakdown.nbDetractors}`}
            />
          )}
          {npsBreakdown.nbPassives > 0 && (
            <div
              className="bg-amber-500"
              style={{ width: `${(npsBreakdown.nbPassives / total) * 100}%` }}
              title={`Passifs (7-8) : ${npsBreakdown.nbPassives}`}
            />
          )}
          {npsBreakdown.nbPromoters > 0 && (
            <div
              className="bg-emerald-500"
              style={{ width: `${(npsBreakdown.nbPromoters / total) * 100}%` }}
              title={`Promoteurs (9-10) : ${npsBreakdown.nbPromoters}`}
            />
          )}
        </div>
        <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
          <span>🔴 Détracteurs : {npsBreakdown.nbDetractors}</span>
          <span>🟡 Passifs : {npsBreakdown.nbPassives}</span>
          <span>🟢 Promoteurs : {npsBreakdown.nbPromoters}</span>
        </div>
      </div>

      <BarChart
        title="Satisfaction générale"
        total={total}
        items={SATISFACTION_OPTIONS.map((o) => ({
          label: o.label,
          count: aggregates.satisfaction[o.value] ?? 0,
          color: SATISFACTION_COLORS[o.value] ?? "bg-slate-400",
        }))}
      />

      <BarChart
        title="Objectifs pédagogiques atteints"
        total={total}
        items={OBJECTIVES_OPTIONS.map((o) => ({
          label: o.label,
          count: aggregates.objectives_reached[o.value] ?? 0,
          color: OBJECTIVES_COLORS[o.value] ?? "bg-slate-400",
        }))}
      />

      <BarChart
        title="Attentes répondues"
        total={total}
        items={EXPECTATIONS_OPTIONS.map((o) => ({
          label: o.label,
          count: aggregates.expectations_met[o.value] ?? 0,
          color: EXPECTATIONS_COLORS[o.value] ?? "bg-slate-400",
        }))}
      />

      <BarChart
        title="Utilité professionnelle"
        total={total}
        items={USEFULNESS_OPTIONS.map((o) => ({
          label: o.label,
          count: aggregates.usefulness[o.value] ?? 0,
          color: USEFULNESS_COLORS[o.value] ?? "bg-slate-400",
        }))}
      />

      <BarChart
        title="Recommandation qualitative"
        total={total}
        items={RECOMMENDATION_OPTIONS.map((o) => ({
          label: o.label,
          count: aggregates.recommendation[o.value] ?? 0,
          color: RECOMMENDATION_COLORS[o.value] ?? "bg-slate-400",
        }))}
      />

      <CriteriaGrid
        title="Contenu de la formation"
        criteria={CONTENT_CRITERIA}
        agg={aggregates.content}
        options={RATING_OPTIONS}
      />

      <CriteriaGrid
        title="Animation du formateur"
        criteria={TRAINER_CRITERIA}
        agg={aggregates.trainer}
        options={RATING_OPTIONS}
      />

      <CriteriaGrid
        title="Organisation et moyens pédagogiques"
        criteria={ORGANIZATION_CRITERIA}
        agg={aggregates.organization}
        options={RATING_OPTIONS_WITH_NA}
      />
    </section>
  );
}

function LegendItem({
  color,
  label,
  hint,
}: {
  color: string;
  label: string;
  hint?: string;
}) {
  return (
    <li className="flex items-center gap-1.5" title={hint}>
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color} shrink-0`} />
      <span className="text-zinc-700 font-semibold">{label}</span>
      {hint && <span className="text-zinc-500 truncate">— {hint}</span>}
    </li>
  );
}

function BarChart({
  title,
  total,
  items,
}: {
  title: string;
  total: number;
  items: Array<{ label: string; count: number; color: string }>;
}) {
  return (
    <div>
      <h3 className="text-base font-bold text-zinc-900 mb-2 flex items-center gap-2">
        <span className="inline-block h-1.5 w-6 rounded-full bg-pink-500" />
        {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((it) => {
          const pct = total > 0 ? Math.round((it.count / total) * 100) : 0;
          return (
            <li key={it.label} className="text-xs">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-zinc-700">{it.label}</span>
                <span className="font-semibold text-zinc-600 tabular-nums">
                  {it.count} ({pct} %)
                </span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded overflow-hidden">
                <div
                  className={`h-full ${it.color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CriteriaGrid({
  title,
  criteria,
  agg,
  options,
}: {
  title: string;
  criteria: ReadonlyArray<{ key: string; label: string }>;
  agg: Record<string, Counter>;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div>
      <h3 className="text-base font-bold text-zinc-900 mb-2 flex items-center gap-2">
        <span className="inline-block h-1.5 w-6 rounded-full bg-pink-500" />
        {title}
      </h3>
      <div className="space-y-3">
        {criteria.map((c) => {
          const counts = agg[c.key] ?? {};
          const sum = Object.values(counts).reduce(
            (acc: number, v) => acc + (v ?? 0),
            0,
          );
          if (sum === 0) {
            return (
              <div key={c.key} className="text-xs text-zinc-400">
                {c.label} — aucune réponse
              </div>
            );
          }
          return (
            <div key={c.key} className="text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-zinc-700">{c.label}</span>
                <span className="text-[10px] text-zinc-500 tabular-nums">
                  {counts.very_good ?? 0} très bien · {counts.good ?? 0} bien ·{" "}
                  {counts.medium ?? 0} moyen · {counts.poor ?? 0} insuffisant
                  {counts.na ? ` · ${counts.na} N/A` : ""}
                </span>
              </div>
              <div className="flex h-2.5 rounded overflow-hidden">
                {options.map((o) => {
                  const c2 = counts[o.value] ?? 0;
                  if (c2 === 0) return null;
                  const color = RATING_BAR_COLORS[o.value] ?? "bg-slate-400";
                  return (
                    <div
                      key={o.value}
                      className={color}
                      style={{ width: `${(c2 / sum) * 100}%` }}
                      title={`${o.label} : ${c2}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

