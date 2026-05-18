"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_CONVENTION_DOC_BLOCKS,
  DEFAULT_CONVENTION_EMAIL_BLOCKS,
  DEFAULT_CONVOCATION_BLOCKS,
  DEFAULT_CONVOCATION_EMAIL_BLOCKS,
  DEFAULT_EMARGEMENT_BLOCKS,
  normalizeConventionDocBlocks,
  normalizeConventionEmailBlocks,
  normalizeConvocationBlocks,
  normalizeConvocationEmailBlocks,
  normalizeTrainerConvocationEmailBlocks,
  normalizeEmargementBlocks,
} from "@/lib/document-templates/types";

async function getCurrentOrganizationId() {
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

  if (!data) throw new Error("Aucune organisation rattachée à ce compte");
  return { organizationId: data.organization_id as string, userId: user.id };
}

function parseHexColor(raw: FormDataEntryValue | null, fallback: string): string {
  if (!raw) return fallback;
  const s = String(raw).trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

function parseText(raw: FormDataEntryValue | null): string {
  return raw === null ? "" : String(raw);
}

/**
 * Sauvegarde le modèle convocation. Crée la ligne si elle n'existe pas.
 */
export async function saveConvocationTemplate(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const supabase = await createClient();

  const rawFontSize = Number(parseText(formData.get("consignes_font_size_pt")));
  const fontSize =
    Number.isFinite(rawFontSize) && rawFontSize >= 7 && rawFontSize <= 16
      ? rawFontSize
      : 10;

  const blocks = normalizeConvocationBlocks({
    intro_html: parseText(formData.get("intro_html")),
    recommendations_html: parseText(formData.get("recommendations_html")),
    closing_html: parseText(formData.get("closing_html")),
    extra_legal_html: parseText(formData.get("extra_legal_html")),
    consignes_style: {
      font_size_pt: fontSize,
      text_color: parseHexColor(formData.get("consignes_text_color"), "#334155"),
      bg_color: parseHexColor(formData.get("consignes_bg_color"), "#eff6ff"),
      border_color: parseHexColor(formData.get("consignes_border_color"), "#bfdbfe"),
    },
  });

  const payload = {
    organization_id: organizationId,
    type: "convocation" as const,
    color_primary: parseHexColor(formData.get("color_primary"), "#1e40af"),
    color_secondary: parseHexColor(formData.get("color_secondary"), "#06b6d4"),
    blocks,
    created_by: userId,
  };

  const { error } = await supabase
    .from("document_templates")
    .upsert(payload, { onConflict: "organization_id,type" });

  if (error) {
    redirect(
      `/parametres/modeles-documents?tab=convocation&error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/modeles-documents");
  redirect("/parametres/modeles-documents?tab=convocation&saved=1");
}

/**
 * Sauvegarde le modèle émargement. Crée la ligne si elle n'existe pas.
 */
export async function saveEmargementTemplate(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const supabase = await createClient();

  const blocks = normalizeEmargementBlocks({
    header_html: parseText(formData.get("header_html")),
    footer_html: parseText(formData.get("footer_html")),
  });

  const payload = {
    organization_id: organizationId,
    type: "emargement" as const,
    color_primary: parseHexColor(formData.get("color_primary"), "#1e40af"),
    color_secondary: parseHexColor(formData.get("color_secondary"), "#06b6d4"),
    blocks,
    created_by: userId,
  };

  const { error } = await supabase
    .from("document_templates")
    .upsert(payload, { onConflict: "organization_id,type" });

  if (error) {
    redirect(
      `/parametres/modeles-documents?tab=emargement&error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/modeles-documents");
  redirect("/parametres/modeles-documents?tab=emargement&saved=1");
}

/**
 * Sauvegarde le modèle convention (en-tête + pied de page).
 * Stocke la config visuelle (cases cochées) en JSON, le HTML sera
 * généré à la volée pour le PDF (cf. lib/pdf/templates.ts).
 */
export async function saveConventionDocTemplate(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const supabase = await createClient();

  const rawBlocks = parseText(formData.get("blocks_json"));
  let parsed: unknown = {};
  if (rawBlocks) {
    try {
      parsed = JSON.parse(rawBlocks);
    } catch {
      // ignoré, on retombe sur les defaults
    }
  }
  const blocks = normalizeConventionDocBlocks(parsed);

  const payload = {
    organization_id: organizationId,
    type: "convention" as const,
    color_primary: parseHexColor(formData.get("color_primary"), "#1e40af"),
    color_secondary: parseHexColor(formData.get("color_secondary"), "#06b6d4"),
    blocks,
    created_by: userId,
  };

  const { error } = await supabase
    .from("document_templates")
    .upsert(payload, { onConflict: "organization_id,type" });

  if (error) {
    redirect(
      `/parametres/modeles-documents?tab=convention&error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/modeles-documents");
  redirect("/parametres/modeles-documents?tab=convention&saved=1");
}

/**
 * Sauvegarde le modèle EMAIL de la convention (sujet + 3 blocs HTML
 * de l'email envoyé au RH avec la convention en pièce jointe).
 * Les variables {{contact_name}}, {{formation_title}}, {{company_name}},
 * {{org_name}}, {{public_url}}, {{signature_button}} sont remplacées
 * au moment de l'envoi (cf. conventions/actions.ts → sendConvention).
 */
export async function saveConventionEmailTemplate(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const supabase = await createClient();

  const blocks = normalizeConventionEmailBlocks({
    subject_template: parseText(formData.get("subject_template")),
    intro_html: parseText(formData.get("intro_html")),
    main_html: parseText(formData.get("main_html")),
    closing_html: parseText(formData.get("closing_html")),
  });

  const payload = {
    organization_id: organizationId,
    type: "convention_email" as const,
    // color_primary/secondary non utilisés pour l'email mais requis par la table.
    color_primary: "#1e40af",
    color_secondary: "#06b6d4",
    blocks,
    created_by: userId,
  };

  const { error } = await supabase
    .from("document_templates")
    .upsert(payload, { onConflict: "organization_id,type" });

  if (error) {
    redirect(
      `/parametres/modeles-documents?tab=convention_email&error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/modeles-documents");
  redirect("/parametres/modeles-documents?tab=convention_email&saved=1");
}

/**
 * Sauvegarde le modèle EMAIL de la convocation (sujet + 3 blocs HTML
 * de l'email envoyé à l'apprenant avec la convocation en pièce jointe).
 * Variables : {{learner_name}}, {{learner_civility}}, {{formation_title}},
 * {{session_date}}, {{session_location}}, {{duration_days}},
 * {{duration_hours}}, {{company_name}}, {{org_name}}.
 */
export async function saveConvocationEmailTemplate(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const supabase = await createClient();

  const blocks = normalizeConvocationEmailBlocks({
    subject_template: parseText(formData.get("subject_template")),
    intro_html: parseText(formData.get("intro_html")),
    main_html: parseText(formData.get("main_html")),
    closing_html: parseText(formData.get("closing_html")),
  });

  const payload = {
    organization_id: organizationId,
    type: "convocation_email" as const,
    color_primary: "#1e40af",
    color_secondary: "#06b6d4",
    blocks,
    created_by: userId,
  };

  const { error } = await supabase
    .from("document_templates")
    .upsert(payload, { onConflict: "organization_id,type" });

  if (error) {
    redirect(
      `/parametres/modeles-documents?tab=convocation_email&error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/modeles-documents");
  redirect("/parametres/modeles-documents?tab=convocation_email&saved=1");
}

/**
 * Sauvegarde le modèle EMAIL de convocation FORMATEUR (envoyé à
 * l'animateur quand une session passe en statut "confirmed").
 * Variables : {{trainer_name}}, {{formation_title}}, {{client_name}},
 * {{session_date}}, {{session_hours}}, {{duration_hours}},
 * {{session_modality}}, {{session_location}}, {{nb_participants}},
 * {{org_name}}, {{portal_url}}.
 */
export async function saveTrainerConvocationEmailTemplate(formData: FormData) {
  const { organizationId, userId } = await getCurrentOrganizationId();
  const supabase = await createClient();

  const blocks = normalizeTrainerConvocationEmailBlocks({
    subject_template: parseText(formData.get("subject_template")),
    intro_html: parseText(formData.get("intro_html")),
    main_html: parseText(formData.get("main_html")),
    closing_html: parseText(formData.get("closing_html")),
  });

  const payload = {
    organization_id: organizationId,
    type: "trainer_convocation_email" as const,
    color_primary: "#1e40af",
    color_secondary: "#06b6d4",
    blocks,
    created_by: userId,
  };

  const { error } = await supabase
    .from("document_templates")
    .upsert(payload, { onConflict: "organization_id,type" });

  if (error) {
    redirect(
      `/parametres/modeles-documents?tab=trainer_convocation_email&error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/parametres/modeles-documents");
  redirect(
    "/parametres/modeles-documents?tab=trainer_convocation_email&saved=1",
  );
}

/**
 * Réinitialise un modèle aux valeurs par défaut.
 */
export async function resetTemplate(
  type:
    | "convocation"
    | "emargement"
    | "convention"
    | "convention_email"
    | "convocation_email",
) {
  const { organizationId } = await getCurrentOrganizationId();
  const supabase = await createClient();

  const blocks =
    type === "convocation"
      ? DEFAULT_CONVOCATION_BLOCKS
      : type === "emargement"
        ? DEFAULT_EMARGEMENT_BLOCKS
        : type === "convention_email"
          ? DEFAULT_CONVENTION_EMAIL_BLOCKS
          : type === "convocation_email"
            ? DEFAULT_CONVOCATION_EMAIL_BLOCKS
            : DEFAULT_CONVENTION_DOC_BLOCKS;
  await supabase
    .from("document_templates")
    .upsert(
      {
        organization_id: organizationId,
        type,
        color_primary: "#1e40af",
        color_secondary: "#06b6d4",
        blocks,
      },
      { onConflict: "organization_id,type" },
    );

  revalidatePath("/parametres/modeles-documents");
  redirect(`/parametres/modeles-documents?tab=${type}&reset=1`);
}
