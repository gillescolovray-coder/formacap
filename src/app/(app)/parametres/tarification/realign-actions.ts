"use server";

/**
 * Réalignement des inscriptions PRESCRIPTEURS existantes sur la grille
 * tarifaire en vigueur (tarif société, sinon grille prescripteur par défaut).
 * Gilles 2026-06-09. Respecte les montants saisis manuellement
 * (billing_manually_overridden) — on ne les écrase pas.
 */
import { createClient } from "@/lib/supabase/server";
import {
  computeEffectivePartnerPrice,
  loadOrgPartnerDefaults,
} from "@/lib/portal/partner-pricing";

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function realignPrescripteurPricing(): Promise<{
  ok: boolean;
  updated: number;
  skipped: number;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, updated: 0, skipped: 0, error: "Non authentifié." };
  const { data: mem } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const orgId = mem?.organization_id as string | undefined;
  if (!orgId) return { ok: false, updated: 0, skipped: 0, error: "Aucune organisation." };

  // Sociétés prescriptrices de l'organisation.
  const { data: companies } = await supabase
    .from("companies")
    .select(
      "id, type, partner_daily_rate_distanciel_ht, partner_daily_rate_presentiel_ht, partner_quiz_unit_price_ht",
    )
    .eq("organization_id", orgId)
    .eq("type", "prescripteur");
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id as string, c]),
  );
  if (companyMap.size === 0) {
    return { ok: true, updated: 0, skipped: 0 };
  }
  const prescripteurIds = Array.from(companyMap.keys());

  // Inscriptions rattachées à un prescripteur.
  const { data: reqs } = await supabase
    .from("inscription_requests")
    .select(
      "id, referrer_company_id, target_session_id, billing_manually_overridden",
    )
    .eq("organization_id", orgId)
    .in("referrer_company_id", prescripteurIds);
  const inscriptions = (reqs ?? []) as Array<{
    id: string;
    referrer_company_id: string | null;
    target_session_id: string | null;
    billing_manually_overridden: boolean | null;
  }>;
  if (inscriptions.length === 0) return { ok: true, updated: 0, skipped: 0 };

  // Formations des sessions ciblées.
  const sessionIds = Array.from(
    new Set(inscriptions.map((r) => r.target_session_id).filter(Boolean)),
  ) as string[];
  const formationBySession = new Map<
    string,
    { formation_id: string | null; modality: string | null; duration_days: number | null; duration_hours: number | null }
  >();
  if (sessionIds.length > 0) {
    const { data: sessions } = await supabase
      .from("sessions")
      .select(
        "id, formation_id, formation:formations(modality, duration_days, duration_hours)",
      )
      .in("id", sessionIds);
    for (const s of (sessions ?? []) as Array<{
      id: string;
      formation_id: string | null;
      formation:
        | { modality: string | null; duration_days: number | null; duration_hours: number | null }
        | Array<{ modality: string | null; duration_days: number | null; duration_hours: number | null }>
        | null;
    }>) {
      const f = Array.isArray(s.formation) ? s.formation[0] : s.formation;
      formationBySession.set(s.id, {
        formation_id: s.formation_id,
        modality: f?.modality ?? null,
        duration_days: f?.duration_days ?? null,
        duration_hours: f?.duration_hours ?? null,
      });
    }
  }

  // Overrides négociés (société × formation).
  const { data: overridesRows } = await supabase
    .from("partner_pricing")
    .select("company_id, formation_id, unit_price_ht")
    .in("company_id", prescripteurIds);
  const overrideMap = new Map<string, number>();
  for (const o of (overridesRows ?? []) as Array<{
    company_id: string;
    formation_id: string;
    unit_price_ht: number | string;
  }>) {
    const n = toNum(o.unit_price_ht);
    if (n !== null) overrideMap.set(`${o.company_id}:${o.formation_id}`, n);
  }

  const orgDefaults = await loadOrgPartnerDefaults(supabase, orgId);

  let updated = 0;
  let skipped = 0;
  for (const r of inscriptions) {
    if (r.billing_manually_overridden) {
      skipped++;
      continue;
    }
    const company = r.referrer_company_id
      ? companyMap.get(r.referrer_company_id)
      : null;
    const sess = r.target_session_id
      ? formationBySession.get(r.target_session_id)
      : null;
    if (!company || !sess) {
      skipped++;
      continue;
    }
    const overrideKey =
      r.referrer_company_id && sess.formation_id
        ? `${r.referrer_company_id}:${sess.formation_id}`
        : "";
    const overrideHt = overrideMap.get(overrideKey);

    const effective = computeEffectivePartnerPrice({
      partnerType: "prescripteur",
      dailyRateDistancielHt: toNum(company.partner_daily_rate_distanciel_ht),
      dailyRatePresentielHt: toNum(company.partner_daily_rate_presentiel_ht),
      quizUnitPriceHt: toNum(company.partner_quiz_unit_price_ht),
      overrideHt: overrideHt,
      durationDays: sess.duration_days,
      durationHours: sess.duration_hours,
      modality: (sess.modality ?? null) as
        | "presentiel"
        | "distanciel"
        | "hybride"
        | null,
      ...orgDefaults,
    });

    if (effective.price === null) {
      skipped++;
      continue;
    }
    const { error } = await supabase
      .from("inscription_requests")
      .update({
        quote_amount_ht: effective.price,
        billing_total_ht: effective.price,
      })
      .eq("id", r.id);
    if (error) skipped++;
    else updated++;
  }

  return { ok: true, updated, skipped };
}
