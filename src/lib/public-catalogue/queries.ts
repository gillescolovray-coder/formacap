import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Accès aux données du PORTAIL PUBLIC de catalogue (Gilles 2026-06-14).
 *
 * Pages publiques (sans login) -> on lit côté serveur avec le client admin
 * (service role) en N'EXPOSANT QUE des champs sûrs et UNIQUEMENT les
 * formations marquées « Publier sur le catalogue en ligne »
 * (`formations.is_published_online = true`). Aucune donnée interne
 * (codes, inscrits, tarifs partenaires…) n'est exposée.
 */

export type PublicSession = {
  id: string;
  start_date: string;
  end_date: string;
  modality: string | null;
  is_inter: boolean | null;
  status: string;
};

export type PublicFormationCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  categoryName: string | null;
  durationHours: number | null;
  durationDays: number | null;
  modality: string | null;
  coverImageUrl: string | null;
  publicPriceHt: number | null;
  isCpfEligible: boolean;
  competenceDomains: string[];
  nextSession: PublicSession | null;
};

export type PublicFormationDetail = PublicFormationCard & {
  description: string | null;
  generalObjective: string | null;
  operationalObjectives: string[];
  targetAudience: string | null;
  prerequisites: string | null;
  programmeDays: { morning: string; afternoon: string }[];
  pedagogyApproach: string | null;
  teachingMethods: string | null;
  technicalMeans: string | null;
  evaluationMethods: string | null;
  accessibility: string | null;
  minParticipants: number | null;
  maxParticipants: number | null;
  priceCompany: number | null;
  priceIndividual: number | null;
  pricingNote: string | null;
  programmePdfUrl: string | null;
  upcomingSessions: PublicSession[];
};

const SYNCED_SESSION_STATUSES = ["planned", "confirmed", "in_progress"];

/** "Compte prorata" -> "compte-prorata". */
function slugifyTitle(title: string): string {
  return (title || "formation")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/** URL propre : "compte-prorata--<id>" (l'id sert au lookup fiable). */
export function buildFormationSlug(title: string, id: string): string {
  return `${slugifyTitle(title)}--${id}`;
}

/** Extrait l'id d'un slug "titre--<uuid>". */
export function idFromSlug(slug: string): string | null {
  const m = slug.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  return m ? m[1] : null;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Charge les sessions à venir (publiables) groupées par formation. */
async function loadUpcomingSessionsByFormation(
  formationIds: string[],
): Promise<Map<string, PublicSession[]>> {
  const map = new Map<string, PublicSession[]>();
  if (formationIds.length === 0) return map;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sessions")
    .select("id, formation_id, start_date, end_date, modality, is_inter, status")
    .in("formation_id", formationIds)
    .in("status", SYNCED_SESSION_STATUSES)
    .gte("end_date", today())
    .order("start_date", { ascending: true });
  for (const s of (data ?? []) as Array<
    PublicSession & { formation_id: string }
  >) {
    if (!map.has(s.formation_id)) map.set(s.formation_id, []);
    map.get(s.formation_id)!.push({
      id: s.id,
      start_date: s.start_date,
      end_date: s.end_date,
      modality: s.modality,
      is_inter: s.is_inter,
      status: s.status,
    });
  }
  return map;
}

const FORMATION_FIELDS =
  "id, title, subtitle, description, general_objective, operational_objectives, target_audience, prerequisites, programme_days, pedagogy_approach, teaching_methods, technical_means, evaluation_methods, accessibility, duration_hours, duration_days, modality, min_participants, max_participants, public_price_excl_tax, price_company, price_individual, pricing_note, is_cpf_eligible, competence_domains, cover_image_url, programme_pdf_url, category:formation_categories(name)";

type RawFormation = Record<string, unknown> & {
  id: string;
  title: string;
  category?: { name: string | null } | { name: string | null }[] | null;
};

function pickCategory(
  c: RawFormation["category"],
): string | null {
  const o = Array.isArray(c) ? c[0] ?? null : c ?? null;
  return o?.name ?? null;
}

function toCard(
  f: RawFormation,
  sessions: Map<string, PublicSession[]>,
): PublicFormationCard {
  const list = sessions.get(f.id) ?? [];
  return {
    id: f.id,
    slug: buildFormationSlug(f.title, f.id),
    title: f.title,
    subtitle: (f.subtitle as string | null) ?? null,
    categoryName: pickCategory(f.category),
    durationHours: num(f.duration_hours as number | null),
    durationDays: num(f.duration_days as number | null),
    modality: (f.modality as string | null) ?? null,
    coverImageUrl: (f.cover_image_url as string | null) ?? null,
    publicPriceHt:
      num(f.public_price_excl_tax as number | null) ??
      num(f.price_company as number | null),
    isCpfEligible: f.is_cpf_eligible === true,
    competenceDomains: (f.competence_domains as string[] | null) ?? [],
    nextSession: list[0] ?? null,
  };
}

/** Catalogue : toutes les formations publiées en ligne (cartes). */
export async function getPublicCatalogue(): Promise<PublicFormationCard[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("formations")
    .select(FORMATION_FIELDS)
    .eq("is_published_online", true)
    .order("title", { ascending: true });
  const formations = (data ?? []) as RawFormation[];
  const sessions = await loadUpcomingSessionsByFormation(
    formations.map((f) => f.id),
  );
  return formations.map((f) => toCard(f, sessions));
}

/** Fiche détaillée d'une formation publiée (ou null si introuvable/non publiée). */
export async function getPublicFormation(
  id: string,
): Promise<PublicFormationDetail | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("formations")
    .select(FORMATION_FIELDS)
    .eq("id", id)
    .eq("is_published_online", true)
    .maybeSingle<RawFormation>();
  if (!data) return null;
  const sessions = await loadUpcomingSessionsByFormation([data.id]);
  const card = toCard(data, sessions);
  return {
    ...card,
    description: (data.description as string | null) ?? null,
    generalObjective: (data.general_objective as string | null) ?? null,
    operationalObjectives:
      (data.operational_objectives as string[] | null) ?? [],
    targetAudience: (data.target_audience as string | null) ?? null,
    prerequisites: (data.prerequisites as string | null) ?? null,
    programmeDays:
      (data.programme_days as { morning: string; afternoon: string }[] | null) ??
      [],
    pedagogyApproach: (data.pedagogy_approach as string | null) ?? null,
    teachingMethods: (data.teaching_methods as string | null) ?? null,
    technicalMeans: (data.technical_means as string | null) ?? null,
    evaluationMethods: (data.evaluation_methods as string | null) ?? null,
    accessibility: (data.accessibility as string | null) ?? null,
    minParticipants: num(data.min_participants as number | null),
    maxParticipants: num(data.max_participants as number | null),
    priceCompany: num(data.price_company as number | null),
    priceIndividual: num(data.price_individual as number | null),
    pricingNote: (data.pricing_note as string | null) ?? null,
    programmePdfUrl: (data.programme_pdf_url as string | null) ?? null,
    upcomingSessions: sessions.get(data.id) ?? [],
  };
}

/** Organisation (logo + coordonnées) pour l'en-tête / pied du portail. */
export async function getPublicOrganization(): Promise<{
  name: string;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  legalMentions: string | null;
} | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organizations")
    .select("*")
    .limit(1)
    .maybeSingle<Record<string, unknown>>();
  if (!data) return null;
  return {
    name: (data.name as string | null) ?? "CAP Numérique",
    logoUrl: (data.logo_url as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    legalMentions: (data.legal_mentions as string | null) ?? null,
  };
}
