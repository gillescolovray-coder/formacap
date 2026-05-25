"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseFormStructure } from "@/lib/positioning/form-structure";

type Choice = { key: string; label: string };

/** Parse + valide la structure form-builder envoyée par l'éditeur.
 *  Retourne `null` si invalide ou si la chaîne est absente. */
function parseStructureField(raw: FormDataEntryValue | null) {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  try {
    const obj = JSON.parse(s);
    return parseFormStructure(obj);
  } catch {
    return null;
  }
}

async function getOrgCtx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<{ organization_id: string }>();
  if (!orgMember) throw new Error("Pas d'organisation");
  return { supabase, userId: user.id, organizationId: orgMember.organization_id };
}

/**
 * Slugifie un libellé en clé stable : minuscules, accents enlevés,
 * non-alphanumérique → underscore. Utilisé pour auto-générer une clé
 * quand l'utilisateur ajoute un nouveau choix dans l'éditeur.
 */
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * Parse + valide une liste de choices depuis FormData. Format attendu :
 *   expectation_choices = JSON.stringify([{ key, label }, ...])
 * Retourne null si invalide ou vide. On nettoie les clés et garantit
 * leur unicité (suffixe _2, _3… en cas de collision).
 */
function parseChoices(raw: FormDataEntryValue | null): Choice[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const out: Choice[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as { key?: unknown; label?: unknown };
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) continue;
    let key =
      typeof o.key === "string" && o.key.trim() !== ""
        ? slugify(o.key)
        : slugify(label);
    if (!key) key = "item";
    let unique = key;
    let n = 2;
    while (seen.has(unique)) unique = `${key}_${n++}`;
    seen.add(unique);
    out.push({ key: unique, label });
  }
  return out;
}

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function parseTitle(raw: FormDataEntryValue | null): string {
  const t = parseText(raw);
  if (!t) throw new Error("Le titre est obligatoire");
  return t;
}

/**
 * Marque un template comme "par défaut" en s'assurant qu'aucun autre
 * ne l'est plus (la contrainte unique partielle l'imposerait sinon).
 * Cette opération est faite atomiquement via 2 update successifs : on
 * démarque d'abord, on marque ensuite.
 */
async function clearOtherDefaults(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  excludeId: string | null,
) {
  let query = supabase
    .from("positioning_templates")
    .update({ is_default: false })
    .eq("organization_id", organizationId)
    .eq("is_default", true);
  if (excludeId) query = query.neq("id", excludeId);
  await query;
}

// ============================================================
// CRUD
// ============================================================

