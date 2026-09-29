"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { safeJsonParse } from "@/lib/utils";
import {
  Activity, Layout, Network, Users, Shield, Fingerprint, Clock,
  Ticket, IndianRupee, ScrollText, BarChart3, Plus, Trash2, Edit,
  RefreshCw, Search, X, Download, Upload, Ban, Copy, ChevronRight,
  Wifi, AlertTriangle, CheckCircle, Loader2, Eye, MoreHorizontal,
  Globe, Zap, ToggleLeft, Calendar, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useModuleStore } from "@/store/module-store";

// ─── Types ───────────────────────────────────────────────────────
interface Portal {
  id: string; name: string; description: string; template: string;
  loginMethod: string; theme: string; welcomeTitle: string; welcomeMessage: string;
  tosText: string; successMessage: string; timeoutMessage: string; dataCapMessage: string;
  sessionTimeoutSec: number; idleTimeoutSec: number; dataLimitMb: number | null;
  fapDataLimitMb: number | null; bandwidthLimitDown: number; bandwidthLimitUp: number;
  redirectUrl: string; originalUrlParam: string; allowedHosts: string;
  enableCaptiveDetection: boolean; macAuthEnabled: boolean; macAuthUnknownAction: string;
  socialProviders: string; voucherRequired: boolean; voucherReusePolicy: string;
  interfaceId: string | null; locationId: string | null; siteName: string;
  venueType: string; maxConcurrentSessions: number; passthroughMode: boolean;
  customLoginPageUrl: string; postLoginAdUrl: string; collectPhone: boolean;
  collectEmail: boolean; collectName: boolean; partnerId: string | null;
  revenueSharePercent: number; priority: number; scheduleConfig: string;
  ipv6Enabled: boolean; ipv6DetectionMethod: string;
  enabled: boolean; createdAt: string; updatedAt: string;
  _count?: { sessions: number; accessRules: number; macWhitelist: number; voucherPools: number; schedules: number; adZones: number; eventLogs: number };
  location?: { id: string; name: string };
  partner?: { id: string; name: string };
}

interface Session {
  id: string; portalId: string; macAddress: string; ipAddress: string;
  assignedIp: string; loginMethod: string; authUsername: string; voucherCode: string | null;
  startTime: string; expiryTime: string | null; lastActivity: string;
  downloadBytes: string | number; uploadBytes: string | number;
  status: string; disconnectReason: string; nasIp: string; terminateCause: string;
  ipv6Address?: string;
  portal?: { id: string; name: string };
}

interface AccessRule {
  id: string; portalId: string; name: string; description: string;
  enabled: boolean; priority: number; condition: string; actions: string;
  stopOnMatch: boolean; createdAt: string;
}

interface MacWhitelistEntry {
  id: string; portalId: string; macAddress: string; description: string;
  subscriberId: string | null; allowedDays: string; allowedFrom: string;
  allowedUntil: string; enabled: boolean; lastSeenAt: string | null; createdAt: string;
}

interface Schedule {
  id: string; portalId: string; name: string; enabled: boolean;
  daysOfWeek: string; startTime: string; endTime: string;
  overridePortalId: string | null; outOfScheduleAction: string;
  overridePortal?: { id: string; name: string }; createdAt: string;
}

interface VoucherPool {
  id: string; portalId: string; name: string; voucherPrefix: string;
  maxUsesPerVoucher: number; maxTotalActivations: number; currentActivations: number;
  speedDownKbps: number; speedUpKbps: number; dataLimitMb: number;
  sessionTimeoutMin: number; validFrom: string | null; validUntil: string | null;
  enabled: boolean; createdAt: string;
}

interface AdZone {
  id: string; portalId: string; name: string; position: string; adType: string;
  content: string; redirectUrl: string; impressions: number; clicks: number;
  scheduleEnabled: boolean; scheduleDays: string; scheduleStart: string;
  scheduleEnd: string; enabled: boolean; createdAt: string;
}

interface EventLog {
  id: string; portalId: string; sessionId: string | null; eventType: string;
  macAddress: string; ipAddress: string; authMethod: string; authUsername: string;
  voucherCode: string; details: string; createdAt: string;
  portal?: { id: string; name: string };
}

interface Analytics {
  totalPortals: number; activePortals: number; totalSessions: number; activeSessions: number;
  totalEvents: number; sessionsToday: number; sessionsThisWeek: number; sessionsThisMonth: number;
  averageSessionDuration: string; peakConcurrent: number; totalDownload: string; totalUpload: string;
  authMethodBreakdown: { method: string; count: number }[];
  topPortals: { name: string; sessions: number; activeSessions: number }[];
  venueTypeBreakdown: { venueType: string; count: number }[];
  topMacAddresses: { mac: string; sessions: number }[];
}

interface SubnetMapping {
  dhcpSubnets: { id: string; name: string; network: string; gateway: string; captivePortalId: string | null; portal?: { id: string; name: string; enabled: boolean } }[];
  ipamSubnets: { id: string; name: string; cidr: string; captivePortalId: string | null; portal?: { id: string; name: string; enabled: boolean } }[];
  portals: { id: string; name: string; enabled: boolean }[];
}

interface Area { id: string; name: string }
interface Agent { id: string; name: string }

