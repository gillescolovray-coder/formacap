/**
 * Helper unique pour la génération PDF côté serveur via Puppeteer headless.
 *
 * - En production (Vercel) : utilise @sparticuz/chromium qui fournit le binaire.
 * - En dev local            : utilise le Chrome système (auto-détecté Windows /
 *                              macOS / Linux ou via PUPPETEER_EXECUTABLE_PATH).
 *
 * Réutilisé par :
 *   - /api/catalog/[slug]/pdf            (catalogue de vente)
 *   - /api/sessions/[id]/convocations/[enrollmentId]/pdf
 *   - /api/sessions/[id]/emargement/pdf
 */

export type PdfRenderOptions = {
  /** URL absolue de la page à imprimer (Next.js doit pouvoir la servir). */
  url: string;
  /** Cookies à propager (pour les pages authentifiées). */
  cookies?: Array<{ name: string; value: string; domain?: string; path?: string }>;
  /** Format papier — "A4" par défaut. */
  format?: "A4" | "Letter";
  /** Marges en mm — 0 par défaut (la mise en page CSS gère ses propres marges). */
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
  /** Délai max (ms) pour charger la page. */
  timeout?: number;
  /**
   * En-tête HTML répété sur chaque page du PDF (Puppeteer feature).
   * Le HTML doit avoir ses styles inline (pas de Tailwind).
   * Variables Puppeteer disponibles : <span class="pageNumber"></span>,
   * <span class="totalPages"></span>, <span class="date"></span>,
   * <span class="title"></span>, <span class="url"></span>.
   * Si défini, ajoute automatiquement displayHeaderFooter=true.
   */
  headerTemplate?: string;
  /** Pied de page HTML répété sur chaque page (idem). */
  footerTemplate?: string;
};

/**
 * Rend une URL en PDF (Buffer Node.js).
 *
 * Lance / ferme Puppeteer à chaque appel — c'est volontaire pour rester
 * stateless sur le serverless. Pour des volumes élevés, on pourrait pooler.
 */
export async function renderPdf(opts: PdfRenderOptions): Promise<Buffer> {
  const isProduction = process.env.NODE_ENV === "production";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any;

  if (isProduction) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    const puppeteer = await import("puppeteer-core");
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ?? findLocalChrome();
    if (!executablePath) {
      throw new Error(
        "Chrome non trouvé en local. Définis PUPPETEER_EXECUTABLE_PATH dans .env.local.",
      );
    }
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754 });

    // Propage les cookies de session pour les pages authentifiées
    if (opts.cookies && opts.cookies.length > 0) {
      const u = new URL(opts.url);
      const formatted = opts.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain ?? u.hostname,
        path: c.path ?? "/",
      }));
      await page.setCookie(...formatted);
    }

    await page.goto(opts.url, {
      waitUntil: "networkidle0",
      timeout: opts.timeout ?? 30_000,
    });
    await page.emulateMediaType("print");

    const hasHeaderFooter = Boolean(opts.headerTemplate || opts.footerTemplate);
    // Si la page print définit ses propres `@page` CSS (margin, @page :first…),
    // on laisse Chrome les respecter via preferCSSPageSize=true. Cela
    // permet aux documents (ex. convention) de masquer le header sur
    // la page 1 via `@page :first { margin-top: 0 }`.
    const useCssPageSize = !opts.margin;
    const buffer = await page.pdf({
      format: opts.format ?? "A4",
      printBackground: true,
      preferCSSPageSize: useCssPageSize,
      displayHeaderFooter: hasHeaderFooter,
      headerTemplate: opts.headerTemplate ?? "<div></div>",
      footerTemplate: opts.footerTemplate ?? "<div></div>",
      // Quand `margin` n'est PAS passé, on n'injecte AUCUNE marge dans
      // l'option page.pdf() — c'est CSS @page qui pilote (preferCSSPageSize
      // = true). Important pour que `@page :first { margin-top: 0 }` soit
      // respecté (sinon Puppeteer overwrite avec ses defaults).
      ...(opts.margin
        ? {
            margin: {
              top: opts.margin.top ?? "0mm",
              right: opts.margin.right ?? "0mm",
              bottom: opts.margin.bottom ?? "0mm",
              left: opts.margin.left ?? "0mm",
            },
          }
        : {}),
    });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}

/**
 * Détection simple du Chrome local pour le dev. Renvoie undefined si rien
 * n'est trouvé — l'utilisateur peut alors définir PUPPETEER_EXECUTABLE_PATH.
 */
function findLocalChrome(): string | undefined {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
          ];

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}
