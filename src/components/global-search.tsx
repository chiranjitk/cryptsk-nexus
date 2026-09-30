"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  Search,
  User,
  Phone,
  MapPin,
  Zap,
  X,
  Plus,
  ArrowRight,
  Loader2,
  Wifi,
  WifiOff,
  Pause,
  Clock,
  FileText,
  AlertCircle,
  UserPlus,
  Receipt,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// ─── Types ─────────────────────────────────────────────────────

interface SubscriberResult {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  connectionType: string;
  area: { id: string; name: string } | null;
  plan: { id: string; name: string; priceMonthly: number } | null;
}

interface GlobalSearchProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// ─── Status badge styles ──────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800",
  SUSPENDED: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800",
  PENDING_ACTIVATION: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",
  TRIAL: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-400 dark:border-teal-800",
  DISCONNECTED: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900/50 dark:text-gray-400 dark:border-gray-800",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  PENDING_ACTIVATION: "Pending",
  TRIAL: "Trial",
  DISCONNECTED: "Disconnected",
};

const STATUS_ICONS: Record<string, typeof Wifi> = {
  ACTIVE: Wifi,
  SUSPENDED: WifiOff,
  PENDING_ACTIVATION: Clock,
  TRIAL: Zap,
  DISCONNECTED: Pause,
};

// ─── Quick Actions ────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    label: "Add Subscriber",
    icon: UserPlus,
    section: "SUBSCRIBERS",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-950/30",
  },
  {
    label: "Create Invoice",
    icon: Receipt,
    section: "BILLING",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-950/30",
  },
  {
    label: "New Complaint",
    icon: AlertCircle,
    section: "SUPPORT",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-950/30",
  },
  {
    label: "View Dashboard",
    icon: LayoutGrid,
    section: "MAIN",
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-100 dark:bg-teal-950/30",
  },
];

// ─── Search result skeleton ───────────────────────────────────

function SearchSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <Skeleton className="h-9 w-9 rounded-lg shrink-0 skeleton-wave" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-28 skeleton-wave" />
          <Skeleton className="h-4 w-14 rounded-full skeleton-wave" />
        </div>
        <Skeleton className="h-3 w-36 skeleton-wave" />
        <Skeleton className="h-3 w-24 skeleton-wave" />
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground/20 shrink-0" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export function GlobalSearch({ open: controlledOpen, onOpenChange: controlledOnOpenChange }: GlobalSearchProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { setCurrentPage, setPendingSubscriberAction } = useAppStore();

  // Support both controlled and uncontrolled modes
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      if (controlledOnOpenChange) {
        controlledOnOpenChange(typeof value === "function" ? value(open) : value);
      } else {
        setInternalOpen(value);
      }
    },
    [controlledOnOpenChange, open]
  );

  // Debounce search input by 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setOpen]);

  // Fetch subscribers (top 5 results)
  const { data, isLoading, isError } = useQuery<{
    subscribers: SubscriberResult[];
    total: number;
  }>({
    queryKey: ["subscriber-search", debouncedSearch],
    queryFn: async () => {
      const res = await fetch(
        `/api/subscribers?search=${encodeURIComponent(debouncedSearch)}&limit=5`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: open && debouncedSearch.length > 0,
    staleTime: 10_000,
  });

  const results = data?.subscribers ?? [];
  const totalCount = data?.total ?? 0;
  const hasQuery = search.trim().length > 0;
  const showQuickActions = !hasQuery;
  const showResults = hasQuery && !isLoading;
  const showError = hasQuery && isError;

  // Handle subscriber selection → navigate to subscriber detail
  const handleSelect = useCallback(
    (subscriber: SubscriberResult) => {
      setOpen(false);
      setSearch("");
      setDebouncedSearch("");
      // SPA routing: hand the subscriber id to the Subscribers page,
      // which opens the detail view (hash URLs are not routed in this app)
      setPendingSubscriberAction({ id: subscriber.id, action: "view" });
      setCurrentPage("Subscribers", "SUBSCRIBERS");
      toast.success(`Viewing ${subscriber.name}`);
    },
    [setOpen, setCurrentPage, setPendingSubscriberAction]
  );

  // Handle quick action
  const handleQuickAction = useCallback(
    (action: (typeof QUICK_ACTIONS)[number]) => {
      setOpen(false);
      setSearch("");
      setDebouncedSearch("");
      setCurrentPage(action.label, action.section);
    },
    [setOpen, setCurrentPage]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-lg gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {/* ── Search Input ── */}
        <div className="flex items-center border-b border-border/50 px-4 py-3">
          <Search className="h-4.5 w-4.5 mr-3 text-muted-foreground shrink-0" />
          <Input
            placeholder="Search subscribers, plans, invoices, complaints..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 px-0 h-auto text-sm placeholder:text-muted-foreground/60"
            autoFocus
          />
          {hasQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 ml-2 text-[10px] font-medium text-muted-foreground/50 bg-muted rounded border border-border/50 shrink-0">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>

        <DialogHeader className="sr-only">
          <DialogTitle>Global Search</DialogTitle>
          <DialogDescription>Search subscribers, plans, invoices, and complaints</DialogDescription>
        </DialogHeader>

        {/* ── Results Area ── */}
        <div className="max-h-[400px] overflow-hidden">
          {!hasQuery && (
            /* ── Quick Actions ── */
            <div className="px-4 py-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Quick Actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors text-left group"
                  >
                    <div className={cn("p-2 rounded-lg", action.bg)}>
                      <action.icon className={cn("h-4 w-4", action.color)} />
                    </div>
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {action.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLoading && hasQuery && (
            /* ── Loading Skeleton ── */
            <div className="py-2 space-y-0.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
                Searching subscribers...
              </p>
              <SearchSkeleton />
              <SearchSkeleton />
              <SearchSkeleton />
              <SearchSkeleton />
              <SearchSkeleton />
            </div>
          )}

          {showError && (
            /* ── Error State ── */
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 text-red-400 mb-3">
                <X className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">Search failed</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Please check your connection and try again
              </p>
            </div>
          )}

          {showResults && results.length === 0 && (
            /* ── Empty State ── */
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <div className="p-3 rounded-2xl bg-muted/50 text-muted-foreground/40 mb-3">
                <Search className="h-8 w-8" />
              </div>
              <p className="text-sm font-medium">No results found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                No results for &ldquo;{search}&rdquo;
              </p>
              <button
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                }}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Clear search
              </button>
            </div>
          )}

          {showResults && results.length > 0 && (
            <div>
              {/* ── Subscribers Section ── */}
              <div>
                <div className="flex items-center justify-between px-4 py-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Subscribers
                  </p>
                  {totalCount > 5 && (
                    <span className="text-[10px] text-muted-foreground/60">
                      {totalCount} found — showing top 5
                    </span>
                  )}
                </div>
                <ScrollArea className="max-h-[260px]">
                  <div className="divide-y divide-border/30">
                    {results.map((subscriber) => {
                      const StatusIcon =
                        STATUS_ICONS[subscriber.status] || Wifi;
                      const statusStyle =
                        STATUS_STYLES[subscriber.status] ||
                        STATUS_STYLES.DISCONNECTED;
                      const statusLabel =
                        STATUS_LABELS[subscriber.status] ||
                        subscriber.status;

                      return (
                        <button
                          key={subscriber.id}
                          onClick={() => handleSelect(subscriber)}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/40 transition-colors cursor-pointer group"
                        >
                          {/* Avatar */}
                          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 shrink-0">
                            <User className="h-4 w-4" />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">
                                {subscriber.name}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[9px] px-1.5 py-0 leading-none shrink-0 font-medium h-4",
                                  statusStyle
                                )}
                              >
                                <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                                {statusLabel}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {subscriber.phone}
                              </span>
                              {subscriber.area && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="h-3 w-3" />
                                  {subscriber.area.name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/70">
                              <span className="font-mono text-[10px]">
                                {subscriber.code}
                              </span>
                              {subscriber.plan && (
                                <span className="flex items-center gap-1">
                                  <Zap className="h-3 w-3" />
                                  {subscriber.plan.name}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Arrow */}
                          <ArrowRight className="h-4 w-4 text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground/60 transition-colors" />
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <Separator className="my-1" />

              {/* ── Quick Actions (when searching) ── */}
              <div className="px-4 py-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Quick Actions
                </p>
                <div className="space-y-0.5">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleQuickAction(action)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-left hover:bg-muted/40 transition-colors cursor-pointer group"
                    >
                      <div className={cn("p-1.5 rounded-md", action.bg)}>
                        <action.icon className={cn("h-3.5 w-3.5", action.color)} />
                      </div>
                      <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                        {action.label}
                      </span>
                      <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-border/30 px-4 py-2 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/50">
            Search by name, phone, email, or subscriber code
          </p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
            <kbd className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] bg-muted rounded border border-border/50">
              <span className="text-[10px]">↵</span>
            </kbd>
            <span>to select</span>
            <kbd className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] bg-muted rounded border border-border/50 ml-2">
              <span className="text-[10px]">esc</span>
            </kbd>
            <span>to close</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GlobalSearch;
