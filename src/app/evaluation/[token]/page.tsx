import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { EvaluationPublicForm } from "./_form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Évaluation à chaud — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string };

/**
 * Page PUBLIQUE d'évaluation à chaud par QR code session.
 * Pattern jumeau de /emarger/[token] : le formateur projette le QR
 * en fin de séance, l'apprenant scanne, choisit son nom, remplit
 * le questionnaire.
 *
 * Sécurité : la possession du token vaut authentification — on
 * utilise un client admin (service role) côté serveur pour lire
 * les données nécessaires (bypass RLS), et l'action de soumission
 * revérifiera token + identité.
 */
export default async function EvaluationPublicPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ eid?: string }>;
}) {
  const { token } = await params;
  const { eid: initialEnrollmentId } = await searchParams;
  const supabase = createAdminClient();

  // 1. Vérifier le token
  const { data: tokenRow } = await supabase
    .from("session_evaluation_tokens")
    .select("session_id, expires_at")
    .eq("token", token)
    .maybeSingle<{ session_id: string; expires_at: string }>();

  if (!tokenRow) {
    return <ExpiredCard reason="Lien invalide ou inconnu." />;
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return (
      <ExpiredCard reason="Ce lien d'évaluation a expiré. Demandez un nouveau lien à votre formateur." />
    );
  }

  // 2. Session + formation + organisme + formateur
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, modality, location, formation:formations(title), organization:organizations(name, logo_url), trainer:trainers!trainer_id(first_name, last_name), trainer_name",
    )
    .eq("id", tokenRow.session_id)
    .maybeSingle<{
      id: string;
      start_date: string;
      end_date: string;
      modality: string | null;
      location: string | null;
      formation: { title: string } | null;
      organization: { name: string; logo_url: string | null } | null;
      trainer: { first_name: string; last_name: string } | null;
      trainer_name: string | null;
    }>();
  if (!session) {
    return <ExpiredCard reason="Session introuvable." />;
  }

  // 3. Inscriptions + réponses déjà remplies
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(id, civility, first_name, last_name, company:companies(name))",
    )
    .eq("session_id", session.id);

  const enrollmentIds = ((enrollments ?? []) as Array<{ id: string }>).map(
    (e) => e.id,
  );

  const { data: existingResponses } =
    enrollmentIds.length > 0
      ? await supabase
          .from("evaluation_responses")
          .select("enrollment_id, submitted_at")
          .in("enrollment_id", enrollmentIds)
          .eq("evaluation_type", "hot")
      : { data: [] };

  const learners = ((enrollments ?? []) as unknown as Array<{
    id: string;
    learner: {
      id: string;
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
      company: { name: string } | null;
    } | null;
  }>)
    .filter((e) => e.learner)
    .map((e) => ({
      enrollmentId: e.id,
      learnerId: e.learner!.id,
      civility: e.learner!.civility,
      firstName: e.learner!.first_name,
      lastName: e.learner!.last_name,
      fullName: [e.learner!.first_name, e.learner!.last_name]
        .filter(Boolean)
        .join(" "),
      companyName: e.learner!.company?.name ?? null,
    }))
    .sort((a, b) =>
      (a.lastName ?? "").localeCompare(b.lastName ?? "", "fr"),
    );

  const formationTitle = session.formation?.title ?? "Session";
  const orgName = session.organization?.name ?? "";
  const orgLogo = session.organization?.logo_url ?? null;
  const trainerName =
    session.trainer_name ??
    (session.trainer
      ? `${session.trainer.first_name} ${session.trainer.last_name}`
      : "—");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto p-4 md:p-8">
        <header className="mb-6 text-center">
          {orgLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt={orgName}
              className="h-14 mx-auto mb-3 object-contain"
            />
          )}
          <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1">
            Évaluation à chaud
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            {formationTitle}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Organisé par {orgName}
          </p>
        </header>

        <EvaluationPublicForm
          token={token}
          initialEnrollmentId={initialEnrollmentId ?? null}
          sessionId={session.id}
          sessionContext={{
            formationTitle,
            orgName,
            startDate: session.start_date,
            endDate: session.end_date,
            modality: session.modality,
            location: session.location,
            trainerName,
          }}
          learners={learners}
          alreadySubmittedEnrollmentIds={(existingResponses ?? []).map(
            (r) => (r as { enrollment_id: string }).enrollment_id,
          )}
        />

        <footer className="mt-8 text-center text-[11px] text-zinc-400">
          Vos réponses restent confidentielles côté organisme de formation.
          Jamais transmises à votre employeur sans votre accord.
          <br />
          Lien valable jusqu&apos;au{" "}
          {new Date(tokenRow.expires_at).toLocaleDateString("fr-FR")}
        </footer>
      </div>
    </div>
  );
}

function ExpiredCard({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <div className="text-4xl">⏰</div>
        <h1 className="text-lg font-bold">
          Lien d&apos;évaluation indisponible
        </h1>
        <p className="text-sm text-zinc-600">{reason}</p>
      </div>
    </div>
  );
}
