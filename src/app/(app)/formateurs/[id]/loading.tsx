export default function Loading() {
  return (
    <>
      {/* Squelette du PageHeader */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-10">
        <div className="px-10 py-8 flex items-end justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="h-3 w-40 bg-slate-200 rounded mb-3 animate-pulse" />
            <div className="h-9 w-80 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-64 bg-slate-100 rounded mt-3 animate-pulse" />
          </div>
          <div className="h-9 w-40 bg-slate-200 rounded animate-pulse" />
        </div>
      </header>

      <div className="p-8 max-w-5xl space-y-6">
        {/* Bandeau validation */}
        <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-900 animate-pulse" />

        {/* Sections repliables */}
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
          >
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-slate-200 animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-48 bg-slate-200 rounded animate-pulse mb-2" />
                <div className="h-3 w-72 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
