/**
 * Helpers haut-niveau pour creer / retrouver le dossier Drive d'une
 * session FORMACAP.
 *
 * Nommage Gilles 2026-05-28 :
 *   [YYYY-MM-DD - Nj] - [INTER ou INTRA] - [Prescripteur/OF/cap numerique] - [Nom session]
 *
 * Regles :
 *  - "cap numerique" si pas de prescripteur ni OF sous-traitant
 *  - "INTER multi-clients" pour les sessions INTER avec >1 entreprise
 *    cliente differente
 */
import { getDriveClient, getDriveRootFolderId } from "./client";

const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Construit le nom de dossier d'une session selon la convention de
 * nommage cap numerique. Voir tests dans /sessions/.../archive.
 */
export function buildSessionFolderName(input: {
  startDate: string;
  durationDays: number | null;
  isInter: boolean;
  prescriberName: string | null;
  subcontractorName: string | null;
  /** Pour les sessions INTER multi-clients : true. */
  hasMultipleClients: boolean;
  /** Pour les sessions INTRA : nom de l'entreprise cliente. */
  singleClientName: string | null;
  sessionTitle: string;
}): string {
  const date = input.startDate.slice(0, 10); // YYYY-MM-DD
  const days = input.durationDays ?? 1;
  const dayPart =
    days === Math.floor(days) ? `${days}j` : `${days.toFixed(1)}j`;

  const typeLabel = input.isInter ? "INTER" : "INTRA";

  // Determination du libelle "Prescripteur / OF / cap numerique"
  let prescriberLabel: string;
  if (input.subcontractorName?.trim()) {
    // Cap numerique sous-traite pour un OF -> on met le nom de l'OF
    prescriberLabel = input.subcontractorName.trim();
  } else if (input.prescriberName?.trim()) {
    // Prescripteur tiers
    prescriberLabel = input.prescriberName.trim();
  } else if (input.isInter && input.hasMultipleClients) {
    prescriberLabel = "INTER multi-clients";
  } else if (input.isInter) {
    prescriberLabel = input.singleClientName?.trim() || "cap numerique";
  } else {
    // INTRA : nom du client unique, sinon cap numerique
    prescriberLabel = input.singleClientName?.trim() || "cap numerique";
  }

  const cleanTitle = sanitizeForDriveName(input.sessionTitle);
  const cleanPrescriber = sanitizeForDriveName(prescriberLabel);

  return `[${date} - ${dayPart}] - [${typeLabel}] - [${cleanPrescriber}] - [${cleanTitle}]`;
}

/**
 * Drive autorise quasi tous les caracteres, mais on enleve les
 * caracteres qui font crasher l'API (/) ou compliquent la lisibilite.
 */
function sanitizeForDriveName(s: string): string {
  return s
    .replace(/\//g, "-")
    .replace(/\\/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/**
 * Cree (ou recupere) le dossier d'une session sur Drive.
 *
 * Strategie idempotente :
 *  - Si un dossier avec ce nom EXACT existe deja dans le dossier
 *    racine -> on retourne son id (pas de doublon).
 *  - Sinon on cree le dossier dans la racine.
 *
 * Retourne l'id du dossier (string).
 */
export async function ensureSessionFolder(
  folderName: string,
): Promise<string> {
  const drive = getDriveClient();
  const rootFolderId = getDriveRootFolderId();

  // 1. Cherche dossier existant par nom (echappement des quotes)
  const escapedName = folderName.replace(/'/g, "\\'");
  const query = `'${rootFolderId}' in parents and name = '${escapedName}' and mimeType = '${FOLDER_MIME}' and trashed = false`;

  const searchRes = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    pageSize: 1,
    // supportsAllDrives + includeItemsFromAllDrives pour gerer
    // aussi les Shared Drives si Gilles en ajoute un plus tard.
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const existing = searchRes.data.files?.[0];
  if (existing?.id) {
    return existing.id;
  }

  // 2. Creation
  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: FOLDER_MIME,
      parents: [rootFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  if (!createRes.data.id) {
    throw new Error("Drive: creation du dossier a echoue (pas d'id renvoye).");
  }
  return createRes.data.id;
}

/**
 * Renvoie l'URL "humaine" d'un dossier Drive a partir de son id —
 * utile pour afficher un lien cliquable a l'utilisateur dans l'UI.
 */
export function buildDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
