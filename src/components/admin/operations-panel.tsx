"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LifeBuoy, HardHat, Package, PackageOpen, Boxes, Plus, Search, AlertOctagon, AlertTriangle,
  ArrowDown, Circle, Clock, Lock, MessageSquare, Play, CheckCircle2, XCircle, CalendarClock,
  CalendarX, Pencil, Send, Loader2, RefreshCw, Trash2, Inbox, Minus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { relTime, formatINR } from "@/lib/format";

// ============================================================
// CRYPTSK Nexus — Operations & Support Panel
// Tabs: Tickets & Complaints · Installations · Inventory
// 100% real data — every number via /api/tickets, /api/installations,
// /api/inventory (Prisma-backed). No mock data.
// ============================================================

type Tab = "tickets" | "installations" | "inventory";

// ---------- style maps ----------

const CATEGORY_STYLES: Record<string, string> = {
  complaint: "border-violet-500/30 text-violet-600",
  technical: "border-cyan-500/30 text-cyan-600",
  billing: "border-amber-500/30 text-amber-600",
  installation: "border-emerald-500/30 text-emerald-600",
  other: "border-slate-400/30 text-slate-500",
};

const PRIORITY_STYLES: Record<string, string> = {
  critical: "border-red-500/40 text-red-600",
  high: "border-orange-500/40 text-orange-600",
  medium: "border-amber-500/40 text-amber-600",
  low: "border-slate-400/40 text-slate-500",
};

const PRIORITY_ICONS: Record<string, typeof AlertOctagon> = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: Circle,
  low: ArrowDown,
};

const TICKET_STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  open: { badge: "border-red-500/30 text-red-600", dot: "bg-red-500 animate-pulse" },
  in_progress: { badge: "border-amber-500/30 text-amber-600", dot: "bg-amber-500" },
  pending: { badge: "border-cyan-500/30 text-cyan-600", dot: "bg-cyan-500" },
  resolved: { badge: "border-emerald-500/30 text-emerald-600", dot: "bg-emerald-500" },
  closed: { badge: "border-slate-400/30 text-slate-500", dot: "bg-slate-400" },
};

const INSTALL_STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  scheduled: { badge: "border-cyan-500/30 text-cyan-600", dot: "bg-cyan-500" },
  in_progress: { badge: "border-amber-500/30 text-amber-600", dot: "bg-amber-500" },
  completed: { badge: "border-emerald-500/30 text-emerald-600", dot: "bg-emerald-500" },
  failed: { badge: "border-red-500/30 text-red-600", dot: "bg-red-500" },
  rescheduled: { badge: "border-violet-500/30 text-violet-600", dot: "bg-violet-500" },
};

const INSTALL_TYPE_STYLES: Record<string, string> = {
  new: "border-emerald-500/30 text-emerald-600",
  upgrade: "border-cyan-500/30 text-cyan-600",
  relocation: "border-violet-500/30 text-violet-600",
  maintenance: "border-amber-500/30 text-amber-600",
};

const INVENTORY_CATEGORY_STYLES: Record<string, string> = {
  router: "border-emerald-500/30 text-emerald-600",
  onu: "border-cyan-500/30 text-cyan-600",
  cable: "border-amber-500/30 text-amber-600",
  tool: "border-violet-500/30 text-violet-600",
  other: "border-slate-400/30 text-slate-500",
};

// Client mirror of the server-side workflow state machine (kept in sync)
const TICKET_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "pending"],
  in_progress: ["pending", "resolved"],
  pending: ["in_progress", "resolved"],
  resolved: ["closed", "open"],
  closed: [],
};

const TRANSITION_LABELS: Record<string, string> = {
  open: "Reopen",
  in_progress: "Start Progress",
  pending: "Mark Pending",
  resolved: "Resolve…",
  closed: "Close Ticket",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open", in_progress: "In Progress", pending: "Pending",
  resolved: "Resolved", closed: "Closed", scheduled: "Scheduled",
  completed: "Completed", failed: "Failed", rescheduled: "Rescheduled", all: "All",
};

// ---------- shared helpers (same patterns as network-panel) ----------

async function apiRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function useDebounced(value: string, delay = 350) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function StatChip({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className={`rounded-md border bg-card px-3 py-2 ${className || ""}`}>
      <div className="text-lg font-semibold tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusFilterBar({ options, value, onChange }: {
  options: { id: string; label: string; count: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Status filter">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            value === o.id ? "border-primary bg-primary text-primary-foreground" : "border-transparent hover:bg-muted"
          }`}
        >
          {o.label}
          <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${value === o.id ? "bg-primary-foreground/20" : "bg-muted"}`}>{o.count}</span>
        </button>
      ))}
    </div>
  );
}

