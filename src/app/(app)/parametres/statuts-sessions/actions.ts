"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SESSION_STATUS_COLOR_KEYS } from "@/lib/sessions/types";

const COLOR_SET = new Set<string>(SESSION_STATUS_COLOR_KEYS);

function parseText(raw: FormDataEntryValue | null): string | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function parseColor(raw: FormDataEntryValue | null): string {
  const s = parseText(raw);
  return s && COLOR_SET.has(s) ? s : "zinc";
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire accents
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

async function getOrgId(): Promise<string> {
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
  return data.organization_id as string;
}

export async function addSessionStatus(formData: FormData) {
  const orgId = await getOrgId();
  const supabase = await createClient();
  const label = parseText(formData.get("label"));
  if (!label) {
    redirect(
      "/parametres/statuts-sessions?error=" +
        encodeURIComponent("Le libellé est obligatoire"),
    );
  }
  const description = parseText(formData.get("description"));
  const color = parseColor(formData.get("color"));

  // Génère un code unique : slug du label, avec suffixe si déjà pris.
  const baseCode = slugify(label) || "statut";
  let code = baseCode;
  for (let i = 2; i <= 50; i += 1) {
    const { data: exists } = await supabase
      .from("session_statuses")
      .select("id")
      .eq("organization_id", orgId)
      .eq("code", code)
      .maybeSingle();
    if (!exists) break;
    code = `${baseCode}_${i}`;
  }

  // Position : dernière + 10
  const { data: last } = await supabase
    .from("session_statuses")
    .select("position")
    .eq("organization_id", orgId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last?.position as number | null) ?? 0) + 10;

  const { error } = await supabase.from("session_statuses").insert({
    organization_id: orgId,
    code,
    label,
    description,
    color,
    position,
  });
  if (error) {
    redirect(
      `/parametres/statuts-sessions?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/parametres/statuts-sessions");
  redirect("/parametres/statuts-sessions?added=1");
}

export async function updateSessionStatus(id: string, formData: FormData) {
  const orgId = await getOrgId();
  const supabase = await createClient();
  const label = parseText(formData.get("label"));
  if (!label) {
    redirect(
      "/parametres/statuts-sessions?error=" +
        encodeURIComponent("Le libellé est obligatoire"),
    );
  }
  const description = parseText(formData.get("description"));
  const color = parseColor(formData.get("color"));

  const { error } = await supabase
    .from("session_statuses")
    .update({ label, description, color })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) {
    redirect(
      `/parametres/statuts-sessions?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/parametres/statuts-sessions");
  redirect("/parametres/statuts-sessions?updated=1");
}

export async function deleteSessionStatus(id: string) {
  const orgId = await getOrgId();
  const supabase = await createClient();

  // On ne supprime pas un statut s'il est encore utilisé sur une session.
  const { data: status } = await supabase
    .from("session_statuses")
    .select("code")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!status) {
    redirect(
      "/parametres/statuts-sessions?error=" +
        encodeURIComponent("Statut introuvable"),
    );
  }
  const { count: usedBy } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", status.code as string);
  if ((usedBy ?? 0) > 0) {
    redirect(
      `/parametres/statuts-sessions?error=${encodeURIComponent(
        `Impossible de supprimer : ce statut est utilisé par ${usedBy} session(s). Réaffectez-les avant.`,
      )}`,
    );
  }

  const { error } = await supabase
    .from("session_statuses")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) {
    redirect(
      `/parametres/statuts-sessions?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/parametres/statuts-sessions");
  redirect("/parametres/statuts-sessions?deleted=1");
}

/**
 * Déplace un statut d'une position vers le haut ou le bas dans la
 * liste de l'organisation. Échange les `position` du statut courant
 * et de son voisin pour préserver l'ordre stable.
 */
export async function moveSessionStatus(id: string, direction: "up" | "down") {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("session_statuses")
    .select("id, position")
    .eq("organization_id", orgId)
    .order("position", { ascending: true });
  if (!items || items.length === 0) {
    redirect("/parametres/statuts-sessions");
  }
  const list = items as Array<{ id: string; position: number }>;
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) {
    redirect("/parametres/statuts-sessions");
  }
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) {
    redirect("/parametres/statuts-sessions"); // déjà aux extrémités
  }
  const a = list[idx];
  const b = list[swapIdx];

  // Swap des positions. On utilise un place-holder pour éviter la
  // collision unique éventuelle (même si position n'est pas unique,
  // c'est plus propre).
  await supabase
    .from("session_statuses")
    .update({ position: -1 })
    .eq("id", a.id)
    .eq("organization_id", orgId);
  await supabase
    .from("session_statuses")
    .update({ position: a.position })
    .eq("id", b.id)
    .eq("organization_id", orgId);
  await supabase
    .from("session_statuses")
    .update({ position: b.position })
    .eq("id", a.id)
    .eq("organization_id", orgId);

  revalidatePath("/parametres/statuts-sessions");
  redirect("/parametres/statuts-sessions?moved=1");
}
