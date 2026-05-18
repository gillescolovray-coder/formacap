import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmargementPublicForm } from "./_form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Émargement — Signature en ligne",
  robots: "noindex, nofollow",
};

type Params = { token: string };

/**
 * Page PUBLIQUE d'émargement par QR code session.
 * Le formateur affiche le QR code, l'apprenant scanne, choisit son
 * nom dans la liste de la session, puis signe matin + après-midi.
 *
 * Sécurité : la possession du token vaut authentification — on
 * utilise un client admin (service role) côté serveur pour lire les
 * données nécessaires (bypass RLS), puis on valide le token avant
 * tout affichage.
 */
export default async function EmargementPublicPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ eid?: string }>;
}) {
  const { token } = await params;
  const { eid: initialEnrollmentId } = await searchParams;
  const supabase = createAdminClient();

  // 1. Vérifier que le token existe et n'est pas expiré
  const { data: tokenRow } = await supabase
    .from("session_emargement_tokens")
    .select("session_id, expires_at")
    .eq("token", token)
    .maybeSingle<{ session_id: string; expires_at: string }>();

  if (!tokenRow) {
    return <ExpiredCard reason="Lien invalide ou inconnu." />;
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return (
      <ExpiredCard reason="Ce lien d'émargement a expiré. Demande un nouveau lien à ton formateur." />
    );
  }

  // 2. Charger la session + formation + organisme + jours
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, modality, location, formation:formations(title), organization:organizations(name, logo_url)",
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
    }>();
  if (!session) {
    return <ExpiredCard reason="Session introuvable." />;
  }

  // 3. Liste des apprenants inscrits + signatures déjà effectuées
  const [{ data: enrollments }, { data: days }, { data: signatures }] =
    await Promise.all([
      supabase
        .from("session_enrollments")
        .select(
          "id, learner:learners(id, civility, first_name, last_name)",
        )
        .eq("session_id", session.id),
      supabase
        .from("session_days")
        .select(
          "day_date, morning_start, morning_end, afternoon_start, afternoon_end",
        )
        .eq("session_id", session.id)
        .order("day_date", { ascending: true }),
      supabase
        .from("attendance_signatures")
        .select(
          "enrollment_id, period_date, moment, signer_role, signer_name, signed_at",
        )
        .in(
          "enrollment_id",
          // sous-requête : tous les enrollments de cette session
          ((
            (await supabase
              .from("session_enrollments")
              .select("id")
              .eq("session_id", session.id)).data ?? []
          ) as Array<{ id: string }>).map((e) => e.id),
        )
        .eq("signer_role", "learner"),
    ]);

  const learners = ((enrollments ?? []) as unknown as Array<{
    id: string;
    learner: {
      id: string;
      civility: string | null;
      first_name: string | null;
      last_name: string | null;
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
    }))
    .sort((a, b) =>
      (a.lastName ?? "").localeCompare(b.lastName ?? "", "fr"),
    );

  const formationTitle = session.formation?.title ?? "Session";
  const orgName = session.organization?.name ?? "";
  const orgLogo = session.organization?.logo_url ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto p-4 md:p-8">
        {/* Header : organisme + formation */}
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
            Émargement en ligne
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            {formationTitle}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Organisé par {orgName}
          </p>
        </header>

        {/* Form interactif */}
        <EmargementPublicForm
          token={token}
          sessionId={session.id}
          initialEnrollmentId={initialEnrollmentId ?? null}
          learners={learners}
          days={(days ?? []) as Array<{
            day_date: string;
            morning_start: string | null;
            morning_end: string | null;
            afternoon_start: string | null;
            afternoon_end: string | null;
          }>}
          existingSignatures={(signatures ?? []) as Array<{
            enrollment_id: string;
            period_date: string;
            moment: "morning" | "afternoon";
            signer_role: "learner" | "trainer";
            signer_name: string;
            signed_at: string;
          }>}
        />

        <footer className="mt-8 text-center text-[11px] text-zinc-400">
          Émargement électronique conforme Qualiopi · Lien valable jusqu&apos;au{" "}
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
        <h1 className="text-lg font-bold">Lien d&apos;émargement indisponible</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
      </div>
    </div>
  );
}
