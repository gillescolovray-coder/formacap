/**
 * Client Google Agenda — auth via le MÊME compte de service Google que le
 * Drive (cf. src/lib/google-drive/client.ts).
 *
 * Setup Gilles 2026-06-06 :
 *  - Agenda dédié "Sessions CAP" créé dans gilles.colovray@capnumerique.com
 *  - Partagé avec le compte de service (droit "Apporter des modifications
 *    aux événements")
 *  - GOOGLE_CALENDAR_ID = id de cet agenda (…@group.calendar.google.com)
 *
 * Variables d'environnement requises :
 *  - GOOGLE_SERVICE_ACCOUNT_JSON (ou _B64) : credentials du compte de service
 *  - GOOGLE_CALENDAR_ID : id de l'agenda partagé
 */
import { google, type calendar_v3 } from "googleapis";

let cachedClient: calendar_v3.Calendar | null = null;

export function isCalendarConfigured(): boolean {
  return Boolean(
    (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64) &&
      process.env.GOOGLE_CALENDAR_ID,
  );
}

export function getCalendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID?.trim();
  if (!id) {
    throw new Error(
      "GOOGLE_CALENDAR_ID manquant dans les variables d'environnement.",
    );
  }
  return id;
}

export function getCalendarClient(): calendar_v3.Calendar {
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
        `GOOGLE_SERVICE_ACCOUNT_JSON_B64 invalide (décodage base64 échoué) : ${(err as Error).message}`,
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
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  const calendar = google.calendar({ version: "v3", auth });
  cachedClient = calendar;
  return calendar;
}
