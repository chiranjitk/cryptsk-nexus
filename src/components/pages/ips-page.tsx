"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Shield, ShieldAlert, ShieldCheck, ShieldOff, Plus, Trash2, Search,
  RefreshCw, AlertTriangle, CheckCircle, XCircle, Loader2, Edit,
  Activity, Clock, Zap, Eye, Ban, Globe, Lock, Users, Radio,
  Gauge, Wifi, Bug, Fingerprint, Settings, MapPin, ScanEye,
  ChevronDown, ChevronRight, Download, Server, Network,
  ToggleLeft, ToggleRight, Unlink, CircleDot, Cpu, Swords,
  ListFilter, Play, Square, ArrowUpRight, ArrowDownRight,
  Timer, Calendar, Copy, RotateCcw, AlertCircle, Info,
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
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from "recharts";

// ─── Types ───────────────────────────────────────────────────────

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type AlertStatus = "NEW" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE";
type EventType =
  | "PORT_SCAN" | "SYN_FLOOD" | "UDP_FLOOD" | "ICMP_FLOOD"
  | "BRUTE_FORCE" | "BANDWIDTH_ABUSE" | "DNS_AMPLIFICATION"
  | "ARP_POISON" | "CONNECTION_FLOOD" | "MALWARE_C2"
  | "MAC_SPOOF" | "BOGON_SOURCE" | "BLACKLIST_HIT"
  | "GEO_BLOCK" | "PROTOCOL_ANOMALY" | "CUSTOM";

interface IpsAlert {
  id: string;
  timestamp: string;
  type: EventType;
  severity: Severity;
  sourceIp: string;
  destination: string;
  actionTaken: string;
  status: AlertStatus;
  subscriber?: string;
  details?: string;
}

interface DetectionRule {
  id: string;
  name: string;
  eventType: EventType;
  enabled: boolean;
  threshold: number;
  autoBlock: boolean;
  scoreImpact: number;
  description?: string;
  createdAt?: string;
}

interface BlockRule {
  id: string;
  ip: string;
  reason: string;
  action: string;
  duration: string;
  expiresAt?: string;
  createdBy: string;
  createdAt?: string;
}

interface ThreatScore {
  ip: string;
  score: number;
  category: string;
  lastUpdated: string;
  alertCount: number;
}

interface IpsStats {
  totalAlerts: number;
  criticalAlerts: number;
  activeBlocks: number;
  topOffenderIp?: string;
  topOffenderScore?: number;
  detectionRulesActive: number;
  daemonUptime?: string;
  daemonVersion?: string;
  lastScanTime?: string;
  attackDistribution: Record<string, number>;
  alertsBySeverity: Record<string, number>;
  alertsByHour: Array<{ hour: string; count: number }>;
}

interface DaemonStatus {
  running: boolean;
  version: string;
  uptime: string;
  activeBlocks: number;
  lastScanTime: string;
  nftablesInitialized: boolean;
}

// ─── Constants ────────────────────────────────────────────────────

const EVENT_TYPES: { value: EventType; label: string; icon: React.ElementType; color: string }[] = [
  { value: "PORT_SCAN", label: "Port Scan", icon: Eye, color: "text-purple-500" },
  { value: "SYN_FLOOD", label: "SYN Flood", icon: Zap, color: "text-red-500" },
  { value: "UDP_FLOOD", label: "UDP Flood", icon: Radio, color: "text-orange-500" },
  { value: "ICMP_FLOOD", label: "ICMP Flood", icon: Wifi, color: "text-yellow-500" },
  { value: "BRUTE_FORCE", label: "Brute Force", icon: Lock, color: "text-red-600" },
  { value: "BANDWIDTH_ABUSE", label: "Bandwidth Abuse", icon: Gauge, color: "text-amber-500" },
  { value: "DNS_AMPLIFICATION", label: "DNS Amplification", icon: Globe, color: "text-orange-600" },
  { value: "ARP_POISON", label: "ARP Poisoning", icon: ShieldAlert, color: "text-rose-500" },
  { value: "CONNECTION_FLOOD", label: "Connection Flood", icon: Users, color: "text-teal-500" },
  { value: "MALWARE_C2", label: "Malware C2", icon: Bug, color: "text-red-700" },
  { value: "MAC_SPOOF", label: "MAC Spoofing", icon: Fingerprint, color: "text-pink-500" },
  { value: "BOGON_SOURCE", label: "Bogon Source", icon: ShieldOff, color: "text-slate-500" },
  { value: "BLACKLIST_HIT", label: "Blacklist Hit", icon: Ban, color: "text-gray-600" },
  { value: "GEO_BLOCK", label: "Geo Block", icon: MapPin, color: "text-cyan-600" },
  { value: "PROTOCOL_ANOMALY", label: "Protocol Anomaly", icon: AlertTriangle, color: "text-amber-600" },
  { value: "CUSTOM", label: "Custom Rule", icon: Settings, color: "text-gray-500" },
];

