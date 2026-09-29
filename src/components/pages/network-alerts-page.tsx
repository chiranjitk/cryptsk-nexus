"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Eye,
  Check,
  Trash2,
  RefreshCw,
  Phone,
  MessageSquare,
  Mail,
  Monitor,
  Edit2,
  Loader2,
  Download,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  UserMinus,
  Ban,
  Undo2,
  CalendarClock,
  Send,
  MessageCircle,
  Copy,
  Layers,
  CalendarDays,
  ArrowUpCircle,
  Volume2,
  VolumeX,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { format, formatDistanceToNow, parseISO } from "date-fns";

const CHART_COLORS = ["#EF4444", "#F97316", "#EAB308", "#3B82F6", "#22C55E", "#8B5CF6"];

// ─── Types ───────────────────────────────────────────────────────
interface EscalationLevel {
  level: number;
  delayMinutes: number;
  assignToRole: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AlertComment {
  id: string;
  message: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface NetworkAlert {
  id: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  type: string;
  title: string;
  message: string;
  device: string;
  area: string;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolution: string;
  status: "Active" | "Acknowledged" | "Working" | "Resolved";
  assignedTo: string;
  assignedToId: string | null;
  assignedToEmail: string;
  ruleId: string;
  duplicateCount: number;
  isDuplicate: boolean;
  escalationLevel: number;
  isSuppressed: boolean;
  escalationEnabled: boolean;
  escalationLevels: EscalationLevel[];
}

interface AlertRule {
  id: string;
  name: string;
  type: string;
  condition: string;
  threshold: string;
  severity: string;
  notifyVia: string[];
  enabled: boolean;
  cooldownMinutes: number;
  escalationEnabled: boolean;
  escalationLevels: EscalationLevel[];
  autoEscalate: boolean;
  escalationIntervalMinutes: number;
  maxSeverity: string;
  deduplicationWindowMinutes: number;
  isSuppressed: boolean;
  activeSuppression: { id: string; reason: string; suppressedBy: string; startsAt: string; endsAt: string | null } | null;
}

interface AlertHistoryItem {
  id: string;
  severity: string;
  type: string;
  title: string;
  message: string;
  device: string;
  triggeredAt: string;
  resolvedAt: string | null;
  resolution: string;
  acknowledgedBy: string;
  duration: number | null;
  duplicateCount: number;
}

interface MaintenanceWindow {
  id: string;
  title: string;
  description: string;
  scheduledAt: string;
  endTime: string;
  affectedAreaIds: string[];
  status: string;
}

// ─── Constants ──────────────────────────────────────────────────
const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  Critical: { bg: "bg-red-100 dark:bg-red-950", text: "text-red-700 dark:text-red-300", border: "border-red-300 dark:border-red-800", dot: "bg-red-500" },
  High: { bg: "bg-orange-100 dark:bg-orange-950", text: "text-orange-700 dark:text-orange-300", border: "border-orange-300 dark:border-orange-800", dot: "bg-orange-500" },
  Medium: { bg: "bg-yellow-100 dark:bg-yellow-950", text: "text-yellow-700 dark:text-yellow-300", border: "border-yellow-300 dark:border-yellow-800", dot: "bg-yellow-500" },
  Low: { bg: "bg-teal-100 dark:bg-teal-950", text: "text-teal-700 dark:text-teal-300", border: "border-teal-300 dark:border-teal-800", dot: "bg-teal-500" },
};

const SEVERITY_ICONS: Record<string, React.ElementType> = {
  Critical: AlertTriangle,
  High: AlertCircle,
  Medium: BellRing,
  Low: Clock,
};

const ALERT_TYPES = ["Device Down", "Bandwidth Threshold", "CPU High", "Interface Down", "Memory High", "Custom"];
const CONDITIONS = ["device/status", "device/cpu", "device/memory", "device/bandwidth", "interface/status"];
const NOTIFY_CHANNELS = [
  { id: "sms", label: "SMS", icon: Phone },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { id: "email", label: "Email", icon: Mail },
  { id: "in_app", label: "In-App", icon: Monitor },
];

const ROLE_OPTIONS = ["OPERATOR", "ADMIN", "SUPER_ADMIN"];
const SEVERITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const SUPPRESS_DURATIONS = [
  { label: "1 hour", value: 1 },
  { label: "6 hours", value: 6 },
  { label: "24 hours", value: 24 },
  { label: "48 hours", value: 48 },
  { label: "Custom", value: -1 },
];

// ─── Helpers ─────────────────────────────────────────────────────
function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getLastWeekStr() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return format(d, "yyyy-MM-dd");
}

