"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  return data.organization_id;
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

export async function addCategory(formData: FormData) {
  const name = parseText(formData.get("name"));
  if (!name) {
    redirect("/formations/categories?error=Le+nom+est+obligatoire");
  }

  const organizationId = await getCurrentOrganizationId();
  const supabase = await createClient();

  const { error } = await supabase.from("formation_categories").insert({
    organization_id: organizationId,
    name,
  });

  if (error) {
    redirect(
      `/formations/categories?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/formations/categories");
  revalidatePath("/formations");
  redirect("/formations/categories?created=1");
}

export async function renameCategory(id: string, formData: FormData) {
  const name = parseText(formData.get("name"));
  if (!name) {
    redirect("/formations/categories?error=Le+nom+est+obligatoire");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("formation_categories")
    .update({ name })
    .eq("id", id);

  if (error) {
    redirect(
      `/formations/categories?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/formations/categories");
  revalidatePath("/formations");
  redirect("/formations/categories?updated=1");
}

export async function deleteCategory(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("formation_categories")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(
      `/formations/categories?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/formations/categories");
  revalidatePath("/formations");
  redirect("/formations/categories?deleted=1");
}
