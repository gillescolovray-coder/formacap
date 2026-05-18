"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { NoteAction } from "@/lib/notes/types";

const VALID_ACTIONS: NoteAction[] = [
  "a_rappeler",
  "a_relancer",
  "rdv_planifie",
  "devis_envoye",
  "email_envoye",
  "document_recu",
  "info",
  "autre",
];

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

type Result = { ok: true } | { ok: false; error: string };

/**
 * Récupère (session_id, learner_id) pour une inscription donnée afin de
 * pouvoir invalider les deux fiches concernées.
 */
async function resolveEnrollment(enrollmentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_enrollments")
    .select("id, session_id, learner_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    session_id: string;
    learner_id: string;
  };
}

function revalidateBoth(sessionId: string, learnerId: string) {
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/apprenants/${learnerId}`);
}

/**
 * Ajoute une note partagée à une inscription (couple session ↔ apprenant).
 * La note apparaîtra sur la fiche apprenant ET sur la fiche session.
 */
export async function addEnrollmentNote(
  enrollmentId: string,
  formData: FormData,
): Promise<Result> {
  try {
    const content = parseText(formData.get("content"));
    if (!content) {
      return { ok: false, error: "La note ne peut pas être vide." };
    }
    const rawAction = parseText(formData.get("action_type"));
    const action_type = (
      rawAction && VALID_ACTIONS.includes(rawAction as NoteAction)
        ? rawAction
        : null
    ) as NoteAction | null;
    const due_date = parseText(formData.get("due_date"));

    const enrollment = await resolveEnrollment(enrollmentId);
    if (!enrollment) {
      return { ok: false, error: "Inscription introuvable." };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Non authentifié." };

    const { error } = await supabase.from("session_enrollment_notes").insert({
      enrollment_id: enrollmentId,
      content,
      action_type,
      due_date,
      created_by: user.id,
    });
    if (error) return { ok: false, error: error.message };

    revalidateBoth(enrollment.session_id, enrollment.learner_id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function updateEnrollmentNote(
  enrollmentId: string,
  formData: FormData,
): Promise<Result> {
  try {
    const noteId = parseText(formData.get("note_id"));
    if (!noteId) return { ok: false, error: "Note introuvable." };
    const content = parseText(formData.get("content"));
    if (!content) {
      return { ok: false, error: "La note ne peut pas être vide." };
    }
    const enrollment = await resolveEnrollment(enrollmentId);
    if (!enrollment) {
      return { ok: false, error: "Inscription introuvable." };
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("session_enrollment_notes")
      .update({ content })
      .eq("id", noteId)
      .eq("enrollment_id", enrollmentId);
    if (error) return { ok: false, error: error.message };
    revalidateBoth(enrollment.session_id, enrollment.learner_id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function deleteEnrollmentNote(
  enrollmentId: string,
  formData: FormData,
): Promise<Result> {
  try {
    const noteId = parseText(formData.get("note_id"));
    if (!noteId) return { ok: false, error: "Note introuvable." };
    const enrollment = await resolveEnrollment(enrollmentId);
    if (!enrollment) {
      return { ok: false, error: "Inscription introuvable." };
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("session_enrollment_notes")
      .delete()
      .eq("id", noteId)
      .eq("enrollment_id", enrollmentId);
    if (error) return { ok: false, error: error.message };
    revalidateBoth(enrollment.session_id, enrollment.learner_id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
