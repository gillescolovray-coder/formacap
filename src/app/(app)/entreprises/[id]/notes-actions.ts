"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CompanyNoteAction } from "@/lib/companies/types";

const VALID_ACTIONS: CompanyNoteAction[] = [
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
 * Ajoute une note datée à une fiche entreprise.
 * `content` est requis ; les autres champs sont optionnels.
 */
export async function addCompanyNote(
  companyId: string,
  formData: FormData,
): Promise<Result> {
  try {
    const content = parseText(formData.get("content"));
    if (!content) {
      return { ok: false, error: "La note ne peut pas être vide." };
    }
    const rawAction = parseText(formData.get("action_type"));
    const action_type = (
      rawAction && VALID_ACTIONS.includes(rawAction as CompanyNoteAction)
        ? rawAction
        : null
    ) as CompanyNoteAction | null;
    const due_date = parseText(formData.get("due_date"));

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Non authentifié." };

    const { error } = await supabase.from("company_notes").insert({
      company_id: companyId,
      content,
      action_type,
      due_date,
      created_by: user.id,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    revalidatePath(`/entreprises/${companyId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Met à jour le contenu textuel d'une note existante.
 * Seul le champ `content` est modifiable (le type d'action et la date
 * d'échéance ne sont pas éditables après création — on créera une
 * nouvelle note pour suivre l'évolution).
 */
export async function updateCompanyNote(
  companyId: string,
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Non authentifié." };

    const { error } = await supabase
      .from("company_notes")
      .update({ content })
      .eq("id", noteId)
      .eq("company_id", companyId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/entreprises/${companyId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** Supprime une note. */
export async function deleteCompanyNote(
  companyId: string,
  formData: FormData,
): Promise<Result> {
  try {
    const noteId = parseText(formData.get("note_id"));
    if (!noteId) return { ok: false, error: "Note introuvable." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("company_notes")
      .delete()
      .eq("id", noteId)
      .eq("company_id", companyId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/entreprises/${companyId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
