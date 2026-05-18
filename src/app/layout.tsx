import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FORMACAP — CAP NUMÉRIQUE",
  description: "Logiciel de gestion d'organisme de formation",
  other: {
    google: "notranslate",
  },
};

/**
 * Bandeau "Mode local" affiche uniquement en developpement
 * (NODE_ENV !== "production"). En production sur Vercel, il
 * est totalement absent — pas de risque de fuite cote utilisateurs.
 */
function LocalModeBanner() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="bg-red-600 text-white text-xs font-bold text-center py-1.5 px-4 sticky top-0 z-50 shadow-md">
      ⚠️ MODE LOCAL — Tu es sur ton PC (localhost:3000). Les changements
      faits ici ne sont visibles QUE chez toi. Pour la prod : push GitHub
      → Vercel deploie automatiquement.
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      translate="no"
      className="h-full antialiased notranslate"
      style={{
        fontFamily:
          'Arial, "Helvetica Neue", Helvetica, sans-serif',
      }}
    >
      <body className="min-h-full flex flex-col">
        <LocalModeBanner />
        {children}
      </body>
    </html>
  );
}
