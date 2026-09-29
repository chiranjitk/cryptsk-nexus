"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Server, Users, Activity, Settings, Plus, Trash2, Edit, RefreshCw,
  Search, Loader2, CheckCircle, XCircle, Wifi, WifiOff, ArrowDownToLine,
  ArrowUpFromLine, Zap, ChevronLeft, ChevronRight, Eye, Play,
  Power, Globe, Network, Clock, Shield, HardDrive, AlertTriangle,
  ToggleLeft, ToggleRight, Download, Copy, MoreHorizontal,
  CircleDot, Radio, BarChart3, Cable, Monitor,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
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
import { toast } from "sonner";
import { useModuleStore } from "@/store/module-store";

// ─── Types ───────────────────────────────────────────────────────
interface PPPoEProfile {
  id: string;
  name: string;
  interface: string;
  authType: "PAP" | "CHAP" | "MSCHAPv2";
  serverName: string;
  serviceName: string;
  maxSessions: number;
  sessionTimeout: number;
  idleTimeout: number;
  mtu: number;
  mru: number;
  acName: string;
  ipPoolStart: string;
  ipPoolEnd: string;
  ipPoolNetmask: string;
  dnsPrimary: string;
  dnsSecondary: string;
  lcpEchoInterval: number;
  lcpEchoFailure: number;
  ipv6Enabled: boolean;
  ipv6PoolStart: string;
  ipv6PoolEnd: string;
  ipv6PrefixLength: number;
  ipv6DelegationPrefix: string;
  ipv6DnsPrimary: string;
  ipv6DnsSecondary: string;
  enabled: boolean;
  activeSessions: number;
  createdAt: string;
}

interface PPPoESession {
  id: string;
  username: string;
  ipAddress: string;
  macAddress: string;
  interfaceName: string;
  profileName: string;
  status: "ACTIVE" | "TERMINATING" | "IDLE";
  startTime: string;
  downloadBytes: number;
  uploadBytes: number;
  currentDlBps: number;
  currentUlBps: number;
  ipv6Address: string;
  ipv6Prefix: string;
}

interface BandwidthEntry {
  sessionId: string;
  username: string;
  ipAddress: string;
  profileName: string;
  downloadBps: number;
  uploadBps: number;
  totalDownload: number;
  totalUpload: number;
}

interface PPPoEProfilesResponse {
  profiles: PPPoEProfile[];
  stats: {
    totalProfiles: number;
    activeProfiles: number;
    totalActiveSessions: number;
    maxSessionCapacity: number;
  };
}

interface PPPoESessionsResponse {
  sessions: PPPoESession[];
  total: number;
  stats: {
    active: number;
    terminating: number;
    idle: number;
    totalDownload: number;
    totalUpload: number;
  };
}

interface BandwidthResponse {
  entries: BandwidthEntry[];
  summary: {
    totalDownloadBps: number;
    totalUploadBps: number;
    totalDownloadBytes: number;
    totalUploadBytes: number;
  };
}

interface ServerConfig {
  defaultInterface: string;
  defaultMtu: number;
  defaultMru: number;
  defaultDnsPrimary: string;
  defaultDnsSecondary: string;
  defaultWinsPrimary: string;
  defaultWinsSecondary: string;
  lcpEchoInterval: number;
  lcpEchoFailure: number;
  maxSessionsGlobal: number;
  sessionTimeoutDefault: number;
  idleTimeoutDefault: number;
  pppoeListeningInterfaces: string[];
}

// ─── Constants ────────────────────────────────────────────────────
const DEFAULT_PROFILE_FORM = {
  name: "",
  interface: "eth0",
  authType: "MSCHAPv2" as "PAP" | "CHAP" | "MSCHAPv2",
  serverName: "cryptsk-pppoe",
  serviceName: "cryptsk-isp",
  maxSessions: 100,
  sessionTimeout: 86400,
  idleTimeout: 1800,
  mtu: 1492,
  mru: 1492,
  acName: "cryptsk-ac",
  ipPoolStart: "10.0.0.100",
  ipPoolEnd: "10.0.0.254",
  ipPoolNetmask: "255.255.255.0",
  dnsPrimary: "8.8.8.8",
  dnsSecondary: "8.8.4.4",
  lcpEchoInterval: 30,
  lcpEchoFailure: 5,
  enabled: true,
  ipv6Enabled: false,
  ipv6PoolStart: "",
  ipv6PoolEnd: "",
  ipv6PrefixLength: 64,
  ipv6DelegationPrefix: "",
  ipv6DnsPrimary: "2606:4700:4700::1111",
  ipv6DnsSecondary: "2001:4860:4860::8888",
};

const DEFAULT_SERVER_CONFIG: ServerConfig = {
  defaultInterface: "eth0",
  defaultMtu: 1492,
  defaultMru: 1492,
  defaultDnsPrimary: "8.8.8.8",
  defaultDnsSecondary: "8.8.4.4",
  defaultWinsPrimary: "",
  defaultWinsSecondary: "",
  lcpEchoInterval: 30,
  lcpEchoFailure: 5,
  maxSessionsGlobal: 500,
  sessionTimeoutDefault: 86400,
  idleTimeoutDefault: 1800,
  pppoeListeningInterfaces: [],
};

const AUTH_TYPE_COLORS: Record<string, string> = {
  PAP: "bg-amber-100 text-amber-700 border-amber-200",
  CHAP: "bg-blue-100 text-blue-700 border-blue-200",
  MSCHAPv2: "bg-green-100 text-green-700 border-green-200",
};

