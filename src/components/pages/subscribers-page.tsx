"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatINR, cn } from "@/lib/utils";
import {
  Users, Plus, Search, MoreHorizontal, Eye, Pencil, Trash2, Ban, CheckCircle2,
  Phone, Mail, MapPin, Wifi, X, Download, ChevronLeft, ChevronRight,
  IndianRupee, ArrowUpDown, ArrowUp, ArrowDown, Unplug, Cable, Zap, Plug,
  Server, MessageSquare, Filter, CircleDot, Upload, UserPlus, Clock,
  MoreVertical, Activity, UserCheck, UserX, Timer, AlertTriangle, TrendingUp,
  Copy, EyeOff, RefreshCw, KeyRound, Shield, CreditCard, Lock,
  User, Router, Globe, Network, ServerCrash,
  FileText, Calendar, Receipt, ClipboardList,
  UserSearch, UserCog, Power, UserMinus, WifiOff, Repeat, Info,
} from "lucide-react";
import { buildCsvString, generateExportFilename } from "@/lib/export-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import PageHeader from "@/components/page-header";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useModuleStore } from "@/store/module-store";
import { useAppStore } from "@/store/app-store";
import SubscriberQuickView from "@/components/subscriber-quick-view";

// ─── Types ──────────────────────────────────────────────
interface PlanOption { id: string; name: string; priceMonthly: number; priceQuarterly?: number; priceHalfYearly?: number; priceYearly?: number; downloadSpeed?: number; uploadSpeed?: number; validityDays?: number; ipv6Enabled?: boolean; ipv6AssignmentMode?: string }
interface AreaOption { id: string; name: string }
interface SubnetOption { id: string; name: string; cidr: string; gateway: string; description: string; totalIps: number; freeIps: number; usedIps: number }
interface IpOption { id: string; address: string; hostname: string }
interface DeviceOption { id: string; name: string; type: string; ipAddress: string; status: string }
interface PlanOptionWithGroup extends PlanOption { groupId?: string | null; groupName?: string | null }
interface Subscriber {
  id: string; code: string; name: string; email: string; phone: string;
  address: string; status: string; connectionType: string;
  area: AreaOption | null; plan: PlanOption | null;
  balance: number;
  ipStackType?: string; ipv6Address?: string;
  radiusEnabled?: boolean;
  serviceUsername?: string;
  lastAuthTimestamp?: string;
  lastAuthResult?: string;
  activeSessions?: number;
  createdAt: string;
  updatedAt: string;
}
interface SubscriberDetail extends Subscriber {
  altPhone: string; landmark: string; pincode: string; notes: string;
  serviceUsername: string; servicePassword?: string;
  ipAddress: string; macAddress: string; ipType?: string;
  activationDate: string | null; billingStartDate?: string | null;
  assignedDevice?: { id: string; name: string; type: string; ipAddress: string; status: string } | null;
  loginRestriction?: string;
  routerRented?: boolean; routerSerial?: string; routerDeposit?: string;
  gstin?: string; panNumber?: string; kycAadhaarNumber?: string; kycVerified?: boolean;
  kycDocPath?: string; profilePhotoPath?: string;
  internalNotes?: string;
  radiusGroupId?: string | null; radiusGroupName?: string | null;
  sessionTimeout?: number | null; idleTimeout?: number | null;
  ipStackType: string;
  ipv6Address: string;
  ipv6Prefix: string;
  ipv6PrefixLength: number;
  ipv6Duid: string;
  ipv6AssignmentMode: string;
  radiusEnabled?: boolean;
  lastAuthTimestamp?: string;
  lastAuthResult?: string;
  activeSessions?: number;
  invoices?: { id: string; invoiceNumber: string; grandTotal: number; status: string; paidAmount: number; createdAt: string }[];
  payments?: { id: string; receiptNumber: string; amount: number; status: string; paymentMode: string; createdAt: string }[];
  complaints?: { id: string; ticketNumber: string; type: string; priority?: string; status: string; createdAt: string }[];
}

