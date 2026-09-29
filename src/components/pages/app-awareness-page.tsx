"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Activity, Layers, ArrowUpRight, Users, Ban, Server, Search, Plus,
  Trash2, Edit, RefreshCw, Globe, Shield, Zap, ChevronRight, Eye,
  Copy, Wifi, Gamepad2, MessageSquare, Download, Upload, Clock,
  Terminal, Settings, Play, CircleDot, AlertTriangle, CheckCircle,
  XCircle, Loader2, Filter, TrendingUp, BarChart3, PieChart,
  ArrowDownRight, MonitorSmartphone, Smartphone, AppWindow,
  Network, Hash, Radio, ToggleLeft, ToggleRight, Info, FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, AreaChart, Area, CartesianGrid,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────

interface DaemonStatus {
  running?: boolean;
  daemon?: { status: string; version: string | null; uptime: number; protocols: number };
  stats?: { totalBytes: number; totalPackets: number; activeApps: number; throughputBps: number };
  daemonOnline?: boolean;
  version?: string;
  uptime?: string | number;
  protocolsCount?: number;
  capturedPackets?: number;
  nftablesIntegrated?: boolean;
  protocolsSupported?: number;
  categoriesSupported?: number;
  ndpiVersion?: string;
}

interface TrafficStats {
  totalBytes: number;
  downloadBytes: number;
  uploadBytes: number;
  totalTrafficToday: string;
  activeApps: number;
  topApp: string;
  topAppBytes: number;
  activeSubscribers: number;
  blockedApps: number;
  hourlyTraffic: Array<{ hour: string; download: number; upload: number }>;
  topApps: Array<{ name: string; download: number; upload: number; category: string }>;
  categoryBreakdown: Record<string, number>;
  recentEvents: Array<{
    id: string;
    timestamp: string;
    ip: string;
    app: string;
    bytes: number;
    action: string;
  }>;
}

interface NdpiApp {
  id: number;
  name: string;
  category: string;
  risk: string;
  totalBytes: number;
  downloadBytes: number;
  uploadBytes: number;
  subscriberCount: number;
  description?: string;
}

interface Subscriber {
  id: string;
  ip: string;
  name: string;
  plan: string;
  totalBytes: number;
  topApps: Array<{ name: string; bytes: number; category: string }>;
  lastSeen: string;
}

