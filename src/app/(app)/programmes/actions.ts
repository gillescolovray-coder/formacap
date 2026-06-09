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
  generateProgramContent,
  generateProgramDeroule,
  type BloomGenerationInput,
  type ProgramContent,
  type ProgramDay,
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

export type ProgrammeDay = { morning: string; afternoon: string };

export type BlueprintFields = {
  internal_code: string | null;
  title: string;
  theme: string | null;
  target_audience: string | null;
  duration_hours: number | null;
  duration_days: number | null;
  general_objective: string | null;
  // Contenu riche (HTML) — Gilles 2026-06-09
  prerequisites: string | null;
  evaluation_methods: string | null;
  teaching_methods: string | null;
  programme_days: ProgrammeDay[];
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
      prerequisites: fields.prerequisites,
      evaluation_methods: fields.evaluation_methods,
      teaching_methods: fields.teaching_methods,
      programme_days: fields.programme_days ?? [],
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
      prerequisites: fields.prerequisites,
      evaluation_methods: fields.evaluation_methods,
      teaching_methods: fields.teaching_methods,
      programme_days: fields.programme_days ?? [],
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

export async function generateProgramContentAction(
  input: BloomGenerationInput,
): Promise<{ ok: true; content: ProgramContent } | { ok: false; error: string }> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Non authentifié." };
  if (!input.title?.trim()) {
    return { ok: false, error: "Renseignez au moins le titre avant de générer." };
  }
  try {
    const content = await generateProgramContent(input);
    return { ok: true, content };
  } catch (e) {
    return {
      ok: false,
      error:
        (e as Error).message ||
        "Génération IA indisponible (vérifiez la configuration Gemini / LM Studio).",
    };
  }
}

export async function generateProgramDerouleAction(
  input: BloomGenerationInput & { durationDays?: number | null },
): Promise<{ ok: true; days: ProgramDay[] } | { ok: false; error: string }> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Non authentifié." };
  if (!input.title?.trim()) {
    return { ok: false, error: "Renseignez au moins le titre avant de générer." };
  }
  try {
    const days = await generateProgramDeroule(input);
    return { ok: true, days };
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

/**
 * Bascule un programme VALIDÉ vers le Catalogue : crée une fiche formation
 * (statut brouillon) à partir du programme, puis lie les deux. Gilles 2026-06-08.
 */
export async function publishBlueprintToCatalog(
  id: string,
): Promise<{ ok: boolean; error?: string; formationId?: string }> {
  if (!UUID_REGEX.test(id)) return { ok: false, error: "Identifiant invalide." };
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Non authentifié." };

  const { data: bp } = await ctx.supabase
    .from("program_blueprints")
    .select(
      "id, organization_id, status, formation_id, internal_code, title, theme, target_audience, duration_hours, duration_days, general_objective, prerequisites, evaluation_methods, teaching_methods, programme_days, bloom_objectives",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      organization_id: string;
      status: string;
      formation_id: string | null;
      internal_code: string | null;
      title: string;
      theme: string | null;
      target_audience: string | null;
      duration_hours: number | null;
      duration_days: number | null;
      general_objective: string | null;
      prerequisites: string | null;
      evaluation_methods: string | null;
      teaching_methods: string | null;
      programme_days: ProgrammeDay[] | null;
      bloom_objectives: BloomObjective[] | null;
    }>();
  if (!bp) return { ok: false, error: "Programme introuvable." };
  if (bp.status !== "objectives_approved") {
    return {
      ok: false,
      error: "Le programme doit être « Objectifs validés » avant la bascule.",
    };
  }
  if (bp.formation_id) {
    // Déjà basculé : on renvoie la fiche existante (idempotent).
    return { ok: true, formationId: bp.formation_id };
  }

  const objectives = (bp.bloom_objectives ?? [])
    .map((o) => o.text?.trim())
    .filter((t): t is string => Boolean(t));

  const { data: created, error } = await ctx.supabase
    .from("formations")
    .insert({
      organization_id: bp.organization_id,
      created_by: ctx.user.id,
      title: bp.title,
      internal_code: bp.internal_code,
      theme: bp.theme,
      target_audience: bp.target_audience,
      duration_hours: bp.duration_hours,
      duration_days: bp.duration_days,
      general_objective: bp.general_objective,
      prerequisites: bp.prerequisites,
      evaluation_methods: bp.evaluation_methods,
      teaching_methods: bp.teaching_methods,
      programme_days: bp.programme_days ?? [],
      operational_objectives: objectives,
      status: "draft",
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "Création de la formation impossible." };
  }

  await ctx.supabase
    .from("program_blueprints")
    .update({ formation_id: created.id, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(`/programmes/${id}`);
  revalidatePath("/programmes");
  revalidatePath("/formations");
  return { ok: true, formationId: created.id };
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
