import Link from "next/link";
import { Building2, Mail, Phone, Save, Smartphone, StickyNote, Trash2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LearnerForm } from "../_form";
import { deleteLearner, updateLearner } from "../actions";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/collapsible-section";
import { LearnerNotesPanel } from "./_notes-panel";
import type { NoteCardItem } from "@/components/notes/note-list-card";
import type { Learner } from "@/lib/learners/types";
import type { Company } from "@/lib/companies/types";
import type { LearnerNote, SessionEnrollmentNote } from "@/lib/notes/types";

export default async function LearnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    error?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: learner, error } = await supabase
    .from("learners")
    .select("*")
    .eq("id", id)
    .maybeSingle<Learner>();

  if (error) throw error;
  if (!learner) notFound();

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("name", { ascending: true });

  // Notes générales sur l'apprenant
  const { data: learnerNotesRaw } = await supabase
    .from("learner_notes")
    .select("*")
    .eq("learner_id", id)
    .order("created_at", { ascending: false });

  // Inscriptions de l'apprenant + session + notes d'inscription
  const { data: enrollmentsRaw } = await supabase
    .from("session_enrollments")
    .select(
      `id, session_id, sessions ( id, start_date, end_date,
        formation:formations ( id, title ),
        location_id, location )`,
    )
    .eq("learner_id", id);

  const enrollmentIds = (enrollmentsRaw ?? []).map(
    (e: { id: string }) => e.id,
  );
  const { data: enrollmentNotesRaw } = enrollmentIds.length
    ? await supabase
        .from("session_enrollment_notes")
        .select("*")
        .in("enrollment_id", enrollmentIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Consultations du portail apprenant (Gilles 2026-06-25) : date/heure +
  // session sur laquelle l'apprenant a cliqué.
  const formationByEnr = new Map<string, string>();
  for (const e of (enrollmentsRaw ?? []) as Array<{
    id: string;
    sessions: { formation: { title: string | null } | { title: string | null }[] | null } | { formation: unknown }[] | null;
  }>) {
    const s = Array.isArray(e.sessions) ? e.sessions[0] : e.sessions;
    const f = s
      ? Array.isArray((s as { formation: unknown }).formation)
        ? ((s as { formation: { title: string | null }[] }).formation[0] ?? null)
        : ((s as { formation: { title: string | null } | null }).formation ?? null)
      : null;
    formationByEnr.set(e.id, f?.title ?? "Session");
  }
  const portalVisitHistory: Array<{
    visited_at: string;
    formation: string;
  }> = [];
  if (enrollmentIds.length) {
    const { data: lv } = await supabase
      .from("learner_portal_visits")
      .select("enrollment_id, visited_at")
      .in("enrollment_id", enrollmentIds)
      .order("visited_at", { ascending: false })
      .limit(100);
    for (const v of (lv ?? []) as Array<{
      enrollment_id: string | null;
      visited_at: string;
    }>) {
      portalVisitHistory.push({
        visited_at: v.visited_at,
        formation: v.enrollment_id
          ? formationByEnr.get(v.enrollment_id) ?? "Session"
          : "Session",
      });
    }
  }

  // Résolution des noms d'auteur (pour learner_notes + enrollment_notes)
  const allNotes = [
    ...((learnerNotesRaw ?? []) as LearnerNote[]),
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

  const learnerNotes: NoteCardItem[] = (
    (learnerNotesRaw ?? []) as LearnerNote[]
  ).map((n) => withAuthor(n));

  const notesByEnrollment = new Map<string, NoteCardItem[]>();
  for (const n of (enrollmentNotesRaw ?? []) as SessionEnrollmentNote[]) {
    const list = notesByEnrollment.get(n.enrollment_id) ?? [];
    list.push(withAuthor(n));
    notesByEnrollment.set(n.enrollment_id, list);
  }

  type RawEnrollment = {
    id: string;
    session_id: string;
    sessions: {
      id: string;
      start_date: string;
      end_date: string;
      formation: { id: string; title: string } | null;
      location: string | null;
    } | null;
  };
  const enrollmentsForPanel = ((enrollmentsRaw ?? []) as unknown as RawEnrollment[])
    .map((e) => {
      const session = e.sessions;
      const title = session?.formation?.title ?? "Session";
      const dateLabel = session
        ? `${new Date(session.start_date).toLocaleDateString("fr-FR")} → ${new Date(session.end_date).toLocaleDateString("fr-FR")}`
        : null;
      return {
        enrollment_id: e.id,
        session_id: e.session_id,
        session_label: title,
        session_date_label: dateLabel,
        notes: notesByEnrollment.get(e.id) ?? [],
      };
    })
    .sort((a, b) => a.session_label.localeCompare(b.session_label, "fr"));

  const update = updateLearner.bind(null, id);
  const remove = deleteLearner.bind(null, id);

  const fullName = [learner.civility, learner.first_name, learner.last_name]
    .filter(Boolean)
    .join(" ");

  // Récap entreprise rattachée (pour le bandeau d'en-tête).
  const company =
    (companies ?? []).find((c) => c.id === learner.company_id) ?? null;

  // Titre enrichi : nom complet en gros + fonction en plus petit (la
  // société n'est PAS répétée dans le titre — elle figure déjà dans la
  // description ci-dessous avec son lien cliquable).
  const headerTitle = (
    <span className="inline-flex items-baseline gap-2 flex-wrap">
      <span>{fullName}</span>
      {learner.job_title && (
        <span className="text-sm font-semibold text-slate-500">
          · {learner.job_title}
        </span>
      )}
    </span>
  );

  // Description : Tél / Mobile / Email avec icônes.
  const headerDescription = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {learner.phone && (
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <Phone className="h-3.5 w-3.5 text-slate-400" />
          <a
            href={`tel:${learner.phone}`}
            className="font-mono font-semibold hover:text-cyan-700"
          >
            {learner.phone}
          </a>
        </span>
      )}
      {learner.mobile && (
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <Smartphone className="h-3.5 w-3.5 text-slate-400" />
          <a
            href={`tel:${learner.mobile}`}
            className="font-mono font-semibold hover:text-cyan-700"
          >
            {learner.mobile}
          </a>
        </span>
      )}
      {learner.email && (
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <Mail className="h-3.5 w-3.5 text-slate-400" />
          <a
            href={`mailto:${learner.email}`}
            className="hover:text-cyan-700"
          >
            {learner.email}
          </a>
        </span>
      )}
      {company && (
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <Building2 className="h-3.5 w-3.5 text-slate-400" />
          <Link
            href={`/entreprises/${company.id}`}
            className="font-semibold text-cyan-700 hover:underline"
          >
            {company.name}
          </Link>
        </span>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title={headerTitle}
        description={headerDescription}
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Apprenants", href: "/apprenants" },
          { label: fullName },
        ]}
        actions={
          <>
            <BackButton fallbackHref="/apprenants" />
            <form action={remove}>
              <Button type="submit" variant="outline" size="sm">
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            </form>
            <Button
              type="submit"
              size="sm"
              form="form-learner"
              title="Enregistrer les modifications"
            >
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </>
        }
      />

      <div className="p-8 max-w-4xl space-y-6">
        {query.created && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Apprenant créé avec succès.
          </div>
        )}
        {query.updated && (
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Modifications enregistrées.
          </div>
        )}
        {query.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {query.error}
          </div>
        )}
        {/* Consultations du portail apprenant (Gilles 2026-06-25) */}
        {portalVisitHistory.length > 0 && (
          <details className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              📱 Consultations du portail apprenant
              <span className="ml-2 text-xs font-normal text-zinc-500">
                ({portalVisitHistory.length} visite
                {portalVisitHistory.length > 1 ? "s" : ""})
              </span>
            </summary>
            <div className="border-t border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 max-h-72 overflow-y-auto">
              {portalVisitHistory.map((v, i) => (
                <div
                  key={i}
                  className="px-4 py-2 flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-zinc-600 dark:text-zinc-300 truncate">
                    {v.formation}
                  </span>
                  <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                    {new Date(v.visited_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8">
          <LearnerForm
            learner={learner}
            companies={(companies ?? []) as Company[]}
            action={update}
            submitLabel="Enregistrer"
            notesSlot={
              <CollapsibleSection
                icon={StickyNote}
                title="Notes internes"
                description="Historique, points d'attention, suivi commercial. Notes générales sur l'apprenant + notes partagées avec chaque session inscrite."
                accent="amber"
                defaultOpen={
                  learnerNotes.length > 0 ||
                  enrollmentsForPanel.some((e) => e.notes.length > 0)
                }
                id="notes"
              >
                <LearnerNotesPanel
                  learnerId={id}
                  learnerName={fullName}
                  learnerNotes={learnerNotes}
                  enrollments={enrollmentsForPanel}
                />
              </CollapsibleSection>
            }
          />
        </div>
      </div>
    </>
  );
}
