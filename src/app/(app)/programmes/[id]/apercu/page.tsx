import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ancienne page d'aperçu générique (brouillon Bloom) — REMPLACÉE.
 * Le programme diffusable à la charte est désormais rendu depuis la fiche
 * formation. On redirige : si le programme a été basculé au catalogue, on va
 * sur le rendu charte ; sinon on renvoie sur la fiche programme.
 */
export default async function ProgrammeApercuRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const { data: bp } = await supabase
    .from("program_blueprints")
    .select("formation_id")
    .eq("id", id)
    .maybeSingle<{ formation_id: string | null }>();

  if (bp?.formation_id) {
    redirect(`/formations/${bp.formation_id}/programme`);
  }
  redirect(`/programmes/${id}`);
}
