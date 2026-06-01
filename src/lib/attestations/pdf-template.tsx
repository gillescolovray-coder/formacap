/**
 * Template PDF attestation de realisation individuelle
 * (Gilles 2026-06-01).
 *
 * Utilise @react-pdf/renderer pour generer un vrai PDF cote serveur
 * compatible Vercel. Reproduit le rendu HTML print existant :
 *   - En-tete : logo + date d edition
 *   - Titre "Attestation de realisation"
 *   - Corps : nom apprenant + dates + duree + assiduite
 *   - Signature + cachet OF en bas a droite
 *   - Pied de page : mentions legales
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
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#1f2937",
    lineHeight: 1.5,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 12,
    marginBottom: 32,
  },
  logo: { maxWidth: 180, maxHeight: 70, objectFit: "contain" },
  headerInfo: { textAlign: "right" },
  editedAt: { fontSize: 9, color: "#64748b" },
  // Titre
  titleBlock: { textAlign: "center", marginBottom: 32 },
  titleH1: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1e3a8a",
    marginBottom: 4,
  },
  titleSubtitle: { fontSize: 10, color: "#64748b", fontStyle: "italic" },
  // Corps
  bodyBlock: { marginBottom: 24 },
  paragraph: { marginBottom: 12, fontSize: 11 },
  bold: { fontWeight: "bold" },
  learnerBox: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
  },
  learnerName: { fontSize: 13, fontWeight: "bold", color: "#0f172a" },
  learnerDetail: { fontSize: 9, color: "#475569", marginTop: 2 },
  formationTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e3a8a",
    marginLeft: 16,
    marginVertical: 10,
  },
  hoursBox: {
    borderWidth: 1,
    borderColor: "#fbbf24",
    backgroundColor: "#fef3c7",
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  hoursLabel: { fontSize: 10, color: "#475569" },
  hoursValue: { fontSize: 13, fontWeight: "bold" },
  hoursValueAccent: { fontSize: 13, fontWeight: "bold", color: "#059669" },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderTopWidth: 1,
    borderTopColor: "#fbbf24",
    paddingTop: 6,
    marginTop: 4,
  },
  rateLabel: { fontSize: 9, color: "#64748b" },
  rateValue: { fontSize: 11, fontWeight: "bold", color: "#334155" },
  // Signature
  signatureSection: {
    marginTop: 40,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  signatureBlock: {
    width: 280,
    alignItems: "flex-end",
  },
  signatureMeta: { fontSize: 10, marginBottom: 6, textAlign: "right" },
  signatureBorder: {
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
    width: "100%",
    alignItems: "flex-end",
  },
  stampImage: {
    maxWidth: 220,
    maxHeight: 100,
    objectFit: "contain",
  },
  signaturePlaceholder: {
    fontSize: 9,
    color: "#9ca3af",
    fontStyle: "italic",
    minHeight: 60,
    paddingTop: 8,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 25,
    left: 40,
    right: 40,
    fontSize: 7.5,
    color: "#64748b",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    paddingTop: 6,
    lineHeight: 1.3,
  },
});

export type AttestationPdfData = {
  orgName: string;
  orgLogoUrl: string | null;
  orgStampUrl: string | null;
  orgLegalText: string | null;
  /** Nom du representant legal (ex: "Gilles COLOVRAY"). */
  orgLegalRepName: string | null;
  /** Fonction (ex: "Gerant"). */
  orgLegalRepRole: string | null;
  formationTitle: string;
  startDateLabel: string; // "26/05/2026"
  endDateLabel: string;
  modalityLabel: string | null; // "Présentiel" / "Distanciel" / "Hybride"
  trainerName: string | null;
  totalPlannedHoursLabel: string; // "7 heures"
  actualHoursLabel: string;
  attendanceRatePct: number | null; // 0-100 ou null
  todayLabel: string; // "1 juin 2026"
  learner: {
    civility: string | null; // "M." / "Mme" / null
    fullName: string;
    birthDateLabel: string | null;
    birthPlace: string | null;
    companyName: string | null;
  };
};

