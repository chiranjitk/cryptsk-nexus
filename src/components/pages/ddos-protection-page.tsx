"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldOff, Plus, Trash2, Search,
  RefreshCw, AlertTriangle, CheckCircle, XCircle, Loader2, Edit,
  Activity, Clock, Zap, Globe, Lock, Eye, Swords, Target, Flame,
  Server, Network, Wifi, Ban, ChevronRight, Radio, Cpu, Gauge,
  BarChart3, TrendingUp, Users, FileWarning, Play, RotateCcw,
  ToggleLeft, ToggleRight, Bell, Mail, Calendar, MapPin, ListFilter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useModuleStore } from "@/store/module-store";

// ─── Types ───────────────────────────────────────────────────────
type DdosProtectionType =
  | "SYN_FLOOD" | "UDP_FLOOD" | "ICMP_FLOOD" | "ACK_FLOOD"
  | "DNS_AMPLIFICATION" | "NTP_AMPLIFICATION" | "SSDP_AMPLIFICATION" | "MEMCACHED_AMPLIFICATION"
  | "FRAG_ATTACK" | "PING_OF_DEATH" | "SMURF_ATTACK" | "SLOWLORIS"
  | "ZERO_DAY_EXPLOIT" | "PORT_SCAN" | "BRUTE_FORCE"
  | "CONNECTION_LIMIT" | "RATE_LIMIT" | "IP_REPUTATION"
  | "GEO_BLOCK" | "BOGON_FILTER" | "BLACKLIST" | "WHITELIST";

type DdosAction = "DROP" | "REJECT" | "RATE_LIMIT" | "LOG" | "NOTIFY" | "TARPIT";

interface DdosPolicy {
  id: string;
  name: string;
  description?: string;
  protectionType: DdosProtectionType;
  enabled: boolean;
  thresholdPps?: number;
  thresholdBps?: number;
  connectionRate?: number;
  rateLimitPps?: number;
  rateLimitBps?: number;
  burstSize?: number;
  action: DdosAction;
  logEnabled?: boolean;
  logPrefix?: string;
  notifyEnabled?: boolean;
  notifyEmail?: string;
  targetInterface?: string;
  targetPorts?: string;
  targetProtocols?: string;
  sourceWhitelist?: string;
  sourceBlacklist?: string;
  geoBlockCountries?: string;
  scheduleEnabled?: boolean;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  scheduleDays?: string;
  hitCount?: number;
  packetCount?: number;
  byteCount?: number;
  lastHit?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DdosStats {
  totalPolicies: number;
  activePolicies: number;
  totalHits: number;
  blockedPackets: number;
  topAttackType?: string;
}

interface DdosCounter {
  policyId: string;
  policyName: string;
  protectionType: DdosProtectionType;
  enabled: boolean;
  hitCount: number;
  packetCount: number;
  byteCount: number;
  hitsPerSecond: number;
  pps: number;
  bps: number;
  lastHit?: string;
  sparkline?: number[];
}

interface TopOffender {
  sourceIp: string;
  hitCount: number;
  packetCount: number;
  attackTypes: string[];
  firstSeen: string;
  lastSeen: string;
  blocked: boolean;
}

interface AttackEvent {
  id: string;
  timestamp: string;
  sourceIp: string;
  attackType: DdosProtectionType;
  severity: "low" | "medium" | "high" | "critical";
  pps: number;
  bps: number;
  action: string;
  policyName: string;
}

interface NftablesChain {
  name: string;
  table: string;
  type: string;
  hook: string;
  priority: number;
  rules: number;
  packets: number;
  bytes: number;
}

interface NftablesRule {
  handle: number;
  expression: string;
  verdict: string;
  packets: number;
  bytes: number;
  comments?: string;
}

interface NftablesStatus {
  chains: NftablesChain[];
  rules: NftablesRule[];
  totalRules: number;
  totalPackets: number;
  totalBytes: number;
  lastUpdated: string;
}

interface QuickRule {
  id: string;
  name: string;
  description: string;
  protectionType: DdosProtectionType;
  icon: React.ElementType;
  color: string;
  defaults: Partial<DdosPolicy>;
}

interface NetworkTrafficStats {
  totalPps: number;
  totalBps: number;
  conntrackUsed: number;
  conntrackMax: number;
  activeRules: number;
  totalRules: number;
  topBlockedIps: { ip: string; blockedPkts: number; lastBlocked: string }[];
  ruleEfficiency: number;
}

// ─── Constants ────────────────────────────────────────────────────
const PROTECTION_TYPES: { value: DdosProtectionType; label: string; category: string }[] = [
  { value: "SYN_FLOOD", label: "SYN Flood", category: "flood" },
  { value: "UDP_FLOOD", label: "UDP Flood", category: "flood" },
  { value: "ICMP_FLOOD", label: "ICMP Flood", category: "flood" },
  { value: "ACK_FLOOD", label: "ACK Flood", category: "flood" },
  { value: "DNS_AMPLIFICATION", label: "DNS Amplification", category: "amplification" },
  { value: "NTP_AMPLIFICATION", label: "NTP Amplification", category: "amplification" },
  { value: "SSDP_AMPLIFICATION", label: "SSDP Amplification", category: "amplification" },
  { value: "MEMCACHED_AMPLIFICATION", label: "Memcached Amplification", category: "amplification" },
  { value: "FRAG_ATTACK", label: "Fragmentation Attack", category: "exploit" },
  { value: "PING_OF_DEATH", label: "Ping of Death", category: "exploit" },
  { value: "SMURF_ATTACK", label: "Smurf Attack", category: "exploit" },
  { value: "SLOWLORIS", label: "Slowloris", category: "exploit" },
  { value: "ZERO_DAY_EXPLOIT", label: "Zero-Day Exploit", category: "exploit" },
  { value: "PORT_SCAN", label: "Port Scan", category: "exploit" },
  { value: "BRUTE_FORCE", label: "Brute Force", category: "exploit" },
  { value: "CONNECTION_LIMIT", label: "Connection Limit", category: "filter" },
  { value: "RATE_LIMIT", label: "Rate Limit", category: "filter" },
  { value: "IP_REPUTATION", label: "IP Reputation", category: "filter" },
  { value: "GEO_BLOCK", label: "Geo Block", category: "filter" },
  { value: "BOGON_FILTER", label: "Bogon Filter", category: "filter" },
  { value: "BLACKLIST", label: "Blacklist", category: "filter" },
  { value: "WHITELIST", label: "Whitelist", category: "filter" },
];

const CATEGORY_STYLES: Record<string, { gradient: string; badge: string; icon: string }> = {
  flood: { gradient: "stat-gradient-red", badge: "bg-red-100 text-red-700 border-red-200", icon: "text-red-500" },
  amplification: { gradient: "stat-gradient-amber", badge: "bg-amber-100 text-amber-700 border-amber-200", icon: "text-amber-500" },
  exploit: { gradient: "stat-gradient-purple", badge: "bg-purple-100 text-purple-700 border-purple-200", icon: "text-purple-500" },
  filter: { gradient: "stat-gradient-emerald", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "text-emerald-500" },
};

const ACTION_COLORS: Record<string, string> = {
  DROP: "bg-red-100 text-red-700 border-red-200",
  REJECT: "bg-orange-100 text-orange-700 border-orange-200",
  RATE_LIMIT: "bg-amber-100 text-amber-700 border-amber-200",
  LOG: "bg-blue-100 text-blue-700 border-blue-200",
  NOTIFY: "bg-cyan-100 text-cyan-700 border-cyan-200",
  TARPIT: "bg-purple-100 text-purple-700 border-purple-200",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-600 text-white border-red-700",
};

const DEFAULT_FORM: Omit<DdosPolicy, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  description: "",
  protectionType: "SYN_FLOOD",
  enabled: true,
  thresholdPps: 10000,
  thresholdBps: 100000000,
  connectionRate: 1000,
  rateLimitPps: 5000,
  rateLimitBps: 50000000,
  burstSize: 1000,
  action: "DROP",
  logEnabled: true,
  logPrefix: "DDoS",
  notifyEnabled: false,
  notifyEmail: "",
  targetInterface: "",
  targetPorts: "",
  targetProtocols: "",
  sourceWhitelist: "",
  sourceBlacklist: "",
  geoBlockCountries: "",
  scheduleEnabled: false,
  scheduleStartTime: "00:00",
  scheduleEndTime: "23:59",
  scheduleDays: "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
};

