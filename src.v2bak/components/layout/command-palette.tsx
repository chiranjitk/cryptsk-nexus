"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { create } from "zustand";
import {
  LayoutDashboard, Users, Building2, Package, CreditCard, Shield, Activity,
  Radio, KeyRound, Server, Network, Router, Brain, ScrollText, ShieldCheck,
  Settings, UserPlus, FileText, Stethoscope, SunMoon, FileBarChart, IndianRupee,
  FileDown, type LucideIcon,
} from "lucide-react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator, CommandShortcut,
} from "@/components/ui/command";

// ============================================================
// CRYPTSK Nexus — Global Command Palette (⌘K / Ctrl+K)
// Navigation + quick actions in a single cmdk dialog.
// Exposes `useCommandPalette()` so the header (or any component)
// can open it programmatically.
// ============================================================

// ---- Tiny zustand store (open state is global, header opens it) ----
type CommandPaletteState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));

/** Reusable hook — read/steer the palette from anywhere */
export function useCommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const toggle = useCommandPaletteStore((s) => s.toggle);
  return { open, setOpen, toggle };
}

// ---- Navigation registry (mirrors the sidebar views) ----
type PaletteNavItem = { title: string; href: string; icon: LucideIcon };

const NAV_ITEMS: PaletteNavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Users", href: "/?view=users", icon: Users },
  { title: "Customers", href: "/?view=customers", icon: Building2 },
  { title: "Products", href: "/?view=products", icon: Package },
  { title: "Billing", href: "/?view=billing", icon: CreditCard },
  { title: "Policies", href: "/?view=policies", icon: Shield },
  { title: "Sessions", href: "/?view=sessions", icon: Activity },
  { title: "RADIUS Accounting", href: "/?view=radius-acct", icon: Radio },
  { title: "RADIUS Post-Auth", href: "/?view=radius-postauth", icon: KeyRound },
  { title: "NAS", href: "/?view=nas", icon: Server },
  { title: "Network", href: "/?view=network", icon: Network },
  { title: "VPP Gateway", href: "/?view=vpp", icon: Router },
  { title: "Report Center", href: "/?view=reports", icon: FileBarChart },
  { title: "Revenue & Collection Report", href: "/?view=reports&tab=revenue", icon: IndianRupee },
  { title: "Usage & Bandwidth Report", href: "/?view=reports&tab=usage", icon: Activity },
  { title: "Compliance & SLA Report", href: "/?view=reports&tab=sla", icon: ShieldCheck },
  { title: "Data Export (CSV)", href: "/?view=reports&tab=export", icon: FileDown },
  { title: "AI Assistant", href: "/?view=ai", icon: Brain },
  { title: "Audit Log", href: "/?view=audit", icon: ScrollText },
  { title: "Roles", href: "/?view=roles", icon: ShieldCheck },
  { title: "Administration", href: "/?view=admin", icon: Settings },
];

function PaletteHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.split(" ").map((k, i) => (
        <kbd
          key={i}
          className="rounded border bg-muted px-1 font-mono text-[10px] leading-4 text-muted-foreground"
        >
          {k}
        </kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const toggle = useCommandPaletteStore((s) => s.toggle);

  // Single global keydown listener — ⌘K / Ctrl+K toggles the palette.
  // (The header owns ⌘⇧D for theme; this listener owns ⌘K only, so the
  // two never double-fire.)
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  // Navigate like the sidebar does (push the view URL), then refresh
  // so server components / panels pick up fresh data.
  const navigate = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
      router.refresh();
    },
    [router, setOpen]
  );

  const toggleTheme = React.useCallback(() => {
    setOpen(false);
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme, setOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.title} ${item.href}`}
              onSelect={() => navigate(item.href)}
            >
              <item.icon className="size-4" />
              <span>{item.title}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                {item.href}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          <CommandItem value="New Customer" onSelect={() => navigate("/?view=customers&new=1")}>
            <UserPlus className="size-4" />
            <span>New Customer</span>
          </CommandItem>
          <CommandItem value="New Invoice" onSelect={() => navigate("/?view=billing&new=1")}>
            <FileText className="size-4" />
            <span>New Invoice</span>
          </CommandItem>
          <CommandItem value="Run AI Diagnosis" onSelect={() => navigate("/?view=ai")}>
            <Stethoscope className="size-4" />
            <span>Run AI Diagnosis</span>
          </CommandItem>
          <CommandItem value="Toggle Theme" onSelect={toggleTheme}>
            <SunMoon className="size-4" />
            <span>Toggle Theme</span>
            <CommandShortcut>⌘⇧D</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>

      {/* Footer hints */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px] text-muted-foreground">
        <PaletteHint keys="↑ ↓" label="navigate" />
        <PaletteHint keys="↵" label="select" />
        <PaletteHint keys="esc" label="close" />
        <span className="ml-auto hidden sm:inline">CRYPTSK Nexus</span>
      </div>
    </CommandDialog>
  );
}
