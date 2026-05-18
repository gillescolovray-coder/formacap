import { User } from "lucide-react";
import Link from "next/link";
import { NoteListCard, type NoteCardItem } from "@/components/notes/note-list-card";
import {
  addSessionNote,
  deleteSessionNote,
  updateSessionNote,
} from "./notes-actions";
import {
  addEnrollmentNote,
  deleteEnrollmentNote,
  updateEnrollmentNote,
} from "@/lib/notes/enrollment-actions";

type EnrollmentWithNotes = {
  enrollment_id: string;
  learner_id: string;
  learner_label: string;
  notes: NoteCardItem[];
};

type Props = {
  sessionId: string;
  sessionLabel: string;
  sessionNotes: NoteCardItem[];
  enrollments: EnrollmentWithNotes[];
};

/**
 * Bloc « Notes » de la fiche session.
 * - 1 carte amber pour les notes générales (table session_notes)
 * - 1 carte cyan par apprenant inscrit, contenant les notes partagées
 *   avec la fiche apprenant (table session_enrollment_notes)
 */
export function SessionNotesPanel({
  sessionId,
  sessionLabel,
  sessionNotes,
  enrollments,
}: Props) {
  const addSess = addSessionNote.bind(null, sessionId);
  const updSess = updateSessionNote.bind(null, sessionId);
  const delSess = deleteSessionNote.bind(null, sessionId);

  return (
    <div className="space-y-6">
      <NoteListCard
        panelId={`session-${sessionId}`}
        notes={sessionNotes}
        addAction={addSess}
        updateAction={updSess}
        deleteAction={delSess}
        theme="amber"
        title="Nouvelle note sur la session"
        placeholder={`Ex : ${sessionLabel} — salle déplacée au 2e étage à partir du jour 2.`}
        emptyText="Aucune note générale pour cette session. Ajoutez la première ci-dessus."
      />

      {enrollments.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
            Notes partagées avec les apprenants
          </p>
          {enrollments.map((e) => {
            const addEnr = addEnrollmentNote.bind(null, e.enrollment_id);
            const updEnr = updateEnrollmentNote.bind(null, e.enrollment_id);
            const delEnr = deleteEnrollmentNote.bind(null, e.enrollment_id);
            return (
              <div
                key={e.enrollment_id}
                className="rounded-lg border border-cyan-200 bg-white p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/apprenants/${e.learner_id}`}
                    className="inline-flex items-center gap-2 font-bold text-cyan-800 hover:text-cyan-950 hover:underline"
                  >
                    <User className="h-4 w-4" />
                    {e.learner_label}
                  </Link>
                  <span className="text-[11px] text-slate-400 italic">
                    visible aussi sur la fiche apprenant
                  </span>
                </div>
                <NoteListCard
                  panelId={`enr-${e.enrollment_id}`}
                  notes={e.notes}
                  addAction={addEnr}
                  updateAction={updEnr}
                  deleteAction={delEnr}
                  theme="cyan"
                  title="Nouvelle note d'inscription"
                  placeholder="Ex : besoin d'un logiciel spécifique installé sur son poste."
                  emptyText="Aucune note pour cette inscription."
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
