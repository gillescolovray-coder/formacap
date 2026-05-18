"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  EnrollmentStatus,
  InscriptionChannel,
} from "@/lib/sessions/types";
import {
  invalidateConventionForCompany,
} from "../conventions/actions";
import {
  cascadeDeleteRequestFromEnrollment,
  createMirroredRequestForEnrollment,
  syncStatusChangeToRequest,
} from "@/lib/inscriptions/sync";

/**
 * Pour une inscription donnée, récupère la company_id de l'apprenant et
 * appelle invalidateConventionForCompany() — l'helper saura si la
 * session n'est pas encore démarrée et s'il y a une convention à
 * passer en obsolète.
 *
 * Appelé chaque fois qu'une inscription est créée/modifiée/supprimée :
 * un changement de la composition d'un groupe doit invalider la
 * convention de la société concernée.
 */
async function invalidateConventionForEnrollment(
  sessionId: string,
  enrollmentId: string,
  reason: string,
): Promise<void> {
  const supabase = await createClient();
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select("learner:learners(company_id)")
    .eq("id", enrollmentId)
    .maybeSingle<{ learner: { company_id: string | null } | null }>();

  const companyId = enrollment?.learner?.company_id;
  if (companyId) {
    await invalidateConventionForCompany(sessionId, companyId, reason);
  }
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

export async function enrollLearner(sessionId: string, formData: FormData) {
  const learnerId = parseText(formData.get("learner_id"));
  const status =
    (parseText(formData.get("status")) as EnrollmentStatus | null) ??
    "preinscrit";
  const notes = parseText(formData.get("notes"));

  if (!learnerId) {
    redirect(`/sessions/${sessionId}?error=Choisissez+un+apprenant`);
  }

  const supabase = await createClient();

  // Garde-fou anti-doublon : la contrainte UNIQUE(session_id, learner_id)
  // de la table session_enrollments empêcherait l'insert, mais l'erreur
  // PostgreSQL est cryptique. On contrôle en amont pour rediriger
  // proprement vers la fiche existante.
  const { data: alreadyEnrolled } = await supabase
    .from("session_enrollments")
    .select("id")
    .eq("session_id", sessionId)
    .eq("learner_id", learnerId)
    .maybeSingle();
  if (alreadyEnrolled?.id) {
    redirect(
      `/sessions/${sessionId}/participants?error=${encodeURIComponent(
        "Cet apprenant est déjà inscrit à cette session.",
      )}`,
    );
  }

  const { data: created, error } = await supabase
    .from("session_enrollments")
    .insert({
      session_id: sessionId,
      learner_id: learnerId,
      status,
      notes,
    })
    .select("id, enrolled_at")
    .single();

  if (error) {
    // Filet de sécurité : si une condition de concurrence a glissé un
    // doublon entre la vérification et l'insert, on traduit l'erreur.
    const friendly =
      error.code === "23505"
        ? "Cet apprenant est déjà inscrit à cette session."
        : error.message;
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent(friendly)}`);
  }

  // R1 : ajout d'un apprenant peut invalider la convention si elle est
  // déjà envoyée/signée et que la session n'a pas démarré.
  if (created?.id) {
    await invalidateConventionForEnrollment(
      sessionId,
      created.id as string,
      "Nouvel apprenant inscrit",
    );

    // Sync 2026-05-13 : toute inscription créée depuis l'onglet
    // Participants doit avoir sa demande miroir dans le module
    // Inscriptions (stage = miroir du statut). Voir
    // memory/project_inscription_enrollment_sync.md.
    const requestId = await createMirroredRequestForEnrollment(supabase, {
      id: created.id as string,
      session_id: sessionId,
      learner_id: learnerId,
      status,
      enrolled_at: (created.enrolled_at as string | null) ?? null,
    });
    if (requestId) {
      await supabase
        .from("session_enrollments")
        .update({ inscription_request_id: requestId })
        .eq("id", created.id as string);
    }
  }

  revalidatePath(`/sessions/${sessionId}`);
  redirect(`/sessions/${sessionId}?enrolled=1`);
}

export async function updateEnrollmentStatus(
  sessionId: string,
  enrollmentId: string,
  formData: FormData,
) {
  const status =
    (parseText(formData.get("status")) as EnrollmentStatus | null) ??
    "preinscrit";

  const supabase = await createClient();
  const { error } = await supabase
    .from("session_enrollments")
    .update({ status })
    .eq("id", enrollmentId);

  if (error) {
    redirect(
      `/sessions/${sessionId}/participants?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Sync 2026-05-13 : propage le changement de statut vers le stage
  // CRM de la demande miroir (si elle existe).
  await syncStatusChangeToRequest(supabase, enrollmentId, status);

  // R1 : un changement de statut (notamment annulation) doit invalider
  // la convention liée à la société de cet apprenant.
  await invalidateConventionForEnrollment(
    sessionId,
    enrollmentId,
    `Statut apprenant changé en '${status}'`,
  );

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/participants`);
  redirect(`/sessions/${sessionId}/participants?statusUpdated=1`);
}

const ALLOWED_LEVELS = new Set([
  "debutant",
  "intermediaire",
  "confirme",
  "expert",
]);

export async function updateEnrollmentInitialLevel(
  sessionId: string,
  enrollmentId: string,
  formData: FormData,
) {
  const raw = parseText(formData.get("initial_level"));
  const initial_level =
    raw && ALLOWED_LEVELS.has(raw) ? raw : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("session_enrollments")
    .update({ initial_level })
    .eq("id", enrollmentId);

  if (error) {
    redirect(
      `/sessions/${sessionId}/participants?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/participants`);
}

/**
 * Met à jour le mode de financement d'une inscription depuis l'onglet
 * Participants. Le financement est porté par la `inscription_request`
 * miroir (sync 2026-05-13), donc on modifie celle-ci.
 *
 * Si le mode est "opco", on peut aussi rattacher un accord OPCO existant
 * via `opco_agreement_id`. Pour les autres modes, on retire tout lien
 * OPCO existant (cohérence : pas d'accord OPCO sur une inscription CPF).
 */
export async function updateEnrollmentFinancing(
  sessionId: string,
  enrollmentId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const mode = parseText(formData.get("financing_mode")) ?? "autofinancement";
    const opcoAgreementId =
      mode === "opco" ? parseText(formData.get("opco_agreement_id")) : null;

    const supabase = await createClient();

    // On a besoin de l'inscription_request liée
    const { data: enrollment } = await supabase
      .from("session_enrollments")
      .select("inscription_request_id")
      .eq("id", enrollmentId)
      .maybeSingle();

    const requestId = (enrollment?.inscription_request_id as string | null) ?? null;
    if (!requestId) {
      return {
        ok: false,
        error:
          "Aucune fiche d'inscription liée à ce participant. Ouvrez la fiche pour modifier le financement.",
      };
    }

    // Mise à jour du mode sur la inscription_request
    const { error: updateErr } = await supabase
      .from("inscription_requests")
      .update({ financing_mode: mode })
      .eq("id", requestId);
    if (updateErr) {
      return { ok: false, error: updateErr.message };
    }

    // Gestion des liens OPCO
    if (mode === "opco" && opcoAgreementId) {
      // Supprime d'abord les liens OPCO existants pour cette inscription,
      // puis crée le nouveau lien (un seul OPCO sélectionné via ce picker).
      await supabase
        .from("inscription_opco_fundings")
        .delete()
        .eq("inscription_id", requestId);
      const { error: linkErr } = await supabase
        .from("inscription_opco_fundings")
        .insert({
          inscription_id: requestId,
          agreement_id: opcoAgreementId,
        });
      if (linkErr) {
        return { ok: false, error: linkErr.message };
      }
    } else if (mode !== "opco") {
      // Mode non-OPCO → on retire les liens OPCO orphelins.
      await supabase
        .from("inscription_opco_fundings")
        .delete()
        .eq("inscription_id", requestId);
    }

    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/sessions/${sessionId}/participants`);
    revalidatePath("/inscriptions");
    revalidatePath(`/inscriptions/${requestId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Met à jour le canal d'inscription d'un apprenant sur une session.
 * Si le canal est "prescripteur" ou "of", l'entreprise référencée est
 * obligatoire (sinon validation côté UI). Le default 'direct' efface
 * l'entreprise référencée.
 */
export async function updateEnrollmentChannel(
  sessionId: string,
  enrollmentId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const channelRaw = parseText(formData.get("inscription_channel"));
    const channel: InscriptionChannel =
      channelRaw === "prescripteur"
        ? "prescripteur"
        : channelRaw === "of"
          ? "of"
          : "direct";
    const companyId = parseText(formData.get("inscription_channel_company_id"));

    if (channel !== "direct" && !companyId) {
      return {
        ok: false,
        error:
          "Sélectionnez l'entreprise (prescripteur ou OF) qui a apporté l'inscription.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("session_enrollments")
      .update({
        inscription_channel: channel,
        inscription_channel_company_id:
          channel === "direct" ? null : companyId,
      })
      .eq("id", enrollmentId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath(`/sessions/${sessionId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Démarre une session : passe son statut à `in_progress` après avoir
 * vérifié que tous les apprenants ont un canal d'inscription complet.
 *
 * Règle métier (chantier 2) :
 *   - Si un apprenant a un canal "prescripteur" ou "of" sans entreprise
 *     référencée → la session ne peut PAS être démarrée.
 *   - Si tous les apprenants sont en "direct" ou ont leur entreprise
 *     correctement référencée → OK.
 */
export async function startSession(
  sessionId: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
      incomplete?: Array<{ name: string; reason: string }>;
    }
> {
  try {
    const supabase = await createClient();

    // 1. Récupérer tous les enrollments avec leur canal + nom apprenant
    const { data: enrollments, error: fetchError } = await supabase
      .from("session_enrollments")
      .select(
        "id, inscription_channel, inscription_channel_company_id, status, learner:learners(first_name, last_name)",
      )
      .eq("session_id", sessionId)
      .neq("status", "cancelled");

    if (fetchError) {
      return { ok: false, error: fetchError.message };
    }

    if (!enrollments || enrollments.length === 0) {
      return {
        ok: false,
        error:
          "Aucun apprenant inscrit. Inscrivez au moins un apprenant avant de démarrer la session.",
      };
    }

    // 2. Identifier les enrollments incomplets
    const incomplete: Array<{ name: string; reason: string }> = [];
    for (const e of enrollments) {
      const ch = e.inscription_channel as string | null;
      const cid = e.inscription_channel_company_id as string | null;
      const ln = e.learner as unknown as {
        first_name: string;
        last_name: string;
      } | null;
      const name = ln
        ? `${ln.first_name} ${ln.last_name}`.trim()
        : "Apprenant inconnu";
      if ((ch === "prescripteur" || ch === "of") && !cid) {
        incomplete.push({
          name,
          reason: `Canal "${ch === "prescripteur" ? "Via un prescripteur" : "Via un OF"}" : entreprise manquante.`,
        });
      }
    }

    if (incomplete.length > 0) {
      return {
        ok: false,
        error: `Impossible de démarrer la session : ${incomplete.length} apprenant${incomplete.length > 1 ? "s ont" : " a"} une source d'inscription incomplète.`,
        incomplete,
      };
    }

    // 3. Mise à jour du statut session
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ status: "in_progress" })
      .eq("id", sessionId);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath("/sessions");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Erreur inattendue : ${msg}` };
  }
}

export async function removeEnrollment(
  sessionId: string,
  enrollmentId: string,
) {
  const supabase = await createClient();

  // R1 : on lit la company_id AVANT la suppression (sinon perdue) pour
  // pouvoir invalider la convention ensuite.
  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select("learner:learners(company_id)")
    .eq("id", enrollmentId)
    .maybeSingle<{ learner: { company_id: string | null } | null }>();
  const companyId = enrollment?.learner?.company_id ?? null;

  // Sync 2026-05-13 : on doit supprimer la inscription_request miroir
  // AVANT de supprimer l'enrollment (la FK étant `on delete set null`,
  // l'enrollment perdrait sinon son lien). Cascade dans le sens
  // Participants → Inscriptions.
  await cascadeDeleteRequestFromEnrollment(supabase, enrollmentId);

  const { error } = await supabase
    .from("session_enrollments")
    .delete()
    .eq("id", enrollmentId);

  if (error) {
    redirect(`/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`);
  }

  // R1 : si la session n'a pas démarré, invalider la convention de la société.
  if (companyId) {
    await invalidateConventionForCompany(
      sessionId,
      companyId,
      "Apprenant retiré de la session",
    );
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/participants`);
  // Reste sur l'onglet Participants (l'utilisateur y était au moment
  // du clic sur la poubelle). Avant 2026-05-13, on redirigeait vers
  // la fiche session, ce qui faisait perdre le contexte.
  redirect(`/sessions/${sessionId}/participants?unenrolled=1`);
}
