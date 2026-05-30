"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mise a jour manuelle du statut d'une convention de formation
 * (Gilles 2026-05-28).
 *
 * Cas d'usage : la convention a ete envoyee/signee hors de l'app
 * (Gmail perso, courrier postal, fax, etc.). L'admin doit pouvoir
 * marquer manuellement la convention au bon statut, avec :
 *  - la date effective (envoi ou signature)
 *  - le nom du signataire (si statut signed)
 *  - eventuellement le PDF signe en piece jointe (archive dans
 *    Supabase Storage + ajoute aux Documents de la session)
 *  - une note interne OBLIGATOIRE pour audit Qualiopi
 *
 * Statuts gerables manuellement : sent, signed, cancelled, draft
 * (retour brouillon en cas d'erreur de saisie).
 *
 * Audit : entree dans inscription_events (event_type =
 * convention_status_manual_update) avec le payload complet (ancien
 * statut, nouveau statut, date, note, fichier).
 */
export type ManualUpdateInput = {
  conventionId: string;
  newStatus: "sent" | "signed" | "cancelled" | "draft";
  /** Date effective (ISO YYYY-MM-DD ou ISO datetime). Si non fournie,
   *  defaut = maintenant. */
  effectiveDate?: string | null;
  /** Nom du signataire si newStatus = signed. Obligatoire dans ce cas. */
  signerName?: string | null;
  /** Note interne obligatoire (raison du changement manuel). */
  note: string;
  /** Contenu base64 du fichier PDF signe (optionnel). */
  fileBase64?: string | null;
  fileName?: string | null;
  fileMimeType?: string | null;
};

export type ManualUpdateResult = {
  ok: boolean;
  error?: string;
  fileUploadedPath?: string | null;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export async function manuallyUpdateConventionStatus(
  input: ManualUpdateInput,
): Promise<ManualUpdateResult> {
  const {
    conventionId,
    newStatus,
    effectiveDate,
    signerName,
    note,
    fileBase64,
    fileName,
    fileMimeType,
  } = input;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  // Validations metier
  if (!note || note.trim().length < 3) {
    return {
      ok: false,
      error: "Une note interne d'au moins 3 caractères est obligatoire.",
    };
  }
  // Note Gilles 2026-05-28 : signerName devenu OPTIONNEL — on accepte
  // que la convention scannée porte la signature mais qu'on ne saisisse
  // pas explicitement le nom. La signature physique sur le PDF fait foi.

  // Fix Gilles 2026-05-28 : bug "Convention introuvable" cote
  // server action — RLS sur session_conventions trop restrictive
  // dans ce contexte (le user lit la page mais l'action plante).
  // On utilise le client admin + on verifie manuellement que le user
  // appartient bien a l'organisation de la convention.
  const supabaseAdmin = createAdminClient();

  // 1. Charger la convention via admin (bypass RLS) — securite faite
  //    a la main juste apres avec organization_id recupere via sessions.
  // Fix Gilles 2026-05-30 : la table session_conventions n'a PAS de
  // colonne organization_id (verifie dans migration 0051). On la
  // recupere via la table sessions.
  const { data: conv, error: convErr } = await supabaseAdmin
    .from("session_conventions")
    .select(
      "id, session_id, status, signature_data, signed_at, sent_at, company_id",
    )
    .eq("id", conventionId)
    .maybeSingle<{
      id: string;
      session_id: string;
      status: string;
      signature_data: string | null;
      signed_at: string | null;
      sent_at: string | null;
      company_id: string | null;
    }>();
  if (convErr) {
    return {
      ok: false,
      error: `Erreur de chargement : ${convErr.message}`,
    };
  }
  if (!conv) {
    return { ok: false, error: "Convention introuvable (ID invalide)." };
  }

  // Recupere l'organization_id via la session
  const { data: sess, error: sessErr } = await supabaseAdmin
    .from("sessions")
    .select("organization_id")
    .eq("id", conv.session_id)
    .maybeSingle<{ organization_id: string }>();
  if (sessErr || !sess) {
    return {
      ok: false,
      error: "Session liée introuvable.",
    };
  }
  const organizationId = sess.organization_id;

  // 2. Verif securite : le user est-il membre actif de l'organisation
  //    de cette convention ?
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return {
      ok: false,
      error: "Accès refusé : vous n'appartenez pas à l'organisation de cette convention.",
    };
  }

  // Refus : la convention a deja ete signee EN LIGNE (signature_data
  // image presente) -> on ne touche pas pour ne pas perdre cette
  // signature. L'admin doit utiliser le bouton "Annuler" s'il veut.
  if (conv.signature_data && newStatus !== "cancelled") {
    return {
      ok: false,
      error:
        "Cette convention a été signée en ligne via l'application. Vous ne pouvez pas modifier son statut manuellement (sauf annulation). Utilisez 'Annuler' si nécessaire.",
    };
  }

  // 3. Upload PDF si fourni
  let uploadedPath: string | null = null;
  if (fileBase64 && fileName) {
    const mime = fileMimeType ?? "application/octet-stream";
    if (!ALLOWED_MIME.has(mime)) {
      return {
        ok: false,
        error:
          "Format non supporté : PDF, PNG, JPG ou WebP uniquement.",
      };
    }
    const buffer = Buffer.from(fileBase64, "base64");
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return { ok: false, error: "Fichier trop volumineux (max 10 Mo)." };
    }
    const sanitized = fileName
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 100);
    const storagePath = `${organizationId}/${conv.session_id}/conventions-signed/${Date.now()}-${sanitized}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("session-documents")
      .upload(storagePath, buffer, {
        contentType: mime,
        upsert: false,
      });
    if (uploadErr) {
      return {
        ok: false,
        error: `Erreur d'upload du fichier : ${uploadErr.message}`,
      };
    }
    // Indexer dans session_documents pour qu'il apparaisse dans
    // l'onglet Documents de la session.
    await supabaseAdmin.from("session_documents").insert({
      session_id: conv.session_id,
      organization_id: organizationId,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: mime,
      size_bytes: buffer.byteLength,
      description: `Convention signée (mise à jour manuelle) — ${note.slice(0, 80)}`,
      visibility: "internal",
      is_training_program: false,
      uploaded_by: user.id,
    });
    uploadedPath = storagePath;
  }

  // 4. UPDATE convention
  const now = new Date().toISOString();
  const effectiveTs = effectiveDate
    ? new Date(`${effectiveDate.slice(0, 10)}T12:00:00`).toISOString()
    : now;

  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === "sent") {
    update.sent_at = effectiveTs;
    // Si on bascule sent depuis signed, on enleve la signature
    update.signed_at = null;
    update.signature_data = null;
    update.signed_by_name = null;
  } else if (newStatus === "signed") {
    update.signed_at = effectiveTs;
    // signerName est optionnel (Gilles 2026-05-28) — si fourni on
    // l'enregistre, sinon on laisse vide (la signature physique sur
    // le PDF scanne fait foi).
    if (signerName && signerName.trim()) {
      update.signed_by_name = signerName.trim();
    }
    // On garde sent_at intact ou on le remplit si vide
    if (!conv.sent_at) update.sent_at = effectiveTs;
  } else if (newStatus === "draft") {
    update.sent_at = null;
    update.signed_at = null;
    update.signed_by_name = null;
  } else if (newStatus === "cancelled") {
    // garde l'historique des dates precedentes
  }

  const { error: updErr } = await supabaseAdmin
    .from("session_conventions")
    .update(update)
    .eq("id", conventionId);
  if (updErr) {
    return {
      ok: false,
      error: `Erreur de mise à jour : ${updErr.message}`,
    };
  }

  // 5. Audit dans inscription_events (lie via la session — on attache
  //    a TOUTES les inscriptions de cette company pour cette session,
  //    sinon a la 1ere inscription de la session si pas de company_id).
  let eventRequestIds: string[] = [];
  if (conv.company_id) {
    const { data: reqs } = await supabaseAdmin
      .from("inscription_requests")
      .select("id")
      .eq("target_session_id", conv.session_id)
      .eq("company_id", conv.company_id);
    eventRequestIds = (reqs ?? []).map((r) => r.id as string);
  }
  if (eventRequestIds.length === 0) {
    const { data: anyReq } = await supabaseAdmin
      .from("inscription_requests")
      .select("id")
      .eq("target_session_id", conv.session_id)
      .limit(1);
    eventRequestIds = (anyReq ?? []).map((r) => r.id as string);
  }
  if (eventRequestIds.length > 0) {
    await supabaseAdmin.from("inscription_events").insert(
      eventRequestIds.map((requestId) => ({
        request_id: requestId,
        event_type: "convention_status_manual_update",
        payload: {
          convention_id: conventionId,
          old_status: conv.status,
          new_status: newStatus,
          effective_date: effectiveTs,
          signer_name: newStatus === "signed" ? signerName?.trim() : null,
          note: note.trim(),
          file_uploaded: !!uploadedPath,
          file_path: uploadedPath,
        },
        actor_id: user.id,
      })),
    );
  }

  revalidatePath(`/sessions/${conv.session_id}/conventions`);
  return { ok: true, fileUploadedPath: uploadedPath };
}
