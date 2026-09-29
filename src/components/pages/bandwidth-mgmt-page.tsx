"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, cn } from "@/lib/utils";
import {
  Gauge, Zap, Shield, Activity, TreePine, RefreshCw, Play,
  AlertTriangle, CheckCircle, XCircle, Settings, Users, Eye,
  Trash2, Download, Upload, Server, Wifi, ChevronDown, ChevronRight,
  Clock, Save, Power, PowerOff, Ban, Edit2, Search, LayoutDashboard,
  HeartPulse, Layers, Network, Globe,
} from "lucide-react";
import { useModuleStore } from "@/store/module-store";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ─── Constants ─────────────────────────────────────────────────
const GW_PORT = "XTransformPort=3005";
const QOS_BASE = `/api/qos?${GW_PORT}`;
const AUTO_REFRESH_MS = 10_000;

// ─── Types ─────────────────────────────────────────────────────
interface QosStatusResponse {
  gatewayModeEnabled: boolean;
  gatewayMode: string;
  tcInitialized: boolean;
  ifb0Exists: boolean;
  ifb1Exists: boolean;
  rootQdiscActive: boolean;
  rootClassActive: boolean;
  defaultClassActive: boolean;
  wanRedirectActive: boolean;
  lanRedirectActive: boolean;
  totalSubnets: number;
  totalSubscribers: number;
  warnings: string[];
  lastRestoreTime?: string;
  lastRestoreResult?: string;
  lastRestoreErrors?: string[];
  sysctl?: { key: string; value: string; recommended: string; ok: boolean }[];
  classStats?: TcClassStat[];
  health?: {
    healthy: boolean;
    ifb0?: { rootQdisc?: boolean };
    ifb1?: { rootQdisc?: boolean };
    warnings?: string[];
  };
}

interface QosConfigResponse {
  tcRootBandwidthDownMbps: number;
  tcRootBandwidthUpMbps: number;
  tcDefaultUnshapedDownMbps: number;
  tcDefaultUnshapedUpMbps: number;
  tcAutoRestoreOnBoot: boolean;
  ipv6Enabled?: boolean;
  ipv6RateLimit?: number;
  ipv6BurstRate?: number;
}

interface SubnetQosEntry {
  subnetId: string;
  name: string;
  network: string;
  cidr: string;
  classIdDown: string;
  classIdUp: string;
  index: number;
  poolBandwidthDownMbps: number;
  poolBandwidthUpMbps: number;
  activeUsers: number;
  utilizationDown?: number;
  utilizationUp?: number;
  children?: SubscriberQosEntry[];
}

interface SubscriberQosEntry {
  subscriberId: string;
  subscriberName: string;
  ipAddress: string;
  subnetName: string;
  subnetId: string;
  classIdDown: string;
  classIdUp: string;
  rateDownKbps: number;
  rateUpKbps: number;
  status: "active" | "blocked" | "fup";
  sentBytes?: number;
  droppedBytes?: number;
  overlimits?: number;
  requeues?: number;
  createdAt?: string;
}

interface TcClassStat {
  deviceId: string;
  classId: string;
  parent: string;
  rate: string;
  ceil: string;
  sent: number;
  dropped: number;
  overlimits: number;
  requeues: number;
  backlog: number;
  level: "root" | "default" | "subnet" | "subscriber";
  label?: string;
}

interface SubnetOption {
  id: string;
  name: string;
  network: string;
  cidr: string;
}

// ─── Helpers ────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const v = bytes / Math.pow(k, i);
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function formatMbps(kbps: number): string {
  if (kbps >= 1000) {
    const m = kbps / 1000;
    return m % 1 === 0 ? `${m} Mbps` : `${m.toFixed(1)} Mbps`;
  }
  return `${kbps} Kbps`;
}

