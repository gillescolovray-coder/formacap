import Link from "next/link";

export default function CatalogNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 p-8">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">🔎</div>
        <h1 className="text-2xl font-bold mb-2">Catalogue introuvable</h1>
        <p className="text-zinc-600 mb-6">
          Ce catalogue n&apos;existe pas, ou il n&apos;est pas publié pour le
          moment.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 text-sm font-medium"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
