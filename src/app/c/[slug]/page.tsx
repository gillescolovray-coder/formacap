import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, Edit3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { normalizeBlocks } from "@/lib/catalog/defaults";
import type { Catalog } from "@/lib/catalog/types";
import type { Formation } from "@/lib/formations/types";
import { CatalogRender } from "./_render";

export const dynamic = "force-dynamic"; // Toujours en temps réel

type Params = { slug: string };

async function loadCatalog(slug: string) {
  const supabase = await createClient();

  const { data: catalogRow } = await supabase
    .from("catalog")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (!catalogRow) return null;

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

  if (!orgRow) return null;

  const formations = (formationsRows ?? []) as Array<
    Formation & { category: { id: string; name: string } | null }
  >;
  const categories = (catRows ?? []) as Array<{ id: string; name: string }>;

  // Date de mise à jour = max entre catalogue + formations
  let lastUpdate = new Date(catalog.updated_at);
  for (const f of formations) {
    const d = new Date(f.updated_at);
    if (d > lastUpdate) lastUpdate = d;
  }

  return { catalog, organization: orgRow, formations, categories, lastUpdate };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadCatalog(slug);
  if (!data) {
    return { title: "Catalogue introuvable" };
  }
  const title = `${data.catalog.hero_title ?? "Catalogue de formations"} — ${data.organization.name}`;
  const description =
    data.catalog.hero_subtitle ??
    `Catalogue de formations ${data.catalog.hero_year ?? ""} · ${data.formations.length} formations disponibles`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: data.catalog.cover_image_url
        ? [data.catalog.cover_image_url]
        : data.organization.logo_url
          ? [data.organization.logo_url]
          : [],
    },
  };
}

export default async function PublicCatalogPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const data = await loadCatalog(slug);
  if (!data) notFound();

  // Vérifie si l'utilisateur connecté est membre de l'organisation
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: m } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", data.organization.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    isAdmin = Boolean(m);
  }

  return (
    <main className="min-h-screen bg-zinc-100">
      {/* Barre flottante (web) — actions principales */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 px-4 py-2 flex items-center gap-2 print:hidden">
        <span className="text-xs text-zinc-500 hidden sm:inline">
          Mis à jour le{" "}
          <strong className="text-zinc-700">
            {data.lastUpdate.toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </strong>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/catalogue"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-300 bg-white text-sm hover:bg-zinc-50"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Modifier
            </Link>
          )}
          <Link
            href={`/api/catalog/${slug}/pdf`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-semibold text-white"
            style={{
              background: `linear-gradient(135deg, ${data.catalog.color_primary}, ${data.catalog.color_secondary})`,
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Télécharger en PDF
          </Link>
        </div>
      </div>

      <CatalogRender
        catalog={data.catalog}
        organization={data.organization}
        formations={data.formations}
        categories={data.categories}
        lastUpdate={data.lastUpdate}
        mode="web"
      />
    </main>
  );
}
