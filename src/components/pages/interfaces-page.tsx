"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Network, Wifi, ArrowUpDown, Settings, Plus, Trash2, Edit,
  Power, PowerOff, RefreshCw, Shield, Server, Layers, Link, Unlink,
  Loader2, Search, X, ChevronDown, Activity, Globe, Save, Eye, Route,
  Copy, MinusCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useModuleStore } from "@/store/module-store";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────
interface PhysicalInterface {
  name: string;
  type: string;
  role: string;
  mac: string;
  ipv4: string;
  secondaryIps?: string[];
  ipv6: string;
  speed: string;
  carrier: boolean;
  txBytes: number;
  rxBytes: number;
  status: string;
  enabled: boolean;
  mtu?: number;
}

interface VlanInterface {
  name: string;
  parent: string;
  vlanId: number;
  ipv4: string;
  secondaryIps: string[];
  ipv6: string;
  status: string;
}

interface BridgeInterface {
  name: string;
  members: string[];
  ipv4: string;
  secondaryIps: string[];
  ipv6: string;
  status: string;
}

interface BondInterface {
  name: string;
  mode: string;
  members: string[];
  ipv4: string;
  secondaryIps: string[];
  ipv6: string;
  status: string;
}

interface GatewayConfig {
  gatewayMode: string;
  defaultGateway: string;
  defaultGateway6: string;
  dnsForwarders: string;
  enableDnsCache: boolean;
  dhcpType: string;
  dhcpEnabled: boolean;
  dhcpUrl: string;
  dnsType: string;
  dnsEnabled: boolean;
  captivePortalEnabled: boolean;
  captivePortalHttpPort: number;
  captivePortalHttps: boolean;
  tcEnabled: boolean;
  tcDefaultClass: string;
  tcCleanupOnLogout: boolean;
  natEnabled: boolean;
  natMode: string;
  nftablesEnabled: boolean;
  nftablesTableName: string;
  natLoggingEnabled: boolean;
  natLoggingRetentionDays: number;
  radiusInterimUpdate: number;
  radiusAccountingEnabled: boolean;
  arpProtection: boolean;
  dhcpSnooping: boolean;
  clientIsolation: boolean;
  concurrentSessionsEnforce: boolean;
  concurrentSessionsAction: string;
}

interface RouteEntry {
  id: string;
  destination: string;
  gateway: string;
  interface: string;
  metric: number;
  scope: string;
  protocol: string;
  type: string;
  flags: string[];
  pref?: string;
}

interface RoutesResponse {
  routes: RouteEntry[];
  defaultRoutes: RouteEntry[];
  staticRoutes: RouteEntry[];
  totalRoutes: number;
  totalDefault: number;
  totalStatic: number;
}

