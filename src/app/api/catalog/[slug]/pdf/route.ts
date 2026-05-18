import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/pdf/render";

// Puppeteer ne fonctionne pas sur le runtime Edge — on force Node.js
export const runtime = "nodejs";
// Génération PDF longue : on autorise jusqu'à 60s sur Vercel
export const maxDuration = 60;

/**
 * Génère (ou récupère depuis le cache) le PDF d'un catalogue publié.
 *
 * Stratégie :
 * 1. On vérifie que le catalogue existe et est publié.
 * 2. Si un PDF en cache existe ET qu'il est à jour (généré après la dernière
 *    mise à jour du catalogue + des formations incluses), on redirige vers ce
 *    PDF stocké dans Supabase Storage.
 * 3. Sinon, on lance Puppeteer headless pour rendre /c/[slug]/print en PDF,
 *    on uploade le résultat dans le bucket "catalog-pdf" et on le sert.
 *
 * En local (NODE_ENV=development), Puppeteer utilise le Chrome système
 * (déclaré via PUPPETEER_EXECUTABLE_PATH ou auto-détecté).
 * En production (Vercel), on utilise @sparticuz/chromium.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const supabase = await createClient();

  // 1. Vérifier que le catalogue est publié + récupérer la dernière mise à jour
  const { data: catalogRow, error } = await supabase
    .from("catalog")
    .select(
      "id, organization_id, slug, is_published, updated_at, pdf_url, pdf_generated_at",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !catalogRow) {
    return new NextResponse("Catalogue introuvable ou non publié", {
      status: 404,
    });
  }

  // Date de dernière modif effective : max entre catalogue + formations
  const { data: latest } = await supabase
    .from("formations")
    .select("updated_at")
    .eq("organization_id", catalogRow.organization_id)
    .eq("is_published_online", true)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const catalogUpdated = new Date(catalogRow.updated_at);
  const formationsUpdated = latest ? new Date(latest.updated_at) : new Date(0);
  const lastDataUpdate =
    catalogUpdated > formationsUpdated ? catalogUpdated : formationsUpdated;

  // 2. Cache valide ?
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && catalogRow.pdf_url && catalogRow.pdf_generated_at) {
    const generated = new Date(catalogRow.pdf_generated_at);
    if (generated >= lastDataUpdate) {
      return NextResponse.redirect(catalogRow.pdf_url);
    }
  }

  // 3. Génération
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderCatalogPdf(slug, request);
  } catch (e) {
    console.error("[catalog-pdf] generation failed", e);
    return new NextResponse(
      `Génération PDF échouée : ${(e as Error).message}`,
      { status: 500 },
    );
  }

  // 4. Upload dans Supabase Storage
  const fileName = `${catalogRow.id}/catalogue-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("catalog-pdf")
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "3600",
    });

  if (uploadError) {
    console.error("[catalog-pdf] upload failed", uploadError);
    // En cas d'échec d'upload, on renvoie quand même le PDF directement
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="catalogue-${slug}.pdf"`,
      },
    });
  }

  // Nettoyer l'ancien PDF si présent
  if (catalogRow.pdf_url) {
    const marker = "/catalog-pdf/";
    const idx = catalogRow.pdf_url.indexOf(marker);
    if (idx >= 0) {
      const oldPath = catalogRow.pdf_url.substring(idx + marker.length);
      if (oldPath && oldPath !== fileName) {
        await supabase.storage.from("catalog-pdf").remove([oldPath]);
      }
    }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("catalog-pdf").getPublicUrl(fileName);

  await supabase
    .from("catalog")
    .update({
      pdf_url: publicUrl,
      pdf_generated_at: new Date().toISOString(),
    })
    .eq("id", catalogRow.id);

  return NextResponse.redirect(publicUrl);
}

/**
 * Rend la page /c/[slug]/print en PDF via le helper Puppeteer partagé.
 */
async function renderCatalogPdf(
  slug: string,
  request: NextRequest,
): Promise<Buffer> {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  return renderPdf({ url: `${origin}/c/${slug}/print` });
}
