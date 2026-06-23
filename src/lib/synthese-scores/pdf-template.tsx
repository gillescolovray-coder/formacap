/**
 * Template PDF synthese des resultats quiz pre/post (Gilles 2026-06-01).
 *
 * Utilise @react-pdf/renderer pour generer un PDF cote serveur,
 * compatible Vercel. Remplace le CSV scores telecharge depuis le
 * portail OF / Archives.
 *
 * Contenu :
 *   - En-tete : logo orga + titre + nom formation + dates + modalite
 *   - Bloc statistiques globales : nb apprenants, moyennes, progression
 *   - Tableau detaille : Nom, Prenom, Email, Pre %, Post %, Progression
 *   - Pied de page : cachet OF + mentions legales
 */
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1f2937",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#0e7490",
    paddingBottom: 8,
  },
  logo: {
    maxWidth: 130,
    maxHeight: 60,
    objectFit: "contain",
  },
  headerInfo: {
    flex: 1,
    textAlign: "right",
  },
  titleMain: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0e7490",
    marginBottom: 2,
  },
  titleSub: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0e7490",
    marginBottom: 4,
  },
  metaLine: {
    fontSize: 9,
    color: "#1f2937",
    marginBottom: 2,
  },
  metaLabel: {
    fontWeight: "bold",
  },
  // Bloc stats
  statsBlock: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    padding: 8,
    backgroundColor: "#f8fafc",
  },
  statLabel: {
    fontSize: 7,
    color: "#64748b",
    textTransform: "uppercase",
    fontWeight: "bold",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0f172a",
  },
  statValueGreen: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#059669",
  },
  statValuePurple: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#7c3aed",
  },
  // Tableau
  table: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginBottom: 12,
  },
  tableRowHead: {
    flexDirection: "row",
    backgroundColor: "#0e7490",
  },
  tableRow: {
    flexDirection: "row",
    minHeight: 22,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  tableRowAlt: {
    flexDirection: "row",
    minHeight: 22,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  thNum: {
    width: 24,
    padding: 4,
    fontSize: 8,
    color: "#ffffff",
    fontWeight: "bold",
    textAlign: "center",
  },
  thName: {
    flex: 2.5,
    padding: 4,
    fontSize: 8,
    color: "#ffffff",
    fontWeight: "bold",
    borderLeftWidth: 1,
    borderLeftColor: "#0891b2",
  },
  thEmail: {
    flex: 2.5,
    padding: 4,
    fontSize: 8,
    color: "#ffffff",
    fontWeight: "bold",
    borderLeftWidth: 1,
    borderLeftColor: "#0891b2",
  },
  thScore: {
    width: 48,
    padding: 4,
    fontSize: 8,
    color: "#ffffff",
    fontWeight: "bold",
    textAlign: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#0891b2",
  },
  thProg: {
    width: 56,
    padding: 4,
    fontSize: 8,
    color: "#ffffff",
    fontWeight: "bold",
    textAlign: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#0891b2",
  },
  tdNum: {
    width: 24,
    padding: 4,
    fontSize: 8,
    textAlign: "center",
    color: "#64748b",
  },
  tdName: {
    flex: 2.5,
    padding: 4,
    fontSize: 9,
    fontWeight: "bold",
    color: "#0f172a",
  },
  tdEmail: {
    flex: 2.5,
    padding: 4,
    fontSize: 8,
    color: "#475569",
  },
  tdScorePre: {
    width: 48,
    padding: 4,
    fontSize: 9,
    textAlign: "center",
    color: "#7c3aed",
    fontWeight: "bold",
  },
  tdScorePost: {
    width: 48,
    padding: 4,
    fontSize: 9,
    textAlign: "center",
    color: "#059669",
    fontWeight: "bold",
  },
  tdProgPos: {
    width: 56,
    padding: 4,
    fontSize: 9,
    textAlign: "center",
    color: "#059669",
    fontWeight: "bold",
  },
  tdProgNeg: {
    width: 56,
    padding: 4,
    fontSize: 9,
    textAlign: "center",
    color: "#dc2626",
    fontWeight: "bold",
  },
  tdProgZero: {
    width: 56,
    padding: 4,
    fontSize: 9,
    textAlign: "center",
    color: "#64748b",
    fontWeight: "bold",
  },
  tdEmpty: {
    color: "#94a3b8",
    fontStyle: "italic",
  },
  // Bas de page
  footerBlock: {
    marginTop: "auto",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    paddingTop: 8,
  },
  legalText: {
    flex: 1,
    fontSize: 7,
    color: "#64748b",
    lineHeight: 1.3,
    fontStyle: "italic",
  },
  stampWrap: {
    alignItems: "flex-end",
  },
  stampLabel: {
    fontSize: 7,
    color: "#64748b",
    marginBottom: 2,
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  stampImage: {
    width: 130,
    height: 60,
    objectFit: "contain",
  },
});

export type SyntheseScoresPdfRow = {
  fullName: string;
  /** Entreprise de l apprenant (remplace l email — Gilles 2026-06-23). */
  companyName: string | null;
  prePct: number | null;
  postPct: number | null;
  progression: number | null;
};

export type SyntheseScoresPdfData = {
  formationTitle: string;
  startDate: string | null;
  endDate: string | null;
  modalityLabel: string | null;
  isInter: boolean | null;
  locationLabel: string | null;
  orgName: string;
  orgLogoUrl: string | null;
  orgStampUrl: string | null;
  orgLegalText: string | null;
  partnerName: string | null;
  rows: SyntheseScoresPdfRow[];
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function average(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((s, v) => s + v, 0) / nums.length);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Met en gras, dans la ligne de mentions legales du pied de page, les 3
 * informations cles reprises du cachet (Gilles 2026-06-23) :
 *   1. le nom de l organisation (ex: CAP NUMERIQUE)
 *   2. le N° de declaration d activite
 *   3. le N° de TVA intracommunautaire
 * Le telephone (« Mobile : … ») et l email ne sont volontairement pas cibles.
 */
function buildLegalNodes(text: string, orgName: string): React.ReactNode[] {
  const ranges: Array<[number, number]> = [];
  const add = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      ranges.push([m.index, m.index + m[0].length]);
    }
  };

  const trimmed = orgName.trim();
  if (trimmed) add(new RegExp(escapeRegExp(trimmed), "gi"));
  // N° de declaration d activite : <numero> (chiffres + espaces)
  add(/(?<=d[ée]claration\s+d['’\s]activit[ée]\s*:?\s*)\d[\d ]{6,}\d/giu);
  // N° TVA : FR + 11 chiffres (avec espaces eventuels)
  add(/FR\s?\d[\d ]{6,}\d/gi);

  if (ranges.length === 0) return [text];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([s, e], i) => {
    if (s > cursor) nodes.push(text.slice(cursor, s));
    nodes.push(
      <Text key={`b${i}`} style={{ fontWeight: "bold" }}>
        {text.slice(s, e)}
      </Text>,
    );
    cursor = e;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function SyntheseScoresPdf({ data }: { data: SyntheseScoresPdfData }) {
  const dateRange =
    data.endDate && data.endDate !== data.startDate
      ? `${formatDate(data.startDate)} au ${formatDate(data.endDate)}`
      : formatDate(data.startDate);
  const modalityFull = [
    data.modalityLabel,
    data.isInter === null ? null : data.isInter ? "INTER" : "INTRA",
  ]
    .filter(Boolean)
    .join(" · ");
  const avgPre = average(data.rows.map((r) => r.prePct));
  const avgPost = average(data.rows.map((r) => r.postPct));
  const avgProg = average(data.rows.map((r) => r.progression));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tete */}
        <View style={styles.header}>
          {data.orgLogoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.orgLogoUrl} style={styles.logo} />
          ) : (
            <View />
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.titleMain}>Synthèse des résultats</Text>
            <Text style={styles.titleSub}>{data.formationTitle}</Text>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Dates : </Text>
              {dateRange}
            </Text>
            {modalityFull && (
              <Text style={styles.metaLine}>
                <Text style={styles.metaLabel}>Modalité : </Text>
                {modalityFull}
              </Text>
            )}
            {data.locationLabel && (
              <Text style={styles.metaLine}>
                <Text style={styles.metaLabel}>Lieu : </Text>
                {data.locationLabel}
              </Text>
            )}
            {data.partnerName && (
              <Text style={styles.metaLine}>
                <Text style={styles.metaLabel}>Pour : </Text>
                {data.partnerName}
              </Text>
            )}
          </View>
        </View>

        {/* Bloc stats globales */}
        <View style={styles.statsBlock}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Apprenants</Text>
            <Text style={styles.statValue}>{data.rows.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Moyenne pré</Text>
            <Text style={styles.statValuePurple}>
              {avgPre !== null ? `${avgPre} %` : "—"}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Moyenne post</Text>
            <Text style={styles.statValueGreen}>
              {avgPost !== null ? `${avgPost} %` : "—"}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Progression moyenne</Text>
            <Text style={styles.statValueGreen}>
              {avgProg !== null
                ? `${avgProg > 0 ? "+" : ""}${avgProg} %`
                : "—"}
            </Text>
          </View>
        </View>

        {/* Tableau detaille */}
        <View style={styles.table}>
          <View style={styles.tableRowHead}>
            <Text style={styles.thNum}>#</Text>
            <Text style={styles.thName}>Apprenant</Text>
            <Text style={styles.thEmail}>Entreprise</Text>
            <Text style={styles.thScore}>Pré %</Text>
            <Text style={styles.thScore}>Post %</Text>
            <Text style={styles.thProg}>Progression</Text>
          </View>
          {data.rows.map((r, i) => (
            <View
              key={i}
              style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
            >
              <Text style={styles.tdNum}>{i + 1}</Text>
              <Text style={styles.tdName}>{r.fullName}</Text>
              <Text style={styles.tdEmail}>{r.companyName ?? "—"}</Text>
              <Text style={styles.tdScorePre}>
                {r.prePct !== null ? `${r.prePct} %` : "—"}
              </Text>
              <Text style={styles.tdScorePost}>
                {r.postPct !== null ? `${r.postPct} %` : "—"}
              </Text>
              <Text
                style={
                  r.progression === null
                    ? styles.tdProgZero
                    : r.progression > 0
                      ? styles.tdProgPos
                      : r.progression < 0
                        ? styles.tdProgNeg
                        : styles.tdProgZero
                }
              >
                {r.progression !== null
                  ? `${r.progression > 0 ? "+" : ""}${r.progression} %`
                  : "—"}
              </Text>
            </View>
          ))}
        </View>

        {/* Pied de page : mentions legales + cachet OF */}
        <View style={styles.footerBlock}>
          <Text style={styles.legalText}>
            {data.orgLegalText
              ? buildLegalNodes(data.orgLegalText, data.orgName)
              : data.orgName}{" "}
            — Document de synthèse édité le{" "}
            {new Date().toLocaleDateString("fr-FR")}
          </Text>
          {data.orgStampUrl && (
            <View style={styles.stampWrap}>
              <Text style={styles.stampLabel}>Cachet & signature OF</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={data.orgStampUrl} style={styles.stampImage} />
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
