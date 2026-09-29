"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wifi, Activity, ShieldCheck, ShieldAlert, ArrowDownToLine, Clock,
  Search, RefreshCw, Eye, Unplug, ArrowUpDown, Download, Loader2,
  Server, Play, Settings, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle2, XCircle, FileText, Users, Zap, Ban, Gauge, Timer,
  HardDrive, UserCheck, Radio, ArrowUpFromLine, History, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════

interface SessionRow {
  id: string;
  sessionId: string;
  username: string;
  status: string;
  subscriberId: string;
  subscriberName: string;
  subscriberPhone: string;
  subscriberCode: string;
  subscriberStatus: string;
  planId: string | null;
  planName: string;
  speedDownKbps: number;
  speedUpKbps: number;
  dataLimitMb: number | null;
  dataUsedMb: number;
  dataLimitPercent: number | null;
  sessionTimeoutSec: number | null;
  timeRemainingSec: number | null;
  duration: number;
  inputOctets: number;
  outputOctets: number;
  totalOctets: number;
  assignedIp: string;
  callingStationId: string;
  nasIp: string;
  startTime: string;
  stopTime: string | null;
  terminateCause: string | null;
  terminatedBy: string | null;
  coaCount: number;
}

interface SessionDetail extends SessionRow {
  subscriber: {
    id: string;
    name: string;
    phone: string;
    code: string;
    email: string | null;
    address: string | null;
    status: string;
    serviceUsername: string;
    connectionType: string | null;
    plan: {
      id: string;
      name: string;
      category: string;
      downloadSpeed: number;
      uploadSpeed: number;
      dataLimitGb: number | null;
      priceMonthly: number;
      validityDays: number;
      maxConcurrentSessions: number;
      group: { id: string; name: string; speedLimitDown: number; speedLimitUp: number; dataLimit: number | null; sessionTimeout: number | null } | null;
    } | null;
    radiusGroup: { id: string; name: string; speedLimitDown: number; speedLimitUp: number; dataLimit: number | null; sessionTimeout: number | null } | null;
  } | null;
  events: SessionEvent[];
}

interface SessionEvent {
  id: string;
  eventType: string;
  authResult: string | null;
  username: string | null;
  clientIp: string | null;
  macAddress: string | null;
  source: string | null;
  triggeredBy: string | null;
  context: Record<string, unknown> | null;
  createdAt: string;
}

interface SessionStats {
  activeSessions: number;
  todaySessions: number;
  authSuccessRate: number;
  authFailureToday: number;
  totalBandwidthBytes: number;
  avgSessionDurationSec: number;
  topPlansByActiveSessions: Array<{ planId: string; planName: string; activeSessions: number }>;
}

interface EventRow {
  id: string;
  eventType: string;
  authResult: string | null;
  username: string | null;
  clientIp: string | null;
  macAddress: string | null;
  source: string | null;
  triggeredBy: string | null;
  context: Record<string, unknown> | null;
  createdAt: string;
  nasSessionId?: string | null;
  sessionId?: string | null;
  subscriberId?: string | null;
}

interface BandwidthRow {
  subscriberId: string;
  username: string;
  subscriberName: string;
  downloadBytes: number;
  uploadBytes: number;
  totalBytes: number;
}

interface NasConfig {
  id: string;
  name: string;
  ipAddress: string;
  nasSecret: string;
  coaPort: number;
  defaultSessionTimeoutSec: number;
  defaultIdleTimeoutSec: number;
  defaultDataLimitMb: number | null;
  enforceDataLimit: boolean;
  enforceTimeLimit: boolean;
  enforceIdleTimeout: boolean;
  enforceConcurrent: boolean;
  autoReauthOnPlanChange: boolean;
  accountingIntervalSec: number;
}

interface PlanOption {
  id: string;
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  category: string;
}

interface PolicyEvaluation {
  subscriberId: string;
  username: string;
  subscriberName: string;
  effectivePolicy: {
    speedDownKbps: number;
    speedUpKbps: number;
    speedDownMbps: number;
    speedUpMbps: number;
    dataLimitMb: number | null;
    sessionTimeoutSec: number | null;
    idleTimeoutSec: number | null;
    maxConcurrentSessions: number;
  };
  resolutionChain: Array<{ source: string; speedDown: number; speedUp: number; dataLimitMb: number | null }>;
  appliedFrom: string;
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h ${m}m`;
  return `${h}h ${m}m${s > 0 ? ` ${s}s` : ""}`;
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatSpeed(kbps: number): string {
  if (!kbps || kbps <= 0) return "—";
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(0)} Mbps`;
  return `${kbps} Kbps`;
}

function formatPercent(val: number | null): string {
  if (val === null || val === undefined) return "∞";
  return `${val}%`;
}

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function getLastWeekStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  AUTH_SUCCESS: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  AUTH_FAILURE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  AUTH_REQUEST: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  SESSION_START: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  SESSION_STOP: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  SESSION_UPDATE: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  COA_REQUEST: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  COA_SUCCESS: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  ADMIN_DISCONNECT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  BULK_DISCONNECT: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  POLICY_ENFORCE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  DATA_LIMIT_REACHED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  TIME_LIMIT_REACHED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  IDLE_TIMEOUT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
};