// ─── Constants ──────────────────────────────────────────────────
const TEMPLATES = ["HOTEL", "CAFE", "AIRPORT", "RESORT", "CORPORATE", "ISP_DEFAULT", "CUSTOM"];
const LOGIN_METHODS = ["RADIUS", "VOUCHER", "CLICK_TO_CONTINUE", "MAC_AUTH", "SOCIAL"];
const VENUE_TYPES = ["HOTEL", "CAFE", "AIRPORT", "RESORT", "CORPORATE", "RESIDENTIAL", "EVENT", "ISP_PARTNER"];
const VOUCHER_POLICIES = ["SINGLE_USE", "MULTI_USE", "TIMED"];
const MAC_ACTIONS = ["DENY", "ALLOW", "REDIRECT"];
const SOCIAL_OPTIONS = ["google", "facebook", "twitter", "linkedin", "instagram"];
const RULE_FIELDS = ["MAC", "IP", "subscriberId", "timeOfDay", "dayOfWeek", "dataUsed", "sessionCount"];
const RULE_OPERATORS = ["equals", "contains", "regex", "in", "gt", "lt", "gte", "lte"];
const RULE_ACTIONS_LIST = ["ALLOW", "DENY", "REDIRECT", "AUTO_AUTH", "SET_BANDWIDTH", "SHOW_MESSAGE"];
const AD_POSITIONS = ["TOP", "BOTTOM", "SIDEBAR", "POPUP", "INTERSTITIAL"];
const AD_TYPES = ["IMAGE", "HTML", "VIDEO", "TEXT"];
const OUT_OF_SCHEDULE_ACTIONS = ["DEFAULT_PORTAL", "BLOCK", "OPEN_ACCESS", "REDIRECT_URL"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TEMPLATE_COLORS: Record<string, string> = {
  HOTEL: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400",
  CAFE: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400",
  AIRPORT: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400",
  RESORT: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400",
  CORPORATE: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300",
  ISP_DEFAULT: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400",
  CUSTOM: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400",
};

const METHOD_COLORS: Record<string, string> = {
  RADIUS: "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400",
  VOUCHER: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  CLICK_TO_CONTINUE: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  MAC_AUTH: "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400",
  SOCIAL: "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  EXPIRED: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  DISCONNECTED: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400",
  DATA_CAP_REACHED: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  ADMIN_DISCONNECT: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
};

const VENUE_ICONS: Record<string, string> = {
  HOTEL: "🏨", CAFE: "☕", AIRPORT: "✈️", RESORT: "🏖️",
  CORPORATE: "🏢", RESIDENTIAL: "🏠", EVENT: "🎪", ISP_PARTNER: "🤝",
};

// ─── Helpers ────────────────────────────────────────────────────
function fmtBytes(n: number | string | null | undefined): string {
  const b = typeof n === "string" ? parseInt(n, 10) || 0 : n || 0;
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

function fmtDur(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const d = Date.now() - new Date(dateStr).getTime();
  if (d < 60000) return "Just now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function pctCalc(n: number, d: number): string {
  if (d === 0) return "0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function BadgeC({ children, color }: { children: React.ReactNode; color: string }) {
  return <Badge variant="outline" className={`text-[10px] font-semibold ${color}`}>{children}</Badge>;
}

function SkeletonRow({ cols }: { cols: number }) {
  return <TableRow>{Array.from({ length: cols }).map((_, i) => <TableCell key={i}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>;
}

// ─── Default Forms ──────────────────────────────────────────────
const emptyPortal = {
  name: "", description: "", template: "ISP_DEFAULT", loginMethod: "RADIUS",
  sessionTimeoutSec: 86400, idleTimeoutSec: 3600, dataLimitMb: "", fapDataLimitMb: "",
  bandwidthLimitDown: 0, bandwidthLimitUp: 0, redirectUrl: "", originalUrlParam: "original_url",
  macAuthEnabled: false, macAuthUnknownAction: "DENY", voucherRequired: false,
  voucherReusePolicy: "SINGLE_USE", socialProviders: [] as string[],
  locationId: "", siteName: "", venueType: "", maxConcurrentSessions: 0, passthroughMode: false,
  customLoginPageUrl: "", welcomeTitle: "Welcome", welcomeMessage: "",
  tosText: "", successMessage: "You are now connected!", timeoutMessage: "", dataCapMessage: "",
  primaryColor: "#DC2626", secondaryColor: "#1E293B", logoUrl: "", backgroundImageUrl: "",
  collectPhone: false, collectEmail: false, collectName: false,
  partnerId: "", revenueSharePercent: 0, priority: 0,
  ipv6Enabled: false, ipv6DetectionMethod: "radius",
  enabled: false,
};

const emptyRule = {
  name: "", description: "", field: "MAC", operator: "equals", value: "",
  actions: [] as string[], stopOnMatch: false, priority: 0, enabled: true,
};

const emptyMac = {
  macAddress: "", description: "", allowedDays: [1, 2, 3, 4, 5, 6, 7] as number[],
  allowedFrom: "00:00", allowedUntil: "23:59", enabled: true,
};

const emptySchedule = {
  name: "", daysOfWeek: [1, 2, 3, 4, 5] as number[], startTime: "09:00",
  endTime: "17:00", overridePortalId: "", outOfScheduleAction: "DEFAULT_PORTAL", enabled: true,
};

const emptyPool = {
  name: "", voucherPrefix: "", maxUsesPerVoucher: 1, maxTotalActivations: 0,
  speedDownKbps: 0, speedUpKbps: 0, dataLimitMb: 0, sessionTimeoutMin: 0,
  validFrom: "", validUntil: "", enabled: true,
};

const emptyAd = {
  name: "", position: "TOP", adType: "IMAGE", content: "", redirectUrl: "",
  scheduleEnabled: false, scheduleDays: [1, 2, 3, 4, 5, 6, 7] as number[],
  scheduleStart: "00:00", scheduleEnd: "23:59", enabled: true,
};

// ─── Main Component ─────────────────────────────────────────────
export default function CaptivePortalPage() {
  const { isModuleEnabled } = useModuleStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState("");
  const [selectedPortal, setSelectedPortal] = useState<string>("");
  const [portalDialog, setPortalDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pf, setPf] = useState({ ...emptyPortal, socialProviders: [] as string[] });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState("");
  // Rule dialog
  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [rf, setRf] = useState({ ...emptyRule, actions: [] as string[] });
  // MAC dialog
  const [macDialog, setMacDialog] = useState(false);
  const [mf, setMf] = useState({ ...emptyMac, allowedDays: [1, 2, 3, 4, 5, 6, 7] as number[] });
  const [selectedMacs, setSelectedMacs] = useState<string[]>([]);
  // Schedule dialog
  const [schedDialog, setSchedDialog] = useState(false);
  const [editingSchedId, setEditingSchedId] = useState<string | null>(null);
  const [sf, setSf] = useState({ ...emptySchedule, daysOfWeek: [1, 2, 3, 4, 5] as number[] });
  // Pool dialog
  const [poolDialog, setPoolDialog] = useState(false);
  const [editingPoolId, setEditingPoolId] = useState<string | null>(null);
  const [poolF, setPoolF] = useState({ ...emptyPool });
  // Ad dialog
  const [adDialog, setAdDialog] = useState(false);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [af, setAf] = useState({ ...emptyAd, scheduleDays: [1, 2, 3, 4, 5, 6, 7] as number[] });
  // Disconnect
  const [discAllOpen, setDiscAllOpen] = useState(false);
  // Subnet mapping
  const [mappingPortalId, setMappingPortalId] = useState<string | null>(null);
  // Event filters
  const [evtFilter, setEvtFilter] = useState({ eventType: "", dateFrom: "", dateTo: "" });
  // Portal form section tab
  const [pfSection, setPfSection] = useState("basic");

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // ─── Queries ──────────────────────────────────────────
  const { data: portalsData, isLoading: portalsLoading, refetch: refetchPortals } = useQuery<{ portals: Portal[] }>({
    queryKey: ["cp-portals"], queryFn: () => apiFetch("/api/captive-portal"), staleTime: 30000,
  });
  const { data: sessionsData, isLoading: sessionsLoading, refetch: refetchSessions } = useQuery<{ sessions: Session[] }>({
    queryKey: ["cp-sessions"], queryFn: () => apiFetch("/api/captive-portal/sessions"), staleTime: 15000,
    refetchInterval: tab === "sessions" ? 30000 : false,
  });
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["cp-analytics"], queryFn: () => apiFetch("/api/captive-portal/analytics"), staleTime: 60000, enabled: tab === "dashboard" || tab === "analytics",
  });
  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: EventLog[] }>({
    queryKey: ["cp-events", selectedPortal, evtFilter], queryFn: () => {
      const p = new URLSearchParams();
      if (selectedPortal) p.set("portalId", selectedPortal);
      if (evtFilter.eventType) p.set("eventType", evtFilter.eventType);
      if (evtFilter.dateFrom) p.set("dateFrom", evtFilter.dateFrom);
      if (evtFilter.dateTo) p.set("dateTo", evtFilter.dateTo);
      if (search) p.set("search", search);
      return apiFetch(`/api/captive-portal/events?${p}`);
    }, staleTime: 15000, enabled: tab === "events",
  });
  const { data: rulesData, isLoading: rulesLoading, refetch: refetchRules } = useQuery<{ rules: AccessRule[] }>({
    queryKey: ["cp-rules", selectedPortal], queryFn: () => apiFetch(`/api/captive-portal/rules?portalId=${selectedPortal}`),
    enabled: !!selectedPortal && (tab === "rules"),
  });
  const { data: macData, isLoading: macLoading, refetch: refetchMac } = useQuery<{ entries: MacWhitelistEntry[] }>({
    queryKey: ["cp-mac", selectedPortal], queryFn: () => apiFetch(`/api/captive-portal/mac-whitelist?portalId=${selectedPortal}`),
    enabled: !!selectedPortal && (tab === "mac"),
  });
  const { data: schedData, isLoading: schedLoading, refetch: refetchSched } = useQuery<{ schedules: Schedule[] }>({
    queryKey: ["cp-schedules", selectedPortal], queryFn: () => apiFetch(`/api/captive-portal/schedules?portalId=${selectedPortal}`),
    enabled: !!selectedPortal && (tab === "schedules"),
  });
  const { data: poolData, isLoading: poolLoading, refetch: refetchPool } = useQuery<{ pools: VoucherPool[] }>({
    queryKey: ["cp-pools", selectedPortal], queryFn: () => apiFetch(`/api/captive-portal/voucher-pools?portalId=${selectedPortal}`),
    enabled: !!selectedPortal && (tab === "vouchers"),
  });
  const { data: adsData, isLoading: adsLoading, refetch: refetchAds } = useQuery<{ ads: AdZone[] }>({
    queryKey: ["cp-ads", selectedPortal], queryFn: () => apiFetch(`/api/captive-portal/ads?portalId=${selectedPortal}`),
    enabled: !!selectedPortal && (tab === "ads"),
  });
  const { data: subnetData, isLoading: subnetLoading, refetch: refetchSubnet } = useQuery<SubnetMapping>({
    queryKey: ["cp-subnets"], queryFn: () => apiFetch("/api/captive-portal/subnet-mapping"),
    enabled: tab === "subnets",
  });
  const { data: areasData } = useQuery<{ areas: Area[] }>({ queryKey: ["cp-areas"], queryFn: () => apiFetch("/api/areas"), staleTime: 60000 });
  const { data: agentsData } = useQuery<{ agents: Agent[] }>({ queryKey: ["cp-agents"], queryFn: () => apiFetch("/api/agents"), staleTime: 60000 });

  // Derived
  const portals = portalsData?.portals || [];
  const sessions = sessionsData?.sessions || [];
  const events = eventsData?.events || [];
  const rules = rulesData?.rules || [];
  const macEntries = macData?.entries || [];
  const schedules = schedData?.schedules || [];
  const pools = poolData?.pools || [];
  const ads = adsData?.ads || [];
  const analytics = analyticsData || {} as Analytics;
  const subnets = subnetData || { dhcpSubnets: [], ipamSubnets: [], portals: [] } as SubnetMapping;
  const areas = areasData?.areas || [];
  const agents = agentsData?.agents || [];
  const activeSessions = sessions.filter((s) => s.status === "ACTIVE");
  const activePortals = portals.filter((p) => p.enabled);

  const filteredPortals = useMemo(() => {
    if (!search) return portals;
    const q = search.toLowerCase();
    return portals.filter((p) => p.name.toLowerCase().includes(q) || p.template.toLowerCase().includes(q) || p.venueType?.toLowerCase().includes(q) || p.siteName?.toLowerCase().includes(q));
  }, [portals, search]);

  const filteredSessions = useMemo(() => {
    if (!search) return sessions;
    const q = search.toLowerCase();
    return sessions.filter((s) => s.macAddress?.toLowerCase().includes(q) || s.ipAddress?.toLowerCase().includes(q) || s.authUsername?.toLowerCase().includes(q));
  }, [sessions, search]);

  // Venue type counts
  const venueCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of portals) { const v = p.venueType || "OTHER"; m[v] = (m[v] || 0) + 1; }
    return m;
  }, [portals]);

  // ─── Mutations ──────────────────────────────────────
  const invalidate = (keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const invalidateAll = () => invalidate(["cp-portals", "cp-sessions", "cp-analytics", "cp-events", "cp-rules", "cp-mac", "cp-schedules", "cp-pools", "cp-ads", "cp-subnets"]);

  const portalMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/captive-portal", { method: editingId ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success(editingId ? "Portal updated" : "Portal created"); setPortalDialog(false); setEditingId(null); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) => apiFetch(`/api/captive-portal${type !== "portal" ? `/${type}` : ""}?id=${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Deleted"); setDeleteId(null); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/captive-portal", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Status updated"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const discMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/captive-portal/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Session disconnected"); invalidate(["cp-sessions", "cp-analytics"]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const discAllMut = useMutation({
    mutationFn: () => apiFetch("/api/captive-portal/sessions/disconnect-all", { method: "POST" }),
    onSuccess: () => { toast.success("All sessions disconnected"); setDiscAllOpen(false); invalidate(["cp-sessions", "cp-analytics"]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ruleMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/captive-portal/rules", { method: editingRuleId ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success(editingRuleId ? "Rule updated" : "Rule created"); setRuleDialog(false); setEditingRuleId(null); invalidate(["cp-rules"]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const macMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/captive-portal/mac-whitelist", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("MAC entry added"); setMacDialog(false); setMf({ ...emptyMac, allowedDays: [1, 2, 3, 4, 5, 6, 7] }); invalidate(["cp-mac"]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const macDelMut = useMutation({
    mutationFn: (ids: string[]) => apiFetch(`/api/captive-portal/mac-whitelist?ids=${ids.join(",")}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("MAC entries deleted"); setSelectedMacs([]); invalidate(["cp-mac"]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const schedMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/captive-portal/schedules", { method: editingSchedId ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success(editingSchedId ? "Schedule updated" : "Schedule created"); setSchedDialog(false); setEditingSchedId(null); invalidate(["cp-schedules"]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const poolMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/captive-portal/voucher-pools", { method: editingPoolId ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success(editingPoolId ? "Pool updated" : "Pool created"); setPoolDialog(false); setEditingPoolId(null); invalidate(["cp-pools"]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const adMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/captive-portal/ads", { method: editingAdId ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success(editingAdId ? "Ad updated" : "Ad created"); setAdDialog(false); setEditingAdId(null); invalidate(["cp-ads"]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const subnetMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/captive-portal/subnet-mapping", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Subnet mapping updated"); setMappingPortalId(null); invalidate(["cp-subnets"]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) => apiFetch("/api/captive-portal", { method: "POST", body: JSON.stringify({ duplicateFrom: id }) }),
    onSuccess: () => { toast.success("Portal duplicated"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Portal Form Helpers ────────────────────────────
  function openPortalCreate() { setPf({ ...emptyPortal, socialProviders: [] }); setEditingId(null); setPfSection("basic"); setPortalDialog(true); }
  function openPortalEdit(p: Portal) {
    const theme = safeJsonParse(p.theme, {} as Record<string, string>);
    const socials = safeJsonParse(p.socialProviders, [] as string[]);
    setPf({
      name: p.name, description: p.description, template: p.template, loginMethod: p.loginMethod,
      sessionTimeoutSec: p.sessionTimeoutSec, idleTimeoutSec: p.idleTimeoutSec,
      dataLimitMb: p.dataLimitMb != null ? String(p.dataLimitMb) : "",
      fapDataLimitMb: p.fapDataLimitMb != null ? String(p.fapDataLimitMb) : "",
      bandwidthLimitDown: p.bandwidthLimitDown, bandwidthLimitUp: p.bandwidthLimitUp,
      redirectUrl: p.redirectUrl, originalUrlParam: p.originalUrlParam,
      macAuthEnabled: p.macAuthEnabled, macAuthUnknownAction: p.macAuthUnknownAction,
      voucherRequired: p.voucherRequired, voucherReusePolicy: p.voucherReusePolicy,
      socialProviders: socials, locationId: p.locationId || "", siteName: p.siteName,
      venueType: p.venueType, maxConcurrentSessions: p.maxConcurrentSessions,
      passthroughMode: p.passthroughMode, customLoginPageUrl: p.customLoginPageUrl,
      welcomeTitle: p.welcomeTitle, welcomeMessage: p.welcomeMessage, tosText: p.tosText,
      successMessage: p.successMessage, timeoutMessage: p.timeoutMessage, dataCapMessage: p.dataCapMessage,
      primaryColor: theme.primaryColor || "#DC2626", secondaryColor: theme.secondaryColor || "#1E293B",
      logoUrl: theme.logoUrl || "", backgroundImageUrl: theme.backgroundImageUrl || "",
      collectPhone: p.collectPhone, collectEmail: p.collectEmail, collectName: p.collectName,
      partnerId: p.partnerId || "", revenueSharePercent: p.revenueSharePercent, priority: p.priority,
      ipv6Enabled: p.ipv6Enabled || false, ipv6DetectionMethod: p.ipv6DetectionMethod || "radius",
      enabled: p.enabled,
    });
    setEditingId(p.id); setPfSection("basic"); setPortalDialog(true);
  }

  function savePortal() {
    if (!pf.name.trim()) return toast.error("Name is required");
    if (!selectedPortal && !editingId && !pf.loginMethod) return toast.error("Login method is required");
    const body: Record<string, unknown> = {
      name: pf.name, description: pf.description, template: pf.template, loginMethod: pf.loginMethod,
      sessionTimeoutSec: pf.sessionTimeoutSec, idleTimeoutSec: pf.idleTimeoutSec,
      dataLimitMb: pf.dataLimitMb ? parseInt(pf.dataLimitMb) : null,
      fapDataLimitMb: pf.fapDataLimitMb ? parseInt(pf.fapDataLimitMb) : null,
      bandwidthLimitDown: pf.bandwidthLimitDown, bandwidthLimitUp: pf.bandwidthLimitUp,
      redirectUrl: pf.redirectUrl, originalUrlParam: pf.originalUrlParam,
      macAuthEnabled: pf.macAuthEnabled, macAuthUnknownAction: pf.macAuthUnknownAction,
      voucherRequired: pf.voucherRequired, voucherReusePolicy: pf.voucherReusePolicy,
      socialProviders: JSON.stringify(pf.socialProviders), locationId: pf.locationId || null,
      siteName: pf.siteName, venueType: pf.venueType, maxConcurrentSessions: pf.maxConcurrentSessions,
      passthroughMode: pf.passthroughMode, customLoginPageUrl: pf.customLoginPageUrl,
      welcomeTitle: pf.welcomeTitle, welcomeMessage: pf.welcomeMessage, tosText: pf.tosText,
      successMessage: pf.successMessage, timeoutMessage: pf.timeoutMessage, dataCapMessage: pf.dataCapMessage,
      theme: JSON.stringify({ primaryColor: pf.primaryColor, secondaryColor: pf.secondaryColor, logoUrl: pf.logoUrl, backgroundImageUrl: pf.backgroundImageUrl }),
      collectPhone: pf.collectPhone, collectEmail: pf.collectEmail, collectName: pf.collectName,
      partnerId: pf.partnerId || null, revenueSharePercent: pf.revenueSharePercent, priority: pf.priority,
      ipv6Enabled: pf.ipv6Enabled, ipv6DetectionMethod: pf.ipv6DetectionMethod,
      enabled: pf.enabled,
    };
    if (editingId) body.id = editingId;
    portalMut.mutate(body);
  }

  // ─── Rule Helpers ────────────────────────────────────
  function openRuleCreate() { setRf({ ...emptyRule, actions: [] }); setEditingRuleId(null); setRuleDialog(true); }
  function openRuleEdit(r: AccessRule) {
    const cond = safeJsonParse(r.condition, {} as Record<string, string>);
    const acts = safeJsonParse(r.actions, [] as string[]);
    setRf({ name: r.name, description: r.description, field: cond.field || "MAC", operator: cond.operator || "equals", value: cond.value || "", actions: acts, stopOnMatch: r.stopOnMatch, priority: r.priority, enabled: r.enabled });
    setEditingRuleId(r.id); setRuleDialog(true);
  }
  function saveRule() {
    if (!rf.name.trim()) return toast.error("Name is required");
    const body: Record<string, unknown> = {
      portalId: selectedPortal, name: rf.name, description: rf.description,
      condition: JSON.stringify({ field: rf.field, operator: rf.operator, value: rf.value }),
      actions: JSON.stringify(rf.actions), stopOnMatch: rf.stopOnMatch, priority: rf.priority, enabled: rf.enabled,
    };
    if (editingRuleId) body.id = editingRuleId;
    ruleMut.mutate(body);
  }

  // ─── Loading ─────────────────────────────────────────
  if (portalsLoading && portals.length === 0) {
    return <div className="space-y-6"><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-96" /></div>;
  }

  // ─── Render ──────────────────────────────────────────
  const portalSelector = portals.length > 0 && (
    <Select value={selectedPortal} onValueChange={setSelectedPortal}>
      <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Select portal..." /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">All Portals</SelectItem>
        {portals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Wifi className="h-6 w-6 text-red-600" /> Captive Portal
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Portal profiles, sessions, rules & monetization</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => invalidateAll()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={openPortalCreate}>
              <Plus className="h-4 w-4 mr-1.5" />Create Portal
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setSearch(""); }}>
          <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="dashboard"><Activity className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Dashboard</span></TabsTrigger>
            <TabsTrigger value="profiles"><Layout className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Profiles</span></TabsTrigger>
            <TabsTrigger value="subnets"><Network className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Subnets</span></TabsTrigger>
            <TabsTrigger value="sessions"><Users className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Sessions</span></TabsTrigger>
            <TabsTrigger value="rules"><Shield className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Rules</span></TabsTrigger>
            <TabsTrigger value="mac"><Fingerprint className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">MAC</span></TabsTrigger>
            <TabsTrigger value="schedules"><Clock className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Schedule</span></TabsTrigger>
            <TabsTrigger value="vouchers"><Ticket className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Vouchers</span></TabsTrigger>
            <TabsTrigger value="ads"><IndianRupee className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Ads</span></TabsTrigger>
            <TabsTrigger value="events"><ScrollText className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Events</span></TabsTrigger>
            <TabsTrigger value="analytics"><BarChart3 className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Analytics</span></TabsTrigger>
          </TabsList>

          {/* ═══════════ TAB 1: DASHBOARD ═══════════ */}
          <TabsContent value="dashboard">
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { t: "Total Portals", v: portals.length, s: "Configured profiles", i: Layout, c: "bg-red-100 dark:bg-red-950/30", ic: "text-red-600 dark:text-red-400" },
                  { t: "Active Portals", v: activePortals.length, s: "Currently enabled", i: CheckCircle, c: "bg-emerald-100 dark:bg-emerald-950/30", ic: "text-emerald-600 dark:text-emerald-400" },
                  { t: "Active Sessions", v: activeSessions.length, s: "Online now", i: Users, c: "bg-amber-100 dark:bg-amber-950/30", ic: "text-amber-600 dark:text-amber-400" },
                  { t: "Total Events", v: analytics.totalEvents || 0, s: "Event log entries", i: ScrollText, c: "bg-violet-100 dark:bg-violet-950/30", ic: "text-violet-600 dark:text-violet-400" },
                ].map((s, i) => (
                  <Card key={i} className="border shadow-sm animate-card-enter" style={{ animationDelay: `${i * 75}ms` }}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${s.c}`}><s.i className={`h-4 w-4 ${s.ic}`} /></div>
                        <div><p className="text-xs text-muted-foreground">{s.t}</p><p className="text-xl font-bold">{s.v}</p><p className="text-[11px] text-muted-foreground">{s.s}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Venue Types */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Quick Access by Venue Type</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  {VENUE_TYPES.map((vt) => {
                    const count = venueCounts[vt] || 0;
                    return (
                      <Card key={vt} className="border shadow-sm hover:shadow-md transition-all cursor-pointer animate-card-enter" onClick={() => { setTab("profiles"); setSearch(vt.toLowerCase()); }}>
                        <CardContent className="p-3 text-center">
                          <span className="text-2xl">{VENUE_ICONS[vt] || "📌"}</span>
                          <p className="text-xs font-semibold mt-1">{vt.replace(/_/g, " ")}</p>
                          <p className="text-lg font-bold text-red-600">{count}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Recent Events */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><ScrollText className="h-4 w-4 text-red-600" />Recent Events</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs">Time</TableHead><TableHead className="text-xs">Portal</TableHead>
                      <TableHead className="text-xs">Event</TableHead><TableHead className="text-xs">MAC</TableHead><TableHead className="text-xs">User</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {eventsLoading ? <SkeletonRow cols={5} /> : events.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No events yet</TableCell></TableRow>
                      ) : events.slice(0, 10).map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs">{timeAgo(e.createdAt)}</TableCell>
                          <TableCell className="text-xs">{e.portal?.name || "—"}</TableCell>
                          <TableCell><BadgeC color={e.eventType === "AUTH_SUCCESS" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : e.eventType === "AUTH_FAILURE" ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" : "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300"}>{e.eventType.replace(/_/g, " ")}</BadgeC></TableCell>
                          <TableCell className="text-xs font-mono">{e.macAddress || "—"}</TableCell>
                          <TableCell className="text-xs">{e.authUsername || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══════════ TAB 2: PORTAL PROFILES ═══════════ */}
          <TabsContent value="profiles">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search portals..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
                  <div className="flex gap-2">
                    <Select value="__all__" onValueChange={(v) => { setSearch(v === "__all__" ? "" : v); }}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Template" /></SelectTrigger>
                      <SelectContent>{TEMPLATES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value="__all__" onValueChange={(v) => { setSearch(v === "__all__" ? "" : v); }}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Venue" /></SelectTrigger>
                      <SelectContent>{VENUE_TYPES.map((v) => <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs">Name</TableHead><TableHead className="text-xs">Site</TableHead>
                      <TableHead className="text-xs">Template</TableHead><TableHead className="text-xs">Venue</TableHead>
                      <TableHead className="text-xs">Login</TableHead><TableHead className="text-xs">Sessions</TableHead>
                      <TableHead className="text-xs">Status</TableHead><TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {filteredPortals.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">{search ? "No portals match your search" : "No portals. Click Create Portal to start."}</TableCell></TableRow>
                      ) : filteredPortals.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell><p className="font-medium text-sm">{p.name}</p>{p.description && <p className="text-[11px] text-muted-foreground max-w-[180px] truncate">{p.description}</p>}</TableCell>
                          <TableCell className="text-xs">{p.siteName || p.location?.name || "—"}</TableCell>
                          <TableCell><BadgeC color={TEMPLATE_COLORS[p.template] || TEMPLATE_COLORS.CUSTOM}>{p.template}</BadgeC></TableCell>
                          <TableCell className="text-xs">{p.venueType ? <span>{VENUE_ICONS[p.venueType]} {p.venueType.replace(/_/g, " ")}</span> : "—"}</TableCell>
                          <TableCell><BadgeC color={METHOD_COLORS[p.loginMethod] || ""}>{p.loginMethod}</BadgeC></TableCell>
                          <TableCell className="text-xs">{p._count?.sessions || 0}</TableCell>
                          <TableCell><Switch checked={p.enabled} onCheckedChange={(c) => toggleMut.mutate({ id: p.id, enabled: c })} /></TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPortalEdit(p)}><Edit className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateMut.mutate(p.id)}><Copy className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Duplicate</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => { setDeleteId(p.id); setDeleteType("portal"); }}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ TAB 3: SUBNET MAPPING ═══════════ */}
          <TabsContent value="subnets">
            {isModuleEnabled("ipv6") && (
              <div className="flex items-center gap-2 p-2 bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded-md text-xs text-cyan-800 mb-4">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>DHCPv6 subnets are automatically mapped when the IPv6 module is enabled.</span>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-emerald-600" />DHCP Subnets</CardTitle></CardHeader>
                  <CardContent>
                    {subnetLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div> : subnets.dhcpSubnets?.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No DHCP subnets</p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {subnets.dhcpSubnets.map((s) => (
                          <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:shadow-sm transition-all">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${s.portal?.enabled ? "bg-emerald-500" : s.portal ? "bg-red-500" : "bg-gray-300"}`} />
                              <div className="min-w-0"><p className="text-sm font-medium truncate">{s.name}</p><p className="text-xs text-muted-foreground font-mono">{s.network}/{s.gateway}</p></div>
                            </div>
                            <div className="flex items-center gap-2">
                              {s.portal ? <BadgeC color={s.portal.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"}>{s.portal.name}</BadgeC> : <span className="text-xs text-muted-foreground">No portal</span>}
                              <Select value={s.captivePortalId || "__none"} onValueChange={(v) => subnetMut.mutate({ type: "dhcp", subnetId: s.id, portalId: v === "__none" ? null : v })}>
                                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="__none">None</SelectItem>{subnets.portals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Network className="h-4 w-4 text-violet-600" />IPAM Subnets</CardTitle></CardHeader>
                  <CardContent>
                    {subnetLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div> : subnets.ipamSubnets?.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No IPAM subnets</p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {subnets.ipamSubnets.map((s) => (
                          <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:shadow-sm transition-all">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${s.portal?.enabled ? "bg-emerald-500" : s.portal ? "bg-red-500" : "bg-gray-300"}`} />
                              <div className="min-w-0"><p className="text-sm font-medium truncate">{s.name}</p><p className="text-xs text-muted-foreground font-mono">{s.cidr}</p></div>
                            </div>
                            <div className="flex items-center gap-2">
                              {s.portal ? <BadgeC color={s.portal.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"}>{s.portal.name}</BadgeC> : <span className="text-xs text-muted-foreground">No portal</span>}
                              <Select value={s.captivePortalId || "__none"} onValueChange={(v) => subnetMut.mutate({ type: "ipam", subnetId: s.id, portalId: v === "__none" ? null : v })}>
                                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="__none">None</SelectItem>{subnets.portals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              {/* Portal Summary */}
              <Card className="border shadow-sm h-fit">
                <CardHeader className="pb-3"><CardTitle className="text-sm">Portal Subnet Summary</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {subnets.portals.map((p) => {
                      const dhcpCount = subnets.dhcpSubnets.filter((s) => s.captivePortalId === p.id).length;
                      const ipamCount = subnets.ipamSubnets.filter((s) => s.captivePortalId === p.id).length;
                      const total = dhcpCount + ipamCount;
                      return (
                        <div key={p.id} className={`p-3 rounded-lg border ${mappingPortalId === p.id ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "bg-card"} cursor-pointer transition-all`} onClick={() => setMappingPortalId(mappingPortalId === p.id ? null : p.id)}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${p.enabled ? "bg-emerald-500" : "bg-gray-300"}`} />
                              <span className="text-sm font-medium">{p.name}</span>
                            </div>
                            <Badge variant="secondary" className="text-[10px]">{total} subnet{total !== 1 ? "s" : ""}</Badge>
                          </div>
                          {mappingPortalId === p.id && (
                            <div className="mt-2 text-xs text-muted-foreground space-y-1">
                              {dhcpCount > 0 && <p>DHCP: {dhcpCount} subnet{dhcpCount !== 1 ? "s" : ""}</p>}
                              {ipamCount > 0 && <p>IPAM: {ipamCount} subnet{ipamCount !== 1 ? "s" : ""}</p>}
                              {total === 0 && <p className="italic">No subnets assigned</p>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══════════ TAB 4: ACTIVE SESSIONS ═══════════ */}
          <TabsContent value="sessions">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by MAC, IP, username..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetchSessions()} disabled={sessionsLoading}><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${sessionsLoading ? "animate-spin" : ""}`} />Refresh</Button>
                    {sessions.length > 0 && <Button variant="destructive" size="sm" onClick={() => setDiscAllOpen(true)}><Ban className="h-3.5 w-3.5 mr-1.5" />Disconnect All</Button>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Auto-refresh every 30s · {sessions.length} session(s) · {activeSessions.length} active</p>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs">MAC</TableHead><TableHead className="text-xs">IP</TableHead>
                      {isModuleEnabled("ipv6") && (
                        <TableHead className="text-xs hidden md:table-cell">IPv6</TableHead>
                      )}
                      <TableHead className="text-xs">Username</TableHead><TableHead className="text-xs">Method</TableHead>
                      <TableHead className="text-xs">Portal</TableHead><TableHead className="text-xs">Start</TableHead>
                      <TableHead className="text-xs">Duration</TableHead><TableHead className="text-xs">DL</TableHead>
                      <TableHead className="text-xs">UL</TableHead><TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Act</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {sessionsLoading ? <SkeletonRow cols={11} /> : filteredSessions.length === 0 ? (
                        <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground text-sm">{search ? "No sessions match" : "No active sessions"}</TableCell></TableRow>
                      ) : filteredSessions.map((s) => {
                        const start = s.startTime ? new Date(s.startTime).getTime() : now;
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-mono text-xs">{s.macAddress || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{s.ipAddress || "—"}</TableCell>
                            {isModuleEnabled("ipv6") && (
                              <TableCell className="hidden md:table-cell font-mono text-xs">
                                {s.ipv6Address || "—"}
                              </TableCell>
                            )}
                            <TableCell className="text-xs">{s.authUsername || "—"}</TableCell>
                            <TableCell><BadgeC color={METHOD_COLORS[s.loginMethod] || ""}>{s.loginMethod}</BadgeC></TableCell>
                            <TableCell className="text-xs">{s.portal?.name || "—"}</TableCell>
                            <TableCell className="text-xs">{fmtTime(s.startTime)}</TableCell>
                            <TableCell className="text-xs tabular-nums">{s.status === "ACTIVE" ? fmtDur(now - start) : "—"}</TableCell>
                            <TableCell className="text-xs text-emerald-600 dark:text-emerald-400">{fmtBytes(s.downloadBytes)}</TableCell>
                            <TableCell className="text-xs text-amber-600 dark:text-amber-400">{fmtBytes(s.uploadBytes)}</TableCell>
                            <TableCell><BadgeC color={STATUS_COLORS[s.status] || STATUS_COLORS.DISCONNECTED}>{s.status.replace(/_/g, " ")}</BadgeC></TableCell>
                            <TableCell className="text-right">
                              {s.status === "ACTIVE" && <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => discMut.mutate(s.id)}><Ban className="h-3.5 w-3.5" /></Button>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ TAB 5: ACCESS RULES ═══════════ */}
          <TabsContent value="rules">
            <div className="space-y-4">
              <Card className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
                    {portalSelector}
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" disabled={!selectedPortal} onClick={openRuleCreate}><Plus className="h-4 w-4 mr-1.5" />Add Rule</Button>
                  </div>
                  {!selectedPortal ? <p className="text-sm text-muted-foreground text-center py-8">Select a portal to manage rules</p> : rulesLoading ? <Skeleton className="h-48" /> : rules.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No rules configured for this portal</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {[...rules].sort((a, b) => a.priority - b.priority).map((r) => {
                        const cond = safeJsonParse(r.condition, {} as Record<string, string>);
                        const acts = safeJsonParse(r.actions, [] as string[]);
                        return (
                          <div key={r.id} className={`flex items-center justify-between p-3 rounded-lg border ${r.enabled ? "bg-card" : "bg-muted/30 opacity-60"}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-mono text-muted-foreground w-6 text-center">{r.priority}</span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{r.name}</p>
                                <p className="text-xs text-muted-foreground">{cond.field} {cond.operator} {cond.value}</p>
                                <div className="flex gap-1 mt-1 flex-wrap">{acts.map((a: string) => <Badge key={a} variant="secondary" className="text-[9px]">{a}</Badge>)}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Switch checked={r.enabled} onCheckedChange={(c) => ruleMut.mutate({ id: r.id, portalId: selectedPortal, enabled: c })} />
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openRuleEdit(r)}><Edit className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { setDeleteId(r.id); setDeleteType("rules"); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ═══════════ TAB 6: MAC WHITELIST ═══════════ */}
          <TabsContent value="mac">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
                  {portalSelector}
                  <div className="flex gap-2">
                    {selectedMacs.length > 0 && <Button variant="destructive" size="sm" onClick={() => macDelMut.mutate(selectedMacs)}><Trash2 className="h-4 w-4 mr-1.5" />Delete ({selectedMacs.length})</Button>}
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" disabled={!selectedPortal} onClick={() => { setMf({ ...emptyMac, allowedDays: [1, 2, 3, 4, 5, 6, 7] }); setMacDialog(true); }}><Plus className="h-4 w-4 mr-1.5" />Add MAC</Button>
                  </div>
                </div>
                {!selectedPortal ? <p className="text-sm text-muted-foreground text-center py-8">Select a portal to manage MAC whitelist</p> : macLoading ? <Skeleton className="h-48" /> : macEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No MAC whitelist entries</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="w-10"><Checkbox checked={selectedMacs.length === macEntries.length && macEntries.length > 0} onCheckedChange={(c) => setSelectedMacs(c ? macEntries.map((e) => e.id) : [])} /></TableHead>
                        <TableHead className="text-xs">MAC Address</TableHead><TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs">Days</TableHead><TableHead className="text-xs">Time</TableHead>
                        <TableHead className="text-xs">Last Seen</TableHead><TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Act</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {macEntries.map((e) => {
                          const days = safeJsonParse(e.allowedDays, [1, 2, 3, 4, 5, 6, 7]);
                          return (
                            <TableRow key={e.id} className={selectedMacs.includes(e.id) ? "bg-red-50 dark:bg-red-950/10" : ""}>
                              <TableCell><Checkbox checked={selectedMacs.includes(e.id)} onCheckedChange={(c) => setSelectedMacs(c ? [...selectedMacs, e.id] : selectedMacs.filter((x) => x !== e.id))} /></TableCell>
                              <TableCell className="font-mono text-xs">{e.macAddress}</TableCell>
                              <TableCell className="text-xs">{e.description || "—"}</TableCell>
                              <TableCell className="text-xs">{days.map((d: number) => DAY_NAMES[d - 1]).join(", ")}</TableCell>
                              <TableCell className="text-xs">{e.allowedFrom}–{e.allowedUntil}</TableCell>
                              <TableCell className="text-xs">{timeAgo(e.lastSeenAt)}</TableCell>
                              <TableCell><BadgeC color={e.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400"}>{e.enabled ? "Enabled" : "Disabled"}</BadgeC></TableCell>
                              <TableCell className="text-right"><Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { setDeleteId(e.id); setDeleteType("mac-whitelist"); }}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ TAB 7: SCHEDULING ═══════════ */}
          <TabsContent value="schedules">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
                  {portalSelector}
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" disabled={!selectedPortal} onClick={() => { setSf({ ...emptySchedule, daysOfWeek: [1, 2, 3, 4, 5] }); setEditingSchedId(null); setSchedDialog(true); }}><Plus className="h-4 w-4 mr-1.5" />Add Schedule</Button>
                </div>
                {!selectedPortal ? <p className="text-sm text-muted-foreground text-center py-8">Select a portal to manage schedules</p> : schedLoading ? <Skeleton className="h-48" /> : schedules.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No schedules configured</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {schedules.map((s) => {
                      const days = safeJsonParse(s.daysOfWeek, [1, 2, 3, 4, 5]);
                      return (
                        <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div className="flex items-center gap-3 min-w-0">
                            <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{s.name || "Untitled Schedule"}</p>
                              <p className="text-xs text-muted-foreground">{days.map((d: number) => DAY_NAMES[d - 1]).join(", ")} · {s.startTime}–{s.endTime}</p>
                              {s.overridePortal && <p className="text-xs text-violet-600 dark:text-violet-400">Override → {s.overridePortal.name}</p>}
                              <p className="text-xs text-muted-foreground">Out of schedule: {s.outOfScheduleAction.replace(/_/g, " ")}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch checked={s.enabled} onCheckedChange={(c) => schedMut.mutate({ id: s.id, portalId: selectedPortal, enabled: c })} />
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                              const days2 = safeJsonParse(s.daysOfWeek, [1, 2, 3, 4, 5]);
                              setSf({ name: s.name, daysOfWeek: days2, startTime: s.startTime, endTime: s.endTime, overridePortalId: s.overridePortalId || "", outOfScheduleAction: s.outOfScheduleAction, enabled: s.enabled });
                              setEditingSchedId(s.id); setSchedDialog(true);
                            }}><Edit className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { setDeleteId(s.id); setDeleteType("schedules"); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ TAB 8: VOUCHER POOLS ═══════════ */}
          <TabsContent value="vouchers">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
                  {portalSelector}
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" disabled={!selectedPortal} onClick={() => { setPoolF({ ...emptyPool }); setEditingPoolId(null); setPoolDialog(true); }}><Plus className="h-4 w-4 mr-1.5" />Add Pool</Button>
                </div>
                {!selectedPortal ? <p className="text-sm text-muted-foreground text-center py-8">Select a portal</p> : poolLoading ? <Skeleton className="h-48" /> : pools.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No voucher pools</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-xs">Name</TableHead><TableHead className="text-xs">Prefix</TableHead>
                        <TableHead className="text-xs">Max Uses</TableHead><TableHead className="text-xs">Speed</TableHead>
                        <TableHead className="text-xs">Data Limit</TableHead><TableHead className="text-xs">Timeout</TableHead>
                        <TableHead className="text-xs">Activations</TableHead><TableHead className="text-xs">Validity</TableHead>
                        <TableHead className="text-xs">Status</TableHead><TableHead className="text-xs text-right">Act</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {pools.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm font-medium">{p.name}</TableCell>
                            <TableCell className="text-xs font-mono">{p.voucherPrefix || "—"}</TableCell>
                            <TableCell className="text-xs">{p.maxUsesPerVoucher}</TableCell>
                            <TableCell className="text-xs">{(p.speedDownKbps || p.speedUpKbps) ? `${p.speedDownKbps}/${p.speedUpKbps} Kbps` : "Default"}</TableCell>
                            <TableCell className="text-xs">{p.dataLimitMb ? `${p.dataLimitMb} MB` : "—"}</TableCell>
                            <TableCell className="text-xs">{p.sessionTimeoutMin ? `${p.sessionTimeoutMin} min` : "—"}</TableCell>
                            <TableCell className="text-xs">{p.currentActivations}/{p.maxTotalActivations || "∞"}</TableCell>
                            <TableCell className="text-xs">{p.validFrom ? `${fmtDate(p.validFrom)}` : "—"}{p.validUntil ? ` → ${fmtDate(p.validUntil)}` : ""}</TableCell>
                            <TableCell><Switch checked={p.enabled} onCheckedChange={(c) => poolMut.mutate({ id: p.id, portalId: selectedPortal, enabled: c })} /></TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPoolF({ name: p.name, voucherPrefix: p.voucherPrefix, maxUsesPerVoucher: p.maxUsesPerVoucher, maxTotalActivations: p.maxTotalActivations, speedDownKbps: p.speedDownKbps, speedUpKbps: p.speedUpKbps, dataLimitMb: p.dataLimitMb, sessionTimeoutMin: p.sessionTimeoutMin, validFrom: p.validFrom ? p.validFrom.split("T")[0] : "", validUntil: p.validUntil ? p.validUntil.split("T")[0] : "", enabled: p.enabled }); setEditingPoolId(p.id); setPoolDialog(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { setDeleteId(p.id); setDeleteType("voucher-pools"); }}><Trash2 className="h-3.5 w-3.5" /></Button>
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

          {/* ═══════════ TAB 9: ADS & MONETIZATION ═══════════ */}
          <TabsContent value="ads">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
                  {portalSelector}
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" disabled={!selectedPortal} onClick={() => { setAf({ ...emptyAd, scheduleDays: [1, 2, 3, 4, 5, 6, 7] }); setEditingAdId(null); setAdDialog(true); }}><Plus className="h-4 w-4 mr-1.5" />Add Ad</Button>
                </div>
                {!selectedPortal ? <p className="text-sm text-muted-foreground text-center py-8">Select a portal</p> : adsLoading ? <Skeleton className="h-48" /> : ads.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No ad zones configured</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-xs">Name</TableHead><TableHead className="text-xs">Position</TableHead>
                        <TableHead className="text-xs">Type</TableHead><TableHead className="text-xs">Impressions</TableHead>
                        <TableHead className="text-xs">Clicks</TableHead><TableHead className="text-xs">CTR</TableHead>
                        <TableHead className="text-xs">Schedule</TableHead><TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Act</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {ads.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="text-sm font-medium">{a.name}</TableCell>
                            <TableCell><BadgeC color="bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300">{a.position}</BadgeC></TableCell>
                            <TableCell><BadgeC color="bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400">{a.adType}</BadgeC></TableCell>
                            <TableCell className="text-xs">{a.impressions.toLocaleString()}</TableCell>
                            <TableCell className="text-xs">{a.clicks.toLocaleString()}</TableCell>
                            <TableCell className="text-xs font-semibold">{a.impressions > 0 ? pctCalc(a.clicks, a.impressions) : "0%"}</TableCell>
                            <TableCell className="text-xs">{a.scheduleEnabled ? `${a.scheduleStart}–${a.scheduleEnd}` : "Always"}</TableCell>
                            <TableCell><Switch checked={a.enabled} onCheckedChange={(c) => adMut.mutate({ id: a.id, portalId: selectedPortal, enabled: c })} /></TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                  const days2 = safeJsonParse(a.scheduleDays, [1, 2, 3, 4, 5, 6, 7]);
                                  setAf({ name: a.name, position: a.position, adType: a.adType, content: a.content, redirectUrl: a.redirectUrl, scheduleEnabled: a.scheduleEnabled, scheduleDays: days2, scheduleStart: a.scheduleStart, scheduleEnd: a.scheduleEnd, enabled: a.enabled });
                                  setEditingAdId(a.id); setAdDialog(true);
                                }}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { setDeleteId(a.id); setDeleteType("ads"); }}><Trash2 className="h-3.5 w-3.5" /></Button>
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

          {/* ═══════════ TAB 10: EVENT LOG ═══════════ */}
          <TabsContent value="events">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search MAC..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
                  <Select value={evtFilter.eventType || "__all__"} onValueChange={(v) => setEvtFilter((p) => ({ ...p, eventType: v === "__all__" ? "" : v }))}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Event Type" /></SelectTrigger>
                    <SelectContent><SelectItem value="__all__">All Types</SelectItem>
                      {["AUTH_SUCCESS", "AUTH_FAILURE", "SESSION_START", "SESSION_END", "SESSION_TIMEOUT", "DATA_CAP", "VOUCHER_USED", "VOUCHER_EXHAUSTED", "MAC_AUTH"].map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" className="w-36" value={evtFilter.dateFrom} onChange={(e) => setEvtFilter((p) => ({ ...p, dateFrom: e.target.value }))} />
                  <Input type="date" className="w-36" value={evtFilter.dateTo} onChange={(e) => setEvtFilter((p) => ({ ...p, dateTo: e.target.value }))} />
                  <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["cp-events"] })}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /></Button>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs">Time</TableHead><TableHead className="text-xs">Portal</TableHead>
                      <TableHead className="text-xs">Event</TableHead><TableHead className="text-xs">MAC</TableHead>
                      <TableHead className="text-xs">IP</TableHead><TableHead className="text-xs">User</TableHead>
                      <TableHead className="text-xs">Voucher</TableHead><TableHead className="text-xs">Details</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {eventsLoading ? <SkeletonRow cols={8} /> : events.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No events found</TableCell></TableRow>
                      ) : events.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs whitespace-nowrap">{fmtTime(e.createdAt)}</TableCell>
                          <TableCell className="text-xs">{e.portal?.name || "—"}</TableCell>
                          <TableCell><BadgeC color={e.eventType.includes("SUCCESS") || e.eventType === "SESSION_START" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : e.eventType.includes("FAILURE") || e.eventType.includes("CAP") ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" : e.eventType.includes("TIMEOUT") || e.eventType.includes("EXHAUSTED") ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" : "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300"}>{e.eventType.replace(/_/g, " ")}</BadgeC></TableCell>
                          <TableCell className="text-xs font-mono">{e.macAddress || "—"}</TableCell>
                          <TableCell className="text-xs font-mono">{e.ipAddress || "—"}</TableCell>
                          <TableCell className="text-xs">{e.authUsername || "—"}</TableCell>
                          <TableCell className="text-xs font-mono">{e.voucherCode || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{e.details || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ TAB 11: ANALYTICS ═══════════ */}
          <TabsContent value="analytics">
            <div className="space-y-6">
              {analyticsLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { t: "Sessions Today", v: analytics.sessionsToday || 0, s: "Authentications", c: "text-emerald-600" },
                      { t: "This Week", v: analytics.sessionsThisWeek || 0, s: "Weekly total", c: "text-amber-600" },
                      { t: "This Month", v: analytics.sessionsThisMonth || 0, s: "Monthly total", c: "text-red-600" },
                      { t: "Peak Concurrent", v: analytics.peakConcurrent || 0, s: "Highest simultaneous", c: "text-violet-600" },
                    ].map((s, i) => (
                      <Card key={i} className="border shadow-sm animate-card-enter" style={{ animationDelay: `${i * 75}ms` }}>
                        <CardContent className="p-4"><p className="text-xs text-muted-foreground">{s.t}</p><p className={`text-2xl font-bold ${s.c}`}>{s.v.toLocaleString()}</p><p className="text-[11px] text-muted-foreground">{s.s}</p></CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Auth Method Breakdown */}
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-red-600" />Auth Method Breakdown</CardTitle></CardHeader>
                      <CardContent>
                        {(analytics.authMethodBreakdown || []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No data</p> : (
                          <div className="space-y-3">
                            {(analytics.authMethodBreakdown || []).map((m) => {
                              const total = (analytics.authMethodBreakdown || []).reduce((s2, x) => s2 + x.count, 0);
                              const pct = total > 0 ? (m.count / total) * 100 : 0;
                              return (
                                <div key={m.method}>
                                  <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="flex items-center gap-2"><BadgeC color={METHOD_COLORS[m.method] || ""}>{m.method}</BadgeC></span>
                                    <span className="font-semibold">{m.count} ({pct.toFixed(1)}%)</span>
                                  </div>
                                  <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-red-600 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Top Portals */}
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-red-600" />Top Portals</CardTitle></CardHeader>
                      <CardContent>
                        {(analytics.topPortals || []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No data</p> : (
                          <div className="space-y-2">
                            {(analytics.topPortals || []).map((p, i) => (
                              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-2"><span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span><span className="text-sm font-medium">{p.name}</span></div>
                                <div className="text-right"><p className="text-sm font-bold">{p.sessions}</p><p className="text-[10px] text-muted-foreground">{p.activeSessions} active</p></div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Venue Type Breakdown */}
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Layout className="h-4 w-4 text-red-600" />Venue Type Breakdown</CardTitle></CardHeader>
                      <CardContent>
                        {(analytics.venueTypeBreakdown || []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No data</p> : (
                          <div className="space-y-2">
                            {(analytics.venueTypeBreakdown || []).map((v) => (
                              <div key={v.venueType} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                                <span className="text-sm">{VENUE_ICONS[v.venueType] || "📌"} {v.venueType.replace(/_/g, " ")}</span>
                                <Badge variant="secondary" className="text-xs">{v.count}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Top MACs */}
                    <Card className="border shadow-sm">
                      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Fingerprint className="h-4 w-4 text-red-600" />Top MAC Addresses</CardTitle></CardHeader>
                      <CardContent>
                        {(analytics.topMacAddresses || []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No data</p> : (
                          <div className="space-y-2">
                            {(analytics.topMacAddresses || []).slice(0, 10).map((m, i) => (
                              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                                <span className="text-xs font-mono">{m.mac}</span>
                                <Badge variant="secondary" className="text-[10px]">{m.sessions} sessions</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ═══════════ DIALOGS ═══════════ */}

        {/* Portal Create/Edit Dialog */}
        <Dialog open={portalDialog} onOpenChange={setPortalDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader><DialogTitle>{editingId ? "Edit Portal" : "Create Portal"}</DialogTitle><DialogDescription>{editingId ? "Update portal configuration" : "Configure a new captive portal"}</DialogDescription></DialogHeader>
            <div className="border-b mb-4">
              <div className="flex gap-1 flex-wrap">
                {["basic", "auth", "bandwidth", "limits", "redirect", "content", "theme", "collection", "business"].map((s) => (
                  <Button key={s} variant={pfSection === s ? "default" : "ghost"} size="sm" className="h-8 text-xs capitalize" onClick={() => setPfSection(s)}>{s}</Button>
                ))}
              </div>
            </div>
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-4">
                {pfSection === "basic" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2"><Label>Name *</Label><Input value={pf.name} onChange={(e) => setPf((p) => ({ ...p, name: e.target.value }))} placeholder="Portal name" /></div>
                    <div className="sm:col-span-2"><Label>Description</Label><Textarea value={pf.description} onChange={(e) => setPf((p) => ({ ...p, description: e.target.value }))} rows={2} /></div>
                    <div><Label>Template</Label><Select value={pf.template} onValueChange={(v) => setPf((p) => ({ ...p, template: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TEMPLATES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Venue Type</Label><Select value={pf.venueType} onValueChange={(v) => setPf((p) => ({ ...p, venueType: v }))}><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{VENUE_TYPES.map((v) => <SelectItem key={v} value={v}>{VENUE_ICONS[v]} {v.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Site Name</Label><Input value={pf.siteName} onChange={(e) => setPf((p) => ({ ...p, siteName: e.target.value }))} placeholder="e.g. Hotel Taj Lobby" /></div>
                    <div><Label>Location</Label><Select value={pf.locationId} onValueChange={(v) => setPf((p) => ({ ...p, locationId: v }))}><SelectTrigger><SelectValue placeholder="Select area..." /></SelectTrigger><SelectContent><SelectItem value="__none">None</SelectItem>{areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="sm:col-span-2 flex items-center justify-between p-3 rounded-lg border"><div><Label>Enabled</Label><p className="text-xs text-muted-foreground">Activate this portal</p></div><Switch checked={pf.enabled} onCheckedChange={(c) => setPf((p) => ({ ...p, enabled: c }))} /></div>
                  </div>
                )}
                {pfSection === "auth" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Login Method</Label><Select value={pf.loginMethod} onValueChange={(v) => setPf((p) => ({ ...p, loginMethod: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LOGIN_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                    <div className="flex items-center justify-between p-3 rounded-lg border"><div><Label>Voucher Required</Label><p className="text-xs text-muted-foreground">Require voucher code</p></div><Switch checked={pf.voucherRequired} onCheckedChange={(c) => setPf((p) => ({ ...p, voucherRequired: c }))} /></div>
                    {pf.voucherRequired && <div><Label>Voucher Policy</Label><Select value={pf.voucherReusePolicy} onValueChange={(v) => setPf((p) => ({ ...p, voucherReusePolicy: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VOUCHER_POLICIES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>}
                    <div className="flex items-center justify-between p-3 rounded-lg border"><div><Label>MAC Auth</Label><p className="text-xs text-muted-foreground">Auto-auth by MAC</p></div><Switch checked={pf.macAuthEnabled} onCheckedChange={(c) => setPf((p) => ({ ...p, macAuthEnabled: c }))} /></div>
                    {pf.macAuthEnabled && <div><Label>Unknown MAC Action</Label><Select value={pf.macAuthUnknownAction} onValueChange={(v) => setPf((p) => ({ ...p, macAuthUnknownAction: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MAC_ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>}
                    <div><Label>Social Providers</Label>
                      <div className="flex flex-wrap gap-2 mt-1">{SOCIAL_OPTIONS.map((s) => <Badge key={s} variant={pf.socialProviders.includes(s) ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setPf((p) => ({ ...p, socialProviders: p.socialProviders.includes(s) ? p.socialProviders.filter((x) => x !== s) : [...p.socialProviders, s] }))}>{s}</Badge>)}</div>
                    </div>
                    <div><Label>Session Timeout (sec)</Label><Input type="number" value={pf.sessionTimeoutSec} onChange={(e) => setPf((p) => ({ ...p, sessionTimeoutSec: parseInt(e.target.value) || 0 }))} /></div>
                    <div><Label>Idle Timeout (sec)</Label><Input type="number" value={pf.idleTimeoutSec} onChange={(e) => setPf((p) => ({ ...p, idleTimeoutSec: parseInt(e.target.value) || 0 }))} /></div>
                    {isModuleEnabled("ipv6") && (
                      <div className="space-y-3 p-4 border rounded-lg sm:col-span-2">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-cyan-600" />
                          <Label className="text-sm font-semibold">IPv6 Client Detection</Label>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Intercept IPv6 Clients</Label>
                            <p className="text-xs text-muted-foreground">Capture IPv6 devices and redirect to portal</p>
                          </div>
                          <Switch checked={pf.ipv6Enabled} onCheckedChange={(v) => setPf({...pf, ipv6Enabled: v})} />
                        </div>
                        {pf.ipv6Enabled && (
                          <div className="space-y-1.5">
                            <Label>Detection Method</Label>
                            <Select value={pf.ipv6DetectionMethod || "radius"} onValueChange={(v) => setPf({...pf, ipv6DetectionMethod: v})}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="radius">RADIUS IPv6 Attributes</SelectItem>
                                <SelectItem value="ndp-proxy">NDP Proxy</SelectItem>
                                <SelectItem value="dns-redirect">DNS Redirect (AAAA)</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              RADIUS: Uses Framed-IPv6-Address from RADIUS. NDP Proxy: Intercepts Neighbor Discovery. DNS: Redirects IPv6 DNS queries.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {pfSection === "bandwidth" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Data Limit (MB)</Label><Input type="number" value={pf.dataLimitMb} onChange={(e) => setPf((p) => ({ ...p, dataLimitMb: e.target.value }))} placeholder="0 = unlimited" /></div>
                    <div><Label>FAP Soft Cap (MB)</Label><Input type="number" value={pf.fapDataLimitMb} onChange={(e) => setPf((p) => ({ ...p, fapDataLimitMb: e.target.value }))} placeholder="Throttle after N MB" /></div>
                    <div><Label>Download Limit (Kbps)</Label><Input type="number" value={pf.bandwidthLimitDown} onChange={(e) => setPf((p) => ({ ...p, bandwidthLimitDown: parseInt(e.target.value) || 0 }))} placeholder="0 = unlimited" /></div>
                    <div><Label>Upload Limit (Kbps)</Label><Input type="number" value={pf.bandwidthLimitUp} onChange={(e) => setPf((p) => ({ ...p, bandwidthLimitUp: parseInt(e.target.value) || 0 }))} placeholder="0 = unlimited" /></div>
                  </div>
                )}
                {pfSection === "limits" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Max Concurrent Sessions</Label><Input type="number" value={pf.maxConcurrentSessions} onChange={(e) => setPf((p) => ({ ...p, maxConcurrentSessions: parseInt(e.target.value) || 0 }))} placeholder="0 = unlimited" /></div>
                    <div className="flex items-center justify-between p-3 rounded-lg border"><div><Label>Passthrough Mode</Label><p className="text-xs text-muted-foreground">Auto-allow without login</p></div><Switch checked={pf.passthroughMode} onCheckedChange={(c) => setPf((p) => ({ ...p, passthroughMode: c }))} /></div>
                  </div>
                )}
                {pfSection === "redirect" && (
                  <div className="space-y-4">
                    <div><Label>Redirect URL</Label><Input value={pf.redirectUrl} onChange={(e) => setPf((p) => ({ ...p, redirectUrl: e.target.value }))} placeholder="https://example.com" /></div>
                    <div><Label>Original URL Parameter</Label><Input value={pf.originalUrlParam} onChange={(e) => setPf((p) => ({ ...p, originalUrlParam: e.target.value }))} placeholder="original_url" /></div>
                    <div><Label>Custom Login Page URL</Label><Input value={pf.customLoginPageUrl} onChange={(e) => setPf((p) => ({ ...p, customLoginPageUrl: e.target.value }))} placeholder="https://custom-login.example.com" /></div>
                  </div>
                )}
                {pfSection === "content" && (
                  <div className="space-y-4">
                    <div><Label>Welcome Title</Label><Input value={pf.welcomeTitle} onChange={(e) => setPf((p) => ({ ...p, welcomeTitle: e.target.value }))} /></div>
                    <div><Label>Welcome Message</Label><Textarea value={pf.welcomeMessage} onChange={(e) => setPf((p) => ({ ...p, welcomeMessage: e.target.value }))} rows={2} /></div>
                    <div><Label>Terms of Service</Label><Textarea value={pf.tosText} onChange={(e) => setPf((p) => ({ ...p, tosText: e.target.value }))} rows={3} /></div>
                    <div><Label>Success Message</Label><Textarea value={pf.successMessage} onChange={(e) => setPf((p) => ({ ...p, successMessage: e.target.value }))} rows={2} /></div>
                    <div><Label>Timeout Message</Label><Textarea value={pf.timeoutMessage} onChange={(e) => setPf((p) => ({ ...p, timeoutMessage: e.target.value }))} rows={2} /></div>
                    <div><Label>Data Cap Message</Label><Textarea value={pf.dataCapMessage} onChange={(e) => setPf((p) => ({ ...p, dataCapMessage: e.target.value }))} rows={2} /></div>
                  </div>
                )}
                {pfSection === "theme" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Primary Color</Label><div className="flex gap-2"><Input type="color" value={pf.primaryColor} onChange={(e) => setPf((p) => ({ ...p, primaryColor: e.target.value }))} className="w-12 h-9 p-1" /><Input value={pf.primaryColor} onChange={(e) => setPf((p) => ({ ...p, primaryColor: e.target.value }))} /></div></div>
                    <div><Label>Secondary Color</Label><div className="flex gap-2"><Input type="color" value={pf.secondaryColor} onChange={(e) => setPf((p) => ({ ...p, secondaryColor: e.target.value }))} className="w-12 h-9 p-1" /><Input value={pf.secondaryColor} onChange={(e) => setPf((p) => ({ ...p, secondaryColor: e.target.value }))} /></div></div>
                    <div><Label>Logo URL</Label><Input value={pf.logoUrl} onChange={(e) => setPf((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="https://..." /></div>
                    <div><Label>Background Image URL</Label><Input value={pf.backgroundImageUrl} onChange={(e) => setPf((p) => ({ ...p, backgroundImageUrl: e.target.value }))} placeholder="https://..." /></div>
                    {pf.logoUrl && <div className="sm:col-span-2 p-4 rounded-lg border bg-muted/30"><p className="text-xs text-muted-foreground mb-2">Preview</p><div className="w-32 h-16 rounded bg-white border flex items-center justify-center">{pf.logoUrl ? <img src={pf.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}</div></div>}
                  </div>
                )}
                {pfSection === "collection" && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Choose what information to collect from users during login</p>
                    {[{ key: "collectPhone", label: "Phone Number", desc: "Collect user phone number" }, { key: "collectEmail", label: "Email Address", desc: "Collect user email" }, { key: "collectName", label: "Full Name", desc: "Collect user name" }].map((item) => (
                      <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border">
                        <div><Label>{item.label}</Label><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                        <Switch checked={pf[item.key as keyof typeof pf] as boolean} onCheckedChange={(c) => setPf((p) => ({ ...p, [item.key]: c }))} />
                      </div>
                    ))}
                  </div>
                )}
                {pfSection === "business" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Partner (Agent)</Label><Select value={pf.partnerId} onValueChange={(v) => setPf((p) => ({ ...p, partnerId: v }))}><SelectTrigger><SelectValue placeholder="Select partner..." /></SelectTrigger><SelectContent><SelectItem value="__none">None</SelectItem>{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Revenue Share (%)</Label><Input type="number" step="0.01" value={pf.revenueSharePercent} onChange={(e) => setPf((p) => ({ ...p, revenueSharePercent: parseFloat(e.target.value) || 0 }))} /></div>
                    <div><Label>Priority</Label><Input type="number" value={pf.priority} onChange={(e) => setPf((p) => ({ ...p, priority: parseInt(e.target.value) || 0 }))} /></div>
                  </div>
                )}
              </div>
            </ScrollArea>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPortalDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={savePortal} disabled={portalMut.isPending}>
                {portalMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{editingId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rule Dialog */}
        <Dialog open={ruleDialog} onOpenChange={setRuleDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingRuleId ? "Edit Rule" : "Add Rule"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name *</Label><Input value={rf.name} onChange={(e) => setRf((r) => ({ ...r, name: e.target.value }))} /></div>
              <div><Label>Description</Label><Textarea value={rf.description} onChange={(e) => setRf((r) => ({ ...r, description: e.target.value }))} rows={2} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Field</Label><Select value={rf.field} onValueChange={(v) => setRf((r) => ({ ...r, field: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RULE_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Operator</Label><Select value={rf.operator} onValueChange={(v) => setRf((r) => ({ ...r, operator: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RULE_OPERATORS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Value</Label><Input value={rf.value} onChange={(e) => setRf((r) => ({ ...r, value: e.target.value }))} />
                  {isModuleEnabled("ipv6") && rf.field === "IP" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      IPv6 CIDR supported (e.g., 2001:db8::/32)
                    </p>
                  )}
                </div>
              </div>
              <div>
                <Label>Actions</Label>
                <div className="flex flex-wrap gap-2 mt-1">{RULE_ACTIONS_LIST.map((a) => <Badge key={a} variant={rf.actions.includes(a) ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setRf((r) => ({ ...r, actions: r.actions.includes(a) ? r.actions.filter((x) => x !== a) : [...r.actions, a] }))}>{a}</Badge>)}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Priority</Label><Input type="number" value={rf.priority} onChange={(e) => setRf((r) => ({ ...r, priority: parseInt(e.target.value) || 0 }))} /></div>
                <div className="flex items-center justify-between p-3 rounded-lg border"><div><Label>Stop on Match</Label></div><Switch checked={rf.stopOnMatch} onCheckedChange={(c) => setRf((r) => ({ ...r, stopOnMatch: c }))} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRuleDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={saveRule} disabled={ruleMut.isPending}>{ruleMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{editingRuleId ? "Update" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MAC Add Dialog */}
        <Dialog open={macDialog} onOpenChange={setMacDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add MAC Address</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>MAC Address *</Label><Input value={mf.macAddress} onChange={(e) => setMf((m) => ({ ...m, macAddress: e.target.value }))} placeholder="AA:BB:CC:DD:EE:FF" /></div>
              <div><Label>Description</Label><Input value={mf.description} onChange={(e) => setMf((m) => ({ ...m, description: e.target.value }))} /></div>
              <div>
                <Label>Allowed Days</Label>
                <div className="flex gap-2 mt-1 flex-wrap">{DAY_NAMES.map((d, i) => <Badge key={d} variant={mf.allowedDays.includes(i + 1) ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setMf((m) => ({ ...m, allowedDays: m.allowedDays.includes(i + 1) ? m.allowedDays.filter((x) => x !== i + 1) : [...m.allowedDays, i + 1] }))}>{d}</Badge>)}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>From</Label><Input type="time" value={mf.allowedFrom} onChange={(e) => setMf((m) => ({ ...m, allowedFrom: e.target.value }))} /></div>
                <div><Label>Until</Label><Input type="time" value={mf.allowedUntil} onChange={(e) => setMf((m) => ({ ...m, allowedUntil: e.target.value }))} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMacDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { if (!mf.macAddress.trim()) return toast.error("MAC address required"); macMut.mutate({ portalId: selectedPortal, ...mf, allowedDays: JSON.stringify(mf.allowedDays) }); }} disabled={macMut.isPending}>{macMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Schedule Dialog */}
        <Dialog open={schedDialog} onOpenChange={setSchedDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editingSchedId ? "Edit Schedule" : "Add Schedule"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={sf.name} onChange={(e) => setSf((s) => ({ ...s, name: e.target.value }))} /></div>
              <div>
                <Label>Days</Label>
                <div className="flex gap-2 mt-1 flex-wrap">{DAY_NAMES.map((d, i) => <Badge key={d} variant={sf.daysOfWeek.includes(i + 1) ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setSf((s) => ({ ...s, daysOfWeek: s.daysOfWeek.includes(i + 1) ? s.daysOfWeek.filter((x) => x !== i + 1) : [...s.daysOfWeek, i + 1] }))}>{d}</Badge>)}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Time</Label><Input type="time" value={sf.startTime} onChange={(e) => setSf((s) => ({ ...s, startTime: e.target.value }))} /></div>
                <div><Label>End Time</Label><Input type="time" value={sf.endTime} onChange={(e) => setSf((s) => ({ ...s, endTime: e.target.value }))} /></div>
              </div>
              <div><Label>Override Portal</Label><Select value={sf.overridePortalId} onValueChange={(v) => setSf((s) => ({ ...s, overridePortalId: v }))}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="__none">None</SelectItem>{portals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Out-of-Schedule Action</Label><Select value={sf.outOfScheduleAction} onValueChange={(v) => setSf((s) => ({ ...s, outOfScheduleAction: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OUT_OF_SCHEDULE_ACTIONS.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSchedDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { schedMut.mutate({ portalId: selectedPortal, ...sf, daysOfWeek: JSON.stringify(sf.daysOfWeek), overridePortalId: sf.overridePortalId || null }); }} disabled={schedMut.isPending}>{schedMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{editingSchedId ? "Update" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Voucher Pool Dialog */}
        <Dialog open={poolDialog} onOpenChange={setPoolDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingPoolId ? "Edit Pool" : "Add Voucher Pool"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={poolF.name} onChange={(e) => setPoolF((p) => ({ ...p, name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Prefix</Label><Input value={poolF.voucherPrefix} onChange={(e) => setPoolF((p) => ({ ...p, voucherPrefix: e.target.value }))} placeholder="e.g. HTL-" /></div>
                <div><Label>Max Uses / Voucher</Label><Input type="number" value={poolF.maxUsesPerVoucher} onChange={(e) => setPoolF((p) => ({ ...p, maxUsesPerVoucher: parseInt(e.target.value) || 1 }))} /></div>
                <div><Label>Max Activations</Label><Input type="number" value={poolF.maxTotalActivations} onChange={(e) => setPoolF((p) => ({ ...p, maxTotalActivations: parseInt(e.target.value) || 0 }))} placeholder="0 = unlimited" /></div>
                <div><Label>Speed Down (Kbps)</Label><Input type="number" value={poolF.speedDownKbps} onChange={(e) => setPoolF((p) => ({ ...p, speedDownKbps: parseInt(e.target.value) || 0 }))} placeholder="0 = default" /></div>
                <div><Label>Speed Up (Kbps)</Label><Input type="number" value={poolF.speedUpKbps} onChange={(e) => setPoolF((p) => ({ ...p, speedUpKbps: parseInt(e.target.value) || 0 }))} /></div>
                <div><Label>Data Limit (MB)</Label><Input type="number" value={poolF.dataLimitMb} onChange={(e) => setPoolF((p) => ({ ...p, dataLimitMb: parseInt(e.target.value) || 0 }))} /></div>
                <div><Label>Timeout (min)</Label><Input type="number" value={poolF.sessionTimeoutMin} onChange={(e) => setPoolF((p) => ({ ...p, sessionTimeoutMin: parseInt(e.target.value) || 0 }))} /></div>
                <div><Label>Valid From</Label><Input type="date" value={poolF.validFrom} onChange={(e) => setPoolF((p) => ({ ...p, validFrom: e.target.value }))} /></div>
                <div><Label>Valid Until</Label><Input type="date" value={poolF.validUntil} onChange={(e) => setPoolF((p) => ({ ...p, validUntil: e.target.value }))} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPoolDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { const body: Record<string, unknown> = { portalId: selectedPortal, ...poolF, validFrom: poolF.validFrom || null, validUntil: poolF.validUntil || null }; if (editingPoolId) body.id = editingPoolId; poolMut.mutate(body); }} disabled={poolMut.isPending}>{poolMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{editingPoolId ? "Update" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Ad Dialog */}
        <Dialog open={adDialog} onOpenChange={setAdDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingAdId ? "Edit Ad" : "Add Ad Zone"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={af.name} onChange={(e) => setAf((a) => ({ ...a, name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Position</Label><Select value={af.position} onValueChange={(v) => setAf((a) => ({ ...a, position: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AD_POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Ad Type</Label><Select value={af.adType} onValueChange={(v) => setAf((a) => ({ ...a, adType: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div><Label>Content</Label><Textarea value={af.content} onChange={(e) => setAf((a) => ({ ...a, content: e.target.value }))} rows={3} placeholder="URL, HTML, or text content" /></div>
              <div><Label>Redirect URL</Label><Input value={af.redirectUrl} onChange={(e) => setAf((a) => ({ ...a, redirectUrl: e.target.value }))} placeholder="https://..." /></div>
              <div className="flex items-center justify-between p-3 rounded-lg border"><div><Label>Schedule</Label><p className="text-xs text-muted-foreground">Enable time-based scheduling</p></div><Switch checked={af.scheduleEnabled} onCheckedChange={(c) => setAf((a) => ({ ...a, scheduleEnabled: c }))} /></div>
              {af.scheduleEnabled && (
                <div className="grid grid-cols-2 gap-3 pl-2">
                  <div><Label>Start</Label><Input type="time" value={af.scheduleStart} onChange={(e) => setAf((a) => ({ ...a, scheduleStart: e.target.value }))} /></div>
                  <div><Label>End</Label><Input type="time" value={af.scheduleEnd} onChange={(e) => setAf((a) => ({ ...a, scheduleEnd: e.target.value }))} /></div>
                  <div className="col-span-2"><Label>Schedule Days</Label><div className="flex gap-2 mt-1 flex-wrap">{DAY_NAMES.map((d, i) => <Badge key={d} variant={af.scheduleDays.includes(i + 1) ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setAf((a) => ({ ...a, scheduleDays: a.scheduleDays.includes(i + 1) ? a.scheduleDays.filter((x) => x !== i + 1) : [...a.scheduleDays, i + 1] }))}>{d}</Badge>)}</div></div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { const body: Record<string, unknown> = { portalId: selectedPortal, ...af, scheduleDays: JSON.stringify(af.scheduleDays) }; if (editingAdId) body.id = editingAdId; adMut.mutate(body); }} disabled={adMut.isPending}>{adMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{editingAdId ? "Update" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm Delete</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete this {deleteType}? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (deleteId) deleteMut.mutate({ id: deleteId, type: deleteType }); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>

        {/* Disconnect All Confirmation */}
        <AlertDialog open={discAllOpen} onOpenChange={setDiscAllOpen}>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Disconnect All Sessions</AlertDialogTitle><AlertDialogDescription>This will disconnect all {sessions.length} active session(s). Users will need to re-authenticate.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => discAllMut.mutate()}>Disconnect All</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
