/**
 * Helper partagé : récupère le programme de formation officiel d'une
 * session sous forme de pièce jointe email (Buffer + nom de fichier).
 *
 * Logique de priorité :
 *  1. Document rattaché à la SESSION marqué comme programme officiel
 *     (`session_documents.is_training_program = true`)
 *  2. Fallback : PDF programme rattaché à la FORMATION côté catalogue
 *     (`formations.programme_pdf_url`)
 *
 * Utilisé par :
 *  - sendConvention (convention de formation envoyée au RH)
 *  - sendOneConvocation (convocation envoyée à l'apprenant)
 *
 * En cas d'erreur de lecture, log un warning et retourne null —
 * l'envoi continue sans la PJ (mieux vaut un email sans programme
 * qu'aucun email).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TrainingProgramAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export async function getTrainingProgramAttachment(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<TrainingProgramAttachment | null> {
  // Priorité 1 : document de la session marqué programme officiel
  const { data: programDoc } = await supabase
    .from("session_documents")
    .select("file_name, storage_path, mime_type")
    .eq("session_id", sessionId)
    .eq("is_training_program", true)
    .maybeSingle<{
      file_name: string;
      storage_path: string;
      mime_type: string | null;
    }>();

  if (programDoc?.storage_path) {
    const { data: blob, error: blobError } = await supabase.storage
      .from("session-documents")
      .download(programDoc.storage_path);
    if (!blobError && blob) {
      const buf = Buffer.from(await blob.arrayBuffer());
      return {
        filename: programDoc.file_name,
        content: buf,
        contentType: programDoc.mime_type ?? "application/pdf",
      };
    }
    console.warn(
      "[trainingProgram] Programme (session) introuvable dans Storage :",
      blobError?.message,
    );
    // On continue vers le fallback
  }

  // Priorité 2 : programme PDF du catalogue formation
  const { data: sessionRow } = await supabase
    .from("sessions")
    .select(
      "formation:formations(programme_pdf_url, programme_pdf_name, title)",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      formation: {
        programme_pdf_url: string | null;
        programme_pdf_name: string | null;
        title: string;
      } | null;
    }>();

  const programPdfUrl = sessionRow?.formation?.programme_pdf_url;
  if (!programPdfUrl) return null;

  try {
    const res = await fetch(programPdfUrl);
    if (!res.ok) {
      console.warn(
        "[trainingProgram] Programme (formation) HTTP",
        res.status,
      );
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const fallbackName =
      sessionRow.formation?.programme_pdf_name ??
      `programme-${(sessionRow.formation?.title ?? "formation")
        .replace(/[^a-z0-9]/gi, "-")
        .toLowerCase()}.pdf`;
    return {
      filename: fallbackName,
      content: buf,
      contentType: res.headers.get("content-type") ?? "application/pdf",
    };
  } catch (e) {
    console.warn(
      "[trainingProgram] Programme (formation) fetch échec :",
      (e as Error).message,
    );
    return null;
  }
}
