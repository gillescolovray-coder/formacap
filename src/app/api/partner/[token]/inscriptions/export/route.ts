import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { resolvePartnerContext } from "@/app/partenaire/[token]/_resolve";

export const dynamic = "force-dynamic";

type ExportRow = {
  received_at?: string | null;
  learnerName?: string | null;
  learnerEmail?: string | null;
  learnerPhone?: string | null;
  companyName?: string | null;
  companyCity?: string | null;
  formationTitle?: string | null;
  sessionRef?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  sessionStatus?: string | null;
  conventionStatus?: string | null;
  convocationSentAt?: string | null;
  isConfirmed?: boolean | null;
};

const SESSION_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  planned: "Planifiée",
  confirmed: "Confirmée",
  in_progress: "En cours",
  completed: "Terminée",
  postponed: "Reportée",
  cancelled: "Annulée",
};

function frDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // Validation : seul un partenaire authentifié par token peut exporter.
  const ctx = await resolvePartnerContext(token);
  if (!ctx) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  let body: { rows?: ExportRow[]; periodLabel?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const rows = Array.isArray(body.rows) ? body.rows : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = ctx.organization?.name ?? "CAP NUMERIQUE";
  const ws = wb.addWorksheet("Mes inscriptions");

  // Bandeau titre + période
  ws.mergeCells("A1:K1");
  ws.getCell("A1").value = `Mes inscriptions — ${ctx.company.name ?? ""}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:K2");
  ws.getCell("A2").value = body.periodLabel ?? "Toutes les dates";
  ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF666666" } };
  ws.addRow([]);

  const headerRow = ws.addRow([
    "Date inscription",
    "Apprenant",
    "Email",
    "Téléphone",
    "Entreprise",
    "Ville",
    "Formation",
    "Réf",
    "Date session",
    "Statut session",
    "Convention",
  ]);
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
    { width: 16 },
    { width: 26 },
    { width: 28 },
    { width: 16 },
    { width: 26 },
    { width: 16 },
    { width: 40 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];

  for (const r of rows) {
    ws.addRow([
      frDate(r.received_at),
      r.learnerName ?? "",
      r.learnerEmail ?? "",
      r.learnerPhone ?? "",
      r.companyName ?? "",
      r.companyCity ?? "",
      r.formationTitle ?? "",
      r.sessionRef ?? "",
      frDate(r.startDate),
      r.sessionStatus
        ? SESSION_STATUS_LABELS[r.sessionStatus] ?? r.sessionStatus
        : "",
      r.conventionStatus ?? "",
    ]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inscriptions.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
