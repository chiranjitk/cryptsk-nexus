"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight, Wifi, Plus, Edit2, Trash2, RefreshCw, ShieldAlert, Gauge,
  Search, Loader2, Activity, Download, DollarSign, RotateCcw, Clock,
  AlertTriangle, CheckCircle2, XCircle, Info, History, ArrowRightLeft,
  Settings, Save, TrendingUp, Zap, Network, Terminal, Route,
  Power, PowerOff, ChevronDown, ChevronUp, Eye, Pencil, Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
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
import { toast } from "sonner";
import { apiFetch, cn } from "@/lib/utils";
import { useModuleStore } from "@/store/module-store";

// ─── Types ───────────────────────────────────────────────────────
interface WanLink {
  id: string;
  name: string;
  isp: string;
  type: string;
  ip: string;
  gateway: string;
  speed: string;
  uploadSpeed: string;
  status: string;
  uptime: string;
  monthlyCost: number;
  monthlyBudget: number;
  usagePercent: number;
  budgetPercent: number;
  weight: number;
  autoFailback: boolean;
  failbackDelaySec: number;
  preferPrimary: boolean;
  isPrimary: boolean;
  alertAtPercent?: number;
  stabilityCheckEnabled?: boolean;
  minUptimeSeconds?: number;
  maxDownloadMbps?: number;
  maxUploadMbps?: number;
  burstSizeMbps?: number;
  linkPriority?: number;
  interfaceName?: string;
  ipv6Address?: string;
  ipv6Gateway?: string;
  ipv6HealthTarget?: string;
}

interface FailoverRule {
  id: string;
  priority: number;
  fromLink: string;
  toLink: string;
  trigger: string;
  autoFailback: boolean;
  preferPrimary: boolean;
  failbackDelaySec: number;
  lastTriggered: string;
  status: string;
}

interface TrafficByDevice {
  deviceName: string;
  hourlyDownload: number[];
  hourlyUpload: number[];
}

interface WanEvent {
  id: string;
  action: string;
  details: Record<string, unknown>;
  userName: string;
  timestamp: string;
}

interface LoadBalancingConfig {
  algorithm: string;
  weights: Record<string, number>;
}

interface SystemInterface {
  name: string;
  type: string;
  role: string;
  mac: string;
  ipv4: string;
  carrier: boolean;
  speed: string;
  txBytes: number;
  rxBytes: number;
  status: string;
  enabled: boolean;
  mtu: number;
}

interface MultiwanResponse {
  wanLinks: WanLink[];
  failoverRules: FailoverRule[];
  traffic: TrafficByDevice[];
  hasRealTrafficData: boolean;
  loadBalancing: LoadBalancingConfig;
  events: WanEvent[];
  stats: {
    totalLinks: number;
    active: number;
    failoverEventsToday: number;
    totalBandwidth: string;
    monthlyCost: number;
  };
}

interface PingResult {
  alive: boolean;
  avgLatency: number | null;
  minLatency: number | null;
  maxLatency: number | null;
  packetLoss: number;
  output?: string;
  error?: string;
}

interface RouteEntry {
  dest: string;
  via: string;
  dev: string;
  metric?: number;
}

interface LbStatus {
  active: boolean;
  details: string;
}

interface HealthMonitorLink {
  id: string;
  name: string;
  gateway: string;
  interfaceName: string;
  isPrimary: boolean;
  status: string;
  consecutiveFails: number;
  consecutiveSuccess: number;
  lastCheck: string;
  lastLatency: number | null;
  lastPacketLoss: number;
  history: { timestamp: string; alive: boolean; latency: number | null }[];
}

interface HealthMonitorStatus {
  running: boolean;
  links: HealthMonitorLink[];
  currentDefaultGateway: string;
  failoverEvents: { timestamp: string; fromLink: string; toLink: string; type: string }[];
  checkInterval: number;
  uptimeSeconds: number;
}

// ─── Constants ──────────────────────────────────────────────────
const WAN_TYPES = ["FIBER", "COPPER", "WIRELESS", "LTE/5G"];
const TRIGGERS = ["Ping Fail", "Bandwidth Threshold", "Manual"];
const LB_ALGORITHMS = ["round-robin", "weighted", "least-connections"];

// ─── Helpers ─────────────────────────────────────────────────────
function parseSpeed(speed: string): number {
  if (!speed) return 0;
  const match = speed.match(/(\d+)/);
  if (!match) return 0;
  const val = parseInt(match[1]);
  return speed.toLowerCase().includes("gbps") ? val * 1000 : val;
}

function formatBps(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Gbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Mbps`;
  return `${bps} Kbps`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MiB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(2)} KiB`;
  return `${bytes} B`;
}

function formatEventTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function getEventIcon(action: string) {
  if (action === "STATUS_CHANGE") return <ArrowRightLeft className="h-4 w-4 text-amber-500" />;
  if (action === "DELETE") return <XCircle className="h-4 w-4 text-red-500" />;
  if (action === "CREATE") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (action === "CONFIG_CHANGE") return <Settings className="h-4 w-4 text-teal-500" />;
  if (action === "FAILOVER") return <ShieldAlert className="h-4 w-4 text-red-600" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

function getEventColor(action: string) {
  if (action === "STATUS_CHANGE") return "border-l-amber-500";
  if (action === "DELETE") return "border-l-red-500";
  if (action === "CREATE") return "border-l-green-500";
  if (action === "CONFIG_CHANGE") return "border-l-teal-500";
  if (action === "FAILOVER") return "border-l-red-600";
  return "border-l-muted-foreground";
}

function extractIpFromCidr(cidr: string): string {
  if (!cidr) return "";
  return cidr.split("/")[0] || "";
}

function isFilteredInterface(iface: SystemInterface): boolean {
  const n = iface.name.toLowerCase();
  // Exclude loopback, docker, veth, bridges, and vlan sub-interfaces
  if (n === "lo") return false;
  if (n.startsWith("docker") || n.startsWith("veth") || n.startsWith("virbr")) return false;
  if (n.startsWith("br-") || n.startsWith("bridge")) return false;
  if (n.includes(".")) return false; // vlan sub-interface (eth0.100)
  // Exclude non-WAN hardware types
  if (iface.type && ["DOCKER", "BRIDGE", "BOND", "VLAN", "LOOPBACK"].includes(iface.type)) return false;
  // Business logic: only show interfaces assigned WAN role in System Interfaces
  if (!iface.role || iface.role !== "WAN") return false;
  return true;
}

function getBudgetAlertColor(percent: number) {
  if (percent >= 100) return { bar: "bg-red-500", text: "text-red-600", label: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" };
  if (percent >= 80) return { bar: "bg-amber-500", text: "text-amber-600", label: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };
  return { bar: "bg-green-500", text: "text-green-600", label: "" };
}

// ─── useDebounce hook ──────────────────────────────────────────
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ─── Stat Card ───────────────────────────────────────────────────
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
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Traffic Bar Chart ──────────────────────────────────────────
function TrafficBarChart({ traffic, hasRealData }: { traffic: TrafficByDevice[]; hasRealData: boolean }) {
  const currentHour = new Date().getHours();
  const colors = ["bg-[#DC2626]", "bg-orange-500", "bg-teal-500", "bg-green-500", "bg-purple-500"];

  if (traffic.length === 0 || !traffic.some((t) => t.hourlyDownload.some((v) => v > 0) || t.hourlyUpload.some((v) => v > 0))) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="h-12 w-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No traffic data available</p>
        <p className="text-xs text-muted-foreground mt-1">Traffic data will populate as your WAN links handle traffic.</p>
      </div>
    );
  }

  const maxVal = Math.max(...traffic.flatMap((t) => [...t.hourlyDownload, ...t.hourlyUpload]), 1);

  return (
    <div className="space-y-5">
      {hasRealData && (
        <Badge variant="outline" className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300">
          <CheckCircle2 className="h-3 w-3 mr-1" />Real Traffic Data
        </Badge>
      )}
      {!hasRealData && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Showing estimated bandwidth data. Connect a live bandwidth monitor for real-time data.</span>
        </div>
      )}
      {traffic.map((t, idx) => (
        <div key={t.deviceName} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{t.deviceName}</span>
            <span className="text-muted-foreground">Current: {formatBps(t.hourlyDownload[currentHour])} ↓ / {formatBps(t.hourlyUpload[currentHour])} ↑</span>
          </div>
          <div className="flex items-end gap-0.5 h-16">
            {t.hourlyDownload.slice(0, 24).map((val, i) => {
              const h = maxVal > 0 ? (val / maxVal) * 100 : 0;
              return (
                <div
                  key={i}
                  className={`flex-1 ${colors[idx % colors.length]} rounded-t-sm opacity-80 hover:opacity-100 transition-opacity ${i === currentHour ? "ring-1 ring-background" : ""}`}
                  style={{ height: `${Math.max(h, 2)}%` }}
                  title={`${String(i).padStart(2, "0")}:00: ↓${formatBps(val)} ↑${formatBps(t.hourlyUpload[i])}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Bandwidth Distribution Donut ──────────────────────────────
function BandwidthDistributionChart({ links }: { links: WanLink[] }) {
  const activeLinks = links.filter((l) => l.status === "Connected");
  const totalSpeed = activeLinks.reduce((s, l) => s + parseSpeed(l.speed), 0);
  const colors = ["#DC2626", "#F97316", "#14B8A6", "#22C55E"];

  if (activeLinks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Gauge className="h-10 w-10 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No active WAN links</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          {(() => {
            const offsets: number[] = [];
            let running = 0;
            activeLinks.forEach((link) => {
              const speed = parseSpeed(link.speed);
              const pct = totalSpeed > 0 ? (speed / totalSpeed) * 100 : 0;
              offsets.push(running);
              running += pct;
            });
            return activeLinks.map((link, i) => {
              const speed = parseSpeed(link.speed);
              const pct = totalSpeed > 0 ? (speed / totalSpeed) * 100 : 0;
              return (
                <circle key={link.id} cx="18" cy="18" r="15.9" fill="none"
                  stroke={colors[i % colors.length]} strokeWidth="3"
                  strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-offsets[i]}
                />
              );
            });
          })()}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold">{formatBps(totalSpeed * 1_000_000)}</span>
          <span className="text-[10px] text-muted-foreground">Total Bandwidth</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 w-full">
        {links.map((link, i) => {
          const speed = parseSpeed(link.speed);
          const pct = totalSpeed > 0 ? ((speed / totalSpeed) * 100).toFixed(0) : "0";
          return (
            <div key={link.id} className="flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
              <div className="min-w-0">
                <p className="font-medium truncate">{link.name}</p>
                <p className="text-muted-foreground">{link.speed} ({pct}%)</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Multi-WAN Page ─────────────────────────────────────────────
export default function MultiwanPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  const [tab, setTab] = useState("links");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Dialog states
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [shapingDialogOpen, setShapingDialogOpen] = useState(false);
  const [failbackDialogOpen, setFailbackDialogOpen] = useState(false);
  const [pingDialogOpen, setPingDialogOpen] = useState(false);
  const [ipConfigDialogOpen, setIpConfigDialogOpen] = useState(false);
  const [failoverConfirmOpen, setFailoverConfirmOpen] = useState(false);

  // Dialog targets
  const [editingLink, setEditingLink] = useState<WanLink | null>(null);
  const [editingRule, setEditingRule] = useState<FailoverRule | null>(null);
  const [deleteLinkTarget, setDeleteLinkTarget] = useState<WanLink | null>(null);
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<FailoverRule | null>(null);
  const [budgetTarget, setBudgetTarget] = useState<WanLink | null>(null);
  const [shapingTarget, setShapingTarget] = useState<WanLink | null>(null);
  const [failbackTarget, setFailbackTarget] = useState<WanLink | null>(null);
  const [pingTarget, setPingTarget] = useState<WanLink | null>(null);
  const [ipConfigTarget, setIpConfigTarget] = useState<WanLink | null>(null);
  const [failoverTarget, setFailoverTarget] = useState<WanLink | null>(null);

  // Form states
  const [linkForm, setLinkForm] = useState({ name: "", isp: "", type: "FIBER", role: "Primary", ip: "", gateway: "", downloadSpeed: "", uploadSpeed: "", monthlyCost: "0", weight: "1", interfaceName: "", ipv6Address: "", ipv6Gateway: "", ipv6HealthTarget: "2001:4860:4860::8888" });
  const [ruleForm, setRuleForm] = useState({ fromLink: "", toLink: "", trigger: "Ping Fail", autoFailback: true, preferPrimary: true, failbackDelaySec: "60", priority: "1" });
  const [budgetAmount, setBudgetAmount] = useState("0");
  const [shapingForm, setShapingForm] = useState({ maxDownloadMbps: "0", maxUploadMbps: "0", burstSizeMbps: "0", linkPriority: "5" });
  const [failbackForm, setFailbackForm] = useState({ autoFailback: true, failbackDelaySec: "60", stabilityCheckEnabled: false, minUptimeSeconds: "300" });
  const [pingForm, setPingForm] = useState({ host: "8.8.8.8", count: "3" });
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [ipConfigForm, setIpConfigForm] = useState({ cidr: "" });
  const [failoverForm, setFailoverForm] = useState({ targetGateway: "", targetInterface: "" });

  // Load balancing local state
  const [lbLocalAlgorithm, setLbLocalAlgorithm] = useState("round-robin");
  const [lbLocalWeights, setLbLocalWeights] = useState<Record<string, number>>({});

  // Shaping local state
  const [shapingStates, setShapingStates] = useState<Record<string, { enabled: boolean; rate: string; ceil: string }>>({});
  const [natStates, setNatStates] = useState<Record<string, boolean>>({});

  // Load Balancing OS status
  const [lbOsStatus, setLbOsStatus] = useState<LbStatus | null>(null);
  const [lbApplying, setLbApplying] = useState(false);
  const [lbCommands, setLbCommands] = useState<string[]>([]);

  // Health Monitor
  const [monitorStatus, setMonitorStatus] = useState<HealthMonitorStatus | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);

  // Route form
  const [routeForm, setRouteForm] = useState({ dest: "", via: "", dev: "", metric: "100" });

  // Events auto-scroll ref
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // ─── Queries ──────────────────────────────────────────────────
  const { data, isLoading, isFetching, isError, error } = useQuery<MultiwanResponse>({
    queryKey: ["multiwan"],
    queryFn: () => apiFetch<MultiwanResponse>("/api/multiwan"),
    refetchInterval: tab === "traffic" ? 10000 : false,
  });

  // Load Balancing OS status
  const lbStatusQuery = useQuery<LbStatus>({ queryKey: ["lb-status"], queryFn: () => apiFetch<LbStatus>("/api/multiwan?action=load-balancing-status", { method: "POST", body: JSON.stringify({ action: "load-balancing-status" }) }), refetchInterval: 15000, enabled: tab === "load-balancing" });
  useEffect(() => { if (lbStatusQuery.data) setLbOsStatus(lbStatusQuery.data); }, [lbStatusQuery.data]);

  // Health Monitor status
  const monitorQuery = useQuery<{ success: boolean; data?: HealthMonitorStatus; error?: string }>({
    queryKey: ["health-monitor"],
    queryFn: () => apiFetch("/api/multiwan", { method: "POST", body: JSON.stringify({ action: "health-monitor-status" }) }),
    refetchInterval: 10000,
    enabled: tab === "failover",
  });
  useEffect(() => { if (monitorQuery.data) setMonitorStatus(monitorQuery.data.success ? monitorQuery.data.data! : null); }, [monitorQuery.data]);

  // Fetch system interfaces (auto-discover)
  const { data: interfacesData, isLoading: interfacesLoading } = useQuery<{ interfaces: SystemInterface[] }>({
    queryKey: ["system-interfaces"],
    queryFn: () => apiFetch<{ interfaces: SystemInterface[] }>("/api/interfaces"),
    staleTime: 30000,
    retry: false,
    refetchInterval: tab === "traffic" ? 10000 : false,
  });

  // Derived data
  const links = data?.wanLinks || [];
  const rules = data?.failoverRules || [];
  const traffic = data?.traffic || [];
  const hasRealTrafficData = data?.hasRealTrafficData || false;
  const apiStats = data?.stats || null;
  const loadBalancing = data?.loadBalancing || { algorithm: "round-robin", weights: {} };
  const events = data?.events || [];
  const systemInterfaces = interfacesData?.interfaces || [];

  // Filtered physical interfaces for dropdown
  const physicalInterfaces = systemInterfaces.filter(isFilteredInterface);

  // Sync LB state from server (computed, not in effect to avoid cascading renders)
  const serverAlgorithm = loadBalancing.algorithm || "round-robin";
  const serverWeights: Record<string, number> = (loadBalancing.weights && Object.keys(loadBalancing.weights).length > 0)
    ? loadBalancing.weights
    : (() => {
        const w: Record<string, number> = {};
        links.forEach((l) => { w[l.id] = l.weight || 1; });
        return w;
      })();
  if (serverAlgorithm !== lbLocalAlgorithm) setLbLocalAlgorithm(serverAlgorithm);
  if (JSON.stringify(serverWeights) !== JSON.stringify(lbLocalWeights)) setLbLocalWeights(serverWeights);

  // Auto-scroll events
  useEffect(() => {
    if (tab === "events" && eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [events.length, tab]);

  // Find interface data for a WAN link
  function getInterfaceForLink(link: WanLink): SystemInterface | undefined {
    if (link.interfaceName) return systemInterfaces.find((i) => i.name === link.interfaceName);
    return undefined;
  }

  // ─── Mutations ────────────────────────────────────────────────
  const postAction = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/api/multiwan", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["multiwan"] });
      queryClient.invalidateQueries({ queryKey: ["system-interfaces"] });
      const action = variables.action as string;
      if (action === "create-wan") toast.success("WAN link created successfully");
      else if (action === "update-wan") toast.success("WAN link updated");
      else if (action === "delete-wan") toast.success("WAN link deleted");
      else if (action === "toggle-wan") toast.success("Interface toggled");
      else if (action === "force-failover") toast.success("Manual failover triggered");
      else if (action === "create-rule") toast.success("Failover rule created");
      else if (action === "update-rule") toast.success("Failover rule updated");
      else if (action === "delete-rule") toast.success("Failover rule deleted");
      else if (action === "save-load-balancing") toast.success("Load balancing saved");
      else if (action === "save-shaping") toast.success("Shaping config saved");
      else if (action === "set-budget") toast.success("Budget updated");
      else if (action === "save-failback-config") toast.success("Failback config saved");
      else if (action === "enable-nat") toast.success("NAT enabled on interface (nftables)");
      else if (action === "disable-nat") toast.success("NAT disabled on interface (nftables)");
      else if (action === "enable-shaping") toast.success("Traffic shaping enabled");
      else if (action === "disable-shaping") toast.success("Traffic shaping disabled");
      else if (action === "configure-ip") toast.success("IP address configured");
      else if (action === "flush-ip") toast.success("All IPs flushed from interface");
      else if (action === "add-route") toast.success("Route added");
      else if (action === "delete-route") toast.success("Route deleted");
      else if (action === "set-gateway") toast.success("Default gateway updated");
    },
    onError: (_err, variables) => {
      const action = variables.action as string;
      toast.error(`Action "${action}" failed. Check server logs.`);
    },
  });

  const pingMutation = useMutation({
    mutationFn: (payload: { action: string; host: string; count: number }) =>
      apiFetch<{ success: boolean; data: PingResult }>("/api/multiwan", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (response) => {
      const result = response?.data;
      if (!result) {
        toast.error("Ping test returned no data");
        return;
      }
      setPingResult(result);
      if (result.alive) {
        toast.success(`Host reachable: avg ${result.avgLatency != null ? result.avgLatency.toFixed(1) : "?"}ms, ${result.packetLoss ?? 0}% loss`);
      } else {
        toast.error(`Host unreachable: ${result.packetLoss ?? 100}% packet loss`);
      }
    },
    onError: () => {
      toast.error("Ping test failed");
    },
  });

  // ─── Form Handlers ────────────────────────────────────────────
  function resetLinkForm() {
    setLinkForm({ name: "", isp: "", type: "FIBER", role: "Primary", ip: "", gateway: "", downloadSpeed: "", uploadSpeed: "", monthlyCost: "0", weight: "1", interfaceName: "", ipv6Address: "", ipv6Gateway: "", ipv6HealthTarget: "2001:4860:4860::8888" });
  }
  function resetRuleForm() {
    setRuleForm({ fromLink: "", toLink: "", trigger: "Ping Fail", autoFailback: true, preferPrimary: true, failbackDelaySec: "60", priority: "1" });
  }

  function openAddLink() {
    setEditingLink(null);
    resetLinkForm();
    setLinkDialogOpen(true);
  }

  function openEditLink(link: WanLink) {
    setEditingLink(link);
    setLinkForm({
      name: link.name,
      isp: link.isp,
      type: link.type || "FIBER",
      role: link.isPrimary ? "Primary" : "Backup",
      ip: link.ip,
      gateway: link.gateway,
      downloadSpeed: link.speed,
      uploadSpeed: "", // uploadSpeed not returned from API currently
      monthlyCost: String(link.monthlyCost),
      weight: String(link.weight || 1),
      interfaceName: link.interfaceName || "",
      ipv6Address: link.ipv6Address || "",
      ipv6Gateway: link.ipv6Gateway || "",
      ipv6HealthTarget: link.ipv6HealthTarget || "2001:4860:4860::8888",
    });
    setLinkDialogOpen(true);
  }

  function openEditRule(rule: FailoverRule) {
    setEditingRule(rule);
    setRuleForm({
      fromLink: rule.fromLink,
      toLink: rule.toLink,
      trigger: rule.trigger,
      autoFailback: rule.autoFailback,
      preferPrimary: rule.preferPrimary,
      failbackDelaySec: String(rule.failbackDelaySec || 60),
      priority: String(rule.priority || 1),
    });
    setRuleDialogOpen(true);
  }

  function openBudgetDialog(link: WanLink) {
    setBudgetTarget(link);
    setBudgetAmount(String(link.monthlyBudget || 0));
    setBudgetDialogOpen(true);
  }

  function openShapingDialog(link: WanLink) {
    setShapingTarget(link);
    setShapingForm({
      maxDownloadMbps: String(link.maxDownloadMbps || 0),
      maxUploadMbps: String(link.maxUploadMbps || 0),
      burstSizeMbps: String(link.burstSizeMbps || 0),
      linkPriority: String(link.linkPriority || 5),
    });
    setShapingDialogOpen(true);
  }

  function openFailbackDialog(link: WanLink) {
    setFailbackTarget(link);
    setFailbackForm({
      autoFailback: link.autoFailback ?? true,
      failbackDelaySec: String(link.failbackDelaySec || 60),
      stabilityCheckEnabled: link.stabilityCheckEnabled ?? false,
      minUptimeSeconds: String(link.minUptimeSeconds || 300),
    });
    setFailbackDialogOpen(true);
  }

  function openPingDialog(link: WanLink) {
    setPingTarget(link);
    setPingForm({ host: "8.8.8.8", count: "3" });
    setPingResult(null);
    setPingDialogOpen(true);
  }

  function openIpConfigDialog(link: WanLink) {
    setIpConfigTarget(link);
    const iface = getInterfaceForLink(link);
    setIpConfigForm({ cidr: iface?.ipv4 || link.ip || "" });
    setIpConfigDialogOpen(true);
  }

  function openFailoverConfirm(link: WanLink) {
    setFailoverTarget(link);
    setFailoverForm({ targetGateway: link.gateway, targetInterface: link.interfaceName || "" });
    setFailoverConfirmOpen(true);
  }

  function handleInterfaceSelect(ifaceName: string) {
    setLinkForm((prev) => ({ ...prev, interfaceName: ifaceName }));
    const iface = systemInterfaces.find((i) => i.name === ifaceName);
    if (iface) {
      const ip = extractIpFromCidr(iface.ipv4);
      setLinkForm((prev) => ({
        ...prev,
        ip: ip || iface.ipv4 || prev.ip,
        gateway: prev.gateway || "",
      }));
    }
  }

  function handleSaveLink() {
    if (!linkForm.name || !linkForm.isp) {
      toast.error("Name and ISP are required");
      return;
    }
    const downloadSpeed = parseSpeed(linkForm.downloadSpeed);
    const uploadSpeed = parseSpeed(linkForm.uploadSpeed);
    const isPrimary = linkForm.role === "Primary";

    if (editingLink) {
      postAction.mutate({
        action: "update-wan",
        id: editingLink.id,
        name: linkForm.name,
        type: linkForm.type,
        isp: linkForm.isp,
        ipAddress: linkForm.ip,
        gateway: linkForm.gateway,
        downloadSpeed,
        uploadSpeed,
        monthlyCost: parseFloat(linkForm.monthlyCost) || 0,
        weight: parseInt(linkForm.weight) || 1,
        ipv6Address: linkForm.ipv6Address || undefined,
        ipv6Gateway: linkForm.ipv6Gateway || undefined,
        ipv6HealthTarget: linkForm.ipv6HealthTarget || undefined,
      });
    } else {
      postAction.mutate({
        action: "create-wan",
        name: linkForm.name,
        type: linkForm.type,
        isp: linkForm.isp,
        ipAddress: linkForm.ip,
        gateway: linkForm.gateway,
        downloadSpeed,
        uploadSpeed,
        monthlyCost: parseFloat(linkForm.monthlyCost) || 0,
        isPrimary,
        interfaceName: linkForm.interfaceName || undefined,
        weight: parseInt(linkForm.weight) || 1,
        ipv6Address: linkForm.ipv6Address || undefined,
        ipv6Gateway: linkForm.ipv6Gateway || undefined,
        ipv6HealthTarget: linkForm.ipv6HealthTarget || undefined,
      });
    }
    setLinkDialogOpen(false);
    setEditingLink(null);
    resetLinkForm();
  }

  function handleSaveRule() {
    if (!ruleForm.fromLink || !ruleForm.toLink) {
      toast.error("Both links are required");
      return;
    }
    if (ruleForm.fromLink === ruleForm.toLink) {
      toast.error("From and To links must be different");
      return;
    }
    const fromLinkObj = links.find((l) => l.name === ruleForm.fromLink);
    const toLinkObj = links.find((l) => l.name === ruleForm.toLink);
    if (!fromLinkObj || !toLinkObj) {
      toast.error("Selected link not found");
      return;
    }

    if (editingRule) {
      postAction.mutate({
        action: "update-rule",
        id: editingRule.id,
        name: `${ruleForm.fromLink} → ${ruleForm.toLink}`,
        primaryWanId: fromLinkObj.id,
        backupWanId: toLinkObj.id,
        triggerCondition: ruleForm.trigger,
        autoFailback: ruleForm.autoFailback,
        preferPrimary: ruleForm.preferPrimary,
        failbackDelaySec: parseInt(ruleForm.failbackDelaySec) || 60,
        priority: parseInt(ruleForm.priority) || 1,
      });
    } else {
      postAction.mutate({
        action: "create-rule",
        name: `${ruleForm.fromLink} → ${ruleForm.toLink}`,
        primaryWanId: fromLinkObj.id,
        backupWanId: toLinkObj.id,
        triggerCondition: ruleForm.trigger,
        autoFailback: ruleForm.autoFailback,
        preferPrimary: ruleForm.preferPrimary,
        failbackDelaySec: parseInt(ruleForm.failbackDelaySec) || 60,
        priority: parseInt(ruleForm.priority) || (rules.length + 1),
      });
    }
    setRuleDialogOpen(false);
    setEditingRule(null);
    resetRuleForm();
  }

  function handleToggleNat(link: WanLink) {
    const ifaceName = link.interfaceName;
    if (!ifaceName) {
      toast.error("No interface assigned to this WAN link");
      return;
    }
    const currentNat = natStates[link.id] ?? false;
    postAction.mutate({
      action: currentNat ? "disable-nat" : "enable-nat",
      iface: ifaceName,
    });
    setNatStates((prev) => ({ ...prev, [link.id]: !currentNat }));
  }

  function handleToggleShaping(link: WanLink) {
    const ifaceName = link.interfaceName;
    if (!ifaceName) {
      toast.error("No interface assigned to this WAN link");
      return;
    }
    const state = shapingStates[link.id] ?? { enabled: false, rate: "100", ceil: "150" };
    if (state.enabled) {
      postAction.mutate({
        action: "disable-shaping",
        iface: ifaceName,
      });
      setShapingStates((prev) => ({ ...prev, [link.id]: { ...state, enabled: false } }));
    } else {
      postAction.mutate({
        action: "enable-shaping",
        iface: ifaceName,
        rate: state.rate,
        ceil: state.ceil,
      });
      setShapingStates((prev) => ({ ...prev, [link.id]: { ...state, enabled: true } }));
    }
  }

  function handleAddRoute() {
    if (!routeForm.dest || !routeForm.via || !routeForm.dev) {
      toast.error("Destination, gateway, and device are required");
      return;
    }
    postAction.mutate({
      action: "add-route",
      dest: routeForm.dest,
      via: routeForm.via,
      dev: routeForm.dev,
      metric: parseInt(routeForm.metric) || 100,
    });
    setRouteForm({ dest: "", via: "", dev: "", metric: "100" });
  }

  function handleDeleteRoute(route: RouteEntry) {
    postAction.mutate({
      action: "delete-route",
      dest: route.dest,
      via: route.via,
      dev: route.dev,
    });
  }

  function filteredLinks() {
    if (!debouncedSearch) return links;
    const q = debouncedSearch.toLowerCase();
    return links.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.isp.toLowerCase().includes(q) ||
        l.type.toLowerCase().includes(q) ||
        l.ip.toLowerCase().includes(q) ||
        (l.interfaceName || "").toLowerCase().includes(q)
    );
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Multi-WAN & Failover</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage WAN links, failover rules, and traffic distribution</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => openPingDialog({ id: "", name: "Quick Test", isp: "", type: "", ip: "", gateway: "", speed: "", uploadSpeed: "", status: "", uptime: "", monthlyCost: 0, monthlyBudget: 0, usagePercent: 0, budgetPercent: 0, weight: 0, autoFailback: false, failbackDelaySec: 0, preferPrimary: false, isPrimary: false })}>
            <Terminal className="h-4 w-4 mr-1.5" />Ping Test
          </Button>
          <Button variant="outline" size="sm" onClick={openAddLink}>
            <Plus className="h-4 w-4 mr-1.5" />Add WAN Link
          </Button>
        </div>
      </div>

      {/* Stats */}
      {isError ? (
        <Card className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">Failed to load Multi-WAN data</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{String(error)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["multiwan"] })}>
              <RefreshCw className="h-4 w-4 mr-1.5" />Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total WAN Links" value={apiStats?.totalLinks ?? links.length} subtitle="Configured links" icon={ArrowLeftRight} gradient="stat-gradient-red" delay={0} />
          <StatCard title="Active" value={apiStats?.active ?? links.filter((l) => l.status === "Connected").length} subtitle="Currently connected" icon={Wifi} gradient="stat-gradient-green" delay={75} />
          <StatCard title="Failover Events" value={apiStats?.failoverEventsToday ?? 0} subtitle="Today" icon={ShieldAlert} gradient="stat-gradient-amber" delay={150} />
          <StatCard title="Monthly Cost" value={`₹${(apiStats?.monthlyCost ?? links.reduce((s, l) => s + l.monthlyCost, 0)).toLocaleString()}`} subtitle="Combined monthly" icon={DollarSign} gradient="stat-gradient-teal" delay={225} />
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 overflow-x-auto">
          <TabsTrigger value="links">WAN Links</TabsTrigger>
          <TabsTrigger value="load-balancing">Load Balancing</TabsTrigger>
          <TabsTrigger value="failover">Failover Rules</TabsTrigger>
          <TabsTrigger value="traffic">WAN Traffic</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="shaping">Shaping</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════ TAB 1: WAN LINKS ═══════════════════════ */}
        <TabsContent value="links">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search WAN links..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Button variant="outline" size="icon" onClick={() => { queryClient.invalidateQueries({ queryKey: ["multiwan"] }); queryClient.invalidateQueries({ queryKey: ["system-interfaces"] }); }} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Auto-discover banner */}
          {!interfacesLoading && physicalInterfaces.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-lg px-3 py-2 mb-4">
              <Network className="h-3.5 w-3.5 shrink-0" />
              <span>Available WAN interface(s): <strong>{physicalInterfaces.map((i) => i.name).join(", ")}</strong></span>
            </div>
          )}

          {/* No WAN interfaces assigned warning */}
          {!interfacesLoading && physicalInterfaces.length === 0 && systemInterfaces.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-4">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>No interfaces assigned <strong>WAN</strong> role. Go to <strong>Gateway → System Interfaces</strong> to set interface roles first.</span>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredLinks().length === 0 ? (
                <Card className="border shadow-sm col-span-2">
                  <CardContent className="py-16 text-center">
                    <Network className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {links.length === 0 ? "No WAN links configured." : "No WAN links match your search."}
                    </p>
                    {links.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">Click &quot;Add WAN Link&quot; to get started.</p>
                    )}
                  </CardContent>
                </Card>
              ) : filteredLinks().map((link) => {
                const budgetAlert = getBudgetAlertColor(link.budgetPercent);
                const iface = getInterfaceForLink(link);
                return (
                  <Card key={link.id} className={`border shadow-sm hover:shadow-md transition-shadow animate-card-enter ${link.status === "Disconnected" ? "opacity-60" : ""}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${link.status === "Connected" ? "bg-green-500" : link.status === "Standby" ? "bg-amber-500" : "bg-red-500"}`} />
                          <CardTitle className="text-base truncate">{link.name}</CardTitle>
                          {link.isPrimary && <Badge className="bg-[#DC2626] text-white border-0 text-[10px] px-1.5 shrink-0">PRIMARY</Badge>}
                        </div>
                        <Badge variant="outline" className={
                          link.status === "Connected" ? "badge-active" :
                          link.status === "Standby" ? "badge-suspended" :
                          "badge-disconnected"
                        }>{link.status}</Badge>
                      </div>
                      {link.interfaceName && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                          <Network className="h-3 w-3" />
                          <span className="font-mono">{link.interfaceName}</span>
                          {iface && (
                            <>
                              <span>·</span>
                              <span className={iface.carrier ? "text-green-600" : "text-red-500"}>
                                {iface.carrier ? "Carrier OK" : "No Carrier"}
                              </span>
                              <span>·</span>
                              <span>{iface.speed || "Unknown speed"}</span>
                            </>
                          )}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground text-xs">ISP</span><p className="font-medium">{link.isp}</p></div>
                        <div><span className="text-muted-foreground text-xs">Type</span><p className="font-medium">{link.type}</p></div>
                        <div><span className="text-muted-foreground text-xs">IP</span><p className="font-mono text-xs">{link.ip || (iface?.ipv4 ? extractIpFromCidr(iface.ipv4) : "—")}</p></div>
                        <div><span className="text-muted-foreground text-xs">Gateway</span><p className="font-mono text-xs">{link.gateway || "—"}</p></div>
                        {isModuleEnabled("ipv6") && link.ipv6Address && (
                          <div className="col-span-2"><span className="text-muted-foreground text-xs">IPv6</span><p className="font-mono text-xs">{link.ipv6Address}</p></div>
                        )}
                        <div><span className="text-muted-foreground text-xs">Speed (ISP)</span><p className="font-medium">{link.speed || "—"} <span className="text-[10px] text-muted-foreground font-normal">↓</span> / {link.uploadSpeed || "—"} <span className="text-[10px] text-muted-foreground font-normal">↑</span></p></div>
                        <div><span className="text-muted-foreground text-xs">Uptime</span><p className="font-medium">{link.uptime || "—"}</p></div>
                      </div>

                      {/* Real-time bytes from interface */}
                      {iface && (
                        <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 rounded-lg p-2">
                          <div>
                            <span className="text-muted-foreground">RX:</span>{" "}
                            <span className="font-mono text-green-600 dark:text-green-400">{formatBytes(iface.rxBytes)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">TX:</span>{" "}
                            <span className="font-mono text-orange-600 dark:text-orange-400">{formatBytes(iface.txBytes)}</span>
                          </div>
                        </div>
                      )}

                      {/* Bandwidth Usage */}
                      {link.status === "Connected" && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Bandwidth Usage</span>
                            <span className="tabular-nums">{link.usagePercent}%</span>
                          </div>
                          <Progress value={link.usagePercent} className="h-2" />
                        </div>
                      )}

                      {/* Budget Progress */}
                      {link.monthlyBudget > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Budget Usage</span>
                            <span className={`tabular-nums font-medium ${budgetAlert.text}`}>₹{link.monthlyCost.toLocaleString()} / ₹{link.monthlyBudget.toLocaleString()} ({link.budgetPercent}%)</span>
                          </div>
                          <Progress value={Math.min(link.budgetPercent, 100)} className="h-2" />
                          {link.budgetPercent >= 80 && (
                            <div className={`flex items-center gap-1.5 text-xs rounded px-2 py-1 mt-1 ${budgetAlert.label}`}>
                              <AlertTriangle className="h-3 w-3" />
                              {link.budgetPercent >= 100 ? "Budget exceeded!" : "Approaching budget limit — 80% used"}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Failback & Weight badges */}
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        {link.autoFailback ? (
                          <Badge variant="outline" className="badge-active text-[10px]">
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Auto Failback {link.failbackDelaySec}s
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">No Auto Failback</Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">W: {link.weight}</Badge>
                        {link.maxDownloadMbps ? (
                          <Badge variant="outline" className="text-[10px]">↓{link.maxDownloadMbps}Mbps</Badge>
                        ) : null}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-3 border-t">
                        <span className="text-lg font-bold">₹{link.monthlyCost.toLocaleString()}<span className="text-xs text-muted-foreground font-normal">/mo</span></span>
                        <div className="flex gap-1 flex-wrap justify-end">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30" onClick={() => openFailoverConfirm(link)} title="Force Failover">
                            <ArrowLeftRight className="h-3 w-3 mr-1" />Failover
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openPingDialog(link)} title="Ping Test">
                            <Terminal className="h-3 w-3 mr-1" />Ping
                          </Button>
                          {link.interfaceName && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/30" onClick={() => openIpConfigDialog(link)} title="IP Config">
                              <Settings className="h-3 w-3 mr-1" />IP
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/30" onClick={() => openBudgetDialog(link)} title="Set Budget">
                            <DollarSign className="h-3 w-3 mr-1" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30" onClick={() => openShapingDialog(link)} title="Bandwidth Shaping">
                            <Gauge className="h-3 w-3 mr-1" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/30" onClick={() => openFailbackDialog(link)} title="Failback Config">
                            <RotateCcw className="h-3 w-3 mr-1" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => postAction.mutate({ action: "toggle-wan", id: link.id })} title={link.status === "Connected" ? "Bring Interface Down" : "Bring Interface Up"}>
                            {link.status === "Connected" ? <PowerOff className="h-3.5 w-3.5 text-red-500" /> : <Power className="h-3.5 w-3.5 text-green-500" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditLink(link)}><Edit2 className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDeleteLinkTarget(link)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════ TAB 2: LOAD BALANCING ═══════════════════════ */}
        <TabsContent value="load-balancing">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LB Config Card */}
            <Card className="border shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CardTitle className="text-base">Load Balancing Configuration</CardTitle>
                    {lbOsStatus?.active && <Badge className="badge-active text-[10px]">OS ACTIVE</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => { setLbCommands([]); postAction.mutate({ action: "teardown-load-balancing" }); }} disabled={postAction.isPending || !lbOsStatus?.active}>
                      {postAction.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                      Teardown OS
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => postAction.mutate({ action: "save-load-balancing", algorithm: lbLocalAlgorithm, weights: lbLocalWeights })} disabled={postAction.isPending}>
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </Button>
                    <Button size="sm" onClick={() => { setLbApplying(true); postAction.mutate({ action: "apply-load-balancing", links, algorithm: lbLocalAlgorithm, weights: lbLocalWeights }); }} disabled={postAction.isPending || lbApplying} className="bg-[#DC2626] hover:bg-[#B91C1C] text-white">
                      {(postAction.isPending || lbApplying) ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                      Apply to OS
                    </Button>
                  </div>
                </div>
                {lbOsStatus?.active && (
                  <CardDescription className="text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3 inline mr-1" />Kernel-level load balancing is active (nftables + ip rule + multi-table routing)
                  </CardDescription>
                )}
                {!lbOsStatus?.active && links.filter((l) => l.interfaceName && l.gateway).length >= 2 && (
                  <CardDescription className="text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />Configuration saved in DB only. Click &quot;Apply to OS&quot; to enable kernel-level load balancing.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Load Balancing Algorithm</Label>
                  <Select value={lbLocalAlgorithm} onValueChange={setLbLocalAlgorithm}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LB_ALGORITHMS.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a === "round-robin" ? "Round Robin" : a === "weighted" ? "Weighted" : "Least Connections"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lbLocalAlgorithm === "round-robin" && "Distributes traffic equally across all active WAN links in rotation order."}
                    {lbLocalAlgorithm === "weighted" && "Routes traffic proportionally based on each link's weight and capacity."}
                    {lbLocalAlgorithm === "least-connections" && "Sends new connections to the link with fewest active connections."}
                  </p>
                </div>

                <Separator />

                <div>
                  <Label className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Link Weights
                    <span className="text-xs text-muted-foreground font-normal">(Used when algorithm is Weighted)</span>
                  </Label>
                  <div className="mt-2 space-y-2">
                    {links.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No WAN links configured. Add links first.</p>
                    ) : links.map((link) => (
                      <div key={link.id} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${link.status === "Connected" ? "bg-green-500" : "bg-red-500"}`} />
                          <span className="text-sm font-medium truncate">{link.name}</span>
                          <span className="text-xs text-muted-foreground hidden sm:inline">{link.speed}</span>
                        </div>
                        <Slider
                          min={1}
                          max={100}
                          value={[lbLocalWeights[link.id] || link.weight || 1]}
                          onValueChange={([v]) => setLbLocalWeights((prev) => ({ ...prev, [link.id]: v }))}
                          className="w-24"
                        />
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          className="w-16 h-8 text-sm text-center"
                          value={lbLocalWeights[link.id] || link.weight || 1}
                          onChange={(e) => setLbLocalWeights((prev) => ({ ...prev, [link.id]: parseInt(e.target.value) || 1 }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {lbLocalAlgorithm === "weighted" && links.filter((l) => l.status === "Connected").length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span>Traffic distribution: {links.filter((l) => l.status === "Connected").map((l) => {
                      const w = lbLocalWeights[l.id] || l.weight || 1;
                      const total = links.filter((ll) => ll.status === "Connected").reduce((s, ll) => s + (lbLocalWeights[ll.id] || ll.weight || 1), 0);
                      const pct = total > 0 ? Math.round((w / total) * 100) : 0;
                      return `${l.name}: ${pct}%`;
                    }).join(" · ")}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* NAT & Bandwidth Distribution */}
            <div className="space-y-6">
              {/* NAT Toggle Card */}
              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Route className="h-4 w-4" />
                    NAT Configuration (OS Integration)
                  </CardTitle>
                  <CardDescription>Enable/disable masquerade NAT per WAN interface using <strong>nftables</strong>.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {links.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No WAN links configured.</p>
                  ) : links.map((link) => (
                    <div key={link.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${link.status === "Connected" ? "bg-green-500" : "bg-red-500"}`} />
                        <span className="text-sm font-medium truncate">{link.name}</span>
                        {link.interfaceName && <span className="text-xs text-muted-foreground font-mono">({link.interfaceName})</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${natStates[link.id] ? "badge-active" : ""}`}>
                          {natStates[link.id] ? "NAT ON" : "NAT OFF"}
                        </Badge>
                        <Switch
                          checked={natStates[link.id] ?? false}
                          onCheckedChange={() => handleToggleNat(link)}
                          disabled={!link.interfaceName || postAction.isPending}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Route Management */}
              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Route className="h-4 w-4" />
                    Route Management
                  </CardTitle>
                  <CardDescription>Add and manage static routes on the system.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div><Label className="text-xs">Destination</Label><Input placeholder="0.0.0.0/0" value={routeForm.dest} onChange={(e) => setRouteForm({ ...routeForm, dest: e.target.value })} className="h-8 text-sm" /></div>
                    <div><Label className="text-xs">Gateway (via)</Label><Input placeholder="192.168.1.1" value={routeForm.via} onChange={(e) => setRouteForm({ ...routeForm, via: e.target.value })} className="h-8 text-sm" /></div>
                    <div><Label className="text-xs">Device</Label>
                      <Select value={routeForm.dev} onValueChange={(v) => setRouteForm({ ...routeForm, dev: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {physicalInterfaces.map((i) => <SelectItem key={i.name} value={i.name}>{i.name}</SelectItem>)}
                          {links.filter((l) => l.interfaceName).map((l) => (
                            <SelectItem key={l.id} value={l.interfaceName!}>{l.name} ({l.interfaceName})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1"><Label className="text-xs">Metric</Label><Input type="number" placeholder="100" value={routeForm.metric} onChange={(e) => setRouteForm({ ...routeForm, metric: e.target.value })} className="h-8 text-sm" /></div>
                      <Button size="sm" className="h-8 bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={handleAddRoute} disabled={postAction.isPending}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Default Gateway Section */}
                  <Separator />
                  <div>
                    <Label className="text-xs font-medium uppercase">Default Gateway</Label>
                    <div className="flex gap-2 mt-2">
                      <Select value="__none__" onValueChange={(gw) => {
                        if (gw === "__none__") return;
                        const link = links.find((l) => l.gateway === gw);
                        if (link && link.interfaceName) {
                          postAction.mutate({ action: "set-gateway", gateway: gw, dev: link.interfaceName, metric: 100 });
                        }
                      }}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Set default gateway..." /></SelectTrigger>
                        <SelectContent>
                          {links.filter((l) => l.gateway && l.interfaceName).map((l) => (
                            <SelectItem key={l.id} value={l.gateway}>{l.name}: {l.gateway} (dev {l.interfaceName})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Current Routes from link gateways */}
                  <Separator />
                  <div>
                    <Label className="text-xs font-medium uppercase mb-2 block">Configured WAN Gateways</Label>
                    {links.filter((l) => l.gateway).length === 0 ? (
                      <p className="text-xs text-muted-foreground">No gateways configured.</p>
                    ) : (
                      <div className="space-y-1">
                        {links.filter((l) => l.gateway).map((l) => (
                          <div key={l.id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/30">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{l.gateway}</span>
                              <span className="text-muted-foreground">via {l.interfaceName || "—"}</span>
                              <span className="text-muted-foreground">({l.name})</span>
                            </div>
                            {l.isPrimary && <Badge className="bg-[#DC2626] text-white border-0 text-[10px] px-1.5">DEFAULT</Badge>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════ TAB 3: FAILOVER RULES ═══════════════════════ */}
        <TabsContent value="failover">
          <Card className="border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Failover Rules</CardTitle>
                <CardDescription className="text-xs mt-1">Define automatic failover triggers between WAN links.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setEditingRule(null); resetRuleForm(); setRuleDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" />Add Rule
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium uppercase text-center">Priority</TableHead>
                        <TableHead className="text-xs font-medium uppercase">From</TableHead>
                        <TableHead className="text-xs font-medium uppercase">To</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Trigger</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-center">Auto Failback</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-center">Prefer Primary</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Delay</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Last Triggered</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.length === 0 ? (
                        <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No failover rules configured.</TableCell></TableRow>
                      ) : rules.map((rule) => (
                        <TableRow key={rule.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell className="text-center"><Badge variant="outline" className="font-bold">{rule.priority}</Badge></TableCell>
                          <TableCell className="text-sm font-medium">{rule.fromLink}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-medium">{rule.toLink}</span>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{rule.trigger}</Badge></TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={rule.autoFailback ? "badge-active" : "badge-pending"}>
                              {rule.autoFailback ? `Yes` : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={rule.preferPrimary ? "badge-active" : "badge-pending"}>
                              {rule.preferPrimary ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">{rule.failbackDelaySec}s</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{rule.lastTriggered || "Never"}</TableCell>
                          <TableCell>
                            <Switch
                              checked={rule.status === "Active"}
                              onCheckedChange={() => {
                                postAction.mutate({
                                  action: "update-rule",
                                  id: rule.id,
                                  name: `${rule.fromLink} → ${rule.toLink}`,
                                  primaryWanId: links.find((l) => l.name === rule.fromLink)?.id,
                                  backupWanId: links.find((l) => l.name === rule.toLink)?.id,
                                  triggerCondition: rule.trigger,
                                  autoFailback: rule.autoFailback,
                                  preferPrimary: rule.preferPrimary,
                                  failbackDelaySec: rule.failbackDelaySec,
                                  priority: rule.priority,
                                  enabled: rule.status !== "Active",
                                });
                              }}
                              disabled={postAction.isPending}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRule(rule)}><Edit2 className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDeleteRuleTarget(rule)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

          {/* ── Health Monitor Daemon ── */}
          <Card className="border shadow-sm mt-6">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Auto-Failover Health Monitor
                    {monitorStatus?.running && <Badge className="badge-active text-[10px]">RUNNING</Badge>}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Background daemon that pings WAN gateways and auto-triggers failover on failure. Uses <code className="text-xs bg-muted px-1 py-0.5 rounded">nftables</code> + <code className="text-xs bg-muted px-1 py-0.5 rounded">ip route</code>.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => postAction.mutate({ action: "health-monitor-force-check" })} disabled={!monitorStatus?.running || postAction.isPending}>
                    <RefreshCw className={`h-3.5 w-3.5 ${postAction.isPending ? "animate-spin" : ""} mr-1.5`} />
                    Force Check
                  </Button>
                  {monitorStatus?.running ? (
                    <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => postAction.mutate({ action: "health-monitor-stop" })} disabled={postAction.isPending}>
                      <PowerOff className="h-3.5 w-3.5 mr-1.5" />Stop
                    </Button>
                  ) : (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => postAction.mutate({ action: "health-monitor-start" })} disabled={postAction.isPending || links.filter((l) => l.interfaceName && l.gateway).length < 2}>
                      <Power className="h-3.5 w-3.5 mr-1.5" />Start
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!monitorStatus ? (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Health monitor service is not running. Start it to enable automatic failover.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Monitor stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-2 bg-muted/30 rounded-lg">
                      <p className="text-lg font-bold tabular-nums">{Math.floor(monitorStatus.uptimeSeconds / 60)}m</p>
                      <p className="text-[10px] text-muted-foreground">Uptime</p>
                    </div>
                    <div className="text-center p-2 bg-muted/30 rounded-lg">
                      <p className="text-lg font-bold tabular-nums">{monitorStatus.checkInterval}s</p>
                      <p className="text-[10px] text-muted-foreground">Check Interval</p>
                    </div>
                    <div className="text-center p-2 bg-muted/30 rounded-lg">
                      <p className="text-sm font-mono font-medium">{monitorStatus.currentDefaultGateway || "—"}</p>
                      <p className="text-[10px] text-muted-foreground">Current GW</p>
                    </div>
                  </div>

                  {/* Per-link health */}
                  {monitorStatus.links.length > 0 && (
                    <div>
                      <Label className="text-xs font-medium uppercase mb-2 block">Gateway Health</Label>
                      <div className="space-y-1.5">
                        {monitorStatus.links.map((mlink) => {
                          const isUp = mlink.lastPacketLoss === 0 && mlink.consecutiveFails === 0;
                          return (
                            <div key={mlink.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/30 text-xs">
                              <div className={cn("w-2 h-2 rounded-full shrink-0", isUp ? "bg-green-500" : "bg-red-500", isUp ? "" : "animate-pulse")} />
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <span className="font-medium truncate">{mlink.name}</span>
                                {mlink.isPrimary && <Badge className="bg-[#DC2626] text-white border-0 text-[8px] px-1">PRI</Badge>}
                                <span className="text-muted-foreground font-mono">{mlink.gateway}</span>
                                <span className="text-muted-foreground">({mlink.interfaceName})</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 tabular-nums">
                                <span className={isUp ? "text-green-600" : "text-red-600"}>
                                  {mlink.lastLatency != null ? <>{mlink.lastLatency.toFixed(1)}ms</> : "—"}
                                </span>
                                <span className={mlink.lastPacketLoss > 0 ? "text-red-600" : "text-muted-foreground"}>
                                  {mlink.lastPacketLoss}% loss
                                </span>
                                <span className="text-muted-foreground">
                                  ✓{mlink.consecutiveSuccess} ✗{mlink.consecutiveFails}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Failover events */}
                  {monitorStatus.failoverEvents.length > 0 && (
                    <div>
                      <Label className="text-xs font-medium uppercase mb-2 block">Recent Failover Events</Label>
                      <div className="space-y-1">
                        {monitorStatus.failoverEvents.slice(0, 5).map((evt, i) => (
                          <div key={i} className={cn("flex items-center gap-2 text-xs py-1 px-2 rounded", evt.type === "failover" ? "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400" : "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400")}>
                            <ShieldAlert className="h-3 w-3 shrink-0" />
                            <span>{evt.type === "failover" ? "Failover" : "Failback"}: {evt.fromLink} → {evt.toLink}</span>
                            <span className="text-muted-foreground ml-auto">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════ TAB 4: WAN TRAFFIC ═══════════════════════ */}
        <TabsContent value="traffic">
          <div className="space-y-6">
            {/* Real-time Traffic Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {interfacesLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)
              ) : links.length === 0 ? (
                <Card className="border shadow-sm col-span-full"><CardContent className="py-12 text-center text-muted-foreground">No WAN links configured.</CardContent></Card>
              ) : links.map((link) => {
                const iface = getInterfaceForLink(link);
                return (
                  <Card key={link.id} className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${link.status === "Connected" ? "bg-green-500" : "bg-red-500"}`} />
                          {link.name}
                          {link.interfaceName && <span className="text-xs text-muted-foreground font-mono">({link.interfaceName})</span>}
                        </CardTitle>
                        {iface && (
                          <Badge variant="outline" className={iface.carrier ? "badge-active text-[10px]" : "badge-disconnected text-[10px]"}>
                            {iface.carrier ? "UP" : "DOWN"}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {iface ? (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Download (RX)</p>
                            <p className="font-mono font-semibold text-green-600 dark:text-green-400">{formatBytes(iface.rxBytes)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Upload (TX)</p>
                            <p className="font-mono font-semibold text-orange-600 dark:text-orange-400">{formatBytes(iface.txBytes)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Speed</p>
                            <p className="font-medium">{iface.speed || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">MTU</p>
                            <p className="font-medium">{iface.mtu || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">IPv4</p>
                            <p className="font-mono text-xs truncate">{iface.ipv4 || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Status</p>
                            <p className="font-medium">{iface.status || "—"}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No interface assigned</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Hourly Traffic Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border shadow-sm lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Per-Device Traffic (24h)</CardTitle>
                    <div className="flex items-center gap-2">
                      {tab === "traffic" && <Badge variant="outline" className="text-[10px] animate-pulse">Live (10s)</Badge>}
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { queryClient.invalidateQueries({ queryKey: ["multiwan"] }); queryClient.invalidateQueries({ queryKey: ["system-interfaces"] }); }} disabled={isFetching}>
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />Refresh
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <TrafficBarChart traffic={traffic} hasRealData={hasRealTrafficData} />
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardHeader><CardTitle className="text-base">Bandwidth Distribution</CardTitle></CardHeader>
                <CardContent><BandwidthDistributionChart links={links} /></CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════ TAB 5: EVENTS ═══════════════════════ */}
        <TabsContent value="events">
          <Card className="border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">WAN Event History</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => queryClient.invalidateQueries({ queryKey: ["multiwan"] })} disabled={isFetching}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading events...</span>
                </div>
              ) : events.length === 0 ? (
                <div className="py-16 text-center">
                  <History className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">No WAN events recorded</p>
                  <p className="text-xs text-muted-foreground mt-1">Events appear here when WAN links are modified, failover is triggered, or configuration changes are made.</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto divide-y">
                  {events.map((event) => {
                    const actionLabel = event.action === "STATUS_CHANGE" ? "Status Change" :
                      event.action === "DELETE" ? "Deleted" :
                      event.action === "CREATE" ? "Created" :
                      event.action === "FAILOVER" ? "Failover" :
                      event.action === "CONFIG_CHANGE" ? "Configuration Change" :
                      event.action;
                    const detailStr = event.details ? Object.entries(event.details)
                      .filter(([k]) => !["endpoint", "method", "ipAddress", "userAgent"].includes(k))
                      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                      .join(" · ") : "";
                    return (
                      <div key={event.id} className={`flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors border-l-2 ${getEventColor(event.action)}`}>
                        <div className="mt-0.5">{getEventIcon(event.action)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{actionLabel}</span>
                            <Badge variant="outline" className="text-[10px]">{event.userName}</Badge>
                          </div>
                          {detailStr && <p className="text-xs text-muted-foreground mt-0.5 break-all">{detailStr}</p>}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatEventTime(event.timestamp)}</span>
                      </div>
                    );
                  })}
                  <div ref={eventsEndRef} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════ TAB 6: SHAPING ═══════════════════════ */}
        <TabsContent value="shaping">
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Configure per-link traffic shaping using Linux <code className="text-xs bg-muted px-1 py-0.5 rounded">tc</code> (traffic control).
              Enable shaping to apply rate limits and burst ceilings on each WAN interface.
            </p>

            {/* Shaping Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {links.length === 0 ? (
                <Card className="border shadow-sm col-span-full"><CardContent className="py-12 text-center text-muted-foreground">No WAN links configured.</CardContent></Card>
              ) : links.map((link) => {
                const shapeState = shapingStates[link.id] ?? { enabled: false, rate: "100", ceil: "150" };
                return (
                  <Card key={link.id} className={`border shadow-sm ${shapeState.enabled ? "ring-2 ring-[#DC2626]/30" : ""}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${link.status === "Connected" ? "bg-green-500" : "bg-red-500"}`} />
                          {link.name}
                          {link.interfaceName && <span className="text-xs text-muted-foreground font-mono">({link.interfaceName})</span>}
                        </CardTitle>
                        <Badge variant="outline" className={shapeState.enabled ? "badge-active text-[10px]" : "text-[10px]"}>
                          {shapeState.enabled ? "tc ACTIVE" : "tc OFF"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Current limits */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Max DL</span><p className="font-mono">{link.maxDownloadMbps ? `${link.maxDownloadMbps} Mbps` : "—"}</p></div>
                        <div><span className="text-muted-foreground">Max UL</span><p className="font-mono">{link.maxUploadMbps ? `${link.maxUploadMbps} Mbps` : "—"}</p></div>
                        <div><span className="text-muted-foreground">Burst</span><p className="font-mono">{link.burstSizeMbps ? `${link.burstSizeMbps} Mbps` : "—"}</p></div>
                        <div><span className="text-muted-foreground">Priority</span><p className="font-mono">{link.linkPriority || 5}</p></div>
                      </div>

                      {/* tc rate/ceil controls */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Rate (Mbps)</Label>
                          <Input
                            type="number" min={1} className="h-7 text-xs"
                            value={shapeState.rate}
                            onChange={(e) => setShapingStates((prev) => ({ ...prev, [link.id]: { ...shapeState, rate: e.target.value } }))}
                            disabled={!link.interfaceName}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Ceil (Mbps)</Label>
                          <Input
                            type="number" min={1} className="h-7 text-xs"
                            value={shapeState.ceil}
                            onChange={(e) => setShapingStates((prev) => ({ ...prev, [link.id]: { ...shapeState, ceil: e.target.value } }))}
                            disabled={!link.interfaceName}
                          />
                        </div>
                      </div>

                      {/* Buttons */}
                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs flex-1"
                          onClick={() => handleToggleShaping(link)}
                          disabled={!link.interfaceName || postAction.isPending}
                        >
                          {shapeState.enabled ? <><PowerOff className="h-3 w-3 mr-1" />Disable</> : <><Power className="h-3 w-3 mr-1" />Enable</>}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openShapingDialog(link)}>
                          <Pencil className="h-3 w-3 mr-1" />Limits
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Shaping Table */}
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium uppercase">Link</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Interface</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-center">Max DL</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-center">Max UL</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-center">Burst</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-center">Priority</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-center">tc Status</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {links.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No WAN links configured.</TableCell></TableRow>
                      ) : links.map((link) => {
                        const shapeState = shapingStates[link.id] ?? { enabled: false, rate: "100", ceil: "150" };
                        return (
                          <TableRow key={link.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${link.status === "Connected" ? "bg-green-500" : "bg-red-500"}`} />
                                <span className="text-sm font-medium">{link.name}</span>
                                {link.isPrimary && <Badge className="bg-[#DC2626] text-white border-0 text-[10px] px-1.5">PRI</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{link.interfaceName || "—"}</TableCell>
                            <TableCell className="text-center text-sm tabular-nums">{link.maxDownloadMbps ? `${link.maxDownloadMbps} Mbps` : "—"}</TableCell>
                            <TableCell className="text-center text-sm tabular-nums">{link.maxUploadMbps ? `${link.maxUploadMbps} Mbps` : "—"}</TableCell>
                            <TableCell className="text-center text-sm tabular-nums">{link.burstSizeMbps ? `${link.burstSizeMbps} Mbps` : "—"}</TableCell>
                            <TableCell className="text-center"><Badge variant="outline" className="text-xs">{link.linkPriority || 5}</Badge></TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={shapeState.enabled ? "badge-active text-[10px]" : "text-[10px]"}>
                                {shapeState.enabled ? `ON (${shapeState.rate}/${shapeState.ceil} Mbps)` : "OFF"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleToggleShaping(link)} disabled={!link.interfaceName || postAction.isPending}>
                                  {shapeState.enabled ? <PowerOff className="h-3 w-3 mr-1" /> : <Power className="h-3 w-3 mr-1" />}
                                  {shapeState.enabled ? "Disable" : "Enable"}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30" onClick={() => openShapingDialog(link)}>
                                  <Pencil className="h-3 w-3 mr-1" />Edit
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/30" onClick={() => openFailbackDialog(link)}>
                                  <RotateCcw className="h-3 w-3 mr-1" />Failback
                                </Button>
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
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════ DIALOGS ═══════════════════ */}

      {/* Add/Edit WAN Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={(o) => { setLinkDialogOpen(o); if (!o) { setEditingLink(null); resetLinkForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLink ? "Edit WAN Link" : "Add WAN Link"}</DialogTitle>
            <DialogDescription>{editingLink ? "Update an existing WAN link configuration." : "Add a new WAN link with OS interface binding."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="mb-1 block">Link Name *</Label><Input value={linkForm.name} onChange={(e) => setLinkForm({ ...linkForm, name: e.target.value })} placeholder="WAN-Primary" /></div>
              <div><Label className="mb-1 block">ISP Name *</Label><Input value={linkForm.isp} onChange={(e) => setLinkForm({ ...linkForm, isp: e.target.value })} placeholder="Airtel Enterprise" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="mb-1 block">Connection Type</Label>
                <Select value={linkForm.type} onValueChange={(v) => setLinkForm({ ...linkForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{WAN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="mb-1 block">Role</Label>
                <Select value={linkForm.role} onValueChange={(v) => setLinkForm({ ...linkForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Primary">Primary</SelectItem>
                    <SelectItem value="Backup">Backup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Physical Interface Dropdown with Auto-fill */}
            <div>
              <Label className="mb-1 block">Physical Interface</Label>
              <Select value={linkForm.interfaceName || "__none__"} onValueChange={(v) => handleInterfaceSelect(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select interface" /></SelectTrigger>
                <SelectContent>
                  {interfacesLoading ? (
                    <SelectItem value="__none__" disabled>Scanning interfaces...</SelectItem>
                  ) : physicalInterfaces.length === 0 ? (
                    <SelectItem value="__none__" disabled>No interfaces with WAN role. Assign in Gateway → System Interfaces</SelectItem>
                  ) : (
                    <>
                      <SelectItem value="__none__">None (unassigned)</SelectItem>
                      {physicalInterfaces.map((iface) => (
                        <SelectItem key={iface.name} value={iface.name}>
                          {iface.name} — {iface.mac || "no MAC"} {iface.carrier ? "●" : "○"} {iface.ipv4 ? `(${extractIpFromCidr(iface.ipv4)})` : ""}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Only interfaces assigned <strong>WAN</strong> role in Gateway → System Interfaces are shown. Selecting an interface auto-fills IP from system data.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1 block flex items-center gap-1.5">
                  Download Speed
                  <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ISP Provisioned</span>
                </Label>
                <Input value={linkForm.downloadSpeed} onChange={(e) => setLinkForm({ ...linkForm, downloadSpeed: e.target.value })} placeholder="1000 Mbps" />
                <p className="text-[11px] text-muted-foreground mt-1">Link capacity from ISP (e.g. 100 Mbps, 1 Gbps)</p>
              </div>
              <div>
                <Label className="mb-1 block flex items-center gap-1.5">
                  Upload Speed
                  <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ISP Provisioned</span>
                </Label>
                <Input value={linkForm.uploadSpeed} onChange={(e) => setLinkForm({ ...linkForm, uploadSpeed: e.target.value })} placeholder="500 Mbps" />
                <p className="text-[11px] text-muted-foreground mt-1">Upload capacity from ISP</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>This is the <strong>ISP-provisioned link capacity</strong>, not bandwidth capping. To cap/limit traffic per link, use the <strong>Shaping tab</strong>.</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="mb-1 block">IP Address / CIDR</Label><Input value={linkForm.ip} onChange={(e) => setLinkForm({ ...linkForm, ip: e.target.value })} placeholder="103.45.67.1/24" /></div>
              <div><Label className="mb-1 block">Gateway</Label><Input value={linkForm.gateway} onChange={(e) => setLinkForm({ ...linkForm, gateway: e.target.value })} placeholder="103.45.67.254" /></div>
            </div>
            {isModuleEnabled("ipv6") && (
              <div className="space-y-4">
                <Separator />
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Globe className="h-4 w-4" />
                  IPv6 Configuration
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>IPv6 Address</Label>
                    <Input placeholder="2001:db8:10::2/64" className="font-mono text-sm" value={linkForm.ipv6Address} onChange={(e) => setLinkForm({ ...linkForm, ipv6Address: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>IPv6 Gateway</Label>
                    <Input placeholder="2001:db8:10::1" className="font-mono text-sm" value={linkForm.ipv6Gateway} onChange={(e) => setLinkForm({ ...linkForm, ipv6Gateway: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Health Check</Label>
                    <Input placeholder="2001:4860:4860::8888" className="font-mono text-sm" value={linkForm.ipv6HealthTarget} onChange={(e) => setLinkForm({ ...linkForm, ipv6HealthTarget: e.target.value })} />
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="mb-1 block">Monthly Cost (₹)</Label><Input type="number" value={linkForm.monthlyCost} onChange={(e) => setLinkForm({ ...linkForm, monthlyCost: e.target.value })} /></div>
              <div><Label className="mb-1 block">Weight</Label><Input type="number" min={1} value={linkForm.weight} onChange={(e) => setLinkForm({ ...linkForm, weight: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setLinkDialogOpen(false); setEditingLink(null); resetLinkForm(); }}>Cancel</Button>
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={handleSaveLink} disabled={postAction.isPending || !linkForm.name || !linkForm.isp}>
                {postAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingLink ? "Update" : "Add Link"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Failover Rule Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={(o) => { setRuleDialogOpen(o); if (!o) { setEditingRule(null); resetRuleForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Failover Rule" : "Add Failover Rule"}</DialogTitle>
            <DialogDescription>{editingRule ? "Update the failover rule configuration." : "Create a new failover rule between WAN links."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div><Label className="mb-1 block">Priority</Label><Input type="number" min={1} value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="mb-1 block">From Link *</Label>
                <Select value={ruleForm.fromLink} onValueChange={(v) => setRuleForm({ ...ruleForm, fromLink: v })}>
                  <SelectTrigger><SelectValue placeholder="Select link" /></SelectTrigger>
                  <SelectContent>{links.map((l) => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="mb-1 block">To Link *</Label>
                <Select value={ruleForm.toLink} onValueChange={(v) => setRuleForm({ ...ruleForm, toLink: v })}>
                  <SelectTrigger><SelectValue placeholder="Select link" /></SelectTrigger>
                  <SelectContent>{links.map((l) => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="mb-1 block">Trigger Condition *</Label>
              <Select value={ruleForm.trigger} onValueChange={(v) => setRuleForm({ ...ruleForm, trigger: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3"><Switch checked={ruleForm.autoFailback} onCheckedChange={(c) => setRuleForm({ ...ruleForm, autoFailback: c })} /><Label>Auto Failback</Label></div>
              <div className="flex items-center gap-3"><Switch checked={ruleForm.preferPrimary} onCheckedChange={(c) => setRuleForm({ ...ruleForm, preferPrimary: c })} /><Label>Prefer Primary</Label></div>
            </div>
            <div><Label className="mb-1 block">Failback Delay (seconds)</Label><Input type="number" min={1} value={ruleForm.failbackDelaySec} onChange={(e) => setRuleForm({ ...ruleForm, failbackDelaySec: e.target.value })} /></div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setRuleDialogOpen(false); setEditingRule(null); resetRuleForm(); }}>Cancel</Button>
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={handleSaveRule} disabled={postAction.isPending || !ruleForm.fromLink || !ruleForm.toLink}>
                {postAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingRule ? "Update Rule" : "Add Rule"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Budget Dialog */}
      <Dialog open={budgetDialogOpen} onOpenChange={(open) => { if (!open) setBudgetTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Budget & Alert</DialogTitle>
            <DialogDescription>Set the monthly cost budget for <strong>{budgetTarget?.name}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <Label>Monthly Budget (₹)</Label>
              <Input type="number" min={0} value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} placeholder="Enter 0 to disable" />
              <p className="text-xs text-muted-foreground">Current monthly cost: ₹{(budgetTarget?.monthlyCost || 0).toLocaleString()}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => {
              if (!budgetTarget) return;
              postAction.mutate({ action: "set-budget", id: budgetTarget.id, monthlyBudget: parseFloat(budgetAmount) || 0 });
              setBudgetDialogOpen(false);
              setBudgetTarget(null);
            }} disabled={postAction.isPending || !budgetTarget}>
              {postAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shaping Dialog */}
      <Dialog open={shapingDialogOpen} onOpenChange={(open) => { if (!open) setShapingTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bandwidth Shaping Limits</DialogTitle>
            <DialogDescription>Configure max bandwidth for <strong>{shapingTarget?.name}</strong>.</DialogDescription>
          </DialogHeader>
          {shapingTarget && (
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>Max Download (Mbps)</Label><Input type="number" min={0} value={shapingForm.maxDownloadMbps} onChange={(e) => setShapingForm({ ...shapingForm, maxDownloadMbps: e.target.value })} /></div>
                <div className="grid gap-2"><Label>Max Upload (Mbps)</Label><Input type="number" min={0} value={shapingForm.maxUploadMbps} onChange={(e) => setShapingForm({ ...shapingForm, maxUploadMbps: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>Burst Size (Mbps)</Label><Input type="number" min={0} value={shapingForm.burstSizeMbps} onChange={(e) => setShapingForm({ ...shapingForm, burstSizeMbps: e.target.value })} /></div>
                <div className="grid gap-2"><Label>Priority (1-10)</Label><Input type="number" min={1} max={10} value={shapingForm.linkPriority} onChange={(e) => setShapingForm({ ...shapingForm, linkPriority: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Set values to 0 to use the link&apos;s default bandwidth limits.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShapingDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => {
              if (!shapingTarget) return;
              postAction.mutate({
                action: "save-shaping",
                id: shapingTarget.id,
                maxDownloadMbps: parseInt(shapingForm.maxDownloadMbps) || 0,
                maxUploadMbps: parseInt(shapingForm.maxUploadMbps) || 0,
                burstSizeMbps: parseInt(shapingForm.burstSizeMbps) || 0,
                linkPriority: parseInt(shapingForm.linkPriority) || 5,
              });
              setShapingDialogOpen(false);
              setShapingTarget(null);
            }} disabled={postAction.isPending}>
              {postAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Failback Configuration Dialog */}
      <Dialog open={failbackDialogOpen} onOpenChange={(open) => { if (!open) setFailbackTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Failback Configuration</DialogTitle>
            <DialogDescription>Configure automatic failback for <strong>{failbackTarget?.name}</strong>.</DialogDescription>
          </DialogHeader>
          {failbackTarget && (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Auto Failback</Label><p className="text-xs text-muted-foreground">Switch back when primary recovers</p></div>
                <Switch checked={failbackForm.autoFailback} onCheckedChange={(c) => setFailbackForm({ ...failbackForm, autoFailback: c })} />
              </div>
              <div className="grid gap-2">
                <Label>Failback Delay (seconds)</Label>
                <Input type="number" min={1} value={failbackForm.failbackDelaySec} onChange={(e) => setFailbackForm({ ...failbackForm, failbackDelaySec: e.target.value })} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div><Label>Stability Check</Label><p className="text-xs text-muted-foreground">Verify link stability before failback</p></div>
                <Switch checked={failbackForm.stabilityCheckEnabled} onCheckedChange={(c) => setFailbackForm({ ...failbackForm, stabilityCheckEnabled: c })} />
              </div>
              <div className="grid gap-2">
                <Label>Minimum Uptime (seconds)</Label>
                <Input type="number" min={10} value={failbackForm.minUptimeSeconds} onChange={(e) => setFailbackForm({ ...failbackForm, minUptimeSeconds: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailbackDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => {
              if (!failbackTarget) return;
              postAction.mutate({
                action: "save-failback-config",
                id: failbackTarget.id,
                autoFailback: failbackForm.autoFailback,
                failbackDelaySec: parseInt(failbackForm.failbackDelaySec) || 60,
                stabilityCheckEnabled: failbackForm.stabilityCheckEnabled,
                minUptimeSeconds: parseInt(failbackForm.minUptimeSeconds) || 300,
              });
              setFailbackDialogOpen(false);
              setFailbackTarget(null);
            }} disabled={postAction.isPending}>
              {postAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ping Test Dialog */}
      <Dialog open={pingDialogOpen} onOpenChange={(open) => { if (!open) setPingTarget(null); setPingResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ping Test</DialogTitle>
            <DialogDescription>Test network connectivity{pingTarget && pingTarget.name !== "Quick Test" ? ` via <strong>${pingTarget.name}</strong>` : ""}.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Host</Label>
                <Input value={pingForm.host} onChange={(e) => setPingForm({ ...pingForm, host: e.target.value })} placeholder="8.8.8.8" />
              </div>
              <div className="grid gap-2">
                <Label>Ping Count</Label>
                <Input type="number" min={1} max={20} value={pingForm.count} onChange={(e) => setPingForm({ ...pingForm, count: e.target.value })} />
              </div>
            </div>

            {pingResult && (
              <div className="space-y-3">
                {/* ICMP blocked warning */}
                {pingResult.error && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{pingResult.error}</span>
                  </div>
                )}
                <div className={`rounded-lg border p-4 ${pingResult.alive ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    {pingResult.alive ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                    <span className={`font-semibold ${pingResult.alive ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                      {pingResult.alive ? "Host is Reachable" : "Host is Unreachable"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground text-xs">Avg Latency:</span> <span className="font-mono">{pingResult.avgLatency !== null ? `${pingResult.avgLatency.toFixed(1)} ms` : "—"}</span></div>
                    <div><span className="text-muted-foreground text-xs">Min Latency:</span> <span className="font-mono">{pingResult.minLatency !== null ? `${pingResult.minLatency.toFixed(1)} ms` : "—"}</span></div>
                    <div><span className="text-muted-foreground text-xs">Max Latency:</span> <span className="font-mono">{pingResult.maxLatency !== null ? `${pingResult.maxLatency.toFixed(1)} ms` : "—"}</span></div>
                    <div><span className="text-muted-foreground text-xs">Packet Loss:</span> <span className={`font-mono font-semibold ${pingResult.packetLoss > 0 ? "text-red-600" : "text-green-600"}`}>{pingResult.packetLoss}%</span></div>
                  </div>
                  {pingResult.output && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-1">Raw Output:</p>
                      <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-32 font-mono">{pingResult.output}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPingDialogOpen(false); setPingTarget(null); setPingResult(null); }}>Close</Button>
            <Button
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              onClick={() => {
                if (!pingForm.host) { toast.error("Host is required"); return; }
                pingMutation.mutate({ action: "ping-test", host: pingForm.host, count: parseInt(pingForm.count) || 3 });
              }}
              disabled={pingMutation.isPending || !pingForm.host}
            >
              {pingMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Terminal className="h-4 w-4 mr-2" />}
              Run Ping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IP Configuration Dialog */}
      <Dialog open={ipConfigDialogOpen} onOpenChange={(open) => { if (!open) setIpConfigTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>IP Configuration — {ipConfigTarget?.interfaceName}</DialogTitle>
            <DialogDescription>Configure IP address on the network interface. This directly modifies the OS network configuration.</DialogDescription>
          </DialogHeader>
          {ipConfigTarget && (
            <div className="py-4 space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Interface: <span className="font-mono font-medium">{ipConfigTarget.interfaceName || "—"}</span></p>
                <p className="text-xs text-muted-foreground">Current IP: <span className="font-mono font-medium">{ipConfigTarget.ip || getInterfaceForLink(ipConfigTarget)?.ipv4 || "—"}</span></p>
                <p className="text-xs text-muted-foreground">Gateway: <span className="font-mono font-medium">{ipConfigTarget.gateway || "—"}</span></p>
              </div>
              <div className="grid gap-2">
                <Label>New IP Address (CIDR)</Label>
                <Input
                  value={ipConfigForm.cidr}
                  onChange={(e) => setIpConfigForm({ cidr: e.target.value })}
                  placeholder="e.g. 103.45.67.1/24"
                />
                <p className="text-xs text-muted-foreground">Flushes existing addresses and applies the new one using <code className="bg-muted px-1 rounded">ip addr flush</code> + <code className="bg-muted px-1 rounded">ip addr add</code>.</p>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="text-red-600 hover:text-red-700 border-red-200" onClick={() => {
              if (!ipConfigTarget?.interfaceName) return;
              postAction.mutate({ action: "flush-ip", iface: ipConfigTarget.interfaceName });
              setIpConfigDialogOpen(false);
              setIpConfigTarget(null);
            }} disabled={postAction.isPending}>
              {postAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Flush All IPs
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => { setIpConfigDialogOpen(false); setIpConfigTarget(null); }}>Cancel</Button>
            <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => {
              if (!ipConfigTarget?.interfaceName || !ipConfigForm.cidr) { toast.error("Interface name and CIDR are required"); return; }
              postAction.mutate({ action: "configure-ip", iface: ipConfigTarget.interfaceName, cidr: ipConfigForm.cidr });
              setIpConfigDialogOpen(false);
              setIpConfigTarget(null);
            }} disabled={postAction.isPending || !ipConfigForm.cidr}>
              {postAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Failover Confirmation */}
      <AlertDialog open={failoverConfirmOpen} onOpenChange={(open) => { if (!open) setFailoverTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Manual Failover</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">Warning:</span> This will switch the system default gateway to <strong>{failoverTarget?.name}</strong>.
              This is a disruptive operation that will briefly interrupt network connectivity.
              <div className="mt-3 bg-muted/50 rounded p-2 text-xs space-y-1">
                <p>Target: <span className="font-mono">{failoverTarget?.name}</span></p>
                <p>Gateway: <span className="font-mono">{failoverForm.targetGateway}</span></p>
                <p>Interface: <span className="font-mono">{failoverForm.targetInterface || failoverTarget?.interfaceName}</span></p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={postAction.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!failoverTarget) return;
                postAction.mutate({
                  action: "force-failover",
                  id: failoverTarget.id,
                  targetGateway: failoverForm.targetGateway || failoverTarget.gateway,
                  targetInterface: failoverForm.targetInterface || failoverTarget.interfaceName,
                });
                setFailoverConfirmOpen(false);
                setFailoverTarget(null);
              }}
              disabled={postAction.isPending}
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
            >
              {postAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Execute Failover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete WAN Link Confirmation */}
      <AlertDialog open={!!deleteLinkTarget} onOpenChange={(open) => { if (!open) setDeleteLinkTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete WAN Link</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteLinkTarget?.name}</strong> ({deleteLinkTarget?.isp})?
              Any failover rules referencing this link will become invalid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={postAction.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteLinkTarget) postAction.mutate({ action: "delete-wan", id: deleteLinkTarget.id }); setDeleteLinkTarget(null); }} disabled={postAction.isPending} className="bg-red-600 hover:bg-red-700">
              {postAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Failover Rule Confirmation */}
      <AlertDialog open={!!deleteRuleTarget} onOpenChange={(open) => { if (!open) setDeleteRuleTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Failover Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the rule <strong>{deleteRuleTarget?.fromLink} → {deleteRuleTarget?.toLink}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={postAction.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteRuleTarget) postAction.mutate({ action: "delete-rule", id: deleteRuleTarget.id }); setDeleteRuleTarget(null); }} disabled={postAction.isPending} className="bg-red-600 hover:bg-red-700">
              {postAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
