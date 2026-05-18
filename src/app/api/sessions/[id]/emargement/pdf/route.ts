import { NextResponse, type NextRequest } from "next/server";
import { renderPdf } from "@/lib/pdf/render";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Génère le PDF de la feuille d'émargement d'une session.
 *
 * Reprend la page /sessions/[id]/emargement/print (authentifiée) — on
 * propage les cookies de session pour que Puppeteer la charge correctement.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Authentification requise", { status: 401 });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const printUrl = `${origin}/sessions/${id}/emargement/print`;

  const cookies = request.cookies
    .getAll()
    .map((c) => ({ name: c.name, value: c.value }));

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf({ url: printUrl, cookies });
  } catch (e) {
    console.error("[emargement-pdf] generation failed", e);
    return new NextResponse(
      `Génération PDF échouée : ${(e as Error).message}`,
      { status: 500 },
    );
  }

  const inline = request.nextUrl.searchParams.get("download") !== "1";
  const fileName = `feuille-emargement-${id.slice(0, 8)}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