// ─── Helpers ──────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatBps(bps: number): string {
  if (bps <= 0) return "0 bps";
  if (bps >= 1000000000) return `${(bps / 1000000000).toFixed(2)} Gbps`;
  if (bps >= 1000000) return `${(bps / 1000000).toFixed(2)} Mbps`;
  if (bps >= 1000) return `${(bps / 1000).toFixed(2)} Kbps`;
  return `${bps} bps`;
}

function formatDuration(startTime: string): string {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const diffMs = now - start;
  if (diffMs < 0) return "0s";
  const seconds = Math.floor(diffMs / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case "ACTIVE":
      return <Badge className="bg-emerald-500 text-white border-0 text-xs"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white mr-1 animate-pulse" />Active</Badge>;
    case "TERMINATING":
      return <Badge className="bg-amber-500 text-white border-0 text-xs"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white/80 mr-1 animate-pulse" />Terminating</Badge>;
    case "IDLE":
      return <Badge className="bg-slate-400 text-white border-0 text-xs"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white/60 mr-1" />Idle</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
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

// ─── BandwidthBar ─────────────────────────────────────────────────
function BandwidthBar({ label, value, max, color, icon: Icon }: {
  label: string; value: number; max: number; color: string; icon: React.ElementType;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={`h-3 w-3 ${color}`} />
          <span className="font-medium truncate">{label}</span>
        </div>
        <span className="font-mono tabular-nums text-muted-foreground">{formatBps(value)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color === "text-emerald-500" ? "bg-emerald-500" : color === "text-orange-500" ? "bg-orange-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function PPPoEServerPage() {
  const { isModuleEnabled } = useModuleStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("profiles");

  // Profiles state
  const [profileSearch, setProfileSearch] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PPPoEProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PPPoEProfile | null>(null);
  const [profileForm, setProfileForm] = useState(DEFAULT_PROFILE_FORM);

  // Sessions state
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionProfileFilter, setSessionProfileFilter] = useState("All");
  const [sessionStatusFilter, setSessionStatusFilter] = useState("All");
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [disconnectTarget, setDisconnectTarget] = useState<PPPoESession | null>(null);
  const [bulkDisconnectOpen, setBulkDisconnectOpen] = useState(false);
  const [sessionPage, setSessionPage] = useState(1);

  // Server config state
  const [serverConfig, setServerConfig] = useState<ServerConfig>(DEFAULT_SERVER_CONFIG);
  const [newInterfaceInput, setNewInterfaceInput] = useState("");

  // Duration tick for sessions
  const [tick, setTick] = useState(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    durationTimerRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { if (durationTimerRef.current) clearInterval(durationTimerRef.current); };
  }, []);

  // ─── Queries ─────────────────────────────────────────────────
  const { data: profilesData, isLoading: profilesLoading, isFetching: profilesFetching } = useQuery<PPPoEProfilesResponse>({
    queryKey: ["pppoe-profiles", profileSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (profileSearch) params.set("search", profileSearch);
      return apiFetch<PPPoEProfilesResponse>(`/api/pppoe?section=profiles&${params.toString()}`).catch(() => ({
        profiles: [],
        stats: { totalProfiles: 0, activeProfiles: 0, totalActiveSessions: 0, maxSessionCapacity: 0 },
      }));
    },
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const { data: sessionsData, isLoading: sessionsLoading, isFetching: sessionsFetching } = useQuery<PPPoESessionsResponse>({
    queryKey: ["pppoe-sessions", sessionSearch, sessionProfileFilter, sessionStatusFilter, sessionPage, tick],
    queryFn: () => {
      const params = new URLSearchParams();
      if (sessionSearch) params.set("search", sessionSearch);
      if (sessionProfileFilter !== "All") params.set("profile", sessionProfileFilter);
      if (sessionStatusFilter !== "All") params.set("status", sessionStatusFilter);
      params.set("page", String(sessionPage));
      params.set("limit", "20");
      return apiFetch<PPPoESessionsResponse>(`/api/pppoe?section=sessions&${params.toString()}`).catch(() => ({
        sessions: [],
        total: 0,
        stats: { active: 0, terminating: 0, idle: 0, totalDownload: 0, totalUpload: 0 },
      }));
    },
    refetchInterval: 10000,
    staleTime: 3000,
    enabled: tab === "sessions" || tab === "bandwidth",
  });

  const { data: bandwidthData, isLoading: bwLoading } = useQuery<BandwidthResponse>({
    queryKey: ["pppoe-bandwidth", tick],
    queryFn: () =>
      apiFetch<BandwidthResponse>("/api/pppoe?section=bandwidth").catch(() => ({
        entries: [],
        summary: { totalDownloadBps: 0, totalUploadBps: 0, totalDownloadBytes: 0, totalUploadBytes: 0 },
      })),
    refetchInterval: 3000,
    staleTime: 1000,
    enabled: tab === "bandwidth",
  });

  const { data: configData, isLoading: configLoading } = useQuery<{ config: ServerConfig }>({
    queryKey: ["pppoe-config"],
    queryFn: () =>
      apiFetch<{ config: ServerConfig }>("/api/pppoe?section=config").catch(() => ({ config: DEFAULT_SERVER_CONFIG })),
    staleTime: 30000,
    enabled: tab === "config",
  });

  // Sync config data
  if (configData?.config && JSON.stringify(configData.config) !== JSON.stringify(serverConfig)) {
    setServerConfig(configData.config);
  }

  const profiles = profilesData?.profiles || [];
  const profileStats = profilesData?.stats || { totalProfiles: 0, activeProfiles: 0, totalActiveSessions: 0, maxSessionCapacity: 0 };
  const sessions = sessionsData?.sessions || [];
  const sessionStats = sessionsData?.stats || { active: 0, terminating: 0, idle: 0, totalDownload: 0, totalUpload: 0 };
  const bwEntries = bandwidthData?.entries || [];
  const bwSummary = bandwidthData?.summary || { totalDownloadBps: 0, totalUploadBps: 0, totalDownloadBytes: 0, totalUploadBytes: 0 };

  const filteredProfiles = profiles.filter((p) => {
    if (!profileSearch) return true;
    const q = profileSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.interface.toLowerCase().includes(q) || p.serviceName.toLowerCase().includes(q);
  });

  const topConsumers = [...bwEntries].sort((a, b) => (b.downloadBps + b.uploadBps) - (a.downloadBps + a.uploadBps)).slice(0, 10);
  const maxBwEntry = topConsumers.length > 0 ? Math.max(...topConsumers.map((e) => Math.max(e.downloadBps, e.uploadBps))) : 1;

  // ─── Mutations ───────────────────────────────────────────────
  const createProfileMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/pppoe", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("PPPoE profile created successfully");
      setProfileDialogOpen(false);
      resetProfileForm();
      queryClient.invalidateQueries({ queryKey: ["pppoe-profiles"] });
    },
    onError: () => toast.error("Failed to create PPPoE profile"),
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; [key: string]: unknown }) =>
      apiFetch(`/api/pppoe/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success("PPPoE profile updated");
      setProfileDialogOpen(false);
      setEditingProfile(null);
      resetProfileForm();
      queryClient.invalidateQueries({ queryKey: ["pppoe-profiles"] });
    },
    onError: () => toast.error("Failed to update PPPoE profile"),
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/pppoe/profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("PPPoE profile deleted");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["pppoe-profiles"] });
    },
    onError: () => toast.error("Failed to delete PPPoE profile"),
  });

  const applyConfigMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/pppoe", { method: "POST", body: JSON.stringify({ action: "apply" }) }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("PPPoE configuration applied successfully");
      } else {
        toast.error(d.error || "Failed to apply configuration");
      }
    },
    onError: () => toast.error("Failed to apply PPPoE configuration"),
  });

  const disconnectSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch(`/api/pppoe/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Session disconnected");
      setDisconnectTarget(null);
      queryClient.invalidateQueries({ queryKey: ["pppoe-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["pppoe-bandwidth"] });
    },
    onError: () => toast.error("Failed to disconnect session"),
  });

  const bulkDisconnectMutation = useMutation({
    mutationFn: (sessionIds: string[]) =>
      apiFetch("/api/pppoe", {
        method: "POST",
        body: JSON.stringify({ action: "bulk-disconnect", sessionIds }),
      }),
    onSuccess: (d: any, variables: string[]) => {
      toast.success(d.message || `${variables.length} sessions disconnected`);
      setBulkDisconnectOpen(false);
      setSelectedSessions(new Set());
      queryClient.invalidateQueries({ queryKey: ["pppoe-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["pppoe-bandwidth"] });
    },
    onError: () => toast.error("Failed to disconnect sessions"),
  });

  const saveConfigMutation = useMutation({
    mutationFn: (config: ServerConfig) =>
      apiFetch("/api/pppoe", { method: "PUT", body: JSON.stringify({ action: "save-config", ...config }) }),
    onSuccess: () => {
      toast.success("Server configuration saved");
      queryClient.invalidateQueries({ queryKey: ["pppoe-config"] });
    },
    onError: () => toast.error("Failed to save server configuration"),
  });

  // ─── Profile Form Handlers ────────────────────────────────────
  function resetProfileForm() {
    setProfileForm(DEFAULT_PROFILE_FORM);
    setEditingProfile(null);
  }

  function openProfileDialog(profile?: PPPoEProfile) {
    if (profile) {
      setEditingProfile(profile);
      setProfileForm({
        name: profile.name,
        interface: profile.interface,
        authType: profile.authType,
        serverName: profile.serverName,
        serviceName: profile.serviceName,
        maxSessions: profile.maxSessions,
        sessionTimeout: profile.sessionTimeout,
        idleTimeout: profile.idleTimeout,
        mtu: profile.mtu,
        mru: profile.mru,
        acName: profile.acName,
        ipPoolStart: profile.ipPoolStart,
        ipPoolEnd: profile.ipPoolEnd,
        ipPoolNetmask: profile.ipPoolNetmask,
        dnsPrimary: profile.dnsPrimary,
        dnsSecondary: profile.dnsSecondary,
        lcpEchoInterval: profile.lcpEchoInterval,
        lcpEchoFailure: profile.lcpEchoFailure,
        enabled: profile.enabled,
        ipv6Enabled: profile.ipv6Enabled ?? false,
        ipv6PoolStart: profile.ipv6PoolStart ?? "",
        ipv6PoolEnd: profile.ipv6PoolEnd ?? "",
        ipv6PrefixLength: profile.ipv6PrefixLength ?? 64,
        ipv6DelegationPrefix: profile.ipv6DelegationPrefix ?? "",
        ipv6DnsPrimary: profile.ipv6DnsPrimary ?? "2606:4700:4700::1111",
        ipv6DnsSecondary: profile.ipv6DnsSecondary ?? "2001:4860:4860::8888",
      });
    } else {
      resetProfileForm();
    }
    setProfileDialogOpen(true);
  }

  function handleSaveProfile() {
    if (!profileForm.name.trim()) {
      toast.error("Profile name is required");
      return;
    }
    if (editingProfile) {
      updateProfileMutation.mutate({ id: editingProfile.id, ...profileForm });
    } else {
      createProfileMutation.mutate(profileForm);
    }
  }

  function toggleSelectSession(id: string) {
    setSelectedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedSessions.size === sessions.length) {
      setSelectedSessions(new Set());
    } else {
      setSelectedSessions(new Set(sessions.map((s) => s.id)));
    }
  }

  function addListeningInterface() {
    if (newInterfaceInput.trim() && !serverConfig.pppoeListeningInterfaces.includes(newInterfaceInput.trim())) {
      setServerConfig({
        ...serverConfig,
        pppoeListeningInterfaces: [...serverConfig.pppoeListeningInterfaces, newInterfaceInput.trim()],
      });
      setNewInterfaceInput("");
    }
  }

  function removeListeningInterface(iface: string) {
    setServerConfig({
      ...serverConfig,
      pppoeListeningInterfaces: serverConfig.pppoeListeningInterfaces.filter((i) => i !== iface),
    });
  }

  // ─── Loading State ───────────────────────────────────────────
  if (profilesLoading) {
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
          <h1 className="text-2xl font-bold text-foreground">PPPoE Server</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage PPPoE profiles, active sessions, and server configuration
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["pppoe-profiles"] })}>
            <RefreshCw className={`h-4 w-4 mr-2 ${profilesFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => applyConfigMutation.mutate()}>
            {applyConfigMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
            Apply Config
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Profiles" value={profileStats.totalProfiles} subtitle="PPPoE configurations" icon={Server} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Active Profiles" value={profileStats.activeProfiles} subtitle="Enabled and running" icon={Power} gradient="stat-gradient-green" delay={75} />
        <StatCard title="Active Sessions" value={sessionStats.active} subtitle="Currently connected" icon={Users} gradient="stat-gradient-amber" delay={150} />
        <StatCard title="Total Bandwidth" value={formatBps(bwSummary.totalDownloadBps + bwSummary.totalUploadBps)} subtitle={`↓${formatBytes(bwSummary.totalDownloadBytes)} ↑${formatBytes(bwSummary.totalUploadBytes)}`} icon={Activity} gradient="stat-gradient-blue" delay={225} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="profiles" className="gap-1.5">
            <Server className="h-3.5 w-3.5" />
            Profiles ({profiles.length})
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Sessions ({sessionStats.active})
          </TabsTrigger>
          <TabsTrigger value="bandwidth" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Real-Time BW
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            Config
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Profiles ────────────────────────────────── */}
        <TabsContent value="profiles" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search profiles..." value={profileSearch} onChange={(e) => setProfileSearch(e.target.value)} className="pl-9" />
            </div>
            <Dialog open={profileDialogOpen} onOpenChange={(o) => { setProfileDialogOpen(o); if (!o) resetProfileForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => openProfileDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Profile
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingProfile ? "Edit PPPoE Profile" : "Create PPPoE Profile"}</DialogTitle>
                  <DialogDescription>
                    {editingProfile ? "Update an existing PPPoE profile" : "Configure a new PPPoE profile for subscribers"}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {/* Name & Interface */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Profile Name *</Label>
                      <Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="e.g. FTTH-Plan-100" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Interface *</Label>
                      <Input value={profileForm.interface} onChange={(e) => setProfileForm({ ...profileForm, interface: e.target.value })} placeholder="e.g. eth0, vlan100" />
                    </div>
                  </div>

                  {/* Auth Type & Service */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Auth Type *</Label>
                      <Select value={profileForm.authType} onValueChange={(v: any) => setProfileForm({ ...profileForm, authType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PAP">PAP</SelectItem>
                          <SelectItem value="CHAP">CHAP</SelectItem>
                          <SelectItem value="MSCHAPv2">MSCHAPv2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Service Name</Label>
                      <Input value={profileForm.serviceName} onChange={(e) => setProfileForm({ ...profileForm, serviceName: e.target.value })} placeholder="ISP service name" />
                    </div>
                  </div>

                  {/* Server Name & AC Name */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Server Name</Label>
                      <Input value={profileForm.serverName} onChange={(e) => setProfileForm({ ...profileForm, serverName: e.target.value })} placeholder="PPPoE server name" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">AC Name</Label>
                      <Input value={profileForm.acName} onChange={(e) => setProfileForm({ ...profileForm, acName: e.target.value })} placeholder="Access Concentrator" />
                    </div>
                  </div>

                  {/* Session Limits */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Max Sessions</Label>
                      <Input type="number" value={profileForm.maxSessions} onChange={(e) => setProfileForm({ ...profileForm, maxSessions: parseInt(e.target.value) || 0 })} min={1} />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Session Timeout (s)</Label>
                      <Input type="number" value={profileForm.sessionTimeout} onChange={(e) => setProfileForm({ ...profileForm, sessionTimeout: parseInt(e.target.value) || 0 })} min={0} />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Idle Timeout (s)</Label>
                      <Input type="number" value={profileForm.idleTimeout} onChange={(e) => setProfileForm({ ...profileForm, idleTimeout: parseInt(e.target.value) || 0 })} min={0} />
                    </div>
                  </div>

                  {/* MTU/MRU */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm font-medium mb-1 block">MTU</Label>
                      <Input type="number" value={profileForm.mtu} onChange={(e) => setProfileForm({ ...profileForm, mtu: parseInt(e.target.value) || 1492 })} min={576} max={9000} />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">MRU</Label>
                      <Input type="number" value={profileForm.mru} onChange={(e) => setProfileForm({ ...profileForm, mru: parseInt(e.target.value) || 1492 })} min={576} max={9000} />
                    </div>
                  </div>

                  <Separator />

                  {/* IP Pool */}
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <HardDrive className="h-4 w-4 text-[#DC2626]" />
                      IP Pool Configuration
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Pool Start</Label>
                        <Input value={profileForm.ipPoolStart} onChange={(e) => setProfileForm({ ...profileForm, ipPoolStart: e.target.value })} placeholder="10.0.0.100" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Pool End</Label>
                        <Input value={profileForm.ipPoolEnd} onChange={(e) => setProfileForm({ ...profileForm, ipPoolEnd: e.target.value })} placeholder="10.0.0.254" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Netmask</Label>
                        <Input value={profileForm.ipPoolNetmask} onChange={(e) => setProfileForm({ ...profileForm, ipPoolNetmask: e.target.value })} placeholder="255.255.255.0" />
                      </div>
                    </div>
                  </div>

                  {/* DNS */}
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <Globe className="h-4 w-4 text-[#DC2626]" />
                      DNS Servers
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Primary DNS</Label>
                        <Input value={profileForm.dnsPrimary} onChange={(e) => setProfileForm({ ...profileForm, dnsPrimary: e.target.value })} placeholder="8.8.8.8" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Secondary DNS</Label>
                        <Input value={profileForm.dnsSecondary} onChange={(e) => setProfileForm({ ...profileForm, dnsSecondary: e.target.value })} placeholder="8.8.4.4" />
                      </div>
                    </div>
                  </div>

                  {/* LCP Echo */}
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <Radio className="h-4 w-4 text-[#DC2626]" />
                      LCP Echo Settings
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Echo Interval (s)</Label>
                        <Input type="number" value={profileForm.lcpEchoInterval} onChange={(e) => setProfileForm({ ...profileForm, lcpEchoInterval: parseInt(e.target.value) || 0 })} min={0} />
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Echo Failure Count</Label>
                        <Input type="number" value={profileForm.lcpEchoFailure} onChange={(e) => setProfileForm({ ...profileForm, lcpEchoFailure: parseInt(e.target.value) || 0 })} min={0} />
                      </div>
                    </div>
                  </div>

                  {/* Enable Toggle */}
                  <div className="flex items-center gap-3">
                    <Switch checked={profileForm.enabled} onCheckedChange={(v) => setProfileForm({ ...profileForm, enabled: v })} />
                    <Label className="text-sm font-medium">Enabled</Label>
                  </div>

                  {/* IPv6 Configuration */}
                  {isModuleEnabled("ipv6") && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                          <Globe className="h-4 w-4 text-[#DC2626]" />
                          IPv6 Configuration
                        </h4>
                        <div className="flex items-center gap-3 mb-4">
                          <Switch checked={profileForm.ipv6Enabled} onCheckedChange={(v) => setProfileForm({ ...profileForm, ipv6Enabled: v })} />
                          <Label className="text-sm font-medium">Enable IPv6</Label>
                        </div>
                        {profileForm.ipv6Enabled && (
                          <div className="grid gap-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <Label className="text-sm font-medium mb-1 block">IPv6 Pool Start</Label>
                                <Input value={profileForm.ipv6PoolStart} onChange={(e) => setProfileForm({ ...profileForm, ipv6PoolStart: e.target.value })} placeholder="2001:db8:100::1" />
                              </div>
                              <div>
                                <Label className="text-sm font-medium mb-1 block">IPv6 Pool End</Label>
                                <Input value={profileForm.ipv6PoolEnd} onChange={(e) => setProfileForm({ ...profileForm, ipv6PoolEnd: e.target.value })} placeholder="2001:db8:100::FFFF" />
                              </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <Label className="text-sm font-medium mb-1 block">Prefix Length</Label>
                                <Select value={String(profileForm.ipv6PrefixLength)} onValueChange={(v) => setProfileForm({ ...profileForm, ipv6PrefixLength: parseInt(v) })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="48">48</SelectItem>
                                    <SelectItem value="56">56</SelectItem>
                                    <SelectItem value="60">60</SelectItem>
                                    <SelectItem value="64">64</SelectItem>
                                    <SelectItem value="80">80</SelectItem>
                                    <SelectItem value="96">96</SelectItem>
                                    <SelectItem value="112">112</SelectItem>
                                    <SelectItem value="128">128</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-sm font-medium mb-1 block">Delegation Prefix</Label>
                                <Input value={profileForm.ipv6DelegationPrefix} onChange={(e) => setProfileForm({ ...profileForm, ipv6DelegationPrefix: e.target.value })} placeholder="2001:db8::/48" />
                              </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <Label className="text-sm font-medium mb-1 block">IPv6 DNS Primary</Label>
                                <Input value={profileForm.ipv6DnsPrimary} onChange={(e) => setProfileForm({ ...profileForm, ipv6DnsPrimary: e.target.value })} placeholder="2606:4700:4700::1111" />
                              </div>
                              <div>
                                <Label className="text-sm font-medium mb-1 block">IPv6 DNS Secondary</Label>
                                <Input value={profileForm.ipv6DnsSecondary} onChange={(e) => setProfileForm({ ...profileForm, ipv6DnsSecondary: e.target.value })} placeholder="2001:4860:4860::8888" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setProfileDialogOpen(false); resetProfileForm(); }}>Cancel</Button>
                  <Button
                    className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
                    onClick={handleSaveProfile}
                    disabled={createProfileMutation.isPending || updateProfileMutation.isPending}
                  >
                    {createProfileMutation.isPending || updateProfileMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                    ) : editingProfile ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Profiles Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Name</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Interface</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Auth Type</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Service Name</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">MTU</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">IP Pool</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Max Sessions</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Active</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                          <Server className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No PPPoE profiles found.
                        </TableCell>
                      </TableRow>
                    ) : filteredProfiles.map((profile) => (
                      <TableRow key={profile.id} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Cable className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">{profile.name}</span>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs font-mono">{profile.interface}</Badge></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${AUTH_TYPE_COLORS[profile.authType] || ""}`}>{profile.authType}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{profile.serviceName}</TableCell>
                        <TableCell className="text-xs font-mono hidden md:table-cell">{profile.mtu}</TableCell>
                        <TableCell className="text-xs font-mono hidden lg:table-cell">{profile.ipPoolStart} – {profile.ipPoolEnd}</TableCell>
                        {isModuleEnabled("ipv6") && profile.ipv6Enabled && (
                          <TableCell className="text-xs font-mono hidden lg:table-cell">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Globe className="h-3 w-3 shrink-0" />
                              <span>{profile.ipv6PoolStart} – {profile.ipv6PoolEnd}</span>
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="text-xs font-mono">{profile.maxSessions}</TableCell>
                        <TableCell>
                          {profile.enabled ? (
                            <Badge variant="outline" className="badge-active text-xs"><CheckCircle className="h-3 w-3 mr-0.5" />Active</Badge>
                          ) : (
                            <Badge variant="outline" className="badge-inactive text-xs"><XCircle className="h-3 w-3 mr-0.5" />Disabled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-[60px]">
                              <Progress value={(profile.activeSessions / profile.maxSessions) * 100} className="h-1.5" />
                            </div>
                            <span className="text-xs font-mono tabular-nums">{profile.activeSessions}/{profile.maxSessions}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openProfileDialog(profile)}>
                                    <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit profile</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(profile)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete profile</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Active Sessions ──────────────────────────── */}
        <TabsContent value="sessions" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by username, IP, MAC..." value={sessionSearch} onChange={(e) => { setSessionSearch(e.target.value); setSessionPage(1); }} className="pl-9" />
            </div>
            <Select value={sessionProfileFilter} onValueChange={(v) => { setSessionProfileFilter(v); setSessionPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Profiles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Profiles</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sessionStatusFilter} onValueChange={(v) => { setSessionStatusFilter(v); setSessionPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="TERMINATING">Terminating</SelectItem>
                <SelectItem value="IDLE">Idle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bulk Actions */}
          {selectedSessions.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">{selectedSessions.size} session(s) selected</span>
              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setBulkDisconnectOpen(true)}>
                <WifiOff className="h-3.5 w-3.5 mr-1.5" />
                Disconnect Selected
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedSessions(new Set())}>Clear</Button>
            </div>
          )}

          {/* Sessions Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Active", value: sessionStats.active, color: "text-emerald-600", icon: Wifi },
              { label: "Terminating", value: sessionStats.terminating, color: "text-amber-600", icon: Loader2 },
              { label: "Idle", value: sessionStats.idle, color: "text-slate-500", icon: Monitor },
              { label: "Total Download", value: formatBytes(sessionStats.totalDownload), color: "text-blue-600", icon: ArrowDownToLine },
              { label: "Total Upload", value: formatBytes(sessionStats.totalUpload), color: "text-orange-600", icon: ArrowUpFromLine },
            ].map((item) => (
              <Card key={item.label} className="border shadow-sm p-3">
                <div className="flex items-center gap-2">
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">{item.label}</p>
                    <p className={`text-sm font-bold ${item.color} tabular-nums`}>{item.value}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Sessions Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[480px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox checked={sessions.length > 0 && selectedSessions.size === sessions.length} onCheckedChange={toggleSelectAll} />
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase">Username</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">IP Address</TableHead>
                      {isModuleEnabled("ipv6") && (
                        <TableHead className="text-xs hidden md:table-cell">IPv6 Address</TableHead>
                      )}
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">MAC</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden xl:table-cell">Interface</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Profile</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Start Time</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Duration</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">DL</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">UL</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden xl:table-cell">DL Speed</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden xl:table-cell">UL Speed</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessionsLoading ? (
                      <TableRow>
                        <TableCell colSpan={isModuleEnabled("ipv6") ? 15 : 14} className="text-center py-8">
                          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                          <span className="text-sm text-muted-foreground">Loading sessions...</span>
                        </TableCell>
                      </TableRow>
                    ) : sessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isModuleEnabled("ipv6") ? 15 : 14} className="text-center py-12 text-muted-foreground">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No active sessions found.
                        </TableCell>
                      </TableRow>
                    ) : sessions.map((session) => (
                      <TableRow key={session.id} className={`hover:bg-muted/50 transition-colors duration-150 ${session.status === "ACTIVE" ? "border-l-[3px] border-l-emerald-500" : session.status === "TERMINATING" ? "border-l-[3px] border-l-amber-500" : "border-l-[3px] border-l-slate-300"}`}>
                        <TableCell>
                          <Checkbox checked={selectedSessions.has(session.id)} onCheckedChange={() => toggleSelectSession(session.id)} />
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="text-sm font-medium font-mono truncate">{session.username}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell"><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{session.ipAddress}</code></TableCell>
                        {isModuleEnabled("ipv6") && (
                          <TableCell className="hidden md:table-cell font-mono text-xs">
                            {session.ipv6Address || "—"}
                          </TableCell>
                        )}
                        <TableCell className="hidden lg:table-cell"><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{session.macAddress}</code></TableCell>
                        <TableCell className="hidden xl:table-cell"><Badge variant="outline" className="text-xs font-mono">{session.interfaceName}</Badge></TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{session.profileName}</TableCell>
                        <TableCell>{getStatusBadge(session.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">{formatTimestamp(session.startTime)}</TableCell>
                        <TableCell className="text-xs font-mono tabular-nums whitespace-nowrap">{formatDuration(session.startTime)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                          <div className="flex items-center gap-1"><ArrowDownToLine className="h-3 w-3 text-blue-500" />{formatBytes(session.downloadBytes)}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                          <div className="flex items-center gap-1"><ArrowUpFromLine className="h-3 w-3 text-orange-500" />{formatBytes(session.uploadBytes)}</div>
                        </TableCell>
                        <TableCell className="text-xs font-mono tabular-nums hidden xl:table-cell text-emerald-600">{formatBps(session.currentDlBps)}</TableCell>
                        <TableCell className="text-xs font-mono tabular-nums hidden xl:table-cell text-orange-600">{formatBps(session.currentUlBps)}</TableCell>
                        <TableCell className="text-right">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDisconnectTarget(session)}>
                                  <WifiOff className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Disconnect session</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Pagination */}
          {sessionsData && sessionsData.total > 20 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {((sessionPage - 1) * 20) + 1}–{Math.min(sessionPage * 20, sessionsData.total)} of {sessionsData.total}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={sessionPage <= 1} onClick={() => setSessionPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={sessionPage * 20 >= sessionsData.total} onClick={() => setSessionPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Auto-refreshing every 10 seconds
          </p>
        </TabsContent>

        {/* ─── Tab 3: Real-Time Bandwidth ─────────────────────── */}
        <TabsContent value="bandwidth" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border shadow-sm p-4 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10"><ArrowDownToLine className="h-5 w-5 text-emerald-600" /></div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Total Download</p>
                  <p className="text-lg font-bold text-emerald-600 tabular-nums">{formatBps(bwSummary.totalDownloadBps)}</p>
                </div>
              </div>
            </Card>
            <Card className="border shadow-sm p-4 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-background">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10"><ArrowUpFromLine className="h-5 w-5 text-orange-600" /></div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Total Upload</p>
                  <p className="text-lg font-bold text-orange-600 tabular-nums">{formatBps(bwSummary.totalUploadBps)}</p>
                </div>
              </div>
            </Card>
            <Card className="border shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10"><Download className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Total DL Volume</p>
                  <p className="text-lg font-bold text-blue-600 tabular-nums">{formatBytes(bwSummary.totalDownloadBytes)}</p>
                </div>
              </div>
            </Card>
            <Card className="border shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10"><BarChart3 className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Active Sessions</p>
                  <p className="text-lg font-bold tabular-nums">{bwEntries.length}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Top Consumers */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#DC2626]" />
                Top Bandwidth Consumers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bwLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : topConsumers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No active bandwidth data</p>
              ) : topConsumers.map((entry, idx) => (
                <div key={entry.sessionId} className="space-y-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-200 text-slate-600" : idx === 2 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground"}`}>{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium font-mono truncate">{entry.username}</p>
                        <p className="text-[10px] text-muted-foreground">{entry.ipAddress} · {entry.profileName}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-bold font-mono tabular-nums">{formatBps(entry.downloadBps + entry.uploadBps)}</p>
                      <p className="text-[10px] text-muted-foreground">Total: {formatBytes(entry.totalDownload + entry.totalUpload)}</p>
                    </div>
                  </div>
                  <BandwidthBar label="Download" value={entry.downloadBps} max={maxBwEntry} color="text-emerald-500" icon={ArrowDownToLine} />
                  <BandwidthBar label="Upload" value={entry.uploadBps} max={maxBwEntry} color="text-orange-500" icon={ArrowUpFromLine} />
                </div>
              ))}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Auto-refreshing every 3 seconds
          </p>
        </TabsContent>

        {/* ─── Tab 4: Server Configuration ────────────────────── */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* General Settings */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Settings className="h-4 w-4 text-[#DC2626]" />
                  General Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Default Interface</Label>
                    <Input value={serverConfig.defaultInterface} onChange={(e) => setServerConfig({ ...serverConfig, defaultInterface: e.target.value })} placeholder="eth0" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Global Max Sessions</Label>
                    <Input type="number" value={serverConfig.maxSessionsGlobal} onChange={(e) => setServerConfig({ ...serverConfig, maxSessionsGlobal: parseInt(e.target.value) || 0 })} min={1} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Default MTU</Label>
                    <Input type="number" value={serverConfig.defaultMtu} onChange={(e) => setServerConfig({ ...serverConfig, defaultMtu: parseInt(e.target.value) || 1492 })} min={576} max={9000} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Default MRU</Label>
                    <Input type="number" value={serverConfig.defaultMru} onChange={(e) => setServerConfig({ ...serverConfig, defaultMru: parseInt(e.target.value) || 1492 })} min={576} max={9000} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Session Timeout (s)</Label>
                    <Input type="number" value={serverConfig.sessionTimeoutDefault} onChange={(e) => setServerConfig({ ...serverConfig, sessionTimeoutDefault: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Idle Timeout (s)</Label>
                    <Input type="number" value={serverConfig.idleTimeoutDefault} onChange={(e) => setServerConfig({ ...serverConfig, idleTimeoutDefault: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* DNS & WINS */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Globe className="h-4 w-4 text-[#DC2626]" />
                  DNS & WINS Servers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1 block">Primary DNS</Label>
                  <Input value={serverConfig.defaultDnsPrimary} onChange={(e) => setServerConfig({ ...serverConfig, defaultDnsPrimary: e.target.value })} placeholder="8.8.8.8" />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Secondary DNS</Label>
                  <Input value={serverConfig.defaultDnsSecondary} onChange={(e) => setServerConfig({ ...serverConfig, defaultDnsSecondary: e.target.value })} placeholder="8.8.4.4" />
                </div>
                <Separator />
                <div>
                  <Label className="text-sm font-medium mb-1 block">Primary WINS</Label>
                  <Input value={serverConfig.defaultWinsPrimary} onChange={(e) => setServerConfig({ ...serverConfig, defaultWinsPrimary: e.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Secondary WINS</Label>
                  <Input value={serverConfig.defaultWinsSecondary} onChange={(e) => setServerConfig({ ...serverConfig, defaultWinsSecondary: e.target.value })} placeholder="Optional" />
                </div>
              </CardContent>
            </Card>

            {/* LCP Echo */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Radio className="h-4 w-4 text-[#DC2626]" />
                  LCP Echo Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1 block">LCP Echo Interval (s)</Label>
                  <Input type="number" value={serverConfig.lcpEchoInterval} onChange={(e) => setServerConfig({ ...serverConfig, lcpEchoInterval: parseInt(e.target.value) || 0 })} min={0} />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Send LCP echo requests at this interval. 0 = disabled.</p>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">LCP Echo Failure Count</Label>
                  <Input type="number" value={serverConfig.lcpEchoFailure} onChange={(e) => setServerConfig({ ...serverConfig, lcpEchoFailure: parseInt(e.target.value) || 0 })} min={0} />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Disconnect after this many consecutive failures. 0 = disabled.</p>
                </div>
              </CardContent>
            </Card>

            {/* PPPoE Listening Interfaces */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Network className="h-4 w-4 text-[#DC2626]" />
                  PPPoE Listening Interfaces
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input value={newInterfaceInput} onChange={(e) => setNewInterfaceInput(e.target.value)} placeholder="e.g. eth0, vlan100" className="flex-1" onKeyDown={(e) => e.key === "Enter" && addListeningInterface()} />
                  <Button variant="outline" onClick={addListeningInterface}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {serverConfig.pppoeListeningInterfaces.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No interfaces configured</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {serverConfig.pppoeListeningInterfaces.map((iface) => (
                      <Badge key={iface} variant="outline" className="text-xs font-mono px-3 py-1.5 gap-1.5">
                        <Network className="h-3 w-3" />
                        {iface}
                        <button className="ml-1 hover:text-red-500 transition-colors" onClick={() => removeListeningInterface(iface)}>
                          <XCircle className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["pppoe-config"] })}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload
            </Button>
            <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => saveConfigMutation.mutate(serverConfig)} disabled={saveConfigMutation.isPending}>
              {saveConfigMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Shield className="h-4 w-4 mr-2" />Save Configuration</>}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete Profile Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete PPPoE Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will affect {deleteTarget?.activeSessions || 0} active session(s).
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteProfileMutation.mutate(deleteTarget.id)}
              disabled={deleteProfileMutation.isPending}
            >
              {deleteProfileMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disconnect Session Confirmation */}
      <AlertDialog open={!!disconnectTarget} onOpenChange={(o) => !o && setDisconnectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect <strong>{disconnectTarget?.username}</strong> ({disconnectTarget?.ipAddress})? The user will need to reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => disconnectTarget && disconnectSessionMutation.mutate(disconnectTarget.id)}
              disabled={disconnectSessionMutation.isPending}
            >
              {disconnectSessionMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Disconnecting...</> : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Disconnect Confirmation */}
      <AlertDialog open={bulkDisconnectOpen} onOpenChange={setBulkDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Disconnect Sessions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect <strong>{selectedSessions.size}</strong> session(s)? All selected users will need to reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => bulkDisconnectMutation.mutate(Array.from(selectedSessions))}
              disabled={bulkDisconnectMutation.isPending}
            >
              {bulkDisconnectMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Disconnecting...</> : `Disconnect ${selectedSessions.size} Sessions`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
