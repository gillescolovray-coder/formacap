import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ProgrammeCharte,
  type ProgrammeCharteOrg,
} from "@/components/programme-charte";
import type { BloomObjective } from "@/lib/bloom/types";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Aperçu à la charte d'un PROGRAMME (brouillon Bloom), AVANT bascule au
 * catalogue. Utilise le MÊME composant que la fiche formation -> rendu
 * identique. Les champs non encore saisis (prérequis, déroulé…) s'affichent
 * « À compléter » : ils seront renseignés sur la fiche formation après bascule.
 * Si le programme est déjà basculé, on redirige vers la fiche formation.
 */
export default async function ProgrammeApercuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: bp } = await supabase
    .from("program_blueprints")
    .select(
      "organization_id, formation_id, internal_code, title, target_audience, duration_hours, duration_days, general_objective, prerequisites, evaluation_methods, teaching_methods, programme_days, bloom_objectives",
    )
    .eq("id", id)
    .maybeSingle();
  if (!bp) notFound();

  const b = bp as {
    organization_id: string;
    formation_id: string | null;
    internal_code: string | null;
    title: string;
    target_audience: string | null;
    duration_hours: number | null;
    duration_days: number | null;
    general_objective: string | null;
    prerequisites: string | null;
    evaluation_methods: string | null;
    teaching_methods: string | null;
    programme_days: { morning: string | null; afternoon: string | null }[] | null;
    bloom_objectives: BloomObjective[] | null;
  };

  // Déjà basculé -> on montre le rendu officiel (fiche formation).
  if (b.formation_id) redirect(`/formations/${b.formation_id}/programme`);

  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(name, logo_url, secondary_logo_url, address, postal_code, city, phone, email, website, siret, nda, nda_authority, legal_form, share_capital, rcs_number, vat_number)",
    )
    .eq("profile_id", user.id)
    .eq("organization_id", b.organization_id)
    .maybeSingle();
  const org = (membership?.organization ?? {}) as unknown as ProgrammeCharteOrg;

  return (
    <ProgrammeCharte
      org={org}
      data={{
        internalCode: b.internal_code,
        title: b.title,
        generalObjective: b.general_objective,
        targetAudience: b.target_audience,
        prerequisites: b.prerequisites,
        evaluationMethods: b.evaluation_methods,
        methods: b.teaching_methods,
        durationHours: b.duration_hours,
        durationDays: b.duration_days,
        minParticipants: null,
        maxParticipants: null,
        days: b.programme_days ?? [],
      }}
    />
  );
}
