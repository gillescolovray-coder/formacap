import { NextResponse, type NextRequest } from "next/server";
import { renderPdf } from "@/lib/pdf/render";
import {
  conventionPdfTemplatesWithLegalHtml,
  fetchImageAsDataUrl,
} from "@/lib/pdf/templates";
import { overlayBannerOnFirstPage } from "@/lib/pdf/overlay";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; conventionId: string }> },
) {
  const { id, conventionId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Auth requise", { status: 401 });

  // Récupérer l'organisation pour les templates de l'en-tête / pied
  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(name, logo_url, siret, nda, address, postal_code, city, email, phone, legal_mentions, commercial_banner_path)",
    )
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const org = membership?.organization as unknown as {
    name: string;
    logo_url: string | null;
    siret: string | null;
    nda: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
    email: string | null;
    phone: string | null;
    legal_mentions: string | null;
    commercial_banner_path: string | null;
  } | null;

  // Récupérer le titre de la formation pour mettre dans l'en-tête
  const { data: conv } = await supabase
    .from("session_conventions")
    .select(
      "session:sessions(formation:formations(title)), company:companies(name)",
    )
    .eq("id", conventionId)
    .maybeSingle<{
      session: { formation: { title: string } | null } | null;
      company: { name: string } | null;
    }>();
  const formationTitle = conv?.session?.formation?.title ?? "Formation";
  const docTitle = `Convention — ${formationTitle}`;

  // Logo : fetch côté serveur + base64 (cf. actions.ts pour le détail).
  const logoDataUrl = await fetchImageAsDataUrl(org?.logo_url ?? null);
  // R14 — Templates Puppeteer : header (titre + Émis le) + footer
  // (mentions légales HTML riche depuis legal_mentions + Page X/Y).
  const templates = org
    ? conventionPdfTemplatesWithLegalHtml(
        {
          name: org.name,
          logoUrl: logoDataUrl ?? org.logo_url,
          siret: org.siret,
          nda: org.nda,
          address: org.address,
          postalCode: org.postal_code,
          city: org.city,
          phone: org.phone,
          email: org.email,
        },
        docTitle,
        org.legal_mentions ?? null,
      )
    : null;

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const printUrl = `${origin}/sessions/${id}/conventions/${conventionId}/print?for=pdf`;
  const cookies = request.cookies
    .getAll()
    .map((c) => ({ name: c.name, value: c.value }));

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf({
      url: printUrl,
      cookies,
      // R18 — voir actions.ts (header Puppeteer sur toutes les pages +
      // overlay pdf-lib du bandeau commercial sur page 1).
      headerTemplate: templates?.headerTemplate,
      footerTemplate: templates?.footerTemplate,
      margin: { top: "18mm", bottom: "25mm", left: "0mm", right: "0mm" },
    });
  } catch (e) {
    return new NextResponse(`PDF échec : ${(e as Error).message}`, {
      status: 500,
    });
  }

  // R18 — Overlay du bandeau commercial sur la page 1 via pdf-lib.
  if (org?.commercial_banner_path) {
    try {
      const { data: bannerBlob } = await supabase.storage
        .from("organization-banners")
        .download(org.commercial_banner_path);
      if (bannerBlob) {
        const bannerBuf = Buffer.from(await bannerBlob.arrayBuffer());
        const bannerType = bannerBlob.type || "image/png";
        pdfBuffer = await overlayBannerOnFirstPage(
          pdfBuffer,
          bannerBuf,
          bannerType,
        );
      }
    } catch (e) {
      console.warn(
        "[pdf/route] Overlay bandeau page 1 échoué :",
        (e as Error).message,
      );
    }
  }

  const fileName = conv?.company?.name
    ? `convention-${conv.company.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`
    : `convention-${conventionId.slice(0, 8)}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
