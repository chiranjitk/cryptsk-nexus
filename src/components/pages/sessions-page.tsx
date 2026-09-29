"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Monitor, Users, ShieldAlert, Lock, Clock, Smartphone, Trash2,
  RefreshCw, Settings, AlertTriangle, Search, Loader2, Eye,
  ChevronLeft, ChevronRight, Download, Zap, Globe, KeyRound, Shield,
  Unlock, UserLock, Ban, Info, ArrowDownToLine, ArrowUpFromLine, Wifi,
  History,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { useModuleStore } from "@/store/module-store";

// ─── Types ──────────────────────────────────────────────────────
interface Session {
  id: string;
  userId: string;
  userName: string;
  role: string;
  email: string;
  ip: string;
  macAddress: string;
  userAgent: string;
  device: string;
  browser: string;
  os: string;
  location: string;
  loginTime: string;
  logoutTime: string | null;
  lastActivity: string;
  duration: number;
  downloadBytes: number;
  uploadBytes: number;
  status: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userName: string;
  timestamp: string;
  details: string;
}

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

interface Stats {
  active: number;
  today: number;
  week: number;
  locked: number;
  suspicious: number;
  failedAttempts: number;
}

interface SessionsResponse {
  activeSessions: Session[];
  sessionsPagination: Pagination;
  loginHistory: Session[];
  historyPagination: Pagination;
  stats: Stats;
}

// ─── RADIUS Session Types ──────────────────────────────────────
interface RadiusSession {
  id: string;
  sessionId: string;
  radiusUserId: string;
  username: string;
  subscriberName: string | null;
  subscriberCode: string | null;
  nasIp: string;
  nasPort: string;
  framedIp: string;
  callingStationId: string;
  inputOctets: string;
  outputOctets: string;
  inputOctetsFormatted: string;
  outputOctetsFormatted: string;
  totalOctetsFormatted: string;
  startTime: string | null;
  stopTime: string | null;
  lastUpdate: string | null;
  terminateCause: string;
  acctSessionTime: number;
  duration: number;
  durationFormatted: string;
  isActive: boolean;
}

interface RadiusSessionsResponse {
  sessions: RadiusSession[];
  pagination: Pagination;
  stats: {
    activeSessions: number;
    totalSessions: number;
    totalDownloadBytes: string;
    totalUploadBytes: string;
    totalDownloadFormatted: string;
    totalUploadFormatted: string;
  };
}

// ─── Helpers ────────────────────────────────────────────────────
function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toISOString().split("T")[0],
    time: d.toTimeString().split(" ")[0].substring(0, 8),
  };
}

function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "< 1m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function mapStatus(rawStatus: string): "Active" | "Idle" | "Inactive" | "Failed" | "Locked" {
  if (rawStatus === "active") return "Active";
  if (rawStatus === "idle") return "Idle";
  if (rawStatus === "failed") return "Failed";
  if (rawStatus === "locked") return "Locked";
  return "Inactive";
}

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function getLastWeekStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