const SEVERITY_STYLES: Record<Severity, string> = {
  LOW: "bg-slate-100 text-slate-700 border-slate-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-600 text-white border-red-700",
};

const STATUS_STYLES: Record<AlertStatus, string> = {
  NEW: "bg-red-100 text-red-700 border-red-200 animate-pulse",
  ACKNOWLEDGED: "bg-sky-100 text-sky-700 border-sky-200",
  RESOLVED: "bg-green-100 text-green-700 border-green-200",
  FALSE_POSITIVE: "bg-gray-100 text-gray-500 border-gray-200",
};

const DURATION_OPTIONS = [
  { value: "1h", label: "1 Hour" },
  { value: "6h", label: "6 Hours" },
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "permanent", label: "Permanent" },
];

const ACTION_OPTIONS = [
  { value: "DROP", label: "Drop (Silent)" },
  { value: "REJECT", label: "Reject (ICMP)" },
  { value: "RATE_LIMIT", label: "Rate Limit" },
];

const DEFAULT_RULE_FORM: Omit<DetectionRule, "id" | "createdAt"> = {
  name: "",
  eventType: "PORT_SCAN",
  enabled: true,
  threshold: 100,
  autoBlock: false,
  scoreImpact: 10,
  description: "",
};

const DEFAULT_BLOCK_FORM = {
  ip: "",
  reason: "",
  action: "DROP",
  duration: "24h",
};

// ─── Helpers ─────────────────────────────────────────────────────

function getEventTypeMeta(type: EventType) {
  return EVENT_TYPES.find((t) => t.value === type) || EVENT_TYPES[EVENT_TYPES.length - 1];
}

