import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SignerForm } from "./_form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signature de feuille d'émargement",
  robots: "noindex, nofollow",
};

type Params = { token: string };

type LinkRow = {
  id: string;
  enrollment_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  enrollment: {
    id: string;
    session_id: string;
    learner: {
      first_name: string | null;
      last_name: string | null;
      civility: string | null;
    } | null;
    session: {
      id: string;
      organization_id: string;
      start_date: string;
      end_date: string;
      formation: { title: string } | null;
      trainer_name: string | null;
    } | null;
  } | null;
};

export default async function SignerPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // Vérification du token
  const { data: link } = await supabase
    .from("signature_links")
    .select(
      `
      id, enrollment_id, token, expires_at, used_at,
      enrollment:session_enrollments(
        id, session_id,
        learner:learners(first_name, last_name, civility),
        session:sessions(id, organization_id, start_date, end_date, formation:formations(title), trainer_name)
      )
      `,
    )
    .eq("token", token)
    .maybeSingle<LinkRow>();

  if (!link) {
    return <ExpiredCard reason="Lien invalide ou inconnu." />;
  }
  if (new Date(link.expires_at) < new Date()) {
    return (
      <ExpiredCard reason="Ce lien de signature a expiré (30 jours après son émission)." />
    );
  }

  const enrollment = link.enrollment;
  const session = enrollment?.session;
  if (!enrollment || !session) {
    return <ExpiredCard reason="L'inscription liée à ce token n'existe plus." />;
  }

  // Charger les jours de session + signatures déjà existantes
  const [{ data: days }, { data: signatures }, { data: org }] = await Promise.all([
    supabase
      .from("session_days")
      .select("day_date, morning_start, morning_end, afternoon_start, afternoon_end")
      .eq("session_id", session.id)
      .order("day_date", { ascending: true }),
    supabase
      .from("attendance_signatures")
      .select("period_date, moment, signed_at")
      .eq("enrollment_id", enrollment.id)
      .eq("signer_role", "learner"),
    supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", session.organization_id)
      .maybeSingle<{ name: string; logo_url: string | null }>(),
  ]);

  const learnerName = [enrollment.learner?.first_name, enrollment.learner?.last_name]
    .filter(Boolean)
    .join(" ");

  // Construire la liste des demi-journées passées (signables) avec leur état
  type Slot = {
    period_date: string;
    moment: "morning" | "afternoon";
    label: string;
    isPast: boolean;
    isFuture: boolean;
    signedAt: string | null;
  };

  const now = new Date();
  const slots: Slot[] = [];
  for (const d of days ?? []) {
    const date = (d as { day_date: string }).day_date;
    const dateLabel = new Date(date).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    for (const moment of ["morning", "afternoon"] as const) {
      const startKey =
        moment === "morning" ? "morning_end" : "afternoon_end";
      const slotEnd = new Date(`${date}T${(d as Record<string, string>)[startKey] ?? "23:59"}:00`);
      const sig = (signatures ?? []).find(
        (s) => s.period_date === date && s.moment === moment,
      );
      slots.push({
        period_date: date,
        moment,
        label: `${dateLabel} — ${moment === "morning" ? "Matin" : "Après-midi"}`,
        isPast: slotEnd <= now,
        isFuture: slotEnd > now,
        signedAt: sig
          ? (sig as { signed_at: string }).signed_at
          : null,
      });
    }
  }

  return (
    <main
      className="min-h-screen flex items-start justify-center px-4 py-8 sm:py-16"
      style={{
        background: "linear-gradient(135deg, #f8fafc, #e0f2fe)",
      }}
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
        {/* Header organisation */}
        <header className="flex items-center gap-3 pb-4 border-b border-zinc-200">
          {org?.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={org.logo_url}
              alt={org.name}
              className="h-12 max-w-[120px] object-contain"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center">
              {(org?.name ?? "?").charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-blue-700 font-bold">
              {org?.name ?? "Formation"}
            </div>
            <h1 className="text-lg sm:text-xl font-black text-zinc-900 leading-tight">
              Signature d&apos;émargement
            </h1>
          </div>
        </header>

        {/* Récap session */}
        <section className="space-y-1 text-sm">
          <div className="text-zinc-600 text-xs uppercase tracking-wider font-semibold">
            À l&apos;attention de
          </div>
          <div className="text-base font-semibold">
            {enrollment.learner?.civility ?? ""} {learnerName || "—"}
          </div>
          <div className="text-zinc-600 mt-3 text-xs uppercase tracking-wider font-semibold">
            Formation
          </div>
          <div className="font-medium">
            {session.formation?.title ?? "Formation"}
          </div>
          <div className="text-zinc-500">
            du{" "}
            {new Date(session.start_date).toLocaleDateString("fr-FR")}
            {" "}au{" "}
            {new Date(session.end_date).toLocaleDateString("fr-FR")}
          </div>
          {session.trainer_name && (
            <div className="text-zinc-500">Formateur : {session.trainer_name}</div>
          )}
        </section>

        {/* Formulaire de signature */}
        <SignerForm
          token={token}
          enrollmentId={enrollment.id}
          learnerName={learnerName}
          slots={slots}
        />

        <footer className="text-[11px] text-zinc-400 text-center pt-4 border-t border-zinc-200">
          Lien valable 30 jours · Signature horodatée et tracée pour audit.
        </footer>
      </div>
    </main>
  );
}

function ExpiredCard({ reason }: { reason: string }) {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: "linear-gradient(135deg, #f8fafc, #fee2e2)" }}
    >
      <div className="max-w-md bg-white rounded-2xl shadow-xl p-8 text-center space-y-3">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-xl font-bold">Lien indisponible</h1>
        <p className="text-zinc-600 text-sm">{reason}</p>
        <p className="text-zinc-500 text-xs">
          Contactez votre organisme de formation pour obtenir un nouveau lien.
        </p>
      </div>
    </main>
  );
}
