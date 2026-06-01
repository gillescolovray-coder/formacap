/**
 * Template PDF feuille d emargement individuelle (Gilles 2026-06-01).
 *
 * Utilise @react-pdf/renderer pour generer un vrai PDF cote serveur,
 * compatible Vercel (pas de dependance chromium).
 *
 * Genere une feuille A4 portrait par apprenant avec :
 *   - En-tete : logo organisation + titre formation + dates + lieu + formateur
 *   - Tableau : 1 ligne apprenant + colonnes Matin/AM par jour + signatures
 *   - Bloc legende
 *   - Bloc certification formateur
 *   - Signatures Formateur + Responsable OF (cachet)
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
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1f2937",
  },
  // En-tete
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e40af",
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
    color: "#1e40af",
    marginBottom: 2,
  },
  titleSession: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#1e40af",
    marginBottom: 6,
  },
  metaLine: {
    fontSize: 9,
    color: "#1f2937",
    marginBottom: 2,
  },
  metaLabel: {
    fontWeight: "bold",
  },
  // Intro
  intro: {
    fontSize: 9,
    color: "#4b5563",
    marginBottom: 8,
    fontStyle: "italic",
  },
  // Tableau
  table: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginBottom: 12,
  },
  tableRowHead: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
  },
  tableRowSubhead: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
  },
  tableRow: {
    flexDirection: "row",
    minHeight: 60,
  },
  tableRowTrainer: {
    flexDirection: "row",
    backgroundColor: "#faf5ff",
    minHeight: 60,
  },
  tableCellApprenant: {
    width: "20%",
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: "#cbd5e1",
    justifyContent: "center",
  },
  tableCellEntreprise: {
    width: "30%",
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: "#cbd5e1",
    justifyContent: "center",
  },
  tableCellSig: {
    flex: 1,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  tableCellSigLast: {
    flex: 1,
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  cellHeadText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
  },
  cellDate: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1e40af",
    textAlign: "center",
  },
  cellModality: {
    fontSize: 7,
    fontStyle: "italic",
    color: "#64748b",
    textAlign: "center",
    marginTop: 1,
  },
  cellMoment: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#475569",
    textAlign: "center",
  },
  cellTime: {
    fontSize: 7,
    color: "#64748b",
    textAlign: "center",
  },
  cellName: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1f2937",
  },
  cellCompany: {
    fontSize: 9,
    color: "#4b5563",
  },
  cellCompanySiret: {
    fontSize: 7,
    color: "#9ca3af",
  },
  signImage: {
    maxWidth: 55,
    maxHeight: 35,
    objectFit: "contain",
  },
  signPlaceholder: {
    fontSize: 8,
    color: "#cbd5e1",
    fontStyle: "italic",
  },
  // Legende
  legend: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 8,
    fontStyle: "italic",
  },
  // Certif
  certif: {
    fontSize: 8,
    color: "#374151",
    marginBottom: 8,
    lineHeight: 1.4,
  },
  certifBold: {
    fontWeight: "bold",
  },
  // Signatures bas
  signaturesRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 8,
    marginBottom: 12,
  },
  signatureBlock: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    paddingTop: 4,
  },
  signatureTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#374151",
    marginBottom: 2,
  },
  signatureName: {
    fontSize: 9,
    color: "#4b5563",
    marginBottom: 2,
  },
  signatureItalic: {
    fontSize: 8,
    color: "#9ca3af",
    fontStyle: "italic",
  },
  stampImage: {
    maxWidth: 130,
    maxHeight: 60,
    objectFit: "contain",
    marginTop: 2,
  },
  // Pied de page (mentions legales)
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    fontSize: 7,
    color: "#71717a",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    paddingTop: 4,
    lineHeight: 1.3,
  },
});

export type EmargementPdfData = {
  formationTitle: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string; // ISO YYYY-MM-DD
  durationHours: number | null;
  modalityLabel: string | null;
  locationLabel: string | null;
  trainerName: string | null;
  orgName: string;
  orgLogoUrl: string | null;
  orgStampUrl: string | null;
  orgLegalText: string | null;
  /** Apprenant (mode individuel — 1 par PDF) */
  learner: {
    lastName: string;
    firstName: string;
    companyName: string | null;
    companySiret: string | null;
    /** Signature base64 par cle "date|moment" (moment = "morning"|"afternoon") */
    signatures: Record<string, string>;
  };
  /** Signature formateur par cle "date|moment" */
  trainerSignatures: Record<string, string>;
  /** Liste des jours (date + horaires) */
  days: Array<{
    date: string; // ISO YYYY-MM-DD
    morningStart: string | null;
    morningEnd: string | null;
    afternoonStart: string | null;
    afternoonEnd: string | null;
  }>;
};

function formatFrDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(time: string | null): string {
  if (!time) return "—";
  const [h, m] = time.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return time;
  if (mm === 0) return `${hh}h`;
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  return `${formatTime(start)}–${formatTime(end)}`;
}

export function EmargementPdf({ data }: { data: EmargementPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tete */}
        <View style={styles.header}>
          {data.orgLogoUrl && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.orgLogoUrl} style={styles.logo} />
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.titleMain}>Feuille d&apos;émargement</Text>
            <Text style={styles.titleSession}>{data.formationTitle}</Text>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Dates : </Text>
              du {formatFrDate(data.startDate)} au {formatFrDate(data.endDate)}
            </Text>
            {data.durationHours !== null && (
              <Text style={styles.metaLine}>
                <Text style={styles.metaLabel}>Durée : </Text>
                {data.durationHours}h
              </Text>
            )}
            {data.locationLabel && (
              <Text style={styles.metaLine}>
                <Text style={styles.metaLabel}>Lieu : </Text>
                {data.locationLabel}
              </Text>
            )}
            {data.trainerName && (
              <Text style={styles.metaLine}>
                <Text style={styles.metaLabel}>Formateur : </Text>
                {data.trainerName}
              </Text>
            )}
          </View>
        </View>

        <Text style={styles.intro}>
          Cette feuille d&apos;émargement atteste de la présence de l&apos;apprenant
          à la session de formation. Il signe pour chaque demi-journée à
          laquelle il participe.
        </Text>

        {/* Tableau */}
        <View style={styles.table}>
          {/* Ligne 1 : APPRENANT | ENTREPRISE | dates */}
          <View style={styles.tableRowHead}>
            <View style={styles.tableCellApprenant}>
              <Text style={styles.cellHeadText}>Apprenant</Text>
            </View>
            <View style={styles.tableCellEntreprise}>
              <Text style={styles.cellHeadText}>Entreprise</Text>
            </View>
            {data.days.map((d) => (
              <View
                key={d.date}
                style={{
                  flex: 2,
                  padding: 5,
                  borderRightWidth: 1,
                  borderRightColor: "#cbd5e1",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={styles.cellDate}>{formatFrDate(d.date)}</Text>
                {data.modalityLabel && (
                  <Text style={styles.cellModality}>{data.modalityLabel}</Text>
                )}
              </View>
            ))}
          </View>
          {/* Ligne 2 : sous-headers Matin / A-M */}
          <View style={styles.tableRowSubhead}>
            <View style={styles.tableCellApprenant}>
              <Text> </Text>
            </View>
            <View style={styles.tableCellEntreprise}>
              <Text> </Text>
            </View>
            {data.days.flatMap((d) => [
              <View key={`${d.date}-m`} style={styles.tableCellSig}>
                <Text style={styles.cellMoment}>Matin</Text>
                <Text style={styles.cellTime}>
                  {formatRange(d.morningStart, d.morningEnd)}
                </Text>
              </View>,
              <View key={`${d.date}-a`} style={styles.tableCellSig}>
                <Text style={styles.cellMoment}>A-M</Text>
                <Text style={styles.cellTime}>
                  {formatRange(d.afternoonStart, d.afternoonEnd)}
                </Text>
              </View>,
            ])}
          </View>
          {/* Ligne apprenant */}
          <View style={styles.tableRow}>
            <View style={styles.tableCellApprenant}>
              <Text style={styles.cellName}>
                {data.learner.firstName} {data.learner.lastName.toUpperCase()}
              </Text>
            </View>
            <View style={styles.tableCellEntreprise}>
              {data.learner.companyName && (
                <Text style={styles.cellCompany}>
                  {data.learner.companyName}
                </Text>
              )}
              {data.learner.companySiret && (
                <Text style={styles.cellCompanySiret}>
                  SIRET : {data.learner.companySiret}
                </Text>
              )}
            </View>
            {data.days.flatMap((d) => {
              const morningKey = `${d.date}|morning`;
              const afternoonKey = `${d.date}|afternoon`;
              const morningSig = data.learner.signatures[morningKey];
              const afternoonSig = data.learner.signatures[afternoonKey];
              return [
                <View key={`${d.date}-sm`} style={styles.tableCellSig}>
                  {morningSig ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image src={morningSig} style={styles.signImage} />
                  ) : (
                    <Text style={styles.signPlaceholder}>—</Text>
                  )}
                </View>,
                <View key={`${d.date}-sa`} style={styles.tableCellSig}>
                  {afternoonSig ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image src={afternoonSig} style={styles.signImage} />
                  ) : (
                    <Text style={styles.signPlaceholder}>—</Text>
                  )}
                </View>,
              ];
            })}
          </View>
          {/* Ligne FORMATEUR */}
          <View style={styles.tableRowTrainer}>
            <View style={styles.tableCellApprenant}>
              <Text style={styles.cellHeadText}>Formateur</Text>
              <Text style={styles.cellCompany}>{data.trainerName ?? "—"}</Text>
            </View>
            <View style={styles.tableCellEntreprise}>
              <Text style={styles.cellCompany}>{data.orgName}</Text>
            </View>
            {data.days.flatMap((d) => {
              const morningKey = `${d.date}|morning`;
              const afternoonKey = `${d.date}|afternoon`;
              const morningSig = data.trainerSignatures[morningKey];
              const afternoonSig = data.trainerSignatures[afternoonKey];
              return [
                <View key={`${d.date}-tm`} style={styles.tableCellSig}>
                  {morningSig ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image src={morningSig} style={styles.signImage} />
                  ) : (
                    <Text style={styles.signPlaceholder}>—</Text>
                  )}
                </View>,
                <View key={`${d.date}-ta`} style={styles.tableCellSig}>
                  {afternoonSig ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image src={afternoonSig} style={styles.signImage} />
                  ) : (
                    <Text style={styles.signPlaceholder}>—</Text>
                  )}
                </View>,
              ];
            })}
          </View>
        </View>

        <Text style={styles.legend}>
          Légende : ✓ Présent · ✗ Absent · E Excusé · R En retard · — Non
          renseigné
        </Text>

        <Text style={styles.certif}>
          <Text style={styles.certifBold}>Le formateur</Text> certifie
          l&apos;exactitude des informations ci-dessus et atteste avoir
          dispensé l&apos;action de formation conformément aux conditions de
          réalisation prévues.
        </Text>

        {/* Signatures cote a cote */}
        <View style={styles.signaturesRow}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureTitle}>Formateur</Text>
            <Text style={styles.signatureName}>{data.trainerName ?? ""}</Text>
            <Text style={styles.signatureItalic}>
              {Object.keys(data.trainerSignatures).length > 0
                ? "Signature électronique recueillie ci-dessus."
                : "Signature et date :"}
            </Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureTitle}>
              Responsable de l&apos;organisme
            </Text>
            <Text style={styles.signatureName}>{data.orgName}</Text>
            {data.orgStampUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={data.orgStampUrl} style={styles.stampImage} />
            ) : (
              <Text style={styles.signatureItalic}>Signature et date :</Text>
            )}
          </View>
        </View>

        {/* Pied de page mentions legales */}
        {data.orgLegalText && (
          <Text style={styles.footer} fixed>
            {data.orgLegalText}
          </Text>
        )}
      </Page>
    </Document>
  );
}
