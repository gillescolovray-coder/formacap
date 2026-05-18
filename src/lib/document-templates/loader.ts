import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_CONVENTION_DOC_BLOCKS,
  DEFAULT_CONVENTION_EMAIL_BLOCKS,
  DEFAULT_CONVOCATION_BLOCKS,
  DEFAULT_CONVOCATION_EMAIL_BLOCKS,
  DEFAULT_EMARGEMENT_BLOCKS,
  DEFAULT_TRAINER_CONVOCATION_EMAIL_BLOCKS,
  normalizeConventionDocBlocks,
  normalizeConventionEmailBlocks,
  normalizeConvocationBlocks,
  normalizeConvocationEmailBlocks,
  normalizeEmargementBlocks,
  normalizeTrainerConvocationEmailBlocks,
  type ConventionDocBlocks,
  type ConventionEmailBlocks,
  type ConvocationBlocks,
  type ConvocationEmailBlocks,
  type EmargementBlocks,
  type TrainerConvocationEmailBlocks,
} from "./types";

const DEFAULT_PRIMARY = "#1e40af";
const DEFAULT_SECONDARY = "#06b6d4";

/**
 * Charge le modèle convocation pour une organisation. Si aucun n'existe,
 * renvoie les blocs par défaut sans rien créer en base — c'est l'admin
 * /parametres/modeles-documents qui crée la ligne quand l'utilisateur
 * sauvegarde.
 */
export async function loadConvocationTemplate(organizationId: string): Promise<{
  color_primary: string;
  color_secondary: string;
  blocks: ConvocationBlocks;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_templates")
    .select("color_primary, color_secondary, blocks")
    .eq("organization_id", organizationId)
    .eq("type", "convocation")
    .maybeSingle();

  if (!data) {
    return {
      color_primary: DEFAULT_PRIMARY,
      color_secondary: DEFAULT_SECONDARY,
      blocks: DEFAULT_CONVOCATION_BLOCKS,
    };
  }
  return {
    color_primary:
      (data as { color_primary: string }).color_primary ?? DEFAULT_PRIMARY,
    color_secondary:
      (data as { color_secondary: string }).color_secondary ?? DEFAULT_SECONDARY,
    blocks: normalizeConvocationBlocks((data as { blocks: unknown }).blocks),
  };
}

/**
 * Charge le modèle convention (en-tête + pied de page personnalisables).
 * Renvoie les defaults si rien n'est sauvegardé en base.
 */
export async function loadConventionDocTemplate(
  organizationId: string,
): Promise<{
  color_primary: string;
  color_secondary: string;
  blocks: ConventionDocBlocks;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_templates")
    .select("color_primary, color_secondary, blocks")
    .eq("organization_id", organizationId)
    .eq("type", "convention")
    .maybeSingle();

  if (!data) {
    return {
      color_primary: DEFAULT_PRIMARY,
      color_secondary: DEFAULT_SECONDARY,
      blocks: DEFAULT_CONVENTION_DOC_BLOCKS,
    };
  }
  return {
    color_primary:
      (data as { color_primary: string }).color_primary ?? DEFAULT_PRIMARY,
    color_secondary:
      (data as { color_secondary: string }).color_secondary ?? DEFAULT_SECONDARY,
    blocks: normalizeConventionDocBlocks(
      (data as { blocks: unknown }).blocks,
    ),
  };
}

export async function loadEmargementTemplate(organizationId: string): Promise<{
  color_primary: string;
  color_secondary: string;
  blocks: EmargementBlocks;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_templates")
    .select("color_primary, color_secondary, blocks")
    .eq("organization_id", organizationId)
    .eq("type", "emargement")
    .maybeSingle();

  if (!data) {
    return {
      color_primary: DEFAULT_PRIMARY,
      color_secondary: DEFAULT_SECONDARY,
      blocks: DEFAULT_EMARGEMENT_BLOCKS,
    };
  }
  return {
    color_primary:
      (data as { color_primary: string }).color_primary ?? DEFAULT_PRIMARY,
    color_secondary:
      (data as { color_secondary: string }).color_secondary ?? DEFAULT_SECONDARY,
    blocks: normalizeEmargementBlocks((data as { blocks: unknown }).blocks),
  };
}

/**
 * Charge le modèle EMAIL de la convention de formation (sujet + blocs
 * HTML de l'email envoyé au contact RH). Si aucun n'est saisi en base,
 * renvoie les défauts (= texte qui était codé en dur historiquement).
 */
export async function loadConventionEmailTemplate(
  organizationId: string,
): Promise<{ blocks: ConventionEmailBlocks }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_templates")
    .select("blocks")
    .eq("organization_id", organizationId)
    .eq("type", "convention_email")
    .maybeSingle();

  if (!data) {
    return { blocks: DEFAULT_CONVENTION_EMAIL_BLOCKS };
  }
  return {
    blocks: normalizeConventionEmailBlocks(
      (data as { blocks: unknown }).blocks,
    ),
  };
}

/**
 * Charge le modèle EMAIL de la convocation (sujet + blocs HTML).
 * Identique en structure au modèle convention_email mais avec ses
 * propres variables ({{learner_name}}, {{session_date}}, etc.).
 */
export async function loadConvocationEmailTemplate(
  organizationId: string,
): Promise<{ blocks: ConvocationEmailBlocks }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_templates")
    .select("blocks")
    .eq("organization_id", organizationId)
    .eq("type", "convocation_email")
    .maybeSingle();

  if (!data) {
    return { blocks: DEFAULT_CONVOCATION_EMAIL_BLOCKS };
  }
  return {
    blocks: normalizeConvocationEmailBlocks(
      (data as { blocks: unknown }).blocks,
    ),
  };
}

/**
 * Charge le modèle EMAIL de convocation FORMATEUR (envoyé à
 * l'animateur quand une session passe en statut "confirmed").
 */
export async function loadTrainerConvocationEmailTemplate(
  organizationId: string,
): Promise<{ blocks: TrainerConvocationEmailBlocks }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_templates")
    .select("blocks")
    .eq("organization_id", organizationId)
    .eq("type", "trainer_convocation_email")
    .maybeSingle();

  if (!data) {
    return { blocks: DEFAULT_TRAINER_CONVOCATION_EMAIL_BLOCKS };
  }
  return {
    blocks: normalizeTrainerConvocationEmailBlocks(
      (data as { blocks: unknown }).blocks,
    ),
  };
}
