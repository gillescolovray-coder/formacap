import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Globe,
  GraduationCap,
  Hash,
  MapPin,
  User,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLearnerContext } from "../../_resolve";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { token: string; sessionId: string };

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 5);
}

export default async function LearnerSessionDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token, sessionId } = await params;
  if (!UUID_REGEX.test(sessionId)) notFound();
  const ctx = await resolveLearnerContext(token);
  if (!ctx) notFound();

  const supabase = createAdminClient();

  // Verifie que l apprenant est bien inscrit a cette session
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("learner_id", ctx.learner.id)
    .neq("status", "cancelled")
    .maybeSingle();
  if (!enrollment) notFound();

  // Charge les details de la session
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, internal_code, start_date, end_date, is_inter, modality, status, location, video_app, video_link, location_obj:formation_locations!location_id(name, address, postal_code, city), formation:formations(id, title, subtitle, duration_hours, duration_days, programme_pdf_url), trainer:trainers!trainer_id(first_name, last_name)",
    )
    .eq("id", sessionId)
    .eq("organization_id", ctx.learner.organization_id)
    .maybeSingle();
  if (!session) notFound();

  type LocObj = {
    name: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  };
  const sess = session as unknown as {
    id: string;
    internal_code: string | null;
    start_date: string | null;
    end_date: string | null;
    is_inter: boolean | null;
    modality: string | null;
    status: string | null;
    location: string | null;
    video_app: string | null;
    video_link: string | null;
    location_obj: LocObj | LocObj[] | null;
    formation:
      | {
          id: string;
          title: string;
          subtitle: string | null;
          duration_hours: number | null;
          duration_days: number | null;
          programme_pdf_url: string | null;
        }
      | Array<{
          id: string;
          title: string;
          subtitle: string | null;
          duration_hours: number | null;
          duration_days: number | null;
          programme_pdf_url: string | null;
        }>
      | null;
    trainer:
      | { first_name: string; last_name: string }
      | Array<{ first_name: string; last_name: string }>
      | null;
  };
  const formation = Array.isArray(sess.formation)
    ? sess.formation[0] ?? null
    : sess.formation;
  const trainer = Array.isArray(sess.trainer)
    ? sess.trainer[0] ?? null
    : sess.trainer;
  const locObj = Array.isArray(sess.location_obj)
    ? sess.location_obj[0] ?? null
    : sess.location_obj;

  // Horaires détaillés
  const { data: sessionDays } = await supabase
    .from("session_days")
    .select("day_date, morning_start, morning_end, afternoon_start, afternoon_end")
    .eq("session_id", sessionId)
    .order("day_date", { ascending: true });

  const days = (sessionDays ?? []) as Array<{
    day_date: string;
    morning_start: string | null;
    morning_end: string | null;
    afternoon_start: string | null;
    afternoon_end: string | null;
  }>;

  const today = new Date().toISOString().slice(0, 10);
  const isPast = sess.end_date && sess.end_date < today;
  const modalityLabel =
    sess.modality === "presentiel"
      ? "Présentiel"
      : sess.modality === "distanciel"
        ? "Distanciel"
        : sess.modality === "hybride"
          ? "Hybride"
          : "—";

  return (
    <div className="space-y-4">
      <Link
        href={`/apprenant/${token}/sessions`}
        className="inline-flex items-center gap-1.5 text-xs text-cyan-700 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour à mes formations
      </Link>

      {/* Header session */}
      <div className="rounded-2xl bg-gradient-to-br from-cyan-50 to-indigo-50 border border-cyan-200 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-cyan-100 text-cyan-700">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-zinc-900 leading-snug">
              {formation?.title ?? "Session"}
            </h1>
            {formation?.subtitle && (
              <p className="text-xs sm:text-sm text-zinc-600 mt-1">
                {formation.subtitle}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {sess.modality && (
                <span
                  className={
                    sess.modality === "presentiel"
                      ? "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider"
                      : sess.modality === "hybride"
                        ? "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase tracking-wider"
                        : "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold uppercase tracking-wider"
                  }
                >
                  {sess.modality === "presentiel" ? (
                    <MapPin className="h-3 w-3" />
                  ) : (
                    <Globe className="h-3 w-3" />
                  )}
                  {modalityLabel}
                </span>
              )}
              {sess.is_inter !== null && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 text-[10px] font-bold uppercase tracking-wider">
                  {sess.is_inter ? "INTER" : "INTRA"}
                </span>
              )}
              {isPast && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Terminée
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Informations clés */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InfoCard icon={Calendar} label="Date(s)" color="cyan">
          <div className="font-bold text-zinc-900">
            {formatDate(sess.start_date)}
            {sess.end_date &&
              sess.end_date !== sess.start_date &&
              ` – ${formatDate(sess.end_date)}`}
          </div>
        </InfoCard>

        <InfoCard icon={Clock} label="Durée" color="indigo">
          <div className="font-bold text-zinc-900">
            {formation?.duration_days && formation.duration_days > 0
              ? `${formation.duration_days} jour${formation.duration_days > 1 ? "s" : ""}`
              : "—"}
            {formation?.duration_hours
              ? ` · ${formation.duration_hours} h`
              : ""}
          </div>
        </InfoCard>

        {sess.internal_code && (
          <InfoCard icon={Hash} label="Code session" color="zinc">
            <div className="font-mono text-xs text-zinc-700">
              {sess.internal_code}
            </div>
          </InfoCard>
        )}

        {trainer && (
          <InfoCard icon={User} label="Formateur" color="amber">
            <div className="font-bold text-zinc-900">
              {trainer.first_name} {trainer.last_name}
            </div>
          </InfoCard>
        )}

        {(sess.modality === "presentiel" || sess.modality === "hybride") &&
          (locObj || sess.location) && (
            <InfoCard icon={Building2} label="Lieu" color="emerald">
              <div className="text-zinc-900">
                {locObj?.name && (
                  <div className="font-bold">{locObj.name}</div>
                )}
                {locObj
                  ? [
                      locObj.address,
                      [locObj.postal_code, locObj.city]
                        .filter(Boolean)
                        .join(" "),
                    ]
                      .filter((x) => x && x.length > 0)
                      .map((line, i) => (
                        <div key={i} className="text-xs text-zinc-600">
                          {line}
                        </div>
                      ))
                  : sess.location && (
                      <div className="text-xs text-zinc-600">
                        {sess.location}
                      </div>
                    )}
              </div>
            </InfoCard>
          )}

        {sess.modality === "distanciel" && (sess.video_app || sess.video_link) && (
          <InfoCard icon={Globe} label="Visioconférence" color="cyan">
            <div className="text-zinc-900">
              {sess.video_app && (
                <div className="font-bold">{sess.video_app}</div>
              )}
              {sess.video_link && !isPast && (
                <a
                  href={sess.video_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-700 hover:underline break-all"
                >
                  {sess.video_link}
                </a>
              )}
            </div>
          </InfoCard>
        )}
      </div>

      {/* Programme PDF */}
      {formation?.programme_pdf_url && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-4">
          <h2 className="text-sm font-bold text-zinc-700 mb-2 inline-flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-emerald-600" />
            Programme de la formation
          </h2>
          <a
            href={formation.programme_pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-bold hover:bg-emerald-100"
          >
            <FileText className="h-4 w-4" />
            Télécharger le programme (PDF)
          </a>
        </div>
      )}

      {/* Horaires détaillés */}
      {days.length > 0 && (
        <div className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
          <h2 className="px-4 py-2 border-b border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-700 inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Horaires de la formation
          </h2>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Matin</th>
                <th className="px-3 py-2 text-left">Après-midi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {days.map((d) => (
                <tr key={d.day_date}>
                  <td className="px-3 py-2 font-semibold text-zinc-900">
                    {formatDate(d.day_date)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {d.morning_start && d.morning_end
                      ? `${formatTime(d.morning_start)} – ${formatTime(d.morning_end)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {d.afternoon_start && d.afternoon_end
                      ? `${formatTime(d.afternoon_start)} – ${formatTime(d.afternoon_end)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Documents + quiz : liens vers les autres onglets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href={`/apprenant/${token}/documents`}
          className="group rounded-2xl bg-white border border-zinc-200 p-4 hover:border-emerald-400 hover:shadow-md transition-all"
        >
          <FileText className="h-6 w-6 text-emerald-600 mb-2" />
          <div className="font-bold text-zinc-900 group-hover:text-emerald-700">
            Mes documents pour cette formation
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Attestation, programme, convention…
          </div>
        </Link>
        <Link
          href={`/apprenant/${token}/quiz`}
          className="group rounded-2xl bg-white border border-zinc-200 p-4 hover:border-violet-400 hover:shadow-md transition-all"
        >
          <GraduationCap className="h-6 w-6 text-violet-600 mb-2" />
          <div className="font-bold text-zinc-900 group-hover:text-violet-700">
            Mes résultats de quiz
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Scores pré et post + progression
          </div>
        </Link>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  color,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: "cyan" | "indigo" | "emerald" | "amber" | "zinc";
  children: React.ReactNode;
}) {
  const ring = {
    cyan: "border-cyan-200 bg-cyan-50/40",
    indigo: "border-indigo-200 bg-indigo-50/40",
    emerald: "border-emerald-200 bg-emerald-50/40",
    amber: "border-amber-200 bg-amber-50/40",
    zinc: "border-zinc-200 bg-zinc-50/40",
  }[color];
  const iconColor = {
    cyan: "text-cyan-600",
    indigo: "text-indigo-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    zinc: "text-zinc-600",
  }[color];
  return (
    <div className={`rounded-xl border p-3 ${ring}`}>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 inline-flex items-center gap-1">
        <Icon className={`h-3 w-3 ${iconColor}`} />
        {label}
      </div>
      {children}
    </div>
  );
}
