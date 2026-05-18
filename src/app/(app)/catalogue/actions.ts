"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_BLOCKS, normalizeBlocks } from "@/lib/catalog/defaults";
import { FONT_FAMILIES, type CatalogBlocks } from "@/lib/catalog/types";

async function getCurrentOrgAndProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, organization:organizations(slug)")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) throw new Error("Aucune organisation rattachée à ce compte");

  const org = membership.organization as unknown as { slug: string } | null;
  return {
    organizationId: membership.organization_id as string,
    orgSlug: org?.slug ?? null,
    userId: user.id,
  };
}

/**
 * Upsert : crée le catalogue de l'organisation s'il n'existe pas encore,
 * et le retourne. Appelée par la page admin au premier chargement.
 *
 * Renvoie { ok: true } si tout va bien, ou { ok: false, error } pour que la
 * page admin puisse afficher un message clair (par ex. quand la migration
 * 0049 n'a pas encore été appliquée).
 */
export async function ensureCatalog(): Promise<
  { ok: true; id: string } | { ok: false; error: string; hint?: string }
> {
  let context: Awaited<ReturnType<typeof getCurrentOrgAndProfile>>;
  try {
    context = await getCurrentOrgAndProfile();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { organizationId, orgSlug, userId } = context;
  const supabase = await createClient();

  const { data: existing, error: selectError } = await supabase
    .from("catalog")
    .select("id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (selectError) {
    // Code 42P01 = "relation does not exist" → migration 0049 non appliquée
    const code = (selectError as { code?: string }).code;
    if (code === "42P01") {
      return {
        ok: false,
        error:
          "La table 'catalog' n'existe pas dans la base de données.",
        hint:
          "Applique la migration 0049_catalog.sql dans le SQL Editor de ton dashboard Supabase, puis recharge cette page.",
      };
    }
    return { ok: false, error: selectError.message };
  }

  if (existing) return { ok: true, id: existing.id as string };

  const slug = orgSlug ?? `org-${organizationId.slice(0, 8)}`;
  const { data: created, error: insertError } = await supabase
    .from("catalog")
    .insert({
      organization_id: organizationId,
      slug,
      hero_title: "Catalogue de formations",
      hero_year: String(new Date().getFullYear()),
      blocks: DEFAULT_BLOCKS,
      created_by: userId,
    })
    .select("id")
    .single();

  if (insertError) {
    return {
      ok: false,
      error: insertError.message,
      hint:
        "Vérifie que tu as un rôle 'admin' ou 'manager' dans ton organisation.",
    };
  }
  return { ok: true, id: created.id as string };
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function parseHexColor(raw: FormDataEntryValue | null, fallback: string): string {
  const s = parseText(raw);
  if (!s) return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

function parseSlug(raw: FormDataEntryValue | null): string | null {
  const s = parseText(raw);
  if (!s) return null;
  // slug : minuscules, alphanumérique + tirets uniquement
  const cleaned = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Sauvegarde l'onglet "Apparence" (charte + entête).
 */
export async function saveCatalogApparence(formData: FormData) {
  const { organizationId } = await getCurrentOrgAndProfile();
  const supabase = await createClient();

  const slug = parseSlug(formData.get("slug"));
  if (!slug) {
    redirect(
      `/catalogue?tab=apparence&error=${encodeURIComponent(
        "Le slug est obligatoire (lettres, chiffres, tirets uniquement).",
      )}`,
    );
  }

  const fontFamily = parseText(formData.get("font_family")) ?? "Inter";
  const safeFont = (FONT_FAMILIES as readonly string[]).includes(fontFamily)
    ? fontFamily
    : "Inter";

  const payload = {
    slug,
    cover_image_url: parseText(formData.get("cover_image_url")),
    hero_title: parseText(formData.get("hero_title")),
    hero_subtitle: parseText(formData.get("hero_subtitle")),
    hero_year: parseText(formData.get("hero_year")),
    color_primary: parseHexColor(formData.get("color_primary"), "#1d4ed8"),
    color_secondary: parseHexColor(formData.get("color_secondary"), "#0891b2"),
    color_text: parseHexColor(formData.get("color_text"), "#18181b"),
    font_family: safeFont,
    pdf_url: null, // invalide le cache PDF
    pdf_generated_at: null,
  };

  const { error } = await supabase
    .from("catalog")
    .update(payload)
    .eq("organization_id", organizationId);

  if (error) {
    redirect(
      `/catalogue?tab=apparence&error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/catalogue");
  revalidatePath(`/c/${slug}`);
  redirect("/catalogue?tab=apparence&saved=1");
}

/**
 * Sauvegarde l'onglet "Contenu éditorial".
 * Le client envoie l'objet `blocks` complet sérialisé en JSON.
 */
export async function saveCatalogBlocks(formData: FormData) {
  const { organizationId } = await getCurrentOrgAndProfile();
  const supabase = await createClient();

  const raw = parseText(formData.get("blocks_json"));
  if (!raw) {
    redirect(
      `/catalogue?tab=contenu&error=${encodeURIComponent(
        "Aucun contenu reçu",
      )}`,
    );
  }

  let parsed: CatalogBlocks;
  try {
    parsed = normalizeBlocks(JSON.parse(raw));
  } catch {
    redirect(
      `/catalogue?tab=contenu&error=${encodeURIComponent(
        "Contenu invalide",
      )}`,
    );
  }

  const { data: row, error } = await supabase
    .from("catalog")
    .update({
      blocks: parsed,
      pdf_url: null,
      pdf_generated_at: null,
    })
    .eq("organization_id", organizationId)
    .select("slug")
    .single();

  if (error) {
    redirect(`/catalogue?tab=contenu&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/catalogue");
  if (row?.slug) revalidatePath(`/c/${row.slug}`);
  redirect("/catalogue?tab=contenu&saved=1");
}

/**
 * Bascule l'état de publication du catalogue.
 */
export async function toggleCatalogPublication(formData: FormData) {
  const { organizationId } = await getCurrentOrgAndProfile();
  const supabase = await createClient();

  const willPublish = formData.get("publish") === "1";

  const { data: row, error } = await supabase
    .from("catalog")
    .update({
      is_published: willPublish,
      published_at: willPublish ? new Date().toISOString() : null,
    })
    .eq("organization_id", organizationId)
    .select("slug")
    .single();

  if (error) {
    redirect(`/catalogue?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/catalogue");
  if (row?.slug) revalidatePath(`/c/${row.slug}`);
  redirect(`/catalogue?${willPublish ? "published=1" : "unpublished=1"}`);
}

/**
 * Force la régénération du PDF (vide le cache).
 * Le PDF sera régénéré à la prochaine ouverture.
 */
export async function invalidateCatalogPdf() {
  const { organizationId } = await getCurrentOrgAndProfile();
  const supabase = await createClient();

  await supabase
    .from("catalog")
    .update({ pdf_url: null, pdf_generated_at: null })
    .eq("organization_id", organizationId);

  revalidatePath("/catalogue");
  redirect("/catalogue?pdf_invalidated=1");
}
