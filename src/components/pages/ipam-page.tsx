"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Globe, MonitorCheck, MonitorX, Layers, Plus, Search, Edit2, Trash2,
  ChevronLeft, ChevronRight, RefreshCw, Eye, Upload, History, TreePine,
  List, ChevronDown, ChevronRight as ChevronRightIcon, X, TrendingUp, PlusCircle,
  Trash, Download, Info, Zap, AlertTriangle, Shield,
  Radio, Lock, Unlock, Pin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useModuleStore } from "@/store/module-store";
import IpamCgnatTab from "./ipam-cgnat-tab";

// ─── Types ───────────────────────────────────────────────────────
interface Subnet {
  id: string; name: string; network: string; gateway: string;
  totalIps: number; usedIps: number; vlan: string;
  description: string; status: string;
  networkv6: string; prefixv6: string; parentId: string;
  areaId?: string; areaName?: string;
  tcEnabled?: boolean;
  tcSubnetIndex?: number;
  nextClassSlot?: number;
  bandwidthPoolDownMbps?: number;
  bandwidthBurstDownMbps?: number;
  bandwidthPoolUpMbps?: number;
  bandwidthBurstUpMbps?: number;
  defaultUserDownMbps?: number;
  defaultUserUpMbps?: number;
  allocationStrategy: string; // STATIC | DHCP_POOL | FULL_ALLOW | UNRESTRICTED
  frPoolName: string;
  ipRangeStart: string;
  ipRangeEnd: string;
}

interface IpAllocation {
  id: string; ip: string; subnet: string; subnetId: string;
  assignedTo: string; mac: string; hostname: string; status: string; since: string;
  customFields: string;
}

interface Vlan {
  id: string; vlanId: string; name: string; subnet: string;
  description: string; portCount: number; status: string;
}

interface IpamData {
  subnets: Subnet[]; subnetTotal: number; subnetPage: number; subnetTotalPages: number;
  vlans: Vlan[]; vlanTotal: number; vlanPage: number; vlanTotalPages: number;
  ips: IpAllocation[]; ipTotal: number; ipPage: number; ipTotalPages: number;
  stats: { totalSubnets: number; totalIps: number; usedIps: number; freeIps: number };
}

interface IpAssignmentRecord {
  id: string; ipAddressId: string; assignedTo: string; assignedType: string;
  assignedById: string; assignedAt: string; releasedAt: string | null;
}

interface TrendData {
  month: string;
  used?: number;
  total?: number;
  utilization?: number;
  allocated?: number;
  free?: number;
}

interface RadiusPoolEntry {
  id: string;
  poolName: string;
  framedIp: string;
  username: string;
  nasIp: string;
  expiryTime: string;
  status: string;
}

interface RadiusPoolsData {
  entries: RadiusPoolEntry[];
  stats: {
    totalPools: number;
    activeLeases: number;
    expiredLeases: number;
    uniquePoolNames: number;
  };
}