const QUICK_RULES: QuickRule[] = [
  {
    id: "syn-protect",
    name: "SYN Flood Protection",
    description: "Block SYN floods with TCP SYN rate limiting and threshold detection",
    protectionType: "SYN_FLOOD",
    icon: Zap,
    color: "text-red-500",
    defaults: {
      name: "SYN Flood Protection",
      description: "Auto-generated SYN flood protection rule",
      protectionType: "SYN_FLOOD",
      enabled: true,
      thresholdPps: 50000,
      thresholdBps: 500000000,
      action: "DROP",
      logEnabled: true,
      logPrefix: "SYN-FLOOD",
      targetProtocols: "tcp",
    },
  },
  {
    id: "udp-protect",
    name: "UDP Flood Protection",
    description: "Mitigate UDP floods with rate limiting on high-volume UDP traffic",
    protectionType: "UDP_FLOOD",
    icon: Radio,
    color: "text-orange-500",
    defaults: {
      name: "UDP Flood Protection",
      description: "Auto-generated UDP flood protection rule",
      protectionType: "UDP_FLOOD",
      enabled: true,
      thresholdPps: 100000,
      thresholdBps: 1000000000,
      action: "DROP",
      logEnabled: true,
      logPrefix: "UDP-FLOOD",
      targetProtocols: "udp",
    },
  },
  {
    id: "icmp-protect",
    name: "ICMP Flood Protection",
    description: "Limit ICMP traffic to prevent Ping of Death and ICMP floods",
    protectionType: "ICMP_FLOOD",
    icon: Wifi,
    color: "text-yellow-500",
    defaults: {
      name: "ICMP Flood Protection",
      description: "Auto-generated ICMP flood protection rule",
      protectionType: "ICMP_FLOOD",
      enabled: true,
      thresholdPps: 10000,
      thresholdBps: 100000000,
      action: "DROP",
      logEnabled: true,
      logPrefix: "ICMP-FLOOD",
      targetProtocols: "icmp",
    },
  },
  {
    id: "port-scan",
    name: "Block Port Scanner",
    description: "Detect and block port scanning activity using connection rate analysis",
    protectionType: "PORT_SCAN",
    icon: Eye,
    color: "text-purple-500",
    defaults: {
      name: "Port Scan Detection",
      description: "Auto-generated port scan protection rule",
      protectionType: "PORT_SCAN",
      enabled: true,
      connectionRate: 20,
      thresholdPps: 500,
      action: "DROP",
      logEnabled: true,
      logPrefix: "PORT-SCAN",
    },
  },
  {
    id: "bogon-filter",
    name: "Enable Bogon Filter",
    description: "Drop traffic from reserved, private, and non-routable IP addresses",
    protectionType: "BOGON_FILTER",
    icon: ShieldOff,
    color: "text-emerald-500",
    defaults: {
      name: "Bogon Filter",
      description: "Drop traffic from bogon/reserved IP ranges",
      protectionType: "BOGON_FILTER",
      enabled: true,
      action: "DROP",
      logEnabled: true,
      logPrefix: "BOGON",
    },
  },
  {
    id: "conn-limit",
    name: "Enable Connection Limiting",
    description: "Limit concurrent connections per source IP to prevent resource exhaustion",
    protectionType: "CONNECTION_LIMIT",
    icon: Users,
    color: "text-teal-500",
    defaults: {
      name: "Connection Limit",
      description: "Limit concurrent connections per source IP",
      protectionType: "CONNECTION_LIMIT",
      enabled: true,
      connectionRate: 100,
      action: "REJECT",
      logEnabled: true,
      logPrefix: "CONN-LIMIT",
    },
  },
  {
    id: "rate-limit",
    name: "Enable Rate Limiting",
    description: "Apply global rate limiting to prevent traffic spikes and abuse",
    protectionType: "RATE_LIMIT",
    icon: Gauge,
    color: "text-cyan-500",
    defaults: {
      name: "Global Rate Limit",
      description: "Global rate limiting policy",
      protectionType: "RATE_LIMIT",
      enabled: true,
      rateLimitPps: 10000,
      rateLimitBps: 1000000000,
      burstSize: 5000,
      action: "RATE_LIMIT",
      logEnabled: true,
      logPrefix: "RATE-LIMIT",
    },
  },
];

