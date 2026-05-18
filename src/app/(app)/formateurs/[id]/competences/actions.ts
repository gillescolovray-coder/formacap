"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

export async function addCompetence(
  trainerId: string,
  formData: FormData,
) {
  const domainId = parseText(formData.get("domain_id"));
  const levelId = parseText(formData.get("level_id"));
  const notes = parseText(formData.get("notes"));

  if (!domainId || !levelId) {
    redirect(
      `/formateurs/${trainerId}?error=${encodeURIComponent("Domaine et niveau requis")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("trainer_competences").insert({
    trainer_id: trainerId,
    domain_id: domainId,
    level_id: levelId,
    notes,
  });

  if (error) {
    redirect(
      `/formateurs/${trainerId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/formateurs/${trainerId}`);
  redirect(`/formateurs/${trainerId}?competenceAdded=1`);
}

export async function updateCompetenceLevel(
  trainerId: string,
  competenceId: string,
  formData: FormData,
) {
  const levelId = parseText(formData.get("level_id"));
  if (!levelId) return;

  const supabase = await createClient();
  await supabase
    .from("trainer_competences")
    .update({ level_id: levelId })
    .eq("id", competenceId);

  revalidatePath(`/formateurs/${trainerId}`);
  redirect(`/formateurs/${trainerId}?competenceUpdated=1`);
}

export async function removeCompetence(
  trainerId: string,
  competenceId: string,
) {
  const supabase = await createClient();
  await supabase
    .from("trainer_competences")
    .delete()
    .eq("id", competenceId);

  revalidatePath(`/formateurs/${trainerId}`);
  redirect(`/formateurs/${trainerId}?competenceRemoved=1`);
}
