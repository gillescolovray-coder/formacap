/**
 * Post-traitement du PDF généré par Puppeteer pour superposer le bandeau
 * commercial sur la page 1 (UNIQUEMENT).
 *
 * Pourquoi un post-traitement ?
 *   Puppeteer ne sait pas conditionner son headerTemplate par numéro de
 *   page. Le bandeau commercial doit n'apparaître QUE sur la page 1 et
 *   recouvrir la zone du header (titre + date) sans cacher le texte
 *   du corps. Le seul moyen propre est de dessiner par-dessus le PDF
 *   généré, avec pdf-lib.
 *
 * Algorithme :
 *   1. Charge le PDF Buffer avec pdf-lib
 *   2. Embed l'image du bandeau (PNG/JPG auto-détecté)
 *   3. Sur la page 1, dessine l'image au-dessus, en pleine largeur,
 *      sur une hauteur qui couvre le header Puppeteer (~18mm) plus une
 *      extension dans le corps pour atteindre la hauteur du bandeau.
 *   4. Sauvegarde et retourne le PDF modifié.
 *
 * Le caller doit RÉSERVER côté print/page.tsx un espace vide au début
 * du corps de la page 1 (height = bannerHeightMm - marginTopMm) pour
 * que le contenu textuel ne soit pas masqué par l'overlay.
 */

import { PDFDocument } from "pdf-lib";

export async function overlayBannerOnFirstPage(
  pdfBuffer: Buffer,
  imageBuffer: Buffer,
  mimeType: string,
  /** Hauteur visuelle du bandeau dans le PDF (en mm). Défaut : 38mm. */
  bannerHeightMm: number = 38,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) return pdfBuffer;

  const firstPage = pages[0];
  const { width: pageWidth, height: pageHeight } = firstPage.getSize();

  // pdf-lib utilise des points (1pt = 1/72 inch, 1mm = 2.834... pt).
  const mmToPt = (mm: number) => (mm / 25.4) * 72;
  const bannerHeightPt = mmToPt(bannerHeightMm);

  // Embed l'image selon son type. pdf-lib supporte PNG et JPG.
  const isPng = mimeType.toLowerCase().includes("png");
  const isJpeg =
    mimeType.toLowerCase().includes("jpeg") ||
    mimeType.toLowerCase().includes("jpg");
  if (!isPng && !isJpeg) {
    // Type non supporté — on retourne le PDF tel quel pour ne pas planter.
    return pdfBuffer;
  }

  const image = isPng
    ? await pdfDoc.embedPng(imageBuffer)
    : await pdfDoc.embedJpg(imageBuffer);

  // Coordonnées pdf-lib : (0, 0) en BAS À GAUCHE. Pour dessiner depuis
  // le haut, on calcule y = pageHeight - bannerHeightPt.
  firstPage.drawImage(image, {
    x: 0,
    y: pageHeight - bannerHeightPt,
    width: pageWidth,
    height: bannerHeightPt,
  });

  const saved = await pdfDoc.save();
  return Buffer.from(saved);
}
