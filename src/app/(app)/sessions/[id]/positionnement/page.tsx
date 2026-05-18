import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Eye,
  Target,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import {
  ADEQUACY_OPTIONS,
  EXPECTATION_CHOICES,
  LEVEL_OPTIONS,
  MASTERY_CRITERIA,
  PRACTICE_OPTIONS,
  labelLevel,
  type LevelValue,
  type PositioningLearnerData,
} from "@/lib/positioning/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionPositionnementListPage({
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
    .maybeSingle<{
      id: string;
      formation: { title: string } | null;
    }>();
  if (!session) notFound();

  // Inscriptions
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

  const { data: positionings } =
    enrollmentIds.length > 0
      ? await supabase
          .from("positioning_responses")
          .select("enrollment_id, data, learner_submitted_at")
          .in("enrollment_id", enrollmentIds)
      : { data: [] };

  const byEnrollment = new Map<
    string,
    {
      submittedAt: string;
      currentLevel?: string;
      hasAdaptationNeed?: boolean;
      adequacy?: string;
    }
  >();
  // Aussi : collecter toutes les data complètes pour agrégats
  const allData: PositioningLearnerData[] = [];
  for (const row of (positionings ?? []) as Array<{
    enrollment_id: string;
    data: PositioningLearnerData;
    learner_submitted_at: string;
  }>) {
    byEnrollment.set(row.enrollment_id, {
      submittedAt: row.learner_submitted_at,
      currentLevel: row.data.current_level,
      hasAdaptationNeed: row.data.has_adaptation_need,
      adequacy: row.data.adequacy,
    });
    allData.push(row.data);
  }

  // Agrégats pour le graphique de synthèse
  const aggregates = computeAggregates(allData);

  const total = participants.length;
  const completed = byEnrollment.size;
  const adaptationCount = Array.from(byEnrollment.values()).filter(
    (v) => v.hasAdaptationNeed,
  ).length;

  const title = session.formation?.title ?? "Session";

  return (
    <>
      <PageHeader
        title="Tests de positionnement"
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
          { label: "Positionnement" },
        ]}
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />

      <SessionTabs sessionId={id} counts={{ participants: total }} />

      <div className="p-8 max-w-5xl space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Tests remplis"
            value={`${completed} / ${total}`}
            color="amber"
            icon={<Target className="h-4 w-4" />}
          />
          <Stat
            label="Adaptations signalées"
            value={String(adaptationCount)}
            color="orange"
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <Stat
            label="En attente"
            value={String(total - completed)}
            color="slate"
            icon={<Eye className="h-4 w-4" />}
          />
        </div>

        {/* Liste */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {participants.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              Aucun apprenant inscrit pour le moment.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Apprenant</th>
                  <th className="px-4 py-3">Entreprise</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Niveau déclaré</th>
                  <th className="px-4 py-3">Alerte</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {participants.map((p) => {
                  const pos = byEnrollment.get(p.enrollmentId);
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
                        {pos ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Rempli le{" "}
                            {new Date(pos.submittedAt).toLocaleDateString(
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
                        {pos?.currentLevel ? (
                          <span className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full">
                            {labelLevel(pos.currentLevel as LevelValue)}
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {pos?.hasAdaptationNeed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="h-3 w-3" />
                            Adaptation
                          </span>
                        ) : (
                          <span className="text-zinc-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pos ? (
                          <Link
                            href={`/sessions/${id}/positionnement/${p.enrollmentId}`}
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
          )}
        </div>

        {/* Synthèse visuelle de la cohorte (barres horizontales) */}
        <SynthesisBlock aggregates={aggregates} />
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
  color: "amber" | "orange" | "slate";
  icon: React.ReactNode;
}) {
  const colors: Record<typeof color, { bg: string; text: string }> = {
    amber: { bg: "bg-amber-50", text: "text-amber-700" },
    orange: { bg: "bg-orange-50", text: "text-orange-700" },
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
// Agrégats + Synthèse visuelle
// ============================================================

type Counter = Record<string, number>;
type Aggregates = {
  total: number;
  levels: Counter;
  practice: Counter;
  adequacy: Counter;
  expectations: Counter;
  // Pour chaque critère d'auto-éval, compte "none" / "partial" / "ok"
  mastery: Record<string, Counter>;
};

function computeAggregates(rows: PositioningLearnerData[]): Aggregates {
  const acc: Aggregates = {
    total: rows.length,
    levels: {},
    practice: {},
    adequacy: {},
    expectations: {},
    mastery: {},
  };
  const inc = (c: Counter, k: string | undefined) => {
    if (!k) return;
    c[k] = (c[k] ?? 0) + 1;
  };
  for (const r of rows) {
    inc(acc.levels, r.current_level);
    inc(acc.practice, r.practice_frequency);
    inc(acc.adequacy, r.adequacy);
    for (const exp of r.expectations ?? []) inc(acc.expectations, exp);
    for (const crit of MASTERY_CRITERIA) {
      const v = r.mastery?.[crit.key];
      if (!v) continue;
      if (!acc.mastery[crit.key]) acc.mastery[crit.key] = {};
      inc(acc.mastery[crit.key], v);
    }
  }
  return acc;
}

const LEVEL_COLORS: Record<string, string> = {
  debutant: "bg-rose-500",
  intermediaire: "bg-amber-500",
  confirme: "bg-cyan-500",
  expert: "bg-emerald-500",
};
const PRACTICE_COLORS: Record<string, string> = {
  regularly: "bg-emerald-500",
  occasionally: "bg-cyan-500",
  rarely: "bg-amber-500",
  never: "bg-rose-500",
};
const ADEQUACY_COLORS: Record<string, string> = {
  fully: "bg-emerald-500",
  partial: "bg-amber-500",
  no: "bg-rose-500",
  to_check: "bg-slate-400",
};
const MASTERY_COLORS: Record<string, string> = {
  ok: "bg-emerald-500",
  partial: "bg-amber-500",
  none: "bg-rose-500",
};

function SynthesisBlock({ aggregates }: { aggregates: Aggregates }) {
  if (aggregates.total === 0) return null;

  // Top 3 attentes
  const topExpectations = Object.entries(aggregates.expectations)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-5">
      <header className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-bold text-zinc-900">
          Synthèse de la cohorte
        </h2>
        <span className="text-xs text-zinc-500">
          ({aggregates.total} test{aggregates.total > 1 ? "s" : ""} rempli
          {aggregates.total > 1 ? "s" : ""})
        </span>
      </header>

      {/* Légende des couleurs */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
        <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-2">
          Légende
        </div>
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1.5">
          <LegendItem color="bg-emerald-500" label="Favorable" hint="Niveau élevé / Maîtrisé / Avis positif" />
          <LegendItem color="bg-cyan-500" label="Bon" hint="Niveau confirmé / Pratique occasionnelle" />
          <LegendItem color="bg-amber-500" label="Moyen / Partiel" hint="Intermédiaire / À surveiller" />
          <LegendItem color="bg-rose-500" label="À travailler" hint="Débutant / Non maîtrisé / Avis négatif" />
          <LegendItem color="bg-indigo-500" label="Fréquence" hint="Utilisé pour les attentes des apprenants" />
          <LegendItem color="bg-slate-400" label="Neutre / À vérifier" hint="Réponse en attente de clarification" />
        </ul>
      </div>

      {/* Niveau initial */}
      <BarChart
        title="Niveau initial déclaré"
        total={aggregates.total}
        items={LEVEL_OPTIONS.map((o) => ({
          label: o.label,
          count: aggregates.levels[o.value] ?? 0,
          color: LEVEL_COLORS[o.value] ?? "bg-slate-400",
        }))}
      />

      {/* Pratique professionnelle */}
      <BarChart
        title="Pratique professionnelle préalable"
        total={aggregates.total}
        items={PRACTICE_OPTIONS.map((o) => ({
          label: o.label,
          count: aggregates.practice[o.value] ?? 0,
          color: PRACTICE_COLORS[o.value] ?? "bg-slate-400",
        }))}
      />

      {/* Adéquation perçue */}
      <BarChart
        title="Adéquation perçue de la formation"
        total={aggregates.total}
        items={ADEQUACY_OPTIONS.map((o) => ({
          label: o.label,
          count: aggregates.adequacy[o.value] ?? 0,
          color: ADEQUACY_COLORS[o.value] ?? "bg-slate-400",
        }))}
      />

      {/* Top attentes */}
      <div>
        <h3 className="text-base font-bold text-zinc-900 mb-2 flex items-center gap-2">
          <span className="inline-block h-1.5 w-6 rounded-full bg-indigo-500" />
          Top attentes des apprenants
        </h3>
        {topExpectations.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">
            Aucune attente exprimée.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {topExpectations.map(([key, count]) => {
              const label =
                EXPECTATION_CHOICES.find((e) => e.value === key)?.label ?? key;
              const pct = Math.round((count / aggregates.total) * 100);
              return (
                <li key={key} className="text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-zinc-700">{label}</span>
                    <span className="font-semibold text-zinc-600 tabular-nums">
                      {count} ({pct} %)
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-indigo-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Auto-évaluation par critère */}
      <div>
        <h3 className="text-base font-bold text-zinc-900 mb-2 flex items-center gap-2 flex-wrap">
          <span className="inline-block h-1.5 w-6 rounded-full bg-emerald-500" />
          Auto-évaluation par critère
          <span className="text-xs font-normal text-zinc-500">
            (vert = maîtrisé, orange = partiel, rouge = à travailler)
          </span>
        </h3>
        <div className="space-y-3">
          {MASTERY_CRITERIA.map((c) => {
            const counts = aggregates.mastery[c.key] ?? {};
            const ok = counts.ok ?? 0;
            const partial = counts.partial ?? 0;
            const none = counts.none ?? 0;
            const sum = ok + partial + none;
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
                    {ok}/{sum} maîtrisé
                  </span>
                </div>
                <div className="flex h-2.5 rounded overflow-hidden">
                  {ok > 0 && (
                    <div
                      className={MASTERY_COLORS.ok}
                      style={{ width: `${(ok / sum) * 100}%` }}
                      title={`Maîtrisé : ${ok}`}
                    />
                  )}
                  {partial > 0 && (
                    <div
                      className={MASTERY_COLORS.partial}
                      style={{ width: `${(partial / sum) * 100}%` }}
                      title={`Partiel : ${partial}`}
                    />
                  )}
                  {none > 0 && (
                    <div
                      className={MASTERY_COLORS.none}
                      style={{ width: `${(none / sum) * 100}%` }}
                      title={`Non maîtrisé : ${none}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
      {hint && (
        <span className="text-zinc-500 truncate">— {hint}</span>
      )}
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
        <span className="inline-block h-1.5 w-6 rounded-full bg-amber-500" />
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
