import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { trainerHasAccessToSession } from "@/lib/portal/trainer-session-access";
import { PositioningResponseView } from "@/lib/positioning/response-view";
import { TrainerObservationForm } from "@/lib/positioning/_trainer-observation-form";
import type {
  PositioningLearnerData,
  PositioningTrainerObservation,
} from "@/lib/positioning/types";
import { saveTrainerObservationFromPortal } from "../../actions";

export const dynamic = "force-dynamic";

export default async function FormateurPositionnementDetailPage({
  params,
}: {
  params: Promise<{
    token: string;
    sessionId: string;
    enrollmentId: string;
  }>;
}) {
  const { token, sessionId, enrollmentId } = await params;
  const supabase = createAdminClient();

  // 1. Valider l'accès formateur
  const { data: tokenRow } = await supabase
    .from("trainer_portal_tokens")
    .select("trainer_id")
    .eq("token", token)
    .maybeSingle<{ trainer_id: string }>();
  if (!tokenRow) return <NotFound />;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, trainer_id, formation:formations(title)")
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      trainer_id: string | null;
      formation: { title: string } | null;
    }>();
  if (!session) return <NotFound />;
  const access = await trainerHasAccessToSession(
    supabase,
    tokenRow.trainer_id,
    sessionId,
    session.trainer_id,
  );
  if (!access) return <NotFound />;

  // 2. Enrollment + apprenant
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
  if (!enrollment || enrollment.session_id !== sessionId) {
    return <NotFound />;
  }

  // 3. Réponse positionnement
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-4">
        <Link
          href={`/formateur/${token}/sessions/${sessionId}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour à la session
        </Link>

        <header className="text-center space-y-1">
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
            Test de positionnement
          </div>
          <h1 className="text-lg font-bold text-zinc-900">
            {enrollment.learner?.civility
              ? `${enrollment.learner.civility} `
              : ""}
            {learnerName}
          </h1>
          {enrollment.learner?.company?.name && (
            <p className="text-xs text-zinc-500">
              {enrollment.learner.company.name}
              {enrollment.learner.job_title &&
                ` · ${enrollment.learner.job_title}`}
            </p>
          )}
          <p className="text-xs text-zinc-400">
            {session.formation?.title ?? "Session"}
          </p>
        </header>

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
              Vous pouvez tout de même renseigner votre observation
              pédagogique ci-dessous.
            </p>
          </div>
        )}

        {/* Section 7 — Observation formateur (Sprint D) */}
        <TrainerObservationForm
          initial={response?.trainer_observation ?? null}
          initialFilledAt={response?.trainer_filled_at ?? null}
          action={async (observation) => {
            "use server";
            return saveTrainerObservationFromPortal(
              token,
              sessionId,
              enrollmentId,
              observation,
            );
          }}
        />
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">Accès refusé</h1>
        <p className="text-sm text-zinc-600">
          Lien invalide ou apprenant introuvable.
        </p>
      </div>
    </div>
  );
}
