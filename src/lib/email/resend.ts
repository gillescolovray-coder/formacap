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
  /** Texte brut alternatif (fallback). Si non fourni, on en génère
   *  automatiquement à partir du HTML (Gilles 2026-05-22 : améliore le
   *  score anti-spam de Outlook / Mailinblack / Vade etc.). */
  text?: string;
  /** Optionnel : email de réponse différent de l'expéditeur. */
  replyTo?: string;
  /** Optionnel : surcharge l'adresse expéditeur (RESEND_FROM par défaut).
   *  Utile pour envoyer un 2ème email depuis un alias humain qui a moins
   *  de risque d'être filtré (ex: gilles@capnumerique.com). Le domaine
   *  doit être vérifié dans Resend. */
  fromOverride?: string;
  /** Pièces jointes. */
  attachments?: ResendAttachment[];
  /** Emails à mettre en copie (CC). Utilisé pour les référents
   *  pédagogiques rattachés à une inscription (R6 — Gilles 2026-05-13).
   *  En mode test (EMAIL_REDIRECT_TO), les CC sont IGNORÉS pour ne
   *  pas spammer plusieurs adresses identiques. */
  cc?: string[];
};

/**
 * Convertit un HTML simple en texte brut acceptable pour la fallback
 * `text` d'un email (Gilles 2026-05-22 : améliore la délivrabilité face
 * aux filtres anti-spam qui pénalisent les emails HTML-only).
 *
 * Logique légère, sans dépendance — on retire les balises, on décode
 * les entités les plus courantes, et on collapse les espaces.
 */
function htmlToPlainText(html: string): string {
  return (
    html
      // 1. Tags structurants qui doivent générer un saut de ligne
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|td)\s*>/gi, "\n")
      // 2. Liens : on les transforme en "texte (URL)" pour conserver l'info
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
      // 3. Toutes les autres balises → supprimées
      .replace(/<[^>]+>/g, "")
      // 4. Entités HTML courantes
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&euro;/g, "€")
      // 5. Collapsing : supprime espaces multiples + lignes vides multiples
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

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
  const fromEnv = process.env.RESEND_FROM;
  const from = params.fromOverride ?? fromEnv;
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
  // Si pas de version texte fournie, on en génère une depuis le HTML
  // pour améliorer le score anti-spam (Gilles 2026-05-22).
  const textBody = params.text ?? htmlToPlainText(htmlWithBanner);
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
    text: textBody,
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
