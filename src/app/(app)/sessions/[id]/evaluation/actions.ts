"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function toggleEvaluationOpen(
  sessionId: string,
  open: boolean,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ evaluation_open: open })
    .eq("id", sessionId);
  if (error) {
    redirect(
      `/sessions/${sessionId}/evaluation?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/sessions/${sessionId}/evaluation`);
  redirect(
    `/sessions/${sessionId}/evaluation?${open ? "opened=1" : "closed=1"}`,
  );
}
