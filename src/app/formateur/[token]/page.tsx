import type { Metadata } from "next";
import { Calendar, Hourglass } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SessionCard,
  type SessionRow,
  type SessionScheduleSnapshot,
} from "./_session-card";
import { PastSessionsSection } from "./_past-sessions-section";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace formateur — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

type Params = { token: string };

/**
 * Page d'accueil du portail formateur : agenda de SES sessions.
 *
 * - Sessions à venir : toujours visibles, mises en avant (accent
 *   cyan + badge de proximité Aujourd'hui/Demain/Dans X j).
 * - Sessions passées : cachées derrière une case à cocher, avec
 *   recherche par titre + filtre date (cf. PastSessionsSection).
 *   Cf. demande Gilles 2026-05-23.
 *
 * Les horaires (1er jour de session) sont affichés sous la date
 * pour donner un repère rapide ; la fiche détail montre le planning
 * complet par demi-journée.
 *
 * Auth : token URL persistant. Lecture admin client pour bypass RLS.
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

  // 2. Organisation
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

  const allSessions = ((sessions ?? []) as unknown as SessionRow[]);

  const sessionIds = allSessions.map((s) => s.id);

  // 4. Bulk : comptes participants + horaires du 1er jour de chaque session
  const counts = new Map<string, number>();
  const scheduleBySession = new Map<string, SessionScheduleSnapshot>();
  if (sessionIds.length > 0) {
    const [enrollsRes, daysRes] = await Promise.all([
      supabase
        .from("session_enrollments")
        .select("session_id")
        .in("session_id", sessionIds),
      supabase
        .from("session_days")
        .select(
          "session_id, day_date, morning_start, morning_end, afternoon_start, afternoon_end",
        )
        .in("session_id", sessionIds)
        .order("day_date", { ascending: true }),
    ]);

    for (const row of (enrollsRes.data ?? []) as Array<{ session_id: string }>) {
      counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
    }

    // Ne garder QUE le 1er jour de chaque session (ordre asc déjà appliqué)
    for (const row of (daysRes.data ?? []) as Array<{
      session_id: string;
      day_date: string;
      morning_start: string | null;
      morning_end: string | null;
      afternoon_start: string | null;
      afternoon_end: string | null;
    }>) {
      if (!scheduleBySession.has(row.session_id)) {
        scheduleBySession.set(row.session_id, {
          morning_start: row.morning_start,
          morning_end: row.morning_end,
          afternoon_start: row.afternoon_start,
          afternoon_end: row.afternoon_end,
        });
      }
    }
  }

  // 5. Tri : future vs passée (par end_date)
  // Pour les passées, on ne garde que les sessions au statut "confirmée"
  // (Gilles 2026-05-23) — les sessions "planifiées", "en cours", "brouillon",
  // "annulées", etc. n'ont pas vocation à apparaître dans l'historique
  // formateur car elles n'ont pas eu lieu comme prévu.
  const now = new Date();
  const future: SessionRow[] = [];
  const pastAll: SessionRow[] = [];
  for (const s of allSessions) {
    const end = new Date(s.end_date);
    end.setHours(23, 59, 59, 999);
    if (end.getTime() < now.getTime()) pastAll.push(s);
    else future.push(s);
  }
  pastAll.reverse(); // plus récentes en haut
  const past = pastAll.filter((s) => s.status === "confirmed");
  const pastHiddenCount = pastAll.length - past.length;

  // Données passées formatées pour le composant client
  const pastData = past.map((s) => ({
    session: s,
    participantCount: counts.get(s.id) ?? 0,
    schedule: scheduleBySession.get(s.id) ?? null,
  }));

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
          <p className="text-xs text-zinc-500">{org?.name ?? ""}</p>
        </header>

        {/* Section À venir — mise en avant */}
        <section className="rounded-2xl bg-gradient-to-br from-cyan-50/60 to-white border-2 border-cyan-200 p-3 md:p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-cyan-600 text-white flex items-center justify-center shadow-sm">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-base md:text-lg font-bold text-cyan-900 leading-tight">
                Sessions à venir
              </h2>
              <p className="text-[11px] text-cyan-700/80">
                {future.length === 0
                  ? "Aucune session planifiée pour le moment"
                  : `${future.length} session${future.length > 1 ? "s" : ""} à animer`}
              </p>
            </div>
          </div>

          {future.length === 0 ? (
            <div className="rounded-xl bg-white border border-cyan-100 p-6 text-center">
              <Calendar className="h-10 w-10 text-cyan-200 mx-auto mb-2" />
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
                  schedule={scheduleBySession.get(s.id) ?? null}
                  prominence="high"
                />
              ))}
            </div>
          )}
        </section>

        {/* Section Passées : derrière case à cocher + recherche
            (uniquement statut "confirmée", cf. règle métier Gilles 2026-05-23) */}
        {(past.length > 0 || pastHiddenCount > 0) && (
          <PastSessionsSection
            token={token}
            sessions={pastData}
            hiddenCount={pastHiddenCount}
          />
        )}

        <footer className="text-center text-[11px] text-zinc-400 mt-8">
          Conservez ce lien : il vous donne accès en permanence à vos
          sessions, leurs participants, leurs supports et leurs signatures.
        </footer>
      </div>
    </div>
  );
}

function NotFoundCard({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md bg-white rounded-xl shadow-md border border-zinc-200 p-6 text-center space-y-3">
        <Hourglass className="h-12 w-12 text-zinc-400 mx-auto" />
        <h1 className="text-lg font-bold">Espace indisponible</h1>
        <p className="text-sm text-zinc-600">{reason}</p>
      </div>
    </div>
  );
}
