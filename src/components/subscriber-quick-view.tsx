"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, formatINR } from "@/lib/utils";
import {
  Phone, Mail, MapPin, Calendar, Cable, Wifi, Plug, Server, Network,
  IndianRupee, FileText, AlertTriangle, Monitor, Pencil, Receipt,
  MessageSquare, ChevronRight, Clock, BadgeCheck,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

// ─── Types ──────────────────────────────────────────────
interface SubscriberQuickViewProps {
  subscriberId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SubscriberDetail {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string;
  status: string;
  connectionType: string;
  address: string | null;
  balance: number;
  createdAt: string;
  activationDate: string | null;
  notes: string | null;
  area: { id: string; name: string } | null;
  plan: {
    id: string; name: string; priceMonthly: number;
    downloadSpeed: number | null; uploadSpeed: number | null;
    group: { id: string; name: string } | null;
  } | null;
  payments: {
    id: string; receiptNumber: string; amount: number;
    status: string; paymentMode: string; createdAt: string;
  }[];
  complaints: {
    id: string; ticketNumber: string; type: string;
    priority?: string; status: string; createdAt: string;
  }[];
  invoices: {
    id: string; invoiceNumber: string; grandTotal: number;
    status: string; paidAmount: number; createdAt: string;
  }[];
}

// ─── Status styling map ─────────────────────────────────
const STATUS_STYLES: Record<string, { label: string; badgeClass: string; dotColor: string }> = {
  ACTIVE: {
    label: "Active",
    badgeClass: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
    dotColor: "bg-green-500",
  },
  INACTIVE: {
    label: "Inactive",
    badgeClass: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700",
    dotColor: "bg-gray-500",
  },
  SUSPENDED: {
    label: "Suspended",
    badgeClass: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
    dotColor: "bg-red-500",
  },
  DISCONNECTED: {
    label: "Disconnected",
    badgeClass: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700",
    dotColor: "bg-gray-400",
  },
  TRIAL: {
    label: "Trial",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    dotColor: "bg-amber-500",
  },
  PENDING_ACTIVATION: {
    label: "Pending Activation",
    badgeClass: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800",
    dotColor: "bg-teal-500",
  },
};

// ─── Connection type icon ───────────────────────────────
function ConnectionTypeIcon({ type }: { type: string }) {
  const cls = "h-4 w-4 shrink-0";
  switch (type) {
    case "FTTH": return <Cable className={`${cls} text-green-500`} />;
    case "WIRELESS": return <Wifi className={`${cls} text-amber-500`} />;
    case "CABLE": return <Plug className={`${cls} text-teal-500`} />;
    case "LEASED_LINE": return <Server className={`${cls} text-red-500`} />;
    case "ETHERNET": return <Network className={`${cls} text-gray-500`} />;
    default: return <Cable className={`${cls} text-gray-400`} />;
  }
}

const CONNECTION_LABELS: Record<string, string> = {
  FTTH: "FTTH",
  WIRELESS: "Wireless",
  CABLE: "Cable",
  LEASED_LINE: "Leased Line",
  ETHERNET: "Ethernet",
};

// ─── Helpers ────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarColor(name: string): string {
  const colors = [
    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ─── Loading Skeleton ───────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-0 px-4 pb-6">
      {/* Avatar + name skeleton */}
      <div className="flex items-center gap-3 py-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-5 w-16 mt-1" />
        </div>
      </div>
      <Separator />
      {/* Plan & connection */}
      <div className="space-y-3 py-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-36" />
      </div>
      <Separator />
      {/* Contact */}
      <div className="space-y-3 py-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-4 w-52" />
      </div>
      <Separator />
      {/* Payment + complaints */}
      <div className="space-y-3 py-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Separator />
      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28" />
        ))}
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────
export default function SubscriberQuickView({
  subscriberId,
  open,
  onOpenChange,
}: SubscriberQuickViewProps) {

  const { data: subscriber, isLoading, isError } = useQuery<SubscriberDetail>({
    queryKey: ["subscriber-quick-view", subscriberId],
    queryFn: () => apiFetch<SubscriberDetail>(`/api/subscribers/${subscriberId}`),
    enabled: !!subscriberId && open,
    staleTime: 30_000,
  });

  // Derived data
  const openComplaints = useMemo(() => {
    if (!subscriber?.complaints) return [];
    return subscriber.complaints.filter(
      (c) => c.status === "OPEN" || c.status === "ASSIGNED" || c.status === "IN_PROGRESS" || c.status === "REOPENED"
    );
  }, [subscriber]);

  const lastPayment = subscriber?.payments?.[0] ?? null;
  const statusInfo = STATUS_STYLES[subscriber?.status ?? ""] ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 overflow-y-auto"
      >
        <SheetHeader className="px-4 pt-4 pb-0">
          <SheetTitle className="sr-only">Subscriber Quick View</SheetTitle>
          <SheetDescription className="sr-only">
            Detailed subscriber information panel
          </SheetDescription>
        </SheetHeader>

        {isLoading && <LoadingSkeleton />}

        {isError && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-sm font-medium text-foreground">Failed to load subscriber</p>
            <p className="text-xs text-muted-foreground mt-1">
              The subscriber data could not be fetched. Please try again.
            </p>
          </div>
        )}

        {subscriber && !isLoading && (
          <div className="space-y-0">
            {/* ─── Header: Avatar + Name + Status ─── */}
            <div className="px-4 pt-2 pb-4">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div
                  className={`h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${avatarColor(subscriber.name)}`}
                >
                  {getInitials(subscriber.name)}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h3 className="text-base font-semibold text-foreground truncate leading-tight">
                    {subscriber.name}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {subscriber.code}
                  </p>
                  {statusInfo && (
                    <Badge
                      variant="outline"
                      className={`mt-1.5 text-[10px] font-semibold px-2 py-0 ${statusInfo.badgeClass}`}
                    >
                      <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 ${statusInfo.dotColor}`} />
                      {statusInfo.label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Separator className="mx-4" />

            {/* ─── Contact Information ─── */}
            <div className="px-4 py-3 space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contact Information
              </p>
              {subscriber.phone && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground">{subscriber.phone}</span>
                </div>
              )}
              {subscriber.email && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{subscriber.email}</span>
                </div>
              )}
            </div>

            <Separator className="mx-4" />

            {/* ─── Connection & Plan ─── */}
            <div className="px-4 py-3 space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Connection & Plan
              </p>

              {/* Connection Type */}
              <div className="flex items-center gap-2.5 text-sm">
                <ConnectionTypeIcon type={subscriber.connectionType} />
                <span className="text-foreground">
                  {CONNECTION_LABELS[subscriber.connectionType] ?? subscriber.connectionType ?? "N/A"}
                </span>
              </div>

              {/* Plan */}
              {subscriber.plan ? (
                <div className="flex items-center gap-2.5 text-sm">
                  <IndianRupee className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground font-medium">
                    {subscriber.plan.name}
                  </span>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">
                    {formatINR(subscriber.plan.priceMonthly)}/mo
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <IndianRupee className="h-3.5 w-3.5 shrink-0" />
                  <span>No plan assigned</span>
                </div>
              )}

              {/* Speed (if available) */}
              {subscriber.plan?.downloadSpeed != null && (
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {Math.round(subscriber.plan.downloadSpeed / 1000)} Mbps Down
                    {subscriber.plan.uploadSpeed != null && ` / ${Math.round(subscriber.plan.uploadSpeed / 1000)} Mbps Up`}
                  </span>
                </div>
              )}

              {/* Area */}
              {subscriber.area && (
                <div className="flex items-center gap-2.5 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground">{subscriber.area.name}</span>
                </div>
              )}
            </div>

            <Separator className="mx-4" />

            {/* ─── Address & Registration ─── */}
            <div className="px-4 py-3 space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Address & Registration
              </p>

              {subscriber.address && (
                <div className="flex items-start gap-2.5 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-foreground">{subscriber.address}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-foreground">
                  Registered {formatDate(subscriber.createdAt)}
                </span>
              </div>

              {subscriber.activationDate && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-foreground">
                    Activated {formatDate(subscriber.activationDate)}
                  </span>
                </div>
              )}
            </div>

            <Separator className="mx-4" />

            {/* ─── Billing & Activity ─── */}
            <div className="px-4 py-3 space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Billing & Activity
              </p>

              {/* Last Payment */}
              {lastPayment ? (
                <div className="flex items-center gap-2.5 text-sm">
                  <Receipt className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <span className="text-foreground font-medium">
                      {formatINR(lastPayment.amount)}
                    </span>
                    <span className="text-muted-foreground ml-1.5">
                      via {lastPayment.paymentMode}
                    </span>
                    <span className="text-xs text-muted-foreground block">
                      {formatDate(lastPayment.createdAt)} &middot; {formatRelativeTime(lastPayment.createdAt)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Receipt className="h-3.5 w-3.5 shrink-0" />
                  <span>No payments recorded</span>
                </div>
              )}

              {/* Balance */}
              <div className="flex items-center gap-2.5 text-sm">
                <IndianRupee className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-foreground">
                  Balance:{" "}
                  <span className={subscriber.balance > 0 ? "text-green-600 dark:text-green-400 font-medium" : subscriber.balance < 0 ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                    {formatINR(subscriber.balance)}
                  </span>
                </span>
              </div>

              {/* Open Complaints */}
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  // Navigate to complaints page filtered by this subscriber
                  window.location.hash = `/complaints?subscriber=${subscriber.id}`;
                }}
                className="flex items-center gap-2.5 text-sm w-full text-left hover:bg-muted/50 rounded-md px-1 py-0.5 -mx-1 transition-colors group"
              >
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-foreground">
                  {openComplaints.length} Open Complaint{openComplaints.length !== 1 ? "s" : ""}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>

            <Separator className="mx-4" />

            {/* ─── Quick Actions ─── */}
            <div className="px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Quick Actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-9 justify-start gap-1.5"
                  onClick={() => {
                    onOpenChange(false);
                    window.location.hash = `/subscribers?id=${subscriber.id}&action=edit`;
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-9 justify-start gap-1.5"
                  onClick={() => {
                    onOpenChange(false);
                    window.location.hash = `/invoices?subscriber=${subscriber.id}`;
                  }}
                >
                  <FileText className="h-3.5 w-3.5" />
                  View Invoices
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-9 justify-start gap-1.5"
                  onClick={() => {
                    onOpenChange(false);
                    window.location.hash = `/complaints?subscriberId=${subscriber.id}&action=new`;
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Log Complaint
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-9 justify-start gap-1.5"
                  onClick={() => {
                    onOpenChange(false);
                    window.location.hash = `/devices?subscriber=${subscriber.id}`;
                  }}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  View Devices
                </Button>
              </div>
            </div>

            {/* Bottom padding for mobile safe area */}
            <div className="h-safe-bottom" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
