"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, UserPlus, Wifi, CreditCard, Activity, RefreshCw, AlertTriangle, Info,
  FileText, Pencil, Trash2, LogIn, LogOut, Shield, KeyRound, Settings, Zap,
  MoreHorizontal, CalendarDays, Users, CheckCircle2, Wallet, LifeBuoy, Copy, Check, Loader2,
} from "lucide-react";
import { relTime, formatINR } from "@/lib/format";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// Customer 360° — full-detail dialog (overview, subscribers,
// subscriptions, sessions, billing, activity). All data is
// fetched live from GET /api/customers/[id] — no mock data.
// ============================================================

type PlanLite = {
  id: string; planCode: string; name: string; billingCycle: string; basePrice: number;
  product?: { name: string; productCode: string } | null;
};

type SubscriberRow = {
  id: string; subscriberCode: string; radiusUsername: string; status: string;
  fullName: string | null; email: string | null; mobile: string | null;
  planId: string | null; createdAt: string;
  plan: PlanLite | null;
  subscriptions: { id: string; subscriptionCode: string; status: string; plan: PlanLite | null }[];
};

type SubscriptionRow = {
  id: string; subscriptionCode: string; status: string; basePrice: number; currency: string;
  startDate: string | null; endDate: string | null; nextBillingDate: string | null; notes: string | null;
  plan: PlanLite;
  subscriber: { id: string; radiusUsername: string; subscriberCode: string; status: string } | null;
};

type InvoiceRow = {
  id: string; invoiceNumber: string; issueDate: string; dueDate: string;
  total: number; paidAmount: number; balanceDue: number; status: string; paymentStatus: string;
};

type PaymentRow = {
  id: string; paymentNumber: string; amount: number; currency: string;
  method: string; status: string; receivedAt: string;
};

type SessionRow = {
  radacctid: string; username: string | null;
  acctstarttime: string | null; acctstoptime: string | null;
  acctsessiontime: number | null; acctinputoctets: number | null; acctoutputoctets: number | null;
  nasipaddress: string; framedipaddress: string; acctterminatecause: string | null;
  callingstationid: string | null;
};

type AuditRow = {
  id: string; action: string; resource: string; resourceId: string | null;
  resourceName: string | null; result: string; errorMessage: string | null;
  createdAt: string;
  user: { name: string | null; email: string | null } | null;
};

type ContactRow = {
  id: string; type: string; value: string; label: string | null; isPrimary: boolean;
};

type AddressRow = {
  id: string; type: string; line1: string; line2: string | null; city: string;
  state: string | null; postalCode: string | null; country: string; landmark: string | null;
  isPrimary: boolean;
};

type Customer360Data = {
  customer: {
    id: string; customerCode: string; type: string; status: string;
    firstName: string | null; lastName: string | null; companyName: string | null;
    gstin: string | null; pan: string | null; displayName: string;
    email: string | null; phone: string | null; whatsappNumber: string | null;
    kycVerified: boolean; notes: string | null; tags: string | null;
    createdAt: string; updatedAt: string;
    contacts: ContactRow[]; addresses: AddressRow[];
    subscribers: SubscriberRow[];
    subscriptions: SubscriptionRow[];
    invoices: InvoiceRow[]; payments: PaymentRow[];
    wallet: { id: string; balance: number; currency: string } | null;
  };
  sessions: SessionRow[];
  auditEvents: AuditRow[];
  totals: {
    subscriberCount: number; activeSubscriptions: number;
    lifetimeRevenue: number; outstanding: number;
  };
};

// Support tickets (via /api/selfcare/support — same contract the
// customer-facing portal uses; internal notes are filtered server-side)
type Ticket360Row = {
  id: string; ticketNumber: string; subject: string; status: string; priority: string;
  category: string | null; description: string; createdAt: string;
  slaDueAt: string | null; resolvedAt: string | null;
  replies: { authorName: string; message: string; createdAt: string }[];
};
type Support360Response = { tickets: Ticket360Row[] };

// Portal access (customer self-service logins) — T6-a contract via
// /api/portal-users. Staff-only management surface inside Customer 360.
type PortalUserRow = {
  id: string; email: string; name: string | null;
  status: string; // "active" | "disabled"
  lastLoginAt: string | null; lastLoginIp: string | null; createdAt: string;
};
type PortalUsersResponse = { portalUsers: PortalUserRow[] };

type PortalUserRecord = {
  portalUser: {
    id: string; email: string; name: string | null;
    status: string; createdAt: string;
  };
};

// Wallet (prepaid balance + ledger) — /api/selfcare/wallet?customerId=
// staff contract (same endpoint the customer Payments tab uses). A
// customer without a wallet is a normal state, never an error.
type WalletTxnRow = {
  id: string; amount: number; type: string; // recharge|payment|refund|adjustment|cashback
  description: string; balanceAfter: number; createdAt: string; invoiceId: string | null;
};
type WalletData = {
  wallet: { id: string; balance: number; currency: string; minBalance: number; autoRecharge: boolean } | null;
  transactions: WalletTxnRow[];
};

// POST /api/wallet/topup (staff cash top-up) response
type TopUpResponse = {
  wallet: { balance: number; currency: string };
  transaction: { id: string; amount: number; type: string; balanceAfter: number };
};

