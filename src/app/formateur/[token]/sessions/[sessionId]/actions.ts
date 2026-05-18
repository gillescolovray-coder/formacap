"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/csv",
];

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

/**
 * Validation token portail formateur + appartenance session.
 * Renvoie l'objet trainer + session si tout est OK, sinon redirige.
 */
async function validateTrainerAccess(
  supabase: ReturnType<typeof createAdminClient>,
  token: string,
  sessionId: string,
): Promise<{ trainerId: string; organizationId: string } | null> {
  const { data: tokenRow } = await supabase
    .from("trainer_portal_tokens")
    .select("trainer_id")
    .eq("token", token)
    .maybeSingle<{ trainer_id: string }>();
  if (!tokenRow) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("trainer_id, organization_id")
    .eq("id", sessionId)
    .maybeSingle<{ trainer_id: string | null; organization_id: string }>();
  if (!session || session.trainer_id !== tokenRow.trainer_id) {
    return null;
  }

  return {
    trainerId: tokenRow.trainer_id,
    organizationId: session.organization_id,
  };
}

/**
 * Upload d'un support depuis le portail formateur. Le document est
 * automatiquement marqué `visibility = 'shared_with_learners'` pour
 * apparaître dans le portail apprenant.
 */
export async function uploadSupportAsTrainer(
  token: string,
  sessionId: string,
  formData: FormData,
) {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent("Accès refusé")}`,
    );
  }

  const file = formData.get("file") as File | null;
  const description =
    (formData.get("description") as string)?.trim() || null;

  if (!file || file.size === 0) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent("Aucun fichier sélectionné")}`,
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent("Fichier trop volumineux (max 10 Mo)")}`,
    );
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent("Format non supporté (PDF, Word, Excel, image…)")}`,
    );
  }

  const sanitized = sanitizeFileName(file.name);
  const storagePath = `${ctx.organizationId}/${sessionId}/${Date.now()}-${sanitized}`;

  const { error: uploadError } = await supabase.storage
    .from("session-documents")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  const { error: insertError } = await supabase
    .from("session_documents")
    .insert({
      session_id: sessionId,
      organization_id: ctx.organizationId,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      description,
      // Upload depuis portail formateur = visible apprenants par défaut
      visibility: "shared_with_learners",
      is_training_program: false,
      // uploaded_by null car le formateur n'a pas de compte Supabase Auth.
      // L'origine est tracée via les conditions (visibility + token utilisé).
      uploaded_by: null,
    });
  if (insertError) {
    await supabase.storage.from("session-documents").remove([storagePath]);
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent(insertError.message)}`,
    );
  }

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  redirect(
    `/formateur/${token}/sessions/${sessionId}?uploaded=1`,
  );
}

/**
 * Toggle de la visibilité d'un document depuis le portail formateur.
 * Le formateur ne peut modifier QUE ses propres uploads
 * (documents avec uploaded_by IS NULL — pattern formateur sans
 * compte Supabase Auth).
 */
export async function toggleDocumentVisibilityAsTrainer(
  token: string,
  sessionId: string,
  documentId: string,
) {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent("Accès refusé")}`,
    );
  }

  const { data: doc } = await supabase
    .from("session_documents")
    .select("visibility, session_id, uploaded_by")
    .eq("id", documentId)
    .maybeSingle<{
      visibility: string;
      session_id: string;
      uploaded_by: string | null;
    }>();
  if (!doc || doc.session_id !== sessionId) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent("Document introuvable")}`,
    );
  }
  // Restriction : seuls les uploads du formateur (uploaded_by NULL)
  // peuvent être modifiés depuis ce portail.
  if (doc!.uploaded_by !== null) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent("Ce document a été ajouté par l'organisme — vous ne pouvez pas modifier sa visibilité.")}`,
    );
  }

  const next =
    doc!.visibility === "shared_with_learners"
      ? "internal"
      : "shared_with_learners";
  await supabase
    .from("session_documents")
    .update({ visibility: next })
    .eq("id", documentId);

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  redirect(`/formateur/${token}/sessions/${sessionId}`);
}

/**
 * Suppression d'un support partagé que le formateur a uploadé.
 * (V1 : le formateur peut supprimer tout support partagé de la
 * session — restriction stricte par formateur reportée à V2.)
 */
