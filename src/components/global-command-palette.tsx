"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Command,
  LayoutDashboard,
  Users,
  CreditCard,
  Receipt,
  Banknote,
  Router,
  Activity,
  Shield,
  Network,
  Wifi,
  Globe,
  Server,
  AlertTriangle,
  PhoneCall,
  Wrench,
  UserCheck,
  HardHat,
  Package,
  AlertOctagon,
  UserPlus,
  Store,
  FileText,
  Ticket,
  TrendingUp,
  BarChart3,
  HandCoins,
  Clock,
  Calculator,
  Gift,
  Brain,
  Stethoscope,
  BellRing,
  Target,
  MessageCircle,
  Building,
  Settings,
  MapPin,
  Box,
  Megaphone,
  Bell,
  Key,
  ClipboardList,
  Database,
  Plug,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";

// ─── Types ──────────────────────────────────────────────────────

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: "pages" | "recent" | "actions";
  section: string;
  action?: () => void;
}

// ─── Page definitions (mirrors PAGE_MAP from page.tsx) ─────────

const PAGE_DEFINITIONS: {
  label: string;
  description: string;
  icon: React.ReactNode;
  section: string;
}[] = [
  // MAIN
  { label: "Dashboard", description: "Overview & key metrics", icon: <LayoutDashboard className="size-4" />, section: "MAIN" },
  { label: "Subscribers", description: "Manage customer accounts", icon: <Users className="size-4" />, section: "MAIN" },
  { label: "Plans", description: "Internet plans & pricing", icon: <CreditCard className="size-4" />, section: "MAIN" },
  { label: "Billing", description: "Bills & billing cycles", icon: <Receipt className="size-4" />, section: "MAIN" },
  { label: "Payments", description: "Payment collection & tracking", icon: <Banknote className="size-4" />, section: "MAIN" },
  // NETWORK
  { label: "Devices", description: "Network device management", icon: <Router className="size-4" />, section: "NETWORK" },
  { label: "Bandwidth", description: "Bandwidth monitoring & graphs", icon: <Activity className="size-4" />, section: "NETWORK" },
  { label: "AAA/RADIUS", description: "Authentication & authorization", icon: <Shield className="size-4" />, section: "NETWORK" },
  { label: "FTTH/GPON", description: "Fiber optic network management", icon: <Network className="size-4" />, section: "NETWORK" },
  { label: "Sessions", description: "Active subscriber sessions", icon: <Wifi className="size-4" />, section: "NETWORK" },
  { label: "MultiWAN", description: "Multiple WAN link management", icon: <Globe className="size-4" />, section: "NETWORK" },
  { label: "IPAM", description: "IP address management", icon: <Server className="size-4" />, section: "NETWORK" },
  { label: "Hotspot", description: "Hotspot management & config", icon: <Wifi className="size-4" />, section: "NETWORK" },
  { label: "Network Alerts", description: "Alert rules & notifications", icon: <AlertTriangle className="size-4" />, section: "NETWORK" },
  // OPERATIONS
  { label: "Complaints", description: "Customer complaints & tickets", icon: <PhoneCall className="size-4" />, section: "OPERATIONS" },
  { label: "Technicians", description: "Field technician management", icon: <Wrench className="size-4" />, section: "OPERATIONS" },
  { label: "Agents", description: "Collection agent management", icon: <UserCheck className="size-4" />, section: "OPERATIONS" },
  { label: "Installations", description: "Installation scheduling", icon: <HardHat className="size-4" />, section: "OPERATIONS" },
  { label: "Inventory", description: "Equipment & warehouse stock", icon: <Package className="size-4" />, section: "OPERATIONS" },
  { label: "Incidents", description: "Network incident tracking", icon: <AlertOctagon className="size-4" />, section: "OPERATIONS" },
  { label: "Leads", description: "Sales leads & pipeline", icon: <UserPlus className="size-4" />, section: "OPERATIONS" },
  { label: "Reseller", description: "Reseller & partner management", icon: <Store className="size-4" />, section: "OPERATIONS" },
  // FINANCE
  { label: "Invoices", description: "Invoice generation & management", icon: <FileText className="size-4" />, section: "FINANCE" },
  { label: "Vouchers", description: "Voucher creation & tracking", icon: <Ticket className="size-4" />, section: "FINANCE" },
  { label: "Revenue Reports", description: "Revenue analytics & trends", icon: <TrendingUp className="size-4" />, section: "FINANCE" },
  { label: "Reports", description: "Comprehensive reports & analytics", icon: <BarChart3 className="size-4" />, section: "FINANCE" },
  { label: "Collection", description: "Payment collection tracking", icon: <HandCoins className="size-4" />, section: "FINANCE" },
  { label: "Due Recovery", description: "Overdue payment recovery", icon: <Clock className="size-4" />, section: "FINANCE" },
  { label: "GST/Tax", description: "GST compliance & tax reports", icon: <Calculator className="size-4" />, section: "FINANCE" },
  { label: "Referral", description: "Referral & loyalty programs", icon: <Gift className="size-4" />, section: "FINANCE" },
  // AI INTELLIGENCE
  { label: "AI Advisor", description: "AI-powered business insights", icon: <Brain className="size-4" />, section: "AI INTELLIGENCE" },
  { label: "AI Diagnosis", description: "AI network diagnostics", icon: <Stethoscope className="size-4" />, section: "AI INTELLIGENCE" },
  { label: "Churn Alerts", description: "Predictive churn detection", icon: <BellRing className="size-4" />, section: "AI INTELLIGENCE" },
  { label: "Competitor Intel", description: "Competitor analysis & tracking", icon: <Target className="size-4" />, section: "AI INTELLIGENCE" },
  { label: "WhatsApp Bot", description: "WhatsApp integration & bot", icon: <MessageCircle className="size-4" />, section: "AI INTELLIGENCE" },
  // SETTINGS
  { label: "ISP Profile", description: "Company profile & settings", icon: <Building className="size-4" />, section: "SETTINGS" },
  { label: "Users", description: "Staff account management", icon: <Settings className="size-4" />, section: "SETTINGS" },
  { label: "Areas", description: "Service area management", icon: <MapPin className="size-4" />, section: "SETTINGS" },
  { label: "Equipment", description: "Equipment categories & models", icon: <Box className="size-4" />, section: "SETTINGS" },
  { label: "Promotions", description: "Promotional offers & campaigns", icon: <Megaphone className="size-4" />, section: "SETTINGS" },
  { label: "Notifications", description: "Notification templates & rules", icon: <Bell className="size-4" />, section: "SETTINGS" },
  { label: "API Keys", description: "API key management", icon: <Key className="size-4" />, section: "SETTINGS" },
  { label: "Audit Log", description: "System audit trail", icon: <ClipboardList className="size-4" />, section: "SETTINGS" },
  { label: "Backup", description: "Data backup & restore", icon: <Database className="size-4" />, section: "SETTINGS" },
  { label: "Integrations", description: "Third-party integrations", icon: <Plug className="size-4" />, section: "SETTINGS" },
  { label: "Knowledge Base", description: "Help articles & FAQ", icon: <BookOpen className="size-4" />, section: "SETTINGS" },
];

