"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneE164 } from "@/lib/phone";
import type {
  ApplicableRi,
  LocationKind,
  ParkingKind,
  PmrLevel,
} from "@/lib/locations/types";

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

function parseBool(raw: FormDataEntryValue | null, defaultValue = false): boolean {
  if (raw === null) return defaultValue;
  return raw === "on" || raw === "true" || raw === "1";
}

function parseTriBool(raw: FormDataEntryValue | null): boolean | null {
  const s = parseText(raw);
  if (s === null) return null;
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

function parseConfigurations(formData: FormData): string[] | null {
  const raw = formData.getAll("configurations");
  const list = raw
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);
  return list.length > 0 ? list : null;
}

function buildPayload(formData: FormData, isAdminOrManager: boolean) {
  const equipment = {
    tables_chairs: parseBool(formData.get("eq_tables_chairs")),
    projector: parseBool(formData.get("eq_projector")),
    paperboard: parseBool(formData.get("eq_paperboard")),
    wifi: parseBool(formData.get("eq_wifi")),
    wifi_code: parseText(formData.get("eq_wifi_code")) ?? undefined,
    sockets_ok: parseBool(formData.get("eq_sockets_ok")),
    sound_system: parseBool(formData.get("eq_sound_system")),
    climate_control: parseBool(formData.get("eq_climate_control")),
    lighting_ok: parseBool(formData.get("eq_lighting_ok")),
    videoconf_capable: parseBool(formData.get("eq_videoconf_capable")),
    specific_material_notes:
      parseText(formData.get("eq_specific_material_notes")) ?? undefined,
  };

  const base = {
    name: parseText(formData.get("name")),
    kind:
      (parseText(formData.get("kind")) as LocationKind | null) ?? "salle_louee",
    address: parseText(formData.get("address")),
    postal_code: parseText(formData.get("postal_code")),
    city: parseText(formData.get("city")),
    country: parseText(formData.get("country")) ?? "France",

    contact_name: parseText(formData.get("contact_name")),
    contact_phone: normalizePhoneE164(parseText(formData.get("contact_phone"))),
    contact_email: parseText(formData.get("contact_email")),
    manager_name: parseText(formData.get("manager_name")),

    capacity: parseInt0(formData.get("capacity")),
    surface_m2: parseFloat0(formData.get("surface_m2")),
    configurations: parseConfigurations(formData),

    building_open_from: parseText(formData.get("building_open_from")),
    building_open_to: parseText(formData.get("building_open_to")),
    room_access_from: parseText(formData.get("room_access_from")),
    room_access_to: parseText(formData.get("room_access_to")),
    default_morning_start: parseText(formData.get("default_morning_start")),
    default_morning_end: parseText(formData.get("default_morning_end")),
    default_afternoon_start: parseText(formData.get("default_afternoon_start")),
    default_afternoon_end: parseText(formData.get("default_afternoon_end")),
    entry_modalities: parseText(formData.get("entry_modalities")),
    late_arrival_procedure: parseText(formData.get("late_arrival_procedure")),
    closes_at_lunch: parseBool(formData.get("closes_at_lunch")),

    latitude: parseFloat0(formData.get("latitude")),
    longitude: parseFloat0(formData.get("longitude")),
    gps_source:
      (parseText(formData.get("gps_source")) as "auto" | "manual" | null) ??
      null,
    gps_updated_at: parseText(formData.get("gps_updated_at")),

    parking:
      (parseText(formData.get("parking")) as ParkingKind | null) ?? "aucun",
    parking_notes: parseText(formData.get("parking_notes")),
    nearest_station: parseText(formData.get("nearest_station")),
    station_distance_min: parseInt0(formData.get("station_distance_min")),
    bus_lines: parseText(formData.get("bus_lines")),
    walk_time_min: parseInt0(formData.get("walk_time_min")),
    road_access: parseText(formData.get("road_access")),
    google_maps_url: parseText(formData.get("google_maps_url")),

    pmr_accessible:
      (parseText(formData.get("pmr_accessible")) as PmrLevel | null) ??
      "a_verifier",
    entry_accessible: parseTriBool(formData.get("entry_accessible")),
    has_elevator: parseTriBool(formData.get("has_elevator")),
    accessible_toilets: parseTriBool(formData.get("accessible_toilets")),
    pmr_parking: parseTriBool(formData.get("pmr_parking")),
    adapted_signage: parseTriBool(formData.get("adapted_signage")),
    adaptation_possibilities: parseText(
      formData.get("adaptation_possibilities"),
    ),
    handicap_referent_notified: parseBool(
      formData.get("handicap_referent_notified"),
    ),
    specific_needs_procedure: parseText(
      formData.get("specific_needs_procedure"),
    ),

    catering_onsite: parseBool(formData.get("catering_onsite")),
    break_room: parseBool(formData.get("break_room")),
    microwave_fridge: parseBool(formData.get("microwave_fridge")),
    coffee_water: parseBool(formData.get("coffee_water")),
    nearby_restaurants: parseText(formData.get("nearby_restaurants")),
    bakery_nearby: parseBool(formData.get("bakery_nearby")),
    delivery_possible: parseBool(formData.get("delivery_possible")),
    default_lunch_duration_min: parseInt0(
      formData.get("default_lunch_duration_min"),
    ),

    equipment,

    fire_consigns_posted: parseBool(formData.get("fire_consigns_posted")),
    emergency_exits_identified: parseBool(
      formData.get("emergency_exits_identified"),
    ),
    assembly_point: parseText(formData.get("assembly_point")),
    first_aid_kit: parseBool(formData.get("first_aid_kit")),
    sanitaries_available: parseBool(formData.get("sanitaries_available"), true),
    site_specific_rules: parseText(formData.get("site_specific_rules")),
    applicable_ri:
      (parseText(formData.get("applicable_ri")) as ApplicableRi | null) ??
      "organisme_formation",
    insurance_available: parseBool(formData.get("insurance_available")),
    security_register_available: parseBool(
      formData.get("security_register_available"),
    ),

    videoconf_default_link: parseText(formData.get("videoconf_default_link")),
    videoconf_platform: parseText(formData.get("videoconf_platform")),

    is_active: parseBool(formData.get("is_active"), true),
    last_verified_at: parseText(formData.get("last_verified_at")),
    notes_internal: parseText(formData.get("notes_internal")),
  };

  // Coûts : seulement admin/manager
  if (isAdminOrManager) {
    return {
      ...base,
      rental_cost_half_day_ht: parseFloat0(
        formData.get("rental_cost_half_day_ht"),
      ),
      rental_cost_day_ht: parseFloat0(formData.get("rental_cost_day_ht")),
      vat_rate: parseFloat0(formData.get("vat_rate")) ?? 20,
      ancillary_costs: parseText(formData.get("ancillary_costs")),
      cancellation_terms: parseText(formData.get("cancellation_terms")),
      reservation_modalities: parseText(formData.get("reservation_modalities")),
      validation_owner: parseText(formData.get("validation_owner")),
    };
  }

  return base;
}

