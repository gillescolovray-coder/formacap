import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { SessionTabs } from "../../_session-tabs";
import { SessionHeaderMeta } from "../../_session-header-meta";
import { PositioningResponseView } from "@/lib/positioning/response-view";
import { TrainerObservationForm } from "@/lib/positioning/_trainer-observation-form";
import type {
  PositioningLearnerData,
  PositioningTrainerObservation,
} from "@/lib/positioning/types";
import { saveTrainerObservationObject } from "../actions";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PositionnementDetailAdminPage({
  params,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
}) {
  const { id, enrollmentId } = await params;
  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(enrollmentId)) notFound();

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

  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, session_id, learner:learners(civility, first_name, last_name, company:companies(name), job_title)",
    )
    .eq("id", enrollmentId)
    .maybeSingle<{
      id: string;
      session_id: string;
      learner: {
        civility: string | null;
        first_name: string | null;
        last_name: string | null;
        company: { name: string } | null;
        job_title: string | null;
      } | null;
    }>();
  if (!enrollment || enrollment.session_id !== id) notFound();

  const { data: response } = await supabase
    .from("positioning_responses")
    .select(
      "data, learner_signature, learner_submitted_at, trainer_observation, trainer_filled_at",
    )
    .eq("enrollment_id", enrollmentId)
    .maybeSingle<{
      data: PositioningLearnerData;
      learner_signature: string | null;
      learner_submitted_at: string;
      trainer_observation: PositioningTrainerObservation | null;
      trainer_filled_at: string | null;
    }>();

  const learnerName = [
    enrollment.learner?.first_name,
    enrollment.learner?.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const title = session.formation?.title ?? "Session";

  return (
    <>
      <PageHeader
        title={`Test de positionnement — ${learnerName}`}
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
          { label: "Positionnement", href: `/sessions/${id}/positionnement` },
          { label: learnerName },
        ]}
        actions={<BackButton fallbackHref={`/sessions/${id}/positionnement`} />}
      />

      <SessionTabs sessionId={id} />

      <div className="p-8 max-w-3xl space-y-4">
        <Link
          href={`/sessions/${id}/positionnement`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour à la liste
        </Link>

        {/* Carte identification */}
        <div className="rounded-xl bg-white border border-zinc-200 p-4">
          <h2 className="font-bold text-base text-zinc-900 mb-2">
            {enrollment.learner?.civility ? `${enrollment.learner.civility} ` : ""}
            {learnerName}
          </h2>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            {enrollment.learner?.company?.name && (
              <>
                <dt className="text-zinc-500">Entreprise</dt>
                <dd className="text-zinc-800">
                  {enrollment.learner.company.name}
                </dd>
              </>
            )}
            {enrollment.learner?.job_title && (
              <>
                <dt className="text-zinc-500">Fonction</dt>
                <dd className="text-zinc-800">
                  {enrollment.learner.job_title}
                </dd>
              </>
            )}
            <dt className="text-zinc-500">Formation</dt>
            <dd className="text-zinc-800">{title}</dd>
          </dl>
        </div>

        {response ? (
          <PositioningResponseView
            data={response.data}
            learnerSignatureDataUrl={response.learner_signature}
            submittedAt={response.learner_submitted_at}
            trainerObservation={response.trainer_observation}
            trainerFilledAt={response.trainer_filled_at}
          />
        ) : (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
            <p className="text-sm text-amber-900 font-medium">
              ⏳ Test non encore rempli par cet apprenant.
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Il pourra le compléter depuis son portail (QR sur sa
              convocation). Vous pouvez tout de même renseigner votre
              observation pédagogique ci-dessous.
            </p>
          </div>
        )}

        {/* Formulaire Section 7 — Observation formateur (Sprint D).
            Toujours visible côté admin (même si test apprenant pas
            encore rempli). */}
        <TrainerObservationForm
          initial={response?.trainer_observation ?? null}
          initialFilledAt={response?.trainer_filled_at ?? null}
          action={async (observation) => {
            "use server";
            return saveTrainerObservationObject(
              id,
              enrollmentId,
              observation,
            );
          }}
        />
      </div>
    </>
  );
}