// ─── Quick Actions ──────────────────────────────────────────────

const QUICK_ACTIONS: {
  label: string;
  description: string;
  icon: React.ReactNode;
  page: string;
  section: string;
}[] = [
  { label: "Add Subscriber", description: "Register a new customer", icon: <UserPlus className="size-4" />, page: "Subscribers", section: "MAIN" },
  { label: "Generate Invoices", description: "Bulk invoice generation", icon: <FileText className="size-4" />, page: "Invoices", section: "FINANCE" },
  { label: "Raise Complaint", description: "Create a support ticket", icon: <PhoneCall className="size-4" />, page: "Complaints", section: "OPERATIONS" },
  { label: "Collect Payment", description: "Record a payment", icon: <Banknote className="size-4" />, page: "Payments", section: "MAIN" },
];

// ─── Helpers ────────────────────────────────────────────────────

const RECENT_KEY = "cryptsk-command-palette-recent";
const MAX_RECENT = 5;

function getRecentPages(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

function addRecentPage(pageLabel: string) {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentPages().filter((p) => p !== pageLabel);
    recent.unshift(pageLabel);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {
    // ignore
  }
}

/** Simple fuzzy match: every character in query must appear in order in the target. */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Highlight matched characters for display */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      indices.push(i);
      qi++;
    }
  }
  if (indices.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const idx of indices) {
    if (idx > last) {
      parts.push(<span key={`t-${last}`}>{text.slice(last, idx)}</span>);
    }
    parts.push(
      <span key={`m-${idx}`} className="font-semibold text-[#DC2626] dark:text-[#EF4444]">
        {text[idx]}
      </span>
    );
    last = idx + 1;
  }
  if (last < text.length) {
    parts.push(<span key={`e-${last}`}>{text.slice(last)}</span>);
  }
  return <>{parts}</>;
}

