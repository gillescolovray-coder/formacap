import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeBlocks } from "@/lib/catalog/defaults";
import type { Catalog } from "@/lib/catalog/types";
import type { Formation } from "@/lib/formations/types";
import { CatalogRender } from "../_render";

export const dynamic = "force-dynamic";

/**
 * Variante "print" du catalogue, optimisée pour la génération PDF
 * via Puppeteer headless. Pas de barre supérieure, pas de sommaire,
 * mise en page A4 paginée.
 */
export default async function CatalogPrintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const supabase = await createClient();
  const { data: catalogRow } = await supabase
    .from("catalog")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (!catalogRow) notFound();

  const catalog: Catalog = {
    ...(catalogRow as unknown as Catalog),
    blocks: normalizeBlocks((catalogRow as { blocks: unknown }).blocks),
  };

  const [{ data: orgRow }, { data: formationsRows }, { data: catRows }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select(
          "id, name, slug, logo_url, email, phone, website, address, postal_code, city, siret, nda, legal_mentions",
        )
        .eq("id", catalog.organization_id)
        .maybeSingle(),
      supabase
        .from("formations")
        .select("*, category:formation_categories(id, name)")
        .eq("organization_id", catalog.organization_id)
        .eq("is_published_online", true)
        .neq("status", "archived")
        .order("title", { ascending: true }),
      supabase
        .from("formation_categories")
        .select("id, name")
        .eq("organization_id", catalog.organization_id)
        .order("name", { ascending: true }),
    ]);

  if (!orgRow) notFound();

  const formations = (formationsRows ?? []) as Array<
    Formation & { category: { id: string; name: string } | null }
  >;
  const categories = (catRows ?? []) as Array<{ id: string; name: string }>;

  let lastUpdate = new Date(catalog.updated_at);
  for (const f of formations) {
    const d = new Date(f.updated_at);
    if (d > lastUpdate) lastUpdate = d;
  }

  return (
    <CatalogRender
      catalog={catalog}
      organization={orgRow}
      formations={formations}
      categories={categories}
      lastUpdate={lastUpdate}
      mode="print"
    />
  );
}
