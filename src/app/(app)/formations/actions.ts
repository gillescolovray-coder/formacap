"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { humanizeSupabaseError } from "@/lib/supabase/error-messages";
import type {
  FormationModality,
  FormationStatus,
  ProgrammeDay,
} from "@/lib/formations/types";

async function getCurrentOrganizationId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Aucune organisation rattachée à ce compte");
  return { organizationId: data.organization_id, userId: user.id };
}

function parseOperationalObjectives(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseNumber(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === "") return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function parseInt(raw: FormDataEntryValue | null): number | null {
  const s = parseText(raw);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function parseProgrammeDays(raw: FormDataEntryValue | null): ProgrammeDay[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((d) => ({
        morning: typeof d?.morning === "string" ? d.morning : "",
        afternoon: typeof d?.afternoon === "string" ? d.afternoon : "",
      }))
      .filter((d) => d.morning.trim() !== "" || d.afternoon.trim() !== "");
  } catch {
    return [];
  }
}

function buildPayload(formData: FormData) {
  return {
    title: parseText(formData.get("title")),
    internal_code: parseText(formData.get("internal_code")),
    category_id: parseText(formData.get("category_id")),
    description: parseText(formData.get("description")),
    general_objective: parseText(formData.get("general_objective")),
    operational_objectives: parseOperationalObjectives(
      parseText(formData.get("operational_objectives")),
    ),
    target_audience: parseText(formData.get("target_audience")),
    prerequisites: parseText(formData.get("prerequisites")),
    programme_days: parseProgrammeDays(formData.get("programme_days")),
    pedagogy_approach: parseText(formData.get("pedagogy_approach")),
    teaching_methods: parseText(formData.get("teaching_methods")),
    technical_means: parseText(formData.get("technical_means")),
    evaluation_methods: parseText(formData.get("evaluation_methods")),
    accessibility: parseText(formData.get("accessibility")),
    duration_hours: parseNumber(formData.get("duration_hours")),
    duration_days: parseInt(formData.get("duration_days")),
    modality:
      (parseText(formData.get("modality")) as FormationModality | null) ??
      null,
    min_participants: parseInt(formData.get("min_participants")),
    max_participants: parseInt(formData.get("max_participants")),
    // Le tarif "public" historique est désormais aligné sur le tarif
    // entreprise par défaut (un seul champ visible côté formulaire).
    // On reporte price_company → public_price_excl_tax pour conserver
    // les autres modules qui consomment cette colonne (devis, sessions…).
    public_price_excl_tax: parseNumber(formData.get("price_company")),
    pricing_note: null,
    status:
      (parseText(formData.get("status")) as FormationStatus | null) ?? "draft",
    // Lot 1 — Métadonnées commerciales
    subtitle: parseText(formData.get("subtitle")),
    cover_image_url: parseText(formData.get("cover_image_url")),
    version_date: parseText(formData.get("version_date")),
    price_company: parseNumber(formData.get("price_company")),
    price_individual: parseNumber(formData.get("price_individual")),
    // Tarif indépendant retiré du formulaire — laissé à null. Réutilise
    // automatiquement price_company sur les devis si besoin (à la marge).
    price_independent: null,
    is_cpf_eligible: formData.get("is_cpf_eligible") === "on",
    is_published_online: formData.get("is_published_online") === "on",
    // Lot 2 — Qualiopi avancé
    execution_followup: parseText(formData.get("execution_followup")),
    certification_terms: parseText(formData.get("certification_terms")),
    quality_indicators: parseText(formData.get("quality_indicators")),
    competence_domains: parseOperationalObjectives(
      parseText(formData.get("competence_domains")),
    ),
    // Lot 3 — Comptabilité
    accounting_product_code: parseText(formData.get("accounting_product_code")),
    accounting_analytic_code: parseText(formData.get("accounting_analytic_code")),
  };
}

export async function createFormation(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const payload = buildPayload(formData);

  if (!payload.title) {
    redirect("/formations/new?error=Le+titre+est+obligatoire");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formations")
    .insert({
      ...payload,
      organization_id: organizationId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    redirect(
      `/formations/new?error=${encodeURIComponent(humanizeSupabaseError(error))}`,
    );
  }

  revalidatePath("/formations");
  redirect(`/formations/${data.id}?created=1`);
}

export async function updateFormation(id: string, formData: FormData) {
  const payload = buildPayload(formData);

  if (!payload.title) {
    redirect(`/formations/${id}?error=Le+titre+est+obligatoire`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("formations")
    .update(payload)
    .eq("id", id);

  if (error) {
    redirect(
      `/formations/${id}?error=${encodeURIComponent(humanizeSupabaseError(error))}`,
    );
  }

  revalidatePath("/formations");
  revalidatePath(`/formations/${id}`);
  redirect(`/formations/${id}?updated=1`);
}

export async function duplicateFormation(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: src, error: fetchError } = await supabase
    .from("formations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !src) {
    redirect(
      `/formations/${id}?error=${encodeURIComponent("Formation introuvable")}`,
    );
  }

  // Copie tout sauf id/created_at/updated_at, force statut draft et titre + (copie)
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = src as Record<
    string,
    unknown
  >;
  void _id;
  void _ca;
  void _ua;

  const newPayload = {
    ...rest,
    title: `${src.title} (copie)`,
    status: "draft" as FormationStatus,
    internal_code: src.internal_code
      ? `${src.internal_code}-COPIE`
      : null,
    programme_pdf_url: null,
    programme_pdf_name: null,
    created_by: user.id,
  };

  const { data: created, error: insertError } = await supabase
    .from("formations")
    .insert(newPayload)
    .select("id")
    .single();

  if (insertError || !created) {
    redirect(
      `/formations/${id}?error=${encodeURIComponent("Duplication échouée : " + (insertError?.message ?? "inconnue"))}`,
    );
  }

  revalidatePath("/formations");
  redirect(`/formations/${created.id}?duplicated=1`);
}

export async function archiveFormation(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("formations")
    .update({ status: "archived" as FormationStatus })
    .eq("id", id);

  if (error) {
    redirect(`/formations/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/formations");
  revalidatePath(`/formations/${id}`);
  redirect("/formations");
}

/**
 * Supprime définitivement une formation — uniquement si aucune session
 * n'a été créée à partir d'elle. Sinon, redirige avec un message d'erreur
 * explicite (il faut archiver la formation plutôt que la supprimer).
 */
export async function deleteFormation(id: string) {
  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("formation_id", id);

  if (countError) {
    redirect(
      `/formations/${id}?error=${encodeURIComponent(countError.message)}`,
    );
  }

  const sessionCount = count ?? 0;
  if (sessionCount > 0) {
    redirect(
      `/formations/${id}?error=${encodeURIComponent(
        `Suppression impossible : ${sessionCount} session${
          sessionCount > 1 ? "s ont" : " a"
        } été créée${sessionCount > 1 ? "s" : ""} à partir de cette formation. Archivez-la plutôt (bouton « Archiver ») pour la retirer du catalogue actif.`,
      )}`,
    );
  }

  const { error } = await supabase.from("formations").delete().eq("id", id);
  if (error) {
    redirect(`/formations/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/formations");
  redirect("/formations");
}
