"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

export async function uploadSessionDocument(
  sessionId: string,
  formData: FormData,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect(
      `/sessions/${sessionId}/documents?error=${encodeURIComponent("Aucun fichier sélectionné")}`,
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    redirect(
      `/sessions/${sessionId}/documents?error=${encodeURIComponent("Fichier trop volumineux (max 10 Mo)")}`,
    );
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    redirect(
      `/sessions/${sessionId}/documents?error=${encodeURIComponent("Format non supporté (PDF, Word, Excel, image…)")}`,
    );
  }

  const visibility = (formData.get("visibility") as string) || "internal";
  const description =
    (formData.get("description") as string)?.trim() || null;
  const isTrainingProgram = formData.get("is_training_program") === "on";

  const orgRow = await supabase
    .from("sessions")
    .select("organization_id")
    .eq("id", sessionId)
    .maybeSingle();
  const organizationId = orgRow.data?.organization_id as string | undefined;
  if (!organizationId) {
    throw new Error("Organisation introuvable");
  }

  const sanitized = sanitizeFileName(file.name);
  const storagePath = `${organizationId}/${sessionId}/${Date.now()}-${sanitized}`;

  const { error: uploadError } = await supabase.storage
    .from("session-documents")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    redirect(
      `/sessions/${sessionId}/documents?error=${encodeURIComponent(uploadError.message)}`,
    );
  }

  // Si on marque le nouveau document comme "programme officiel", on
  // démarque d'abord les autres (contrainte unique partielle en base —
  // migration 0065). Ça permet à l'utilisateur de "remplacer" simplement.
  if (isTrainingProgram) {
    await supabase
      .from("session_documents")
      .update({ is_training_program: false })
      .eq("session_id", sessionId)
      .eq("is_training_program", true);
  }

  const { error: insertError } = await supabase
    .from("session_documents")
    .insert({
      session_id: sessionId,
      organization_id: organizationId,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      description,
      visibility:
        visibility === "shared_with_learners" ? "shared_with_learners" : "internal",
      is_training_program: isTrainingProgram,
      uploaded_by: user.id,
    });
  if (insertError) {
    // Cleanup : on supprime le fichier uploadé en cas d'erreur d'insertion
    await supabase.storage.from("session-documents").remove([storagePath]);
    redirect(
      `/sessions/${sessionId}/documents?error=${encodeURIComponent(insertError.message)}`,
    );
  }

  revalidatePath(`/sessions/${sessionId}/documents`);
  redirect(`/sessions/${sessionId}/documents?uploaded=1`);
}

/**
 * Inverse la visibilité d'un document (interne ↔ partagé apprenants).
 * Appelée au double-clic sur l'étiquette de visibilité.
 */
export async function toggleSessionDocumentVisibility(
  sessionId: string,
  documentId: string,
) {
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("session_documents")
    .select("visibility, session_id")
    .eq("id", documentId)
    .maybeSingle<{ visibility: string; session_id: string }>();
  if (!doc || doc.session_id !== sessionId) {
    redirect(`/sessions/${sessionId}/documents`);
  }
  const next: "internal" | "shared_with_learners" =
    doc!.visibility === "shared_with_learners"
      ? "internal"
      : "shared_with_learners";
  const { error: updateError, data: updated } = await supabase
    .from("session_documents")
    .update({ visibility: next })
    .eq("id", documentId)
    .select("id");
  if (updateError) {
    console.error("[toggleSessionDocumentVisibility]", updateError);
    throw new Error(updateError.message);
  }
  if (!updated || updated.length === 0) {
    // RLS a probablement bloqué silencieusement l'UPDATE.
    throw new Error(
      "Modification refusée par les politiques de sécurité (RLS). Vérifiez les permissions sur session_documents.",
    );
  }
  revalidatePath(`/sessions/${sessionId}/documents`);
}

export async function deleteSessionDocument(
  sessionId: string,
  documentId: string,
) {
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("session_documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) {
    redirect(`/sessions/${sessionId}/documents`);
  }
  await supabase.storage
    .from("session-documents")
    .remove([doc.storage_path as string]);
  await supabase.from("session_documents").delete().eq("id", documentId);
  revalidatePath(`/sessions/${sessionId}/documents`);
  redirect(`/sessions/${sessionId}/documents?deleted=1`);
}

/**
 * Génère une URL signée pour télécharger un document. Valide 1 heure.
 */
