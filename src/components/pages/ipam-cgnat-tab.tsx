"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Layers, Plus, Search, Edit2, Trash2, RefreshCw, Shield, Activity,
  ArrowRightLeft, Database, BarChart3, XCircle, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────

interface CgnatPool {
  id: string;
  name: string;
  type: "SNAT_POOL" | "ROUND_ROBIN";
  startIp: string;
  endIp: string;
  portBlockSize: number;
  activeMappings: number;
  maxMappings: number;
  status: string;
  description: string;
  createdAt: string;
}

interface NatMapping {
  id: string;
  internalIp: string;
  externalIp: string;
  portBlockStart: number;
  portBlockEnd: number;
  subscriberId: string;
  subscriberName: string;
  protocol: string;
  poolId: string;
  poolName: string;
  subnetId: string;
  subnetName: string;
  status: "active" | "inactive";
  lastUsed: string;
  createdAt: string;
}

interface WanInterface {
  id: string;
  name: string;
  device: string;
  ip: string;
  status: string;
}

interface CgnatStats {
  totalPools: number;
  activeMappings: number;
  portUtilization: number;
  poolCapacity: number;
  totalPorts: number;
  usedPorts: number;
}

interface SubnetNat {
  id: string;
  name: string;
  network: string;
  natMode: string;
  wanInterfaceId: string;
  cgnatPoolId: string;
  oneToOneNatIp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

const NAT_MODES = [
  { value: "NONE", label: "None", color: "bg-slate-500" },
  { value: "MASQUERADE", label: "Masquerade", color: "bg-amber-500" },
  { value: "SNAT_POOL", label: "SNAT Pool", color: "bg-emerald-500" },
  { value: "ROUND_ROBIN", label: "Round Robin", color: "bg-blue-500" },
  { value: "ONE_TO_ONE", label: "1:1 NAT", color: "bg-purple-500" },
] as const;

function natModeBadge(mode: string) {
  const m = NAT_MODES.find((n) => n.value === mode);
  if (!m || mode === "NONE") {
    return <Badge variant="outline" className="text-xs text-slate-500">None</Badge>;
  }
  return (
    <Badge className="text-xs text-white" style={{ backgroundColor: m.color }}>
      {m.label}
    </Badge>
  );
}

function capacityColor(pct: number): string {
  if (pct >= 90) return "text-red-600";
  if (pct >= 70) return "text-amber-600";
  return "text-emerald-600";
}

function progressColor(pct: number): string {
  if (pct >= 90) return "[&>div]:bg-red-500";
  if (pct >= 70) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-emerald-500";
}

function formatTimestamp(ts: string): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

const emptyPoolForm = {
  name: "",
  type: "SNAT_POOL" as "SNAT_POOL" | "ROUND_ROBIN",
  startIp: "",
  endIp: "",
  portBlockSize: "64",
  maxMappings: "",
  description: "",
};

const emptyMappingForm = {
  poolId: "",
  internalIp: "",
  subscriberName: "",
  protocol: "TCP",
};

// ─── Component ───────────────────────────────────────────────────
export default function IpamCgnatTab() {
  const queryClient = useQueryClient();

  // ── Filters ──
  const [mappingPoolFilter, setMappingPoolFilter] = useState("__all__");
  const [mappingSubnetFilter, setMappingSubnetFilter] = useState("__all__");
  const [mappingStatusFilter, setMappingStatusFilter] = useState("__all__");
  const [mappingPage, setMappingPage] = useState(1);
  const [subnetSearch, setSubnetSearch] = useState("");

  // ── Dialogs ──
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<CgnatPool | null>(null);
  const [poolForm, setPoolForm] = useState(emptyPoolForm);
  const [deletePoolTarget, setDeletePoolTarget] = useState<CgnatPool | null>(null);

  const [allocateDialogOpen, setAllocateDialogOpen] = useState(false);
  const [mappingForm, setMappingForm] = useState(emptyMappingForm);

  const [releaseTarget, setReleaseTarget] = useState<NatMapping | null>(null);

  // ── Local NAT mode state for subnets (batch editing) ──
  const [pendingNatChanges, setPendingNatChanges] = useState<
    Record<string, { natMode: string; wanInterfaceId: string; cgnatPoolId: string; oneToOneNatIp: string }>
  >({});

  // ── Queries ──
  const { data: stats, isLoading: statsLoading } = useQuery<CgnatStats>({
    queryKey: ["cgnat-stats"],
    queryFn: () => apiFetch<CgnatStats>("/api/ipam/cgnat?action=stats").catch(() => ({
      totalPools: 0, activeMappings: 0, portUtilization: 0, poolCapacity: 0, totalPorts: 0, usedPorts: 0,
    })),
    staleTime: 15_000,
  });

  const { data: poolsData, isLoading: poolsLoading } = useQuery<{ pools: CgnatPool[] }>({
    queryKey: ["cgnat-pools"],
    queryFn: () => apiFetch<{ pools: CgnatPool[] }>("/api/ipam/cgnat?action=pools").catch(() => ({ pools: [] })),
    staleTime: 10_000,
  });
  const pools = poolsData?.pools || [];

  const { data: wanInterfaces, isLoading: wanLoading } = useQuery<WanInterface[]>({
    queryKey: ["cgnat-wan-interfaces"],
    queryFn: () => apiFetch<WanInterface[]>("/api/ipam/cgnat?action=wan-interfaces").catch(() => []),
    staleTime: 30_000,
  });

  const { data: subnetsData, isLoading: subnetsLoading } = useQuery<{ subnets: SubnetNat[] }>({
    queryKey: ["cgnat-subnets"],
    queryFn: () => apiFetch<{ subnets: SubnetNat[] }>("/api/ipam").catch(() => ({ subnets: [] })),
    staleTime: 10_000,
  });
  const subnets = subnetsData?.subnets || [];

  const { data: mappingsData, isLoading: mappingsLoading } = useQuery<{ mappings: NatMapping[]; total: number; totalPages: number }>({
    queryKey: ["cgnat-mappings", mappingPoolFilter, mappingSubnetFilter, mappingStatusFilter, mappingPage],
    queryFn: () => {
      const params = new URLSearchParams({ action: "mappings", page: String(mappingPage) });
      if (mappingPoolFilter !== "__all__") params.set("poolId", mappingPoolFilter);
      if (mappingSubnetFilter !== "__all__") params.set("subnetId", mappingSubnetFilter);
      if (mappingStatusFilter !== "__all__") params.set("isActive", mappingStatusFilter);
      return apiFetch<{ mappings: NatMapping[]; total: number; totalPages: number }>(`/api/ipam/cgnat?${params}`).catch(() => ({ mappings: [], total: 0, totalPages: 0 }));
    },
    staleTime: 10_000,
  });
  const mappings = mappingsData?.mappings || [];
  const mappingsTotal = mappingsData?.total || 0;
  const mappingsTotalPages = mappingsData?.totalPages || 0;

  // ── Mutations ──
  const cgnatMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/ipam/cgnat", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d, vars) => {
      if (d.success) {
        toast.success(d.message || "Operation completed");
        setPoolDialogOpen(false);
        setEditingPool(null);
        setPoolForm(emptyPoolForm);
        setAllocateDialogOpen(false);
        setMappingForm(emptyMappingForm);
        setReleaseTarget(null);
        queryClient.invalidateQueries({ queryKey: ["cgnat-"] });
      } else {
        toast.error(d.error || "Operation failed");
      }
    },
    onError: (err: Error) => toast.error(err.message || "Request failed"),
  });

  const subnetNatMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/ipam", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d, vars) => {
      if (d.success) {
        toast.success("NAT mode updated");
        queryClient.invalidateQueries({ queryKey: ["cgnat-subnets"] });
        queryClient.invalidateQueries({ queryKey: ["ipam"] });
      } else {
        toast.error(d.error || "Failed to update NAT mode");
      }
    },
    onError: (err: Error) => toast.error(err.message || "Request failed"),
  });

  // ── Handlers ──
  const handleNatModeChange = (subnetId: string, mode: string) => {
    setPendingNatChanges((prev) => ({
      ...prev,
      [subnetId]: {
        natMode: mode,
        wanInterfaceId: prev[subnetId]?.wanInterfaceId || "",
        cgnatPoolId: prev[subnetId]?.cgnatPoolId || "",
        oneToOneNatIp: prev[subnetId]?.oneToOneNatIp || "",
      },
    }));
  };

  const handleNatSubfieldChange = (
    subnetId: string,
    field: "wanInterfaceId" | "cgnatPoolId" | "oneToOneNatIp",
    value: string,
  ) => {
    setPendingNatChanges((prev) => ({
      ...prev,
      [subnetId]: {
        ...(prev[subnetId] || { natMode: "NONE", wanInterfaceId: "", cgnatPoolId: "", oneToOneNatIp: "" }),
        [field]: value,
      },
    }));
  };

  const saveSubnetNat = (subnet: SubnetNat) => {
    const change = pendingNatChanges[subnet.id];
    subnetNatMutation.mutate({
      action: "update-subnet",
      id: subnet.id,
      natMode: change?.natMode || subnet.natMode,
      wanInterfaceId: change?.wanInterfaceId ?? subnet.wanInterfaceId,
      cgnatPoolId: change?.cgnatPoolId ?? subnet.cgnatPoolId,
      oneToOneNatIp: change?.oneToOneNatIp ?? subnet.oneToOneNatIp,
    });
  };

  const openCreatePool = () => {
    setEditingPool(null);
    setPoolForm(emptyPoolForm);
    setPoolDialogOpen(true);
  };

  const openEditPool = (pool: CgnatPool) => {
    setEditingPool(pool);
    setPoolForm({
      name: pool.name,
      type: pool.type,
      startIp: pool.startIp,
      endIp: pool.endIp,
      portBlockSize: String(pool.portBlockSize),
      maxMappings: String(pool.maxMappings),
      description: pool.description,
    });
    setPoolDialogOpen(true);
  };

  const handleSavePool = () => {
    if (!poolForm.name || !poolForm.startIp || !poolForm.endIp) {
      toast.error("Name, Start IP, and End IP are required");
      return;
    }
    if (editingPool) {
      cgnatMutation.mutate({
        action: "update-pool",
        id: editingPool.id,
        ...poolForm,
        portBlockSize: Number(poolForm.portBlockSize),
        maxMappings: Number(poolForm.maxMappings) || 0,
      });
    } else {
      cgnatMutation.mutate({
        action: "create-pool",
        ...poolForm,
        portBlockSize: Number(poolForm.portBlockSize),
        maxMappings: Number(poolForm.maxMappings) || 0,
      });
    }
  };

  const handleDeletePool = () => {
    if (!deletePoolTarget) return;
    cgnatMutation.mutate({ action: "delete-pool", id: deletePoolTarget.id });
    setDeletePoolTarget(null);
  };

  const handleOpenAllocate = () => {
    setMappingForm({ poolId: "", internalIp: "", subscriberName: "", protocol: "TCP" });
    setAllocateDialogOpen(true);
  };

  const handleAllocatePorts = () => {
    if (!mappingForm.poolId || !mappingForm.internalIp) {
      toast.error("Pool and Internal IP are required");
      return;
    }
    cgnatMutation.mutate({
      action: "allocate-ports",
      poolId: mappingForm.poolId,
      internalIp: mappingForm.internalIp,
      subscriberName: mappingForm.subscriberName,
      protocol: mappingForm.protocol,
    });
  };

  const handleReleaseMapping = () => {
    if (!releaseTarget) return;
    cgnatMutation.mutate({ action: "release-mapping", id: releaseTarget.id });
    setReleaseTarget(null);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["cgnat-"] });
    queryClient.invalidateQueries({ queryKey: ["cgnat-subnets"] });
    queryClient.invalidateQueries({ queryKey: ["ipam"] });
    toast.success("Data refreshed");
  };

  // ── Derived data ──
  const effectiveNatMode = (sn: SubnetNat) =>
    pendingNatChanges[sn.id]?.natMode || sn.natMode || "NONE";

  const effectiveSubfield = (sn: SubnetNat, field: "wanInterfaceId" | "cgnatPoolId" | "oneToOneNatIp") =>
    pendingNatChanges[sn.id]?.[field] ?? sn[field] ?? "";

  const hasPendingChange = (sn: SubnetNat) =>
    pendingNatChanges[sn.id] != null;

  const filteredSubnets = subnets.filter((s) =>
    !subnetSearch || s.name.toLowerCase().includes(subnetSearch.toLowerCase()) || s.network.includes(subnetSearch),
  );

  const uniqueSubnetsInMappings = Array.from(new Map(
    mappings.map((m) => [m.subnetId, { id: m.subnetId, name: m.subnetName || m.subnetId }]),
  ).values());

  // ── Render ──
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/40">
            <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">CGNAT Management</h2>
            <p className="text-sm text-muted-foreground">Carrier-Grade NAT pools, mappings, and subnet NAT configuration</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </Button>
      </div>

      {/* ── Stats Cards ── */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white animate-card-enter" style={{ animationDelay: "0ms" }}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-80">Total Pools</p>
                  <p className="text-2xl font-bold mt-2 tabular-nums">{stats?.totalPools ?? 0}</p>
                  <p className="text-xs mt-1 opacity-75">CGNAT address pools</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm"><Database className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-sky-500 to-sky-600 text-white animate-card-enter" style={{ animationDelay: "75ms" }}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-80">Active Mappings</p>
                  <p className="text-2xl font-bold mt-2 tabular-nums">{stats?.activeMappings ?? 0}</p>
                  <p className="text-xs mt-1 opacity-75">Current NAT sessions</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm"><ArrowRightLeft className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white animate-card-enter" style={{ animationDelay: "150ms" }}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-80">Port Utilization</p>
                  <p className="text-2xl font-bold mt-2 tabular-nums">{stats?.portUtilization ?? 0}%</p>
                  <p className="text-xs mt-1 opacity-75">{stats?.usedPorts ?? 0} / {stats?.totalPorts ?? 0} ports</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm"><BarChart3 className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white animate-card-enter" style={{ animationDelay: "225ms" }}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-80">Pool Capacity</p>
                  <p className="text-2xl font-bold mt-2 tabular-nums">{stats?.poolCapacity ?? 0}%</p>
                  <p className="text-xs mt-1 opacity-75">Overall pool fill rate</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm"><Layers className="h-5 w-5" /></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Section 1: NAT Mode Selector for Subnets ── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base">NAT Mode per Subnet</CardTitle>
              <CardDescription>Configure NAT translation mode for each subnet</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search subnets..."
                value={subnetSearch}
                onChange={(e) => setSubnetSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium uppercase">Subnet</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Network</TableHead>
                  <TableHead className="text-xs font-medium uppercase">NAT Mode</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Configuration</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subnetsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredSubnets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                      No subnets found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubnets.map((sn) => {
                    const mode = effectiveNatMode(sn);
                    return (
                      <TableRow key={sn.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell>
                          <p className="text-sm font-medium">{sn.name}</p>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{sn.network}</TableCell>
                        <TableCell>
                          <Select
                            value={mode}
                            onValueChange={(v) => handleNatModeChange(sn.id, v)}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {NAT_MODES.map((m) => (
                                <SelectItem key={m.value} value={m.value}>
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${m.color}`} />
                                    {m.label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {/* Masquerade → WAN Interface */}
                          {mode === "MASQUERADE" && (
                            <Select
                              value={effectiveSubfield(sn, "wanInterfaceId")}
                              onValueChange={(v) => handleNatSubfieldChange(sn.id, "wanInterfaceId", v)}
                            >
                              <SelectTrigger className="w-48 h-8 text-xs">
                                <SelectValue placeholder={wanLoading ? "Loading..." : "Select WAN interface"} />
                              </SelectTrigger>
                              <SelectContent>
                                {(wanInterfaces || []).map((wan) => (
                                  <SelectItem key={wan.id} value={wan.id}>
                                    {wan.name} ({wan.device})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          {/* SNAT_POOL / ROUND_ROBIN → CGNAT Pool */}
                          {(mode === "SNAT_POOL" || mode === "ROUND_ROBIN") && (
                            <Select
                              value={effectiveSubfield(sn, "cgnatPoolId")}
                              onValueChange={(v) => handleNatSubfieldChange(sn.id, "cgnatPoolId", v)}
                            >
                              <SelectTrigger className="w-48 h-8 text-xs">
                                <SelectValue placeholder="Select CGNAT pool" />
                              </SelectTrigger>
                              <SelectContent>
                                {pools
                                  .filter((p) => mode === "SNAT_POOL" ? p.type === "SNAT_POOL" : p.type === "ROUND_ROBIN")
                                  .map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name} ({p.startIp}–{p.endIp})
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          )}

                          {/* ONE_TO_ONE → Public IP */}
                          {mode === "ONE_TO_ONE" && (
                            <Input
                              className="w-48 h-8 text-xs font-mono"
                              placeholder="e.g. 203.0.113.10"
                              value={effectiveSubfield(sn, "oneToOneNatIp")}
                              onChange={(e) => handleNatSubfieldChange(sn.id, "oneToOneNatIp", e.target.value)}
                            />
                          )}

                          {/* NONE */}
                          {mode === "NONE" && (
                            <span className="text-xs text-muted-foreground italic">No NAT configured</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={hasPendingChange(sn) ? "default" : "ghost"}
                            className={
                              hasPendingChange(sn)
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
                                : "h-7 text-xs"
                            }
                            disabled={!hasPendingChange(sn) || subnetNatMutation.isPending}
                            onClick={() => saveSubnetNat(sn)}
                          >
                            {subnetNatMutation.isPending ? "Saving..." : hasPendingChange(sn) ? "Save" : "Saved"}
                          </Button>
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

      {/* ── Section 2: CGNAT Pool Management ── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base">CGNAT Pools</CardTitle>
              <CardDescription>Manage NAT address pools and port blocks</CardDescription>
            </div>
            <Button size="sm" onClick={openCreatePool} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-3.5 w-3.5" />Create Pool
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium uppercase">Name</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                  <TableHead className="text-xs font-medium uppercase">IP Range</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Port Block Size</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Mappings</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Capacity</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poolsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : pools.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                      No CGNAT pools configured
                    </TableCell>
                  </TableRow>
                ) : (
                  pools.map((pool) => {
                    const pct = pool.maxMappings > 0 ? Math.round((pool.activeMappings / pool.maxMappings) * 100) : 0;
                    return (
                      <TableRow key={pool.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell>
                          <p className="text-sm font-medium">{pool.name}</p>
                          {pool.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{pool.description}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs text-white ${
                              pool.type === "SNAT_POOL" ? "bg-emerald-600" : "bg-blue-600"
                            }`}
                          >
                            {pool.type === "SNAT_POOL" ? "SNAT Pool" : "Round Robin"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {pool.startIp} — {pool.endIp}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">{pool.portBlockSize}</TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {pool.activeMappings} / {pool.maxMappings || "∞"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <Progress value={pool.maxMappings > 0 ? pct : 0} className={`h-2 flex-1 ${progressColor(pct)}`} />
                            <span className={`text-xs tabular-nums w-10 text-right font-medium ${capacityColor(pct)}`}>
                              {pool.maxMappings > 0 ? `${pct}%` : "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPool(pool)}>
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit pool</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  onClick={() => setDeletePoolTarget(pool)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete pool</TooltipContent>
                            </Tooltip>
                          </div>
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

      {/* ── Section 3: NAT Mappings ── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">NAT Mappings</CardTitle>
              <CardDescription>Active and inactive port block allocations</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={handleOpenAllocate}
              className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white"
            >
              <Plus className="h-3.5 w-3.5" />Allocate Ports
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Select value={mappingPoolFilter} onValueChange={(v) => { setMappingPoolFilter(v); setMappingPage(1); }}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="All Pools" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Pools</SelectItem>
                {pools.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mappingSubnetFilter} onValueChange={(v) => { setMappingSubnetFilter(v); setMappingPage(1); }}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="All Subnets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Subnets</SelectItem>
                {uniqueSubnetsInMappings.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mappingStatusFilter} onValueChange={(v) => { setMappingStatusFilter(v); setMappingPage(1); }}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium uppercase">Internal IP</TableHead>
                  <TableHead className="text-xs font-medium uppercase">External IP</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Port Block</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Subscriber</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Protocol</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Last Used</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappingsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : mappings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                      No NAT mappings found
                    </TableCell>
                  </TableRow>
                ) : (
                  mappings.map((m) => (
                    <TableRow key={m.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono text-sm">{m.internalIp}</TableCell>
                      <TableCell className="font-mono text-sm">{m.externalIp}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {m.portBlockStart}–{m.portBlockEnd}
                      </TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate">
                        {m.subscriberName || m.subscriberId || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-mono">{m.protocol}</Badge>
                      </TableCell>
                      <TableCell>
                        {m.status === "active" ? (
                          <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 gap-1">
                            <Activity className="h-3 w-3" />Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <XCircle className="h-3 w-3" />Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(m.lastUsed)}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1"
                            onClick={() => setReleaseTarget(m)}
                          >
                            <XCircle className="h-3 w-3" />Release
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {mappingsTotalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Showing {mappings.length} of {mappingsTotal} mappings
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={mappingPage <= 1}
                  onClick={() => setMappingPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs tabular-nums px-2">
                  Page {mappingPage} / {mappingsTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={mappingPage >= mappingsTotalPages}
                  onClick={() => setMappingPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog: Create/Edit Pool ── */}
      <Dialog open={poolDialogOpen} onOpenChange={(o) => { setPoolDialogOpen(o); if (!o) { setEditingPool(null); setPoolForm(emptyPoolForm); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPool ? "Edit CGNAT Pool" : "Create CGNAT Pool"}</DialogTitle>
            <DialogDescription>
              {editingPool ? "Update pool configuration" : "Define a new NAT address pool"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label className="text-sm font-medium mb-1 block">Pool Name *</Label>
              <Input
                value={poolForm.name}
                onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })}
                placeholder="e.g. WAN-Pool-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-1 block">Pool Type *</Label>
                <Select
                  value={poolForm.type}
                  onValueChange={(v) => setPoolForm({ ...poolForm, type: v as "SNAT_POOL" | "ROUND_ROBIN" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SNAT_POOL">SNAT Pool</SelectItem>
                    <SelectItem value="ROUND_ROBIN">Round Robin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-1 block">Port Block Size *</Label>
                <Select
                  value={poolForm.portBlockSize}
                  onValueChange={(v) => setPoolForm({ ...poolForm, portBlockSize: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="32">32 ports</SelectItem>
                    <SelectItem value="64">64 ports</SelectItem>
                    <SelectItem value="128">128 ports</SelectItem>
                    <SelectItem value="256">256 ports</SelectItem>
                    <SelectItem value="512">512 ports</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-1 block">Start IP *</Label>
                <Input
                  value={poolForm.startIp}
                  onChange={(e) => setPoolForm({ ...poolForm, startIp: e.target.value })}
                  placeholder="100.64.0.1"
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1 block">End IP *</Label>
                <Input
                  value={poolForm.endIp}
                  onChange={(e) => setPoolForm({ ...poolForm, endIp: e.target.value })}
                  placeholder="100.64.255.254"
                  className="font-mono"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1 block">Max Mappings (0 = unlimited)</Label>
              <Input
                type="number"
                min="0"
                value={poolForm.maxMappings}
                onChange={(e) => setPoolForm({ ...poolForm, maxMappings: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1 block">Description</Label>
              <Input
                value={poolForm.description}
                onChange={(e) => setPoolForm({ ...poolForm, description: e.target.value })}
                placeholder="Optional description..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPoolDialogOpen(false); setEditingPool(null); setPoolForm(emptyPoolForm); }}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSavePool}
              disabled={cgnatMutation.isPending}
            >
              {cgnatMutation.isPending ? "Saving..." : editingPool ? "Update Pool" : "Create Pool"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Allocate Ports ── */}
      <Dialog open={allocateDialogOpen} onOpenChange={(o) => { setAllocateDialogOpen(o); if (!o) setMappingForm(emptyMappingForm); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Allocate Port Block</DialogTitle>
            <DialogDescription>
              Assign a port block from a CGNAT pool to an internal IP
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label className="text-sm font-medium mb-1 block">CGNAT Pool *</Label>
              <Select value={mappingForm.poolId} onValueChange={(v) => setMappingForm({ ...mappingForm, poolId: v })}>
                <SelectTrigger><SelectValue placeholder="Select a pool" /></SelectTrigger>
                <SelectContent>
                  {pools.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.startIp}–{p.endIp})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1 block">Internal IP *</Label>
              <Input
                value={mappingForm.internalIp}
                onChange={(e) => setMappingForm({ ...mappingForm, internalIp: e.target.value })}
                placeholder="e.g. 10.0.5.42"
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-1 block">Protocol</Label>
                <Select value={mappingForm.protocol} onValueChange={(v) => setMappingForm({ ...mappingForm, protocol: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TCP">TCP</SelectItem>
                    <SelectItem value="UDP">UDP</SelectItem>
                    <SelectItem value="BOTH">TCP + UDP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-1 block">Subscriber (optional)</Label>
                <Input
                  value={mappingForm.subscriberName}
                  onChange={(e) => setMappingForm({ ...mappingForm, subscriberName: e.target.value })}
                  placeholder="Subscriber name"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAllocateDialogOpen(false); setMappingForm(emptyMappingForm); }}>
              Cancel
            </Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700 text-white"
              onClick={handleAllocatePorts}
              disabled={cgnatMutation.isPending}
            >
              {cgnatMutation.isPending ? "Allocating..." : "Allocate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog: Delete Pool ── */}
      <AlertDialog open={!!deletePoolTarget} onOpenChange={(o) => { if (!o) setDeletePoolTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete CGNAT Pool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletePoolTarget?.name}</strong>? This will release all active mappings in this pool. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePoolTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeletePool}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── AlertDialog: Release Mapping ── */}
      <AlertDialog open={!!releaseTarget} onOpenChange={(o) => { if (!o) setReleaseTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release NAT Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Release the port block for <strong>{releaseTarget?.internalIp}</strong> → <strong>{releaseTarget?.externalIp}</strong> ({releaseTarget?.portBlockStart}–{releaseTarget?.portBlockEnd})? The subscriber will lose external connectivity until a new mapping is allocated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReleaseTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleReleaseMapping}
            >
              Release
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
