/**
 * Templates HTML pour les en-tete et pied de page repetes sur chaque
 * page du PDF generee par Puppeteer.
 *
 * IMPORTANT : ces HTML sont injectes dans une iframe isolee par Puppeteer,
 * Tailwind/CSS externes ne fonctionnent PAS. Tous les styles doivent etre
 * inlines. Variables Puppeteer disponibles dans le HTML :
 *   <span class="pageNumber"></span>  — numero de page courante
 *   <span class="totalPages"></span>  — total de pages
 *   <span class="title"></span>       — title de la page rendue
 *   <span class="url"></span>         — URL de la page rendue
 *   <span class="date"></span>        — date du jour
 */

type Org = {
  name: string;
  logoUrl: string | null;
  siret: string | null;
  nda: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * Récupère une URL d'image et la convertit en data URL base64.
 * Indispensable pour les images affichées dans les headerTemplate /
 * footerTemplate de Puppeteer : l'iframe isolée ne charge pas les
 * images distantes de manière fiable (timing de génération vs requête
 * HTTP asynchrone). En base64, l'image est intégrée au HTML et rendue
 * de façon synchrone.
 *
 * Renvoie null en cas d'échec (URL invalide, fetch échoué, etc.) —
 * l'appelant peut alors retomber sur du texte ou rien.
 */
export async function fetchImageAsDataUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/png";
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Remplace les variables {{var_name}} dans un template HTML par les
 * valeurs reelles. Pour les variables Puppeteer (page_number / total_pages),
 * on injecte les balises <span class="pageNumber"></span> que Puppeteer
 * remplit a la generation.
 */
export function applyTemplateVariables(
  html: string,
  vars: Record<string, string>,
): string {
  let out = html;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

/**
 * Construit le dictionnaire de variables {{var}} substituables dans les
 * templates de header/footer. Les pageNumber/totalPages utilisent les
 * classes speciales Puppeteer qu'il remplace au moment du rendu.
 */
function buildOrgVariables(org: Org, docTitle: string): Record<string, string> {
  const address = org.address ? escapeHtml(org.address) : "";
  const fullAddress = [
    org.address,
    [org.postalCode, org.city].filter(Boolean).join(" "),
  ]
    .filter((s): s is string => Boolean(s))
    .map((s) => escapeHtml(s))
    .join(", ");
  const now = new Date();
  const dateFr = now.toLocaleDateString("fr-FR");
  const timeFr = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return {
    logo: org.logoUrl ?? "",
    org_name: escapeHtml(org.name),
    org_address: fullAddress || address,
    org_siret: org.siret ? escapeHtml(org.siret) : "—",
    org_nda: org.nda ? escapeHtml(org.nda) : "—",
    org_phone: org.phone ? escapeHtml(org.phone) : "",
    org_email: org.email ? escapeHtml(org.email) : "",
    doc_title: escapeHtml(docTitle),
    date: dateFr,
    issued_at: `Émis le ${dateFr} à ${timeFr}`,
    page_number: '<span class="pageNumber"></span>',
    total_pages: '<span class="totalPages"></span>',
  };
}

/**
 * Templates Puppeteer pour la convention (R14 — Gilles 2026-05-14).
 *   • Header répété sur chaque page : titre du document + "Émis le".
 *   • Footer répété sur chaque page : mentions légales HTML riche
 *     (provient de organizations.legal_mentions, source unique éditée
 *     dans Paramètres → Organisation) + numérotation "Page X / Y".
 *
 * On utilise ces templates plutôt que CSS @page margin boxes parce que
 * Chromium/Puppeteer ne supportent PAS de façon fiable
 * `position:running()` + `content:element()` dans le mode PDF, ce qui
 * cassait le rendu (banner et mentions dans le corps au lieu des marges).
 *
 * @param org informations identité de l'organisme (fallback si pas de legalMentionsHtml)
 * @param docTitle titre affiché en en-tête (ex: "Convention — XXX")
 * @param legalMentionsHtml HTML riche des mentions légales (peut être null/vide)
 */
export function conventionPdfTemplatesWithLegalHtml(
  org: Org,
  docTitle: string,
  legalMentionsHtml: string | null,
) {
  const vars = buildOrgVariables(org, docTitle);

  // Header : titre à gauche, "Émis le" à droite, ligne bleue en bas.
  const headerTemplate = `<div style="width:100%;font-family:'Calibri','Segoe UI',sans-serif;padding:0 12mm 2mm 12mm;border-bottom:1px solid #1e40af;display:flex;justify-content:space-between;align-items:flex-end;box-sizing:border-box;">
  <div style="font-size:10pt;color:#1e40af;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;flex:1;">${vars.doc_title}</div>
  <div style="font-size:8pt;color:#64748b;font-style:italic;white-space:nowrap;">${vars.issued_at}</div>
</div>`;

  // Footer R18 — Layout 3 colonnes :
  //   [LOGO]  [mentions légales centrées avec icônes]  [Page X/Y]
  //
  // Hauteur visée ≤ 25mm (marginBottom du PDF = 25mm).
  //
  // Normalisation des tailles : TipTap (extension FontSize) sort des
  // `<span style="font-size:16px">` (tailles écran) beaucoup trop grandes
  // pour un footer PDF compact. On force uniformément 7pt sur tout le
  // contenu via `!important`, en gardant gras/italique/couleurs.
  // Les titres H1/H2/H3 restent un peu plus grands (8.5pt bold bleu).
  //
  // Icônes inline SVG remplacent les labels « Mobile : », « Téléphone : »,
  // « Tél : », « Email : », « E-mail : », « Mail : » dans le HTML user.
  let legalContent =
    legalMentionsHtml && legalMentionsHtml.trim() !== ""
      ? legalMentionsHtml
      : buildLegalFallback(org);
  legalContent = replaceContactLabelsWithIcons(legalContent);

  // Logo : on l'embarque s'il est disponible. Hauteur max 12mm pour ne
  // jamais dépasser la hauteur du footer (25mm - paddings - 1 ligne =
  // ~15mm dispo). `object-fit: contain` pour préserver le ratio sans
  // jamais déformer ni rogner.
  const logoCell = org.logoUrl
    ? `<img src="${escapeAttr(org.logoUrl)}" alt="${vars.org_name}" style="max-height:12mm; max-width:30mm; object-fit:contain; display:block;" />`
    : "";

  const footerTemplate = `<style>
  .cv-foot { width:100%; font-family:'Calibri','Segoe UI',sans-serif; padding:1.5mm 8mm 1mm 8mm; border-top:1px solid #1e40af; box-sizing:border-box; color:#475569; }
  .cv-foot-table { width:100%; border-collapse:collapse; table-layout:fixed; }
  .cv-foot-logo { width:32mm; vertical-align:middle; }
  .cv-foot-legal { vertical-align:middle; padding:0 4mm; text-align:center; }
  .cv-foot-legal, .cv-foot-legal * { font-size:7pt !important; line-height:1.3 !important; font-family:'Calibri','Segoe UI',sans-serif !important; }
  .cv-foot-legal p { margin:0 0 0.4mm 0 !important; }
  .cv-foot-legal p:last-child { margin-bottom:0 !important; }
  .cv-foot-legal strong, .cv-foot-legal b { font-weight:700 !important; }
  .cv-foot-legal em, .cv-foot-legal i { font-style:italic !important; }
  .cv-foot-legal u { text-decoration:underline !important; }
  .cv-foot-legal h1, .cv-foot-legal h2, .cv-foot-legal h3 { margin:0 0 0.5mm 0 !important; font-size:8.5pt !important; font-weight:700 !important; color:#1e40af !important; line-height:1.25 !important; }
  .cv-foot-legal .cv-ico { display:inline-block; vertical-align:-1.2px; width:9px; height:9px; margin-right:1.5px; }
  .cv-foot-pages-cell { width:20mm; vertical-align:bottom; text-align:right; font-size:7.5pt; font-weight:bold; color:#1e40af; }
</style>
<div class="cv-foot">
  <table class="cv-foot-table"><tr>
    <td class="cv-foot-logo">${logoCell}</td>
    <td class="cv-foot-legal">${legalContent}</td>
    <td class="cv-foot-pages-cell">Page <span class="pageNumber"></span> / <span class="totalPages"></span></td>
  </tr></table>
</div>`;

  return { headerTemplate, footerTemplate };
}

/**
 * Remplace les labels textuels « Mobile : », « Tél : », « Téléphone : »,
 * « Email : », « E-mail : », « Mail : » par des icônes SVG inline.
 * Utilisé dans le footer du PDF pour gagner de la place et améliorer la
 * lisibilité. Le HTML d'entrée vient de TipTap (legal_mentions) ou du
 * fallback structuré. Insensible à la casse, conserve le numéro/email
 * qui suit le label.
 */
function replaceContactLabelsWithIcons(html: string): string {
  // Icônes lucide-react simplifiées, inline SVG (rendu fiable dans
  // l'iframe Puppeteer du footer, qui n'a pas accès aux fonts externes).
  const phoneIcon = `<svg class="cv-ico" viewBox="0 0 24 24" fill="none" stroke="#1e40af" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
  const mailIcon = `<svg class="cv-ico" viewBox="0 0 24 24" fill="none" stroke="#1e40af" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
  return html
    .replace(/\b(?:Mobile|T[ée]l(?:[ée]phone)?)\s*:\s*/gi, phoneIcon + " ")
    .replace(/\b(?:E-?mail|Mail|Courriel)\s*:\s*/gi, mailIcon + " ");
}

/**
 * Construit un footer HTML de secours quand l'utilisateur n'a pas saisi
 * de mentions légales dans Paramètres > Organisation.
 */
function buildLegalFallback(org: Org): string {
  const line1Parts: string[] = [];
  if (org.name) line1Parts.push(`<strong>${escapeHtml(org.name)}</strong>`);
  if (org.siret) line1Parts.push(`SIRET ${escapeHtml(org.siret)}`);
  if (org.nda)
    line1Parts.push(`Déclaration d'activité n° ${escapeHtml(org.nda)}`);
  const addressLine = [
    org.address,
    [org.postalCode, org.city].filter(Boolean).join(" "),
  ]
    .filter((s): s is string => Boolean(s))
    .map((s) => escapeHtml(s))
    .join(", ");
  const line2Parts: string[] = [];
  if (addressLine) line2Parts.push(addressLine);
  if (org.email) line2Parts.push(escapeHtml(org.email));
  if (org.phone) line2Parts.push(escapeHtml(org.phone));
  return [
    line1Parts.length ? `<p style="margin:0 0 1mm 0;">${line1Parts.join(" — ")}</p>` : "",
    line2Parts.length ? `<p style="margin:0;">${line2Parts.join(" — ")}</p>` : "",
  ].join("");
}

/**
 * Templates par defaut pour une convention de formation. Utilises si
 * aucun template custom n'a ete sauvegarde par l'utilisateur dans
 * Parametres > Modeles documents.
 */
export function conventionPdfTemplates(org: Org, docTitle: string) {
  const vars = buildOrgVariables(org, docTitle);
  const logoHtml = org.logoUrl
    ? `<img src="${escapeAttr(org.logoUrl)}" alt="${vars.org_name}" style="max-height: 14mm; max-width: 35mm; object-fit: contain;" />`
    : `<div style="font-weight: bold; font-size: 11px; color: #1e40af; text-transform: uppercase; letter-spacing: 1px;">${vars.org_name}</div>`;

  const headerTemplate = `<div style="width:100%;font-family:'Calibri',sans-serif;font-size:11px;color:#475569;padding:0 10mm;border-bottom:1px solid #1e40af;display:flex;align-items:center;justify-content:space-between;"><div style="display:flex;align-items:center;font-size:9px;color:#64748b;font-style:italic;">${logoHtml}</div><div style="text-align:right;"><div style="font-size:12px;color:#1e40af;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">${vars.doc_title}</div><div style="font-size:8px;color:#64748b;font-style:italic;margin-top:1mm;">${vars.issued_at}</div></div></div>`;

  const footerTemplate = `<div style="width:100%;font-family:'Calibri',sans-serif;font-size:8px;color:#64748b;padding:0 10mm;border-top:1px solid #1e40af;display:flex;align-items:center;justify-content:space-between;"><div style="font-weight:bold;color:#1e40af;">${vars.org_name}</div><div style="text-align:center;flex:1;margin:0 8mm;">${vars.org_address} · SIRET ${vars.org_siret} · NDA ${vars.org_nda} · ${vars.org_phone} · ${vars.org_email}</div><div>Page ${vars.page_number} / ${vars.total_pages}</div></div>`;

  return { headerTemplate, footerTemplate };
}

/**
 * Configuration visuelle de l'en-tete + typographie (R10 — 2026-05-14).
 */
type ConventionHeaderConfig = {
  font_family: string;
  font_size_pt: number;
  text_color: string;
  show_logo: boolean;
  show_title: boolean;
  border_color: string;
};

/**
 * Configuration visuelle du pied de page + typographie.
 */
type ConventionFooterConfig = {
  font_family: string;
  font_size_pt: number;
  text_color: string;
  show_org_name: boolean;
  show_org_address: boolean;
  show_org_siret: boolean;
  show_org_nda: boolean;
  show_org_phone: boolean;
  show_org_email: boolean;
  show_page_number: boolean;
  border_color: string;
};

/**
 * Construit les templates Puppeteer (en-tete + pied) en partant de la
 * CONFIG VISUELLE (cases a cocher) stockee dans document_templates.
 * L'utilisateur n'a pas a ecrire de HTML — c'est genere ici.
 */
export function conventionPdfTemplatesFromBlocks(
  org: Org,
  docTitle: string,
  blocks: {
    header: ConventionHeaderConfig;
    footer: ConventionFooterConfig;
  } | null,
) {
  if (!blocks) {
    return conventionPdfTemplates(org, docTitle);
  }

  const vars = buildOrgVariables(org, docTitle);

  // ============================================================
  // HEADER (1 ligne) — Police/taille/couleur lues depuis blocks.header
  // (R10 — Gilles 2026-05-14, customisation des templates).
  // ============================================================
  const headerFont = escapeAttr(blocks.header.font_family);
  const headerSize = blocks.header.font_size_pt;
  const headerColor = escapeAttr(blocks.header.text_color);
  const headerBits: string[] = [];
  if (blocks.header.show_title) {
    headerBits.push(
      `<div style="text-align:left;font-size:${headerSize + 2}pt;color:${escapeAttr(blocks.header.border_color)};font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">${vars.doc_title}</div>`,
    );
  } else {
    headerBits.push(`<div></div>`);
  }
  if (blocks.header.show_logo && org.logoUrl) {
    headerBits.push(
      `<div style="display:flex;align-items:center;justify-content:flex-end;"><img src="${escapeAttr(org.logoUrl)}" alt="${vars.org_name}" style="max-height:14mm;max-width:35mm;object-fit:contain;" /></div>`,
    );
  } else if (blocks.header.show_logo) {
    headerBits.push(
      `<div style="text-align:right;font-weight:bold;font-size:${headerSize + 2}pt;color:${escapeAttr(blocks.header.border_color)};text-transform:uppercase;letter-spacing:1px;">${vars.org_name}</div>`,
    );
  } else {
    headerBits.push(
      `<div style="text-align:right;font-size:${headerSize - 1}pt;color:#64748b;font-style:italic;">${vars.issued_at}</div>`,
    );
  }

  const headerTemplate = `<div style="width:100%;font-family:'${headerFont}',sans-serif;font-size:${headerSize}pt;color:${headerColor};padding:0 10mm;border-bottom:1px solid ${escapeAttr(blocks.header.border_color)};display:flex;align-items:center;justify-content:space-between;">${headerBits.join("")}</div>`;

  // ============================================================
  // FOOTER (2 lignes) — Layout repensé pour éviter le chevauchement
  // avec le contenu et améliorer la lisibilité (R10 — 2026-05-14) :
  //   Ligne 1 : [ORG NAME en gras] —— [Page X / Y]
  //   Ligne 2 : [adresse · SIRET · NDA · téléphone · email] (centré)
  // ============================================================
  const footerFont = escapeAttr(blocks.footer.font_family);
  const footerSize = blocks.footer.font_size_pt;
  const footerColor = escapeAttr(blocks.footer.text_color);

  // Détails du milieu (ligne 2)
  const footerDetailParts: string[] = [];
  if (blocks.footer.show_org_address && vars.org_address) {
    footerDetailParts.push(vars.org_address);
  }
  if (blocks.footer.show_org_siret && org.siret) {
    footerDetailParts.push(`SIRET ${vars.org_siret}`);
  }
  if (blocks.footer.show_org_nda && org.nda) {
    footerDetailParts.push(`NDA ${vars.org_nda}`);
  }
  if (blocks.footer.show_org_phone && org.phone) {
    footerDetailParts.push(vars.org_phone);
  }
  if (blocks.footer.show_org_email && org.email) {
    footerDetailParts.push(vars.org_email);
  }
  const footerLine2Content = footerDetailParts.join(" · ");

  // ============================================================
  // FOOTER LAYOUT (R10 + Gilles 2026-05-14) :
  //   Ligne 1 : [vide gauche]  [CAP NUMERIQUE centré]  [Page X/Y droite]
  //   Ligne 2 : [adresse · SIRET · NDA · tél · email] centré
  // On utilise <table> (pas flex) car Puppeteer a un bug connu avec
  // display:flex dans les header/footer templates (hauteur 0).
  // Référence : github.com/puppeteer/puppeteer/issues/4132
  // ============================================================

  const leftCell = `<td style="width:33%;"></td>`;
  const orgNameCell = blocks.footer.show_org_name
    ? `<td style="width:34%;text-align:center;font-weight:bold;color:${escapeAttr(blocks.footer.border_color)};font-size:${footerSize + 1}pt;">${vars.org_name}</td>`
    : `<td style="width:34%;"></td>`;
  const pageNumCell = blocks.footer.show_page_number
    ? `<td style="width:33%;text-align:right;font-weight:bold;color:${escapeAttr(blocks.footer.border_color)};font-size:${footerSize}pt;">Page ${vars.page_number} / ${vars.total_pages}</td>`
    : `<td style="width:33%;"></td>`;

  const footerTemplate = `<div style="width:100%;font-family:'${footerFont}',sans-serif;font-size:${footerSize}pt;color:${footerColor};padding:2mm 10mm 0 10mm;border-top:1px solid ${escapeAttr(blocks.footer.border_color)};box-sizing:border-box;">
    <table style="width:100%;border-collapse:collapse;border:0;table-layout:fixed;"><tr>${leftCell}${orgNameCell}${pageNumCell}</tr></table>
    ${footerLine2Content ? `<div style="text-align:center;width:100%;margin-top:1mm;font-size:${Math.max(footerSize - 1, 6)}pt;color:${footerColor};">${footerLine2Content}</div>` : ""}
  </div>`;

  return { headerTemplate, footerTemplate };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