// ─── Helper Functions ─────────────────────────────────────────────
function getCategory(type: DdosProtectionType): string {
  return PROTECTION_TYPES.find((t) => t.value === type)?.category || "filter";
}

function getCategoryStyle(type: DdosProtectionType) {
  return CATEGORY_STYLES[getCategory(type)] || CATEGORY_STYLES.filter;
}

function formatNumber(n: number | undefined | null): string {
  if (n == null) return "0";
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(1)}B`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatBps(bps: number | undefined | null): string {
  if (!bps) return "0 bps";
  if (bps >= 1000000000) return `${(bps / 1000000000).toFixed(1)} Gbps`;
  if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
  if (bps >= 1000) return `${(bps / 1000).toFixed(1)} Kbps`;
  return `${bps} bps`;
}

function getTypeLabel(type: DdosProtectionType): string {
  return PROTECTION_TYPES.find((t) => t.value === type)?.label || type;
}

function timeAgo(dateStr: string | undefined | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ─── StatCard ─────────────────────────────────────────────────────
function StatCard({
  title, value, subtitle, icon: Icon, gradient, delay,
}: {
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

// ─── MiniSparkline ────────────────────────────────────────────────
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const width = 80;
  const height = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function DdosProtectionPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  const [tab, setTab] = useState("policies");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Dialog state
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<DdosPolicy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DdosPolicy | null>(null);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  // ─── Queries ─────────────────────────────────────────────────
  const {
    data: policiesData, isLoading: policiesLoading, refetch: refetchPolicies,
  } = useQuery({
    queryKey: ["ddos-policies"],
    queryFn: () => apiFetch<{ policies: DdosPolicy[]; stats: DdosStats }>("/api/ddos?section=policies"),
    refetchInterval: 30000,
  });

  const {
    data: countersData, isLoading: countersLoading, refetch: refetchCounters,
  } = useQuery({
    queryKey: ["ddos-counters"],
    queryFn: () => apiFetch<DdosCounter[]>("/api/ddos?section=counters"),
    refetchInterval: 5000,
    enabled: tab === "counters",
  });

  const {
    data: monitorData, isLoading: monitorLoading, refetch: refetchMonitor,
  } = useQuery({
    queryKey: ["ddos-monitor"],
    queryFn: () => apiFetch<{ topOffenders: TopOffender[]; recentEvents: AttackEvent[]; attackDistribution: Record<string, number> }>("/api/ddos?section=monitor"),
    refetchInterval: 10000,
    enabled: tab === "monitor",
  });

  const {
    data: nftablesData, isLoading: nftablesLoading, refetch: refetchNftables,
  } = useQuery({
    queryKey: ["ddos-nftables"],
    queryFn: () => apiFetch<NftablesStatus>("/api/ddos?section=nftables"),
    refetchInterval: 15000,
    enabled: tab === "nftables",
  });

  const {
    data: trafficStatsData,
  } = useQuery<NetworkTrafficStats>({
    queryKey: ["ddos-traffic-stats"],
    queryFn: () =>
      apiFetch<NetworkTrafficStats>("/api/ddos/counters").catch(() => ({
        totalPps: 0, totalBps: 0, conntrackUsed: 0, conntrackMax: 0,
        activeRules: 0, totalRules: 0, topBlockedIps: [], ruleEfficiency: 0,
      })),
    refetchInterval: 10000,
    enabled: tab === "nftables",
    staleTime: 5000,
  });

  const trafficStats = trafficStatsData;

  const policies = policiesData?.policies || [];
  const stats = policiesData?.stats || {
    totalPolicies: 0, activePolicies: 0, totalHits: 0, blockedPackets: 0,
  };
  const counters = countersData || [];
  const topOffenders = monitorData?.topOffenders || [];
  const recentEvents = monitorData?.recentEvents || [];
  const attackDistribution = monitorData?.attackDistribution || {};
  const nftables = nftablesData;

  const filteredPolicies = policies.filter((p) => {
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = typeFilter === "all" || p.protectionType === typeFilter;
    return matchSearch && matchType;
  });

  // ─── Mutations ───────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/ddos", {
        method: "POST",
        body: JSON.stringify({ action: "create", ...body }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("DDoS policy created successfully");
        setPolicyDialogOpen(false);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ["ddos-policies"] });
      } else {
        toast.error(d.error || "Failed to create policy");
      }
    },
    onError: () => toast.error("Failed to create DDoS policy"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; [key: string]: unknown }) =>
      apiFetch("/api/ddos", {
        method: "PUT",
        body: JSON.stringify({ id, ...payload }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("DDoS policy updated");
        setPolicyDialogOpen(false);
        setEditingPolicy(null);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ["ddos-policies"] });
      } else {
        toast.error(d.error || "Failed to update policy");
      }
    },
    onError: () => toast.error("Failed to update DDoS policy"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/ddos?id=${id}`, { method: "DELETE" }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("DDoS policy deleted");
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: ["ddos-policies"] });
      } else {
        toast.error(d.error || "Failed to delete");
      }
    },
    onError: () => toast.error("Failed to delete DDoS policy"),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/ddos", {
        method: "POST",
        body: JSON.stringify({ action: "apply" }),
      }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("All DDoS rules applied to nftables successfully");
        setApplyConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ["ddos-nftables"] });
      } else {
        toast.error(d.error || "Failed to apply rules");
      }
    },
    onError: () => toast.error("Failed to apply DDoS rules"),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/ddos", {
        method: "POST",
        body: JSON.stringify({ action: "reset-counters" }),
      }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("All counters reset to zero");
        setResetConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ["ddos-counters"] });
        queryClient.invalidateQueries({ queryKey: ["ddos-policies"] });
      } else {
        toast.error(d.error || "Failed to reset counters");
      }
    },
    onError: () => toast.error("Failed to reset counters"),
  });

  const quickRuleMutation = useMutation({
    mutationFn: (defaults: Record<string, unknown>) =>
      apiFetch("/api/ddos", {
        method: "POST",
        body: JSON.stringify({ action: "quick-rule", ...defaults }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("Quick rule created and applied");
        queryClient.invalidateQueries({ queryKey: ["ddos-policies"] });
      } else {
        toast.error(d.error || "Failed to create quick rule");
      }
    },
    onError: () => toast.error("Failed to create quick rule"),
  });

  // ─── Helpers ─────────────────────────────────────────────────
  function resetForm() {
    setForm(DEFAULT_FORM);
    setEditingPolicy(null);
  }

  function openDialog(policy?: DdosPolicy) {
    if (policy) {
      setEditingPolicy(policy);
      setForm({
        name: policy.name,
        description: policy.description || "",
        protectionType: policy.protectionType,
        enabled: policy.enabled,
        thresholdPps: policy.thresholdPps || 10000,
        thresholdBps: policy.thresholdBps || 100000000,
        connectionRate: policy.connectionRate || 1000,
        rateLimitPps: policy.rateLimitPps || 5000,
        rateLimitBps: policy.rateLimitBps || 50000000,
        burstSize: policy.burstSize || 1000,
        action: policy.action,
        logEnabled: policy.logEnabled ?? true,
        logPrefix: policy.logPrefix || "DDoS",
        notifyEnabled: policy.notifyEnabled ?? false,
        notifyEmail: policy.notifyEmail || "",
        targetInterface: policy.targetInterface || "",
        targetPorts: policy.targetPorts || "",
        targetProtocols: policy.targetProtocols || "",
        sourceWhitelist: policy.sourceWhitelist || "",
        sourceBlacklist: policy.sourceBlacklist || "",
        geoBlockCountries: policy.geoBlockCountries || "",
        scheduleEnabled: policy.scheduleEnabled ?? false,
        scheduleStartTime: policy.scheduleStartTime || "00:00",
        scheduleEndTime: policy.scheduleEndTime || "23:59",
        scheduleDays: policy.scheduleDays || "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
      });
    } else {
      resetForm();
    }
    setPolicyDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("Policy name is required");
      return;
    }
    if (editingPolicy) {
      updateMutation.mutate({ id: editingPolicy.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleQuickRule(rule: QuickRule) {
    quickRuleMutation.mutate(rule.defaults as Record<string, unknown>);
  }

  // ─── Loading State ───────────────────────────────────────────
  if (policiesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full mb-2" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Swords className="h-6 w-6 text-red-500" />
            DDoS Protection
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Advanced DDoS mitigation with nftables — 22 attack types, real-time monitoring, automated response
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setResetConfirmOpen(true)}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset Counters
          </Button>
          <Button
            variant="outline" size="sm"
            className="border-green-200 text-green-700 hover:bg-green-50"
            onClick={() => setApplyConfirmOpen(true)}
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            Apply All Rules
          </Button>
          <Dialog open={policyDialogOpen} onOpenChange={(o) => { setPolicyDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => openDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Create Policy
              </Button>
            </DialogTrigger>
            {/* ─── Add/Edit Policy Dialog ───────────────────────── */}
            <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-red-500" />
                  {editingPolicy ? "Edit DDoS Policy" : "Create DDoS Policy"}
                </DialogTitle>
                <DialogDescription>
                  {editingPolicy ? "Update an existing DDoS protection policy" : "Configure protection against specific DDoS attack types"}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-5 py-4">
                {/* Basic Info */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    Basic Information
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Name *</Label>
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. SYN Flood Shield" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Protection Type *</Label>
                      <Select value={form.protectionType} onValueChange={(v) => setForm({ ...form, protectionType: v as DdosProtectionType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PROTECTION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              <span className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${
                                  t.category === "flood" ? "bg-red-500" :
                                  t.category === "amplification" ? "bg-amber-500" :
                                  t.category === "exploit" ? "bg-purple-500" : "bg-emerald-500"
                                }`} />
                                {t.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Description</Label>
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description of this policy" rows={2} />
                  </div>
                </div>

                <Separator />

                {/* Thresholds & Rate Limits */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    Thresholds & Rate Limits
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Threshold PPS</Label>
                      <Input type="number" value={form.thresholdPps} onChange={(e) => setForm({ ...form, thresholdPps: parseInt(e.target.value) || 0 })} />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatNumber(form.thresholdPps)} packets/sec</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Threshold BPS</Label>
                      <Input type="number" value={form.thresholdBps} onChange={(e) => setForm({ ...form, thresholdBps: parseInt(e.target.value) || 0 })} />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatBps(form.thresholdBps)}</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Connection Rate</Label>
                      <Input type="number" value={form.connectionRate} onChange={(e) => setForm({ ...form, connectionRate: parseInt(e.target.value) || 0 })} />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatNumber(form.connectionRate)} conn/sec</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Rate Limit PPS</Label>
                      <Input type="number" value={form.rateLimitPps} onChange={(e) => setForm({ ...form, rateLimitPps: parseInt(e.target.value) || 0 })} />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatNumber(form.rateLimitPps)} packets/sec</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Rate Limit BPS</Label>
                      <Input type="number" value={form.rateLimitBps} onChange={(e) => setForm({ ...form, rateLimitBps: parseInt(e.target.value) || 0 })} />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatBps(form.rateLimitBps)}</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Burst Size</Label>
                      <Input type="number" value={form.burstSize} onChange={(e) => setForm({ ...form, burstSize: parseInt(e.target.value) || 0 })} />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatNumber(form.burstSize)} packets</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Action & Response */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    Action & Response
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Action</Label>
                      <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v as DdosAction })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DROP">DROP — Silently drop packets</SelectItem>
                          <SelectItem value="REJECT">REJECT — Reject with RST/ICMP</SelectItem>
                          <SelectItem value="RATE_LIMIT">RATE_LIMIT — Throttle traffic</SelectItem>
                          <SelectItem value="LOG">LOG — Log only (no action)</SelectItem>
                          <SelectItem value="NOTIFY">NOTIFY — Alert only</SelectItem>
                          <SelectItem value="TARPIT">TARPIT — Slow down connection</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Log Prefix</Label>
                      <Input value={form.logPrefix} onChange={(e) => setForm({ ...form, logPrefix: e.target.value })} placeholder="DDoS" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={form.logEnabled} onCheckedChange={(v) => setForm({ ...form, logEnabled: v })} />
                      <Label className="text-sm">Enable Logging</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={form.notifyEnabled} onCheckedChange={(v) => setForm({ ...form, notifyEnabled: v })} />
                      <Label className="text-sm">Enable Notifications</Label>
                    </div>
                    {form.notifyEnabled && (
                      <div className="ml-9">
                        <Label className="text-xs font-medium mb-1 block text-muted-foreground">Notify Email</Label>
                        <Input value={form.notifyEmail} onChange={(e) => setForm({ ...form, notifyEmail: e.target.value })} placeholder="noc@example.com" className="max-w-sm" />
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Target Configuration */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Network className="h-4 w-4 text-muted-foreground" />
                    Target Configuration
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Target Interface</Label>
                      <Input value={form.targetInterface} onChange={(e) => setForm({ ...form, targetInterface: e.target.value })} placeholder="e.g. eth0, br-wan" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Target Ports</Label>
                      <Input value={form.targetPorts} onChange={(e) => setForm({ ...form, targetPorts: e.target.value })} placeholder="e.g. 80,443,53" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Target Protocols</Label>
                      <Input value={form.targetProtocols} onChange={(e) => setForm({ ...form, targetProtocols: e.target.value })} placeholder="e.g. tcp, udp, icmp" />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Source Controls */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Ban className="h-4 w-4 text-muted-foreground" />
                    Source Controls
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Source Whitelist (CIDR)</Label>
                      <Textarea value={form.sourceWhitelist} onChange={(e) => setForm({ ...form, sourceWhitelist: e.target.value })} placeholder="e.g. 10.0.0.0/8, 172.16.0.0/12" rows={2} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Source Blacklist (CIDR)</Label>
                      <Textarea value={form.sourceBlacklist} onChange={(e) => setForm({ ...form, sourceBlacklist: e.target.value })} placeholder="e.g. 192.168.1.100/32" rows={2} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Geo Block Countries (ISO codes)</Label>
                    <Input value={form.geoBlockCountries} onChange={(e) => setForm({ ...form, geoBlockCountries: e.target.value })} placeholder="e.g. CN,RU,KP" />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Comma-separated ISO 3166-1 alpha-2 country codes</p>
                  </div>
                </div>

                <Separator />

                {/* Schedule */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Schedule
                  </h4>
                  <div className="flex items-center gap-2 mb-2">
                    <Switch checked={form.scheduleEnabled} onCheckedChange={(v) => setForm({ ...form, scheduleEnabled: v })} />
                    <Label className="text-sm">Enable Schedule</Label>
                  </div>
                  {form.scheduleEnabled && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label className="text-xs font-medium mb-1 block">Start Time</Label>
                        <Input type="time" value={form.scheduleStartTime} onChange={(e) => setForm({ ...form, scheduleStartTime: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs font-medium mb-1 block">End Time</Label>
                        <Input type="time" value={form.scheduleEndTime} onChange={(e) => setForm({ ...form, scheduleEndTime: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs font-medium mb-1 block">Days</Label>
                        <Input value={form.scheduleDays} onChange={(e) => setForm({ ...form, scheduleDays: e.target.value })} placeholder="Mon,Tue,Wed" />
                        <p className="text-[10px] text-muted-foreground mt-0.5">Comma-separated day abbreviations</p>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Enable Toggle */}
                <div className="flex items-center gap-3">
                  <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                  <Label className="text-sm font-medium">Policy Enabled</Label>
                  {form.enabled ? (
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">
                      <ToggleRight className="h-3 w-3 mr-0.5" />Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      <ToggleLeft className="h-3 w-3 mr-0.5" />Inactive
                    </Badge>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setPolicyDialogOpen(false); resetForm(); }}>Cancel</Button>
                <Button
                  className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
                  onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                  ) : editingPolicy ? "Update Policy" : "Create Policy"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Policies" value={stats.totalPolicies} subtitle="DDoS protection rules" icon={Shield} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Active Policies" value={stats.activePolicies} subtitle="Currently enforcing" icon={ShieldCheck} gradient="stat-gradient-green" delay={75} />
        <StatCard title="Total Hits" value={formatNumber(stats.totalHits)} subtitle="Attack detections" icon={Activity} gradient="stat-gradient-amber" delay={150} />
        <StatCard title="Blocked Packets" value={formatNumber(stats.blockedPackets)} subtitle="Dropped by nftables" icon={Ban} gradient="stat-gradient-purple" delay={225} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="policies" className="text-xs sm:text-sm">Protection Policies</TabsTrigger>
          <TabsTrigger value="counters" className="text-xs sm:text-sm">Live Counters</TabsTrigger>
          <TabsTrigger value="monitor" className="text-xs sm:text-sm">Attack Monitor</TabsTrigger>
          <TabsTrigger value="quick-rules" className="text-xs sm:text-sm">Quick Rules</TabsTrigger>
          <TabsTrigger value="nftables" className="text-xs sm:text-sm">nftables Status</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Protection Policies ─────────────────────── */}
        <TabsContent value="policies">
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search policies by name or description..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Filter by type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {PROTECTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${
                            t.category === "flood" ? "bg-red-500" :
                            t.category === "amplification" ? "bg-amber-500" :
                            t.category === "exploit" ? "bg-purple-500" : "bg-emerald-500"
                          }`} />
                          {t.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => refetchPolicies()}>
                  <RefreshCw className="h-4 w-4 mr-1" />Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[560px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-medium uppercase">Name</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Threshold</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Action</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Hits</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Packets</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden xl:table-cell">Last Hit</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPolicies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p>No DDoS policies found. Create one or use Quick Rules to get started.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPolicies.map((policy) => {
                        const catStyle = getCategoryStyle(policy.protectionType);
                        return (
                          <TableRow key={policy.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg ${catStyle.badge}`}>
                                  <Shield className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <span className="text-sm font-medium block truncate max-w-[160px]">{policy.name}</span>
                                  {policy.description && (
                                    <span className="text-[10px] text-muted-foreground truncate block max-w-[160px]">{policy.description}</span>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs whitespace-nowrap ${catStyle.badge}`}>
                                {getTypeLabel(policy.protectionType)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {policy.enabled ? (
                                <Badge variant="outline" className="badge-active text-xs"><CheckCircle className="h-3 w-3 mr-0.5" />On</Badge>
                              ) : (
                                <Badge variant="outline" className="badge-inactive text-xs"><XCircle className="h-3 w-3 mr-0.5" />Off</Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="text-xs space-y-0.5">
                                <div>{formatNumber(policy.thresholdPps)} PPS</div>
                                <div className="text-muted-foreground">{formatBps(policy.thresholdBps)}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${ACTION_COLORS[policy.action] || ""}`}>
                                {policy.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell tabular-nums text-sm">
                              {formatNumber(policy.hitCount)}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell tabular-nums text-sm text-muted-foreground">
                              {formatNumber(policy.packetCount)}
                            </TableCell>
                            <TableCell className="hidden xl:table-cell text-xs text-muted-foreground whitespace-nowrap">
                              {timeAgo(policy.lastHit)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDialog(policy)}>
                                        <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit policy</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(policy)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete policy</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Live Counters ───────────────────────────── */}
        <TabsContent value="counters">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4 animate-pulse text-green-500" />
              Auto-refreshing every 5 seconds
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchCounters()}>
              <RefreshCw className={`h-4 w-4 mr-1 ${countersLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {countersLoading && counters.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full" />
              ))}
            </div>
          ) : counters.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {counters.map((counter) => {
                const catStyle = getCategoryStyle(counter.protectionType);
                const sparkColor = counter.enabled
                  ? (getCategory(counter.protectionType) === "flood" ? "#ef4444" :
                     getCategory(counter.protectionType) === "amplification" ? "#f59e0b" :
                     getCategory(counter.protectionType) === "exploit" ? "#a855f7" : "#10b981")
                  : "#94a3b8";
                return (
                  <Card key={counter.policyId} className="border shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${catStyle.badge}`}>
                            <Shield className="h-3.5 w-3.5" />
                          </div>
                          <span className="truncate max-w-[180px]">{counter.policyName}</span>
                        </CardTitle>
                        {counter.enabled ? (
                          <Badge variant="outline" className="badge-active text-[10px]"><CheckCircle className="h-2.5 w-2.5 mr-0.5" />Live</Badge>
                        ) : (
                          <Badge variant="outline" className="badge-inactive text-[10px]"><XCircle className="h-2.5 w-2.5 mr-0.5" />Off</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                      <Badge variant="outline" className={`text-[10px] ${catStyle.badge}`}>
                        {getTypeLabel(counter.protectionType)}
                      </Badge>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center">
                          <p className="text-lg font-bold tabular-nums">{formatNumber(counter.hitCount)}</p>
                          <p className="text-[10px] text-muted-foreground">Hits</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold tabular-nums">{formatNumber(counter.packetCount)}</p>
                          <p className="text-[10px] text-muted-foreground">Packets</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold tabular-nums">{formatNumber(counter.byteCount)}</p>
                          <p className="text-[10px] text-muted-foreground">Bytes</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t pt-2">
                        <span>PPS: {formatNumber(counter.pps)}</span>
                        <MiniSparkline data={counter.sparkline || []} color={sparkColor} />
                        <span>BPS: {formatBps(counter.bps)}</span>
                      </div>
                      {counter.lastHit && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />Last: {timeAgo(counter.lastHit)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border shadow-sm">
              <CardContent className="text-center py-12 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No active counters. Enable policies and apply rules to see live data.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Tab 3: Attack Monitor ──────────────────────────── */}
        <TabsContent value="monitor">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Radio className="h-4 w-4 text-red-500" />
              Real-time attack monitoring
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchMonitor()}>
              <RefreshCw className={`h-4 w-4 mr-1 ${monitorLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {monitorLoading && topOffenders.length === 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-96 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Top Offenders */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3 px-4 pt-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-red-500" />
                    Top Offenders
                    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200 ml-auto">
                      {topOffenders.length} sources
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ScrollArea className="max-h-[400px]">
                    {topOffenders.length > 0 ? (
                      <div className="space-y-2">
                        {topOffenders.map((offender, idx) => (
                          <div key={offender.sourceIp} className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/50 transition-colors">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              idx === 0 ? "bg-red-100 text-red-700" :
                              idx === 1 ? "bg-orange-100 text-orange-700" :
                              idx === 2 ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-500"
                            }`}>
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-mono font-medium">{offender.sourceIp}</p>
                              <div className="flex gap-1 mt-0.5">
                                {offender.attackTypes.slice(0, 3).map((t) => (
                                  <Badge key={t} variant="outline" className="text-[9px] px-1 py-0">
                                    {getTypeLabel(t as DdosProtectionType)}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold tabular-nums">{formatNumber(offender.hitCount)}</p>
                              <p className="text-[10px] text-muted-foreground">hits</p>
                            </div>
                            {offender.blocked && (
                              <Badge variant="outline" className="bg-red-100 text-red-600 border-red-200 text-[10px] shrink-0">
                                <Ban className="h-2.5 w-2.5 mr-0.5" />Blocked
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="h-6 w-6 mx-auto mb-1 opacity-30" />
                        <p className="text-sm">No attacking sources detected</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Recent Attack Events */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3 px-4 pt-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    Recent Attack Events
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200 ml-auto">
                      {recentEvents.length} events
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ScrollArea className="max-h-[400px]">
                    {recentEvents.length > 0 ? (
                      <div className="space-y-2">
                        {recentEvents.map((event) => (
                          <div key={event.id} className="flex items-start gap-3 p-2 rounded-lg border hover:bg-muted/50 transition-colors">
                            <div className={`mt-0.5 p-1 rounded ${SEVERITY_COLORS[event.severity]}`}>
                              {event.severity === "critical" ? (
                                <AlertTriangle className="h-3 w-3" />
                              ) : event.severity === "high" ? (
                                <FileWarning className="h-3 w-3" />
                              ) : (
                                <Activity className="h-3 w-3" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <Badge variant="outline" className={`text-[10px] font-semibold ${SEVERITY_COLORS[event.severity]}`}>
                                  {event.severity.toUpperCase()}
                                </Badge>
                                <Badge variant="outline" className={`text-[10px] ${getCategoryStyle(event.attackType).badge}`}>
                                  {getTypeLabel(event.attackType)}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                <span className="font-mono">{event.sourceIp}</span> → <span className="font-medium text-foreground">{event.policyName}</span>
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                                <span>{formatNumber(event.pps)} PPS</span>
                                <span>•</span>
                                <span>{formatBps(event.bps)}</span>
                                <span>•</span>
                                <span>{event.action}</span>
                              </p>
                            </div>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                              {timeAgo(event.timestamp)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShieldCheck className="h-6 w-6 mx-auto mb-1 opacity-30" />
                        <p className="text-sm">No recent attack events</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Attack Type Distribution */}
              <Card className="border shadow-sm lg:col-span-2">
                <CardHeader className="pb-3 px-4 pt-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-purple-500" />
                    Attack Type Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {Object.keys(attackDistribution).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(attackDistribution)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([type, count]) => {
                          const total = Object.values(attackDistribution).reduce((s: number, v) => s + (v as number), 0) as number;
                          const pct = total > 0 ? ((count as number) / total) * 100 : 0;
                          const catStyle = getCategoryStyle(type as DdosProtectionType);
                          const barColor = getCategory(type as DdosProtectionType) === "flood"
                            ? "bg-gradient-to-r from-red-400 to-red-600"
                            : getCategory(type as DdosProtectionType) === "amplification"
                            ? "bg-gradient-to-r from-amber-400 to-amber-600"
                            : getCategory(type as DdosProtectionType) === "exploit"
                            ? "bg-gradient-to-r from-purple-400 to-purple-600"
                            : "bg-gradient-to-r from-emerald-400 to-emerald-600";
                          return (
                            <div key={type} className="flex items-center gap-3">
                              <div className="w-36 shrink-0">
                                <Badge variant="outline" className={`text-xs ${catStyle.badge}`}>
                                  {getTypeLabel(type as DdosProtectionType)}
                                </Badge>
                              </div>
                              <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
                              </div>
                              <div className="w-24 text-right shrink-0">
                                <span className="text-sm font-bold tabular-nums">{formatNumber(count as number)}</span>
                                <span className="text-[10px] text-muted-foreground ml-1">({pct.toFixed(1)}%)</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart3 className="h-6 w-6 mx-auto mb-1 opacity-30" />
                      <p className="text-sm">No attack distribution data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 4: Quick Rules ─────────────────────────────── */}
        <TabsContent value="quick-rules">
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4 text-amber-500" />
                <span>One-click presets — Creates policies with recommended defaults for common DDoS scenarios</span>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_RULES.map((rule) => {
              const Icon = rule.icon;
              const exists = policies.some((p) => p.name === rule.defaults.name);
              return (
                <Card key={rule.id} className="border shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg bg-muted ${rule.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        {rule.name}
                      </CardTitle>
                      {exists ? (
                        <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-[10px]">
                          <CheckCircle className="h-2.5 w-2.5 mr-0.5" />Active
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${getCategoryStyle(rule.protectionType).badge}`}>
                        {getTypeLabel(rule.protectionType)}
                      </Badge>
                      {rule.defaults.action && (
                        <Badge variant="outline" className={`text-[10px] ${ACTION_COLORS[rule.defaults.action] || ""}`}>
                          {rule.defaults.action}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      {rule.defaults.thresholdPps && (
                        <p>Threshold: {formatNumber(rule.defaults.thresholdPps)} PPS</p>
                      )}
                      {rule.defaults.connectionRate && (
                        <p>Connection limit: {formatNumber(rule.defaults.connectionRate)}/s</p>
                      )}
                      {rule.defaults.rateLimitPps && (
                        <p>Rate limit: {formatNumber(rule.defaults.rateLimitPps)} PPS</p>
                      )}
                    </div>
                    <Button
                      className="w-full"
                      variant={exists ? "outline" : "default"}
                      disabled={exists || quickRuleMutation.isPending}
                      onClick={() => handleQuickRule(rule)}
                    >
                      {exists ? (
                        <><CheckCircle className="h-4 w-4 mr-2" />Already Enabled</>
                      ) : quickRuleMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                      ) : (
                        <><Play className="h-4 w-4 mr-2" />Enable</>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* ─── IPv6-Specific Protections ───────────────────── */}
          {isModuleEnabled("ipv6") && (
            <div className="space-y-3 mt-6">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Globe className="h-5 w-5 text-cyan-500" />
                IPv6-Specific Protections
              </h3>
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      "ICMPv6 Flood (Type 128/129)",
                      "Router Advertisement Flood",
                      "Neighbor Discovery Flood",
                      "NDP Spoofing Detection",
                      "IPv6 Extension Header Attack",
                      "IPv6 Fragmentation Flood",
                      "DHCPv6 Flood",
                      "Rogue RA Detection",
                      "IPv6 Bogon Filtering",
                    ].map((type) => (
                      <button
                        key={type}
                        type="button"
                        className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 text-xs text-left transition-colors"
                        onClick={() => {
                          setForm(DEFAULT_FORM);
                          setForm((prev: any) => ({
                            ...prev,
                            name: `IPv6: ${type}`,
                            protectionType: "BOGON_FILTER",
                            targetProtocols: "ipv6-icmp",
                            logPrefix: `IPV6-${type.replace(/\s+/g, "-").toUpperCase()}`,
                          }));
                          setPolicyDialogOpen(true);
                        }}
                      >
                        <Shield className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                        {type}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 5: nftables Status ─────────────────────────── */}
        <TabsContent value="nftables">
          {/* Network Traffic Stats */}
          <Card className="border shadow-sm mb-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-red-500" />
                  Network Traffic Stats
                  <Badge variant="outline" className="text-[10px] gap-1 ml-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </Badge>
                </CardTitle>
                <span className="text-xs text-muted-foreground">Auto-refreshing every 10s</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Packets/Second</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-3xl font-bold tabular-nums text-foreground">{(trafficStats?.totalPps ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">Current packet rate</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Connection Rate</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-3xl font-bold tabular-nums text-foreground">{(trafficStats?.conntrackUsed ?? 0).toLocaleString()}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, ((trafficStats?.conntrackUsed ?? 0) / (trafficStats?.conntrackMax || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">/ {(trafficStats?.conntrackMax ?? 0).toLocaleString()} max</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Conntrack usage</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Active Rules</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-3xl font-bold tabular-nums text-foreground">
                      {trafficStats?.activeRules ?? stats.activePolicies}
                      <span className="text-lg font-normal text-muted-foreground"> / {(trafficStats?.totalRules ?? stats.totalPolicies)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Rule efficiency: <span className="font-medium text-foreground">{trafficStats?.ruleEfficiency ?? (stats.totalPolicies > 0 ? Math.round((stats.activePolicies / stats.totalPolicies) * 100) : 0)}%</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Throughput</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-3xl font-bold tabular-nums text-foreground">{formatBps(trafficStats?.totalBps)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Current bandwidth</p>
                  </CardContent>
                </Card>
              </div>
              {/* Top Blocked IPs */}
              {trafficStats?.topBlockedIps && trafficStats.topBlockedIps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top Blocked IPs</p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs font-medium uppercase">Source IP</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Blocked Packets</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Last Blocked</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trafficStats.topBlockedIps.slice(0, 5).map((item, idx) => (
                          <TableRow key={item.ip} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="text-xs font-mono">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200 w-5 h-5 p-0 flex items-center justify-center rounded-full">{idx + 1}</Badge>
                                <span>{item.ip}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs tabular-nums font-medium">{item.blockedPkts.toLocaleString()}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{timeAgo(item.lastBlocked)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Server className="h-4 w-4 text-slate-500" />
              Current nftables ruleset applied to kernel
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchNftables()}>
              <RefreshCw className={`h-4 w-4 mr-1 ${nftablesLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {nftablesLoading && !nftables ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : nftables ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-100">
                        <ListFilter className="h-4 w-4 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Rules</p>
                        <p className="text-xl font-bold tabular-nums">{nftables.totalRules}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100">
                        <Network className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Packets</p>
                        <p className="text-xl font-bold tabular-nums">{formatNumber(nftables.totalPackets)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-100">
                        <Gauge className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Bytes</p>
                        <p className="text-xl font-bold tabular-nums">{formatNumber(nftables.totalBytes)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-100">
                        <Clock className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Last Updated</p>
                        <p className="text-sm font-medium">{timeAgo(nftables.lastUpdated)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Chains */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3 px-4 pt-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-slate-500" />
                    Chain Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {nftables.chains && nftables.chains.length > 0 ? (
                    <ScrollArea className="max-h-[300px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-xs font-medium uppercase">Table</TableHead>
                            <TableHead className="text-xs font-medium uppercase">Chain</TableHead>
                            <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                            <TableHead className="text-xs font-medium uppercase">Hook</TableHead>
                            <TableHead className="text-xs font-medium uppercase">Priority</TableHead>
                            <TableHead className="text-xs font-medium uppercase">Rules</TableHead>
                            <TableHead className="text-xs font-medium uppercase">Packets</TableHead>
                            <TableHead className="text-xs font-medium uppercase">Bytes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {nftables.chains.map((chain, idx) => (
                            <TableRow key={idx} className="hover:bg-muted/50 transition-colors">
                              <TableCell className="text-xs font-mono">{chain.table}</TableCell>
                              <TableCell className="text-xs font-mono font-medium">{chain.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">{chain.type}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">{chain.hook}</TableCell>
                              <TableCell className="text-xs tabular-nums">{chain.priority}</TableCell>
                              <TableCell className="text-xs tabular-nums font-medium">{chain.rules}</TableCell>
                              <TableCell className="text-xs tabular-nums">{formatNumber(chain.packets)}</TableCell>
                              <TableCell className="text-xs tabular-nums">{formatNumber(chain.bytes)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">No chain data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Rules */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3 px-4 pt-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <FileWarning className="h-4 w-4 text-slate-500" />
                    Applied Rules
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {nftables.rules && nftables.rules.length > 0 ? (
                    <ScrollArea className="max-h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-xs font-medium uppercase w-16">#</TableHead>
                            <TableHead className="text-xs font-medium uppercase">Expression</TableHead>
                            <TableHead className="text-xs font-medium uppercase w-24">Verdict</TableHead>
                            <TableHead className="text-xs font-medium uppercase w-24">Packets</TableHead>
                            <TableHead className="text-xs font-medium uppercase w-24">Bytes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {nftables.rules.map((rule) => (
                            <TableRow key={rule.handle} className="hover:bg-muted/50 transition-colors">
                              <TableCell className="text-xs font-mono text-muted-foreground">{rule.handle}</TableCell>
                              <TableCell className="text-xs font-mono max-w-[500px] truncate">{rule.expression}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] font-semibold ${
                                  rule.verdict === "drop" ? "bg-red-100 text-red-700 border-red-200" :
                                  rule.verdict === "reject" ? "bg-orange-100 text-orange-700 border-orange-200" :
                                  rule.verdict === "accept" ? "bg-green-100 text-green-700 border-green-200" :
                                  "bg-blue-100 text-blue-700 border-blue-200"
                                }`}>
                                  {rule.verdict}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">{formatNumber(rule.packets)}</TableCell>
                              <TableCell className="text-xs tabular-nums">{formatNumber(rule.bytes)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">No rules applied. Click &quot;Apply All Rules&quot; to generate and load nftables rules.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border shadow-sm">
              <CardContent className="text-center py-12 text-muted-foreground">
                <Server className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Unable to fetch nftables status. Ensure the gateway service is running.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Delete Confirmation ──────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete DDoS Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
              This action cannot be undone. The associated nftables rule will be removed on next apply.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" />Delete Policy</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Apply Confirmation ───────────────────────────────── */}
      <AlertDialog open={applyConfirmOpen} onOpenChange={setApplyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Apply All DDoS Rules
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will regenerate and apply all active DDoS protection policies to nftables.
              Existing rules in the DDoS chains will be replaced. This may briefly affect traffic.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying...</>
              ) : (
                <><ShieldCheck className="h-4 w-4 mr-2" />Apply Rules</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Reset Counters Confirmation ──────────────────────── */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Counters</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset all DDoS hit counters and packet/byte counters to zero?
              Historical data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting...</>
              ) : (
                <><RotateCcw className="h-4 w-4 mr-2" />Reset Counters</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
