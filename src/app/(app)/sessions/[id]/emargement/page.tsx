import Link from "next/link";
import {
  Calendar,
  Clock,
  Info,
  MapPin,
  PenLine,
  Printer,
  Video,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { AttendanceGrid, type PeriodDay } from "./_grid";
import { RemoteSignSection } from "./_remote-sign-section";
import { SignaturesDashboard } from "./_signatures-dashboard";
import { SessionTabs } from "../_session-tabs";
import { isResendConfigured } from "@/lib/email/resend";
import { healEnrollmentsForSession } from "@/lib/inscriptions/sync";
import type { SessionDay, TrainingSession } from "@/lib/sessions/types";
import type {
  AttendanceMoment,
  AttendanceStatus,
} from "@/lib/attendances/types";
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_STYLES,
} from "@/lib/attendances/types";
import { MODALITY_LABELS } from "@/lib/formations/types";

function enumerateDates(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

const MOMENTS: AttendanceMoment[] = ["morning", "afternoon"];

type EnrollmentRow = {
  id: string;
  learner: {
    first_name: string | null;
    last_name: string | null;
    email?: string | null;
    company?: { name: string } | null;
  } | null;
};

type AttendanceRow = {
  enrollment_id: string;
  period_date: string;
  moment: AttendanceMoment;
  status: AttendanceStatus;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EmargementPage({
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

  const { data: session, error } = await supabase
    .from("sessions")
    .select(
      "*, formation:formations(id, title), location_ref:formation_locations!location_id(id, name, city)",
    )
    .eq("id", id)
    .maybeSingle<
      TrainingSession & {
        location_ref?: { id: string; name: string; city: string | null } | null;
      }
    >();

  if (error) throw error;
  if (!session) notFound();

  // Self-healing : remplace l'ancienne auto-conversion ad hoc par
  // l'appel centralisé à healEnrollmentsForSession (Gilles 2026-05-22).
  // L'ancienne version créait des enrollments orphelins (sans
  // inscription_request_id) ce qui cassait la sync bidirectionnelle.
  try {
    await healEnrollmentsForSession(supabase, id);
  } catch (e) {
    console.warn(
      "[emargement/page] healEnrollmentsForSession failed",
      (e as Error).message,
    );
  }

  const [
    { data: enrollments },
    { data: sessionDays },
  ] = await Promise.all([
    supabase
      .from("session_enrollments")
      .select(
        "id, learner:learners(first_name, last_name, email, company:companies(name))",
      )
      .eq("session_id", id)
      .order("enrolled_at", { ascending: true }),
    supabase
      .from("session_days")
      .select("*")
      .eq("session_id", id)
      .order("day_date", { ascending: true }),
  ]);

  const enrollmentIds = (enrollments ?? []).map((e) => e.id as string);

  const [attendances, signaturesData] = await Promise.all([
    enrollmentIds.length > 0
      ? supabase
          .from("attendances")
          .select("enrollment_id, period_date, moment, status")
          .in("enrollment_id", enrollmentIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    enrollmentIds.length > 0
      ? supabase
          .from("attendance_signatures")
          .select("enrollment_id, period_date, moment, signer_role")
          .in("enrollment_id", enrollmentIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  // Index des signatures pour le dashboard. Pour le formateur, l'ancrage
  // peut être fait sur n'importe quel enrollment_id, mais on n'a besoin
  // que de l'existence (date, moment).
  const signaturesIndex = new Map<string, true>();
  (signaturesData ?? []).forEach((s) => {
    const row = s as {
      enrollment_id: string;
      period_date: string;
      moment: "morning" | "afternoon";
      signer_role: "learner" | "trainer";
    };
    if (row.signer_role === "trainer") {
      signaturesIndex.set(`__trainer__|${row.period_date}|${row.moment}`, true);
    } else {
      signaturesIndex.set(
        `${row.enrollment_id}|${row.period_date}|${row.moment}|learner`,
        true,
      );
    }
  });

  // Construire la liste des périodes : on utilise UNIQUEMENT les
  // session_days réellement planifiés (table session_days). Cela évite
  // d'afficher de fausses cases pour les jours du calendrier qui ne
  // sont pas des jours de formation (sessions à dates non consécutives).
  // Fallback : si aucune session_day n'existe (anciennes sessions
  // créées avant l'introduction du planning détaillé), on retombe sur
  // l'énumération classique start_date → end_date.
  const sortedDays = (sessionDays ?? []).slice().sort((a, b) =>
    ((a as SessionDay).day_date ?? "").localeCompare(
      (b as SessionDay).day_date ?? "",
    ),
  );
  let periods: PeriodDay[];
  if (sortedDays.length > 0) {
    periods = sortedDays.map((d) => {
      const day = d as SessionDay;
      return {
        date: day.day_date,
        morning_start: day.morning_start,
        morning_end: day.morning_end,
        afternoon_start: day.afternoon_start,
        afternoon_end: day.afternoon_end,
      };
    });
  } else {
    const dateList = enumerateDates(session.start_date, session.end_date);
    periods = dateList.map((date) => ({
      date,
      morning_start: null,
      morning_end: null,
      afternoon_start: null,
      afternoon_end: null,
    }));
  }
  // Index : enrollment_id → "date:moment" → status
  const attendanceIndex = new Map<string, Map<string, AttendanceStatus>>();
  (attendances ?? []).forEach((a: AttendanceRow) => {
    if (!attendanceIndex.has(a.enrollment_id)) {
      attendanceIndex.set(a.enrollment_id, new Map());
    }
    const key = `${a.period_date}:${a.moment}`;
    attendanceIndex.get(a.enrollment_id)!.set(key, a.status);
  });

  const rows = (enrollments ?? []).map((e) => {
    const enrollment = e as unknown as EnrollmentRow;
    const l = enrollment.learner;
    const name = l
      ? [l.first_name, l.last_name].filter(Boolean).join(" ")
      : "Apprenant inconnu";
    const company = l?.company?.name ?? null;
    const keyMap = attendanceIndex.get(enrollment.id) ?? new Map();
    const attendancesByKey: Record<string, AttendanceStatus> = {};
    periods.forEach((p) => {
      MOMENTS.forEach((m) => {
        const key = `${p.date}:${m}`;
        attendancesByKey[key] = keyMap.get(key) ?? "not_recorded";
      });
    });
    return {
      enrollmentId: enrollment.id,
      learnerName: name,
      email: l?.email ?? null,
      company,
      attendancesByKey,
    };
  });

  // Liste pour le bloc "signature à distance"
  const learnersForRemoteSign = rows.map((r) => ({
    enrollmentId: r.enrollmentId,
    name: r.learnerName,
    email: r.email,
  }));
  const resendOn = isResendConfigured();

  // Stats
  const totals = {
    present: 0,
    absent: 0,
    excused: 0,
    late: 0,
    not_recorded: 0,
  };
  rows.forEach((r) => {
    periods.forEach((p) => {
      MOMENTS.forEach((m) => {
        totals[r.attendancesByKey[`${p.date}:${m}`]]++;
      });
    });
  });

  const title = session.formation?.title ?? "Session";
  const totalHalfDays = periods.length * 2;

  // Méta-infos pour l'en-tête
  function formatDateRange(start: string, end: string): string {
    const s = new Date(start);
    const e = new Date(end);
    const sameDay = start === end;
    if (sameDay) {
      return s.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    const sameMonth =
      s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    if (sameMonth) {
      return `du ${s.getDate()} au ${e.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`;
    }
    return `du ${s.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    })} au ${e.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }

  const dateRangeLabel = formatDateRange(session.start_date, session.end_date);
  const durationLabel = `${periods.length} jour${periods.length > 1 ? "s" : ""} · ${totalHalfDays} demi-journée${totalHalfDays > 1 ? "s" : ""}`;
  const modalityLabel = session.modality
    ? MODALITY_LABELS[session.modality]
    : null;
  const locationLabel = (() => {
    const ref = (
      session as unknown as {
        location_ref?: { name: string; city: string | null } | null;
      }
    ).location_ref;
    if (ref) {
      return ref.city ? `${ref.name} (${ref.city})` : ref.name;
    }
    return session.location ?? null;
  })();
  const ModalityIcon =
    session.modality === "distanciel" ? Video : MapPin;

  return (
    <>
      <PageHeader
        title="Émargement"
        description={
          <div className="space-y-1">
            <div className="font-semibold text-zinc-700 dark:text-zinc-300">
              {title}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-zinc-400 uppercase tracking-wider font-bold text-[10px]">
                  Date
                </span>
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {dateRangeLabel}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-zinc-400 uppercase tracking-wider font-bold text-[10px]">
                  Durée
                </span>
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {durationLabel}
                </span>
              </span>
              {modalityLabel && (
                <span className="inline-flex items-center gap-1.5">
                  <ModalityIcon className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-zinc-400 uppercase tracking-wider font-bold text-[10px]">
                    Modalité
                  </span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {modalityLabel}
                  </span>
                </span>
              )}
              {locationLabel && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-zinc-400 uppercase tracking-wider font-bold text-[10px]">
                    Lieu
                  </span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {locationLabel}
                  </span>
                </span>
              )}
            </div>
          </div>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Sessions", href: "/sessions" },
          { label: title, href: `/sessions/${id}` },
          { label: "Émargement" },
        ]}
        actions={
          <>
            <Button
              size="sm"
              nativeButton={false}
              render={
                <Link href={`/sessions/${id}/emargement/electronique`} />
              }
            >
              <PenLine className="h-4 w-4" />
              Émargement électronique
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a href={`/sessions/${id}/emargement/print`} target="_blank" />
              }
            >
              <Printer className="h-4 w-4" />
              Version imprimable
            </Button>
          </>
        }
      />

      <SessionTabs
        sessionId={id}
        counts={{ participants: rows.length }}
      />

      <div className="p-8 space-y-4">
        {/* Message d'aide : seuls les apprenants confirmés sont listés */}
        <div className="rounded-lg bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-cyan-700 dark:text-cyan-400 shrink-0 mt-0.5" />
          <p className="text-xs text-cyan-900 dark:text-cyan-200 leading-relaxed">
            Seuls les apprenants au statut <strong>Confirmé</strong>{" "}
            apparaissent sur la feuille d&apos;émargement. Si un apprenant
            manque, ouvrez la{" "}
            <Link
              href={`/sessions/${id}#enrollments`}
              className="underline font-bold hover:text-cyan-700 dark:hover:text-cyan-300"
            >
              fiche de session
            </Link>{" "}
            et confirmez son inscription — il apparaîtra automatiquement ici.
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
          {(
            Object.keys(ATTENDANCE_STATUS_LABELS) as Array<
              keyof typeof ATTENDANCE_STATUS_LABELS
            >
          ).map((key) => (
            <div
              key={key}
              className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3"
            >
              <div
                className={`inline-block text-xs font-medium rounded px-2 py-0.5 ${ATTENDANCE_STATUS_STYLES[key]}`}
              >
                {ATTENDANCE_STATUS_LABELS[key]}
              </div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">
                {totals[key]}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-500 px-1">
          {rows.length} apprenant{rows.length > 1 ? "s" : ""} ·{" "}
          {periods.length} jour{periods.length > 1 ? "s" : ""} ·{" "}
          {totalHalfDays} demi-journée{totalHalfDays > 1 ? "s" : ""}. Les
          horaires affichés proviennent du planning de la session ; chaque
          changement est enregistré automatiquement.
        </p>

        {/* Dashboard de suivi des signatures */}
        <SignaturesDashboard
          enrollments={rows.map((r) => ({
            enrollmentId: r.enrollmentId,
            learnerName: r.learnerName,
          }))}
          periodDates={periods.map((p) => p.date)}
          signaturesIndex={signaturesIndex}
        />

        {/* Section Signature à distance par email */}
        <RemoteSignSection
          sessionId={id}
          learners={learnersForRemoteSign}
          resendConfigured={resendOn}
        />

        <AttendanceGrid sessionId={id} periods={periods} rows={rows} />

        <p className="text-xs text-zinc-500 px-1">
          <Link
            href={`/sessions/${id}`}
            className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← Retour à la fiche de session
          </Link>
        </p>
      </div>
    </>
  );
}
