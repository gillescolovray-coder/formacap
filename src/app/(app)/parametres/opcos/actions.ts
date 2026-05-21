"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

function parseBool(raw: FormDataEntryValue | null): boolean {
  if (raw === null) return false;
  return raw === "on" || raw === "true";
}

export async function createOpco(formData: FormData) {
  const { organizationId } = await getOrgId();
  const name = parseText(formData.get("name"));
  if (!name) {
    redirect(
      "/parametres/opcos?error=" +
        encodeURIComponent("Le nom de l'OPCO est obligatoire."),
    );
  }
  const supabase = await createClient();
  const { error } = await supabase.from("opcos").insert({
    organization_id: organizationId,
    name,
    sectors: parseText(formData.get("sectors")),
    address: parseText(formData.get("address")),
    phone: parseText(formData.get("phone")),
    email: parseText(formData.get("email")),
    portal_url: parseText(formData.get("portal_url")),
    is_active: true,
  });
  if (error) {
    redirect("/parametres/opcos?error=" + encodeURIComponent(error.message));
  }
  revalidatePath("/parametres/opcos");
  redirect("/parametres/opcos?created=1");
}

export async function updateOpco(id: string, formData: FormData) {
  const { organizationId } = await getOrgId();
  const name = parseText(formData.get("name"));
  if (!name) {
    redirect(
      `/parametres/opcos/${id}?error=` +
        encodeURIComponent("Le nom de l'OPCO est obligatoire."),
    );
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("opcos")
    .update({
      name,
      sectors: parseText(formData.get("sectors")),
      address: parseText(formData.get("address")),
      phone: parseText(formData.get("phone")),
      email: parseText(formData.get("email")),
      portal_url: parseText(formData.get("portal_url")),
      is_active: parseBool(formData.get("is_active")),
    })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) {
    redirect(
      `/parametres/opcos/${id}?error=` + encodeURIComponent(error.message),
    );
  }
  revalidatePath("/parametres/opcos");
  revalidatePath(`/parametres/opcos/${id}`);
  redirect("/parametres/opcos?updated=1");
}

export async function deleteOpco(id: string) {
  const { organizationId } = await getOrgId();
  const supabase = await createClient();
  await supabase
    .from("opcos")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);
  revalidatePath("/parametres/opcos");
  redirect("/parametres/opcos?deleted=1");
}
