"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, UserPlus, Wifi, CreditCard, Activity, RefreshCw, AlertTriangle, Info,
  FileText, Pencil, Trash2, LogIn, LogOut, Shield, KeyRound, Settings, Zap,
  MoreHorizontal, CalendarDays, Users, CheckCircle2, Wallet,
} from "lucide-react";
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
