"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, formatINR } from "@/lib/utils";
import {
  ArrowLeft, Search, Phone, Mail, MapPin, Globe, Router, Wifi, Shield,
  CreditCard, FileText, Clock, AlertTriangle, CheckCircle, XCircle,
  MessageSquare, User, Calendar, Activity, DollarSign, BadgeCheck,
  ChevronRight, RefreshCw, Eye, Download, Upload, UserCog, Package,
  Wrench, Hash, Network, Zap, Timer, UserPlus,
  TrendingUp, Camera, IdCard, Star, Heart, PhoneCall, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useModuleStore } from "@/store/module-store";

// ─── Types ───────────────────────────────────────────────────────

interface SubscriberMini {
  id: string; code: string; name: string; phone: string; email: string;
  status: string; area?: { id: string; name: string } | null;
  plan?: { id: string; name: string; priceMonthly: number } | null;
  connectionType: string;
}

interface SubscriberData {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  altPhone?: string;
  address?: string;
  landmark?: string;
  pincode?: string;
  status: string;
  connectionType: string;
  area?: { id: string; name: string } | null;
  plan?: {
    id: string;
    name: string;
    priceMonthly: number;
    downloadSpeed?: number;
    uploadSpeed?: number;
    dataLimitGb?: number;
    ipv6Enabled?: boolean;
    ipv6PrefixDelegation?: boolean;
    ipv6AssignmentMode?: string;
  } | null;
  serviceUsername?: string;
  ipAddress?: string;
  ipType?: string;
  macAddress?: string;
  assignedDevice?: { id: string; name: string; type: string; ipAddress: string; status: string } | null;
  activationDate?: string | null;
  billingStartDate?: string | null;
  balance?: number;
  profilePhotoPath?: string;
  kycDocPath?: string;
  kycAadhaarNumber?: string;
  gstin?: string;
  panNumber?: string;
  routerRented?: boolean;
  routerSerial?: string;
  routerDeposit?: string;
  referredBy?: { name: string; phone: string } | null;
  notes?: string;
  internalNotes?: string;
  radiusEnabled?: boolean;
  radiusUser?: boolean;
  radiusGroup?: { name: string; speedLimitDown?: number; speedLimitUp?: number } | null;
  ipStackType?: string;
  ipv6Address?: string;
  ipv6Prefix?: string;
  ipv6PrefixLength?: number;
  ipv6Duid?: string;
  ipv6AssignmentMode?: string;
  ipv6PoolId?: string | null;
}

