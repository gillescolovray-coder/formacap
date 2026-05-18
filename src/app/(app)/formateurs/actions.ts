"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneE164 } from "@/lib/phone";
import type {
  TrainerStatus,
  TrainerValidationStatus,
} from "@/lib/trainers/types";

async function getCurrentOrganizationId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Aucune organisation rattachée à ce compte");
  return {
    organizationId: data.organization_id,
    userId: user.id,
    role: data.role as string,
  };
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function parseInt0(raw: FormDataEntryValue | null): number | null {
  const s = parseText(raw);
  if (s === null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloat0(raw: FormDataEntryValue | null): number | null {
  const s = parseText(raw);
  if (s === null) return null;
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseBool(raw: FormDataEntryValue | null, def = false): boolean {
  if (raw === null) return def;
  return raw === "on" || raw === "true" || raw === "1";
}

function parseStringArray(formData: FormData, key: string): string[] | null {
  // Accepte soit plusieurs valeurs (checkboxes name="key" multiples)
  // soit une chaîne unique séparée par des virgules (rétrocompat).
  const all = formData.getAll(key);
  if (all.length > 1) {
    const list = all
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);
    return list.length > 0 ? list : null;
  }
  const raw = formData.get(key);
  if (!raw) return null;
  const list = String(raw)
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return list.length > 0 ? list : null;
}

function buildPayload(formData: FormData) {
  return {
    first_name: parseText(formData.get("first_name")),
    last_name: parseText(formData.get("last_name")),
    status:
      (parseText(formData.get("status")) as TrainerStatus | null) ??
      "independant",
    birth_date: parseText(formData.get("birth_date")),

    email: parseText(formData.get("email")),
    phone: normalizePhoneE164(parseText(formData.get("phone"))),
    mobile: normalizePhoneE164(parseText(formData.get("mobile"))),
    address: parseText(formData.get("address")),
    postal_code: parseText(formData.get("postal_code")),
    city: parseText(formData.get("city")),
    country: parseText(formData.get("country")) ?? "France",

    siret: parseText(formData.get("siret")),
    legal_form: parseText(formData.get("legal_form")),
    company_name: parseText(formData.get("company_name")),
    nda: parseText(formData.get("nda")),
    is_qualiopi: parseBool(formData.get("is_qualiopi")),
    // qualiopi_expires_on : géré exclusivement via l'upload du certificat
    // (synchronisation depuis le document, source de vérité unique).
    rib_on_file: parseBool(formData.get("rib_on_file")),
    company_address_same: parseBool(formData.get("company_address_same")),
    company_address: parseBool(formData.get("company_address_same"))
      ? parseText(formData.get("address"))
      : parseText(formData.get("company_address")),
    company_postal_code: parseBool(formData.get("company_address_same"))
      ? parseText(formData.get("postal_code"))
      : parseText(formData.get("company_postal_code")),
    company_city: parseBool(formData.get("company_address_same"))
      ? parseText(formData.get("city"))
      : parseText(formData.get("company_city")),
    company_country: parseBool(formData.get("company_address_same"))
      ? (parseText(formData.get("country")) ?? "France")
      : (parseText(formData.get("company_country")) ?? "France"),
    company_phone: normalizePhoneE164(parseText(formData.get("company_phone"))),
    company_email: parseText(formData.get("company_email")),

    contract_type: parseText(formData.get("contract_type")),
    contract_reference: parseText(formData.get("contract_reference")),
    contract_start_date: parseText(formData.get("contract_start_date")),
    contract_end_date: parseText(formData.get("contract_end_date")),

    intervention_domains: parseStringArray(formData, "intervention_domains"),
    target_audiences: parseStringArray(formData, "target_audiences"),
    intervention_levels: parseStringArray(formData, "intervention_levels"),
    modalities: parseStringArray(formData, "modalities"),
    intervention_radius_km: parseInt0(formData.get("intervention_radius_km")),
    intervention_nationwide: parseBool(formData.get("intervention_nationwide")),

    technical_skills: parseText(formData.get("technical_skills")),
    pedagogical_skills: parseText(formData.get("pedagogical_skills")),
    years_pro_experience: parseInt0(formData.get("years_pro_experience")),
    years_training_experience: parseInt0(
      formData.get("years_training_experience"),
    ),
    example_trainings: parseText(formData.get("example_trainings")),

    competence_justification: parseText(
      formData.get("competence_justification"),
    ),

    satisfaction_avg: parseFloat0(formData.get("satisfaction_avg")),
    satisfaction_scale: parseInt0(formData.get("satisfaction_scale")) ?? 5,
    last_evaluation_date: parseText(formData.get("last_evaluation_date")),
    evaluation_notes: parseText(formData.get("evaluation_notes")),
    has_complaints: parseBool(formData.get("has_complaints")),
    complaints_notes: parseText(formData.get("complaints_notes")),

    cpd_actions: parseText(formData.get("cpd_actions")),
    last_cpd_date: parseText(formData.get("last_cpd_date")),

    urssaf_attestation_on_file: parseBool(
      formData.get("urssaf_attestation_on_file"),
    ),
    urssaf_expires_on: parseText(formData.get("urssaf_expires_on")),
    rc_pro_on_file: parseBool(formData.get("rc_pro_on_file")),
    rc_pro_expires_on: parseText(formData.get("rc_pro_expires_on")),
    kbis_on_file: parseBool(formData.get("kbis_on_file")),

    charter_signed: parseBool(formData.get("charter_signed")),
    charter_signed_on: parseText(formData.get("charter_signed_on")),
    handicap_procedure_ack: parseBool(formData.get("handicap_procedure_ack")),
    ri_ack: parseBool(formData.get("ri_ack")),

    validation_status:
      (parseText(
        formData.get("validation_status"),
      ) as TrainerValidationStatus | null) ?? "a_valider",
    is_active: parseBool(formData.get("is_active"), true),
    notes_internal: parseText(formData.get("notes_internal")),
  };
}

export async function createTrainer(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const payload = buildPayload(formData);

  if (!payload.first_name || !payload.last_name) {
    redirect(
      "/formateurs/new?error=Le+nom+et+le+prénom+sont+obligatoires",
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trainers")
    .insert({
      ...payload,
      organization_id: organizationId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/formateurs/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/formateurs");
  redirect(`/formateurs/${data.id}?created=1`);
}

export async function updateTrainer(id: string, formData: FormData) {
  const payload = buildPayload(formData);

  if (!payload.first_name || !payload.last_name) {
    redirect(
      `/formateurs/${id}?error=Le+nom+et+le+prénom+sont+obligatoires`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("trainers")
    .update(payload)
    .eq("id", id);

  if (error) {
    redirect(`/formateurs/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/formateurs");
  revalidatePath(`/formateurs/${id}`);
  redirect(`/formateurs/${id}?updated=1`);
}

export async function deleteTrainer(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("trainers").delete().eq("id", id);
  if (error) {
    redirect(`/formateurs/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/formateurs");
  redirect("/formateurs");
}

export async function validateTrainer(id: string) {
  const { userId } = await getCurrentOrganizationId();
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const { error } = await supabase
    .from("trainers")
    .update({
      validation_status: "valide",
      validated_by: userId,
      validated_on: today,
    })
    .eq("id", id);
  if (error) {
    redirect(`/formateurs/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/formateurs/${id}`);
  redirect(`/formateurs/${id}?validated=1`);
}

export async function linkFormation(
  trainerId: string,
  formationId: string,
  justification: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("trainer_formations").insert({
    trainer_id: trainerId,
    formation_id: formationId,
    justification,
  });
  if (error) {
    redirect(
      `/formateurs/${trainerId}?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/formateurs/${trainerId}`);
  redirect(`/formateurs/${trainerId}?linked=1`);
}

export async function unlinkFormation(
  trainerId: string,
  formationId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("trainer_formations")
    .delete()
    .eq("trainer_id", trainerId)
    .eq("formation_id", formationId);
  if (error) {
    redirect(
      `/formateurs/${trainerId}?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/formateurs/${trainerId}`);
  redirect(`/formateurs/${trainerId}?unlinked=1`);
}
