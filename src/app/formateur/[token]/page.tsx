import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  Users,
  Video,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace formateur — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string };

/**
 * Page d'accueil du portail formateur : agenda de SES sessions
 * (sessions où trainer_id = formateur du token). Distinction
 * visuelle entre statuts (draft / planned / confirmed / in_progress
 * / completed / postponed / cancelled). Clic sur une session →
 * fiche détail avec les 6 modules (participants, positionnement,
 * convocations, émargement, éval, supports).
 *
 * Auth : token URL persistant (pas de compte Supabase Auth).
 * Lecture admin client pour bypass RLS.
 */
export default async function FormateurAgendaPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  // 1. Token → trainer
  const { data: tokenRow } = await supabase
    .from("trainer_portal_tokens")
    .select(
      "trainer_id, trainer:trainers(id, first_name, last_name, email, organization_id)",
    )
    .eq("token", token)
    .maybeSingle<{
      trainer_id: string;
      trainer: {
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        organization_id: string;
      } | null;
    }>();

  if (!tokenRow || !tokenRow.trainer) {
    return <NotFoundCard reason="Lien invalide ou inconnu." />;
  }

  const trainer = tokenRow.trainer;
  const trainerName = `${trainer.first_name} ${trainer.last_name}`;

  // 2. Organisation (pour logo + nom)
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url")
    .eq("id", trainer.organization_id)
    .maybeSingle<{ name: string; logo_url: string | null }>();

  // 3. Sessions où ce formateur est trainer_id
  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      "id, status, start_date, end_date, modality, location, formation:formations(title), location_ref:formation_locations!location_id(name, city)",
    )
    .eq("trainer_id", trainer.id)
    .order("start_date", { ascending: true });

  const allSessions = ((sessions ?? []) as unknown as Array<{
    id: string;
    status: string | null;
    start_date: string;
    end_date: string;
    modality: string | null;
    location: string | null;
    formation: { title: string } | null;
    location_ref: { name: string; city: string | null } | null;
  }>);

  // 4. Comptes participants par session
  const sessionIds = allSessions.map((s) => s.id);
  const counts = new Map<string, number>();
  if (sessionIds.length > 0) {
    const { data: enrolls } = await supabase
      .from("session_enrollments")
      .select("session_id")
      .in("session_id", sessionIds);
    for (const row of (enrolls ?? []) as Array<{ session_id: string }>) {
      counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
    }
  }

  // 5. Tri : confirmées + en cours en haut, puis brouillon/planifiées, puis passées
  const now = new Date();
  const future: typeof allSessions = [];
  const past: typeof allSessions = [];
  for (const s of allSessions) {
    const end = new Date(s.end_date);
    end.setHours(23, 59, 59, 999);
    if (end.getTime() < now.getTime()) past.push(s);
    else future.push(s);
  }
  // Plus proches en haut pour future, plus récentes en haut pour past
  past.reverse();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-4">
        {/* Header */}
        <header className="text-center space-y-2 mb-2">
          {org?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logo_url}
              alt={org.name}
              className="h-14 mx-auto mb-3 object-contain"
            />
          )}
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
            Espace formateur
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            {trainerName}
          </h1>
          <p className="text-xs text-zinc-500">
            {org?.name ?? ""}
          </p>
        </header>

        {/* Section À venir */}
        <section>
          <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider mb-2 px-1">
            📅 Sessions à venir ({future.length})
          </h2>
          {future.length === 0 ? (
            <div className="rounded-xl bg-white shadow-sm border border-zinc-200 p-6 text-center">
              <Calendar className="h-10 w-10 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm text-zinc-600">
                Aucune session à venir pour le moment.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {future.map((s) => (
                <SessionCard
                  key={s.id}
                  token={token}
                  session={s}
                  participantCount={counts.get(s.id) ?? 0}
                />
              ))}
            </div>
          )}
        </section>

        {/* Section Passées */}
        {past.length > 0 && (
          <section className="pt-2">
            <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider mb-2 px-1">
              ⌛ Sessions passées ({past.length})
            </h2>
            <div className="space-y-2">
              {past.map((s) => (
                <SessionCard
                  key={s.id}
                  token={token}
                  session={s}
                  participantCount={counts.get(s.id) ?? 0}
                  faded
                />
              ))}
            </div>
          </section>
        )}

        <footer className="text-center text-[11px] text-zinc-400 mt-8">
          Conservez ce lien : il vous donne accès en permanence à vos
          sessions, leurs participants, leurs supports et leurs signatures.
        </footer>
      </div>
    </div>
  );
}

