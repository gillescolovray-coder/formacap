"use client";

import { useState } from "react";
import { FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import {
  triggerPartnerExport,
  type ExportPayload,
} from "@/lib/portal-export/trigger-export";

/**
 * Boutons « Imprimer (PDF) » + « Exporter (Excel) » partages par le
 * Catalogue et les Archives du portail partenaire (Gilles 2026-06-23).
 *
 * `buildPayload(format)` est appele au clic pour construire l export a
 * partir des lignes ACTUELLEMENT filtrees a l ecran.
 */
export function ExportButtons({
  token,
  buildPayload,
  disabled,
}: {
  token: string;
  buildPayload: (format: "pdf" | "xlsx") => Omit<ExportPayload, "format">;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<null | "pdf" | "xlsx">(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(format: "pdf" | "xlsx") {
    setBusy(format);
    setErr(null);
    try {
      await triggerPartnerExport(token, { ...buildPayload(format), format });
    } catch {
      setErr("Export impossible. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => run("pdf")}
        disabled={disabled || busy !== null}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-cyan-300 bg-white hover:bg-cyan-50 text-cyan-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        title="Imprimer la liste filtrée en PDF (horodaté, avec logo)"
      >
        {busy === "pdf" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        Imprimer (PDF)
      </button>
      <button
        type="button"
        onClick={() => run("xlsx")}
        disabled={disabled || busy !== null}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        title="Exporter la liste filtrée en Excel (horodaté)"
      >
        {busy === "xlsx" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-4 w-4" />
        )}
        Exporter (Excel)
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
