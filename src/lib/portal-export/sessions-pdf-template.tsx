/**
 * Template PDF generique « liste de sessions » pour le portail partenaire
 * (Gilles 2026-06-23). Reutilise par le Catalogue et les Archives pour
 * imprimer la liste FILTREE telle qu affichee a l ecran.
 *
 * Contenu :
 *   - En-tete : logo organisation (CAP) a gauche + titre + sous-titre a droite
 *   - Ligne meta : partenaire + filtre applique + horodatage (date/heure)
 *   - Tableau a colonnes dynamiques (definies par l appelant)
 *   - Pied de page : nom organisation + rappel horodatage
 *
 * Les colonnes et les lignes (deja formatees en texte) sont fournies par le
 * client : ce template ne fait que la mise en page, aucun acces aux donnees.
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
    padding: 28,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1f2937",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#0e7490",
    paddingBottom: 8,
  },
  logo: {
    maxWidth: 130,
    maxHeight: 56,
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
    fontSize: 10,
    color: "#475569",
  },
  metaBlock: {
    marginBottom: 10,
  },
  metaLine: {
    fontSize: 8,
    color: "#475569",
    marginBottom: 1,
  },
  metaLabel: {
    fontWeight: "bold",
    color: "#1f2937",
  },
  table: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  rowHead: {
    flexDirection: "row",
    backgroundColor: "#0e7490",
  },
  row: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  rowAlt: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  th: {
    flexBasis: 0,
    padding: 4,
    fontSize: 8,
    color: "#ffffff",
    fontWeight: "bold",
  },
  td: {
    flexBasis: 0,
    padding: 4,
    fontSize: 8,
    color: "#1f2937",
  },
  footerBlock: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: "#64748b",
    fontStyle: "italic",
  },
  countLine: {
    fontSize: 8,
    color: "#0e7490",
    fontWeight: "bold",
    marginBottom: 6,
  },
});

export type SessionsListPdfColumn = {
  header: string;
  /** Poids relatif de la colonne (largeur). Defaut 1. */
  width?: number;
};

export type SessionsListPdfData = {
  title: string;
  subtitle: string | null;
  partnerName: string | null;
  orgName: string;
  orgLogoUrl: string | null;
  /** Libelle du filtre applique (ex: « Recherche : excel » ou « Tout »). */
  filterLabel: string;
  /** Horodatage deja formate (date + heure, fuseau France). */
  generatedAt: string;
  columns: SessionsListPdfColumn[];
  rows: string[][];
};

export function SessionsListPdf({ data }: { data: SessionsListPdfData }) {
  const cols = data.columns.length > 0 ? data.columns : [{ header: "—" }];
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        {/* En-tete : logo CAP + titre */}
        <View style={styles.header} fixed>
          {data.orgLogoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.orgLogoUrl} style={styles.logo} />
          ) : (
            <Text style={{ fontSize: 12, fontWeight: "bold", color: "#0e7490" }}>
              {data.orgName}
            </Text>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.titleMain}>{data.title}</Text>
            {data.subtitle && <Text style={styles.titleSub}>{data.subtitle}</Text>}
          </View>
        </View>

        {/* Ligne meta : partenaire + filtre + horodatage */}
        <View style={styles.metaBlock}>
          {data.partnerName && (
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Espace partenaire : </Text>
              {data.partnerName}
            </Text>
          )}
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Filtre appliqué : </Text>
            {data.filterLabel}
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Édité le : </Text>
            {data.generatedAt}
          </Text>
        </View>

        <Text style={styles.countLine}>
          {data.rows.length} ligne{data.rows.length > 1 ? "s" : ""}
        </Text>

        {/* Tableau */}
        <View style={styles.table}>
          <View style={styles.rowHead} fixed>
            {cols.map((c, i) => (
              <Text
                key={i}
                style={[styles.th, { flexGrow: c.width ?? 1 }]}
              >
                {c.header}
              </Text>
            ))}
          </View>
          {data.rows.map((r, ri) => (
            <View
              key={ri}
              style={ri % 2 === 0 ? styles.row : styles.rowAlt}
              wrap={false}
            >
              {cols.map((c, ci) => (
                <Text
                  key={ci}
                  style={[styles.td, { flexGrow: c.width ?? 1 }]}
                >
                  {r[ci] ?? ""}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {/* Pied de page */}
        <View style={styles.footerBlock}>
          <Text style={styles.footerText}>
            {data.orgName} — Document édité le {data.generatedAt}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
