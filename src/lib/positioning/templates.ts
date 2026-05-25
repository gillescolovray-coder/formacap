/**
 * Helpers de résolution / chargement des templates de positionnement
 * (migration 0105, Gilles 2026-05-25).
 *
 * Règle de résolution pour une session donnée :
 *   sessions.positioning_template_id
 *     > formations.positioning_template_id
 *     > template default de l'organisation (is_default = true)
 *
 * Fallback ultime : objet en mémoire avec les listes hardcodées
 * historiques (pour ne jamais casser le formulaire apprenant si la
 * migration n'a pas encore été appliquée).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseFormStructure,
  type FormStructure,
} from "./form-structure";

export type PositioningChoice = { key: string; label: string };

export type PositioningTemplate = {
  id: string | null;
  title: string;
  description: string | null;
  is_default: boolean;
  expectation_choices: PositioningChoice[];
  mastery_criteria: PositioningChoice[];
  /** Form-builder structure (migration 0106). Si non-null, le
   *  formulaire apprenant rend cette structure dynamiquement et
   *  ignore expectation_choices + mastery_criteria. */
  structure: FormStructure | null;
};

/** Fallback codé en dur — utilisé seulement si la migration 0105
 *  n'a pas encore été appliquée ou si aucun template n'est trouvé. */
export const FALLBACK_TEMPLATE: PositioningTemplate = {
  id: null,
  title: "Test de positionnement — Par défaut",
  description: null,
  is_default: true,
  expectation_choices: [
    { key: "discover", label: "Découvrir le sujet" },
    { key: "consolidate", label: "Consolider mes bases" },
    { key: "autonomy", label: "Gagner en autonomie" },
    {
      key: "secure_practice",
      label: "Sécuriser mes pratiques professionnelles",
    },
    { key: "perfect", label: "Me perfectionner" },
    { key: "solve_issue", label: "Résoudre une difficulté concrète" },
  ],
  mastery_criteria: [
    { key: "basics", label: "Comprendre les notions de base" },
    {
      key: "rules",
      label: "Identifier les règles ou obligations principales",
    },
    { key: "best_practices", label: "Appliquer les bonnes pratiques" },
    { key: "errors", label: "Repérer les erreurs ou pièges à éviter" },
  ],
  structure: null,
};

type Row = {
  id: string;
  title: string;
  description: string | null;
  is_default: boolean | null;
  expectation_choices: PositioningChoice[] | null;
  mastery_criteria: PositioningChoice[] | null;
  /** Migration 0106 — peut être absent si la migration n'a pas
   *  encore été appliquée (on récupérera null dans ce cas). */
  structure?: unknown;
};

function toTemplate(row: Row): PositioningTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    is_default: row.is_default === true,
    expectation_choices:
      Array.isArray(row.expectation_choices) && row.expectation_choices.length > 0
        ? row.expectation_choices
        : FALLBACK_TEMPLATE.expectation_choices,
    mastery_criteria:
      Array.isArray(row.mastery_criteria) && row.mastery_criteria.length > 0
        ? row.mastery_criteria
        : FALLBACK_TEMPLATE.mastery_criteria,
    structure: parseFormStructure(row.structure),
  };
}

/**
 * Charge le template effectif pour une session. Suit la hiérarchie
 * session > formation > default de l'organisation. Fallback codé en dur
 * si rien ne remonte (sécurité — la table peut ne pas exister en local).
 */
export async function loadPositioningTemplateForSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<PositioningTemplate> {
  try {
    // Une seule requête pour récupérer toute la chaîne de résolution
    const { data: session } = await supabase
      .from("sessions")
      .select(
        "organization_id, positioning_template_id, formation:formations(positioning_template_id)",
      )
      .eq("id", sessionId)
      .maybeSingle<{
        organization_id: string;
        positioning_template_id: string | null;
        formation: { positioning_template_id: string | null } | null;
      }>();
    if (!session) return FALLBACK_TEMPLATE;

    const tplId =
      session.positioning_template_id ??
      session.formation?.positioning_template_id ??
      null;

    if (tplId) {
      const { data: tpl } = await supabase
        .from("positioning_templates")
        .select(
          "id, title, description, is_default, expectation_choices, mastery_criteria, structure",
        )
        .eq("id", tplId)
        .maybeSingle<Row>();
      if (tpl) return toTemplate(tpl);
    }

    // Fallback : template default de l'organisation
    const { data: def } = await supabase
      .from("positioning_templates")
      .select(
        "id, title, description, is_default, expectation_choices, mastery_criteria, structure",
      )
      .eq("organization_id", session.organization_id)
      .eq("is_default", true)
      .maybeSingle<Row>();
    if (def) return toTemplate(def);
  } catch (e) {
    console.warn(
      "[loadPositioningTemplateForSession] fallback hardcodé :",
      (e as Error).message,
    );
  }
  return FALLBACK_TEMPLATE;
}

/** Charge le template par défaut d'une organisation (utilisé par la
 *  page d'aperçu /parametres/positionnement-preview). */
export async function loadDefaultPositioningTemplate(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<PositioningTemplate> {
  try {
    const { data: def } = await supabase
      .from("positioning_templates")
      .select(
        "id, title, description, is_default, expectation_choices, mastery_criteria, structure",
      )
      .eq("organization_id", organizationId)
      .eq("is_default", true)
      .maybeSingle<Row>();
    if (def) return toTemplate(def);
  } catch {
    /* table absente : on tombe en fallback */
  }
  return FALLBACK_TEMPLATE;
}

/** Liste tous les templates publiés d'une organisation. Utile pour
 *  les dropdowns sur fiche formation et fiche session. */
export async function listPositioningTemplates(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<
  Array<{
    id: string;
    title: string;
    is_default: boolean;
  }>
> {
  try {
    const { data } = await supabase
      .from("positioning_templates")
      .select("id, title, is_default")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("is_default", { ascending: false })
      .order("title", { ascending: true });
    return (data ?? []) as Array<{
      id: string;
      title: string;
      is_default: boolean;
    }>;
  } catch {
    return [];
  }
}
