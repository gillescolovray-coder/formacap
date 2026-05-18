"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

export async function updateSessionDay(
  sessionId: string,
  dayId: string,
  formData: FormData,
) {
  const payload = {
    morning_start: parseText(formData.get("morning_start")),
    morning_end: parseText(formData.get("morning_end")),
    afternoon_start: parseText(formData.get("afternoon_start")),
    afternoon_end: parseText(formData.get("afternoon_end")),
    notes: parseText(formData.get("notes")),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("session_days")
    .update(payload)
    .eq("id", dayId);

  if (error) {
    console.error("updateSessionDay error:", error);
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/emargement`);
}

export async function applyHoursToAllDays(
  sessionId: string,
  formData: FormData,
) {
  const payload = {
    morning_start: parseText(formData.get("morning_start")),
    morning_end: parseText(formData.get("morning_end")),
    afternoon_start: parseText(formData.get("afternoon_start")),
    afternoon_end: parseText(formData.get("afternoon_end")),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("session_days")
    .update(payload)
    .eq("session_id", sessionId);

  if (error) {
    console.error("applyHoursToAllDays error:", error);
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/emargement`);
}
