"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  extractPositioningWithGemini,
  isGeminiConfigured,
} from "@/lib/positioning/gemini-extractor";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

/**
 * Importe un test de positionnement depuis un PDF ou une image via
 * Gemini. Crée un template draft pré-rempli et redirige vers
 * l'éditeur pour validation/correction par l'admin.
 *
 * Phase D — Gilles 2026-05-25.
 */
export async function importPositioningTemplateFromDocument(
  formData: FormData,
) {
  if (!isGeminiConfigured()) {
    redirect(
      `/parametres/positionnement/import?error=${encodeURIComponent("L'API Gemini n'est pas configurée. Ajoutez GEMINI_API_KEY dans .env.local et redémarrez l'app.")}`,
    );
  }

  const file = formData.get("document") as File | null;
  if (!file || file.size === 0) {
    redirect(
      `/parametres/positionnement/import?error=${encodeURIComponent("Aucun fichier sélectionné.")}`,
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    redirect(
      `/parametres/positionnement/import?error=${encodeURIComponent("Fichier trop volumineux (max 10 Mo).")}`,
    );
  }
  if (!SUPPORTED_TYPES.includes(file.type)) {
    redirect(
      `/parametres/positionnement/import?error=${encodeURIComponent("Format non supporté. Utilisez PDF, JPG, PNG ou WebP.")}`,
    );
  }

  const buffer = await file.arrayBuffer();

  let extracted;
  try {
    extracted = await extractPositioningWithGemini(
      new Uint8Array(buffer),
      file.type,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    redirect(
      `/parametres/positionnement/import?error=${encodeURIComponent("Extraction IA impossible : " + msg)}`,
    );
  }

  // Création du template en draft (publié OK, mais pré-rempli — l'admin
  // pourra ajuster dans l'éditeur)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<{ organization_id: string }>();
  if (!orgMember) redirect("/login");

  const title = extracted!.title ?? "Test importé (à renommer)";
  const { data: newRow, error } = await supabase
    .from("positioning_templates")
    .insert({
      organization_id: orgMember.organization_id,
      title,
      description:
        "Importé automatiquement depuis un PDF/Word. Vérifiez et ajustez si nécessaire avant assignation à une formation.",
      is_default: false,
      // Listes legacy minimales (rétrocompat)
      expectation_choices: [{ key: "placeholder", label: "—" }],
      mastery_criteria: [{ key: "placeholder", label: "—" }],
      structure: extracted!.structure,
      status: "published",
      created_by: user.id,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !newRow) {
    redirect(
      `/parametres/positionnement/import?error=${encodeURIComponent(error?.message ?? "Erreur d'insertion")}`,
    );
  }

  revalidatePath("/parametres/positionnement");
  redirect(`/parametres/positionnement/${newRow.id}/edit?imported=1`);
}
