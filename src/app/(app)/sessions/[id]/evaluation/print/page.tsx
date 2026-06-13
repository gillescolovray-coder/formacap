import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MODALITY_LABELS } from "@/lib/formations/types";
import {
  CONTENT_CRITERIA,
  EXPECTATIONS_OPTIONS,
  OBJECTIVES_OPTIONS,
  ORGANIZATION_CRITERIA,
  RATING_OPTIONS_WITH_NA,
  RECOMMENDATION_OPTIONS,
  SATISFACTION_OPTIONS,
  TRAINER_CRITERIA,
  USEFULNESS_OPTIONS,
  computeNps,
  type HotEvaluationData,
} from "@/lib/evaluations/hot";
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

type Counter = Record<string, number>;
function inc(c: Counter, k: string | undefined | null) {
  if (!k) return;
  c[k] = (c[k] ?? 0) + 1;
}
/** "Très satisfait (3) · Satisfait (1)" à partir d'un compteur + options. */
function distLabel(
  counter: Counter,
  options: readonly { value: string; label: string }[],
): string {
  const parts = options
    .filter((o) => (counter[o.value] ?? 0) > 0)
    .map((o) => `${o.label} (${counter[o.value]})`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default async function EvaluationProofPrintPage({
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
      "id, start_date, end_date, modality, is_inter, trainer_name, formation:formations(title, duration_hours), prescriber:companies!prescriber_company_id(name), location_obj:formation_locations!location_id(name, city), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();

  const sAny = session as Record<string, unknown>;
  const formation = pickOne<{ title: string; duration_hours: number | null }>(
    sAny.formation,
  );
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
    .select("name, logo_url")
    .limit(1)
    .maybeSingle<{ name: string | null; logo_url: string | null }>();

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(civility, first_name, last_name, company_name_temp, company:companies(name)), inscription_request:inscription_requests(company_name_freetext, company:companies!inscription_requests_company_id_fkey(name))",
    )
    .eq("session_id", id);

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
    const companyName =
      pickOne<{ name: string }>(req?.company)?.name ??
      pickOne<{ name: string }>(learner?.company)?.name ??
      learner?.company_name_temp ??
      req?.company_name_freetext ??
      null;
    return {
      enrollmentId: e.id,
      fullName:
        [learner?.civility, learner?.first_name, learner?.last_name]
          .filter(Boolean)
          .join(" ") || "—",
      companyName,
    };
  });

  const enrollmentIds = participants.map((p) => p.enrollmentId);
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
    { data: HotEvaluationData; nps: number | null; submittedAt: string | null }
  >();
  const allData: HotEvaluationData[] = [];
  for (const r of (rows ?? []) as Array<{
    enrollment_id: string;
    data: HotEvaluationData;
    nps_score: number | null;
    submitted_at: string | null;
  }>) {
    byEnrollment.set(r.enrollment_id, {
      data: r.data,
      nps: r.nps_score,
      submittedAt: r.submitted_at,
    });
    if (r.data) allData.push(r.data);
  }

  const total = participants.length;
  const completed = byEnrollment.size;
  const npsScores = Array.from(byEnrollment.values())
    .map((v) => v.nps)
    .filter((s): s is number => s !== null && s !== undefined);
  const npsValue = computeNps(npsScores);
  const npsAvg =
    npsScores.length > 0
      ? Math.round((npsScores.reduce((a, b) => a + b, 0) / npsScores.length) * 10) /
        10
      : null;

  // Agrégats des questions à choix unique.
  const satisfaction: Counter = {};
  const objectives: Counter = {};
  const expectations: Counter = {};
  const usefulness: Counter = {};
  const recommendation: Counter = {};
  const content: Record<string, Counter> = {};
  const trainer: Record<string, Counter> = {};
  const organization: Record<string, Counter> = {};
  for (const d of allData) {
    inc(satisfaction, d.satisfaction_overall);
    inc(objectives, d.objectives_reached);
    inc(expectations, d.expectations_met);
    inc(usefulness, d.usefulness);
    inc(recommendation, d.recommendation);
    for (const c of CONTENT_CRITERIA) {
      const v = d.content?.[c.key];
      if (!v) continue;
      (content[c.key] ??= {});
      inc(content[c.key], v);
    }
    for (const c of TRAINER_CRITERIA) {
      const v = d.trainer?.[c.key];
      if (!v) continue;
      (trainer[c.key] ??= {});
      inc(trainer[c.key], v);
    }
    for (const c of ORGANIZATION_CRITERIA) {
      const v = d.organization?.[c.key];
      if (!v) continue;
      (organization[c.key] ??= {});
      inc(organization[c.key], v);
    }
  }

  const editedAt = new Date().toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
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

  const Row = ({ label, value }: { label: string; value: string }) => (
    <tr>
      <td className="border border-zinc-300 px-2 py-1.5 font-medium w-[42%] align-top">
        {label}
      </td>
      <td className="border border-zinc-300 px-2 py-1.5">{value}</td>
    </tr>
  );

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
          href={`/sessions/${id}/evaluation`}
          className="text-sm text-cyan-700 hover:underline"
        >
          ← Retour à l&apos;évaluation
        </Link>
        <PrintButton documentTitle={`Preuve Qualiopi - Evaluation - ${title}`} />
      </div>

      {/* En-tête + logo */}
      <header className="border-b-2 border-zinc-800 pb-3 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-500">
              {org?.name ?? "Organisme de formation"} — Preuve Qualiopi
            </p>
            <h1 className="text-xl font-black mt-1">
              Évaluation de satisfaction à chaud
            </h1>
          </div>
          {org?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logo_url}
              alt={org?.name ?? "Logo"}
              className="h-14 w-auto object-contain shrink-0"
            />
          )}
        </div>
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
        </p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-lg border border-zinc-300 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            Évaluations remplies
          </div>
          <div className="text-2xl font-black tabular-nums">
            {completed} / {total}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-300 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            NPS
          </div>
          <div className="text-2xl font-black tabular-nums">
            {npsValue !== null ? `${npsValue >= 0 ? "+" : ""}${npsValue}` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-300 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            Note moyenne /10
          </div>
          <div className="text-2xl font-black tabular-nums">
            {npsAvg !== null ? npsAvg : "—"}
          </div>
        </div>
      </section>

      {/* Synthèse par question */}
      {completed > 0 ? (
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 mb-2">
            Synthèse ({completed} réponse{completed > 1 ? "s" : ""})
          </h2>
          <table className="w-full text-xs border border-zinc-300 border-collapse">
            <tbody>
              <Row
                label="Satisfaction globale"
                value={distLabel(satisfaction, SATISFACTION_OPTIONS)}
              />
              <Row
                label="Objectifs atteints"
                value={distLabel(objectives, OBJECTIVES_OPTIONS)}
              />
              <Row
                label="Attentes satisfaites"
                value={distLabel(expectations, EXPECTATIONS_OPTIONS)}
              />
              <Row
                label="Utilité professionnelle"
                value={distLabel(usefulness, USEFULNESS_OPTIONS)}
              />
              <Row
                label="Recommandation"
                value={distLabel(recommendation, RECOMMENDATION_OPTIONS)}
              />
              {CONTENT_CRITERIA.map((c) => (
                <Row
                  key={`c-${c.key}`}
                  label={`Contenu — ${c.label}`}
                  value={distLabel(content[c.key] ?? {}, RATING_OPTIONS_WITH_NA)}
                />
              ))}
              {TRAINER_CRITERIA.map((c) => (
                <Row
                  key={`t-${c.key}`}
                  label={`Formateur — ${c.label}`}
                  value={distLabel(trainer[c.key] ?? {}, RATING_OPTIONS_WITH_NA)}
                />
              ))}
              {ORGANIZATION_CRITERIA.map((c) => (
                <Row
                  key={`o-${c.key}`}
                  label={`Organisation — ${c.label}`}
                  value={distLabel(
                    organization[c.key] ?? {},
                    RATING_OPTIONS_WITH_NA,
                  )}
                />
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <p className="text-sm text-zinc-500 mb-5">
          Aucune évaluation remplie pour le moment.
        </p>
      )}

      {/* Détail par apprenant */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 mb-2">
          Détail par apprenant
        </h2>
        <table className="w-full text-sm border border-zinc-300 border-collapse">
          <thead>
            <tr className="bg-zinc-100 text-left">
              <th className="border border-zinc-300 px-2 py-1.5">Apprenant</th>
              <th className="border border-zinc-300 px-2 py-1.5">Entreprise</th>
              <th className="border border-zinc-300 px-2 py-1.5">Statut</th>
              <th className="border border-zinc-300 px-2 py-1.5 text-center">
                Note /10
              </th>
            </tr>
          </thead>
          <tbody>
            {participants.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="border border-zinc-300 px-2 py-3 text-center text-zinc-500"
                >
                  Aucun apprenant inscrit.
                </td>
              </tr>
            ) : (
              participants.map((p) => {
                const ev = byEnrollment.get(p.enrollmentId);
                return (
                  <tr key={p.enrollmentId}>
                    <td className="border border-zinc-300 px-2 py-1.5 font-medium">
                      {p.fullName}
                    </td>
                    <td className="border border-zinc-300 px-2 py-1.5">
                      {p.companyName ?? "—"}
                    </td>
                    <td className="border border-zinc-300 px-2 py-1.5">
                      {ev
                        ? `Remplie${
                            ev.submittedAt
                              ? ` le ${new Date(ev.submittedAt).toLocaleDateString("fr-FR")}`
                              : ""
                          }`
                        : "En attente"}
                    </td>
                    <td className="border border-zinc-300 px-2 py-1.5 text-center tabular-nums">
                      {ev?.nps !== null && ev?.nps !== undefined
                        ? `${ev.nps}/10`
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <footer className="mt-8 pt-3 border-t border-zinc-300 text-[10px] text-zinc-500">
        Document édité le {editedAt} — {org?.name ?? "Organisme de formation"}.
        Pièce justificative Qualiopi (recueil de la satisfaction des
        bénéficiaires).
      </footer>
    </main>
  );
}