// ─── Allocation Strategy Helpers ─────────────────────────────────
const ALLOCATION_STRATEGIES = [
  { value: "STATIC", label: "Static Assignment", description: "IPs manually assigned from IPAM pool", color: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800", icon: Pin },
  { value: "DHCP_POOL", label: "DHCP Pool (FreeRADIUS)", description: "IPs allocated by FreeRADIUS from radippool", color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800", icon: Radio },
  { value: "FULL_ALLOW", label: "Full Allow Range", description: "Any IP in range allowed", color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800", icon: Lock },
  { value: "UNRESTRICTED", label: "Unrestricted", description: "No IP enforcement", color: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700", icon: Unlock },
] as const;

function AllocationStrategyBadge({ strategy }: { strategy: string }) {
  const s = ALLOCATION_STRATEGIES.find((a) => a.value === strategy) || ALLOCATION_STRATEGIES[3];
  const Icon = s.icon;
  return (
    <Badge className={`${s.color} border text-[11px] gap-1 shrink-0`}>
      <Icon className="h-3 w-3" />
      {s.label}
    </Badge>
  );
}

function getUtilColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-green-500";
}

function StatCard({ title, value, subtitle, icon: Icon, gradient, delay }: {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; gradient: string; delay: number;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg animate-card-enter`} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">{title}</p>
            <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
            <p className="text-xs mt-1 opacity-75">{subtitle}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm"><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

const PAGE_SIZE = 20;

const emptySubnetForm = {
  name: "", network: "", gateway: "", vlan: "", description: "", networkv6: "", prefixv6: "", parentId: "", areaId: "",
  tcEnabled: false,
  bandwidthPoolDownMbps: "0",
  bandwidthBurstDownMbps: "0",
  bandwidthPoolUpMbps: "0",
  bandwidthBurstUpMbps: "0",
  defaultUserDownMbps: "0",
  defaultUserUpMbps: "0",
  allocationStrategy: "STATIC" as string,
  frPoolName: "",
  ipRangeStart: "",
  ipRangeEnd: "",
};
const emptyIpForm = { ip: "", subnetId: "", assignedTo: "", mac: "", hostname: "", status: "free" };
const emptyVlanForm = { vlanId: "", name: "", description: "", subnet: "" };

// ─── IPAM Page ───────────────────────────────────────────────────
export default function IpamPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  // Fetch areas for subnet mapping
  const { data: areasData } = useQuery<{
    items: Array<{ id: string; name: string; status: string }>;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["areas-list"],
    queryFn: () => apiFetch("/api/areas?limit=200"),
  });
  const areas = areasData?.items || [];

  const [tab, setTab] = useState("subnets");
  const [subnetSearch, setSubnetSearch] = useState("");
  const [subnetPage, setSubnetPage] = useState(1);
  const [ipSearch, setIpSearch] = useState("");
  const [ipPage, setIpPage] = useState(1);
  const [vlanPage, setVlanPage] = useState(1);
  const [subnetFilter, setSubnetFilter] = useState("ALL");
  const [treeView, setTreeView] = useState(false);

  // Dialogs
  const [subnetDialogOpen, setSubnetDialogOpen] = useState(false);
  const [ipDialogOpen, setIpDialogOpen] = useState(false);
  const [vlanDialogOpen, setVlanDialogOpen] = useState(false);
  const [editingSubnet, setEditingSubnet] = useState<Subnet | null>(null);
  const [editingIp, setEditingIp] = useState<IpAllocation | null>(null);
  const [editingVlan, setEditingVlan] = useState<Vlan | null>(null);
  const [subnetForm, setSubnetForm] = useState(emptySubnetForm);
  const [ipForm, setIpForm] = useState(emptyIpForm);
  const [vlanForm, setVlanForm] = useState(emptyVlanForm);
  const [deleteSubnetTarget, setDeleteSubnetTarget] = useState<Subnet | null>(null);
  const [deleteIpTarget, setDeleteIpTarget] = useState<IpAllocation | null>(null);
  const [deleteVlanTarget, setDeleteVlanTarget] = useState<Vlan | null>(null);
  const [viewIp, setViewIp] = useState<IpAllocation | null>(null);

  // CSV Import
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importType, setImportType] = useState<"ip" | "subnet">("subnet");
  const [importSubnetId, setImportSubnetId] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // IP Assignment History
  const [historyIp, setHistoryIp] = useState<IpAllocation | null>(null);

  // Custom fields for IP
  const [customFieldKey, setCustomFieldKey] = useState("");
  const [customFieldValue, setCustomFieldValue] = useState("");

  // RADIUS Pools state
  const [radiusPoolFilter, setRadiusPoolFilter] = useState("all");
  const [radiusPoolSearch, setRadiusPoolSearch] = useState("");
  const [radiusPoolNameFilter, setRadiusPoolNameFilter] = useState("all");
  const [populatePoolDialogOpen, setPopulatePoolDialogOpen] = useState(false);
  const [populatePoolForm, setPopulatePoolForm] = useState({
    poolName: "",
    subnetId: "",
    startIp: "",
    endIp: "",
    gateway: "",
  });
  const [clearPoolTarget, setClearPoolTarget] = useState<string | null>(null);

  // Subscriber assignment state
  const [assignSubscriberDialogOpen, setAssignSubscriberDialogOpen] = useState(false);
  const [assignSubscriberForm, setAssignSubscriberForm] = useState({
    username: "",
    strategy: "STATIC",
  });

  // Main query
  const { data, isLoading } = useQuery<IpamData>({
    queryKey: ["ipam", tab, subnetSearch, subnetPage, ipSearch, ipPage, vlanPage, subnetFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (subnetSearch || tab === "subnets") params.set("subnetFilter", subnetSearch);
      if (tab === "ips") params.set("search", ipSearch);
      else if (tab === "vlans") params.set("search", ipSearch);
      params.set("subnetPage", String(subnetPage));
      params.set("ipPage", String(ipPage));
      params.set("vlanPage", String(vlanPage));
      return apiFetch<IpamData>(`/api/ipam?${params}`);
    },
  });

  // RADIUS Pools query
  const { data: radiusPoolsData, isLoading: radiusPoolsLoading } = useQuery<RadiusPoolsData>({
    queryKey: ["radius-pools", radiusPoolFilter, radiusPoolSearch, radiusPoolNameFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (radiusPoolFilter !== "all") params.set("status", radiusPoolFilter);
      if (radiusPoolSearch) params.set("search", radiusPoolSearch);
      if (radiusPoolNameFilter !== "all") params.set("poolName", radiusPoolNameFilter);
      return apiFetch<RadiusPoolsData>(`/api/ipam/radius-pools?${params}`);
    },
    enabled: tab === "radius-pools",
  });

  const subnets = data?.subnets || [];
  const ips = data?.ips || [];
  const vlans = data?.vlans || [];
  const totalIps = data?.stats?.totalIps || 0;
  const usedIps = data?.stats?.usedIps || 0;

  const filteredIps = ips.filter((i) => {
    const matchSearch = !ipSearch || i.ip.includes(ipSearch) || i.assignedTo.toLowerCase().includes(ipSearch.toLowerCase()) || i.hostname.toLowerCase().includes(ipSearch.toLowerCase());
    const matchSubnet = subnetFilter === "ALL" || i.subnet === subnetFilter;
    return matchSearch && matchSubnet;
  });

  // RADIUS pools filtered entries
  const radiusEntries = radiusPoolsData?.entries || [];
  const radiusPoolNames = [...new Set(radiusEntries.map((e) => e.poolName))].sort();
  const filteredRadiusEntries = radiusEntries.filter((e) => {
    const matchStatus = radiusPoolFilter === "all" || e.status === radiusPoolFilter;
    const matchPoolName = radiusPoolNameFilter === "all" || e.poolName === radiusPoolNameFilter;
    const matchSearch = !radiusPoolSearch || e.username.toLowerCase().includes(radiusPoolSearch.toLowerCase()) || e.framedIp.includes(radiusPoolSearch);
    return matchStatus && matchPoolName && matchSearch;
  });

  // Build tree structure for subnets
  const buildSubnetTree = (): Subnet[] => {
    const map = new Map<string, Subnet & { children: Subnet[] }>();
    const roots: (Subnet & { children: Subnet[] })[] = [];
    subnets.forEach((s) => {
      map.set(s.id, { ...s, children: [] } as Subnet & { children: Subnet[] });
    });
    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  };
  const subnetTree = buildSubnetTree();

  // IP assignment history query
  const { data: historyData } = useQuery<{ history: IpAssignmentRecord[] }>({
    queryKey: ["ip-history", historyIp?.id],
    queryFn: () => apiFetch<{ history: IpAssignmentRecord[] }>(`/api/ipam/assignment-history?ipAddressId=${historyIp!.id}`).catch(() => ({ history: [] })),
    enabled: !!historyIp,
    staleTime: 10000,
  });

  // Gateway config query (for QoS gating)
  const { data: gatewayConfig } = useQuery<{ data: { gatewayMode: string; tcEnabled: boolean } }>({
    queryKey: ["gateway-config"],
    queryFn: () => apiFetch("/api/gateway/config?XTransformPort=3005").catch(() => null),
    staleTime: 60_000,
  });
  const isGatewayMode = gatewayConfig?.data?.gatewayMode !== "BRIDGE";
  const isTcGloballyEnabled = gatewayConfig?.data?.tcEnabled === true;

  // Trends query — use real snapshots from snapshots API
  const { data: trendsData } = useQuery<{ months: TrendData[] }>({
    queryKey: ["ipam-trends"],
    queryFn: async () => {
      try {
        const snapshots = await apiFetch<{ snapshots: { snapshotDate: string; totalIps: number; usedIps: number; freeIps: number; utilizationPct: number }[] }>("/api/ipam/snapshots?days=30");
        if (snapshots?.snapshots?.length > 0) {
          // Group snapshots by month and take the latest per month
          const monthMap: Record<string, TrendData> = {};
          for (const s of snapshots.snapshots) {
            const d = new Date(s.snapshotDate);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            if (!monthMap[key]) {
              monthMap[key] = { month: d.toLocaleDateString("en-IN", { month: "short" }), used: s.usedIps, total: s.totalIps, utilization: s.utilizationPct || (s.totalIps > 0 ? (s.usedIps / s.totalIps) * 100 : 0) };
            }
          }
          return { months: Object.values(monthMap).slice(-6) };
        }
      } catch {}
      // Fallback to old trends endpoint
      return apiFetch<{ months: TrendData[] }>("/api/ipam/trends").catch(() => ({ months: [] }));
    },
    staleTime: 60 * 1000,
  });

  // CSV Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      const file = fileInputRef.current?.files?.[0];
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", importType);
      if (importSubnetId) formData.append("subnetId", importSubnetId);
      const res = await fetch("/api/ipam/import", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: (result) => {
      toast.success(`Imported ${result.created} entries (${result.errors} errors)`);
      setImportDialogOpen(false);
      setImporting(false);
      queryClient.invalidateQueries({ queryKey: ["ipam"] });
    },
    onError: () => { toast.error("Failed to import CSV"); setImporting(false); },
  });

  // Mutations
  const ipamMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/ipam", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d, vars) => {
      const action = vars.action as string;
      if (d.success) {
        toast.success(d.message || `${action.replace(/-/g, " ")} successfully`);
        setSubnetDialogOpen(false); setEditingSubnet(null); setSubnetForm(emptySubnetForm);
        setIpDialogOpen(false); setEditingIp(null); setIpForm(emptyIpForm);
        setVlanDialogOpen(false); setEditingVlan(null); setVlanForm(emptyVlanForm);
        setViewIp(null);
        queryClient.invalidateQueries({ queryKey: ["ipam"] });
      } else {
        toast.error(d.error || "Failed");
      }
    },
    onError: () => toast.error("Operation failed"),
  });

  // Populate Pool mutation
  const populatePoolMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/ipam/radius-pools", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d) => {
      if (d.success) {
        toast.success(d.message || "Pool populated successfully");
        setPopulatePoolDialogOpen(false);
        setPopulatePoolForm({ poolName: "", subnetId: "", startIp: "", endIp: "", gateway: "" });
        queryClient.invalidateQueries({ queryKey: ["radius-pools"] });
      } else {
        toast.error(d.error || "Failed to populate pool");
      }
    },
    onError: () => toast.error("Failed to populate pool"),
  });

  // Clear Pool mutation
  const clearPoolMutation = useMutation({
    mutationFn: (poolName: string) => apiFetch(`/api/ipam/radius-pools?poolName=${encodeURIComponent(poolName)}`, { method: "DELETE" }),
    onSuccess: (d) => {
      if (d.success) {
        toast.success(d.message || "Pool cleared successfully");
        setClearPoolTarget(null);
        queryClient.invalidateQueries({ queryKey: ["radius-pools"] });
      } else {
        toast.error(d.error || "Failed to clear pool");
      }
    },
    onError: () => toast.error("Failed to clear pool"),
  });

  // Sync Pool to IPAM mutation
  const syncPoolMutation = useMutation({
    mutationFn: (poolName: string) => apiFetch("/api/ipam/radius-pools", { method: "PATCH", body: JSON.stringify({ action: "sync-to-ipam", poolName }) }),
    onSuccess: (d) => {
      if (d.success) {
        toast.success(d.message || "Pool synced to IPAM successfully");
        queryClient.invalidateQueries({ queryKey: ["radius-pools"] });
        queryClient.invalidateQueries({ queryKey: ["ipam"] });
      } else {
        toast.error(d.error || "Failed to sync pool");
      }
    },
    onError: () => toast.error("Failed to sync pool to IPAM"),
  });

  // Subscriber assignment mutation
  const subscriberAssignmentMutation = useMutation({
    mutationFn: (body: { action: string; ipId: string; username: string; strategy: string }) =>
      apiFetch("/api/ipam/assign-subscriber", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d) => {
      if (d.success) {
        toast.success(d.message || "Subscriber assignment updated");
        setAssignSubscriberDialogOpen(false);
        setAssignSubscriberForm({ username: "", strategy: "STATIC" });
        queryClient.invalidateQueries({ queryKey: ["ipam"] });
      } else {
        toast.error(d.error || "Failed to update subscriber assignment");
      }
    },
    onError: () => toast.error("Failed to update subscriber assignment"),
  });

  // Helpers
  const parseCustomFields = (json: string): Record<string, string> => {
    try { return JSON.parse(json); } catch { return {}; }
  };

  const renderSubnetRow = (sn: Subnet, depth: number) => {
    const pct = sn.totalIps > 0 ? Math.round((sn.usedIps / sn.totalIps) * 100) : 0;
    const hasChildren = subnets.some((s) => s.parentId === sn.id);
    return (
      <TableRow key={sn.id} className="hover:bg-muted/50 transition-colors duration-150 group">
        <TableCell>
          <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
            {treeView && (
              hasChildren ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <span className="w-3.5 h-3.5 shrink-0" />
              )
            )}
            <p className="text-sm font-medium truncate">{sn.name}</p>
            {treeView && hasChildren && (
              <Badge variant="outline" className="text-[10px] ml-1">folder</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground" style={{ paddingLeft: `${depth * 20}px` }}>{sn.description}</p>
        </TableCell>
        <TableCell className="font-mono text-sm">{sn.network}</TableCell>
        {isModuleEnabled("ipv6") && sn.networkv6 && (
          <TableCell className="font-mono text-xs">
            <span className="text-cyan-700 dark:text-cyan-400">IPv6:</span>{" "}
            {sn.networkv6}/{sn.prefixv6}
          </TableCell>
        )}
        <TableCell className="font-mono text-sm">{sn.gateway}</TableCell>
        <TableCell className="text-center text-sm tabular-nums">{sn.totalIps.toLocaleString()}</TableCell>
        <TableCell className="text-sm tabular-nums">{sn.usedIps} / {sn.totalIps - sn.usedIps}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2 min-w-[120px]">
            <Progress value={pct} className={`h-2 flex-1 ${getUtilColor(pct)}`} />
            <span className="text-xs tabular-nums w-10 text-right">{pct}%</span>
          </div>
        </TableCell>
        <TableCell><Badge variant="outline" className="text-xs">VLAN {sn.vlan || "—"}</Badge></TableCell>
        <TableCell>
          <AllocationStrategyBadge strategy={sn.allocationStrategy || "STATIC"} />
        </TableCell>
        <TableCell>{sn.areaName ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">{sn.areaName}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
        <TableCell>{sn.tcEnabled ? <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs"><Zap className="h-3 w-3 mr-1" />QoS</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSubnetDialog(sn)}><Edit2 className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteSubnetTarget(sn)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderSubnetTree = (nodes: (Subnet & { children?: Subnet[] })[], depth: number = 0) => {
    return nodes.flatMap((node) => [
      renderSubnetRow(node, depth),
      ...(node.children && node.children.length > 0 ? renderSubnetTree(node.children as any, depth + 1) : []),
    ]);
  };

  const openSubnetDialog = (sn?: Subnet) => {
    if (sn) {
      setEditingSubnet(sn);
      setSubnetForm({
        name: sn.name, network: sn.network, gateway: sn.gateway, vlan: sn.vlan,
        description: sn.description, networkv6: sn.networkv6 || "", prefixv6: sn.prefixv6 || "",
        parentId: sn.parentId || "", areaId: sn.areaId || "",
        tcEnabled: sn.tcEnabled || false,
        bandwidthPoolDownMbps: String(sn.bandwidthPoolDownMbps || ""),
        bandwidthBurstDownMbps: String(sn.bandwidthBurstDownMbps || ""),
        bandwidthPoolUpMbps: String(sn.bandwidthPoolUpMbps || ""),
        bandwidthBurstUpMbps: String(sn.bandwidthBurstUpMbps || ""),
        defaultUserDownMbps: String(sn.defaultUserDownMbps || ""),
        defaultUserUpMbps: String(sn.defaultUserUpMbps || ""),
        allocationStrategy: sn.allocationStrategy || "STATIC",
        frPoolName: sn.frPoolName || "",
        ipRangeStart: sn.ipRangeStart || "",
        ipRangeEnd: sn.ipRangeEnd || "",
      });
    } else {
      setEditingSubnet(null);
      setSubnetForm(emptySubnetForm);
    }
    setSubnetDialogOpen(true);
  };

  const openIpDialog = (ip?: IpAllocation) => {
    if (ip) { setEditingIp(ip); setIpForm({ ip: ip.ip, subnetId: ip.subnetId, assignedTo: ip.assignedTo, mac: ip.mac, hostname: ip.hostname, status: ip.status.toLowerCase() }); }
    else { setEditingIp(null); setIpForm(emptyIpForm); }
    setIpDialogOpen(true);
  };

  const openVlanDialog = (v?: Vlan) => {
    if (v) { setEditingVlan(v); setVlanForm({ vlanId: v.vlanId, name: v.name, description: v.description, subnet: v.subnet }); }
    else { setEditingVlan(null); setVlanForm(emptyVlanForm); }
    setVlanDialogOpen(true);
  };

  const handleSaveSubnet = () => {
    if (!subnetForm.name || !subnetForm.network) { toast.error("Name and network are required"); return; }
    const tcFields = {
      tcEnabled: subnetForm.tcEnabled,
      bandwidthPoolDownMbps: Number(subnetForm.bandwidthPoolDownMbps) || 0,
      bandwidthBurstDownMbps: Number(subnetForm.bandwidthBurstDownMbps) || 0,
      bandwidthPoolUpMbps: Number(subnetForm.bandwidthPoolUpMbps) || 0,
      bandwidthBurstUpMbps: Number(subnetForm.bandwidthBurstUpMbps) || 0,
      defaultUserDownMbps: Number(subnetForm.defaultUserDownMbps) || 0,
      defaultUserUpMbps: Number(subnetForm.defaultUserUpMbps) || 0,
    };
    const strategyFields = {
      allocationStrategy: subnetForm.allocationStrategy,
      frPoolName: subnetForm.frPoolName,
      ipRangeStart: subnetForm.ipRangeStart,
      ipRangeEnd: subnetForm.ipRangeEnd,
    };
    if (editingSubnet) {
      ipamMutation.mutate({ action: "update-subnet", id: editingSubnet.id, name: subnetForm.name, network: subnetForm.network, gateway: subnetForm.gateway, vlan: subnetForm.vlan, description: subnetForm.description, networkv6: subnetForm.networkv6, prefixv6: subnetForm.prefixv6, parentId: subnetForm.parentId, areaId: subnetForm.areaId, ...tcFields, ...strategyFields });
    } else {
      // Check for CIDR overlap before creating
      apiFetch("/api/ipam/conflict-check", { method: "POST", body: JSON.stringify({ cidr: subnetForm.network }) })
        .then((res: unknown) => {
          const data = res as { conflicts?: Array<{ type: string; existing: { name: string; network: string } }> };
          if (data.conflicts && data.conflicts.length > 0) {
            toast.error(`CIDR conflicts with ${data.conflicts.map((c) => c.existing.name).join(", ")}`);
            return;
          }
          ipamMutation.mutate({ action: "create-subnet", name: subnetForm.name, network: subnetForm.network, gateway: subnetForm.gateway, vlan: subnetForm.vlan, description: subnetForm.description, networkv6: subnetForm.networkv6, prefixv6: subnetForm.prefixv6, parentId: subnetForm.parentId, areaId: subnetForm.areaId, ...tcFields, ...strategyFields });
        })
        .catch(() => {
          ipamMutation.mutate({ action: "create-subnet", name: subnetForm.name, network: subnetForm.network, gateway: subnetForm.gateway, vlan: subnetForm.vlan, description: subnetForm.description, networkv6: subnetForm.networkv6, prefixv6: subnetForm.prefixv6, parentId: subnetForm.parentId, areaId: subnetForm.areaId, ...tcFields, ...strategyFields });
        });
    }
  };

  const handleSaveIp = () => {
    if (!ipForm.ip || !ipForm.subnetId) { toast.error("IP and Subnet are required"); return; }
    if (editingIp) {
      ipamMutation.mutate({ action: "update-ip", id: editingIp.id, address: ipForm.ip, status: ipForm.status || "free", hostname: ipForm.hostname, macAddress: ipForm.mac, description: ipForm.assignedTo });
    } else {
      ipamMutation.mutate({ action: "allocate-ip", address: ipForm.ip, subnetId: ipForm.subnetId, status: ipForm.assignedTo ? "used" : "free", hostname: ipForm.hostname, macAddress: ipForm.mac, description: ipForm.assignedTo });
    }
  };

  const handleSaveVlan = () => {
    if (!vlanForm.vlanId || !vlanForm.name) { toast.error("VLAN ID and name are required"); return; }
    if (editingVlan) {
      ipamMutation.mutate({ action: "update-vlan", id: editingVlan.id, ...vlanForm });
    } else {
      ipamMutation.mutate({ action: "create-vlan", ...vlanForm });
    }
  };

  const handleAddCustomField = () => {
    if (!customFieldKey.trim()) return;
    if (!viewIp) return;
    const existing = parseCustomFields(viewIp.customFields);
    existing[customFieldKey.trim()] = customFieldValue;
    ipamMutation.mutate({ action: "update-ip", id: viewIp.id, customFields: JSON.stringify(existing) });
    setCustomFieldKey("");
    setCustomFieldValue("");
  };

  const handleRemoveCustomField = (key: string) => {
    if (!viewIp) return;
    const existing = parseCustomFields(viewIp.customFields);
    delete existing[key];
    ipamMutation.mutate({ action: "update-ip", id: viewIp.id, customFields: JSON.stringify(existing) });
  };

  const handleSyncFromFr = useCallback(() => {
    if (!subnetForm.frPoolName) {
      toast.error("Enter a pool name first");
      return;
    }
    toast.info(`Syncing pool "${subnetForm.frPoolName}" from FreeRADIUS...`);
    apiFetch(`/api/ipam/radius-pools?poolName=${encodeURIComponent(subnetForm.frPoolName)}`)
      .then((res: unknown) => {
        const data = res as RadiusPoolsData;
        if (data?.entries?.length > 0) {
          const active = data.entries.filter((e) => e.status === "active");
          toast.success(`Found ${data.entries.length} entries (${active.length} active) in pool "${subnetForm.frPoolName}"`);
        } else {
          toast.warning(`No entries found for pool "${subnetForm.frPoolName}"`);
        }
      })
      .catch(() => toast.error("Failed to sync from FreeRADIUS"));
  }, [subnetForm.frPoolName]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
        <Skeleton className="skeleton-wave h-10 w-full" />
        <Card className="border shadow-sm"><CardContent className="p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">IP Address Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage subnets, IP allocations, and VLANs</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />Import CSV
          </Button>
          <Button variant="outline" onClick={() => { const a = document.createElement("a"); a.href = "/api/ipam/export?type=all&format=csv"; a.download = `ipam-export-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); toast.success("Export started"); }}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button variant="outline" onClick={async () => { try { const res = await apiFetch("/api/ipam/dhcp-sync", { method: "POST" }); toast.success(`DHCP Sync: ${res.created} created, ${res.updated} updated`); queryClient.invalidateQueries({ queryKey: ["ipam"] }); } catch (e: unknown) { toast.error((e as Error).message || "DHCP sync failed"); } }}>
            <RefreshCw className="h-4 w-4 mr-2" />DHCP Sync
          </Button>
          <Dialog open={subnetDialogOpen} onOpenChange={(o) => { setSubnetDialogOpen(o); if (!o) { setEditingSubnet(null); setSubnetForm(emptySubnetForm); } }}>
            <DialogTrigger asChild>
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"><Plus className="h-4 w-4 mr-2" />Add Subnet</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingSubnet ? "Edit Subnet" : "Add Subnet"}</DialogTitle><DialogDescription>{editingSubnet ? "Update subnet configuration" : "Create a new subnet"}</DialogDescription></DialogHeader>
              <div className="grid gap-4 py-4">
                <div><Label className="text-sm font-medium mb-1 block">Subnet Name *</Label><Input value={subnetForm.name} onChange={(e) => setSubnetForm({ ...subnetForm, name: e.target.value })} placeholder="Management Network" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm font-medium mb-1 block">Network (CIDR) *</Label><Input value={subnetForm.network} onChange={(e) => setSubnetForm({ ...subnetForm, network: e.target.value })} placeholder="192.168.1.0/24" /></div>
                  <div><Label className="text-sm font-medium mb-1 block">Gateway</Label><Input value={subnetForm.gateway} onChange={(e) => setSubnetForm({ ...subnetForm, gateway: e.target.value })} placeholder="192.168.1.1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm font-medium mb-1 block">IPv6 Network</Label><Input value={subnetForm.networkv6} onChange={(e) => setSubnetForm({ ...subnetForm, networkv6: e.target.value })} placeholder="2001:db8::/32" /></div>
                  <div><Label className="text-sm font-medium mb-1 block">IPv6 Prefix</Label><Input value={subnetForm.prefixv6} onChange={(e) => setSubnetForm({ ...subnetForm, prefixv6: e.target.value })} placeholder="64" /></div>
                </div>
                {isModuleEnabled("ipv6") && (
                  <div className="space-y-2 p-3 bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-cyan-600" />
                      <span className="text-sm font-semibold">IPv6 Prefix Management</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Define IPv6 prefixes here. Individual IPv6 address management within prefixes is available when the IPv6 module is enabled.
                    </p>
                  </div>
                )}
                <div><Label className="text-sm font-medium mb-1 block">Parent Subnet</Label>
                  <Select value={subnetForm.parentId} onValueChange={(v) => setSubnetForm({ ...subnetForm, parentId: v })}>
                    <SelectTrigger><SelectValue placeholder="None (root)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None (root level)</SelectItem>
                      {subnets.filter((s) => s.id !== editingSubnet?.id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.network})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-sm font-medium mb-1 block">Area Mapping</Label>
                  <Select value={subnetForm.areaId || "__none__"} onValueChange={(v) => setSubnetForm({ ...subnetForm, areaId: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="No area assigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No area assigned</SelectItem>
                      {areas.filter((a) => a.status === "ACTIVE").map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-sm font-medium mb-1 block">VLAN ID</Label><Input value={subnetForm.vlan} onChange={(e) => setSubnetForm({ ...subnetForm, vlan: e.target.value })} placeholder="10" /></div>

                {/* ─── Allocation Strategy Section ─── */}
                <Separator className="my-1" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Pin className="h-4 w-4 text-red-500" />
                        Allocation Strategy
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px]">Defines how IPs are assigned from this subnet pool. Choose between static, DHCP, full allow range, or unrestricted modes.</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <Select value={subnetForm.allocationStrategy} onValueChange={(v) => setSubnetForm({ ...subnetForm, allocationStrategy: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALLOCATION_STRATEGIES.map((s) => {
                        const Icon = s.icon;
                        return (
                          <SelectItem key={s.value} value={s.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{s.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {ALLOCATION_STRATEGIES.find((s) => s.value === subnetForm.allocationStrategy)?.description}
                  </p>
                </div>

                {/* Visual strategy indicator */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Current:</span>
                  <AllocationStrategyBadge strategy={subnetForm.allocationStrategy} />
                </div>

                {/* Conditional fields based on strategy */}
                {subnetForm.allocationStrategy === "DHCP_POOL" && (
                  <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Radio className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">FreeRADIUS Pool Configuration</span>
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Pool Name (radippool)</Label>
                      <div className="flex gap-2">
                        <Input
                          value={subnetForm.frPoolName}
                          onChange={(e) => setSubnetForm({ ...subnetForm, frPoolName: e.target.value })}
                          placeholder="pool_isp_main"
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 gap-1.5"
                          onClick={handleSyncFromFr}
                          disabled={!subnetForm.frPoolName}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Sync from FR
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Name of the pool in FreeRADIUS radippool table</p>
                    </div>
                  </div>
                )}

                {subnetForm.allocationStrategy === "FULL_ALLOW" && (
                  <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">IP Range Configuration</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Range Start</Label>
                        <Input
                          value={subnetForm.ipRangeStart}
                          onChange={(e) => setSubnetForm({ ...subnetForm, ipRangeStart: e.target.value })}
                          placeholder="192.168.1.100"
                          className="font-mono"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Range End</Label>
                        <Input
                          value={subnetForm.ipRangeEnd}
                          onChange={(e) => setSubnetForm({ ...subnetForm, ipRangeEnd: e.target.value })}
                          placeholder="192.168.1.254"
                          className="font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Any IP within this range will be allowed for assignment</p>
                  </div>
                )}

                {/* ─── QoS / Traffic Shaping Section ─── */}
                <Separator className="my-1" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="tc-toggle" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                        <Zap className="h-4 w-4 text-amber-500" />
                        Enable Traffic Shaping
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px]">Requires Gateway Mode to be enabled in Module Manager. Configures HTB-based bandwidth limits for this subnet pool.</TooltipContent>
                      </Tooltip>
                    </div>
                    <Switch
                      id="tc-toggle"
                      checked={subnetForm.tcEnabled}
                      disabled={!isGatewayMode || !isTcGloballyEnabled}
                      onCheckedChange={(checked) => setSubnetForm({ ...subnetForm, tcEnabled: checked })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Configure bandwidth limits and QoS for this subnet pool</p>
                </div>

                {!isGatewayMode || !isTcGloballyEnabled ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Gateway Mode is not enabled or Traffic Control is inactive. Traffic shaping requires Gateway Mode to be active. Enable it in <strong>Settings &gt; Module Manager</strong>.
                    </p>
                  </div>
                ) : null}

                {subnetForm.tcEnabled && (
                  <div className={`space-y-4 rounded-lg border bg-muted/20 p-4 ${!isGatewayMode || !isTcGloballyEnabled ? "opacity-50 pointer-events-none" : ""}`}>
                    {/* Bandwidth Pool row */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Bandwidth Pool</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="relative">
                          <Label className="text-sm font-medium mb-1 block">Download</Label>
                          <div className="relative">
                            <Input
                              type="number" min="0" step="1"
                              value={subnetForm.bandwidthPoolDownMbps}
                              onChange={(e) => setSubnetForm({ ...subnetForm, bandwidthPoolDownMbps: e.target.value })}
                              placeholder="1000"
                              className="pr-12"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">Mbps</span>
                          </div>
                        </div>
                        <div className="relative">
                          <Label className="text-sm font-medium mb-1 block">Upload</Label>
                          <div className="relative">
                            <Input
                              type="number" min="0" step="1"
                              value={subnetForm.bandwidthPoolUpMbps}
                              onChange={(e) => setSubnetForm({ ...subnetForm, bandwidthPoolUpMbps: e.target.value })}
                              placeholder="500"
                              className="pr-12"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">Mbps</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Burst Limit row */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Burst Limit</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="relative">
                          <Label className="text-sm font-medium mb-1 block">Download</Label>
                          <div className="relative">
                            <Input
                              type="number" min="0" step="1"
                              value={subnetForm.bandwidthBurstDownMbps}
                              onChange={(e) => setSubnetForm({ ...subnetForm, bandwidthBurstDownMbps: e.target.value })}
                              placeholder="1500"
                              className="pr-12"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">Mbps</span>
                          </div>
                        </div>
                        <div className="relative">
                          <Label className="text-sm font-medium mb-1 block">Upload</Label>
                          <div className="relative">
                            <Input
                              type="number" min="0" step="1"
                              value={subnetForm.bandwidthBurstUpMbps}
                              onChange={(e) => setSubnetForm({ ...subnetForm, bandwidthBurstUpMbps: e.target.value })}
                              placeholder="750"
                              className="pr-12"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">Mbps</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Default User Speed row */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Default User Speed</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="relative">
                          <Label className="text-sm font-medium mb-1 block">Download</Label>
                          <div className="relative">
                            <Input
                              type="number" min="0" step="1"
                              value={subnetForm.defaultUserDownMbps}
                              onChange={(e) => setSubnetForm({ ...subnetForm, defaultUserDownMbps: e.target.value })}
                              placeholder="10"
                              className="pr-12"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">Mbps</span>
                          </div>
                        </div>
                        <div className="relative">
                          <Label className="text-sm font-medium mb-1 block">Upload</Label>
                          <div className="relative">
                            <Input
                              type="number" min="0" step="1"
                              value={subnetForm.defaultUserUpMbps}
                              onChange={(e) => setSubnetForm({ ...subnetForm, defaultUserUpMbps: e.target.value })}
                              placeholder="5"
                              className="pr-12"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">Mbps</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div><Label className="text-sm font-medium mb-1 block">Description</Label><Input value={subnetForm.description} onChange={(e) => setSubnetForm({ ...subnetForm, description: e.target.value })} placeholder="Core management network" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setSubnetDialogOpen(false); setEditingSubnet(null); setSubnetForm(emptySubnetForm); }}>Cancel</Button>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={handleSaveSubnet} disabled={ipamMutation.isPending}>{ipamMutation.isPending ? "Saving..." : editingSubnet ? "Update" : "Add Subnet"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={ipDialogOpen} onOpenChange={(o) => { setIpDialogOpen(o); if (!o) { setEditingIp(null); setIpForm(emptyIpForm); } }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="h-4 w-4 mr-2" />Assign IP</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingIp ? "Edit IP Address" : "Assign IP Address"}</DialogTitle><DialogDescription>{editingIp ? "Update IP allocation" : "Allocate a new IP address"}</DialogDescription></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm font-medium mb-1 block">IP Address *</Label><Input value={ipForm.ip} onChange={(e) => setIpForm({ ...ipForm, ip: e.target.value })} placeholder="192.168.1.100" /></div>
                  <div><Label className="text-sm font-medium mb-1 block">Subnet *</Label>
                    <Select value={ipForm.subnetId} onValueChange={(v) => setIpForm({ ...ipForm, subnetId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select subnet" /></SelectTrigger>
                      <SelectContent>{subnets.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.network})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-sm font-medium mb-1 block">Status</Label>
                  <Select value={ipForm.status} onValueChange={(v) => setIpForm({ ...ipForm, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="free">Free</SelectItem><SelectItem value="used">Used</SelectItem><SelectItem value="reserved">Reserved</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-sm font-medium mb-1 block">Assigned To</Label><Input value={ipForm.assignedTo} onChange={(e) => setIpForm({ ...ipForm, assignedTo: e.target.value })} placeholder="Subscriber name or device" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm font-medium mb-1 block">MAC Address</Label><Input value={ipForm.mac} onChange={(e) => setIpForm({ ...ipForm, mac: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" /></div>
                  <div><Label className="text-sm font-medium mb-1 block">Hostname</Label><Input value={ipForm.hostname} onChange={(e) => setIpForm({ ...ipForm, hostname: e.target.value })} placeholder="device-01" /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIpDialogOpen(false); setEditingIp(null); setIpForm(emptyIpForm); }}>Cancel</Button>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={handleSaveIp} disabled={ipamMutation.isPending}>{ipamMutation.isPending ? "Saving..." : editingIp ? "Update" : "Assign"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={vlanDialogOpen} onOpenChange={(o) => { setVlanDialogOpen(o); if (!o) { setEditingVlan(null); setVlanForm(emptyVlanForm); } }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="h-4 w-4 mr-2" />Add VLAN</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingVlan ? "Edit VLAN" : "Add VLAN"}</DialogTitle><DialogDescription>{editingVlan ? "Update VLAN configuration" : "Create a new VLAN"}</DialogDescription></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-sm font-medium mb-1 block">VLAN ID *</Label><Input type="number" value={vlanForm.vlanId} onChange={(e) => setVlanForm({ ...vlanForm, vlanId: e.target.value })} placeholder="10" /></div>
                  <div><Label className="text-sm font-medium mb-1 block">Name *</Label><Input value={vlanForm.name} onChange={(e) => setVlanForm({ ...vlanForm, name: e.target.value })} placeholder="Management VLAN" /></div>
                </div>
                <div><Label className="text-sm font-medium mb-1 block">Subnet</Label><Input value={vlanForm.subnet} onChange={(e) => setVlanForm({ ...vlanForm, subnet: e.target.value })} placeholder="192.168.10.0/24" /></div>
                <div><Label className="text-sm font-medium mb-1 block">Description</Label><Textarea value={vlanForm.description} onChange={(e) => setVlanForm({ ...vlanForm, description: e.target.value })} placeholder="VLAN description..." rows={2} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setVlanDialogOpen(false); setEditingVlan(null); setVlanForm(emptyVlanForm); }}>Cancel</Button>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={handleSaveVlan} disabled={ipamMutation.isPending}>{ipamMutation.isPending ? "Saving..." : editingVlan ? "Update" : "Add VLAN"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Subnets" value={data?.stats?.totalSubnets || 0} subtitle={`${vlans.length} VLANs configured`} icon={Layers} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Total IPs" value={totalIps.toLocaleString()} subtitle="Across all subnets" icon={Globe} gradient="stat-gradient-blue" delay={75} />
        <StatCard title="Used IPs" value={usedIps.toLocaleString()} subtitle={`${totalIps > 0 ? Math.round((usedIps / totalIps) * 100) : 0}% utilization`} icon={MonitorCheck} gradient="stat-gradient-amber" delay={150} />
        <StatCard title="Available IPs" value={(totalIps - usedIps).toLocaleString()} subtitle="Ready for allocation" icon={MonitorX} gradient="stat-gradient-green" delay={225} />
      </div>

      {/* IP Usage Trend Chart */}
      {trendsData && trendsData.months.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-500" />IP Usage Trend</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-end gap-1 h-24">
              {trendsData.months.map((m) => {
                const allocated = m.allocated ?? m.used ?? 0;
                const free = m.free ?? ((m.total ?? 0) - (m.used ?? 0));
                const total = allocated + free;
                const pct = total > 0 ? (allocated / total) * 100 : 0;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col-reverse gap-px" style={{ height: "80px" }}>
                      <div className="w-full rounded-t-sm bg-green-500/80" style={{ height: `${Math.max(pct, 2)}%` }} title={`Allocated: ${allocated}`} />
                      <div className="w-full rounded-b-sm bg-muted/40 flex-1" title={`Free: ${free}`} />
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">{m.month.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="subnets">Subnets</TabsTrigger>
          <TabsTrigger value="ips">IP Allocations</TabsTrigger>
          <TabsTrigger value="vlans">VLANs</TabsTrigger>
          <TabsTrigger value="radius-pools">
            <Radio className="h-3.5 w-3.5 mr-1" />RADIUS Pools
          </TabsTrigger>
          <TabsTrigger value="cgnat">
            <Shield className="h-3.5 w-3.5 mr-1" />CGNAT
          </TabsTrigger>
        </TabsList>

        {/* Subnets Tab */}
        <TabsContent value="subnets">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search subnets..." value={subnetSearch} onChange={(e) => { setSubnetSearch(e.target.value); setSubnetPage(1); }} className="pl-8" />
                </div>
                <Button variant="outline" size="sm" onClick={() => setTreeView(!treeView)} className="gap-1.5">
                  {treeView ? <List className="h-3.5 w-3.5" /> : <TreePine className="h-3.5 w-3.5" />}
                  {treeView ? "List" : "Tree"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Subnet Name</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Network</TableHead>
                      {treeView && <TableHead className="text-xs font-medium uppercase">IPv6</TableHead>}
                      <TableHead className="text-xs font-medium uppercase">Gateway</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-center">Total IPs</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Used / Free</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Utilization</TableHead>
                      <TableHead className="text-xs font-medium uppercase">VLAN</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Strategy</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Area</TableHead>
                      <TableHead className="text-xs font-medium uppercase">QoS</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subnets.length === 0 ? (
                      <TableRow><TableCell colSpan={treeView ? 12 : 11} className="text-center py-12 text-muted-foreground">No subnets found.</TableCell></TableRow>
                    ) : treeView ? (
                      renderSubnetTree(subnetTree)
                    ) : subnets.map((sn) => {
                      const pct = sn.totalIps > 0 ? Math.round((sn.usedIps / sn.totalIps) * 100) : 0;
                      return (
                        <TableRow key={sn.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell>
                            <div><p className="text-sm font-medium">{sn.name}</p><p className="text-xs text-muted-foreground">{sn.description}</p></div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{sn.network}</TableCell>
                          <TableCell className="font-mono text-sm">{sn.gateway}</TableCell>
                          <TableCell className="text-center text-sm tabular-nums">{sn.totalIps.toLocaleString()}</TableCell>
                          <TableCell className="text-sm tabular-nums">{sn.usedIps} / {sn.totalIps - sn.usedIps}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <Progress value={pct} className={`h-2 flex-1 ${getUtilColor(pct)}`} />
                              <span className="text-xs tabular-nums w-10 text-right">{pct}%</span>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">VLAN {sn.vlan || "—"}</Badge></TableCell>
                          <TableCell>
                            <AllocationStrategyBadge strategy={sn.allocationStrategy || "STATIC"} />
                          </TableCell>
                          <TableCell>{sn.areaName ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">{sn.areaName}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                          <TableCell>{sn.tcEnabled ? <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs"><Zap className="h-3 w-3 mr-1" />QoS</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSubnetDialog(sn)}><Edit2 className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteSubnetTarget(sn)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {data?.subnetTotalPages && data.subnetTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Showing {(subnetPage - 1) * 20 + 1}–{Math.min(subnetPage * 20, data.subnetTotal)} of {data.subnetTotal}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={subnetPage <= 1} onClick={() => setSubnetPage(subnetPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                {(() => { const pages: number[] = []; let start = Math.max(1, subnetPage - 2); let end = Math.min(data.subnetTotalPages, start + 4); if (end - start < 4) start = Math.max(1, end - 4); for (let i = start; i <= end; i++) pages.push(i); return pages.map((p) => (<Button key={p} variant={p === subnetPage ? "default" : "outline"} size="sm" className="h-8 w-8 text-xs" onClick={() => setSubnetPage(p)}>{p}</Button>)); })()}
                <Button variant="outline" size="sm" disabled={subnetPage >= data.subnetTotalPages} onClick={() => setSubnetPage(subnetPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* IP Allocations Tab */}
        <TabsContent value="ips">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by IP, name, hostname..." value={ipSearch} onChange={(e) => { setIpSearch(e.target.value); setIpPage(1); }} className="pl-8" />
                </div>
                <Select value={subnetFilter} onValueChange={setSubnetFilter}>
                  <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Filter by subnet" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Subnets</SelectItem>
                    {subnets.map((s) => <SelectItem key={s.id} value={s.network}>{s.name} ({s.network})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">IP Address</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Subnet</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Assigned To</TableHead>
                      <TableHead className="text-xs font-medium uppercase">MAC</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Hostname</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase">History</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIps.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No IP allocations found.</TableCell></TableRow>
                    ) : filteredIps.map((ip) => (
                      <TableRow key={ip.id} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell className="font-mono text-sm font-medium">{ip.ip}</TableCell>
                        <TableCell className="font-mono text-xs">{ip.subnet}</TableCell>
                        <TableCell className="text-sm">{ip.assignedTo || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="font-mono text-xs">{ip.mac || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs">{ip.hostname || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ip.status === "Used" ? "badge-active" : ip.status === "Reserved" ? "badge-suspended" : "badge-pending"}>{ip.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setHistoryIp(ip)}><History className="h-3 w-3.5 mr-1" />Log</Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewIp(ip)}><Eye className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openIpDialog(ip)}><Edit2 className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteIpTarget(ip)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {isModuleEnabled("ipv6") && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/20 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Globe className="h-4 w-4 text-cyan-600" />
                IPv6 Addresses
              </div>
              <p className="text-xs text-muted-foreground">IPv6 addresses are auto-assigned via SLAAC/DHCPv6. Static assignments can be made in the Subscriber profile.</p>
            </div>
          )}
          {data?.ipTotalPages && data.ipTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Showing {(ipPage - 1) * 20 + 1}–{Math.min(ipPage * 20, data.ipTotal)} of {data.ipTotal}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={ipPage <= 1} onClick={() => setIpPage(ipPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                {(() => { const pages: number[] = []; let start = Math.max(1, ipPage - 2); let end = Math.min(data.ipTotalPages, start + 4); if (end - start < 4) start = Math.max(1, end - 4); for (let i = start; i <= end; i++) pages.push(i); return pages.map((p) => (<Button key={p} variant={p === ipPage ? "default" : "outline"} size="sm" className="h-8 w-8 text-xs" onClick={() => setIpPage(p)}>{p}</Button>)); })()}
                <Button variant="outline" size="sm" disabled={ipPage >= data.ipTotalPages} onClick={() => setIpPage(ipPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* VLANs Tab */}
        <TabsContent value="vlans">
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">VLAN ID</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Name</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Subnet</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Description</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-center">Subnets</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vlans.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No VLANs found.</TableCell></TableRow>
                    ) : vlans.map((v) => (
                      <TableRow key={v.id} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-muted"><Layers className="h-3.5 w-3.5 text-muted-foreground" /></div>
                            <Badge variant="outline" className="font-mono font-bold">{v.vlanId}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{v.name}</TableCell>
                        <TableCell className="font-mono text-xs">{v.subnet || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{v.description || "—"}</TableCell>
                        <TableCell className="text-center text-sm tabular-nums">{v.portCount}</TableCell>
                        <TableCell><Badge variant="outline" className={v.status === "Active" ? "badge-active" : "badge-pending"}>{v.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openVlanDialog(v)}><Edit2 className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteVlanTarget(v)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {data?.vlanTotalPages && data.vlanTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Showing {(vlanPage - 1) * 20 + 1}–{Math.min(vlanPage * 20, data.vlanTotal)} of {data.vlanTotal}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={vlanPage <= 1} onClick={() => setVlanPage(vlanPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                {(() => { const pages: number[] = []; let start = Math.max(1, vlanPage - 2); let end = Math.min(data.vlanTotalPages, start + 4); if (end - start < 4) start = Math.max(1, end - 4); for (let i = start; i <= end; i++) pages.push(i); return pages.map((p) => (<Button key={p} variant={p === vlanPage ? "default" : "outline"} size="sm" className="h-8 w-8 text-xs" onClick={() => setVlanPage(p)}>{p}</Button>)); })()}
                <Button variant="outline" size="sm" disabled={vlanPage >= data.vlanTotalPages} onClick={() => setVlanPage(vlanPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── RADIUS Pools Tab ─── */}
        <TabsContent value="radius-pools">
          {/* RADIUS Pools Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40"><Radio className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Pools</p>
                    <p className="text-xl font-bold tabular-nums">{radiusPoolsData?.stats?.totalPools ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/40"><MonitorCheck className="h-5 w-5 text-green-600 dark:text-green-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Leases</p>
                    <p className="text-xl font-bold tabular-nums">{radiusPoolsData?.stats?.activeLeases ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40"><MonitorX className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expired Leases</p>
                    <p className="text-xl font-bold tabular-nums">{radiusPoolsData?.stats?.expiredLeases ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40"><Layers className="h-5 w-5 text-purple-600 dark:text-purple-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unique Pool Names</p>
                    <p className="text-xl font-bold tabular-nums">{radiusPoolsData?.stats?.uniquePoolNames ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RADIUS Pools Filters & Actions */}
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by username or IP..." value={radiusPoolSearch} onChange={(e) => setRadiusPoolSearch(e.target.value)} className="pl-8" />
                </div>
                <Select value={radiusPoolNameFilter} onValueChange={setRadiusPoolNameFilter}>
                  <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Pool Name" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Pools</SelectItem>
                    {radiusPoolNames.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={radiusPoolFilter} onValueChange={setRadiusPoolFilter}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
                <Dialog open={populatePoolDialogOpen} onOpenChange={(o) => { setPopulatePoolDialogOpen(o); if (!o) setPopulatePoolForm({ poolName: "", subnetId: "", startIp: "", endIp: "", gateway: "" }); }}>
                  <DialogTrigger asChild>
                    <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white gap-2">
                      <PlusCircle className="h-4 w-4" />
                      Populate Pool
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Populate FreeRADIUS Pool</DialogTitle>
                      <DialogDescription>Add IP range entries to a FreeRADIUS radippool.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Pool Name *</Label>
                        <Input value={populatePoolForm.poolName} onChange={(e) => setPopulatePoolForm({ ...populatePoolForm, poolName: e.target.value })} placeholder="pool_isp_main" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Subnet *</Label>
                        <Select value={populatePoolForm.subnetId} onValueChange={(v) => setPopulatePoolForm({ ...populatePoolForm, subnetId: v })}>
                          <SelectTrigger><SelectValue placeholder="Select subnet" /></SelectTrigger>
                          <SelectContent>{subnets.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.network})</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium mb-1 block">Start IP *</Label>
                          <Input value={populatePoolForm.startIp} onChange={(e) => setPopulatePoolForm({ ...populatePoolForm, startIp: e.target.value })} placeholder="192.168.1.100" className="font-mono" />
                        </div>
                        <div>
                          <Label className="text-sm font-medium mb-1 block">End IP *</Label>
                          <Input value={populatePoolForm.endIp} onChange={(e) => setPopulatePoolForm({ ...populatePoolForm, endIp: e.target.value })} placeholder="192.168.1.254" className="font-mono" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Gateway</Label>
                        <Input value={populatePoolForm.gateway} onChange={(e) => setPopulatePoolForm({ ...populatePoolForm, gateway: e.target.value })} placeholder="192.168.1.1" className="font-mono" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setPopulatePoolDialogOpen(false)}>Cancel</Button>
                      <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => {
                        if (!populatePoolForm.poolName || !populatePoolForm.subnetId || !populatePoolForm.startIp || !populatePoolForm.endIp) {
                          toast.error("Pool name, subnet, start IP and end IP are required");
                          return;
                        }
                        populatePoolMutation.mutate({ action: "populate", ...populatePoolForm });
                      }} disabled={populatePoolMutation.isPending}>
                        {populatePoolMutation.isPending ? "Populating..." : "Populate"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          {/* RADIUS Pools Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              {radiusPoolsLoading ? (
                <div className="p-8 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium uppercase">Pool Name</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Framed IP</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Username</TableHead>
                        <TableHead className="text-xs font-medium uppercase">NAS IP</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Expiry Time</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRadiusEntries.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No RADIUS pool entries found.</TableCell></TableRow>
                      ) : filteredRadiusEntries.map((entry) => (
                        <TableRow key={entry.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Radio className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span className="text-sm font-medium">{entry.poolName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{entry.framedIp}</TableCell>
                          <TableCell className="text-sm">{entry.username || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="font-mono text-xs">{entry.nasIp || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {entry.expiryTime ? new Date(entry.expiryTime).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={entry.status === "active" ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800" : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-100 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700"}>
                              {entry.status === "active" ? "Active" : "Expired"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => syncPoolMutation.mutate(entry.poolName)}
                                    disabled={syncPoolMutation.isPending}
                                  >
                                    <RefreshCw className={`h-3 w-3 ${syncPoolMutation.isPending ? "animate-spin" : ""}`} />
                                    Sync to IPAM
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Sync active leases from this pool to IPAM IpAddress records</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setClearPoolTarget(entry.poolName)}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Clear Pool
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Clear all entries for pool &quot;{entry.poolName}&quot;</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cgnat">
          <IpamCgnatTab />
        </TabsContent>
      </Tabs>

      {/* View IP Dialog (with Custom Fields + RADIUS Assignment) */}
      <Dialog open={!!viewIp} onOpenChange={() => { setViewIp(null); setCustomFieldKey(""); setCustomFieldValue(""); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>IP Address Details</DialogTitle><DialogDescription>{viewIp?.ip}</DialogDescription></DialogHeader>
          {viewIp && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">IP Address</p><p className="text-sm font-mono font-medium">{viewIp.ip}</p></div>
                <div><p className="text-xs text-muted-foreground">Subnet</p><p className="text-sm font-mono">{viewIp.subnet}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className={viewIp.status === "Used" ? "badge-active" : viewIp.status === "Reserved" ? "badge-suspended" : "badge-pending"}>{viewIp.status}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Assigned To</p><p className="text-sm">{viewIp.assignedTo || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">MAC Address</p><p className="text-sm font-mono">{viewIp.mac || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Hostname</p><p className="text-sm">{viewIp.hostname || "—"}</p></div>
              </div>

              {/* RADIUS Assignment Section */}
              <Separator className="my-2" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-semibold">RADIUS Assignment</span>
                  </div>
                  {viewIp.assignedTo && viewIp.status === "Used" ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800 text-[11px] gap-1">
                      <Pin className="h-3 w-3" />
                      Assigned
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-100 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700 text-[11px]">
                      Unassigned
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {viewIp.assignedTo
                    ? `Currently assigned to "${viewIp.assignedTo}". Framed-IP-Address is set in radreply.`
                    : "This IP is not assigned to any RADIUS subscriber. Use the button below to assign it."}
                </p>
                <div className="flex gap-2">
                  {!viewIp.assignedTo || viewIp.status !== "Used" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950/30"
                      onClick={() => {
                        // Inherit strategy from subnet if available
                        const subnet = subnets.find((s) => s.id === viewIp.subnetId);
                        setAssignSubscriberForm({
                          username: "",
                          strategy: subnet?.allocationStrategy || "STATIC",
                        });
                        setAssignSubscriberDialogOpen(true);
                      }}
                    >
                      <Radio className="h-3.5 w-3.5" />
                      Assign to Subscriber
                    </Button>
                  ) : null}
                  {viewIp.assignedTo && viewIp.status === "Used" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
                      onClick={() => {
                        subscriberAssignmentMutation.mutate({
                          action: "unassign",
                          ipId: viewIp.id,
                          username: viewIp.assignedTo,
                          strategy: "STATIC",
                        });
                      }}
                      disabled={subscriberAssignmentMutation.isPending}
                    >
                      {subscriberAssignmentMutation.isPending ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                      Unassign
                    </Button>
                  )}
                </div>
              </div>

              {/* Custom Fields */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Custom Fields</p>
                {(() => {
                  const fields = parseCustomFields(viewIp.customFields);
                  const entries = Object.entries(fields);
                  if (entries.length === 0) {
                    return <p className="text-xs text-muted-foreground">No custom fields defined.</p>;
                  }
                  return (
                    <div className="space-y-2">
                      {entries.map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between bg-muted/30 rounded p-2 gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium">{key}</p>
                            <p className="text-xs text-muted-foreground truncate">{val}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-700" onClick={() => handleRemoveCustomField(key)}>
                            <Trash className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="flex gap-2 mt-2">
                  <Input placeholder="Key" value={customFieldKey} onChange={(e) => setCustomFieldKey(e.target.value)} className="h-8 text-xs" />
                  <Input placeholder="Value" value={customFieldValue} onChange={(e) => setCustomFieldValue(e.target.value)} className="h-8 text-xs" onKeyDown={(e) => e.key === "Enter" && handleAddCustomField()} />
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={handleAddCustomField} disabled={!customFieldKey.trim()}><Plus className="h-3 w-3" /></Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Subscriber Dialog */}
      <Dialog open={assignSubscriberDialogOpen} onOpenChange={(o) => { setAssignSubscriberDialogOpen(o); if (!o) setAssignSubscriberForm({ username: "", strategy: "STATIC" }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign IP to Subscriber</DialogTitle>
            <DialogDescription>Assign <strong className="font-mono">{viewIp?.ip}</strong> to a RADIUS subscriber via radreply.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label className="text-sm font-medium mb-1 block">Username *</Label>
              <Input
                value={assignSubscriberForm.username}
                onChange={(e) => setAssignSubscriberForm({ ...assignSubscriberForm, username: e.target.value })}
                placeholder="subscriber@example.com"
              />
              <p className="text-xs text-muted-foreground mt-1">RADIUS username for the subscriber</p>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1 block">Allocation Strategy</Label>
              <Select value={assignSubscriberForm.strategy} onValueChange={(v) => setAssignSubscriberForm({ ...assignSubscriberForm, strategy: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALLOCATION_STRATEGIES.map((s) => {
                    const Icon = s.icon;
                    return (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{s.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignSubscriberDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              onClick={() => {
                if (!assignSubscriberForm.username.trim()) {
                  toast.error("Username is required");
                  return;
                }
                if (!viewIp) return;
                subscriberAssignmentMutation.mutate({
                  action: "assign",
                  ipId: viewIp.id,
                  username: assignSubscriberForm.username.trim(),
                  strategy: assignSubscriberForm.strategy,
                });
              }}
              disabled={subscriberAssignmentMutation.isPending}
            >
              {subscriberAssignmentMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                "Assign"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Pool Confirmation */}
      <AlertDialog open={!!clearPoolTarget} onOpenChange={(open) => { if (!open) setClearPoolTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Pool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all entries for pool <strong className="font-mono">{clearPoolTarget}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearPoolMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearPoolTarget && clearPoolMutation.mutate(clearPoolTarget)}
              disabled={clearPoolMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {clearPoolMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Clear Pool
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) setImportDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import from CSV</DialogTitle>
            <DialogDescription>Import subnets or IP addresses from a CSV file.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <Label>Import Type</Label>
              <Select value={importType} onValueChange={(v) => setImportType(v as "subnet" | "ip")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="subnet">Subnets</SelectItem>
                  <SelectItem value="ip">IP Addresses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {importType === "ip" && (
              <div className="grid gap-2">
                <Label>Target Subnet</Label>
                <Select value={importSubnetId} onValueChange={setImportSubnetId}>
                  <SelectTrigger><SelectValue placeholder="Select subnet" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (must be in CSV)</SelectItem>
                    {subnets.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.network})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>CSV File</Label>
              <input ref={fileInputRef} type="file" accept=".csv" className="block w-full text-sm file:mr-4 file:ml-4 file:py-2 file:border-0 file:text-sm file:rounded-lg file:cursor-pointer file:bg-muted/50 hover:file:bg-muted" />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>CSV headers: {importType === "subnet" ? "name, network (CIDR), gateway, dns" : "ip, hostname, mac, status, description, subnetId"}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              <Download className="inline h-3 w-3 mr-1" />
              <button type="button" className="text-[#DC2626] underline hover:no-underline" onClick={() => {
                const csv = importType === "subnet"
                  ? "name,network,gateway,dns\nManagement,192.168.1.0/24,192.168.1.1,8.8.8.8\nGuest,10.0.0.0/24,10.0.0.1,8.8.4.4"
                  : "ip,hostname,mac,status,description\n192.168.1.100,router-01,AA:BB:CC:DD:EE:FF,used,Main router\n192.168.1.101,switch-01,AA:BB:CC:DD:EE:01,used,Core switch";
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `sample-${importType}-import.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}>Download sample CSV</button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => { setImporting(true); importMutation.mutate(); }} disabled={importing}>
              {importing && <Trash className="h-4 w-4 mr-2 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IP Assignment History Dialog */}
      <Dialog open={!!historyIp} onOpenChange={() => setHistoryIp(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assignment History</DialogTitle>
            <DialogDescription>Assignment/release log for <strong className="font-mono">{historyIp?.ip}</strong></DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {!historyData ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading history...</p>
            ) : historyData.history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No assignment history found.</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {historyData.history.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 bg-muted/30 rounded-lg p-3 text-sm">
                    <div className="mt-0.5 shrink-0">
                      {h.releasedAt ? (
                        <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center">
                          <Download className="h-3 w-3 text-amber-600" />
                        </div>
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                          <Upload className="h-3 w-3 text-green-600" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs">{h.releasedAt ? "Released" : "Assigned"}</span>
                        <span className="text-xs text-muted-foreground">{new Date(h.assignedAt).toLocaleString()}</span>
                      </div>
                      {h.assignedTo && <p className="text-xs text-muted-foreground">To: {h.assignedTo}</p>}
                      {h.releasedAt && <p className="text-xs text-muted-foreground">Released: {new Date(h.releasedAt).toLocaleString()}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryIp(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Subnet Confirmation */}
      <AlertDialog open={!!deleteSubnetTarget} onOpenChange={(open) => { if (!open) setDeleteSubnetTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Subnet</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete subnet <strong>{deleteSubnetTarget?.name}</strong> ({deleteSubnetTarget?.network})?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ipamMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteSubnetTarget && ipamMutation.mutate({ action: "delete-subnet", id: deleteSubnetTarget.id })} disabled={ipamMutation.isPending} className="bg-red-600 hover:bg-red-700">
              {ipamMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete IP Confirmation */}
      <AlertDialog open={!!deleteIpTarget} onOpenChange={(open) => { if (!open) setDeleteIpTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove IP Allocation</AlertDialogTitle><AlertDialogDescription>Are you sure you want to remove IP <strong>{deleteIpTarget?.ip}</strong>?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ipamMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteIpTarget && ipamMutation.mutate({ action: "delete-ip", id: deleteIpTarget.id })} disabled={ipamMutation.isPending} className="bg-red-600 hover:bg-red-700">
              {ipamMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete VLAN Confirmation */}
      <AlertDialog open={!!deleteVlanTarget} onOpenChange={(open) => { if (!open) setDeleteVlanTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete VLAN</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete VLAN <strong>{deleteVlanTarget?.name}</strong> (VLAN {deleteVlanTarget?.vlanId})?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ipamMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteVlanTarget && ipamMutation.mutate({ action: "delete-vlan", id: deleteVlanTarget.id })} disabled={ipamMutation.isPending} className="bg-red-600 hover:bg-red-700">
              {ipamMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
