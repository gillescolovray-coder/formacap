export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="mb-8 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
          CAP NUMÉRIQUE
        </span>
        <p className="text-sm text-zinc-500 mt-1">Logiciel de gestion OF</p>
      </div>
      {children}
    </div>
  );
}
