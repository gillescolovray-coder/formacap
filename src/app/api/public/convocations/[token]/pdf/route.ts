import { NextResponse, type NextRequest } from "next/server";
import { renderPdf } from "@/lib/pdf/render";
import {
  conventionPdfTemplatesWithLegalHtml,
  fetchImageAsDataUrl,
} from "@/lib/pdf/templates";
import { overlayBannerOnFirstPage } from "@/lib/pdf/overlay";
import { createAdminClient } from "@/lib/supabase/admin";

// Puppeteer ne fonctionne pas sur Edge — runtime Node.js obligatoire.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Route publique de génération PDF convocation (Gilles 2026-05-22 —
 * Option B délivrabilité Gmail).
 *
 * Permet de servir le PDF d'une convocation via un lien token-based
 * (sans auth utilisateur Supabase). Utilisé pour partager le lien direct
 * de la convocation dans un email Gmail envoyé depuis le compte pro de
 * l'utilisateur — le destinataire clique sur le lien pour télécharger.
 *
 * Auth : on vérifie que le `token` correspond bien à un
 * enrollment_portal_token valide (table partagée avec le portail
 * apprenant et le QR de la convocation).
 *
 * Format URL : /api/public/convocations/<token>/pdf
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return new NextResponse("Token invalide", { status: 400 });
  }

  // Vérification du token via admin client (bypass RLS auth).
  const supabase = createAdminClient();
  const { data: tokenRow } = await supabase
    .from("enrollment_portal_tokens")
    .select(
      "enrollment_id, enrollment:session_enrollments(id, session_id, learner:learners(first_name, last_name), session:sessions(organization_id, formation:formations(title)))",
    )
    .eq("token", token)
    .maybeSingle<{
      enrollment_id: string;
      enrollment: {
        id: string;
        session_id: string;
        learner: { first_name: string | null; last_name: string | null } | null;
        session: {
          organization_id: string;
          formation: { title: string } | null;
        } | null;
      } | null;
    }>();

  if (!tokenRow || !tokenRow.enrollment || !tokenRow.enrollment.session) {
    return new NextResponse("Lien invalide ou expiré.", { status: 404 });
  }

  const enrollmentId = tokenRow.enrollment.id;
  const sessionId = tokenRow.enrollment.session_id;
  const orgId = tokenRow.enrollment.session.organization_id;
  const formationTitle =
    tokenRow.enrollment.session.formation?.title ?? "Formation";
  const docTitle = `Convocation — ${formationTitle}`;

  // Récupère l'organisation pour construire le footer Puppeteer + bandeau.
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, logo_url, siret, nda, address, postal_code, city, email, phone, legal_mentions, commercial_banner_path",
    )
    .eq("id", orgId)
    .maybeSingle<{
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
    }>();

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

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  // On appelle la page print avec ?token=XXX pour bypasser l'auth.
  const printUrl = `${origin}/sessions/${sessionId}/convocations/${enrollmentId}/print?token=${encodeURIComponent(token)}`;

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf({
      url: printUrl,
      // Pas de cookies — la page print authentifie via le token query
      // param, pas via session utilisateur.
      cookies: [],
      headerTemplate: templates?.headerTemplate,
      footerTemplate: templates?.footerTemplate,
      margin: { top: "18mm", bottom: "25mm", left: "0mm", right: "0mm" },
    });
  } catch (e) {
    console.error("[public convocation pdf] generation failed", e);
    return new NextResponse(
      `Génération PDF échouée : ${(e as Error).message}`,
      { status: 500 },
    );
  }

  // Bandeau commercial sur la page 1 (overlay pdf-lib)
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
        "[public convocation pdf] overlay bandeau échoué :",
        (e as Error).message,
      );
    }
  }

  const learner = tokenRow.enrollment.learner;
  const fullName = learner
    ? `${learner.last_name ?? ""}-${learner.first_name ?? ""}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/--+/g, "-")
    : enrollmentId.slice(0, 8);
  const fileName = `convocation-${fullName}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
