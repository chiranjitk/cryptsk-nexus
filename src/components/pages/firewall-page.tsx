"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Shield, ShieldCheck, ShieldAlert, Lock, Unlock, Plus, Trash2, Eye,
  RefreshCw, AlertTriangle, CheckCircle, XCircle, Network, Wifi,
  Download, Zap, Clock, ChevronRight, Edit, Copy, Play, Loader2,
  Terminal, FileText, ArrowUpDown, Filter, Globe,
} from "lucide-react";
import { useModuleStore } from "@/store/module-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

// ─── Types ───────────────────────────────────────────────────────
interface FirewallRule {
  id: string;
  name: string;
  description?: string;
  table: string;
  chain: string;
  action: string;
  protocol: string;
  sourceIp?: string;
  sourcePort?: string;
  destIp?: string;
  destPort?: string;
  interfaceName?: string;
  natTarget?: string;
  ipFamily?: string;
  logEnabled?: boolean;
  logPrefix?: string;
  scheduleEnabled?: boolean;
  scheduleStart?: string;
  scheduleEnd?: string;
  scheduleDays?: string[];
  priority: number;
  enabled: boolean;
  hits?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface FirewallStats {
  totalRules: number;
  activeRules: number;
  scheduledRules: number;
  totalHits: number;
}

interface FirewallRulesResponse {
  rules: FirewallRule[];
  stats: FirewallStats;
}

interface NftablesStatus {
  ruleset: string;
  tables: { name: string; chains: { name: string; rules: number }[] }[];
}

interface QuickRule {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  rule: Partial<FirewallRule>;
  isActive: boolean;
}

// ─── Constants ────────────────────────────────────────────────────
const TABLES = ["filter", "nat", "mangle", "raw"];
const CHAINS = ["input", "forward", "output", "prerouting", "postrouting"];
const ACTIONS = ["ACCEPT", "DROP", "REJECT", "LOG", "DNAT", "SNAT", "MASQUERADE"];
const PROTOCOLS = ["ANY", "TCP", "UDP", "ICMP", "ICMPv6", "IGMP"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CHAIN_COLORS: Record<string, string> = {
  input: "bg-blue-100 text-blue-700 border-blue-200",
  forward: "bg-green-100 text-green-700 border-green-200",
  output: "bg-amber-100 text-amber-700 border-amber-200",
  prerouting: "bg-purple-100 text-purple-700 border-purple-200",
  postrouting: "bg-slate-100 text-slate-700 border-slate-200",
};

const ACTION_COLORS: Record<string, string> = {
  ACCEPT: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
  DROP: "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800",
  REJECT: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
  LOG: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
  DNAT: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
  SNAT: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
  MASQUERADE: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800",
};

const PROTOCOL_COLORS: Record<string, string> = {
  TCP: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800",
  UDP: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
  ICMP: "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800",
  ICMPv6: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800",
  IGMP: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800",
  ANY: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700",
};

const PROTOCOL_DOT_COLORS: Record<string, string> = {
  TCP: "bg-teal-500",
  UDP: "bg-amber-500",
  ICMP: "bg-red-500",
  ICMPv6: "bg-orange-500",
  IGMP: "bg-violet-500",
  ANY: "bg-slate-400",
};

function getPriorityColor(priority: number): string {
  if (priority <= 100) return "text-red-600 dark:text-red-400 font-semibold";
  if (priority <= 500) return "text-amber-600 dark:text-amber-400 font-medium";
  return "text-slate-500 dark:text-slate-400";
}

function getRuleStatus(rule: FirewallRule): "ACTIVE" | "DISABLED" | "SCHEDULED" {
  if (!rule.enabled) return "DISABLED";
  if (rule.scheduleEnabled) return "SCHEDULED";
  return "ACTIVE";
}

const STATUS_BADGE_STYLES: Record<string, { dot: string; badge: string }> = {
  ACTIVE: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
  },
  DISABLED: {
    dot: "bg-slate-400",
    badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700",
  },
  SCHEDULED: {
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
  },
};

const DEFAULT_FORM: Omit<FirewallRule, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  description: "",
  table: "filter",
  chain: "input",
  action: "ACCEPT",
  protocol: "ANY",
  sourceIp: "",
  sourcePort: "",
  destIp: "",
  destPort: "",
  interfaceName: "",
  natTarget: "",
  ipFamily: "inet",
  logEnabled: false,
  logPrefix: "",
  scheduleEnabled: false,
  scheduleStart: "",
  scheduleEnd: "",
  scheduleDays: [],
  priority: 100,
  enabled: true,
  hits: 0,
};

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

