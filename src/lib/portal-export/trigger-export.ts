/**
 * Helper client : declenche un export (PDF ou Excel) du portail partenaire.
 * Envoie les lignes deja filtrees a la route serveur /api/partner/[token]/export
 * puis telecharge le fichier renvoye (Gilles 2026-06-23).
 *
 * A executer cote navigateur uniquement (utilise fetch + document).
 */
export type ExportColumn = {
  header: string;
  /** Poids relatif (PDF) + largeur indicative (Excel). Defaut 1. */
  width?: number;
};

/** Statut de mise en evidence d une ligne dans l export (couleur). */
export type ExportRowStyle = "confirmed" | "cancelled" | "postponed" | null;

export type ExportPayload = {
  format: "pdf" | "xlsx";
  title: string;
  subtitle?: string | null;
  filterLabel: string;
  filenameBase: string;
  columns: ExportColumn[];
  rows: string[][];
  /** Style de chaque ligne (meme ordre que `rows`). Optionnel. */
  rowStyles?: ExportRowStyle[];
};

export async function triggerPartnerExport(
  token: string,
  payload: ExportPayload,
): Promise<void> {
  const res = await fetch(`/api/partner/${token}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Export impossible");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${payload.filenameBase}.${payload.format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
