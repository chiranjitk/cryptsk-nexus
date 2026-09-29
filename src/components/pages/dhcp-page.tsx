"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Server, Network, Plus, Trash2, Edit, RefreshCw, Search, Wifi,
  HardDrive, Clock, AlertTriangle, CheckCircle, XCircle,
  ChevronDown, ChevronRight, Eye, Copy, Info, Zap, Globe,
  Shield, Monitor, Router as RouterIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────
interface DhcpSubnet {
  id: string;
  name: string;
  interfaceName: string;
  subnet: string;
  netmask: string;
  rangeStart: string;
  rangeEnd: string;
  gateway: string;
  dnsServers: string;
  domainName: string;
  leaseTime: number;
  ntpServers: string;
  winsServer: string;
  allowedHosts: string[];
  captivePortalId: string | null;
  captivePortalName?: string;
  enabled: boolean;
  activeLeases?: number;
  totalReservations?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface DhcpReservation {
  id: string;
  subnetId: string;
  subnetName?: string;
  macAddress: string;
  ipAddress: string;
  hostname: string;
  clientType: string;
  subscriberId?: string | null;
  subscriberName?: string;
  deviceId?: string | null;
  deviceName?: string;
  description: string;
  enabled: boolean;
  status?: string;
}

interface DhcpLease {
  ipAddress: string;
  macAddress: string;
  hostname: string;
  clientId: string;
  subnetId: string;
  subnet?: string;
  leaseStart: string;
  leaseExpiry: string;
  state: string;
  remaining?: string;
}

interface KeaStatus {
  connected: boolean;
  version?: string;
  uptime?: number;
  url?: string;
  totalSubnets?: number;
  totalLeases?: number;
  activeLeases?: number;
  expiredLeases?: number;
  config?: string;
}

// ─── Constants ────────────────────────────────────────────────────
const LEASE_PRESETS = [
  { label: "1 Hour", value: 3600 },
  { label: "6 Hours", value: 21600 },
  { label: "12 Hours", value: 43200 },
  { label: "24 Hours", value: 86400 },
  { label: "7 Days", value: 604800 },
  { label: "30 Days", value: 2592000 },
];

const CLIENT_TYPES = [
  { value: "SUBSCRIBER", label: "Subscriber" },
  { value: "DEVICE", label: "Device" },
  { value: "INFRASTRUCTURE", label: "Infrastructure" },
  { value: "AP", label: "Access Point" },
  { value: "SWITCH", label: "Switch" },
  { value: "OLT", label: "OLT" },
];

const CLIENT_TYPE_BADGE: Record<string, string> = {
  SUBSCRIBER: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  DEVICE: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  INFRASTRUCTURE: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  AP: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  SWITCH: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  OLT: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400",
};

const LEASE_STATE_BADGE: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  EXPIRED: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  RELEASED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  ABANDONED: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
};

const emptySubnetForm = {
  name: "",
  interfaceName: "",
  subnet: "",
  netmask: "",
  rangeStart: "",
  rangeEnd: "",
  leaseTime: 86400,
  gateway: "",
  dnsServers: "",
  domainName: "",
  ntpServers: "",
  winsServer: "",
  allowedHosts: [] as string[],
  captivePortalId: "",
  enabled: true,
};

const emptyReservationForm = {
  subnetId: "",
  macAddress: "",
  ipAddress: "",
  hostname: "",
  clientType: "SUBSCRIBER",
  subscriberId: "",
  deviceId: "",
  description: "",
  enabled: true,
};