function formatNumber(n: number | undefined | null): string {
  if (n == null) return "0";
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(1)}B`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function timeAgo(dateStr: string | undefined | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function getScoreColor(score: number): string {
  if (score >= 71) return "text-red-600";
  if (score >= 41) return "text-orange-500";
  if (score >= 21) return "text-amber-500";
  return "text-green-600";
}

function getScoreBg(score: number): string {
  if (score >= 71) return "bg-red-50 border-red-200";
  if (score >= 41) return "bg-orange-50 border-orange-200";
  if (score >= 21) return "bg-amber-50 border-amber-200";
  return "bg-green-50 border-green-200";
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
            <p className="text-2xl font-bold mt-2 tabular-nums truncate">{value}</p>
            <p className="text-xs mt-1 opacity-75 truncate">{subtitle}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm shrink-0">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Daemon Offline Banner ────────────────────────────────────────

function DaemonOfflineBanner() {
  return (
    <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/40">
          <Server className="h-5 w-5 text-red-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">IPS Daemon Offline</h3>
          <p className="text-xs text-red-600/80 dark:text-red-500/70 mt-0.5">
            The IPS daemon on port 3030 is not running. Start it to enable real-time threat detection.
          </p>
        </div>
        <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-xs shrink-0">
          Disconnected
        </Badge>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export default function IpsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());

  // Dialog state
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DetectionRule | null>(null);
  const [ruleForm, setRuleForm] = useState(DEFAULT_RULE_FORM);
  const [blockForm, setBlockForm] = useState(DEFAULT_BLOCK_FORM);
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<DetectionRule | null>(null);
  const [deleteBlockTarget, setDeleteBlockTarget] = useState<BlockRule | null>(null);
  const [nftablesInitOpen, setNftablesInitOpen] = useState(false);

  // Config state
  const [whitelistInput, setWhitelistInput] = useState("");
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [autoBlockEnabled, setAutoBlockEnabled] = useState(true);
  const [defaultBlockDuration, setDefaultBlockDuration] = useState("24h");
  const [scoreDecay, setScoreDecay] = useState(0.95);
  const [alertRetention, setAlertRetention] = useState(30);

  // ─── Queries ────────────────────────────────────────────────
  const { data: daemonData, isLoading: daemonLoading, error: daemonError } = useQuery<DaemonStatus>({
    queryKey: ["ips-daemon"],
    queryFn: () => apiFetch<DaemonStatus>("/api/ips"),
    refetchInterval: 15000,
    retry: false,
  });

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery<IpsStats>({
    queryKey: ["ips-stats"],
    queryFn: () => apiFetch<IpsStats>("/api/ips/stats"),
    refetchInterval: 10000,
    retry: false,
  });

  const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<{ alerts: IpsAlert[]; total: number }>({
    queryKey: ["ips-alerts", severityFilter],
    queryFn: () => {
      let url = "/api/ips/alerts?limit=100";
      if (severityFilter !== "all") url += `&severity=${severityFilter}`;
      return apiFetch<{ alerts: IpsAlert[]; total: number }>(url);
    },
    refetchInterval: 5000,
    retry: false,
  });

  const { data: rulesData, isLoading: rulesLoading, refetch: refetchRules } = useQuery<{ rules: DetectionRule[] }>({
    queryKey: ["ips-rules"],
    queryFn: () => apiFetch<{ rules: DetectionRule[] }>("/api/ips/rules"),
    refetchInterval: 15000,
    retry: false,
  });

  const { data: blocksData, isLoading: blocksLoading, refetch: refetchBlocks } = useQuery<{ rules: BlockRule[] }>({
    queryKey: ["ips-blocks"],
    queryFn: () => apiFetch<{ rules: BlockRule[] }>("/api/ips/block-rules"),
    refetchInterval: 10000,
    retry: false,
  });

  const { data: threatData, isLoading: threatLoading, refetch: refetchThreats } = useQuery<{ scores: ThreatScore[] }>({
    queryKey: ["ips-threat-scores"],
    queryFn: () => apiFetch<{ scores: ThreatScore[] }>("/api/ips/threat-scores"),
    refetchInterval: 10000,
    retry: false,
  });

  const daemonOnline = !daemonError && daemonData?.running;
  const alerts = alertsData?.alerts || [];
  const rules = rulesData?.rules || [];
  const blocks = blocksData?.rules || [];
  const threatScores = threatData?.scores || [];
  const stats = statsData || {
    totalAlerts: 0, criticalAlerts: 0, activeBlocks: 0,
    detectionRulesActive: 0, attackDistribution: {},
    alertsBySeverity: {}, alertsByHour: [],
  };

  const filteredAlerts = alerts.filter((a) => {
    const matchSearch = !searchQuery ||
      a.sourceIp.includes(searchQuery) ||
      a.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.subscriber || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchSeverity = severityFilter === "all" || a.severity === severityFilter;
    return matchSearch && matchSeverity;
  });

  const attackChartData = Object.entries(stats.attackDistribution || {}).map(([key, val]) => ({
    name: EVENT_TYPES.find((t) => t.value === key)?.label || key,
    count: val as number,
  })).sort((a, b) => b.count - a.count).slice(0, 8);

  const top5Threats = [...threatScores].sort((a, b) => b.score - a.score).slice(0, 5);

  // ─── Mutations ──────────────────────────────────────────────
  const createRuleMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/ips/rules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("Detection rule created");
        setRuleDialogOpen(false);
        resetRuleForm();
        queryClient.invalidateQueries({ queryKey: ["ips-rules"] });
      } else {
        toast.error(d.error || "Failed to create rule");
      }
    },
    onError: () => toast.error("Failed to create detection rule"),
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; [key: string]: unknown }) =>
      apiFetch(`/api/ips/rules/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("Detection rule updated");
        setRuleDialogOpen(false);
        setEditingRule(null);
        resetRuleForm();
        queryClient.invalidateQueries({ queryKey: ["ips-rules"] });
      } else {
        toast.error(d.error || "Failed to update rule");
      }
    },
    onError: () => toast.error("Failed to update detection rule"),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ips/rules/${id}`, { method: "DELETE" }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("Detection rule deleted");
        setDeleteRuleTarget(null);
        queryClient.invalidateQueries({ queryKey: ["ips-rules"] });
      } else { toast.error(d.error || "Failed to delete"); }
    },
    onError: () => toast.error("Failed to delete detection rule"),
  });

  const createBlockMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/ips/block-rules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("Block rule created successfully");
        setBlockForm(DEFAULT_BLOCK_FORM);
        queryClient.invalidateQueries({ queryKey: ["ips-blocks"] });
      } else { toast.error(d.error || "Failed to create block rule"); }
    },
    onError: () => toast.error("Failed to create block rule"),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ips/block-rules/${id}`, { method: "DELETE" }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("Block rule removed");
        setDeleteBlockTarget(null);
        queryClient.invalidateQueries({ queryKey: ["ips-blocks"] });
      } else { toast.error(d.error || "Failed to remove block rule"); }
    },
    onError: () => toast.error("Failed to remove block rule"),
  });

  const unblockMutation = useMutation({
    mutationFn: (ip: string) =>
      apiFetch("/api/ips/block-rules/unblock", { method: "POST", body: JSON.stringify({ ip }) }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success(`Unblocked ${d.ip || "IP"}`);
        queryClient.invalidateQueries({ queryKey: ["ips-blocks"] });
      } else { toast.error(d.error || "Failed to unblock"); }
    },
    onError: () => toast.error("Failed to unblock IP"),
  });

  const bulkAckMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/ips/alerts", { method: "PUT", body: JSON.stringify({ action: "acknowledge", ids }) }),
    onSuccess: () => {
      toast.success(`${selectedAlerts.size} alerts acknowledged`);
      setSelectedAlerts(new Set());
      queryClient.invalidateQueries({ queryKey: ["ips-alerts"] });
    },
    onError: () => toast.error("Failed to acknowledge alerts"),
  });

  const bulkFalsePosMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/ips/alerts", { method: "PUT", body: JSON.stringify({ action: "false_positive", ids }) }),
    onSuccess: () => {
      toast.success(`${selectedAlerts.size} alerts marked as false positive`);
      setSelectedAlerts(new Set());
      queryClient.invalidateQueries({ queryKey: ["ips-alerts"] });
    },
    onError: () => toast.error("Failed to update alerts"),
  });

  const initNftablesMutation = useMutation({
    mutationFn: () => apiFetch("/api/ips/nftables/init", { method: "POST" }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("nftables IPS table initialized");
        setNftablesInitOpen(false);
        queryClient.invalidateQueries({ queryKey: ["ips-daemon"] });
      } else { toast.error(d.error || "Failed to initialize nftables"); }
    },
    onError: () => toast.error("Failed to initialize nftables"),
  });

  const deleteOldAlertsMutation = useMutation({
    mutationFn: () => apiFetch("/api/ips/alerts?status=RESOLVED&olderThan=7d", { method: "DELETE" }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("Old resolved alerts deleted");
        queryClient.invalidateQueries({ queryKey: ["ips-alerts"] });
      } else { toast.error(d.error || "Failed to delete old alerts"); }
    },
    onError: () => toast.error("Failed to delete old alerts"),
  });

  // ─── Helpers ─────────────────────────────────────────────────
  function resetRuleForm() {
    setRuleForm(DEFAULT_RULE_FORM);
    setEditingRule(null);
  }

  function openRuleDialog(rule?: DetectionRule) {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({
        name: rule.name,
        eventType: rule.eventType,
        enabled: rule.enabled,
        threshold: rule.threshold,
        autoBlock: rule.autoBlock,
        scoreImpact: rule.scoreImpact,
        description: rule.description || "",
      });
    } else {
      resetRuleForm();
    }
    setRuleDialogOpen(true);
  }

  function handleSaveRule() {
    if (!ruleForm.name.trim()) { toast.error("Rule name is required"); return; }
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, ...ruleForm });
    } else {
      createRuleMutation.mutate(ruleForm);
    }
  }

  function handleQuickRule(type: EventType) {
    const meta = getEventTypeMeta(type);
    createRuleMutation.mutate({
      name: `${meta.label} Detection`,
      eventType: type,
      enabled: true,
      threshold: 50,
      autoBlock: type === "MALWARE_C2" || type === "BRUTE_FORCE",
      scoreImpact: type === "MALWARE_C2" ? 40 : type === "BRUTE_FORCE" ? 30 : 15,
      description: `Auto-created ${meta.label} detection rule`,
    });
  }

  function handleManualBlock() {
    if (!blockForm.ip.trim()) { toast.error("IP address is required"); return; }
    createBlockMutation.mutate(blockForm);
  }

  function toggleAlertSelect(id: string) {
    setSelectedAlerts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExportAlerts() {
    if (filteredAlerts.length === 0) { toast.error("No alerts to export"); return; }
    const headers = ["Timestamp", "Type", "Severity", "Source IP", "Destination", "Action", "Status", "Subscriber"];
    const rows = filteredAlerts.map((a) => [
      a.timestamp, a.type, a.severity, a.sourceIp, a.destination, a.actionTaken, a.status, a.subscriber || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ips-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Alerts exported to CSV");
  }

  function addWhitelist() {
    const input = whitelistInput.trim();
    if (!input) return;
    if (whitelist.includes(input)) { toast.error("Already in whitelist"); return; }
    setWhitelist([...whitelist, input]);
    setWhitelistInput("");
    toast.success("Added to whitelist");
  }

  function removeWhitelist(item: string) {
    setWhitelist(whitelist.filter((w) => w !== item));
    toast.success("Removed from whitelist");
  }

  // ─── Loading State ───────────────────────────────────────────
  if (daemonLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
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
            <ScanEye className="h-6 w-6 text-red-500" />
            IPS / Anomaly Detection
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Intrusion Prevention System — port scan detection, DDoS mitigation, brute force blocking, threat scoring
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportAlerts}>
            <Download className="h-4 w-4 mr-2" />
            Export Alerts
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refetchAlerts(); refetchStats(); refetchRules(); refetchBlocks(); refetchThreats(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All
          </Button>
          {!daemonOnline && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => setNftablesInitOpen(true)}
            >
              <Play className="h-4 w-4 mr-2" />
              Initialize IPS
            </Button>
          )}
        </div>
      </div>

      {/* Daemon Offline Banner */}
      {!daemonOnline && <DaemonOfflineBanner />}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="dashboard" className="text-xs sm:text-sm">Dashboard</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs sm:text-sm">Alerts</TabsTrigger>
          <TabsTrigger value="rules" className="text-xs sm:text-sm">Detection Rules</TabsTrigger>
          <TabsTrigger value="blocks" className="text-xs sm:text-sm">Block Rules</TabsTrigger>
          <TabsTrigger value="config" className="text-xs sm:text-sm">Configuration</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Tab 1: Dashboard Overview                              */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="dashboard">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <StatCard title="Total Alerts (24h)" value={stats.totalAlerts || 0} subtitle="All severities" icon={Activity} gradient="stat-gradient-red" delay={0} />
            <StatCard title="Active Blocks" value={stats.activeBlocks || blocks.length} subtitle="Currently blocked IPs" icon={Ban} gradient="stat-gradient-amber" delay={75} />
            <StatCard title="Critical Threats" value={stats.criticalAlerts || 0} subtitle="Require immediate action" icon={AlertTriangle} gradient="stat-gradient-purple" delay={150} />
            <StatCard title="Top Offender" value={stats.topOffenderIp || "None"} subtitle={`Score: ${stats.topOffenderScore || 0}`} icon={ArrowUpRight} gradient="stat-gradient-emerald" delay={225} />
            <StatCard title="Detection Rules" value={stats.detectionRulesActive || rules.filter((r) => r.enabled).length} subtitle={`${rules.length} total configured`} icon={ShieldCheck} gradient="stat-gradient-cyan" delay={300} />
            <StatCard title="Daemon Uptime" value={daemonData?.uptime || "Offline"} subtitle={`v${daemonData?.version || "—"}`} icon={Server} gradient="stat-gradient-slate" delay={375} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Alerts Feed */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-red-500" />
                    Recent Alerts
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">{alerts.length} total</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[400px]">
                  {alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <ShieldCheck className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">No recent alerts</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {alerts.slice(0, 15).map((alert) => {
                        const meta = getEventTypeMeta(alert.type);
                        const Icon = meta.icon;
                        return (
                          <div
                            key={alert.id}
                            className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => setTab("alerts")}
                          >
                            <div className={`p-1.5 rounded-lg ${SEVERITY_STYLES[alert.severity]}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium truncate">{meta.label}</span>
                                <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLES[alert.severity]}`}>
                                  {alert.severity}
                                </Badge>
                                <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[alert.status]}`}>
                                  {alert.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                                <span className="font-mono">{alert.sourceIp}</span>
                                <span>→</span>
                                <span className="truncate">{alert.destination}</span>
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(alert.timestamp)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Attack Type Distribution */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Swords className="h-4 w-4 text-orange-500" />
                    Attack Type Distribution
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">Last 24h</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {attackChartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <BarChart className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">No attack data</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={attackChartData} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RTooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                        formatter={(value: number) => [`${value} alerts`, "Count"]}
                      />
                      <Bar dataKey="count" fill="#DC2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top 5 Threat Scores */}
            <Card className="border shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    Top 5 Threat Scores
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setTab("alerts")}>
                    View All <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {top5Threats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Shield className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">No threat data available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {top5Threats.map((ts, i) => (
                      <div key={ts.ip} className={`p-3 rounded-lg border ${getScoreBg(ts.score)} transition-all hover:shadow-md`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">#{i + 1} Threat</span>
                          <Badge variant="outline" className={`text-[10px] font-bold ${getScoreBg(ts.score)} ${getScoreColor(ts.score)} border-0`}>
                            {ts.score}/100
                          </Badge>
                        </div>
                        <p className="font-mono text-sm font-semibold truncate">{ts.ip}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{ts.alertCount} alerts · {ts.category}</p>
                        <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${ts.score >= 71 ? "bg-red-500" : ts.score >= 41 ? "bg-orange-500" : ts.score >= 21 ? "bg-amber-500" : "bg-green-500"}`}
                            style={{ width: `${Math.min(ts.score, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Tab 2: Alerts                                          */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="alerts">
          {/* Filters & Bulk Actions */}
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by IP, type, or subscriber..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
                </div>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Severity" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
                {selectedAlerts.size > 0 && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => bulkAckMutation.mutate(Array.from(selectedAlerts))}>
                      <CheckCircle className="h-3 w-3 mr-1" />Ack ({selectedAlerts.size})
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => bulkFalsePosMutation.mutate(Array.from(selectedAlerts))}>
                      <XCircle className="h-3 w-3 mr-1" />False Positive
                    </Button>
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={() => deleteOldAlertsMutation.mutate()}>
                  <Trash2 className="h-4 w-4 mr-1" />Delete Old
                </Button>
                <Button variant="outline" size="sm" onClick={() => refetchAlerts()}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Alerts Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-8 text-xs">
                        <input type="checkbox" checked={selectedAlerts.size === filteredAlerts.length && filteredAlerts.length > 0} onChange={(e) => {
                          if (e.target.checked) setSelectedAlerts(new Set(filteredAlerts.map((a) => a.id)));
                          else setSelectedAlerts(new Set());
                        }} className="rounded" />
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase">Timestamp</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Severity</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Source IP</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Destination</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Action</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden xl:table-cell">Subscriber</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAlerts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                          <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p>No alerts found</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAlerts.map((alert) => {
                        const meta = getEventTypeMeta(alert.type);
                        const Icon = meta.icon;
                        const isExpanded = expandedAlert === alert.id;
                        return (
                          <>
                            <TableRow key={alert.id} className="hover:bg-muted/50 transition-colors">
                              <TableCell>
                                <input type="checkbox" checked={selectedAlerts.has(alert.id)} onChange={() => toggleAlertSelect(alert.id)} className="rounded" />
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                                {timeAgo(alert.timestamp)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                                  <span className="text-xs font-medium">{meta.label}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLES[alert.severity]}`}>
                                  {alert.severity}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{alert.sourceIp}</TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden md:table-cell truncate max-w-[120px]">{alert.destination}</TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200">
                                  {alert.actionTaken}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[alert.status]}`}>
                                  {alert.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{alert.subscriber || "—"}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}>
                                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                </Button>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow key={`${alert.id}-detail`} className="bg-muted/30">
                                <TableCell colSpan={10} className="p-4">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                                    <div>
                                      <span className="text-muted-foreground font-medium">Alert ID</span>
                                      <p className="font-mono mt-0.5">{alert.id}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground font-medium">Full Timestamp</span>
                                      <p className="mt-0.5">{alert.timestamp}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground font-medium">Source IP</span>
                                      <p className="font-mono mt-0.5">{alert.sourceIp}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground font-medium">Destination</span>
                                      <p className="font-mono mt-0.5">{alert.destination}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground font-medium">Event Type</span>
                                      <p className="mt-0.5">{meta.label} ({alert.type})</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground font-medium">Action Taken</span>
                                      <p className="mt-0.5">{alert.actionTaken}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground font-medium">Subscriber</span>
                                      <p className="mt-0.5">{alert.subscriber || "Unidentified"}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground font-medium">Details</span>
                                      <p className="mt-0.5">{alert.details || "No additional details"}</p>
                                    </div>
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
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Tab 3: Detection Rules                                  */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="rules">
          {/* Quick Rules */}
          <Card className="border shadow-sm mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Quick Add Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.slice(0, 8).map((et) => {
                  const Icon = et.icon;
                  return (
                    <TooltipProvider key={et.value}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-8"
                            onClick={() => handleQuickRule(et.value)}
                            disabled={createRuleMutation.isPending}
                          >
                            <Icon className={`h-3.5 w-3.5 mr-1.5 ${et.color}`} />
                            {et.label}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Auto-create {et.label} detection rule</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Create Rule Dialog */}
          <Dialog open={ruleDialogOpen} onOpenChange={(o) => { setRuleDialogOpen(o); if (!o) resetRuleForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white mb-4" onClick={() => openRuleDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Create Detection Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-red-500" />
                  {editingRule ? "Edit Detection Rule" : "Create Detection Rule"}
                </DialogTitle>
                <DialogDescription>
                  Configure a rule to detect suspicious network activity
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Rule Name *</Label>
                    <Input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="e.g. SYN Flood Detection" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Event Type *</Label>
                    <Select value={ruleForm.eventType} onValueChange={(v) => setRuleForm({ ...ruleForm, eventType: v as EventType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPES.map((et) => {
                          const Icon = et.icon;
                          return (
                            <SelectItem key={et.value} value={et.value}>
                              <span className="flex items-center gap-2">
                                <Icon className={`h-3.5 w-3.5 ${et.color}`} />
                                {et.label}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Description</Label>
                  <Textarea value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} placeholder="Optional description" rows={2} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Threshold</Label>
                    <Input type="number" value={ruleForm.threshold} onChange={(e) => setRuleForm({ ...ruleForm, threshold: parseInt(e.target.value) || 0 })} />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Events per minute to trigger</p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Score Impact</Label>
                    <Input type="number" value={ruleForm.scoreImpact} onChange={(e) => setRuleForm({ ...ruleForm, scoreImpact: parseInt(e.target.value) || 0 })} />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Points added to threat score</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={ruleForm.enabled} onCheckedChange={(v) => setRuleForm({ ...ruleForm, enabled: v })} />
                      <Label className="text-sm">Rule Enabled</Label>
                    </div>
                    {ruleForm.enabled ? (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs"><ToggleRight className="h-3 w-3 mr-0.5" />Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground"><ToggleLeft className="h-3 w-3 mr-0.5" />Inactive</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={ruleForm.autoBlock} onCheckedChange={(v) => setRuleForm({ ...ruleForm, autoBlock: v })} />
                    <Label className="text-sm">Auto-Block on Trigger</Label>
                    {ruleForm.autoBlock && (
                      <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-xs">Auto-Block ON</Badge>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRuleDialogOpen(false); resetRuleForm(); }}>Cancel</Button>
                <Button
                  className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
                  onClick={handleSaveRule}
                  disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
                >
                  {createRuleMutation.isPending || updateRuleMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                  ) : editingRule ? "Update Rule" : "Create Rule"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Rule Confirm */}
          <AlertDialog open={!!deleteRuleTarget} onOpenChange={(o) => !o && setDeleteRuleTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Detection Rule</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &ldquo;{deleteRuleTarget?.name}&rdquo;? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteRuleTarget && deleteRuleMutation.mutate(deleteRuleTarget.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Rules Table */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-red-500" />
                  Detection Rules
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{rules.length} rules</Badge>
                  <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">
                    {rules.filter((r) => r.enabled).length} active
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-medium uppercase">Name</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Event Type</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Enabled</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Threshold</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Auto-Block</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Score</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p>No detection rules configured. Use Quick Rules or create one manually.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      rules.map((rule) => {
                        const meta = getEventTypeMeta(rule.eventType);
                        const Icon = meta.icon;
                        return (
                          <TableRow key={rule.id} className="hover:bg-muted/50 transition-colors">
                            <TableCell>
                              <span className="text-sm font-medium">{rule.name}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                                <span className="text-xs">{meta.label}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={rule.enabled}
                                onCheckedChange={(v) => updateRuleMutation.mutate({ id: rule.id, enabled: v })}
                                className="scale-75"
                              />
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs">
                              {rule.threshold}/min
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {rule.autoBlock ? (
                                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px]">Auto-Block</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">Monitor</Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs tabular-nums">
                              <span className={getScoreColor(rule.scoreImpact)}>+{rule.scoreImpact}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openRuleDialog(rule)}>
                                        <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit rule</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteRuleTarget(rule)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete rule</TooltipContent>
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

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Tab 4: Block Rules                                      */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="blocks">
          {/* Manual Block Form */}
          <Card className="border shadow-sm mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Ban className="h-4 w-4 text-red-500" />
                Manual Block
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="lg:col-span-1">
                  <Label className="text-xs font-medium mb-1 block">IP Address *</Label>
                  <Input value={blockForm.ip} onChange={(e) => setBlockForm({ ...blockForm, ip: e.target.value })} placeholder="e.g. 192.168.1.100" />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Reason</Label>
                  <Input value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} placeholder="e.g. Manual admin block" />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Action</Label>
                  <Select value={blockForm.action} onValueChange={(v) => setBlockForm({ ...blockForm, action: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Duration</Label>
                  <Select value={blockForm.duration} onValueChange={(v) => setBlockForm({ ...blockForm, duration: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    className="bg-[#DC2626] hover:bg-[#B91C1C] text-white w-full"
                    onClick={handleManualBlock}
                    disabled={createBlockMutation.isPending}
                  >
                    {createBlockMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Blocking...</> : <><Ban className="h-4 w-4 mr-2" />Block IP</>}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Delete Block Confirm */}
          <AlertDialog open={!!deleteBlockTarget} onOpenChange={(o) => !o && setDeleteBlockTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Block Rule</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to unblock {deleteBlockTarget?.ip}? The IP will regain network access.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteBlockTarget && deleteBlockMutation.mutate(deleteBlockTarget.id)}>
                  Unblock
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Block Rules Table */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Active Block Rules
                </CardTitle>
                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-xs">
                  {blocks.length} blocked
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-medium uppercase">IP Address</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Reason</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Action</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Duration</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Expires</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden xl:table-cell">Created By</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blocks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          <ShieldOff className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p>No active block rules</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      blocks.map((block) => (
                        <TableRow key={block.id} className="hover:bg-muted/50 transition-colors">
                          <TableCell className="font-mono text-sm font-medium">{block.ip}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{block.reason}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-200">{block.action}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{block.duration}</TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                            {block.expiresAt ? new Date(block.expiresAt).toLocaleString() : "Never"}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">{block.createdBy}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => deleteBlockMutation.mutate(block.id)}
                            >
                              <Unlink className="h-3 w-3 mr-1" />Unblock
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Tab 5: Configuration                                    */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daemon Status */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Server className="h-4 w-4 text-slate-500" />
                  Daemon Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Status</span>
                    {daemonOnline ? (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">
                        <CircleDot className="h-2.5 w-2.5 mr-1 animate-pulse" />Running
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-xs">
                        <XCircle className="h-2.5 w-2.5 mr-1" />Offline
                      </Badge>
                    )}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Version</span>
                    <span className="text-xs font-mono">{daemonData?.version || "—"}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Uptime</span>
                    <span className="text-xs">{daemonData?.uptime || "—"}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Active Blocks</span>
                    <span className="text-xs font-mono">{daemonData?.activeBlocks ?? blocks.length}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Last Scan</span>
                    <span className="text-xs">{daemonData?.lastScanTime ? timeAgo(daemonData.lastScanTime) : "Never"}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">nftables</span>
                    {daemonData?.nftablesInitialized ? (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">Initialized</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Not Initialized</Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => setNftablesInitOpen(true)}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Initialize nftables IPS Table
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Global Settings */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Settings className="h-4 w-4 text-slate-500" />
                  Global Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Auto-Block Enabled</Label>
                    <p className="text-[10px] text-muted-foreground">Automatically block IPs that exceed threshold</p>
                  </div>
                  <Switch checked={autoBlockEnabled} onCheckedChange={setAutoBlockEnabled} />
                </div>
                <Separator />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Default Block Duration</Label>
                    <Select value={defaultBlockDuration} onValueChange={setDefaultBlockDuration}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Alert Retention (days)</Label>
                    <Input type="number" value={alertRetention} onChange={(e) => setAlertRetention(parseInt(e.target.value) || 30)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Threat Score Decay Factor</Label>
                  <Input type="number" step="0.01" min="0" max="1" value={scoreDecay} onChange={(e) => setScoreDecay(parseFloat(e.target.value) || 0.95)} />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Score multiplier per interval (0.90–1.00). Lower = faster decay.</p>
                </div>
              </CardContent>
            </Card>

            {/* Threat Score Thresholds */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-amber-500" />
                  Threat Score Thresholds
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: "Monitor", range: "0–20", color: "bg-green-100 text-green-700 border-green-200", desc: "Log and track only" },
                    { label: "Rate Limit", range: "21–40", color: "bg-amber-100 text-amber-700 border-amber-200", desc: "Apply rate limiting" },
                    { label: "Temp Block", range: "41–70", color: "bg-orange-100 text-orange-700 border-orange-200", desc: "Temporary IP block" },
                    { label: "Permanent Block", range: "71–100", color: "bg-red-100 text-red-700 border-red-200", desc: "Permanent IP block" },
                  ].map((t) => (
                    <div key={t.label} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                      <div className={`px-2 py-1 rounded text-[10px] font-bold ${t.color}`}>
                        {t.range}
                      </div>
                      <div className="flex-1">
                        <span className="text-xs font-medium">{t.label}</span>
                        <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Whitelist Management */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-green-500" />
                  Whitelist
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={whitelistInput}
                    onChange={(e) => setWhitelistInput(e.target.value)}
                    placeholder="IP or CIDR (e.g. 10.0.0.0/8)"
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && addWhitelist()}
                  />
                  <Button variant="outline" size="sm" onClick={addWhitelist}>
                    <Plus className="h-4 w-4 mr-1" />Add
                  </Button>
                </div>
                {whitelist.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No whitelisted IPs</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {whitelist.map((item) => (
                      <Badge key={item} variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs py-1 px-2">
                        <span className="font-mono">{item}</span>
                        <button className="ml-1.5 hover:text-red-600" onClick={() => removeWhitelist(item)}>
                          <XCircle className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Initialize nftables Dialog */}
          <AlertDialog open={nftablesInitOpen} onOpenChange={setNftablesInitOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Initialize nftables IPS Table</AlertDialogTitle>
                <AlertDialogDescription>
                  This will create the IPS nftables table with the required chains (input, forward, output) for packet inspection and blocking. Make sure no other nftables rules conflict.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => initNftablesMutation.mutate()}
                  disabled={initNftablesMutation.isPending}
                >
                  {initNftablesMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Initializing...</>
                  ) : "Initialize"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