interface View360 {
  subscriber: SubscriberData;
  billing: {
    totalBilled: number; totalPaid: number; outstandingBalance: number;
    overdueCount: number; totalInvoices: number; totalPayments: number;
    currentBalance: number; invoices: any[]; payments: any[];
  };
  support: {
    complaints: any[]; complaintStats: { status: string; count: number }[];
    openTicketCount: number;
  };
  communications: { notifications: any[]; followUps: any[]; leadSource: any };
  service: { installations: any[]; radiusSessions: any[] };
  churn: { tracking: any; atRisk: boolean };
  activity: { auditLogs: any[] };
  stats: {
    customerSince: string; daysActive: number; totalInvoices: number;
    totalPayments: number; totalBilled: number; totalPaid: number;
    lifetimeValue: number; avgMonthlyPayment: number; outstandingBalance: number;
    openTickets: number; totalComplaints: number; isKYCVerified: boolean;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return `${Math.floor(diff / 2592000000)}mo ago`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

function truncate(str: string | null | undefined, len: number = 60): string {
  if (!str) return "—";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function fileUrl(path: string): string {
  if (!path) return "";
  return `/api/files?path=${encodeURIComponent(path)}`;
}

// ─── Status Styles ───────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  SUSPENDED: "bg-amber-100 text-amber-700 border-amber-200",
  DISCONNECTED: "bg-red-100 text-red-700 border-red-200",
  PENDING_ACTIVATION: "bg-blue-100 text-blue-700 border-blue-200",
  TRIAL: "bg-purple-100 text-purple-700 border-purple-200",
};

const PRIORITY_STYLES: Record<string, string> = {
  P1_CRITICAL: "bg-red-100 text-red-700 border-red-200",
  P2_HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  P3_MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  P4_LOW: "bg-green-100 text-green-700 border-green-200",
};

const COMPLAINT_STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700 border-red-200",
  ASSIGNED: "bg-blue-100 text-blue-700 border-blue-200",
  IN_PROGRESS: "bg-amber-100 text-amber-700 border-amber-200",
  RESOLVED: "bg-green-100 text-green-700 border-green-200",
  CLOSED: "bg-gray-100 text-gray-600 border-gray-200",
  REOPENED: "bg-orange-100 text-orange-700 border-orange-200",
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600 border-gray-200",
  SENT: "bg-blue-100 text-blue-700 border-blue-200",
  PAID: "bg-green-100 text-green-700 border-green-200",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700 border-amber-200",
  OVERDUE: "bg-red-200 text-red-800 border-red-300",
  CANCELLED: "bg-gray-100 text-gray-500 border-gray-200",
  CREDIT_NOTE: "bg-purple-100 text-purple-700 border-purple-200",
};

const PAYMENT_MODE_STYLES: Record<string, string> = {
  CASH: "bg-green-50 text-green-700", UPI: "bg-purple-50 text-purple-700",
  BANK_TRANSFER: "bg-blue-50 text-blue-700", CHEQUE: "bg-amber-50 text-amber-700",
  ONLINE: "bg-cyan-50 text-cyan-700", WALLET: "bg-orange-50 text-orange-700",
};

// ─── Compact Stat Card ───────────────────────────────────────────

function StatCard({ title, value, icon: Icon, color, sub }: {
  title: string; value: string; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-card to-muted/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-widest">{title}</p>
            <p className="text-xl font-bold mt-1 tracking-tight">{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}><Icon className="h-4 w-4" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Info Row ────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value, sub, valueColor }: {
  icon: React.ElementType; label: string; value: string; sub?: string; valueColor?: string;
}) {
  if (!value || value === "—") return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="p-1.5 rounded-md bg-muted/60 shrink-0 mt-0.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-medium ${valueColor || ""}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── ScrollTable wrapper ─────────────────────────────────────────

function ScrollTable({ maxH = 400, children }: { maxH?: number; children: React.ReactNode }) {
  return <div className="max-h-[{maxH}px] overflow-y-auto rounded-md border" style={{ maxHeight: `${maxH}px` }}>{children}</div>;
}

// ─── Section Header ─────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count, className }: {
  icon: React.ElementType; title: string; count?: number; className?: string;
}) {
  return (
    <CardHeader className={`pb-2.5 ${className || ""}`}>
      <CardTitle className="text-sm font-semibold flex items-center gap-2">
        <div className="p-1 rounded-md bg-primary/10"><Icon className="h-3.5 w-3.5 text-primary" /></div>
        {title}
        {count !== undefined && <Badge variant="outline" className="text-[10px] font-normal ml-auto">{count}</Badge>}
      </CardTitle>
    </CardHeader>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function Subscriber360Page() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kycPreview, setKycPreview] = useState(false);
  const { isModuleEnabled } = useModuleStore();

  // ─── Subscriber list query ─────────────────────────────────
  const { data: subsData, isLoading: subsLoading } = useQuery<{ subscribers: SubscriberMini[] }>({
    queryKey: ["360-subs-list"],
    queryFn: () => apiFetch("/api/subscribers?limit=100"),
  });
  const allSubs = subsData?.subscribers || [];

  const filteredSubs = useMemo(() => {
    if (!search) return allSubs;
    const q = search.toLowerCase();
    return allSubs.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.phone.includes(q) ||
      (s.code || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q)
    );
  }, [allSubs, search]);

  // ─── 360° data query ───────────────────────────────────────
  const { data: viewData, isLoading: viewLoading, error: viewError, refetch } = useQuery<View360>({
    queryKey: ["subscriber-360", selectedId],
    queryFn: () => apiFetch(`/api/subscribers/${selectedId}/360`),
    enabled: !!selectedId,
    refetchOnWindowFocus: false,
  });

  const sub = viewData?.subscriber;
  const stats = viewData?.stats;

  function handleSelect(id: string) {
    setSelectedId(id);
    setSearch("");
    setKycPreview(false);
  }

  // ─── Loading State ─────────────────────────────────────────
  if (subsLoading && !selectedId) {
    return <div className="space-y-4"><Skeleton className="h-12 w-full" />{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW 1: Subscriber Selection
  // ═══════════════════════════════════════════════════════════
  if (!selectedId) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-500" /> 360° Customer View
            </h2>
            <p className="text-sm text-muted-foreground">Select a subscriber to see their complete profile</p>
          </div>
          <Badge variant="outline" className="text-xs">{filteredSubs.length} subscribers</Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, phone, code, or email…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        <Card className="border shadow-sm">
          <CardContent className="p-0">
            <ScrollTable maxH={550}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase">Code</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Name</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Phone</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Area</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Plan</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubs.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No subscribers found</TableCell></TableRow>
                  ) : (
                    filteredSubs.slice(0, 50).map(s => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleSelect(s.id)}>
                        <TableCell className="text-xs font-mono">{s.code}</TableCell>
                        <TableCell className="text-sm font-medium">{s.name}</TableCell>
                        <TableCell className="text-sm hidden sm:table-cell">{s.phone}</TableCell>
                        <TableCell className="text-sm hidden md:table-cell">{s.area?.name || "—"}</TableCell>
                        <TableCell className="text-sm hidden lg:table-cell">{s.plan?.name || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[s.status] || ""}`}>{s.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.connectionType}</TableCell>
                        <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollTable>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW 2: 360° Customer View
  // ═══════════════════════════════════════════════════════════
  if (viewLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" />
      </div>
    );
  }

  if (viewError || !viewData || !sub) {
    const errMsg = viewError?.message || "";
    const isAuthError = errMsg.includes("401") || errMsg.includes("auth") || errMsg.includes("log in");
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
        <Card className="border border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-red-700">{isAuthError ? "Session expired — please log out and log in again" : "Failed to load subscriber data"}</p>
            <p className="text-xs text-red-500/70 mt-1">{errMsg}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}><RefreshCw className="h-3 w-3 mr-1" />Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const avatarUrl = sub.profilePhotoPath ? fileUrl(sub.profilePhotoPath) : null;
  const kycDocUrl = sub.kycDocPath ? fileUrl(sub.kycDocPath) : null;
  const kycIsPdf = sub.kycDocPath?.endsWith(".pdf") || false;

  return (
    <div className="space-y-5">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setSelectedId(null)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex-1 min-w-0" />
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* ─── Churn Risk Banner ─────────────────────────────── */}
      {viewData.churn.atRisk && (
        <Card className="border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 shadow-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/50"><AlertTriangle className="h-5 w-5 text-orange-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">Churn Risk Detected</p>
              <p className="text-xs text-orange-600/80">{viewData.churn.tracking?.notes || "This subscriber has been flagged for potential churn."}</p>
            </div>
            {viewData.churn.tracking?.communications?.length > 0 && (
              <Badge variant="outline" className="text-[10px] shrink-0 border-orange-300">{viewData.churn.tracking.communications.length} retention actions</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* HERO: Profile Header Card                        */}
      {/* ═══════════════════════════════════════════════════ */}
      <Card className="border shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-6 relative">
          {/* Decorative circles */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-primary/5 rounded-full blur-2xl translate-y-1/2" />

          <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Avatar */}
            <div className="relative group shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={sub.name} className="h-20 w-20 rounded-2xl object-cover border-2 border-white/20 shadow-lg" />
              ) : (
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold text-white">{getInitials(sub.name)}</span>
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-white shadow-md">
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${STATUS_STYLES[sub.status] || ""} border-0 shadow-sm`}>{sub.status.replace(/_/g, " ")}</Badge>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3">
                <h2 className="text-xl font-bold text-white">{sub.name}</h2>
                <Badge variant="outline" className={`text-[10px] border-white/20 text-white/80 ${sub.connectionType === "FTTH" ? "bg-emerald-500/20" : sub.connectionType === "WIRELESS" ? "bg-amber-500/20" : "bg-blue-500/20"}`}>{sub.connectionType}</Badge>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                <span className="font-mono">{sub.code}</span>
                <span className="hidden sm:inline">•</span>
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{sub.phone}</span>
                {sub.email && <><span className="hidden sm:inline">•</span><span className="flex items-center gap-1"><Mail className="h-3 w-3" />{sub.email}</span></>}
                {sub.area?.name && <><span className="hidden sm:inline">•</span><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{sub.area.name}</span></>}
              </div>
              {sub.plan && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs text-white/90">
                  <Zap className="h-3 w-3 text-emerald-400" />
                  <span className="font-medium">{sub.plan.name}</span>
                  <span className="text-white/50">·</span>
                  <span>{formatINR(sub.plan.priceMonthly)}/mo</span>
                  {sub.plan.downloadSpeed && <><span className="text-white/50">·</span><span>↓{sub.plan.downloadSpeed}↑{sub.plan.uploadSpeed} Mbps</span></>}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col gap-2 shrink-0">
              <a href={`tel:${sub.phone}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition-colors">
                <PhoneCall className="h-3.5 w-3.5" /> Call
              </a>
              {stats?.isKYCVerified && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium">
                  <BadgeCheck className="h-3.5 w-3.5" /> KYC Verified
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-3 sm:grid-cols-6 divide-x bg-card">
          {[
            { label: "Lifetime Value", value: formatINR(stats?.lifetimeValue || 0), icon: DollarSign, color: "text-emerald-600" },
            { label: "Outstanding", value: formatINR(stats?.outstandingBalance || 0), icon: CreditCard, color: stats?.outstandingBalance > 0 ? "text-red-600" : "text-muted-foreground" },
            { label: "Open Tickets", value: String(stats?.openTickets || 0), icon: AlertTriangle, color: "text-amber-600" },
            { label: "Days Active", value: `${stats?.daysActive || 0}`, icon: Calendar, color: "text-blue-600" },
            { label: "Invoices", value: String(stats?.totalInvoices || 0), icon: FileText, color: "text-violet-600" },
            { label: "Payments", value: String(stats?.totalPayments || 0), icon: CheckCircle, color: "text-green-600" },
          ].map(s => (
            <div key={s.label} className="px-3 py-3 text-center">
              <s.icon className={`h-3.5 w-3.5 ${s.color} mx-auto`} />
              <p className="text-sm font-bold mt-0.5">{s.value}</p>
              <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ─── Tabs ───────────────────────────────────────────── */}
      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/60 p-1 rounded-xl">
          <TabsTrigger value="overview" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Overview</TabsTrigger>
          <TabsTrigger value="billing" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Billing & Payments</TabsTrigger>
          <TabsTrigger value="support" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Support</TabsTrigger>
          <TabsTrigger value="comms" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Communications</TabsTrigger>
          <TabsTrigger value="activity" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Activity</TabsTrigger>
          <TabsTrigger value="service" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Service</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: Overview                                     */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="space-y-5">

          {/* KYC & Documents Card */}
          <Card className="border shadow-sm">
            <SectionHeader icon={Shield} title="KYC & Documents" />
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Profile Photo Preview */}
                <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 border">
                  <div className="relative">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Profile" className="h-24 w-24 rounded-xl object-cover border shadow-sm" />
                    ) : (
                      <div className="h-24 w-24 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md">
                        <span className="text-3xl font-bold text-white">{getInitials(sub.name)}</span>
                      </div>
                    )}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-white shadow-sm border text-[9px] font-medium">
                      <Camera className="h-2.5 w-2.5 inline mr-0.5" /> Photo
                    </div>
                  </div>
                  <span className="text-xs font-medium">{avatarUrl ? "Photo on file" : "No photo uploaded"}</span>
                </div>

                {/* KYC Document */}
                <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 border">
                  {kycDocUrl && !kycIsPdf ? (
                    <div className="relative">
                      <img src={kycDocUrl} alt="KYC" className="h-24 w-24 rounded-xl object-cover border shadow-sm cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setKycPreview(true)} />
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-white shadow-sm border text-[9px] font-medium">
                        <IdCard className="h-2.5 w-2.5 inline mr-0.5" /> KYC
                      </div>
                    </div>
                  ) : kycDocUrl && kycIsPdf ? (
                    <div className="relative">
                      <div className="h-24 w-24 rounded-xl bg-red-50 border flex flex-col items-center justify-center text-red-500 cursor-pointer hover:bg-red-100 transition-colors" onClick={() => window.open(kycDocUrl, "_blank")}>
                        <FileText className="h-8 w-8" />
                        <span className="text-[9px] font-medium mt-1">PDF</span>
                      </div>
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-white shadow-sm border text-[9px] font-medium">
                        <IdCard className="h-2.5 w-2.5 inline mr-0.5" /> KYC
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 w-24 rounded-xl bg-muted border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground">
                      <Upload className="h-6 w-6" />
                      <span className="text-[9px] mt-1">No KYC doc</span>
                    </div>
                  )}
                  <span className="text-xs font-medium">{kycDocUrl ? "Document on file" : "No document uploaded"}</span>
                </div>

                {/* KYC Status */}
                <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 border">
                  <div className={`h-24 w-24 rounded-xl flex flex-col items-center justify-center border shadow-sm ${stats?.isKYCVerified ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                    {stats?.isKYCVerified ? (
                      <>
                        <BadgeCheck className="h-10 w-10 text-green-500" />
                        <span className="text-xs font-semibold text-green-700 mt-1">Verified</span>
                      </>
                    ) : (
                      <>
                        <Shield className="h-10 w-10 text-amber-500" />
                        <span className="text-xs font-semibold text-amber-700 mt-1">Pending</span>
                      </>
                    )}
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-medium">{sub.kycAadhaarNumber ? `Aadhaar: ${sub.kycAadhaarNumber}` : "No Aadhaar on file"}</span>
                    {sub.gstin && <p className="text-[10px] text-muted-foreground mt-0.5">GSTIN: {sub.gstin}</p>}
                    {sub.panNumber && <p className="text-[10px] text-muted-foreground">PAN: {sub.panNumber}</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profile Details */}
          <Card className="border shadow-sm">
            <SectionHeader icon={User} title="Profile Details" />
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                <InfoRow icon={Hash} label="Code" value={sub.code} />
                <InfoRow icon={User} label="Name" value={sub.name} />
                <InfoRow icon={Phone} label="Phone" value={sub.phone} sub={sub.altPhone} />
                <InfoRow icon={Mail} label="Email" value={sub.email || "—"} />
                <InfoRow icon={MapPin} label="Address" value={[sub.address, sub.landmark, sub.pincode].filter(Boolean).join(", ") || "—"} />
                <InfoRow icon={Globe} label="Service User" value={sub.serviceUsername || "—"} />
                <InfoRow icon={Globe} label="IP Address" value={`${sub.ipAddress || "—"} (${sub.ipType || "—"})`} />
                <InfoRow icon={Router} label="MAC Address" value={sub.macAddress || "—"} />
                <InfoRow icon={Router} label="Device" value={sub.assignedDevice?.name || "—"} sub={sub.assignedDevice?.ipAddress} />
                <InfoRow icon={Clock} label="Activated" value={formatDate(sub.activationDate)} />
                <InfoRow icon={Calendar} label="Billing Start" value={formatDate(sub.billingStartDate)} />
                {sub.routerRented && <InfoRow icon={Package} label="Router" value={`Rented · ${sub.routerSerial || "—"}`} sub={sub.routerDeposit ? `Deposit: ₹${sub.routerDeposit}` : undefined} />}
                {sub.referredBy && <InfoRow icon={UserPlus} label="Referred By" value={sub.referredBy.name} sub={sub.referredBy.phone} />}
              </div>

              {/* IPv6 Configuration (gated by ipv6 module) */}
              {isModuleEnabled("ipv6") && (
                <div className="space-y-2 pt-3 border-t border-border mt-3">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-cyan-600" />
                    <span className="text-sm font-semibold">IPv6 Configuration</span>
                    <Badge variant={sub.ipStackType === "DUAL_STACK" ? "default" : sub.ipStackType === "IPV6_ONLY" ? "secondary" : "outline"} className="text-xs">
                      {sub.ipStackType === "IPV4_ONLY" ? "IPv4 Only" : sub.ipStackType === "DUAL_STACK" ? "Dual Stack" : "IPv6 Only"}
                    </Badge>
                  </div>

                  {sub.ipStackType !== "IPV4_ONLY" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">IPv6 Address:</span>
                        <p className="font-mono">{sub.ipv6Address || "Not assigned"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Assignment Mode:</span>
                        <p className="capitalize">{sub.ipv6AssignmentMode || "SLAAC"}</p>
                      </div>
                      {sub.ipv6Prefix && (
                        <div>
                          <span className="text-muted-foreground">IPv6 Prefix (Delegated):</span>
                          <p className="font-mono">{sub.ipv6Prefix}/{sub.ipv6PrefixLength}</p>
                        </div>
                      )}
                      {sub.ipv6Duid && (
                        <div>
                          <span className="text-muted-foreground">DUID:</span>
                          <p className="font-mono text-xs break-all">{sub.ipv6Duid}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {sub.ipStackType === "IPV4_ONLY" && (
                    <p className="text-xs text-muted-foreground">IPv6 is not configured for this subscriber</p>
                  )}
                </div>
              )}

              {(sub.notes || sub.internalNotes) && (
                <div className="mt-3 pt-3 border-t">
                  {sub.notes && <p className="text-xs text-muted-foreground"><span className="font-medium">Notes:</span> {sub.notes}</p>}
                  {sub.internalNotes && <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Internal:</span> {sub.internalNotes}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Service & RADIUS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <SectionHeader icon={Zap} title="Service Details" />
              <CardContent className="space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium">{sub.plan?.name || "—"}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Speed</span><span>↓{sub.plan?.downloadSpeed || 0} / ↑{sub.plan?.uploadSpeed || 0} Mbps</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Data Limit</span><span>{sub.plan?.dataLimitGb ? `${sub.plan.dataLimitGb} GB` : "Unlimited"}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Connection</span><span>{sub.connectionType}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className={sub.balance > 0 ? "text-green-600 font-medium" : sub.balance < 0 ? "text-red-600 font-medium" : ""}>{formatINR(sub.balance)}</span></div>

                {/* IPv6 override warning */}
                {isModuleEnabled("ipv6") && sub.ipStackType !== "IPV4_ONLY" && sub.plan && !sub.plan.ipv6Enabled && (
                  <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs mt-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Plan "{sub.plan.name}" doesn't include IPv6. IPv6 is custom-assigned.</span>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <SectionHeader icon={Shield} title="RADIUS / Auth" />
              <CardContent className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center"><span className="text-muted-foreground">RADIUS</span>
                  <Badge variant={sub.radiusEnabled ? "default" : "outline"} className="text-[10px]">{sub.radiusEnabled ? "Enabled" : "Disabled"}</Badge>
                </div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">User Record</span><span>{sub.radiusUser ? "Created" : "Not Created"}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Group</span><span>{sub.radiusGroup?.name || "—"}</span></div>
                {sub.radiusGroup && <>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Limit ↓</span><span>{sub.radiusGroup.speedLimitDown || "—"} Mbps</span></div>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Limit ↑</span><span>{sub.radiusGroup.speedLimitUp || "—"} Mbps</span></div>
                </>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: Billing & Payments                            */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="billing" className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard title="Total Billed" value={formatINR(viewData.billing.totalBilled)} icon={FileText} color="bg-blue-100 text-blue-600" sub={`${viewData.billing.totalInvoices} invoices`} />
            <StatCard title="Total Paid" value={formatINR(viewData.billing.totalPaid)} icon={CheckCircle} color="bg-green-100 text-green-600" sub={`${viewData.billing.totalPayments} payments`} />
            <StatCard title="Outstanding" value={formatINR(viewData.billing.outstandingBalance)} icon={CreditCard} color="bg-red-100 text-red-600" sub={`${viewData.billing.overdueCount} overdue`} />
            <StatCard title="Avg Monthly" value={formatINR(stats?.avgMonthlyPayment || 0)} icon={TrendingUp} color="bg-purple-100 text-purple-600" />
          </div>

          <Card className="border shadow-sm">
            <SectionHeader icon={FileText} title="Invoices" count={viewData.billing.invoices.length} />
            <CardContent className="p-0">
              <ScrollTable maxH={400}>
                <Table>
                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase">Invoice #</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Issue</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Due</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Amount</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {viewData.billing.invoices.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">No invoices</TableCell></TableRow>
                    ) : viewData.billing.invoices.map(inv => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-xs font-mono">{inv.invoiceNumber}</TableCell>
                        <TableCell className="text-xs hidden sm:table-cell">{formatDate(inv.issueDate)}</TableCell>
                        <TableCell className="text-xs hidden sm:table-cell">{formatDate(inv.dueDate)}</TableCell>
                        <TableCell className="text-sm font-medium">{formatINR(inv.totalAmount)}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${INVOICE_STATUS_STYLES[inv.status] || ""}`}>{inv.status.replace(/_/g, " ")}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <SectionHeader icon={CreditCard} title="Payments" count={viewData.billing.payments.length} />
            <CardContent className="p-0">
              <ScrollTable maxH={400}>
                <Table>
                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase">Amount</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Mode</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Receipt</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Collected By</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Date</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {viewData.billing.payments.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">No payments</TableCell></TableRow>
                    ) : viewData.billing.payments.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm font-medium">{formatINR(p.amount)}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${PAYMENT_MODE_STYLES[p.paymentMode] || ""}`}>{p.paymentMode}</Badge></TableCell>
                        <TableCell><Badge variant={p.status === "VERIFIED" ? "default" : "outline"} className="text-[10px]">{p.status}</Badge></TableCell>
                        <TableCell className="text-xs font-mono hidden md:table-cell">{p.receiptNumber || "—"}</TableCell>
                        <TableCell className="text-xs hidden lg:table-cell">{p.collectedBy?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{formatDate(p.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: Support                                       */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="support" className="space-y-5">
          {viewData.support.complaintStats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {viewData.support.complaintStats.map(cs => (
                <StatCard key={cs.status} title={cs.status.replace(/_/g, " ")} value={String(cs.count)} icon={cs.status === "OPEN" ? AlertTriangle : cs.status === "RESOLVED" ? CheckCircle : Clock} color={cs.status === "OPEN" ? "bg-red-100 text-red-600" : cs.status === "RESOLVED" ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"} />
              ))}
            </div>
          )}

          <Card className="border shadow-sm">
            <SectionHeader icon={AlertTriangle} title="Tickets / Complaints" count={viewData.support.complaints.length} />
            <CardContent className="p-0">
              <ScrollTable maxH={500}>
                <Table>
                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase">Ticket #</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Type</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Priority</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Assigned</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Created</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {viewData.support.complaints.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">No complaints</TableCell></TableRow>
                    ) : viewData.support.complaints.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs font-mono">{c.ticketNumber}</TableCell>
                        <TableCell className="text-xs hidden sm:table-cell">{c.type?.replace(/_/g, " ")}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${PRIORITY_STYLES[c.priority] || ""}`}>{c.priority?.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${COMPLAINT_STATUS_STYLES[c.status] || ""}`}>{c.status?.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-xs hidden md:table-cell max-w-[200px] truncate">{truncate(c.description, 50)}</TableCell>
                        <TableCell className="text-xs hidden lg:table-cell">{c.assignedTo?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{formatDate(c.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: Communications                                */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="comms" className="space-y-5">
          <Card className="border shadow-sm">
            <SectionHeader icon={MessageSquare} title="Notifications" count={viewData.communications.notifications.length} />
            <CardContent className="p-0">
              <ScrollTable maxH={350}>
                <Table>
                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Category</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Title</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Message</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Date</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {viewData.communications.notifications.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">No notifications</TableCell></TableRow>
                    ) : viewData.communications.notifications.map(n => (
                      <TableRow key={n.id}>
                        <TableCell><Badge variant="outline" className="text-[10px]">{n.type}</Badge></TableCell>
                        <TableCell className="text-xs">{n.category?.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-xs font-medium">{n.title}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">{truncate(n.message, 50)}</TableCell>
                        <TableCell><Badge variant={n.status === "DELIVERED" || n.status === "READ" ? "default" : n.status === "FAILED" ? "destructive" : "outline"} className="text-[10px]">{n.status}</Badge></TableCell>
                        <TableCell className="text-xs">{formatDate(n.sentAt || n.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <SectionHeader icon={UserCog} title="Agent Follow-ups" count={viewData.communications.followUps.length} />
            <CardContent className="p-0">
              <ScrollTable maxH={300}>
                <Table>
                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Notes</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Due</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Agent</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {viewData.communications.followUps.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">No follow-ups</TableCell></TableRow>
                    ) : viewData.communications.followUps.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className="text-xs">{f.type}</TableCell>
                        <TableCell className="text-xs hidden md:table-cell max-w-[200px] truncate">{truncate(f.notes, 50)}</TableCell>
                        <TableCell className="text-xs">{formatDate(f.dueDate)}</TableCell>
                        <TableCell><Badge variant={f.status === "COMPLETED" ? "default" : f.status === "PENDING" ? "outline" : "secondary"} className="text-[10px]">{f.status}</Badge></TableCell>
                        <TableCell className="text-xs hidden lg:table-cell">{f.agent?.name || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>
            </CardContent>
          </Card>

          {viewData.communications.leadSource && (
            <Card className="border shadow-sm">
              <SectionHeader icon={UserPlus} title="Lead History" />
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-3">
                  <div><span className="text-muted-foreground">Source:</span> <Badge variant="outline" className="text-[10px] ml-1">{viewData.communications.leadSource.source}</Badge></div>
                  <div><span className="text-muted-foreground">Score:</span> <span className="font-medium ml-1">{viewData.communications.leadSource.score || "—"}</span></div>
                  <div><span className="text-muted-foreground">Assigned:</span> <span className="ml-1">{viewData.communications.leadSource.assignedTo?.name || "—"}</span></div>
                </div>
                {viewData.communications.leadSource.communications?.length > 0 && (
                  <ScrollTable maxH={200}>
                    <Table>
                      <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Notes</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Outcome</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Date</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {viewData.communications.leadSource.communications.map((c: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{c.type}</TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate">{truncate(c.notes, 50)}</TableCell>
                            <TableCell className="text-xs">{c.outcome || "—"}</TableCell>
                            <TableCell className="text-xs">{formatDate(c.date)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollTable>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: Activity Log                                  */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="activity" className="space-y-5">
          <Card className="border shadow-sm">
            <SectionHeader icon={Activity} title="Audit Trail" count={viewData.activity.auditLogs.length} />
            <CardContent className="p-0">
              <ScrollTable maxH={500}>
                <Table>
                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase">Timestamp</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Action</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">User</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Details</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">IP</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {viewData.activity.auditLogs.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">No activity logs</TableCell></TableRow>
                    ) : viewData.activity.auditLogs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateTime(log.timestamp)}</TableCell>
                        <TableCell className="text-xs font-medium">{log.action}</TableCell>
                        <TableCell className="text-xs hidden sm:table-cell">{log.userName || "System"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">{truncate(log.details, 40)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell font-mono">{log.ipAddress || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* TAB: Service & Installation                        */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="service" className="space-y-5">
          <Card className="border shadow-sm">
            <SectionHeader icon={Wrench} title="Installations" count={viewData.service.installations.length} />
            <CardContent className="p-0">
              <ScrollTable maxH={400}>
                <Table>
                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase">ID</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Technician</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Scheduled</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Completed</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {viewData.service.installations.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">No installations</TableCell></TableRow>
                    ) : viewData.service.installations.map(inst => (
                      <TableRow key={inst.id}>
                        <TableCell className="text-xs font-mono">{inst.id.slice(-6)}</TableCell>
                        <TableCell><Badge variant={inst.status === "COMPLETED" ? "default" : "outline"} className="text-[10px]">{inst.status}</Badge></TableCell>
                        <TableCell className="text-xs hidden sm:table-cell">{inst.technician?.name || "—"}</TableCell>
                        <TableCell className="text-xs hidden md:table-cell">{formatDate(inst.scheduledDate)}</TableCell>
                        <TableCell className="text-xs hidden lg:table-cell">{formatDate(inst.completedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollTable>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <SectionHeader icon={Activity} title="RADIUS Sessions" count={viewData.service.radiusSessions.length} />
            <CardContent className="p-0">
              <ScrollTable maxH={350}>
                <Table>
                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase">Session ID</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">NAS IP</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Framed IP</TableHead>
                    {isModuleEnabled("ipv6") && (
                      <TableHead className="text-xs hidden md:table-cell">IPv6 Address</TableHead>
                    )}
                    <TableHead className="text-xs font-medium uppercase">Duration</TableHead>
                    <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Start</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {viewData.service.radiusSessions.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">No RADIUS sessions</TableCell></TableRow>
                    ) : viewData.service.radiusSessions.map(s => {
                      const duration = s.acctSessionTime ? `${Math.floor(s.acctSessionTime / 3600)}h ${Math.floor((s.acctSessionTime % 3600) / 60)}m` : "—";
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs font-mono">{s.sessionId || s.id.slice(-8)}</TableCell>
                          <TableCell className="text-xs font-mono hidden sm:table-cell">{s.nasIp || "—"}</TableCell>
                          <TableCell className="text-xs font-mono hidden md:table-cell">{s.framedIp || "—"}</TableCell>
                          {isModuleEnabled("ipv6") && (
                            <TableCell className="hidden md:table-cell font-mono text-xs">
                              {s.framedIpv6 || "—"}
                            </TableCell>
                          )}
                          <TableCell className="text-xs">{duration}</TableCell>
                          <TableCell className="text-xs hidden lg:table-cell">{formatDateTime(s.startTime)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollTable>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── KYC Document Preview Modal ──────────────────────── */}
      {kycPreview && kycDocUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setKycPreview(false)}>
          <div className="relative max-w-2xl w-full max-h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <button className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors" onClick={() => setKycPreview(false)}>
              <X className="h-4 w-4" />
            </button>
            <img src={kycDocUrl} alt="KYC Document" className="w-full h-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
