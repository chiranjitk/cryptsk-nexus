"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatINR } from "@/lib/utils";
import {
  Wifi, Radio, Activity, Server, Signal, Clock, ArrowUp, ArrowDown, Zap, Shield,
  Settings, Play, Square, BarChart3, Users, Globe, RefreshCw, Search, Filter,
  Download, Trash2, Edit, Plus, X, CheckCircle, XCircle, AlertTriangle,
  ChevronRight, MoreHorizontal, Eye, Loader2, RadioTower, Gauge,
  Terminal, TrendingUp, Network, CircleDot, StopCircle, Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────
interface DashboardStats {
  activeSessions: number;
  totalSessionsToday: number;
  peakConcurrent: number;
  totalDataGB: number;
  avgSpeedMbps: number;
  revenue: number;
}

interface WifiSession {
  id: string;
  sessionId: string;
  imsi: string;
  msisdn: string;
  mac: string;
  apName: string;
  method: string;
  downloadBytes: number;
  uploadBytes: number;
  duration: number;
  speedDown: number;
  speedUp: number;
  status: string;
  startTime: string;
  policyId?: string;
  policyName?: string;
  ipAddress?: string;
  qosDown?: number;
  qosUp?: number;
}

interface DiameterPeer {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  realm?: string;
  priority?: number;
  status: string;
  isSimulator: boolean;
  messagesIn: number;
  messagesOut: number;
  lastPing?: string;
  createdAt?: string;
}

interface WifiPolicy {
  id: string;
  name: string;
  imsiPrefix: string;
  speedDown: number;
  speedUp: number;
  dataLimitGB: number;
  sessionTimeout: number;
  fupSpeedDown: number;
  fupSpeedUp: number;
  active: boolean;
  description?: string;
}

interface WifiEvent {
  id: string;
  timestamp: string;
  interface: string;
  direction: string;
  sessionId?: string;
  statusCode: number;
  details: string;
  ccRequestType?: string;
  ccResultCode?: number;
  grantedUnits?: string;
  usedUnits?: string;
  qosChange?: string;
}

interface EventStats {
  totalEvents: number;
  successCount: number;
  failureCount: number;
  byInterface: Record<string, number>;
  byDirection: Record<string, number>;
}

// ─── API helper ─────────────────────────────────────────────────────
function fetchWifiApi(type: string, params?: Record<string, string>) {
  const query = params ? "&" + new URLSearchParams(params).toString() : "";
  return apiFetch(`/api/wifi-offload?type=${type}${query}`);
}

function postProxy(body: Record<string, unknown>) {
  return apiFetch("/api/wifi-offload/proxy", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Color constants ────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  TERMINATED: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400",
  QUOTA_EXHAUSTED: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
};

const IFACE_BADGE: Record<string, string> = {
  Gy: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  Gx: "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400",
  SWa: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  Rx: "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
};

const PEER_TYPE_BADGE: Record<string, string> = {
  PCRF: "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400",
  OCS: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  HSS: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400",
  BNG: "bg-teal-100 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400",
  WLC: "bg-pink-100 text-pink-700 dark:bg-pink-950/30 dark:text-pink-400",
};

const SCENARIOS = [
  { id: "airport-rush", label: "Airport Rush Hour", icon: Plane, desc: "500 users, high turnover" },
  { id: "hotel-checkin", label: "Hotel Check-in", icon: Users, desc: "200 users, steady growth" },
  { id: "mall-weekend", label: "Mall Weekend", icon: Globe, desc: "1000 users, mixed traffic" },
  { id: "corporate-meeting", label: "Corporate Meeting", icon: Shield, desc: "50 users, high bandwidth" },
  { id: "quota-exhaustion", label: "Quota Exhaustion", icon: AlertTriangle, desc: "Test quota triggers" },
] as const;

function Plane(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
    </svg>
  );
}

// ─── Helper functions ────────────────────────────────────────────────
function fmtBytesMB(n: number): string {
  if (!n) return "0";
  return (n / (1024 * 1024)).toFixed(1);
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const d = Date.now() - new Date(dateStr).getTime();
  if (d < 60000) return "Just now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function truncId(id: string, len = 8): string {
  if (!id) return "—";
  return id.length > len ? id.slice(0, len) + "…" : id;
}

// ─── Skeleton helpers ───────────────────────────────────────────────
function SkeletonCard() {
  return <Skeleton className="h-28 rounded-lg" />;
}

function SkeletonTable({ rows = 5, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Pagination component ───────────────────────────────────────────
function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  let start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button>
        {pages.map((p) => (
          <Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => setPage(p)}>{p}</Button>
        ))}
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── MAIN COMPONENT ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
export default function WifiOffloadPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");

  // ── Tab 1: Dashboard state ──
  // ── Tab 2: Simulator state ──
  const [simRunning, setSimRunning] = useState(false);
  const [simResults, setSimResults] = useState<Record<string, unknown> | null>(null);
  const [loadForm, setLoadForm] = useState({ userCount: "100", duration: "60", policyId: "__none__" });
  const simPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Tab 3: Sessions state ──
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionStatus, setSessionStatus] = useState("ALL");
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionDetail, setSessionDetail] = useState<WifiSession | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<WifiSession | null>(null);

  // ── Tab 4: Peers state ──
  const [peerDialogOpen, setPeerDialogOpen] = useState(false);
  const [editingPeer, setEditingPeer] = useState<DiameterPeer | null>(null);
  const [peerForm, setPeerForm] = useState({ name: "", type: "PCRF", host: "", port: "3868", realm: "", priority: "1", isSimulator: false });
  const [peerDetail, setPeerDetail] = useState<DiameterPeer | null>(null);
  const [deletePeerTarget, setDeletePeerTarget] = useState<DiameterPeer | null>(null);

  // ── Tab 5: Policies state ──
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<WifiPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState({
    name: "", imsiPrefix: "", speedDown: "10", speedUp: "5", dataLimitGB: "1",
    sessionTimeout: "3600", fupSpeedDown: "2", fupSpeedUp: "1", active: true, description: "",
  });
  const [deletePolicyTarget, setDeletePolicyTarget] = useState<WifiPolicy | null>(null);

  // ── Tab 6: Gy state ──
  const [gyDirFilter, setGyDirFilter] = useState("ALL");
  const [gyResultFilter, setGyResultFilter] = useState("ALL");

  // ── Tab 7: Gx state ──
  const [gxSessionId, setGxSessionId] = useState("");
  const [gxNewDown, setGxNewDown] = useState("");
  const [gxNewUp, setGxNewUp] = useState("");

  // ── Tab 8: Events state ──
  const [eventIfaceFilter, setEventIfaceFilter] = useState("ALL");
  const [eventDirFilter, setEventDirFilter] = useState("ALL");
  const [eventStatusSearch, setEventStatusSearch] = useState("");
  const [eventPage, setEventPage] = useState(1);
  const [clearEventsOpen, setClearEventsOpen] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  // ──────────────────────────────────────────────────────────────────
  // QUERIES
  // ──────────────────────────────────────────────────────────────────

  // Dashboard stats
  const { data: dashboardData, isLoading: dashLoading } = useQuery<DashboardStats>({
    queryKey: ["wo-dashboard"],
    queryFn: () => fetchWifiApi("dashboard"),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Peers
  const { data: peersData, isLoading: peersLoading } = useQuery<{ peers: DiameterPeer[] }>({
    queryKey: ["wo-peers"],
    queryFn: () => fetchWifiApi("peers"),
    staleTime: 30_000,
  });

  // Policies
  const { data: policiesData, isLoading: policiesLoading } = useQuery<{ policies: WifiPolicy[] }>({
    queryKey: ["wo-policies"],
    queryFn: () => fetchWifiApi("policies"),
    staleTime: 30_000,
  });

  // Sessions (Tab 3)
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{ sessions: WifiSession[]; total: number }>({
    queryKey: ["wo-sessions", sessionStatus, sessionSearch, sessionPage],
    queryFn: () => fetchWifiApi("sessions", {
      status: sessionStatus || "ALL",
      search: sessionSearch || "",
      page: String(sessionPage),
      limit: "20",
    }),
    staleTime: 15_000,
    enabled: tab === "sessions",
    refetchInterval: tab === "sessions" && sessionStatus === "ACTIVE" ? 15_000 : false,
  });

  // Events (Tab 8 / general)
  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: WifiEvent[]; total: number }>({
    queryKey: ["wo-events", eventIfaceFilter, eventDirFilter, eventStatusSearch, eventPage],
    queryFn: () => fetchWifiApi("events", {
      interface: eventIfaceFilter !== "ALL" ? eventIfaceFilter : undefined,
      direction: eventDirFilter !== "ALL" ? eventDirFilter : undefined,
      statusCode: eventStatusSearch || undefined,
      page: String(eventPage),
      limit: "50",
    }),
    staleTime: 10_000,
    enabled: tab === "events",
  });

  // Event stats
  const { data: eventStatsData, isLoading: eventStatsLoading } = useQuery<EventStats>({
    queryKey: ["wo-event-stats"],
    queryFn: () => fetchWifiApi("event-stats"),
    staleTime: 30_000,
  });

  // Recent events for dashboard (Tab 1)
  const { data: recentEventsData } = useQuery<{ events: WifiEvent[] }>({
    queryKey: ["wo-recent-events"],
    queryFn: () => fetchWifiApi("events", { limit: "10" }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Gy events (Tab 6)
  const { data: gyEventsData, isLoading: gyLoading } = useQuery<{ events: WifiEvent[] }>({
    queryKey: ["wo-gy-events", gyDirFilter, gyResultFilter],
    queryFn: () => fetchWifiApi("events", {
      interface: "Gy",
      direction: gyDirFilter !== "ALL" ? gyDirFilter : undefined,
      limit: "50",
    }),
    staleTime: 10_000,
    enabled: tab === "gy",
  });

  // Gx events (Tab 7)
  const { data: gxEventsData, isLoading: gxLoading } = useQuery<{ events: WifiEvent[] }>({
    queryKey: ["wo-gx-events"],
    queryFn: () => fetchWifiApi("events", { interface: "Gx", limit: "50" }),
    staleTime: 10_000,
    enabled: tab === "gx",
  });

  // Session trend for dashboard (fetch from sessions endpoint)
  const { data: sessionTrendData } = useQuery<{ sessions: WifiSession[] }>({
    queryKey: ["wo-session-trend"],
    queryFn: () => fetchWifiApi("sessions", { limit: "1000" }),
    staleTime: 60_000,
    enabled: tab === "dashboard",
  });

  // Sim live events (polling during simulation)
  const { data: simLiveEvents, isLoading: simLiveLoading } = useQuery<{ events: WifiEvent[] }>({
    queryKey: ["wo-sim-events"],
    queryFn: () => fetchWifiApi("events", { limit: "20" }),
    refetchInterval: simRunning ? 2000 : false,
    enabled: simRunning,
  });

  // ──────────────────────────────────────────────────────────────────
  // DERIVED DATA
  // ──────────────────────────────────────────────────────────────────
  const _raw = dashboardData as Record<string, unknown> | undefined;
  const dashboard = {
    activeSessions: (_raw?.activeSessions as number) ?? 0,
    totalSessionsToday: (_raw?.totalToday as number) ?? (_raw?.totalSessionsToday as number) ?? 0,
    peakConcurrent: (_raw?.peakConcurrent as number) ?? 0,
    totalDataGB: (_raw?.totalDataGB as number) ?? (_raw?.totalDataGb as number) ?? 0,
    avgSpeedMbps: (_raw?.avgSpeedMbps as number) ?? 0,
    revenue: (_raw?.revenue as number) ?? (_raw?.revenueToday as number) ?? 0,
  };
  const peers: DiameterPeer[] = peersData?.peers || [];
  const policies: WifiPolicy[] = policiesData?.policies || [];
  const sessions: WifiSession[] = sessionsData?.sessions || [];
  const sessionsTotal = sessionsData?.total || sessions.length;
  const events: WifiEvent[] = eventsData?.events || [];
  const eventsTotal = eventsData?.total || events.length;
  const recentEvents: WifiEvent[] = recentEventsData?.events || [];
  const gyEvents: WifiEvent[] = gyEventsData?.events || [];
  const gxEvents: WifiEvent[] = gxEventsData?.events || [];
  const eventStats = eventStatsData || { totalEvents: 0, successCount: 0, failureCount: 0, byInterface: {}, byDirection: {} };
  const simEvents: WifiEvent[] = simLiveEvents?.events || [];
  const allSessions: WifiSession[] = sessionTrendData?.sessions || [];

  // Session trend: group by day (last 7 days)
  const sessionTrend = (() => {
    const now = new Date();
    const days: Record<string, { date: string; sessions: number; active: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days[key] = { date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), sessions: 0, active: 0 };
    }
    for (const s of allSessions) {
      const key = s.startTime?.slice(0, 10);
      if (key && days[key]) {
        days[key].sessions++;
        if (s.status === "ACTIVE") days[key].active++;
      }
    }
    return Object.values(days);
  })();

  // Top APs by active sessions
  const topAPs = (() => {
    const counts: Record<string, number> = {};
    for (const s of allSessions) {
      if (s.apName && s.status === "ACTIVE") {
        counts[s.apName] = (counts[s.apName] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name: name.length > 15 ? name.slice(0, 15) + "…" : name, count }));
  })();

  // Peer status summary
  const peerConnected = peers.filter((p) => p.status === "CONNECTED").length;
  const peerDisconnected = peers.length - peerConnected;

  // Gy success rate
  const gySuccessRate = eventStats.totalEvents > 0
    ? ((eventStats.successCount / eventStats.totalEvents) * 100).toFixed(1)
    : "0";

  const donutData = [
    { name: "Success", value: eventStats.successCount || 0, color: "#10B981" },
    { name: "Failure", value: eventStats.failureCount || 0, color: "#EF4444" },
  ];

  // Active sessions for Gx QoS rules
  const activeSessionsForGx = allSessions.filter((s) => s.status === "ACTIVE");

  // ──────────────────────────────────────────────────────────────────
  // MUTATIONS
  // ──────────────────────────────────────────────────────────────────
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["wo-dashboard"] });
    qc.invalidateQueries({ queryKey: ["wo-peers"] });
    qc.invalidateQueries({ queryKey: ["wo-policies"] });
    qc.invalidateQueries({ queryKey: ["wo-sessions"] });
    qc.invalidateQueries({ queryKey: ["wo-events"] });
    qc.invalidateQueries({ queryKey: ["wo-event-stats"] });
    qc.invalidateQueries({ queryKey: ["wo-recent-events"] });
    qc.invalidateQueries({ queryKey: ["wo-gy-events"] });
    qc.invalidateQueries({ queryKey: ["wo-gx-events"] });
    qc.invalidateQueries({ queryKey: ["wo-session-trend"] });
    qc.invalidateQueries({ queryKey: ["wo-sim-events"] });
  };

  // Scenario mutation
  const scenarioMut = useMutation({
    mutationFn: (scenarioId: string) => postProxy({ action: "scenario", scenarioId }),
    onSuccess: (data) => {
      toast.success("Scenario started");
      setSimResults(data as Record<string, unknown>);
      setSimRunning(true);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Load test mutation
  const loadTestMut = useMutation({
    mutationFn: () => postProxy({
      action: "load-test",
      userCount: parseInt(loadForm.userCount) || 100,
      duration: parseInt(loadForm.duration) || 60,
      policyId: loadForm.policyId || undefined,
    }),
    onSuccess: (data) => {
      toast.success("Load test started");
      setSimResults(data as Record<string, unknown>);
      setSimRunning(true);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Stop simulation
  const stopSimMut = useMutation({
    mutationFn: () => postProxy({ action: "stop-simulation" }),
    onSuccess: () => {
      toast.success("Simulation stopped");
      setSimRunning(false);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Force disconnect session
  const disconnectMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/wifi-offload/${id}?type=session`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Session disconnected");
      setDisconnectTarget(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Peer mutations
  const peerSaveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => postProxy({
      action: editingPeer ? "peer-update" : "peer-create",
      ...body,
    }),
    onSuccess: () => {
      toast.success(editingPeer ? "Peer updated" : "Peer added");
      setPeerDialogOpen(false);
      setEditingPeer(null);
      resetPeerForm();
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const peerPingMut = useMutation({
    mutationFn: (peerId: string) => postProxy({ action: "peer-ping", peerId }),
    onSuccess: () => { toast.success("Ping sent"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const peerConnectMut = useMutation({
    mutationFn: (peerId: string) => postProxy({ action: "peer-connect", peerId }),
    onSuccess: () => { toast.success("Peer connecting..."); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const peerDisconnectMut = useMutation({
    mutationFn: (peerId: string) => postProxy({ action: "peer-disconnect", peerId }),
    onSuccess: () => { toast.success("Peer disconnected"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const peerDeleteMut = useMutation({
    mutationFn: (peerId: string) => postProxy({ action: "peer-delete", peerId }),
    onSuccess: () => {
      toast.success("Peer deleted");
      setDeletePeerTarget(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Policy mutations
  const policySaveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => postProxy({
      action: editingPolicy ? "policy-update" : "policy-create",
      ...body,
    }),
    onSuccess: () => {
      toast.success(editingPolicy ? "Policy updated" : "Policy created");
      setPolicyDialogOpen(false);
      setEditingPolicy(null);
      resetPolicyForm();
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const policyTestMut = useMutation({
    mutationFn: (policyId: string) => postProxy({ action: "test-policy", policyId }),
    onSuccess: () => { toast.success("Policy test session created"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const policyDeleteMut = useMutation({
    mutationFn: (policyId: string) => postProxy({ action: "policy-delete", policyId }),
    onSuccess: () => {
      toast.success("Policy deleted");
      setDeletePolicyTarget(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Gx push QoS mutation
  const gxPushMut = useMutation({
    mutationFn: () => postProxy({
      action: "gx-push",
      sessionId: gxSessionId,
      qosDown: parseInt(gxNewDown) || 0,
      qosUp: parseInt(gxNewUp) || 0,
    }),
    onSuccess: () => { toast.success("QoS change pushed"); setGxSessionId(""); setGxNewDown(""); setGxNewUp(""); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Export events
  const exportMut = useMutation({
    mutationFn: async () => {
      const blob = await fetch("/api/wifi-offload?type=events&limit=1000&export=csv")
        .then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wifi-offload-events-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => toast.success("Events exported as CSV"),
    onError: () => toast.error("Export failed"),
  });

  // Clear events
  const clearEventsMut = useMutation({
    mutationFn: () => apiFetch("/api/wifi-offload?type=events", { method: "DELETE" }),
    onSuccess: () => {
      toast.success("All events cleared");
      setClearEventsOpen(false);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ──────────────────────────────────────────────────────────────────
  // FORM HELPERS
  // ──────────────────────────────────────────────────────────────────
  function resetPeerForm() {
    setPeerForm({ name: "", type: "PCRF", host: "", port: "3868", realm: "", priority: "1", isSimulator: false });
  }

  function resetPolicyForm() {
    setPolicyForm({
      name: "", imsiPrefix: "", speedDown: "10", speedUp: "5", dataLimitGB: "1",
      sessionTimeout: "3600", fupSpeedDown: "2", fupSpeedUp: "1", active: true, description: "",
    });
  }

  function openPeerCreate() {
    setEditingPeer(null);
    resetPeerForm();
    setPeerDialogOpen(true);
  }

  function openPeerEdit(p: DiameterPeer) {
    setEditingPeer(p);
    setPeerForm({
      name: p.name, type: p.type, host: p.host, port: String(p.port),
      realm: p.realm || "", priority: String(p.priority || 1), isSimulator: p.isSimulator,
    });
    setPeerDialogOpen(true);
  }

  function savePeer() {
    if (!peerForm.name) return toast.error("Name is required");
    const body: Record<string, unknown> = {
      name: peerForm.name,
      type: peerForm.type,
      host: peerForm.host,
      port: parseInt(peerForm.port) || 3868,
      realm: peerForm.realm || undefined,
      priority: parseInt(peerForm.priority) || 1,
      isSimulator: peerForm.isSimulator,
    };
    if (editingPeer) body.id = editingPeer.id;
    peerSaveMut.mutate(body);
  }

  function openPolicyCreate() {
    setEditingPolicy(null);
    resetPolicyForm();
    setPolicyDialogOpen(true);
  }

  function openPolicyEdit(p: WifiPolicy) {
    setEditingPolicy(p);
    setPolicyForm({
      name: p.name, imsiPrefix: p.imsiPrefix, speedDown: String(p.speedDown), speedUp: String(p.speedUp),
      dataLimitGB: String(p.dataLimitGB), sessionTimeout: String(p.sessionTimeout),
      fupSpeedDown: String(p.fupSpeedDown || 0), fupSpeedUp: String(p.fupSpeedUp || 0),
      active: p.active, description: p.description || "",
    });
    setPolicyDialogOpen(true);
  }

  function savePolicy() {
    if (!policyForm.name) return toast.error("Name is required");
    const body: Record<string, unknown> = {
      name: policyForm.name,
      imsiPrefix: policyForm.imsiPrefix,
      speedDown: parseFloat(policyForm.speedDown) || 0,
      speedUp: parseFloat(policyForm.speedUp) || 0,
      dataLimitGB: parseFloat(policyForm.dataLimitGB) || 0,
      sessionTimeout: parseInt(policyForm.sessionTimeout) || 3600,
      fupSpeedDown: parseFloat(policyForm.fupSpeedDown) || 0,
      fupSpeedUp: parseFloat(policyForm.fupSpeedUp) || 0,
      active: policyForm.active,
      description: policyForm.description || undefined,
    };
    if (editingPolicy) body.id = editingPolicy.id;
    policySaveMut.mutate(body);
  }

  // ──────────────────────────────────────────────────────────────────
  // CSV EXPORT HELPER
  // ──────────────────────────────────────────────────────────────────
  function downloadCSV(data: WifiEvent[], filename: string) {
    if (!data.length) return toast.error("No data to export");
    const headers = ["Timestamp", "Interface", "Direction", "Session ID", "Status Code", "Details"];
    const rows = data.map((e) => [e.timestamp, e.interface, e.direction, e.sessionId || "", String(e.statusCode), e.details]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success("CSV exported");
  }

  // ──────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────
  const totalSessionsPages = Math.ceil(sessionsTotal / 20);
  const totalEventsPages = Math.ceil(eventsTotal / 50);

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* ─── Header ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Wifi className="h-6 w-6 text-emerald-600" /> WiFi Offload
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              3GPP WiFi offload with Diameter Gy/Gx credit & policy control
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => invalidateAll()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
            </Button>
          </div>
        </div>

        {/* ─── Tabs ─── */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="dashboard"><Activity className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Dashboard</span></TabsTrigger>
            <TabsTrigger value="simulator"><Terminal className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Simulator</span></TabsTrigger>
            <TabsTrigger value="sessions"><Users className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Sessions</span></TabsTrigger>
            <TabsTrigger value="peers"><Server className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Peers</span></TabsTrigger>
            <TabsTrigger value="policies"><Shield className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Policies</span></TabsTrigger>
            <TabsTrigger value="gy"><Radio className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Gy CC</span></TabsTrigger>
            <TabsTrigger value="gx"><Gauge className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Gx Policy</span></TabsTrigger>
            <TabsTrigger value="events"><BarChart3 className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Events</span></TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════
              TAB 1: DASHBOARD
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="dashboard">
            {dashLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <div className="space-y-6">
                {/* 6 Stat Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { label: "Active Sessions", value: dashboard.activeSessions, icon: Users, color: "bg-emerald-100 dark:bg-emerald-950/30", ic: "text-emerald-600" },
                    { label: "Sessions Today", value: dashboard.totalSessionsToday, icon: Clock, color: "bg-amber-100 dark:bg-amber-950/30", ic: "text-amber-600" },
                    { label: "Peak Concurrent", value: dashboard.peakConcurrent, icon: TrendingUp, color: "bg-purple-100 dark:bg-purple-950/30", ic: "text-purple-600" },
                    { label: "Total Data", value: `${dashboard.totalDataGB.toFixed(1)} GB`, icon: Download, color: "bg-blue-100 dark:bg-blue-950/30", ic: "text-blue-600" },
                    { label: "Avg Speed", value: `${dashboard.avgSpeedMbps.toFixed(1)} Mbps`, icon: Zap, color: "bg-orange-100 dark:bg-orange-950/30", ic: "text-orange-600" },
                    { label: "Revenue", value: formatINR(dashboard.revenue), icon: Activity, color: "bg-red-100 dark:bg-red-950/30", ic: "text-red-600" },
                  ].map((s, i) => (
                    <Card key={i} className="border shadow-sm animate-card-enter" style={{ animationDelay: `${i * 60}ms` }}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`p-1.5 rounded-md ${s.color}`}><s.icon className={`h-4 w-4 ${s.ic}`} /></div>
                          <span className="text-[11px] text-muted-foreground">{s.label}</span>
                        </div>
                        <p className="text-xl font-bold tabular-nums">{s.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Session Trend Area Chart */}
                  <Card className="border shadow-sm lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-600" />Session Trend (7 Days)</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {sessionTrend.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={sessionTrend}>
                            <defs>
                              <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                            <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
                            <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                            <Area type="monotone" dataKey="sessions" stroke="#10B981" fill="url(#dashGrad)" strokeWidth={2} />
                            <Area type="monotone" dataKey="active" stroke="#3B82F6" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No trend data</div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Top APs */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><RadioTower className="h-4 w-4 text-orange-600" />Top APs</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {topAPs.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={topAPs} layout="vertical">
                            <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                            <YAxis dataKey="name" type="category" width={80} tick={{ fill: "#94A3B8", fontSize: 10 }} />
                            <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                            <Bar dataKey="count" fill="#F97316" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <EmptyState icon={RadioTower} title="No AP data" description="AP usage will appear when sessions are active" size="sm" />
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Recent Events Feed */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-blue-600" />Recent Events</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {recentEvents.length > 0 ? (
                        <div className="max-h-72 overflow-y-auto space-y-2">
                          {recentEvents.map((e) => (
                            <div key={e.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 text-sm">
                              <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 ${IFACE_BADGE[e.interface] || "bg-slate-100 text-slate-600"}`}>{e.interface}</Badge>
                              <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 ${e.direction === "IN" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{e.direction}</Badge>
                              <span className="text-xs text-muted-foreground truncate flex-1">{e.details || `Code ${e.statusCode}`}</span>
                              <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(e.timestamp)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState icon={BarChart3} title="No events yet" description="Events will appear as Diameter transactions occur" size="sm" />
                      )}
                    </CardContent>
                  </Card>

                  {/* Simulator / Peer Status */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4 text-violet-600" />Diameter Peer Status</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {peersLoading ? (
                        <SkeletonTable rows={3} cols={3} />
                      ) : peers.length > 0 ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full bg-emerald-500" />
                                <span className="text-sm font-medium">{peerConnected} Connected</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full bg-red-500" />
                                <span className="text-sm font-medium">{peerDisconnected} Disconnected</span>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">{peers.length} total</Badge>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {peers.map((p) => (
                              <div key={p.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-muted/50">
                                <div className={`h-2.5 w-2.5 rounded-full ${p.status === "CONNECTED" ? "bg-emerald-500" : "bg-red-500"}`} />
                                <span className="font-medium truncate flex-1">{p.name}</span>
                                <Badge variant="outline" className={`text-[10px] ${PEER_TYPE_BADGE[p.type] || ""}`}>{p.type}</Badge>
                                {p.isSimulator && <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-600">SIM</Badge>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <EmptyState icon={Server} title="No peers configured" description="Add Diameter peers in the Peers tab" size="sm" />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 2: SIMULATOR CONTROL
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="simulator">
            <div className="space-y-6">
              {/* Simulator Status */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-emerald-600" />
                    Simulator Status
                    {simRunning && (
                      <span className="flex items-center gap-1 ml-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs text-emerald-600 font-medium">RUNNING</span>
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${peerConnected > 0 ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className="text-sm">Diameter Service: <strong>{peerConnected > 0 ? "Connected" : "Disconnected"}</strong></span>
                    </div>
                    <div className="text-sm">Active Peers: <strong>{peerConnected}/{peers.length}</strong></div>
                    <div className="text-sm">Active Sessions: <strong>{dashboard.activeSessions}</strong></div>
                    <div className="text-sm">Events Generated: <strong>{eventStats.totalEvents}</strong></div>
                  </div>
                </CardContent>
              </Card>

              {/* Run Scenario */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Play className="h-4 w-4 text-blue-600" />Run Scenario</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    {SCENARIOS.map((s) => (
                      <Button
                        key={s.id}
                        variant="outline"
                        className="h-auto p-4 flex flex-col items-center gap-2 hover:border-emerald-300 hover:bg-emerald-50/50"
                        onClick={() => scenarioMut.mutate(s.id)}
                        disabled={simRunning || scenarioMut.isPending}
                      >
                        <s.icon className="h-6 w-6 text-muted-foreground" />
                        <span className="text-sm font-medium">{s.label}</span>
                        <span className="text-[11px] text-muted-foreground">{s.desc}</span>
                        {scenarioMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Load Test */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Gauge className="h-4 w-4 text-orange-600" />Load Test</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-col sm:flex-row items-end gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">User Count</Label>
                      <Input type="number" value={loadForm.userCount} onChange={(e) => setLoadForm({ ...loadForm, userCount: e.target.value })} className="w-32" placeholder="100" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Duration (sec)</Label>
                      <Input type="number" value={loadForm.duration} onChange={(e) => setLoadForm({ ...loadForm, duration: e.target.value })} className="w-32" placeholder="60" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Policy</Label>
                      <Select value={loadForm.policyId} onValueChange={(v) => setLoadForm({ ...loadForm, policyId: v })}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Default" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Default</SelectItem>
                          {policies.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => loadTestMut.mutate()}
                      disabled={simRunning || loadTestMut.isPending}
                    >
                      {loadTestMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      Run Load Test
                    </Button>
                    {simRunning && (
                      <Button variant="destructive" onClick={() => stopSimMut.mutate()} disabled={stopSimMut.isPending}>
                        {stopSimMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
                        Stop
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Results */}
              {simResults && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-violet-600" />Simulation Results</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold text-emerald-600">{String(simResults.totalSessions || 0)}</p>
                        <p className="text-xs text-muted-foreground">Total Sessions</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold text-blue-600">{String(simResults.peakConcurrent || 0)}</p>
                        <p className="text-xs text-muted-foreground">Peak Concurrent</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold text-purple-600">{typeof simResults.totalData === "number" ? fmtBytesMB(simResults.totalData as number) : String(simResults.totalData || "0")} MB</p>
                        <p className="text-xs text-muted-foreground">Total Data</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold text-orange-600">{String(simResults.eventsGenerated || 0)}</p>
                        <p className="text-xs text-muted-foreground">Events Generated</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Live Event Stream */}
              {simRunning && (
                <Card className="border shadow-sm border-emerald-200 dark:border-emerald-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Radio className="h-4 w-4 text-emerald-600 animate-pulse" />
                      Live Event Stream
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ScrollArea className="max-h-72">
                      {simLiveLoading ? (
                        <SkeletonTable rows={5} cols={5} />
                      ) : simEvents.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Time</TableHead>
                              <TableHead className="text-xs">Interface</TableHead>
                              <TableHead className="text-xs">Dir</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs">Details</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {simEvents.slice(0, 20).map((e) => (
                              <TableRow key={e.id}>
                                <TableCell className="text-xs font-mono">{timeAgo(e.timestamp)}</TableCell>
                                <TableCell><Badge variant="outline" className={`text-[10px] ${IFACE_BADGE[e.interface] || ""}`}>{e.interface}</Badge></TableCell>
                                <TableCell><Badge variant="outline" className={`text-[10px] ${e.direction === "IN" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{e.direction}</Badge></TableCell>
                                <TableCell><Badge variant="outline" className={`text-[10px] ${e.statusCode < 3000 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{e.statusCode}</Badge></TableCell>
                                <TableCell className="text-xs truncate max-w-[200px]">{e.details}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">Waiting for events...</p>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 3: SESSIONS
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="sessions">
            <div className="space-y-4">
              {/* Filters */}
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search IMSI, MSISDN, MAC, Session ID..."
                        value={sessionSearch}
                        onChange={(e) => { setSessionSearch(e.target.value); setSessionPage(1); }}
                        className="pl-9"
                      />
                    </div>
                    <Select value={sessionStatus} onValueChange={(v) => { setSessionStatus(v); setSessionPage(1); }}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Status</SelectItem>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="TERMINATED">Terminated</SelectItem>
                        <SelectItem value="QUOTA_EXHAUSTED">Quota Exhausted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Table */}
              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Session ID</TableHead>
                          <TableHead className="text-xs">IMSI</TableHead>
                          <TableHead className="text-xs">MSISDN</TableHead>
                          <TableHead className="text-xs">MAC</TableHead>
                          <TableHead className="text-xs">AP Name</TableHead>
                          <TableHead className="text-xs">Method</TableHead>
                          <TableHead className="text-xs text-right">Down (MB)</TableHead>
                          <TableHead className="text-xs text-right">Up (MB)</TableHead>
                          <TableHead className="text-xs">Duration</TableHead>
                          <TableHead className="text-xs">Speed</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Start Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessionsLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>{Array.from({ length: 12 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                          ))
                        ) : sessions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={12}>
                              <EmptyState icon={Users} title="No sessions found" description={sessionSearch ? "Try adjusting your search" : "Sessions will appear when users connect"} size="sm" />
                            </TableCell>
                          </TableRow>
                        ) : sessions.map((s) => (
                          <TableRow
                            key={s.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSessionDetail(s)}
                          >
                            <TableCell className="text-xs font-mono">{truncId(s.sessionId || s.id)}</TableCell>
                            <TableCell className="text-xs font-mono">{s.imsi || "—"}</TableCell>
                            <TableCell className="text-xs">{s.msisdn || "—"}</TableCell>
                            <TableCell className="text-xs font-mono">{s.mac || "—"}</TableCell>
                            <TableCell className="text-xs">{s.apName || "—"}</TableCell>
                            <TableCell className="text-xs">{s.method || "—"}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums">{fmtBytesMB(s.downloadBytes)}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums">{fmtBytesMB(s.uploadBytes)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{s.duration ? fmtDuration(s.duration) : "—"}</TableCell>
                            <TableCell className="text-xs">
                              {s.speedDown || s.speedUp ? (
                                <span className="flex items-center gap-1">
                                  <ArrowDown className="h-3 w-3 text-emerald-500" />{s.speedDown || 0}
                                  <span className="text-muted-foreground">/</span>
                                  <ArrowUp className="h-3 w-3 text-blue-500" />{s.speedUp || 0}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] font-semibold ${STATUS_BADGE[s.status] || "bg-slate-100 text-slate-600"}`}>
                                {s.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{timeAgo(s.startTime)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Pagination page={sessionPage} totalPages={totalSessionsPages} setPage={setSessionPage} />
            </div>

            {/* Session Detail Dialog */}
            <Dialog open={!!sessionDetail} onOpenChange={(o) => !o && setSessionDetail(null)}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">Session Details</DialogTitle>
                </DialogHeader>
                {sessionDetail && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      { label: "Session ID", value: sessionDetail.sessionId || sessionDetail.id },
                      { label: "IMSI", value: sessionDetail.imsi },
                      { label: "MSISDN", value: sessionDetail.msisdn },
                      { label: "MAC Address", value: sessionDetail.mac },
                      { label: "IP Address", value: sessionDetail.ipAddress },
                      { label: "AP Name", value: sessionDetail.apName },
                      { label: "Method", value: sessionDetail.method },
                      { label: "Policy", value: sessionDetail.policyName },
                      { label: "Download", value: `${fmtBytesMB(sessionDetail.downloadBytes)} MB` },
                      { label: "Upload", value: `${fmtBytesMB(sessionDetail.uploadBytes)} MB` },
                      { label: "Duration", value: sessionDetail.duration ? fmtDuration(sessionDetail.duration) : "—" },
                      { label: "Speed (↓/↑)", value: `${sessionDetail.speedDown || 0} / ${sessionDetail.speedUp || 0} Mbps` },
                      { label: "Status", value: sessionDetail.status },
                      { label: "Start Time", value: sessionDetail.startTime ? new Date(sessionDetail.startTime).toLocaleString() : "—" },
                    ].map((row, i) => (
                      <div key={i}>
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        <p className="font-medium font-mono text-xs">{row.value || "—"}</p>
                      </div>
                    ))}
                    {sessionDetail.status === "ACTIVE" && (
                      <div className="col-span-2 mt-4 flex justify-end">
                        <Button variant="destructive" size="sm" onClick={() => { setDisconnectTarget(sessionDetail); }}>
                          <XCircle className="h-4 w-4 mr-1.5" />Force Disconnect
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Disconnect Confirmation */}
            <AlertDialog open={!!disconnectTarget} onOpenChange={(o) => !o && setDisconnectTarget(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will forcibly terminate session {truncId(disconnectTarget?.sessionId || disconnectTarget?.id || "")}. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => disconnectTarget && disconnectMut.mutate(disconnectTarget.id)}>
                    {disconnectMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 4: DIAMETER PEERS
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="peers">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openPeerCreate}>
                  <Plus className="h-4 w-4 mr-1.5" />Add Peer
                </Button>
              </div>

              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Host:Port</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Simulator</TableHead>
                          <TableHead className="text-xs text-right">Msg In/Out</TableHead>
                          <TableHead className="text-xs">Last Ping</TableHead>
                          <TableHead className="text-xs">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {peersLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                          ))
                        ) : peers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8}>
                              <EmptyState icon={Server} title="No Diameter peers" description="Add a peer to connect to your network" size="sm"
                                action={{ label: "Add Peer", onClick: openPeerCreate, icon: Plus }} />
                            </TableCell>
                          </TableRow>
                        ) : peers.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm font-medium cursor-pointer" onClick={() => setPeerDetail(p)}>{p.name}</TableCell>
                            <TableCell><Badge variant="outline" className={`text-[10px] font-semibold ${PEER_TYPE_BADGE[p.type] || "bg-slate-100 text-slate-600"}`}>{p.type}</Badge></TableCell>
                            <TableCell className="text-xs font-mono">{p.host}:{p.port}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <div className={`h-2.5 w-2.5 rounded-full ${p.status === "CONNECTED" ? "bg-emerald-500" : "bg-red-500"}`} />
                                <span className="text-xs">{p.status}</span>
                              </div>
                            </TableCell>
                            <TableCell>{p.isSimulator ? <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-600">SIM</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums">{p.messagesIn}/{p.messagesOut}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{timeAgo(p.lastPing)}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => peerPingMut.mutate(p.id)}><Zap className="h-4 w-4 mr-2" />Ping</DropdownMenuItem>
                                  {p.status !== "CONNECTED" && (
                                    <DropdownMenuItem onClick={() => peerConnectMut.mutate(p.id)}><Play className="h-4 w-4 mr-2" />Connect</DropdownMenuItem>
                                  )}
                                  {p.status === "CONNECTED" && (
                                    <DropdownMenuItem onClick={() => peerDisconnectMut.mutate(p.id)}><Square className="h-4 w-4 mr-2" />Disconnect</DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => openPeerEdit(p)}><Edit className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-red-600" onClick={() => setDeletePeerTarget(p)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Add/Edit Peer Dialog */}
            <Dialog open={peerDialogOpen} onOpenChange={(o) => { setPeerDialogOpen(o); if (!o) { setEditingPeer(null); resetPeerForm(); } }}>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{editingPeer ? "Edit" : "Add"} Diameter Peer</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div><Label className="text-sm">Name *</Label><Input value={peerForm.name} onChange={(e) => setPeerForm({ ...peerForm, name: e.target.value })} placeholder="OCS-Primary" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Type *</Label>
                      <Select value={peerForm.type} onValueChange={(v) => setPeerForm({ ...peerForm, type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["PCRF", "OCS", "HSS", "BNG", "WLC"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">Realm</Label>
                      <Input value={peerForm.realm} onChange={(e) => setPeerForm({ ...peerForm, realm: e.target.value })} placeholder="mnc.mcc.3gppnetwork.org" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label className="text-sm">Host *</Label><Input value={peerForm.host} onChange={(e) => setPeerForm({ ...peerForm, host: e.target.value })} placeholder="192.168.1.100" /></div>
                    <div><Label className="text-sm">Port</Label><Input type="number" value={peerForm.port} onChange={(e) => setPeerForm({ ...peerForm, port: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label className="text-sm">Priority</Label><Input type="number" value={peerForm.priority} onChange={(e) => setPeerForm({ ...peerForm, priority: e.target.value })} /></div>
                    <div className="flex items-center gap-3 pt-5">
                      <Switch checked={peerForm.isSimulator} onCheckedChange={(v) => setPeerForm({ ...peerForm, isSimulator: v })} />
                      <Label className="text-sm">Simulator Peer</Label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => { setPeerDialogOpen(false); setEditingPeer(null); }}>Cancel</Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={savePeer} disabled={!peerForm.name || peerSaveMut.isPending}>
                      {peerSaveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingPeer ? "Update" : "Add Peer"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Peer Detail Dialog */}
            <Dialog open={!!peerDetail} onOpenChange={(o) => !o && setPeerDetail(null)}>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Peer Details</DialogTitle></DialogHeader>
                {peerDetail && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      { label: "Name", value: peerDetail.name },
                      { label: "Type", value: peerDetail.type },
                      { label: "Host", value: peerDetail.host },
                      { label: "Port", value: String(peerDetail.port) },
                      { label: "Realm", value: peerDetail.realm },
                      { label: "Priority", value: String(peerDetail.priority) },
                      { label: "Status", value: peerDetail.status },
                      { label: "Simulator", value: peerDetail.isSimulator ? "Yes" : "No" },
                      { label: "Messages In", value: String(peerDetail.messagesIn) },
                      { label: "Messages Out", value: String(peerDetail.messagesOut) },
                      { label: "Last Ping", value: peerDetail.lastPing ? new Date(peerDetail.lastPing).toLocaleString() : "Never" },
                      { label: "Created", value: peerDetail.createdAt ? new Date(peerDetail.createdAt).toLocaleString() : "—" },
                    ].map((row, i) => (
                      <div key={i}>
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        <p className="font-medium">{row.value || "—"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Delete Peer Confirmation */}
            <AlertDialog open={!!deletePeerTarget} onOpenChange={(o) => !o && setDeletePeerTarget(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Peer?</AlertDialogTitle>
                  <AlertDialogDescription>Delete peer &quot;{deletePeerTarget?.name}&quot;? This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deletePeerTarget && peerDeleteMut.mutate(deletePeerTarget.id)}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 5: POLICIES
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="policies">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openPolicyCreate}>
                  <Plus className="h-4 w-4 mr-1.5" />Add Policy
                </Button>
              </div>

              {policiesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : policies.length === 0 ? (
                <EmptyState icon={Shield} title="No policies configured" description="Create a WiFi offload policy to control QoS and data limits"
                  action={{ label: "Add Policy", onClick: openPolicyCreate, icon: Plus }} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {policies.map((p) => (
                    <Card key={p.id} className="border shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-sm">{p.name}</h3>
                            <p className="text-xs text-muted-foreground">{p.imsiPrefix ? `IMSI: ${p.imsiPrefix}` : "All IMSIs"}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Switch checked={p.active} onCheckedChange={() => policySaveMut.mutate({ id: p.id, action: "policy-update", active: !p.active })} />
                          </div>
                        </div>
                        <Separator />
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Speed ↓</span>
                            <div className="flex items-center gap-2 flex-1 mx-3">
                              <Progress value={Math.min((p.speedDown / 100) * 100, 100)} className="h-2" />
                            </div>
                            <span className="font-medium">{p.speedDown} Mbps</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Speed ↑</span>
                            <div className="flex items-center gap-2 flex-1 mx-3">
                              <Progress value={Math.min((p.speedUp / 100) * 100, 100)} className="h-2" />
                            </div>
                            <span className="font-medium">{p.speedUp} Mbps</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded bg-muted/50">
                            <p className="text-muted-foreground">Data Limit</p>
                            <p className="font-medium">{p.dataLimitGB} GB</p>
                          </div>
                          <div className="p-2 rounded bg-muted/50">
                            <p className="text-muted-foreground">Session Timeout</p>
                            <p className="font-medium">{fmtDuration(p.sessionTimeout * 1000)}</p>
                          </div>
                        </div>
                        {p.fupSpeedDown > 0 && (
                          <p className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
                            FUP: {p.fupSpeedDown}/{p.fupSpeedUp} Mbps after quota
                          </p>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => policyTestMut.mutate(p.id)} disabled={policyTestMut.isPending}>
                            {policyTestMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}Test
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => openPolicyEdit(p)}>
                            <Edit className="h-3 w-3 mr-1" />Edit
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs text-red-600" onClick={() => setDeletePolicyTarget(p)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Add/Edit Policy Dialog */}
            <Dialog open={policyDialogOpen} onOpenChange={(o) => { setPolicyDialogOpen(o); if (!o) { setEditingPolicy(null); resetPolicyForm(); } }}>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingPolicy ? "Edit" : "Create"} Policy</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div><Label className="text-sm">Policy Name *</Label><Input value={policyForm.name} onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })} placeholder="Premium WiFi" /></div>
                  <div><Label className="text-sm">IMSI Prefix</Label><Input value={policyForm.imsiPrefix} onChange={(e) => setPolicyForm({ ...policyForm, imsiPrefix: e.target.value })} placeholder="405870 (leave empty for all)" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label className="text-sm">Speed Down (Mbps)</Label><Input type="number" value={policyForm.speedDown} onChange={(e) => setPolicyForm({ ...policyForm, speedDown: e.target.value })} /></div>
                    <div><Label className="text-sm">Speed Up (Mbps)</Label><Input type="number" value={policyForm.speedUp} onChange={(e) => setPolicyForm({ ...policyForm, speedUp: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label className="text-sm">Data Limit (GB)</Label><Input type="number" value={policyForm.dataLimitGB} onChange={(e) => setPolicyForm({ ...policyForm, dataLimitGB: e.target.value })} /></div>
                    <div><Label className="text-sm">Session Timeout (sec)</Label><Input type="number" value={policyForm.sessionTimeout} onChange={(e) => setPolicyForm({ ...policyForm, sessionTimeout: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label className="text-sm">FUP Speed Down (Mbps)</Label><Input type="number" value={policyForm.fupSpeedDown} onChange={(e) => setPolicyForm({ ...policyForm, fupSpeedDown: e.target.value })} /></div>
                    <div><Label className="text-sm">FUP Speed Up (Mbps)</Label><Input type="number" value={policyForm.fupSpeedUp} onChange={(e) => setPolicyForm({ ...policyForm, fupSpeedUp: e.target.value })} /></div>
                  </div>
                  <div><Label className="text-sm">Description</Label><Input value={policyForm.description} onChange={(e) => setPolicyForm({ ...policyForm, description: e.target.value })} placeholder="Optional description" /></div>
                  <div className="flex items-center gap-3">
                    <Switch checked={policyForm.active} onCheckedChange={(v) => setPolicyForm({ ...policyForm, active: v })} />
                    <Label className="text-sm">Active</Label>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => { setPolicyDialogOpen(false); setEditingPolicy(null); }}>Cancel</Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={savePolicy} disabled={!policyForm.name || policySaveMut.isPending}>
                      {policySaveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingPolicy ? "Update" : "Create"} Policy
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Delete Policy Confirmation */}
            <AlertDialog open={!!deletePolicyTarget} onOpenChange={(o) => !o && setDeletePolicyTarget(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Policy?</AlertDialogTitle>
                  <AlertDialogDescription>Delete policy &quot;{deletePolicyTarget?.name}&quot;? Active sessions using this policy may be affected.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deletePolicyTarget && policyDeleteMut.mutate(deletePolicyTarget.id)}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 6: Gy CREDIT CONTROL
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="gy">
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Donut chart */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Success Rate</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 flex flex-col items-center">
                    {eventStatsLoading ? (
                      <Skeleton className="h-32 w-32 rounded-full" />
                    ) : eventStats.totalEvents > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie
                              data={donutData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={60}
                              dataKey="value"
                              strokeWidth={2}
                            >
                              {donutData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <p className="text-2xl font-bold text-emerald-600">{gySuccessRate}%</p>
                      </>
                    ) : (
                      <EmptyState icon={Radio} title="No Gy events" size="sm" />
                    )}
                  </CardContent>
                </Card>

                {/* Summary */}
                <Card className="border shadow-sm lg:col-span-3">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Gy Transaction Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-xl font-bold">{eventStats.totalEvents}</p>
                        <p className="text-xs text-muted-foreground">Total Transactions</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                        <p className="text-xl font-bold text-emerald-600">{eventStats.successCount}</p>
                        <p className="text-xs text-muted-foreground">Successful</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                        <p className="text-xl font-bold text-red-600">{eventStats.failureCount}</p>
                        <p className="text-xs text-muted-foreground">Failed</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-xl font-bold">{eventStats.byInterface?.Gy || 0}</p>
                        <p className="text-xs text-muted-foreground">Gy Interface</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Filters */}
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Select value={gyDirFilter} onValueChange={setGyDirFilter}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Direction" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Directions</SelectItem>
                        <SelectItem value="IN">IN</SelectItem>
                        <SelectItem value="OUT">OUT</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={gyResultFilter} onValueChange={setGyResultFilter}>
                      <SelectTrigger className="w-48"><SelectValue placeholder="Result Code" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Result Codes</SelectItem>
                        <SelectItem value="2001">2001 (Success)</SelectItem>
                        <SelectItem value="4012">4012 (Quota Exhausted)</SelectItem>
                        <SelectItem value="5001">5001 (Error)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Transaction Log */}
              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  <ScrollArea className="max-h-[450px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Timestamp</TableHead>
                          <TableHead className="text-xs">Direction</TableHead>
                          <TableHead className="text-xs">Session ID</TableHead>
                          <TableHead className="text-xs">CC-Request-Type</TableHead>
                          <TableHead className="text-xs">Result-Code</TableHead>
                          <TableHead className="text-xs">Granted Units</TableHead>
                          <TableHead className="text-xs">Used Units</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gyLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                          ))
                        ) : gyEvents.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7}>
                              <EmptyState icon={Radio} title="No Gy transactions" description="Gy credit control events will appear here" size="sm" />
                            </TableCell>
                          </TableRow>
                        ) : (
                          gyEvents
                            .filter((e) => {
                              if (gyResultFilter === "ALL") return true;
                              return String(e.ccResultCode || e.statusCode) === gyResultFilter;
                            })
                            .map((e) => (
                              <TableRow key={e.id}>
                                <TableCell className="text-xs font-mono">{timeAgo(e.timestamp)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={`text-[10px] font-semibold ${e.direction === "IN" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{e.direction}</Badge>
                                </TableCell>
                                <TableCell className="text-xs font-mono">{truncId(e.sessionId || "")}</TableCell>
                                <TableCell className="text-xs">{e.ccRequestType || "—"}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={`text-[10px] font-semibold ${e.ccResultCode === 2001 || e.statusCode < 3000 ? "bg-emerald-50 text-emerald-600" : e.ccResultCode === 4012 || e.statusCode === 4012 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                                    {e.ccResultCode || e.statusCode}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">{e.grantedUnits || "—"}</TableCell>
                                <TableCell className="text-xs">{e.usedUnits || "—"}</TableCell>
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 7: Gx POLICY CONTROL
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="gx">
            <div className="space-y-4">
              {/* Push QoS Change */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Gauge className="h-4 w-4 text-purple-600" />Push QoS Change</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-col sm:flex-row items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Session ID</Label>
                      <Select value={gxSessionId} onValueChange={setGxSessionId}>
                        <SelectTrigger><SelectValue placeholder="Select session..." /></SelectTrigger>
                        <SelectContent>
                          {activeSessionsForGx.map((s) => (
                            <SelectItem key={s.id} value={s.sessionId || s.id}>
                              {truncId(s.sessionId || s.id, 12)} — {s.imsi || s.msisdn || s.mac}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">New Speed Down (Mbps)</Label>
                      <Input type="number" value={gxNewDown} onChange={(e) => setGxNewDown(e.target.value)} placeholder="20" className="w-32" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">New Speed Up (Mbps)</Label>
                      <Input type="number" value={gxNewUp} onChange={(e) => setGxNewUp(e.target.value)} placeholder="10" className="w-32" />
                    </div>
                    <Button
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={() => gxPushMut.mutate()}
                      disabled={!gxSessionId || !gxNewDown || !gxNewUp || gxPushMut.isPending}
                    >
                      {gxPushMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      Push QoS
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Active QoS Rules */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-purple-600" />Active QoS Rules</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {activeSessionsForGx.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {activeSessionsForGx.slice(0, 20).map((s) => (
                        <div key={s.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50 text-sm">
                          <span className="font-mono text-xs flex-1 truncate">{truncId(s.sessionId || s.id, 12)}</span>
                          <Badge variant="outline" className="text-[10px]">
                            ↓{s.qosDown || s.speedDown || 0} / ↑{s.qosUp || s.speedUp || 0} Mbps
                          </Badge>
                          {s.policyName && <Badge variant="outline" className="text-[10px]">{s.policyName}</Badge>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={Shield} title="No active QoS rules" description="QoS rules will appear for active sessions" size="sm" />
                  )}
                </CardContent>
              </Card>

              {/* Gx Transaction Log */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-purple-600" />Gx Transaction Log</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Timestamp</TableHead>
                          <TableHead className="text-xs">Session ID</TableHead>
                          <TableHead className="text-xs">QoS Change</TableHead>
                          <TableHead className="text-xs">Result Code</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gxLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                          ))
                        ) : gxEvents.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4}>
                              <EmptyState icon={Gauge} title="No Gx transactions" description="Gx policy events will appear here" size="sm" />
                            </TableCell>
                          </TableRow>
                        ) : gxEvents.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs font-mono">{timeAgo(e.timestamp)}</TableCell>
                            <TableCell className="text-xs font-mono">{truncId(e.sessionId || "")}</TableCell>
                            <TableCell className="text-xs">{e.qosChange || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] font-semibold ${e.statusCode < 3000 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{e.statusCode}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 8: EVENTS LOG
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="events">
            <div className="space-y-4">
              {/* Filters & Actions */}
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Select value={eventIfaceFilter} onValueChange={(v) => { setEventIfaceFilter(v); setEventPage(1); }}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Interface" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Interfaces</SelectItem>
                        <SelectItem value="Gy">Gy</SelectItem>
                        <SelectItem value="Gx">Gx</SelectItem>
                        <SelectItem value="SWa">SWa</SelectItem>
                        <SelectItem value="Rx">Rx</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={eventDirFilter} onValueChange={(v) => { setEventDirFilter(v); setEventPage(1); }}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Direction" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Directions</SelectItem>
                        <SelectItem value="IN">IN</SelectItem>
                        <SelectItem value="OUT">OUT</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Status code..."
                        value={eventStatusSearch}
                        onChange={(e) => { setEventStatusSearch(e.target.value); setEventPage(1); }}
                        className="pl-9"
                      />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => downloadCSV(events, "wifi-offload-events.csv")} disabled={events.length === 0}>
                      <Download className="h-4 w-4 mr-1.5" />Export
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600" onClick={() => setClearEventsOpen(true)}>
                      <Trash2 className="h-4 w-4 mr-1.5" />Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Events Table */}
              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Timestamp</TableHead>
                          <TableHead className="text-xs">Interface</TableHead>
                          <TableHead className="text-xs">Direction</TableHead>
                          <TableHead className="text-xs">Session ID</TableHead>
                          <TableHead className="text-xs">Status Code</TableHead>
                          <TableHead className="text-xs">Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eventsLoading ? (
                          Array.from({ length: 8 }).map((_, i) => (
                            <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                          ))
                        ) : events.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6}>
                              <EmptyState icon={BarChart3} title="No events found" description="Events will appear as Diameter transactions occur" size="sm" />
                            </TableCell>
                          </TableRow>
                        ) : events.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs font-mono whitespace-nowrap">{timeAgo(e.timestamp)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] font-semibold ${IFACE_BADGE[e.interface] || "bg-slate-100 text-slate-600"}`}>{e.interface}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] font-semibold ${e.direction === "IN" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{e.direction}</Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{truncId(e.sessionId || "")}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] font-semibold ${e.statusCode < 3000 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{e.statusCode}</Badge>
                            </TableCell>
                            <TableCell className="text-xs max-w-[250px]">
                              <button
                                className="text-left truncate block w-full hover:text-foreground text-muted-foreground"
                                onClick={() => setExpandedEvent(expandedEvent === e.id ? null : e.id)}
                              >
                                {e.details || "—"}
                              </button>
                              {expandedEvent === e.id && (
                                <pre className="mt-1 p-2 rounded bg-muted text-[10px] font-mono overflow-x-auto max-w-full whitespace-pre-wrap">
                                  {e.details || JSON.stringify({ interface: e.interface, direction: e.direction, statusCode: e.statusCode, sessionId: e.sessionId }, null, 2)}
                                </pre>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Pagination page={eventPage} totalPages={totalEventsPages} setPage={setEventPage} />
            </div>

            {/* Clear Events Confirmation */}
            <AlertDialog open={clearEventsOpen} onOpenChange={setClearEventsOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Events?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete all WiFi offload events. This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => clearEventsMut.mutate()}>
                    {clearEventsMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