export async function deleteSupportAsTrainer(
  token: string,
  sessionId: string,
  documentId: string,
) {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent("Accès refusé")}`,
    );
  }

  const { data: doc } = await supabase
    .from("session_documents")
    .select("storage_path, session_id")
    .eq("id", documentId)
    .maybeSingle<{ storage_path: string; session_id: string }>();
  if (!doc || doc.session_id !== sessionId) {
    redirect(`/formateur/${token}/sessions/${sessionId}`);
  }

  await supabase.storage
    .from("session-documents")
    .remove([doc!.storage_path]);
  await supabase.from("session_documents").delete().eq("id", documentId);

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  redirect(
    `/formateur/${token}/sessions/${sessionId}?deleted=1`,
  );
}

/**
 * Signe une demi-journée côté formateur depuis son portail.
 *
 * Règle métier R9 : la signature doit être tracée en direct via
 * SignaturePad, jamais une image préenregistrée réutilisée.
 *
 * Sécurité : le token vaut authentification, on vérifie l'appartenance
 * et qu'aucune signature formateur n'existe déjà pour cette demi-journée
 * (pour cet apprenant).
 */
export type TrainerSignResult = {
  ok: boolean;
  error?: string;
};

/**
 * Variante "signature collective" : le formateur signe une fois
 * une demi-journée, et la même signature est enregistrée pour
 * tous les apprenants inscrits à cette session.
 *
 * Pratique pour Qualiopi : le formateur certifie "j'ai dispensé
 * cette demi-journée de cours", indépendamment de la présence
 * effective de chaque apprenant (qui est attestée par sa propre
 * signature).
 */
export async function signSlotForAllAsTrainer(params: {
  token: string;
  sessionId: string;
  periodDate: string;
  moment: "morning" | "afternoon";
  signerName: string;
  signatureDataUrl: string;
}): Promise<TrainerSignResult> {
  const {
    token,
    sessionId,
    periodDate,
    moment,
    signerName,
    signatureDataUrl,
  } = params;

  if (!signatureDataUrl?.startsWith("data:image/")) {
    return { ok: false, error: "Signature invalide." };
  }
  if (signatureDataUrl.length > 500_000) {
    return { ok: false, error: "Signature trop volumineuse." };
  }
  if (!signerName || signerName.trim().length < 2) {
    return { ok: false, error: "Nom du formateur manquant." };
  }

  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  // Vérifier que la date est un jour de la session
  const { data: day } = await supabase
    .from("session_days")
    .select("day_date")
    .eq("session_id", sessionId)
    .eq("day_date", periodDate)
    .maybeSingle<{ day_date: string }>();
  if (!day) {
    return { ok: false, error: "Date hors de la session." };
  }

  // Récupérer tous les enrollments
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id")
    .eq("session_id", sessionId);
  const ids = ((enrollments ?? []) as Array<{ id: string }>).map((e) => e.id);
  if (ids.length === 0) {
    return { ok: false, error: "Aucun apprenant inscrit." };
  }

  // Identifier les enrollments qui n'ont pas encore de signature formateur
  // pour ce slot (idempotent : on n'écrase pas l'existant).
  const { data: existing } = await supabase
    .from("attendance_signatures")
    .select("enrollment_id")
    .in("enrollment_id", ids)
    .eq("period_date", periodDate)
    .eq("moment", moment)
    .eq("signer_role", "trainer");
  const alreadySigned = new Set(
    ((existing ?? []) as Array<{ enrollment_id: string }>).map(
      (r) => r.enrollment_id,
    ),
  );
  const toInsert = ids.filter((id) => !alreadySigned.has(id));

  if (toInsert.length === 0) {
    return {
      ok: false,
      error: "Vous avez déjà signé cette demi-journée pour tous les apprenants.",
    };
  }

  const rows = toInsert.map((eid) => ({
    enrollment_id: eid,
    period_date: periodDate,
    moment,
    signer_role: "trainer" as const,
    signer_name: signerName.trim(),
    signature_data: signatureDataUrl,
  }));

  const { error: insertError } = await supabase
    .from("attendance_signatures")
    .insert(rows);
  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  revalidatePath(`/formateur/${token}/sessions/${sessionId}/emargement`);
  return { ok: true };
}

export async function signAttendanceAsTrainer(params: {
  token: string;
  sessionId: string;
  enrollmentId: string;
  periodDate: string;
  moment: "morning" | "afternoon";
  signerName: string;
  signatureDataUrl: string;
}): Promise<TrainerSignResult> {
  const {
    token,
    sessionId,
    enrollmentId,
    periodDate,
    moment,
    signerName,
    signatureDataUrl,
  } = params;

  if (!signatureDataUrl?.startsWith("data:image/")) {
    return { ok: false, error: "Signature invalide." };
  }
  if (signatureDataUrl.length > 500_000) {
    return { ok: false, error: "Signature trop volumineuse." };
  }
  if (!signerName || signerName.trim().length < 2) {
    return { ok: false, error: "Nom du formateur manquant." };
  }

  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  // Vérifier que l'enrollment appartient bien à la session
  const { data: enr } = await supabase
    .from("session_enrollments")
    .select("session_id")
    .eq("id", enrollmentId)
    .maybeSingle<{ session_id: string }>();
  if (!enr || enr.session_id !== sessionId) {
    return { ok: false, error: "Apprenant invalide pour cette session." };
  }

  // Vérifier qu'il n'existe pas déjà une signature formateur pour ce slot
  const { data: existing } = await supabase
    .from("attendance_signatures")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("period_date", periodDate)
    .eq("moment", moment)
    .eq("signer_role", "trainer")
    .maybeSingle<{ id: string }>();
  if (existing) {
    return {
      ok: false,
      error: "Vous avez déjà signé cette demi-journée pour cet apprenant.",
    };
  }

  const { error: insertError } = await supabase
    .from("attendance_signatures")
    .insert({
      enrollment_id: enrollmentId,
      period_date: periodDate,
      moment,
      signer_role: "trainer",
      signer_name: signerName.trim(),
      signature_data: signatureDataUrl,
    });
  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  return { ok: true };
}