export async function getDocumentDownloadUrl(
  documentId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("session_documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;
  const { data, error } = await supabase.storage
    .from("session-documents")
    .createSignedUrl(doc.storage_path as string, 3600);
  if (error) {
    console.error("createSignedUrl error:", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Renvoie le programme de formation par email à une cible donnée.
 *
 * - Source du programme : priorité 1 = session_documents
 *   (is_training_program=true), priorité 2 = formations.programme_pdf_url.
 * - Cibles :
 *   - `learners` : apprenants inscrits avec email
 *   - `referents` : référents pédagogiques (R6, contacts entreprise)
 *   - `both` : union des deux
 */
export async function resendTrainingProgram(
  sessionId: string,
  formData: FormData,
) {
  const targetRaw = formData.get("target");
  const target: "learners" | "referents" | "both" =
    targetRaw === "referents" || targetRaw === "both" ? targetRaw : "learners";
  const { isResendConfigured, sendEmail } = await import(
    "@/lib/email/resend"
  );
  const { getReferentEmailsForEnrollment } = await import(
    "@/lib/inscriptions/referents"
  );
  const { getTrainingProgramAttachment } = await import(
    "@/lib/sessions/training-program-attachment"
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/sessions/${sessionId}/documents?error=${encodeURIComponent("Non authentifié")}`,
    );
  }

  if (!isResendConfigured()) {
    redirect(
      `/sessions/${sessionId}/documents?error=${encodeURIComponent("Resend non configuré : envoi impossible")}`,
    );
  }

  // 1. Programme à joindre
  const attachment = await getTrainingProgramAttachment(supabase, sessionId);
  if (!attachment) {
    redirect(
      `/sessions/${sessionId}/documents?error=${encodeURIComponent("Aucun programme de formation disponible (ni session ni catalogue)")}`,
    );
  }

  // 2. Contexte session
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "organization_id, formation:formations(title), organization:organizations(name, email)",
    )
    .eq("id", sessionId)
    .maybeSingle<{
      organization_id: string;
      formation: { title: string } | null;
      organization: { name: string; email: string | null } | null;
    }>();
  if (!session) {
    redirect(
      `/sessions/${sessionId}/documents?error=${encodeURIComponent("Session introuvable")}`,
    );
  }

  const formationTitle = session.formation?.title ?? "Formation";
  const orgName = session.organization?.name ?? "Organisme";
  const orgEmail = session.organization?.email ?? undefined;

  // 3. Destinataires
  const recipients: Array<{ email: string; name: string }> = [];

  if (target === "learners" || target === "both") {
    const { data: enrolls } = await supabase
      .from("session_enrollments")
      .select(
        "id, learner:learners(first_name, last_name, email)",
      )
      .eq("session_id", sessionId);
    for (const e of ((enrolls ?? []) as unknown as Array<{
      id: string;
      learner: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      } | null;
    }>)) {
      const email = e.learner?.email?.trim();
      if (!email) continue;
      const name = [e.learner?.first_name, e.learner?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Apprenant";
      recipients.push({ email, name });
    }
  }

  if (target === "referents" || target === "both") {
    const { data: enrolls } = await supabase
      .from("session_enrollments")
      .select("id")
      .eq("session_id", sessionId);
    const allRefs: string[] = [];
    for (const e of ((enrolls ?? []) as Array<{ id: string }>)) {
      const refs = await getReferentEmailsForEnrollment(supabase, e.id);
      for (const r of refs) allRefs.push(r);
    }
    // Dédup
    for (const email of new Set(allRefs)) {
      recipients.push({ email, name: "Référent pédagogique" });
    }
  }

  // Dédup emails (cas both : un apprenant peut être référent ailleurs)
  const seen = new Set<string>();
  const dedup = recipients.filter((r) => {
    if (seen.has(r.email.toLowerCase())) return false;
    seen.add(r.email.toLowerCase());
    return true;
  });

  if (dedup.length === 0) {
    redirect(
      `/sessions/${sessionId}/documents?error=${encodeURIComponent("Aucun destinataire avec email valide")}`,
    );
  }

  // 4. Envoi à chacun
  const subject = `Programme de formation — ${formationTitle}`;
  const html = `
    <p>Bonjour,</p>
    <p>Vous trouverez ci-joint le programme officiel de la formation
       <strong>« ${formationTitle} »</strong>.</p>
    <p>Bien cordialement,<br/><strong>${orgName}</strong></p>
  `;
  const text = `Bonjour,

Vous trouverez ci-joint le programme officiel de la formation « ${formationTitle} ».

Bien cordialement,
${orgName}`;

  let ok = 0;
  let failed = 0;
  for (const r of dedup) {
    const res = await sendEmail({
      to: r.email,
      toName: r.name,
      subject,
      html,
      text,
      replyTo: orgEmail,
      attachments: [
        {
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        },
      ],
    });
    if (res.ok) ok++;
    else failed++;
  }

  revalidatePath(`/sessions/${sessionId}/documents`);
  const msg =
    failed > 0
      ? `Programme envoyé à ${ok} destinataire(s), ${failed} échec(s).`
      : `Programme envoyé à ${ok} destinataire(s).`;
  redirect(
    `/sessions/${sessionId}/documents?programSent=${encodeURIComponent(msg)}`,
  );
}