function DeleteRowButton({ label, onConfirm, deleting }: { label: string; onConfirm: () => void; deleting?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          disabled={deleting}
          aria-label={`Delete ${label}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            This will permanently remove it. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10" role="alert">
      <AlertTriangle className="size-8 text-amber-500" />
      <p className="text-sm font-medium">Failed to load</p>
      <p className="text-xs text-muted-foreground">The request failed. Check your connection and try again.</p>
      <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={onRetry}>
        <RefreshCw className="size-3.5" /> Retry
      </Button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint, action }: {
  icon: typeof Inbox; title: string; hint: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-center text-xs text-muted-foreground">{hint}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function AvatarInitials({ name }: { name: string }) {
  const initials = name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary" aria-hidden="true">
      {initials || "?"}
    </div>
  );
}

function StatusBadge({ status, styles }: { status: string; styles: Record<string, { badge: string; dot: string }> }) {
  const s = styles[status] || styles.closed;
  return (
    <Badge variant="outline" className={`gap-1.5 text-[10px] ${s.badge}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const Icon = PRIORITY_ICONS[priority] || Circle;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] capitalize ${PRIORITY_STYLES[priority] || PRIORITY_STYLES.low}`}>
      <Icon className={`size-3 ${priority === "critical" ? "animate-pulse text-red-500" : ""}`} aria-hidden="true" />
      {priority}
    </Badge>
  );
}

function SlaCell({ slaDueAt, status }: { slaDueAt?: string | null; status: string }) {
  if (!slaDueAt || ["resolved", "closed"].includes(status)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const diff = new Date(slaDueAt).getTime() - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const span = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return diff >= 0 ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-emerald-600">
      <Clock className="size-3" aria-hidden="true" /> due in {span}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-red-600">
      <AlertTriangle className="size-3" aria-hidden="true" /> overdue {span}
    </span>
  );
}

function toLocalInput(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Native select styled to match the platform
function StyledSelect({ value, onChange, children, ariaLabel, disabled, className }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
  ariaLabel: string; disabled?: boolean; className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className || ""}`}
    >
      {children}
    </select>
  );
}

// ============================================================
// Panel root
// ============================================================

export function OperationsPanel() {
  const [tab, setTab] = React.useState<Tab>("tickets");

  const tabs: { id: Tab; label: string; icon: typeof LifeBuoy }[] = [
    { id: "tickets", label: "Tickets & Complaints", icon: LifeBuoy },
    { id: "installations", label: "Installations", icon: HardHat },
    { id: "inventory", label: "Inventory", icon: Package },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operations &amp; Support</h1>
        <p className="text-sm text-muted-foreground">
          Support tickets with SLA tracking · field installation jobs · warehouse &amp; van stock
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "tickets" && <TicketsTab />}
      {tab === "installations" && <InstallationsTab />}
      {tab === "inventory" && <InventoryTab />}
    </div>
  );
}

// ============================================================
// Tab 1 — Tickets & Complaints
// ============================================================

const EMPTY_TICKET_STATS = { open: 0, inProgress: 0, pending: 0, resolved: 0, closed: 0, critical: 0, unassigned: 0 };

function TicketsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = React.useState("all");
  const [priority, setPriority] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebounced(searchInput);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);

  const query = new URLSearchParams();
  if (status !== "all") query.set("status", status);
  if (priority) query.set("priority", priority);
  if (category) query.set("category", category);
  if (search) query.set("search", search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tickets", status, priority, category, search],
    queryFn: () => apiRequest(`/api/tickets?${query.toString()}`),
    refetchInterval: 30000,
  });

  const tickets: any[] = data?.tickets || [];
  const stats = data?.stats || EMPTY_TICKET_STATS;

  const statusOptions = [
    { id: "all", label: "All", count: stats.open + stats.inProgress + stats.pending + stats.resolved + stats.closed },
    { id: "open", label: "Open", count: stats.open },
    { id: "in_progress", label: "In Progress", count: stats.inProgress },
    { id: "pending", label: "Pending", count: stats.pending },
    { id: "resolved", label: "Resolved", count: stats.resolved },
    { id: "closed", label: "Closed", count: stats.closed },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="size-4 text-primary" /> Support Tickets &amp; Complaints
          </CardTitle>
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> New Ticket
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {/* Live queue stats */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Ticket queue statistics">
          <StatChip label="Open" value={stats.open} className="border-red-500/30 bg-red-500/5" />
          <StatChip label="In Progress" value={stats.inProgress} className="border-amber-500/30 bg-amber-500/5" />
          <StatChip label="Pending" value={stats.pending} className="border-cyan-500/30 bg-cyan-500/5" />
          <StatChip label="Resolved" value={stats.resolved} className="border-emerald-500/30 bg-emerald-500/5" />
          <StatChip
            label="Critical"
            value={stats.critical}
            className={`border-red-500/40 bg-red-500/10 ${stats.critical > 0 ? "animate-pulse text-red-600" : ""}`}
          />
          <StatChip label="Unassigned" value={stats.unassigned} className="border-slate-400/30 bg-slate-500/5" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search subject, ticket # or customer…"
              className="h-9 pl-8"
              aria-label="Search tickets"
            />
          </div>
          <StyledSelect value={priority} onChange={setPriority} ariaLabel="Filter by priority" className="w-[130px]">
            <option value="">All priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </StyledSelect>
          <StyledSelect value={category} onChange={setCategory} ariaLabel="Filter by category" className="w-[130px]">
            <option value="">All categories</option>
            <option value="complaint">Complaint</option>
            <option value="technical">Technical</option>
            <option value="billing">Billing</option>
            <option value="installation">Installation</option>
            <option value="other">Other</option>
          </StyledSelect>
        </div>

        <StatusFilterBar options={statusOptions} value={status} onChange={setStatus} />

        {/* Table */}
        {isError ? <ErrorState onRetry={() => refetch()} /> : isLoading ? <TableSkeleton /> : (
          <div className="max-h-[540px] overflow-auto cryptsk-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead className="min-w-[220px]">Subject</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow
                    key={t.id}
                    onClick={() => setDetailId(t.id)}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell className="font-mono text-xs font-semibold">{t.ticketNumber}</TableCell>
                    <TableCell>
                      <div className="max-w-[280px] truncate text-sm font-medium" title={t.subject}>{t.subject}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[9px] capitalize ${CATEGORY_STYLES[t.category] || CATEGORY_STYLES.other}`}>
                          {t.category}
                        </Badge>
                        {(t._count?.replies || 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <MessageSquare className="size-3" aria-hidden="true" /> {t._count.replies}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                    <TableCell>
                      {t.customer ? (
                        <div className="flex items-center gap-1.5">
                          <AvatarInitials name={t.customer.displayName} />
                          <span className="max-w-[140px] truncate text-xs" title={t.customer.customerCode}>{t.customer.displayName}</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {t.assignee ? (
                        <span className="text-xs">{t.assignee.name || t.assignee.email}</span>
                      ) : (
                        <span className="rounded-full border border-dashed border-slate-400/40 px-1.5 py-0.5 text-[10px] text-slate-500">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell><SlaCell slaDueAt={t.slaDueAt} status={t.status} /></TableCell>
                    <TableCell><StatusBadge status={t.status} styles={TICKET_STATUS_STYLES} /></TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{relTime(t.createdAt)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost" size="icon" className="size-8"
                        onClick={() => setDetailId(t.id)}
                        aria-label={`Open ticket ${t.ticketNumber}`}
                      >
                        <MessageSquare className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {tickets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <EmptyState
                        icon={Inbox}
                        title="No tickets found"
                        hint="No support tickets match the current filters. Create a ticket to start tracking a customer issue."
                        action={<Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}><Plus className="size-3.5" /> New Ticket</Button>}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {detailId && (
        <TicketDetailDialog
          ticketId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
      {showCreate && (
        <CreateTicketDialog
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["tickets"] }); }}
        />
      )}
    </Card>
  );
}

// ---------- ticket detail dialog ----------

function TicketDetailDialog({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [replyText, setReplyText] = React.useState("");
  const [isInternal, setIsInternal] = React.useState(false);
  const [showResolve, setShowResolve] = React.useState(false);
  const [resolutionText, setResolutionText] = React.useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => apiRequest(`/api/tickets/${ticketId}`),
    refetchInterval: 30000,
  });
  const ticket = data?.ticket;
  const invoiceCount: number = data?.invoiceCount ?? 0;

  // Assignee candidates (real user list; degrades gracefully if not permitted)
  const usersQuery = useQuery({
    queryKey: ["users", "assignees"],
    queryFn: () => apiRequest("/api/users?limit=100"),
    staleTime: 60000,
    retry: 1,
  });
  const users: any[] = (usersQuery.data?.users || []).filter((u: any) => u.status !== "disabled");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  const patchMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest(`/api/tickets/${ticketId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: (_d, payload: Record<string, unknown>) => {
      toast({ title: "Ticket updated", description: payload.status ? `Status changed to ${STATUS_LABELS[payload.status as string] || payload.status}` : undefined });
      invalidate();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const replyMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/tickets/${ticketId}/replies`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText, isInternal }),
      }),
    onSuccess: () => {
      toast({ title: isInternal ? "Internal note added" : "Reply posted" });
      setReplyText("");
      setIsInternal(false);
      invalidate();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/api/tickets/${ticketId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Ticket deleted" });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const transitions = ticket ? TICKET_TRANSITIONS[ticket.status] || [] : [];
  const busy = patchMutation.isPending || replyMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto cryptsk-scrollbar" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Ticket {ticket?.ticketNumber ?? ""}</DialogTitle>
        {isLoading || !ticket ? (
          <div className="space-y-3 py-4" aria-busy="true">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-primary">{ticket.ticketNumber}</span>
                <StatusBadge status={ticket.status} styles={TICKET_STATUS_STYLES} />
                <PriorityBadge priority={ticket.priority} />
                <Badge variant="outline" className={`text-[10px] capitalize ${CATEGORY_STYLES[ticket.category] || CATEGORY_STYLES.other}`}>
                  {ticket.category}
                </Badge>
              </div>
              <DialogTitle className="text-left text-lg leading-snug">{ticket.subject}</DialogTitle>
              <DialogDescription className="text-left text-xs">
                Opened {relTime(ticket.createdAt)} · {ticket._count?.replies || 0} replies
                {ticket.customer ? ` · Customer invoices: ${invoiceCount}` : ""}
              </DialogDescription>
            </DialogHeader>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-3">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Customer</div>
                <div className="mt-0.5 font-medium">{ticket.customer?.displayName || "—"}</div>
                {ticket.customer?.customerCode && <div className="font-mono text-[10px] text-muted-foreground">{ticket.customer.customerCode}</div>}
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Subscriber</div>
                <div className="mt-0.5 font-mono">{ticket.subscriber?.radiusUsername || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Assignee</div>
                <div className="mt-0.5 font-medium">{ticket.assignee ? (ticket.assignee.name || ticket.assignee.email) : "Unassigned"}</div>
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">SLA Due</div>
                <div className="mt-0.5"><SlaCell slaDueAt={ticket.slaDueAt} status={ticket.status} /></div>
                {ticket.slaDueAt && <div className="text-[10px] text-muted-foreground">{new Date(ticket.slaDueAt).toLocaleString("en-IN")}</div>}
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Resolved</div>
                <div className="mt-0.5">{ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleString("en-IN") : "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Last Update</div>
                <div className="mt-0.5">{relTime(ticket.updatedAt)}</div>
              </div>
            </div>

            {/* Description */}
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description</div>
              <p className="whitespace-pre-wrap rounded-md border p-3 text-sm">{ticket.description}</p>
              {ticket.resolution && (
                <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">Resolution</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{ticket.resolution}</p>
                </div>
              )}
            </div>

            {/* Reply thread */}
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Conversation ({ticket.replies.length})
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1 cryptsk-scrollbar" aria-label="Ticket conversation">
                {ticket.replies.length === 0 && (
                  <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    No replies yet — use the composer below to respond or add an internal note.
                  </p>
                )}
                {ticket.replies.map((r: any) => (
                  <div key={r.id} className={`rounded-md border p-3 ${r.isInternal ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/30"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        {r.isInternal && <Lock className="size-3 text-amber-600" aria-hidden="true" />}
                        {r.authorName}
                        {r.isInternal && <span className="text-[9px] font-medium uppercase tracking-wide text-amber-600">Internal note</span>}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{relTime(r.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90">{r.message}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Reply composer */}
            <div className="space-y-2 rounded-md border p-3">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={isInternal ? "Write an internal note (not visible to the customer)…" : "Write a reply to the customer…"}
                rows={3}
                aria-label="Reply message"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="internal-note"
                    checked={isInternal}
                    onCheckedChange={(v) => setIsInternal(v === true)}
                  />
                  <Label htmlFor="internal-note" className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3" aria-hidden="true" /> Internal note
                  </Label>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!replyText.trim() || replyMutation.isPending}
                  onClick={() => replyMutation.mutate()}
                >
                  {replyMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  {isInternal ? "Add Note" : "Send Reply"}
                </Button>
              </div>
            </div>

            {/* Action bar — workflow-aware */}
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <StyledSelect
                value=""
                onChange={(v) => {
                  if (!v) return;
                  if (v === "resolved") { setResolutionText(""); setShowResolve(true); return; }
                  patchMutation.mutate({ status: v });
                }}
                ariaLabel="Change ticket status"
                disabled={busy || transitions.length === 0}
                className="w-[160px]"
              >
                <option value="">{transitions.length === 0 ? "No transitions available" : "Change status…"}</option>
                {transitions.map((s) => (
                  <option key={s} value={s}>{TRANSITION_LABELS[s] || STATUS_LABELS[s] || s}</option>
                ))}
              </StyledSelect>

              <StyledSelect
                value={ticket.assignedTo || "unassigned"}
                onChange={(v) => patchMutation.mutate({ assignedTo: v === "unassigned" ? null : v })}
                ariaLabel="Assign ticket to user"
                disabled={busy || patchMutation.isPending}
                className="w-[200px]"
              >
                <option value="unassigned">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
                {users.length === 0 && <option value="" disabled>User list unavailable</option>}
              </StyledSelect>

              {ticket.status === "closed" && (
                <div className="ml-auto">
                  <DeleteRowButton label={`ticket ${ticket.ticketNumber}`} onConfirm={() => deleteMutation.mutate()} deleting={deleteMutation.isPending} />
                </div>
              )}
            </div>

            {/* Resolve dialog */}
            {showResolve && (
              <Dialog open onOpenChange={(open) => !open && setShowResolve(false)}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-base">Resolve {ticket.ticketNumber}</DialogTitle>
                    <DialogDescription className="text-xs">
                      A resolution note is required. It will be attached to the ticket and the SLA clock stops.
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    value={resolutionText}
                    onChange={(e) => setResolutionText(e.target.value)}
                    placeholder="Describe how the issue was resolved…"
                    rows={4}
                    aria-label="Resolution note"
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowResolve(false)}>Cancel</Button>
                    <Button
                      className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={!resolutionText.trim() || patchMutation.isPending}
                      onClick={() => {
                        patchMutation.mutate(
                          { status: "resolved", resolution: resolutionText },
                          { onSuccess: () => setShowResolve(false) }
                        );
                      }}
                    >
                      {patchMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                      Mark Resolved
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- create ticket dialog ----------

function CreateTicketDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = React.useState("");
  const [subscriberId, setSubscriberId] = React.useState("");
  const [category, setCategory] = React.useState("complaint");
  const [priority, setPriority] = React.useState("medium");
  const [subject, setSubject] = React.useState("");
  const [description, setDescription] = React.useState("");

  const customersQuery = useQuery({
    queryKey: ["customers", "select"],
    queryFn: () => apiRequest("/api/customers"),
    staleTime: 60000,
  });
  const customers: any[] = customersQuery.data?.customers || [];

  const subscribersQuery = useQuery({
    queryKey: ["subscribers", "for-customer", customerId],
    queryFn: () => apiRequest(`/api/subscribers?customerId=${customerId}&limit=100`),
    enabled: !!customerId,
    staleTime: 60000,
  });
  const subscribers: any[] = subscribersQuery.data?.subscribers || [];

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerId || undefined,
          subscriberId: subscriberId || undefined,
          category, priority, subject, description,
        }),
      }),
    onSuccess: (res: any) => {
      toast({ title: "Ticket created", description: `${res.ticket.ticketNumber} · SLA due ${new Date(res.ticket.slaDueAt).toLocaleString("en-IN")}` });
      onSaved();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto cryptsk-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-base">New Support Ticket</DialogTitle>
          <DialogDescription className="text-xs">
            Ticket number and SLA deadline are assigned automatically based on priority
            (critical 4h · high 8h · medium 24h · low 72h).
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer</Label>
              <StyledSelect
                value={customerId}
                onChange={(v) => { setCustomerId(v); setSubscriberId(""); }}
                ariaLabel="Select customer"
                className="w-full"
              >
                <option value="">— None —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.displayName} ({c.customerCode})</option>
                ))}
              </StyledSelect>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subscriber</Label>
              <StyledSelect
                value={subscriberId}
                onChange={setSubscriberId}
                ariaLabel="Select subscriber"
                disabled={!customerId}
                className="w-full"
              >
                <option value="">— None —</option>
                {subscribers.map((s) => (
                  <option key={s.id} value={s.id}>{s.radiusUsername}{s.fullName ? ` (${s.fullName})` : ""}</option>
                ))}
              </StyledSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <StyledSelect value={category} onChange={setCategory} ariaLabel="Ticket category" className="w-full">
                <option value="complaint">Complaint</option>
                <option value="technical">Technical</option>
                <option value="billing">Billing</option>
                <option value="installation">Installation</option>
                <option value="other">Other</option>
              </StyledSelect>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <StyledSelect value={priority} onChange={setPriority} ariaLabel="Ticket priority" className="w-full">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </StyledSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="Brief summary of the issue" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4}
              placeholder="Describe the issue in detail…" aria-label="Ticket description" />
            <p className="text-[10px] text-muted-foreground">The description becomes the ticket body shown in the conversation thread.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending} className="gap-1.5">
              {createMutation.isPending && <Loader2 className="size-3.5 animate-spin" />} Create Ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Tab 2 — Installations
// ============================================================

const EMPTY_INSTALL_STATS = { scheduled: 0, inProgress: 0, completed: 0, failed: 0, rescheduled: 0, today: 0 };

function InstallationsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = React.useState("all");
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebounced(searchInput);
  const [showCreate, setShowCreate] = React.useState(false);
  const [rescheduleTarget, setRescheduleTarget] = React.useState<any>(null);

  const query = new URLSearchParams();
  if (status !== "all") query.set("status", status);
  if (search) query.set("search", search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["installations", status, search],
    queryFn: () => apiRequest(`/api/installations?${query.toString()}`),
    refetchInterval: 60000,
  });

  const installations: any[] = data?.installations || [];
  const stats = data?.stats || EMPTY_INSTALL_STATS;

  const patchMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiRequest(`/api/installations/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: (_d, vars) => {
      const s = vars.payload.status as string | undefined;
      toast({ title: "Installation updated", description: s ? `Status: ${STATUS_LABELS[s] || s}` : "Schedule changed" });
      qc.invalidateQueries({ queryKey: ["installations"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/installations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Installation deleted" });
      qc.invalidateQueries({ queryKey: ["installations"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const statusOptions = [
    { id: "all", label: "All", count: stats.scheduled + stats.inProgress + stats.completed + stats.failed + stats.rescheduled },
    { id: "scheduled", label: "Scheduled", count: stats.scheduled },
    { id: "in_progress", label: "In Progress", count: stats.inProgress },
    { id: "completed", label: "Completed", count: stats.completed },
    { id: "failed", label: "Failed", count: stats.failed },
    { id: "rescheduled", label: "Rescheduled", count: stats.rescheduled },
  ];

  const actionBtn = "size-8";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardHat className="size-4 text-primary" /> Field Installations
          </CardTitle>
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> Schedule Installation
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Installation statistics">
          <StatChip label="Scheduled" value={stats.scheduled} className="border-cyan-500/30 bg-cyan-500/5" />
          <StatChip label="In Progress" value={stats.inProgress} className="border-amber-500/30 bg-amber-500/5" />
          <StatChip label="Completed" value={stats.completed} className="border-emerald-500/30 bg-emerald-500/5" />
          <StatChip label="Failed" value={stats.failed} className="border-red-500/30 bg-red-500/5" />
          <StatChip label="Today" value={stats.today} className="border-violet-500/30 bg-violet-500/5" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search install # or technician…"
              className="h-9 pl-8"
              aria-label="Search installations"
            />
          </div>
        </div>

        <StatusFilterBar options={statusOptions} value={status} onChange={setStatus} />

        {isError ? <ErrorState onRetry={() => refetch()} /> : isLoading ? <TableSkeleton /> : (
          <div className="max-h-[540px] overflow-auto cryptsk-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Install #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Subscriber</TableHead>
                  <TableHead>Technician</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-[140px]">Notes</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installations.map((i) => (
                  <TableRow key={i.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-xs font-semibold">{i.installNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] capitalize ${INSTALL_TYPE_STYLES[i.type] || CATEGORY_STYLES.other}`}>
                        {i.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {i.customer ? (
                        <div className="flex items-center gap-1.5">
                          <AvatarInitials name={i.customer.displayName} />
                          <span className="max-w-[130px] truncate text-xs">{i.customer.displayName}</span>
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{i.subscriber?.radiusUsername || "—"}</TableCell>
                    <TableCell>
                      {i.technicianName ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <HardHat className="size-3 text-muted-foreground" aria-hidden="true" /> {i.technicianName}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">Unassigned</span>}
                    </TableCell>
                    <TableCell>
                      <div className="whitespace-nowrap text-xs">{new Date(i.scheduledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} {new Date(i.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
                      <div className="text-[10px] text-muted-foreground">{relTime(i.scheduledAt)}</div>
                    </TableCell>
                    <TableCell><StatusBadge status={i.status} styles={INSTALL_STATUS_STYLES} /></TableCell>
                    <TableCell><span className="line-clamp-1 max-w-[140px] text-xs text-muted-foreground" title={i.notes || ""}>{i.notes || "—"}</span></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {["scheduled", "rescheduled"].includes(i.status) && (
                          <Button variant="ghost" size="icon" className={actionBtn} aria-label={`Start work on ${i.installNumber}`}
                            disabled={patchMutation.isPending}
                            onClick={() => patchMutation.mutate({ id: i.id, payload: { status: "in_progress" } })}>
                            <Play className="size-3.5 text-amber-600" />
                          </Button>
                        )}
                        {["scheduled", "in_progress", "rescheduled"].includes(i.status) && (
                          <Button variant="ghost" size="icon" className={actionBtn} aria-label={`Mark ${i.installNumber} completed`}
                            disabled={patchMutation.isPending}
                            onClick={() => patchMutation.mutate({ id: i.id, payload: { status: "completed" } })}>
                            <CheckCircle2 className="size-3.5 text-emerald-600" />
                          </Button>
                        )}
                        {["scheduled", "in_progress", "rescheduled"].includes(i.status) && (
                          <Button variant="ghost" size="icon" className={actionBtn} aria-label={`Mark ${i.installNumber} failed`}
                            disabled={patchMutation.isPending}
                            onClick={() => patchMutation.mutate({ id: i.id, payload: { status: "failed" } })}>
                            <XCircle className="size-3.5 text-red-600" />
                          </Button>
                        )}
                        {i.status !== "completed" && (
                          <Button variant="ghost" size="icon" className={actionBtn} aria-label={`Reschedule ${i.installNumber}`}
                            onClick={() => setRescheduleTarget(i)}>
                            <CalendarClock className="size-3.5 text-violet-600" />
                          </Button>
                        )}
                        {["scheduled", "rescheduled", "failed"].includes(i.status) && (
                          <DeleteRowButton label={i.installNumber} onConfirm={() => deleteMutation.mutate(i.id)} deleting={deleteMutation.isPending} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {installations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <EmptyState
                        icon={CalendarX}
                        title="No installations found"
                        hint="No installation jobs match the current filters. Schedule one to dispatch a technician."
                        action={<Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}><Plus className="size-3.5" /> Schedule Installation</Button>}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {showCreate && (
        <CreateInstallationDialog
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["installations"] }); }}
        />
      )}
      {rescheduleTarget && (
        <RescheduleDialog
          installation={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onSaved={() => { setRescheduleTarget(null); qc.invalidateQueries({ queryKey: ["installations"] }); }}
        />
      )}
    </Card>
  );
}

function RescheduleDialog({ installation, onClose, onSaved }: {
  installation: any; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [when, setWhen] = React.useState(toLocalInput(installation.scheduledAt));
  const [notes, setNotes] = React.useState(installation.notes || "");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/installations/${installation.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: new Date(when).toISOString(), status: "rescheduled", notes }),
      }),
    onSuccess: () => {
      toast({ title: `${installation.installNumber} rescheduled`, description: `New slot: ${new Date(when).toLocaleString("en-IN")}` });
      onSaved();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Reschedule {installation.installNumber}</DialogTitle>
          <DialogDescription className="text-xs">Pick a new date &amp; time slot. The job moves to “Rescheduled”.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="reschedule-at">New date &amp; time</Label>
            <Input id="reschedule-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-9" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="reschedule-notes">Notes</Label>
            <Textarea id="reschedule-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Reason / instructions…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="gap-1.5"
            disabled={!when || isNaN(new Date(when).getTime()) || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarClock className="size-3.5" />}
            Reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateInstallationDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = React.useState("");
  const [subscriberId, setSubscriberId] = React.useState("");
  const [type, setType] = React.useState("new");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [technicianName, setTechnicianName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const customersQuery = useQuery({
    queryKey: ["customers", "select"],
    queryFn: () => apiRequest("/api/customers"),
    staleTime: 60000,
  });
  const customers: any[] = customersQuery.data?.customers || [];

  const subscribersQuery = useQuery({
    queryKey: ["subscribers", "for-customer", customerId],
    queryFn: () => apiRequest(`/api/subscribers?customerId=${customerId}&limit=100`),
    enabled: !!customerId,
    staleTime: 60000,
  });
  const subscribers: any[] = subscribersQuery.data?.subscribers || [];

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/installations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId, subscriberId: subscriberId || undefined, type,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          technicianName, address, notes,
        }),
      }),
    onSuccess: (res: any) => {
      toast({ title: "Installation scheduled", description: `${res.installation.installNumber} · ${new Date(res.installation.scheduledAt).toLocaleString("en-IN")}` });
      onSaved();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto cryptsk-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-base">Schedule Installation</DialogTitle>
          <DialogDescription className="text-xs">Dispatch a technician for a new connection, upgrade, relocation or maintenance visit.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          if (!customerId) { toast({ title: "Customer required", description: "Select the customer this installation is for.", variant: "destructive" }); return; }
          if (!scheduledAt) { toast({ title: "Date & time required", description: "Pick a schedule slot for the visit.", variant: "destructive" }); return; }
          createMutation.mutate();
        }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer <span className="text-red-500">*</span></Label>
              <StyledSelect value={customerId} onChange={(v) => { setCustomerId(v); setSubscriberId(""); }} ariaLabel="Select customer" className="w-full">
                <option value="">— Select customer —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.displayName} ({c.customerCode})</option>
                ))}
              </StyledSelect>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subscriber</Label>
              <StyledSelect value={subscriberId} onChange={setSubscriberId} ariaLabel="Select subscriber" disabled={!customerId} className="w-full">
                <option value="">— None —</option>
                {subscribers.map((s) => (
                  <option key={s.id} value={s.id}>{s.radiusUsername}{s.fullName ? ` (${s.fullName})` : ""}</option>
                ))}
              </StyledSelect>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <StyledSelect value={type} onChange={setType} ariaLabel="Installation type" className="w-full">
                <option value="new">New Connection</option>
                <option value="upgrade">Upgrade</option>
                <option value="relocation">Relocation</option>
                <option value="maintenance">Maintenance</option>
              </StyledSelect>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date &amp; time <span className="text-red-500">*</span></Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="h-9" required aria-label="Scheduled date and time" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Technician name</Label>
            <Input value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} placeholder="e.g. Ramesh Kumar" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Site address" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Access instructions, equipment to carry…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending} className="gap-1.5">
              {createMutation.isPending && <Loader2 className="size-3.5 animate-spin" />} Schedule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Tab 3 — Inventory
