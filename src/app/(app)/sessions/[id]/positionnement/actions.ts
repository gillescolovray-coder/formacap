"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  TRAINER_ADAPTATIONS,
  type PositioningTrainerObservation,
  type TrainerAdaptationValue,
} from "@/lib/positioning/types";

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
