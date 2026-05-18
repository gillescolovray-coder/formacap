import { NextResponse, type NextRequest } from "next/server";
import { renderPdf } from "@/lib/pdf/render";
import {
  conventionPdfTemplatesWithLegalHtml,
  fetchImageAsDataUrl,
} from "@/lib/pdf/templates";
import { overlayBannerOnFirstPage } from "@/lib/pdf/overlay";
import { createClient } from "@/lib/supabase/server";

// Puppeteer ne fonctionne pas sur Edge — runtime Node.js obligatoire.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Génère le PDF de convocation pour un apprenant.
 *
 * Comme la page /sessions/[id]/convocations/[enrollmentId]/print est
 * authentifiée, on propage les cookies de session de l'utilisateur connecté
 * au navigateur headless via Puppeteer.setCookie.
 *
 * Footer Puppeteer (R18) : logo + mentions légales HTML + Page X/Y.
 * La page print NE rend PAS les mentions légales dans le corps pour
 * éviter le doublon (cf. convocation/print/page.tsx).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; enrollmentId: string }> },
) {
  const { id, enrollmentId } = await params;

  // Vérifie que l'utilisateur est bien authentifié
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Authentification requise", { status: 401 });
  }

  // Récupère l'organisation pour construire le footer Puppeteer
  // + le bandeau commercial (overlay pdf-lib sur page 1).
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

  // Titre du document = "Convocation — TITRE FORMATION"
  const { data: enrollmentForTitle } = await supabase
    .from("session_enrollments")
    .select(
      "learner:learners(first_name, last_name), session:sessions(formation:formations(title))",
    )
    .eq("id", enrollmentId)
    .maybeSingle<{
      learner: { first_name: string | null; last_name: string | null } | null;
      session: { formation: { title: string } | null } | null;
    }>();
  const formationTitle =
    enrollmentForTitle?.session?.formation?.title ?? "Formation";
  const docTitle = `Convocation — ${formationTitle}`;

  // Logo : data URL base64 (fetch côté serveur, pour fiabilité).
  const logoDataUrl = await fetchImageAsDataUrl(org?.logo_url ?? null);

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

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const printUrl = `${origin}/sessions/${id}/convocations/${enrollmentId}/print`;

  // Forward des cookies de session pour que Puppeteer charge la page authentifiée
  const cookies = request.cookies
    .getAll()
    .map((c) => ({ name: c.name, value: c.value }));

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf({
      url: printUrl,
      cookies,
      // R18 — Setup IDENTIQUE à la convention :
      //   • Header Puppeteer : titre + Émis le
      //   • Footer Puppeteer : logo + mentions légales HTML + Page X/Y
      //   • Sur la page 1, le bandeau commercial sera dessiné PAR-DESSUS
      //     via pdf-lib (cf. overlayBannerOnFirstPage ci-dessous).
      //   • La page print réserve 20mm en haut du corps page 1.
      headerTemplate: templates?.headerTemplate,
      footerTemplate: templates?.footerTemplate,
      margin: { top: "18mm", bottom: "25mm", left: "0mm", right: "0mm" },
    });
  } catch (e) {
    console.error("[convocation-pdf] generation failed", e);
    return new NextResponse(
      `Génération PDF échouée : ${(e as Error).message}`,
      { status: 500 },
    );
  }

  // R18 — Overlay du bandeau commercial sur la page 1 (post-traitement).
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
        "[convocation-pdf] Overlay bandeau page 1 échoué :",
        (e as Error).message,
      );
    }
  }

  // Construire un nom de fichier humain
  const fullName = enrollmentForTitle?.learner
    ? `${enrollmentForTitle.learner.last_name ?? ""}-${enrollmentForTitle.learner.first_name ?? ""}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/--+/g, "-")
    : enrollmentId.slice(0, 8);
  const fileName = `convocation-${fullName}.pdf`;

  const inline = request.nextUrl.searchParams.get("download") !== "1";

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
