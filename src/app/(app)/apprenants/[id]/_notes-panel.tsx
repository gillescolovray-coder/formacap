import { Calendar } from "lucide-react";
import Link from "next/link";
import { NoteListCard, type NoteCardItem } from "@/components/notes/note-list-card";
import {
  addLearnerNote,
  deleteLearnerNote,
  updateLearnerNote,
} from "./notes-actions";
import {
  addEnrollmentNote,
  deleteEnrollmentNote,
  updateEnrollmentNote,
} from "@/lib/notes/enrollment-actions";

type EnrollmentWithNotes = {
  enrollment_id: string;
  session_id: string;
  session_label: string;
  session_date_label: string | null;
  notes: NoteCardItem[];
};

type Props = {
  learnerId: string;
  learnerName: string;
  learnerNotes: NoteCardItem[];
  enrollments: EnrollmentWithNotes[];
};

/**
 * Bloc « Notes » de la fiche apprenant.
 * - 1 carte amber pour les notes générales (table learner_notes)
 * - 1 carte cyan par session inscrite, contenant les notes partagées
 *   avec la fiche session (table session_enrollment_notes)
 */
export function LearnerNotesPanel({
  learnerId,
  learnerName,
  learnerNotes,
  enrollments,
}: Props) {
  const addLearner = addLearnerNote.bind(null, learnerId);
  const updateLearner = updateLearnerNote.bind(null, learnerId);
  const deleteLearner = deleteLearnerNote.bind(null, learnerId);

  return (
    <div className="space-y-6">
      <NoteListCard
        panelId={`learner-${learnerId}`}
        notes={learnerNotes}
        addAction={addLearner}
        updateAction={updateLearner}
        deleteAction={deleteLearner}
        theme="amber"
        title="Nouvelle note sur l'apprenant"
        placeholder={`Ex : ${learnerName} — ne se sent pas à l'aise avec l'écrit, prévoir support audio.`}
        emptyText="Aucune note générale pour cet apprenant. Ajoutez la première ci-dessus."
      />

      {enrollments.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
            Notes partagées avec les sessions
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
                    href={`/sessions/${e.session_id}`}
                    className="inline-flex items-center gap-2 font-bold text-cyan-800 hover:text-cyan-950 hover:underline"
                  >
                    <Calendar className="h-4 w-4" />
                    {e.session_label}
                    {e.session_date_label && (
                      <span className="text-xs font-normal text-slate-500">
                        · {e.session_date_label}
                      </span>
                    )}
                  </Link>
                  <span className="text-[11px] text-slate-400 italic">
                    visible aussi sur la fiche session
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
                  placeholder="Ex : préfère arriver à 9h30 — vu avec le RH."
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
