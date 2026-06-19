"use client";

import { useEffect, useState } from "react";

/**
 * Page imprimable (→ PDF) de l'export « Apprenants inscrits par session »
 * (Gilles 2026-06-19). Les données filtrées sont déposées dans sessionStorage
 * par le tableau de bord, lues ici, puis l'impression est proposée
 * automatiquement (Ctrl+P → Enregistrer en PDF). L'URL contient « /print »
 * donc la coquille admin (sidebar/menu) est retirée.
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
type Payload = {
  rows: ExportRow[];
  periodLabel: string;
  totals: {
    directHt?: number;
    ofHt?: number;
    totalHt?: number;
    nbApprenants?: number;
    totalHours?: number;
  };
};

const STORAGE_KEY = "dashboard-inscriptions-export";

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

function frDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : "";
}

export default function InscriptionsPrintPage() {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setData(JSON.parse(raw) as Payload);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [data]);

  const editedAt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  if (!data) {
    return (
      <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
        <p>Préparation du document…</p>
        <p style={{ fontSize: 12, color: "#666" }}>
          Si rien ne s&apos;affiche, relancez l&apos;export depuis le tableau de
          bord.
        </p>
      </div>
    );
  }

  const { rows, periodLabel, totals } = data;

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif", color: "#111" }}>
      <style>{`
        @media print { .no-print { display: none !important; } }
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th, td { border: 1px solid #d4d4d8; padding: 4px 6px; text-align: left; }
        th { background: #13367f; color: #fff; }
        tr:nth-child(even) td { background: #f8fafc; }
        .num { text-align: right; white-space: nowrap; }
      `}</style>

      <div className="no-print" style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            background: "#0891b2",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          🖨 Imprimer / Enregistrer en PDF
        </button>
      </div>

      <h1 style={{ fontSize: 18, margin: "0 0 2px" }}>
        Apprenants inscrits par session
      </h1>
      <p style={{ margin: "0 0 2px", color: "#555" }}>{periodLabel}</p>
      <p style={{ margin: "0 0 12px", fontSize: 11, color: "#999" }}>
        Édité le {editedAt} — CAP NUMÉRIQUE / FORMACAP
      </p>

      <table>
        <thead>
          <tr>
            <th>Date session</th>
            <th>Formation</th>
            <th>Apprenant</th>
            <th>Entreprise</th>
            <th>Source</th>
            <th className="num">Heures</th>
            <th>Mode</th>
            <th className="num">Montant HT</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", color: "#888" }}>
                Aucune inscription pour {periodLabel}.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <td>{frDate(r.dateSession)}</td>
                <td>{r.formation ?? ""}</td>
                <td>{r.apprenant ?? ""}</td>
                <td>{r.entreprise ?? ""}</td>
                <td>{r.source ?? ""}</td>
                <td className="num">
                  {r.heures != null ? `${r.heures} h` : ""}
                </td>
                <td>{r.mode ?? ""}</td>
                <td className="num">
                  {r.montantHt != null ? eur.format(r.montantHt) : ""}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Totaux */}
      <table style={{ marginTop: 16, width: "auto" }}>
        <tbody>
          <tr>
            <td style={{ fontWeight: 700 }}>Nombre d&apos;apprenants</td>
            <td className="num">{totals.nbApprenants ?? 0}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700 }}>Total heures</td>
            <td className="num">{totals.totalHours ?? 0} h</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700 }}>
              Total HT direct (CAP + prescripteur)
            </td>
            <td className="num">{eur.format(totals.directHt ?? 0)}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700 }}>Sous-total HT OF (sous-traitance)</td>
            <td className="num">{eur.format(totals.ofHt ?? 0)}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 700 }}>Total HT général</td>
            <td className="num" style={{ fontWeight: 700 }}>
              {eur.format(totals.totalHt ?? 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
