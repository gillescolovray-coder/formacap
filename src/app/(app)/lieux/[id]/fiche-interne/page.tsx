import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LocationFichePrint } from "../_fiche-print";
import type { FormationLocation } from "@/lib/locations/types";

export default async function FicheInternePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, organization:organizations(name, logo_url)")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data: location } = await supabase
    .from("formation_locations")
    .select("*")
    .eq("id", id)
    .maybeSingle<FormationLocation>();

  if (!location) notFound();

  const organization = membership?.organization as unknown as {
    name: string;
    logo_url: string | null;
  } | null;

  return (
    <LocationFichePrint
      location={location}
      mode="interne"
      orgName={organization?.name ?? "CAP NUMÉRIQUE"}
      orgLogo={organization?.logo_url ?? null}
    />
  );
}
