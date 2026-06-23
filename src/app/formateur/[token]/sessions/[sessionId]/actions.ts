"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import {
  createExpressLearnerForSession,
  ensureEnrollmentPortalToken,
  ensureQuickSignupToken,
} from "@/lib/portal/express-signup";
import {
  TRAINER_ADAPTATIONS,
  type PositioningTrainerObservation,
  type TrainerAdaptationValue,
} from "@/lib/positioning/types";
import type {
  AttendanceMoment,
  AttendanceStatus,
} from "@/lib/attendances/types";
import type { TrainerReport } from "@/lib/trainer-report/types";

const VALID_TRAINER_ADAPTATIONS = TRAINER_ADAPTATIONS.map((a) => a.value);

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
  // Archives ZIP (supports compressés). Le navigateur renvoie un type
  // variable pour les .zip -> on tolère aussi via l'extension ci-dessous.
  "application/zip",
  "application/x-zip-compressed",
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
  if (!session) return null;

  // Accès autorisé si formateur principal OU formateur d'au moins un jour
  // du planning détaillé (Gilles 2026-05-24).
  let authorized = session.trainer_id === tokenRow.trainer_id;
  if (!authorized) {
    const { data: dayAssign } = await supabase
      .from("session_days")
      .select("id")
      .eq("session_id", sessionId)
      .eq("trainer_id", tokenRow.trainer_id)
      .limit(1)
      .maybeSingle();
    authorized = !!dayAssign;
  }
  if (!authorized) return null;

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
  // ZIP : le type MIME renvoyé par le navigateur est incohérent
  // (application/zip, x-zip-compressed, voire octet-stream/vide) → on
  // accepte aussi sur l'extension .zip. Gilles 2026-06-05.
  const isZipByName = file.name.toLowerCase().endsWith(".zip");
  if (!ALLOWED_TYPES.includes(file.type) && !isZipByName) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent("Format non supporté (PDF, Word, Excel, image, ZIP…)")}`,
    );
  }

  // Cle d'idempotence (pattern Stripe / AWS, Gilles 2026-05-28) :
  // generee cote client a l'ouverture du formulaire, elle nous
  // permet de detecter un double-clic / retry reseau / refresh. Une
  // requete avec la meme cle est ignoree silencieusement.
  //
  // Si la cle est absente (vieux client cache, appel direct...) on
  // tombe sur un fallback temporel : pas d'insert si un meme
  // file_name a deja ete insere dans les 10 dernieres secondes pour
  // cette session.
  const clientRequestIdRaw = formData.get("client_request_id");
  const clientRequestId =
    typeof clientRequestIdRaw === "string" && clientRequestIdRaw.length > 0
      ? clientRequestIdRaw
      : null;

  if (clientRequestId) {
    const { data: existingByKey } = await supabase
      .from("session_documents")
      .select("id")
      .eq("client_request_id", clientRequestId)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (existingByKey) {
      // Idempotence : meme requete deja traitee -> on ne refait rien
      redirect(`/formateur/${token}/sessions/${sessionId}?uploaded=1`);
    }
  } else {
    const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
    const { data: recent } = await supabase
      .from("session_documents")
      .select("id")
      .eq("session_id", sessionId)
      .eq("file_name", file.name)
      .gte("created_at", tenSecondsAgo)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (recent) {
      redirect(`/formateur/${token}/sessions/${sessionId}?uploaded=1`);
    }
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
      // Cle d'idempotence (peut etre null pour rester compatible
      // avec des appels d'anciens clients en cache).
      client_request_id: clientRequestId,
    });
  if (insertError) {
    await supabase.storage.from("session-documents").remove([storagePath]);
    // Cas race condition : 2 requetes paralleles avec la meme cle
    // arrivent au check d'idempotence avant l'INSERT. L'unique index
    // sur client_request_id rejette le 2eme INSERT (code 23505 ou
    // message contenant "duplicate key"). On considere ca comme un
    // succes (la 1ere requete a deja insere).
    const isDup =
      insertError.code === "23505" ||
      (insertError.message ?? "").toLowerCase().includes("duplicate key");
    if (isDup) {
      redirect(`/formateur/${token}/sessions/${sessionId}?uploaded=1`);
    }
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent(insertError.message)}`,
    );
  }

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  redirect(
    `/formateur/${token}/sessions/${sessionId}?uploaded=1`,
  );
}

// ───────────────────────────────────────────────────────────────────
// Upload DIRECT vers le stockage (URL signée) — Gilles 2026-06-05.
// Pourquoi : un fichier volumineux (ZIP de supports…) qui transite par
// un Server Action dépasse la limite de corps de requête de Vercel
// (~4,5 Mo) -> erreur "This page couldn't load". On génère donc une URL
// d'upload signée côté serveur, le client envoie le fichier DIRECTEMENT
// au stockage (sans passer par le Server Action), puis on enregistre
// seulement les métadonnées (petit payload). Limite portée à 50 Mo.
// ───────────────────────────────────────────────────────────────────
const MAX_SUPPORT_SIZE = 50 * 1024 * 1024; // 50 Mo
const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".png", ".jpg", ".jpeg", ".webp", ".svg", ".txt", ".csv", ".zip",
];