const PORTAL_USER_STATUS_BADGE: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/5 text-emerald-600",
  disabled: "border-slate-400/30 bg-slate-500/5 text-slate-500",
};

// Cryptographically random base62 password (rejection-sampled, no modulo
// bias) — prefilled in the create / reset dialogs, shown once to staff.
function generatePassword(length = 12): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const max = Math.floor(256 / chars.length) * chars.length;
  const buf = new Uint8Array(length * 2);
  const out: string[] = [];
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] < max) out.push(chars[buf[i] % chars.length]);
    }
  }
  return out.join("");
}

const TICKET_360_STATUS_BADGE: Record<string, string> = {
  open: "border-red-500/30 text-red-600",
  in_progress: "border-amber-500/30 text-amber-600",
  pending: "border-violet-500/30 text-violet-600",
  resolved: "border-emerald-500/30 text-emerald-600",
  closed: "border-slate-400/30 text-slate-500",
};

const TICKET_360_PRIORITY_BADGE: Record<string, string> = {
  critical: "border-red-500/40 text-red-600",
  high: "border-orange-500/40 text-orange-600",
  medium: "border-amber-500/40 text-amber-600",
  low: "border-slate-400/40 text-slate-500",
};

// ---------- formatting helpers ----------

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function formatMoney(n: number | null | undefined): string {
  return inr.format(n || 0);
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let val = bytes;
  let i = -1;
  do { val /= 1024; i++; } while (val >= 1024 && i < units.length - 1);
  return `${val >= 100 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds}s`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !d) parts.push(`${s}s`);
  return parts.join(" ") || "—";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function statusColor(status: string): string {
  if (["active", "paid", "completed"].includes(status)) return "border-emerald-500/30 bg-emerald-500/5 text-emerald-600";
  if (["suspended", "partial", "pending"].includes(status)) return "border-amber-500/30 bg-amber-500/5 text-amber-600";
  if (["terminated", "overdue", "failed", "blacklisted"].includes(status)) return "border-rose-500/30 bg-rose-500/5 text-rose-600";
  return "border-muted bg-muted/50 text-muted-foreground";
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function auditIcon(action: string) {
  const cls = "size-3.5 shrink-0";
  if (action === "create") return <Plus className={`${cls} text-emerald-600`} />;
  if (action === "update") return <Pencil className={`${cls} text-amber-600`} />;
  if (action === "delete") return <Trash2 className={`${cls} text-rose-600`} />;
  if (action === "login") return <LogIn className={`${cls} text-emerald-600`} />;
  if (action === "login_failed") return <Shield className={`${cls} text-rose-600`} />;
  if (action === "logout") return <LogOut className={`${cls} text-muted-foreground`} />;
  if (action === "config_change") return <Settings className={`${cls} text-amber-600`} />;
  if (action === "permission_change") return <Shield className={`${cls} text-rose-600`} />;
  if (action === "role_change") return <KeyRound className={`${cls} text-amber-600`} />;
  if (action === "execute") return <Zap className={`${cls} text-primary`} />;
  return <FileText className={`${cls} text-muted-foreground`} />;
}

// ---------- main component ----------

export function Customer360Dialog({
  customerId,
  open,
  onOpenChange,
}: {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAddSubscriber, setShowAddSubscriber] = React.useState(false);
  const [showNewSubscription, setShowNewSubscription] = React.useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["customer-360", customerId],
    queryFn: async (): Promise<Customer360Data> => {
      const res = await fetch(`/api/customers/${customerId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load customer");
      }
      return res.json();
    },
    enabled: open && !!customerId,
  });

  // Linked support tickets — same endpoint the Self-Care portal uses,
  // so staff see exactly the customer-visible ticket list.
  const ticketsQuery = useQuery<Support360Response>({
    queryKey: ["selfcare-support", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/selfcare/support?customerId=${encodeURIComponent(customerId ?? "")}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load tickets");
      }
      return res.json();
    },
    enabled: open && !!customerId,
    staleTime: 30000,
  });

  const customer = data?.customer;
  const totals = data?.totals;

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["customer-360", customerId] });
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["subscribers"] });
    qc.invalidateQueries({ queryKey: ["subscriptions"] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 gap-0 flex flex-col overflow-hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Customer 360 — {data?.customer?.displayName ?? "customer"}</DialogTitle>
        {isLoading && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="size-14 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
            <Skeleton className="h-8 w-full" />
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="size-10 text-rose-500" />
            <p className="text-sm font-medium">Failed to load customer details</p>
            <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        )}

        {customer && !isLoading && (
          <>
            {/* Header */}
            <div className="border-b p-6 pb-4 shrink-0">
              <DialogHeader className="sr-only">
                <DialogTitle>Customer 360 — {customer.displayName}</DialogTitle>
                <DialogDescription>Full customer detail view</DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-4">
                <Avatar className="size-14 border">
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                    {initials(customer.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold tracking-tight truncate">{customer.displayName}</h2>
                    <Badge variant="outline" className="text-[10px] font-mono">{customer.customerCode}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${statusColor(customer.status)}`}>{customer.status}</Badge>
                    {customer.kycVerified ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/5 text-emerald-600 gap-1">
                        <CheckCircle2 className="size-3" /> KYC Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 bg-amber-500/5 text-amber-600 gap-1">
                        <Info className="size-3" /> KYC Pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {customer.type} · {customer.email || customer.phone || "no contact"} · created {fmtDate(customer.createdAt)}
                  </p>
                </div>
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh">
                  <RefreshCw className={`size-3.5 ${isFetching ? "cryptsk-spin" : ""}`} />
                </Button>
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <StatChip icon={<Users className="size-4" />} label="Subscribers" value={String(totals?.subscriberCount ?? 0)} />
                <StatChip icon={<Wifi className="size-4" />} label="Active Subscriptions" value={String(totals?.activeSubscriptions ?? 0)} />
                <StatChip icon={<Wallet className="size-4" />} label="Lifetime Revenue" value={formatMoney(totals?.lifetimeRevenue ?? 0)} />
                <StatChip
                  icon={<CreditCard className="size-4" />}
                  label="Outstanding"
                  value={formatMoney(totals?.outstanding ?? 0)}
                  danger={(totals?.outstanding ?? 0) > 0}
                />
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col">
              <div className="px-6 border-b shrink-0 overflow-x-auto cryptsk-scrollbar">
                <TabsList className="h-9 bg-muted/60">
                  <TabsTrigger value="overview" className="text-xs gap-1.5"><Info className="size-3.5" /> Overview</TabsTrigger>
                  <TabsTrigger value="subscribers" className="text-xs gap-1.5"><Users className="size-3.5" /> Subscribers</TabsTrigger>
                  <TabsTrigger value="subscriptions" className="text-xs gap-1.5"><Wifi className="size-3.5" /> Subscriptions</TabsTrigger>
                  <TabsTrigger value="sessions" className="text-xs gap-1.5"><Activity className="size-3.5" /> Sessions</TabsTrigger>
                  <TabsTrigger value="billing" className="text-xs gap-1.5"><CreditCard className="size-3.5" /> Billing</TabsTrigger>
                  <TabsTrigger value="activity" className="text-xs gap-1.5"><FileText className="size-3.5" /> Activity</TabsTrigger>
                </TabsList>
              </div>

              {/* Overview */}
              <TabsContent value="overview" className="flex-1 min-h-0 overflow-y-auto cryptsk-scrollbar m-0 p-6 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Customer Information</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <InfoField label="Code" value={customer.customerCode} mono />
                      <InfoField label="Type" value={customer.type} />
                      <InfoField label="Email" value={customer.email} />
                      <InfoField label="Phone" value={customer.phone} />
                      <InfoField label="WhatsApp" value={customer.whatsappNumber} />
                      <InfoField label="Company" value={customer.companyName} />
                      <InfoField label="GSTIN" value={customer.gstin} mono />
                      <InfoField label="PAN" value={customer.pan} mono />
                      <InfoField label="Wallet Balance" value={customer.wallet ? formatMoney(customer.wallet.balance) : null} />
                      <InfoField label="Last Updated" value={fmtDateTime(customer.updatedAt)} />
                      {customer.notes && (
                        <div className="col-span-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                          <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-2">{customer.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Contacts ({customer.contacts.length})</CardTitle></CardHeader>
                      <CardContent>
                        {customer.contacts.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No contacts recorded yet.</p>
                        ) : (
                          <ul className="space-y-2">
                            {customer.contacts.map((c) => (
                              <li key={c.id} className="flex items-center gap-2 text-sm">
                                <Badge variant="outline" className="text-[9px] uppercase">{c.type}</Badge>
                                <span className="font-mono text-xs">{c.value}</span>
                                {c.label && <span className="text-xs text-muted-foreground">({c.label})</span>}
                                {c.isPrimary && <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-600">primary</Badge>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Addresses ({customer.addresses.length})</CardTitle></CardHeader>
                      <CardContent>
                        {customer.addresses.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No addresses recorded yet.</p>
                        ) : (
                          <ul className="space-y-3">
                            {customer.addresses.map((a) => (
                              <li key={a.id} className="text-sm">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <Badge variant="outline" className="text-[9px] uppercase">{a.type}</Badge>
                                  {a.isPrimary && <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-600">primary</Badge>}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {[a.line1, a.line2, a.city, a.state, a.postalCode, a.country].filter(Boolean).join(", ")}
                                  {a.landmark ? ` · near ${a.landmark}` : ""}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Support tickets — customer-visible list (no internal notes) */}
                <SupportTicketsSection
                  query={ticketsQuery}
                  onRetry={() => ticketsQuery.refetch()}
                />

                {/* Portal access — customer self-service logins (staff-managed) */}
                <PortalAccessSection customerId={customer.id} />

                {/* Wallet — prepaid balance, recent activity + staff cash top-up */}
                <WalletSection customerId={customer.id} enabled={open && !!customerId} />
              </TabsContent>

              {/* Subscribers */}
              <TabsContent value="subscribers" className="flex-1 min-h-0 overflow-y-auto cryptsk-scrollbar m-0 p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-muted-foreground">
                    RADIUS users under this customer ({customer.subscribers.length})
                  </p>
                  <Button size="sm" className="gap-1.5" onClick={() => setShowAddSubscriber(true)}>
                    <UserPlus className="size-3.5" /> Add Subscriber
                  </Button>
                </div>
                {customer.subscribers.length === 0 ? (
                  <EmptyState
                    icon={<Users className="size-8" />}
                    title="No subscribers yet"
                    text="Subscribers are the actual internet users (RADIUS credentials). Add the first one to start provisioning service."
                  />
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subscriber</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customer.subscribers.map((s) => {
                          const activeSub = s.subscriptions[0];
                          const planName = activeSub?.plan?.name || s.plan?.name || null;
                          return (
                            <TableRow key={s.id} className="hover:bg-muted/50">
                              <TableCell>
                                <p className="text-sm font-medium font-mono">{s.radiusUsername}</p>
                                <p className="text-xs text-muted-foreground">{s.fullName || "—"}</p>
                              </TableCell>
                              <TableCell className="text-xs font-mono">{s.subscriberCode}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${statusColor(s.status)}`}>{s.status}</Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {planName ? (
                                  <div>
                                    <p className="text-xs font-medium">{planName}</p>
                                    {(activeSub?.plan || s.plan) && (
                                      <p className="text-[10px] text-muted-foreground">{formatMoney((activeSub?.plan || s.plan)?.basePrice)} / {(activeSub?.plan || s.plan)?.billingCycle.replace("_", " ")}</p>
                                    )}
                                  </div>
                                ) : <span className="text-xs text-muted-foreground">no plan</span>}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{fmtDate(s.createdAt)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Subscriptions */}
              <TabsContent value="subscriptions" className="flex-1 min-h-0 overflow-y-auto cryptsk-scrollbar m-0 p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-muted-foreground">Plan bindings for this customer ({customer.subscriptions.length})</p>
                  <Button size="sm" className="gap-1.5" onClick={() => setShowNewSubscription(true)}>
                    <Plus className="size-3.5" /> New Subscription
                  </Button>
                </div>
                {customer.subscriptions.length === 0 ? (
                  <EmptyState
                    icon={<Wifi className="size-8" />}
                    title="No subscriptions yet"
                    text="Bind a subscriber to a plan to activate billed service and RADIUS group membership."
                  />
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Subscriber</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>Next Bill</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customer.subscriptions.map((sub) => (
                          <TableRow key={sub.id} className="hover:bg-muted/50">
                            <TableCell className="text-xs font-mono">{sub.subscriptionCode}</TableCell>
                            <TableCell>
                              <p className="text-xs font-medium">{sub.plan.name}</p>
                              <p className="text-[10px] text-muted-foreground">{sub.plan.product?.name || sub.plan.planCode}</p>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{sub.subscriber?.radiusUsername || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${statusColor(sub.status)}`}>{sub.status}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">{fmtDate(sub.startDate)}</TableCell>
                            <TableCell className="text-xs">{fmtDate(sub.nextBillingDate)}</TableCell>
                            <TableCell className="text-xs font-medium tabular-nums">{formatMoney(sub.basePrice)}</TableCell>
                            <TableCell>
                              <SubscriptionRowActions subscription={sub} onChanged={invalidateAll} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Sessions */}
              <TabsContent value="sessions" className="flex-1 min-h-0 overflow-y-auto cryptsk-scrollbar m-0 p-6">
                <p className="text-sm text-muted-foreground mb-3">
                  Last {data?.sessions.length ?? 0} RADIUS accounting sessions across all subscriber usernames
                </p>
                {(data?.sessions.length ?? 0) === 0 ? (
                  <EmptyState
                    icon={<Activity className="size-8" />}
                    title="No sessions recorded"
                    text="RADIUS accounting records (radacct) will appear here once subscribers connect through a NAS."
                  />
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Start</TableHead>
                          <TableHead>Stop</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>NAS</TableHead>
                          <TableHead>↑ Up</TableHead>
                          <TableHead>↓ Down</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data!.sessions.map((s) => (
                          <TableRow key={s.radacctid} className="hover:bg-muted/50">
                            <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(s.acctstarttime)}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {s.acctstoptime ? (
                                fmtDateTime(s.acctstoptime)
                              ) : (
                                <Badge variant="outline" className="text-[9px] border-emerald-500/30 bg-emerald-500/5 text-emerald-600 gap-1">
                                  <span className="size-1.5 rounded-full bg-emerald-500 cryptsk-pulse-dot" /> live
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">{formatDuration(s.acctsessiontime)}</TableCell>
                            <TableCell className="text-xs font-mono">{s.username || "—"}</TableCell>
                            <TableCell className="text-xs font-mono">{s.framedipaddress || "—"}</TableCell>
                            <TableCell className="text-xs font-mono">{s.nasipaddress || "—"}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatBytes(s.acctinputoctets)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{formatBytes(s.acctoutputoctets)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Billing */}
              <TabsContent value="billing" className="flex-1 min-h-0 overflow-y-auto cryptsk-scrollbar m-0 p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Invoices (last {customer.invoices.length})</h3>
                  {customer.invoices.length === 0 ? (
                    <EmptyState
                      icon={<FileText className="size-8" />}
                      title="No invoices yet"
                      text="Invoices generated for this customer will appear here."
                      compact
                    />
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Issued</TableHead>
                            <TableHead>Due</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Paid</TableHead>
                            <TableHead>Balance</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customer.invoices.map((inv) => (
                            <TableRow key={inv.id} className="hover:bg-muted/50">
                              <TableCell className="text-xs font-mono font-medium">{inv.invoiceNumber}</TableCell>
                              <TableCell className="text-xs">{fmtDate(inv.issueDate)}</TableCell>
                              <TableCell className="text-xs">{fmtDate(inv.dueDate)}</TableCell>
                              <TableCell className="text-xs tabular-nums">{formatMoney(inv.total)}</TableCell>
                              <TableCell className="text-xs tabular-nums text-emerald-600">{formatMoney(inv.paidAmount)}</TableCell>
                              <TableCell className={`text-xs tabular-nums ${inv.balanceDue > 0 ? "text-rose-600 font-medium" : ""}`}>
                                {formatMoney(inv.balanceDue)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${statusColor(inv.status)}`}>{inv.status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Payments (last {customer.payments.length})</h3>
                  {customer.payments.length === 0 ? (
                    <EmptyState
                      icon={<CreditCard className="size-8" />}
                      title="No payments yet"
                      text="Payments received against this customer's invoices will appear here."
                      compact
                    />
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Payment</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Received</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customer.payments.map((p) => (
                            <TableRow key={p.id} className="hover:bg-muted/50">
                              <TableCell className="text-xs font-mono font-medium">{p.paymentNumber}</TableCell>
                              <TableCell className="text-xs tabular-nums font-medium">{formatMoney(p.amount)}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[9px] uppercase">{p.method.replace("_", " ")}</Badge></TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${statusColor(p.status)}`}>{p.status.replace("_", " ")}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">{fmtDateTime(p.receivedAt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Activity */}
              <TabsContent value="activity" className="flex-1 min-h-0 overflow-y-auto cryptsk-scrollbar m-0 p-6">
                <p className="text-sm text-muted-foreground mb-3">
                  Last {data?.auditEvents.length ?? 0} audit events for this customer and its records
                </p>
                {(data?.auditEvents.length ?? 0) === 0 ? (
                  <EmptyState
                    icon={<CalendarDays className="size-8" />}
                    title="No activity recorded"
                    text="Audit events (creates, updates, deletes) for this customer will appear here."
                  />
                ) : (
                  <ul className="space-y-1">
                    {data!.auditEvents.map((e) => (
                      <li key={e.id} className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/50">
                        <span className="mt-0.5">{auditIcon(e.action)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-medium capitalize">{e.action.replace("_", " ")}</span>
                            <span className="text-muted-foreground"> · {e.resource}{e.resourceName ? ` · ${e.resourceName}` : ""}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {e.user ? (e.user.name || e.user.email) : "system"} · {fmtDateTime(e.createdAt)}
                            {e.result !== "success" && (
                              <Badge variant="outline" className="ml-2 text-[9px] border-rose-500/30 text-rose-600">{e.result}</Badge>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* Inline create dialogs */}
        {customer && showAddSubscriber && (
          <AddSubscriberDialog
            customerId={customer.id}
            onClose={() => setShowAddSubscriber(false)}
            onSaved={() => { setShowAddSubscriber(false); invalidateAll(); toast({ title: "Subscriber created" }); }}
          />
        )}
        {customer && showNewSubscription && (
          <NewSubscriptionDialog
            subscribers={customer.subscribers}
            onClose={() => setShowNewSubscription(false)}
            onSaved={() => { setShowNewSubscription(false); invalidateAll(); toast({ title: "Subscription created" }); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- small pieces ----------

function StatChip({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${danger ? "border-rose-500/30 bg-rose-500/5" : "bg-muted/30"}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wide font-medium">{label}</span>
      </div>
      <p className={`text-base font-bold tabular-nums ${danger ? "text-rose-600" : ""}`}>{value}</p>
    </div>
  );
}

function InfoField({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</p>
    </div>
  );
}

function EmptyState({ icon, title, text, compact }: { icon: React.ReactNode; title: string; text: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-6" : "py-12"} rounded-lg border border-dashed`}>
      <div className="text-muted-foreground/50 mb-2">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm mt-1">{text}</p>
    </div>
  );
}

// Support tickets card (Overview tab) — mirrors the customer-facing
// Self-Care Support list: ticket number, subject, status/priority
// badges, created relTime. Internal notes are filtered by the backend.
function SupportTicketsSection({ query, onRetry }: {
  query: { data?: Support360Response; isLoading: boolean; isError: boolean };
  onRetry: () => void;
}) {
  const tickets = query.data?.tickets ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <LifeBuoy className="size-4 text-muted-foreground" /> Support Tickets ({tickets.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : query.isError ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
            <span className="flex items-center gap-1.5"><AlertTriangle className="size-3.5" /> Couldn&apos;t load support tickets.</span>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onRetry}>
              <RefreshCw className="size-3" /> Retry
            </Button>
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No support requests.</p>
        ) : (
          <ul className="max-h-64 divide-y overflow-y-auto cryptsk-scrollbar" role="list" aria-label="Support tickets">
            {tickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0">
                <span className="font-mono text-xs font-medium text-muted-foreground">{t.ticketNumber}</span>
                <span className="min-w-0 flex-1 truncate text-sm" title={t.subject}>{t.subject}</span>
                <Badge variant="outline" className={`text-[10px] ${TICKET_360_STATUS_BADGE[t.status] || TICKET_360_STATUS_BADGE.closed}`}>
                  {t.status.replace(/_/g, " ")}
                </Badge>
                <Badge variant="outline" className={`text-[10px] capitalize ${TICKET_360_PRIORITY_BADGE[t.priority] || TICKET_360_PRIORITY_BADGE.low}`}>
                  {t.priority}
                </Badge>
                <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">{relTime(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Portal access card (Overview tab) — manage the customer's self-service
// portal logins (CustomerUser accounts). Real data via /api/portal-users.
function PortalAccessSection({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = React.useState(false);
  const [resetUser, setResetUser] = React.useState<PortalUserRow | null>(null);
  const [deleteUser, setDeleteUser] = React.useState<PortalUserRow | null>(null);

  const query = useQuery<PortalUsersResponse>({
    queryKey: ["portal-users", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/portal-users?customerId=${encodeURIComponent(customerId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load portal access");
      }
      return res.json();
    },
    enabled: !!customerId, // this section only mounts while the dialog is open
    staleTime: 15000,
  });

  const users = query.data?.portalUsers ?? [];

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["portal-users", customerId] });
  }

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/portal-users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update portal access");
      }
      return res.json() as Promise<PortalUserRecord>;
    },
    onSuccess: (_data, vars) => {
      toast({ title: vars.status === "active" ? "Portal access enabled" : "Portal access disabled" });
      invalidate();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/portal-users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to remove portal access");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portal access removed" });
      invalidate();
      setDeleteUser(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="size-4 text-muted-foreground" /> Portal Access ({users.length})
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setShowAdd(true)}>
            <Plus className="size-3" /> Add portal access
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : query.isError ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
            <span className="flex items-center gap-1.5"><AlertTriangle className="size-3.5" /> Couldn&apos;t load portal access.</span>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => query.refetch()}>
              <RefreshCw className="size-3" /> Retry
            </Button>
          </div>
        ) : users.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            No portal access yet — create one to give the customer self-service login.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto cryptsk-scrollbar rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden sm:table-cell">Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Last login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-xs font-medium">{u.email}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{u.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${PORTAL_USER_STATUS_BADGE[u.status] || PORTAL_USER_STATUS_BADGE.disabled}`}>
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs md:table-cell">
                      {u.lastLoginAt ? (
                        <div>
                          <p title={fmtDateTime(u.lastLoginAt)}>{relTime(u.lastLoginAt)}</p>
                          {u.lastLoginIp && <p className="font-mono text-[10px] text-muted-foreground">{u.lastLoginIp}</p>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Switch
                          checked={u.status === "active"}
                          disabled={statusMutation.isPending && statusMutation.variables?.id === u.id}
                          onCheckedChange={(checked) =>
                            statusMutation.mutate({ id: u.id, status: checked ? "active" : "disabled" })
                          }
                          aria-label={u.status === "active" ? `Disable portal access for ${u.email}` : `Enable portal access for ${u.email}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => setResetUser(u)}
                          aria-label={`Reset password for ${u.email}`}
                          title="Reset password"
                        >
                          <KeyRound className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-rose-600 hover:text-rose-600"
                          onClick={() => setDeleteUser(u)}
                          aria-label={`Remove portal access for ${u.email}`}
                          title="Remove access"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {showAdd && (
        <PortalUserDialog
          customerId={customerId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); invalidate(); toast({ title: "Portal access created" }); }}
        />
      )}
      {resetUser && (
        <ResetPortalPasswordDialog
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSaved={() => { setResetUser(null); invalidate(); toast({ title: "Password reset" }); }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o) => { if (!o) setDeleteUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove portal access?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUser?.email} will no longer be able to sign in to the customer portal. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-600/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => { e.preventDefault(); if (deleteUser) deleteMutation.mutate(deleteUser.id); }}
            >
              {deleteMutation.isPending ? "Removing…" : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// Wallet card (Overview tab) — prepaid balance, recent activity and the
// staff cash top-up action. Real data via /api/selfcare/wallet (staff mode,
// ?customerId=) + POST /api/wallet/topup. A missing wallet is a normal
// state — it comes to life on the first voucher redemption or top-up.
function WalletSection({ customerId, enabled }: { customerId: string; enabled: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showTopUp, setShowTopUp] = React.useState(false);

  const query = useQuery<WalletData>({
    queryKey: ["wallet", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/selfcare/wallet?customerId=${encodeURIComponent(customerId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load wallet");
      }
      return res.json();
    },
    enabled,
    staleTime: 15000,
  });

  const wallet = query.data?.wallet ?? null;
  const transactions = query.data?.transactions ?? [];

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["wallet", customerId] });
    // The Customer Information card also shows the wallet balance — keep it in sync.
    qc.invalidateQueries({ queryKey: ["customer-360", customerId] });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wallet className="size-4 text-muted-foreground" /> Wallet
          </CardTitle>
          <Button
            size="sm"
            className="h-7 gap-1 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-600/90"
            onClick={() => setShowTopUp(true)}
          >
            <Plus className="size-3" /> Add top-up
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : query.isError ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
            <span className="flex items-center gap-1.5"><AlertTriangle className="size-3.5" /> Couldn&apos;t load wallet.</span>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => query.refetch()}>
              <RefreshCw className="size-3" /> Retry
            </Button>
          </div>
        ) : !wallet ? (
          <p className="py-2 text-xs text-muted-foreground">
            No wallet activated yet — it is created when the customer redeems a voucher or receives a top-up.
          </p>
        ) : (
          <>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Prepaid balance</p>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold tabular-nums tracking-tight">{formatINR(wallet.balance)}</span>
                <Badge variant="outline" className="text-[9px] uppercase">{wallet.currency}</Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Minimum balance {formatINR(wallet.minBalance)}</span>
                {wallet.autoRecharge && (
                  <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/5 text-[9px] text-emerald-600">
                    <CheckCircle2 className="size-3" /> Auto-recharge on
                  </Badge>
                )}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Recent activity</p>
              {transactions.length === 0 ? (
                <p className="py-1 text-xs text-muted-foreground">No wallet transactions yet.</p>
              ) : (
                <ul className="max-h-44 divide-y overflow-y-auto cryptsk-scrollbar" role="list" aria-label="Wallet transactions">
                  {transactions.slice(0, 5).map((tx) => (
                    <li key={tx.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                      <Badge variant="outline" className="shrink-0 text-[9px] capitalize">{tx.type}</Badge>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={tx.description}>{tx.description}</span>
                      <span
                        className={`shrink-0 text-xs font-medium tabular-nums ${tx.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}
                        title={`Balance after: ${formatINR(tx.balanceAfter)}`}
                      >
                        {tx.amount >= 0 ? "+" : "−"}{formatINR(Math.abs(tx.amount))}
                      </span>
                      <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">{relTime(tx.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>

      {showTopUp && (
        <TopUpDialog
          customerId={customerId}
          walletBalance={wallet?.balance ?? null}
          onClose={() => setShowTopUp(false)}
          onSaved={(amount) => {
            setShowTopUp(false);
            invalidate();
            toast({ title: "Wallet topped up", description: `${formatINR(amount)} added` });
          }}
        />
      )}
    </Card>
  );
}

// Staff cash top-up dialog — POST /api/wallet/topup { customerId, amount, notes? }.
// Works when no wallet exists yet (the top-up activates it); server error
// strings surface verbatim in a destructive toast.
function TopUpDialog({ customerId, walletBalance, onClose, onSaved }: {
  customerId: string;
  walletBalance: number | null;
  onClose: () => void;
  onSaved: (amount: number) => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const amountNum = Number(amount);
  const amountInvalid = amount.trim() === "" || !Number.isFinite(amountNum) || amountNum <= 0;
  const newBalance = (walletBalance ?? 0) + (Number.isFinite(amountNum) && amountNum > 0 ? amountNum : 0);

  const topUp = useMutation<TopUpResponse, Error>({
    mutationFn: async () => {
      const body: Record<string, unknown> = { customerId, amount: amountNum };
      if (notes.trim()) body.notes = notes.trim();
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to top up wallet");
      }
      return res.json();
    },
    onSuccess: () => onSaved(amountNum),
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountInvalid || topUp.isPending) return;
    topUp.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Add wallet top-up</DialogTitle>
          <DialogDescription>
            Records a cash top-up against this customer&apos;s prepaid wallet
            {walletBalance === null
              ? " — this also activates the wallet."
              : ` · current balance ${formatINR(walletBalance)}.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="topup-amount">Amount (₹) *</Label>
            <Input
              id="topup-amount"
              type="number"
              min={1}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="h-10"
              placeholder="e.g. 500"
              aria-label="Top-up amount in rupees"
              aria-invalid={amount !== "" && amountInvalid ? true : undefined}
              aria-describedby={amount !== "" && amountInvalid ? "topup-amount-error" : undefined}
            />
            {amount !== "" && amountInvalid && (
              <p id="topup-amount-error" className="text-xs font-medium text-red-600" role="alert">
                Enter an amount greater than zero
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="topup-notes">Notes</Label>
            <Input
              id="topup-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-10"
              placeholder="Optional — e.g. cash received at counter"
              maxLength={200}
              aria-label="Top-up notes (optional)"
            />
          </div>
          {Number.isFinite(amountNum) && amountNum > 0 && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">New wallet balance</span>
                <span className="font-semibold tabular-nums">{formatINR(newBalance)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={topUp.isPending}>Cancel</Button>
            <Button
              type="submit"
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90"
              disabled={amountInvalid || topUp.isPending}
            >
              {topUp.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {topUp.isPending ? "Topping up…" : "Add top-up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Shared password field for the create / reset dialogs — generated
// prefill, regenerate and copy actions, "shown once" warning.
function PortalPasswordField({ password, onChange }: {
  password: string;
  onChange: (value: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (permissions/insecure context) — value stays selectable
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Temporary password *</Label>
      <div className="flex items-center gap-2">
        <Input
          value={password}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 font-mono text-xs"
          aria-label="Temporary password"
          required
          minLength={8}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          onClick={() => onChange(generatePassword())}
          aria-label="Generate a new password"
          title="Generate a new password"
        >
          <RefreshCw className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          onClick={copyPassword}
          aria-label="Copy password"
          title="Copy password"
        >
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" role="note">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>This password is shown only once — copy it and share it with the customer now. It cannot be viewed again.</span>
      </div>
    </div>
  );
}

function PortalUserDialog({ customerId, onClose, onSaved }: {
  customerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState(() => generatePassword());
  const [submitting, setSubmitting] = React.useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordOk = password.length >= 8;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOk || !passwordOk) {
      toast({
        title: "Check the form",
        description: !emailOk ? "Enter a valid email address." : "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, email: email.trim(), password, name: name.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error
            || (res.status === 409 ? "That email already has portal access." : "Failed to create portal access"),
        );
      }
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Add portal access</DialogTitle>
          <DialogDescription>
            Creates a self-service login so this customer can sign in to the portal with their own email.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9"
              placeholder="customer@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" placeholder="Optional display name" />
          </div>
          <PortalPasswordField password={password} onChange={setPassword} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !emailOk || !passwordOk}>
              {submitting ? "Creating…" : "Create access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPortalPasswordDialog({ user, onClose, onSaved }: {
  user: PortalUserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [password, setPassword] = React.useState(() => generatePassword());
  const [submitting, setSubmitting] = React.useState(false);

  const passwordOk = password.length >= 8;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordOk) {
      toast({ title: "Check the form", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal-users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to reset password");
      }
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Replaces the portal password for <span className="font-mono">{user.email}</span>. The current password stops working immediately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PortalPasswordField password={password} onChange={setPassword} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !passwordOk}>
              {submitting ? "Resetting…" : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubscriptionRowActions({ subscription, onChanged }: { subscription: SubscriptionRow; onChanged: () => void }) {
  const { toast } = useToast();
  const act = useMutation({
    mutationFn: async (action: string) => {
      const res = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (_data, action) => {
      toast({ title: `Subscription ${action === "change_plan" ? "updated" : action + "ed"}` });
      onChanged();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const canSuspend = subscription.status === "active";
  const canResume = subscription.status === "suspended";
  const canCancel = !["terminated", "expired"].includes(subscription.status);

  if (!canSuspend && !canResume && !canCancel) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Subscription actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canSuspend && (
          <DropdownMenuItem className="text-amber-600 focus:text-amber-600 focus:bg-amber-500/10" onClick={() => act.mutate("suspend")}>
            Suspend
          </DropdownMenuItem>
        )}
        {canResume && (
          <DropdownMenuItem className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-500/10" onClick={() => act.mutate("resume")}>
            Resume
          </DropdownMenuItem>
        )}
        {canCancel && (
          <DropdownMenuItem className="text-rose-600 focus:text-rose-600 focus:bg-rose-500/10" onClick={() => act.mutate("cancel")}>
            Terminate
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddSubscriberDialog({ customerId, onClose, onSaved }: { customerId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [radiusUsername, setRadiusUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, radiusUsername, password: password || undefined, fullName: fullName || undefined, email: email || undefined, mobile: mobile || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create subscriber");
      }
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Add Subscriber</DialogTitle>
          <DialogDescription>
            Creates a RADIUS user. If a password is provided it is stored as a bcrypt hash and synced to radcheck as Cleartext-Password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">RADIUS Username *</Label>
            <Input value={radiusUsername} onChange={(e) => setRadiusUsername(e.target.value)} required className="h-9 font-mono" placeholder="e.g. john_doe_bb" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">RADIUS Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-9 font-mono" placeholder="Leave blank to set later" />
            <p className="text-[10px] text-muted-foreground">Used for PPPoE / hotspot authentication.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mobile</Label>
              <Input value={mobile} onChange={(e) => setMobile(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Subscriber"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewSubscriptionDialog({
  subscribers,
  onClose,
  onSaved,
}: {
  subscribers: SubscriberRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [subscriberId, setSubscriberId] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [startDate, setStartDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = React.useState(false);

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const res = await fetch("/api/plans");
      if (!res.ok) throw new Error("Failed to load plans");
      return res.json();
    },
  });
  const plans: (PlanLite & { status: string })[] = plansData?.plans || [];
  const activePlans = plans.filter((p) => p.status === "active");
  const selectedPlan = activePlans.find((p) => p.id === planId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subscriberId || !planId) {
      toast({ title: "Missing fields", description: "Select a subscriber and a plan.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriberId, planId, startDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create subscription");
      }
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>New Subscription</DialogTitle>
          <DialogDescription>
            Binds a subscriber to a plan, activates service and syncs RADIUS group membership. Next bill date is computed from the plan cycle.
          </DialogDescription>
        </DialogHeader>
        {subscribers.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center">
            <p className="text-sm font-medium">No subscribers yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add a subscriber first — a subscription needs a RADIUS user to attach to.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Subscriber *</Label>
              <Select value={subscriberId} onValueChange={setSubscriberId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select subscriber" /></SelectTrigger>
                <SelectContent>
                  {subscribers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.radiusUsername} ({s.subscriberCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Plan *</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="h-9"><SelectValue placeholder={plansLoading ? "Loading plans…" : "Select plan"} /></SelectTrigger>
                <SelectContent>
                  {activePlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatMoney(p.basePrice)} / {p.billingCycle.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPlan && (
                <p className="text-[10px] text-muted-foreground">
                  Next billing date will be start + cycle length ({selectedPlan.billingCycle.replace("_", " ")});
                  contract: {selectedPlan.product?.name || "—"}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={submitting || !subscriberId || !planId}>
                {submitting ? "Creating…" : "Create Subscription"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