export function AttestationPdf({ data }: { data: AttestationPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {data.orgLogoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.orgLogoUrl} style={styles.logo} />
          ) : (
            <Text style={{ fontSize: 12, fontWeight: "bold" }}>
              {data.orgName}
            </Text>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.editedAt}>Édité le {data.todayLabel}</Text>
          </View>
        </View>

        {/* Titre */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleH1}>Attestation de réalisation</Text>
          <Text style={styles.titleSubtitle}>
            Article L.6353-1 du Code du travail
          </Text>
        </View>

        {/* Corps */}
        <View style={styles.bodyBlock}>
          <Text style={styles.paragraph}>
            Je soussigné(e)
            {data.orgLegalRepName ? (
              <>
                , <Text style={styles.bold}>{data.orgLegalRepName}</Text>
              </>
            ) : null}
            ,{" "}
            {data.orgLegalRepRole
              ? `${data.orgLegalRepRole.toLowerCase()} de `
              : "représentant légal de "}
            <Text style={styles.bold}>{data.orgName}</Text>, organisme de
            formation enregistré, atteste que :
          </Text>

          <View style={styles.learnerBox}>
            <Text style={styles.learnerName}>
              {[data.learner.civility, data.learner.fullName]
                .filter(Boolean)
                .join(" ")}
            </Text>
            {data.learner.birthDateLabel && (
              <Text style={styles.learnerDetail}>
                Né(e) le {data.learner.birthDateLabel}
                {data.learner.birthPlace
                  ? ` à ${data.learner.birthPlace}`
                  : ""}
              </Text>
            )}
            {data.learner.companyName && (
              <Text style={styles.learnerDetail}>
                Employeur : {data.learner.companyName}
              </Text>
            )}
          </View>

          <Text style={styles.paragraph}>
            a suivi l&apos;action de formation intitulée :
          </Text>

          <Text style={styles.formationTitle}>
            « {data.formationTitle} »
          </Text>

          <Text style={styles.paragraph}>
            qui s&apos;est déroulée du{" "}
            <Text style={styles.bold}>{data.startDateLabel}</Text> au{" "}
            <Text style={styles.bold}>{data.endDateLabel}</Text>
            {data.modalityLabel
              ? ` en ${data.modalityLabel.toLowerCase()}`
              : ""}
            {data.trainerName
              ? `, sous la responsabilité de ${data.trainerName}`
              : ""}
            .
          </Text>

          <View style={styles.hoursBox}>
            <View style={styles.hoursRow}>
              <Text style={styles.hoursLabel}>Durée totale prévue :</Text>
              <Text style={styles.hoursValue}>
                {data.totalPlannedHoursLabel}
              </Text>
            </View>
            <View style={styles.hoursRow}>
              <Text style={styles.hoursLabel}>
                Durée réellement suivie par l&apos;apprenant :
              </Text>
              <Text style={styles.hoursValueAccent}>
                {data.actualHoursLabel}
              </Text>
            </View>
            {data.attendanceRatePct !== null && (
              <View style={styles.rateRow}>
                <Text style={styles.rateLabel}>Taux d&apos;assiduité :</Text>
                <Text style={styles.rateValue}>
                  {data.attendanceRatePct} %
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.paragraph}>
            La présente attestation est délivrée à l&apos;intéressé(e) pour
            servir et valoir ce que de droit.
          </Text>
        </View>

        {/* Signature + cachet OF en bas a droite */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureMeta}>
              Fait le {data.todayLabel}
              {"\n"}Pour <Text style={styles.bold}>{data.orgName}</Text>
            </Text>
            <View style={styles.signatureBorder}>
              {data.orgStampUrl ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={data.orgStampUrl} style={styles.stampImage} />
              ) : (
                <Text style={styles.signaturePlaceholder}>
                  Cachet et signature
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Footer mentions legales */}
        {data.orgLegalText && (
          <Text style={styles.footer} fixed>
            {data.orgLegalText}
          </Text>
        )}
      </Page>
    </Document>
  );
}