// ============================================================

const EMPTY_INVENTORY_STATS = { total: 0, lowStock: 0, outOfStock: 0, stockValue: 0 };

function InventoryTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebounced(searchInput);
  const [category, setCategory] = React.useState("");
  const [lowStockOnly, setLowStockOnly] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const [stockTarget, setStockTarget] = React.useState<any>(null);
  const [editTarget, setEditTarget] = React.useState<any>(null);

  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (category) query.set("category", category);
  if (lowStockOnly) query.set("lowStock", "1");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory", search, category, lowStockOnly],
    queryFn: () => apiRequest(`/api/inventory?${query.toString()}`),
    refetchInterval: 60000,
  });

  const items: any[] = data?.items || [];
  const stats = data?.stats || EMPTY_INVENTORY_STATS;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/inventory/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Item deleted" });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="size-4 text-primary" /> Inventory &amp; Spares
          </CardTitle>
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> Add Item
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Inventory statistics">
          <StatChip label="Total Items" value={stats.total} />
          <StatChip label="Low Stock" value={stats.lowStock} className="border-amber-500/30 bg-amber-500/5" />
          <StatChip label="Out of Stock" value={stats.outOfStock} className="border-red-500/30 bg-red-500/5" />
          <StatChip label="Stock Value" value={formatINR(stats.stockValue)} className="border-emerald-500/30 bg-emerald-500/5" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search SKU or name…"
              className="h-9 pl-8"
              aria-label="Search inventory"
            />
          </div>
          <StyledSelect value={category} onChange={setCategory} ariaLabel="Filter by category" className="w-[130px]">
            <option value="">All categories</option>
            <option value="router">Router</option>
            <option value="onu">ONU</option>
            <option value="cable">Cable</option>
            <option value="tool">Tool</option>
            <option value="other">Other</option>
          </StyledSelect>
          <div className="flex items-center gap-2">
            <Switch
              id="low-stock-only"
              checked={lowStockOnly}
              onCheckedChange={setLowStockOnly}
              aria-label="Show low stock items only"
            />
            <Label htmlFor="low-stock-only" className="text-xs text-muted-foreground">Low stock only</Label>
          </div>
        </div>

        {isError ? <ErrorState onRetry={() => refetch()} /> : isLoading ? <TableSkeleton /> : (
          <div className="max-h-[540px] overflow-auto cryptsk-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const low = it.quantity <= it.minQuantity;
                  return (
                    <TableRow key={it.id} className="hover:bg-muted/50">
                      <TableCell className={`border-l-2 py-3 font-mono text-xs font-semibold ${low ? "border-l-amber-500" : "border-l-transparent"}`}>
                        {it.sku}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{it.name}</TableCell>
                      <TableCell>
                        {it.category ? (
                          <Badge variant="outline" className={`text-[10px] capitalize ${INVENTORY_CATEGORY_STYLES[it.category] || CATEGORY_STYLES.other}`}>
                            {it.category}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><StockBar qty={it.quantity} min={it.minQuantity} /></TableCell>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">{it.unitPrice != null ? formatINR(it.unitPrice) : "—"}</TableCell>
                      <TableCell className="text-xs">{it.location || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{relTime(it.updatedAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" className="size-8" aria-label={`Adjust stock for ${it.sku}`} onClick={() => setStockTarget(it)}>
                            <Plus className="size-3.5 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${it.sku}`} onClick={() => setEditTarget(it)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <DeleteRowButton label={it.sku} onConfirm={() => deleteMutation.mutate(it.id)} deleting={deleteMutation.isPending} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState
                        icon={PackageOpen}
                        title="No inventory items"
                        hint={lowStockOnly ? "Good news — nothing is below its low-stock threshold." : "Add routers, ONUs, cable and tools to track warehouse and van stock."}
                        action={<Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}><Plus className="size-3.5" /> Add Item</Button>}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {showCreate && (
        <CreateItemDialog
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["inventory"] }); }}
        />
      )}
      {stockTarget && (
        <StockAdjustDialog
          item={stockTarget}
          onClose={() => setStockTarget(null)}
          onSaved={() => { setStockTarget(null); qc.invalidateQueries({ queryKey: ["inventory"] }); }}
        />
      )}
      {editTarget && (
        <EditItemDialog
          item={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); qc.invalidateQueries({ queryKey: ["inventory"] }); }}
        />
      )}
    </Card>
  );
}

