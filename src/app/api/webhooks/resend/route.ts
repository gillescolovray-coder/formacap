/**
 * Webhook Resend — tracking cycle de vie email convention.
 * Gilles 2026-05-22 (Migration 0097).
 *
 * Resend envoie sur cette route les évènements :
 *   email.delivered   → email livré au serveur destinataire
 *   email.opened      → pixel tracking : email ouvert
 *   email.clicked     → lien dans l'email cliqué
 *   email.bounced     → rejet définitif
 *   email.complained  → marqué comme spam
 *
 * Format attendu (Resend) :
 *   { type, created_at, data: { email_id, ... } }
 *
 * Sécurité : on vérifie la signature `svix-signature` (header HMAC).
 * Le secret doit être configuré dans RESEND_WEBHOOK_SECRET (env var).
 *
 * À configurer côté Resend :
 *   Dashboard → Webhooks → Add endpoint
 *   URL : https://app.capnumerique.com/api/webhooks/resend
 *   Events : email.delivered, email.opened, email.clicked,
 *            email.bounced, email.complained
 *   Copier le "signing secret" généré → RESEND_WEBHOOK_SECRET
 */
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ResendEvent =
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained"
  // Resend envoie aussi des évènements qu'on ignore (sent, queued, etc.)
  | "email.sent"
  | "email.queued"
  | "email.delivery_delayed";

type ResendWebhookPayload = {
  type: ResendEvent;
  created_at: string;
  data: {
    email_id: string;
    [key: string]: unknown;
  };
};

/**
 * Vérifie la signature Svix envoyée par Resend.
 * Format des headers Svix :
 *   svix-id        : id unique du message
 *   svix-timestamp : timestamp Unix
 *   svix-signature : v1,<base64-hmac-sha256>
 */
function verifySignature(
  req: NextRequest,
  rawBody: string,
): { ok: boolean; reason?: string } {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Pas de secret configuré → on accepte (dev) en loggant
    console.warn(
      "[resend webhook] RESEND_WEBHOOK_SECRET non configuré — signature non vérifiée",
    );
    return { ok: true };
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: "Headers Svix manquants" };
  }

  // Le secret Resend est préfixé "whsec_" — on retire le préfixe
  // avant de décoder en base64.
  const cleanSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let signedPayload: string;
  let hmac: string;
  try {
    const keyBytes = Buffer.from(cleanSecret, "base64");
    signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
    hmac = crypto
      .createHmac("sha256", keyBytes)
      .update(signedPayload)
      .digest("base64");
  } catch (e) {
    return { ok: false, reason: `HMAC error: ${(e as Error).message}` };
  }

  // svix-signature peut contenir plusieurs signatures séparées par espace
  // (rotation des clés). Format : "v1,<sig> v1,<sig2>"
  const signatures = svixSignature
    .split(" ")
    .map((s) => s.split(",")[1])
    .filter(Boolean);

  const match = signatures.some(
    (sig) =>
      sig.length === hmac.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac)),
  );
  if (!match) return { ok: false, reason: "Signature invalide" };
  return { ok: true };
}

const EVENT_COLUMN_MAP: Partial<Record<ResendEvent, string>> = {
  "email.delivered": "delivered_at",
  "email.opened": "opened_at",
  "email.clicked": "clicked_at",
  "email.bounced": "bounced_at",
  "email.complained": "complained_at",
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const verification = verifySignature(req, rawBody);
  if (!verification.ok) {
    console.warn("[resend webhook] signature refusée:", verification.reason);
    return new Response(`Unauthorized: ${verification.reason}`, {
      status: 401,
    });
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { type, data, created_at } = payload;
  if (!data?.email_id) {
    return new Response("Missing email_id", { status: 400 });
  }

  const column = EVENT_COLUMN_MAP[type];
  if (!column) {
    // Évènement non pertinent (sent, queued, etc.) → 200 silencieux
    return new Response("Ignored", { status: 200 });
  }

  const supabase = createAdminClient();
  // On NE écrase PAS un timestamp déjà rempli (premier signal qui compte).
  // On sélectionne toutes les colonnes pour éviter le typage dynamique.
  const { data: existing } = await supabase
    .from("session_conventions")
    .select(
      "id, delivered_at, opened_at, clicked_at, bounced_at, complained_at",
    )
    .eq("resend_email_id", data.email_id)
    .maybeSingle();
  if (!existing) {
    // Pas de convention liée à cet email_id (peut-être un email
    // non-convention envoyé par Resend → on ignore proprement)
    return new Response("Email_id non lié à une convention", { status: 200 });
  }
  const row = existing as unknown as { id: string } & Record<
    string,
    string | null
  >;
  if (row[column]) {
    // Déjà rempli — on ne réécrit pas
    return new Response("Already recorded", { status: 200 });
  }

  const eventTime = created_at || new Date().toISOString();
  const updatePatch: Record<string, string> = { [column]: eventTime };

  const { error } = await supabase
    .from("session_conventions")
    .update(updatePatch)
    .eq("id", row.id);
  if (error) {
    console.error("[resend webhook] update échec:", error.message);
    return new Response(`Update failed: ${error.message}`, { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
