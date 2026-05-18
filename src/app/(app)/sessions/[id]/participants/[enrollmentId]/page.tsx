import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Award,
  Building2,
  CalendarDays,
  Check,
  ExternalLink,
  FileSignature,
  Mail,
  MapPin,
  Phone,
  Printer,
  Star,
  UserCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ENROLLMENT_STATUS_BADGE_CLASSES,
  ENROLLMENT_STATUS_LABELS,
  INITIAL_LEVEL_BADGE_CLASSES,
  INITIAL_LEVEL_LABELS,
  INSCRIPTION_CHANNEL_BADGE_CLASSES,
  INSCRIPTION_CHANNEL_LABELS,
  type EnrollmentStatus,
  type InitialLevel,
  type InscriptionChannel,
} from "@/lib/sessions/types";
import { SessionTabs } from "../../_session-tabs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type EnrollmentRow = {
  id: string;
  session_id: string;
  status: EnrollmentStatus;
  initial_level: InitialLevel | null;
  inscription_channel: InscriptionChannel | null;
  inscription_channel_company_id: string | null;
  notes: string | null;
  enrolled_at: string;
  convocation_sent_at: string | null;
  learner: {
    id: string;
    civility: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    job_title: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
    special_needs: string | null;
    accessibility: string | null;
    company: { id: string; name: string } | null;
  } | null;
};

