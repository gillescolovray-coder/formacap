import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPositioningTemplateForSession } from "@/lib/positioning/templates";
import { PositioningForm } from "./_form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Test de positionnement — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string };

export default async function PositionnementPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 1. Token → enrollment + contexte
  const { data: portalRow } = await supabase
    .from("enrollment_portal_tokens")
    .select(
      "enrollment_id, enrollment:session_enrollments(id, session:sessions(id, start_date, end_date, modality, formation:formations(title), organization:organizations(name, logo_url)), learner:learners(civility, first_name, last_name, job_title, company:companies(name)))",
    )
    .eq("token", token)
    .maybeSingle<{
      enrollment_id: string;
      enrollment: {
        id: string;
        session: {
          id: string;
          start_date: string;
          end_date: string;
          modality: string | null;
          formation: { title: string } | null;
          organization: { name: string; logo_url: string | null } | null;
        } | null;
        learner: {
          civility: string | null;
          first_name: string | null;
          last_name: string | null;
          job_title: string | null;
          company: { name: string } | null;
        } | null;
      } | null;
    }>();

  if (!portalRow || !portalRow.enrollment || !portalRow.enrollment.session) {
    return <NotFoundCard />;
  }

  const enrollment = portalRow.enrollment;
  const session = enrollment.session!;
  const learner = enrollment.learner;
  const org = session.organization;

  // 2. Vérifier si déjà rempli
  const { data: existing } = await supabase
    .from("positioning_responses")
    .select("learner_submitted_at")
    .eq("enrollment_id", enrollment.id)
    .maybeSingle<{ learner_submitted_at: string }>();

  // 3. Template positionnement effectif (session > formation > default org)
  const template = await loadPositioningTemplateForSession(
    supabase,
    session.id,
  );

  const fullName = [learner?.first_name, learner?.last_name]
    .filter(Boolean)
    .join(" ");
  const orgName = org?.name ?? "";
  const orgLogo = org?.logo_url ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-4">
        <Link
          href={`/mon-parcours/${token}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour à mon espace
        </Link>

        <header className="text-center space-y-2 mb-2">
          {orgLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt={orgName}
              className="h-12 mx-auto mb-2 object-contain"
            />
          )}
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
            Test de positionnement
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            {session.formation?.title ?? "Formation"}
          </h1>
        </header>

        {existing ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-6 text-center space-y-3">
            <div className="text-4xl">✅</div>
            <h2 className="text-lg font-bold text-zinc-900">
              Test déjà complété
            </h2>
            <p className="text-sm text-zinc-600">
              Vous avez rempli votre test de positionnement le{" "}
              {new Date(existing.learner_submitted_at).toLocaleDateString(
                "fr-FR",
              )}
              . Merci !
            </p>
            <p className="text-xs text-zinc-500">
              En cas d&apos;erreur, contactez votre formateur.
            </p>
          </div>
        ) : (
          <PositioningForm
            portalToken={token}
            expectationChoices={template.expectation_choices}
            masteryCriteria={template.mastery_criteria}
            context={{
              orgName,
              formationTitle: session.formation?.title ?? "—",
              startDate: session.start_date,
              endDate: session.end_date,
              modality: session.modality,
              learnerName: fullName,
              civility: learner?.civility ?? null,
              companyName: learner?.company?.name ?? null,
              jobTitle: learner?.job_title ?? null,
            }}
          />
        )}

        <footer className="text-center text-[11px] text-zinc-400 mt-8">
          Vos réponses restent confidentielles côté organisme de formation.
        </footer>
      </div>
    </div>
  );
}

function NotFoundCard() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">Test indisponible</h1>
        <p className="text-sm text-zinc-600">
          Lien invalide ou apprenant introuvable.
        </p>
      </div>
    </div>
  );
}
