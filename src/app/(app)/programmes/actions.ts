"use server";

/**
 * Server actions du module de conception de programmes (Bloom) — Sprint A.
 * Les droits sont appliqués par la RLS (migration 0118) : création/édition
 * réservées admin/manager/référent ; validation au référent + admin.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  generateBloomObjectives,
  generateGeneralObjective,
  type BloomGenerationInput,
} from "@/lib/bloom/generate";
import type { BloomObjective } from "@/lib/bloom/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getCtx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  const orgId =
    (memberships ?? [])[0]?.organization_id as string | undefined;
  return { supabase, user, orgId, memberships: memberships ?? [] };
}

export type BlueprintFields = {
  internal_code: string | null;
  title: string;
  theme: string | null;
  target_audience: string | null;
  duration_hours: number | null;
  duration_days: number | null;
  general_objective: string | null;
};

export async function createBlueprint(
  fields: BlueprintFields,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Non authentifié." };
  if (!ctx.orgId) return { ok: false, error: "Aucune organisation active." };
  if (!fields.title?.trim()) return { ok: false, error: "Le titre est obligatoire." };

  const { data, error } = await ctx.supabase
    .from("program_blueprints")
    .insert({
      organization_id: ctx.orgId,
      internal_code: fields.internal_code,
      title: fields.title.trim(),
      theme: fields.theme,
      target_audience: fields.target_audience,
      duration_hours: fields.duration_hours,
      duration_days: fields.duration_days,
      general_objective: fields.general_objective,
      created_by: ctx.user.id,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Création impossible." };
  }
  revalidatePath("/programmes");
  return { ok: true, id: data.id as string };
}

export async function saveBlueprint(
  id: string,
  fields: BlueprintFields,
  objectives: BloomObjective[],
): Promise<{ ok: boolean; error?: string }> {
  if (!UUID_REGEX.test(id)) return { ok: false, error: "Identifiant invalide." };
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Non authentifié." };

  const { error } = await ctx.supabase
    .from("program_blueprints")
    .update({
      internal_code: fields.internal_code,
      title: fields.title.trim(),
      theme: fields.theme,
      target_audience: fields.target_audience,
      duration_hours: fields.duration_hours,
      duration_days: fields.duration_days,
      general_objective: fields.general_objective,
      bloom_objectives: objectives,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/programmes/${id}`);
  revalidatePath("/programmes");
  return { ok: true };
}

export async function generateObjectivesAction(
  input: BloomGenerationInput,
): Promise<{ ok: true; objectives: BloomObjective[] } | { ok: false; error: string }> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Non authentifié." };
  if (!input.title?.trim()) {
    return { ok: false, error: "Renseignez au moins le titre avant de générer." };
  }
  try {
    const objectives = await generateBloomObjectives(input);
    if (objectives.length === 0) {
      return { ok: false, error: "L'IA n'a renvoyé aucun objectif exploitable. Réessayez." };
    }
    return { ok: true, objectives };
  } catch (e) {
    return {
      ok: false,
      error:
        (e as Error).message ||
        "Génération IA indisponible (vérifiez la configuration Gemini / LM Studio).",
    };
  }
}

export async function generateGeneralObjectiveAction(
  input: BloomGenerationInput,
): Promise<{ ok: true; objective: string } | { ok: false; error: string }> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Non authentifié." };
  if (!input.title?.trim()) {
    return { ok: false, error: "Renseignez au moins le titre avant de générer." };
  }
  try {
    const objective = await generateGeneralObjective(input);
    if (!objective) {
      return { ok: false, error: "L'IA n'a renvoyé aucune proposition. Réessayez." };
    }
    return { ok: true, objective };
  } catch (e) {
    return {
      ok: false,
      error:
        (e as Error).message ||
        "Génération IA indisponible (vérifiez la configuration Gemini / LM Studio).",
    };
  }
}

/** Liste des thèmes déjà utilisés (programmes + formations) pour le menu. */
export async function listThemesAction(): Promise<string[]> {
  const ctx = await getCtx();
  if (!ctx?.orgId) return [];
  const set = new Set<string>();
  const [{ data: bp }, { data: fo }] = await Promise.all([
    ctx.supabase
      .from("program_blueprints")
      .select("theme")
      .eq("organization_id", ctx.orgId),
    ctx.supabase
      .from("formations")
      .select("theme")
      .eq("organization_id", ctx.orgId),
  ]);
  for (const r of [...(bp ?? []), ...(fo ?? [])] as Array<{
    theme: string | null;
  }>) {
    const t = (r.theme ?? "").trim();
    if (t) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
}

export async function submitForReview(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!UUID_REGEX.test(id)) return { ok: false, error: "Identifiant invalide." };
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Non authentifié." };
  const { error } = await ctx.supabase
    .from("program_blueprints")
    .update({ status: "pending_review", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/programmes/${id}`);
  revalidatePath("/programmes");
  return { ok: true };
}

export async function reviewBlueprint(
  id: string,
  decision: "approved" | "changes_requested",
  comment: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!UUID_REGEX.test(id)) return { ok: false, error: "Identifiant invalide." };
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Non authentifié." };

  // Journal (RLS : réservé référent/admin) — sert aussi de garde d'accès.
  const { error: revErr } = await ctx.supabase
    .from("program_blueprint_reviews")
    .insert({
      blueprint_id: id,
      step: "objectives",
      decision,
      comment: comment?.trim() || null,
      reviewer_id: ctx.user.id,
    });
  if (revErr) return { ok: false, error: revErr.message };

  const newStatus =
    decision === "approved" ? "objectives_approved" : "changes_requested";
  const { error } = await ctx.supabase
    .from("program_blueprints")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/programmes/${id}`);
  revalidatePath("/programmes");
  return { ok: true };
}

export async function deleteBlueprint(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!UUID_REGEX.test(id)) return { ok: false, error: "Identifiant invalide." };
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Non authentifié." };
  const { error } = await ctx.supabase
    .from("program_blueprints")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/programmes");
  return { ok: true };
}
