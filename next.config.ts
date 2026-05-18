import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 15 Mo — couvre les uploads PDF (10 Mo) + marge de sérialisation
      bodySizeLimit: "15mb",
    },
  },
  // Externalise les binaires Chromium qui ne doivent PAS etre bundles
  // par Turbopack/Webpack : ils contiennent des fichiers natifs (.so, .br)
  // que le bundler casse en les relocalisant. Necessaire pour la
  // generation PDF en runtime serverless Vercel.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Force l'inclusion du binaire Chromium (fichier .br ~50 Mo) dans la
  // fonction serverless Vercel pour les routes qui generent des PDF.
  // Sans ca, Vercel ne copie pas le binaire car il n'est pas detecte
  // comme dependance statique (chargement dynamique via executablePath()).
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