export async function createPositioningTemplate(formData: FormData) {
  const { supabase, userId, organizationId } = await getOrgCtx();

  let title: string;
  try {
    title = parseTitle(formData.get("title"));
  } catch (e) {
    redirect(
      `/parametres/positionnement/new?error=${encodeURIComponent(
        (e as Error).message,
      )}`,
    );
  }
  const description = parseText(formData.get("description"));
  const isDefault = formData.get("is_default") === "on";
  const expectations = parseChoices(formData.get("expectation_choices"));
  const criteria = parseChoices(formData.get("mastery_criteria"));
  // Migration 0106 : form-builder structure (priorite sur les listes
  // legacy si presente)
  const structure = parseStructureField(formData.get("structure"));

  // Validation : on doit avoir soit la structure form-builder, soit
  // les 2 listes legacy
  if (!structure && (expectations.length === 0 || criteria.length === 0)) {
    redirect(
      `/parametres/positionnement/new?error=${encodeURIComponent("Le template doit contenir au moins une section avec questions (ou une attente et une compétence en mode legacy).")}`,
    );
  }

  if (isDefault) {
    await clearOtherDefaults(supabase, organizationId, null);
  }

  const { data, error } = await supabase
    .from("positioning_templates")
    .insert({
      organization_id: organizationId,
      title,
      description,
      is_default: isDefault,
      // En mode form-builder on remplit quand meme les listes legacy
      // avec des valeurs minimales (rétrocompat) pour ne pas casser
      // les anciens lecteurs qui pourraient encore en dépendre.
      expectation_choices:
        expectations.length > 0
          ? expectations
          : [{ key: "placeholder", label: "—" }],
      mastery_criteria:
        criteria.length > 0
          ? criteria
          : [{ key: "placeholder", label: "—" }],
      structure: structure ?? null,
      status: "published",
      created_by: userId,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    redirect(
      `/parametres/positionnement/new?error=${encodeURIComponent(error?.message ?? "Erreur inconnue")}`,
    );
  }

  revalidatePath("/parametres/positionnement");
  redirect(`/parametres/positionnement/${data.id}?created=1`);
}

export async function updatePositioningTemplate(
  id: string,
  formData: FormData,
) {
  const { supabase, organizationId } = await getOrgCtx();

  // Vérifier que le template appartient bien à l'org
  const { data: current } = await supabase
    .from("positioning_templates")
    .select("organization_id, is_default")
    .eq("id", id)
    .maybeSingle<{ organization_id: string; is_default: boolean }>();
  if (!current || current.organization_id !== organizationId) {
    redirect(
      `/parametres/positionnement?error=${encodeURIComponent("Template introuvable.")}`,
    );
  }

  let title: string;
  try {
    title = parseTitle(formData.get("title"));
  } catch (e) {
    redirect(
      `/parametres/positionnement/${id}/edit?error=${encodeURIComponent(
        (e as Error).message,
      )}`,
    );
  }
  const description = parseText(formData.get("description"));
  const isDefault = formData.get("is_default") === "on";
  const expectations = parseChoices(formData.get("expectation_choices"));
  const criteria = parseChoices(formData.get("mastery_criteria"));
  // Migration 0106 — form-builder
  const structure = parseStructureField(formData.get("structure"));

  if (!structure && (expectations.length === 0 || criteria.length === 0)) {
    redirect(
      `/parametres/positionnement/${id}/edit?error=${encodeURIComponent("Le template doit contenir au moins une section avec questions (ou une attente et une compétence en mode legacy).")}`,
    );
  }

  // Si on passe is_default à true, déclasse les autres
  if (isDefault && !current!.is_default) {
    await clearOtherDefaults(supabase, organizationId, id);
  }

  const updatePayload: Record<string, unknown> = {
    title,
    description,
    is_default: isDefault,
  };
  if (structure) {
    updatePayload.structure = structure;
    // Keep the legacy lists too (avec valeurs si fournies, sinon
    // on ne touche pas)
    if (expectations.length > 0) updatePayload.expectation_choices = expectations;
    if (criteria.length > 0) updatePayload.mastery_criteria = criteria;
  } else {
    // Mode legacy uniquement
    updatePayload.expectation_choices = expectations;
    updatePayload.mastery_criteria = criteria;
    updatePayload.structure = null;
  }

  const { error } = await supabase
    .from("positioning_templates")
    .update(updatePayload)
    .eq("id", id);

  if (error) {
    redirect(
      `/parametres/positionnement/${id}/edit?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/positionnement");
  revalidatePath(`/parametres/positionnement/${id}`);
  redirect(`/parametres/positionnement/${id}?updated=1`);
}

/**
 * Duplique un template existant pour servir de base à un nouveau (le
 * nouveau ouvre directement en mode édition, ce n'est pas par défaut).
 */
export async function duplicatePositioningTemplate(id: string) {
  const { supabase, userId, organizationId } = await getOrgCtx();

  const { data: src } = await supabase
    .from("positioning_templates")
    .select(
      "organization_id, title, description, expectation_choices, mastery_criteria, structure",
    )
    .eq("id", id)
    .maybeSingle<{
      organization_id: string;
      title: string;
      description: string | null;
      expectation_choices: Choice[] | null;
      mastery_criteria: Choice[] | null;
      structure: unknown;
    }>();
  if (!src || src.organization_id !== organizationId) {
    redirect("/parametres/positionnement?error=Template+introuvable");
  }

  const { data: newRow, error } = await supabase
    .from("positioning_templates")
    .insert({
      organization_id: organizationId,
      title: `${src!.title} (copie)`,
      description: src!.description,
      is_default: false,
      expectation_choices: src!.expectation_choices ?? [],
      mastery_criteria: src!.mastery_criteria ?? [],
      // On duplique aussi la structure form-builder si elle existe
      structure: src!.structure ?? null,
      status: "published",
      created_by: userId,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !newRow) {
    redirect(
      `/parametres/positionnement?error=${encodeURIComponent(error?.message ?? "Erreur inconnue")}`,
    );
  }

  revalidatePath("/parametres/positionnement");
  redirect(`/parametres/positionnement/${newRow.id}/edit?duplicated=1`);
}

/**
 * Archive (ou désarchive) un template. Archivé = masqué des
 * dropdowns mais les sessions historiques continuent d'y référer.
 * Refuse l'archivage d'un template par défaut (l'utilisateur doit
 * d'abord en désigner un autre).
 */
export async function archivePositioningTemplate(id: string) {
  const { supabase, organizationId } = await getOrgCtx();

  const { data: current } = await supabase
    .from("positioning_templates")
    .select("organization_id, status, is_default")
    .eq("id", id)
    .maybeSingle<{
      organization_id: string;
      status: string;
      is_default: boolean;
    }>();
  if (!current || current.organization_id !== organizationId) {
    redirect("/parametres/positionnement?error=Template+introuvable");
  }

  if (current!.is_default && current!.status !== "archived") {
    redirect(
      `/parametres/positionnement/${id}?error=${encodeURIComponent("Impossible d'archiver le template par défaut. Désignez d'abord un autre template comme par défaut.")}`,
    );
  }

  const next = current!.status === "archived" ? "published" : "archived";
  const { error } = await supabase
    .from("positioning_templates")
    .update({ status: next })
    .eq("id", id);
  if (error) {
    redirect(
      `/parametres/positionnement/${id}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/positionnement");
  revalidatePath(`/parametres/positionnement/${id}`);
  redirect(
    `/parametres/positionnement/${id}?${next === "archived" ? "archived" : "unarchived"}=1`,
  );
}

/**
 * Supprime un template. Refuse si template par défaut (sécurité).
 * Les FK formations.positioning_template_id et sessions.* sont en
 * ON DELETE SET NULL : les sessions/formations passeront en mode
 * "héritage du default" automatiquement.
 */
export async function deletePositioningTemplate(id: string) {
  const { supabase, organizationId } = await getOrgCtx();

  const { data: current } = await supabase
    .from("positioning_templates")
    .select("organization_id, is_default")
    .eq("id", id)
    .maybeSingle<{ organization_id: string; is_default: boolean }>();
  if (!current || current.organization_id !== organizationId) {
    redirect("/parametres/positionnement?error=Template+introuvable");
  }
  if (current!.is_default) {
    redirect(
      `/parametres/positionnement/${id}?error=${encodeURIComponent("Impossible de supprimer le template par défaut.")}`,
    );
  }

  const { error } = await supabase
    .from("positioning_templates")
    .delete()
    .eq("id", id);
  if (error) {
    redirect(
      `/parametres/positionnement/${id}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/positionnement");
  redirect("/parametres/positionnement?deleted=1");
}