function StockBar({ qty, min }: { qty: number; min: number }) {
  const low = qty <= min;
  const reference = Math.max(min * 2, qty, 1);
  const pct = Math.min(100, Math.round((qty / reference) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className={`w-8 text-right text-xs font-semibold tabular-nums ${low ? "text-red-600" : ""}`}>{qty}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={qty} aria-valuemin={0} aria-valuemax={reference} aria-label={`Stock ${qty} of minimum ${min}`}>
        <div className={`h-full rounded-full transition-all ${low ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-[10px] text-muted-foreground">min {min}</span>
    </div>
  );
}

function StockAdjustDialog({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [delta, setDelta] = React.useState("0");
  const parsed = Number(delta);
  const valid = Number.isInteger(parsed) && parsed !== 0 && item.quantity + parsed >= 0;

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/inventory/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantityDelta: parsed }),
      }),
    onSuccess: (res: any) => {
      toast({ title: `${item.sku} stock updated`, description: `New quantity: ${res.item.quantity} ${res.item.quantity <= res.item.minQuantity ? "· LOW STOCK" : ""}` });
      onSaved();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const quick = [-10, -5, -1, 1, 5, 10];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Adjust Stock — {item.sku}</DialogTitle>
          <DialogDescription className="text-xs">{item.name} · currently <strong>{item.quantity}</strong> on hand (min {item.minQuantity})</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick stock adjustments">
            {quick.map((q) => (
              <Button key={q} type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 font-mono text-xs"
                aria-label={`${q > 0 ? "Add" : "Remove"} ${Math.abs(q)} units`} onClick={() => setDelta(String(q))}>
                {q > 0 ? <Plus className="size-3" /> : <Minus className="size-3" />} {Math.abs(q)}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="stock-delta">Delta (± units)</Label>
            <Input id="stock-delta" type="number" step={1} value={delta} onChange={(e) => setDelta(e.target.value)} className="h-9 font-mono" aria-label="Stock delta" />
            <p className={`text-xs ${valid ? "text-muted-foreground" : "text-red-600"}`}>
              {item.quantity + (Number.isInteger(parsed) ? parsed : 0)} units after adjustment
              {!valid && parsed !== 0 && " — must stay ≥ 0"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || mutation.isPending} className="gap-1.5" onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />} Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditItemDialog({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = React.useState(item.name);
  const [category, setCategory] = React.useState(item.category || "");
  const [minQuantity, setMinQuantity] = React.useState(String(item.minQuantity));
  const [unitPrice, setUnitPrice] = React.useState(item.unitPrice != null ? String(item.unitPrice) : "");
  const [location, setLocation] = React.useState(item.location || "");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/inventory/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, category: category || null,
          minQuantity: minQuantity === "" ? 0 : Number(minQuantity),
          unitPrice: unitPrice === "" ? null : Number(unitPrice),
          location: location || null,
        }),
      }),
    onSuccess: () => {
      toast({ title: `${item.sku} updated` });
      onSaved();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Edit {item.sku}</DialogTitle>
          <DialogDescription className="text-xs">Update item details and low-stock threshold. Use the stock button for quantity changes.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <StyledSelect value={category} onChange={setCategory} ariaLabel="Item category" className="w-full">
                <option value="">— None —</option>
                <option value="router">Router</option>
                <option value="onu">ONU</option>
                <option value="cable">Cable</option>
                <option value="tool">Tool</option>
                <option value="other">Other</option>
              </StyledSelect>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Min Quantity</Label>
              <Input type="number" min={0} step={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} className="h-9" aria-label="Minimum quantity" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Unit Price (₹)</Label>
              <Input type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="h-9" aria-label="Unit price" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Warehouse A / Van-1" className="h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
              {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />} Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateItemDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [sku, setSku] = React.useState("");
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("router");
  const [quantity, setQuantity] = React.useState("0");
  const [minQuantity, setMinQuantity] = React.useState("5");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [location, setLocation] = React.useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/inventory", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku, name, category,
          quantity: Number(quantity || 0),
          minQuantity: Number(minQuantity || 0),
          unitPrice: unitPrice === "" ? null : Number(unitPrice),
          location: location || null,
        }),
      }),
    onSuccess: (res: any) => {
      toast({ title: "Item added", description: `${res.item.sku} · ${res.item.quantity} units` });
      onSaved();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto cryptsk-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-base">Add Inventory Item</DialogTitle>
          <DialogDescription className="text-xs">SKU must be unique — duplicates are rejected. Low-stock threshold drives the amber alerts.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">SKU <span className="text-red-500">*</span></Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} required placeholder="RTR-C6-001" className="h-9 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <StyledSelect value={category} onChange={setCategory} ariaLabel="Item category" className="w-full">
                <option value="router">Router</option>
                <option value="onu">ONU</option>
                <option value="cable">Cable</option>
                <option value="tool">Tool</option>
                <option value="other">Other</option>
              </StyledSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Dual-band GPON router C6" className="h-9" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Quantity</Label>
              <Input type="number" min={0} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-9" aria-label="Initial quantity" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Min Quantity</Label>
              <Input type="number" min={0} step={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} className="h-9" aria-label="Low stock threshold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unit Price (₹)</Label>
              <Input type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="h-9" aria-label="Unit price" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Warehouse A / Van-1" className="h-9" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-1.5">
              {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />} Add Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