function getEventBadge(eventType: string) {
  const cls = EVENT_TYPE_COLORS[eventType] || "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  return <Badge className={`${cls} text-[10px] px-1.5 py-0.5 border-0 font-medium whitespace-nowrap`}>{eventType.replace(/_/g, " ")}</Badge>;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "ACTIVE":
      return <Badge className="bg-green-600 text-white border-0 text-[10px]"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white mr-1 animate-pulse" />Active</Badge>;
    case "IDLE":
      return <Badge className="bg-amber-500 text-white border-0 text-[10px]"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white/80 mr-1" />Idle</Badge>;
    case "SUSPENDED":
      return <Badge className="bg-yellow-500 text-white border-0 text-[10px]"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white/80 mr-1" />Suspended</Badge>;
    case "TERMINATING":
      return <Badge className="bg-red-500 text-white border-0 text-[10px]"><span className="inline-block w-1.5 h-1.5 rounded-full bg-white mr-1" />Terminating</Badge>;
    case "CLOSED":
      return <Badge variant="secondary" className="text-[10px]">Closed</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

// ══════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function SessionEnginePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("active-sessions");

  // ─── Session List State ───
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionPage, setSessionPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── Events State ───
  const [eventFilter, setEventFilter] = useState("ALL");
  const [eventSearch, setEventSearch] = useState("");
  const [eventDateFrom, setEventDateFrom] = useState(getLastWeekStr());
  const [eventDateTo, setEventDateTo] = useState(getTodayStr());
  const [eventPage, setEventPage] = useState(1);

  // ─── Policy State ───
  const [policyUsername, setPolicyUsername] = useState("");
  const [enforceOpen, setEnforceOpen] = useState(false);

  // ─── Dialog State ───
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<SessionRow | null>(null);
  const [coaTarget, setCoaTarget] = useState<SessionRow | null>(null);
  const [bulkDisconnectOpen, setBulkDisconnectOpen] = useState(false);

  // ─── CoA Dialog State ───
  const [coaNewPlanId, setCoaNewPlanId] = useState("");
  const [coaManualDown, setCoaManualDown] = useState("");
  const [coaManualUp, setCoaManualUp] = useState("");
  const [coaReason, setCoaReason] = useState("");
  const [coaMode, setCoaMode] = useState<"plan" | "manual">("plan");

  // ─── Disconnect Dialog State ───
  const [disconnectReason, setDisconnectReason] = useState("Administrative");
  const [disconnectCustomReason, setDisconnectCustomReason] = useState("");

  // ─── NAS Config State ───
  const [nasConfigSaving, setNasConfigSaving] = useState(false);
  const [nasConfig, setNasConfig] = useState<NasConfig | null>(null);

  // ══════════════════════════════════════════════════════════════════
  // QUERIES
  // ══════════════════════════════════════════════════════════════════

  // Stats
  const { data: stats, isLoading: statsLoading } = useQuery<SessionStats>({
    queryKey: ["se-stats"],
    queryFn: () => apiFetch<SessionStats>("/api/session-engine?action=stats"),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // Sessions list
  const { data: sessionsData, isLoading: sessionsLoading, isFetching: sessionsFetching } = useQuery<{
    sessions: SessionRow[];
    pagination: { total: number; page: number; limit: number; pages: number };
  }>({
    queryKey: ["se-sessions", sessionSearch, sessionPage, activeTab === "active-sessions"],
    queryFn: () => {
      const params = new URLSearchParams({ status: "ACTIVE", limit: "50", page: String(sessionPage) });
      if (sessionSearch) params.set("search", sessionSearch);
      return apiFetch(`/api/session-engine/sessions?${params.toString()}`);
    },
    enabled: activeTab === "active-sessions",
    refetchInterval: 15000,
  });

  // Events
  const { data: eventsData, isLoading: eventsLoading } = useQuery<{
    events: EventRow[];
    total: number;
    pagination: { page: number; limit: number; pages: number };
  }>({
    queryKey: ["se-events", eventFilter, eventSearch, eventDateFrom, eventDateTo, eventPage],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50", page: String(eventPage) });
      if (eventFilter !== "ALL") params.set("eventType", eventFilter);
      if (eventSearch) params.set("search", eventSearch);
      return apiFetch(`/api/session-engine?action=events&${params.toString()}`);
    },
    enabled: activeTab === "session-events",
    refetchInterval: 30000,
  });

  // Policy evaluation
  const { data: policyResult, isLoading: policyLoading, refetch: refetchPolicy } = useQuery<PolicyEvaluation>({
    queryKey: ["se-policy", policyUsername],
    queryFn: () => {
      // Search subscriber by serviceUsername via sessions search then get their subscriberId
      return apiFetch<PolicyEvaluation>(`/api/session-engine/policy/${policyUsername}`).catch(() => {
        return apiFetch<{ sessions: SessionRow[] }>(`/api/session-engine/sessions?search=${encodeURIComponent(policyUsername)}&limit=1&status=ALL`).then(res => {
          if (res.sessions?.length > 0) {
            return apiFetch<PolicyEvaluation>(`/api/session-engine/policy/${res.sessions[0].subscriberId}`);
          }
          throw new Error("Subscriber not found");
        });
      });
    },
    enabled: activeTab === "policy-engine" && policyUsername.length > 0,
  });

  // NAS Config
  const { data: nasConfigRaw, isLoading: nasConfigLoading } = useQuery<{ config: NasConfig }>({
    queryKey: ["se-nas-config"],
    queryFn: () => apiFetch<{ config: NasConfig }>("/api/session-engine/nas-config"),
    enabled: activeTab === "nas-config",
  });

  // Sync NAS config into state
  const nasConfigData = nasConfigRaw?.config;
  if (nasConfigData && !nasConfig) {
    setNasConfig(nasConfigData);
  }

  // Bandwidth stats
  const { data: bandwidthData } = useQuery<{
    topConsumers: BandwidthRow[];
    totalDownloadBytes: number;
    totalUploadBytes: number;
  }>({
    queryKey: ["se-bandwidth"],
    queryFn: () => apiFetch("/api/session-engine?action=bandwidth"),
    refetchInterval: 30000,
    enabled: activeTab === "session-stats",
  });

  // Plans for CoA dialog
  const { data: plansData } = useQuery<{ items: PlanOption[] }>({
    queryKey: ["plans-list"],
    queryFn: () => apiFetch("/api/plans?limit=100"),
    staleTime: 60000,
  });
  const plans = plansData?.items || [];

  // Session detail
  const { data: sessionDetailData, isLoading: detailLoading } = useQuery<{ session: SessionDetail }>({
    queryKey: ["se-session-detail", detailSessionId],
    queryFn: () => apiFetch(`/api/session-engine/sessions/${detailSessionId}`),
    enabled: !!detailSessionId,
  });

  const detailedSession = sessionDetailData?.session || null;
  const detailOpen = !!detailSessionId;

  // ══════════════════════════════════════════════════════════════════
  // MUTATIONS
  // ══════════════════════════════════════════════════════════════════

  const disconnectMutation = useMutation({
    mutationFn: ({ sessionId, reason }: { sessionId: string; reason: string }) =>
      apiFetch(`/api/session-engine/sessions/${sessionId}?action=disconnect`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      toast.success("Session disconnected successfully");
      setDisconnectTarget(null);
      setDetailSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["se-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["se-stats"] });
    },
    onError: (err: Error) => toast.error(`Disconnect failed: ${err.message}`),
  });

  const bulkDisconnectMutation = useMutation({
    mutationFn: ({ sessionIds, reason }: { sessionIds: string[]; reason: string }) =>
      apiFetch("/api/session-engine/sessions", {
        method: "POST",
        body: JSON.stringify({ sessionIds, reason }),
      }),
    onSuccess: (data: any) => {
      const ok = data.results?.filter((r: any) => r.success).length || 0;
      toast.success(`Disconnected ${ok} session(s)`);
      setBulkDisconnectOpen(false);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["se-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["se-stats"] });
    },
    onError: (err: Error) => toast.error(`Bulk disconnect failed: ${err.message}`),
  });

  const coaMutation = useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body: Record<string, unknown> }) =>
      apiFetch(`/api/session-engine/sessions/${sessionId}?action=coa`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("CoA applied successfully");
      setCoaTarget(null);
      setDetailSessionId(null);
      setCoaNewPlanId("");
      setCoaManualDown("");
      setCoaManualUp("");
      setCoaReason("");
      queryClient.invalidateQueries({ queryKey: ["se-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["se-stats"] });
    },
    onError: (err: Error) => toast.error(`CoA failed: ${err.message}`),
  });

  const enforceMutation = useMutation({
    mutationFn: () => apiFetch("/api/session-engine?action=policy-enforce", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (data: any) => {
      const actions = data.actions?.length || 0;
      toast.success(`Policy enforcement completed. ${actions} action(s) taken.`);
      setEnforceOpen(false);
      queryClient.invalidateQueries({ queryKey: ["se-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["se-stats"] });
    },
    onError: (err: Error) => toast.error(`Enforcement failed: ${err.message}`),
  });

  const saveNasConfigMutation = useMutation({
    mutationFn: (config: NasConfig) =>
      apiFetch("/api/session-engine/nas-config", { method: "PUT", body: JSON.stringify(config) }),
    onSuccess: () => {
      toast.success("NAS configuration saved");
      setNasConfigSaving(false);
      queryClient.invalidateQueries({ queryKey: ["se-nas-config"] });
    },
    onError: (err: Error) => {
      toast.error(`Save failed: ${err.message}`);
      setNasConfigSaving(false);
    },
  });

  // ══════════════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════════════

  const sessions = sessionsData?.sessions || [];
  const sessionPagination = sessionsData?.pagination || { total: 0, page: 1, pages: 1 };
  const events = eventsData?.events || [];
  const topConsumers = bandwidthData?.topConsumers || [];

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sessions.map(s => s.id)));
    }
  }, [sessions, selectedIds.size]);

  const handleDisconnect = useCallback(() => {
    if (!disconnectTarget) return;
    const reason = disconnectReason === "Other" ? disconnectCustomReason : disconnectReason;
    disconnectMutation.mutate({ sessionId: disconnectTarget.sessionId, reason: reason || "Administrative" });
  }, [disconnectTarget, disconnectReason, disconnectCustomReason, disconnectMutation]);

  const handleBulkDisconnect = useCallback(() => {
    if (selectedIds.size === 0) return;
    const reason = "Bulk administrative disconnect";
    bulkDisconnectMutation.mutate({ sessionIds: Array.from(selectedIds), reason });
  }, [selectedIds, bulkDisconnectMutation]);

  const handleCoA = useCallback(() => {
    if (!coaTarget) return;
    const body: Record<string, unknown> = { reason: coaReason };
    if (coaMode === "plan" && coaNewPlanId) {
      body.newPlanId = coaNewPlanId;
    } else {
      body.speedDownKbps = parseInt(coaManualDown) || undefined;
      body.speedUpKbps = parseInt(coaManualUp) || undefined;
    }
    coaMutation.mutate({ sessionId: coaTarget.sessionId, body });
  }, [coaTarget, coaMode, coaNewPlanId, coaManualDown, coaManualUp, coaReason, coaMutation]);

  const handleSaveNasConfig = useCallback(() => {
    if (!nasConfig) return;
    setNasConfigSaving(true);
    saveNasConfigMutation.mutate(nasConfig);
  }, [nasConfig, saveNasConfigMutation]);

  const handleExportCSV = useCallback(() => {
    const rows = sessions.map(s => ({
      Username: s.username,
      Subscriber: s.subscriberName,
      IP: s.assignedIp,
      MAC: s.callingStationId,
      Plan: s.planName,
      "Speed Down": formatSpeed(s.speedDownKbps),
      "Speed Up": formatSpeed(s.speedUpKbps),
      "Data Used": formatBytes(s.totalOctets),
      Duration: formatDuration(s.duration),
      Status: s.status,
      "Start Time": formatDateTime(s.startTime),
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => JSON.stringify(r[h as keyof typeof r] || "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nas-sessions-${getTodayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("CSV exported");
  }, [sessions]);

  const resetCoaDialog = useCallback(() => {
    setCoaNewPlanId("");
    setCoaManualDown("");
    setCoaManualUp("");
    setCoaReason("");
    setCoaMode("plan");
  }, []);

  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════

  const st = stats || { activeSessions: 0, todaySessions: 0, authSuccessRate: 0, authFailureToday: 0, totalBandwidthBytes: 0, avgSessionDurationSec: 0 };

  return (
    <div className="space-y-6 animate-page-enter">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Radio className="h-6 w-6 text-[#DC2626]" />
            Session Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Built-in NAS Manager — Real-time session control &amp; policy enforcement</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["se-stats"] })} disabled={sessionsFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${sessionsFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ═══ Stats Cards ═══ */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[100px] rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            { label: "Active Sessions", value: st.activeSessions, icon: Wifi, gradient: "from-green-500 to-green-700", delay: "0ms" },
            { label: "Total Today", value: st.todaySessions, icon: Activity, gradient: "from-teal-500 to-teal-700", delay: "60ms" },
            { label: "Auth Success Rate", value: `${st.authSuccessRate}%`, icon: ShieldCheck, gradient: "from-emerald-500 to-emerald-700", delay: "120ms" },
            { label: "Auth Failures", value: st.authFailureToday, icon: ShieldAlert, gradient: "from-red-500 to-red-700", delay: "180ms" },
            { label: "Total Bandwidth", value: formatBytes(st.totalBandwidthBytes), icon: ArrowDownToLine, gradient: "from-amber-500 to-amber-700", delay: "240ms" },
            { label: "Avg Duration", value: formatDuration(st.avgSessionDurationSec), icon: Clock, gradient: "from-slate-500 to-slate-700", delay: "300ms" },
          ].map((item) => (
            <Card key={item.label} className="border-0 shadow-md overflow-hidden animate-card-enter" style={{ animationDelay: item.delay }}>
              <div className={`bg-gradient-to-br ${item.gradient} p-4 rounded-xl`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-xs font-medium">{item.label}</p>
                    <p className="text-white text-xl font-bold mt-1 tabular-nums">{item.value}</p>
                  </div>
                  <item.icon className="h-8 w-8 text-white/25" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ═══ Tabs ═══ */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList className="bg-muted flex-wrap">
            <TabsTrigger value="active-sessions" className="gap-1.5 text-xs sm:text-sm">
              <Wifi className="h-3.5 w-3.5" />
              Active Sessions
            </TabsTrigger>
            <TabsTrigger value="session-events" className="gap-1.5 text-xs sm:text-sm">
              <History className="h-3.5 w-3.5" />
              Events
            </TabsTrigger>
            <TabsTrigger value="policy-engine" className="gap-1.5 text-xs sm:text-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              Policy Engine
            </TabsTrigger>
            <TabsTrigger value="nas-config" className="gap-1.5 text-xs sm:text-sm">
              <Settings className="h-3.5 w-3.5" />
              NAS Config
            </TabsTrigger>
            <TabsTrigger value="session-stats" className="gap-1.5 text-xs sm:text-sm">
              <Gauge className="h-3.5 w-3.5" />
              Statistics
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ════════════════════════════════════════════════════════
           TAB 1: Active Sessions
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="active-sessions" className="space-y-4">
          {/* Search & Bulk Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by username, IP, MAC, subscriber name..."
                value={sessionSearch}
                onChange={(e) => { setSessionSearch(e.target.value); setSessionPage(1); }}
                className="pl-9"
              />
            </div>
            {selectedIds.size > 0 && (
              <div className="flex gap-2 items-center">
                <Badge variant="secondary">{selectedIds.size} selected</Badge>
                <Button variant="destructive" size="sm" onClick={() => setBulkDisconnectOpen(true)}>
                  <Unplug className="h-3.5 w-3.5 mr-1.5" />
                  Disconnect
                </Button>
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {selectedIds.size === sessions.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
            )}
            {selectedIds.size === 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export CSV
              </Button>
            )}
          </div>

          {/* Auto-refresh indicator */}
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Auto-refreshing every 15 seconds
          </p>

          {/* Sessions Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-muted/80 backdrop-blur-sm">
                      <th className="text-left p-3 font-medium w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === sessions.length && sessions.length > 0}
                          onChange={selectAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="text-left p-3 font-medium">Username</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Subscriber</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">IP</th>
                      <th className="text-left p-3 font-medium hidden xl:table-cell">MAC</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Plan</th>
                      <th className="text-left p-3 font-medium hidden xl:table-cell">Speed ↓/↑</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Data Used</th>
                      <th className="text-left p-3 font-medium">Duration</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionsLoading ? (
                      <tr><td colSpan={11} className="p-8 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></td></tr>
                    ) : sessions.length === 0 ? (
                      <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">
                        <Wifi className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        No active sessions
                      </td></tr>
                    ) : sessions.map((s) => (
                      <tr
                        key={s.id}
                        className={`border-b hover:bg-red-50/40 dark:hover:bg-red-950/10 transition-colors cursor-pointer ${selectedIds.has(s.id) ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}
                        onClick={() => setDetailSessionId(s.sessionId)}
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="rounded border-gray-300" />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-[#DC2626]/10 flex items-center justify-center text-xs font-bold text-[#DC2626] shrink-0">
                              {s.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate font-mono text-xs">{s.username}</p>
                              <p className="text-[10px] text-muted-foreground">{s.sessionId.slice(-12)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <p className="text-xs truncate max-w-[120px]">{s.subscriberName || "—"}</p>
                          <p className="text-[10px] text-muted-foreground">{s.subscriberCode || ""}</p>
                        </td>
                        <td className="p-3 hidden lg:table-cell">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{s.assignedIp || "—"}</code>
                        </td>
                        <td className="p-3 hidden xl:table-cell">
                          <code className="text-xs font-mono text-muted-foreground">{s.callingStationId || "—"}</code>
                        </td>
                        <td className="p-3 hidden lg:table-cell">
                          <Badge variant="outline" className="text-[10px]">{s.planName || "—"}</Badge>
                        </td>
                        <td className="p-3 hidden xl:table-cell">
                          <span className="text-xs tabular-nums">{formatSpeed(s.speedDownKbps)} / {formatSpeed(s.speedUpKbps)}</span>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <div className="text-xs">
                            <span className="tabular-nums">{formatBytes(s.totalOctets)}</span>
                            {s.dataLimitPercent !== null && (
                              <div className="mt-1 flex items-center gap-1">
                                <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${s.dataLimitPercent > 90 ? "bg-red-500" : s.dataLimitPercent > 70 ? "bg-amber-500" : "bg-green-500"}`}
                                    style={{ width: `${Math.min(s.dataLimitPercent, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground">{s.dataLimitPercent}%</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-xs tabular-nums whitespace-nowrap">{formatDuration(s.duration)}</td>
                        <td className="p-3">{getStatusBadge(s.status)}</td>
                        <td className="p-3">
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDetailSessionId(s.sessionId)}><Eye className="h-3.5 w-3.5" /></Button>
                            {s.status === "ACTIVE" && (
                              <>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => { setDisconnectTarget(s); setDisconnectReason("Administrative"); setDisconnectCustomReason(""); }}>
                                  <Unplug className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => { setCoaTarget(s); resetCoaDialog(); }}>
                                  <ArrowUpDown className="h-3.5 w-3.5" />
                                </Button>
                              </>
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

          {/* Pagination */}
          {sessionPagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {sessionPagination.page} of {sessionPagination.pages} ({sessionPagination.total} total)
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={sessionPagination.page <= 1} onClick={() => setSessionPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={sessionPagination.page >= sessionPagination.pages} onClick={() => setSessionPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
           TAB 2: Session Events
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="session-events" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Events" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Events</SelectItem>
                <SelectItem value="AUTH_SUCCESS">Auth Success</SelectItem>
                <SelectItem value="AUTH_FAILURE">Auth Failure</SelectItem>
                <SelectItem value="SESSION_START">Session Start</SelectItem>
                <SelectItem value="SESSION_STOP">Session Stop</SelectItem>
                <SelectItem value="COA_SUCCESS">CoA</SelectItem>
                <SelectItem value="ADMIN_DISCONNECT">Admin Disconnect</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={eventDateFrom} onChange={(e) => setEventDateFrom(e.target.value)} className="w-[150px]" />
            <Input type="date" value={eventDateTo} onChange={(e) => setEventDateTo(e.target.value)} className="w-[150px]" />
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by username..." value={eventSearch} onChange={(e) => { setEventSearch(e.target.value); setEventPage(1); }} className="pl-9" />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-muted/80 backdrop-blur-sm">
                      <th className="text-left p-3 font-medium">Time</th>
                      <th className="text-left p-3 font-medium">Event</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Username</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">IP</th>
                      <th className="text-left p-3 font-medium hidden xl:table-cell">MAC</th>
                      <th className="text-left p-3 font-medium">Result</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsLoading ? (
                      <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></td></tr>
                    ) : events.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground"><History className="h-10 w-10 mx-auto mb-2 opacity-30" />No events found</td></tr>
                    ) : events.map((ev) => (
                      <tr key={ev.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(ev.createdAt)}</td>
                        <td className="p-3">{getEventBadge(ev.eventType)}</td>
                        <td className="p-3 hidden md:table-cell font-mono text-xs">{ev.username || "—"}</td>
                        <td className="p-3 hidden lg:table-cell font-mono text-xs">{ev.clientIp || "—"}</td>
                        <td className="p-3 hidden xl:table-cell font-mono text-xs">{ev.macAddress || "—"}</td>
                        <td className="p-3">
                          {ev.authResult === "Access-Accept" ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Accept</Badge>
                          ) : ev.authResult === "Access-Reject" ? (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] border-0"><XCircle className="h-3 w-3 mr-1" />Reject</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 hidden lg:table-cell">
                          <Badge variant="outline" className="text-[10px]">{ev.source || "—"}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {eventsData?.pagination && eventsData.pagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {eventPage} of {eventsData.pagination.pages} ({eventsData.total} total)
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={eventPage <= 1} onClick={() => setEventPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" disabled={eventPage >= eventsData.pagination.pages} onClick={() => setEventPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
           TAB 3: Policy Engine
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="policy-engine" className="space-y-4">
          {/* Enforce Button */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Policy Enforcement</h3>
            <Button className="bg-[#DC2626] hover:bg-red-700 text-white" onClick={() => setEnforceOpen(true)}>
              <Play className="h-4 w-4 mr-2" />
              Run Enforcement
            </Button>
          </div>

          {/* Policy Evaluate */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Evaluate Subscriber Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Enter subscriber ID or username..."
                    value={policyUsername}
                    onChange={(e) => setPolicyUsername(e.target.value)}
                    className="pl-9"
                    onKeyDown={(e) => { if (e.key === "Enter") refetchPolicy(); }}
                  />
                </div>
                <Button variant="outline" onClick={() => refetchPolicy()} disabled={!policyUsername || policyLoading}>
                  {policyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Evaluate
                </Button>
              </div>

              {policyResult && (
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Policy Resolved
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Applied from: {policyResult.appliedFrom}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="text-xs"><span className="text-muted-foreground">Speed Down:</span> <span className="font-bold">{formatSpeed(policyResult.effectivePolicy.speedDownKbps)}</span></div>
                    <div className="text-xs"><span className="text-muted-foreground">Speed Up:</span> <span className="font-bold">{formatSpeed(policyResult.effectivePolicy.speedUpKbps)}</span></div>
                    <div className="text-xs"><span className="text-muted-foreground">Data Limit:</span> <span className="font-bold">{policyResult.effectivePolicy.dataLimitMb ? `${policyResult.effectivePolicy.dataLimitMb} MB` : "Unlimited"}</span></div>
                    <div className="text-xs"><span className="text-muted-foreground">Session Timeout:</span> <span className="font-bold">{policyResult.effectivePolicy.sessionTimeoutSec ? formatDuration(policyResult.effectivePolicy.sessionTimeoutSec) : "Unlimited"}</span></div>
                    <div className="text-xs"><span className="text-muted-foreground">Idle Timeout:</span> <span className="font-bold">{policyResult.effectivePolicy.idleTimeoutSec ? formatDuration(policyResult.effectivePolicy.idleTimeoutSec) : "Unlimited"}</span></div>
                    <div className="text-xs"><span className="text-muted-foreground">Max Concurrent:</span> <span className="font-bold">{policyResult.effectivePolicy.maxConcurrentSessions}</span></div>
                  </div>
                  {policyResult.resolutionChain.length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1.5">Resolution Chain:</p>
                      <div className="space-y-1">
                        {policyResult.resolutionChain.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-background rounded px-2 py-1 border">
                            <Badge variant="outline" className="text-[9px] shrink-0">#{i + 1}</Badge>
                            <span className="font-medium">{c.source}</span>
                            <span className="text-muted-foreground">↓{formatSpeed(c.speedDown)} / ↑{formatSpeed(c.speedUp)}</span>
                            {c.dataLimitMb && <span className="text-muted-foreground">/ {c.dataLimitMb}MB</span>}
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

        {/* ════════════════════════════════════════════════════════
           TAB 4: NAS Configuration
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="nas-config" className="space-y-4">
          {nasConfigLoading ? (
            <Skeleton className="h-[600px] w-full" />
          ) : nasConfig ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4" />Built-in NAS Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* General */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">General Settings</h4>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">NAS Name</Label>
                        <Input value={nasConfig.name} onChange={(e) => setNasConfig({ ...nasConfig, name: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">NAS IP Address</Label>
                        <Input value={nasConfig.ipAddress} onChange={(e) => setNasConfig({ ...nasConfig, ipAddress: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">NAS Secret</Label>
                        <Input type="password" value={nasConfig.nasSecret} onChange={(e) => setNasConfig({ ...nasConfig, nasSecret: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">CoA Port</Label>
                        <Input type="number" value={nasConfig.coaPort} onChange={(e) => setNasConfig({ ...nasConfig, coaPort: parseInt(e.target.value) || 3799 })} className="mt-1" />
                      </div>
                    </div>
                  </div>

                  {/* Timeouts & Limits */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Timeouts &amp; Limits</h4>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Default Session Timeout (seconds)</Label>
                        <Input type="number" value={nasConfig.defaultSessionTimeoutSec} onChange={(e) => setNasConfig({ ...nasConfig, defaultSessionTimeoutSec: parseInt(e.target.value) || 86400 })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Default Idle Timeout (seconds)</Label>
                        <Input type="number" value={nasConfig.defaultIdleTimeoutSec} onChange={(e) => setNasConfig({ ...nasConfig, defaultIdleTimeoutSec: parseInt(e.target.value) || 3600 })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Default Data Limit (MB)</Label>
                        <Input type="number" value={nasConfig.defaultDataLimitMb ?? ""} onChange={(e) => setNasConfig({ ...nasConfig, defaultDataLimitMb: e.target.value ? parseInt(e.target.value) : null })} className="mt-1" placeholder="0 = unlimited" />
                      </div>
                      <div>
                        <Label className="text-xs">Accounting Interval (seconds)</Label>
                        <Input type="number" value={nasConfig.accountingIntervalSec} onChange={(e) => setNasConfig({ ...nasConfig, accountingIntervalSec: parseInt(e.target.value) || 300 })} className="mt-1" />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Enforcement Toggles */}
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Enforcement Policies</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { key: "enforceDataLimit" as const, label: "Enforce Data Limit", desc: "Disconnect when data limit is reached" },
                      { key: "enforceTimeLimit" as const, label: "Enforce Time Limit", desc: "Disconnect when session timeout expires" },
                      { key: "enforceIdleTimeout" as const, label: "Enforce Idle Timeout", desc: "Disconnect on idle timeout" },
                      { key: "enforceConcurrent" as const, label: "Enforce Concurrent Sessions", desc: "Limit simultaneous sessions per subscriber" },
                      { key: "autoReauthOnPlanChange" as const, label: "Auto Reauth on Plan Change", desc: "Automatically re-authenticate when plan changes" },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                        </div>
                        <Switch
                          checked={nasConfig[item.key]}
                          onCheckedChange={(v) => setNasConfig({ ...nasConfig, [item.key]: v })}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="bg-[#DC2626] hover:bg-red-700 text-white"
                  onClick={handleSaveNasConfig}
                  disabled={nasConfigSaving || saveNasConfigMutation.isPending}
                >
                  {saveNasConfigMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings className="h-4 w-4 mr-2" />}
                  Save Configuration
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No NAS config found</CardContent></Card>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
           TAB 5: Session Statistics
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="session-stats" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Consumers */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4 text-red-500" />
                  Top 10 Data Consumers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="border-b bg-muted/80">
                        <th className="text-left p-2 font-medium">#</th>
                        <th className="text-left p-2 font-medium">Username</th>
                        <th className="text-left p-2 font-medium">Subscriber</th>
                        <th className="text-right p-2 font-medium">Download</th>
                        <th className="text-right p-2 font-medium">Upload</th>
                        <th className="text-right p-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topConsumers.length === 0 ? (
                        <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No data available</td></tr>
                      ) : topConsumers.map((c, i) => (
                        <tr key={c.subscriberId} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2 font-bold text-muted-foreground">{i + 1}</td>
                          <td className="p-2 font-mono">{c.username}</td>
                          <td className="p-2">{c.subscriberName}</td>
                          <td className="p-2 text-right tabular-nums">{formatBytes(c.downloadBytes)}</td>
                          <td className="p-2 text-right tabular-nums">{formatBytes(c.uploadBytes)}</td>
                          <td className="p-2 text-right font-bold tabular-nums">{formatBytes(c.totalBytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Bandwidth Summary */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Gauge className="h-4 w-4" />Bandwidth Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2"><ArrowDownToLine className="h-4 w-4 text-green-600" />Total Download</span>
                    <span className="font-bold tabular-nums">{formatBytes(bandwidthData?.totalDownloadBytes || 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2"><ArrowUpFromLine className="h-4 w-4 text-orange-500" />Total Upload</span>
                    <span className="font-bold tabular-nums">{formatBytes(bandwidthData?.totalUploadBytes || 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-[#DC2626]" />Total Combined</span>
                    <span className="font-bold tabular-nums">{formatBytes((bandwidthData?.totalDownloadBytes || 0) + (bandwidthData?.totalUploadBytes || 0))}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Auth Ratio */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Authentication Ratio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${st.authSuccessRate}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums min-w-[60px] text-right">{st.authSuccessRate}%</span>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" />Success</span>
                    <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" />Failures: {st.authFailures}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Timer className="h-4 w-4" />Session Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Active Sessions</span>
                    <span className="font-bold text-green-600">{st.activeSessions}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total Today</span>
                    <span className="font-bold">{st.totalToday}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Avg Duration</span>
                    <span className="font-bold tabular-nums">{formatDuration(st.avgDurationSec)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════
         DIALOG: Session Detail
      ════════════════════════════════════════════════════════ */}
      <Dialog open={detailOpen} onOpenChange={(open) => { if (!open) setDetailSessionId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-[#DC2626]" />
              Session Detail
              {detailedSession && getStatusBadge(detailedSession.status)}
            </DialogTitle>
            <DialogDescription>Full session information and controls</DialogDescription>
          </DialogHeader>

          {detailLoading || !detailedSession ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Session Info */}
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Session Information</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Session ID:</span> <span className="font-mono">{detailedSession.sessionId}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> {getStatusBadge(detailedSession.status)}</div>
                  <div><span className="text-muted-foreground">Start Time:</span> <span>{formatDateTime(detailedSession.startTime)}</span></div>
                  <div><span className="text-muted-foreground">Duration:</span> <span className="font-bold tabular-nums">{formatDuration(detailedSession.duration)}</span></div>
                  <div><span className="text-muted-foreground">Assigned IP:</span> <code className="bg-muted px-1 rounded">{detailedSession.assignedIp || "—"}</code></div>
                  <div><span className="text-muted-foreground">MAC:</span> <code className="bg-muted px-1 rounded">{detailedSession.callingStationId || "—"}</code></div>
                  <div><span className="text-muted-foreground">NAS IP:</span> <code className="bg-muted px-1 rounded">{detailedSession.nasIp}</code></div>
                  <div><span className="text-muted-foreground">CoA Count:</span> <span>{detailedSession.coaCount}</span></div>
                </div>
              </div>

              {/* Subscriber Info */}
              {detailedSession.subscriber && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Subscriber Information</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{detailedSession.subscriber.name}</span></div>
                      <div><span className="text-muted-foreground">Phone:</span> <span>{detailedSession.subscriber.phone || "—"}</span></div>
                      <div><span className="text-muted-foreground">Code:</span> <span>{detailedSession.subscriber.code}</span></div>
                      <div><span className="text-muted-foreground">Connection:</span> <span>{detailedSession.subscriber.connectionType || "—"}</span></div>
                    </div>
                  </div>

                  {/* Plan Info */}
                  {detailedSession.subscriber.plan && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Plan Information</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-muted-foreground">Plan:</span> <Badge variant="outline">{detailedSession.subscriber.plan.name}</Badge></div>
                          <div><span className="text-muted-foreground">Category:</span> <span>{detailedSession.subscriber.plan.category}</span></div>
                          <div><span className="text-muted-foreground">Speed:</span> <span className="font-bold">{formatSpeed(detailedSession.subscriber.plan.downloadSpeed)} / {formatSpeed(detailedSession.subscriber.plan.uploadSpeed)}</span></div>
                          <div><span className="text-muted-foreground">Data Limit:</span> <span>{detailedSession.subscriber.plan.dataLimitGb ? `${detailedSession.subscriber.plan.dataLimitGb} GB` : "Unlimited"}</span></div>
                          <div><span className="text-muted-foreground">Price:</span> <span>₹{detailedSession.subscriber.plan.priceMonthly}/mo</span></div>
                          <div><span className="text-muted-foreground">Validity:</span> <span>{detailedSession.subscriber.plan.validityDays} days</span></div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* RADIUS Group */}
                  {detailedSession.subscriber.radiusGroup && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">RADIUS Group</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-muted-foreground">Group:</span> <Badge variant="outline">{detailedSession.subscriber.radiusGroup.name}</Badge></div>
                          <div><span className="text-muted-foreground">Speed:</span> <span>{formatSpeed(detailedSession.subscriber.radiusGroup.speedLimitDown * 1000)} / {formatSpeed(detailedSession.subscriber.radiusGroup.speedLimitUp * 1000)}</span></div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Bandwidth */}
              <Separator />
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Bandwidth Usage</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-950/20">
                    <ArrowDownToLine className="h-4 w-4 mx-auto text-green-600 mb-1" />
                    <p className="text-sm font-bold tabular-nums">{formatBytes(detailedSession.inputOctets)}</p>
                    <p className="text-[10px] text-muted-foreground">Download</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                    <ArrowUpFromLine className="h-4 w-4 mx-auto text-orange-500 mb-1" />
                    <p className="text-sm font-bold tabular-nums">{formatBytes(detailedSession.outputOctets)}</p>
                    <p className="text-[10px] text-muted-foreground">Upload</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
                    <Activity className="h-4 w-4 mx-auto text-red-600 mb-1" />
                    <p className="text-sm font-bold tabular-nums">{formatBytes(detailedSession.totalOctets)}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>

              {/* Events Timeline */}
              {detailedSession.events && detailedSession.events.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Session Events (Last {detailedSession.events.length})</h4>
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {detailedSession.events.map((ev) => (
                        <div key={ev.id} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/50">
                          <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(ev.createdAt)}</span>
                          {getEventBadge(ev.eventType)}
                          {ev.context && typeof ev.context === "object" && (
                            <span className="text-muted-foreground truncate max-w-[200px]" title={JSON.stringify(ev.context)}>
                              {ev.context.reason ? String(ev.context.reason) : ""}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Actions */}
              <Separator />
              <div className="flex gap-2 flex-wrap">
                {detailedSession.status === "ACTIVE" && (
                  <>
                    <Button variant="destructive" size="sm" onClick={() => { setDisconnectTarget(detailedSession); setDetailSessionId(null); }}>
                      <Unplug className="h-3.5 w-3.5 mr-1.5" />Disconnect
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setCoaTarget(detailedSession); resetCoaDialog(); setDetailSessionId(null); }}>
                      <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />Change Plan (CoA)
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => setDetailSessionId(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════
         DIALOG: Disconnect Confirmation
      ════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!disconnectTarget} onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Disconnect Session
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect this session?
              {disconnectTarget && (
                <span className="block mt-2 text-xs bg-muted p-2 rounded font-mono">
                  {disconnectTarget.username} ({disconnectTarget.subscriberName})
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Reason</Label>
              <Select value={disconnectReason} onValueChange={setDisconnectReason}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Administrative">Administrative</SelectItem>
                  <SelectItem value="Policy Violation">Policy Violation</SelectItem>
                  <SelectItem value="Plan Change">Plan Change</SelectItem>
                  <SelectItem value="Maintenance">Maintenance</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {disconnectReason === "Other" && (
              <div>
                <Label className="text-xs">Custom Reason</Label>
                <Input value={disconnectCustomReason} onChange={(e) => setDisconnectCustomReason(e.target.value)} placeholder="Enter reason..." className="mt-1" />
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════════════════════════════════════════════════════════
         DIALOG: Bulk Disconnect
      ════════════════════════════════════════════════════════ */}
      <AlertDialog open={bulkDisconnectOpen} onOpenChange={setBulkDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Bulk Disconnect
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect {selectedIds.size} selected session(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleBulkDisconnect}
              disabled={bulkDisconnectMutation.isPending}
            >
              {bulkDisconnectMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Disconnect {selectedIds.size} Sessions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════════════════════════════════════════════════════════
         DIALOG: CoA (Change of Authorization)
      ════════════════════════════════════════════════════════ */}
      <Dialog open={!!coaTarget} onOpenChange={(open) => { if (!open) setCoaTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="h-5 w-5 text-amber-500" />
              Change of Authorization (CoA)
            </DialogTitle>
            <DialogDescription>Change plan or speed for this session</DialogDescription>
          </DialogHeader>

          {coaTarget && (
            <div className="space-y-4">
              {/* Current Info */}
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs font-medium mb-1">Current Configuration</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Plan:</span> <span className="font-medium">{coaTarget.planName || "—"}</span></div>
                  <div><span className="text-muted-foreground">Speed:</span> <span className="font-bold">{formatSpeed(coaTarget.speedDownKbps)} / {formatSpeed(coaTarget.speedUpKbps)}</span></div>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex gap-2">
                <Button variant={coaMode === "plan" ? "default" : "outline"} size="sm" onClick={() => setCoaMode("plan")} className="flex-1">
                  Change Plan
                </Button>
                <Button variant={coaMode === "manual" ? "default" : "outline"} size="sm" onClick={() => setCoaMode("manual")} className="flex-1">
                  Manual Speed
                </Button>
              </div>

              {/* Plan Selection */}
              {coaMode === "plan" && (
                <div>
                  <Label className="text-xs">Select New Plan</Label>
                  <Select value={coaNewPlanId} onValueChange={setCoaNewPlanId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a plan..." /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {formatSpeed(p.downloadSpeed)}/{formatSpeed(p.uploadSpeed)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Manual Speed Input */}
              {coaMode === "manual" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Download Speed (Kbps)</Label>
                    <Input type="number" placeholder="e.g. 10240" value={coaManualDown} onChange={(e) => setCoaManualDown(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Upload Speed (Kbps)</Label>
                    <Input type="number" placeholder="e.g. 5120" value={coaManualUp} onChange={(e) => setCoaManualUp(e.target.value)} className="mt-1" />
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <Label className="text-xs">Reason</Label>
                <Input placeholder="Optional reason for CoA..." value={coaReason} onChange={(e) => setCoaReason(e.target.value)} className="mt-1" />
              </div>

              {/* Preview */}
              {((coaMode === "plan" && coaNewPlanId) || (coaMode === "manual" && coaManualDown)) && (
                <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
                  <p className="text-xs font-medium mb-1 text-green-700 dark:text-green-400">Preview</p>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current:</span>
                      <span className="line-through">{formatSpeed(coaTarget.speedDownKbps)} / {formatSpeed(coaTarget.speedUpKbps)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span className="text-muted-foreground">New:</span>
                      {coaMode === "plan" && coaNewPlanId ? (
                        <span>
                          {formatSpeed(plans.find(p => p.id === coaNewPlanId)?.downloadSpeed || 0)} / {formatSpeed(plans.find(p => p.id === coaNewPlanId)?.uploadSpeed || 0)}
                        </span>
                      ) : (
                        <span>{formatSpeed(parseInt(coaManualDown) || 0)} / {formatSpeed(parseInt(coaManualUp) || 0)}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setCoaTarget(null)}>Cancel</Button>
                <Button
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={handleCoA}
                  disabled={
                    coaMutation.isPending ||
                    (coaMode === "plan" && !coaNewPlanId) ||
                    (coaMode === "manual" && !coaManualDown)
                  }
                >
                  {coaMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ArrowUpDown className="h-4 w-4 mr-1.5" />}
                  Apply CoA
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════
         DIALOG: Policy Enforcement Confirmation
      ════════════════════════════════════════════════════════ */}
      <AlertDialog open={enforceOpen} onOpenChange={setEnforceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-[#DC2626]" />
              Run Policy Enforcement
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will check all active sessions against data limits, session timeouts, and idle timeouts. Sessions exceeding limits will be automatically disconnected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#DC2626] hover:bg-red-700"
              onClick={() => enforceMutation.mutate()}
              disabled={enforceMutation.isPending}
            >
              {enforceMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />}
              Run Enforcement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
