import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FORMACAP — CAP NUMÉRIQUE",
  description: "Logiciel de gestion d'organisme de formation",
  other: {
    google: "notranslate",
  },
};

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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
