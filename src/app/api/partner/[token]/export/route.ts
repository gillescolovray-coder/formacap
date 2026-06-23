/**
 * Route generique d export du portail partenaire (Gilles 2026-06-23).
 *
 * POST /api/partner/[token]/export
 * Body : { format: "pdf" | "xlsx", title, subtitle?, filterLabel,
 *          filenameBase, columns: [{header, width}], rows: string[][] }
 *
 * Genere soit un PDF (template generique « liste de sessions » avec logo
 * de l organisation + horodatage), soit un classeur Excel. Les lignes sont
 * fournies DEJA FILTREES par le client (catalogue / archives) : la route ne
 * fait que la mise en forme + la marque (logo + nom organisation).
 *
 * Securite : le token est revalide via resolvePartnerContext. Aucun tarif
 * n est ajoute cote serveur (cf. project_pending_of_tarif_unmask).
 */
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerContext } from "@/app/partenaire/[token]/_resolve";
import {
  SessionsListPdf,
  type SessionsListPdfData,
} from "@/lib/portal-export/sessions-pdf-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Column = { header?: string; width?: number };
type Body = {
  format?: "pdf" | "xlsx";
  title?: string;
  subtitle?: string | null;
  filterLabel?: string;
  filenameBase?: string;
  columns?: Column[];
  rows?: unknown[][];
};

function safeName(s: string): string {
  return (s || "export")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "export";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await resolvePartnerContext(token);
  if (!ctx) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const format = body.format === "pdf" ? "pdf" : "xlsx";
  const columns = (Array.isArray(body.columns) ? body.columns : [])
    .map((c) => ({ header: String(c?.header ?? ""), width: Number(c?.width) || 1 }));
  const rows = (Array.isArray(body.rows) ? body.rows : []).map((r) =>
    (Array.isArray(r) ? r : []).map((cell) =>
      cell === null || cell === undefined ? "" : String(cell),
    ),
  );
  const title = body.title?.trim() || "Export";
  const subtitle = body.subtitle?.trim() || null;
  const filterLabel = body.filterLabel?.trim() || "Tout";
  const filenameBase = safeName(body.filenameBase ?? title);

  // Branding organisation (logo CAP + nom).
  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url")
    .eq("id", ctx.company.organization_id)
    .maybeSingle();
  const orgName = (org as { name?: string } | null)?.name ?? "CAP NUMERIQUE";
  const orgLogoUrl =
    (org as { logo_url?: string | null } | null)?.logo_url ?? null;

  // Horodatage (date + heure, fuseau France).
  const generatedAt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());

  if (format === "pdf") {
    const data: SessionsListPdfData = {
      title,
      subtitle,
      partnerName: ctx.company.name,
      orgName,
      orgLogoUrl,
      filterLabel,
      generatedAt,
      columns,
      rows,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(SessionsListPdf as any, { data });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(element as any);
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // ── Excel ──────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = orgName;
  const ws = wb.addWorksheet("Export");
  const colCount = Math.max(columns.length, 1);

  // Bandeau titre + sous-titre + filtre + horodatage.
  ws.mergeCells(1, 1, 1, colCount);
  ws.getCell(1, 1).value = `${title} — ${ctx.company.name ?? ""}`.trim();
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, colCount);
  ws.getCell(2, 1).value = subtitle ?? "";
  ws.getCell(2, 1).font = { size: 10, color: { argb: "FF475569" } };
  ws.mergeCells(3, 1, 3, colCount);
  ws.getCell(3, 1).value = `Filtre : ${filterLabel}`;
  ws.getCell(3, 1).font = { italic: true, size: 10, color: { argb: "FF666666" } };
  ws.mergeCells(4, 1, 4, colCount);
  ws.getCell(4, 1).value = `Édité le ${generatedAt}`;
  ws.getCell(4, 1).font = { italic: true, size: 9, color: { argb: "FF999999" } };
  ws.addRow([]);

  const headerRow = ws.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((c) => {
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0E7490" },
    };
    c.alignment = { vertical: "middle" };
  });

  ws.columns.forEach((col, i) => {
    // Largeur Excel : on derive de la largeur relative (min 12).
    col.width = Math.max(12, (columns[i]?.width ?? 1) * 14);
  });

  for (const r of rows) {
    ws.addRow(columns.map((_, i) => r[i] ?? ""));
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
