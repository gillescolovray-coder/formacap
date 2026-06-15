import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Source UNIQUE de vérité pour la liste des sessions du catalogue partenaire
 * (OF / prescripteur). Utilisée à la fois par la page Catalogue (affichage)
 * et le Tableau de bord (KPI « Sessions au catalogue ») afin que les deux
 * affichent EXACTEMENT le même nombre (Gilles 2026-06-15).
 *
 * Trois sources combinées puis dédupliquées :
 *   1. Catalogue distanciel INTER proposé par l'organisme EN DIRECT
 *      (subcontracting_company_id IS NULL — pas les sessions confiées à un
 *      autre OF) ;
 *   2. (prescripteur uniquement, si show_own_intra) ses sessions propres où il
 *      est prescriber_company_id (toutes modalités) ;
 *   3. les sessions où CE partenaire est donneur d'ordre / sous-traitant
 *      (subcontracting_company_id = lui), toutes modalités.
 */

// Mêmes statuts que la page catalogue (inclut annulée / reportée, affichées
// grisées dans la liste — donc comptées dans le total « Tout »).
const CATALOG_STATUSES = [
  "confirmed",
  "draft",
  "planned",
  "cancelled",
  "postponed",
];

const CATALOG_SELECT = `
  id, internal_code, start_date, end_date, status, is_inter, modality, max_participants, prescriber_company_id, subcontracting_company_id, location, video_app, video_link,
  formation:formations!inner(id, title, duration_hours, duration_days, subtitle, modality, programme_pdf_url),
  location_obj:formation_locations!location_id(id, name, address, postal_code, city)
`;

export type PartnerCatalogueParams = {
  organizationId: string;
  companyId: string;
  companyType: string | null;
  showInterCatalog: boolean | null;
  showOwnIntra: boolean | null;
};

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Renvoie les lignes de session du catalogue partenaire, dédupliquées et
 * triées par date de début croissante. Le type de retour est volontairement
 * souple (la page catalogue le cast vers son propre type d'affichage).
 */
export async function loadPartnerCatalogueSessions(
  supabase: AdminClient,
  p: PartnerCatalogueParams,
  today: string,
): Promise<Record<string, unknown>[]> {
  const isPrescripteur = p.companyType === "prescripteur";
  const showInter = !isPrescripteur || Boolean(p.showInterCatalog);
  const showOwn = isPrescripteur && Boolean(p.showOwnIntra);

  const collected: Record<string, unknown>[] = [];

  if (showInter) {
    // Le filtre sur formation.modality côté Supabase a un bug connu sur les
    // relations aliasées → on filtre en JS après.
    const { data } = await supabase
      .from("sessions")
      .select(CATALOG_SELECT)
      .eq("organization_id", p.organizationId)
      .eq("is_inter", true)
      .is("subcontracting_company_id", null)
      .gte("start_date", today)
      .in("status", CATALOG_STATUSES)
      .order("start_date", { ascending: true });
    for (const s of (data ?? []) as Record<string, unknown>[]) {
      const f = Array.isArray(s.formation) ? s.formation[0] : s.formation;
      if (f && (f as { modality?: string }).modality === "distanciel") {
        collected.push(s);
      }
    }
  }

  if (showOwn) {
    const { data } = await supabase
      .from("sessions")
      .select(CATALOG_SELECT)
      .eq("organization_id", p.organizationId)
      .eq("prescriber_company_id", p.companyId)
      .gte("start_date", today)
      .in("status", CATALOG_STATUSES)
      .order("start_date", { ascending: true });
    collected.push(...((data ?? []) as Record<string, unknown>[]));
  }

  {
    const { data } = await supabase
      .from("sessions")
      .select(CATALOG_SELECT)
      .eq("organization_id", p.organizationId)
      .eq("subcontracting_company_id", p.companyId)
      .gte("start_date", today)
      .in("status", CATALOG_STATUSES)
      .order("start_date", { ascending: true });
    collected.push(...((data ?? []) as Record<string, unknown>[]));
  }

  const seen = new Set<string>();
  return collected
    .filter((s) => {
      const id = s.id as string;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => {
      const da = (a.start_date as string) ?? "9999-12-31";
      const db = (b.start_date as string) ?? "9999-12-31";
      return da.localeCompare(db);
    });
}