// ─── Main Component ───────────────────────────────────────────────
export default function FirewallPage() {
  const { isModuleEnabled } = useModuleStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("rules");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog state
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FirewallRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FirewallRule | null>(null);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [quickRuleConfirm, setQuickRuleConfirm] = useState<QuickRule | null>(null);
  const [ruleForm, setRuleForm] = useState(DEFAULT_FORM);

  // ─── Queries ─────────────────────────────────────────────────
  const {
    data: rulesData, isLoading: rulesLoading, refetch: refetchRules,
  } = useQuery<FirewallRulesResponse>({
    queryKey: ["firewall-rules"],
    queryFn: () => apiFetch<FirewallRulesResponse>("/api/firewall?section=rules"),
    refetchInterval: 30000,
  });

  const {
    data: nftablesData, isLoading: nftablesLoading, refetch: refetchNftables,
  } = useQuery<NftablesStatus>({
    queryKey: ["firewall-nftables"],
    queryFn: () => apiFetch<NftablesStatus>("/api/firewall?section=nftables-status"),
    refetchInterval: 30000,
    enabled: tab === "nftables",
  });

  const rules = rulesData?.rules || [];
  const stats = rulesData?.stats || {
    totalRules: 0, activeRules: 0, scheduledRules: 0, totalHits: 0,
  };

  const nftables = nftablesData || { ruleset: "", tables: [] };

  const filteredRules = rules.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.table.toLowerCase().includes(q) ||
      r.chain.toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q) ||
      r.protocol.toLowerCase().includes(q) ||
      (r.sourceIp || "").toLowerCase().includes(q) ||
      (r.destIp || "").toLowerCase().includes(q)
    );
  });

  // ─── Quick Rules ─────────────────────────────────────────────
  const quickRules: QuickRule[] = [
    {
      id: "established",
      name: "Allow Established/Related",
      description: "Allow traffic for established and related connections (stateful firewall)",
      icon: CheckCircle,
      rule: { name: "Allow Established Connections", table: "filter", chain: "input", action: "ACCEPT", protocol: "ANY", priority: 10, enabled: true },
      isActive: rules.some((r) => r.name.toLowerCase().includes("established")),
    },
    {
      id: "drop-invalid",
      name: "Drop Invalid Packets",
      description: "Drop packets with invalid connection state",
      icon: XCircle,
      rule: { name: "Drop Invalid Packets", table: "filter", chain: "input", action: "DROP", protocol: "ANY", priority: 20, enabled: true },
      isActive: rules.some((r) => r.name.toLowerCase().includes("invalid")),
    },
    {
      id: "allow-icmp",
      name: "Allow ICMP (Ping)",
      description: "Allow ICMP echo requests and replies",
      icon: Network,
      rule: { name: "Allow ICMP", table: "filter", chain: "input", action: "ACCEPT", protocol: "ICMP", priority: 30, enabled: true },
      isActive: rules.some((r) => r.protocol === "ICMP" && r.action === "ACCEPT"),
    },
    {
      id: "allow-dns",
      name: "Allow DNS (Port 53)",
      description: "Allow DNS queries on TCP/UDP port 53",
      icon: FileText,
      rule: { name: "Allow DNS", table: "filter", chain: "input", action: "ACCEPT", protocol: "TCP", destPort: "53", priority: 40, enabled: true },
      isActive: rules.some((r) => r.destPort === "53"),
    },
    {
      id: "allow-dhcp",
      name: "Allow DHCP (Port 67/68)",
      description: "Allow DHCP server and client traffic",
      icon: Wifi,
      rule: { name: "Allow DHCP Server", table: "filter", chain: "input", action: "ACCEPT", protocol: "UDP", destPort: "67", priority: 50, enabled: true },
      isActive: rules.some((r) => r.destPort === "67" || r.destPort === "68"),
    },
    {
      id: "allow-ssh",
      name: "Allow SSH (Port 22)",
      description: "Allow SSH remote management access",
      icon: Lock,
      rule: { name: "Allow SSH", table: "filter", chain: "input", action: "ACCEPT", protocol: "TCP", destPort: "22", priority: 60, enabled: true },
      isActive: rules.some((r) => r.destPort === "22"),
    },
    {
      id: "allow-http",
      name: "Allow HTTP/HTTPS (Port 80/443)",
      description: "Allow web server traffic on ports 80 and 443",
      icon: Eye,
      rule: { name: "Allow HTTP/HTTPS", table: "filter", chain: "input", action: "ACCEPT", protocol: "TCP", destPort: "443", priority: 70, enabled: true },
      isActive: rules.some((r) => r.destPort === "80" || r.destPort === "443"),
    },
    {
      id: "block-ip",
      name: "Block Specific IP",
      description: "Drop all traffic from a specified IP address",
      icon: ShieldAlert,
      rule: { name: "Block IP", table: "filter", chain: "input", action: "DROP", protocol: "ANY", priority: 15, enabled: true },
      isActive: false,
    },
    {
      id: "rate-limit",
      name: "Rate Limit Connections",
      description: "Limit new connection attempts per source IP to prevent floods",
      icon: AlertTriangle,
      rule: { name: "Rate Limit New Connections", table: "filter", chain: "input", action: "DROP", protocol: "ANY", priority: 25, enabled: true, logEnabled: true, logPrefix: "RATE_LIMIT" },
      isActive: rules.some((r) => r.name.toLowerCase().includes("rate limit")),
    },
    {
      id: "masquerade",
      name: "Enable NAT (Masquerade)",
      description: "Enable masquerade NAT for WAN→LAN traffic forwarding",
      icon: Zap,
      rule: { name: "NAT Masquerade", table: "nat", chain: "postrouting", action: "MASQUERADE", protocol: "ANY", priority: 100, enabled: true },
      isActive: rules.some((r) => r.action === "MASQUERADE"),
    },
    {
      id: "ip-forward",
      name: "Enable IP Forwarding",
      description: "Enable kernel IP forwarding for routing between interfaces",
      icon: ChevronRight,
      rule: { name: "Enable IP Forwarding", table: "filter", chain: "forward", action: "ACCEPT", protocol: "ANY", priority: 5, enabled: true },
      isActive: rules.some((r) => r.name.toLowerCase().includes("ip forward")),
    },
  ];

  // ─── Mutations ───────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/firewall", {
        method: "POST",
        body: JSON.stringify({ action: "create", ...body }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("Firewall rule created successfully");
        setRuleDialogOpen(false);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ["firewall-rules"] });
      } else {
        toast.error(d.error || "Failed to create rule");
      }
    },
    onError: () => toast.error("Failed to create firewall rule"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; [key: string]: unknown }) =>
      apiFetch("/api/firewall", {
        method: "PUT",
        body: JSON.stringify({ id, ...payload }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("Firewall rule updated");
        setRuleDialogOpen(false);
        setEditingRule(null);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ["firewall-rules"] });
      } else {
        toast.error(d.error || "Failed to update rule");
      }
    },
    onError: () => toast.error("Failed to update firewall rule"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/firewall?id=${id}`, { method: "DELETE" }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("Firewall rule deleted");
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: ["firewall-rules"] });
      } else {
        toast.error(d.error || "Failed to delete");
      }
    },
    onError: () => toast.error("Failed to delete firewall rule"),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/firewall", {
        method: "POST",
        body: JSON.stringify({ action: "apply" }),
      }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("Firewall rules applied successfully");
        setApplyConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ["firewall-nftables"] });
      } else {
        toast.error(d.error || "Failed to apply rules");
      }
    },
    onError: () => toast.error("Failed to apply firewall rules"),
  });

  const quickRuleMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/firewall", {
        method: "POST",
        body: JSON.stringify({ action: "create", ...body }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success(`Quick rule "${quickRuleConfirm?.name}" added`);
        setQuickRuleConfirm(null);
        queryClient.invalidateQueries({ queryKey: ["firewall-rules"] });
      } else {
        toast.error(d.error || "Failed to add rule");
      }
    },
    onError: () => toast.error("Failed to add quick rule"),
  });

  // ─── Helpers ─────────────────────────────────────────────────
  function resetForm() {
    setRuleForm(DEFAULT_FORM);
    setEditingRule(null);
  }

  function openDialog(rule?: FirewallRule) {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({
        name: rule.name,
        description: rule.description || "",
        table: rule.table,
        chain: rule.chain,
        action: rule.action,
        protocol: rule.protocol,
        sourceIp: rule.sourceIp || "",
        sourcePort: rule.sourcePort || "",
        destIp: rule.destIp || "",
        destPort: rule.destPort || "",
        interfaceName: rule.interfaceName || "",
        natTarget: rule.natTarget || "",
        ipFamily: rule.ipFamily || "inet",
        logEnabled: rule.logEnabled || false,
        logPrefix: rule.logPrefix || "",
        scheduleEnabled: rule.scheduleEnabled || false,
        scheduleStart: rule.scheduleStart || "",
        scheduleEnd: rule.scheduleEnd || "",
        scheduleDays: rule.scheduleDays || [],
        priority: rule.priority,
        enabled: rule.enabled,
        hits: rule.hits || 0,
      });
    } else {
      resetForm();
    }
    setRuleDialogOpen(true);
  }

  function handleSave() {
    if (!ruleForm.name.trim()) {
      toast.error("Rule name is required");
      return;
    }
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, ...ruleForm });
    } else {
      createMutation.mutate(ruleForm);
    }
  }

  function toggleDay(day: string) {
    setRuleForm((prev) => ({
      ...prev,
      scheduleDays: (prev.scheduleDays || []).includes(day)
        ? (prev.scheduleDays || []).filter((d) => d !== day)
        : [...(prev.scheduleDays || []), day],
    }));
  }

  function handleExportRuleset() {
    if (!nftables.ruleset) {
      toast.error("No ruleset available to export");
      return;
    }
    const blob = new Blob([nftables.ruleset], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nftables-ruleset-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Ruleset exported successfully");
  }

  function handleAddQuickRule(qr: QuickRule) {
    setQuickRuleConfirm(qr);
  }

  function addQuickRule(label: string) {
    const ipv6Preset: Partial<FirewallRule> = {
      name: label,
      table: "filter",
      chain: "input",
      action: "ACCEPT",
      protocol: "ICMPv6",
      priority: 200,
      enabled: true,
      ipFamily: "ip6",
    };
    if (label.includes("Block")) {
      ipv6Preset.action = "DROP";
    }
    if (label.includes("DHCPv6")) {
      ipv6Preset.protocol = "UDP";
      ipv6Preset.destPort = "546";
    }
    if (label.includes("Rogue RA")) {
      ipv6Preset.chain = "input";
      ipv6Preset.protocol = "ICMPv6";
    }
    createMutation.mutate(ipv6Preset as Record<string, unknown>);
    toast.success(`IPv6 quick rule "${label}" added`);
  }

  // ─── Loading State ───────────────────────────────────────────
  if (rulesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="skeleton-wave h-10 w-full" />
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
          <h1 className="text-2xl font-bold text-foreground">Firewall Rules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage nftables firewall rules, view live status, and apply quick presets
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => refetchRules()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="border-green-200 text-green-700 hover:bg-green-50"
            onClick={() => setApplyConfirmOpen(true)}
          >
            <Play className="h-4 w-4 mr-2" />
            Apply Rules
          </Button>
          <Dialog open={ruleDialogOpen} onOpenChange={(o) => { setRuleDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-destructive hover:bg-destructive/90 text-white" onClick={() => openDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Create Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingRule ? "Edit Firewall Rule" : "Create Firewall Rule"}</DialogTitle>
                <DialogDescription>
                  {editingRule ? "Update an existing firewall rule" : "Define a new firewall rule for your network"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* Name & Description */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Name *</Label>
                    <Input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="e.g. Allow SSH Access" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Description</Label>
                    <Input value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} placeholder="Optional description" />
                  </div>
                </div>

                {/* Table & Chain */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Table</Label>
                    <Select value={ruleForm.table} onValueChange={(v) => setRuleForm({ ...ruleForm, table: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TABLES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Chain</Label>
                    <Select value={ruleForm.chain} onValueChange={(v) => setRuleForm({ ...ruleForm, chain: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CHAINS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Action & Protocol */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Action</Label>
                    <Select value={ruleForm.action} onValueChange={(v) => setRuleForm({ ...ruleForm, action: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTIONS.map((a) => (
                          <SelectItem key={a} value={a}>
                            <span className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${a === "ACCEPT" ? "bg-green-500" : a === "DROP" || a === "REJECT" ? "bg-red-500" : a === "LOG" ? "bg-amber-500" : "bg-purple-500"}`} />
                              {a}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Protocol</Label>
                    <Select value={ruleForm.protocol} onValueChange={(v) => setRuleForm({ ...ruleForm, protocol: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROTOCOLS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* IP Family (IPv6 module) */}
                {isModuleEnabled("ipv6") && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium mb-1 block">IP Family</Label>
                    <Select value={ruleForm.ipFamily || "inet"} onValueChange={(v) => setRuleForm({ ...ruleForm, ipFamily: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inet">Dual Stack (inet)</SelectItem>
                        <SelectItem value="ip">IPv4 Only (ip)</SelectItem>
                        <SelectItem value="ip6">IPv6 Only (ip6)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">inet = applies to both IPv4 and IPv6. ip6 = IPv6-specific rules.</p>
                  </div>
                )}

                {/* Source */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Source IP</Label>
                    <Input value={ruleForm.sourceIp} onChange={(e) => setRuleForm({ ...ruleForm, sourceIp: e.target.value })} placeholder={isModuleEnabled("ipv6") ? "192.168.1.0/24 or 2001:db8::/32" : "e.g. 192.168.1.0/24"} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Source Port</Label>
                    <Input value={ruleForm.sourcePort} onChange={(e) => setRuleForm({ ...ruleForm, sourcePort: e.target.value })} placeholder="e.g. 1024-65535" />
                  </div>
                </div>

                {/* Destination */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Destination IP</Label>
                    <Input value={ruleForm.destIp} onChange={(e) => setRuleForm({ ...ruleForm, destIp: e.target.value })} placeholder={isModuleEnabled("ipv6") ? "192.168.1.0/24 or 2001:db8::/32" : "e.g. 10.0.0.1"} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Destination Port</Label>
                    <Input value={ruleForm.destPort} onChange={(e) => setRuleForm({ ...ruleForm, destPort: e.target.value })} placeholder="e.g. 80,443" />
                  </div>
                </div>

                {/* Interface & NAT Target */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Interface (optional)</Label>
                    <Input value={ruleForm.interfaceName} onChange={(e) => setRuleForm({ ...ruleForm, interfaceName: e.target.value })} placeholder="e.g. eth0" />
                  </div>
                  {(ruleForm.action === "DNAT" || ruleForm.action === "SNAT") && (
                    <div>
                      <Label className="text-sm font-medium mb-1 block">NAT Target (IP:port)</Label>
                      <Input value={ruleForm.natTarget} onChange={(e) => setRuleForm({ ...ruleForm, natTarget: e.target.value })} placeholder="e.g. 10.0.0.5:8080" />
                    </div>
                  )}
                </div>

                {/* Priority */}
                <div>
                  <Label className="text-sm font-medium mb-1 block">Priority <span className="text-muted-foreground font-normal">(lower = evaluated first)</span></Label>
                  <Input type="number" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 100 })} min={0} />
                </div>

                {/* Logging */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch checked={ruleForm.logEnabled} onCheckedChange={(v) => setRuleForm({ ...ruleForm, logEnabled: v })} />
                    <Label className="text-sm font-medium">Enable Logging</Label>
                  </div>
                  {ruleForm.logEnabled && (
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Log Prefix</Label>
                      <Input value={ruleForm.logPrefix} onChange={(e) => setRuleForm({ ...ruleForm, logPrefix: e.target.value })} placeholder="e.g. FW_DROP" />
                    </div>
                  )}
                </div>

                {/* Schedule */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch checked={ruleForm.scheduleEnabled} onCheckedChange={(v) => setRuleForm({ ...ruleForm, scheduleEnabled: v })} />
                    <Label className="text-sm font-medium">Enable Schedule</Label>
                  </div>
                  {ruleForm.scheduleEnabled && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Start Time</Label>
                        <Input type="time" value={ruleForm.scheduleStart} onChange={(e) => setRuleForm({ ...ruleForm, scheduleStart: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-1 block">End Time</Label>
                        <Input type="time" value={ruleForm.scheduleEnd} onChange={(e) => setRuleForm({ ...ruleForm, scheduleEnd: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-sm font-medium mb-2 block">Active Days</Label>
                        <div className="flex flex-wrap gap-2">
                          {WEEKDAYS.map((day) => (
                            <Badge
                              key={day}
                              variant="outline"
                              className={`cursor-pointer transition-colors ${
                                ruleForm.scheduleDays?.includes(day)
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "hover:bg-muted"
                              }`}
                              onClick={() => toggleDay(day)}
                            >
                              {day}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Enable toggle */}
                <div className="flex items-center gap-3">
                  <Switch checked={ruleForm.enabled} onCheckedChange={(v) => setRuleForm({ ...ruleForm, enabled: v })} />
                  <Label className="text-sm font-medium">Enabled</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRuleDialogOpen(false); resetForm(); }}>Cancel</Button>
                <Button
                  className="bg-destructive hover:bg-destructive/90 text-white"
                  onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                  ) : editingRule ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Rules" value={stats.totalRules} subtitle="All configured rules" icon={Shield} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Active Rules" value={stats.activeRules} subtitle="Currently enabled" icon={ShieldCheck} gradient="stat-gradient-green" delay={75} />
        <StatCard title="Scheduled Rules" value={stats.scheduledRules} subtitle="Time-based rules" icon={Clock} gradient="stat-gradient-amber" delay={150} />
        <StatCard title="Total Hits" value={stats.totalHits.toLocaleString()} subtitle="Rule match count" icon={Zap} gradient="stat-gradient-blue" delay={225} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="rules">Firewall Rules</TabsTrigger>
          <TabsTrigger value="nftables">nftables Status</TabsTrigger>
          <TabsTrigger value="quick">Quick Rules</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Firewall Rules ──────────────────────────────── */}
        <TabsContent value="rules">
          {/* Search */}
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4">
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search rules by name, table, chain, action, protocol, IP..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
              </div>
            </CardContent>
          </Card>

          {/* Rules Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Priority</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Name</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Table</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Chain</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Action</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Protocol</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Source</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Destination</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Interface</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Log</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Schedule</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Hits</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                          <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No firewall rules found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRules.map((rule) => (
                        <TableRow key={rule.id} className="odd:bg-muted/10 hover:bg-muted/30 transition-colors duration-150">
                          <TableCell className={`text-sm font-mono tabular-nums ${getPriorityColor(rule.priority)}`}>{rule.priority}</TableCell>
                          <TableCell>
                            <div>
                              <span className="text-sm font-medium">{rule.name}</span>
                              {isModuleEnabled("ipv6") && rule.ipFamily && rule.ipFamily !== "inet" && (
                                <Badge variant="outline" className="text-[10px] ml-1.5">{rule.ipFamily === "ip6" ? "IPv6" : "IPv4"}</Badge>
                              )}
                              {rule.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-[180px]">{rule.description}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs font-mono">{rule.table}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs font-medium ${CHAIN_COLORS[rule.chain] || ""}`}>
                              {rule.chain}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_COLORS[rule.action] || ""}`}>
                              {rule.action}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${PROTOCOL_COLORS[rule.protocol] || PROTOCOL_COLORS.ANY}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${PROTOCOL_DOT_COLORS[rule.protocol] || PROTOCOL_DOT_COLORS.ANY}`} />
                              {rule.protocol}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs font-mono max-w-[140px] truncate">
                            {rule.sourceIp ? `${rule.sourceIp}${rule.sourcePort ? `:${rule.sourcePort}` : ""}` : "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono max-w-[140px] truncate">
                            {rule.destIp ? `${rule.destIp}${rule.destPort ? `:${rule.destPort}` : ""}` : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{rule.interfaceName || "—"}</TableCell>
                          <TableCell>
                            {rule.logEnabled ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger><Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-xs">LOG</Badge></TooltipTrigger>
                                  <TooltipContent>{rule.logPrefix || "Default prefix"}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {rule.scheduleEnabled ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger><Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-xs"><Clock className="h-3 w-3 mr-0.5" />Scheduled</Badge></TooltipTrigger>
                                  <TooltipContent>
                                    {rule.scheduleStart || "—"} to {rule.scheduleEnd || "—"} ({rule.scheduleDays?.join(", ") || "Any"})
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">{(rule.hits || 0).toLocaleString()}</TableCell>
                          <TableCell>
                            {(() => {
                              const status = getRuleStatus(rule);
                              const style = STATUS_BADGE_STYLES[status];
                              return (
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.badge}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                                  {status}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDialog(rule)}>
                                      <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit rule</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(rule)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete rule</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
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

        {/* ─── Tab 2: nftables Status ────────────────────────────── */}
        <TabsContent value="nftables">
          <div className="flex gap-2 mb-4">
            <Button variant="outline" onClick={() => refetchNftables()}>
              <RefreshCw className={`h-4 w-4 mr-2 ${nftablesLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExportRuleset}>
              <Download className="h-4 w-4 mr-2" />
              Export Ruleset
            </Button>
          </div>

          {/* Table/Chain breakdown */}
          {nftables.tables.length > 0 && (
            <Card className="border shadow-sm mb-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Table & Chain Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {nftables.tables.map((t) => (
                    <div key={t.name} className="border rounded-lg p-3">
                      <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                        Table: <span className="font-mono">{t.name}</span>
                      </h4>
                      <div className="space-y-1">
                        {t.chains.map((c) => (
                          <div key={c.name} className="flex items-center justify-between text-xs">
                            <Badge variant="outline" className={`text-[10px] ${CHAIN_COLORS[c.name] || ""}`}>
                              {c.name}
                            </Badge>
                            <span className="text-muted-foreground">{c.rules} rules</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Raw ruleset */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Current Ruleset
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {nftablesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              ) : nftables.ruleset ? (
                <ScrollArea className="max-h-[500px]">
                  <pre className="text-xs font-mono bg-slate-950 text-slate-200 rounded-lg p-4 whitespace-pre-wrap leading-relaxed">
                    {nftables.ruleset}
                  </pre>
                </ScrollArea>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Terminal className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No ruleset data available. Click &ldquo;Refresh&rdquo; to load.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 3: Quick Rules ─────────────────────────────────── */}
        <TabsContent value="quick">
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                One-click common firewall rules. Click any card to add it instantly.
                Rules that are already active are marked with a green indicator.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickRules.map((qr) => {
              const Icon = qr.icon;
              return (
                <Card
                  key={qr.id}
                  className={`border shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer ${
                    qr.isActive ? "ring-2 ring-emerald-400 bg-emerald-50/50" : "hover:border-primary/30"
                  }`}
                  onClick={() => handleAddQuickRule(qr)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${qr.isActive ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-500"}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold">{qr.name}</h4>
                          {qr.isActive && (
                            <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">
                              <CheckCircle className="h-2.5 w-2.5 mr-0.5" />Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{qr.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* IPv6 Quick Rules (gated by ipv6 module) */}
          {isModuleEnabled("ipv6") && (
            <div className="space-y-2 mt-6">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4" />
                IPv6 Quick Rules
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { label: "Allow ICMPv6 (ND & RA)", desc: "Essential for IPv6 neighbor discovery" },
                  { label: "Allow ICMPv6 Ping", desc: "Allow IPv6 echo requests" },
                  { label: "Allow DHCPv6 Client", desc: "Allow DHCPv6 requests to server" },
                  { label: "Block Rogue RA from WAN", desc: "Block unauthorized router advertisements" },
                  { label: "Allow IPv6 Multicast", desc: "Allow ff02:: link-local multicast" },
                  { label: "Block IPv6 Bogons", desc: "Block reserved/invalid IPv6 ranges" },
                ].map((rule) => (
                  <button key={rule.label} type="button" onClick={() => addQuickRule(rule.label)} className="flex items-start gap-2 p-2 border rounded-md hover:bg-muted/50 text-left">
                    <Shield className="h-4 w-4 text-cyan-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{rule.label}</p>
                      <p className="text-[10px] text-muted-foreground">{rule.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Firewall Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apply Confirmation */}
      <AlertDialog open={applyConfirmOpen} onOpenChange={setApplyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Firewall Rules</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate the full nftables ruleset from all active rules and apply it to the system.
              This may briefly interrupt network traffic. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying...</> : "Apply Rules"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Rule Confirmation */}
      <AlertDialog open={!!quickRuleConfirm} onOpenChange={() => setQuickRuleConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add Quick Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Add &ldquo;{quickRuleConfirm?.name}&rdquo;? {quickRuleConfirm?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => quickRuleConfirm && quickRuleMutation.mutate(quickRuleConfirm.rule)}
              disabled={quickRuleMutation.isPending}
            >
              {quickRuleMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</> : "Add Rule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
