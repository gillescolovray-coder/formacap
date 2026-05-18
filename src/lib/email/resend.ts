/**
 * Helper d'envoi d'email via Resend (https://resend.com).
 *
 * Fonctionne sans dépendance npm — on utilise fetch directement contre l'API
 * REST Resend, pour éviter d'ajouter encore un paquet.
 *
 * Configuration : 2 variables d'environnement à définir dans .env.local
 *   - RESEND_API_KEY  : clé API obtenue sur https://resend.com/api-keys
 *   - RESEND_FROM     : adresse expéditeur (ex: "Cap Numérique <contact@capnumerique.com>")
 *                       Le domaine doit être vérifié dans Resend avant utilisation
 *                       (en mode test, "onboarding@resend.dev" fonctionne, mais
 *                       seuls les emails du compte propriétaire sont délivrés).
 */

export type ResendAttachment = {
  filename: string;
  /** Contenu binaire du fichier — sera encodé en base64. */
  content: Buffer;
  contentType?: string;
};

export type SendEmailParams = {
  to: string;
  toName?: string;
  subject: string;
  /** HTML du corps de l'email. */
  html: string;
  /** Texte brut alternatif (fallback). */
  text?: string;
  /** Optionnel : email de réponse différent de l'expéditeur. */
  replyTo?: string;
  /** Pièces jointes. */
  attachments?: ResendAttachment[];
  /** Emails à mettre en copie (CC). Utilisé pour les référents
   *  pédagogiques rattachés à une inscription (R6 — Gilles 2026-05-13).
   *  En mode test (EMAIL_REDIRECT_TO), les CC sont IGNORÉS pour ne
   *  pas spammer plusieurs adresses identiques. */
  cc?: string[];
};

export type SendEmailResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string; status?: number };

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return {
      ok: false,
      error:
        "L'envoi d'email n'est pas configuré (RESEND_API_KEY et RESEND_FROM manquants).",
    };
  }

  // Mode test : si EMAIL_REDIRECT_TO est défini, tous les emails sont
  // redirigés vers cette adresse au lieu du vrai destinataire. Le vrai
  // destinataire est indiqué dans le sujet pour traçabilité.
  // Utile tant que le domaine Resend n'est pas vérifié — permet d'envoyer
  // aux 2 emails (gilles.colovray@capnumerique.com).
  const redirectTo = process.env.EMAIL_REDIRECT_TO?.trim();
  const realRecipient = params.toName
    ? `${params.toName} <${params.to}>`
    : params.to;
  const recipient = redirectTo
    ? redirectTo
    : realRecipient;
  const subject = redirectTo
    ? `[TEST → ${params.to}] ${params.subject}`
    : params.subject;
  const htmlWithBanner = redirectTo
    ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px;margin-bottom:16px;font-family:sans-serif;font-size:13px;color:#78350f;">
         <strong>📧 Mode test Resend.</strong><br/>
         Destinataire réel : <strong>${params.to}</strong>${params.toName ? ` (${params.toName})` : ""}<br/>
         Redirigé vers <strong>${redirectTo}</strong> car le domaine n'est pas encore vérifié.
       </div>${params.html}`
    : params.html;

  // CC référents : on filtre les emails valides + on évite que le
  // destinataire principal y soit dupliqué. En mode test (redirection),
  // on retire le CC pour ne pas spammer.
  const ccClean = redirectTo
    ? []
    : (params.cc ?? [])
        .filter((e): e is string => Boolean(e && e.trim().length > 0))
        .filter((e) => e.trim().toLowerCase() !== params.to.trim().toLowerCase());
  const body: {
    from: string;
    to: string[];
    cc?: string[];
    subject: string;
    html: string;
    text?: string;
    reply_to?: string;
    attachments?: Array<{
      filename: string;
      content: string;
      content_type: string;
    }>;
  } = {
    from,
    to: [recipient],
    subject,
    html: htmlWithBanner,
    text: params.text,
    reply_to: params.replyTo,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
      content_type: a.contentType ?? "application/octet-stream",
    })),
  };
  if (ccClean.length > 0) {
    body.cc = ccClean;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const json = (await response.json()) as { message?: string; error?: string };
        errorMsg = json.message ?? json.error ?? errorMsg;
      } catch {
        errorMsg = await response.text().catch(() => errorMsg);
      }
      return { ok: false, error: errorMsg, status: response.status };
    }

    const json = (await response.json()) as { id?: string };
    return { ok: true, providerId: json.id ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
