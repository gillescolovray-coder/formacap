"use server";

/**
 * Import d'un programme existant (PDF/image) pour le RÉADAPTER à la
 * taxonomie de Bloom (Sprint E). Réutilise l'extracteur du catalogue
 * (Gemini / unpdf / LM Studio), puis réécrit les objectifs en version
 * mesurable Bloom, et crée un brouillon de programme pré-rempli.
 */
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import {
  parseFormationFromText,
  type ParsedFormation,
} from "@/lib/formations/text-parser";
import { extractWithLmStudio } from "@/lib/formations/lm-studio-extractor";
import {
  extractWithGemini,
  isGeminiConfigured,
} from "@/lib/formations/gemini-extractor";
import { generateBloomObjectives } from "@/lib/bloom/generate";
import type { BloomObjective } from "@/lib/bloom/types";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

function err(message: string): never {
  redirect(`/programmes/new?error=${encodeURIComponent(message)}`);
}

async function extractParsed(
  buffer: Uint8Array,
  fileType: string,
): Promise<ParsedFormation | null> {
  // 1) Gemini (prend le fichier en direct, meilleure qualité)
  if (isGeminiConfigured()) {
    try {
      return await extractWithGemini(buffer, fileType);
    } catch {
      // bascule sur l'extraction texte
    }
  }
  // 2) Extraction texte (PDF) puis LM Studio ou parseur regex
  let text = "";
  if (fileType === "application/pdf") {
    const pdf = await getDocumentProxy(buffer);
    const r = await extractText(pdf, { mergePages: true });
    text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
  }
  if (!text.trim()) return null;
  if (process.env.LM_STUDIO_URL) {
    try {
      return await extractWithLmStudio(text);
    } catch {
      // bascule sur le parseur regex
    }
  }
  return parseFormationFromText(text);
}

export async function importBlueprintFromPdf(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.organization_id as string | undefined;
  if (!orgId) err("Aucune organisation active.");

  const file = formData.get("document") as File | null;
  if (!file || file.size === 0) err("Aucun fichier sélectionné.");
  if (file!.size > MAX_SIZE_BYTES) err("Fichier trop volumineux (max 10 Mo).");
  if (!SUPPORTED_TYPES.includes(file!.type)) {
    err("Format non supporté. Utilisez PDF, JPG, PNG ou WebP.");
  }

  const buffer = new Uint8Array(await file!.arrayBuffer());

  let parsed: ParsedFormation | null = null;
  try {
    parsed = await extractParsed(buffer, file!.type);
  } catch (e) {
    err(`Lecture du document impossible : ${(e as Error).message}`);
  }
  if (!parsed) {
    err("Impossible d'extraire le contenu du document. Réessayez ou saisissez manuellement.");
  }

  const p = parsed!;
  const existing = (p.operational_objectives ?? []).filter(
    (o): o is string => typeof o === "string" && o.trim().length > 0,
  );

  // Réadaptation Bloom des objectifs (best-effort : si l'IA échoue, on
  // garde les objectifs d'origine tels quels pour ne rien perdre).
  let objectives: BloomObjective[] = [];
  try {
    objectives = await generateBloomObjectives({
      title: p.title ?? "Programme importé",
      targetAudience: p.target_audience ?? null,
      durationHours: p.duration_hours ?? null,
      generalObjective: p.general_objective ?? null,
      existingObjectives: existing,
    });
  } catch {
    objectives = existing.map((t) => ({
      id: crypto.randomUUID(),
      text: t,
      bloom_level: "understand" as const,
      action_verb: null,
    }));
  }

  const { data: created, error } = await supabase
    .from("program_blueprints")
    .insert({
      organization_id: orgId,
      internal_code: p.internal_code ?? null,
      title: p.title ?? "Programme importé",
      theme: null,
      target_audience: p.target_audience ?? null,
      duration_hours: p.duration_hours ?? null,
      duration_days: p.duration_days ?? null,
      general_objective: p.general_objective ?? null,
      // Réadaptation : on remonte TOUT le contenu du programme existant
      // (Gilles 2026-06-09). L'utilisateur peut ensuite cliquer « Générer le
      // programme complet (IA) » pour optimiser le texte.
      prerequisites: p.prerequisites ?? null,
      evaluation_methods: p.evaluation_methods ?? null,
      teaching_methods:
        [p.teaching_methods, p.pedagogy_approach].filter(Boolean).join("\n") ||
        null,
      programme_days: p.programme_days ?? [],
      bloom_objectives: objectives,
      created_by: user.id,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !created) {
    err(error?.message ?? "Création du brouillon impossible.");
  }

  redirect(`/programmes/${created!.id}?imported=1`);
}
