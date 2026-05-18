import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmargementGrid } from "./_grid";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Émargement formateur — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string; sessionId: string };

/**
 * Page d'émargement côté formateur : pour chaque demi-journée de la
 * session, le formateur peut signer UNE fois et sa signature est
 * appliquée à TOUS les apprenants inscrits (cf. action
 * `signSlotForAllAsTrainer`).
 *
 * R9 : la signature DOIT être tracée en direct via SignaturePad,
 * jamais une image préenregistrée réutilisée.
 */
export default async function FormateurEmargementPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token, sessionId } = await params;
  const supabase = createAdminClient();

  // 1. Valider l'accès
  const { data: tokenRow } = await supabase
    .from("trainer_portal_tokens")
    .select(
      "trainer_id, trainer:trainers(first_name, last_name)",
    )
    .eq("token", token)
    .maybeSingle<{
      trainer_id: string;
      trainer: { first_name: string; last_name: string } | null;
    }>();

  if (!tokenRow || !tokenRow.trainer) {
    return <NotFound />;
  }

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, trainer_id, formation:formations(title), start_date, end_date",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      trainer_id: string | null;
      formation: { title: string } | null;
      start_date: string;
      end_date: string;
    }>();
  if (!session || session.trainer_id !== tokenRow.trainer_id) {
    return <NotFound />;
  }

  // 2. Jours
  const { data: days } = await supabase
    .from("session_days")
    .select(
      "day_date, morning_start, morning_end, afternoon_start, afternoon_end",
    )
    .eq("session_id", sessionId)
    .order("day_date", { ascending: true });

  const sessionDays = ((days ?? []) as Array<{
    day_date: string;
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
  }>);

  // 3. Apprenants (pour compter)
  const { data: enrolls } = await supabase
    .from("session_enrollments")
    .select("id")
    .eq("session_id", sessionId);
  const enrollmentCount = (enrolls ?? []).length;

  // 4. Signatures formateur déjà posées
  const enrollmentIds = ((enrolls ?? []) as Array<{ id: string }>).map(
    (e) => e.id,
  );
  const { data: signatures } =
    enrollmentIds.length > 0
      ? await supabase
          .from("attendance_signatures")
          .select("period_date, moment")
          .in("enrollment_id", enrollmentIds)
          .eq("signer_role", "trainer")
      : { data: [] };

  // Compte par slot (date|moment) -> nombre de signatures formateur
  const signedCountBySlot = new Map<string, number>();
  for (const s of (signatures ?? []) as Array<{
    period_date: string;
    moment: string;
  }>) {
    const key = `${s.period_date}|${s.moment}`;
    signedCountBySlot.set(key, (signedCountBySlot.get(key) ?? 0) + 1);
  }

  const trainerName = `${tokenRow.trainer.first_name} ${tokenRow.trainer.last_name}`;

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
            Émargement formateur
          </div>
          <h1 className="text-lg md:text-xl font-bold text-zinc-900">
            {session.formation?.title ?? "Session"}
          </h1>
          <p className="text-xs text-zinc-500">
            Votre signature s&apos;applique à tous les {enrollmentCount}{" "}
            apprenant{enrollmentCount > 1 ? "s" : ""} inscrit
            {enrollmentCount > 1 ? "s" : ""}.
          </p>
        </header>

        <EmargementGrid
          token={token}
          sessionId={sessionId}
          trainerName={trainerName}
          days={sessionDays}
          enrollmentCount={enrollmentCount}
          signedCountBySlot={Object.fromEntries(signedCountBySlot)}
        />

        <footer className="text-center text-[11px] text-zinc-400 mt-6">
          Vous signez une fois par demi-journée : la signature est
          appliquée à l&apos;ensemble des apprenants inscrits.
          <br />
          Les apprenants signent quant à eux leur propre présence
          depuis leur portail individuel.
        </footer>
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
          Lien invalide ou session inaccessible.
        </p>
      </div>
    </div>
  );
}
