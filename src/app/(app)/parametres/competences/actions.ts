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
  return data.organization_id as string;
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function parseInt0(raw: FormDataEntryValue | null): number {
  const s = parseText(raw);
  if (!s) return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

// ---------- Domaines ----------

export async function addDomain(formData: FormData) {
  const orgId = await getOrgId();
  const name = parseText(formData.get("name"));
  const description = parseText(formData.get("description"));
  const position = parseInt0(formData.get("position"));

  if (!name) {
    redirect(
      "/parametres/competences?error=" +
        encodeURIComponent("Nom du domaine requis"),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("skill_domains").insert({
    organization_id: orgId,
    name,
    description,
    position,
  });
  if (error) {
    redirect(
      "/parametres/competences?error=" + encodeURIComponent(error.message),
    );
  }

  revalidatePath("/parametres/competences");
  redirect("/parametres/competences?domainAdded=1");
}

export async function updateDomain(id: string, formData: FormData) {
  const name = parseText(formData.get("name"));
  const description = parseText(formData.get("description"));
  const position = parseInt0(formData.get("position"));
  const isActive = formData.get("is_active") === "on";

  if (!name) return;

  const supabase = await createClient();
  await supabase
    .from("skill_domains")
    .update({ name, description, position, is_active: isActive })
    .eq("id", id);

  revalidatePath("/parametres/competences");
  redirect("/parametres/competences?domainUpdated=1");
}

export async function deleteDomain(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("skill_domains").delete().eq("id", id);
  if (error) {
    redirect(
      "/parametres/competences?error=" +
        encodeURIComponent(
          "Impossible de supprimer ce domaine : il est utilisé par au moins un formateur.",
        ),
    );
  }
  revalidatePath("/parametres/competences");
  redirect("/parametres/competences?domainDeleted=1");
}

// ---------- Niveaux ----------

export async function addLevel(formData: FormData) {
  const orgId = await getOrgId();
  const name = parseText(formData.get("name"));
  const rank = parseInt0(formData.get("rank")) || 1;
  const color = parseText(formData.get("color"));

  if (!name) {
    redirect(
      "/parametres/competences?error=" + encodeURIComponent("Nom du niveau requis"),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("skill_levels").insert({
    organization_id: orgId,
    name,
    rank,
    color,
  });
  if (error) {
    redirect(
      "/parametres/competences?error=" + encodeURIComponent(error.message),
    );
  }

  revalidatePath("/parametres/competences");
  redirect("/parametres/competences?levelAdded=1");
}

export async function updateLevel(id: string, formData: FormData) {
  const name = parseText(formData.get("name"));
  const rank = parseInt0(formData.get("rank")) || 1;
  const color = parseText(formData.get("color"));
  const isActive = formData.get("is_active") === "on";

  if (!name) return;

  const supabase = await createClient();
  await supabase
    .from("skill_levels")
    .update({ name, rank, color, is_active: isActive })
    .eq("id", id);

  revalidatePath("/parametres/competences");
  redirect("/parametres/competences?levelUpdated=1");
}

export async function deleteLevel(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("skill_levels").delete().eq("id", id);
  if (error) {
    redirect(
      "/parametres/competences?error=" +
        encodeURIComponent(
          "Impossible de supprimer ce niveau : il est utilisé par au moins un formateur.",
        ),
    );
  }
  revalidatePath("/parametres/competences");
  redirect("/parametres/competences?levelDeleted=1");
}

// ---------- Helper générique pour catalogues simples (audience / modalité) ----------

async function addCatalogItem(
  table: "audience_catalog" | "modality_catalog",
  formData: FormData,
  notifKey: string,
) {
  const orgId = await getOrgId();
  const name = parseText(formData.get("name"));
  const position = parseInt0(formData.get("position"));
  if (!name) {
    redirect(
      "/parametres/competences?error=" + encodeURIComponent("Nom requis"),
    );
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .insert({ organization_id: orgId, name, position });
  if (error) {
    redirect(
      "/parametres/competences?error=" + encodeURIComponent(error.message),
    );
  }
  revalidatePath("/parametres/competences");
  redirect(`/parametres/competences?${notifKey}=1`);
}

async function updateCatalogItem(
  table: "audience_catalog" | "modality_catalog",
  id: string,
  formData: FormData,
  notifKey: string,
) {
  const name = parseText(formData.get("name"));
  const position = parseInt0(formData.get("position"));
  const isActive = formData.get("is_active") === "on";
  if (!name) return;
  const supabase = await createClient();
  await supabase
    .from(table)
    .update({ name, position, is_active: isActive })
    .eq("id", id);
  revalidatePath("/parametres/competences");
  redirect(`/parametres/competences?${notifKey}=1`);
}

async function deleteCatalogItem(
  table: "audience_catalog" | "modality_catalog",
  id: string,
  notifKey: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    redirect(
      "/parametres/competences?error=" + encodeURIComponent(error.message),
    );
  }
  revalidatePath("/parametres/competences");
  redirect(`/parametres/competences?${notifKey}=1`);
}

// ---------- Audiences ----------

export async function addAudience(formData: FormData) {
  return addCatalogItem("audience_catalog", formData, "audienceAdded");
}
export async function updateAudience(id: string, formData: FormData) {
  return updateCatalogItem(
    "audience_catalog",
    id,
    formData,
    "audienceUpdated",
  );
}
export async function deleteAudience(id: string) {
  return deleteCatalogItem("audience_catalog", id, "audienceDeleted");
}

// ---------- Modalités ----------

export async function addModality(formData: FormData) {
  return addCatalogItem("modality_catalog", formData, "modalityAdded");
}
export async function updateModality(id: string, formData: FormData) {
  return updateCatalogItem(
    "modality_catalog",
    id,
    formData,
    "modalityUpdated",
  );
}
export async function deleteModality(id: string) {
  return deleteCatalogItem("modality_catalog", id, "modalityDeleted");
}