// ============================================================
// Sous-composants
// ============================================================

type SessionRow = {
  id: string;
  status: string | null;
  start_date: string;
  end_date: string;
  modality: string | null;
  location: string | null;
  formation: { title: string } | null;
  location_ref: { name: string; city: string | null } | null;
};

const STATUS_STYLES: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  draft: {
    label: "Brouillon",
    bg: "bg-zinc-100",
    text: "text-zinc-600",
    border: "border-zinc-200",
  },
  planned: {
    label: "Planifiée",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  confirmed: {
    label: "Confirmée",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  in_progress: {
    label: "En cours",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
  },
  completed: {
    label: "Terminée",
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
  },
  postponed: {
    label: "Reportée",
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
  },
  cancelled: {
    label: "Annulée",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
  archived: {
    label: "Archivée",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
  },
};

function SessionCard({
  token,
  session,
  participantCount,
  faded,
}: {
  token: string;
  session: SessionRow;
  participantCount: number;
  faded?: boolean;
}) {
  const statusStyle =
    STATUS_STYLES[session.status ?? "draft"] ?? STATUS_STYLES.draft;
  const dateLabel = formatDateRange(session.start_date, session.end_date);
  const ModalityIcon = session.modality === "distanciel" ? Video : MapPin;
  let locationLabel = "—";
  if (session.modality === "distanciel") {
    locationLabel = "Distanciel";
  } else if (session.location_ref) {
    locationLabel = session.location_ref.city
      ? `${session.location_ref.name} (${session.location_ref.city})`
      : session.location_ref.name;
  } else if (session.location) {
    locationLabel = session.location;
  }

  return (
    <Link
      href={`/formateur/${token}/sessions/${session.id}`}
      className={
        faded
          ? "block rounded-xl bg-white shadow-sm border border-zinc-200 p-4 hover:bg-zinc-50 opacity-70"
          : "block rounded-xl bg-white shadow-sm border border-zinc-200 p-4 hover:bg-zinc-50 transition-colors"
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[10px] font-bold ${statusStyle.text} ${statusStyle.bg} ${statusStyle.border} border px-2 py-0.5 rounded-full uppercase tracking-wider`}
            >
              {statusStyle.label}
            </span>
            {session.status === "confirmed" && (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            )}
          </div>
          <h3 className="font-bold text-zinc-900 truncate">
            {session.formation?.title ?? "Session"}
          </h3>
          <div className="mt-1 space-y-0.5 text-xs text-zinc-600">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-zinc-400" />
              <span>{dateLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ModalityIcon className="h-3 w-3 text-zinc-400" />
              <span>{locationLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-zinc-400" />
              <span>
                {participantCount} participant{participantCount > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-zinc-400 shrink-0 mt-1" />
      </div>
    </Link>
  );
}

function formatDateRange(start: string, end: string): string {
  if (start === end) {
    return new Date(start).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  return `${new Date(start).toLocaleDateString("fr-FR")} → ${new Date(end).toLocaleDateString("fr-FR")}`;
}

function NotFoundCard({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <Calendar className="h-12 w-12 text-zinc-400 mx-auto" />
        <h1 className="text-lg font-bold">Espace indisponible</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
      </div>
    </div>
  );
}
