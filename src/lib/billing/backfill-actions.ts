"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadAndComputeBillingForInscription,
  persistComputedBilling,
} from "./compute-billing";

/**
 * Recalcule la facturation de TOUTES les inscriptions d'UNE session (cœur,
 * sans contrôle d'accès — pour usage interne via le client admin). Gilles
 * 2026-06-25 : c'est LA correction « tarif fiable une fois pour toutes ». Le
 * forfait étant un total de groupe, le montant par apprenant (= total ÷ nb)
 * doit être rafraîchi dès que le nombre d'apprenants change.
 *
 * GARDE-FOU : une session CLÔTURÉE (admin_closed_at) n'est JAMAIS recalculée
 * (montants gelés). Respecte aussi les overrides manuels (sauf force).
 */
async function recomputeSessionBillingCore(
  admin: SupabaseClient,
  sessionId: string,
  opts?: { force?: boolean },
): Promise<{ computed: number; skipped: number; closed: boolean }> {
  const { data: sess } = await admin
    .from("sessions")
    .select("admin_closed_at")
    .eq("id", sessionId)
    .maybeSingle<{ admin_closed_at: string | null }>();
  // Session clôturée -> montants gelés, on ne touche à rien.
  if (sess?.admin_closed_at) return { computed: 0, skipped: 0, closed: true };

  const { data: rows } = await admin
    .from("inscription_requests")
    .select("id, billing_manually_overridden")
    .eq("target_session_id", sessionId);

  let computed = 0;
  let skipped = 0;
  for (const ir of (rows ?? []) as Array<{
    id: string;
    billing_manually_overridden: boolean | null;
  }>) {
    if (ir.billing_manually_overridden && !opts?.force) {
      skipped += 1;
      continue;
    }
    try {
      const result = await loadAndComputeBillingForInscription(admin, ir.id);
      await persistComputedBilling(admin, ir.id, result, {
        force: !!opts?.force,
      });
      computed += 1;
    } catch {
      /* best-effort : une inscription en erreur ne bloque pas les autres */
    }
  }
  return { computed, skipped, closed: false };
}

/**
 * Déclenchement AUTOMATIQUE (best-effort, sans bloquer l'appelant) après un
 * changement du nombre d'apprenants d'une session (inscription / annulation).
 * À appeler depuis les server actions d'inscription/émargement.
 */
export async function recomputeSessionBillingAuto(
  sessionId: string | null | undefined,
): Promise<void> {
  if (!sessionId) return;
  try {
    const admin = createAdminClient();
    await recomputeSessionBillingCore(admin, sessionId);
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath("/inscriptions");
  } catch {
    /* best-effort */
  }
}

/**
 * Recalcul MANUEL de la facturation d'une session (bouton sur la fiche).
 * Contrôle d'accès gestionnaire. Répare immédiatement une session existante.
 */
export async function recomputeSessionBilling(
  sessionId: string,
): Promise<{
  ok: boolean;
  error?: string;
  computed?: number;
  skipped?: number;
  closed?: boolean;
}> {
  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };
  const { data: member } = await userSupabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<{ role: string }>();
  if (!member || !["admin", "manager", "pedagogy_lead"].includes(member.role)) {
    return { ok: false, error: "Accès réservé aux gestionnaires." };
  }
  const admin = createAdminClient();
  const res = await recomputeSessionBillingCore(admin, sessionId);
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/inscriptions");
  return { ok: true, ...res };
}

/**
 * Backfill billing pour toutes les inscriptions OU billing_total_ht
 * est NULL ou recalcul force (force=true).
 *
 * Strategie :
 *  - Charge toutes les inscription_requests non perdues (lost) de
 *    l organisation de l utilisateur courant
 *  - Pour chacune, appelle loadAndComputeBillingForInscription
 *  - Appelle persistComputedBilling (avec force=opts.force)
 *  - Compte les succes / warnings / erreurs / skipped (manual override)
 *
 * Limites :
 *  - Traite par batch de 100 max par appel pour eviter timeout Vercel
 *  - Retourne un resume detaille pour affichage UI
 */
