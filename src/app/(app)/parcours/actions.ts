"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ParcoursStatus } from "@/lib/parcours/types";

async function getOrgId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Aucune organisation");
  return { organizationId: data.organization_id as string, userId: user.id };
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function parseBool(raw: FormDataEntryValue | null, def = false): boolean {
  if (raw === null) return def;
  return raw === "on" || raw === "true" || raw === "1";
}

function buildPayload(formData: FormData) {
  return {
    name: parseText(formData.get("name")),
    internal_code: parseText(formData.get("internal_code")),
    description: parseText(formData.get("description")),
    target_audience: parseText(formData.get("target_audience")),
    general_objective: parseText(formData.get("general_objective")),
    prerequisites: parseText(formData.get("prerequisites")),
    notes: parseText(formData.get("notes")),
    status:
      (parseText(formData.get("status")) as ParcoursStatus | null) ?? "draft",
    is_active: parseBool(formData.get("is_active"), true),
  };
}

export async function createParcours(formData: FormData) {
  const { organizationId, userId } = await getOrgId();
  const payload = buildPayload(formData);
  if (!payload.name) {
    redirect("/parcours/new?error=Le+nom+du+parcours+est+obligatoire");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parcours")
    .insert({
      ...payload,
      organization_id: organizationId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    redirect(`/parcours/new?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/parcours");
  redirect(`/parcours/${data.id}?created=1`);
}

export async function updateParcours(id: string, formData: FormData) {
  const payload = buildPayload(formData);
  if (!payload.name) {
    redirect(`/parcours/${id}?error=Le+nom+du+parcours+est+obligatoire`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("parcours")
    .update(payload)
    .eq("id", id);
  if (error) {
    redirect(`/parcours/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/parcours");
  revalidatePath(`/parcours/${id}`);
  redirect(`/parcours/${id}?updated=1`);
}

export async function deleteParcours(id: string) {
  const supabase = await createClient();
  // Détache les sessions du parcours avant suppression
  await supabase
    .from("sessions")
    .update({ parcours_id: null, parcours_position: null })
    .eq("parcours_id", id);
  const { error } = await supabase.from("parcours").delete().eq("id", id);
  if (error) {
    redirect(`/parcours/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/parcours");
  redirect("/parcours");
}

/**
 * Attache une session existante au parcours (à la fin de la liste).
 */
export async function attachSession(parcoursId: string, formData: FormData) {
  const sessionId = parseText(formData.get("session_id"));
  if (!sessionId) {
    redirect(
      `/parcours/${parcoursId}?error=${encodeURIComponent("Session requise")}`,
    );
  }
  const supabase = await createClient();
  // Position = max + 1
  const { data: existing } = await supabase
    .from("sessions")
    .select("parcours_position")
    .eq("parcours_id", parcoursId)
    .order("parcours_position", { ascending: false })
    .limit(1);
  const nextPos =
    existing && existing[0]?.parcours_position
      ? (existing[0].parcours_position as number) + 1
      : 1;

  const { error } = await supabase
    .from("sessions")
    .update({ parcours_id: parcoursId, parcours_position: nextPos })
    .eq("id", sessionId);

  if (error) {
    redirect(
      `/parcours/${parcoursId}?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/parcours/${parcoursId}`);
  redirect(`/parcours/${parcoursId}?sessionAdded=1`);
}

export async function detachSession(parcoursId: string, sessionId: string) {
  const supabase = await createClient();
  await supabase
    .from("sessions")
    .update({ parcours_id: null, parcours_position: null })
    .eq("id", sessionId);
  revalidatePath(`/parcours/${parcoursId}`);
  redirect(`/parcours/${parcoursId}?sessionRemoved=1`);
}

export async function moveSession(
  parcoursId: string,
  sessionId: string,
  direction: "up" | "down",
) {
  const supabase = await createClient();
  const { data: all } = await supabase
    .from("sessions")
    .select("id, parcours_position")
    .eq("parcours_id", parcoursId)
    .order("parcours_position", { ascending: true });

  if (!all) return;
  const idx = all.findIndex((s) => s.id === sessionId);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return;

  const a = all[idx];
  const b = all[swapIdx];
  // Swap positions
  await supabase
    .from("sessions")
    .update({ parcours_position: b.parcours_position })
    .eq("id", a.id);
  await supabase
    .from("sessions")
    .update({ parcours_position: a.parcours_position })
    .eq("id", b.id);

  revalidatePath(`/parcours/${parcoursId}`);
  redirect(`/parcours/${parcoursId}?reordered=1`);
}
