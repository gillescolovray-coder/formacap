"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sendPositioningInvite } from "@/lib/positioning/send";
import {
  TRAINER_ADAPTATIONS,
  type PositioningTrainerObservation,
  type TrainerAdaptationValue,
} from "@/lib/positioning/types";

const POS_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getAppOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

/**
 * (Re)envoie le test de positionnement par email à UN apprenant.
 * Tracé via email_log (type 'positionnement'). Gilles 2026-06-05.
 */
export async function sendPositioningTest(
  sessionId: string,
  enrollmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!POS_UUID_REGEX.test(enrollmentId)) {
    return { ok: false, error: "Identifiant invalide." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  const origin = await getAppOrigin();
  const res = await sendPositioningInvite(supabase, enrollmentId, origin);
  revalidatePath(`/sessions/${sessionId}/positionnement`);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

/**
 * Envoie le test à tous les inscrits "en attente" (pas encore rempli)
 * qui ont un email. Renvoie un récapitulatif (envoyés / sans email / échecs).
 */
export async function sendPositioningToAllPending(
  sessionId: string,
): Promise<{
  ok: boolean;
  sent?: number;
  skippedNoEmail?: number;
  failed?: number;
  error?: string;
}> {
  if (!POS_UUID_REGEX.test(sessionId)) {
    return { ok: false, error: "Identifiant invalide." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id, learner:learners(email)")
    .eq("session_id", sessionId)
    .neq("status", "cancelled");

  const { data: responses } = await supabase
    .from("positioning_responses")
    .select("enrollment_id");
  const done = new Set(
    (responses ?? []).map(
      (r) => (r as { enrollment_id: string }).enrollment_id,
    ),
  );

  const origin = await getAppOrigin();
  let sent = 0;
  let skippedNoEmail = 0;
  let failed = 0;
  for (const row of (enrollments ?? []) as unknown as Array<{
    id: string;
    learner: { email: string | null } | null;
  }>) {
    if (done.has(row.id)) continue;
    if (!row.learner?.email?.trim()) {
      skippedNoEmail++;
      continue;
    }
    const res = await sendPositioningInvite(supabase, row.id, origin);
    if (res.ok) sent++;
    else failed++;
  }

  revalidatePath(`/sessions/${sessionId}/positionnement`);
  return { ok: true, sent, skippedNoEmail, failed };
}

const VALID_ADAPTATION_VALUES = TRAINER_ADAPTATIONS.map((a) => a.value);

/**
 * Enregistre la Section 7 (Observation formateur) d'un test de
 * positionnement (Qualiopi indicateur 12 — Sprint D Gilles 2026-05-22).
 *
 * - L'observation est stockée dans positioning_responses.trainer_observation
 *   (jsonb) avec horodatage trainer_filled_at.
 * - Si la réponse apprenant n'existe pas encore, on en crée une coquille
 *   pour permettre au formateur de pré-remplir son observation avant que
 *   l'apprenant ait répondu (cas rare mais utile).
 */
export async function saveTrainerObservation(
  sessionId: string,
  enrollmentId: string,
  formData: FormData,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Parse adaptations (multi-choix via checkboxes name="adaptation")
  const rawAdaptations = formData.getAll("adaptation").map(String);
  const adaptations = rawAdaptations.filter((v): v is TrainerAdaptationValue =>
    VALID_ADAPTATION_VALUES.includes(v as TrainerAdaptationValue),
  );

  const otherText = String(formData.get("other_adaptation_text") ?? "").trim();
  const trainerComment = String(formData.get("trainer_comment") ?? "").trim();

  const observation: PositioningTrainerObservation = {
    adaptations,
    other_adaptation_text: otherText || undefined,
    trainer_comment: trainerComment || undefined,
  };

  // Si la réponse apprenant existe → update, sinon → insert coquille
  const { data: existing } = await supabase
    .from("positioning_responses")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle<{ id: string }>();

  const now = new Date().toISOString();
  if (existing) {
    await supabase
      .from("positioning_responses")
      .update({
        trainer_observation: observation,
        trainer_filled_at: now,
      })
      .eq("id", existing.id);
  } else {
    // Coquille minimaliste — apprenant pas encore répondu
    await supabase.from("positioning_responses").insert({
      enrollment_id: enrollmentId,
      data: {},
      trainer_observation: observation,
      trainer_filled_at: now,
    });
  }

  revalidatePath(`/sessions/${sessionId}/positionnement/${enrollmentId}`);
  revalidatePath(`/sessions/${sessionId}/positionnement`);
  redirect(
    `/sessions/${sessionId}/positionnement/${enrollmentId}?saved=1`,
  );
}

/**
 * Variante object-based (sans redirect) appelée par le composant client
 * TrainerObservationForm. Renvoie { ok } ou { ok:false, error }.
 * (Gilles 2026-05-22, Sprint D Section 7)
 */
export async function saveTrainerObservationObject(
  sessionId: string,
  enrollmentId: string,
  observation: PositioningTrainerObservation,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  // Nettoyage défensif : adaptations doit être restreint aux valeurs valides.
  const adaptations = (observation.adaptations ?? []).filter(
    (v): v is TrainerAdaptationValue =>
      VALID_ADAPTATION_VALUES.includes(v as TrainerAdaptationValue),
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

  revalidatePath(`/sessions/${sessionId}/positionnement/${enrollmentId}`);
  revalidatePath(`/sessions/${sessionId}/positionnement`);
  return { ok: true };
}
