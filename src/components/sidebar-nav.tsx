"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  Calendar,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  Receipt,
  Route,
  Settings,
  Sparkles,
  Star,
  UserCog,
  Users,
} from "lucide-react";
import { useSidebarCollapsed } from "./app-shell-client";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  /** Sous-menus éventuels (préparation pour l'avenir). */
  children?: NavItem[];
};

const PRIMARY_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/formations", label: "Catalogue", icon: GraduationCap },
  { href: "/programmes", label: "Programmes", icon: Sparkles },
  { href: "/catalogue", label: "Catalogue en ligne", icon: BookOpen },
  { href: "/entreprises", label: "Entreprises & Contacts", icon: Building2 },
  { href: "/apprenants", label: "Apprenants", icon: Users },
  { href: "/sessions", label: "Sessions", icon: Calendar },
  { href: "/parcours", label: "Parcours", icon: Route },
  { href: "/inscriptions", label: "Inscriptions", icon: Inbox },
  { href: "/lieux", label: "Lieux", icon: MapPin },
  { href: "/formateurs", label: "Formateurs", icon: UserCog },
  { href: "/avis-google", label: "Avis Google", icon: Star },
];

const SECONDARY_ITEMS: NavItem[] = [
  { href: "/documents", label: "Documents", icon: FileText, disabled: true },
  { href: "/facturation", label: "Facturation", icon: Receipt, disabled: true },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/parametres/organisation", label: "Paramètres", icon: Settings },
];

function NavGroup({
  items,
  pathname,
  label,
  collapsed,
}: {
  items: NavItem[];
  pathname: string;
  label?: string;
  collapsed: boolean;
}) {
  return (
    <div className="space-y-1">
      {label && !collapsed && (
        <div className="px-5 pt-4 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/60">
          {label}
        </div>
      )}
      {label && collapsed && <div className="pt-3" aria-hidden />}
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        // Tooltip natif : nom du module (+ note "bientôt" si désactivé).
        const tooltip = item.disabled
          ? `${item.label} — bientôt disponible`
          : item.label;

        if (item.disabled) {
          return (
            <div
              key={item.href}
              className={cn(
                "flex items-center rounded-full text-[14px] text-blue-200/40 cursor-not-allowed",
                collapsed
                  ? "justify-center mx-1 h-10 w-10"
                  : "gap-3 px-5 py-3",
              )}
              title={tooltip}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              {!collapsed && (
                <>
                  <span>{item.label}</span>
                  <span className="ml-auto text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-950/50 text-blue-300/60">
                    Bientôt
                  </span>
                </>
              )}
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            title={tooltip}
            className={cn(
              "group relative flex items-center rounded-full text-[14px] transition-all",
              collapsed
                ? "justify-center mx-1 h-10 w-10"
                : "gap-3 px-5 py-3",
              isActive
                ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/30"
                : "text-blue-50/80 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-transform",
                isActive ? "" : "group-hover:scale-110",
              )}
              strokeWidth={isActive ? 2.25 : 1.75}
            />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();

  return (
    <nav
      className={cn(
        "flex flex-col gap-1",
        collapsed ? "px-0" : "px-3",
      )}
    >
      <NavGroup
        items={PRIMARY_ITEMS}
        pathname={pathname}
        collapsed={collapsed}
      />
      <div
        className={cn(
          "my-2 h-px bg-cyan-400/15",
          collapsed ? "mx-3" : "mx-5",
        )}
      />
      <NavGroup
        items={SECONDARY_ITEMS}
        pathname={pathname}
        label="À venir"
        collapsed={collapsed}
      />
      <div
        className={cn(
          "my-2 h-px bg-cyan-400/15",
          collapsed ? "mx-3" : "mx-5",
        )}
      />
      <NavGroup
        items={ADMIN_ITEMS}
        pathname={pathname}
        label="Administration"
        collapsed={collapsed}
      />
    </nav>
  );
}