function getTodayStr() {
  return format(new Date(), "yyyy-MM-dd");
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

// ─── Network Alerts Page ────────────────────────────────────────
export default function NetworkAlertsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("alerts");
  const [search, setSearch] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: "", type: "Device Down", condition: "device/status",
    threshold: "", severity: "High", notifyVia: ["in_app"] as string[], enabled: true,
    escalationEnabled: false, escalationLevels: [] as EscalationLevel[],
    autoEscalate: false, escalationIntervalMinutes: 30, maxSeverity: "CRITICAL",
    deduplicationWindowMinutes: 10,
  });
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<AlertRule | null>(null);
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [detailAlert, setDetailAlert] = useState<NetworkAlert | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyDateFrom, setHistoryDateFrom] = useState(getLastWeekStr);
  const [historyDateTo, setHistoryDateTo] = useState(getTodayStr);
  const [historyDateFromOpen, setHistoryDateFromOpen] = useState(false);
  const [historyDateToOpen, setHistoryDateToOpen] = useState(false);
  const [assignDialogAlert, setAssignDialogAlert] = useState<NetworkAlert | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [suppressDialogRule, setSuppressDialogRule] = useState<AlertRule | null>(null);
  const [suppressReason, setSuppressReason] = useState("");
  const [suppressEndsAt, setSuppressEndsAt] = useState("");
  const [commentText, setCommentText] = useState("");
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    title: "", description: "", scheduledAt: getTodayStr(), startTime: "09:00", endTime: "17:00",
  });
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [suppressAlertDialog, setSuppressAlertDialog] = useState<NetworkAlert | null>(null);
  const [suppressAlertReason, setSuppressAlertReason] = useState("");
  const [suppressAlertDuration, setSuppressAlertDuration] = useState(1);
  const [suppressAlertCustomEndsAt, setSuppressAlertCustomEndsAt] = useState("");
  const prevAlertCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ─── Queries ─────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["alerts", search, severityFilter, ruleSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (severityFilter && severityFilter !== "ALL") params.set("severity", severityFilter);
      if (ruleSearch) params.set("ruleSearch", ruleSearch);
      return apiFetch<{
        alerts: NetworkAlert[]; rules: AlertRule[]; users: UserItem[];
        suppressions: unknown[]; maintenanceWindows: MaintenanceWindow[];
        stats: { active: number; today: number; acknowledged: number; resolved: number };
      }>(`/api/alerts?${params}`);
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["alert-history", search, historyPage, historyDateFrom, historyDateTo],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(historyPage), limit: "50" });
      if (search) params.set("search", search);
      if (historyDateFrom) params.set("dateFrom", historyDateFrom);
      if (historyDateTo) params.set("dateTo", historyDateTo);
      return apiFetch<{ history: AlertHistoryItem[]; total: number; totalPages: number }>(`/api/alerts/history?${params}`);
    },
    enabled: tab === "history",
  });

  // Header trend chart query (feature 6: 7-day trend)
  const { data: trendData } = useQuery({
    queryKey: ["alert-trend-header"],
    queryFn: () => apiFetch<{
      dailyTrend: { date: string; total: number; critical: number; high: number; medium: number; low: number }[];
    }>("/api/alerts/analytics?days=7"),
    staleTime: 120_000,
  });

  // Analytics query
  const { data: analyticsData } = useQuery({
    queryKey: ["alert-analytics"],
    queryFn: () => apiFetch<{
      dailyTrend: { date: string; total: number; critical: number; high: number; medium: number; low: number; resolved: number; avgResolutionMin: number }[];
      severityDistribution: { severity: string; count: number }[];
      topSources: { ruleId: string; name: string; count: number }[];
      summary: { totalAlerts: number; resolvedCount: number; avgResolutionMin: number; medianResolutionMin: number; resolveRate: number };
    }>("/api/alerts/analytics?days=14"),
    staleTime: 60_000,
    enabled: tab === "analytics",
  });

  // Comments query
  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: ["alert-comments", detailAlert?.id],
    queryFn: () => apiFetch<{ success: boolean; data: AlertComment[] }>("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "get-comments", alertId: detailAlert?.id }),
    }),
    enabled: !!detailAlert,
  });

  const alerts: NetworkAlert[] = data?.alerts || [];
  const rules: AlertRule[] = data?.rules || [];
  const users: UserItem[] = data?.users || [];
  const maintenanceWindows: MaintenanceWindow[] = data?.maintenanceWindows || [];
  const stats = data?.stats || { active: 0, today: 0, acknowledged: 0, resolved: 0 };
  const history: AlertHistoryItem[] = historyData?.history || [];
  const historyTotal = historyData?.total || 0;
  const historyTotalPages = historyData?.totalPages || 1;
  const comments: AlertComment[] = commentsData?.data || [];
  const headerTrend = trendData?.dailyTrend || [];

  // Sound notification: play beep on new critical alert (feature 12)
  useEffect(() => {
    if (!soundEnabled || !alerts.length) return;
    const criticalActive = alerts.filter((a) => a.severity === "Critical" && a.status === "Active").length;
    if (criticalActive > prevAlertCountRef.current && prevAlertCountRef.current > 0) {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.value = 0.3;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 0.5);
        osc.stop(audioCtxRef.current.currentTime + 0.5);
      } catch { /* audio not available */ }
    }
    prevAlertCountRef.current = criticalActive;
  }, [alerts, soundEnabled]);

  // ─── Mutations ──────────────────────────────────────
  const ackMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "acknowledge", id }),
    }),
    onSuccess: () => { toast.success("Alert acknowledged"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); },
    onError: () => toast.error("Failed to acknowledge alert"),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "resolve", id }),
    }),
    onSuccess: () => { toast.success("Alert resolved"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); setDetailAlert(null); },
    onError: () => toast.error("Failed to resolve alert"),
  });

  const bulkAckMutation = useMutation({
    mutationFn: (ids: string[]) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "bulk-acknowledge", ids }),
    }),
    onSuccess: (res: { count: number }) => { toast.success(`${res.count} alerts acknowledged`); setSelectedAlerts(new Set()); queryClient.invalidateQueries({ queryKey: ["alerts"] }); },
    onError: () => toast.error("Failed to acknowledge alerts"),
  });

  const assignMutation = useMutation({
    mutationFn: ({ alertId, userId: uid }: { alertId: string; userId: string }) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "assign-alert", id: alertId, assignedToId: uid }),
    }),
    onSuccess: () => { toast.success("Alert assigned"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); setAssignDialogAlert(null); setAssignUserId(""); },
    onError: () => toast.error("Failed to assign alert"),
  });

  const unassignMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "unassign-alert", id }),
    }),
    onSuccess: () => { toast.success("Alert unassigned"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); },
    onError: () => toast.error("Failed to unassign alert"),
  });

  const suppressMutation = useMutation({
    mutationFn: ({ alertRuleId, reason, endsAt }: { alertRuleId: string; reason: string; endsAt: string }) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "suppress-rule", alertRuleId, reason, endsAt: endsAt || undefined }),
    }),
    onSuccess: () => { toast.success("Rule suppressed"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); setSuppressDialogRule(null); setSuppressReason(""); setSuppressEndsAt(""); },
    onError: () => toast.error("Failed to suppress rule"),
  });

  const unsuppressMutation = useMutation({
    mutationFn: (alertRuleId: string) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "unsuppress-rule", alertRuleId }),
    }),
    onSuccess: () => { toast.success("Suppression removed"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); },
    onError: () => toast.error("Failed to unsuppress"),
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ alertId, message }: { alertId: string; message: string }) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "add-comment", alertId, message }),
    }),
    onSuccess: () => { setCommentText(""); queryClient.invalidateQueries({ queryKey: ["alert-comments"] }); },
    onError: () => toast.error("Failed to add comment"),
  });

  const createMaintenanceMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "create-maintenance", ...body }),
    }),
    onSuccess: () => { toast.success("Maintenance window created"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); setMaintenanceDialogOpen(false); setMaintenanceForm({ title: "", description: "", scheduledAt: getTodayStr(), startTime: "09:00", endTime: "17:00" }); },
    onError: () => toast.error("Failed to create maintenance window"),
  });

  const createRuleMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "create-rule", ...body }),
    }),
    onSuccess: () => { toast.success("Alert rule created"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); setRuleDialogOpen(false); resetRuleForm(); },
    onError: () => toast.error("Failed to create alert rule"),
  });

  const updateRuleMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "update-rule", ...body }),
    }),
    onSuccess: () => { toast.success("Alert rule updated"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); setRuleDialogOpen(false); setEditingRule(null); resetRuleForm(); },
    onError: () => toast.error("Failed to update alert rule"),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "delete-rule", id }),
    }),
    onSuccess: () => { toast.success("Rule deleted"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); setDeleteRuleTarget(null); },
    onError: () => toast.error("Failed to delete rule"),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "toggle-rule", id }),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["alerts"] }); },
    onError: () => toast.error("Failed to toggle rule"),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/alerts/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `network-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => toast.success("CSV exported successfully"),
    onError: () => toast.error("Failed to export CSV"),
  });

  const escalateMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "escalate-alert", id }),
    }),
    onSuccess: (res: { newSeverity: string }) => {
      toast.success(`Alert escalated to ${res.newSeverity || "next level"}`);
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      if (detailAlert) {
        setDetailAlert({ ...detailAlert, escalationLevel: detailAlert.escalationLevel + 1, severity: res.newSeverity as NetworkAlert["severity"] });
      }
    },
    onError: () => toast.error("Failed to escalate alert"),
  });

  const suppressAlertMutation = useMutation({
    mutationFn: ({ id, reason, endsAt }: { id: string; reason: string; endsAt: string }) => apiFetch("/api/alerts", {
      method: "POST", body: JSON.stringify({ action: "suppress-alert", id, reason, endsAt: endsAt || undefined }),
    }),
    onSuccess: () => { toast.success("Alert suppressed"); queryClient.invalidateQueries({ queryKey: ["alerts"] }); setSuppressAlertDialog(null); setSuppressAlertReason(""); setSuppressAlertDuration(1); setSuppressAlertCustomEndsAt(""); setDetailAlert(null); },
    onError: () => toast.error("Failed to suppress alert"),
  });

  // Auto-escalation processing mutation (feature 8)
  const autoEscalateMutation = useMutation({
    mutationFn: () => apiFetch<{ success: boolean; escalated: number; message: string }>("/api/alerts/auto-escalate", {
      method: "POST",
    }),
    onSuccess: (res) => {
      if (res.escalated > 0) {
        toast.info(`Auto-escalated ${res.escalated} alert(s)`);
        queryClient.invalidateQueries({ queryKey: ["alerts"] });
      }
    },
  });

  // Periodic auto-escalation check (every 2 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (tab === "alerts" && alerts.length > 0) {
        autoEscalateMutation.mutate();
      }
    }, 120_000);
    return () => clearInterval(interval);
  }, [tab, alerts.length, autoEscalateMutation]);

  // ─── Form helpers ───────────────────────────────────
  const resetRuleForm = useCallback(() => {
    setRuleForm({
      name: "", type: "Device Down", condition: "device/status", threshold: "",
      severity: "High", notifyVia: ["in_app"], enabled: true,
      escalationEnabled: false, escalationLevels: [],
      autoEscalate: false, escalationIntervalMinutes: 30, maxSeverity: "CRITICAL",
      deduplicationWindowMinutes: 10,
    });
  }, []);

  const toggleNotify = useCallback((channel: string) => {
    setRuleForm((prev) => ({
      ...prev,
      notifyVia: prev.notifyVia.includes(channel)
        ? prev.notifyVia.filter((c) => c !== channel)
        : [...prev.notifyVia, channel],
    }));
  }, []);

  const addEscalationLevel = useCallback(() => {
    setRuleForm((prev) => ({
      ...prev,
      escalationLevels: [...prev.escalationLevels, { level: prev.escalationLevels.length + 1, delayMinutes: 15, assignToRole: "ADMIN" }],
    }));
  }, []);

  const updateEscalationLevel = useCallback((index: number, field: keyof EscalationLevel, value: string | number) => {
    setRuleForm((prev) => ({
      ...prev,
      escalationLevels: prev.escalationLevels.map((l, i) => i === index ? { ...l, [field]: value } : l),
    }));
  }, []);

  const removeEscalationLevel = useCallback((index: number) => {
    setRuleForm((prev) => ({
      ...prev,
      escalationLevels: prev.escalationLevels.filter((_, i) => i !== index).map((l, i) => ({ ...l, level: i + 1 })),
    }));
  }, []);

  const openEditRule = useCallback((rule: AlertRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name, type: "Device Down", condition: rule.condition,
      threshold: rule.threshold, severity: rule.severity,
      notifyVia: rule.notifyVia, enabled: rule.enabled,
      escalationEnabled: rule.escalationEnabled,
      escalationLevels: rule.escalationLevels || [],
      autoEscalate: rule.autoEscalate || false,
      escalationIntervalMinutes: rule.escalationIntervalMinutes || 30,
      maxSeverity: rule.maxSeverity || "CRITICAL",
      deduplicationWindowMinutes: rule.deduplicationWindowMinutes || 10,
    });
    setRuleDialogOpen(true);
  }, []);

  const saveRule = useCallback(() => {
    if (!ruleForm.name) return toast.error("Rule name is required");
    const payload = {
      name: ruleForm.name, condition: ruleForm.condition,
      threshold: ruleForm.threshold, severity: ruleForm.severity,
      notifyChannels: ruleForm.notifyVia, enabled: ruleForm.enabled,
      escalationEnabled: ruleForm.escalationEnabled,
      escalationLevels: ruleForm.escalationEnabled ? ruleForm.escalationLevels : [],
      autoEscalate: ruleForm.autoEscalate,
      escalationIntervalMinutes: ruleForm.escalationIntervalMinutes,
      maxSeverity: ruleForm.maxSeverity,
      deduplicationWindowMinutes: ruleForm.deduplicationWindowMinutes,
    };
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, ...payload });
    } else {
      createRuleMutation.mutate(payload);
    }
  }, [ruleForm, editingRule, createRuleMutation, updateRuleMutation]);

  const toggleSelectAlert = useCallback((id: string) => {
    setSelectedAlerts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllActive = useCallback(() => {
    const activeIds = alerts.filter((a) => a.status === "Active").map((a) => a.id);
    if (selectedAlerts.size === activeIds.length) {
      setSelectedAlerts(new Set());
    } else {
      setSelectedAlerts(new Set(activeIds));
    }
  }, [alerts, selectedAlerts.size]);

  const handleAddComment = useCallback(() => {
    if (!commentText.trim() || !detailAlert) return;
    addCommentMutation.mutate({ alertId: detailAlert.id, message: commentText.trim() });
  }, [commentText, detailAlert, addCommentMutation]);

  const handleCreateMaintenance = useCallback(() => {
    if (!maintenanceForm.title) return toast.error("Title is required");
    const scheduledAt = new Date(`${maintenanceForm.scheduledAt}T${maintenanceForm.startTime}`);
    const endTime = new Date(`${maintenanceForm.scheduledAt}T${maintenanceForm.endTime}`);
    createMaintenanceMutation.mutate({
      title: maintenanceForm.title,
      description: maintenanceForm.description,
      scheduledAt: scheduledAt.toISOString(),
      endTime: endTime.toISOString(),
      affectedAreaIds: [],
    });
  }, [maintenanceForm, createMaintenanceMutation]);

  const handleSuppressRule = useCallback(() => {
    if (!suppressDialogRule) return;
    suppressMutation.mutate({
      alertRuleId: suppressDialogRule.id,
      reason: suppressReason,
      endsAt: suppressEndsAt,
    });
  }, [suppressDialogRule, suppressReason, suppressEndsAt, suppressMutation]);

  const handleSuppressAlert = useCallback(() => {
    if (!suppressAlertDialog) return;
    let endsAt = "";
    if (suppressAlertDuration === -1) {
      endsAt = suppressAlertCustomEndsAt;
    } else {
      const d = new Date();
      d.setHours(d.getHours() + suppressAlertDuration);
      endsAt = d.toISOString();
    }
    suppressAlertMutation.mutate({
      id: suppressAlertDialog.id,
      reason: suppressAlertReason || `Suppressed for ${suppressAlertDuration === -1 ? "custom duration" : SUPPRESS_DURATIONS.find(d => d.value === suppressAlertDuration)?.label}`,
      endsAt,
    });
  }, [suppressAlertDialog, suppressAlertReason, suppressAlertDuration, suppressAlertCustomEndsAt, suppressAlertMutation]);

  // ─── Computed ───────────────────────────────────────
  const activeCount = stats.active;
  const todayCount = stats.today;
  const ackCount = stats.acknowledged;
  const resolvedCount = stats.resolved;

  const filteredAlerts = alerts.filter((a) => {
    const matchStatus = statusFilter === "ALL" || a.status === statusFilter;
    return matchStatus;
  }).sort((a, b) => {
    const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4);
  });

  const filteredRules = ruleSearch
    ? rules.filter((r) => r.name.toLowerCase().includes(ruleSearch.toLowerCase()) || r.condition.toLowerCase().includes(ruleSearch.toLowerCase()) || r.severity.toLowerCase().includes(ruleSearch.toLowerCase()) || r.notifyVia.some((ch) => ch.toLowerCase().includes(ruleSearch.toLowerCase())))
    : rules;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Network Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Monitor, acknowledge, and manage network alerts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={soundEnabled ? "default" : "outline"} size="sm" onClick={() => setSoundEnabled(!soundEnabled)} title={soundEnabled ? "Sound notifications on" : "Sound notifications off"} className="shrink-0">
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Dialog open={maintenanceDialogOpen} onOpenChange={setMaintenanceDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><CalendarClock className="h-4 w-4 mr-2" />Maintenance</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Maintenance Window</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div><Label className="mb-1 block">Title *</Label><Input value={maintenanceForm.title} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })} placeholder="Planned Maintenance" /></div>
                <div><Label className="mb-1 block">Description</Label><Textarea value={maintenanceForm.description} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} placeholder="Details about the maintenance..." rows={3} /></div>
                <div><Label className="mb-1 block">Date *</Label><Input type="date" value={maintenanceForm.scheduledAt} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, scheduledAt: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="mb-1 block">Start Time *</Label><Input type="time" value={maintenanceForm.startTime} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, startTime: e.target.value })} /></div>
                  <div><Label className="mb-1 block">End Time *</Label><Input type="time" value={maintenanceForm.endTime} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, endTime: e.target.value })} /></div>
                </div>
                <p className="text-xs text-muted-foreground">Alerts for affected devices will be automatically suppressed during the maintenance window.</p>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setMaintenanceDialogOpen(false)}>Cancel</Button>
                  <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleCreateMaintenance} disabled={!maintenanceForm.title || createMaintenanceMutation.isPending}>
                    {createMaintenanceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <CalendarClock className="h-4 w-4 mr-2" />Create Window
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={ruleDialogOpen} onOpenChange={(o) => { setRuleDialogOpen(o); if (!o) { setEditingRule(null); resetRuleForm(); } }}>
            <DialogTrigger asChild>
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"><Plus className="h-4 w-4 mr-2" />Add Alert Rule</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingRule ? "Edit Alert Rule" : "Create Alert Rule"}</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div><Label className="mb-1 block">Rule Name *</Label><Input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="Device Offline Alert" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="mb-1 block">Alert Type *</Label><Select value={ruleForm.type} onValueChange={(v) => setRuleForm({ ...ruleForm, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ALERT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="mb-1 block">Condition *</Label><Select value={ruleForm.condition} onValueChange={(v) => setRuleForm({ ...ruleForm, condition: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="mb-1 block">Threshold *</Label><Input value={ruleForm.threshold} onChange={(e) => setRuleForm({ ...ruleForm, threshold: e.target.value })} placeholder="&gt;90% or OFFLINE" /></div>
                  <div><Label className="mb-1 block">Severity *</Label><Select value={ruleForm.severity} onValueChange={(v) => setRuleForm({ ...ruleForm, severity: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Critical", "High", "Medium", "Low"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div>
                  <Label className="mb-2 block">Notify Via</Label>
                  <div className="flex flex-wrap gap-2">
                    {NOTIFY_CHANNELS.map((ch) => (
                      <button key={ch.id} onClick={() => toggleNotify(ch.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${ruleForm.notifyVia.includes(ch.id) ? "bg-[#DC2626]/10 border-[#DC2626] text-[#DC2626]" : "bg-muted border-muted-foreground/20 text-muted-foreground"}`}>
                        <ch.icon className="h-3 w-3" />{ch.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3"><Switch checked={ruleForm.enabled} onCheckedChange={(c) => setRuleForm({ ...ruleForm, enabled: c })} /><Label>Enabled</Label></div>
                <Separator />
                {/* Deduplication */}
                <div>
                  <Label className="mb-1 block">Deduplication Window (minutes)</Label>
                  <Input type="number" min={0} value={ruleForm.deduplicationWindowMinutes} onChange={(e) => setRuleForm({ ...ruleForm, deduplicationWindowMinutes: parseInt(e.target.value) || 0 })} />
                  <p className="text-xs text-muted-foreground mt-1">Duplicate alerts within this window will be grouped instead of creating new alerts.</p>
                </div>
                <Separator />
                {/* Escalation Workflow */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Escalation Workflow</Label>
                    <Switch checked={ruleForm.escalationEnabled} onCheckedChange={(c) => setRuleForm({ ...ruleForm, escalationEnabled: c })} />
                  </div>
                  {ruleForm.escalationEnabled && (
                    <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                      {ruleForm.escalationLevels.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No escalation levels configured.</p>}
                      {ruleForm.escalationLevels.map((lvl, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-background rounded-md border">
                          <Badge variant="outline" className="text-[10px] shrink-0">L{lvl.level}</Badge>
                          <Input type="number" min={1} className="h-8 w-24 text-xs" placeholder="Minutes" value={lvl.delayMinutes} onChange={(e) => updateEscalationLevel(idx, "delayMinutes", parseInt(e.target.value) || 0)} />
                          <span className="text-xs text-muted-foreground shrink-0">min</span>
                          <Select value={lvl.assignToRole} onValueChange={(v) => updateEscalationLevel(idx, "assignToRole", v)}>
                            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-red-500" onClick={() => removeEscalationLevel(idx)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" className="w-full text-xs" onClick={addEscalationLevel}>
                        <Plus className="h-3 w-3 mr-1" />Add Escalation Level
                      </Button>
                    </div>
                  )}
                </div>
                <Separator />
                {/* Auto-Escalation (feature 8) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <Label>Auto-Escalation</Label>
                      <p className="text-xs text-muted-foreground">Automatically escalate alert severity over time</p>
                    </div>
                    <Switch checked={ruleForm.autoEscalate} onCheckedChange={(c) => setRuleForm({ ...ruleForm, autoEscalate: c })} />
                  </div>
                  {ruleForm.autoEscalate && (
                    <div className="grid grid-cols-2 gap-3 border rounded-lg p-3 bg-muted/30">
                      <div>
                        <Label className="mb-1 block text-xs">Interval (minutes)</Label>
                        <Input type="number" min={5} value={ruleForm.escalationIntervalMinutes} onChange={(e) => setRuleForm({ ...ruleForm, escalationIntervalMinutes: parseInt(e.target.value) || 30 })} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs">Max Severity</Label>
                        <Select value={ruleForm.maxSeverity} onValueChange={(v) => setRuleForm({ ...ruleForm, maxSeverity: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{SEVERITY_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => { setRuleDialogOpen(false); setEditingRule(null); resetRuleForm(); }}>Cancel</Button>
                  <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={saveRule} disabled={!ruleForm.name || !ruleForm.threshold || createRuleMutation.isPending || updateRuleMutation.isPending}>
                    {(createRuleMutation.isPending || updateRuleMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingRule ? "Update Rule" : "Create Rule"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Active Alerts" value={activeCount} subtitle="Require attention" icon={AlertTriangle} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Today&apos;s Alerts" value={todayCount} subtitle="Last 24 hours" icon={BellRing} gradient="stat-gradient-amber" delay={75} />
        <StatCard title="Acknowledged" value={ackCount} subtitle="Being worked on" icon={Eye} gradient="stat-gradient-blue" delay={150} />
        <StatCard title="Resolved" value={resolvedCount} subtitle="All time" icon={CheckCircle2} gradient="stat-gradient-green" delay={225} />
      </div>

      {/* Feature 6: Alert Trend Chart (7-day in header area) */}
      {headerTrend.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-red-500" />
              Alert Trend (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={headerTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
                        <p className="font-medium text-foreground mb-1">{label}</p>
                        {payload.map((item) => (
                          <p key={item.name} className="text-muted-foreground">
                            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: item.color }} />
                            {item.name}: {item.value}
                          </p>
                        ))}
                      </div>
                    );
                  }} />
                  <Bar dataKey="critical" name="Critical" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="high" name="High" stackId="a" fill="#F97316" />
                  <Bar dataKey="medium" name="Medium" stackId="a" fill="#EAB308" />
                  <Bar dataKey="low" name="Low" stackId="a" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="rules">Alert Rules</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ═══ Alerts Tab ═══ */}
        <TabsContent value="alerts">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search alerts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
                </div>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Severity" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Severity</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="Working">Working</SelectItem>
                    <SelectItem value="Resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedAlerts.size > 0 && (
                <div className="flex items-center gap-3 mb-3 p-2.5 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                  <span className="text-sm font-medium text-red-700 dark:text-red-300">{selectedAlerts.size} selected</span>
                  <Button size="sm" variant="outline" onClick={toggleSelectAllActive}>Select/Deselect All Active</Button>
                  <Button size="sm" className="bg-[#DC2626] hover:bg-[#B91C1C] text-white ml-auto" onClick={() => bulkAckMutation.mutate(Array.from(selectedAlerts))} disabled={bulkAckMutation.isPending}>
                    {bulkAckMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                    Acknowledge Selected
                  </Button>
                </div>
              )}
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
                      <TableHead className="text-xs font-medium uppercase w-[40px]">
                        <Checkbox checked={selectedAlerts.size === alerts.filter((a) => a.status === "Active").length && alerts.filter((a) => a.status === "Active").length > 0} onCheckedChange={toggleSelectAllActive} />
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase w-[40px]"></TableHead>
                      <TableHead className="text-xs font-medium uppercase">Severity</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Message</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Device</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Triggered</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Assigned</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAlerts.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No alerts found.</TableCell></TableRow>
                    ) : filteredAlerts.map((alert) => {
                      const sev = SEVERITY_CONFIG[alert.severity];
                      const isActive = alert.status === "Active";
                      return (
                        <TableRow key={alert.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell>
                            {isActive && <Checkbox checked={selectedAlerts.has(alert.id)} onCheckedChange={() => toggleSelectAlert(alert.id)} />}
                          </TableCell>
                          <TableCell>
                            <div className={`w-2 h-2 rounded-full ${sev.dot}`} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={`text-[10px] ${sev.bg} ${sev.text} ${sev.border}`}>{alert.severity}</Badge>
                              {alert.duplicateCount > 1 && (
                                <Badge variant="secondary" className="text-[10px]"><Copy className="h-2.5 w-2.5 mr-0.5" />{alert.duplicateCount}</Badge>
                              )}
                              {alert.isDuplicate && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">DUP</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <button onClick={() => setDetailAlert(alert)} className="text-left hover:underline">
                              <div>
                                <p className="text-sm">{alert.message}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <p className="text-xs text-muted-foreground">{alert.type}</p>
                                  {alert.escalationLevel > 0 && (
                                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                                      <ArrowUpCircle className="h-2.5 w-2.5 mr-0.5" />Escalated L{alert.escalationLevel}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </button>
                          </TableCell>
                          <TableCell className="text-sm font-mono">{alert.device}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatTimeAgo(alert.triggeredAt)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              alert.status === "Active" ? "badge-active" :
                              alert.status === "Acknowledged" ? "badge-suspended" :
                              alert.status === "Working" ? "badge-pending" :
                              "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                            }>{alert.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {alert.assignedTo ? (
                              <div className="flex items-center gap-1.5">
                                <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{alert.assignedTo.split(" ").map((n) => n[0]).join("")}</AvatarFallback></Avatar>
                                <span>{alert.assignedTo}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailAlert(alert)} title="View details"><Eye className="h-3.5 w-3.5" /></Button>
                              {(alert.status === "Active" || alert.status === "Acknowledged") && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAssignDialogAlert(alert)} title="Assign to user">
                                  <UserPlus className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {alert.assignedToId && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500" onClick={() => unassignMutation.mutate(alert.id)} title="Unassign">
                                  <UserMinus className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {alert.status === "Active" && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => ackMutation.mutate(alert.id)}><Eye className="h-3 w-3 mr-1" />Ack</Button>
                              )}
                              {(alert.status === "Active" || alert.status === "Acknowledged" || alert.status === "Working") && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => resolveMutation.mutate(alert.id)}><Check className="h-3 w-3 mr-1" />Resolve</Button>
                              )}
                              {(alert.status === "Active" || alert.status === "Acknowledged") && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500" onClick={() => escalateMutation.mutate(alert.id)} title="Escalate">
                                  <ArrowUpCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {(alert.status === "Active" || alert.status === "Acknowledged") && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500" onClick={() => { setSuppressAlertDialog(alert); setSuppressAlertReason(""); setSuppressAlertDuration(1); }} title="Suppress">
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
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

        {/* ═══ Rules Tab ═══ */}
        <TabsContent value="rules">
          <div className="space-y-3">
            {/* Feature 9: Search on Rules tab */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search rules by name, description, severity..." value={ruleSearch} onChange={(e) => setRuleSearch(e.target.value)} className="pl-8" />
            </div>
            {filteredRules.length === 0 ? (
              <Card className="border shadow-sm"><CardContent className="py-12 text-center text-muted-foreground">No alert rules configured.</CardContent></Card>
            ) : filteredRules.map((rule) => {
              const sev = SEVERITY_CONFIG[rule.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.Low;
              return (
                <Card key={rule.id} className={`border shadow-sm ${!rule.enabled ? "opacity-60" : ""}`}>
                  <CardContent className="p-4">
                    {/* Suppression banner */}
                    {rule.isSuppressed && rule.activeSuppression && (
                      <div className="flex items-center gap-2 mb-3 p-2.5 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <Ban className="h-4 w-4 text-amber-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Suppressed</p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 truncate">{rule.activeSuppression.reason || "No reason provided"} · by {rule.activeSuppression.suppressedBy}</p>
                          {rule.activeSuppression.endsAt && <p className="text-xs text-muted-foreground">Until {formatDateTime(rule.activeSuppression.endsAt)}</p>}
                        </div>
                        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 text-amber-700 border-amber-300" onClick={() => unsuppressMutation.mutate(rule.id)} disabled={unsuppressMutation.isPending}>
                          <Undo2 className="h-3 w-3 mr-1" />Unsuppress
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-medium">{rule.name}</p>
                          <Badge variant="outline" className={`text-[10px] ${sev.bg} ${sev.text} ${sev.border}`}>{rule.severity}</Badge>
                          {rule.escalationEnabled && (
                            <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300 bg-purple-50 dark:bg-purple-950/30">
                              <Layers className="h-2.5 w-2.5 mr-0.5" />{rule.escalationLevels.length} Levels
                            </Badge>
                          )}
                          {rule.autoEscalate && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                              <TrendingUp className="h-2.5 w-2.5 mr-0.5" />Auto {rule.escalationIntervalMinutes}m → {rule.maxSeverity}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">Dedup: {rule.deduplicationWindowMinutes}m</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          When <span className="font-mono font-medium">{rule.condition}</span> is <span className="font-mono font-medium">{rule.threshold}</span>
                          {" → notify via "}
                          {rule.notifyVia.map((ch) => ch).join(", ")}
                        </p>
                        {rule.escalationEnabled && rule.escalationLevels.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {rule.escalationLevels.map((lvl) => (
                              <Badge key={lvl.level} variant="outline" className="text-[10px]">L{lvl.level}: {lvl.delayMinutes}min → {lvl.assignToRole}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={rule.enabled} onCheckedChange={() => toggleRuleMutation.mutate(rule.id)} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSuppressDialogRule(rule)} title={rule.isSuppressed ? "Update suppression" : "Suppress rule"}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRule(rule)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteRuleTarget(rule)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ═══ Maintenance Tab ═══ */}
        <TabsContent value="maintenance">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" />Maintenance Windows</CardTitle>
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setMaintenanceDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />New Window
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {maintenanceWindows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No active maintenance windows.</p>
                  <p className="text-xs mt-1">Create one to automatically suppress alerts for affected devices.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {maintenanceWindows.map((mw) => (
                    <div key={mw.id} className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                      <CalendarClock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{mw.title}</p>
                        {mw.description && <p className="text-xs text-muted-foreground mt-0.5">{mw.description}</p>}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDateTime(mw.scheduledAt)}</span>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(mw.endTime)}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] mt-1.5 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">{mw.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Analytics Tab ═══ */}
        <TabsContent value="analytics">
          {analyticsData ? (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="border shadow-sm"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{analyticsData.summary.totalAlerts}</p>
                  <p className="text-xs text-muted-foreground">Total Alerts (14d)</p>
                </CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums text-green-600">{analyticsData.summary.resolveRate}%</p>
                  <p className="text-xs text-muted-foreground">Resolve Rate</p>
                </CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{analyticsData.summary.avgResolutionMin}m</p>
                  <p className="text-xs text-muted-foreground">Avg Resolution</p>
                </CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{analyticsData.summary.medianResolutionMin}m</p>
                  <p className="text-xs text-muted-foreground">Median Resolution</p>
                </CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{analyticsData.summary.resolvedCount}</p>
                  <p className="text-xs text-muted-foreground">Resolved</p>
                </CardContent></Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Daily Trend */}
                <Card className="border shadow-sm lg:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BellRing className="h-4 w-4 text-red-500" />Alert Trend (14 days)</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    {analyticsData.dailyTrend.length > 0 ? (
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analyticsData.dailyTrend}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                            <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
                            <Tooltip content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
                                  <p className="font-medium text-foreground mb-1">{label}</p>
                                  {payload.map((item) => (
                                    <p key={item.name} className="text-muted-foreground">
                                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: item.color }} />
                                      {item.name}: {item.value}
                                    </p>
                                  ))}
                                </div>
                              );
                            }} />
                            <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                            <Bar dataKey="critical" name="Critical" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="high" name="High" stackId="a" fill="#F97316" />
                            <Bar dataKey="medium" name="Medium" stackId="a" fill="#EAB308" />
                            <Bar dataKey="low" name="Low" stackId="a" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                            <Line dataKey="resolved" name="Resolved" stroke="#22C55E" strokeWidth={2} dot={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">No alert data for the selected period.</div>
                    )}
                  </CardContent>
                </Card>

                {/* Severity Distribution */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" />Severity Distribution</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    {analyticsData.severityDistribution.length > 0 ? (
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={analyticsData.severityDistribution} dataKey="count" nameKey="severity" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                              {analyticsData.severityDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">No data available.</div>
                    )}
                    {/* Legend */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {analyticsData.severityDistribution.map((s, i) => (
                        <div key={s.severity} className="flex items-center gap-1.5 text-xs">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length]} } />
                          <span className="text-muted-foreground">{s.severity}: <span className="font-medium text-foreground">{s.count}</span></span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Sources */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-teal-500" />Top Alert Sources</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  {analyticsData.topSources.length > 0 ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analyticsData.topSources} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                          <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} width={140} />
                          <Tooltip content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
                                <p className="font-medium text-foreground">{payload[0].payload.name}</p>
                                <p className="text-muted-foreground">Alerts: <span className="font-medium text-foreground">{payload[0].value}</span></p>
                              </div>
                            );
                          }} />
                          <Bar dataKey="count" name="Alerts" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No alert source data.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading analytics...</span>
            </div>
          )}
        </TabsContent>

        {/* ═══ History Tab ═══ */}
        <TabsContent value="history">
          <Card className="border shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search history..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
                </div>
                {/* Feature 10: Date range picker on History tab */}
                <Popover open={historyDateFromOpen} onOpenChange={setHistoryDateFromOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto text-xs">
                      <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                      {historyDateFrom ? format(new Date(historyDateFrom), "dd MMM yyyy") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={historyDateFrom ? new Date(historyDateFrom) : undefined} onSelect={(d) => { if (d) { setHistoryDateFrom(format(d, "yyyy-MM-dd")); setHistoryPage(1); } setHistoryDateFromOpen(false); }} />
                  </PopoverContent>
                </Popover>
                <Popover open={historyDateToOpen} onOpenChange={setHistoryDateToOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto text-xs">
                      <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                      {historyDateTo ? format(new Date(historyDateTo), "dd MMM yyyy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={historyDateTo ? new Date(historyDateTo) : undefined} onSelect={(d) => { if (d) { setHistoryDateTo(format(d, "yyyy-MM-dd")); setHistoryPage(1); } setHistoryDateToOpen(false); }} />
                  </PopoverContent>
                </Popover>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setHistoryDateFrom(getLastWeekStr()); setHistoryDateTo(getTodayStr()); setHistoryPage(1); }}>Reset</Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
                  {exportMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                  Export
                </Button>
              </div>
              {historyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">No resolved alerts in history.</div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => {
                    const sev = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.Low;
                    const duration = item.duration !== null ? (item.duration < 60 ? `${item.duration}m` : `${Math.floor(item.duration / 60)}h ${item.duration % 60}m`) : "—";
                    return (
                      <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${sev.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="outline" className={`text-[10px] ${sev.bg} ${sev.text} ${sev.border}`}>{item.severity}</Badge>
                            <span className="text-xs text-muted-foreground">{formatDateTime(item.triggeredAt)}</span>
                            {item.duration !== null && <span className="text-xs text-muted-foreground">Duration: {duration}</span>}
                            {item.duplicateCount > 1 && <Badge variant="secondary" className="text-[10px]"><Copy className="h-2.5 w-2.5 mr-0.5" />{item.duplicateCount} occurrences</Badge>}
                          </div>
                          <p className="text-sm">{item.message || item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.device} {item.acknowledgedBy ? `· Resolved by ${item.acknowledgedBy}` : ""}</p>
                          {item.resolution && <p className="text-xs text-muted-foreground mt-1 italic">Resolution: {item.resolution}</p>}
                        </div>
                      </div>
                    );
                  })}
                  {historyTotalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4 border-t">
                      <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}><ChevronLeft className="h-3 w-3" />Previous</Button>
                      <span className="text-xs text-muted-foreground">Page {historyPage} of {historyTotalPages} ({historyTotal} total)</span>
                      <Button variant="outline" size="sm" disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage((p) => p + 1)}>Next<ChevronRight className="h-3 w-3" /></Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ Alert Detail Dialog ═══ */}
      <Dialog open={!!detailAlert} onOpenChange={() => setDetailAlert(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailAlert && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${SEVERITY_CONFIG[detailAlert.severity]?.dot || ""}`} />
                  <span>{detailAlert.type}</span>
                  <Badge variant="outline" className={`text-[10px] ${SEVERITY_CONFIG[detailAlert.severity]?.bg} ${SEVERITY_CONFIG[detailAlert.severity]?.text} ${SEVERITY_CONFIG[detailAlert.severity]?.border}`}>{detailAlert.severity}</Badge>
                  {detailAlert.duplicateCount > 1 && (
                    <Badge variant="secondary" className="text-[10px]"><Copy className="h-2.5 w-2.5 mr-0.5" />{detailAlert.duplicateCount} occurrences</Badge>
                  )}
                  {detailAlert.isDuplicate && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">Duplicate</Badge>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Suppressed banner */}
                {detailAlert.isSuppressed && (
                  <div className="flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <Ban className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">This alert rule is currently suppressed — new alerts are not being generated.</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant="outline" className={
                      detailAlert.status === "Active" ? "badge-active mt-1" :
                      detailAlert.status === "Acknowledged" ? "badge-suspended mt-1" :
                      "bg-green-100 text-green-700 mt-1"
                    }>{detailAlert.status}</Badge>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Device</p>
                    <p className="text-sm font-mono mt-1">{detailAlert.device || "—"}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Triggered At</p>
                    <p className="text-sm mt-1">{formatDateTime(detailAlert.triggeredAt)}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Assigned To</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {detailAlert.assignedTo ? (
                        <>
                          <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{detailAlert.assignedTo.split(" ").map((n) => n[0]).join("")}</AvatarFallback></Avatar>
                          <span className="text-sm">{detailAlert.assignedTo}</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Feature 1: Escalation info */}
                {detailAlert.escalationLevel > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1"><ArrowUpCircle className="h-3.5 w-3.5" />Escalated to Level {detailAlert.escalationLevel}</p>
                    {detailAlert.escalationLevels.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Next escalation: {detailAlert.escalationLevels.map((l) => `L${l.level}: ${l.delayMinutes}min → ${l.assignToRole}`).join(", ")}
                      </p>
                    )}
                  </div>
                )}
                {detailAlert.acknowledgedAt && (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Acknowledged At</p>
                    <p className="text-sm mt-1">{formatDateTime(detailAlert.acknowledgedAt)}</p>
                  </div>
                )}
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Message</p>
                  <p className="text-sm">{detailAlert.message}</p>
                </div>
                {detailAlert.resolution && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-xs text-green-700 dark:text-green-300 mb-1">Resolution</p>
                    <p className="text-sm">{detailAlert.resolution}</p>
                  </div>
                )}

                <Separator />

                {/* Feature 5: Comments section */}
                <div>
                  <p className="text-sm font-medium mb-3 flex items-center gap-1.5"><MessageCircle className="h-4 w-4" />Comments</p>
                  {commentsLoading ? (
                    <div className="flex items-center justify-center py-4"><RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <ScrollArea className="max-h-48 mb-3">
                      {comments.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">No comments yet.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {comments.map((c) => (
                            <div key={c.id} className="flex items-start gap-2.5 p-2 bg-muted/30 rounded-lg">
                              <Avatar className="h-6 w-6 shrink-0"><AvatarFallback className="text-[9px]">{c.user.name.split(" ").map((n) => n[0]).join("")}</AvatarFallback></Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium">{c.user.name}</span>
                                  <span className="text-[10px] text-muted-foreground">{formatTimeAgo(c.createdAt)}</span>
                                </div>
                                <p className="text-sm mt-0.5">{c.message}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  )}
                  {detailAlert.status !== "Resolved" && (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Add a comment..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                        className="flex-1"
                      />
                      <Button size="icon" onClick={handleAddComment} disabled={!commentText.trim() || addCommentMutation.isPending}>
                        {addCommentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                {detailAlert.status !== "Resolved" && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {detailAlert.status === "Active" && (
                      <Button variant="outline" onClick={() => ackMutation.mutate(detailAlert.id)} disabled={ackMutation.isPending}>
                        {ackMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                        Acknowledge
                      </Button>
                    )}
                    {/* Feature 1: Escalate button in detail dialog */}
                    {(detailAlert.status === "Active" || detailAlert.status === "Acknowledged") && detailAlert.severity !== "Critical" && (
                      <Button variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50" onClick={() => escalateMutation.mutate(detailAlert.id)} disabled={escalateMutation.isPending}>
                        {escalateMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                        <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />Escalate
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => { setAssignDialogAlert(detailAlert); }}>
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" />Assign
                    </Button>
                    {detailAlert.assignedToId && (
                      <Button variant="outline" onClick={() => unassignMutation.mutate(detailAlert.id)} disabled={unassignMutation.isPending}>
                        <UserMinus className="h-3.5 w-3.5 mr-1.5" />Unassign
                      </Button>
                    )}
                    {/* Feature 2: Suppress button in detail dialog */}
                    {(detailAlert.status === "Active" || detailAlert.status === "Acknowledged") && (
                      <Button variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => { setSuppressAlertDialog(detailAlert); setSuppressAlertReason(""); setSuppressAlertDuration(1); }}>
                        <Ban className="h-3.5 w-3.5 mr-1.5" />Suppress
                      </Button>
                    )}
                    <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => resolveMutation.mutate(detailAlert.id)} disabled={resolveMutation.isPending}>
                      {resolveMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                      Resolve
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Assign Dialog ═══ */}
      <Dialog open={!!assignDialogAlert} onOpenChange={() => { setAssignDialogAlert(null); setAssignUserId(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign Alert</DialogTitle></DialogHeader>
          {assignDialogAlert && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">Assign this alert to a team member:</p>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger><SelectValue placeholder="Select team member..." /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} <span className="text-muted-foreground">({u.role})</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setAssignDialogAlert(null); setAssignUserId(""); }}>Cancel</Button>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => assignDialogAlert && assignUserId && assignMutation.mutate({ alertId: assignDialogAlert.id, userId: assignUserId })} disabled={!assignUserId || assignMutation.isPending}>
                  {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Assign
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Suppress Rule Dialog ═══ */}
      <Dialog open={!!suppressDialogRule} onOpenChange={() => { setSuppressDialogRule(null); setSuppressReason(""); setSuppressEndsAt(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{suppressDialogRule?.isSuppressed ? "Update Suppression" : "Suppress Alert Rule"}</DialogTitle></DialogHeader>
          {suppressDialogRule && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">Suppressing <strong>{suppressDialogRule.name}</strong> will prevent new alerts from being generated.</p>
              <div><Label className="mb-1 block">Reason</Label><Textarea value={suppressReason} onChange={(e) => setSuppressReason(e.target.value)} placeholder="Scheduled maintenance, known issue..." rows={2} /></div>
              <div><Label className="mb-1 block">End Date (optional)</Label><Input type="date" value={suppressEndsAt} onChange={(e) => setSuppressEndsAt(e.target.value)} /></div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setSuppressDialogRule(null); setSuppressReason(""); setSuppressEndsAt(""); }}>Cancel</Button>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleSuppressRule} disabled={suppressMutation.isPending}>
                  {suppressMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Ban className="h-4 w-4 mr-1.5" />Suppress
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Suppress Alert Dialog (Feature 2: with duration presets) ═══ */}
      <Dialog open={!!suppressAlertDialog} onOpenChange={() => { setSuppressAlertDialog(null); setSuppressAlertReason(""); setSuppressAlertDuration(1); setSuppressAlertCustomEndsAt(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Suppress Alert</DialogTitle>
          </DialogHeader>
          {suppressAlertDialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Suppress alerts from <strong>{suppressAlertDialog.type}</strong> for {suppressAlertDialog.device}. The alert will be resolved and future alerts from this rule will be suppressed.
              </p>
              <div>
                <Label className="mb-1 block">Duration</Label>
                <div className="flex flex-wrap gap-2">
                  {SUPPRESS_DURATIONS.map((dur) => (
                    <button
                      key={dur.value}
                      onClick={() => setSuppressAlertDuration(dur.value)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        suppressAlertDuration === dur.value
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-muted border-muted-foreground/20 text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {dur.label}
                    </button>
                  ))}
                </div>
              </div>
              {suppressAlertDuration === -1 && (
                <div>
                  <Label className="mb-1 block">Custom End Date</Label>
                  <Input type="date" value={suppressAlertCustomEndsAt} onChange={(e) => setSuppressAlertCustomEndsAt(e.target.value)} />
                </div>
              )}
              <div>
                <Label className="mb-1 block">Reason</Label>
                <Textarea value={suppressAlertReason} onChange={(e) => setSuppressAlertReason(e.target.value)} placeholder="Known issue, planned maintenance..." rows={2} />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setSuppressAlertDialog(null); setSuppressAlertReason(""); setSuppressAlertDuration(1); }}>Cancel</Button>
                <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleSuppressAlert} disabled={suppressAlertMutation.isPending || (suppressAlertDuration === -1 && !suppressAlertCustomEndsAt)}>
                  {suppressAlertMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Ban className="h-4 w-4 mr-1.5" />Suppress Alert
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Delete Rule Confirmation ═══ */}
      <AlertDialog open={!!deleteRuleTarget} onOpenChange={(open) => { if (!open) setDeleteRuleTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Alert Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete alert rule <strong>{deleteRuleTarget?.name}</strong>?
              Alerts matching this rule will no longer be triggered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRuleMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteRuleTarget && deleteRuleMutation.mutate(deleteRuleTarget.id)} disabled={deleteRuleMutation.isPending} className="bg-red-600 hover:bg-red-700">
              {deleteRuleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
