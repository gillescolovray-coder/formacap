"use server";

/**
 * Fusion de fiches entreprises en double (Gilles 2026-06-04).
 *
 * - searchCompaniesForMerge : recherche les fiches candidates de la même
 *   organisation (hors fiche courante) à absorber.
 * - mergeCompanyInto : absorbe la fiche `sourceId` dans `targetId` via la
 *   fonction SQL merge_companies (migration 0117) qui réassigne toutes les
 *   références puis supprime la source.
 *
 * Sécurité : la fonction SQL vérifie elle-même le rôle admin/manager
 * (has_org_role) ; on double le contrôle ici côté serveur.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CompanyCandidate = {
  id: string;
  name: string;
  type: string | null;
  siret: string | null;
  postal_code: string | null;
  city: string | null;
};

export async function searchCompaniesForMerge(
  currentCompanyId: string,
  query: string,
): Promise<CompanyCandidate[]> {
  if (!UUID_REGEX.test(currentCompanyId)) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Organisation de la fiche courante
  const { data: current } = await supabase
    .from("companies")
    .select("organization_id")
    .eq("id", currentCompanyId)
    .maybeSingle<{ organization_id: string }>();
  if (!current) return [];

  const q = query.trim();
  let req = supabase
    .from("companies")
    .select("id, name, type, siret, postal_code, city")
    .eq("organization_id", current.organization_id)
    .neq("id", currentCompanyId)
    .order("name", { ascending: true })
    .limit(20);

  if (q.length > 0) {
    const safe = q.replace(/[%_,()]/g, " ").trim();
    req = req.or(`name.ilike.%${safe}%,siret.ilike.%${safe}%`);
  }

  const { data } = await req;
  return (data ?? []) as CompanyCandidate[];
}

export type MergeResult = { ok: true } | { ok: false; error: string };

export async function mergeCompanyInto(
  targetId: string,
  sourceId: string,
): Promise<MergeResult> {
  if (!UUID_REGEX.test(targetId) || !UUID_REGEX.test(sourceId)) {
    return { ok: false, error: "Identifiants invalides." };
  }
  if (targetId === sourceId) {
    return { ok: false, error: "Une fiche ne peut pas être fusionnée avec elle-même." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  // Contrôle : les deux fiches existent et appartiennent à la même org,
  // dont l'utilisateur est membre actif admin/manager.
  const { data: companies } = await supabase
    .from("companies")
    .select("id, organization_id")
    .in("id", [targetId, sourceId]);
  if (!companies || companies.length !== 2) {
    return { ok: false, error: "Fiche entreprise introuvable." };
  }
  const orgId = (companies[0] as { organization_id: string }).organization_id;
  const sameOrg = companies.every(
    (c) => (c as { organization_id: string }).organization_id === orgId,
  );
  if (!sameOrg) {
    return { ok: false, error: "Les deux fiches ne sont pas de la même organisation." };
  }

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  const allowed = (memberships ?? []).some(
    (m) =>
      (m as { organization_id: string }).organization_id === orgId &&
      ["admin", "manager"].includes((m as { role: string }).role),
  );
  if (!allowed) {
    return {
      ok: false,
      error: "Action réservée aux administrateurs / responsables.",
    };
  }

  const { error } = await supabase.rpc("merge_companies", {
    p_target: targetId,
    p_source: sourceId,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/entreprises");
  revalidatePath(`/entreprises/${targetId}`);
  return { ok: true };
}
