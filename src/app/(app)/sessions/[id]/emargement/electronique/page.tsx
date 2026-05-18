import Link from "next/link";
import {
  Calendar,
  Clock,
  Info,
  MapPin,
  Printer,
  Video,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SignatureGrid } from "./_signature-grid";
import { QrButton } from "./_qr-button";
import { QrEvaluationButton } from "./_qr-evaluation-button";
import type { SessionDay, TrainingSession } from "@/lib/sessions/types";
import { MODALITY_LABELS } from "@/lib/formations/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Moment = "morning" | "afternoon";
type SignerRole = "learner" | "trainer";

export type LearnerRow = {
  enrollmentId: string;
  fullName: string;
  company: string | null;
};

export type DayPeriod = {
  date: string;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
};

export type SignatureSnapshot = {
  enrollment_id: string;
  period_date: string;
  moment: Moment;
  signer_role: SignerRole;
  signer_name: string;
  signature_data: string;
  signed_at: string;
};

function timeToMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}
function diffMin(start: string | null, end: string | null): number {
  const s = timeToMin(start);
  const e = timeToMin(end);
  if (s === null || e === null || e <= s) return 0;
  return e - s;
}
function formatHours(h: number): string {
  if (h <= 0) return "—";
  const whole = Math.floor(h);
  const frac = Math.round((h - whole) * 60);
  if (frac === 0) return `${whole} h`;
  return `${whole} h ${frac.toString().padStart(2, "0")}`;
}
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
  return `du ${s.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })} au ${e.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export default async function EmargementElectroniquePage({
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

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "*, formation:formations(id, title), location_ref:formation_locations!location_id(id, name, address, postal_code, city), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", id)
    .maybeSingle<
      TrainingSession & {
        location_ref?: {
          name: string;
          address: string | null;
          postal_code: string | null;
          city: string | null;
        } | null;
        trainer?: { first_name: string; last_name: string } | null;
      }
    >();
  if (!session) notFound();

  const [{ data: enrollments }, { data: sessionDays }] = await Promise.all([
    supabase
      .from("session_enrollments")
      .select(
        "id, learner:learners(first_name, last_name, company:companies(name))",
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

  // Charger les signatures déjà saisies pour ces enrollments
  const { data: signatures } =
    enrollmentIds.length > 0
      ? await supabase
          .from("attendance_signatures")
          .select(
            "enrollment_id, period_date, moment, signer_role, signer_name, signature_data, signed_at",
          )
          .in("enrollment_id", enrollmentIds)
      : { data: [] as SignatureSnapshot[] };

  // Construire les jours : on utilise UNIQUEMENT les session_days réels
  const sortedDays = (sessionDays ?? []).slice().sort((a, b) =>
    ((a as SessionDay).day_date ?? "").localeCompare(
      (b as SessionDay).day_date ?? "",
    ),
  );
  const periods: DayPeriod[] = sortedDays.map((d) => {
    const day = d as SessionDay;
    return {
      date: day.day_date,
      morning_start: day.morning_start,
      morning_end: day.morning_end,
      afternoon_start: day.afternoon_start,
      afternoon_end: day.afternoon_end,
    };
  });

  // Lignes apprenants
  const learnerRows: LearnerRow[] = (enrollments ?? []).map((e) => {
    const learner = e.learner as unknown as {
      first_name: string | null;
      last_name: string | null;
      company?: { name: string } | null;
    } | null;
    const fullName = learner
      ? [learner.first_name, learner.last_name].filter(Boolean).join(" ")
      : "Apprenant inconnu";
    return {
      enrollmentId: e.id as string,
      fullName,
      company: learner?.company?.name ?? null,
    };
  });

  // Méta-infos pour l'en-tête
  const totalMinutes = sortedDays.reduce((sum, raw) => {
    const d = raw as SessionDay;
    return (
      sum +
      diffMin(d.morning_start, d.morning_end) +
      diffMin(d.afternoon_start, d.afternoon_end)
    );
  }, 0);
  const dateRangeLabel = formatDateRange(
    session.start_date,
    session.end_date,
  );
  const durationLabel =
    sortedDays.length > 0
      ? `${sortedDays.length} jour${sortedDays.length > 1 ? "s" : ""} · ${formatHours(totalMinutes / 60)}`
      : null;
  const modalityLabel = session.modality
    ? MODALITY_LABELS[session.modality]
    : null;
  // Libellé court (utilisé sous chaque date dans le tableau)
  const modalityShortLabel = session.modality
    ? session.modality === "distanciel"
      ? "Distanciel"
      : session.modality === "hybride"
        ? "Hybride"
        : "Présentiel"
    : null;
  const ModalityIcon = session.modality === "distanciel" ? Video : MapPin;

  const locationRef = (
    session as unknown as {
      location_ref?: {
        name: string;
        address: string | null;
        postal_code: string | null;
        city: string | null;
      } | null;
    }
  ).location_ref;
  const sessionAny = session as unknown as {
    video_app?: string | null;
  };
  let locationLabel: string | null = null;
  if (session.modality === "distanciel") {
    const app = sessionAny.video_app?.trim();
    locationLabel = app
      ? `Classe virtuelle - lien ${app.toUpperCase()}`
      : "Classe virtuelle";
  } else if (locationRef) {
    const parts = [
      locationRef.address,
      [locationRef.postal_code, locationRef.city].filter(Boolean).join(" "),
    ].filter(Boolean);
    locationLabel =
      parts.length > 0
        ? `${locationRef.name} — ${parts.join(", ")}`
        : locationRef.name;
  } else if (session.location) {
    locationLabel = session.location;
  }

  const trainerJoined = (
    session as unknown as {
      trainer?: { first_name: string; last_name: string } | null;
    }
  ).trainer;
  const trainerDisplayName =
    session.trainer_name ??
    (trainerJoined
      ? `${trainerJoined.first_name} ${trainerJoined.last_name}`
      : null);

  const title = session.formation?.title ?? "Session";

  return (
    <>
      <PageHeader
        title="Émargement électronique"
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
              {durationLabel && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-zinc-400 uppercase tracking-wider font-bold text-[10px]">
                    Durée
                  </span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {durationLabel}
                  </span>
                </span>
              )}
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
          { label: "Émargement", href: `/sessions/${id}/emargement` },
          { label: "Électronique" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <QrButton sessionId={id} />
            <QrEvaluationButton sessionId={id} />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a
                  href={`/sessions/${id}/emargement/print`}
                  target="_blank"
                />
              }
            >
              <Printer className="h-4 w-4" />
              Aperçu / PDF
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-4">
        {/* Message d'aide */}
        <div className="rounded-lg bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-cyan-700 dark:text-cyan-400 shrink-0 mt-0.5" />
          <p className="text-xs text-cyan-900 dark:text-cyan-200 leading-relaxed">
            Faites <strong>signer chaque apprenant</strong> à chaque
            demi-journée (souris, doigt sur tablette/smartphone). En tant que
            formateur, vous signez aussi pour valider chaque demi-journée.
            Une fois toutes les signatures recueillies, cliquez sur{" "}
            <strong>Aperçu / PDF</strong> en haut à droite pour exporter la
            feuille signée à transmettre à l&apos;OPCO.
          </p>
        </div>

        {periods.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center text-sm text-zinc-500">
            Aucun jour planifié pour cette session. Ajoutez des jours dans le
            planning détaillé.
          </div>
        ) : learnerRows.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center text-sm text-zinc-500">
            Aucun apprenant inscrit à cette session. Confirmez les
            inscriptions depuis la{" "}
            <Link
              href={`/sessions/${id}#enrollments`}
              className="underline font-medium hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              fiche de session
            </Link>
            .
          </div>
        ) : (
          <SignatureGrid
            sessionId={id}
            periods={periods}
            learners={learnerRows}
            initialSignatures={(signatures ?? []) as SignatureSnapshot[]}
            trainerDisplayName={trainerDisplayName}
            modalityShortLabel={modalityShortLabel}
          />
        )}

        <p className="text-xs text-zinc-500 px-1">
          <Link
            href={`/sessions/${id}/emargement`}
            className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← Émargement classique (sans signature)
          </Link>
        </p>
      </div>
    </>
  );
}
