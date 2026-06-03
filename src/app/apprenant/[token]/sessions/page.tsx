import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Globe,
  MapPin,
  User,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLearnerContext } from "../_resolve";

type Params = { token: string };

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  if (!end || end === start) return formatDate(start);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameMonth =
    s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `${s.getDate()} – ${e.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }
  const sameYear = s.getFullYear() === e.getFullYear();
  if (sameYear) {
    return `${s.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
    })} – ${e.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export default async function LearnerSessionsPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const ctx = await resolveLearnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Charge toutes les sessions de l apprenant via session_enrollments
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, status, session:sessions(id, internal_code, start_date, end_date, is_inter, modality, status, location, video_app, location_obj:formation_locations!location_id(name, address, postal_code, city), formation:formations(id, title, subtitle, duration_hours, duration_days), trainer:trainers!trainer_id(first_name, last_name))",
    )
    .eq("learner_id", ctx.learner.id)
    .neq("status", "cancelled");

  type LocObj = {
    name: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  };
  type Row = {
    id: string;
    status: string | null;
    session:
      | {
          id: string;
          internal_code: string | null;
          start_date: string | null;
          end_date: string | null;
          is_inter: boolean | null;
          modality: string | null;
          status: string | null;
          location: string | null;
          video_app: string | null;
          location_obj: LocObj | LocObj[] | null;
          formation:
            | {
                id: string;
                title: string;
                subtitle: string | null;
                duration_hours: number | null;
                duration_days: number | null;
              }
            | Array<{
                id: string;
                title: string;
                subtitle: string | null;
                duration_hours: number | null;
                duration_days: number | null;
              }>
            | null;
          trainer:
            | { first_name: string; last_name: string }
            | Array<{ first_name: string; last_name: string }>
            | null;
        }
      | Array<{
          id: string;
          internal_code: string | null;
          start_date: string | null;
          end_date: string | null;
          is_inter: boolean | null;
          modality: string | null;
          status: string | null;
          location: string | null;
          video_app: string | null;
          location_obj: LocObj | LocObj[] | null;
          formation: unknown;
          trainer: unknown;
        }>
      | null;
  };

  const rows = ((enrollments ?? []) as unknown as Row[])
    .map((r) => {
      const session = Array.isArray(r.session) ? r.session[0] : r.session;
      if (!session) return null;
      const formation = Array.isArray(session.formation)
        ? session.formation[0]
        : session.formation;
      const trainer = Array.isArray(session.trainer)
        ? session.trainer[0]
        : session.trainer;
      const locObj = Array.isArray(session.location_obj)
        ? session.location_obj[0] ?? null
        : session.location_obj;
      return {
        enrollmentId: r.id,
        sessionId: session.id,
        internalCode: session.internal_code,
        startDate: session.start_date,
        endDate: session.end_date,
        isInter: session.is_inter,
        modality: session.modality,
        sessionStatus: session.status,
        title: formation?.title ?? "(formation supprimée)",
        subtitle: formation?.subtitle ?? null,
        durationHours: formation?.duration_hours ?? null,
        durationDays: formation?.duration_days ?? null,
        location: locObj
          ? {
              name: locObj.name,
              address: locObj.address,
              postalCode: locObj.postal_code,
              city: locObj.city,
            }
          : session.location
            ? { name: session.location, address: null, postalCode: null, city: null }
            : null,
        videoApp: session.video_app,
        trainerName:
          trainer && typeof trainer === "object" && "first_name" in trainer
            ? `${(trainer as { first_name: string; last_name: string }).first_name} ${(trainer as { first_name: string; last_name: string }).last_name}`
            : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => {
      const da = a.startDate ?? "9999";
      const db = b.startDate ?? "9999";
      return db.localeCompare(da); // les plus récentes en haut
    });

  // Séparation à venir / passées
  const aVenir = rows.filter(
    (r) => !r.endDate || r.endDate >= today,
  );
  const passees = rows.filter((r) => r.endDate && r.endDate < today);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 inline-flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-cyan-600" />
          Mes formations
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          Toutes les sessions auxquelles vous êtes ou avez été inscrit(e).
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
          <Calendar className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm text-zinc-600">
            Aucune formation pour le moment.
          </p>
        </div>
      ) : (
        <>
          {aVenir.length > 0 && (
            <SessionGroup
              title="Formations à venir / en cours"
              count={aVenir.length}
              sessions={aVenir}
              token={token}
              variant="upcoming"
            />
          )}
          {passees.length > 0 && (
            <SessionGroup
              title="Formations terminées"
              count={passees.length}
              sessions={passees}
              token={token}
              variant="past"
            />
          )}
        </>
      )}
    </div>
  );
}