interface QoSRule {
  id: string;
  name: string;
  description?: string;
  applications: string[];
  action: string;
  scope: string;
  target?: string;
  rateLimitMbps?: number;
  priority: number;
  hitCount: number;
  enabled: boolean;
  createdAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────

// Dynamic categories populated from daemon — fallback hardcoded
const DEFAULT_CATEGORIES = [
  "All", "Media", "Social Media", "Messaging", "P2P", "Gaming",
  "Productivity", "Development", "VPN", "Cloud Services", "Malware",
  "Streaming Audio", "VoIP", "Remote Access", "Ad Networks",
  "Education", "IoT", "Finance", "Shopping", "Maps",
  "Adult", "Information", "Security", "Remote Desktop", "System", "Other",
];

const CATEGORY_COLORS: Record<string, string> = {
  Media: "bg-red-100 text-red-700 border-red-200",
  "Social Media": "bg-pink-100 text-pink-700 border-pink-200",
  Social: "bg-pink-100 text-pink-700 border-pink-200",
  Messaging: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Communication: "bg-emerald-100 text-emerald-700 border-emerald-200",
  P2P: "bg-orange-100 text-orange-700 border-orange-200",
  Gaming: "bg-purple-100 text-purple-700 border-purple-200",
  Productivity: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Development: "bg-violet-100 text-violet-700 border-violet-200",
  VPN: "bg-slate-200 text-slate-700 border-slate-300",
  "Cloud Services": "bg-sky-100 text-sky-700 border-sky-200",
  Cloud: "bg-sky-100 text-sky-700 border-sky-200",
  Malware: "bg-red-200 text-red-800 border-red-300",
  "Streaming Audio": "bg-rose-100 text-rose-700 border-rose-200",
  "Ad Networks": "bg-amber-100 text-amber-700 border-amber-200",
  Advertising: "bg-amber-100 text-amber-700 border-amber-200",
  VoIP: "bg-indigo-100 text-indigo-700 border-indigo-200",
  "Remote Access": "bg-teal-100 text-teal-700 border-teal-200",
  Education: "bg-lime-100 text-lime-700 border-lime-200",
  IoT: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Finance: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Shopping: "bg-orange-100 text-orange-700 border-orange-200",
  Maps: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Adult: "bg-rose-200 text-rose-800 border-rose-300",
  Information: "bg-blue-100 text-blue-700 border-blue-200",
  Security: "bg-red-100 text-red-700 border-red-200",
  "Remote Desktop": "bg-teal-100 text-teal-700 border-teal-200",
  System: "bg-gray-100 text-gray-700 border-gray-200",
  Web: "bg-gray-100 text-gray-700 border-gray-200",
  Other: "bg-gray-50 text-gray-600 border-gray-200",
  Download: "bg-teal-100 text-teal-700 border-teal-200",
  Streaming: "bg-rose-100 text-rose-700 border-rose-200",
};

const RISK_STYLES: Record<string, string> = {
  Low: "bg-green-100 text-green-700 border-green-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  High: "bg-orange-100 text-orange-700 border-orange-200",
  Critical: "bg-red-100 text-red-700 border-red-200",
};

const ACTION_STYLES: Record<string, string> = {
  ALLOW: "bg-green-100 text-green-700 border-green-200",
  BLOCK: "bg-red-100 text-red-700 border-red-200",
  RATE_LIMIT: "bg-amber-100 text-amber-700 border-amber-200",
  SHAPE: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

const SCOPE_OPTIONS = ["GLOBAL", "PLAN", "SUBSCRIBER", "IP_RANGE"];
const ACTION_OPTIONS = ["ALLOW", "BLOCK", "RATE_LIMIT", "SHAPE"];

// ─── Helpers ─────────────────────────────────────────────────────

function formatBytes(n: number | undefined | null): string {
  if (n == null || n === 0) return "0 B";
  if (n >= 1099511627776) return `${(n / 1099511627776).toFixed(1)} TB`;
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
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

function NdpiOfflineBanner() {
  return (
    <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/40">
          <AlertTriangle className="h-5 w-5 text-red-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">nDPI Daemon Offline</h3>
          <p className="text-xs text-red-600/80 dark:text-red-500/70 mt-0.5">
            The nDPI deep packet inspection daemon is not running. Start it to enable application-layer traffic visibility.
          </p>
        </div>
        <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-xs shrink-0">
          Disconnected
        </Badge>
      </CardContent>
    </Card>
  );
}

// ─── Default Form Values ─────────────────────────────────────────

const DEFAULT_RULE_FORM: Omit<QoSRule, "id" | "hitCount" | "createdAt"> = {
  name: "",
  description: "",
  applications: [],
  action: "ALLOW",
  scope: "GLOBAL",
  target: "",
  rateLimitMbps: undefined,
  priority: 100,
  enabled: true,
};

// ─── Main Component ───────────────────────────────────────────────

export default function AppAwarenessPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("dashboard");

  // Tab 2: Applications
  const [appSearch, setAppSearch] = useState("");
  const [appCategoryFilter, setAppCategoryFilter] = useState("All");
  const [selectedApp, setSelectedApp] = useState<NdpiApp | null>(null);
  const [appDetailOpen, setAppDetailOpen] = useState(false);
  const [selectedAppsForBatch, setSelectedAppsForBatch] = useState<Set<string>>(new Set());
  const [appPage, setAppPage] = useState(1);
  const APPS_PER_PAGE = 50;
  const [viewMode, setViewMode] = useState<"grouped" | "table">("grouped");

  // Tab 3: Subscriber Analysis
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [expandedSubscriber, setExpandedSubscriber] = useState<string | null>(null);

  // Tab 4: QoS Rules
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<QoSRule | null>(null);
  const [ruleForm, setRuleForm] = useState(DEFAULT_RULE_FORM);
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<QoSRule | null>(null);

  // ─── Queries ────────────────────────────────────────────────
  const { data: daemonData, isLoading: daemonLoading, error: daemonError } = useQuery<DaemonStatus>({
    queryKey: ["ndpi-daemon"],
    queryFn: () => apiFetch<DaemonStatus>("/api/ndpi"),
    refetchInterval: 15000,
    retry: false,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<TrafficStats>({
    queryKey: ["ndpi-stats"],
    queryFn: () => apiFetch<TrafficStats>("/api/ndpi/stats"),
    refetchInterval: 10000,
    retry: false,
  });

  const { data: appsData, isLoading: appsLoading } = useQuery<{ apps: NdpiApp[] }>({
    queryKey: ["ndpi-apps"],
    queryFn: () => apiFetch<{ apps: NdpiApp[] }>("/api/ndpi/apps"),
    refetchInterval: 30000,
    retry: false,
  });

  // Full protocol catalog (ALL supported protocols for blocking/selection)
  const { data: catalogData, isLoading: catalogLoading } = useQuery<{
    catalog: Array<{ category: string; protocols: Array<{ ndpiId: number; name: string; risk: string; description: string }> }>;
    totalProtocols: number;
    totalCategories: number;
  }>({
    queryKey: ["ndpi-catalog"],
    queryFn: () => apiFetch("/api/ndpi/catalog"),
    refetchInterval: 120000,
    retry: false,
  });

  // Build full app list from catalog for Applications tab (all supported protocols)
  const catalogApps: NdpiApp[] = useMemo(() => {
    if (!catalogData?.catalog?.length) return [];
    return catalogData.catalog.flatMap(cat =>
      cat.protocols.map(p => ({
        id: p.ndpiId,
        name: p.name,
        category: cat.category,
        risk: p.risk,
        totalBytes: 0,
        downloadBytes: 0,
        uploadBytes: 0,
        subscriberCount: 0,
        description: p.description,
      }))
    );
  }, [catalogData]);

  const { data: subscribersData, isLoading: subscribersLoading } = useQuery<{ subscribers: Subscriber[] }>({
    queryKey: ["ndpi-subscribers"],
    queryFn: () => apiFetch<{ subscribers: Subscriber[] }>("/api/ndpi/subscribers"),
    refetchInterval: 10000,
    retry: false,
  });

  const { data: rulesData, isLoading: rulesLoading } = useQuery<{ rules: QoSRule[] }>({
    queryKey: ["ndpi-rules"],
    queryFn: () => apiFetch<{ rules: QoSRule[] }>("/api/ndpi/rules"),
    refetchInterval: 15000,
    retry: false,
  });

  // Fetch categories from daemon
  const { data: categoriesData } = useQuery<{ categories: Array<{ name: string; appCount: number; totalBytes: number }> }>({
    queryKey: ["ndpi-categories"],
    queryFn: () => apiFetch<{ categories: Array<{ name: string; appCount: number; totalBytes: number }> }>("/api/ndpi/categories"),
    refetchInterval: 60000,
    retry: false,
  });
  const dynamicCategories = categoriesData?.categories?.map(c => c.name) || [];
  const CATEGORIES = dynamicCategories.length > 0 ? ["All", ...dynamicCategories] : DEFAULT_CATEGORIES;

  const daemonOnline = daemonData?.daemonOnline === true || daemonData?.daemon?.status === "online" || daemonData?.running === true;
  const stats = statsData || {
    totalBytes: 0, downloadBytes: 0, uploadBytes: 0, totalTrafficToday: "0 B",
    activeApps: 0, topApp: "—", topAppBytes: 0, activeSubscribers: 0,
    blockedApps: 0, hourlyTraffic: [], topApps: [], categoryBreakdown: {},
    recentEvents: [],
  };
  const apps = appsData?.apps || [];
  const subscribers = subscribersData?.subscribers || [];
  const rules = rulesData?.rules || [];

  // Use catalog apps for Applications tab (full list), detected apps for Dashboard
  const allAppsForTab = catalogApps.length > 0 ? catalogApps : apps;
  const isCatalogMode = catalogApps.length > 0;

  // ─── Derived Data ───────────────────────────────────────────
  const top10AppsChart = useMemo(() =>
    (stats.topApps || []).slice(0, 10).map((a) => ({
      name: a.name,
      download: a.download,
      upload: a.upload,
    })).sort((a, b) => b.download - a.download),
    [stats.topApps]
  );

  const categoryBreakdown = useMemo(() =>
    Object.entries(stats.categoryBreakdown || {}).map(([name, bytes]) => ({
      name,
      bytes: bytes as number,
    })).sort((a, b) => b.bytes - a.bytes),
    [stats.categoryBreakdown]
  );

  const hourlyTraffic = useMemo(() =>
    (stats.hourlyTraffic || []).map((h) => ({
      hour: h.hour,
      download: h.download,
      upload: h.upload,
    })),
    [stats.hourlyTraffic]
  );

  const topSubscribers = useMemo(() =>
    [...subscribers].sort((a, b) => b.totalBytes - a.totalBytes).slice(0, 10),
    [subscribers]
  );

  const filteredApps = useMemo(() => {
    return allAppsForTab.filter((app) => {
      const matchSearch = !appSearch || app.name.toLowerCase().includes(appSearch.toLowerCase());
      const matchCategory = appCategoryFilter === "All" || app.category === appCategoryFilter;
      return matchSearch && matchCategory;
    });
  }, [allAppsForTab, appSearch, appCategoryFilter]);

  // Group filtered apps by category for accordion view
  const groupedByCategory = useMemo(() => {
    const groups: Record<string, NdpiApp[]> = {};
    for (const app of filteredApps) {
      const cat = app.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(app);
    }
    // Sort categories alphabetically, then sort apps within each category by name
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, apps]) => ({
        category,
        apps: apps.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [filteredApps]);

  // Paginated apps for table view
  const paginatedApps = useMemo(() => {
    const start = (appPage - 1) * APPS_PER_PAGE;
    return filteredApps.slice(start, start + APPS_PER_PAGE);
  }, [filteredApps, appPage]);
  const totalAppPages = Math.ceil(filteredApps.length / APPS_PER_PAGE);

  // Reset page when filters change
  const handleAppFilterChange = useCallback((search: string, category: string) => {
    setAppSearch(search);
    setAppCategoryFilter(category);
    setAppPage(1);
  }, []);

  const filteredSubscribers = useMemo(() => {
    if (!subscriberSearch) return subscribers;
    const q = subscriberSearch.toLowerCase();
    return subscribers.filter(
      (s) => s.ip.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.plan.toLowerCase().includes(q)
    );
  }, [subscribers, subscriberSearch]);

  // ─── Mutations ──────────────────────────────────────────────
  const createRuleMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/ndpi/rules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("QoS rule created");
        closeRuleDialog();
        queryClient.invalidateQueries({ queryKey: ["ndpi-rules"] });
      } else {
        toast.error(d.error || "Failed to create rule");
      }
    },
    onError: () => toast.error("Failed to create QoS rule"),
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; [key: string]: unknown }) =>
      apiFetch(`/api/ndpi/rules/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("QoS rule updated");
        closeRuleDialog();
        queryClient.invalidateQueries({ queryKey: ["ndpi-rules"] });
      } else {
        toast.error(d.error || "Failed to update rule");
      }
    },
    onError: () => toast.error("Failed to update QoS rule"),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ndpi/rules/${id}`, { method: "DELETE" }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("QoS rule deleted");
        setDeleteRuleTarget(null);
        queryClient.invalidateQueries({ queryKey: ["ndpi-rules"] });
      } else {
        toast.error(d.error || "Failed to delete rule");
      }
    },
    onError: () => toast.error("Failed to delete QoS rule"),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/api/ndpi/rules/${id}`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    onSuccess: () => {
      toast.success("Rule toggled");
      queryClient.invalidateQueries({ queryKey: ["ndpi-rules"] });
    },
    onError: () => toast.error("Failed to toggle rule"),
  });

  // ─── Rule Form Helpers ─────────────────────────────────────
  function closeRuleDialog() {
    setRuleDialogOpen(false);
    setEditingRule(null);
    setRuleForm(DEFAULT_RULE_FORM);
  }

  function openCreateRuleDialog() {
    setEditingRule(null);
    setRuleForm(DEFAULT_RULE_FORM);
    setRuleDialogOpen(true);
  }

  function openEditRuleDialog(rule: QoSRule) {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      description: rule.description || "",
      applications: rule.applications,
      action: rule.action,
      scope: rule.scope,
      target: rule.target || "",
      rateLimitMbps: rule.rateLimitMbps,
      priority: rule.priority,
      enabled: rule.enabled,
    });
    setRuleDialogOpen(true);
  }

  function handleSaveRule() {
    if (!ruleForm.name.trim()) { toast.error("Rule name is required"); return; }
    if (ruleForm.applications.length === 0) { toast.error("Select at least one application"); return; }
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, ...ruleForm });
    } else {
      createRuleMutation.mutate(ruleForm);
    }
  }

  function addApplicationToForm(appName: string) {
    if (!ruleForm.applications.includes(appName)) {
      setRuleForm({ ...ruleForm, applications: [...ruleForm.applications, appName] });
    }
  }

  function removeApplicationFromForm(appName: string) {
    setRuleForm({ ...ruleForm, applications: ruleForm.applications.filter((a) => a !== appName) });
  }

  // ─── Batch Selection Helpers ────────────────────────────────
  function toggleAppSelection(appName: string) {
    setSelectedAppsForBatch(prev => {
      const next = new Set(prev);
      if (next.has(appName)) next.delete(appName);
      else next.add(appName);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedAppsForBatch(new Set(filteredApps.map(a => a.name)));
  }

  function clearSelection() {
    setSelectedAppsForBatch(new Set());
  }

  function blockSelectedApps() {
    if (selectedAppsForBatch.size === 0) { toast.error("No protocols selected"); return; }
    const appNames = Array.from(selectedAppsForBatch);
    const ruleName = appNames.length <= 3
      ? `Block: ${appNames.join(", ")}`
      : `Block ${appNames.length} protocols`;
    createRuleMutation.mutate({
      name: ruleName.slice(0, 80),
      description: `Batch block ${appNames.length} protocols: ${appNames.slice(0, 5).join(", ")}${appNames.length > 5 ? "..." : ""}`,
      applications: appNames,
      action: "BLOCK",
      scope: "GLOBAL",
      target: "",
      priority: 100,
      enabled: true,
    });
    setSelectedAppsForBatch(new Set());
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
            <Globe className="h-6 w-6 text-emerald-500" />
            Application Awareness
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            L7 deep packet inspection — application visibility, subscriber analysis, QoS shaping
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["ndpi-daemon"] });
            queryClient.invalidateQueries({ queryKey: ["ndpi-stats"] });
            queryClient.invalidateQueries({ queryKey: ["ndpi-apps"] });
            queryClient.invalidateQueries({ queryKey: ["ndpi-subscribers"] });
            queryClient.invalidateQueries({ queryKey: ["ndpi-rules"] });
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All
          </Button>
          {!daemonOnline && (
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={() => setTab("daemon")}
            >
              <Play className="h-4 w-4 mr-2" />
              Setup Daemon
            </Button>
          )}
        </div>
      </div>

      {/* Daemon Offline Banner */}
      {!daemonOnline && <NdpiOfflineBanner />}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="dashboard" className="text-xs sm:text-sm">Dashboard</TabsTrigger>
          <TabsTrigger value="applications" className="text-xs sm:text-sm">Applications</TabsTrigger>
          <TabsTrigger value="subscribers" className="text-xs sm:text-sm">Subscriber Analysis</TabsTrigger>
          <TabsTrigger value="qos" className="text-xs sm:text-sm">App QoS Rules</TabsTrigger>
          <TabsTrigger value="daemon" className="text-xs sm:text-sm">Daemon Status</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Tab 1: Dashboard                                      */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="dashboard">
          {/* Row 1: Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <StatCard
              title="Total Traffic (Today)"
              value={stats.totalTrafficToday || formatBytes(stats.totalBytes)}
              subtitle={`↓ ${formatBytes(stats.downloadBytes)} · ↑ ${formatBytes(stats.uploadBytes)}`}
              icon={Activity}
              gradient="stat-gradient-red"
              delay={0}
            />
            <StatCard
              title="Active Apps"
              value={stats.activeApps || apps.length}
              subtitle="Detected applications"
              icon={Layers}
              gradient="stat-gradient-emerald"
              delay={75}
            />
            <StatCard
              title="Top App"
              value={stats.topApp || "—"}
              subtitle={stats.topAppBytes ? formatBytes(stats.topAppBytes) : "No data"}
              icon={ArrowUpRight}
              gradient="stat-gradient-amber"
              delay={150}
            />
            <StatCard
              title="Active Subscribers"
              value={stats.activeSubscribers || subscribers.length}
              subtitle="Online users"
              icon={Users}
              gradient="stat-gradient-cyan"
              delay={225}
            />
            <StatCard
              title="Blocked Apps"
              value={stats.blockedApps || 0}
              subtitle="QoS blocked applications"
              icon={Ban}
              gradient="stat-gradient-purple"
              delay={300}
            />
            <StatCard
              title="nDPI Daemon"
              value={daemonOnline ? "Online" : "Offline"}
              subtitle={daemonOnline ? `v${daemonData?.version || "—"}` : "Not running"}
              icon={Server}
              gradient="stat-gradient-slate"
              delay={375}
            />
          </div>

          {/* Row 2: Top 10 Apps + Category Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Top 10 Applications Bar Chart */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    Top 10 Applications
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">By Download</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {top10AppsChart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <BarChart3 className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">No application data</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={top10AppsChart} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatBytes} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                      <RTooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                        formatter={(value: number, name: string) => [formatBytes(value), name === "download" ? "Download" : "Upload"]}
                      />
                      <Bar dataKey="download" fill="#059669" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="upload" fill="#0D9488" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Traffic by Category */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-purple-500" />
                    Traffic by Category
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">{categoryBreakdown.length} categories</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {categoryBreakdown.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <PieChart className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">No category data</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categoryBreakdown.map((cat) => {
                      const totalBytes = categoryBreakdown.reduce((sum, c) => sum + c.bytes, 0);
                      const pct = totalBytes > 0 ? ((cat.bytes / totalBytes) * 100).toFixed(1) : "0";
                      return (
                        <div key={cat.name} className="flex items-center gap-3">
                          <Badge variant="outline" className={`text-[11px] w-28 justify-center shrink-0 ${CATEGORY_COLORS[cat.name] || CATEGORY_COLORS.Other}`}>
                            {cat.name}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  cat.name === "Media" ? "bg-red-500" :
                                  cat.name === "Social" ? "bg-pink-500" :
                                  cat.name === "P2P" ? "bg-orange-500" :
                                  cat.name === "Communication" ? "bg-emerald-500" :
                                  cat.name === "Gaming" ? "bg-purple-500" :
                                  cat.name === "Streaming" ? "bg-rose-500" :
                                  "bg-slate-500"
                                }`}
                                style={{ width: `${Math.min(parseFloat(pct), 100)}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right shrink-0">{pct}%</span>
                          <span className="text-xs font-medium w-20 text-right shrink-0">{formatBytes(cat.bytes)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Hourly Traffic Chart */}
          <Card className="border shadow-sm mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                  Hourly Traffic (Last 24h)
                </CardTitle>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> Download</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal-500" /> Upload</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {hourlyTraffic.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No hourly traffic data</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={hourlyTraffic} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0D9488" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatBytes} />
                    <RTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      formatter={(value: number, name: string) => [formatBytes(value), name === "download" ? "Download" : "Upload"]}
                    />
                    <Area type="monotone" dataKey="download" stroke="#059669" fill="url(#dlGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="upload" stroke="#0D9488" fill="url(#ulGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Row 4: Top Subscribers + Recent Events */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top 10 Subscribers */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-cyan-500" />
                    Top 10 Subscribers by Traffic
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setTab("subscribers")}>
                    View All <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs font-medium uppercase">IP</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Subscriber</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Plan</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right">Traffic</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Top App</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topSubscribers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p>No subscriber data</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        topSubscribers.map((sub) => (
                          <TableRow key={sub.id} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-xs">{sub.ip}</TableCell>
                            <TableCell className="text-xs font-medium">{sub.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{sub.plan}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{formatBytes(sub.totalBytes)}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge variant="outline" className="text-[10px]">
                                {sub.topApps?.[0]?.name || "—"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Recent Application Events */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-red-500" />
                    Recent Application Events
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">{stats.recentEvents?.length || 0} events</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[400px]">
                  {(stats.recentEvents || []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Radio className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">No recent events</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {(stats.recentEvents || []).map((evt) => (
                        <div key={evt.id} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
                          <div className={`p-1.5 rounded-lg ${
                            evt.action === "BLOCK" ? "bg-red-100 text-red-600" :
                            evt.action === "RATE_LIMIT" ? "bg-amber-100 text-amber-600" :
                            "bg-emerald-100 text-emerald-600"
                          }`}>
                            {evt.action === "BLOCK" ? <Ban className="h-3 w-3" /> :
                             evt.action === "RATE_LIMIT" ? <Zap className="h-3 w-3" /> :
                             <ArrowUpRight className="h-3 w-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono">{evt.ip}</span>
                              <span className="text-xs text-muted-foreground">→</span>
                              <span className="text-xs font-medium">{evt.app}</span>
                              <Badge variant="outline" className={`text-[10px] ${
                                evt.action === "BLOCK" ? ACTION_STYLES.BLOCK :
                                evt.action === "RATE_LIMIT" ? ACTION_STYLES.RATE_LIMIT :
                                ACTION_STYLES.ALLOW
                              }`}>
                                {evt.action}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{formatBytes(evt.bytes)} transferred</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(evt.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Tab 2: Applications                                    */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="applications">
          {/* Search and Filters */}
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search applications..."
                      value={appSearch}
                      onChange={(e) => handleAppFilterChange(e.target.value, appCategoryFilter)}
                      className="pl-8"
                    />
                  </div>
                  <Select value={appCategoryFilter} onValueChange={(v) => handleAppFilterChange(appSearch, v)}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="text-xs h-9 flex items-center px-3 shrink-0">
                    {filteredApps.length} / {allAppsForTab.length} protocols
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {/* View mode toggle */}
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                    <button
                      onClick={() => { setViewMode("grouped"); setAppPage(1); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "grouped" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <Layers className="h-3.5 w-3.5 inline mr-1" />Grouped
                    </button>
                    <button
                      onClick={() => { setViewMode("table"); setAppPage(1); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "table" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <BarChart3 className="h-3.5 w-3.5 inline mr-1" />Table
                    </button>
                  </div>
                  {/* Batch actions */}
                  {isCatalogMode && (
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="text-xs h-8" onClick={selectAllFiltered}>
                        Select All
                      </Button>
                      {selectedAppsForBatch.size > 0 && (
                        <>
                          <Button variant="outline" size="sm" className="text-xs h-8" onClick={clearSelection}>
                            Clear ({selectedAppsForBatch.size})
                          </Button>
                          <Button variant="destructive" size="sm" className="text-xs h-8" onClick={blockSelectedApps}>
                            <Ban className="h-3 w-3 mr-1" />
                            Block {selectedAppsForBatch.size}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loading */}
          {appsLoading || catalogLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : filteredApps.length === 0 ? (
            <Card className="border shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <AppWindow className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">No protocols match your filter</p>
                <p className="text-xs mt-1">
                  {isCatalogMode
                    ? `Showing ${allAppsForTab.length} supported protocols — try a different search or category`
                    : "No application data detected yet"}
                </p>
                {isCatalogMode && appSearch && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => handleAppFilterChange("", appCategoryFilter)}>
                    Clear Search
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : viewMode === "grouped" ? (
            /* ─── Grouped Accordion View ─── */
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <Accordion type="multiple" className="w-full">
                  {groupedByCategory.map((group) => {
                    const selectedInGroup = group.apps.filter(a => selectedAppsForBatch.has(a.name)).length;
                    const allSelected = selectedInGroup === group.apps.length;
                    return (
                      <AccordionItem key={group.category} value={group.category} className="border-b last:border-b-0">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3 flex-1 mr-2">
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${CATEGORY_COLORS[group.category] || CATEGORY_COLORS.Other}`}>
                              {group.category}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{group.apps.length} protocols</span>
                            {isCatalogMode && selectedInGroup > 0 && (
                              <Badge variant="secondary" className="text-[10px] ml-auto mr-2">
                                {selectedInGroup}/{group.apps.length} selected
                              </Badge>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-3">
                          {isCatalogMode && group.apps.length > 0 && (
                            <div className="flex items-center gap-2 mb-2 px-1">
                              <Checkbox
                                checked={allSelected}
                                onCheckedChange={() => {
                                  if (allSelected) {
                                    const names = group.apps.map(a => a.name);
                                    setSelectedAppsForBatch(prev => {
                                      const next = new Set(prev);
                                      names.forEach(n => next.delete(n));
                                      return next;
                                    });
                                  } else {
                                    setSelectedAppsForBatch(prev => {
                                      const next = new Set(prev);
                                      group.apps.forEach(a => next.add(a.name));
                                      return next;
                                    });
                                  }
                                }}
                                className="h-3.5 w-3.5"
                              />
                              <span className="text-[11px] text-muted-foreground">
                                {allSelected ? "Deselect all" : "Select all"} in this category
                              </span>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {group.apps.map((app, idx) => {
                              const isSelected = selectedAppsForBatch.has(app.name);
                              return (
                                <div
                                  key={`${app.id}-${app.name}-${idx}`}
                                  className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-transparent bg-muted/20"}`}
                                  onClick={() => { setSelectedApp(app); setAppDetailOpen(true); }}
                                >
                                  {isCatalogMode && (
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleAppSelection(app.name)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="h-3.5 w-3.5 shrink-0"
                                    />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{app.name}</p>
                                    <p className="text-[10px] text-muted-foreground">ID: {app.id}</p>
                                  </div>
                                  <Badge variant="outline" className={`text-[9px] shrink-0 px-1.5 py-0 ${RISK_STYLES[app.risk] || RISK_STYLES.Low}`}>
                                    {app.risk}
                                  </Badge>
                                </div>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </CardContent>
            </Card>
          ) : (
            /* ─── Paginated Table View ─── */
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <div className="max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        {isCatalogMode && <TableHead className="w-10"></TableHead>}
                        <TableHead className="text-xs font-medium uppercase">Protocol</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Category</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Risk</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Traffic</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Users</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedApps.map((app, idx) => {
                        const isSelected = selectedAppsForBatch.has(app.name);
                        return (
                          <TableRow
                            key={`${app.id}-${app.name}-${idx}`}
                            className={`hover:bg-muted/50 transition-colors cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
                            onClick={() => { setSelectedApp(app); setAppDetailOpen(true); }}
                          >
                            {isCatalogMode && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleAppSelection(app.name)}
                                  className="h-3.5 w-3.5"
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">{app.name}</p>
                                <p className="text-[10px] text-muted-foreground">ID: {app.id}</p>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[app.category] || CATEGORY_COLORS.Other}`}>
                                {app.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge variant="outline" className={`text-[10px] ${RISK_STYLES[app.risk] || RISK_STYLES.Low}`}>
                                {app.risk}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <span className="text-xs">{formatBytes(app.totalBytes)}</span>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <span className="text-xs">{app.subscriberCount}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setSelectedApp(app); setAppDetailOpen(true); }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {/* Pagination */}
                {totalAppPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      Showing {(appPage - 1) * APPS_PER_PAGE + 1}–{Math.min(appPage * APPS_PER_PAGE, filteredApps.length)} of {filteredApps.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={appPage <= 1} onClick={() => setAppPage(1)}>
                        First
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={appPage <= 1} onClick={() => setAppPage(p => p - 1)}>
                        Prev
                      </Button>
                      <span className="text-xs px-2 font-medium">{appPage} / {totalAppPages}</span>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={appPage >= totalAppPages} onClick={() => setAppPage(p => p + 1)}>
                        Next
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={appPage >= totalAppPages} onClick={() => setAppPage(totalAppPages)}>
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* App Detail Dialog */}
          <Dialog open={appDetailOpen} onOpenChange={setAppDetailOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AppWindow className="h-5 w-5 text-emerald-500" />
                  {selectedApp?.name || "Application Details"}
                </DialogTitle>
                <DialogDescription>Detailed traffic analysis for this application</DialogDescription>
              </DialogHeader>
              {selectedApp && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground uppercase">Total Traffic</p>
                      <p className="text-sm font-bold mt-1">{formatBytes(selectedApp.totalBytes)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground uppercase">Download</p>
                      <p className="text-sm font-bold mt-1">{formatBytes(selectedApp.downloadBytes)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground uppercase">Upload</p>
                      <p className="text-sm font-bold mt-1">{formatBytes(selectedApp.uploadBytes)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground uppercase">Subscribers</p>
                      <p className="text-sm font-bold mt-1">{selectedApp.subscriberCount}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className={CATEGORY_COLORS[selectedApp.category] || CATEGORY_COLORS.Other}>
                      {selectedApp.category}
                    </Badge>
                    <Badge variant="outline" className={RISK_STYLES[selectedApp.risk] || RISK_STYLES.Low}>
                      {selectedApp.risk} Risk
                    </Badge>
                    <Badge variant="outline">nDPI ID: {selectedApp.id}</Badge>
                  </div>
                  {selectedApp.description && (
                    <p className="text-xs text-muted-foreground">{selectedApp.description}</p>
                  )}
                  {/* Traffic chart placeholder */}
                  <Card className="border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold">Traffic Trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={Array.from({ length: 24 }).map((_, i) => ({
                          hour: `${i.toString().padStart(2, "0")}:00`,
                          traffic: Math.floor(Math.random() * selectedApp.totalBytes * 0.15),
                        }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <defs>
                            <linearGradient id="appTrendGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={3} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={formatBytes} />
                          <RTooltip
                            contentStyle={{ fontSize: 11, borderRadius: 8 }}
                            formatter={(value: number) => [formatBytes(value), "Traffic"]}
                          />
                          <Area type="monotone" dataKey="traffic" stroke="#059669" fill="url(#appTrendGrad)" strokeWidth={1.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  {/* Subscriber breakdown placeholder */}
                  <div>
                    <h4 className="text-xs font-semibold mb-2">Top Subscribers</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {subscribers
                        .filter((s) => s.topApps?.some((a) => a.name === selectedApp.name))
                        .slice(0, 5)
                        .map((sub) => {
                          const appData = sub.topApps.find((a) => a.name === selectedApp.name);
                          return (
                            <div key={sub.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono">{sub.ip}</span>
                                <span className="text-xs text-muted-foreground">— {sub.name}</span>
                              </div>
                              <span className="text-xs font-medium">{formatBytes(appData?.bytes || 0)}</span>
                            </div>
                          );
                        })
                      }
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Tab 3: Subscriber Analysis                             */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="subscribers">
          {/* Search */}
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by subscriber name, IP, or plan..."
                    value={subscriberSearch}
                    onChange={(e) => setSubscriberSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Badge variant="outline" className="text-xs h-9 flex items-center px-3">
                  {filteredSubscribers.length} subscribers
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Subscribers Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[700px]">
                {subscribersLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : filteredSubscribers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="h-8 w-8 mb-2 opacity-30" />
                    <p>No subscribers found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs font-medium uppercase">IP</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Subscriber</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Plan</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right">Total Traffic</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Top 3 Apps</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubscribers.map((sub) => (
                        <>
                          <TableRow
                            key={sub.id}
                            className="hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => setExpandedSubscriber(expandedSubscriber === sub.id ? null : sub.id)}
                          >
                            <TableCell className="font-mono text-xs">{sub.ip}</TableCell>
                            <TableCell className="text-xs font-medium">{sub.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{sub.plan}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{formatBytes(sub.totalBytes)}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex gap-1 flex-wrap">
                                {(sub.topApps || []).slice(0, 3).map((app) => (
                                  <Badge key={app.name} variant="outline" className={`text-[10px] ${CATEGORY_COLORS[app.category] || CATEGORY_COLORS.Other}`}>
                                    {app.name}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="text-xs h-7">
                                <Eye className="h-3 w-3 mr-1" />
                                {expandedSubscriber === sub.id ? "Collapse" : "Expand"}
                              </Button>
                            </TableCell>
                          </TableRow>
                          {/* Expanded Row */}
                          {expandedSubscriber === sub.id && (
                            <TableRow key={`${sub.id}-expanded`}>
                              <TableCell colSpan={6} className="bg-muted/20 p-4">
                                <div className="space-y-4">
                                  <div className="flex items-center gap-2">
                                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                                    <h4 className="text-sm font-semibold">Application Breakdown for {sub.name}</h4>
                                    <Badge variant="outline" className="text-[10px]">{sub.ip}</Badge>
                                    <span className="text-xs text-muted-foreground">Last seen: {timeAgo(sub.lastSeen)}</span>
                                  </div>
                                  {/* App breakdown bar chart */}
                                  {(sub.topApps || []).length > 0 ? (
                                    <ResponsiveContainer width="100%" height={200}>
                                      <BarChart data={(sub.topApps || []).map((a) => ({
                                        name: a.name,
                                        bytes: a.bytes,
                                      }))} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatBytes} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                                        <RTooltip
                                          contentStyle={{ fontSize: 11, borderRadius: 8 }}
                                          formatter={(value: number) => [formatBytes(value), "Traffic"]}
                                        />
                                        <Bar dataKey="bytes" fill="#059669" radius={[0, 4, 4, 0]} />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No application data available</p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Tab 4: App QoS Rules                                   */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="qos">
          {/* Header */}
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Application QoS Rules</h3>
                <p className="text-xs text-muted-foreground">Manage traffic shaping, blocking, and rate limiting rules per application</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={openCreateRuleDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Rule
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Rules Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                {rulesLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : rules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Shield className="h-8 w-8 mb-2 opacity-30" />
                    <p>No QoS rules configured</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={openCreateRuleDialog}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Rule
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs font-medium uppercase">Name</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Applications</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Action</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Scope</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Target</TableHead>
                        <TableHead className="text-xs font-medium uppercase hidden xl:table-cell">Rate Limit</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right hidden sm:table-cell">Hits</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-center">Enabled</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id} className={`hover:bg-muted/50 transition-colors ${!rule.enabled ? "opacity-50" : ""}`}>
                          <TableCell>
                            <div>
                              <p className="text-xs font-medium">{rule.name}</p>
                              {rule.description && <p className="text-[10px] text-muted-foreground">{rule.description}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <div className="flex gap-1 flex-wrap max-w-[200px]">
                              {rule.applications.slice(0, 3).map((app) => (
                                <Badge key={app} variant="outline" className="text-[10px]">{app}</Badge>
                              ))}
                              {rule.applications.length > 3 && (
                                <Badge variant="outline" className="text-[10px]">+{rule.applications.length - 3}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${ACTION_STYLES[rule.action] || ""}`}>
                              {rule.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className="text-[10px]">{rule.scope}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{rule.target || "—"}</TableCell>
                          <TableCell className="text-xs hidden xl:table-cell">
                            {rule.rateLimitMbps ? `${rule.rateLimitMbps} Mbps` : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium hidden sm:table-cell">
                            {formatNumber(rule.hitCount)}
                          </TableCell>
                          <TableCell className="text-center">
                            <button
                              onClick={() => toggleRuleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                              className="focus:outline-none"
                            >
                              {rule.enabled ? (
                                <ToggleRight className="h-5 w-5 text-emerald-500" />
                              ) : (
                                <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditRuleDialog(rule)}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => setDeleteRuleTarget(rule)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Create/Edit Rule Dialog */}
          <Dialog open={ruleDialogOpen} onOpenChange={(open) => { if (!open) closeRuleDialog(); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-purple-500" />
                  {editingRule ? "Edit QoS Rule" : "Create QoS Rule"}
                </DialogTitle>
                <DialogDescription>
                  Configure application-level traffic shaping, blocking, or rate limiting
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Name */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Rule Name *</Label>
                  <Input
                    placeholder="e.g., Block Torrent Traffic"
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Description</Label>
                  <Textarea
                    placeholder="Optional description..."
                    value={ruleForm.description}
                    onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                    rows={2}
                  />
                </div>

                {/* Application Selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Applications *</Label>
                  <div className="flex gap-2">
                    <Select onValueChange={(val) => val && addApplicationToForm(val)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select application..." />
                      </SelectTrigger>
                      <SelectContent>
                        {apps.map((app, idx) => (
                          <SelectItem key={`${app.id}-${app.name}-${idx}`} value={app.name}>
                            {app.name} ({app.category})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {ruleForm.applications.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {ruleForm.applications.map((app) => (
                        <Badge key={app} variant="outline" className="text-xs gap-1">
                          {app}
                          <button onClick={() => removeApplicationFromForm(app)} className="hover:text-red-500">
                            <XCircle className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Action *</Label>
                  <Select value={ruleForm.action} onValueChange={(val) => setRuleForm({ ...ruleForm, action: val })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((a) => (
                        <SelectItem key={a} value={a}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] ${ACTION_STYLES[a]}`}>{a}</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Scope */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Scope *</Label>
                  <Select value={ruleForm.scope} onValueChange={(val) => setRuleForm({ ...ruleForm, scope: val })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPE_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Target (conditional) */}
                {(ruleForm.scope === "PLAN" || ruleForm.scope === "SUBSCRIBER" || ruleForm.scope === "IP_RANGE") && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Target *</Label>
                    <Input
                      placeholder={
                        ruleForm.scope === "PLAN" ? "Plan name (e.g., 100Mbps)" :
                        ruleForm.scope === "SUBSCRIBER" ? "Subscriber name or IP" :
                        "IP range (e.g., 192.168.1.0/24)"
                      }
                      value={ruleForm.target}
                      onChange={(e) => setRuleForm({ ...ruleForm, target: e.target.value })}
                    />
                  </div>
                )}

                {/* Rate Limit (conditional) */}
                {ruleForm.action === "RATE_LIMIT" && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Rate Limit (Mbps)</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 10"
                      value={ruleForm.rateLimitMbps || ""}
                      onChange={(e) => setRuleForm({ ...ruleForm, rateLimitMbps: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                )}

                {/* Priority */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Priority (lower = higher priority)</Label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={ruleForm.priority}
                    onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 100 })}
                  />
                </div>

                {/* Enabled */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Enabled</Label>
                  <Switch
                    checked={ruleForm.enabled}
                    onCheckedChange={(checked) => setRuleForm({ ...ruleForm, enabled: checked })}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={closeRuleDialog}>Cancel</Button>
                <Button
                  onClick={handleSaveRule}
                  disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
                >
                  {(createRuleMutation.isPending || updateRuleMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingRule ? "Update Rule" : "Create Rule"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation */}
          <AlertDialog open={!!deleteRuleTarget} onOpenChange={(open) => { if (!open) setDeleteRuleTarget(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete QoS Rule</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{deleteRuleTarget?.name}&quot;? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => deleteRuleTarget && deleteRuleMutation.mutate(deleteRuleTarget.id)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* Tab 5: Daemon Status                                   */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="daemon">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* nDPI Daemon Status */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Server className="h-4 w-4 text-slate-500" />
                  nDPI Daemon Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${daemonOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                      <span className="text-sm font-medium">{daemonOnline ? "Online" : "Offline"}</span>
                    </div>
                    <Badge variant="outline" className={`text-xs ${daemonOnline ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                      {daemonOnline ? "Running" : "Stopped"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] text-muted-foreground uppercase">Version</p>
                      <p className="text-sm font-semibold mt-1">{daemonData?.version || "—"}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] text-muted-foreground uppercase">Uptime</p>
                      <p className="text-sm font-semibold mt-1">{daemonData?.uptime || "—"}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] text-muted-foreground uppercase">Protocols Detected</p>
                      <p className="text-sm font-semibold mt-1">{daemonData?.protocolsCount || 0}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] text-muted-foreground uppercase">Packets Captured</p>
                      <p className="text-sm font-semibold mt-1">{formatNumber(daemonData?.capturedPackets)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* nftables Integration */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  nftables Integration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">nftables Rules Active</span>
                    <Badge variant="outline" className={`text-xs ${daemonData?.nftablesIntegrated ? "bg-green-100 text-green-700 border-green-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                      {daemonData?.nftablesIntegrated ? "Integrated" : "Not Configured"}
                    </Badge>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Integration Status</p>
                    <p className="text-xs">
                      {daemonData?.nftablesIntegrated
                        ? "nDPI is integrated with nftables. Application-based firewall rules are being applied in real-time."
                        : "nftables integration is not configured. QoS rules will work in monitoring mode only."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Generated nftables Rules Preview */}
            <Card className="border shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-amber-500" />
                    Generated nftables Rules Preview
                  </CardTitle>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                    const rulesText = generateNftablesPreview(rules, apps);
                    navigator.clipboard.writeText(rulesText);
                    toast.success("Rules copied to clipboard");
                  }}>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  These rules would be applied to the gateway when nftables integration is enabled
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[400px]">
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
                    {generateNftablesPreview(rules, apps)}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Installation Guide */}
            <Card className="border shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan-500" />
                  Installation Guide
                </CardTitle>
                <CardDescription className="text-xs">
                  Commands to install nDPI on a real gateway device
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[400px]">
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
{`# Install nDPI and dependencies on Debian/Ubuntu
apt update && apt install -y build-essential git autoconf libtool pkg-config libpcap-dev libjson-c-dev libnuma-dev

# Clone and build nDPI
cd /opt
git clone https://github.com/ntop/nDPI.git
cd nDPI
./autogen.sh
./configure
make -j$(nproc)
make install
ldconfig

# Verify installation
ndpiReader --help
ndpiReader -i eth0 -w /tmp/pcap_output.pcap

# Install nftables (if not present)
apt install -y nftables

# Start the nDPI daemon for traffic inspection
ndpiReader -i eth0 -l /var/log/ndpi/ -t 3600 -w /tmp/capture.pcap &

# Configure nftables base table for nDPI integration
nft add table inet ndpi_filter
nft 'add chain inet ndpi_filter input { type filter hook input priority 0 ; }'
nft 'add chain inet ndpi_filter forward { type filter hook forward priority 0 ; }'
nft 'add chain inet ndpi_filter output { type filter hook output priority 0 ; }'

# Save nftables rules
nft list ruleset > /etc/nftables.conf

# Enable nftables service
systemctl enable nftables
systemctl start nftables

# Verify
nft list ruleset
systemctl status nftables`}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Helper: Generate nftables Preview ──────────────────────────

function generateNftablesPreview(rules: QoSRule[], apps: NdpiApp[]): string {
  if (rules.length === 0) {
    return `#!/usr/sbin/nft -f

# nDPI Application Awareness - nftables Rules
# Generated by ISP Platform
# No QoS rules configured yet.

table inet ndpi_filter {
    chain forward {
        type filter hook forward priority 0; policy accept;

        # Default: allow all traffic
        # Add QoS rules from the App QoS Rules tab
    }
}`;
  }

  const lines = [
    "#!/usr/sbin/nft -f",
    "",
    "# nDPI Application Awareness - nftables Rules",
    `# Generated by ISP Platform at ${new Date().toISOString()}`,
    `# Total rules: ${rules.length}`,
    "",
    "table inet ndpi_filter {",
    "    chain forward {",
    "        type filter hook forward priority 0; policy accept;",
    "",
    "        # ─── Application QoS Rules ───",
    "",
  ];

  const sortedRules = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);

  sortedRules.forEach((rule, i) => {
    const appMatch = rule.applications.map((app) => {
      const appData = apps.find((a) => a.name === app);
      const portHint = appData ? ` # nDPI ID: ${appData.id}` : "";
      return `        # Rule ${i + 1}: ${rule.name} (${rule.action})${portHint}`;
    });

    appMatch.forEach((line) => lines.push(line));

    if (rule.action === "BLOCK") {
      lines.push(`        # ${rule.scope === "GLOBAL" ? "" : `# Scope: ${rule.scope} ${rule.target}\\n        # `}ip daddr { ${rule.scope === "IP_RANGE" && rule.target ? rule.target : "0.0.0.0/0"} } meta l4proto { tcp, udp } ${rule.applications.length > 0 ? `# matches: ${rule.applications.join(", ")}` : ""}`);
      lines.push(`        # drop  # [${rule.name}]`);
    } else if (rule.action === "RATE_LIMIT") {
      lines.push(`        # ${rule.scope === "GLOBAL" ? "" : `# Scope: ${rule.scope} ${rule.target}\\n        # `}meter ratelimit-${rule.id} { ip daddr { ${rule.scope === "IP_RANGE" && rule.target ? rule.target : "0.0.0.0/0"} } } limit rate over ${rule.rateLimitMbps || 10} mbytes/second`);
      lines.push(`        # drop  # [${rule.name}] Rate: ${rule.rateLimitMbps || 10} Mbps`);
    } else if (rule.action === "SHAPE") {
      lines.push(`        # [${rule.name}] Traffic shaping applied`);
      lines.push(`        # priority ${rule.priority} for ${rule.applications.join(", ")}`);
    }

    lines.push("");
  });

  lines.push("    }");
  lines.push("}");
  lines.push("");
  lines.push("# End of nftables rules");

  return lines.join("\n");
}
