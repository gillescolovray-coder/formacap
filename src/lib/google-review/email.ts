/**
 * Email « Demande d'avis Google » (Gilles 2026-06-23).
 * Reprend le visuel du modèle Gmail de CAP NUMERIQUE : logo, 5 étoiles,
 * texte chaleureux, bouton « Témoignez ICI » pointant vers le lien d'avis
 * Google configuré dans Paramètres > Organisation.
 */

export type GoogleReviewEmailParams = {
  learnerFirstName: string | null;
  orgName: string;
  orgLogoUrl: string | null;
  reviewUrl: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildGoogleReviewEmail(params: GoogleReviewEmailParams): {
  subject: string;
  html: string;
} {
  const { learnerFirstName, orgName, orgLogoUrl, reviewUrl } = params;
  const hello = learnerFirstName
    ? `Bonjour ${esc(learnerFirstName)},`
    : "Bonjour chèr·e apprenant·e,";
  const url = esc(reviewUrl);

  const subject = `${orgName} : soutenez-nous sur Google ⭐`;

  const html = `
<div style="background:#f4f6fb;padding:24px 0;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:28px 32px 8px;text-align:center;">
        ${
          orgLogoUrl
            ? `<img src="${esc(orgLogoUrl)}" alt="${esc(orgName)}" style="max-height:60px;max-width:220px;object-fit:contain;" />`
            : `<div style="font-size:20px;font-weight:bold;color:#0e7490;">${esc(orgName)}</div>`
        }
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 0;text-align:center;">
        <h1 style="font-size:24px;color:#1f2937;margin:16px 0 6px;">Soutenez-nous sur Google !</h1>
        <div style="font-size:26px;letter-spacing:4px;color:#f5b50a;">★ ★ ★ ★ ★</div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 8px;color:#374151;font-size:14px;line-height:1.6;text-align:center;">
        <p style="margin:0 0 12px;">${hello} Comment allez-vous depuis la dernière fois ? Nous avons adoré vous accompagner et nous sommes ravis que votre formation se soit bien déroulée.</p>
        <p style="margin:0 0 12px;"><strong>Que diriez-vous de partager votre expérience sur notre page Google</strong> afin d'aider de futurs apprenants à se faire une idée de notre organisme ?</p>
        <p style="margin:0 0 12px;">Ça fait toujours plaisir et ça nous aide énormément à nous faire connaître. <strong>Alors aidez-nous à nous démarquer</strong> et à guider les petits nouveaux !</p>
        <p style="margin:0 0 4px;">Cliquez sur le bouton ci-dessous, on compte sur vous. Merci ! ❤️</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 32px;text-align:center;">
        <a href="${url}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;background:#2f7d7b;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:8px;">
          Témoignez ICI
        </a>
        <p style="margin:18px 0 0;font-size:11px;color:#9ca3af;">
          Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
          <a href="${url}" style="color:#2f7d7b;word-break:break-all;">${url}</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 32px;background:#f9fafb;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #eef2f7;">
        ${esc(orgName)}
      </td>
    </tr>
  </table>
</div>`;

  return { subject, html };
}