function isAllowedSupport(fileName: string, fileType: string): boolean {
  const lower = fileName.toLowerCase();
  if (ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  return ALLOWED_TYPES.includes(fileType);
}

export async function createSupportUploadUrl(
  token: string,
  sessionId: string,
  fileName: string,
  fileType: string,
): Promise<
  { ok: true; path: string; uploadToken: string } | { ok: false; error: string }
> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };
  if (!fileName?.trim()) return { ok: false, error: "Nom de fichier manquant." };
  if (!isAllowedSupport(fileName, fileType)) {
    return {
      ok: false,
      error: "Format non supporté (PDF, Word, Excel, PowerPoint, image, ZIP…).",
    };
  }

  const sanitized = sanitizeFileName(fileName);
  const path = `${ctx.organizationId}/${sessionId}/${Date.now()}-${sanitized}`;
  const { data, error } = await supabase.storage
    .from("session-documents")
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Génération de l'URL impossible." };
  }
  return { ok: true, path: data.path, uploadToken: data.token };
}

export async function registerSupportDocument(
  token: string,
  sessionId: string,
  input: {
    path: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number;
    description: string | null;
    clientRequestId: string | null;
    /** "shared_with_learners" (support apprenant, défaut) ou "internal"
     *  (pièce du bilan, visible UNIQUEMENT par CAP — Gilles 2026-06-19). */
    visibility?: "shared_with_learners" | "internal";
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  if (input.sizeBytes > MAX_SUPPORT_SIZE) {
    await supabase.storage.from("session-documents").remove([input.path]);
    return { ok: false, error: "Fichier trop volumineux (max 50 Mo)." };
  }
  // Sécurité : le chemin doit bien appartenir à cette org + session.
  if (!input.path.startsWith(`${ctx.organizationId}/${sessionId}/`)) {
    return { ok: false, error: "Chemin de fichier invalide." };
  }

  // Idempotence (double-clic / retry)
  if (input.clientRequestId) {
    const { data: existing } = await supabase
      .from("session_documents")
      .select("id")
      .eq("client_request_id", input.clientRequestId)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (existing) {
      revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
      return { ok: true };
    }
  }

  const { error: insertError } = await supabase
    .from("session_documents")
    .insert({
      session_id: sessionId,
      organization_id: ctx.organizationId,
      file_name: input.fileName,
      storage_path: input.path,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      description: input.description,
      visibility: input.visibility ?? "shared_with_learners",
      is_training_program: false,
      uploaded_by: null,
      client_request_id: input.clientRequestId,
    });
  if (insertError) {
    const isDup =
      insertError.code === "23505" ||
      (insertError.message ?? "").toLowerCase().includes("duplicate key");
    if (isDup) {
      revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
      return { ok: true };
    }
    // Nettoie le fichier orphelin si l'insert échoue.
    await supabase.storage.from("session-documents").remove([input.path]);
    return { ok: false, error: insertError.message };
  }

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  return { ok: true };
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

/**
 * Sprint D Section 7 — Observation formateur sur un test de positionnement.
 * Auth via token portail formateur (pas de session Supabase).
 * (Gilles 2026-05-22)
 */
export async function saveTrainerObservationFromPortal(
  token: string,
  sessionId: string,
  enrollmentId: string,
  observation: PositioningTrainerObservation,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  // Vérifier que l'enrollment appartient bien à cette session
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select("id, session_id")
    .eq("id", enrollmentId)
    .maybeSingle<{ id: string; session_id: string }>();
  if (!enrollment || enrollment.session_id !== sessionId) {
    return { ok: false, error: "Enrollment introuvable pour cette session." };
  }

  const adaptations = (observation.adaptations ?? []).filter(
    (v): v is TrainerAdaptationValue =>
      VALID_TRAINER_ADAPTATIONS.includes(v as TrainerAdaptationValue),
  );
  const payload: PositioningTrainerObservation = {
    adaptations,
    other_adaptation_text:
      observation.other_adaptation_text?.trim() || undefined,
    trainer_comment: observation.trainer_comment?.trim() || undefined,
  };

  const { data: existing } = await supabase
    .from("positioning_responses")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle<{ id: string }>();

  const now = new Date().toISOString();
  if (existing) {
    const { error } = await supabase
      .from("positioning_responses")
      .update({
        trainer_observation: payload,
        trainer_filled_at: now,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("positioning_responses").insert({
      enrollment_id: enrollmentId,
      data: {},
      trainer_observation: payload,
      trainer_filled_at: now,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(
    `/formateur/${token}/sessions/${sessionId}/positionnement/${enrollmentId}`,
  );
  return { ok: true };
}

/**
 * Module 7 — Bilan formateur de fin de session.
 *
 * Upsert dans `session_trainer_reports` (1 ligne par session). Stocke
 * le contenu structuré dans la colonne JSONB `report` + métadonnées
 * de signature (nom, data URL, signed_at).
 *
 * Couvre Qualiopi RNQ ind. 11 / 22 / 32. Gilles 2026-05-23.
 */
export async function saveTrainerReportFromPortal(
  token: string,
  sessionId: string,
  report: TrainerReport,
  signerName: string,
  signatureDataUrl?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  // Validation signature optionnelle
  let signature: string | null = null;
  if (signatureDataUrl && signatureDataUrl.length > 0) {
    if (!signatureDataUrl.startsWith("data:image/")) {
      return { ok: false, error: "Signature invalide." };
    }
    if (signatureDataUrl.length > 500_000) {
      return { ok: false, error: "Signature trop volumineuse." };
    }
    signature = signatureDataUrl;
  }
  if (!signerName || signerName.trim().length < 2) {
    return { ok: false, error: "Nom du formateur manquant." };
  }

  // Nettoyage : trim sur tous les champs texte
  const cleaned: TrainerReport = {
    objectives_reached: report.objectives_reached,
    objectives_comment: report.objectives_comment?.trim() || undefined,
    group_level: report.group_level?.trim() || undefined,
    adaptations_made: report.adaptations_made?.trim() || undefined,
    engagement_dynamics: report.engagement_dynamics?.trim() || undefined,
    difficulties: report.difficulties?.trim() || undefined,
    improvements: report.improvements?.trim() || undefined,
    learner_recommendations: report.learner_recommendations?.trim() || undefined,
  };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("session_trainer_reports")
    .upsert(
      {
        session_id: sessionId,
        organization_id: ctx.organizationId,
        trainer_id: ctx.trainerId,
        report: cleaned,
        signer_name: signerName.trim(),
        signature_data: signature,
        signed_at: signature ? now : null,
        updated_at: now,
      },
      { onConflict: "session_id" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  return { ok: true };
}

// ============================================================
// Phases A / B / C — Alignement émargement formateur ↔ admin
//
// Toutes les actions ci-dessous reproduisent les actions admin
// (cf. src/app/(app)/sessions/[id]/emargement/{actions,signatures/actions}.ts)
// avec validation par TOKEN PORTAIL FORMATEUR au lieu d'auth Supabase.
// Pour `marked_by` / `created_by` qui réfèrent à un profile : on
// passe `null` (les colonnes sont nullable) — la traçabilité passe
// par le token utilisé + l'IP + le user-agent.
// ============================================================

const MAX_SIGNATURE_BYTES = 250 * 1024;

function generateRandomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getAppOriginFromHeaders(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * Vérifie qu'un enrollment appartient bien à la session
 * accessible par le formateur. Combine validateTrainerAccess +
 * check enrollment.session_id.
 */
async function validateEnrollmentForTrainer(
  supabase: ReturnType<typeof createAdminClient>,
  token: string,
  sessionId: string,
  enrollmentId: string,
): Promise<{ trainerId: string; organizationId: string } | null> {
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return null;
  const { data: enr } = await supabase
    .from("session_enrollments")
    .select("session_id")
    .eq("id", enrollmentId)
    .maybeSingle<{ session_id: string }>();
  if (!enr || enr.session_id !== sessionId) return null;
  return ctx;
}

// ============================================================
// Phase A — Signature individuelle apprenant + formateur
// (variante de saveSignature / clearSignature côté admin)
// ============================================================

export type SaveSignatureAsTrainerInput = {
  enrollmentId: string;
  periodDate: string;
  moment: AttendanceMoment;
  signerRole: "learner" | "trainer";
  signerName: string;
  signatureData: string;
};

export async function saveSignatureAsTrainer(
  token: string,
  sessionId: string,
  input: SaveSignatureAsTrainerInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const ctx = await validateEnrollmentForTrainer(
    supabase,
    token,
    sessionId,
    input.enrollmentId,
  );
  if (!ctx) return { ok: false, error: "Accès refusé." };

  const data = input.signatureData?.trim() ?? "";
  if (!data.startsWith("data:image/")) {
    return { ok: false, error: "Format de signature invalide." };
  }
  if (data.length > MAX_SIGNATURE_BYTES) {
    return { ok: false, error: "Signature trop volumineuse." };
  }
  const signerName = input.signerName?.trim() ?? "";
  if (!signerName) return { ok: false, error: "Nom du signataire requis." };

  const h = await headers();
  const signedIp = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent") ?? null;

  const { error } = await supabase.from("attendance_signatures").upsert(
    {
      enrollment_id: input.enrollmentId,
      period_date: input.periodDate,
      moment: input.moment,
      signer_role: input.signerRole,
      signer_name: signerName,
      signature_data: data,
      signed_ip: signedIp,
      signed_user_agent: userAgent,
      signed_at: new Date().toISOString(),
    },
    { onConflict: "enrollment_id,period_date,moment,signer_role" },
  );
  if (error) return { ok: false, error: error.message };

  // Auto-marquage présence si signature apprenant et statut absent/not_recorded
  if (input.signerRole === "learner") {
    const { data: existing } = await supabase
      .from("attendances")
      .select("status")
      .eq("enrollment_id", input.enrollmentId)
      .eq("period_date", input.periodDate)
      .eq("moment", input.moment)
      .maybeSingle<{ status: string | null }>();
    const current = existing?.status ?? null;
    if (!current || current === "not_recorded") {
      await supabase.from("attendances").upsert(
        {
          enrollment_id: input.enrollmentId,
          period_date: input.periodDate,
          moment: input.moment,
          status: "present",
          marked_by: null,
        },
        { onConflict: "enrollment_id,period_date,moment" },
      );
    }
  }

  revalidatePath(`/formateur/${token}/sessions/${sessionId}/emargement`);
  return { ok: true };
}

export async function clearSignatureAsTrainer(
  token: string,
  sessionId: string,
  input: {
    enrollmentId: string;
    periodDate: string;
    moment: AttendanceMoment;
    signerRole: "learner" | "trainer";
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const ctx = await validateEnrollmentForTrainer(
    supabase,
    token,
    sessionId,
    input.enrollmentId,
  );
  if (!ctx) return { ok: false, error: "Accès refusé." };

  const { error } = await supabase
    .from("attendance_signatures")
    .delete()
    .eq("enrollment_id", input.enrollmentId)
    .eq("period_date", input.periodDate)
    .eq("moment", input.moment)
    .eq("signer_role", input.signerRole);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/formateur/${token}/sessions/${sessionId}/emargement`);
  return { ok: true };
}

// ============================================================
// Phase A bis — QR code session (variante getOrCreate /
// regenerate session_emargement_tokens)
// ============================================================

export type TrainerSessionQrTokenResult = {
  ok: boolean;
  error?: string;
  publicUrl?: string;
  token?: string;
  expiresAt?: string;
};

export async function getOrCreateSessionQrTokenAsTrainer(
  token: string,
  sessionId: string,
): Promise<TrainerSessionQrTokenResult> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  const { data: session } = await supabase
    .from("sessions")
    .select("id, end_date")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; end_date: string }>();
  if (!session) return { ok: false, error: "Session introuvable." };

  // Token actif existant ?
  const { data: existing } = await supabase
    .from("session_emargement_tokens")
    .select("token, expires_at")
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string; expires_at: string }>();

  const origin = await getAppOriginFromHeaders();
  if (existing) {
    return {
      ok: true,
      token: existing.token,
      publicUrl: `${origin}/emarger/${existing.token}`,
      expiresAt: existing.expires_at,
    };
  }

  // TTL paramétré sur l'organisation
  const { data: org } = await supabase
    .from("organizations")
    .select("emargement_token_ttl_days")
    .eq("id", ctx.organizationId)
    .maybeSingle<{ emargement_token_ttl_days: number | null }>();
  const ttlDays = org?.emargement_token_ttl_days ?? 7;

  const endDate = new Date(session.end_date);
  endDate.setHours(23, 59, 59, 999);
  const expiresAt = new Date(
    endDate.getTime() + ttlDays * 24 * 60 * 60 * 1000,
  );

  const newToken = generateRandomToken();
  const { error: insertError } = await supabase
    .from("session_emargement_tokens")
    .insert({
      session_id: sessionId,
      token: newToken,
      expires_at: expiresAt.toISOString(),
      created_by: null, // formateur sans profile_id Supabase Auth
    });
  if (insertError) return { ok: false, error: insertError.message };

  return {
    ok: true,
    token: newToken,
    publicUrl: `${origin}/emarger/${newToken}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function regenerateSessionQrTokenAsTrainer(
  token: string,
  sessionId: string,
): Promise<TrainerSessionQrTokenResult> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  await supabase
    .from("session_emargement_tokens")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString());

  const result = await getOrCreateSessionQrTokenAsTrainer(token, sessionId);
  if (result.ok) {
    revalidatePath(`/formateur/${token}/sessions/${sessionId}/emargement`);
  }
  return result;
}

// ============================================================
// QR code évaluation à chaud (Gilles 2026-05-25)
// Variante trainer de getOrCreateSessionEvaluationToken /
// regenerateSessionEvaluationToken — auth par token portail.
// Le QR pointe vers /evaluation/[token] (questionnaire Qualiopi).
// ============================================================

export async function getOrCreateSessionEvaluationTokenAsTrainer(
  token: string,
  sessionId: string,
): Promise<TrainerSessionQrTokenResult> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  const { data: session } = await supabase
    .from("sessions")
    .select("id, end_date")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; end_date: string }>();
  if (!session) return { ok: false, error: "Session introuvable." };

  // Token actif existant ?
  const { data: existing } = await supabase
    .from("session_evaluation_tokens")
    .select("token, expires_at")
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string; expires_at: string }>();

  const origin = await getAppOriginFromHeaders();
  if (existing) {
    return {
      ok: true,
      token: existing.token,
      publicUrl: `${origin}/evaluation/${existing.token}`,
      expiresAt: existing.expires_at,
    };
  }

  // TTL mutualisé avec émargement (même fenêtre fin de session)
  const { data: org } = await supabase
    .from("organizations")
    .select("emargement_token_ttl_days")
    .eq("id", ctx.organizationId)
    .maybeSingle<{ emargement_token_ttl_days: number | null }>();
  const ttlDays = org?.emargement_token_ttl_days ?? 7;

  const endDate = new Date(session.end_date);
  endDate.setHours(23, 59, 59, 999);
  const expiresAt = new Date(
    endDate.getTime() + ttlDays * 24 * 60 * 60 * 1000,
  );

  const newToken = generateRandomToken();
  const { error: insertError } = await supabase
    .from("session_evaluation_tokens")
    .insert({
      session_id: sessionId,
      token: newToken,
      expires_at: expiresAt.toISOString(),
      created_by: null,
    });
  if (insertError) return { ok: false, error: insertError.message };

  return {
    ok: true,
    token: newToken,
    publicUrl: `${origin}/evaluation/${newToken}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function regenerateSessionEvaluationTokenAsTrainer(
  token: string,
  sessionId: string,
): Promise<TrainerSessionQrTokenResult> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  await supabase
    .from("session_evaluation_tokens")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString());

  const result = await getOrCreateSessionEvaluationTokenAsTrainer(
    token,
    sessionId,
  );
  if (result.ok) {
    revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  }
  return result;
}

// ============================================================
// QR code quiz pré/post partagé (Gilles 2026-05-25)
// Un SEUL QR par session : l'apprenant scanne, choisit son nom
// puis est redirigé vers son /mon-parcours/[token]/quiz personnel
// (qui contient deja l'anti-rejeu pre/post). Plus pratique que le
// QR par participant.
// ============================================================

export async function getOrCreateSessionQuizTokenAsTrainer(
  token: string,
  sessionId: string,
): Promise<TrainerSessionQrTokenResult> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  const { data: session } = await supabase
    .from("sessions")
    .select("id, end_date")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; end_date: string }>();
  if (!session) return { ok: false, error: "Session introuvable." };

  const { data: existing } = await supabase
    .from("session_quiz_tokens")
    .select("token, expires_at")
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string; expires_at: string }>();

  const origin = await getAppOriginFromHeaders();
  if (existing) {
    return {
      ok: true,
      token: existing.token,
      publicUrl: `${origin}/quiz-session/${existing.token}`,
      expiresAt: existing.expires_at,
    };
  }

  // TTL mutualisé avec émargement / évaluation (même fenêtre fin
  // de session). Valeur par défaut 7 jours.
  const { data: org } = await supabase
    .from("organizations")
    .select("emargement_token_ttl_days")
    .eq("id", ctx.organizationId)
    .maybeSingle<{ emargement_token_ttl_days: number | null }>();
  const ttlDays = org?.emargement_token_ttl_days ?? 7;

  const endDate = new Date(session.end_date);
  endDate.setHours(23, 59, 59, 999);
  const expiresAt = new Date(
    endDate.getTime() + ttlDays * 24 * 60 * 60 * 1000,
  );

  const newToken = generateRandomToken();
  const { error: insertError } = await supabase
    .from("session_quiz_tokens")
    .insert({
      session_id: sessionId,
      token: newToken,
      expires_at: expiresAt.toISOString(),
      created_by: null,
    });
  if (insertError) return { ok: false, error: insertError.message };

  return {
    ok: true,
    token: newToken,
    publicUrl: `${origin}/quiz-session/${newToken}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function regenerateSessionQuizTokenAsTrainer(
  token: string,
  sessionId: string,
): Promise<TrainerSessionQrTokenResult> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  await supabase
    .from("session_quiz_tokens")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString());

  const result = await getOrCreateSessionQuizTokenAsTrainer(token, sessionId);
  if (result.ok) {
    revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  }
  return result;
}

// ============================================================
// Phase B — Envoi du lien de signature par email (distanciel)
// (variante de sendSignatureLink côté admin)
// ============================================================

export type SendSignatureLinkAsTrainerResult = {
  ok: boolean;
  error?: string;
  publicUrl?: string;
};

export async function sendSignatureLinkAsTrainer(
  token: string,
  sessionId: string,
  enrollmentId: string,
): Promise<SendSignatureLinkAsTrainerResult> {
  const supabase = createAdminClient();
  const ctx = await validateEnrollmentForTrainer(
    supabase,
    token,
    sessionId,
    enrollmentId,
  );
  if (!ctx) return { ok: false, error: "Accès refusé." };

  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, email, civility), session:sessions(organization_id, formation:formations(title), start_date, end_date)",
    )
    .eq("id", enrollmentId)
    .maybeSingle<{
      id: string;
      learner: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        civility: string | null;
      } | null;
      session: {
        organization_id: string;
        formation: { title: string } | null;
        start_date: string;
        end_date: string;
      } | null;
    }>();

  if (!enrollment) return { ok: false, error: "Inscription introuvable." };
  if (!enrollment.learner?.email) {
    return {
      ok: false,
      error: "L'apprenant n'a pas d'adresse email renseignée.",
    };
  }
  if (!isResendConfigured()) {
    return {
      ok: false,
      error: "L'envoi automatique n'est pas configuré (Resend).",
    };
  }

  const linkToken = generateRandomToken();
  const { error: insertError } = await supabase
    .from("signature_links")
    .insert({
      enrollment_id: enrollmentId,
      token: linkToken,
      expires_at: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
  if (insertError) return { ok: false, error: insertError.message };

  const origin = await getAppOriginFromHeaders();
  const publicUrl = `${origin}/signer/${linkToken}`;
  const learnerName = [
    enrollment.learner.first_name,
    enrollment.learner.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const formationTitle =
    enrollment.session?.formation?.title ?? "votre formation";

  const { data: org } = await supabase
    .from("organizations")
    .select("name, email")
    .eq("id", ctx.organizationId)
    .maybeSingle<{ name: string; email: string | null }>();
  const orgName = org?.name ?? "Notre organisme";

  const subject = `Signature de votre feuille d'émargement — ${formationTitle}`;
  const html = `
    <p>Bonjour ${enrollment.learner.civility ?? ""} ${learnerName},</p>
    <p>Pour finaliser le suivi administratif de votre formation
    <strong>« ${formationTitle} »</strong>, merci de bien vouloir signer
    votre feuille d'émargement en cliquant sur le lien ci-dessous :</p>
    <p style="margin: 24px 0;">
      <a href="${publicUrl}"
         style="display:inline-block;background:#1e40af;color:white;
                text-decoration:none;padding:12px 24px;border-radius:8px;
                font-weight:bold;">
        Signer ma feuille d'émargement
      </a>
    </p>
    <p>Ce lien est strictement personnel et restera valable pendant 30 jours.</p>
    <p>Bien cordialement,<br/><strong>${orgName}</strong></p>
  `;
  const text = `Bonjour ${learnerName},\n\nMerci de signer votre feuille d'émargement à l'adresse suivante :\n${publicUrl}\n\nLien valable 30 jours.\n\nCordialement,\n${orgName}`;

  const result = await sendEmail({
    to: enrollment.learner.email,
    toName: learnerName,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
  });

  await supabase.from("email_log").insert({
    organization_id: ctx.organizationId,
    enrollment_id: enrollmentId,
    type: "signature_link",
    to_email: enrollment.learner.email,
    to_name: learnerName,
    subject,
    status: result.ok ? "sent" : "failed",
    provider: "resend",
    provider_id: result.ok ? result.providerId : null,
    error: result.ok ? null : result.error,
    sent_at: result.ok ? new Date().toISOString() : null,
  });

  revalidatePath(`/formateur/${token}/sessions/${sessionId}/emargement`);
  if (!result.ok) return { ok: false, error: result.error, publicUrl };
  return { ok: true, publicUrl };
}

// ============================================================
// Phase C — Pointage manuel présent/absent/excusé/retard
// (variante de setAttendance côté admin)
// ============================================================

export async function setAttendanceAsTrainer(
  token: string,
  sessionId: string,
  enrollmentId: string,
  periodDate: string,
  moment: AttendanceMoment,
  formData: FormData,
): Promise<void> {
  const supabase = createAdminClient();
  const ctx = await validateEnrollmentForTrainer(
    supabase,
    token,
    sessionId,
    enrollmentId,
  );
  if (!ctx) return; // silent fail = comportement admin similaire

  const statusRaw = formData.get("status");
  const status =
    (typeof statusRaw === "string" ? statusRaw : "not_recorded") as AttendanceStatus;
  const noteRaw = formData.get("note");
  const note =
    typeof noteRaw === "string" && noteRaw.trim() !== ""
      ? noteRaw.trim()
      : null;

  const { error } = await supabase.from("attendances").upsert(
    {
      enrollment_id: enrollmentId,
      period_date: periodDate,
      moment,
      status,
      note,
      marked_by: null,
    },
    { onConflict: "enrollment_id,period_date,moment" },
  );

  if (error) {
    console.error("setAttendanceAsTrainer error:", error, {
      sessionId,
      enrollmentId,
      periodDate,
      moment,
    });
  }

  revalidatePath(`/formateur/${token}/sessions/${sessionId}/emargement`);
}

// ============================================================
// Saisie express (sous-traitance, Gilles 2026-05-24)
// ============================================================

/**
 * Crée un apprenant temporaire depuis le portail formateur (jour J
 * sous-traitance). L'OF donneur d'ordre n'a pas transmis la liste,
 * le formateur la saisit en direct. L'apprenant est inscrit sur la
 * session et un token portail est créé pour qu'il puisse jouer le
 * quiz et émarger.
 */
export async function createExpressLearnerFromPortal(
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

  const result = await createExpressLearnerForSession(supabase, {
    sessionId,
    organizationId: ctx!.organizationId,
    // Le formateur n'a pas de compte profiles — created_by reste null
    createdBy: null,
    input: {
      civility: formData.get("civility") as string | null,
      firstName: String(formData.get("first_name") ?? ""),
      lastName: String(formData.get("last_name") ?? ""),
      email: formData.get("email") as string | null,
      jobTitle: formData.get("job_title") as string | null,
      companyNameTemp: String(formData.get("company_name_temp") ?? ""),
      companySiretTemp: formData.get("company_siret_temp") as string | null,
    },
  });

  if (!result.ok) {
    redirect(
      `/formateur/${token}/sessions/${sessionId}?error=${encodeURIComponent(result.error ?? "Erreur saisie express")}`,
    );
  }

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  redirect(`/formateur/${token}/sessions/${sessionId}?expressOk=1`);
}

/**
 * Édite les informations d'un apprenant TEMPORAIRE depuis le portail
 * formateur (saisie express sous-traitance). Refuse les apprenants
 * inscrits officiellement par l'OF — pour ceux-là le formateur doit
 * passer par l'admin (risque d'incohérence avec convention, convocation,
 * attestation déjà émises).
 *
 * Gilles 2026-05-24 : "uniquement les apprenants qu'il a inscrit et
 * non ceux de l'OF".
 */
export async function updateLearnerFromPortal(
  token: string,
  sessionId: string,
  learnerId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  // Vérifier que l'apprenant est bien inscrit à cette session
  const { data: enr } = await supabase
    .from("session_enrollments")
    .select("id, learner_id")
    .eq("session_id", sessionId)
    .eq("learner_id", learnerId)
    .maybeSingle<{ id: string; learner_id: string }>();
  if (!enr) {
    return { ok: false, error: "Apprenant introuvable sur cette session." };
  }

  const { data: current } = await supabase
    .from("learners")
    .select("is_temporary, organization_id")
    .eq("id", learnerId)
    .maybeSingle<{ is_temporary: boolean | null; organization_id: string }>();
  if (!current || current.organization_id !== ctx.organizationId) {
    return { ok: false, error: "Apprenant introuvable." };
  }
  if (!current.is_temporary) {
    return {
      ok: false,
      error:
        "Cet apprenant a été inscrit officiellement par l'organisme. Demandez à l'admin pour le modifier.",
    };
  }

  const cleanText = (raw: FormDataEntryValue | null): string | null => {
    if (raw === null) return null;
    const s = String(raw).trim();
    return s === "" ? null : s;
  };
  const firstName = cleanText(formData.get("first_name"));
  const lastName = cleanText(formData.get("last_name"));
  const companyName = cleanText(formData.get("company_name_temp"));
  if (!firstName || !lastName || !companyName) {
    return {
      ok: false,
      error: "Société, prénom et nom sont obligatoires.",
    };
  }

  const siretRaw = cleanText(formData.get("company_siret_temp"));
  const update: Record<string, unknown> = {
    civility: cleanText(formData.get("civility")),
    first_name: firstName,
    last_name: lastName,
    email: cleanText(formData.get("email")),
    job_title: cleanText(formData.get("job_title")),
    company_name_temp: companyName,
    company_siret_temp: siretRaw ? siretRaw.replace(/\D/g, "") : null,
  };

  const { error } = await supabase
    .from("learners")
    .update(update)
    .eq("id", learnerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  return { ok: true };
}

/**
 * Supprime un apprenant TEMPORAIRE (saisie express) depuis le portail
 * formateur. Refuse si l'apprenant n'est pas temporaire (sécurité :
 * un apprenant régulier peut avoir une convention, des signatures,
 * une attestation déjà émise — sa suppression doit passer par l'admin).
 *
 * Ordre de suppression (important — session_enrollments.learner_id
 * est en ON DELETE RESTRICT, cf. migration 0006) :
 *   1. Supprimer les inscription_requests (FK ON DELETE SET NULL — on
 *      les supprime franchement pour ne pas laisser de demandes
 *      fantômes après promotion).
 *   2. Supprimer tous les session_enrollments du learner — ce DELETE
 *      cascade vers : enrollment_portal_tokens, quiz_attempts,
 *      attendance_signatures, etc.
 *   3. Supprimer le learner (les notes session_learner_notes cascade
 *      via leur propre FK ON DELETE CASCADE, cf. migration 0039).
 */
export async function deleteExpressLearnerFromPortal(
  token: string,
  sessionId: string,
  learnerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { ok: false, error: "Accès refusé." };

  const { data: learner } = await supabase
    .from("learners")
    .select("is_temporary, organization_id")
    .eq("id", learnerId)
    .maybeSingle<{ is_temporary: boolean | null; organization_id: string }>();
  if (!learner || learner.organization_id !== ctx.organizationId) {
    return { ok: false, error: "Apprenant introuvable." };
  }
  if (!learner.is_temporary) {
    return {
      ok: false,
      error:
        "Cet apprenant a été inscrit officiellement par l'organisme. Demandez à l'admin pour le retirer.",
    };
  }

  // Vérifier qu'il est bien inscrit sur cette session (sécurité)
  const { data: enr } = await supabase
    .from("session_enrollments")
    .select("id")
    .eq("session_id", sessionId)
    .eq("learner_id", learnerId)
    .maybeSingle<{ id: string }>();
  if (!enr) {
    return { ok: false, error: "Apprenant non inscrit sur cette session." };
  }

  // 1. Nettoyer les inscription_requests (typiquement aucune pour un
  //    apprenant temporaire saisi en express, mais sécurité)
  await supabase
    .from("inscription_requests")
    .delete()
    .eq("learner_id", learnerId);

  // 2. Supprimer TOUS les session_enrollments du learner — cascade vers
  //    enrollment_portal_tokens, quiz_attempts, attendance_signatures…
  const { error: enrDelErr } = await supabase
    .from("session_enrollments")
    .delete()
    .eq("learner_id", learnerId);
  if (enrDelErr) return { ok: false, error: enrDelErr.message };

  // 3. Supprimer le learner (notes cascade automatiquement)
  const { error } = await supabase
    .from("learners")
    .delete()
    .eq("id", learnerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  return { ok: true };
}

/**
 * Récupère (ou crée à la volée) le lien personnel du portail apprenant
 * pour un enrollment de cette session, depuis le portail formateur.
 *
 * Cas d'usage (Gilles 2026-05-24) : le formateur a saisi un apprenant
 * lui-même (ou son apprenant a perdu sa convocation) et veut lui
 * donner le lien vers son portail pour qu'il puisse jouer le quiz
 * pré/post, émarger, voir les supports.
 *
 * Le QR / lien retourné pointe vers /mon-parcours/[token] — la page
 * d'accueil personnelle de l'apprenant. De là il accède au quiz,
 * à l'émargement, etc.
 */
export async function getLearnerPortalLinkFromPortal(
  token: string,
  sessionId: string,
  enrollmentId: string,
): Promise<{ url: string; token: string } | { error: string }> {
  const supabase = createAdminClient();
  const ctx = await validateEnrollmentForTrainer(
    supabase,
    token,
    sessionId,
    enrollmentId,
  );
  if (!ctx) return { error: "Accès refusé." };

  // Réutilise le helper de création / récupération idempotente
  const learnerToken = await ensureEnrollmentPortalToken(supabase, enrollmentId);

  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";
  return {
    url: `${base}/mon-parcours/${learnerToken}`,
    token: learnerToken,
  };
}

/**
 * Renvoie l'URL de VISUALISATION de la convocation d'un apprenant depuis
 * le portail formateur (Gilles 2026-06-05 : icône œil sur la liste des
 * participants). La page convocation est servie en mode public via le
 * token portail de l'inscription (?token=), validé côté page contre
 * l'enrollment. Le middleware autorise ce chemin quand ?token= est présent.
 */
export async function getConvocationLinkFromPortal(
  token: string,
  sessionId: string,
  enrollmentId: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = createAdminClient();
  const ctx = await validateEnrollmentForTrainer(
    supabase,
    token,
    sessionId,
    enrollmentId,
  );
  if (!ctx) return { error: "Accès refusé." };

  const portalToken = await ensureEnrollmentPortalToken(supabase, enrollmentId);
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";
  return {
    url: `${base}/sessions/${sessionId}/convocations/${enrollmentId}/print?token=${portalToken}`,
  };
}

/**
 * Supprime une tentative de quiz (pré ou post) d'un apprenant depuis
 * le portail formateur. Sert à "rejouer" un quiz : on supprime la
 * tentative, l'apprenant peut rejouer la phase en allant sur son
 * portail (la page /mon-parcours/[token]/quiz détecte automatiquement
 * qu'il manque cette phase et la lui propose).
 *
 * Gilles 2026-05-24 : "le formateur peut supprimer un quiz ou le
 * faire rejouer à l'apprenant sans qu'il ait besoin de réinscrire".
 *
 * Sécurité : on vérifie que l'enrollment appartient bien à la session
 * accessible par ce formateur (via validateEnrollmentForTrainer).
 */
export async function deleteQuizAttemptFromPortal(
  token: string,
  sessionId: string,
  enrollmentId: string,
  phase: "pre" | "post",
): Promise<{ ok: boolean; error?: string }> {
  if (phase !== "pre" && phase !== "post") {
    return { ok: false, error: "Phase invalide." };
  }
  const supabase = createAdminClient();
  const ctx = await validateEnrollmentForTrainer(
    supabase,
    token,
    sessionId,
    enrollmentId,
  );
  if (!ctx) return { ok: false, error: "Accès refusé." };

  // Quiz effectif rattaché à la session (sessions.quiz_template_id ou
  // formations.quiz_template_id en fallback)
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "organization_id, quiz_template_id, quiz_results_locked_at, formation:formations(quiz_template_id)",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      organization_id: string;
      quiz_template_id: string | null;
      quiz_results_locked_at: string | null;
      formation: { quiz_template_id: string | null } | null;
    }>();
  const effectiveQuizId =
    session?.quiz_template_id ?? session?.formation?.quiz_template_id ?? null;
  if (!effectiveQuizId) {
    return { ok: false, error: "Aucun quiz rattaché à cette session." };
  }
  // Verrou : on ne rejoue pas si les résultats sont verrouillés (Gilles 2026-06-23).
  if (session?.quiz_results_locked_at) {
    return {
      ok: false,
      error: "Résultats verrouillés — rejeu impossible.",
    };
  }

  // Archive la tentative existante AVANT suppression (garde la trace du
  // 1er essai pour l'audit — Gilles 2026-06-23).
  const { data: prev } = await supabase
    .from("quiz_attempts")
    .select("score, max_score, data, completed_at")
    .eq("enrollment_id", enrollmentId)
    .eq("quiz_template_id", effectiveQuizId)
    .eq("phase", phase)
    .maybeSingle<{
      score: number | null;
      max_score: number | null;
      data: unknown;
      completed_at: string | null;
    }>();
  if (prev && session?.organization_id) {
    await supabase.from("quiz_attempt_history").insert({
      organization_id: session.organization_id,
      enrollment_id: enrollmentId,
      quiz_template_id: effectiveQuizId,
      phase,
      score: prev.score,
      max_score: prev.max_score,
      data: prev.data,
      completed_at: prev.completed_at,
      reason: "replay",
    });
  }

  const { error } = await supabase
    .from("quiz_attempts")
    .delete()
    .eq("enrollment_id", enrollmentId)
    .eq("quiz_template_id", effectiveQuizId)
    .eq("phase", phase);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/formateur/${token}/sessions/${sessionId}`);
  return { ok: true };
}

/**
 * Génère (ou récupère) le token QR d'inscription rapide depuis le
 * portail formateur. Retourne l'URL publique à afficher en QR.
 */
export async function generateQuickSignupTokenFromPortal(
  token: string,
  sessionId: string,
): Promise<{ url: string; token: string } | { error: string }> {
  const supabase = createAdminClient();
  const ctx = await validateTrainerAccess(supabase, token, sessionId);
  if (!ctx) return { error: "Accès refusé" };

  const { data: session } = await supabase
    .from("sessions")
    .select("end_date")
    .eq("id", sessionId)
    .maybeSingle<{ end_date: string }>();
  if (!session) return { error: "Session introuvable" };

  const quickToken = await ensureQuickSignupToken(supabase, {
    sessionId,
    sessionEndDate: session.end_date,
    createdBy: null,
  });

  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";
  return {
    url: `${base}/inscription-rapide/${quickToken}`,
    token: quickToken,
  };
}
