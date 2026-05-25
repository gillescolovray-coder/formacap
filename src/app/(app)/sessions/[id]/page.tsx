import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Copy,
  Save,
  Send,
  StickyNote,
  Trash2,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionForm } from "../_form";
import {
  deleteSession,
  duplicateSession,
  toggleArchiveSession,
  updateSession,
} from "../actions";
import { confirmSessionFormAction } from "./confirm/actions";
import { SessionNotesPanel } from "./_notes-panel";
import { SessionTabs } from "./_session-tabs";
import { SessionHeaderMeta } from "./_session-header-meta";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/collapsible-section";
import type { NoteCardItem } from "@/components/notes/note-list-card";
import type { Formation } from "@/lib/formations/types";
import type {
  OrgDefaultHours,
  SessionDay,
  SessionStatusDef,
  TrainingSession,
} from "@/lib/sessions/types";

/** Tronque "HH:MM:SS" → "HH:MM" pour <input type="time">. */
function trimTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}
import type { SessionNote, SessionEnrollmentNote } from "@/lib/notes/types";

const MESSAGES: Record<string, string> = {
  created: "Session créée avec succès.",
  updated: "Modifications enregistrées.",
  duplicated:
    "Session dupliquée. Ajustez les dates et les détails ci-dessous puis enregistrez.",
  enrolled: "Apprenant inscrit.",
  statusUpdated: "Statut d'inscription mis à jour.",
  unenrolled: "Apprenant retiré de la session.",
  archived:
    "Session archivée. Elle est masquée du tableau d'inscriptions mais reste accessible via cette URL.",
  unarchived: "Session sortie d'archive. Elle réapparaît dans le tableau d'inscriptions.",
  confirmed:
    "Session confirmée. La convocation a été envoyée au formateur avec son lien d'accès au portail.",
  warning: "", // mappé en runtime depuis ?warning=...
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session, error } = await supabase
    .from("sessions")
    .select("*, formation:formations(id, title)")
    .eq("id", id)
    .maybeSingle<TrainingSession>();

  if (error) throw error;
  if (!session) notFound();

  const [
    { data: formations },
    { data: locations },
    { data: trainers },
    { data: companies },
    { data: enrollments },
    { data: sessionDays },
    { data: inscriptionRequests },
    { data: orgRow },
    { data: customStatusesRaw },
    { data: orgPricingRow },
    { data: availableQuizzesRaw },
  ] = await Promise.all([
    supabase
      .from("formations")
      .select("*, category:formation_categories(id, name)")
      .neq("status", "archived")
      .order("title", { ascending: true }),
    supabase
      .from("formation_locations")
      .select(
        "id, name, kind, address, postal_code, city, capacity, pmr_accessible",
      )
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("trainers")
      .select("id, first_name, last_name, company_name")
      .eq("is_active", true)
      .order("last_name", { ascending: true }),
    supabase
      .from("companies")
      .select("id, name, type")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("session_enrollments")
      .select(
        "*, learner:learners(id, first_name, last_name, email, company:companies(name))",
      )
      .eq("session_id", id)
      .order("enrolled_at", { ascending: true }),
    supabase
      .from("session_days")
      .select("*")
      .eq("session_id", id)
      .order("day_date", { ascending: true }),
    supabase
      .from("inscription_requests")
      .select("id, learner_id")
      .eq("target_session_id", id),
    // Horaires par défaut "maison" de l'organisation
    supabase
      .from("organizations")
      .select(
        "default_morning_start, default_morning_end, default_afternoon_start, default_afternoon_end",
      )
      .eq("id", session.organization_id)
      .maybeSingle(),
    // Statuts de session personnalisés de l'organisation
    supabase
      .from("session_statuses")
      .select("*")
      .eq("organization_id", session.organization_id)
      .order("position", { ascending: true }),
    // Tarifs par défaut de l'organisation (R7 — bloc Tarification)
    supabase
      .from("organization_pricing_defaults")
      .select(
        "inter_presentiel_per_day_ht, inter_distanciel_per_day_ht, intra_presentiel_forfait_ht, intra_presentiel_extra_per_day_ht, intra_distanciel_forfait_ht, intra_distanciel_extra_per_day_ht, intra_forfait_threshold",
      )
      .eq("organization_id", session.organization_id)
      .maybeSingle(),
    // Quiz publiés disponibles pour rattachement à la session
    supabase
      .from("quiz_templates")
      .select("id, title")
      .eq("organization_id", session.organization_id)
      .eq("status", "published")
      .order("title", { ascending: true }),
  ]);
  const availableQuizzes = (availableQuizzesRaw ?? []) as Array<{
    id: string;
    title: string;
  }>;

  // Templates de positionnement (migration 0105 — peut ne pas exister
  // en local, on charge en mode best-effort)
  let availablePositioningTemplates: Array<{
    id: string;
    title: string;
    is_default: boolean;
  }> = [];
  let formationPositioningTemplate: { id: string; title: string } | null =
    null;
  try {
    const [{ data: tplList }, { data: formationRow }] = await Promise.all([
      supabase
        .from("positioning_templates")
        .select("id, title, is_default")
        .eq("organization_id", session.organization_id)
        .neq("status", "archived")
        .order("is_default", { ascending: false })
        .order("title", { ascending: true }),
      session.formation?.id
        ? supabase
            .from("formations")
            .select(
              "positioning_template_id, positioning_template:positioning_templates!positioning_template_id(id, title)",
            )
            .eq("id", session.formation.id)
            .maybeSingle<{
              positioning_template_id: string | null;
              positioning_template: { id: string; title: string } | null;
            }>()
        : Promise.resolve({ data: null }),
    ]);
    availablePositioningTemplates = (tplList ?? []) as Array<{
      id: string;
      title: string;
      is_default: boolean;
    }>;
    formationPositioningTemplate =
      (formationRow?.positioning_template as
        | { id: string; title: string }
        | null) ?? null;
  } catch {
    /* migration 0105 absente — fallback silencieux */
  }

  const orgDefaultHours: OrgDefaultHours = {
    morning_start: trimTime(orgRow?.default_morning_start as string | null),
    morning_end: trimTime(orgRow?.default_morning_end as string | null),
    afternoon_start: trimTime(orgRow?.default_afternoon_start as string | null),
    afternoon_end: trimTime(orgRow?.default_afternoon_end as string | null),
  };
  const customStatuses = (customStatusesRaw ?? []) as SessionStatusDef[];

  // Tarifs ORG par défaut → bloc Tarification de la fiche session.
  // Fallback CAP NUMÉRIQUE si la ligne n'existe pas (sécurité).
  const p = orgPricingRow as {
    inter_presentiel_per_day_ht: number;
    inter_distanciel_per_day_ht: number;
    intra_presentiel_forfait_ht: number;
    intra_presentiel_extra_per_day_ht: number;
    intra_distanciel_forfait_ht: number;
    intra_distanciel_extra_per_day_ht: number;
    intra_forfait_threshold: number;
  } | null;
  const orgPricingDefaults = {
    interPresentielPerDay: p?.inter_presentiel_per_day_ht ?? 340,
    interDistancielPerDay: p?.inter_distanciel_per_day_ht ?? 305,
    intraPresentielForfait: p?.intra_presentiel_forfait_ht ?? 1250,
    intraPresentielExtraPerDay: p?.intra_presentiel_extra_per_day_ht ?? 175,
    intraDistancielForfait: p?.intra_distanciel_forfait_ht ?? 990,
    intraDistancielExtraPerDay: p?.intra_distanciel_extra_per_day_ht ?? 150,
    threshold: p?.intra_forfait_threshold ?? 4,
  };

  // Nombre d'apprenants facturables (hors annulés/absents/abandonnés)
  // pour le preview du total dans le bloc Tarification. Aligné avec la
  // logique du tableau Participants.
  const billableStatuses = new Set([
    "preinscrit",
    "option",
    "confirmed",
    "convoque",
    "in_progress",
    "completed",
  ]);
  const currentNbApprenants = (enrollments ?? []).filter((e) =>
    billableStatuses.has((e as { status: string }).status),
  ).length;

  // ----- Notes (session_notes + session_enrollment_notes) -----
  const enrollmentList = (enrollments ?? []) as unknown as Array<{
    id: string;
    learner_id: string;
    learner: {
      id: string;
      first_name: string | null;
      last_name: string;
    } | null;
  }>;
  const enrollmentIds = enrollmentList.map((e) => e.id);

  const [{ data: sessionNotesRaw }, { data: enrollmentNotesRaw }] =
    await Promise.all([
      supabase
        .from("session_notes")
        .select("*")
        .eq("session_id", id)
        .order("created_at", { ascending: false }),
      enrollmentIds.length
        ? supabase
            .from("session_enrollment_notes")
            .select("*")
            .in("enrollment_id", enrollmentIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as SessionEnrollmentNote[] }),
    ]);

  const allNotes = [
    ...((sessionNotesRaw ?? []) as SessionNote[]),
    ...((enrollmentNotesRaw ?? []) as SessionEnrollmentNote[]),
  ];
  const authorIds = Array.from(
    new Set(
      allNotes
        .map((n) => n.created_by)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const authorNameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", authorIds);
    for (const p of (profiles ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>) {
      const name =
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        p.email ||
        null;
      if (name) authorNameById.set(p.id, name);
    }
  }

  function withAuthor<T extends { created_by: string | null }>(n: T): T & {
    author_name: string | null;
  } {
    return {
      ...n,
      author_name: n.created_by ? authorNameById.get(n.created_by) ?? null : null,
    };
  }

  const sessionNotes: NoteCardItem[] = (
    (sessionNotesRaw ?? []) as SessionNote[]
  ).map((n) => withAuthor(n));

  const notesByEnrollment = new Map<string, NoteCardItem[]>();
  for (const n of (enrollmentNotesRaw ?? []) as SessionEnrollmentNote[]) {
    const list = notesByEnrollment.get(n.enrollment_id) ?? [];
    list.push(withAuthor(n));
    notesByEnrollment.set(n.enrollment_id, list);
  }

  const enrollmentsForPanel = enrollmentList
    .map((e) => {
      const learnerLabel = e.learner
        ? `${e.learner.first_name ?? ""} ${e.learner.last_name}`.trim()
        : "Apprenant";
      return {
        enrollment_id: e.id,
        learner_id: e.learner_id,
        learner_label: learnerLabel,
        notes: notesByEnrollment.get(e.id) ?? [],
      };
    })
    .sort((a, b) => a.learner_label.localeCompare(b.learner_label, "fr"));

  const update = updateSession.bind(null, id);
  const remove = deleteSession.bind(null, id);
  const duplicate = duplicateSession.bind(null, id);
  const toggleArchive = toggleArchiveSession.bind(null, id);
  const confirmAction = confirmSessionFormAction.bind(null, id);
  const isArchived = session.status === "archived";
  const isConfirmed = session.status === "confirmed";
  const canConfirm =
    !isArchived &&
    session.status !== "completed" &&
    session.status !== "cancelled";

  const title = session.formation?.title ?? "Session";
  const notifs = Object.entries(query)
    .filter(([key, value]) => value && MESSAGES[key])
    .map(([key]) => MESSAGES[key]);

  // === Méta-infos d'en-tête (date, modalité, lieu, durée) ===
  // Délégué au composant partagé `_session-header-meta` pour que ces
  // infos restent visibles sur TOUS les onglets de session, pas seulement
  // sur la Fiche (refactor 2026-05-13).

  return (
    <>
      <PageHeader
        title={title}
        description={<SessionHeaderMeta sessionId={id} />}
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Sessions", href: "/sessions" },
          { label: title },
        ]}
        actions={
          <>
            <BackButton fallbackHref="/sessions" />
            {canConfirm && (
              <form action={confirmAction}>
                <Button
                  type="submit"
                  variant={isConfirmed ? "outline" : "default"}
                  size="sm"
                  className={
                    isConfirmed
                      ? ""
                      : "bg-emerald-600 hover:bg-emerald-700 text-white"
                  }
                  title={
                    isConfirmed
                      ? "Renvoyer la convocation au formateur (et conserver le statut confirmé)"
                      : "Passer le statut en 'confirmée' et envoyer la convocation au formateur par email"
                  }
                >
                  {isConfirmed ? (
                    <>
                      <Send className="h-4 w-4" />
                      Renvoyer convocation formateur
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Confirmer la session
                    </>
                  )}
                </Button>
              </form>
            )}
            <form action={duplicate}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                title="Créer une nouvelle session basée sur celle-ci"
              >
                <Copy className="h-4 w-4" />
                Dupliquer
              </Button>
            </form>
            <form action={toggleArchive}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                title={
                  isArchived
                    ? "Réactiver cette session (sortie d'archive)"
                    : "Archiver cette session (la masque du tableau d'inscriptions). La fiche reste accessible via son URL."
                }
              >
                {isArchived ? (
                  <>
                    <ArchiveRestore className="h-4 w-4" />
                    Désarchiver
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" />
                    Archiver
                  </>
                )}
              </Button>
            </form>
            <form action={remove}>
              <Button type="submit" variant="outline" size="sm">
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            </form>
            <Button
              type="submit"
              size="sm"
              form="form-session"
              title="Enregistrer les modifications de la session"
            >
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </>
        }
      />

      <SessionTabs
        sessionId={id}
        counts={{
          // Dédup défensive : avec la sync bidirectionnelle (0057), chaque
          // enrollment a sa request miroir. On ne compte pas deux fois la
          // même personne.
          participants: (() => {
            const enrolledLearnerIds = new Set(
              (enrollments ?? [])
                .map((e) => (e as { learner_id: string | null }).learner_id)
                .filter((id): id is string => Boolean(id)),
            );
            const pendingNotDuplicated = (inscriptionRequests ?? []).filter(
              (r) => {
                const lid = (r as { learner_id: string | null }).learner_id;
                return !lid || !enrolledLearnerIds.has(lid);
              },
            );
            return (enrollments?.length ?? 0) + pendingNotDuplicated.length;
          })(),
        }}
      />

      <div className="p-8 max-w-4xl space-y-6">
        {isArchived && (
          <div className="rounded-xl bg-slate-100 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 p-4 text-sm flex items-start gap-3">
            <Archive className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-slate-700 dark:text-slate-300">
                Session archivée
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Cette session est masquée du tableau d&apos;inscriptions et
                de la liste principale. Tu peux toujours rééditer ses
                documents (convention, attestation…) depuis cette fiche, ou
                cliquer sur <strong>« Désarchiver »</strong> pour la
                réactiver.
              </p>
            </div>
          </div>
        )}
        {notifs.map((msg, i) => (
          <div
            key={i}
            className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300"
          >
            {msg}
          </div>
        ))}
        {query.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {query.error}
          </div>
        )}
        {query.warning && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 p-4 text-sm text-amber-800 dark:text-amber-300">
            {query.warning}
          </div>
        )}

        {/* La zone "Inscrits" est désormais accessible exclusivement via
            l'onglet "Participants". On la retire de la Fiche pour éviter
            les doublons et alléger l'écran principal. */}

        {/* Notes internes — placées avant le formulaire pour être visibles
            dès l'ouverture de la session, sans avoir à scroller jusqu'en bas. */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <CollapsibleSection
            icon={StickyNote}
            title="Notes internes"
            description="Historique, points d'attention, organisation. Notes générales sur la session + notes partagées avec chaque apprenant inscrit."
            accent="amber"
            defaultOpen={
              sessionNotes.length > 0 ||
              enrollmentsForPanel.some((e) => e.notes.length > 0)
            }
            id="notes"
          >
            <SessionNotesPanel
              sessionId={id}
              sessionLabel={title}
              sessionNotes={sessionNotes}
              enrollments={enrollmentsForPanel}
            />
          </CollapsibleSection>
        </div>

        <SessionForm
          session={session}
          formations={(formations ?? []) as Formation[]}
          locations={locations ?? []}
          trainers={trainers ?? []}
          companies={companies ?? []}
          orgDefaultHours={orgDefaultHours}
          customStatuses={customStatuses}
          orgPricingDefaults={orgPricingDefaults}
          currentNbApprenants={currentNbApprenants}
          existingDays={(sessionDays ?? []) as SessionDay[]}
          availableQuizzes={availableQuizzes}
          availablePositioningTemplates={availablePositioningTemplates}
          formationPositioningTemplate={formationPositioningTemplate}
          action={update}
          submitLabel="Enregistrer"
        />
      </div>
    </>
  );
}
