/**
 * Skeleton de chargement affiché instantanément par Next.js dès qu'on
 * clique sur un lien de navigation — pendant que le Server Component
 * de destination charge ses données.
 *
 * Avant ce fichier, l'utilisateur cliquait un menu et voyait la page
 * courante figée 2-3 secondes (latence cold-start Vercel + requêtes
 * Supabase). Ici, on remplace cet écran figé par un skeleton qui
 * indique visuellement que l'app travaille — feedback immédiat.
 *
 * Note : ce loading.tsx s'applique à toutes les routes /(app)/* qui
 * n'ont pas leur propre loading.tsx plus spécifique.
 *
 * Gilles 2026-05-21
 */
export default function AppLoading() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="px-8 py-6 border-b border-slate-200">
        <div className="h-3 w-32 bg-slate-200 rounded mb-3" />
        <div className="h-7 w-72 bg-slate-300 rounded mb-2" />
        <div className="h-3 w-96 bg-slate-200 rounded" />
      </div>
      {/* Contenu skeleton */}
      <div className="p-8 space-y-4 max-w-7xl">
        <div className="rounded-xl bg-white border border-slate-200 p-6 space-y-3">
          <div className="h-4 w-1/3 bg-slate-200 rounded" />
          <div className="h-3 w-2/3 bg-slate-100 rounded" />
          <div className="h-3 w-1/2 bg-slate-100 rounded" />
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-6 space-y-3">
          <div className="h-4 w-1/4 bg-slate-200 rounded" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-slate-100 rounded" />
            <div className="h-3 w-full bg-slate-100 rounded" />
            <div className="h-3 w-3/4 bg-slate-100 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
