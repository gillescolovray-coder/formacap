/**
 * Déclarations minimales pour @sparticuz/chromium et puppeteer-core.
 *
 * Ces paquets ne sont importés QUE dynamiquement dans la route
 * /api/catalog/[slug]/pdf et installés séparément (cf. INSTALLATION.md
 * du module catalogue-en-ligne). Ce shim évite des erreurs TS quand
 * l'IDE ouvre le fichier avant l'installation des paquets.
 *
 * Une fois `npm install puppeteer-core @sparticuz/chromium` effectué,
 * les vrais types prennent le pas et ce shim devient inactif.
 */

declare module "@sparticuz/chromium" {
  const chromium: {
    args: string[];
    defaultViewport: { width: number; height: number } | null;
    executablePath: () => Promise<string>;
  };
  export default chromium;
}

declare module "puppeteer-core" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puppeteer: any;
  export default puppeteer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function launch(opts: any): Promise<any>;
}