function utilColor(pct: number): string {
  if (pct >= 90) return "text-red-600 dark:text-red-400";
  if (pct >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

function utilBarColor(pct: number): string {
  if (pct >= 90) return "[&>div]:bg-red-500";
  if (pct >= 70) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-green-500";
}

function healthBadge(ok: boolean, label: string) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] gap-1 ${
        ok
          ? "border-green-500/50 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
          : "border-red-500/50 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
      }`}
    >
      {ok ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

// ─── Tab definitions ────────────────────────────────────────────
const TAB_ITEMS = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "config", label: "QoS Configuration", icon: Settings },
  { value: "subnets", label: "Subnet Pools", icon: Layers },
  { value: "subscribers", label: "Subscriber Classes", icon: Users },
  { value: "hierarchy", label: "TC Hierarchy", icon: TreePine },
  { value: "health", label: "System Health", icon: HeartPulse },
] as const;

type TabValue = (typeof TAB_ITEMS)[number]["value"];

// ═════════════════════════════════════════════════════════════════
//  Component
// ═════════════════════════════════════════════════════════════════
export default function BandwidthMgmtPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  const [activeTab, setActiveTab] = useState<TabValue>("overview");

  // ─── Auto-refresh ticker ──────────────────────────────────────
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    if (activeTab === "overview" || activeTab === "hierarchy" || activeTab === "health") {
      const iv = setInterval(() => setRefreshTick((t) => t + 1), AUTO_REFRESH_MS);
      return () => clearInterval(iv);
    }
  }, [activeTab]);

  // ─── Dialog state ─────────────────────────────────────────────
  const [initConfirmOpen, setInitConfirmOpen] = useState(false);
  const [teardownConfirmOpen, setTeardownConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);

  // Subnet dialogs
  const [addSubnetDialogOpen, setAddSubnetDialogOpen] = useState(false);
  const [editSubnetDialogOpen, setEditSubnetDialogOpen] = useState(false);
  const [removeSubnetConfirm, setRemoveSubnetConfirm] = useState<SubnetQosEntry | null>(null);
  const [editingSubnet, setEditingSubnet] = useState<SubnetQosEntry | null>(null);
  const [subnetForm, setSubnetForm] = useState({ subnetId: "", downMbps: "100", upMbps: "100" });
  const [expandedSubnet, setExpandedSubnet] = useState<string | null>(null);

  // Subscriber dialogs
  const [changeRateDialogOpen, setChangeRateDialogOpen] = useState(false);
  const [removeSubscriberConfirm, setRemoveSubscriberConfirm] = useState<SubscriberQosEntry | null>(null);
  const [editingSubscriber, setEditingSubscriber] = useState<SubscriberQosEntry | null>(null);
  const [subscriberRateForm, setSubscriberRateForm] = useState({ downKbps: "1024", upKbps: "512" });
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [subscriberSubnetFilter, setSubscriberSubnetFilter] = useState("all");

  // Config form state
  const [configForm, setConfigForm] = useState({
    tcRootBandwidthDownMbps: "25000",
    tcRootBandwidthUpMbps: "25000",
    tcDefaultUnshapedDownMbps: "100",
    tcDefaultUnshapedUpMbps: "100",
    tcAutoRestoreOnBoot: true,
    ipv6Enabled: false,
    ipv6RateLimit: 0,
    ipv6BurstRate: 0,
  });
  const [configSaving, setConfigSaving] = useState(false);

  // ─── Queries ──────────────────────────────────────────────────
  // QoS Status
  const { data: statusRaw, isLoading: statusLoading, refetch: refetchStatus } = useQuery<{ success: boolean; data: QosStatusResponse }>({
    queryKey: ["qos-status", refreshTick],
    queryFn: () => apiFetch<{ success: boolean; data: QosStatusResponse }>(`/api/qos/status?${GW_PORT}`),
    staleTime: 5_000,
  });
  const statusData = statusRaw?.data;

  // QoS Config
  const { data: configRaw, isLoading: configLoading } = useQuery<{ success: boolean; data: QosConfigResponse }>({
    queryKey: ["qos-config"],
    queryFn: () => apiFetch<{ success: boolean; data: QosConfigResponse }>(`/api/qos/config?${GW_PORT}`),
    staleTime: 30_000,
    enabled: activeTab === "config",
  });

  // Sync config form when data arrives
  useEffect(() => {
    if (configRaw?.data) {
      const cd = configRaw.data;
      setConfigForm({
        tcRootBandwidthDownMbps: String(cd.tcRootBandwidthDownMbps),
        tcRootBandwidthUpMbps: String(cd.tcRootBandwidthUpMbps),
        tcDefaultUnshapedDownMbps: String(cd.tcDefaultUnshapedDownMbps),
        tcDefaultUnshapedUpMbps: String(cd.tcDefaultUnshapedUpMbps),
        tcAutoRestoreOnBoot: cd.tcAutoRestoreOnBoot,
        ipv6Enabled: cd.ipv6Enabled ?? false,
        ipv6RateLimit: cd.ipv6RateLimit ?? 0,
        ipv6BurstRate: cd.ipv6BurstRate ?? 0,
      });
    }
  }, [configRaw]);

  // Subnets
  const { data: subnetsRaw, isLoading: subnetsLoading } = useQuery<{ success: boolean; data: SubnetQosEntry[] }>({
    queryKey: ["qos-subnets", refreshTick],
    queryFn: () => apiFetch<{ success: boolean; data: SubnetQosEntry[] }>(`/api/qos/subnets?${GW_PORT}`),
    staleTime: 10_000,
    enabled: activeTab === "overview" || activeTab === "subnets",
  });

  // Subscribers
  const { data: subscribersRaw, isLoading: subscribersLoading } = useQuery<{ success: boolean; data: SubscriberQosEntry[] }>({
    queryKey: ["qos-subscribers", refreshTick],
    queryFn: () => apiFetch<{ success: boolean; data: SubscriberQosEntry[] }>(`/api/qos/subscribers?${GW_PORT}`),
    staleTime: 10_000,
    enabled: activeTab === "overview" || activeTab === "subscribers",
  });

  // Available subnets (not yet TC-enabled) for add dialog
  const { data: availableSubnets } = useQuery<SubnetOption[]>({
    queryKey: ["qos-available-subnets"],
    queryFn: () => apiFetch<SubnetOption[]>(`/api/qos/subnets?${GW_PORT}&available=true`),
    staleTime: 60_000,
    enabled: addSubnetDialogOpen,
  });

  // ─── Derived data ─────────────────────────────────────────────
  const subnets = useMemo(() => subnetsRaw?.data || [], [subnetsRaw]);
  const subscribers = useMemo(() => subscribersRaw?.data || [], [subscribersRaw]);
  const status = useMemo(() => statusData, [statusData]);
  const configData = useMemo(() => configRaw?.data, [configRaw]);

  const filteredSubscribers = useMemo(() => {
    let list = subscribers;
    if (subscriberSubnetFilter !== "all") {
      list = list.filter((s) => s.subnetId === subscriberSubnetFilter);
    }
    if (subscriberSearch) {
      const q = subscriberSearch.toLowerCase();
      list = list.filter(
        (s) =>
          s.subscriberName.toLowerCase().includes(q) ||
          s.ipAddress.toLowerCase().includes(q) ||
          s.subnetName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [subscribers, subscriberSearch, subscriberSubnetFilter]);

  const uniqueSubnetNames = useMemo(() => {
    const names = new Map<string, string>();
    subscribers.forEach((s) => names.set(s.subnetId, s.subnetName));
    return Array.from(names.entries());
  }, [subscribers]);

  // ─── Mutations ────────────────────────────────────────────────
  const useQosMutation = (url: string, method: string, body: Record<string, unknown>, successMsg: string, errorMsg: string) =>
    useMutation({
      mutationFn: async () =>
        apiFetch(url, { method, body: JSON.stringify(body) }),
      onSuccess: () => {
        toast.success(successMsg);
        queryClient.invalidateQueries({ queryKey: ["qos-"] });
      },
      onError: (err: Error) => toast.error(`${errorMsg}: ${err.message}`),
    });

  const initTcMutation = useMutation({
    mutationFn: async () => apiFetch(`/api/qos/init?${GW_PORT}`, { method: "POST" }),
    onSuccess: () => { toast.success("TC initialized successfully"); setInitConfirmOpen(false); queryClient.invalidateQueries({ queryKey: ["qos-"] }); },
    onError: (err: Error) => toast.error(`TC init failed: ${err.message}`),
  });

  const teardownTcMutation = useMutation({
    mutationFn: async () => apiFetch(`/api/qos/teardown?${GW_PORT}`, { method: "POST" }),
    onSuccess: () => { toast.success("TC torn down successfully"); setTeardownConfirmOpen(false); queryClient.invalidateQueries({ queryKey: ["qos-"] }); },
    onError: (err: Error) => toast.error(`TC teardown failed: ${err.message}`),
  });

  const restoreTcMutation = useMutation({
    mutationFn: async () => apiFetch(`/api/qos/restore?${GW_PORT}`, { method: "POST" }),
    onSuccess: () => { toast.success("TC restored from database"); setRestoreConfirmOpen(false); queryClient.invalidateQueries({ queryKey: ["qos-"] }); },
    onError: (err: Error) => toast.error(`TC restore failed: ${err.message}`),
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      apiFetch(`/api/qos/config?${GW_PORT}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success("QoS configuration saved"); setConfigSaving(false); queryClient.invalidateQueries({ queryKey: ["qos-config"] }); },
    onError: (err: Error) => { toast.error(`Save failed: ${err.message}`); setConfigSaving(false); },
  });

  const addSubnetMutation = useMutation({
    mutationFn: async (payload: { subnetId: string; bandwidthDownMbps: number; bandwidthUpMbps: number }) =>
      apiFetch(`/api/qos/subnet/add?${GW_PORT}`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success("Subnet TC class added"); setAddSubnetDialogOpen(false); setSubnetForm({ subnetId: "", downMbps: "100", upMbps: "100" }); queryClient.invalidateQueries({ queryKey: ["qos-"] }); },
    onError: (err: Error) => toast.error(`Add subnet failed: ${err.message}`),
  });

  const removeSubnetMutation = useMutation({
    mutationFn: async (subnetId: string) =>
      apiFetch(`/api/qos/subnet/del?${GW_PORT}`, { method: "POST", body: JSON.stringify({ subnetId }) }),
    onSuccess: () => { toast.success("Subnet QoS removed"); setRemoveSubnetConfirm(null); queryClient.invalidateQueries({ queryKey: ["qos-"] }); },
    onError: (err: Error) => toast.error(`Remove failed: ${err.message}`),
  });

  const editSubnetMutation = useMutation({
    mutationFn: async (payload: { subnetId: string; bandwidthDownMbps: number; bandwidthUpMbps: number }) =>
      apiFetch(`/api/qos/subnet/rate?${GW_PORT}`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success("Subnet bandwidth updated"); setEditSubnetDialogOpen(false); setEditingSubnet(null); queryClient.invalidateQueries({ queryKey: ["qos-"] }); },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });

  const addSubscriberMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      apiFetch(`/api/qos/subscriber/add?${GW_PORT}`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success("Subscriber class added"); queryClient.invalidateQueries({ queryKey: ["qos-"] }); },
    onError: (err: Error) => toast.error(`Add subscriber failed: ${err.message}`),
  });

  const removeSubscriberMutation = useMutation({
    mutationFn: async (payload: { subscriberId: string }) =>
      apiFetch(`/api/qos/subscriber/del?${GW_PORT}`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success("Subscriber class removed"); setRemoveSubscriberConfirm(null); queryClient.invalidateQueries({ queryKey: ["qos-"] }); },
    onError: (err: Error) => toast.error(`Remove failed: ${err.message}`),
  });

  const changeRateMutation = useMutation({
    mutationFn: async (payload: { subscriberId: string; rateDownKbps: number; rateUpKbps: number }) =>
      apiFetch(`/api/qos/subscriber/rate?${GW_PORT}`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success("Subscriber rate updated"); setChangeRateDialogOpen(false); setEditingSubscriber(null); queryClient.invalidateQueries({ queryKey: ["qos-"] }); },
    onError: (err: Error) => toast.error(`Rate change failed: ${err.message}`),
  });

  // ─── Handlers ─────────────────────────────────────────────────
  const handleSaveConfig = useCallback(() => {
    setConfigSaving(true);
    saveConfigMutation.mutate({
      tcRootBandwidthDownMbps: Number(configForm.tcRootBandwidthDownMbps) || 25000,
      tcRootBandwidthUpMbps: Number(configForm.tcRootBandwidthUpMbps) || 25000,
      tcDefaultUnshapedDownMbps: Number(configForm.tcDefaultUnshapedDownMbps) || 100,
      tcDefaultUnshapedUpMbps: Number(configForm.tcDefaultUnshapedUpMbps) || 100,
      tcAutoRestoreOnBoot: configForm.tcAutoRestoreOnBoot,
      ipv6Enabled: configForm.ipv6Enabled,
      ipv6RateLimit: configForm.ipv6RateLimit,
      ipv6BurstRate: configForm.ipv6BurstRate,
    });
  }, [configForm, saveConfigMutation]);

  const handleAddSubnet = useCallback(() => {
    if (!subnetForm.subnetId) { toast.error("Select a subnet"); return; }
    addSubnetMutation.mutate({
      subnetId: subnetForm.subnetId,
      bandwidthDownMbps: Number(subnetForm.downMbps) || 100,
      bandwidthUpMbps: Number(subnetForm.upMbps) || 100,
    });
  }, [subnetForm, addSubnetMutation]);

  const handleEditSubnet = useCallback(() => {
    if (!editingSubnet) return;
    editSubnetMutation.mutate({
      subnetId: editingSubnet.subnetId,
      bandwidthDownMbps: Number(subnetForm.downMbps) || 100,
      bandwidthUpMbps: Number(subnetForm.upMbps) || 100,
    });
  }, [editingSubnet, subnetForm, editSubnetMutation]);

  const openEditSubnetDialog = useCallback((s: SubnetQosEntry) => {
    setEditingSubnet(s);
    setSubnetForm({ subnetId: s.subnetId, downMbps: String(s.poolBandwidthDownMbps), upMbps: String(s.poolBandwidthUpMbps) });
    setEditSubnetDialogOpen(true);
  }, []);

  const openChangeRateDialog = useCallback((s: SubscriberQosEntry) => {
    setEditingSubscriber(s);
    setSubscriberRateForm({ downKbps: String(s.rateDownKbps), upKbps: String(s.rateUpKbps) });
    setChangeRateDialogOpen(true);
  }, []);

  const handleChangeRate = useCallback(() => {
    if (!editingSubscriber) return;
    changeRateMutation.mutate({
      subscriberId: editingSubscriber.subscriberId,
      rateDownKbps: Number(subscriberRateForm.downKbps) || 1024,
      rateUpKbps: Number(subscriberRateForm.upKbps) || 512,
    });
  }, [editingSubscriber, subscriberRateForm, changeRateMutation]);

  // ─── Loading skeleton ─────────────────────────────────────────
  if (statusLoading && activeTab === "overview") {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-64" />
        <Skeleton className="skeleton-wave h-10 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="skeleton-wave h-64 rounded-lg" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════
  return (
    <TooltipProvider>
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Gauge className="h-6 w-6 text-orange-500" />
              QoS Management
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              TC/HTB subnet-based traffic shaping &amp; quality of service.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status?.gatewayModeEnabled !== undefined && (
              <Badge
                variant="outline"
                className={`text-xs gap-1.5 ${
                  status.gatewayModeEnabled
                    ? "border-green-500/50 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
                    : "border-red-500/50 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${status.gatewayModeEnabled ? "bg-green-500" : "bg-red-500"}`} />
                Gateway: {status.gatewayModeEnabled ? "ON" : "OFF"}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => { refetchStatus(); queryClient.invalidateQueries({ queryKey: ["qos-"] }); }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* ─── Tab Bar ────────────────────────────────────────── */}
        <div className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid p-1 bg-muted rounded-lg border shadow-sm gap-1">
          {TAB_ITEMS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ═════════════════════════════════════════════════════════
            TAB 1: Overview
        ═════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Gateway Mode Warning */}
            {status && !status.gatewayModeEnabled && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-red-800 dark:text-red-300">Gateway Mode is OFF</p>
                  <p className="text-red-700 dark:text-red-400 mt-0.5">
                    All TC/QoS operations are blocked. Go to <strong>Settings &gt; Module Manager</strong> and enable the <strong>Gateway Controller</strong> module to activate gateway mode.
                  </p>
                </div>
              </div>
            )}

            {/* Gateway Mode ON but TC not initialized */}
            {status && status.gatewayModeEnabled && !status.tcInitialized && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-300">Gateway Mode is ON but TC is not initialized</p>
                  <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                    Gateway mode is active. Click <strong>Initialize TC</strong> below to start traffic shaping.
                  </p>
                </div>
              </div>
            )}

            {/* Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Gateway Mode Status */}
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      status?.gatewayModeEnabled
                        ? "bg-green-50 dark:bg-green-950/30"
                        : "bg-red-50 dark:bg-red-950/30"
                    )}>
                      <Power className={cn(
                        "h-5 w-5",
                        status?.gatewayModeEnabled
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Gateway Mode</p>
                      <p className="text-[10px] text-muted-foreground">Master switch for all QoS/TC</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs gap-1 ${
                        status?.gatewayModeEnabled
                          ? "border-green-500/50 text-green-600 bg-green-50 dark:bg-green-950/30"
                          : "border-red-500/50 text-red-600 bg-red-50 dark:bg-red-950/30"
                      }`}
                    >
                      {status?.gatewayModeEnabled ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {status?.gatewayModeEnabled ? "ON" : "OFF"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* TC Status */}
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30">
                      <Zap className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">TC Status</p>
                      <p className="text-[10px] text-muted-foreground">
                        ifb0: {status?.ifb0Exists ? "✓" : "✗"} &middot; ifb1: {status?.ifb1Exists ? "✓" : "✗"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs gap-1 ${
                        status?.tcInitialized
                          ? "border-green-500/50 text-green-600 bg-green-50 dark:bg-green-950/30"
                          : "border-red-500/50 text-red-600 bg-red-50 dark:bg-red-950/30"
                      }`}
                    >
                      {status?.tcInitialized ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {status?.tcInitialized ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl p-4 ring-1 ring-black/5 shadow-sm stat-gradient-amber">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-80">Subnets with QoS</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{status?.totalSubnets ?? 0}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Layers className="h-5 w-5" />
                  </div>
                </div>
              </div>
              <div className="rounded-xl p-4 ring-1 ring-black/5 shadow-sm stat-gradient-emerald">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-80">Active Classes</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{status?.totalSubscribers ?? 0}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Users className="h-5 w-5" />
                  </div>
                </div>
              </div>
              <div className="rounded-xl p-4 ring-1 ring-black/5 shadow-sm stat-gradient-teal">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-80">Root BW Down</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{configData?.tcRootBandwidthDownMbps ?? 25000} <span className="text-sm opacity-70">Mbps</span></p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Download className="h-5 w-5" />
                  </div>
                </div>
              </div>
              <div className="rounded-xl p-4 ring-1 ring-black/5 shadow-sm stat-gradient-green">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-80">Root BW Up</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{configData?.tcRootBandwidthUpMbps ?? 25000} <span className="text-sm opacity-70">Mbps</span></p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Upload className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Warnings */}
            {status?.warnings && status.warnings.length > 0 && (
              <div className="space-y-2">
                {status.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 border border-amber-500/30">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* IPv6 Traffic Shaping Info */}
            {isModuleEnabled("ipv6") && (
              <div className="flex items-center gap-2 p-3 bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded-lg">
                <Globe className="h-4 w-4 text-cyan-600" />
                <div>
                  <p className="text-sm font-medium">IPv6 Traffic Shaping</p>
                  <p className="text-xs text-muted-foreground">Enable to apply QoS rules to IPv6 traffic. Without this, IPv6 bypasses all bandwidth limits.</p>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-orange-500" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setInitConfirmOpen(true)}>
                    <Play className="h-3.5 w-3.5" />
                    Initialize TC
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setRestoreConfirmOpen(true)}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Batch Restore
                  </Button>
                  <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setTeardownConfirmOpen(true)}>
                    <PowerOff className="h-3.5 w-3.5" />
                    Teardown TC
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════
            TAB 2: QoS Configuration
        ═════════════════════════════════════════════════════════ */}
        {activeTab === "config" && (
          <div className="space-y-6 max-w-2xl">
            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Settings className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Global QoS Settings
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure root bandwidth pool and default traffic shaping parameters.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {configLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Default Pool Bandwidth */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Network className="h-4 w-4 text-orange-500" />
                        Default Pool Bandwidth
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="rootDown" className="text-xs">Total Download Capacity (Mbps)</Label>
                          <Input
                            id="rootDown"
                            type="number"
                            className="h-9 text-sm"
                            value={configForm.tcRootBandwidthDownMbps}
                            onChange={(e) => setConfigForm((f) => ({ ...f, tcRootBandwidthDownMbps: e.target.value }))}
                          />
                          <p className="text-[10px] text-muted-foreground">Maps to root HTB class 1:1 on ifb0</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="rootUp" className="text-xs">Total Upload Capacity (Mbps)</Label>
                          <Input
                            id="rootUp"
                            type="number"
                            className="h-9 text-sm"
                            value={configForm.tcRootBandwidthUpMbps}
                            onChange={(e) => setConfigForm((f) => ({ ...f, tcRootBandwidthUpMbps: e.target.value }))}
                          />
                          <p className="text-[10px] text-muted-foreground">Maps to root HTB class 1:1 on ifb1</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Default Speed for Uncategorized */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        Default Speed for Uncategorized Traffic
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="unshapedDown" className="text-xs">Download Speed (Mbps)</Label>
                          <Input
                            id="unshapedDown"
                            type="number"
                            className="h-9 text-sm"
                            value={configForm.tcDefaultUnshapedDownMbps}
                            onChange={(e) => setConfigForm((f) => ({ ...f, tcDefaultUnshapedDownMbps: e.target.value }))}
                          />
                          <p className="text-[10px] text-muted-foreground">Class 1:9999 (unclassified traffic)</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="unshapedUp" className="text-xs">Upload Speed (Mbps)</Label>
                          <Input
                            id="unshapedUp"
                            type="number"
                            className="h-9 text-sm"
                            value={configForm.tcDefaultUnshapedUpMbps}
                            onChange={(e) => setConfigForm((f) => ({ ...f, tcDefaultUnshapedUpMbps: e.target.value }))}
                          />
                          <p className="text-[10px] text-muted-foreground">Class 1:9999 (unclassified traffic)</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Reboot Recovery */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-green-600 dark:text-green-400" />
                        Reboot Recovery
                      </h3>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">Auto-restore TC on boot</p>
                          <p className="text-[10px] text-muted-foreground">
                            Automatically reinitialize TC hierarchy from database when the system boots.
                          </p>
                        </div>
                        <Switch
                          checked={configForm.tcAutoRestoreOnBoot}
                          onCheckedChange={(v) => setConfigForm((f) => ({ ...f, tcAutoRestoreOnBoot: v }))}
                        />
                      </div>
                    </div>

                    {/* IPv6 Traffic Class */}
                    {isModuleEnabled("ipv6") && (
                      <div className="space-y-3 p-4 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          <Label className="text-sm font-semibold">IPv6 Traffic Class</Label>
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Enable IPv6 Shaping</Label>
                          <Switch checked={configForm.ipv6Enabled} onCheckedChange={(v) => setConfigForm((f) => ({ ...f, ipv6Enabled: v }))} />
                        </div>
                        {configForm.ipv6Enabled && (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label>IPv6 Rate Limit (Kbps)</Label>
                                <Input type="number" placeholder="Same as IPv4" value={configForm.ipv6RateLimit || ""} onChange={(e) => setConfigForm((f) => ({ ...f, ipv6RateLimit: parseInt(e.target.value) || 0 }))} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>IPv6 Burst Rate (Kbps)</Label>
                                <Input type="number" placeholder="Optional" value={configForm.ipv6BurstRate || ""} onChange={(e) => setConfigForm((f) => ({ ...f, ipv6BurstRate: parseInt(e.target.value) || 0 }))} />
                              </div>
                            </div>
                            <div className="p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md text-xs text-amber-800 dark:text-amber-300">
                              <strong>Note:</strong> IPv4 + IPv6 share the same plan bandwidth limit. Setting IPv6 rate equal to IPv4 ensures total bandwidth doesn't exceed plan speed.
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={handleSaveConfig}
                        disabled={configSaving || saveConfigMutation.isPending}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {configSaving || saveConfigMutation.isPending ? "Saving..." : "Save Configuration"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════
            TAB 3: Subnet Pools
        ═════════════════════════════════════════════════════════ */}
        {activeTab === "subnets" && (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setSubnetForm({ subnetId: "", downMbps: "100", upMbps: "100" }); setAddSubnetDialogOpen(true); }}>
                <Layers className="h-3.5 w-3.5" />
                Add Subnet Pool
              </Button>
              <Badge variant="outline" className="text-xs w-fit whitespace-nowrap">
                {subnets.length} subnet{subnets.length !== 1 ? "s" : ""} with QoS
              </Badge>
            </div>

            {/* Subnet Table */}
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                      <TableRow>
                        <TableHead className="text-xs w-8"></TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Network / CIDR</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Class ID</TableHead>
                        <TableHead className="text-xs">Pool BW ↓</TableHead>
                        <TableHead className="text-xs">Pool BW ↑</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Active Users</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Utilization</TableHead>
                        <TableHead className="text-xs w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subnetsLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 9 }).map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-5 w-full rounded" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : subnets.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                            <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            No subnets with QoS enabled.
                          </TableCell>
                        </TableRow>
                      ) : (
                        subnets.map((subnet) => {
                          const isExpanded = expandedSubnet === subnet.subnetId;
                          const utilPct = subnet.utilizationDown ?? 0;
                          return (
                            <>
                              <TableRow key={subnet.subnetId} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setExpandedSubnet(isExpanded ? null : subnet.subnetId)}>
                                <TableCell>
                                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </TableCell>
                                <TableCell className="text-xs font-medium">{subnet.name}</TableCell>
                                <TableCell className="text-xs font-mono">{subnet.network}/{subnet.cidr}</TableCell>
                                <TableCell className="text-xs font-mono hidden md:table-cell text-muted-foreground">{subnet.classIdDown} / {subnet.classIdUp}</TableCell>
                                <TableCell className="text-xs font-mono tabular-nums text-green-600">{subnet.poolBandwidthDownMbps} Mbps</TableCell>
                                <TableCell className="text-xs font-mono tabular-nums text-teal-600">{subnet.poolBandwidthUpMbps} Mbps</TableCell>
                                <TableCell className="text-xs tabular-nums hidden lg:table-cell">{subnet.activeUsers}</TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <div className="flex items-center gap-2 min-w-[120px]">
                                    <Progress value={utilPct} className={`h-1.5 w-16 ${utilBarColor(utilPct)}`} />
                                    <span className={`text-[10px] font-mono tabular-nums ${utilColor(utilPct)}`}>{utilPct.toFixed(0)}%</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSubnetDialog(subnet)}>
                                          <Edit2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Edit Bandwidth</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRemoveSubnetConfirm(subnet)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Remove QoS</TooltipContent>
                                    </Tooltip>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {/* Expanded children */}
                              {isExpanded && subnet.children && subnet.children.length > 0 && (
                                <TableRow key={`${subnet.subnetId}-children`}>
                                  <TableCell colSpan={9} className="bg-muted/30 px-8 py-2">
                                    <div className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                                      Child Classes ({subnet.children.length})
                                    </div>
                                    <div className="space-y-1">
                                      {subnet.children.map((child) => (
                                        <div key={child.subscriberId} className="flex items-center gap-3 py-1 text-xs">
                                          <span className="font-mono text-muted-foreground w-24">{child.classIdDown}</span>
                                          <span className="font-medium truncate flex-1">{child.subscriberName}</span>
                                          <span className="font-mono text-green-600">{formatMbps(child.rateDownKbps)}</span>
                                          <span className="text-muted-foreground">/</span>
                                          <span className="font-mono text-teal-600">{formatMbps(child.rateUpKbps)}</span>
                                          <Badge
                                            variant="outline"
                                            className={`text-[10px] ${
                                              child.status === "active"
                                                ? "border-green-500/50 text-green-600"
                                                : child.status === "blocked"
                                                ? "border-red-500/50 text-red-600"
                                                : "border-amber-500/50 text-amber-600"
                                            }`}
                                          >
                                            {child.status}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════
            TAB 4: Subscriber Classes
        ═════════════════════════════════════════════════════════ */}
        {activeTab === "subscribers" && (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search subscribers..."
                    className="h-8 text-xs w-52 pl-8"
                    value={subscriberSearch}
                    onChange={(e) => setSubscriberSearch(e.target.value)}
                  />
                </div>
                <Select value={subscriberSubnetFilter} onValueChange={setSubscriberSubnetFilter}>
                  <SelectTrigger className="h-8 text-xs w-40">
                    <SelectValue placeholder="All Subnets" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subnets</SelectItem>
                    {uniqueSubnetNames.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Badge variant="outline" className="text-xs w-fit whitespace-nowrap">
                {filteredSubscribers.length} classe{filteredSubscribers.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {/* Subscribers Table */}
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                      <TableRow>
                        <TableHead className="text-xs">Subscriber</TableHead>
                        <TableHead className="text-xs">IP Address</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Subnet</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Class ID ↓</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Class ID ↑</TableHead>
                        <TableHead className="text-xs">Rate ↓</TableHead>
                        <TableHead className="text-xs">Rate ↑</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Status</TableHead>
                        <TableHead className="text-xs w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subscribersLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 9 }).map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-5 w-full rounded" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : filteredSubscribers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            {subscriberSearch || subscriberSubnetFilter !== "all" ? "No matching subscriber classes." : "No active subscriber TC classes."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredSubscribers.map((sub) => (
                          <TableRow key={sub.subscriberId} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="text-xs font-medium">{sub.subscriberName}</TableCell>
                            <TableCell className="text-xs font-mono">{sub.ipAddress}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell text-muted-foreground">{sub.subnetName}</TableCell>
                            <TableCell className="text-xs font-mono hidden lg:table-cell text-muted-foreground">{sub.classIdDown}</TableCell>
                            <TableCell className="text-xs font-mono hidden lg:table-cell text-muted-foreground">{sub.classIdUp}</TableCell>
                            <TableCell className="text-xs font-mono tabular-nums text-green-600">{formatMbps(sub.rateDownKbps)}</TableCell>
                            <TableCell className="text-xs font-mono tabular-nums text-teal-600">{formatMbps(sub.rateUpKbps)}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge
                                variant="outline"
                                className={`text-[10px] gap-1 ${
                                  sub.status === "active"
                                    ? "border-green-500/50 text-green-600 bg-green-50 dark:bg-green-950/30"
                                    : sub.status === "blocked"
                                    ? "border-red-500/50 text-red-600 bg-red-50 dark:bg-red-950/30"
                                    : "border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
                                }`}
                              >
                                {sub.status === "active" && <CheckCircle className="h-3 w-3" />}
                                {sub.status === "blocked" && <Ban className="h-3 w-3" />}
                                {sub.status === "fup" && <AlertTriangle className="h-3 w-3" />}
                                {sub.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openChangeRateDialog(sub)}>
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Change Rate</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRemoveSubscriberConfirm(sub)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Remove Class</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════
            TAB 5: TC Hierarchy (Live Kernel View)
        ═════════════════════════════════════════════════════════ */}
        {activeTab === "hierarchy" && (
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => { refetchStatus(); queryClient.invalidateQueries({ queryKey: ["qos-"] }); }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh Now
                </Button>
                <Badge variant="outline" className="text-xs">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse mr-1.5" />
                  Auto-refresh {AUTO_REFRESH_MS / 1000}s
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Healthy</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> High util</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Errors</span>
                {isModuleEnabled("ipv6") && (
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-500" /> IPv6</span>
                )}
              </div>
            </div>

            {/* Hierarchy Tree */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TreePine className="h-4 w-4 text-orange-500" />
                  Live TC Class Tree
                </CardTitle>
                <CardDescription className="text-xs">
                  Real-time kernel HTB class hierarchy from <code className="bg-muted px-1 rounded">tc -s class show</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {statusLoading ? (
                  <div className="space-y-2 py-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full rounded" />
                    ))}
                  </div>
                ) : !status?.classStats || status.classStats.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <TreePine className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {status?.tcInitialized ? "No TC classes found. Initialize subnets first." : "TC is not initialized."}
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[600px] overflow-y-auto">
                    {status.classStats.map((cls) => {
                      const isError = cls.dropped > 0 || cls.overlimits > 100;
                      const isHighUtil = cls.level === "subnet" && (cls.sent || 0) > 0;
                      const borderColor = isError ? "border-l-red-500" : isHighUtil ? "border-l-amber-500" : "border-l-green-500";
                      const indent = cls.level === "subscriber" ? "pl-12" : cls.level === "subnet" ? "pl-8" : "pl-4";

                      return (
                        <div
                          key={`${cls.deviceId}-${cls.classId}`}
                          className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-l-2 ${borderColor} ${indent} py-2 px-3 rounded-r-md hover:bg-muted/30 transition-colors text-xs`}
                        >
                          {/* Class ID */}
                          <span className="font-mono font-semibold min-w-[60px]">{cls.classId}</span>
                          {/* Level badge */}
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1.5 py-0 ${
                              cls.level === "root"
                                ? "border-orange-500/50 text-orange-600"
                                : cls.level === "default"
                                ? "border-slate-400/50 text-slate-600"
                                : cls.level === "subnet"
                                ? "border-teal-500/50 text-teal-600"
                                : "border-green-500/50 text-green-600"
                            }`}
                          >
                            {cls.level}
                          </Badge>
                          {/* Label */}
                          {cls.label && (
                            <span className="text-muted-foreground truncate max-w-[160px]">{cls.label}</span>
                          )}
                          {/* Rate / Ceil */}
                          <span className="font-mono text-muted-foreground">
                            rate={cls.rate} {cls.ceil !== cls.rate && <span className="text-[10px]">ceil={cls.ceil}</span>}
                          </span>
                          {/* Stats */}
                          <div className="flex items-center gap-3 text-[10px] ml-auto font-mono tabular-nums">
                            <span className="text-green-600" title="Sent bytes">sent: {formatBytes(cls.sent)}</span>
                            <span className={cls.dropped > 0 ? "text-red-600" : "text-muted-foreground"} title="Dropped bytes">drop: {formatBytes(cls.dropped)}</span>
                            <span className={cls.overlimits > 100 ? "text-red-600" : "text-muted-foreground"} title="Overlimits">over: {cls.overlimits}</span>
                            <span className="text-muted-foreground" title="Requeues">rq: {cls.requeues}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════
            TAB 6: System Health
        ═════════════════════════════════════════════════════════ */}
        {activeTab === "health" && (
          <div className="space-y-6">
            {/* Health Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="h-4 w-4 text-orange-500" />
                    <p className="text-xs font-semibold">ifb0 (Download)</p>
                  </div>
                  <div className="space-y-1.5">
                    {healthBadge(status?.ifb0Exists ?? false, "Device")}
                    {healthBadge(status?.rootQdiscActive ?? false, "Root qdisc")}
                  </div>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="h-4 w-4 text-teal-500" />
                    <p className="text-xs font-semibold">ifb1 (Upload)</p>
                  </div>
                  <div className="space-y-1.5">
                    {healthBadge(status?.ifb1Exists ?? false, "Device")}
                    {healthBadge(status?.rootQdiscActive ?? false, "Root qdisc")}
                  </div>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Wifi className="h-4 w-4 text-green-600" />
                    <p className="text-xs font-semibold">WAN Redirect</p>
                  </div>
                  <div className="space-y-1.5">
                    {healthBadge(status?.wanRedirectActive ?? false, "WAN→ifb0")}
                    {healthBadge(status?.lanRedirectActive ?? false, "LAN→ifb1")}
                  </div>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-amber-600" />
                    <p className="text-xs font-semibold">Classes</p>
                  </div>
                  <div className="space-y-1.5">
                    {healthBadge(status?.rootClassActive ?? false, "Root 1:1")}
                    {healthBadge(status?.defaultClassActive ?? false, "Default 1:9999")}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Warnings */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Warnings
                  {status?.warnings && status.warnings.length > 0 && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
                      {status.warnings.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statusLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full rounded" />
                    ))}
                  </div>
                ) : !status?.warnings || status.warnings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
                    No warnings. TC system is healthy.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {status.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 border border-amber-500/30">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Restore Log */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  TC Restore Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statusLoading ? (
                  <Skeleton className="h-16 w-full rounded" />
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last Restore:</span>
                      <span className="font-mono">{status?.lastRestoreTime || "Never"}</span>
                    </div>
                    {status?.lastRestoreResult && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Result:</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            status.lastRestoreResult === "success"
                              ? "border-green-500/50 text-green-600"
                              : "border-red-500/50 text-red-600"
                          }`}
                        >
                          {status.lastRestoreResult}
                        </Badge>
                      </div>
                    )}
                    {status?.lastRestoreErrors && status.lastRestoreErrors.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {status.lastRestoreErrors.map((err, i) => (
                          <div key={i} className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded p-2 font-mono text-[10px]">
                            {err}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sysctl Recommendations */}
            {status?.sysctl && status.sysctl.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Settings className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    Sysctl Tuning Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Parameter</TableHead>
                          <TableHead className="text-xs">Current</TableHead>
                          <TableHead className="text-xs">Recommended</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {status.sysctl.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-mono">{s.key}</TableCell>
                            <TableCell className="text-xs font-mono">{s.value}</TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">{s.recommended}</TableCell>
                            <TableCell>
                              {healthBadge(s.ok, s.ok ? "OK" : "Mismatch")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════
            DIALOGS
        ═════════════════════════════════════════════════════════ */}

        {/* Initialize TC Confirm */}
        <AlertDialog open={initConfirmOpen} onOpenChange={setInitConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Initialize TC / QoS?</AlertDialogTitle>
              <AlertDialogDescription>
                This will create IFB devices (ifb0, ifb1), root HTB qdisc, default class, and initialize all subnet/ subscriber classes from the database.
                Existing TC configuration will be replaced.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => initTcMutation.mutate()} disabled={initTcMutation.isPending}>
                {initTcMutation.isPending ? "Initializing..." : "Initialize"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Teardown TC Confirm */}
        <AlertDialog open={teardownConfirmOpen} onOpenChange={setTeardownConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Teardown TC / QoS?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove ALL TC configuration from the system — qdiscs, classes, filters, and IFB redirects. All traffic shaping will stop.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => teardownTcMutation.mutate()} disabled={teardownTcMutation.isPending} className="bg-red-600 hover:bg-red-700">
                {teardownTcMutation.isPending ? "Tearing down..." : "Teardown"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Batch Restore Confirm */}
        <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Batch Restore from Database?</AlertDialogTitle>
              <AlertDialogDescription>
                This will re-initialize TC from the database, restoring all subnet and subscriber classes. Equivalent to a boot restore.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => restoreTcMutation.mutate()} disabled={restoreTcMutation.isPending}>
                {restoreTcMutation.isPending ? "Restoring..." : "Restore"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Add Subnet Dialog */}
        <Dialog open={addSubnetDialogOpen} onOpenChange={setAddSubnetDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Subnet QoS Pool</DialogTitle>
              <DialogDescription>
                Select a subnet and configure its bandwidth pool allocation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs">Subnet</Label>
                {isModuleEnabled("ipv6") && (
                  <p className="text-xs text-muted-foreground">Rate limit applies to combined IPv4 + IPv6 traffic</p>
                )}
                <Select value={subnetForm.subnetId} onValueChange={(v) => setSubnetForm((f) => ({ ...f, subnetId: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select subnet..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(availableSubnets || []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} — {s.network}/{s.cidr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(availableSubnets || []).length === 0 && (
                  <p className="text-[10px] text-muted-foreground">All subnets already have QoS enabled.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Download BW (Mbps)</Label>
                  <Input type="number" className="h-9 text-sm" value={subnetForm.downMbps} onChange={(e) => setSubnetForm((f) => ({ ...f, downMbps: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Upload BW (Mbps)</Label>
                  <Input type="number" className="h-9 text-sm" value={subnetForm.upMbps} onChange={(e) => setSubnetForm((f) => ({ ...f, upMbps: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setAddSubnetDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAddSubnet} disabled={addSubnetMutation.isPending}>
                {addSubnetMutation.isPending ? "Adding..." : "Add Subnet Pool"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Subnet Bandwidth Dialog */}
        <Dialog open={editSubnetDialogOpen} onOpenChange={setEditSubnetDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Subnet Bandwidth</DialogTitle>
              <DialogDescription>
                {editingSubnet && <>Change bandwidth pool for <strong>{editingSubnet.name}</strong> ({editingSubnet.network}/{editingSubnet.cidr})</>}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs">Download BW (Mbps)</Label>
                <Input type="number" className="h-9 text-sm" value={subnetForm.downMbps} onChange={(e) => setSubnetForm((f) => ({ ...f, downMbps: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Upload BW (Mbps)</Label>
                <Input type="number" className="h-9 text-sm" value={subnetForm.upMbps} onChange={(e) => setSubnetForm((f) => ({ ...f, upMbps: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditSubnetDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleEditSubnet} disabled={editSubnetMutation.isPending}>
                {editSubnetMutation.isPending ? "Updating..." : "Update Bandwidth"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Subnet Confirm */}
        <AlertDialog open={!!removeSubnetConfirm} onOpenChange={() => setRemoveSubnetConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove QoS from Subnet?</AlertDialogTitle>
              <AlertDialogDescription>
                {removeSubnetConfirm && (
                  <>This will remove the HTB root class and all child subscriber classes for <strong>{removeSubnetConfirm.name}</strong> ({removeSubnetConfirm.network}/{removeSubnetConfirm.cidr}). Active shaping will stop for all users in this subnet.</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => removeSubnetConfirm && removeSubnetMutation.mutate(removeSubnetConfirm.subnetId)} disabled={removeSubnetMutation.isPending} className="bg-red-600 hover:bg-red-700">
                {removeSubnetMutation.isPending ? "Removing..." : "Remove QoS"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Change Subscriber Rate Dialog */}
        <Dialog open={changeRateDialogOpen} onOpenChange={setChangeRateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Subscriber Rate</DialogTitle>
              <DialogDescription>
                {editingSubscriber && <>Change TC shaping rate for <strong>{editingSubscriber.subscriberName}</strong> ({editingSubscriber.ipAddress})</>}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs">Download (Kbps)</Label>
                <Input type="number" className="h-9 text-sm" value={subscriberRateForm.downKbps} onChange={(e) => setSubscriberRateForm((f) => ({ ...f, downKbps: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Upload (Kbps)</Label>
                <Input type="number" className="h-9 text-sm" value={subscriberRateForm.upKbps} onChange={(e) => setSubscriberRateForm((f) => ({ ...f, upKbps: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setChangeRateDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleChangeRate} disabled={changeRateMutation.isPending}>
                {changeRateMutation.isPending ? "Updating..." : "Update Rate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Subscriber Confirm */}
        <AlertDialog open={!!removeSubscriberConfirm} onOpenChange={() => setRemoveSubscriberConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Subscriber TC Class?</AlertDialogTitle>
              <AlertDialogDescription>
                {removeSubscriberConfirm && (
                  <>Remove TC shaping class for <strong>{removeSubscriberConfirm.subscriberName}</strong> ({removeSubscriberConfirm.ipAddress}). This user will fall back to default unshaped speed.</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => removeSubscriberConfirm && removeSubscriberMutation.mutate({ subscriberId: removeSubscriberConfirm.subscriberId })} disabled={removeSubscriberMutation.isPending} className="bg-red-600 hover:bg-red-700">
                {removeSubscriberMutation.isPending ? "Removing..." : "Remove Class"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