function getStatusBadge(status: "Active" | "Idle" | "Inactive" | "Failed" | "Locked", isHistory: boolean) {
  if (isHistory) {
    if (status === "Failed") {
      return <Badge variant="destructive" className="bg-red-500 border-0">Failed</Badge>;
    }
    return <Badge className="bg-green-500 text-white border-0">Success</Badge>;
  }
  switch (status) {
    case "Active":
      return <Badge className="bg-green-500 text-white border-0"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white mr-1.5 animate-pulse" />Active</Badge>;
    case "Idle":
      return <Badge className="bg-amber-500 text-white border-0"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white/80 mr-1.5" />Idle</Badge>;
    case "Locked":
      return <Badge className="bg-red-600 text-white border-0"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white mr-1.5" />Locked</Badge>;
    case "Inactive":
      return <Badge variant="secondary">Inactive</Badge>;
    case "Failed":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ─── Component ──────────────────────────────────────────────────
export default function SessionsPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  const [activeTab, setActiveTab] = useState("sessions");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sessionPage, setSessionPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(getLastWeekStr());
  const [dateTo, setDateTo] = useState(getTodayStr());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [terminateTarget, setTerminateTarget] = useState<Session | null>(null);
  const [detailTarget, setDetailTarget] = useState<Session | null>(null);

  // Fetch session audit log entries
  const { data: sessionAuditData } = useQuery<{ entries: AuditLogEntry[] }>({
    queryKey: ["session-audit", detailTarget?.userId],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("entityType", "UserSession");
      params.set("entityId", detailTarget!.userId);
      params.set("limit", "20");
      return apiFetch<{ entries: AuditLogEntry[] }>(`/api/audit-log/entity/${"UserSession"}?${params.toString()}`).catch(() => ({ entries: [] }));
    },
    enabled: !!detailTarget,
    staleTime: 10000,
  });
  const sessionAudit = sessionAuditData?.entries || [];
  const [terminateAllOpen, setTerminateAllOpen] = useState(false);
  const [lockTarget, setLockTarget] = useState<Session | null>(null);
  const [exporting, setExporting] = useState(false);
  const prevTabRef = useRef(activeTab);

  // RADIUS sessions state
  const [radiusSearch, setRadiusSearch] = useState("");
  const [radiusPage, setRadiusPage] = useState(1);
  const [radiusDetailTarget, setRadiusDetailTarget] = useState<RadiusSession | null>(null);
  const [radiusDisconnectTarget, setRadiusDisconnectTarget] = useState<RadiusSession | null>(null);

  const [settings, setSettings] = useState({
    maxDuration: "8",
    idleTimeout: "30",
    maxConcurrent: "2",
    lockAfterFailures: "5",
    twoFactorRequired: false,
    ipWhitelist: "",
  });

  const [passwordPolicy, setPasswordPolicy] = useState({
    minLength: "8",
    requireUppercase: false,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecial: false,
    expiryDays: "90",
  });

  const [bruteForce, setBruteForce] = useState({
    maxLoginAttempts: "5",
    lockoutDurationMinutes: "30",
    captchaAfterAttempts: "3",
  });

  if (activeTab !== prevTabRef.current) {
    prevTabRef.current = activeTab;
  }

  // Fetch sessions data
  const { data, isLoading, isFetching } = useQuery<SessionsResponse>({
    queryKey: ["sessions", activeTab, search, statusFilter, sessionPage, historyPage, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("tab", activeTab);
      if (search) params.set("search", search);
      if (statusFilter !== "All") params.set("status", statusFilter);
      if (activeTab === "sessions") {
        params.set("page", String(sessionPage));
        params.set("limit", "10");
      }
      if (activeTab === "history") {
        params.set("historyPage", String(historyPage));
        params.set("historyLimit", "10");
      }
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      return apiFetch<SessionsResponse>(`/api/sessions?${params.toString()}`);
    },
    refetchInterval: activeTab === "sessions" ? 30000 : false,
  });

  // Fetch RADIUS sessions data
  const { data: radiusData, isLoading: radiusLoading, isFetching: radiusFetching } = useQuery<RadiusSessionsResponse>({
    queryKey: ["radius-sessions", radiusSearch, radiusPage, activeTab === "radius"],
    queryFn: () => {
      const params = new URLSearchParams();
      if (radiusSearch) params.set("search", radiusSearch);
      params.set("page", String(radiusPage));
      params.set("limit", "20");
      return apiFetch<RadiusSessionsResponse>(`/api/radius/sessions?${params.toString()}`);
    },
    enabled: activeTab === "radius",
    refetchInterval: activeTab === "radius" ? 30000 : false,
  });

  const radiusSessions = radiusData?.sessions || [];
  const radiusPages = radiusData?.pagination || { page: 1, totalPages: 1, total: 0 };
  const radiusStats = radiusData?.stats || { activeSessions: 0, totalSessions: 0, totalDownloadFormatted: "0 B", totalUploadFormatted: "0 B" };

  // Disconnect RADIUS session mutation
  const disconnectRadiusMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch("/api/radius/sessions", {
        method: "POST",
        body: JSON.stringify({ action: "disconnect", sessionId }),
      }),
    onSuccess: () => {
      toast.success("RADIUS session disconnected");
      setRadiusDisconnectTarget(null);
      setRadiusDetailTarget(null);
      queryClient.invalidateQueries({ queryKey: ["radius-sessions"] });
    },
    onError: () => {
      toast.error("Failed to disconnect RADIUS session");
    },
  });

  // Load ISP settings
  const { data: ispData } = useQuery({
    queryKey: ["isp-profile"],
    queryFn: () => apiFetch("/api/settings/isp-profile").catch(() => null),
    staleTime: 5 * 60 * 1000,
  });

  // Sync settings when ISP data loads
  const s = ispData?.ispSettings || ispData?.settings || {};
  if (s.sessionTimeout && settings.maxDuration !== String(s.sessionTimeout)) {
    setSettings((prev) => ({ ...prev, maxDuration: String(s.sessionTimeout) }));
  }
  if (s.idleTimeout && settings.idleTimeout !== String(s.idleTimeout)) {
    setSettings((prev) => ({ ...prev, idleTimeout: String(s.idleTimeout) }));
  }
  if (s.passwordMinLength !== undefined && passwordPolicy.minLength !== String(s.passwordMinLength)) {
    setPasswordPolicy((prev) => ({ ...prev, minLength: String(s.passwordMinLength) }));
  }
  if (s.passwordRequireUppercase !== undefined && passwordPolicy.requireUppercase !== s.passwordRequireUppercase) {
    setPasswordPolicy((prev) => ({ ...prev, requireUppercase: s.passwordRequireUppercase }));
  }
  if (s.passwordRequireLowercase !== undefined && passwordPolicy.requireLowercase !== s.passwordRequireLowercase) {
    setPasswordPolicy((prev) => ({ ...prev, requireLowercase: s.passwordRequireLowercase }));
  }
  if (s.passwordRequireNumbers !== undefined && passwordPolicy.requireNumbers !== s.passwordRequireNumbers) {
    setPasswordPolicy((prev) => ({ ...prev, requireNumbers: s.passwordRequireNumbers }));
  }
  if (s.passwordRequireSpecial !== undefined && passwordPolicy.requireSpecial !== s.passwordRequireSpecial) {
    setPasswordPolicy((prev) => ({ ...prev, requireSpecial: s.passwordRequireSpecial }));
  }
  if (s.passwordExpiryDays !== undefined && passwordPolicy.expiryDays !== String(s.passwordExpiryDays)) {
    setPasswordPolicy((prev) => ({ ...prev, expiryDays: String(s.passwordExpiryDays) }));
  }
  if (s.maxLoginAttempts !== undefined && bruteForce.maxLoginAttempts !== String(s.maxLoginAttempts)) {
    setBruteForce((prev) => ({ ...prev, maxLoginAttempts: String(s.maxLoginAttempts) }));
  }
  if (s.lockoutDurationMinutes !== undefined && bruteForce.lockoutDurationMinutes !== String(s.lockoutDurationMinutes)) {
    setBruteForce((prev) => ({ ...prev, lockoutDurationMinutes: String(s.lockoutDurationMinutes) }));
  }
  if (s.captchaAfterAttempts !== undefined && bruteForce.captchaAfterAttempts !== String(s.captchaAfterAttempts)) {
    setBruteForce((prev) => ({ ...prev, captchaAfterAttempts: String(s.captchaAfterAttempts) }));
  }

  // Terminate session mutation
  const terminateMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ action: "terminate", sessionId }),
      }),
    onSuccess: () => {
      toast.success("Session terminated");
      setTerminateTarget(null);
      setDetailTarget(null);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: () => {
      toast.error("Failed to terminate session");
    },
  });

  // Lock user mutation
  const lockUserMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ action: "lock-user", targetUserId }),
      }),
    onSuccess: () => {
      toast.success("User account locked. All active sessions terminated.");
      setLockTarget(null);
      setDetailTarget(null);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: () => {
      toast.error("Failed to lock user account");
    },
  });

  // Unlock user mutation
  const unlockUserMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ action: "unlock-user", targetUserId }),
      }),
    onSuccess: () => {
      toast.success("User account unlocked");
      setLockTarget(null);
      setDetailTarget(null);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: () => {
      toast.error("Failed to unlock user account");
    },
  });

  // Terminate all suspicious mutation
  const terminateAllMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean; message: string; terminated: number }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ action: "terminate-all-suspicious" }),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setTerminateAllOpen(false);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: () => {
      toast.error("Failed to terminate suspicious sessions");
    },
  });

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/api/settings/isp-profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Session & security settings saved");
      setSettingsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["isp-profile"] });
    },
    onError: () => {
      toast.error("Failed to save settings");
    },
  });

  const stats = data?.stats || { active: 0, today: 0, week: 0, locked: 0, suspicious: 0, failedAttempts: 0 };
  const sessions = data?.activeSessions || [];
  const history = data?.loginHistory || [];
  const sessionPages = data?.sessionsPagination || { page: 1, totalPages: 1, total: 0 };
  const historyPages = data?.historyPagination || { page: 1, totalPages: 1, total: 0 };

  const handleSaveSettings = () => {
    setSettingsSaving(true);
    saveSettingsMutation.mutate(
      {
        sessionTimeout: parseInt(settings.maxDuration) || 8,
        idleTimeout: parseInt(settings.idleTimeout) || 30,
        maxConcurrentSessions: parseInt(settings.maxConcurrent) || 2,
        lockAfterFailures: parseInt(settings.lockAfterFailures) || 5,
        twoFactorRequired: settings.twoFactorRequired,
        ipWhitelist: settings.ipWhitelist,
        passwordMinLength: parseInt(passwordPolicy.minLength) || 8,
        passwordRequireUppercase: passwordPolicy.requireUppercase,
        passwordRequireLowercase: passwordPolicy.requireLowercase,
        passwordRequireNumbers: passwordPolicy.requireNumbers,
        passwordRequireSpecial: passwordPolicy.requireSpecial,
        passwordExpiryDays: parseInt(passwordPolicy.expiryDays) || 90,
        maxLoginAttempts: parseInt(bruteForce.maxLoginAttempts) || 5,
        lockoutDurationMinutes: parseInt(bruteForce.lockoutDurationMinutes) || 30,
        captchaAfterAttempts: parseInt(bruteForce.captchaAfterAttempts) || 3,
      },
      { onSettled: () => setSettingsSaving(false) },
    );
  };

  const handleExport = useCallback(async (type: "active" | "history") => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("type", type);
      if (search) params.set("search", search);
      if (type === "history" && dateFrom) params.set("dateFrom", dateFrom);
      if (type === "history" && dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/sessions/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type === "active" ? "active-sessions" : "login-history"}-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${type === "active" ? "active sessions" : "login history"} as CSV`);
    } catch {
      toast.error("Failed to export CSV");
    } finally {
      setExporting(false);
    }
  }, [search, dateFrom, dateTo]);

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sessions & Security</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor active sessions and login activity</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["sessions"] })} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: "Active Sessions", value: stats.active, icon: Monitor, gradient: "from-green-500 to-green-700" },
          { label: "Today's Logins", value: stats.today, icon: Users, gradient: "from-teal-500 to-teal-700" },
          { label: "This Week", value: stats.week, icon: Clock, gradient: "from-emerald-500 to-emerald-700" },
          { label: "Failed Attempts", value: stats.failedAttempts, icon: ShieldAlert, gradient: "from-red-500 to-red-700" },
          { label: "Locked Accounts", value: stats.locked, icon: Lock, gradient: "from-amber-500 to-amber-700" },
          { label: "Suspicious IPs", value: stats.suspicious, icon: AlertTriangle, gradient: "from-orange-500 to-orange-700" },
        ].map((item) => (
          <Card key={item.label} className="border-0 shadow-md overflow-hidden animate-card-enter" style={{ animationDelay: `${["0ms","60ms","120ms","180ms","240ms","300ms"][["Active Sessions","Today's Logins","This Week","Failed Attempts","Locked Accounts","Suspicious IPs"].indexOf(item.label)] || "0ms"}` }}>
            <div className={`bg-gradient-to-br ${item.gradient} p-4 rounded-xl`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-xs font-medium">{item.label}</p>
                  <p className="text-white text-2xl font-bold mt-1">{item.value}</p>
                </div>
                <item.icon className="h-8 w-8 text-white/30" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="skeleton-wave h-10 w-full max-w-3xl" />
          <Card className="border">
            <CardContent className="p-6">
              <Skeleton className="skeleton-wave h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => {
          setActiveTab(v);
          if (v === "sessions") setSessionPage(1);
          if (v === "history") setHistoryPage(1);
        }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <TabsList className="bg-muted">
              <TabsTrigger value="sessions" className="gap-1.5">
                <Monitor className="h-3.5 w-3.5" />
                Active Sessions ({stats.active})
              </TabsTrigger>
              <TabsTrigger value="radius" className="gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                RADIUS Sessions
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Login History
              </TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleExport(activeTab === "sessions" ? "active" : "history")} disabled={exporting}>
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
              {stats.suspicious > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setTerminateAllOpen(true)}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Terminate All Suspicious</span>
                </Button>
              )}
            </div>
          </div>

          {/* Active Sessions Tab */}
          <TabsContent value="sessions" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by user, email, IP, or browser..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setSessionPage(1); }}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSessionPage(1); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="idle">Idle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">User</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">IP Address</th>
                        <th className="text-left p-3 font-medium hidden lg:table-cell">Browser / Device</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">Location</th>
                        <th className="text-left p-3 font-medium">Login Time</th>
                        <th className="text-left p-3 font-medium hidden lg:table-cell">Duration</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-muted-foreground">
                            <Monitor className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            No active sessions found
                          </td>
                        </tr>
                      ) : sessions.map((session) => {
                        const status = mapStatus(session.status);
                        const { date, time } = formatDateTime(session.loginTime);
                        return (
                          <tr
                            key={session.id}
                            className="border-b hover:bg-red-50/40 dark:hover:bg-red-950/10 transition-all duration-200 cursor-pointer group"
                            onClick={() => setDetailTarget(session)}
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-[#DC2626]/10 flex items-center justify-center text-xs font-bold text-[#DC2626] shrink-0">
                                  {session.userName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{session.userName}</p>
                                  <p className="text-xs text-muted-foreground truncate">{session.role}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 hidden md:table-cell">
                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{session.ip || "—"}</code>
                            </td>
                            <td className="p-3 hidden lg:table-cell">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground text-xs truncate max-w-[180px]">{session.browser} on {session.device}</span>
                              </div>
                            </td>
                            <td className="p-3 hidden md:table-cell">
                              <div className="flex items-center gap-1.5">
                                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground text-xs">{session.location || "—"}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{date} {time}</td>
                            <td className="p-3 text-muted-foreground text-xs whitespace-nowrap hidden lg:table-cell">
                              <span className="font-mono tabular-nums">{session.duration > 0 ? formatDuration(session.duration) : "—"}</span>
                            </td>
                            <td className="p-3">{getStatusBadge(status, false)}</td>
                            <td className="p-3">
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDetailTarget(session)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {(status === "Active" || status === "Idle") && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setTerminateTarget(session)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                                    End
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Pagination - Active Sessions */}
            {sessionPages.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {((sessionPages.page - 1) * 10) + 1}–{Math.min(sessionPages.page * 10, sessionPages.total)} of {sessionPages.total}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={sessionPages.page <= 1} onClick={() => setSessionPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {(() => {
                    const pages: number[] = [];
                    const total = sessionPages.totalPages;
                    const current = sessionPages.page;
                    let start = Math.max(1, current - 2);
                    let end = Math.min(total, start + 4);
                    if (end - start < 4) start = Math.max(1, end - 4);
                    for (let i = start; i <= end; i++) pages.push(i);
                    return pages.map((p) => (
                      <Button key={p} variant={p === current ? "default" : "outline"} size="sm" className="h-8 w-8 text-xs" onClick={() => setSessionPage(p)}>{p}</Button>
                    ));
                  })()}
                  <Button variant="outline" size="sm" disabled={sessionPages.page >= sessionPages.totalPages} onClick={() => setSessionPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "sessions" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Auto-refreshing every 30 seconds
              </p>
            )}
          </TabsContent>

          {/* RADIUS Sessions Tab */}
          <TabsContent value="radius" className="space-y-4">
            {/* RADIUS Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-0 shadow-md overflow-hidden animate-card-enter" style={{ animationDelay: "0ms" }}>
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-3 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/80 text-xs font-medium">Active RADIUS</p>
                      <p className="text-white text-xl font-bold mt-1">{radiusStats.activeSessions}</p>
                    </div>
                    <Wifi className="h-6 w-6 text-white/30" />
                  </div>
                </div>
              </Card>
              <Card className="border-0 shadow-md overflow-hidden animate-card-enter" style={{ animationDelay: "60ms" }}>
                <div className="bg-gradient-to-br from-slate-500 to-slate-700 p-3 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/80 text-xs font-medium">Total Sessions</p>
                      <p className="text-white text-xl font-bold mt-1">{radiusStats.totalSessions}</p>
                    </div>
                    <Users className="h-6 w-6 text-white/30" />
                  </div>
                </div>
              </Card>
              <Card className="border-0 shadow-md overflow-hidden animate-card-enter" style={{ animationDelay: "120ms" }}>
                <div className="bg-gradient-to-br from-rose-500 to-rose-700 p-3 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/80 text-xs font-medium">Total Download</p>
                      <p className="text-white text-xl font-bold mt-1">{radiusStats.totalDownloadFormatted}</p>
                    </div>
                    <ArrowDownToLine className="h-6 w-6 text-white/30" />
                  </div>
                </div>
              </Card>
              <Card className="border-0 shadow-md overflow-hidden animate-card-enter" style={{ animationDelay: "180ms" }}>
                <div className="bg-gradient-to-br from-orange-500 to-orange-700 p-3 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/80 text-xs font-medium">Total Upload</p>
                      <p className="text-white text-xl font-bold mt-1">{radiusStats.totalUploadFormatted}</p>
                    </div>
                    <ArrowUpFromLine className="h-6 w-6 text-white/30" />
                  </div>
                </div>
              </Card>
            </div>

            {/* Search */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by username, subscriber, IP, MAC, or NAS IP..."
                  value={radiusSearch}
                  onChange={(e) => { setRadiusSearch(e.target.value); setRadiusPage(1); }}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["radius-sessions"] })}
                disabled={radiusFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${radiusFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* RADIUS Sessions Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Username</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">Framed IP</th>
                        {isModuleEnabled("ipv6") && (
                          <th className="text-left p-3 font-medium hidden lg:table-cell">IPv6 Address</th>
                        )}
                        <th className="text-left p-3 font-medium hidden lg:table-cell">MAC Address</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">NAS IP</th>
                        <th className="text-left p-3 font-medium hidden xl:table-cell">Start Time</th>
                        <th className="text-left p-3 font-medium">Duration</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {radiusLoading ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-muted-foreground">
                            <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                            Loading RADIUS sessions...
                          </td>
                        </tr>
                      ) : radiusSessions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-muted-foreground">
                            <Wifi className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            No RADIUS sessions found
                          </td>
                        </tr>
                      ) : radiusSessions.map((rs) => (
                        <tr
                          key={rs.id}
                          className="border-b hover:bg-red-50/40 dark:hover:bg-red-950/10 transition-all duration-200 cursor-pointer group"
                          onClick={() => setRadiusDetailTarget(rs)}
                        >
                          <td className="p-3">
                            <div className="min-w-0">
                              <p className="font-medium truncate font-mono text-xs">{rs.username}</p>
                              {rs.subscriberName && (
                                <p className="text-xs text-muted-foreground truncate">{rs.subscriberName}</p>
                              )}
                            </div>
                          </td>
                          <td className="p-3 hidden md:table-cell">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{rs.framedIp || "—"}</code>
                          </td>
                          {isModuleEnabled("ipv6") && (
                            <td className="p-3 hidden lg:table-cell font-mono text-xs">
                              {(rs as any).framedIpv6 || "—"}
                            </td>
                          )}
                          <td className="p-3 hidden lg:table-cell">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{rs.callingStationId || "—"}</code>
                          </td>
                          <td className="p-3 hidden md:table-cell">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{rs.nasIp || "—"}</code>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs whitespace-nowrap hidden xl:table-cell">
                            {rs.startTime ? formatSessionTime(rs.startTime) : "—"}
                          </td>
                          <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                            {rs.isActive ? rs.durationFormatted : (rs.stopTime ? rs.durationFormatted : "—")}
                          </td>
                          <td className="p-3">
                            {rs.isActive ? (
                              <Badge className="bg-green-500 text-white border-0">Online</Badge>
                            ) : (
                              <Badge variant="secondary">Offline</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRadiusDetailTarget(rs)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {rs.isActive && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setRadiusDisconnectTarget(rs)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Kill
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Pagination - RADIUS */}
            {radiusPages.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {((radiusPages.page - 1) * 20) + 1}–{Math.min(radiusPages.page * 20, radiusPages.total)} of {radiusPages.total}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={radiusPages.page <= 1} onClick={() => setRadiusPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {(() => {
                    const pages: number[] = [];
                    const total = radiusPages.totalPages;
                    const current = radiusPages.page;
                    let start = Math.max(1, current - 2);
                    let end = Math.min(total, start + 4);
                    if (end - start < 4) start = Math.max(1, end - 4);
                    for (let i = start; i <= end; i++) pages.push(i);
                    return pages.map((p) => (
                      <Button key={p} variant={p === current ? "default" : "outline"} size="sm" className="h-8 w-8 text-xs" onClick={() => setRadiusPage(p)}>{p}</Button>
                    ));
                  })()}
                  <Button variant="outline" size="sm" disabled={radiusPages.page >= radiusPages.totalPages} onClick={() => setRadiusPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "radius" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Auto-refreshing every 30 seconds
              </p>
            )}
          </TabsContent>

          {/* Login History Tab */}
          <TabsContent value="history" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by user, email, or IP..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setHistoryPage(1); }}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2 items-center">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">From:</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setHistoryPage(1); }}
                  className="w-[140px] h-9"
                />
                <Label className="text-xs text-muted-foreground whitespace-nowrap">To:</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setHistoryPage(1); }}
                  className="w-[140px] h-9"
                />
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">User</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">IP Address</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">Date & Time</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium hidden lg:table-cell">Browser / Device</th>
                        <th className="text-left p-3 font-medium hidden lg:table-cell">Location</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-muted-foreground">
                            <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
                            No login history found for the selected period
                          </td>
                        </tr>
                      ) : history.map((entry) => {
                        const status = mapStatus(entry.status);
                        const { date, time } = formatDateTime(entry.loginTime);
                        return (
                          <tr
                            key={entry.id}
                            className="border-b hover:bg-red-50/40 dark:hover:bg-red-950/10 transition-all duration-200 cursor-pointer group"
                            onClick={() => setDetailTarget(entry)}
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-[#DC2626]/10 flex items-center justify-center text-xs font-bold text-[#DC2626] shrink-0">
                                  {entry.userName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{entry.userName}</p>
                                  <p className="text-xs text-muted-foreground truncate">{entry.role}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 hidden md:table-cell">
                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{entry.ip || "—"}</code>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs whitespace-nowrap hidden md:table-cell">{date} {time}</td>
                            <td className="p-3">{getStatusBadge(status, true)}</td>
                            <td className="p-3 text-muted-foreground text-xs hidden lg:table-cell">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Smartphone className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate max-w-[160px]">{entry.browser} on {entry.device}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs hidden lg:table-cell">
                              <div className="flex items-center gap-1.5">
                                <Globe className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{entry.location || "—"}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs hidden md:table-cell">
                              {entry.duration > 0 ? formatDuration(entry.duration) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Pagination - History */}
            {historyPages.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {((historyPages.page - 1) * 10) + 1}–{Math.min(historyPages.page * 10, historyPages.total)} of {historyPages.total}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={historyPages.page <= 1} onClick={() => setHistoryPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {(() => {
                    const pages: number[] = [];
                    const total = historyPages.totalPages;
                    const current = historyPages.page;
                    let start = Math.max(1, current - 2);
                    let end = Math.min(total, start + 4);
                    if (end - start < 4) start = Math.max(1, end - 4);
                    for (let i = start; i <= end; i++) pages.push(i);
                    return pages.map((p) => (
                      <Button key={p} variant={p === current ? "default" : "outline"} size="sm" className="h-8 w-8 text-xs" onClick={() => setHistoryPage(p)}>{p}</Button>
                    ));
                  })()}
                  <Button variant="outline" size="sm" disabled={historyPages.page >= historyPages.totalPages} onClick={() => setHistoryPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {(stats.failedAttempts > 0 || stats.locked > 0) && (
              <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-300 text-sm">Security Notice</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                        {stats.failedAttempts} failed login attempt(s) detected.
                        {stats.locked > 0 ? ` ${stats.locked} account(s) currently locked.` : ""}
                        {stats.suspicious > 0 ? ` ${stats.suspicious} suspicious IP(s) flagged.` : ""}
                        Consider enabling IP whitelisting or two-factor authentication for enhanced security.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Session Detail Dialog */}
      <Dialog open={!!detailTarget} onOpenChange={(open) => { if (!open) setDetailTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
            <DialogDescription>Full information about this session.</DialogDescription>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-4">
              {/* User Info Card */}
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-2">User Information</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-[#DC2626]/10 flex items-center justify-center text-sm font-bold text-[#DC2626]">
                    {detailTarget.userName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{detailTarget.userName}</p>
                    <p className="text-xs text-muted-foreground">{detailTarget.role} · {detailTarget.email || "No email"}</p>
                  </div>
                </div>
              </div>

              {/* Session Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">User ID</Label>
                  <p className="font-mono text-xs mt-1 text-muted-foreground truncate max-w-[180px]" title={detailTarget.userId}>{detailTarget.userId}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(mapStatus(detailTarget.status), false)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">IP Address</Label>
                  <p className="font-mono text-sm mt-1">{detailTarget.ip || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">MAC Address</Label>
                  <p className="font-mono text-sm mt-1">{detailTarget.macAddress || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Location</Label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm">{detailTarget.location || "—"}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Browser</Label>
                  <p className="text-sm mt-1">{detailTarget.browser || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Device / OS</Label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm">{detailTarget.device || "—"} {detailTarget.os ? `(${detailTarget.os})` : ""}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Duration</Label>
                  <p className="text-sm mt-1">{detailTarget.duration > 0 ? formatDuration(detailTarget.duration) : "Ongoing"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Login Time</Label>
                  <p className="text-sm mt-1">{formatSessionTime(detailTarget.loginTime)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Last Activity</Label>
                  <p className="text-sm mt-1">{formatSessionTime(detailTarget.lastActivity)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Download</Label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <ArrowDownToLine className="h-3.5 w-3.5 text-green-500" />
                    <p className="text-sm">{formatBytes(detailTarget.downloadBytes)}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Upload</Label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <ArrowUpFromLine className="h-3.5 w-3.5 text-orange-500" />
                    <p className="text-sm">{formatBytes(detailTarget.uploadBytes)}</p>
                  </div>
                </div>
              </div>

              {/* User Agent */}
              <div>
                <Label className="text-xs text-muted-foreground">User Agent</Label>
                <p className="font-mono text-xs break-all bg-muted/50 rounded p-2 mt-1">
                  {detailTarget.userAgent || "—"}
                </p>
              </div>
              {/* Activity Section */}
              {sessionAudit.length > 0 && (
                <div className="mt-4">
                  <Separator className="mb-3" />
                  <div className="flex items-center gap-2 mb-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-xs font-medium">Activity Log</Label>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {sessionAudit.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="flex items-start gap-2 text-xs bg-muted/30 rounded p-2">
                        <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{entry.action}</Badge>
                        <div className="min-w-0">
                          <p className="text-muted-foreground">{entry.userName}</p>
                          <p className="text-muted-foreground/70">{new Date(entry.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDetailTarget(null)}>Close</Button>
            {detailTarget && (mapStatus(detailTarget.status) === "Active" || mapStatus(detailTarget.status) === "Idle") && (
              <>
                <Button
                  variant="outline"
                  className="text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                  onClick={() => { setLockTarget(detailTarget); }}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Lock User
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => { setTerminateTarget(detailTarget); setDetailTarget(null); }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Terminate
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminate Session Confirmation */}
      <AlertDialog open={!!terminateTarget} onOpenChange={(open) => { if (!open) setTerminateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to terminate the session for <strong>{terminateTarget?.userName}</strong>?
              This will immediately log the user out.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={terminateMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => terminateMutation.mutate(terminateTarget!.id)}
              disabled={terminateMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {terminateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Terminate Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lock User Confirmation */}
      <AlertDialog open={!!lockTarget} onOpenChange={(open) => { if (!open) setLockTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock User Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to lock the account for <strong>{lockTarget?.userName}</strong>?
              This will immediately terminate all active sessions and prevent the user from logging in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              The user will need to be unlocked manually to regain access.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lockUserMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => lockUserMutation.mutate(lockTarget!.userId)}
              disabled={lockUserMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {lockUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Ban className="h-4 w-4 mr-1" />
              Lock Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Terminate All Suspicious Confirmation */}
      <AlertDialog open={terminateAllOpen} onOpenChange={setTerminateAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate All Suspicious Sessions</AlertDialogTitle>
            <AlertDialogDescription>
              This will terminate all active/idle sessions from IP addresses that have more than 3 failed login attempts.
              This is a security measure to prevent unauthorized access from suspicious sources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3">
            <p className="text-sm font-medium text-red-800 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Warning: This action cannot be undone
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              Affected users will need to log in again. {stats.suspicious} suspicious IP(s) detected.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={terminateAllMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => terminateAllMutation.mutate()}
              disabled={terminateAllMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {terminateAllMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Zap className="h-4 w-4 mr-1" />
              Terminate All Suspicious
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Dialog with Tabs */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Session & Security Settings</DialogTitle>
            <DialogDescription>Configure session management, password policy, and brute-force protection</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="sessions" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sessions" className="gap-1.5 text-xs"><Clock className="h-3 w-3" />Sessions</TabsTrigger>
              <TabsTrigger value="password" className="gap-1.5 text-xs"><KeyRound className="h-3 w-3" />Password</TabsTrigger>
              <TabsTrigger value="security" className="gap-1.5 text-xs"><Shield className="h-3 w-3" />Security</TabsTrigger>
            </TabsList>

            <TabsContent value="sessions" className="space-y-4 mt-4">
              <div className="grid gap-2">
                <Label>Max Session Duration (hours)</Label>
                <Input
                  type="number"
                  value={settings.maxDuration}
                  onChange={(e) => setSettings({ ...settings, maxDuration: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Idle Timeout (minutes)</Label>
                <Input
                  type="number"
                  value={settings.idleTimeout}
                  onChange={(e) => setSettings({ ...settings, idleTimeout: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Max Concurrent Sessions</Label>
                <Input
                  type="number"
                  value={settings.maxConcurrent}
                  onChange={(e) => setSettings({ ...settings, maxConcurrent: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>IP Whitelist (comma-separated)</Label>
                <Input
                  value={settings.ipWhitelist}
                  onChange={(e) => setSettings({ ...settings, ipWhitelist: e.target.value })}
                  placeholder="192.168.1.0/24, 10.0.0.0/8"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Require Two-Factor Authentication</Label>
                  <p className="text-xs text-muted-foreground">For admin accounts</p>
                </div>
                <Switch
                  checked={settings.twoFactorRequired}
                  onCheckedChange={(v) => setSettings({ ...settings, twoFactorRequired: v })}
                />
              </div>
            </TabsContent>

            <TabsContent value="password" className="space-y-4 mt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Password policy is applied on login and password change.
              </div>
              <div className="grid gap-2">
                <Label>Minimum Password Length</Label>
                <Input
                  type="number"
                  min={4}
                  max={128}
                  value={passwordPolicy.minLength}
                  onChange={(e) => setPasswordPolicy({ ...passwordPolicy, minLength: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Require Uppercase Letters</Label>
                  <p className="text-xs text-muted-foreground">At least one A-Z character</p>
                </div>
                <Switch
                  checked={passwordPolicy.requireUppercase}
                  onCheckedChange={(v) => setPasswordPolicy({ ...passwordPolicy, requireUppercase: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Require Lowercase Letters</Label>
                  <p className="text-xs text-muted-foreground">At least one a-z character</p>
                </div>
                <Switch
                  checked={passwordPolicy.requireLowercase}
                  onCheckedChange={(v) => setPasswordPolicy({ ...passwordPolicy, requireLowercase: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Require Numbers</Label>
                  <p className="text-xs text-muted-foreground">At least one 0-9 digit</p>
                </div>
                <Switch
                  checked={passwordPolicy.requireNumbers}
                  onCheckedChange={(v) => setPasswordPolicy({ ...passwordPolicy, requireNumbers: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Require Special Characters</Label>
                  <p className="text-xs text-muted-foreground">At least one !@#$%^&* etc.</p>
                </div>
                <Switch
                  checked={passwordPolicy.requireSpecial}
                  onCheckedChange={(v) => setPasswordPolicy({ ...passwordPolicy, requireSpecial: v })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Password Expiry (days, 0 = never)</Label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={passwordPolicy.expiryDays}
                  onChange={(e) => setPasswordPolicy({ ...passwordPolicy, expiryDays: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Users will be prompted to change password after this period.</p>
              </div>
            </TabsContent>

            <TabsContent value="security" className="space-y-4 mt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                Brute-force protection helps prevent unauthorized access attempts.
              </div>
              <div className="grid gap-2">
                <Label>Max Login Attempts Before Lockout</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={bruteForce.maxLoginAttempts}
                  onChange={(e) => setBruteForce({ ...bruteForce, maxLoginAttempts: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Account will be locked after this many consecutive failed attempts.</p>
              </div>
              <div className="grid gap-2">
                <Label>Lockout Duration (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={bruteForce.lockoutDurationMinutes}
                  onChange={(e) => setBruteForce({ ...bruteForce, lockoutDurationMinutes: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Locked accounts auto-unlock after this period.</p>
              </div>
              <div className="grid gap-2">
                <Label>Enable CAPTCHA After N Failed Attempts</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={bruteForce.captchaAfterAttempts}
                  onChange={(e) => setBruteForce({ ...bruteForce, captchaAfterAttempts: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Set to 0 to disable CAPTCHA entirely.</p>
              </div>
              <Separator />
              <div className="grid gap-2">
                <Label>Lock Account After Failed Logins</Label>
                <Input
                  type="number"
                  value={settings.lockAfterFailures}
                  onChange={(e) => setSettings({ ...settings, lockAfterFailures: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Separate from brute-force lockout — requires admin unlock.</p>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#DC2626] hover:bg-[#B91C1C]"
              onClick={handleSaveSettings}
              disabled={settingsSaving}
            >
              {settingsSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save All Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── RADIUS Session Detail Dialog ── */}
      <Dialog open={!!radiusDetailTarget} onOpenChange={(open) => { if (!open) setRadiusDetailTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wifi className="h-4 w-4" />RADIUS Session Details</DialogTitle>
            <DialogDescription>Full information for this RADIUS session</DialogDescription>
          </DialogHeader>
          {radiusDetailTarget && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">Username</span><p className="font-mono font-medium">{radiusDetailTarget.username}</p></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">Subscriber</span><p className="font-medium">{radiusDetailTarget.subscriberName || "—"} {radiusDetailTarget.subscriberCode ? <span className="text-xs text-muted-foreground">({radiusDetailTarget.subscriberCode})</span> : null}</p></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">Session ID</span><p className="font-mono text-xs">{radiusDetailTarget.sessionId || radiusDetailTarget.id}</p></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">Status</span><p>{radiusDetailTarget.isActive ? <Badge className="bg-green-500 text-white border-0">Online</Badge> : <Badge variant="secondary">Offline</Badge>}</p></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">Framed IP</span><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{radiusDetailTarget.framedIp || "—"}</code></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">MAC Address</span><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{radiusDetailTarget.callingStationId || "—"}</code></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">NAS IP</span><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{radiusDetailTarget.nasIp || "—"}</code></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">NAS Port</span><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{radiusDetailTarget.nasPort || "—"}</code></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">Start Time</span><p className="text-xs">{radiusDetailTarget.startTime ? formatSessionTime(radiusDetailTarget.startTime) : "—"}</p></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">Stop Time</span><p className="text-xs">{radiusDetailTarget.stopTime ? formatSessionTime(radiusDetailTarget.stopTime) : "—"}</p></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">Duration</span><p className="text-xs">{radiusDetailTarget.durationFormatted || "—"}</p></div>
                <div className="space-y-0.5"><span className="text-xs text-muted-foreground">Terminate Cause</span><p className="text-xs">{radiusDetailTarget.terminateCause || "—"}</p></div>
              </div>
              <Separator />
              <div>
                <span className="text-xs text-muted-foreground">Bandwidth Usage</span>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <ArrowDownToLine className="h-3.5 w-3.5 mx-auto text-green-600 mb-1" />
                    <p className="text-xs font-semibold">{radiusDetailTarget.inputOctetsFormatted || "0 B"}</p>
                    <p className="text-[10px] text-muted-foreground">Download</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <ArrowUpFromLine className="h-3.5 w-3.5 mx-auto text-orange-600 mb-1" />
                    <p className="text-xs font-semibold">{radiusDetailTarget.outputOctetsFormatted || "0 B"}</p>
                    <p className="text-[10px] text-muted-foreground">Upload</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <Zap className="h-3.5 w-3.5 mx-auto text-amber-600 mb-1" />
                    <p className="text-xs font-semibold">{radiusDetailTarget.totalOctetsFormatted || "0 B"}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>
              {radiusDetailTarget.isActive && (
                <div className="flex justify-end pt-2">
                  <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { setRadiusDetailTarget(null); setRadiusDisconnectTarget(radiusDetailTarget); }}>
                    <Trash2 className="h-3.5 w-3.5" />Disconnect Session
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── RADIUS Disconnect Confirmation ── */}
      <AlertDialog open={!!radiusDisconnectTarget} onOpenChange={(open) => { if (!open) setRadiusDisconnectTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect RADIUS Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect <strong className="font-mono">{radiusDisconnectTarget?.username}</strong>?
              {radiusDisconnectTarget?.subscriberName && <> This will end the session for subscriber <strong>{radiusDisconnectTarget.subscriberName}</strong>.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (radiusDisconnectTarget) { disconnectRadiusMutation.mutate(radiusDisconnectTarget.id); setRadiusDisconnectTarget(null); } }}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