interface InterfacesResponse {
  interfaces: PhysicalInterface[];
  vlans: VlanInterface[];
  bridges: BridgeInterface[];
  bonds: BondInterface[];
  gatewayConfig: GatewayConfig;
  stats: {
    totalInterfaces: number;
    wanLinks: number;
    lanLinks: number;
    vlans: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function getRoleBadge(role: string) {
  switch (role) {
    case "WAN":
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold">WAN</Badge>;
    case "LAN":
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold">LAN</Badge>;
    default:
      return <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold">UNASSIGNED</Badge>;
  }
}

function getStatusDot(carrier: boolean | undefined, status?: string) {
  const isUp = carrier === true || status === "UP" || status === "up" || status === "RUNNING";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
      isUp
        ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
        : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isUp ? "bg-green-500" : "bg-red-500"} ${!isUp ? "animate-pulse" : ""}`} />
      {isUp ? "UP" : "DOWN"}
    </span>
  );
}

function getRowBorderColor(role: string) {
  switch (role) {
    case "WAN": return "border-l-[3px] border-l-blue-500";
    case "LAN": return "border-l-[3px] border-l-green-500";
    default: return "border-l-[3px] border-l-gray-300 dark:border-l-gray-600";
  }
}

// ─── Component ────────────────────────────────────────────────────
export default function InterfacesPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  const [tab, setTab] = useState("physical");
  const [search, setSearch] = useState("");

  // Dialog states
  const [editIpOpen, setEditIpOpen] = useState(false);
  const [editIpTarget, setEditIpTarget] = useState<PhysicalInterface | null>(null);
  const [editIpForm, setEditIpForm] = useState({ ipv4: "", ipv6: "" });

  const [vlanDialogOpen, setVlanDialogOpen] = useState(false);
  const [vlanForm, setVlanForm] = useState({ parent: "", vlanId: "", ipv4: "", ipv6: "" });

  const [bridgeDialogOpen, setBridgeDialogOpen] = useState(false);
  const [bridgeForm, setBridgeForm] = useState({ name: "", members: [] as string[], ipv6: "" });

  const [bondDialogOpen, setBondDialogOpen] = useState(false);
  const [bondForm, setBondForm] = useState({ name: "", mode: "802.3ad", members: [] as string[], ipv6: "" });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; type: string } | null>(null);

  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [routeForm, setRouteForm] = useState({ destination: "", gateway: "", metric: "", interface: "" });
  const [deleteRouteDialogOpen, setDeleteRouteDialogOpen] = useState(false);
  const [deleteRouteTarget, setDeleteRouteTarget] = useState<RouteEntry | null>(null);

  // Alias / Secondary IP dialog
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [aliasTarget, setAliasTarget] = useState<{ name: string; type: string } | null>(null);
  const [aliasIpForm, setAliasIpForm] = useState("");
  const [deleteAliasDialogOpen, setDeleteAliasDialogOpen] = useState(false);
  const [deleteAliasTarget, setDeleteAliasTarget] = useState<{ name: string; address: string } | null>(null);

  // ─── Data Fetching ───
  const { data, isLoading, isFetching } = useQuery<InterfacesResponse>({
    queryKey: ["interfaces"],
    queryFn: () => apiFetch<InterfacesResponse>("/api/interfaces"),
    refetchInterval: 30000,
  });

  const interfaces = data?.interfaces || [];
  const vlans = data?.vlans || [];
  const bridges = data?.bridges || [];
  const bonds = data?.bonds || [];
  const gatewayConfig = data?.gatewayConfig || null;
  const stats = data?.stats || { totalInterfaces: 0, wanLinks: 0, lanLinks: 0, vlans: 0 };

  // Gateway config local state
  const [gcForm, setGcForm] = useState<GatewayConfig | null>(null);
  if (gatewayConfig && !gcForm) setGcForm(gatewayConfig);
  if (gatewayConfig && gcForm && JSON.stringify(gatewayConfig) !== JSON.stringify(gcForm)) {
    setGcForm(gatewayConfig);
  }

  // Filtered physical interfaces
  const filteredInterfaces = interfaces.filter((iface) =>
    !search || iface.name.toLowerCase().includes(search.toLowerCase()) ||
    iface.mac.toLowerCase().includes(search.toLowerCase()) ||
    iface.ipv4.toLowerCase().includes(search.toLowerCase())
  );

  // ─── Mutations ───
  const updateRoleMutation = useMutation({
    mutationFn: ({ name, role }: { name: string; role: string }) =>
      apiFetch("/api/interfaces", {
        method: "PUT",
        body: JSON.stringify({ action: "set-role", name, role }),
      }),
    onSuccess: () => {
      toast.success("Interface role updated");
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Failed to update role: " + String(err)),
  });

  const toggleInterfaceMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      apiFetch("/api/interfaces", {
        method: "PUT",
        body: JSON.stringify({ action: "set-enabled", name, enabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Failed to toggle interface: " + String(err)),
  });

  const interfaceActionMutation = useMutation({
    mutationFn: ({ action, name }: { action: string; name: string }) =>
      apiFetch("/api/interfaces", {
        method: "PUT",
        body: JSON.stringify({ action, name }),
      }),
    onSuccess: (_, variables) => {
      toast.success(`${variables.action.replace(/-/g, " ")} completed`);
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Action failed: " + String(err)),
  });

  const saveIpMutation = useMutation({
    mutationFn: ({ name, ipv4, ipv6 }: { name: string; ipv4: string; ipv6: string }) =>
      apiFetch("/api/interfaces", {
        method: "PUT",
        body: JSON.stringify({ action: "configure-ip", name, ipv4, ipv6 }),
      }),
    onSuccess: () => {
      toast.success("IP configuration saved");
      setEditIpOpen(false);
      setEditIpTarget(null);
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Failed to save IP config: " + String(err)),
  });

  const createVlanMutation = useMutation({
    mutationFn: (payload: { parent: string; vlanId: number; ipv4?: string }) =>
      apiFetch("/api/interfaces", {
        method: "POST",
        body: JSON.stringify({ action: "create-vlan", ...payload }),
      }),
    onSuccess: () => {
      toast.success("VLAN interface created");
      setVlanDialogOpen(false);
      setVlanForm({ parent: "", vlanId: "", ipv4: "", ipv6: "" });
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Failed to create VLAN: " + String(err)),
  });

  const createBridgeMutation = useMutation({
    mutationFn: (payload: { name: string; members: string[] }) =>
      apiFetch("/api/interfaces", {
        method: "POST",
        body: JSON.stringify({ action: "create-bridge", ...payload }),
      }),
    onSuccess: () => {
      toast.success("Bridge created");
      setBridgeDialogOpen(false);
      setBridgeForm({ name: "", members: [], ipv6: "" });
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Failed to create bridge: " + String(err)),
  });

  const createBondMutation = useMutation({
    mutationFn: (payload: { name: string; mode: string; members: string[] }) =>
      apiFetch("/api/interfaces", {
        method: "POST",
        body: JSON.stringify({ action: "create-bond", ...payload }),
      }),
    onSuccess: () => {
      toast.success("Bond created");
      setBondDialogOpen(false);
      setBondForm({ name: "", mode: "802.3ad", members: [], ipv6: "" });
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Failed to create bond: " + String(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ name, type }: { name: string; type: string }) =>
      apiFetch(`/api/interfaces?path=/${type === "VLAN" ? "vlans" : type === "BRIDGE" ? "bridges" : "bonds"}&name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success(`${deleteTarget?.type} "${deleteTarget?.name}" deleted`);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Delete failed: " + String(err)),
  });

  const saveGatewayConfigMutation = useMutation({
    mutationFn: (config: GatewayConfig) =>
      apiFetch("/api/interfaces", {
        method: "PUT",
        body: JSON.stringify({ path: "/gateway-config", ...config }),
      }),
    onSuccess: () => {
      toast.success("Gateway configuration saved");
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Failed to save gateway config: " + String(err)),
  });

  // ─── Routes Data & Mutations ───
  const { data: routesData, isLoading: routesLoading } = useQuery<RoutesResponse>({
    queryKey: ["routes"],
    queryFn: () => apiFetch<RoutesResponse>("/api/routes"),
    refetchInterval: 30000,
  });

  const defaultRoutes = routesData?.defaultRoutes || [];
  const staticRoutes = routesData?.staticRoutes || [];

  const addRouteMutation = useMutation({
    mutationFn: (payload: { destination: string; gateway: string; metric?: number; interface?: string }) =>
      apiFetch("/api/routes", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Route added successfully");
      setRouteDialogOpen(false);
      setRouteForm({ destination: "", gateway: "", metric: "", interface: "" });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
    },
    onError: (err) => toast.error("Failed to add route: " + String(err)),
  });

  const deleteRouteMutation = useMutation({
    mutationFn: (route: RouteEntry) =>
      apiFetch("/api/routes", {
        method: "DELETE",
        body: JSON.stringify({
          destination: route.destination.replace(" (Default)", "").replace(" (IPv6 default)", ""),
          gateway: route.gateway,
          interface: route.interface,
          metric: route.metric,
        }),
      }),
    onSuccess: () => {
      toast.success("Route deleted successfully");
      setDeleteRouteDialogOpen(false);
      setDeleteRouteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["routes"] });
    },
    onError: (err) => toast.error("Failed to delete route: " + String(err)),
  });

  // ─── Alias IP Mutations ───
  const addAliasIpMutation = useMutation({
    mutationFn: ({ name, address }: { name: string; address: string }) =>
      apiFetch("/api/interfaces", {
        method: "PUT",
        body: JSON.stringify({ action: "add-secondary-ip", name, address }),
      }),
    onSuccess: () => {
      toast.success("Secondary IP added successfully");
      setAliasDialogOpen(false);
      setAliasTarget(null);
      setAliasIpForm("");
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Failed to add secondary IP: " + String(err)),
  });

  const removeAliasIpMutation = useMutation({
    mutationFn: ({ name, address }: { name: string; address: string }) =>
      apiFetch("/api/interfaces", {
        method: "PUT",
        body: JSON.stringify({ action: "remove-secondary-ip", name, address }),
      }),
    onSuccess: () => {
      toast.success("Secondary IP removed successfully");
      setDeleteAliasDialogOpen(false);
      setDeleteAliasTarget(null);
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
    },
    onError: (err) => toast.error("Failed to remove secondary IP: " + String(err)),
  });

  // ─── Handlers ───
  function openEditIp(iface: PhysicalInterface) {
    setEditIpTarget(iface);
    setEditIpForm({ ipv4: iface.ipv4 || "", ipv6: iface.ipv6 || "" });
    setEditIpOpen(true);
  }

  function openDelete(name: string, type: string) {
    setDeleteTarget({ name, type });
    setDeleteDialogOpen(true);
  }

  function toggleMember(member: string, formMembers: string[], setForm: React.Dispatch<React.SetStateAction<string[]>>) {
    setForm((prev) => prev.includes(member) ? prev.filter((m) => m !== member) : [...prev, member]);
  }

  function openAliasDialog(name: string, type: string) {
    setAliasTarget({ name, type });
    setAliasIpForm("");
    setAliasDialogOpen(true);
  }

  // ─── Loading ───
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="skeleton-wave h-20 rounded-lg" />
        <Skeleton className="skeleton-wave h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Interfaces</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage physical interfaces, VLANs, bridges, bonds, and gateway configuration.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["interfaces"] })}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 rounded-xl bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/20 ring-1 ring-slate-200/60 hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800/60 dark:to-slate-700/40 shadow-sm shadow-slate-500/25">
                <Network className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{stats.totalInterfaces}</p>
                <p className="text-xs text-muted-foreground">Total Interfaces</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/20 ring-1 ring-blue-200/60 hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-gradient-to-br from-blue-200 to-blue-300 dark:from-blue-800/60 dark:to-blue-700/40 shadow-sm shadow-blue-500/25">
                <Globe className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-blue-600">{stats.wanLinks}</p>
                <p className="text-xs text-muted-foreground">WAN Links</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 ring-1 ring-green-200/60 hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-gradient-to-br from-green-200 to-green-300 dark:from-green-800/60 dark:to-green-700/40 shadow-sm shadow-green-500/25">
                <Layers className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-green-600">{stats.lanLinks}</p>
                <p className="text-xs text-muted-foreground">LAN Links</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20 ring-1 ring-amber-200/60 hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-800/60 dark:to-amber-700/40 shadow-sm shadow-amber-500/25">
                <Wifi className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-amber-600">{stats.vlans}</p>
                <p className="text-xs text-muted-foreground">VLANs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="physical">
            <Network className="h-4 w-4 mr-1.5 hidden sm:inline" />Physical
          </TabsTrigger>
          <TabsTrigger value="vlan">
            <Layers className="h-4 w-4 mr-1.5 hidden sm:inline" />VLANs
          </TabsTrigger>
          <TabsTrigger value="bridge">
            <Link className="h-4 w-4 mr-1.5 hidden sm:inline" />Bridges
          </TabsTrigger>
          <TabsTrigger value="bond">
            <ArrowUpDown className="h-4 w-4 mr-1.5 hidden sm:inline" />Bonds
          </TabsTrigger>
          <TabsTrigger value="gateway">
            <Settings className="h-4 w-4 mr-1.5 hidden sm:inline" />Gateway Config
          </TabsTrigger>
          <TabsTrigger value="routes">
            <Route className="h-4 w-4 mr-1.5 hidden sm:inline" />Static Routes
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════ TAB 1: Physical Interfaces ═══════════════════ */}
        <TabsContent value="physical">
          <Card className="border-border/50 shadow-sm rounded-xl hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-400 to-blue-500 text-white shadow-sm">
                    <Network className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">Physical Interfaces</CardTitle>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search interfaces..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Role</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">MAC</TableHead>
                      <TableHead className="text-xs">IPv4 / Alias IPs</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">IPv6</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Speed</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">Carrier</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">TX / RX</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInterfaces.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-12">
                          <Network className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                          <p className="text-sm font-medium text-muted-foreground">{search ? "No interfaces match your search" : "No physical interfaces discovered"}</p>
                          <p className="text-xs text-muted-foreground mt-1">Check network connections or try a different search</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInterfaces.map((iface) => (
                        <TableRow key={iface.name} className={`${getRowBorderColor(iface.role)} hover:bg-muted/50 transition-colors`}>
                          <TableCell className="font-mono text-sm font-medium">{iface.name}</TableCell>
                          <TableCell>
                            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{iface.type || "eth"}</span>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={iface.role}
                              onValueChange={(v) => updateRoleMutation.mutate({ name: iface.name, role: v })}
                            >
                              <SelectTrigger className="w-28 h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="UNASSIGNED">UNASSIGNED</SelectItem>
                                <SelectItem value="WAN">WAN</SelectItem>
                                <SelectItem value="LAN">LAN</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground hidden md:table-cell">
                            {iface.mac || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-mono text-xs font-medium">{iface.ipv4 || "—"}</div>
                              {(iface.secondaryIps || []).map((ip) => (
                                <div key={ip} className="flex items-center gap-1">
                                  <span className="font-mono text-[11px] text-muted-foreground">{ip}</span>
                                  <button
                                    className="text-red-400 hover:text-red-600 transition-colors"
                                    onClick={() => { setDeleteAliasTarget({ name: iface.name, address: ip }); setDeleteAliasDialogOpen(true); }}
                                    title="Remove alias"
                                  >
                                    <MinusCircle className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground hidden lg:table-cell truncate max-w-[180px]">
                            {iface.ipv6 || "—"}
                          </TableCell>
                          <TableCell className="text-xs hidden md:table-cell">{iface.speed || "—"}</TableCell>
                          <TableCell className="hidden sm:table-cell">{getStatusDot(iface.carrier, iface.status)}</TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <div className="text-xs space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                <span className="text-green-600">↑ {formatBytes(iface.txBytes || 0)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                <span className="text-blue-600">↓ {formatBytes(iface.rxBytes || 0)}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={iface.enabled !== false}
                                onCheckedChange={(checked) =>
                                  toggleInterfaceMutation.mutate({ name: iface.name, enabled: checked })
                                }
                                className="scale-75"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEditIp(iface)}
                                title="Configure IP"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                                onClick={() => openAliasDialog(iface.name, iface.type)}
                                title="Add Alias IP"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                                onClick={() => interfaceActionMutation.mutate({ action: "bring-up", name: iface.name })}
                                title="Bring Up"
                              >
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => interfaceActionMutation.mutate({ action: "bring-down", name: iface.name })}
                                title="Bring Down"
                              >
                                <PowerOff className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                                onClick={() => interfaceActionMutation.mutate({ action: "flush-ips", name: iface.name })}
                                title="Flush IPs"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
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

        {/* ═══════════════════ TAB 2: VLAN Interfaces ═══════════════════ */}
        <TabsContent value="vlan">
          <Card className="border-border/50 shadow-sm rounded-xl hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm">
                    <Layers className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">VLAN Interfaces</CardTitle>
                </div>
                <Button
                  size="sm"
                  onClick={() => setVlanDialogOpen(true)}
                  className="bg-destructive hover:bg-destructive/90 text-white"
                >
                  <Plus className="h-4 w-4 mr-1.5" />Create VLAN
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Parent</TableHead>
                      <TableHead className="text-xs">VLAN ID</TableHead>
                      <TableHead className="text-xs">IPv4 / Alias IPs</TableHead>
                      {isModuleEnabled("ipv6") && <TableHead className="text-xs">IPv6</TableHead>}
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vlans.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isModuleEnabled("ipv6") ? 7 : 6} className="text-center py-12">
                          <Layers className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                          <p className="text-sm font-medium text-muted-foreground">No VLAN interfaces configured</p>
                          <p className="text-xs text-muted-foreground mt-1">Click &quot;Create VLAN&quot; to segment your network</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      vlans.map((vlan) => (
                        <>
                        <TableRow key={vlan.name} className="border-l-[3px] border-l-amber-500 hover:bg-muted/50 transition-colors">
                          <TableCell className="font-mono text-sm font-medium">{vlan.name}</TableCell>
                          <TableCell className="font-mono text-xs">{vlan.parent}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{vlan.vlanId}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-mono text-xs font-medium">{vlan.ipv4 || "—"}</div>
                              {(vlan.secondaryIps || []).map((ip) => (
                                <div key={ip} className="flex items-center gap-1">
                                  <span className="font-mono text-[11px] text-muted-foreground">{ip}</span>
                                  <button
                                    className="text-red-400 hover:text-red-600 transition-colors"
                                    onClick={() => { setDeleteAliasTarget({ name: vlan.name, address: ip }); setDeleteAliasDialogOpen(true); }}
                                    title="Remove alias"
                                  >
                                    <MinusCircle className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          {isModuleEnabled("ipv6") && (
                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[180px]">
                              {vlan.ipv6 || "—"}
                            </TableCell>
                          )}
                          <TableCell>{getStatusDot(vlan.status === "UP" || vlan.status === "up")}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                                onClick={() => openAliasDialog(vlan.name, "VLAN")}
                                title="Add Alias IP"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => openDelete(vlan.name, "VLAN")}
                                title="Delete VLAN"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        </>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════ TAB 3: Bridges ═══════════════════ */}
        <TabsContent value="bridge">
          <Card className="border-border/50 shadow-sm rounded-xl hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-400 to-purple-500 text-white shadow-sm">
                    <Link className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">Bridge Interfaces</CardTitle>
                </div>
                <Button
                  size="sm"
                  onClick={() => setBridgeDialogOpen(true)}
                  className="bg-destructive hover:bg-destructive/90 text-white"
                >
                  <Plus className="h-4 w-4 mr-1.5" />Create Bridge
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Members</TableHead>
                      <TableHead className="text-xs">IPv4 / Alias IPs</TableHead>
                      {isModuleEnabled("ipv6") && <TableHead className="text-xs">IPv6</TableHead>}
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bridges.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isModuleEnabled("ipv6") ? 6 : 5} className="text-center py-12">
                          <Link className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                          <p className="text-sm font-medium text-muted-foreground">No bridges configured</p>
                          <p className="text-xs text-muted-foreground mt-1">Click &quot;Create Bridge&quot; to join interfaces</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      bridges.map((br) => (
                        <TableRow key={br.name} className="border-l-[3px] border-l-purple-500 hover:bg-muted/50 transition-colors">
                          <TableCell className="font-mono text-sm font-medium">{br.name}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(br.members || []).map((m) => (
                                <Badge key={m} variant="outline" className="text-[10px] font-mono">
                                  {m}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-mono text-xs font-medium">{br.ipv4 || "—"}</div>
                              {(br.secondaryIps || []).map((ip) => (
                                <div key={ip} className="flex items-center gap-1">
                                  <span className="font-mono text-[11px] text-muted-foreground">{ip}</span>
                                  <button
                                    className="text-red-400 hover:text-red-600 transition-colors"
                                    onClick={() => { setDeleteAliasTarget({ name: br.name, address: ip }); setDeleteAliasDialogOpen(true); }}
                                    title="Remove alias"
                                  >
                                    <MinusCircle className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          {isModuleEnabled("ipv6") && (
                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[180px]">
                              {br.ipv6 || "—"}
                            </TableCell>
                          )}
                          <TableCell>{getStatusDot(br.status === "UP" || br.status === "up")}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                                onClick={() => openAliasDialog(br.name, "BRIDGE")}
                                title="Add Alias IP"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => openDelete(br.name, "BRIDGE")}
                                title="Delete Bridge"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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

        {/* ═══════════════════ TAB 4: Bonds ═══════════════════ */}
        <TabsContent value="bond">
          <Card className="border-border/50 shadow-sm rounded-xl hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-400 to-teal-500 text-white shadow-sm">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">Bond Interfaces</CardTitle>
                </div>
                <Button
                  size="sm"
                  onClick={() => setBondDialogOpen(true)}
                  className="bg-destructive hover:bg-destructive/90 text-white"
                >
                  <Plus className="h-4 w-4 mr-1.5" />Create Bond
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Mode</TableHead>
                      <TableHead className="text-xs">Members</TableHead>
                      <TableHead className="text-xs">IPv4 / Alias IPs</TableHead>
                      {isModuleEnabled("ipv6") && <TableHead className="text-xs">IPv6</TableHead>}
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bonds.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isModuleEnabled("ipv6") ? 7 : 6} className="text-center py-12">
                          <ArrowUpDown className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                          <p className="text-sm font-medium text-muted-foreground">No bond interfaces configured</p>
                          <p className="text-xs text-muted-foreground mt-1">Click &quot;Create Bond&quot; for link aggregation</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      bonds.map((bond) => (
                        <TableRow key={bond.name} className="border-l-[3px] border-l-teal-500 hover:bg-muted/50 transition-colors">
                          <TableCell className="font-mono text-sm font-medium">{bond.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{bond.mode}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(bond.members || []).map((m) => (
                                <Badge key={m} variant="outline" className="text-[10px] font-mono">
                                  {m}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-mono text-xs font-medium">{bond.ipv4 || "—"}</div>
                              {(bond.secondaryIps || []).map((ip) => (
                                <div key={ip} className="flex items-center gap-1">
                                  <span className="font-mono text-[11px] text-muted-foreground">{ip}</span>
                                  <button
                                    className="text-red-400 hover:text-red-600 transition-colors"
                                    onClick={() => { setDeleteAliasTarget({ name: bond.name, address: ip }); setDeleteAliasDialogOpen(true); }}
                                    title="Remove alias"
                                  >
                                    <MinusCircle className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          {isModuleEnabled("ipv6") && (
                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[180px]">
                              {bond.ipv6 || "—"}
                            </TableCell>
                          )}
                          <TableCell>{getStatusDot(bond.status === "UP" || bond.status === "up")}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20"
                                onClick={() => openAliasDialog(bond.name, "BOND")}
                                title="Add Alias IP"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => openDelete(bond.name, "BOND")}
                                title="Delete Bond"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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

        {/* ═══════════════════ TAB 5: Gateway Config ═══════════════════ */}
        <TabsContent value="gateway">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Gateway Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              {!gcForm ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Gateway Mode */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm">
                        <Server className="h-3.5 w-3.5" />
                      </div>
                      Gateway Mode
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Gateway Mode</Label>
                        <Select value={gcForm.gatewayMode || "ROUTED"} onValueChange={(v) => setGcForm({ ...gcForm, gatewayMode: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BRIDGE">BRIDGE</SelectItem>
                            <SelectItem value="ROUTED">ROUTED</SelectItem>
                            <SelectItem value="PPPoE_SERVER">PPPoE Server</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Default Gateway</Label>
                        <Input value={gcForm.defaultGateway || ""} onChange={(e) => setGcForm({ ...gcForm, defaultGateway: e.target.value })} placeholder="192.168.1.1" />
                      </div>
                      {isModuleEnabled("ipv6") && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">IPv6 Default Gateway</Label>
                          <Input value={gcForm.defaultGateway6 || ""} onChange={(e) => setGcForm({ ...gcForm, defaultGateway6: e.target.value })} placeholder="2001:db8::1" className="font-mono text-sm" />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">DNS Forwarders</Label>
                        <Input value={gcForm.dnsForwarders || ""} onChange={(e) => setGcForm({ ...gcForm, dnsForwarders: e.target.value })} placeholder="8.8.8.8, 1.1.1.1" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={gcForm.enableDnsCache} onCheckedChange={(c) => setGcForm({ ...gcForm, enableDnsCache: c })} />
                      <Label className="text-sm">Enable DNS Cache</Label>
                    </div>
                  </section>

                  {/* DHCP Server */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-green-400 to-green-500 text-white shadow-sm">
                        <Activity className="h-3.5 w-3.5" />
                      </div>
                      DHCP Server
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">DHCP Type</Label>
                        <Select value={gcForm.dhcpType || "KEA"} onValueChange={(v) => setGcForm({ ...gcForm, dhcpType: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="KEA">KEA</SelectItem>
                            <SelectItem value="ISC">ISC</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">DHCP URL</Label>
                        <Input value={gcForm.dhcpUrl || ""} onChange={(e) => setGcForm({ ...gcForm, dhcpUrl: e.target.value })} placeholder="http://localhost:8080" />
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.dhcpEnabled} onCheckedChange={(c) => setGcForm({ ...gcForm, dhcpEnabled: c })} />
                        <Label className="text-sm">DHCP Enabled</Label>
                      </div>
                    </div>
                  </section>

                  {/* DNS Server */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-400 to-blue-500 text-white shadow-sm">
                        <Shield className="h-3.5 w-3.5" />
                      </div>
                      DNS Server
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">DNS Type</Label>
                        <Select value={gcForm.dnsType || "DNSMASQ"} onValueChange={(v) => setGcForm({ ...gcForm, dnsType: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DNSMASQ">DNSMASQ</SelectItem>
                            <SelectItem value="UNBOUND">UNBOUND</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.dnsEnabled} onCheckedChange={(c) => setGcForm({ ...gcForm, dnsEnabled: c })} />
                        <Label className="text-sm">DNS Enabled</Label>
                      </div>
                    </div>
                  </section>

                  {/* Captive Portal */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-red-500 text-white shadow-sm">
                        <Eye className="h-3.5 w-3.5" />
                      </div>
                      Captive Portal
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">HTTP Port</Label>
                        <Input type="number" value={gcForm.captivePortalHttpPort || 80} onChange={(e) => setGcForm({ ...gcForm, captivePortalHttpPort: parseInt(e.target.value) || 80 })} />
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.captivePortalEnabled} onCheckedChange={(c) => setGcForm({ ...gcForm, captivePortalEnabled: c })} />
                        <Label className="text-sm">Captive Portal Enabled</Label>
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.captivePortalHttps} onCheckedChange={(c) => setGcForm({ ...gcForm, captivePortalHttps: c })} />
                        <Label className="text-sm">HTTPS</Label>
                      </div>
                    </div>
                  </section>

                  {/* TC / Bandwidth */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-400 to-teal-500 text-white shadow-sm">
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </div>
                      TC / Bandwidth
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Default Class</Label>
                        <Input value={gcForm.tcDefaultClass || ""} onChange={(e) => setGcForm({ ...gcForm, tcDefaultClass: e.target.value })} placeholder="default" />
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.tcEnabled} onCheckedChange={(c) => setGcForm({ ...gcForm, tcEnabled: c })} />
                        <Label className="text-sm">TC Enabled</Label>
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.tcCleanupOnLogout} onCheckedChange={(c) => setGcForm({ ...gcForm, tcCleanupOnLogout: c })} />
                        <Label className="text-sm">Cleanup on Logout</Label>
                      </div>
                    </div>
                  </section>

                  {/* NAT */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-400 to-purple-500 text-white shadow-sm">
                        <Globe className="h-3.5 w-3.5" />
                      </div>
                      NAT
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">NAT Mode</Label>
                        <Select value={gcForm.natMode || "MASQUERADE"} onValueChange={(v) => setGcForm({ ...gcForm, natMode: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MASQUERADE">MASQUERADE</SelectItem>
                            <SelectItem value="SNAT">SNAT</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.natEnabled} onCheckedChange={(c) => setGcForm({ ...gcForm, natEnabled: c })} />
                        <Label className="text-sm">NAT Enabled</Label>
                      </div>
                    </div>
                  </section>

                  {/* nftables */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm">
                        <Shield className="h-3.5 w-3.5" />
                      </div>
                      nftables
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Table Name</Label>
                        <Input value={gcForm.nftablesTableName || ""} onChange={(e) => setGcForm({ ...gcForm, nftablesTableName: e.target.value })} placeholder="nat" />
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.nftablesEnabled} onCheckedChange={(c) => setGcForm({ ...gcForm, nftablesEnabled: c })} />
                        <Label className="text-sm">nftables Enabled</Label>
                      </div>
                    </div>
                  </section>

                  {/* NAT Logging */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-sm">
                        <Network className="h-3.5 w-3.5" />
                      </div>
                      NAT Logging
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Retention Days</Label>
                        <Input type="number" value={gcForm.natLoggingRetentionDays || 30} onChange={(e) => setGcForm({ ...gcForm, natLoggingRetentionDays: parseInt(e.target.value) || 30 })} />
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.natLoggingEnabled} onCheckedChange={(c) => setGcForm({ ...gcForm, natLoggingEnabled: c })} />
                        <Label className="text-sm">NAT Logging Enabled</Label>
                      </div>
                    </div>
                  </section>

                  {/* RADIUS */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-500 text-white shadow-sm">
                        <Wifi className="h-3.5 w-3.5" />
                      </div>
                      RADIUS
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Interim Update (seconds)</Label>
                        <Input type="number" value={gcForm.radiusInterimUpdate || 300} onChange={(e) => setGcForm({ ...gcForm, radiusInterimUpdate: parseInt(e.target.value) || 300 })} />
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.radiusAccountingEnabled} onCheckedChange={(c) => setGcForm({ ...gcForm, radiusAccountingEnabled: c })} />
                        <Label className="text-sm">Accounting Enabled</Label>
                      </div>
                    </div>
                  </section>

                  {/* Security */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-red-500 text-white shadow-sm">
                        <Shield className="h-3.5 w-3.5" />
                      </div>
                      Security
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="flex items-center gap-3">
                        <Switch checked={gcForm.arpProtection} onCheckedChange={(c) => setGcForm({ ...gcForm, arpProtection: c })} />
                        <Label className="text-sm">ARP Protection</Label>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch checked={gcForm.dhcpSnooping} onCheckedChange={(c) => setGcForm({ ...gcForm, dhcpSnooping: c })} />
                        <Label className="text-sm">DHCP Snooping</Label>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch checked={gcForm.clientIsolation} onCheckedChange={(c) => setGcForm({ ...gcForm, clientIsolation: c })} />
                        <Label className="text-sm">Client Isolation</Label>
                      </div>
                    </div>
                  </section>

                  {/* Concurrent Sessions */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Settings className="h-4 w-4" />
                      Concurrent Sessions
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Action</Label>
                        <Select value={gcForm.concurrentSessionsAction || "KICK_OLD"} onValueChange={(v) => setGcForm({ ...gcForm, concurrentSessionsAction: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="KICK_OLD">KICK_OLD</SelectItem>
                            <SelectItem value="REJECT_NEW">REJECT_NEW</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3 pt-5">
                        <Switch checked={gcForm.concurrentSessionsEnforce} onCheckedChange={(c) => setGcForm({ ...gcForm, concurrentSessionsEnforce: c })} />
                        <Label className="text-sm">Enforce Limit</Label>
                      </div>
                    </div>
                  </section>

                  {/* Save Button */}
                  <div className="flex justify-end pt-4">
                    <Button
                      className="bg-destructive hover:bg-destructive/90 text-white min-w-[140px]"
                      onClick={() => gcForm && saveGatewayConfigMutation.mutate(gcForm)}
                      disabled={saveGatewayConfigMutation.isPending}
                    >
                      {saveGatewayConfigMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Config
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════ TAB 6: Static Routes ═══════════════════ */}
        <TabsContent value="routes">
          <div className="space-y-6">
            {/* Default Route Card */}
            <Card className="border-border/50 shadow-sm rounded-xl hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-sm">
                      <Globe className="h-3.5 w-3.5" />
                    </div>
                    <CardTitle className="text-base">Default Route</CardTitle>
                    <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold">0.0.0.0/0</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRouteDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />Add Default Route
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Destination</TableHead>
                        <TableHead className="text-xs">Gateway</TableHead>
                        <TableHead className="text-xs">Interface</TableHead>
                        <TableHead className="text-xs hidden sm:table-cell">Metric</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Scope</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Protocol</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routesLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8">
                            <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
                            <p className="text-xs text-muted-foreground mt-2">Loading routes...</p>
                          </TableCell>
                        </TableRow>
                      ) : defaultRoutes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8">
                            <Globe className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No default route configured</p>
                            <p className="text-xs text-muted-foreground mt-1">Add a default route to configure internet access via a gateway</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        defaultRoutes.map((route) => (
                          <TableRow key={route.id} className="border-l-[3px] border-l-orange-500 hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{route.destination}</TableCell>
                            <TableCell className="font-mono text-xs font-semibold">{route.gateway}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs font-mono">{route.interface}</Badge>
                            </TableCell>
                            <TableCell className="text-xs hidden sm:table-cell">{route.metric || "—"}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">{route.scope}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">{route.protocol}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => { setDeleteRouteTarget(route); setDeleteRouteDialogOpen(true); }}
                                title="Delete Route"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Custom Static Routes Card */}
            <Card className="border-border/50 shadow-sm rounded-xl hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-400 to-teal-500 text-white shadow-sm">
                      <Route className="h-3.5 w-3.5" />
                    </div>
                    <CardTitle className="text-base">Custom Static Routes</CardTitle>
                    {staticRoutes.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{staticRoutes.length}</Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setRouteDialogOpen(true)}
                    className="bg-destructive hover:bg-destructive/90 text-white"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />Add Static Route
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Destination</TableHead>
                        <TableHead className="text-xs">Gateway</TableHead>
                        <TableHead className="text-xs">Interface</TableHead>
                        <TableHead className="text-xs hidden sm:table-cell">Metric</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Scope</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Protocol</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Flags</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routesLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8">
                            <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
                            <p className="text-xs text-muted-foreground mt-2">Loading routes...</p>
                          </TableCell>
                        </TableRow>
                      ) : staticRoutes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12">
                            <Route className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No custom static routes</p>
                            <p className="text-xs text-muted-foreground mt-1">Click &quot;Add Static Route&quot; to configure custom routing</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        staticRoutes.map((route) => (
                          <TableRow key={route.id} className="border-l-[3px] border-l-cyan-500 hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{route.destination}</TableCell>
                            <TableCell className="font-mono text-xs">{route.gateway}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs font-mono">{route.interface}</Badge>
                            </TableCell>
                            <TableCell className="text-xs hidden sm:table-cell">{route.metric || "—"}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">{route.scope}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">
                              {route.protocol === "kernel" || route.protocol === "dhcp" ? (
                                <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold">{route.protocol}</Badge>
                              ) : (
                                <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400 border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold">{route.protocol}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {route.flags.map((flag) => (
                                  <Badge key={flag} variant="outline" className="text-[10px]">{flag}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => { setDeleteRouteTarget(route); setDeleteRouteDialogOpen(true); }}
                                title="Delete Route"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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
        </TabsContent>
      </Tabs>

      {/* ═══════════════════ DIALOGS ═══════════════════ */}

      {/* Edit IP Dialog */}
      <Dialog open={editIpOpen} onOpenChange={(o) => { setEditIpOpen(o); if (!o) setEditIpTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure IP Address</DialogTitle>
            <DialogDescription>
              Set IPv4 and IPv6 addresses for <span className="font-mono font-semibold">{editIpTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">IPv4 Address</Label>
              <Input
                value={editIpForm.ipv4}
                onChange={(e) => setEditIpForm({ ...editIpForm, ipv4: e.target.value })}
                placeholder="192.168.1.1/24"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">IPv6 Address</Label>
              <Input
                value={editIpForm.ipv6}
                onChange={(e) => setEditIpForm({ ...editIpForm, ipv6: e.target.value })}
                placeholder="fe80::1/64"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditIpOpen(false); setEditIpTarget(null); }}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() =>
                editIpTarget &&
                saveIpMutation.mutate({ name: editIpTarget.name, ipv4: editIpForm.ipv4, ipv6: editIpForm.ipv6 })
              }
              disabled={saveIpMutation.isPending}
            >
              {saveIpMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create VLAN Dialog */}
      <Dialog open={vlanDialogOpen} onOpenChange={(o) => { setVlanDialogOpen(o); if (!o) setVlanForm({ parent: "", vlanId: "", ipv4: "", ipv6: "" }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create VLAN Interface</DialogTitle>
            <DialogDescription>Create a new VLAN on a parent physical interface.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Parent Interface *</Label>
              <Select value={vlanForm.parent} onValueChange={(v) => setVlanForm({ ...vlanForm, parent: v })}>
                <SelectTrigger><SelectValue placeholder="Select parent..." /></SelectTrigger>
                <SelectContent>
                  {interfaces.map((iface) => (
                    <SelectItem key={iface.name} value={iface.name}>{iface.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">VLAN ID *</Label>
              <Input
                type="number"
                min={1}
                max={4094}
                value={vlanForm.vlanId}
                onChange={(e) => setVlanForm({ ...vlanForm, vlanId: e.target.value })}
                placeholder="100"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">IPv4 Address (optional)</Label>
              <Input
                value={vlanForm.ipv4}
                onChange={(e) => setVlanForm({ ...vlanForm, ipv4: e.target.value })}
                placeholder="10.0.0.1/24"
              />
            </div>
            {isModuleEnabled("ipv6") && (
              <div className="space-y-1.5">
                <Label>IPv6 Address</Label>
                <Input placeholder="2001:db8::1/64" className="font-mono text-sm" value={vlanForm.ipv6} onChange={(e) => setVlanForm({ ...vlanForm, ipv6: e.target.value })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVlanDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => {
                if (!vlanForm.parent || !vlanForm.vlanId) { toast.error("Parent interface and VLAN ID are required"); return; }
                createVlanMutation.mutate({
                  parent: vlanForm.parent,
                  vlanId: parseInt(vlanForm.vlanId),
                  ipv4: vlanForm.ipv4 || undefined,
                });
              }}
              disabled={createVlanMutation.isPending}
            >
              {createVlanMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Bridge Dialog */}
      <Dialog open={bridgeDialogOpen} onOpenChange={(o) => { setBridgeDialogOpen(o); if (!o) setBridgeForm({ name: "", members: [], ipv6: "" }); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Bridge</DialogTitle>
            <DialogDescription>Create a new bridge and assign member interfaces.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Bridge Name *</Label>
              <Input
                value={bridgeForm.name}
                onChange={(e) => setBridgeForm({ ...bridgeForm, name: e.target.value })}
                placeholder="br0"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Member Interfaces *</Label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                {interfaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No physical interfaces available</p>
                ) : (
                  interfaces.map((iface) => (
                    <label
                      key={iface.name}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm hover:bg-muted/50 ${
                        bridgeForm.members.includes(iface.name) ? "bg-muted" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={bridgeForm.members.includes(iface.name)}
                        onChange={() => { setBridgeForm(prev => prev.members.includes(iface.name) ? { ...prev, members: prev.members.filter(m => m !== iface.name) } : { ...prev, members: [...prev.members, iface.name] }); }}
                        className="rounded border-gray-300"
                      />
                      <span className="font-mono text-xs">{iface.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{iface.ipv4 || iface.mac || ""}</span>
                    </label>
                  ))
                )}
              </div>
              {bridgeForm.members.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Selected: {bridgeForm.members.join(", ")}
                </p>
              )}
            </div>
            {isModuleEnabled("ipv6") && (
              <div className="space-y-1.5">
                <Label>IPv6 Address</Label>
                <Input placeholder="2001:db8::1/64" className="font-mono text-sm" value={bridgeForm.ipv6} onChange={(e) => setBridgeForm({ ...bridgeForm, ipv6: e.target.value })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBridgeDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => {
                if (!bridgeForm.name || bridgeForm.members.length === 0) { toast.error("Name and at least one member are required"); return; }
                createBridgeMutation.mutate({ name: bridgeForm.name, members: bridgeForm.members });
              }}
              disabled={createBridgeMutation.isPending}
            >
              {createBridgeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Bond Dialog */}
      <Dialog open={bondDialogOpen} onOpenChange={(o) => { setBondDialogOpen(o); if (!o) setBondForm({ name: "", mode: "802.3ad", members: [], ipv6: "" }); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Bond</DialogTitle>
            <DialogDescription>Create a new bonded interface for link aggregation.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Bond Name *</Label>
              <Input
                value={bondForm.name}
                onChange={(e) => setBondForm({ ...bondForm, name: e.target.value })}
                placeholder="bond0"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mode *</Label>
              <Select value={bondForm.mode} onValueChange={(v) => setBondForm({ ...bondForm, mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="802.3ad">802.3ad (LACP)</SelectItem>
                  <SelectItem value="active-backup">active-backup</SelectItem>
                  <SelectItem value="balance-alb">balance-alb</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Member Interfaces *</Label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                {interfaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No physical interfaces available</p>
                ) : (
                  interfaces.map((iface) => (
                    <label
                      key={iface.name}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm hover:bg-muted/50 ${
                        bondForm.members.includes(iface.name) ? "bg-muted" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={bondForm.members.includes(iface.name)}
                        onChange={() => { setBondForm(prev => prev.members.includes(iface.name) ? { ...prev, members: prev.members.filter(m => m !== iface.name) } : { ...prev, members: [...prev.members, iface.name] }); }}
                        className="rounded border-gray-300"
                      />
                      <span className="font-mono text-xs">{iface.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{iface.ipv4 || iface.mac || ""}</span>
                    </label>
                  ))
                )}
              </div>
              {bondForm.members.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Selected: {bondForm.members.join(", ")}
                </p>
              )}
            </div>
            {isModuleEnabled("ipv6") && (
              <div className="space-y-1.5">
                <Label>IPv6 Address</Label>
                <Input placeholder="2001:db8::1/64" className="font-mono text-sm" value={bondForm.ipv6} onChange={(e) => setBondForm({ ...bondForm, ipv6: e.target.value })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBondDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => {
                if (!bondForm.name || bondForm.members.length === 0) { toast.error("Name and at least one member are required"); return; }
                createBondMutation.mutate({ name: bondForm.name, mode: bondForm.mode, members: bondForm.members });
              }}
              disabled={createBondMutation.isPending}
            >
              {createBondMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-mono font-semibold">{deleteTarget?.name}</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() =>
                deleteTarget && deleteMutation.mutate({ name: deleteTarget.name, type: deleteTarget.type })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Route Dialog */}
      <Dialog open={routeDialogOpen} onOpenChange={(o) => { setRouteDialogOpen(o); if (!o) setRouteForm({ destination: "", gateway: "", metric: "", interface: "" }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Static Route</DialogTitle>
            <DialogDescription>
              Add a new static route to the system routing table. Use <span className="font-mono font-semibold">0.0.0.0/0</span> for a default route.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Destination Network <span className="text-red-500">*</span></Label>
              <Input
                value={routeForm.destination}
                onChange={(e) => setRouteForm({ ...routeForm, destination: e.target.value })}
                placeholder="0.0.0.0/0 for default, or 192.168.2.0/24"
              />
              <p className="text-[11px] text-muted-foreground">e.g. 0.0.0.0/0 (default), 10.0.0.0/8, 192.168.100.0/24</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Gateway (Next Hop) <span className="text-red-500">*</span></Label>
              <Input
                value={routeForm.gateway}
                onChange={(e) => setRouteForm({ ...routeForm, gateway: e.target.value })}
                placeholder="192.168.1.1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Interface</Label>
                <Select value={routeForm.interface || "_auto"} onValueChange={(v) => setRouteForm({ ...routeForm, interface: v === "_auto" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_auto">Auto (use system default)</SelectItem>
                    {interfaces.map((iface) => (
                      <SelectItem key={iface.name} value={iface.name}>{iface.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Metric</Label>
                <Input
                  type="number"
                  value={routeForm.metric}
                  onChange={(e) => setRouteForm({ ...routeForm, metric: e.target.value })}
                  placeholder="100"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRouteDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => addRouteMutation.mutate({
                destination: routeForm.destination,
                gateway: routeForm.gateway,
                metric: routeForm.metric ? parseInt(routeForm.metric) : undefined,
                interface: routeForm.interface || undefined,
              })}
              disabled={!routeForm.destination || !routeForm.gateway || addRouteMutation.isPending}
            >
              {addRouteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Route Confirmation */}
      <AlertDialog open={deleteRouteDialogOpen} onOpenChange={setDeleteRouteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Route</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete route <span className="font-mono font-semibold">{deleteRouteTarget?.destination}</span> via <span className="font-mono font-semibold">{deleteRouteTarget?.gateway}</span>? This will immediately remove it from the routing table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteRouteTarget && deleteRouteMutation.mutate(deleteRouteTarget)}
              disabled={deleteRouteMutation.isPending}
            >
              {deleteRouteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Route
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Alias IP Dialog */}
      <Dialog open={aliasDialogOpen} onOpenChange={(o) => { setAliasDialogOpen(o); if (!o) { setAliasTarget(null); setAliasIpForm(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Alias / Secondary IP</DialogTitle>
            <DialogDescription>
              Add a secondary IP address to <span className="font-mono font-semibold">{aliasTarget?.name}</span> ({aliasTarget?.type}).
              This allows the interface to respond to multiple IP networks.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">IP Address (CIDR) <span className="text-red-500">*</span></Label>
              <Input
                value={aliasIpForm}
                onChange={(e) => setAliasIpForm(e.target.value)}
                placeholder="192.168.10.1/24"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && aliasTarget && aliasIpForm) {
                    addAliasIpMutation.mutate({ name: aliasTarget.name, address: aliasIpForm });
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Enter IP in CIDR notation (e.g. 10.0.50.1/24, 172.16.0.1/16). The address must not conflict with existing IPs on this interface.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAliasDialogOpen(false); setAliasTarget(null); setAliasIpForm(""); }}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => aliasTarget && addAliasIpMutation.mutate({ name: aliasTarget.name, address: aliasIpForm })}
              disabled={!aliasIpForm || addAliasIpMutation.isPending}
            >
              {addAliasIpMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Copy className="h-4 w-4 mr-1.5" />Add Alias IP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alias IP Confirmation */}
      <AlertDialog open={deleteAliasDialogOpen} onOpenChange={setDeleteAliasDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Alias IP</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove alias IP <span className="font-mono font-semibold">{deleteAliasTarget?.address}</span> from <span className="font-mono font-semibold">{deleteAliasTarget?.name}</span>? This will immediately remove it from the interface.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteAliasTarget && removeAliasIpMutation.mutate({ name: deleteAliasTarget.name, address: deleteAliasTarget.address })}
              disabled={removeAliasIpMutation.isPending}
            >
              {removeAliasIpMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove IP
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