function isAdminOrManager(role: string) {
  return role === "admin" || role === "manager";
}

export async function createLocation(formData: FormData) {
  const { organizationId, userId, role } = await getCurrentOrganizationId();
  const payload = buildPayload(formData, isAdminOrManager(role));

  if (!payload.name) {
    redirect("/lieux/new?error=Le+nom+du+lieu+est+obligatoire");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formation_locations")
    .insert({
      ...payload,
      organization_id: organizationId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/lieux/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/lieux");
  redirect(`/lieux/${data.id}?created=1`);
}

export async function updateLocation(id: string, formData: FormData) {
  const { role } = await getCurrentOrganizationId();
  const payload = buildPayload(formData, isAdminOrManager(role));

  if (!payload.name) {
    redirect(`/lieux/${id}?error=Le+nom+du+lieu+est+obligatoire`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("formation_locations")
    .update(payload)
    .eq("id", id);

  if (error) {
    redirect(`/lieux/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/lieux");
  revalidatePath(`/lieux/${id}`);
  redirect(`/lieux/${id}?updated=1`);
}

export async function deleteLocation(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("formation_locations")
    .delete()
    .eq("id", id);
  if (error) {
    redirect(`/lieux/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/lieux");
  redirect("/lieux");
}

export async function markLocationVerified(id: string) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("formation_locations")
    .update({ last_verified_at: today })
    .eq("id", id);
  if (error) {
    redirect(`/lieux/${id}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/lieux/${id}`);
  redirect(`/lieux/${id}?verified=1`);
}