// ─── CommandPalette Component ────────────────────────────────────

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndexRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { setCurrentPage } = useAppStore();

  // Build the command items list
  const items = React.useMemo(() => {
    const result: CommandItem[] = [];
    const recentPages = getRecentPages();

    // Recent pages (only show when no query and have recent items)
    if (!query && recentPages.length > 0) {
      for (const label of recentPages) {
        const def = PAGE_DEFINITIONS.find((p) => p.label === label);
        if (def) {
          result.push({
            id: `recent-${label}`,
            label: def.label,
            description: def.description,
            icon: def.icon,
            category: "recent",
            section: def.section,
          });
        }
      }
    }

    // All pages
    for (const def of PAGE_DEFINITIONS) {
      const matchesLabel = fuzzyMatch(query, def.label);
      const matchesDesc = query ? fuzzyMatch(query, def.description) : true;
      const matchesSection = query ? fuzzyMatch(query, def.section) : true;
      if (matchesLabel || matchesDesc || matchesSection) {
        result.push({
          id: `page-${def.label}`,
          label: def.label,
          description: def.description,
          icon: def.icon,
          category: "pages",
          section: def.section,
        });
      }
    }

    // Quick actions (only when query matches)
    const filteredActions = query
      ? QUICK_ACTIONS.filter(
          (a) =>
            fuzzyMatch(query, a.label) ||
            fuzzyMatch(query, a.description)
        )
      : QUICK_ACTIONS;
    for (const action of filteredActions) {
      result.push({
        id: `action-${action.label}`,
        label: action.label,
        description: action.description,
        icon: action.icon,
        category: "actions",
        section: action.section,
        action: () => {
          setCurrentPage(action.page, action.section);
          addRecentPage(action.page);
          onClose();
        },
      });
    }

    return result;
  }, [query, setCurrentPage, onClose]);

  // Reset selection when query changes (inline in setter, not in an effect)
  function handleQueryChange(val: string) {
    setQuery(val);
    selectedIndexRef.current = 0;
    setSelectedIndex(0);
  }

  // Focus input when opened
  useEffect(() => {
    if (open) {
      // Small delay to let animation start
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Handle navigation
  const handleSelect = useCallback(
    (item: CommandItem) => {
      if (item.action) {
        item.action();
      } else if (item.category === "pages" || item.category === "recent") {
        setCurrentPage(item.label, item.section);
        addRecentPage(item.label);
        onClose();
      }
    },
    [setCurrentPage, onClose]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items[selectedIndex]) {
          handleSelect(items[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [items, selectedIndex, handleSelect, onClose]
  );

  // Group items by category for display
  const groupedItems = React.useMemo(() => {
    const groups: { heading: string; items: CommandItem[] }[] = [];
    const recentItems = items.filter((i) => i.category === "recent");
    if (recentItems.length > 0) {
      groups.push({ heading: "Recent", items: recentItems });
    }
    const pageItems = items.filter((i) => i.category === "pages");
    if (pageItems.length > 0) {
      groups.push({ heading: "Pages", items: pageItems });
    }
    const actionItems = items.filter((i) => i.category === "actions");
    if (actionItems.length > 0) {
      groups.push({ heading: "Quick Actions", items: actionItems });
    }
    return groups;
  }, [items]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 dialog-backdrop animate-[fade-in_0.15s_ease]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-[640px] mx-4 bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-dialog-enter"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search className="size-5 text-[#DC2626] dark:text-[#EF4444] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Search pages, actions, or type a command..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted rounded border border-border">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[380px] overflow-y-auto overflow-x-hidden py-2"
          role="listbox"
        >
          {groupedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Sparkles className="size-8 mb-3 opacity-40" />
              <p className="text-sm font-medium">No results found</p>
              <p className="text-xs mt-1 opacity-70">Try a different search term</p>
            </div>
          ) : (
            groupedItems.map((group) => (
              <div key={group.heading}>
                {/* Group heading */}
                <div className="px-4 py-1.5 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  {group.heading}
                </div>
                {/* Group items */}
                {group.items.map((item) => {
                  // Compute the flat index for this item
                  let flatIdx = 0;
                  for (const g of groupedItems) {
                    if (g.heading === group.heading) {
                      const itemIdx = g.items.indexOf(item);
                      flatIdx += itemIdx >= 0 ? itemIdx : 0;
                      break;
                    }
                    flatIdx += g.items.length;
                  }
                  const isSelected = flatIdx === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      data-index={flatIdx}
                      role="option"
                      aria-selected={isSelected}
                      className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors duration-100 ${
                        isSelected
                          ? "bg-[#FEE2E2] dark:bg-[rgba(239,68,68,0.1)]"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                    >
                      {/* Icon */}
                      <div
                        className={`flex items-center justify-center size-8 rounded-lg shrink-0 ${
                          isSelected
                            ? "bg-[#DC2626] dark:bg-[#EF4444] text-white"
                            : "bg-slate-100 dark:bg-slate-800 text-muted-foreground"
                        }`}
                      >
                        {item.icon}
                      </div>
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          <HighlightMatch text={item.label} query={query} />
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {item.description}
                        </div>
                      </div>
                      {/* Section badge */}
                      <span
                        className={`hidden sm:inline-block text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                          isSelected
                            ? "bg-[#DC2626]/10 text-[#DC2626] dark:text-[#EF4444] dark:bg-[#EF4444]/10"
                            : "bg-slate-100 dark:bg-slate-800 text-muted-foreground"
                        }`}
                      >
                        {item.section}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <kbd className="inline-flex items-center justify-center size-5 rounded bg-white dark:bg-slate-700 border border-border text-[10px] shadow-sm">
              <ArrowUp className="size-2.5" />
            </kbd>
            <kbd className="inline-flex items-center justify-center size-5 rounded bg-white dark:bg-slate-700 border border-border text-[10px] shadow-sm">
              <ArrowDown className="size-2.5" />
            </kbd>
            <span className="ml-0.5">Navigate</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded bg-white dark:bg-slate-700 border border-border text-[10px] shadow-sm">
              <CornerDownLeft className="size-2.5" />
            </kbd>
            <span className="ml-0.5">Select</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded bg-white dark:bg-slate-700 border border-border text-[10px] shadow-sm">
              ESC
            </kbd>
            <span className="ml-0.5">Close</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
            <Command className="size-3" />
            <span>K</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CommandPaletteProvider ──────────────────────────────────────

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {children}
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}
