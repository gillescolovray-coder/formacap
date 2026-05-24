"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { humanizeSupabaseError } from "@/lib/supabase/error-messages";
import {
  parseFormationFromText,
  type ParsedFormation,
} from "@/lib/formations/text-parser";
import { extractWithLmStudio } from "@/lib/formations/lm-studio-extractor";
import {
  extractWithGemini,
  isGeminiConfigured,
} from "@/lib/formations/gemini-extractor";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

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
  if (!data) throw new Error("Aucune organisation rattachée");
  return { organizationId: data.organization_id, userId: user.id };
}

async function extractFromPdf(buffer: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buffer);
  const result = await extractText(pdf, { mergePages: true });
  return Array.isArray(result.text) ? result.text.join("\n") : result.text;
}

async function extractFromImage(buffer: Uint8Array): Promise<string> {
  // Lazy import (lourd)
  const Tesseract = await import("tesseract.js");
  const result = await Tesseract.recognize(Buffer.from(buffer), "fra");
  return result.data.text;
}

/**
 * Importe une formation depuis un PDF ou une image (OCR pour les images).
 * Crée la fiche en mode brouillon avec les champs détectés ; redirige
 * vers /formations/[id] pour révision.
 */
export async function importFormationFromDocument(formData: FormData) {
  const file = formData.get("document") as File | null;
  if (!file || file.size === 0) {
    redirect(
      `/formations/new?error=${encodeURIComponent("Aucun fichier sélectionné")}`,
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    redirect(
      `/formations/new?error=${encodeURIComponent("Fichier trop volumineux (max 10 Mo)")}`,
    );
  }
  if (!SUPPORTED_TYPES.includes(file.type)) {
    redirect(
      `/formations/new?error=${encodeURIComponent("Format non supporté. Utilisez PDF, JPG, PNG ou WebP.")}`,
    );
  }

  const buffer = await file.arrayBuffer();
  let parsed: ParsedFormation | null = null;
  let extractor: "gemini" | "lm-studio" | "regex" = "regex";

  // 1) Tentative via Gemini (qualité maximale, prend le fichier en direct)
  if (isGeminiConfigured()) {
    try {
      parsed = await extractWithGemini(new Uint8Array(buffer), file.type);
      extractor = "gemini";
    } catch (e) {
      console.warn(
        "Gemini KO, on essaie LM Studio :",
        e instanceof Error ? e.message : e,
      );
    }
  }

  // 2) Si Gemini KO ou non configuré : extraction texte + LM Studio / regex
  if (!parsed) {
    let text: string;
    try {
      if (file.type === "application/pdf") {
        text = await extractFromPdf(new Uint8Array(buffer));
      } else {
        text = await extractFromImage(new Uint8Array(buffer));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      redirect(
        `/formations/new?error=${encodeURIComponent("Extraction impossible : " + msg)}`,
      );
    }

    if (!text || text.trim().length < 20) {
      redirect(
        `/formations/new?error=${encodeURIComponent("Aucun texte exploitable dans le document")}`,
      );
    }

    try {
      parsed = await extractWithLmStudio(text);
      extractor = "lm-studio";
    } catch (e) {
      console.warn(
        "LM Studio indisponible, fallback parseur regex :",
        e instanceof Error ? e.message : e,
      );
      parsed = parseFormationFromText(text);
    }
  }

  const { organizationId, userId } = await getCurrentOrganizationId();

  // Construit le payload — uniquement les champs détectés
  const insertPayload: Record<string, unknown> = {
    organization_id: organizationId,
    created_by: userId,
    title: parsed.title?.trim() || "Programme importé",
    status: "draft",
  };
  const setIfDefined = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== "") {
      insertPayload[key] = value;
    }
  };

  // Code interne : on l'attribue seulement s'il n'est pas déjà pris
  // pour cette organisation. Sinon on le laisse vide — l'utilisateur
  // pourra l'éditer manuellement après création. Évite l'erreur
  // "duplicate key" qui bloquait l'import (Gilles bug 2026-05-24).
  if (parsed.internal_code && parsed.internal_code.trim() !== "") {
    const supabaseCheck = await createClient();
    const code = parsed.internal_code.trim();
    const { data: clash } = await supabaseCheck
      .from("formations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("internal_code", code)
      .limit(1)
      .maybeSingle();
    if (!clash) {
      insertPayload.internal_code = code;
    }
    // Sinon : code déjà pris → on n'insère pas internal_code,
    // l'utilisateur l'ajustera dans la fiche.
  }
  setIfDefined("duration_days", parsed.duration_days);
  setIfDefined("duration_hours", parsed.duration_hours);
  setIfDefined("min_participants", parsed.min_participants);
  setIfDefined("max_participants", parsed.max_participants);
  setIfDefined("public_price_excl_tax", parsed.public_price_excl_tax);
  setIfDefined("pricing_note", parsed.pricing_note);
  setIfDefined("target_audience", parsed.target_audience);
  setIfDefined("prerequisites", parsed.prerequisites);
  setIfDefined("general_objective", parsed.general_objective);
  if (
    parsed.operational_objectives &&
    parsed.operational_objectives.length > 0
  ) {
    insertPayload.operational_objectives = parsed.operational_objectives;
  }
  setIfDefined("pedagogy_approach", parsed.pedagogy_approach);
  setIfDefined("teaching_methods", parsed.teaching_methods);
  setIfDefined("technical_means", parsed.technical_means);
  setIfDefined("evaluation_methods", parsed.evaluation_methods);
  setIfDefined("accessibility", parsed.accessibility);
  if (parsed.programme_days && parsed.programme_days.length > 0) {
    insertPayload.programme_days = parsed.programme_days;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("formations")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data) {
    const friendly = error
      ? humanizeSupabaseError(error)
      : "Erreur inconnue.";
    redirect(
      `/formations/new?error=${encodeURIComponent(friendly)}`,
    );
  }

  // Si c'était un PDF, on le joint à la formation
  if (file.type === "application/pdf") {
    const fileName = `${data.id}/programme-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("formation-programmes")
      .upload(fileName, file, {
        contentType: "application/pdf",
        upsert: false,
        cacheControl: "3600",
      });
    if (!uploadError) {
      const {
        data: { publicUrl },
      } = supabase.storage
        .from("formation-programmes")
        .getPublicUrl(fileName);
      await supabase
        .from("formations")
        .update({
          programme_pdf_url: publicUrl,
          programme_pdf_name: file.name,
        })
        .eq("id", data.id);
    }
  }

  revalidatePath("/formations");
  redirect(`/formations/${data.id}?imported=1&via=${extractor}`);
}
