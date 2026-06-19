import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Export Excel du tableau « Apprenants inscrits par session » du tableau de
 * bord (Gilles 2026-06-19). Les lignes filtrées (période choisie) sont
 * envoyées par le client ; on génère un .xlsx mis en forme avec FILTRES
 * automatiques sur chaque colonne, ligne de totaux et DATE D'ÉDITION.
 */
type ExportRow = {
  dateSession?: string | null;
  formation?: string | null;
  apprenant?: string | null;
  entreprise?: string | null;
  source?: string | null;
  heures?: number | null;
  mode?: string | null;
  montantHt?: number | null;
};
type Totals = {
  directHt?: number;
  ofHt?: number;
  totalHt?: number;
  nbApprenants?: number;
  totalHours?: number;
};

function frDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : "";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: { rows?: ExportRow[]; periodLabel?: string; totals?: Totals } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const totals = body.totals ?? {};

  const wb = new ExcelJS.Workbook();
  wb.creator = "FORMACAP — CAP NUMERIQUE";
  const ws = wb.addWorksheet("Inscriptions");

  // Bandeau titre + période + date d'édition.
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = "Apprenants inscrits par session";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = body.periodLabel ?? "Toutes les dates";
  ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF666666" } };
  const editedAt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
  ws.mergeCells("A3:H3");
  ws.getCell("A3").value = `Édité le ${editedAt}`;
  ws.getCell("A3").font = { italic: true, size: 9, color: { argb: "FF999999" } };
  ws.addRow([]);

  const HEADERS = [
    "Date session",
    "Formation",
    "Apprenant",
    "Entreprise",
    "Source",
    "Heures",
    "Mode",
    "Montant HT (€)",
  ];
  const headerRow = ws.addRow(HEADERS);
  const headerRowNumber = headerRow.number;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((c) => {
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF13367F" },
    };
    c.alignment = { vertical: "middle" };
  });

  ws.columns = [
    { width: 14 },
    { width: 44 },
    { width: 26 },
    { width: 26 },
    { width: 26 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
  ];

  for (const r of rows) {
    const row = ws.addRow([
      frDate(r.dateSession),
      r.formation ?? "",
      r.apprenant ?? "",
      r.entreprise ?? "",
      r.source ?? "",
      r.heures ?? null,
      r.mode ?? "",
      r.montantHt ?? null,
    ]);
    row.getCell(8).numFmt = "#,##0.00";
  }

  // Filtres automatiques sur chaque colonne (sur la ligne d'en-tête).
  ws.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: HEADERS.length },
  };

  // Bloc de totaux de la période.
  ws.addRow([]);
  const tRows: Array<[string, string | number]> = [
    ["Nombre d'apprenants", totals.nbApprenants ?? 0],
    ["Total heures", totals.totalHours ?? 0],
    ["Total HT direct (CAP + prescripteur) €", totals.directHt ?? 0],
    ["Sous-total HT OF (sous-traitance) €", totals.ofHt ?? 0],
    ["Total HT général €", totals.totalHt ?? 0],
  ];
  for (const [label, val] of tRows) {
    const r = ws.addRow([label, val]);
    r.getCell(1).font = { bold: true };
    if (typeof val === "number" && /€/.test(label)) {
      r.getCell(2).numFmt = "#,##0.00";
    }
    r.getCell(2).font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inscriptions-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
