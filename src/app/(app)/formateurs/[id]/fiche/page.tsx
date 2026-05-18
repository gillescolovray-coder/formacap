import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrainerFichePrint } from "../_fiche-print";
import type { Trainer } from "@/lib/trainers/types";

export default async function FichePage({
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

  const [{ data: membership }, { data: trainer }, { data: linked }] =
    await Promise.all([
      supabase
        .from("organization_members")
        .select("organization:organizations(name, logo_url)")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("trainers")
        .select("*")
        .eq("id", id)
        .maybeSingle<Trainer>(),
      supabase
        .from("trainer_formations")
        .select("formation_id, justification, formation:formations(id, title)")
        .eq("trainer_id", id),
    ]);

  if (!trainer) notFound();

  const organization = membership?.organization as unknown as {
    name: string;
    logo_url: string | null;
  } | null;

  return (
    <TrainerFichePrint
      trainer={trainer}
      linked={(linked ?? []) as unknown as Array<{
        formation_id: string;
        justification: string | null;
        formation: { id: string; title: string } | null;
      }>}
      orgName={organization?.name ?? "CAP NUMÉRIQUE"}
      orgLogo={organization?.logo_url ?? null}
    />
  );
}
