"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Search, Bell, Sun, Moon, Menu, Mic, Command } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";

export function AppHeader() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="hidden sm:inline">CRYPTSK Nexus</span>
        <span className="hidden sm:inline text-muted-foreground/40">/</span>
        <span className="font-semibold text-foreground">Dashboard</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
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

        <Button variant="ghost" size="icon" className="size-9" title="Voice Assistant">
          <Mic className="size-4" />
        </Button>

        <Button variant="ghost" size="icon" className="size-9" title="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <Button variant="ghost" size="icon" className="size-9 relative" title="Notifications">
          <Bell className="size-4" />
          <Badge className="absolute -right-0.5 -top-0.5 size-4 rounded-full p-0 text-[8px] justify-center">3</Badge>
        </Button>

        <Avatar className="size-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
            SA
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
