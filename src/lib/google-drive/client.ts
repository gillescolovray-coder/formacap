/**
 * Client Google Drive — auth via compte de service Google.
 *
 * Setup Gilles 2026-05-28 :
 *  - Projet Google Cloud : work-vers-gratuit
 *  - API Drive activee
 *  - Compte de service : formacap-drive-archiver@work-vers-gratuit
 *    .iam.gserviceaccount.com
 *  - Dossier racine partage avec ce compte en mode Editeur
 *
 * Variables d'environnement requises :
 *  - GOOGLE_SERVICE_ACCOUNT_JSON : contenu COMPLET du JSON
 *    telecharge depuis la console Google Cloud (format JSON).
 *  - GOOGLE_DRIVE_ROOT_FOLDER_ID : id du dossier racine Drive ou
 *    seront crees les sous-dossiers par session.
 */
import { google, type drive_v3 } from "googleapis";

let cachedClient: drive_v3.Drive | null = null;

export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON &&
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
  );
}

export function getDriveRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if (!id) {
    throw new Error(
      "GOOGLE_DRIVE_ROOT_FOLDER_ID manquant dans les variables d'environnement.",
    );
  }
  return id;
}

/**
 * Renvoie un client Drive authentifie en compte de service.
 * Mis en cache au niveau du module (lambda warm reuse).
 *
 * Le JSON peut etre passe :
 *  - directement (chaine JSON) dans GOOGLE_SERVICE_ACCOUNT_JSON
 *  - encode en base64 dans GOOGLE_SERVICE_ACCOUNT_JSON_B64 (fallback)
 *
 * Le format base64 est pratique sur Vercel ou les multilignes JSON
 * passent mal dans les env vars de l'UI.
 */
export function getDriveClient(): drive_v3.Drive {
  if (cachedClient) return cachedClient;

  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const b64Json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64?.trim();

  let jsonString: string | null = null;
  if (rawJson) jsonString = rawJson;
  else if (b64Json) {
    try {
      jsonString = Buffer.from(b64Json, "base64").toString("utf8");
    } catch (err) {
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_JSON_B64 invalide (decodage base64 echoue) : ${(err as Error).message}`,
      );
    }
  }
  if (!jsonString) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON manquant dans les variables d'environnement.",
    );
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_JSON invalide (JSON non parsable) : ${(err as Error).message}`,
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const drive = google.drive({ version: "v3", auth });
  cachedClient = drive;
  return drive;
}
