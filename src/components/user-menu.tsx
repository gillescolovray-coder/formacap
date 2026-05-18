"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type UserMenuProps = {
  displayName: string;
  email: string;
  role?: string;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu({ displayName, email, role }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full flex items-center gap-3 rounded-full p-2.5 text-left hover:bg-white/10 transition-colors">
        <Avatar className="h-9 w-9 ring-2 ring-cyan-400/40">
          <AvatarFallback className="bg-gradient-to-br from-cyan-400 to-blue-500 text-white text-xs font-bold">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate text-white">
            {displayName}
          </p>
          <p className="text-xs text-cyan-200/70 truncate">{email}</p>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-cyan-200/60 shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2 flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{displayName}</span>
          <span className="text-xs text-zinc-500 font-normal">{email}</span>
          {role && (
            <span className="text-xs text-blue-600 dark:text-cyan-400 font-medium mt-1 uppercase tracking-wider">
              {role}
            </span>
          )}
        </div>
        <DropdownMenuSeparator />
        <form action={logout} className="p-1">
          <button
            type="submit"
            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Se déconnecter</span>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