export default async function ParticipantDetailPage({
  params,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
}) {
  const { id, enrollmentId } = await params;
  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(enrollmentId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 1. Session (titre + dates pour l'entête)
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, start_date, end_date, status, formation:formations(id, title)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      start_date: string;
      end_date: string;
      status: string;
      formation: { id: string; title: string } | null;
    }>();
  if (!session) notFound();

  // 2. Enrollment + apprenant complet
  const { data: enrollmentRaw } = await supabase
    .from("session_enrollments")
    .select(
      `
      id, session_id, status, initial_level,
      inscription_channel, inscription_channel_company_id,
      notes, enrolled_at, convocation_sent_at,
      learner:learners(
        id, civility, first_name, last_name, email, phone, mobile,
        job_title, address, postal_code, city,
        special_needs, accessibility,
        company:companies(id, name)
      )
      `,
    )
    .eq("id", enrollmentId)
    .eq("session_id", id)
    .maybeSingle();

  if (!enrollmentRaw) notFound();
  const enrollment = enrollmentRaw as unknown as EnrollmentRow;

  // 3. Société "canal d'inscription" (si différente de l'entreprise apprenant)
  const channelCompanyId = enrollment.inscription_channel_company_id;
  const { data: channelCompany } = channelCompanyId
    ? await supabase
        .from("companies")
        .select("id, name")
        .eq("id", channelCompanyId)
        .maybeSingle<{ id: string; name: string }>()
    : { data: null };

  // 4. Présence : stats agrégées (présent/total demi-journées)
  const { data: attendances } = await supabase
    .from("attendances")
    .select("status")
    .eq("enrollment_id", enrollmentId);

  const presenceStats = { present: 0, absent: 0, total: 0 };
  (attendances ?? []).forEach((a) => {
    presenceStats.total += 1;
    if (a.status === "present" || a.status === "late") presenceStats.present += 1;
    else if (a.status === "absent") presenceStats.absent += 1;
  });
  const presenceRate =
    presenceStats.total > 0
      ? Math.round((presenceStats.present / presenceStats.total) * 100)
      : null;

  const learner = enrollment.learner;
  const fullName = learner
    ? `${learner.civility ? learner.civility + " " : ""}${learner.first_name ?? ""} ${learner.last_name ?? ""}`.trim()
    : "Apprenant inconnu";
  const sessionTitle = session.formation?.title ?? "Session";

  const dateRange = `du ${formatDate(session.start_date)} au ${formatDate(session.end_date)}`;
  const mailSubject = `Convocation à la formation : ${sessionTitle}`;
  const mailBody = `Bonjour,%0D%0A%0D%0AVous trouverez ci-joint votre convocation à la formation « ${encodeURIComponent(sessionTitle)} » ${encodeURIComponent(dateRange)}.%0D%0A%0D%0ABien cordialement,`;
  const mailto = learner?.email
    ? `mailto:${learner.email}?subject=${encodeURIComponent(mailSubject)}&body=${mailBody}`
    : undefined;

  return (
    <>
      <PageHeader
        title={fullName}
        description={
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            {sessionTitle}
          </span>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Sessions", href: "/sessions" },
          { label: sessionTitle, href: `/sessions/${id}` },
          { label: "Participants", href: `/sessions/${id}/participants` },
          { label: fullName },
        ]}
        actions={
          <BackButton fallbackHref={`/sessions/${id}/participants`} />
        }
      />

      <SessionTabs sessionId={id} />

      <div className="p-8 max-w-5xl space-y-4">
        {/* Bandeau identité */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="h-16 w-16 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-xl font-bold flex items-center justify-center shadow-sm">
              {`${learner?.first_name?.[0] ?? ""}${learner?.last_name?.[0] ?? ""}`.toUpperCase() ||
                "?"}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-xl font-bold tracking-tight">
                  {fullName}
                </h2>
                {learner && (
                  <Link
                    href={`/apprenants/${learner.id}`}
                    className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:underline"
                    title="Ouvrir la fiche apprenant complète"
                  >
                    Fiche apprenant
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
              {learner?.job_title && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {learner.job_title}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {learner?.company ? (
                  <Link
                    href={`/entreprises/${learner.company.id}`}
                    className="inline-flex items-center gap-1 hover:text-cyan-700 hover:underline"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {learner.company.name}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 text-zinc-400">
                    <UserCircle2 className="h-3.5 w-3.5" />
                    Particulier
                  </span>
                )}
                {learner?.email && (
                  <a
                    href={`mailto:${learner.email}`}
                    className="inline-flex items-center gap-1 hover:text-cyan-700 hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {learner.email}
                  </a>
                )}
                {learner?.phone && (
                  <a
                    href={`tel:${learner.phone}`}
                    className="inline-flex items-center gap-1 hover:text-cyan-700 hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {learner.phone}
                  </a>
                )}
                {learner?.mobile && learner.mobile !== learner.phone && (
                  <a
                    href={`tel:${learner.mobile}`}
                    className="inline-flex items-center gap-1 hover:text-cyan-700 hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {learner.mobile}
                  </a>
                )}
                {(learner?.city || learner?.postal_code) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {[learner.postal_code, learner.city]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Badges synthèse */}
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border",
                ENROLLMENT_STATUS_BADGE_CLASSES[enrollment.status],
              )}
              title="Statut d'inscription"
            >
              {ENROLLMENT_STATUS_LABELS[enrollment.status]}
            </span>
            {enrollment.initial_level && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold",
                  INITIAL_LEVEL_BADGE_CLASSES[enrollment.initial_level],
                )}
                title="Niveau initial déclaré"
              >
                Niveau : {INITIAL_LEVEL_LABELS[enrollment.initial_level]}
              </span>
            )}
            {enrollment.inscription_channel && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold",
                  INSCRIPTION_CHANNEL_BADGE_CLASSES[
                    enrollment.inscription_channel
                  ],
                )}
                title="Canal d'inscription"
              >
                {INSCRIPTION_CHANNEL_LABELS[enrollment.inscription_channel]}
                {channelCompany ? ` — ${channelCompany.name}` : ""}
              </span>
            )}
            {(learner?.special_needs || learner?.accessibility) && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300"
                title={
                  learner.special_needs
                    ? `Besoin spécifique : ${learner.special_needs}`
                    : `Accessibilité : ${learner.accessibility}`
                }
              >
                ♿ Besoin spécifique
              </span>
            )}
          </div>
        </section>

        {/* Grille 2 colonnes : Convocation / Émargement / Évaluation / Attestation */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Convocation */}
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center">
                <Mail className="h-4 w-4 text-indigo-700 dark:text-indigo-400" />
              </div>
              <h3 className="text-base font-semibold">Convocation</h3>
            </div>
            {enrollment.convocation_sent_at ? (
              <p className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 w-fit">
                <Check className="h-3 w-3" />
                Envoyée le {formatDate(enrollment.convocation_sent_at)}
              </p>
            ) : (
              <p className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-zinc-100 text-zinc-700 border border-zinc-200 w-fit">
                Non envoyée
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <a
                    href={`/sessions/${id}/convocations/${enrollmentId}/print`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <Printer className="h-3.5 w-3.5" />
                Aperçu PDF
              </Button>
              {mailto && (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<a href={mailto} />}
                  title="Ouvre votre client mail"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Envoyer
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={`/sessions/${id}/convocations`} />}
              >
                Tout gérer →
              </Button>
            </div>
          </section>

          {/* Émargement */}
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center">
                <FileSignature className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold">Émargement</h3>
            </div>
            {presenceRate === null ? (
              <p className="text-xs text-zinc-500 italic">
                Aucune demi-journée renseignée pour le moment.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      presenceRate >= 100
                        ? "text-emerald-700"
                        : presenceRate >= 75
                          ? "text-amber-700"
                          : "text-red-700",
                    )}
                  >
                    {presenceRate} %
                  </span>
                  <span className="text-xs text-zinc-500">
                    {presenceStats.present}/{presenceStats.total} demi-journées
                  </span>
                </div>
                {presenceStats.absent > 0 && (
                  <p className="text-xs text-red-700">
                    {presenceStats.absent} absence
                    {presenceStats.absent > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}
            <div className="pt-1">
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={`/sessions/${id}/emargement`} />}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Ouvrir l&apos;émargement →
              </Button>
            </div>
          </section>

          {/* Évaluation à chaud */}
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-pink-100 dark:bg-pink-950/60 flex items-center justify-center">
                <Star className="h-4 w-4 text-pink-700 dark:text-pink-400" />
              </div>
              <h3 className="text-base font-semibold">Évaluation à chaud</h3>
            </div>
            <p className="text-xs text-zinc-500">
              Les réponses sont anonymes — non rattachées à un apprenant
              particulier.
            </p>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={`/sessions/${id}/evaluation`} />}
            >
              Voir la synthèse →
            </Button>
          </section>

          {/* Attestation */}
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center">
                <Award className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              </div>
              <h3 className="text-base font-semibold">
                Attestation de réalisation
              </h3>
            </div>
            {session.status === "completed" ? (
              <p className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-violet-100 text-violet-800 border border-violet-200 w-fit">
                Session terminée — attestation prête
              </p>
            ) : (
              <p className="text-xs text-zinc-500 italic">
                Disponible en aperçu maintenant ; à transmettre une fois la
                session terminée.
              </p>
            )}
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <a
                    href={`/sessions/${id}/attestations/${enrollmentId}/print`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <Printer className="h-3.5 w-3.5" />
                Aperçu PDF
              </Button>
            </div>
          </section>
        </div>

        {enrollment.notes && (
          <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5">
            <h3 className="text-sm font-semibold mb-2">
              Notes sur cette inscription
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
              {enrollment.notes}
            </p>
          </section>
        )}

        <p className="text-xs text-zinc-500 px-1">
          <Link
            href={`/sessions/${id}/participants`}
            className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← Retour à la liste des participants
          </Link>
        </p>
      </div>
    </>
  );
}
