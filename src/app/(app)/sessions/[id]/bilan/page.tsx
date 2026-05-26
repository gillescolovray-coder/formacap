import { notFound, redirect } from "next/navigation";
import { MessageSquareText, PenSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { SessionTabs } from "../_session-tabs";
import { SessionHeaderMeta } from "../_session-header-meta";
import {
  isReportEmpty,
  labelObjectives,
  type TrainerReport,
} from "@/lib/trainer-report/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Consultation cote admin du bilan formateur (Module 7).
 *
 * Le formateur remplit son bilan depuis son portail
 * /formateur/[token]/sessions/[sessionId]. Cette page rend le contenu
 * lisible pour l'admin OF : sections Qualiopi 11/22/32, signature
 * electronique, horodatage.
 *
 * Gilles 2026-05-25 : besoin de consulter le retour formateur depuis
 * l'interface utilisateur.
 */
export default async function SessionBilanPage({
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
      "id, start_date, end_date, formation:formations(title), trainer:trainers!trainer_id(first_name, last_name, email)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      start_date: string;
      end_date: string;
      formation: { title: string } | null;
      trainer: {
        first_name: string;
        last_name: string;
        email: string | null;
      } | null;
    }>();
  if (!session) notFound();

  const { data: bilanRow } = await supabase
    .from("session_trainer_reports")
    .select(
      "report, signer_name, signature_data, signed_at, updated_at, trainer:trainers!trainer_id(first_name, last_name, email)",
    )
    .eq("session_id", id)
    .maybeSingle<{
      report: TrainerReport;
      signer_name: string | null;
      signature_data: string | null;
      signed_at: string | null;
      updated_at: string;
      trainer: {
        first_name: string;
        last_name: string;
        email: string | null;
      } | null;
    }>();

  const report: TrainerReport = bilanRow?.report ?? {};
  const empty = !bilanRow || isReportEmpty(report);
  const trainerJoined = bilanRow?.trainer ?? session.trainer;
  const trainerName = trainerJoined
    ? `${trainerJoined.first_name} ${trainerJoined.last_name}`
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader
        title="Bilan formateur"
        description={session.formation?.title ?? "Session"}
        actions={<BackButton fallbackHref={`/sessions/${id}`} />}
      />
      <SessionHeaderMeta sessionId={id} />
      <SessionTabs sessionId={id} />

      <div className="px-8 py-6 max-w-4xl mx-auto w-full space-y-5">
        {empty ? (
          <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 text-center space-y-3">
            <PenSquare className="h-10 w-10 text-zinc-400 mx-auto" />
            <h2 className="text-lg font-bold text-zinc-700">
              Bilan non encore rempli
            </h2>
            <p className="text-sm text-zinc-600 max-w-md mx-auto">
              {trainerName
                ? `${trainerName} n'a pas encore complété son bilan de fin de session depuis son portail formateur.`
                : "Aucun formateur n'est encore rattaché à cette session — le bilan ne peut donc pas être rempli."}
            </p>
            <p className="text-xs text-zinc-500 italic">
              Le bilan formateur est une exigence Qualiopi (indicateurs 11
              / 22 / 32) — relancez le formateur si la session est terminée.
            </p>
          </div>
        ) : (
          <>
            {/* En-tete metadata signature */}
            <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 p-4 flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-indigo-700 font-bold">
                  Rempli par
                </div>
                <div className="font-semibold text-zinc-900">
                  {bilanRow?.signer_name ?? trainerName ?? "Formateur"}
                </div>
                {trainerJoined?.email && (
                  <div className="text-xs text-zinc-600">
                    {trainerJoined.email}
                  </div>
                )}
              </div>
              <div className="space-y-1 text-right">
                <div className="text-[10px] uppercase tracking-widest text-indigo-700 font-bold">
                  Dernière mise à jour
                </div>
                <div className="text-sm text-zinc-900 tabular-nums">
                  {new Date(
                    bilanRow!.signed_at ?? bilanRow!.updated_at,
                  ).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </div>
                {bilanRow?.signed_at ? (
                  <div className="text-[11px] text-emerald-700 font-semibold inline-flex items-center gap-1">
                    ✓ Signé électroniquement
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-700 italic">
                    ⚠ Brouillon non signé
                  </div>
                )}
              </div>
            </div>

            {/* Section 1 — Atteinte des objectifs (Qualiopi 11) */}
            <Section
              title="Atteinte des objectifs pédagogiques"
              qualiopi="Qualiopi RNQ — indicateur 11"
            >
              <Field label="Objectifs atteints">
                {report.objectives_reached ? (
                  <Pill
                    color={
                      report.objectives_reached === "full"
                        ? "emerald"
                        : report.objectives_reached === "partial"
                          ? "amber"
                          : "rose"
                    }
                  >
                    {labelObjectives(report.objectives_reached)}
                  </Pill>
                ) : (
                  <Empty />
                )}
              </Field>
              <Field label="Commentaire">
                <Multiline value={report.objectives_comment} />
              </Field>
            </Section>

            {/* Section 2 — Niveau du groupe */}
            <Section title="Niveau et homogénéité du groupe">
              <Multiline value={report.group_level} />
            </Section>

            {/* Section 3 — Adaptations */}
            <Section title="Adaptations effectuées">
              <Multiline value={report.adaptations_made} />
            </Section>

            {/* Section 4 — Engagement / dynamique (Qualiopi 22) */}
            <Section
              title="Engagement & dynamique du groupe"
              qualiopi="Qualiopi RNQ — indicateur 22"
            >
              <Multiline value={report.engagement_dynamics} />
            </Section>

            {/* Section 5 — Difficultés */}
            <Section title="Difficultés rencontrées">
              <Multiline value={report.difficulties} />
            </Section>

            {/* Section 6 — Pistes d'amelioration (Qualiopi 32) */}
            <Section
              title="Pistes d'amélioration pour la prochaine session"
              qualiopi="Qualiopi RNQ — indicateur 32"
            >
              <Multiline value={report.improvements} />
            </Section>

            {/* Section 7 — Recommandations apprenants */}
            <Section title="Recommandations individuelles par apprenant">
              <Multiline value={report.learner_recommendations} />
            </Section>

            {/* Signature electronique */}
            {bilanRow?.signature_data && (
              <Section title="Signature électronique du formateur">
                <div className="rounded-lg bg-white border border-zinc-300 p-3 inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bilanRow.signature_data}
                    alt={`Signature de ${bilanRow.signer_name ?? trainerName ?? "formateur"}`}
                    className="max-h-32 max-w-full object-contain"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-2 italic">
                  Signé par {bilanRow.signer_name ?? trainerName} le{" "}
                  {new Date(bilanRow.signed_at!).toLocaleString("fr-FR", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                  .
                </p>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  qualiopi,
  children,
}: {
  title: string;
  qualiopi?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white border border-zinc-200 shadow-sm p-5 space-y-3">
      <div className="flex items-start gap-3">
        <MessageSquareText className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h2 className="font-bold text-zinc-900 text-sm">{title}</h2>
          {qualiopi && (
            <p className="text-[10px] uppercase tracking-wider text-indigo-700 font-semibold mt-0.5">
              {qualiopi}
            </p>
          )}
        </div>
      </div>
      <div className="pl-8">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
        {label}
      </div>
      {children}
    </div>
  );
}

function Multiline({ value }: { value?: string | null }) {
  const txt = value?.trim();
  if (!txt) return <Empty />;
  return (
    <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
      {txt}
    </p>
  );
}

function Empty() {
  return <p className="text-sm text-zinc-400 italic">Non renseigné</p>;
}

function Pill({
  color,
  children,
}: {
  color: "emerald" | "amber" | "rose";
  children: React.ReactNode;
}) {
  const cls =
    color === "emerald"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : color === "amber"
        ? "bg-amber-100 text-amber-800 border-amber-300"
        : "bg-rose-100 text-rose-800 border-rose-300";
  return (
    <span
      className={
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border " +
        cls
      }
    >
      {children}
    </span>
  );
}
