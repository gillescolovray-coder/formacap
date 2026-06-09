import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AppShellClient } from "./app-shell-client";
import { SidebarNav } from "./sidebar-nav";
import { SidebarShell } from "./sidebar-shell";
import { UserMenu } from "./user-menu";

export async function AppShell({ children }: { children: React.ReactNode }) {
  // Accès public par token (ex. convocation imprimable via ?token=) :
  // le middleware pose l'en-tête x-public-print. Dans ce cas on rend la
  // page SANS exiger de login ni sidebar — la page valide elle-même le
  // token. Évite la redirection /login (page blanche). Gilles 2026-06-05.
  const h = await headers();
  if (h.get("x-public-print") === "1") {
    return <main className="min-h-screen bg-white">{children}</main>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Pages imprimables internes (ex. programme de formation) : authentifié,
  // mais rendu SANS sidebar/menu pour une impression propre. Le middleware
  // pose l'en-tête x-bare-layout. Gilles 2026-06-09.
  if (h.get("x-bare-layout") === "1") {
    return <main className="min-h-screen bg-white">{children}</main>;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, organization:organizations(name, logo_url)")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const displayName =
    profile?.first_name || profile?.last_name
      ? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
      : (user.email ?? "Utilisateur");
  const organization = membership?.organization as unknown as {
    name: string;
    logo_url: string | null;
  } | null;
  const orgName = organization?.name ?? "CAP NUMÉRIQUE";
  const orgLogo = organization?.logo_url ?? null;
  const role = membership?.role as string | undefined;

  // Brand : version étendue (logo plein + nom complet)
  const brand = (
    <div className="flex flex-col items-center gap-3.5">
      {orgLogo ? (
        <div className="w-full flex items-center justify-center rounded-3xl bg-white p-4 shadow-2xl shadow-cyan-500/20 ring-1 ring-cyan-400/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={orgLogo}
            alt={`Logo ${orgName}`}
            className="max-h-16 max-w-full object-contain"
          />
        </div>
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-white font-black text-3xl shadow-2xl shadow-cyan-500/40 ring-2 ring-white/10">
          {orgName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="text-center min-w-0 w-full">
        <div className="text-base font-bold tracking-tight truncate text-white">
          {orgName}
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] font-semibold text-cyan-300 mt-1">
          FORMACAP
        </div>
      </div>
    </div>
  );

  // Brand : version compacte (mini-logo carré uniquement)
  const brandCompact = (
    <div className="flex justify-center" title={orgName}>
      {orgLogo ? (
        <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-white p-1 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={orgLogo}
            alt={`Logo ${orgName}`}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white font-black text-base shadow-lg shadow-cyan-500/30 ring-1 ring-white/10">
          {orgName.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );

  // Footer (UserMenu) — version étendue
  const footer = (
    <UserMenu
      displayName={displayName}
      email={user.email ?? ""}
      role={role}
    />
  );

  // Footer compact : juste l'avatar circulaire avec tooltip nom + email
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";
  const footerCompact = (
    <div
      className="flex justify-center"
      title={`${displayName}\n${user.email ?? ""}`}
    >
      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-xs font-bold flex items-center justify-center shadow-md ring-1 ring-white/10">
        {initials}
      </div>
    </div>
  );

  const sidebar = (
    <SidebarShell
      brand={brand}
      brandCompact={brandCompact}
      nav={<SidebarNav />}
      footer={footer}
      footerCompact={footerCompact}
    />
  );

  return <AppShellClient sidebar={sidebar}>{children}</AppShellClient>;
}
