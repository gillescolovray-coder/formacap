import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ProgrammeCharte,
  type ProgrammeCharteOrg,
} from "@/components/programme-charte";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProgrammeDay = { morning: string | null; afternoon: string | null };

export default async function FormationProgrammePage({
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

  const { data: f } = await supabase
    .from("formations")
    .select(
      "id, organization_id, internal_code, title, general_objective, target_audience, prerequisites, evaluation_methods, teaching_methods, pedagogy_approach, duration_hours, duration_days, min_participants, max_participants, programme_days",
    )
    .eq("id", id)
    .maybeSingle();
  if (!f) notFound();

  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(name, logo_url, secondary_logo_url, address, postal_code, city, phone, email, website, siret, nda, nda_authority, legal_form, share_capital, rcs_number, vat_number)",
    )
    .eq("profile_id", user.id)
    .eq("organization_id", f.organization_id as string)
    .maybeSingle();
  const org = (membership?.organization ?? {}) as unknown as ProgrammeCharteOrg;

  const fr = f as {
    internal_code: string | null;
    title: string;
    general_objective: string | null;
    target_audience: string | null;
    prerequisites: string | null;
    evaluation_methods: string | null;
    teaching_methods: string | null;
    pedagogy_approach: string | null;
    duration_hours: number | null;
    duration_days: number | null;
    min_participants: number | null;
    max_participants: number | null;
    programme_days: ProgrammeDay[] | null;
  };

  return (
    <ProgrammeCharte
      org={org}
      data={{
        internalCode: fr.internal_code,
        title: fr.title,
        generalObjective: fr.general_objective,
        targetAudience: fr.target_audience,
        prerequisites: fr.prerequisites,
        evaluationMethods: fr.evaluation_methods,
        methods: [fr.teaching_methods, fr.pedagogy_approach]
          .filter(Boolean)
          .join("\n"),
        durationHours: fr.duration_hours,
        durationDays: fr.duration_days,
        minParticipants: fr.min_participants,
        maxParticipants: fr.max_participants,
        days: fr.programme_days ?? [],
      }}
    />
  );
}