type SessionItem = {
  enrollmentId: string;
  sessionId: string;
  internalCode: string | null;
  startDate: string | null;
  endDate: string | null;
  isInter: boolean | null;
  modality: string | null;
  sessionStatus: string | null;
  title: string;
  subtitle: string | null;
  durationHours: number | null;
  durationDays: number | null;
  location: {
    name: string | null;
    address: string | null;
    postalCode: string | null;
    city: string | null;
  } | null;
  videoApp: string | null;
  trainerName: string | null;
};

function SessionGroup({
  title,
  count,
  sessions,
  token,
  variant,
}: {
  title: string;
  count: number;
  sessions: SessionItem[];
  token: string;
  variant: "upcoming" | "past";
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-zinc-700 inline-flex items-center gap-1.5">
        {variant === "upcoming" ? (
          <Clock className="h-4 w-4 text-amber-600" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
        {title}{" "}
        <span className="text-xs font-medium text-zinc-500">({count})</span>
      </h2>

      <div className="grid grid-cols-1 gap-3">
        {sessions.map((s) => (
          <article
            key={s.enrollmentId}
            className={
              variant === "upcoming"
                ? "rounded-2xl bg-white border-2 border-cyan-200 p-3 sm:p-5 flex flex-col gap-3 hover:border-cyan-400 hover:shadow-md transition-all"
                : "rounded-2xl bg-white border border-zinc-200 p-3 sm:p-5 flex flex-col gap-3 hover:border-zinc-300 transition-all"
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-zinc-900 leading-snug">
                  {s.title}
                </h3>
                {s.subtitle && (
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                    {s.subtitle}
                  </p>
                )}
              </div>
              <div className="shrink-0 flex flex-row items-center gap-1 flex-wrap justify-end">
                {s.modality === "presentiel" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                    <MapPin className="h-3 w-3" />
                    Présentiel
                  </span>
                ) : s.modality === "hybride" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase tracking-wider">
                    <Globe className="h-3 w-3" />
                    Hybride
                  </span>
                ) : s.modality === "distanciel" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold uppercase tracking-wider">
                    <Globe className="h-3 w-3" />
                    Distanciel
                  </span>
                ) : null}
                {s.isInter !== null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold uppercase tracking-wider">
                    {s.isInter ? "INTER" : "INTRA"}
                  </span>
                )}
                {variant === "past" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-200">
                    <CheckCircle2 className="h-3 w-3" />
                    Terminée
                  </span>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="h-4 w-4 text-zinc-500 shrink-0" />
                <span className="text-sm font-bold text-zinc-900">
                  {formatDateRange(s.startDate, s.endDate)}
                </span>
                {(() => {
                  const h = s.durationHours;
                  const d = s.durationDays;
                  const dayLabel =
                    d != null && d > 0
                      ? Number.isInteger(d)
                        ? `${d} j`
                        : `${d.toFixed(1)} j`
                      : null;
                  const hourLabel =
                    h != null && h > 0 ? `${h} h` : null;
                  const dur =
                    dayLabel && hourLabel
                      ? `${dayLabel} / ${hourLabel}`
                      : dayLabel ?? hourLabel ?? null;
                  if (!dur) return null;
                  return (
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                      <Clock className="h-3.5 w-3.5 text-zinc-400" />
                      {dur}
                    </span>
                  );
                })()}
              </div>
              {(s.modality === "presentiel" || s.modality === "hybride") &&
                s.location && (
                  <div className="flex items-start gap-1.5 text-zinc-600">
                    <MapPin className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
                    <span className="text-zinc-700">
                      {s.location.name && (
                        <span className="font-semibold">{s.location.name}</span>
                      )}
                      {(() => {
                        const addr = [
                          s.location?.address,
                          [s.location?.postalCode, s.location?.city]
                            .filter(Boolean)
                            .join(" "),
                        ]
                          .filter((x) => x && x.length > 0)
                          .join(", ");
                        if (!addr) return null;
                        return (
                          <span
                            className={
                              s.location?.name
                                ? "block text-[11px] text-zinc-500"
                                : ""
                            }
                          >
                            {addr}
                          </span>
                        );
                      })()}
                    </span>
                  </div>
                )}
              {s.modality === "distanciel" && s.videoApp && (
                <div className="flex items-center gap-1.5 text-zinc-600">
                  <Globe className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <span>{s.videoApp}</span>
                </div>
              )}
              {s.trainerName && (
                <div className="flex items-center gap-1.5 text-zinc-600">
                  <User className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  Formateur : <span className="font-semibold">{s.trainerName}</span>
                </div>
              )}
            </dl>

            <div className="mt-auto pt-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
              <Link
                href={`/apprenant/${token}/sessions/${s.sessionId}`}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700"
              >
                Voir le détail
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
