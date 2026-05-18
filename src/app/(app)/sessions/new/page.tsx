import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionForm } from "../_form";
import { createSession } from "../actions";
import { PageHeader } from "@/components/page-header";
import type { Formation } from "@/lib/formations/types";
import type { OrgDefaultHours, SessionStatusDef } from "@/lib/sessions/types";

/** Tronque "HH:MM:SS" → "HH:MM" pour <input type="time">. */
function trimTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; formation_id?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: formations },
    { data: locations },
    { data: trainers },
    { data: companies },
    { data: membership },
  ] = await Promise.all([
    supabase
      .from("formations")
      .select("*, category:formation_categories(id, name)")
      .neq("status", "archived")
      .order("title", { ascending: true }),
    supabase
      .from("formation_locations")
      .select(
        "id, name, kind, address, postal_code, city, capacity, pmr_accessible",
      )
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("trainers")
      .select("id, first_name, last_name, company_name")
      .eq("is_active", true)
      .order("last_name", { ascending: true }),
    supabase
      .from("companies")
      .select("id, name, type")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("organization_members")
      .select(
        "organization:organizations(id, default_morning_start, default_morning_end, default_afternoon_start, default_afternoon_end)",
      )
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const orgRaw =
    (membership?.organization as unknown as {
      id: string;
      default_morning_start: string | null;
      default_morning_end: string | null;
      default_afternoon_start: string | null;
      default_afternoon_end: string | null;
    } | null) ?? null;
  const orgDefaultHours: OrgDefaultHours = {
    morning_start: trimTime(orgRaw?.default_morning_start),
    morning_end: trimTime(orgRaw?.default_morning_end),
    afternoon_start: trimTime(orgRaw?.default_afternoon_start),
    afternoon_end: trimTime(orgRaw?.default_afternoon_end),
  };

  const { data: customStatusesRaw } = orgRaw
    ? await supabase
        .from("session_statuses")
        .select("*")
        .eq("organization_id", orgRaw.id)
        .order("position", { ascending: true })
    : { data: [] as SessionStatusDef[] };
  const customStatuses = (customStatusesRaw ?? []) as SessionStatusDef[];

  // Quiz publiés (pour le sélecteur sur le form session).
  const { data: availableQuizzesRaw } = orgRaw
    ? await supabase
        .from("quiz_templates")
        .select("id, title")
        .eq("organization_id", orgRaw.id)
        .eq("status", "published")
        .order("title", { ascending: true })
    : { data: [] };
  const availableQuizzes = (availableQuizzesRaw ?? []) as Array<{
    id: string;
    title: string;
  }>;

  // Tarifs ORG par défaut → bloc Tarification de la fiche session (R7).
  const { data: orgPricingRow } = orgRaw
    ? await supabase
        .from("organization_pricing_defaults")
        .select(
          "inter_presentiel_per_day_ht, inter_distanciel_per_day_ht, intra_presentiel_forfait_ht, intra_presentiel_extra_per_day_ht, intra_distanciel_forfait_ht, intra_distanciel_extra_per_day_ht, intra_forfait_threshold",
        )
        .eq("organization_id", orgRaw.id)
        .maybeSingle()
    : { data: null };
  const p = orgPricingRow as {
    inter_presentiel_per_day_ht: number;
    inter_distanciel_per_day_ht: number;
    intra_presentiel_forfait_ht: number;
    intra_presentiel_extra_per_day_ht: number;
    intra_distanciel_forfait_ht: number;
    intra_distanciel_extra_per_day_ht: number;
    intra_forfait_threshold: number;
  } | null;
  const orgPricingDefaults = {
    interPresentielPerDay: p?.inter_presentiel_per_day_ht ?? 340,
    interDistancielPerDay: p?.inter_distanciel_per_day_ht ?? 305,
    intraPresentielForfait: p?.intra_presentiel_forfait_ht ?? 1250,
    intraPresentielExtraPerDay: p?.intra_presentiel_extra_per_day_ht ?? 175,
    intraDistancielForfait: p?.intra_distanciel_forfait_ht ?? 990,
    intraDistancielExtraPerDay: p?.intra_distanciel_extra_per_day_ht ?? 150,
    threshold: p?.intra_forfait_threshold ?? 4,
  };

  const params = await searchParams;

  return (
    <>
      <PageHeader
        title="Nouvelle session"
        description="Planifiez une nouvelle date pour une formation."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Sessions", href: "/sessions" },
          { label: "Nouvelle" },
        ]}
      />
      <div className="p-8 max-w-4xl">
        {params.error && (
          <div className="mb-6 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {params.error}
          </div>
        )}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8">
          <SessionForm
            formations={(formations ?? []) as Formation[]}
            locations={locations ?? []}
            trainers={trainers ?? []}
            companies={companies ?? []}
            orgDefaultHours={orgDefaultHours}
            customStatuses={customStatuses}
            orgPricingDefaults={orgPricingDefaults}
            currentNbApprenants={0}
            defaultFormationId={params.formation_id}
            availableQuizzes={availableQuizzes}
            action={createSession}
            submitLabel="Créer la session"
          />
        </div>
      </div>
    </>
  );
}