// ─── Helpers ──────────────────────────────────────────────────────
function formatLeaseTime(seconds: number): string {
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

function formatUptime(seconds: number): string {
  if (!seconds) return "N/A";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function calcFreeIPs(subnet: string, netmask: string, rangeStart: string, rangeEnd: string, activeLeases = 0): number {
  try {
    const ipToNum = (ip: string) => {
      const parts = ip.split(".").map(Number);
      return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    };
    const start = ipToNum(rangeStart);
    const end = ipToNum(rangeEnd);
    const total = end >= start ? end - start + 1 : 0;
    return Math.max(0, total - activeLeases);
  } catch {
    return 0;
  }
}

// ─── Component ────────────────────────────────────────────────────
export default function DhcpPage() {
  const queryClient = useQueryClient();

  // ─── Tab state ───
  const [activeTab, setActiveTab] = useState("subnets");

  // ─── Subnet state ───
  const [subnetSearch, setSubnetSearch] = useState("");
  const [subnetAddOpen, setSubnetAddOpen] = useState(false);
  const [subnetEditOpen, setSubnetEditOpen] = useState(false);
  const [subnetDeleteOpen, setSubnetDeleteOpen] = useState(false);
  const [selectedSubnetId, setSelectedSubnetId] = useState<string | null>(null);
  const [subnetForm, setSubnetForm] = useState(emptySubnetForm);
  const [subnetFormErrors, setSubnetFormErrors] = useState<string[]>([]);
  const [allowedHostInput, setAllowedHostInput] = useState("");
  const [leasePreset, setLeasePreset] = useState("24 Hours");

  // ─── Reservation state ───
  const [reservationSearch, setReservationSearch] = useState("");
  const [resAddOpen, setResAddOpen] = useState(false);
  const [resEditOpen, setResEditOpen] = useState(false);
  const [resDeleteOpen, setResDeleteOpen] = useState(false);
  const [selectedResId, setSelectedResId] = useState<string | null>(null);
  const [resForm, setResForm] = useState(emptyReservationForm);
  const [resFormErrors, setResFormErrors] = useState<string[]>([]);

  // ─── Leases state ───
  const [leaseSearch, setLeaseSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // ─── KEA state ───
  const [keaReloadOpen, setKeaReloadOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // ═══════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════

  // ─── Subnets ───
  const { data: subnetsData, isLoading: subnetsLoading } = useQuery<DhcpSubnet[]>({
    queryKey: ["dhcp-subnets"],
    queryFn: () => apiFetch<DhcpSubnet[]>("/api/dhcp?section=subnets"),
  });

  // ─── Reservations ───
  const { data: reservationsData, isLoading: resLoading } = useQuery<DhcpReservation[]>({
    queryKey: ["dhcp-reservations"],
    queryFn: () => apiFetch<DhcpReservation[]>("/api/dhcp?section=reservations"),
  });

  // ─── Leases ───
  const { data: leasesData, isLoading: leasesLoading, dataUpdatedAt: leasesUpdatedAt } = useQuery<DhcpLease[]>({
    queryKey: ["dhcp-leases"],
    queryFn: () => apiFetch<DhcpLease[]>("/api/dhcp?section=leases"),
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // ─── KEA Status ───
  const { data: keaStatus, isLoading: keaLoading, dataUpdatedAt: keaUpdatedAt } = useQuery<KeaStatus>({
    queryKey: ["dhcp-kea-status"],
    queryFn: () => apiFetch<KeaStatus>("/api/dhcp?action=kea-status"),
    refetchInterval: 60000,
  });

  // ─── Interfaces (for dropdown) ───
  const { data: interfacesData } = useQuery<{ interfaces?: Array<{ name: string; status: string }> }>({
    queryKey: ["interfaces-list-dhcp"],
    queryFn: () => apiFetch("/api/interfaces"),
  });

  // ─── Captive Portal profiles ───
  const { data: portalProfiles } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ["portal-profiles-dhcp"],
    queryFn: () => apiFetch("/api/hotspot?limit=100"),
  });

  // ═══════════════════════════════════════════════════════════════
  // DERIVED DATA
  // ═══════════════════════════════════════════════════════════════

  const subnets = subnetsData || [];
  const reservations = reservationsData || [];
  const leases = leasesData || [];

  const interfaces = useMemo(() => {
    const list = interfacesData?.interfaces || [];
    return list;
  }, [interfacesData]);

  const portalList = portalProfiles?.items || [];

  // Filtered subnets
  const filteredSubnets = useMemo(() => {
    if (!subnetSearch) return subnets;
    const s = subnetSearch.toLowerCase();
    return subnets.filter(
      (sn) =>
        sn.name.toLowerCase().includes(s) ||
        sn.subnet.toLowerCase().includes(s) ||
        sn.interfaceName.toLowerCase().includes(s) ||
        sn.gateway.toLowerCase().includes(s)
    );
  }, [subnets, subnetSearch]);

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    if (!reservationSearch) return reservations;
    const s = reservationSearch.toLowerCase();
    return reservations.filter(
      (r) =>
        r.macAddress.toLowerCase().includes(s) ||
        r.ipAddress.toLowerCase().includes(s) ||
        r.hostname.toLowerCase().includes(s)
    );
  }, [reservations, reservationSearch]);

  // Filtered leases
  const filteredLeases = useMemo(() => {
    if (!leaseSearch) return leases;
    const s = leaseSearch.toLowerCase();
    return leases.filter(
      (l) =>
        l.ipAddress.toLowerCase().includes(s) ||
        l.macAddress.toLowerCase().includes(s) ||
        l.hostname.toLowerCase().includes(s)
    );
  }, [leases, leaseSearch]);

  // Stats
  const totalActiveLeases = useMemo(() => leases.filter((l) => l.state === "ACTIVE").length, [leases]);
  const totalExpiredLeases = useMemo(() => leases.filter((l) => l.state === "EXPIRED").length, [leases]);
  const totalFreeIPs = useMemo(() => {
    return subnets.reduce((sum, sn) => {
      return sum + calcFreeIPs(sn.subnet, sn.netmask, sn.rangeStart, sn.rangeEnd, sn.activeLeases || 0);
    }, 0);
  }, [subnets]);

  // ═══════════════════════════════════════════════════════════════
  // MUTATIONS
  // ═══════════════════════════════════════════════════════════════

  // Create subnet
  const createSubnetMutation = useMutation({
    mutationFn: (data: typeof emptySubnetForm) =>
      apiFetch("/api/dhcp", {
        method: "POST",
        body: JSON.stringify({ section: "subnets", ...data }),
      }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Subnet created successfully");
      setSubnetAddOpen(false);
      setSubnetForm(emptySubnetForm);
      setAllowedHostInput("");
      queryClient.invalidateQueries({ queryKey: ["dhcp-subnets"] });
    },
    onError: () => toast.error("Failed to create subnet"),
  });

  // Update subnet
  const updateSubnetMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch("/api/dhcp", {
        method: "PUT",
        body: JSON.stringify({ section: "subnets", id, ...data }),
      }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Subnet updated successfully");
      setSubnetEditOpen(false);
      setSelectedSubnetId(null);
      queryClient.invalidateQueries({ queryKey: ["dhcp-subnets"] });
    },
    onError: () => toast.error("Failed to update subnet"),
  });

  // Delete subnet
  const deleteSubnetMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/dhcp?section=subnets&id=${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Subnet deleted successfully");
      setSubnetDeleteOpen(false);
      setSelectedSubnetId(null);
      queryClient.invalidateQueries({ queryKey: ["dhcp-subnets"] });
    },
    onError: () => toast.error("Failed to delete subnet"),
  });

  // Create reservation
  const createResMutation = useMutation({
    mutationFn: (data: typeof emptyReservationForm) =>
      apiFetch("/api/dhcp", {
        method: "POST",
        body: JSON.stringify({ section: "reservations", ...data }),
      }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Reservation created successfully");
      setResAddOpen(false);
      setResForm(emptyReservationForm);
      queryClient.invalidateQueries({ queryKey: ["dhcp-reservations"] });
    },
    onError: () => toast.error("Failed to create reservation"),
  });

  // Update reservation
  const updateResMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch("/api/dhcp", {
        method: "PUT",
        body: JSON.stringify({ section: "reservations", id, ...data }),
      }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Reservation updated successfully");
      setResEditOpen(false);
      setSelectedResId(null);
      queryClient.invalidateQueries({ queryKey: ["dhcp-reservations"] });
    },
    onError: () => toast.error("Failed to update reservation"),
  });

  // Delete reservation
  const deleteResMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/dhcp?section=reservations&id=${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Reservation deleted successfully");
      setResDeleteOpen(false);
      setSelectedResId(null);
      queryClient.invalidateQueries({ queryKey: ["dhcp-reservations"] });
    },
    onError: () => toast.error("Failed to delete reservation"),
  });

  // Reload KEA
  const reloadKeaMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/dhcp", {
        method: "POST",
        body: JSON.stringify({ action: "kea-reload" }),
      }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("KEA config reloaded successfully");
      setKeaReloadOpen(false);
      queryClient.invalidateQueries({ queryKey: ["dhcp-kea-status"] });
      queryClient.invalidateQueries({ queryKey: ["dhcp-leases"] });
    },
    onError: () => toast.error("Failed to reload KEA configuration"),
  });

  // Test KEA connection
  const testKeaMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/dhcp", {
        method: "POST",
        body: JSON.stringify({ action: "kea-test" }),
      }),
    onSuccess: (res) => {
      if (res.success || res.connected) {
        toast.success("KEA connection successful", { description: res.message || "Server is reachable" });
      } else {
        toast.error("KEA connection failed", { description: res.message || "Could not reach server" });
      }
      queryClient.invalidateQueries({ queryKey: ["dhcp-kea-status"] });
    },
    onError: () => toast.error("Failed to test KEA connection"),
  });

  // ═══════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════

  function validateSubnetForm(f: typeof emptySubnetForm): boolean {
    const errors: string[] = [];
    if (!f.name.trim()) errors.push("Subnet name is required");
    if (!f.interfaceName) errors.push("Interface is required");
    if (!f.subnet.trim()) errors.push("Subnet address is required");
    if (!f.netmask.trim()) errors.push("Netmask is required");
    if (!f.rangeStart.trim()) errors.push("Range start is required");
    if (!f.rangeEnd.trim()) errors.push("Range end is required");
    setSubnetFormErrors(errors);
    return errors.length === 0;
  }

  function validateResForm(f: typeof emptyReservationForm): boolean {
    const errors: string[] = [];
    if (!f.subnetId) errors.push("Subnet is required");
    if (!f.macAddress.trim()) errors.push("MAC address is required");
    if (!f.ipAddress.trim()) errors.push("IP address is required");
    setResFormErrors(errors);
    return errors.length === 0;
  }

  function openSubnetEdit(sn: DhcpSubnet) {
    setSelectedSubnetId(sn.id);
    setLeasePreset("custom");
    setSubnetForm({
      name: sn.name,
      interfaceName: sn.interfaceName,
      subnet: sn.subnet,
      netmask: sn.netmask,
      rangeStart: sn.rangeStart,
      rangeEnd: sn.rangeEnd,
      leaseTime: sn.leaseTime,
      gateway: sn.gateway,
      dnsServers: sn.dnsServers,
      domainName: sn.domainName,
      ntpServers: sn.ntpServers,
      winsServer: sn.winsServer,
      allowedHosts: sn.allowedHosts || [],
      captivePortalId: sn.captivePortalId || "",
      enabled: sn.enabled,
    });
    setAllowedHostInput((sn.allowedHosts || []).join(", "));
    setSubnetFormErrors([]);
    setSubnetEditOpen(true);
  }

  function openSubnetDelete(id: string) {
    setSelectedSubnetId(id);
    setSubnetDeleteOpen(true);
  }

  function openResEdit(r: DhcpReservation) {
    setSelectedResId(r.id);
    setResForm({
      subnetId: r.subnetId,
      macAddress: r.macAddress,
      ipAddress: r.ipAddress,
      hostname: r.hostname,
      clientType: r.clientType,
      subscriberId: r.subscriberId || "",
      deviceId: r.deviceId || "",
      description: r.description,
      enabled: r.enabled,
    });
    setResFormErrors([]);
    setResEditOpen(true);
  }

  function openResDelete(id: string) {
    setSelectedResId(id);
    setResDeleteOpen(true);
  }

  function handleLeasePresetChange(value: string) {
    setLeasePreset(value);
    const preset = LEASE_PRESETS.find((p) => p.label === value);
    if (preset) {
      setSubnetForm((prev) => ({ ...prev, leaseTime: preset.value }));
    }
  }

  function addAllowedHost() {
    if (allowedHostInput.trim()) {
      const hosts = allowedHostInput.split(",").map((h) => h.trim()).filter(Boolean);
      setSubnetForm((prev) => ({
        ...prev,
        allowedHosts: [...new Set([...prev.allowedHosts, ...hosts])],
      }));
      setAllowedHostInput("");
    }
  }

  function removeAllowedHost(host: string) {
    setSubnetForm((prev) => ({
      ...prev,
      allowedHosts: prev.allowedHosts.filter((h) => h !== host),
    }));
  }

  function formatConfigJson(config: string | undefined) {
    if (!config) return "{}";
    try {
      return JSON.stringify(JSON.parse(config), null, 2);
    } catch {
      return config;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // LOADING
  // ═══════════════════════════════════════════════════════════════

  if (subnetsLoading && activeTab === "subnets") {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-40" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="skeleton-wave h-20 rounded-lg" />
        <Skeleton className="skeleton-wave h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">DHCP Server</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage DHCP subnets, reservations, active leases, and KEA server status.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              keaStatus?.connected
                ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
            }`}>
              <span className={`h-2 w-2 rounded-full ${keaStatus?.connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              {keaStatus?.connected ? "KEA Connected" : "KEA Disconnected"}
            </div>
          </div>
        </div>

        {/* ─── Tabs ─── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="subnets" className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5" />Subnets
            </TabsTrigger>
            <TabsTrigger value="reservations" className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />Reservations
            </TabsTrigger>
            <TabsTrigger value="leases" className="flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5" />Active Leases
              {totalActiveLeases > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[1.25rem] px-1.5 text-[10px] font-bold rounded-full">
                  {totalActiveLeases}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="kea" className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" />KEA Server
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════
              TAB 1: DHCP SUBNETS
              ═══════════════════════════════════════════════════════ */}
          <TabsContent value="subnets" className="space-y-4">
            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-0 rounded-xl bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/20 ring-1 ring-slate-200/60 hover:scale-[1.02] transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800/60 dark:to-slate-700/40 shadow-sm shadow-slate-500/25">
                      <Network className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{subnets.length}</p>
                      <p className="text-xs text-muted-foreground">Total Subnets</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 ring-1 ring-green-200/60 hover:scale-[1.02] transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-gradient-to-br from-green-200 to-green-300 dark:from-green-800/60 dark:to-green-700/40 shadow-sm shadow-green-500/25">
                      <Wifi className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-green-600">{totalActiveLeases}</p>
                      <p className="text-xs text-muted-foreground">Active Leases</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/20 ring-1 ring-purple-200/60 hover:scale-[1.02] transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-gradient-to-br from-purple-200 to-purple-300 dark:from-purple-800/60 dark:to-purple-700/40 shadow-sm shadow-purple-500/25">
                      <HardDrive className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-purple-600">{reservations.length}</p>
                      <p className="text-xs text-muted-foreground">Total Reservations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 rounded-xl bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-950/30 dark:to-teal-950/20 ring-1 ring-cyan-200/60 hover:scale-[1.02] transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-gradient-to-br from-cyan-200 to-cyan-300 dark:from-cyan-800/60 dark:to-cyan-700/40 shadow-sm shadow-cyan-500/25">
                      <Globe className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-cyan-600">{totalFreeIPs}</p>
                      <p className="text-xs text-muted-foreground">Free IPs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Toolbar */}
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center sm:justify-between">
                  <div className="relative flex-1 w-full sm:max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search subnets..."
                      value={subnetSearch}
                      onChange={(e) => setSubnetSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button
                    onClick={() => {
                      setSubnetForm(emptySubnetForm);
                      setAllowedHostInput("");
                      setSubnetFormErrors([]);
                      setLeasePreset("24 Hours");
                      setSubnetAddOpen(true);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />Add Subnet
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Subnets Table */}
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Interface</TableHead>
                        <TableHead className="text-xs">Subnet / Netmask</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Range</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Gateway</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">DNS</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Lease Time</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Portal</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubnets.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                            {subnetSearch ? "No subnets match your search" : "No subnets found. Click Add Subnet to create one."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredSubnets.map((sn) => (
                          <TableRow
                            key={sn.id}
                            className={`cursor-pointer hover:bg-muted/50 transition-all duration-200 ${
                              sn.enabled ? "border-l-[3px] border-l-green-500" : "border-l-[3px] border-l-gray-400"
                            }`}
                          >
                            <TableCell className="font-medium text-sm">{sn.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] rounded-full px-2">
                                {sn.interfaceName}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {sn.subnet}
                              <span className="text-muted-foreground mx-1">/</span>
                              {sn.netmask}
                            </TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">
                              {sn.rangeStart} – {sn.rangeEnd}
                            </TableCell>
                            <TableCell className="font-mono text-xs hidden lg:table-cell">
                              {sn.gateway || "—"}
                            </TableCell>
                            <TableCell className="text-xs hidden lg:table-cell max-w-[120px] truncate">
                              {sn.dnsServers || "—"}
                            </TableCell>
                            <TableCell className="text-xs hidden xl:table-cell">
                              {formatLeaseTime(sn.leaseTime)}
                            </TableCell>
                            <TableCell className="hidden xl:table-cell">
                              {sn.captivePortalId ? (
                                <Badge variant="secondary" className="text-[10px] rounded-full">
                                  <Globe className="h-2.5 w-2.5 mr-1" />
                                  {sn.captivePortalName || "Linked"}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={`text-[10px] rounded-full px-2 py-0.5 ${
                                  sn.enabled
                                    ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                                }`}
                              >
                                {sn.enabled ? "Active" : "Disabled"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openSubnetEdit(sn)}
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-500 hover:text-red-700"
                                      onClick={() => openSubnetDelete(sn.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete</TooltipContent>
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
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 2: DHCP RESERVATIONS
              ═══════════════════════════════════════════════════════ */}
          <TabsContent value="reservations" className="space-y-4">
            {/* Toolbar */}
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center sm:justify-between">
                  <div className="relative flex-1 w-full sm:max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by MAC, IP, or hostname..."
                      value={reservationSearch}
                      onChange={(e) => setReservationSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button
                    onClick={() => {
                      setResForm(emptyReservationForm);
                      setResFormErrors([]);
                      setResAddOpen(true);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />Add Reservation
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Reservations Table */}
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">MAC Address</TableHead>
                        <TableHead className="text-xs">IP Address</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Hostname</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Client Type</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Subscriber</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Device</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Description</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resLoading ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12">
                            <Skeleton className="h-4 w-48 mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : filteredReservations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                            {reservationSearch ? "No reservations match your search" : "No reservations found. Click Add Reservation to create one."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredReservations.map((r) => (
                          <TableRow
                            key={r.id}
                            className={`cursor-pointer hover:bg-muted/50 transition-all duration-200 ${
                              r.enabled ? "border-l-[3px] border-l-green-500" : "border-l-[3px] border-l-gray-400"
                            }`}
                          >
                            <TableCell className="font-mono text-xs font-medium">{r.macAddress}</TableCell>
                            <TableCell className="font-mono text-xs">{r.ipAddress}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">
                              {r.hostname || "—"}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <Badge
                                className={`text-[10px] rounded-full px-2 py-0.5 ${
                                  CLIENT_TYPE_BADGE[r.clientType] || CLIENT_TYPE_BADGE.DEVICE
                                }`}
                              >
                                {r.clientType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs hidden xl:table-cell">
                              {r.subscriberName || "—"}
                            </TableCell>
                            <TableCell className="text-xs hidden xl:table-cell">
                              {r.deviceName || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden xl:table-cell max-w-[150px] truncate">
                              {r.description || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={`text-[10px] rounded-full px-2 py-0.5 ${
                                  r.enabled
                                    ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                                }`}
                              >
                                {r.enabled ? "Active" : "Disabled"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openResEdit(r)}
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-500 hover:text-red-700"
                                      onClick={() => openResDelete(r.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete</TooltipContent>
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
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 3: ACTIVE LEASES
              ═══════════════════════════════════════════════════════ */}
          <TabsContent value="leases" className="space-y-4">
            {/* Toolbar */}
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center sm:justify-between">
                  <div className="relative flex-1 w-full sm:max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by IP or MAC..."
                      value={leaseSearch}
                      onChange={(e) => setLeaseSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Auto-refresh:</span>
                      <Switch
                        checked={autoRefresh}
                        onCheckedChange={setAutoRefresh}
                        className="scale-90"
                      />
                      <span>{autoRefresh ? "30s" : "Off"}</span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => queryClient.invalidateQueries({ queryKey: ["dhcp-leases"] })}
                          disabled={leasesLoading}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${leasesLoading ? "animate-spin" : ""}`} />
                          Refresh
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh leases</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Leases Table */}
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="text-xs">IP Address</TableHead>
                        <TableHead className="text-xs">MAC Address</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Hostname</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Client ID</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Subnet</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Lease Start</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Lease Expiry</TableHead>
                        <TableHead className="text-xs">State</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Remaining</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leasesLoading ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12">
                            <div className="flex flex-col items-center gap-2">
                              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                              <Skeleton className="h-4 w-48" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredLeases.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-16">
                            <div className="flex flex-col items-center gap-3">
                              <div className="p-4 rounded-full bg-muted">
                                <Server className="h-8 w-8 text-muted-foreground" />
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-medium text-muted-foreground">
                                  Connect to KEA DHCP server to view leases
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Check the KEA Server tab for connection status
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredLeases.map((lease, idx) => (
                          <TableRow key={`${lease.ipAddress}-${lease.macAddress}-${idx}`} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-xs font-medium">{lease.ipAddress}</TableCell>
                            <TableCell className="font-mono text-xs">{lease.macAddress}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">{lease.hostname || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono hidden lg:table-cell max-w-[100px] truncate">
                              {lease.clientId || "—"}
                            </TableCell>
                            <TableCell className="text-xs hidden lg:table-cell">{lease.subnet || "—"}</TableCell>
                            <TableCell className="text-xs hidden xl:table-cell">{formatDateTime(lease.leaseStart)}</TableCell>
                            <TableCell className="text-xs hidden xl:table-cell">{formatDateTime(lease.leaseExpiry)}</TableCell>
                            <TableCell>
                              <Badge
                                className={`text-[10px] rounded-full px-2 py-0.5 ${
                                  LEASE_STATE_BADGE[lease.state] || LEASE_STATE_BADGE.RELEASED
                                }`}
                              >
                                {lease.state}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs hidden md:table-cell text-muted-foreground">
                              {lease.remaining || "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filteredLeases.length > 0 && (
                  <div className="px-4 py-3 border-t text-xs text-muted-foreground flex items-center justify-between">
                    <span>{filteredLeases.length} lease(s) found</span>
                    {leasesUpdatedAt && (
                      <span>Last updated: {new Date(leasesUpdatedAt).toLocaleTimeString()}</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 4: KEA SERVER STATUS
              ═══════════════════════════════════════════════════════ */}
          <TabsContent value="kea" className="space-y-4">
            {keaLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
              </div>
            ) : (
              <>
                {/* Connection Status */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Connection Status
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testKeaMutation.mutate()}
                          disabled={testKeaMutation.isPending}
                        >
                          <Zap className="h-3.5 w-3.5 mr-1.5" />
                          Test Connection
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-amber-600 hover:text-amber-700 border-amber-300"
                          onClick={() => setKeaReloadOpen(true)}
                          disabled={reloadKeaMutation.isPending}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reloadKeaMutation.isPending ? "animate-spin" : ""}`} />
                          Reload Config
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">KEA REST API URL</p>
                        <p className="text-sm font-mono">{keaStatus?.url || "Not configured"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Connection</p>
                        <div className="flex items-center gap-2">
                          {keaStatus?.connected ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />Connected
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 text-xs">
                              <XCircle className="h-3 w-3 mr-1" />Disconnected
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Server Version</p>
                        <p className="text-sm font-mono">{keaStatus?.version || "Unknown"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Uptime</p>
                        <p className="text-sm">{formatUptime(keaStatus?.uptime || 0)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Server Stats */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Server Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="border-0 rounded-xl bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/20 ring-1 ring-slate-200/60">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold tabular-nums">{keaStatus?.totalSubnets ?? subnets.length}</p>
                          <p className="text-xs text-muted-foreground">Subnets Configured</p>
                        </CardContent>
                      </Card>
                      <Card className="border-0 rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/20 ring-1 ring-blue-200/60">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold tabular-nums text-blue-600">{keaStatus?.totalLeases ?? leases.length}</p>
                          <p className="text-xs text-muted-foreground">Total Leases</p>
                        </CardContent>
                      </Card>
                      <Card className="border-0 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 ring-1 ring-green-200/60">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold tabular-nums text-green-600">{keaStatus?.activeLeases ?? totalActiveLeases}</p>
                          <p className="text-xs text-muted-foreground">Active Leases</p>
                        </CardContent>
                      </Card>
                      <Card className="border-0 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20 ring-1 ring-amber-200/60">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold tabular-nums text-amber-600">{keaStatus?.expiredLeases ?? totalExpiredLeases}</p>
                          <p className="text-xs text-muted-foreground">Expired Leases</p>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>

                {/* Config Preview */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Info className="h-4 w-4" />
                        KEA Configuration Preview
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowConfig(!showConfig)}
                      >
                        {showConfig ? (
                          <><ChevronDown className="h-3.5 w-3.5 mr-1" />Hide</>
                        ) : (
                          <><ChevronRight className="h-3.5 w-3.5 mr-1" />Show</>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  {showConfig && (
                    <CardContent>
                      <div className="relative">
                        <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs font-mono overflow-auto max-h-96">
                          {formatConfigJson(keaStatus?.config)}
                        </pre>
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute top-2 right-2 h-7"
                          onClick={() => {
                            navigator.clipboard.writeText(formatConfigJson(keaStatus?.config));
                            toast.success("Config copied to clipboard");
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />Copy
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* ═══════════════════════════════════════════════════════
            DIALOGS
            ═══════════════════════════════════════════════════════ */}

        {/* ─── Add Subnet Dialog ─── */}
        <Dialog open={subnetAddOpen} onOpenChange={setSubnetAddOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add DHCP Subnet</DialogTitle>
              <DialogDescription>
                Create a new DHCP subnet configuration. All fields with * are required.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {subnetFormErrors.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{subnetFormErrors.join(", ")}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    placeholder="e.g., Office LAN"
                    value={subnetForm.name}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Interface *</Label>
                  <Select
                    value={subnetForm.interfaceName}
                    onValueChange={(v) => setSubnetForm((p) => ({ ...p, interfaceName: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select interface" />
                    </SelectTrigger>
                    <SelectContent>
                      {interfaces.map((intf) => (
                        <SelectItem key={intf.name} value={intf.name}>
                          {intf.name}
                          <span className="text-muted-foreground ml-1">({intf.status})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subnet Address *</Label>
                  <Input
                    placeholder="e.g., 10.0.0.0"
                    value={subnetForm.subnet}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, subnet: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Netmask *</Label>
                  <Input
                    placeholder="e.g., 255.255.255.0"
                    value={subnetForm.netmask}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, netmask: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Range Start *</Label>
                  <Input
                    placeholder="e.g., 10.0.0.100"
                    value={subnetForm.rangeStart}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, rangeStart: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Range End *</Label>
                  <Input
                    placeholder="e.g., 10.0.0.250"
                    value={subnetForm.rangeEnd}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, rangeEnd: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Lease Time</Label>
                  <div className="flex gap-2">
                    <Select value={leasePreset} onValueChange={handleLeasePresetChange}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEASE_PRESETS.map((p) => (
                          <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>
                        ))}
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Seconds"
                      value={subnetForm.leaseTime}
                      onChange={(e) => {
                        setLeasePreset("custom");
                        setSubnetForm((p) => ({ ...p, leaseTime: Number(e.target.value) }));
                      }}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Gateway IP</Label>
                  <Input
                    placeholder="e.g., 10.0.0.1"
                    value={subnetForm.gateway}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, gateway: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>DNS Servers</Label>
                  <Input
                    placeholder="e.g., 8.8.8.8, 8.8.4.4"
                    value={subnetForm.dnsServers}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, dnsServers: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Domain Name</Label>
                  <Input
                    placeholder="e.g., local.lan"
                    value={subnetForm.domainName}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, domainName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>NTP Servers</Label>
                  <Input
                    placeholder="e.g., pool.ntp.org"
                    value={subnetForm.ntpServers}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, ntpServers: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>WINS Server</Label>
                  <Input
                    placeholder="e.g., 10.0.0.1"
                    value={subnetForm.winsServer}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, winsServer: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Allowed Hosts (Walled Garden)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter hostname/IP and press Add"
                      value={allowedHostInput}
                      onChange={(e) => setAllowedHostInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addAllowedHost(); }
                      }}
                    />
                    <Button variant="outline" size="sm" onClick={addAllowedHost}>
                      Add
                    </Button>
                  </div>
                  {subnetForm.allowedHosts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {subnetForm.allowedHosts.map((host) => (
                        <Badge key={host} variant="secondary" className="text-xs rounded-full px-2 py-1">
                          {host}
                          <button
                            className="ml-1 text-muted-foreground hover:text-foreground"
                            onClick={() => removeAllowedHost(host)}
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Captive Portal</Label>
                  <Select
                    value={subnetForm.captivePortalId}
                    onValueChange={(v) => setSubnetForm((p) => ({ ...p, captivePortalId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {portalList.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    checked={subnetForm.enabled}
                    onCheckedChange={(v) => setSubnetForm((p) => ({ ...p, enabled: v }))}
                  />
                  <Label>Enable this subnet</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubnetAddOpen(false)}>Cancel</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={createSubnetMutation.isPending}
                onClick={() => {
                  if (validateSubnetForm(subnetForm)) {
                    createSubnetMutation.mutate({
                      ...subnetForm,
                      captivePortalId: subnetForm.captivePortalId === "none" ? "" : subnetForm.captivePortalId,
                    });
                  }
                }}
              >
                {createSubnetMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                ) : (
                  <><Plus className="h-4 w-4 mr-2" />Create Subnet</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Edit Subnet Dialog ─── */}
        <Dialog open={subnetEditOpen} onOpenChange={setSubnetEditOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit DHCP Subnet</DialogTitle>
              <DialogDescription>Update subnet configuration.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {subnetFormErrors.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{subnetFormErrors.join(", ")}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={subnetForm.name} onChange={(e) => setSubnetForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Interface *</Label>
                  <Select value={subnetForm.interfaceName} onValueChange={(v) => setSubnetForm((p) => ({ ...p, interfaceName: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select interface" /></SelectTrigger>
                    <SelectContent>
                      {interfaces.map((intf) => (
                        <SelectItem key={intf.name} value={intf.name}>{intf.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subnet *</Label>
                  <Input value={subnetForm.subnet} onChange={(e) => setSubnetForm((p) => ({ ...p, subnet: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Netmask *</Label>
                  <Input value={subnetForm.netmask} onChange={(e) => setSubnetForm((p) => ({ ...p, netmask: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Range Start *</Label>
                  <Input value={subnetForm.rangeStart} onChange={(e) => setSubnetForm((p) => ({ ...p, rangeStart: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Range End *</Label>
                  <Input value={subnetForm.rangeEnd} onChange={(e) => setSubnetForm((p) => ({ ...p, rangeEnd: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Lease Time (seconds)</Label>
                  <Input
                    type="number"
                    value={subnetForm.leaseTime}
                    onChange={(e) => setSubnetForm((p) => ({ ...p, leaseTime: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gateway</Label>
                  <Input value={subnetForm.gateway} onChange={(e) => setSubnetForm((p) => ({ ...p, gateway: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>DNS Servers</Label>
                  <Input value={subnetForm.dnsServers} onChange={(e) => setSubnetForm((p) => ({ ...p, dnsServers: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Domain Name</Label>
                  <Input value={subnetForm.domainName} onChange={(e) => setSubnetForm((p) => ({ ...p, domainName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>NTP Servers</Label>
                  <Input value={subnetForm.ntpServers} onChange={(e) => setSubnetForm((p) => ({ ...p, ntpServers: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>WINS Server</Label>
                  <Input value={subnetForm.winsServer} onChange={(e) => setSubnetForm((p) => ({ ...p, winsServer: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Allowed Hosts</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add hostname/IP"
                      value={allowedHostInput}
                      onChange={(e) => setAllowedHostInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAllowedHost(); } }}
                    />
                    <Button variant="outline" size="sm" onClick={addAllowedHost}>Add</Button>
                  </div>
                  {subnetForm.allowedHosts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {subnetForm.allowedHosts.map((host) => (
                        <Badge key={host} variant="secondary" className="text-xs rounded-full px-2 py-1">
                          {host}
                          <button className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => removeAllowedHost(host)}>
                            <XCircle className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Captive Portal</Label>
                  <Select value={subnetForm.captivePortalId || "none"} onValueChange={(v) => setSubnetForm((p) => ({ ...p, captivePortalId: v }))}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {portalList.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch checked={subnetForm.enabled} onCheckedChange={(v) => setSubnetForm((p) => ({ ...p, enabled: v }))} />
                  <Label>Enable this subnet</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubnetEditOpen(false)}>Cancel</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={updateSubnetMutation.isPending}
                onClick={() => {
                  if (validateSubnetForm(subnetForm) && selectedSubnetId) {
                    updateSubnetMutation.mutate({
                      id: selectedSubnetId,
                      data: {
                        ...subnetForm,
                        captivePortalId: subnetForm.captivePortalId === "none" ? "" : subnetForm.captivePortalId,
                      },
                    });
                  }
                }}
              >
                {updateSubnetMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><CheckCircle className="h-4 w-4 mr-2" />Update Subnet</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Delete Subnet Confirmation ─── */}
        <AlertDialog open={subnetDeleteOpen} onOpenChange={setSubnetDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Subnet</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this subnet? This action cannot be undone. All associated reservations and lease data may be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  if (selectedSubnetId) deleteSubnetMutation.mutate(selectedSubnetId);
                }}
                disabled={deleteSubnetMutation.isPending}
              >
                {deleteSubnetMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-2" />Delete</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ─── Add Reservation Dialog ─── */}
        <Dialog open={resAddOpen} onOpenChange={setResAddOpen}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add DHCP Reservation</DialogTitle>
              <DialogDescription>Create a static DHCP reservation for a device.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {resFormErrors.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{resFormErrors.join(", ")}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Subnet *</Label>
                  <Select value={resForm.subnetId} onValueChange={(v) => setResForm((p) => ({ ...p, subnetId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select subnet" /></SelectTrigger>
                    <SelectContent>
                      {subnets.map((sn) => (
                        <SelectItem key={sn.id} value={sn.id}>{sn.name} ({sn.subnet})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>MAC Address *</Label>
                  <Input
                    placeholder="AA:BB:CC:DD:EE:FF"
                    value={resForm.macAddress}
                    onChange={(e) => setResForm((p) => ({ ...p, macAddress: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>IP Address *</Label>
                  <Input
                    placeholder="e.g., 10.0.0.50"
                    value={resForm.ipAddress}
                    onChange={(e) => setResForm((p) => ({ ...p, ipAddress: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hostname</Label>
                  <Input
                    placeholder="e.g., server-01"
                    value={resForm.hostname}
                    onChange={(e) => setResForm((p) => ({ ...p, hostname: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Type</Label>
                  <Select value={resForm.clientType} onValueChange={(v) => setResForm((p) => ({ ...p, clientType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map((ct) => (
                        <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Optional description for this reservation..."
                    value={resForm.description}
                    onChange={(e) => setResForm((p) => ({ ...p, description: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    checked={resForm.enabled}
                    onCheckedChange={(v) => setResForm((p) => ({ ...p, enabled: v }))}
                  />
                  <Label>Enable this reservation</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResAddOpen(false)}>Cancel</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={createResMutation.isPending}
                onClick={() => {
                  if (validateResForm(resForm)) createResMutation.mutate(resForm);
                }}
              >
                {createResMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                ) : (
                  <><Plus className="h-4 w-4 mr-2" />Create Reservation</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Edit Reservation Dialog ─── */}
        <Dialog open={resEditOpen} onOpenChange={setResEditOpen}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit DHCP Reservation</DialogTitle>
              <DialogDescription>Update static DHCP reservation.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {resFormErrors.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{resFormErrors.join(", ")}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Subnet *</Label>
                  <Select value={resForm.subnetId} onValueChange={(v) => setResForm((p) => ({ ...p, subnetId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select subnet" /></SelectTrigger>
                    <SelectContent>
                      {subnets.map((sn) => (
                        <SelectItem key={sn.id} value={sn.id}>{sn.name} ({sn.subnet})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>MAC Address *</Label>
                  <Input value={resForm.macAddress} onChange={(e) => setResForm((p) => ({ ...p, macAddress: e.target.value.toUpperCase() }))} />
                </div>
                <div className="space-y-2">
                  <Label>IP Address *</Label>
                  <Input value={resForm.ipAddress} onChange={(e) => setResForm((p) => ({ ...p, ipAddress: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Hostname</Label>
                  <Input value={resForm.hostname} onChange={(e) => setResForm((p) => ({ ...p, hostname: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Client Type</Label>
                  <Select value={resForm.clientType} onValueChange={(v) => setResForm((p) => ({ ...p, clientType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map((ct) => (
                        <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    value={resForm.description}
                    onChange={(e) => setResForm((p) => ({ ...p, description: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch checked={resForm.enabled} onCheckedChange={(v) => setResForm((p) => ({ ...p, enabled: v }))} />
                  <Label>Enable this reservation</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResEditOpen(false)}>Cancel</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={updateResMutation.isPending}
                onClick={() => {
                  if (validateResForm(resForm) && selectedResId) {
                    updateResMutation.mutate({ id: selectedResId, data: resForm });
                  }
                }}
              >
                {updateResMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><CheckCircle className="h-4 w-4 mr-2" />Update</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Delete Reservation Confirmation ─── */}
        <AlertDialog open={resDeleteOpen} onOpenChange={setResDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Reservation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this DHCP reservation? The device will obtain an address dynamically after deletion.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  if (selectedResId) deleteResMutation.mutate(selectedResId);
                }}
                disabled={deleteResMutation.isPending}
              >
                {deleteResMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-2" />Delete</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ─── KEA Reload Confirmation ─── */}
        <AlertDialog open={keaReloadOpen} onOpenChange={setKeaReloadOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Reload KEA Configuration
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will reload the KEA DHCP server configuration. Active leases may be briefly disrupted. Are you sure you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => reloadKeaMutation.mutate()}
                disabled={reloadKeaMutation.isPending}
              >
                {reloadKeaMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Reloading...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" />Reload Now</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

// Activity icon used inline
function Activity({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  );
}
