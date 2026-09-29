"use client";

import * as React from "react";
import { useSession, signOut } from "next-auth/react";
import { Search, Bell, Sun, Moon, Mic, Command, LogOut, User, Settings, ChevronDown } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  const userName = session?.user?.name || "User";
  const userEmail = session?.user?.email || "";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const roles = (session?.user as any)?.roles || [];

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="hidden sm:inline font-semibold text-foreground">CRYPTSK Nexus</span>
        <span className="hidden sm:inline text-muted-foreground/40">/</span>
        <span className="hidden sm:inline">Dashboard</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search…"
            className="h-9 w-40 pl-8 text-sm lg:w-64"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-0.5 rounded border bg-muted px-1 text-[10px] text-muted-foreground">
            <Command className="size-2.5" />K
          </kbd>
        </div>

        {/* Voice Assistant */}
        <Button variant="ghost" size="icon" className="size-9" title="Voice Assistant">
          <Mic className="size-4" />
        </Button>

        {/* Theme toggle */}
        <Button variant="ghost" size="icon" className="size-9" title="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="size-9 relative" title="Notifications">
          <Bell className="size-4" />
          <Badge className="absolute -right-0.5 -top-0.5 size-4 rounded-full p-0 text-[8px] justify-center">3</Badge>
        </Button>

        {/* User menu with logout */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2 hover:bg-accent">
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden lg:flex flex-col items-start leading-tight">
                <span className="text-xs font-medium">{userName}</span>
                <span className="text-[10px] text-muted-foreground">
                  {roles[0] || "User"}
                </span>
              </div>
              <ChevronDown className="size-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 cryptsk-scale-in">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
                {roles.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {roles.slice(0, 2).map((r: string) => (
                      <Badge key={r} variant="secondary" className="text-[9px] px-1 py-0">
                        {r}
                      </Badge>
                    ))}
                    {roles.length > 2 && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                        +{roles.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <User className="mr-2 size-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="mr-2 size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-rose-600 dark:text-rose-400 focus:text-rose-600 focus:bg-rose-500/10"
              onClick={() => signOut({ redirect: false }).then(() => window.location.href = "/")}
            >
              <LogOut className="mr-2 size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