export type BackfillBillingResult = {
  ok: boolean;
  error?: string;
  total?: number;
  computed?: number;
  skippedManualOverride?: number;
  warnings?: number;
  errors?: number;
  details?: Array<{
    inscriptionId: string;
    status: "computed" | "skipped" | "warning" | "error";
    message?: string;
  }>;
};

export async function backfillBillingForAllInscriptions(opts?: {
  /** Si true, ecrase meme les billings manuels (a utiliser avec precaution). */
  force?: boolean;
  /** Si true, ne traite que les inscriptions sans billing_total_ht. */
  onlyMissing?: boolean;
}): Promise<BackfillBillingResult> {
  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  // Recupere l org de l utilisateur (admin uniquement)
  const { data: member } = await userSupabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!member) return { ok: false, error: "Aucune organisation." };
  if (member.role !== "admin" && member.role !== "manager") {
    return {
      ok: false,
      error: "Accès réservé aux administrateurs et managers.",
    };
  }

  const orgId = member.organization_id as string;
  const supabaseAdmin = createAdminClient();

  // Charge les inscriptions de l org, hors stages perdus
  const { data: lostStages } = await supabaseAdmin
    .from("inscription_stages")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_lost", true);
  const lostStageIds = (lostStages ?? []).map(
    (s) => (s as { id: string }).id,
  );

  let query = supabaseAdmin
    .from("inscription_requests")
    .select("id, billing_total_ht, billing_manually_overridden, stage_id")
    .eq("organization_id", orgId)
    .limit(500);
  if (opts?.onlyMissing) {
    query = query.is("billing_total_ht", null);
  }
  const { data: inscriptions, error: loadErr } = await query;
  if (loadErr) {
    return { ok: false, error: `Erreur de chargement : ${loadErr.message}` };
  }
  const rows = (inscriptions ?? []) as Array<{
    id: string;
    billing_total_ht: number | string | null;
    billing_manually_overridden: boolean | null;
    stage_id: string | null;
  }>;

  let computed = 0;
  let skippedManualOverride = 0;
  let warnings = 0;
  let errors = 0;
  const details: BackfillBillingResult["details"] = [];

  for (const ir of rows) {
    // Skip stages perdus
    if (ir.stage_id && lostStageIds.includes(ir.stage_id)) {
      continue;
    }
    // Skip si override manuel et pas force
    if (ir.billing_manually_overridden && !opts?.force) {
      skippedManualOverride++;
      details.push({
        inscriptionId: ir.id,
        status: "skipped",
        message: "Manual override actif",
      });
      continue;
    }

    try {
      const result = await loadAndComputeBillingForInscription(
        supabaseAdmin,
        ir.id,
      );
      const persistRes = await persistComputedBilling(
        supabaseAdmin,
        ir.id,
        result,
        { force: !!opts?.force },
      );
      if (!persistRes.ok) {
        errors++;
        details.push({
          inscriptionId: ir.id,
          status: "error",
          message: persistRes.error ?? "Erreur de persistance",
        });
        continue;
      }
      if (result.warnings && result.warnings.length > 0) {
        warnings++;
        details.push({
          inscriptionId: ir.id,
          status: "warning",
          message: result.warnings.join(" ; "),
        });
      } else {
        computed++;
        details.push({
          inscriptionId: ir.id,
          status: "computed",
        });
      }
    } catch (e) {
      errors++;
      details.push({
        inscriptionId: ir.id,
        status: "error",
        message: e instanceof Error ? e.message : "Exception",
      });
    }
  }

  return {
    ok: true,
    total: rows.length,
    computed,
    skippedManualOverride,
    warnings,
    errors,
    details: details.slice(0, 50), // Limite l affichage UI a 50 lignes
  };
}