// ─── Constants ──────────────────────────────────────────
// ─── Status map with dot indicators ──────────────────────
const STATUS_MAP: Record<string, { label: string; class: string; dot: string }> = {
  ACTIVE: { label: "Active", class: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800", dot: "bg-green-500" },
  INACTIVE: { label: "Inactive", class: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700", dot: "bg-gray-500" },
  SUSPENDED: { label: "Suspended", class: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800", dot: "bg-red-500" },
  DISCONNECTED: { label: "Disconnected", class: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700", dot: "bg-gray-400" },
  TRIAL: { label: "Trial", class: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800", dot: "bg-amber-500" },
  PENDING_ACTIVATION: { label: "Pending", class: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800", dot: "bg-blue-500" },
};

// ─── Connection type icon helper ─────────────────────────
function ConnectionTypeIcon({ type, className = "h-3.5 w-3.5" }: { type: string; className?: string }) {
  switch (type) {
    case "FTTH": return <Cable className={`${className} text-green-500`} />;
    case "WIRELESS": return <Wifi className={`${className} text-amber-500`} />;
    case "CABLE": return <Plug className={`${className} text-blue-500`} />;
    case "LEASED_LINE": return <Server className={`${className} text-purple-500`} />;
    case "ETHERNET": return <Network className={`${className} text-gray-500`} />;
    default: return <Cable className={`${className} text-gray-400`} />;
  }
}

// ─── Connection type left-border colors ───────────────────
const CONNECTION_BORDER_MAP: Record<string, string> = {
  FTTH: "border-l-green-500",
  WIRELESS: "border-l-amber-500",
  CABLE: "border-l-blue-500",
  LEASED_LINE: "border-l-purple-500",
  ETHERNET: "border-l-gray-500",
};

// ─── Plan speed tier badge helper ────────────────────────
function getPlanSpeedTier(planName: string): { class: string } {
  const match = planName.match(/(\d+)/);
  const speed = match ? parseInt(match[1], 10) : 0;
  if (speed <= 40) return { class: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700" };
  if (speed <= 100) return { class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800" };
  if (speed <= 200) return { class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" };
  return { class: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800" };
}

function extractPlanSpeed(planName: string): string {
  const match = planName.match(/(\d+)/);
  return match ? match[1] : "";
}

const INVOICE_STATUS_MAP: Record<string, { label: string; class: string }> = {
  DRAFT: { label: "Draft", class: "bg-gray-100 text-gray-600 border-gray-200" },
  SENT: { label: "Sent", class: "bg-teal-50 text-teal-700 border-teal-100" },
  PAID: { label: "Paid", class: "bg-green-100 text-green-700 border-green-200" },
  PARTIALLY_PAID: { label: "Partial", class: "bg-orange-100 text-orange-700 border-orange-200" },
  OVERDUE: { label: "Overdue", class: "bg-red-100 text-red-700 border-red-200" },
  CANCELLED: { label: "Cancelled", class: "bg-gray-100 text-gray-500 border-gray-200" },
  CREDIT_NOTE: { label: "Credit Note", class: "bg-purple-100 text-purple-700 border-purple-200" },
  VOID: { label: "Void", class: "bg-gray-100 text-gray-400 border-gray-200" },
};

const COMPLAINT_STATUS_MAP: Record<string, { label: string; class: string }> = {
  OPEN: { label: "Open", class: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  ASSIGNED: { label: "Assigned", class: "bg-teal-50 text-teal-700 border-teal-100" },
  IN_PROGRESS: { label: "In Progress", class: "bg-orange-100 text-orange-700 border-orange-200" },
  RESOLVED: { label: "Resolved", class: "bg-green-100 text-green-700 border-green-200" },
  CLOSED: { label: "Closed", class: "bg-gray-100 text-gray-600 border-gray-200" },
  REOPENED: { label: "Reopened", class: "bg-red-100 text-red-700 border-red-200" },
};

const COMPLAINT_TYPE_LABELS: Record<string, string> = {
  NO_INTERNET: "No Internet",
  SLOW_SPEED: "Slow Speed",
  CABLE_CUT: "Cable Cut",
  WIFI_ISSUE: "WiFi Issue",
  PLAN_CHANGE: "Plan Change",
  BILLING_QUERY: "Billing Query",
  VOIP_ISSUE: "VoIP Issue",
  IPTV_ISSUE: "IPTV Issue",
  NEW_CONNECTION: "New Connection",
  OTHER: "Other",
};

const CONNECTION_LABELS: Record<string, string> = {
  FTTH: "FTTH", WIRELESS: "Wireless", CABLE: "Cable", LEASED_LINE: "Leased Line", ETHERNET: "Ethernet",
};

const PAYMENT_MODE_MAP: Record<string, { label: string; class: string }> = {
  CASH: { label: "Cash", class: "bg-green-100 text-green-700 border-green-200" },
  UPI: { label: "UPI", class: "bg-purple-100 text-purple-700 border-purple-200" },
  BANK_TRANSFER: { label: "Bank Transfer", class: "bg-sky-100 text-sky-700 border-sky-200" },
  CHEQUE: { label: "Cheque", class: "bg-orange-100 text-orange-700 border-orange-200" },
  ONLINE: { label: "Online", class: "bg-teal-50 text-teal-700 border-teal-100" },
  CREDIT_NOTE: { label: "Credit Note", class: "bg-gray-100 text-gray-600 border-gray-200" },
  ADJUSTMENT: { label: "Adjustment", class: "bg-gray-100 text-gray-600 border-gray-200" },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; class: string }> = {
  VERIFIED: { label: "Verified", class: "bg-green-100 text-green-700 border-green-200" },
  PENDING: { label: "Pending", class: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  FAILED: { label: "Failed", class: "bg-red-100 text-red-700 border-red-200" },
  REVERSED: { label: "Reversed", class: "bg-gray-100 text-gray-600 border-gray-200" },
};

const COMPLAINT_PRIORITY_MAP: Record<string, { label: string; class: string }> = {
  LOW: { label: "Low", class: "bg-gray-100 text-gray-600 border-gray-200" },
  MEDIUM: { label: "Medium", class: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  HIGH: { label: "High", class: "bg-orange-100 text-orange-700 border-orange-200" },
  CRITICAL: { label: "Critical", class: "bg-red-100 text-red-700 border-red-200" },
};

const SORTABLE_COLUMNS = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
  { key: "balance", label: "Balance" },
  { key: "createdAt", label: "Created" },
] as const;

// ─── Relative time helper ───────────────────────────────
function relativeTime(dateStr: string): string {
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

function activityDotColor(dateStr: string, status: string): string {
  if (status === "SUSPENDED" || status === "DISCONNECTED") return "bg-red-400";
  if (!dateStr) return "bg-gray-400";
  const diffH = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
  if (diffH < 24) return "bg-green-500";
  if (diffH < 72) return "bg-yellow-400";
  return "bg-red-400";
}

function genId(len: number): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── File Upload Helper ─────────────────────────────────
async function uploadFile(file: File, type: "profile" | "kyc"): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);
  const resp = await fetch("/api/upload", { method: "POST", body: formData });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || "Upload failed");
  }
  const data = await resp.json();
  return data.path; // store relative path in DB
}

// ─── Bulk action mutation ───────────────────────────────
function useBulkStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      apiFetch("/api/subscribers/bulk", { method: "POST", body: JSON.stringify({ action: "change-status", subscriberIds: ids, status }) }),
    onSuccess: (d: any, vars) => {
      if (d.error) { toast.error(d.error); return; }
      const labels: Record<string, string> = { ACTIVE: "activated", SUSPENDED: "suspended" };
      toast.success(`${vars.ids.length} subscriber${vars.ids.length > 1 ? "s" : ""} ${labels[vars.status] || "updated"}`);
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
    },
    onError: () => toast.error("Bulk action failed"),
  });
}

// ─── Bulk renew mutation ────────────────────────────────
function useBulkRenewMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { ids: string[]; months: number; paymentMode: string; recordPayment: boolean }) =>
      apiFetch("/api/subscribers/bulk", { method: "POST", body: JSON.stringify({ action: "renew", subscriberIds: vars.ids, months: vars.months, paymentMode: vars.paymentMode, recordPayment: vars.recordPayment }) }),
    onSuccess: (d: any) => {
      if (d.error) { toast.error(d.error); return; }
      const skipped = d.skipped > 0 ? ` · ${d.skipped} skipped (no plan)` : "";
      const reactivated = d.reactivated > 0 ? ` · ${d.reactivated} reactivated` : "";
      if (d.renewed === 0) {
        toast.error("No subscribers renewed — selected subscribers have no plan assigned");
      } else if (d.totalCollected > 0) {
        toast.success(`Renewed ${d.renewed} subscriber(s) · ${formatINR(d.totalCollected)} collected${reactivated}${skipped}`);
      } else {
        toast.success(`Renewed ${d.renewed} subscriber(s) — draft invoice(s) created${skipped}`);
      }
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["subscriber-stats"] });
      queryClient.invalidateQueries({ queryKey: ["expiring"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Bulk renewal failed"),
  });
}

// ─── Bulk change-plan mutation ──────────────────────────
function useBulkPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { ids: string[]; planId: string }) =>
      apiFetch("/api/subscribers/bulk", { method: "POST", body: JSON.stringify({ action: "change-plan", subscriberIds: vars.ids, planId: vars.planId }) }),
    onSuccess: (d: any) => {
      if (d.error) { toast.error(d.error); return; }
      if (d.updated === 0) {
        toast.info("All selected subscribers are already on this plan");
      } else {
        toast.success(`Plan changed for ${d.updated} subscriber(s)${d.radiusSynced > 0 ? ` · RADIUS group synced: ${d.radiusSynced}` : ""}`);
      }
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["subscriber-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => toast.error("Bulk plan change failed"),
  });
}

const emptyForm = {
  name: "", phone: "", email: "", altPhone: "",
  areaId: "", planId: "", connectionType: "FTTH",
  address: "", landmark: "", pincode: "",
  serviceUsername: "", servicePassword: "",
  ipType: "DYNAMIC" as "DYNAMIC" | "STATIC", ipAddress: "", macAddress: "",
  ipSubnetId: "", // subnet for IP pool selection
  generateInvoice: true,
  billingCycle: "MONTHLY" as string,
  loginRestriction: "all" as "all" | "subnet" | "specific",
  loginSubnetId: "", loginSpecificIp: "",
  assignedDeviceId: "",
  routerRented: false, routerSerial: "", routerDeposit: "",
  gstin: "", panNumber: "", kycAadhaarNumber: "", kycDocPath: "", profilePhotoPath: "",
  activationDate: "", billingStartDate: "",
  notes: "", internalNotes: "",
  // RADIUS fields
  status: "ACTIVE",
  radiusGroupId: "", // empty = use plan default
  sessionTimeout: "", // string for input, converted to number on submit
  idleTimeout: "",
  // IPv6 fields
  ipStackType: "IPV4_ONLY" as string,
  ipv6Address: "",
  ipv6Prefix: "",
  ipv6PrefixLength: 64,
  ipv6Duid: "",
  ipv6AssignmentMode: "SLAAC" as string,
};

// ─── Component ──────────────────────────────────────────
export default function SubscribersPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [connectionType, setConnectionType] = useState("");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<Subscriber | null>(null);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [createdSub, setCreatedSub] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formStep, setFormStep] = useState(1);
  const TOTAL_STEPS = 4;

  // Quick View state
  const [quickViewId, setQuickViewId] = useState<string | null>(null);

  // Row selection state
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Bulk renew / change-plan dialog state
  const [renewTargets, setRenewTargets] = useState<string[] | null>(null);
  const [planTargets, setPlanTargets] = useState<string[] | null>(null);
  const [renewMonths, setRenewMonths] = useState("1");
  const [renewPaymentMode, setRenewPaymentMode] = useState("CASH");
  const [renewRecordPayment, setRenewRecordPayment] = useState(true);
  const [bulkPlanId, setBulkPlanId] = useState("");
  const [exportingSelected, setExportingSelected] = useState(false);

  // Form state
  const [form, setForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [uploading, setUploading] = useState<string | null>(null); // "profile" | "kyc" | null

  // Bulk status mutation
  const bulkStatusMutation = useBulkStatusMutation();
  const bulkRenewMutation = useBulkRenewMutation();
  const bulkPlanMutation = useBulkPlanMutation();

  // Row selection handlers
  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllRows = () => {
    if (selectedRows.size === subscribers.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(subscribers.map((s) => s.id)));
    }
  };
  const clearSelection = () => setSelectedRows(new Set());
  const handleBulkActivate = () => {
    if (selectedRows.size === 0) return;
    bulkStatusMutation.mutate({ ids: Array.from(selectedRows), status: "ACTIVE" });
    clearSelection();
  };
  const handleBulkSuspend = () => {
    if (selectedRows.size === 0) return;
    bulkStatusMutation.mutate({ ids: Array.from(selectedRows), status: "SUSPENDED" });
    clearSelection();
  };

  // ─── Bulk renew / change-plan / export handlers ────────
  const handleBulkRenew = () => {
    if (selectedRows.size === 0) return;
    setRenewMonths("1");
    setRenewTargets(Array.from(selectedRows));
  };
  const handleBulkPlanChange = () => {
    if (selectedRows.size === 0) return;
    setBulkPlanId("");
    setPlanTargets(Array.from(selectedRows));
  };
  const handleExportSelected = async () => {
    if (selectedRows.size === 0 || exportingSelected) return;
    setExportingSelected(true);
    try {
      const d = await apiFetch("/api/subscribers/bulk", { method: "POST", body: JSON.stringify({ action: "export", subscriberIds: Array.from(selectedRows) }) });
      const rows = d?.data || [];
      if (!rows.length) { toast.error("Nothing to export"); return; }
      const headers = Object.keys(rows[0]);
      const csv = buildCsvString(headers, rows.map((r: Record<string, unknown>) => headers.map((h) => r[h])));
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = generateExportFilename("subscribers-selected");
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} subscriber(s) to CSV`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExportingSelected(false);
    }
  };

  const confirmRenew = () => {
    if (!renewTargets?.length) return;
    bulkRenewMutation.mutate({ ids: renewTargets, months: parseInt(renewMonths, 10) || 1, paymentMode: renewPaymentMode, recordPayment: renewRecordPayment });
  };
  const confirmBulkPlanChange = () => {
    if (!planTargets?.length || !bulkPlanId) return;
    bulkPlanMutation.mutate({ ids: planTargets, planId: bulkPlanId });
  };
  // Close bulk dialogs on success (kept open while pending so buttons show progress)
  useEffect(() => {
    if (bulkRenewMutation.isSuccess) { setRenewTargets(null); clearSelection(); bulkRenewMutation.reset(); }
  }, [bulkRenewMutation.isSuccess, bulkRenewMutation]);
  useEffect(() => {
    if (bulkPlanMutation.isSuccess) { setPlanTargets(null); setBulkPlanId(""); clearSelection(); bulkPlanMutation.reset(); }
  }, [bulkPlanMutation.isSuccess, bulkPlanMutation]);

  // Open add dialog with auto-generated service credentials
  const openAddDialog = () => {
    setForm({
      ...emptyForm,
      serviceUsername: `service_${genId(6)}`,
      servicePassword: genId(10),
    });
    setFormStep(1);
    setAddOpen(true);
  };
  // Form completion percentage
  const formCompletion = (() => {
    const required = [form.name, form.phone];
    const optional = [form.email, form.address, form.planId, form.areaId, form.serviceUsername];
    const filled = required.filter(Boolean).length + optional.filter(Boolean).length;
    return Math.round((filled / (required.length + optional.length)) * 100);
  })();

  // Fetch subscribers
  const { data, isLoading } = useQuery<{
    subscribers: Subscriber[]; total: number; page: number; totalPages: number;
    stats: { activeCount: number; newThisMonth: number; suspendedCount: number; trialCount: number };
  }>({
    queryKey: ["subscribers", page, search, statusFilter, areaFilter, planFilter, connectionType, sortBy, sortOrder],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page), limit: "15", search, status: statusFilter,
        areaId: areaFilter, planId: planFilter, sortBy, sortOrder,
      });
      if (connectionType) params.set("connectionType", connectionType);
      return apiFetch<{ subscribers: Subscriber[]; total: number; page: number; totalPages: number; stats: { activeCount: number; newThisMonth: number; suspendedCount: number; trialCount: number } }>(`/api/subscribers?${params}`);
    },
  });

  // Fetch subscriber stats
  const { data: statsData } = useQuery<{
    total: number; active: number; inactive: number; suspended: number;
    disconnected: number; trial: number; pending: number;
    newThisMonth: number; newLastMonth: number; growthPercent: number;
    avgMonthlyRevenue: number; totalMonthlyRevenue: number; activationRate: number;
    radiusEnabled: number;
  }>({
    queryKey: ["subscriber-stats"],
    queryFn: () => apiFetch("/api/subscribers/stats"),
    staleTime: 60_000,
  });

  // Fetch online subscriber count for status dots
  const { data: onlineCountData } = useQuery<{ onlineCount: number; totalRadiusUsers: number }>({
    queryKey: ["subscribers-online-count"],
    queryFn: () => apiFetch("/api/subscribers/online-count"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // [NEW] Expiring-soon watchlist — subscribers whose billing cycle ends within 7 days.
  // Powers the "Expiring Soon" quick filter and the amber dot on the status pill.
  const { data: expiringData } = useQuery<{ expiring: Array<{ id: string; code: string; name: string; planName: string; daysLeft: number; expiresAt: string }> }>({
    queryKey: ["subscribers-expiring"],
    queryFn: () => apiFetch("/api/subscribers/expiring?days=7"),
    staleTime: 120_000,
    refetchInterval: 300_000,
  });
  const expiringList = expiringData?.expiring ?? [];
  const expiringSet = useMemo(() => new Set(expiringList.map((s) => s.id)), [expiringList]);
  const expiringDaysById = useMemo(() => {
    const m = new Map<string, number>();
    expiringList.forEach((s) => m.set(s.id, s.daysLeft));
    return m;
  }, [expiringList]);

  // Build a Set of online subscriber IDs (mock: first onlineCount subscriber IDs from the list)
  const onlineSet = useMemo(() => {
    const subs = data?.subscribers ?? [];
    const count = onlineCountData?.onlineCount ?? 0;
    if (count === 0 || subs.length === 0) return new Set<string>();
    return new Set(subs.slice(0, count).map((s) => s.id));
  }, [data?.subscribers, onlineCountData?.onlineCount]);

  // Fetch areas for filters/form
  const { data: areas } = useQuery<AreaOption[]>({
    queryKey: ["areas-list"],
    queryFn: () => apiFetch("/api/areas?limit=100").then((d: any) => (Array.isArray(d) ? d : d.items || []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))),
  });
  // Fetch plans for filters/form
  const { data: plans } = useQuery<PlanOption[]>({
    queryKey: ["plans-list"],
    queryFn: () => apiFetch("/api/plans?limit=100").then((d: any) => (Array.isArray(d) ? d : d.items || []).map((p: PlanOption & { priceMonthly: number }) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly, priceQuarterly: p.priceQuarterly, priceHalfYearly: p.priceHalfYearly, priceYearly: p.priceYearly, downloadSpeed: p.downloadSpeed, uploadSpeed: p.uploadSpeed, validityDays: p.validityDays, ipv6Enabled: p.ipv6Enabled, ipv6AssignmentMode: p.ipv6AssignmentMode }))),
  });
  // Fetch subnets for IP pool & login restriction
  const { data: subnets } = useQuery<SubnetOption[]>({
    queryKey: ["subnets-list"],
    queryFn: () => apiFetch("/api/subnets").then((d: any) => (d?.items || []).map((s: any) => ({ id: s.id, name: s.name, cidr: s.cidr, gateway: s.gateway, description: s.description, totalIps: s.totalIps, freeIps: s.freeIps, usedIps: s.usedIps }))),
  });
  // Fetch available IPs for selected subnet (IP pool)
  const { data: availableIps } = useQuery<IpOption[]>({
    queryKey: ["subnet-ips", form.ipSubnetId],
    queryFn: () => apiFetch(`/api/subnets?subnetId=${form.ipSubnetId}&available=true`).then((d: any) => (d?.items || []).map((ip: any) => ({ id: ip.id, address: ip.address, hostname: ip.hostname }))),
    enabled: !!form.ipSubnetId,
  });
  // Fetch network devices for assignment
  const { data: devices } = useQuery<DeviceOption[]>({
    queryKey: ["devices-list"],
    queryFn: () => apiFetch("/api/devices?limit=100").then((d: any) => (Array.isArray(d) ? d : d.items || []).map((dev: any) => ({ id: dev.id, name: dev.name, type: dev.type, ipAddress: dev.ipAddress, status: dev.status }))),
  });

  // Subscriber detail
  const { data: detail } = useQuery<SubscriberDetail>({
    queryKey: ["subscriber-detail", selectedId],
    queryFn: () => apiFetch<SubscriberDetail>(`/api/subscribers/${selectedId}`),
    enabled: !!selectedId && detailOpen,
  });

  // ─── Mutations ─────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiFetch("/api/subscribers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d: any) => {
      if (d.error) { toast.error(d.error); return; }
      setCreatedSub(d);
      setAddOpen(false);
      setCredentialsOpen(true);
      setForm({ ...emptyForm });
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
    },
    onError: () => toast.error("Failed to create subscriber"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof editForm }) => apiFetch(`/api/subscribers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Subscriber updated successfully");
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["subscriber-detail", selectedId] });
    },
    onError: () => toast.error("Failed to update subscriber"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/subscribers/${id}`, { method: "DELETE" }),
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Subscriber deleted");
      setDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
    },
    onError: () => toast.error("Failed to delete subscriber"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch(`/api/subscribers/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: (d, vars) => {
      if (d.error) { toast.error(d.error); return; }
      const labels: Record<string, string> = { ACTIVE: "activated", SUSPENDED: "suspended", DISCONNECTED: "disconnected" };
      toast.success(`Subscriber ${labels[vars.status] || vars.status.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
    },
  });

  // ─── Handlers ──────────────────────────────────────────
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const openEdit = async (sub: Subscriber) => {
    setSelectedId(sub.id);
    setEditOpen(true);
    // Fetch full subscriber detail to populate all fields
    try {
      const detail = await apiFetch<SubscriberDetail>(`/api/subscribers/${sub.id}`);
      if (detail) {
        setEditForm({
          ...emptyForm,
          name: detail.name, phone: detail.phone, email: detail.email || "",
          altPhone: detail.altPhone || "", areaId: detail.area?.id || "",
          planId: detail.plan?.id || "", connectionType: detail.connectionType || "FTTH",
          address: detail.address || "", landmark: detail.landmark || "",
          pincode: detail.pincode || "", serviceUsername: detail.serviceUsername || "",
          servicePassword: "", ipType: (detail.ipType as "DYNAMIC" | "STATIC") || "DYNAMIC",
          ipAddress: detail.ipAddress || "", macAddress: detail.macAddress || "",
          ipSubnetId: "", generateInvoice: false,
          billingCycle: "MONTHLY",
          loginRestriction: "all" as "all" | "subnet" | "specific",
          loginSubnetId: "", loginSpecificIp: "",
          assignedDeviceId: detail.assignedDevice?.id || "",
          routerRented: detail.routerRented || false,
          routerSerial: detail.routerSerial || "",
          routerDeposit: detail.routerDeposit ? String(detail.routerDeposit) : "",
          gstin: detail.gstin || "", panNumber: detail.panNumber || "",
          kycAadhaarNumber: detail.kycAadhaarNumber || "",
          kycDocPath: detail.kycDocPath || "",
          profilePhotoPath: detail.profilePhotoPath || "",
          activationDate: detail.activationDate ? detail.activationDate.split("T")[0] : "",
          billingStartDate: detail.billingStartDate ? detail.billingStartDate.split("T")[0] : "",
          notes: detail.notes || "", internalNotes: detail.internalNotes || "",
          status: detail.status || "ACTIVE",
          sessionTimeout: detail.sessionTimeout ? String(detail.sessionTimeout) : "",
          idleTimeout: detail.idleTimeout ? String(detail.idleTimeout) : "",
          ipStackType: detail.ipStackType || "IPV4_ONLY",
          ipv6Address: detail.ipv6Address || "",
          ipv6Prefix: detail.ipv6Prefix || "",
          ipv6PrefixLength: detail.ipv6PrefixLength || 64,
          ipv6Duid: detail.ipv6Duid || "",
          ipv6AssignmentMode: detail.ipv6AssignmentMode || "SLAAC",
        });
      }
    } catch {
      // Fallback to basic fields from list item
      setEditForm({
        ...emptyForm, name: sub.name, phone: sub.phone, email: sub.email,
        areaId: sub.area?.id || "", planId: sub.plan?.id || "",
        connectionType: sub.connectionType, address: sub.address, notes: "",
      });
    }
  };

  const openDetail = (id: string) => { setSelectedId(id); setDetailOpen(true); };
  const openDelete = (sub: Subscriber) => { setSelectedId(sub.id); setSelectedSub(sub); setDeleteOpen(true); };

  // Open the edit dialog by subscriber id only — openEdit() fetches the
  // full detail itself; the stub object only covers the failure fallback.
  const openEditById = (id: string) => {
    openEdit({ id, code: "", name: "", email: "", phone: "", address: "", status: "ACTIVE", connectionType: "FTTH", area: null, plan: null, balance: 0, createdAt: "", updatedAt: "" });
  };

  // ─── Cross-page handshake (Subscriber Quick View "Edit"/"View") ───
  // QuickView navigates via setCurrentPage() and stores a pending action;
  // consume + clear it here so it fires exactly once.
  const pendingSubscriberAction = useAppStore((s) => s.pendingSubscriberAction);
  const setPendingSubscriberAction = useAppStore((s) => s.setPendingSubscriberAction);
  useEffect(() => {
    if (!pendingSubscriberAction) return;
    const { id, action } = pendingSubscriberAction;
    setPendingSubscriberAction(null);
    if (action === "edit") openEditById(id);
    else if (action === "view") openDetail(id);
  }, [pendingSubscriberAction]);

  const handleKickSession = async (sub: Subscriber) => {
    if (!sub.serviceUsername) {
      toast.error("No RADIUS username for this subscriber");
      return;
    }
    try {
      toast.loading("Sending CoA disconnect…", { id: "coa-disconnect" });
      const res = await fetch("/api/sessions/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: sub.serviceUsername, reason: "Admin kick from subscriber list" }),
      });
      const data = await res.json();
      toast.dismiss("coa-disconnect");
      if (data.success) {
        toast.success(data.message || "CoA disconnect sent successfully");
      } else {
        toast.error(data.message || data.error || "CoA disconnect failed");
      }
    } catch {
      toast.dismiss("coa-disconnect");
      toast.error("Failed to send CoA disconnect");
    }
  };

  const handleCreate = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.phone.trim()) { toast.error("Phone is required"); return; }
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) { toast.error("Invalid phone number (10 digits, starts 6-9)"); return; }
    if (form.altPhone && !/^[6-9]\d{9}$/.test(form.altPhone.trim())) { toast.error("Invalid alternate phone number"); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error("Invalid email format"); return; }
    if (form.kycAadhaarNumber && !/^\d{12}$/.test(form.kycAadhaarNumber.replace(/\s/g, ""))) { toast.error("Invalid Aadhaar number (12 digits)"); return; }
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) { toast.error("Invalid pincode (6 digits)"); return; }
    if (form.macAddress && !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(form.macAddress)) { toast.error("Invalid MAC address format (e.g. AA:BB:CC:DD:EE:FF)"); return; }
    if (form.ipType === "STATIC" && !form.ipAddress.trim()) { toast.error("IP Address is required for Static IP type"); return; }
    if (form.routerRented && !form.routerSerial.trim()) { toast.error("Router serial number is required"); return; }
    // IPv6 validation
    if (isModuleEnabled("ipv6") && (form.ipStackType === "DUAL_STACK" || form.ipStackType === "IPV6_ONLY")) {
      if (form.ipv6AssignmentMode === "STATIC" && !form.ipv6Address.trim()) {
        toast.error("IPv6 Address is required for Static assignment mode");
        return;
      }
      if (form.ipv6Address && !/^[0-9a-fA-F:]+$/.test(form.ipv6Address)) {
        toast.error("Invalid IPv6 address format");
        return;
      }
      if (form.ipv6Prefix && !/^[0-9a-fA-F:]+\/\d+$/.test(form.ipv6Prefix)) {
        toast.error("Invalid IPv6 prefix format (e.g., 2001:db8::/48)");
        return;
      }
    }
    createMutation.mutate({ ...form });
  };

  const handleUpdate = () => {
    if (!editForm.name.trim()) { toast.error("Name is required"); return; }
    if (!editForm.phone.trim()) { toast.error("Phone is required"); return; }
    if (!/^[6-9]\d{9}$/.test(editForm.phone.trim())) { toast.error("Invalid phone number (10 digits, starts 6-9)"); return; }
    if (editForm.altPhone && !/^[6-9]\d{9}$/.test(editForm.altPhone.trim())) { toast.error("Invalid alternate phone number"); return; }
    if (editForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) { toast.error("Invalid email format"); return; }
    if (editForm.pincode && !/^\d{6}$/.test(editForm.pincode)) { toast.error("Invalid pincode (6 digits)"); return; }
    if (editForm.macAddress && !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(editForm.macAddress)) { toast.error("Invalid MAC address format (e.g. AA:BB:CC:DD:EE:FF)"); return; }
    if (editForm.ipType === "STATIC" && !editForm.ipAddress.trim()) { toast.error("IP Address is required for Static IP type"); return; }
    if (editForm.routerRented && !editForm.routerSerial.trim()) { toast.error("Router serial number is required"); return; }
    // IPv6 validation
    if (isModuleEnabled("ipv6") && (editForm.ipStackType === "DUAL_STACK" || editForm.ipStackType === "IPV6_ONLY")) {
      if (editForm.ipv6AssignmentMode === "STATIC" && !editForm.ipv6Address.trim()) {
        toast.error("IPv6 Address is required for Static assignment mode");
        return;
      }
      if (editForm.ipv6Address && !/^[0-9a-fA-F:]+$/.test(editForm.ipv6Address)) {
        toast.error("Invalid IPv6 address format");
        return;
      }
      if (editForm.ipv6Prefix && !/^[0-9a-fA-F:]+\/\d+$/.test(editForm.ipv6Prefix)) {
        toast.error("Invalid IPv6 prefix format (e.g., 2001:db8::/48)");
        return;
      }
    }
    // Build update body — skip empty password so existing one is preserved
    const body: Record<string, unknown> = { ...editForm };
    if (!editForm.servicePassword) delete body.servicePassword;
    if (!editForm.sessionTimeout) delete body.sessionTimeout;
    else body.sessionTimeout = parseInt(editForm.sessionTimeout) || null;
    if (!editForm.idleTimeout) delete body.idleTimeout;
    else body.idleTimeout = parseInt(editForm.idleTimeout) || null;
    if (!editForm.altPhone) body.altPhone = "";
    if (!editForm.landmark) body.landmark = "";
    if (!editForm.pincode) body.pincode = "";
    if (!editForm.macAddress) body.macAddress = "";
    if (!editForm.ipAddress) body.ipAddress = "";
    if (!editForm.gstin) body.gstin = "";
    if (!editForm.panNumber) body.panNumber = "";
    if (!editForm.routerSerial) body.routerSerial = "";
    if (!editForm.routerDeposit) body.routerDeposit = 0;
    updateMutation.mutate({ id: selectedId!, body: body as typeof editForm });
  };

  // CSV Export via API
  const exportMutation = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams({
        search, status: statusFilter, areaId: areaFilter, planId: planFilter,
        sortBy, sortOrder,
      });
      if (connectionType) params.set("connectionType", connectionType);
      return fetch(`/api/subscribers/export?${params}`).then((r) => {
        if (!r.ok) throw new Error("Export failed");
        return r.blob();
      });
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported successfully");
    },
    onError: () => toast.error("Failed to export CSV"),
  });

  // ─── Sort icon helper ──────────────────────────────────
  const renderSortIcon = (column: string) => {
    if (sortBy !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortOrder === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // ─── Skeleton ──────────────────────────────────────────
  const renderSkeleton = () => (
    <div className="space-y-6">
      <Skeleton className="skeleton-wave h-7 w-40 mb-2" />
      <Skeleton className="skeleton-wave h-4 w-72" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="skeleton-wave h-9 w-64" />
        <Skeleton className="skeleton-wave h-9 w-32" />
        <Skeleton className="skeleton-wave h-9 w-32" />
      </div>
      <Card className="border shadow-sm"><CardContent className="p-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)}
      </CardContent></Card>
    </div>
  );

  if (isLoading) return renderSkeleton();

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const subscribers = expiringOnly
    ? (data?.subscribers ?? []).filter((s) => expiringSet.has(s.id))
    : (data?.subscribers ?? []);

  const hasActiveFilters = search || statusFilter || areaFilter || planFilter || connectionType || expiringOnly;
  const selectedPlan = plans?.find((p) => p.id === form.planId);

  // ─── Bulk renew / change-plan derived values (need subscribers + plans) ───
  const renewEstimate = (() => {
    const m = parseInt(renewMonths, 10) || 1;
    let base = 0, withPlan = 0, withoutPlan = 0;
    (renewTargets || []).forEach((id) => {
      const sub = subscribers.find((s) => s.id === id);
      if (!sub?.plan) { withoutPlan++; return; }
      const p = sub.plan;
      let price = (p.priceMonthly || 0) * m;
      if (m === 3 && p.priceQuarterly) price = p.priceQuarterly;
      else if (m === 6 && p.priceHalfYearly) price = p.priceHalfYearly;
      else if (m === 12 && p.priceYearly) price = p.priceYearly;
      base += price;
      withPlan++;
    });
    return { base, withPlan, withoutPlan };
  })();
  const selectedPlanForBulk = plans?.find((p) => p.id === bulkPlanId);
  const renewTargetSingle = renewTargets?.length === 1 ? subscribers.find((s) => s.id === renewTargets![0]) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={Users}
        title="Subscribers"
        description={`Manage your subscriber base — ${total} total subscriber${total !== 1 ? "s" : ""}`}
        actions={
          <>
            <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending || total === 0}>
              <Download className={`h-4 w-4 mr-2 ${exportMutation.isPending ? "animate-pulse" : ""}`} />
              {exportMutation.isPending ? "Exporting..." : "Export CSV"}
            </Button>
            {/* Quick Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <MoreVertical className="h-4 w-4 mr-1.5" />Quick Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openAddDialog}>
                  <UserPlus className="h-4 w-4 mr-2" />Add Subscriber
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending || total === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  {exportMutation.isPending ? "Exporting..." : "Export CSV"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = ".csv,.json"; input.onchange = async (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return; try { const formData = new FormData(); formData.append("file", file); const res = await fetch("/api/subscribers/bulk", { method: "POST", body: formData }); if (res.ok) { toast.success("Import completed successfully"); queryClient.invalidateQueries({ queryKey: ["subscribers"] }); } else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Import failed"); } } catch { toast.error("Import failed — check file format"); } }; input.click(); }}>
                  <Upload className="h-4 w-4 mr-2" />Import Subscribers
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={openAddDialog} className="bg-red-600 hover:bg-red-700 text-white">
              <Plus className="h-4 w-4 mr-2" />Add Subscriber
            </Button>
          </>
        }
      />

      {/* Mini Stats Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 animate-card-enter" style={{ animationDelay: "10ms" }}>
        <Card className="stat-gradient-navy border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 rounded-xl">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider opacity-80">Total</p>
                <p className="text-base sm:text-xl font-bold tabular-nums leading-tight mt-0.5">
                  {statsData?.total?.toLocaleString("en-IN") ?? "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-gradient-green border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 rounded-xl">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                <Wifi className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider opacity-80">Active</p>
                <p className="text-base sm:text-xl font-bold tabular-nums leading-tight mt-0.5">
                  {statsData?.active?.toLocaleString("en-IN") ?? "—"}
                  {statsData && statsData.total > 0 && (
                    <span className="text-[9px] sm:text-[10px] font-normal opacity-75 ml-1">
                      {Math.round((statsData.active / statsData.total) * 100)}%
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-gradient-amber border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 rounded-xl">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider opacity-80">Suspended</p>
                <p className="text-base sm:text-xl font-bold tabular-nums leading-tight mt-0.5">
                  {statsData?.suspended?.toLocaleString("en-IN") ?? "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-gradient-teal border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 rounded-xl">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider opacity-80">Trial</p>
                <p className="text-base sm:text-xl font-bold tabular-nums leading-tight mt-0.5">
                  {statsData?.trial?.toLocaleString("en-IN") ?? "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-gradient-red border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 rounded-xl">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider opacity-80">New</p>
                <p className="text-base sm:text-xl font-bold tabular-nums leading-tight mt-0.5">
                  {statsData?.newThisMonth?.toLocaleString("en-IN") ?? "—"}
                </p>
                {statsData && (statsData.growthPercent > 0 || statsData.growthPercent < 0) && (
                  <p className={`text-[9px] sm:text-[10px] mt-0.5 inline-flex items-center gap-0.5 ${statsData.growthPercent >= 0 ? "text-green-200" : "text-red-200"}`}>
                    {statsData.growthPercent >= 0 ? (
                      <TrendingUp className="h-2.5 w-2.5" />
                    ) : (
                      <ArrowDown className="h-2.5 w-2.5" />
                    )}
                    {statsData.growthPercent >= 0 ? "+" : ""}{statsData.growthPercent}%
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-gradient-emerald border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 rounded-xl">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                <IndianRupee className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider opacity-80">Revenue</p>
                <p className="text-xs sm:text-lg font-bold tabular-nums leading-tight mt-0.5">
                  {statsData ? formatINR(statsData.totalMonthlyRevenue) : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Quick Stats Summary Bar */}
      <div className="hidden md:grid md:grid-cols-4 gap-3 animate-slide-up" style={{ animationDelay: "30ms" }}>
        <div className="flex items-center gap-3 rounded-lg border border-l-4 border-l-green-500 bg-white dark:bg-card p-3 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 dark:bg-green-950/30 shrink-0">
            <UserCheck className="h-4 w-4 text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none">Total Active</p>
            <p className="text-lg font-bold text-foreground leading-tight mt-0.5">{data?.stats?.activeCount ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-l-4 border-l-sky-500 bg-white dark:bg-card p-3 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-950/30 shrink-0">
            <Timer className="h-4 w-4 text-sky-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none">New This Month</p>
            <p className="text-lg font-bold text-foreground leading-tight mt-0.5">{data?.stats?.newThisMonth ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-l-4 border-l-red-500 bg-white dark:bg-card p-3 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30 shrink-0">
            <UserX className="h-4 w-4 text-red-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none">Suspended</p>
            <p className="text-lg font-bold text-foreground leading-tight mt-0.5">{data?.stats?.suspendedCount ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-l-4 border-l-teal-500 bg-white dark:bg-card p-3 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-950/30 shrink-0">
            <Clock className="h-4 w-4 text-teal-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground leading-none">Trial</p>
            <p className="text-lg font-bold text-foreground leading-tight mt-0.5">{data?.stats?.trialCount ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="border shadow-sm card-hover-lift animate-slide-up" style={{ animationDelay: "50ms" }}>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name, phone, email, code..."
                className={`pl-9 pr-8 transition-colors focus-visible:ring-1 ${search ? "pr-8" : ""}`}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setPage(1); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors rounded-sm"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="DISCONNECTED">Disconnected</SelectItem>
                <SelectItem value="TRIAL">Trial</SelectItem>
                <SelectItem value="PENDING_ACTIVATION">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={areaFilter || "all"} onValueChange={(v) => { setAreaFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Area" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Areas</SelectItem>
                {areas?.map?.((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={planFilter || "all"} onValueChange={(v) => { setPlanFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {plans?.map?.((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {formatINR(p.priceMonthly)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={connectionType || "all"} onValueChange={(v) => { setConnectionType(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Connection" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="FTTH">FTTH</SelectItem>
                <SelectItem value="WIRELESS">Wireless</SelectItem>
                <SelectItem value="CABLE">Cable</SelectItem>
                <SelectItem value="LEASED_LINE">Leased Line</SelectItem>
                <SelectItem value="ETHERNET">Ethernet</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={expiringOnly ? "default" : "outline"}
              size="sm"
              onClick={() => { setExpiringOnly(!expiringOnly); setPage(1); }}
              className={expiringOnly ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600" : "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"}
              title="Subscribers whose billing cycle ends within 7 days"
            >
              <Clock className="h-3 w-3 mr-1" />
              Expiring Soon
              {expiringSet.size > 0 && (
                <span className={`ml-1 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-semibold ${expiringOnly ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"}`}>
                  {expiringSet.size}
                </span>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter(""); setAreaFilter(""); setPlanFilter(""); setConnectionType(""); setExpiringOnly(false); setSortBy("createdAt"); setSortOrder("desc"); setPage(1); }}>
              <X className="h-3 w-3 mr-1" />Clear
            </Button>
          </div>
          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
              <span className="text-xs text-muted-foreground font-medium">Active filters:</span>
              {expiringOnly && (
                <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1.5 py-0.5 cursor-default bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <Clock className="h-3 w-3" />
                  Expiring within 7 days
                  <button onClick={() => { setExpiringOnly(false); setPage(1); }} className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5 transition-colors" aria-label="Remove expiring filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              )}
              {search && (
                <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1.5 py-0.5 cursor-default">
                  <Search className="h-3 w-3" />
                  "{search.length > 20 ? search.slice(0, 20) + "…" : search}"
                  <button onClick={() => { setSearch(""); setPage(1); }} className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5 transition-colors" aria-label="Remove search filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              )}
              {statusFilter && (
                <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1.5 py-0.5 cursor-default">
                  <Filter className="h-3 w-3" />
                  {STATUS_MAP[statusFilter]?.label || statusFilter}
                  <button onClick={() => { setStatusFilter(""); setPage(1); }} className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5 transition-colors" aria-label="Remove status filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              )}
              {areaFilter && areas && (
                <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1.5 py-0.5 cursor-default">
                  <MapPin className="h-3 w-3" />
                  {areas.find((a) => a.id === areaFilter)?.name || areaFilter}
                  <button onClick={() => { setAreaFilter(""); setPage(1); }} className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5 transition-colors" aria-label="Remove area filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              )}
              {planFilter && plans && (
                <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1.5 py-0.5 cursor-default">
                  <Zap className="h-3 w-3" />
                  {plans.find((p) => p.id === planFilter)?.name || planFilter}
                  <button onClick={() => { setPlanFilter(""); setPage(1); }} className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5 transition-colors" aria-label="Remove plan filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              )}
              {connectionType && (
                <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1.5 py-0.5 cursor-default">
                  <Cable className="h-3 w-3" />
                  {CONNECTION_LABELS[connectionType] || connectionType}
                  <button onClick={() => { setConnectionType(""); setPage(1); }} className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5 transition-colors" aria-label="Remove connection type filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              )}
              <button
                onClick={() => { setSearch(""); setStatusFilter(""); setAreaFilter(""); setPlanFilter(""); setConnectionType(""); setSortBy("createdAt"); setSortOrder("desc"); setPage(1); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions Bar */}
      {subscribers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 animate-slide-up" style={{ animationDelay: "90ms" }}>
          {selectedRows.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 animate-card-enter">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <span className="text-xs font-semibold text-primary tabular-nums">{selectedRows.size}</span>
                <span className="text-xs text-muted-foreground">selected</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400"
                onClick={handleBulkActivate}
                disabled={bulkStatusMutation.isPending}
              >
                <Power className="h-3.5 w-3.5" />
                Activate Selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400"
                onClick={handleBulkSuspend}
                disabled={bulkStatusMutation.isPending}
              >
                <UserMinus className="h-3.5 w-3.5" />
                Suspend Selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                onClick={handleBulkRenew}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Renew
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400"
                onClick={handleBulkPlanChange}
              >
                <Repeat className="h-3.5 w-3.5" />
                Change Plan
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleExportSelected}
                disabled={exportingSelected}
              >
                <Download className={cn("h-3.5 w-3.5", exportingSelected && "animate-pulse")} />
                {exportingSelected ? "Exporting..." : "Export"}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>
                <X className="h-3 w-3 mr-1" />Clear
              </Button>
            </div>
          )}
          {selectedRows.size === 0 && subscribers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{subscribers.length}</span> of <span className="font-medium text-foreground">{total}</span> subscribers
            </p>
          )}
        </div>
      )}

      {/* Table */}
      <Card className="border shadow-sm animate-slide-up" style={{ animationDelay: "100ms" }}>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={subscribers.length > 0 && selectedRows.size === subscribers.length}
                      onCheckedChange={toggleAllRows}
                      className="h-4 w-4"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => handleSort("code")}>
                    <span className="inline-flex items-center">Code {renderSortIcon("code")}</span>
                  </TableHead>
                  <TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => handleSort("name")}>
                    <span className="inline-flex items-center">Name {renderSortIcon("name")}</span>
                  </TableHead>
                  <TableHead className="text-xs font-semibold hidden md:table-cell cursor-pointer select-none" onClick={() => handleSort("phone")}>
                    <span className="inline-flex items-center">Phone {renderSortIcon("phone")}</span>
                  </TableHead>
                  <TableHead className="text-xs font-semibold hidden lg:table-cell">Plan</TableHead>
                  <TableHead className="text-xs font-semibold hidden lg:table-cell">Area</TableHead>
                  <TableHead className="text-xs font-semibold hidden md:table-cell cursor-pointer select-none" onClick={() => handleSort("balance")}>
                    <span className="inline-flex items-center">Balance {renderSortIcon("balance")}</span>
                  </TableHead>
                  <TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => handleSort("status")}>
                    <span className="inline-flex items-center">Status {renderSortIcon("status")}</span>
                  </TableHead>
                  <TableHead className="text-xs font-semibold">Service User</TableHead>
                  <TableHead className="text-xs font-semibold hidden md:table-cell">Last Auth</TableHead>
                  {isModuleEnabled("ipv6") && (
                    <TableHead className="text-xs font-semibold hidden sm:table-cell">IP Stack</TableHead>
                  )}
                  {isModuleEnabled("ipv6") && (
                    <TableHead className="text-xs font-semibold hidden lg:table-cell">IPv6 Address</TableHead>
                  )}
                  <TableHead className="text-xs font-semibold hidden sm:table-cell">Type</TableHead>
                  <TableHead className="text-xs font-semibold hidden xl:table-cell cursor-pointer select-none" onClick={() => handleSort("createdAt")}>
                    <span className="inline-flex items-center">Created {renderSortIcon("createdAt")}</span>
                  </TableHead>
                  <TableHead className="text-xs font-semibold hidden lg:table-cell">Activity</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!subscribers.length ? (
                  <TableRow>
                    <TableCell colSpan={17} className="text-center py-20">
                      {hasActiveFilters ? (
                        <div className="flex flex-col items-center">
                          <div className="h-16 w-16 rounded-2xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center mb-4">
                            <UserSearch className="h-8 w-8 text-amber-500/60" />
                          </div>
                          <p className="text-foreground font-semibold text-base">No subscribers found</p>
                          <p className="text-xs text-muted-foreground/70 mt-1 mb-4">Try adjusting your search or filters</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSearch(""); setStatusFilter(""); setAreaFilter(""); setPlanFilter(""); setConnectionType(""); setSortBy("createdAt"); setSortOrder("desc"); setPage(1); }}
                          >
                            <X className="h-3 w-3 mr-1" />Clear Filters
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <div className="h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-950/20 flex items-center justify-center mb-4">
                            <Users className="h-8 w-8 text-red-400/60" />
                          </div>
                          <p className="text-foreground font-semibold text-base">No subscribers yet</p>
                          <p className="text-xs text-muted-foreground/70 mt-1 mb-4">Add your first subscriber to get started</p>
                          <Button size="sm" onClick={openAddDialog} className="bg-red-600 hover:bg-red-700 text-white">
                            <Plus className="h-4 w-4 mr-1.5" />Add Subscriber
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  subscribers.map((sub, idx) => {
                    const borderClass = CONNECTION_BORDER_MAP[sub.connectionType] || "";
                    const isSelected = selectedRows.has(sub.id);
                    return (
                    <TableRow key={sub.id} className={`group table-row-hover transition-colors duration-150 border-l-2 ${borderClass} ${isSelected ? "bg-primary/5" : idx % 2 === 1 ? "bg-muted/20" : ""}`}>
                      <TableCell className="w-10">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleRow(sub.id)}
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium">{sub.code}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn("relative inline-flex shrink-0", onlineSet.has(sub.id) && "online-pulse")}>
                                <span className={cn("w-2 h-2 rounded-full", onlineSet.has(sub.id) ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")}/>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {onlineSet.has(sub.id) ? "Online — Last seen: just now" : `Offline — Last seen: ${sub.lastAuthTimestamp ? relativeTime(sub.lastAuthTimestamp) : "never"}`}
                            </TooltipContent>
                          </Tooltip>
                          <div className="h-8 w-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold shrink-0">
                            {sub.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate cursor-pointer hover:text-red-600 dark:hover:text-red-400 transition-colors" onClick={() => setQuickViewId(sub.id)}>{sub.name}</p>
                            {sub.email && <p className="text-xs text-muted-foreground hidden md:block truncate cursor-pointer hover:text-red-600 dark:hover:text-red-400 transition-colors" onClick={() => setQuickViewId(sub.id)}>{sub.email}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs hidden md:table-cell">{sub.phone}</TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">
                        {sub.plan ? (
                          <Badge variant="outline" className={`text-[10px] px-2 py-0.5 inline-flex items-center gap-1 ${getPlanSpeedTier(sub.plan.name).class}`}>
                            {sub.plan.name}
                            {extractPlanSpeed(sub.plan.name) && (
                              <span className="opacity-60">↓{extractPlanSpeed(sub.plan.name)}</span>
                            )}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{sub.area?.name || "—"}</TableCell>
                      <TableCell className="text-xs hidden md:table-cell">
                        <span className={sub.balance < 0 ? "text-red-600 font-semibold" : sub.balance > 0 ? "text-green-600 font-semibold" : ""}>
                          {formatINR(sub.balance ?? 0)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {sub.activeSessions !== undefined && sub.activeSessions > 0 && (
                            <span className="relative flex h-2.5 w-2.5 shrink-0" title="Online — active session">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-1 ring-emerald-500/30" />
                            </span>
                          )}
                          <Badge variant="outline" className={`text-[10px] px-2 py-0.5 rounded-full gap-1 inline-flex items-center ${STATUS_MAP[sub.status]?.class || ""}`}>
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_MAP[sub.status]?.dot || "bg-gray-400"}`} />
                            {STATUS_MAP[sub.status]?.label || sub.status}
                          </Badge>
                          {expiringDaysById.has(sub.id) && sub.status === "ACTIVE" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 rounded-full gap-1 inline-flex items-center border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400" title={`Plan expires in ${expiringDaysById.get(sub.id)} day(s)`}>
                              <Clock className="h-2.5 w-2.5" />
                              {expiringDaysById.get(sub.id) === 0 ? "expires today" : `${expiringDaysById.get(sub.id)}d left`}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono text-[11px] text-muted-foreground truncate block max-w-[120px]">
                          {sub.serviceUsername || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs hidden md:table-cell">
                        {sub.lastAuthTimestamp ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">{relativeTime(sub.lastAuthTimestamp)}</span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1.5 py-0 rounded-full ${
                                sub.lastAuthResult === "Access-Accept"
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : sub.lastAuthResult === "Access-Reject"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              {sub.lastAuthResult === "Access-Accept" ? "OK" : sub.lastAuthResult === "Access-Reject" ? "FAIL" : sub.lastAuthResult || "—"}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {isModuleEnabled("ipv6") && (
                        <TableCell className="text-xs hidden sm:table-cell">
                          {sub.ipStackType === "DUAL_STACK" ? (
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 border-green-200">Dual</Badge>
                          ) : sub.ipStackType === "IPV6_ONLY" ? (
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-sky-50 text-sky-700 border-sky-200">IPv6</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5">IPv4</Badge>
                          )}
                        </TableCell>
                      )}
                      {isModuleEnabled("ipv6") && (
                        <TableCell className="text-xs hidden lg:table-cell font-mono">
                          {sub.ipv6Address || "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-xs hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1.5">
                          <ConnectionTypeIcon type={sub.connectionType} />
                          {CONNECTION_LABELS[sub.connectionType] || sub.connectionType}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs hidden xl:table-cell text-muted-foreground">
                        {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${activityDotColor(sub.updatedAt, sub.status)}`} />
                          {sub.updatedAt ? relativeTime(sub.updatedAt) : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity duration-150"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => openDetail(sub.id)}><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(sub)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { setRenewMonths("1"); setRenewTargets([sub.id]); }}><RefreshCw className="h-4 w-4 mr-2" />Renew Plan</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setBulkPlanId(""); setPlanTargets([sub.id]); }}><Repeat className="h-4 w-4 mr-2" />Change Plan</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {sub.status === "ACTIVE" && (
                              <DropdownMenuItem onClick={() => statusMutation.mutate({ id: sub.id, status: "SUSPENDED" })}><Ban className="h-4 w-4 mr-2" />Suspend</DropdownMenuItem>
                            )}
                            {sub.status === "ACTIVE" && sub.radiusEnabled && (
                              <DropdownMenuItem onClick={() => handleKickSession(sub)} className="text-red-600"><WifiOff className="h-4 w-4 mr-2" />Kick Session (CoA)</DropdownMenuItem>
                            )}
                            {sub.status === "ACTIVE" && (
                              <DropdownMenuItem onClick={() => statusMutation.mutate({ id: sub.id, status: "DISCONNECTED" })} className="text-orange-600"><Unplug className="h-4 w-4 mr-2" />Disconnect</DropdownMenuItem>
                            )}
                            {(sub.status === "SUSPENDED" || sub.status === "DISCONNECTED") && (
                              <DropdownMenuItem onClick={() => statusMutation.mutate({ id: sub.id, status: "ACTIVE" })}><CheckCircle2 className="h-4 w-4 mr-2" />Activate</DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem><MessageSquare className="h-4 w-4 mr-2" />Message</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600" onClick={() => openDelete(sub)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-background rounded-lg px-1 animate-slide-up" style={{ animationDelay: "150ms" }}>
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{((page - 1) * 15) + 1}–{Math.min(page * 15, total)}</span> of <span className="font-medium text-foreground">{total}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 w-8 p-0 rounded-md">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? "default" : "outline"}
                    size="sm"
                    className={`h-8 w-8 p-0 text-xs rounded-md transition-all ${page === pageNum ? "bg-red-600 hover:bg-red-700 text-white border-red-600" : ""}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <span className="text-xs text-muted-foreground px-1">of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-8 w-8 p-0 rounded-md">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {total === 0 && !hasActiveFilters && (
        <p className="text-sm text-muted-foreground text-center py-4 animate-slide-up" style={{ animationDelay: "150ms" }}>0 results</p>
      )}

      {/* ─── Add Subscriber Dialog ─── */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) setAddOpen(v); }}>
        <DialogContent className="sm:max-w-[780px] max-h-[94vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Add New Subscriber
            </DialogTitle>
            <DialogDescription>Complete registration form — fill in all relevant details.</DialogDescription>
          </DialogHeader>

          {/* ── Step Progress Indicator ── */}
          <div className="flex items-center gap-1 pt-1 pb-3 border-b">
            {[
              { num: 1, label: "Personal", icon: <User className="h-3.5 w-3.5" /> },
              { num: 2, label: "Plan & Network", icon: <Globe className="h-3.5 w-3.5" /> },
              { num: 3, label: "Equipment & Billing", icon: <CreditCard className="h-3.5 w-3.5" /> },
              { num: 4, label: "Additional", icon: <MoreVertical className="h-3.5 w-3.5" /> },
            ].map((step) => (
              <button
                key={step.num}
                type="button"
                onClick={() => setFormStep(step.num)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  formStep === step.num
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : formStep > step.num
                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <span className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 ${
                  formStep === step.num ? "bg-primary-foreground text-primary" : formStep > step.num ? "bg-primary text-primary-foreground" : "bg-muted-foreground/30 text-muted-foreground"
                }`}>
                  {formStep > step.num ? "✓" : step.num}
                </span>
                <span className="hidden sm:inline truncate">{step.label}</span>
              </button>
            ))}
          </div>

          {/* ── Form Completion Bar ── */}
          <div className="flex items-center gap-2 pt-2">
            <Progress value={formCompletion} className="h-1.5 flex-1" />
            <span className="text-[10px] text-muted-foreground font-medium tabular-nums">{formCompletion}%</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1">

            {/* ══════ STEP 1: Personal & Address ══════ */}
            {formStep === 1 && (
              <>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <User className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Personal Information</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">Required *</Badge>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Full Name <span className="text-red-500">*</span></Label>
                      <Input placeholder="Enter subscriber's full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Phone <span className="text-red-500">*</span></Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">+91</span>
                          <Input placeholder="9876543210" maxLength={10} className="pl-10 h-9 font-mono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Alternate Phone</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">+91</span>
                          <Input placeholder="Optional" maxLength={10} className="pl-10 h-9 font-mono" value={form.altPhone} onChange={(e) => setForm({ ...form, altPhone: e.target.value.replace(/\D/g, "") })} />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Email</Label>
                        <Input placeholder="email@example.com" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Aadhaar Number (KYC)</Label>
                        <Input placeholder="XXXX XXXX XXXX" maxLength={14} className="h-9 font-mono" value={form.kycAadhaarNumber} onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 12);
                          const formatted = v.replace(/(\d{4})(?=\d)/g, "$1 ");
                          setForm({ ...form, kycAadhaarNumber: formatted });
                        }} />
                      </div>
                    </div>
                    {/* Profile Photo & KYC Document Upload */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Profile Photo</Label>
                        <div className="flex items-center gap-2">
                          {form.profilePhotoPath ? (
                            <div className="relative group">
                              <img src={`/api/files?path=${encodeURIComponent(form.profilePhotoPath)}`} alt="Profile" className="h-12 w-12 rounded-full object-cover border" />
                              <button type="button" className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setForm({ ...form, profilePhotoPath: "" })}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-12 w-12 rounded-full bg-muted border-2 border-dashed flex items-center justify-center">
                              <User className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <label className="cursor-pointer">
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border bg-muted hover:bg-muted/80 transition-colors">
                              <Upload className="h-3 w-3" />{form.profilePhotoPath ? "Change" : "Upload"}
                            </span>
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading === "profile"} onChange={async (e) => {
                              const f = e.target.files?.[0]; if (!f) return;
                              setUploading("profile");
                              try { const path = await uploadFile(f, "profile"); setForm({ ...form, profilePhotoPath: path }); toast.success("Profile photo uploaded"); }
                              catch (err: any) { toast.error(err.message || "Upload failed"); }
                              finally { setUploading(null); e.target.value = ""; }
                            }} />
                          </label>
                          {uploading === "profile" && <span className="text-[10px] text-muted-foreground animate-pulse">Uploading...</span>}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">KYC Document</Label>
                        <div className="flex items-center gap-2">
                          {form.kycDocPath ? (
                            <div className="relative group flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 border border-green-200">
                              <FileText className="h-3.5 w-3.5 text-green-600" />
                              <span className="text-xs text-green-700 max-w-[100px] truncate">Uploaded</span>
                              <button type="button" className="h-4 w-4 rounded-full bg-green-600 text-white flex items-center justify-center" onClick={() => setForm({ ...form, kycDocPath: "" })}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No document</span>
                          )}
                          <label className="cursor-pointer">
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border bg-muted hover:bg-muted/80 transition-colors">
                              <Upload className="h-3 w-3" />{form.kycDocPath ? "Change" : "Upload"}
                            </span>
                            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={uploading === "kyc"} onChange={async (e) => {
                              const f = e.target.files?.[0]; if (!f) return;
                              setUploading("kyc");
                              try { const path = await uploadFile(f, "kyc"); setForm({ ...form, kycDocPath: path }); toast.success("KYC document uploaded"); }
                              catch (err: any) { toast.error(err.message || "Upload failed"); }
                              finally { setUploading(null); e.target.value = ""; }
                            }} />
                          </label>
                          {uploading === "kyc" && <span className="text-[10px] text-muted-foreground animate-pulse">Uploading...</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Address Details</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Full Address</Label>
                      <Textarea placeholder="House/flat no, street, locality..." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className="text-sm" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Area / Zone</Label>
                        <Select value={form.areaId || "none"} onValueChange={(v) => setForm({ ...form, areaId: v === "none" ? "" : v })}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select area" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Area</SelectItem>
                            {areas?.map?.((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Landmark</Label>
                        <Input placeholder="Near..." value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Pincode</Label>
                        <Input placeholder="6-digit" maxLength={6} className="h-9 font-mono" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "") })} />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ══════ STEP 2: Plan & Network ══════ */}
            {formStep === 2 && (
              <>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Plan & Connection</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Plan</Label>
                        <Select value={form.planId || "none"} onValueChange={(v) => {
                          const newPlanId = v === "none" ? "" : v;
                          const plan = plans?.find((p) => p.id === newPlanId);
                          const ipv6AutoFill: Record<string, string> = {};
                          if (isModuleEnabled("ipv6") && plan?.ipv6Enabled) {
                            ipv6AutoFill.ipStackType = "DUAL_STACK";
                            ipv6AutoFill.ipv6AssignmentMode = plan.ipv6AssignmentMode || "SLAAC";
                          } else {
                            ipv6AutoFill.ipStackType = "IPV4_ONLY";
                          }
                          setForm({ ...form, planId: newPlanId, ...ipv6AutoFill });
                        }}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select plan" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Plan</SelectItem>
                            {plans?.map?.((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {formatINR(p.priceMonthly)}/mo</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Connection Type</Label>
                        <Select value={form.connectionType} onValueChange={(v) => setForm({ ...form, connectionType: v })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="FTTH">FTTH (Fiber)</SelectItem>
                            <SelectItem value="WIRELESS">Wireless</SelectItem>
                            <SelectItem value="CABLE">Cable</SelectItem>
                            <SelectItem value="LEASED_LINE">Leased Line</SelectItem>
                            <SelectItem value="ETHERNET">Ethernet</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {selectedPlan && (
                      <div className="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                        <Zap className="h-4 w-4 text-emerald-600 shrink-0" />
                        <p className="text-sm text-emerald-800 dark:text-emerald-300">
                          <span className="font-medium">Plan Price:</span> {formatINR(selectedPlan.priceMonthly)}<span className="text-muted-foreground">/month</span>
                        </p>
                      </div>
                    )}
                    {isModuleEnabled("ipv6") && selectedPlan && form.ipStackType !== "IPV4_ONLY" && !selectedPlan.ipv6Enabled && (
                      <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>Plan "{selectedPlan.name}" doesn't include IPv6. IPv6 is custom-assigned to this subscriber.</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Billing Cycle</Label>
                        <Select value={form.billingCycle} onValueChange={(v) => setForm({ ...form, billingCycle: v })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MONTHLY">Monthly</SelectItem>
                            <SelectItem value="QUARTERLY">Quarterly (3 months)</SelectItem>
                            <SelectItem value="HALF_YEARLY">Half-Yearly (6 months)</SelectItem>
                            <SelectItem value="YEARLY">Yearly (12 months)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <Checkbox id="generateInvoice" checked={form.generateInvoice} onCheckedChange={(v) => setForm({ ...form, generateInvoice: v === true })} />
                        <Label htmlFor="generateInvoice" className="cursor-pointer text-xs">Auto-generate first invoice</Label>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Service Credentials</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Service Username</Label>
                        <div className="flex gap-1.5">
                          <Input placeholder="Auto-generated" className="font-mono text-sm h-9" value={form.serviceUsername} onChange={(e) => setForm({ ...form, serviceUsername: e.target.value })} />
                          <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9" title="Regenerate" onClick={() => setForm({ ...form, serviceUsername: `service_${genId(6)}` })}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Service Password</Label>
                        <div className="flex gap-1.5">
                          <Input type={showPassword ? "text" : "password"} placeholder="Auto-generated" className="font-mono text-sm h-9" value={form.servicePassword} onChange={(e) => setForm({ ...form, servicePassword: e.target.value })} />
                          <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9" title={showPassword ? "Hide" : "Show"} onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button type="button" variant="outline" size="icon" className="shrink-0 h-9 w-9" title="Regenerate" onClick={() => setForm({ ...form, servicePassword: genId(10) })}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <Network className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">IP Configuration</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">IP Type</Label>
                        <Select value={form.ipType} onValueChange={(v) => setForm({ ...form, ipType: v as "DYNAMIC" | "STATIC", ipAddress: "", ipSubnetId: "" })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DYNAMIC">Dynamic (DHCP Auto)</SelectItem>
                            <SelectItem value="STATIC">Static (Select from Pool)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form.ipType === "STATIC" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">MAC Address</Label>
                          <Input placeholder="AA:BB:CC:DD:EE:FF" className="font-mono text-sm h-9" value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} />
                        </div>
                      )}
                    </div>
                    {form.ipType === "STATIC" && (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Select Subnet (IP Pool)</Label>
                          <Select value={form.ipSubnetId || "none"} onValueChange={(v) => setForm({ ...form, ipSubnetId: v === "none" ? "" : v, ipAddress: "" })}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Choose a subnet..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Select Subnet</SelectItem>
                              {subnets?.map?.((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  <span className="flex items-center gap-2">
                                    <span className="font-medium">{s.name}</span>
                                    <span className="text-muted-foreground text-xs">({s.cidr})</span>
                                    <Badge variant="secondary" className="text-[10px] ml-auto">{s.freeIps} free</Badge>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {form.ipSubnetId && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Select IP Address from Pool</Label>
                            {availableIps && availableIps.length > 0 ? (
                              <Select value={form.ipAddress || "none"} onValueChange={(v) => setForm({ ...form, ipAddress: v === "none" ? "" : v })}>
                                <SelectTrigger className="h-9"><SelectValue placeholder="Choose an IP..." /></SelectTrigger>
                                <SelectContent className="max-h-48">
                                  <SelectItem value="none">Select IP</SelectItem>
                                  {availableIps.map((ip) => (
                                    <SelectItem key={ip.id} value={ip.address}>
                                      <span className="font-mono text-xs">{ip.address}</span>
                                      {ip.hostname && <span className="text-muted-foreground text-xs ml-2">({ip.hostname})</span>}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                <p className="text-xs text-amber-700 dark:text-amber-300">No available IPs in this subnet. All IPs are assigned.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {form.ipType === "DYNAMIC" && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">IP will be assigned automatically by DHCP server</p>
                      </div>
                    )}
                  </div>
                </div>
                {isModuleEnabled("ipv6") && (
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">IPv6 Configuration</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">IP Stack Type</Label>
                      <Select value={form.ipStackType} onValueChange={(v) => setForm({ ...form, ipStackType: v, ipv6Address: "", ipv6Prefix: "" })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IPV4_ONLY">IPv4 Only</SelectItem>
                          <SelectItem value="DUAL_STACK">Dual Stack (IPv4 + IPv6)</SelectItem>
                          <SelectItem value="IPV6_ONLY">IPv6 Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(form.ipStackType === "DUAL_STACK" || form.ipStackType === "IPV6_ONLY") && (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-xs">IPv6 Assignment Mode</Label>
                          <Select value={form.ipv6AssignmentMode} onValueChange={(v) => setForm({ ...form, ipv6AssignmentMode: v, ipv6Address: "" })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SLAAC">SLAAC (Auto-config)</SelectItem>
                              <SelectItem value="DHCPV6">DHCPv6 (Server assigned)</SelectItem>
                              <SelectItem value="STATIC">Static (Manual)</SelectItem>
                              <SelectItem value="PD_ONLY">Prefix Delegation Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {form.ipv6AssignmentMode === "STATIC" && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">IPv6 Address</Label>
                              <Input placeholder="2001:db8::1" className="font-mono text-sm h-9" value={form.ipv6Address} onChange={(e) => setForm({ ...form, ipv6Address: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Prefix Length</Label>
                              <Select value={String(form.ipv6PrefixLength)} onValueChange={(v) => setForm({ ...form, ipv6PrefixLength: Number(v) })}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="60">/60</SelectItem>
                                  <SelectItem value="64">/64</SelectItem>
                                  <SelectItem value="80">/80</SelectItem>
                                  <SelectItem value="96">/96</SelectItem>
                                  <SelectItem value="112">/112</SelectItem>
                                  <SelectItem value="128">/128</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                        {(form.ipStackType === "DUAL_STACK" || form.ipv6AssignmentMode === "PD_ONLY") && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">IPv6 Prefix (Delegated)</Label>
                              <Input placeholder="2001:db8:42::" className="font-mono text-sm h-9" value={form.ipv6Prefix} onChange={(e) => setForm({ ...form, ipv6Prefix: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Prefix Length</Label>
                              <Select value={String(form.ipv6PrefixLength)} onValueChange={(v) => setForm({ ...form, ipv6PrefixLength: Number(v) })}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="48">/48</SelectItem>
                                  <SelectItem value="56">/56</SelectItem>
                                  <SelectItem value="60">/60</SelectItem>
                                  <SelectItem value="64">/64</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <Label className="text-xs">DUID <span className="text-[10px] text-muted-foreground font-normal">(auto-detected)</span></Label>
                          <Input placeholder="Auto-detected from client" className="font-mono text-sm h-9 bg-muted/50" value={form.ipv6Duid} readOnly />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                )}
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Login Restriction</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Restriction Type</Label>
                      <Select value={form.loginRestriction} onValueChange={(v) => setForm({ ...form, loginRestriction: v as "all" | "subnet" | "specific", loginSubnetId: "", loginSpecificIp: "" })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Nodes (No Restriction)</SelectItem>
                          <SelectItem value="subnet">Selected Subnet Only</SelectItem>
                          <SelectItem value="specific">Specific IP Address</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.loginRestriction === "subnet" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Subnet</Label>
                        <Select value={form.loginSubnetId || "none"} onValueChange={(v) => setForm({ ...form, loginSubnetId: v === "none" ? "" : v })}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select subnet..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Restriction</SelectItem>
                            {subnets?.map?.((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                <span className="flex items-center gap-2">
                                  <span>{s.name}</span>
                                  <span className="text-muted-foreground text-xs">({s.cidr})</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {form.loginRestriction === "specific" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Allowed IP Address</Label>
                        <Input placeholder="Enter specific IP allowed to login" className="font-mono text-sm h-9" value={form.loginSpecificIp} onChange={(e) => setForm({ ...form, loginSpecificIp: e.target.value })} />
                        <p className="text-[10px] text-muted-foreground">Subscriber will only be able to login from this specific IP address</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <Server className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Device Assignment</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">Optional</Badge>
                  </div>
                  <div className="p-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Assign Network Device</Label>
                      <Select value={form.assignedDeviceId || "none"} onValueChange={(v) => setForm({ ...form, assignedDeviceId: v === "none" ? "" : v })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select device..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Device</SelectItem>
                          {devices?.map?.((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              <span className="flex items-center gap-2">
                                <span>{d.name}</span>
                                <span className="text-muted-foreground text-xs font-mono">({d.ipAddress})</span>
                                <Badge variant="outline" className="text-[10px]">{d.type}</Badge>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ══════ STEP 3: Equipment & Billing ══════ */}
            {formStep === 3 && (
              <>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <Router className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Router & Equipment</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox id="routerRented" checked={form.routerRented} onCheckedChange={(v) => setForm({ ...form, routerRented: v === true, routerSerial: "", routerDeposit: "" })} />
                      <Label htmlFor="routerRented" className="cursor-pointer text-xs">Router Provided by ISP (Rented)</Label>
                    </div>
                    {form.routerRented && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-4 pl-4 border-l-2 border-primary/20">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Serial Number <span className="text-red-500">*</span></Label>
                          <Input placeholder="Enter serial number" className="font-mono text-sm h-9" value={form.routerSerial} onChange={(e) => setForm({ ...form, routerSerial: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Security Deposit (₹)</Label>
                          <Input placeholder="0" type="number" min="0" className="h-9" value={form.routerDeposit} onChange={(e) => setForm({ ...form, routerDeposit: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Billing & Tax Information</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">GSTIN</Label>
                        <Input placeholder="22AAAAA0000A1Z5" className="font-mono text-sm h-9 uppercase" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">PAN Number</Label>
                        <Input placeholder="ABCDE1234F" className="font-mono text-sm h-9 uppercase" maxLength={10} value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">GSTIN and PAN are required for business/GST billing. Leave blank for residential customers.</p>
                  </div>
                </div>
              </>
            )}

            {/* ══════ STEP 4: Additional ══════ */}
            {formStep === 4 && (
              <>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Activation & Billing Dates</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Activation Date</Label>
                        <Input type="date" className="h-9" value={form.activationDate} onChange={(e) => setForm({ ...form, activationDate: e.target.value })} />
                        <p className="text-[10px] text-muted-foreground">Leave blank for today</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Billing Start Date</Label>
                        <Input type="date" className="h-9" value={form.billingStartDate} onChange={(e) => setForm({ ...form, billingStartDate: e.target.value })} />
                        <p className="text-[10px] text-muted-foreground">First billing cycle begins</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Notes</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Customer Notes <span className="text-[10px] text-muted-foreground font-normal">(visible to subscriber)</span></Label>
                      <Textarea placeholder="Special instructions, welcome note..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Internal Notes <span className="text-[10px] text-muted-foreground font-normal">(staff only)</span></Label>
                      <Textarea placeholder="Internal observations, special handling..." value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} rows={3} className="text-sm" />
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border bg-gradient-to-r from-primary/5 to-primary/10">
                  <div className="px-4 py-3 space-y-1.5">
                    <p className="text-xs font-semibold text-primary">Registration Summary</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                      <span className="text-muted-foreground">Name:</span><span className="font-medium truncate">{form.name || "—"}</span>
                      <span className="text-muted-foreground">Phone:</span><span className="font-mono">{form.phone || "—"}</span>
                      <span className="text-muted-foreground">Plan:</span><span className="font-medium">{selectedPlan?.name || "No plan"}</span>
                      <span className="text-muted-foreground">Connection:</span><span>{form.connectionType}</span>
                      <span className="text-muted-foreground">IP:</span><span>{form.ipType === "DYNAMIC" ? "Dynamic" : `Static: ${form.ipAddress || "Not selected"}`}</span>
                      <span className="text-muted-foreground">Billing:</span><span>{form.billingCycle.replace("_", " ")}</span>
                      <span className="text-muted-foreground">Invoice:</span><span>{form.generateInvoice ? "Auto" : "Manual"}</span>
                      <span className="text-muted-foreground">Login:</span><span>{form.loginRestriction === "all" ? "All Nodes" : form.loginRestriction === "subnet" ? "Subnet" : `IP: ${form.loginSpecificIp}`}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="border-t pt-3 mt-1 shrink-0">
            <div className="flex w-full items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
              <div className="flex gap-2">
                {formStep > 1 && (
                  <Button variant="outline" size="sm" onClick={() => setFormStep(formStep - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
                  </Button>
                )}
                {formStep < TOTAL_STEPS ? (
                  <Button size="sm" onClick={() => setFormStep(formStep + 1)}>
                    Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                ) : (
                  <Button onClick={handleCreate} disabled={createMutation.isPending || !form.name || !form.phone} className="bg-red-600 hover:bg-red-700 text-white">
                    {createMutation.isPending ? (
                      <span className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 animate-spin" /> Creating...</span>
                    ) : (
                      <span className="flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Create Subscriber</span>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Credentials Dialog ─── */}
      <Dialog open={credentialsOpen} onOpenChange={setCredentialsOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              Subscriber Created
            </DialogTitle>
            <DialogDescription>Save these credentials for the subscriber</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Subscriber Code: <span className="font-mono font-bold">{createdSub?.code || "—"}</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Service Username</Label>
              <div className="flex gap-2">
                <Input readOnly value={createdSub?.serviceUsername || createdSub?.generatedUsername || ""} className="font-mono text-sm bg-muted" />
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => navigator.clipboard.writeText(createdSub?.serviceUsername || createdSub?.generatedUsername || "")}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Service Password</Label>
              <div className="flex gap-2">
                <Input readOnly value={createdSub?.servicePassword || createdSub?.generatedPassword || ""} className="font-mono text-sm bg-muted" />
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => navigator.clipboard.writeText(createdSub?.servicePassword || createdSub?.generatedPassword || "")}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg mt-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">Share these credentials securely with the subscriber via a trusted channel.</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCredentialsOpen(false)} className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Subscriber Dialog ─── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[780px] max-h-[94vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Subscriber
            </DialogTitle>
            <DialogDescription>Update subscriber details across all sections.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1">

            {/* ═══ Personal & Contact ═══ */}
            <div className="rounded-lg border bg-card">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                <User className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Personal & Contact</span>
                <Badge variant="outline" className="ml-auto text-[10px]">Editable</Badge>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Full Name <span className="text-red-500">*</span></Label>
                  <Input placeholder="Enter full name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-9" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Phone <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">+91</span>
                      <Input placeholder="9876543210" maxLength={10} className="pl-10 h-9 font-mono" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value.replace(/\D/g, "") })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Alternate Phone</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">+91</span>
                      <Input placeholder="Optional" maxLength={10} className="pl-10 h-9 font-mono" value={editForm.altPhone} onChange={(e) => setEditForm({ ...editForm, altPhone: e.target.value.replace(/\D/g, "") })} />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input placeholder="email@example.com" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="h-9" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Aadhaar Number (KYC)</Label>
                    <Input placeholder="XXXX XXXX XXXX" maxLength={14} className="h-9 font-mono" value={editForm.kycAadhaarNumber} onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 12);
                      const formatted = v.replace(/(\d{4})(?=\d)/g, "$1 ");
                      setEditForm({ ...editForm, kycAadhaarNumber: formatted });
                    }} />
                  </div>
                </div>
                {/* Profile Photo & KYC Document Upload */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Profile Photo</Label>
                    <div className="flex items-center gap-2">
                      {editForm.profilePhotoPath ? (
                        <div className="relative group">
                          <img src={`/api/files?path=${encodeURIComponent(editForm.profilePhotoPath)}`} alt="Profile" className="h-12 w-12 rounded-full object-cover border" />
                          <button type="button" className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setEditForm({ ...editForm, profilePhotoPath: "" })}>
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-muted border-2 border-dashed flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <label className="cursor-pointer">
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border bg-muted hover:bg-muted/80 transition-colors">
                          <Upload className="h-3 w-3" />{editForm.profilePhotoPath ? "Change" : "Upload"}
                        </span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading === "profile"} onChange={async (e) => {
                          const f = e.target.files?.[0]; if (!f) return;
                          setUploading("profile");
                          try { const path = await uploadFile(f, "profile"); setEditForm({ ...editForm, profilePhotoPath: path }); toast.success("Profile photo uploaded"); }
                          catch (err: any) { toast.error(err.message || "Upload failed"); }
                          finally { setUploading(null); e.target.value = ""; }
                        }} />
                      </label>
                      {uploading === "profile" && <span className="text-[10px] text-muted-foreground animate-pulse">Uploading...</span>}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">KYC Document</Label>
                    <div className="flex items-center gap-2">
                      {editForm.kycDocPath ? (
                        <div className="relative group flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 border border-green-200">
                          <FileText className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-xs text-green-700 max-w-[100px] truncate">Uploaded</span>
                          <button type="button" className="h-4 w-4 rounded-full bg-green-600 text-white flex items-center justify-center" onClick={() => setEditForm({ ...editForm, kycDocPath: "" })}>
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No document</span>
                      )}
                      <label className="cursor-pointer">
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border bg-muted hover:bg-muted/80 transition-colors">
                          <Upload className="h-3 w-3" />{editForm.kycDocPath ? "Change" : "Upload"}
                        </span>
                        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={uploading === "kyc"} onChange={async (e) => {
                          const f = e.target.files?.[0]; if (!f) return;
                          setUploading("kyc");
                          try { const path = await uploadFile(f, "kyc"); setEditForm({ ...editForm, kycDocPath: path }); toast.success("KYC document uploaded"); }
                          catch (err: any) { toast.error(err.message || "Upload failed"); }
                          finally { setUploading(null); e.target.value = ""; }
                        }} />
                      </label>
                      {uploading === "kyc" && <span className="text-[10px] text-muted-foreground animate-pulse">Uploading...</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ Address ═══ */}
            <div className="rounded-lg border bg-card">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Address Details</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Full Address</Label>
                  <Textarea placeholder="House/flat no, street, locality..." value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} rows={2} className="text-sm" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Area / Zone</Label>
                    <Select value={editForm.areaId || "none"} onValueChange={(v) => setEditForm({ ...editForm, areaId: v === "none" ? "" : v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select area" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Area</SelectItem>
                        {areas?.map?.((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Landmark</Label>
                    <Input placeholder="Near..." value={editForm.landmark} onChange={(e) => setEditForm({ ...editForm, landmark: e.target.value })} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Pincode</Label>
                    <Input placeholder="6-digit" maxLength={6} className="h-9 font-mono" value={editForm.pincode} onChange={(e) => setEditForm({ ...editForm, pincode: e.target.value.replace(/\D/g, "") })} />
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ Plan & Connection ═══ */}
            <div className="rounded-lg border bg-card">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Plan & Connection</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" />Active</span></SelectItem>
                        <SelectItem value="INACTIVE"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-gray-400" />Inactive</span></SelectItem>
                        <SelectItem value="SUSPENDED"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" />Suspended</span></SelectItem>
                        <SelectItem value="TRIAL"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500" />Trial</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Plan</Label>
                    <Select value={editForm.planId || "none"} onValueChange={(v) => setEditForm({ ...editForm, planId: v === "none" ? "" : v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select plan" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Plan</SelectItem>
                        {plans?.map?.((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {formatINR(p.priceMonthly)}/mo</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Connection Type</Label>
                  <Select value={editForm.connectionType} onValueChange={(v) => setEditForm({ ...editForm, connectionType: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FTTH">FTTH (Fiber)</SelectItem>
                      <SelectItem value="WIRELESS">Wireless</SelectItem>
                      <SelectItem value="CABLE">Cable</SelectItem>
                      <SelectItem value="LEASED_LINE">Leased Line</SelectItem>
                      <SelectItem value="ETHERNET">Ethernet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ═══ Service & Network ═══ */}
            <div className="rounded-lg border bg-card">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                <KeyRound className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Service & Network</span>
                <Badge variant="outline" className="ml-auto text-[10px]">Technical</Badge>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Service Username</Label>
                    <Input placeholder="service_username" className="font-mono text-sm h-9" value={editForm.serviceUsername} onChange={(e) => setEditForm({ ...editForm, serviceUsername: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Service Password <span className="text-[10px] text-muted-foreground font-normal">(leave blank to keep current)</span></Label>
                    <Input type="password" placeholder="Enter new password" className="font-mono text-sm h-9" value={editForm.servicePassword} onChange={(e) => setEditForm({ ...editForm, servicePassword: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Session Timeout (s)</Label>
                    <Input placeholder="e.g. 86400" type="number" min="0" className="h-9 font-mono" value={editForm.sessionTimeout} onChange={(e) => setEditForm({ ...editForm, sessionTimeout: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Idle Timeout (s)</Label>
                    <Input placeholder="e.g. 300" type="number" min="0" className="h-9 font-mono" value={editForm.idleTimeout} onChange={(e) => setEditForm({ ...editForm, idleTimeout: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">IP Type</Label>
                    <Select value={editForm.ipType} onValueChange={(v) => setEditForm({ ...editForm, ipType: v as "DYNAMIC" | "STATIC" })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DYNAMIC">Dynamic (DHCP)</SelectItem>
                        <SelectItem value="STATIC">Static</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editForm.ipType === "STATIC" && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">IP Address</Label>
                        <Input placeholder="192.168.1.100" className="font-mono text-sm h-9" value={editForm.ipAddress} onChange={(e) => setEditForm({ ...editForm, ipAddress: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">MAC Address</Label>
                        <Input placeholder="AA:BB:CC:DD:EE:FF" className="font-mono text-sm h-9" value={editForm.macAddress} onChange={(e) => setEditForm({ ...editForm, macAddress: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
                {editForm.ipType === "DYNAMIC" && editForm.macAddress && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">MAC Address</Label>
                    <Input placeholder="AA:BB:CC:DD:EE:FF" className="font-mono text-sm h-9" value={editForm.macAddress} onChange={(e) => setEditForm({ ...editForm, macAddress: e.target.value })} />
                  </div>
                )}
                {isModuleEnabled("ipv6") && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold">IPv6 Configuration</span>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">IP Stack Type</Label>
                        <Select value={editForm.ipStackType} onValueChange={(v) => setEditForm({ ...editForm, ipStackType: v, ipv6Address: "", ipv6Prefix: "" })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="IPV4_ONLY">IPv4 Only</SelectItem>
                            <SelectItem value="DUAL_STACK">Dual Stack (IPv4 + IPv6)</SelectItem>
                            <SelectItem value="IPV6_ONLY">IPv6 Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {(editForm.ipStackType === "DUAL_STACK" || editForm.ipStackType === "IPV6_ONLY") && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs">IPv6 Assignment Mode</Label>
                            <Select value={editForm.ipv6AssignmentMode} onValueChange={(v) => setEditForm({ ...editForm, ipv6AssignmentMode: v, ipv6Address: "" })}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="SLAAC">SLAAC (Auto-config)</SelectItem>
                                <SelectItem value="DHCPV6">DHCPv6 (Server assigned)</SelectItem>
                                <SelectItem value="STATIC">Static (Manual)</SelectItem>
                                <SelectItem value="PD_ONLY">Prefix Delegation Only</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {editForm.ipv6AssignmentMode === "STATIC" && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">IPv6 Address</Label>
                                <Input placeholder="2001:db8::1" className="font-mono text-sm h-9" value={editForm.ipv6Address} onChange={(e) => setEditForm({ ...editForm, ipv6Address: e.target.value })} />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Prefix Length</Label>
                                <Select value={String(editForm.ipv6PrefixLength)} onValueChange={(v) => setEditForm({ ...editForm, ipv6PrefixLength: Number(v) })}>
                                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="60">/60</SelectItem>
                                    <SelectItem value="64">/64</SelectItem>
                                    <SelectItem value="80">/80</SelectItem>
                                    <SelectItem value="96">/96</SelectItem>
                                    <SelectItem value="112">/112</SelectItem>
                                    <SelectItem value="128">/128</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                          {(editForm.ipStackType === "DUAL_STACK" || editForm.ipv6AssignmentMode === "PD_ONLY") && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">IPv6 Prefix (Delegated)</Label>
                                <Input placeholder="2001:db8:42::" className="font-mono text-sm h-9" value={editForm.ipv6Prefix} onChange={(e) => setEditForm({ ...editForm, ipv6Prefix: e.target.value })} />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Prefix Length</Label>
                                <Select value={String(editForm.ipv6PrefixLength)} onValueChange={(v) => setEditForm({ ...editForm, ipv6PrefixLength: Number(v) })}>
                                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="48">/48</SelectItem>
                                    <SelectItem value="56">/56</SelectItem>
                                    <SelectItem value="60">/60</SelectItem>
                                    <SelectItem value="64">/64</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <Label className="text-xs">DUID <span className="text-[10px] text-muted-foreground font-normal">(auto-detected)</span></Label>
                            <Input placeholder="Auto-detected from client" className="font-mono text-sm h-9 bg-muted/50" value={editForm.ipv6Duid} readOnly />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ═══ Device Assignment ═══ */}
            <div className="rounded-lg border bg-card">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                <Server className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Device Assignment</span>
              </div>
              <div className="p-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Assign Network Device</Label>
                  <Select value={editForm.assignedDeviceId || "none"} onValueChange={(v) => setEditForm({ ...editForm, assignedDeviceId: v === "none" ? "" : v })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select device..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Device</SelectItem>
                      {devices?.map?.((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          <span className="flex items-center gap-2">
                            <span>{d.name}</span>
                            <span className="text-muted-foreground text-xs font-mono">({d.ipAddress})</span>
                            <Badge variant="outline" className="text-[10px]">{d.type}</Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ═══ Equipment & Tax ═══ */}
            <div className="rounded-lg border bg-card">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                <Router className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Equipment & Tax</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="edit-routerRented" checked={editForm.routerRented} onCheckedChange={(v) => setEditForm({ ...editForm, routerRented: v === true, routerSerial: "", routerDeposit: "" })} />
                  <Label htmlFor="edit-routerRented" className="cursor-pointer text-xs">Router Provided by ISP (Rented)</Label>
                </div>
                {editForm.routerRented && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-4 pl-4 border-l-2 border-primary/20">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Serial Number <span className="text-red-500">*</span></Label>
                      <Input placeholder="Enter serial number" className="font-mono text-sm h-9" value={editForm.routerSerial} onChange={(e) => setEditForm({ ...editForm, routerSerial: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Security Deposit (₹)</Label>
                      <Input placeholder="0" type="number" min="0" className="h-9" value={editForm.routerDeposit} onChange={(e) => setEditForm({ ...editForm, routerDeposit: e.target.value })} />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">GSTIN</Label>
                    <Input placeholder="22AAAAA0000A1Z5" className="font-mono text-sm h-9 uppercase" value={editForm.gstin} onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">PAN Number</Label>
                    <Input placeholder="ABCDE1234F" className="font-mono text-sm h-9 uppercase" maxLength={10} value={editForm.panNumber} onChange={(e) => setEditForm({ ...editForm, panNumber: e.target.value.toUpperCase() })} />
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ Dates ═══ */}
            <div className="rounded-lg border bg-card">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Dates & Notes</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Activation Date</Label>
                    <Input type="date" className="h-9" value={editForm.activationDate} onChange={(e) => setEditForm({ ...editForm, activationDate: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Billing Start Date</Label>
                    <Input type="date" className="h-9" value={editForm.billingStartDate} onChange={(e) => setEditForm({ ...editForm, billingStartDate: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Customer Notes <span className="text-[10px] text-muted-foreground font-normal">(visible to subscriber)</span></Label>
                  <Textarea placeholder="Special instructions, welcome note..." value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Internal Notes <span className="text-[10px] text-muted-foreground font-normal">(staff only)</span></Label>
                  <Textarea placeholder="Internal observations, special handling..." value={editForm.internalNotes} onChange={(e) => setEditForm({ ...editForm, internalNotes: e.target.value })} rows={2} className="text-sm" />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-3 mt-1 shrink-0">
            <div className="flex w-full items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                {updateMutation.isPending ? (
                  <span className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 animate-spin" /> Saving...</span>
                ) : (
                  <span className="flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" /> Save Changes</span>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle className="flex items-center gap-2">Subscriber Details</DialogTitle>
          </DialogHeader>
          {!detail ? (
            <div className="px-6 py-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
          ) : (
            <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0 mt-2">
              <div className="px-6 shrink-0 overflow-x-auto">
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm"><User className="h-3.5 w-3.5" />Overview</TabsTrigger>
                  <TabsTrigger value="billing" className="gap-1.5 text-xs sm:text-sm"><FileText className="h-3.5 w-3.5" />Billing</TabsTrigger>
                  <TabsTrigger value="payments" className="gap-1.5 text-xs sm:text-sm"><Receipt className="h-3.5 w-3.5" />Payments</TabsTrigger>
                  <TabsTrigger value="support" className="gap-1.5 text-xs sm:text-sm"><ClipboardList className="h-3.5 w-3.5" />Support</TabsTrigger>
                  <TabsTrigger value="activity" className="gap-1.5 text-xs sm:text-sm"><Activity className="h-3.5 w-3.5" />Activity</TabsTrigger>
                </TabsList>
              </div>

              {/* ── Tab: Overview ── */}
              <TabsContent value="overview" className="flex-1 overflow-y-auto px-6 pb-6 mt-2 custom-scrollbar">
                <div className="space-y-4">
                  {/* Subscriber Info Card */}
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/50 border">
                    <div className="h-14 w-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl font-bold shrink-0 shadow-sm">
                      {detail.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{detail.name}</h3>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 gap-1 inline-flex items-center ${STATUS_MAP[detail.status]?.class || ""}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_MAP[detail.status]?.dot || "bg-gray-400"}`} />
                          {STATUS_MAP[detail.status]?.label || detail.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-1 inline-flex items-center">
                          <ConnectionTypeIcon type={detail.connectionType} className="h-3 w-3" />
                          {CONNECTION_LABELS[detail.connectionType] || detail.connectionType}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground font-mono mt-0.5">{detail.code}</p>
                    </div>
                  </div>

                  {/* Contact & Address */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><Phone className="h-3.5 w-3.5" />Contact Information</CardTitle></CardHeader>
                      <CardContent className="pt-0 px-4 pb-4 space-y-2.5">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Phone</p>
                          {detail.phone ? (
                            <a href={`tel:${detail.phone}`} className="text-sm font-medium text-foreground hover:text-red-600 transition-colors">{detail.phone}</a>
                          ) : <p className="text-sm text-muted-foreground">N/A</p>}
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Alt Phone</p>
                          {detail.altPhone ? (
                            <a href={`tel:${detail.altPhone}`} className="text-sm font-medium text-foreground hover:text-red-600 transition-colors">{detail.altPhone}</a>
                          ) : <p className="text-sm text-muted-foreground">N/A</p>}
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Email</p>
                          {detail.email ? (
                            <a href={`mailto:${detail.email}`} className="text-sm font-medium text-foreground hover:text-red-600 transition-colors">{detail.email}</a>
                          ) : <p className="text-sm text-muted-foreground">N/A</p>}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><MapPin className="h-3.5 w-3.5" />Address</CardTitle></CardHeader>
                      <CardContent className="pt-0 px-4 pb-4 space-y-2.5">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Address</p>
                          <p className="text-sm font-medium">{detail.address || <span className="text-muted-foreground">N/A</span>}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Area</p>
                          <p className="text-sm font-medium">{detail.area?.name || <span className="text-muted-foreground">N/A</span>}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Landmark</p>
                          <p className="text-sm font-medium">{detail.landmark || <span className="text-muted-foreground">N/A</span>}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Pincode</p>
                          <p className="text-sm font-medium">{detail.pincode || <span className="text-muted-foreground">N/A</span>}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Plan & Service & IP */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><Zap className="h-3.5 w-3.5" />Plan</CardTitle></CardHeader>
                      <CardContent className="pt-0 px-4 pb-4 space-y-2.5">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Plan Name</p>
                          <p className="text-sm font-medium">{detail.plan?.name || <span className="text-muted-foreground">N/A</span>}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Speed</p>
                          <p className="text-sm font-medium">{detail.plan?.name?.match(/[\d]+/)?.[0] ? `${detail.plan!.name!.match(/[\d]+/)![0]} Mbps` : <span className="text-muted-foreground">N/A</span>}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Price</p>
                          <p className="text-sm font-medium">{detail.plan ? formatINR(detail.plan.priceMonthly) + "/mo" : <span className="text-muted-foreground">N/A</span>}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><KeyRound className="h-3.5 w-3.5" />Service</CardTitle></CardHeader>
                      <CardContent className="pt-0 px-4 pb-4 space-y-2.5">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Username</p>
                          {detail.serviceUsername ? (
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-mono font-medium flex-1 truncate">{detail.serviceUsername}</p>
                              <button onClick={() => { navigator.clipboard.writeText(detail.serviceUsername); toast.success("Username copied"); }} className="shrink-0 p-1 rounded hover:bg-muted transition-colors" aria-label="Copy username">
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </div>
                          ) : <p className="text-sm text-muted-foreground">N/A</p>}
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Password</p>
                          {detail.servicePassword ? (
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-mono font-medium flex-1 truncate">{showPassword ? detail.servicePassword : "••••••••"}</p>
                              <button onClick={() => { setShowPassword(!showPassword); }} className="shrink-0 p-1 rounded hover:bg-muted transition-colors" aria-label={showPassword ? "Hide password" : "Show password"}>
                                {showPassword ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                              </button>
                              <button onClick={() => { navigator.clipboard.writeText(detail.servicePassword!); toast.success("Password copied"); }} className="shrink-0 p-1 rounded hover:bg-muted transition-colors" aria-label="Copy password">
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </div>
                          ) : <p className="text-sm text-muted-foreground">N/A</p>}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><Globe className="h-3.5 w-3.5" />IP Info</CardTitle></CardHeader>
                      <CardContent className="pt-0 px-4 pb-4 space-y-2.5">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Type</p>
                          <Badge variant="outline" className="text-[10px]">{detail.ipType || "Dynamic"}</Badge>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">IP Address</p>
                          <p className="text-sm font-mono font-medium">{detail.ipAddress || <span className="text-muted-foreground">N/A</span>}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">MAC Address</p>
                          <p className="text-sm font-mono font-medium">{detail.macAddress || <span className="text-muted-foreground">N/A</span>}</p>
                        </div>
                        {isModuleEnabled("ipv6") && detail.ipStackType !== "IPV4_ONLY" && (
                          <div className="space-y-1.5">
                            <p><span className="text-[11px] text-muted-foreground">IPv6:</span> <span className="text-sm font-mono font-medium">{detail.ipv6Address || "Not assigned"}</span></p>
                            {detail.ipv6Prefix && (
                              <p><span className="text-[11px] text-muted-foreground">IPv6 Prefix:</span> <span className="text-sm font-mono">{detail.ipv6Prefix}/{detail.ipv6PrefixLength}</span></p>
                            )}
                            {detail.ipv6Duid && (
                              <p><span className="text-[11px] text-muted-foreground">DUID:</span> <span className="text-xs font-mono">{detail.ipv6Duid}</span></p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Dates & Quick Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><Calendar className="h-3.5 w-3.5" />Dates</CardTitle></CardHeader>
                      <CardContent className="pt-0 px-4 pb-4 space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Activation</span>
                          <span className="font-medium">{detail.activationDate ? new Date(detail.activationDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Billing Start</span>
                          <span className="font-medium">{detail.billingStartDate ? new Date(detail.billingStartDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Created</span>
                          <span className="font-medium">{new Date(detail.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><TrendingUp className="h-3.5 w-3.5" />Quick Stats</CardTitle></CardHeader>
                      <CardContent className="pt-0 px-4 pb-4 space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Balance</span>
                          <span className={`font-semibold ${detail.balance < 0 ? "text-red-600" : detail.balance > 0 ? "text-green-600" : ""}`}>{formatINR(detail.balance ?? 0)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Invoices</span>
                          <span className="font-medium">{detail.invoices?.length ?? 0}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total Payments</span>
                          <span className="font-medium">{detail.payments?.length ?? 0}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Open Complaints</span>
                          <span className={`font-medium ${(detail.complaints ?? []).filter(c => c.status === "OPEN" || c.status === "IN_PROGRESS" || c.status === "REOPENED").length > 0 ? "text-amber-600" : ""}`}>{(detail.complaints ?? []).filter(c => c.status === "OPEN" || c.status === "IN_PROGRESS" || c.status === "REOPENED").length}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab: Billing ── */}
              <TabsContent value="billing" className="flex-1 overflow-y-auto px-6 pb-6 mt-2 custom-scrollbar">
                <div className="space-y-4">
                  {/* Outstanding Amount */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Outstanding</p>
                      <p className="text-xl font-bold">
                        {formatINR((detail.invoices ?? []).reduce((sum, inv) => sum + inv.grandTotal - inv.paidAmount, 0))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{detail.invoices?.length ?? 0} Invoice{(detail.invoices?.length ?? 0) !== 1 ? "s" : ""}</p>
                      <p className="text-sm font-medium">{formatINR((detail.invoices ?? []).reduce((sum, inv) => sum + inv.grandTotal, 0))} total</p>
                    </div>
                  </div>

                  {/* Invoices Table */}
                  {!detail.invoices?.length ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">No invoices yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Invoices will appear here once generated.</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-xs font-semibold">Invoice #</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Amount</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Paid</TableHead>
                            <TableHead className="text-xs font-semibold">Status</TableHead>
                            <TableHead className="text-xs font-semibold">Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(detail.invoices ?? []).map((inv, idx) => (
                            <TableRow key={inv.id} className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                              <TableCell className="text-xs font-mono text-red-600 cursor-pointer hover:underline">{inv.invoiceNumber}</TableCell>
                              <TableCell className="text-xs text-right font-medium">{formatINR(inv.grandTotal)}</TableCell>
                              <TableCell className="text-xs text-right">{formatINR(inv.paidAmount)}</TableCell>
                              <TableCell className="text-xs">
                                <Badge variant="outline" className={`text-[10px] ${INVOICE_STATUS_MAP[inv.status]?.class || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                  {INVOICE_STATUS_MAP[inv.status]?.label || inv.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── Tab: Payments ── */}
              <TabsContent value="payments" className="flex-1 overflow-y-auto px-6 pb-6 mt-2 custom-scrollbar">
                <div className="space-y-4">
                  {/* Total Collected */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Collected</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatINR((detail.payments ?? []).reduce((sum, pay) => sum + pay.amount, 0))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{detail.payments?.length ?? 0} Payment{(detail.payments?.length ?? 0) !== 1 ? "s" : ""}</p>
                      <p className="text-sm font-medium">{(detail.payments ?? []).filter(p => p.status === "VERIFIED").length} verified</p>
                    </div>
                  </div>

                  {/* Payments Table */}
                  {!detail.payments?.length ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Receipt className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">No payments yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Payments will appear here once recorded.</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-xs font-semibold">Receipt #</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Amount</TableHead>
                            <TableHead className="text-xs font-semibold">Mode</TableHead>
                            <TableHead className="text-xs font-semibold">Status</TableHead>
                            <TableHead className="text-xs font-semibold">Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(detail.payments ?? []).map((pay, idx) => (
                            <TableRow key={pay.id} className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                              <TableCell className="text-xs font-mono text-red-600 cursor-pointer hover:underline">{pay.receiptNumber || "—"}</TableCell>
                              <TableCell className="text-xs text-right font-medium">{formatINR(pay.amount)}</TableCell>
                              <TableCell className="text-xs">
                                <Badge variant="outline" className={`text-[10px] ${PAYMENT_MODE_MAP[pay.paymentMode]?.class || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                  {PAYMENT_MODE_MAP[pay.paymentMode]?.label || pay.paymentMode}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                <Badge variant="outline" className={`text-[10px] ${PAYMENT_STATUS_MAP[pay.status]?.class || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                  {PAYMENT_STATUS_MAP[pay.status]?.label || pay.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{new Date(pay.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── Tab: Support ── */}
              <TabsContent value="support" className="flex-1 overflow-y-auto px-6 pb-6 mt-2 custom-scrollbar">
                <div className="space-y-4">
                  {/* Complaints Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-center">
                      <p className="text-lg font-bold text-yellow-700">{(detail.complaints ?? []).filter(c => c.status === "OPEN").length}</p>
                      <p className="text-[11px] text-yellow-600 font-medium">Open</p>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-center">
                      <p className="text-lg font-bold text-orange-700">{(detail.complaints ?? []).filter(c => c.status === "IN_PROGRESS").length}</p>
                      <p className="text-[11px] text-orange-600 font-medium">In Progress</p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                      <p className="text-lg font-bold text-green-700">{(detail.complaints ?? []).filter(c => c.status === "RESOLVED" || c.status === "CLOSED").length}</p>
                      <p className="text-[11px] text-green-600 font-medium">Resolved</p>
                    </div>
                  </div>

                  {/* Complaints Table */}
                  {!detail.complaints?.length ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <ClipboardList className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">No complaints</p>
                      <p className="text-xs text-muted-foreground mt-1">Support tickets will appear here once raised.</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-xs font-semibold">Ticket #</TableHead>
                            <TableHead className="text-xs font-semibold">Type</TableHead>
                            <TableHead className="text-xs font-semibold">Priority</TableHead>
                            <TableHead className="text-xs font-semibold">Status</TableHead>
                            <TableHead className="text-xs font-semibold">Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(detail.complaints ?? []).map((c, idx) => (
                            <TableRow key={c.id} className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                              <TableCell className="text-xs font-mono text-red-600 cursor-pointer hover:underline">{c.ticketNumber}</TableCell>
                              <TableCell className="text-xs">{COMPLAINT_TYPE_LABELS[c.type] || c.type}</TableCell>
                              <TableCell className="text-xs">
                                {c.priority ? (
                                  <Badge variant="outline" className={`text-[10px] ${COMPLAINT_PRIORITY_MAP[c.priority]?.class || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                    {COMPLAINT_PRIORITY_MAP[c.priority]?.label || c.priority}
                                  </Badge>
                                ) : <span className="text-muted-foreground">N/A</span>}
                              </TableCell>
                              <TableCell className="text-xs">
                                <Badge variant="outline" className={`text-[10px] ${COMPLAINT_STATUS_MAP[c.status]?.class || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                  {COMPLAINT_STATUS_MAP[c.status]?.label || c.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── Tab: Activity Log ── */}
              <TabsContent value="activity" className="flex-1 overflow-y-auto px-6 pb-6 mt-2 custom-scrollbar">
                <div className="space-y-4">
                  {/* Registration Info */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><Calendar className="h-3.5 w-3.5" />Registration Info</CardTitle></CardHeader>
                    <CardContent className="pt-0 px-4 pb-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Created</p>
                          <p className="text-sm font-medium">{new Date(detail.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Last Updated</p>
                          <p className="text-sm font-medium">{new Date(detail.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Network Info */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><Network className="h-3.5 w-3.5" />Network</CardTitle></CardHeader>
                    <CardContent className="pt-0 px-4 pb-4 space-y-2.5">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Assigned Device</p>
                        <p className="text-sm font-medium">{detail.assignedDevice?.name || <span className="text-muted-foreground">N/A</span>}
                          {detail.assignedDevice?.ipAddress && <span className="text-xs text-muted-foreground ml-1.5">({detail.assignedDevice.ipAddress})</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Login Restriction</p>
                        <Badge variant="outline" className="text-[10px]">
                          {detail.loginRestriction === "all" ? "No Restriction" : detail.loginRestriction === "subnet" ? "Subnet Only" : detail.loginRestriction === "specific" ? "Specific IP" : detail.loginRestriction || "N/A"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Equipment */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><Router className="h-3.5 w-3.5" />Equipment</CardTitle></CardHeader>
                    <CardContent className="pt-0 px-4 pb-4 space-y-2.5">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Router Rented</p>
                        <Badge variant="outline" className={`text-[10px] ${detail.routerRented ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                          {detail.routerRented ? "Yes" : "No"}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Serial Number</p>
                        <p className="text-sm font-mono font-medium">{detail.routerSerial || <span className="text-muted-foreground">N/A</span>}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Deposit</p>
                        <p className="text-sm font-medium">{detail.routerDeposit ? formatINR(Number(detail.routerDeposit)) : <span className="text-muted-foreground">N/A</span>}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Tax & KYC */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><Shield className="h-3.5 w-3.5" />Tax & KYC</CardTitle></CardHeader>
                    <CardContent className="pt-0 px-4 pb-4 space-y-2.5">
                      <div>
                        <p className="text-[11px] text-muted-foreground">GSTIN</p>
                        <p className="text-sm font-mono font-medium">{detail.gstin || <span className="text-muted-foreground">N/A</span>}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">PAN</p>
                        <p className="text-sm font-mono font-medium">{detail.panNumber || <span className="text-muted-foreground">N/A</span>}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">KYC Aadhaar</p>
                        <p className="text-sm font-mono font-medium">{detail.kycAadhaarNumber || <span className="text-muted-foreground">N/A</span>}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">KYC Verified</p>
                        <Badge variant="outline" className={`text-[10px] ${detail.kycVerified ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                          {detail.kycVerified ? "Verified" : "Not Verified"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Notes */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide"><MessageSquare className="h-3.5 w-3.5" />Notes</CardTitle></CardHeader>
                    <CardContent className="pt-0 px-4 pb-4 space-y-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">Customer Notes</p>
                        {detail.notes ? (
                          <p className="text-sm leading-relaxed p-2 rounded bg-muted/50">{detail.notes}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No customer notes</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">Internal Notes</p>
                        {detail.internalNotes ? (
                          <p className="text-sm leading-relaxed p-2 rounded bg-amber-50 border border-amber-100 text-amber-900">{detail.internalNotes}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No internal notes</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm Dialog ─── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Subscriber</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedSub?.name || "this subscriber"}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => selectedId && deleteMutation.mutate(selectedId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk / Single Renew Dialog ─── */}
      <Dialog open={!!renewTargets} onOpenChange={(open) => { if (!open) setRenewTargets(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><RefreshCw className="h-4 w-4 text-primary" /></span>
              Renew Subscription
            </DialogTitle>
            <DialogDescription>
              {renewTargetSingle
                ? <>Renew <span className="font-medium text-foreground">{renewTargetSingle.name}</span> (<span>{renewTargetSingle.plan?.name || "no plan"}</span>) — extends from the current cycle end.</>
                : <>Renew <span className="font-medium text-foreground">{renewTargets?.length || 0}</span> selected subscribers — each extends from its own current cycle end.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Billing Cycle</Label>
                <Select value={renewMonths} onValueChange={setRenewMonths}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Monthly · 1 month</SelectItem>
                    <SelectItem value="3">Quarterly · 3 months</SelectItem>
                    <SelectItem value="6">Half-Yearly · 6 months</SelectItem>
                    <SelectItem value="12">Yearly · 12 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Payment Mode</Label>
                <Select value={renewPaymentMode} onValueChange={setRenewPaymentMode} disabled={!renewRecordPayment}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="ONLINE">Online</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                    <SelectItem value="WALLET">Wallet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center space-x-2 rounded-lg border bg-muted/30 p-3">
              <Checkbox id="renew-record-payment" checked={renewRecordPayment} onCheckedChange={(v) => setRenewRecordPayment(v === true)} />
              <Label htmlFor="renew-record-payment" className="cursor-pointer text-xs leading-snug">
                Record payment now &amp; mark invoice <span className="font-medium">PAID</span>
                <span className="block text-muted-foreground font-normal">Uncheck to create a draft invoice without collecting payment</span>
              </Label>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Base amount ({renewMonths} month{parseInt(renewMonths, 10) > 1 ? "s" : ""})</span>
                <span className="font-semibold tabular-nums">{formatINR(renewEstimate.base)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>GST</span>
                <span>As per plan ({renewEstimate.withPlan} with plan{renewEstimate.withoutPlan > 0 ? `, ${renewEstimate.withoutPlan} skipped` : ""})</span>
              </div>
              <p className="text-[11px] text-muted-foreground border-t pt-1.5">
                <Info className="h-3 w-3 inline mr-1 -mt-0.5" />
                Invoices + receipts are generated per subscriber. Suspended / disconnected subscribers are reactivated automatically.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewTargets(null)} disabled={bulkRenewMutation.isPending}>Cancel</Button>
            <Button onClick={confirmRenew} disabled={bulkRenewMutation.isPending || renewEstimate.withPlan === 0}>
              {bulkRenewMutation.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Renewing...</>
              ) : (
                <><Receipt className="h-4 w-4 mr-2" />Renew {renewTargets?.length || 0}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk / Single Change Plan Dialog ─── */}
      <Dialog open={!!planTargets} onOpenChange={(open) => { if (!open) setPlanTargets(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"><Repeat className="h-4 w-4 text-purple-600 dark:text-purple-400" /></span>
              Change Plan
            </DialogTitle>
            <DialogDescription>
              Move <span className="font-medium text-foreground">{planTargets?.length || 0}</span> subscriber{(planTargets?.length || 0) > 1 ? "s" : ""} to a new plan. Speeds are updated and RADIUS rate-limit groups are re-synced automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">New Plan</Label>
              <Select value={bulkPlanId} onValueChange={setBulkPlanId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select a plan…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {(plans || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {formatINR(p.priceMonthly)}/mo · {p.downloadSpeed || "?"}/{p.uploadSpeed || "?"} Mbps
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPlanForBulk && (
              <div className="rounded-lg border bg-muted/40 p-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Price</p>
                  <p className="text-xs font-semibold mt-0.5">{formatINR(selectedPlanForBulk.priceMonthly)}<span className="text-muted-foreground font-normal">/mo</span></p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Speed</p>
                  <p className="text-xs font-semibold mt-0.5">{selectedPlanForBulk.downloadSpeed || "?"}/{selectedPlanForBulk.uploadSpeed || "?"} Mbps</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Validity</p>
                  <p className="text-xs font-semibold mt-0.5">{selectedPlanForBulk.validityDays || 30} days</p>
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              Subscribers already on this plan are skipped. Pending invoices are not affected — renew separately if needed.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanTargets(null)} disabled={bulkPlanMutation.isPending}>Cancel</Button>
            <Button onClick={confirmBulkPlanChange} disabled={!bulkPlanId || bulkPlanMutation.isPending}>
              {bulkPlanMutation.isPending ? (
                <><Repeat className="h-4 w-4 mr-2 animate-spin" />Updating...</>
              ) : (
                <>Change Plan</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Subscriber Quick View Sheet ─── */}
      <SubscriberQuickView
        subscriberId={quickViewId}
        open={!!quickViewId}
        onOpenChange={(open) => {
          if (!open) setQuickViewId(null);
        }}
      />
    </div>
  );
}
