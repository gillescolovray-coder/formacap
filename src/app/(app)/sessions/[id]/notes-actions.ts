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

export async function addSessionNote(
  sessionId: string,
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

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Non authentifié." };

    const { error } = await supabase.from("session_notes").insert({
      session_id: sessionId,
      content,
      action_type,
      due_date,
      created_by: user.id,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/sessions/${sessionId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function updateSessionNote(
  sessionId: string,
  formData: FormData,
): Promise<Result> {
  try {
    const noteId = parseText(formData.get("note_id"));
    if (!noteId) return { ok: false, error: "Note introuvable." };
    const content = parseText(formData.get("content"));
    if (!content) {
      return { ok: false, error: "La note ne peut pas être vide." };
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("session_notes")
      .update({ content })
      .eq("id", noteId)
      .eq("session_id", sessionId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/sessions/${sessionId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function deleteSessionNote(
  sessionId: string,
  formData: FormData,
): Promise<Result> {
  try {
    const noteId = parseText(formData.get("note_id"));
    if (!noteId) return { ok: false, error: "Note introuvable." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("session_notes")
      .delete()
      .eq("id", noteId)
      .eq("session_id", sessionId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/sessions/${sessionId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
