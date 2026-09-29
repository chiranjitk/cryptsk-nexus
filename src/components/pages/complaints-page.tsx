"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, Plus, Filter, Search, Clock, Eye, UserCheck,
  ChevronRight, Star, Bot, X, Send, RefreshCw, Download,
  BarChart3, PieChart as PieChartIcon, TrendingUp,
  CheckSquare, XSquare, Users, FileDown, ChevronDown,
  Printer, Sparkles, History, Loader2, Pause, Play, Shield,
  MessageSquare, Settings2, Trash2, Timer, ArrowUpRight,
  Wifi, WifiOff, DollarSign, Phone, Tv, Cable, Plug, User,
  CircleDot, CheckCircle2, Inbox, CalendarDays, CircleAlert, CheckCircle,
  Gauge, Router, Activity, HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { apiFetch } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────
interface Complaint {
  id: string;
  ticketNumber: string;
  subscriberId: string | null;
  subscriber: { id: string; name: string; phone: string; code: string } | null;
  areaId: string | null;
  area: { id: string; name: string; code: string } | null;
  type: string;
  priority: string;
  description: string;
  assignedToId: string | null;
  assignedTo: { id: string; name: string; phone: string; status: string } | null;
  status: string;
  slaHours: number;
  slaDeadline: string | null;
  walkInName: string;
  resolutionNotes: string;
  resolvedAt: string | null;
  customerRating: number | null;
  customerFeedback: string;
  aiCategory: string;
  aiSeverity: string;
  aiProbableCause: string;
  aiResolutionGuide: string;
  escalationLevel: number;
  isSlaPaused: boolean;
  slaPausedAt: string | null;
  slaPausedTotalMs: number;
  slaPauseReason: string;
  createdAt: string;
  updatedAt: string;
  isRepeatCaller?: boolean;
  repeatCallerCount?: number;
  _commentCount?: number;
}

interface ComplaintDetail extends Complaint {
  subscriber: { id: string; name: string; phone: string; email: string; code: string; address: string; area: { name: string } } | null;
  assignedTo: { id: string; name: string; phone: string; email: string; status: string; rating: number; skills: string } | null;
  _commentCount?: number;
}

interface ComplaintComment {
  id: string;
  complaintId: string;
  userId: string;
  message: string;
  createdAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string; role: string } | null;
}

interface Subscriber { id: string; name: string; phone: string; code: string; }
interface Technician { id: string; name: string; phone: string; status: string; areas?: string; }

interface AuditLogEntry {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  timestamp: string;
  user: { id: string; name: string; email: string } | null;
}
interface AreaItem { id: string; name: string; code: string; }

interface AnalyticsData {
  typeDistribution: { type: string; count: number }[];
  trendData: { date: string; total: number; open: number; resolved: number }[];
  avgResolutionTime: { priority: string; avgHours: number; count: number }[];
  priorityDistribution: { priority: string; count: number }[];
  totalComplaints: number;
  openComplaints: number;
  avgResolutionOverall: number;
}

interface EscalationPathLevel {
  level: string;
  timeoutHours: number;
  action: string;
  assigneeRole: string;
}

interface EscalationSettings {
  complaintEscalationEnabled: boolean;
  complaintEscalationLevel1Percent: number;
  complaintEscalationLevel2Percent: number;
  complaintEscalationRole1: string;
  complaintEscalationRole2: string;
  escalationPathConfig: EscalationPathLevel[];
}

// ─── Constants ───────────────────────────────────────────
const COMPLAINT_TYPES = [
  { value: "NO_INTERNET", label: "No Internet" },
  { value: "SLOW_SPEED", label: "Slow Speed" },
  { value: "CABLE_CUT", label: "Cable Cut" },
  { value: "WIFI_ISSUE", label: "WiFi Issue" },
  { value: "PLAN_CHANGE", label: "Plan Change" },
  { value: "BILLING_QUERY", label: "Billing Query" },
  { value: "VOIP_ISSUE", label: "VoIP Issue" },
  { value: "IPTV_ISSUE", label: "IPTV Issue" },
  { value: "NEW_CONNECTION", label: "New Connection" },
  { value: "OTHER", label: "Other" },
];

const PRIORITIES = [
  { value: "P1_CRITICAL", label: "P1 - Critical" },
  { value: "P2_HIGH", label: "P2 - High" },
  { value: "P3_MEDIUM", label: "P3 - Medium" },
  { value: "P4_LOW", label: "P4 - Low" },
];

const STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "REOPENED", label: "Reopened" },
];

const PRIORITY_SLA: Record<string, number> = {
  P1_CRITICAL: 4,
  P2_HIGH: 8,
  P3_MEDIUM: 24,
  P4_LOW: 48,
};

const PRIORITY_BADGE: Record<string, { label: string; cls: string; dot: string }> = {
  P1_CRITICAL: { label: "Critical", cls: "bg-red-500/10 text-red-700 dark:text-red-400", dot: "bg-red-500 animate-pulse" },
  P2_HIGH: { label: "High", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  P3_MEDIUM: { label: "Medium", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  P4_LOW: { label: "Low", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" },
};

const STATUS_BADGE: Record<string, { label: string; cls: string; dot: string }> = {
  OPEN: { label: "Open", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  ASSIGNED: { label: "Assigned", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  IN_PROGRESS: { label: "In Progress", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  RESOLVED: { label: "Resolved", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  CLOSED: { label: "Closed", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" },
  REOPENED: { label: "Reopened", cls: "bg-purple-500/10 text-purple-700 dark:text-purple-400", dot: "bg-purple-500 animate-pulse" },
};

const CHART_COLORS = ["#DC2626", "#16A34A", "#D97706", "#2563EB", "#7C3AED", "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16"];

function getTypeLabel(type: string) { return COMPLAINT_TYPES.find(t => t.value === type)?.label || type; }
function getPriorityLabel(p: string) { return PRIORITIES.find(pr => pr.value === p)?.label || p; }
function getStatusLabel(s: string) { return STATUSES.find(st => st.value === s)?.label || s; }
function formatDateTime(dateStr: string) { return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function formatDate(dateStr: string) { return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
function getTimeAgo(dateStr: string): string {
  const now = new Date().getTime();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return formatDate(dateStr);
}
function getTimeAgoColorClass(dateStr: string): string {
  const now = new Date().getTime();
  const date = new Date(dateStr).getTime();
  const diffHrs = Math.floor((now - date) / 3600000);
  if (diffHrs < 4) return "text-emerald-600 dark:text-emerald-400";
  if (diffHrs < 24) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400 animate-pulse";
}
function formatPausedDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60) return `${totalMins}m`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
function getActionLabel(action: string): string {
  const labels: Record<string, string> = { notify: "Notify", escalate: "Escalate", notify_admin: "Notify Admin", reassign: "Reassign" };
  return labels[action] || action;
}
function getEscalationBadge(level: number) {
  if (level >= 2) return { label: "L2 Admin", cls: "bg-red-100 text-red-700 border-red-300" };
  if (level >= 1) return { label: "L1 Manager", cls: "bg-amber-100 text-amber-700 border-amber-300" };
  return null;
}

// ─── Priority Border Colors ────────────────────────────
const PRIORITY_BORDER: Record<string, string> = {
  P1_CRITICAL: "border-l-[3px] border-l-red-500",
  P2_HIGH: "border-l-[3px] border-l-amber-500",
  P3_MEDIUM: "border-l-[3px] border-l-blue-500",
  P4_LOW: "border-l-[3px] border-l-slate-400",
};

const PRIORITY_BORDER_LIGHT: Record<string, string> = {
  P1_CRITICAL: "hover:border-l-red-600",
  P2_HIGH: "hover:border-l-amber-600",
  P3_MEDIUM: "hover:border-l-blue-600",
  P4_LOW: "hover:border-l-slate-500",
};

// ─── Priority Background Colors ─────────────────────────
const PRIORITY_BG: Record<string, string> = {
  P1_CRITICAL: "bg-red-50 dark:bg-red-950/20",
  P2_HIGH: "bg-amber-50 dark:bg-amber-950/20",
  P3_MEDIUM: "bg-blue-50 dark:bg-blue-950/20",
  P4_LOW: "bg-slate-50 dark:bg-slate-950/20",
};

// ─── Complaint Type Icons ──────────────────────────────
function getTypeIcon(type: string) {
  const iconMap: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    NO_INTERNET: { icon: WifiOff, color: "text-white", bg: "bg-red-500" },
    SLOW_SPEED: { icon: Gauge, color: "text-white", bg: "bg-amber-500" },
    CABLE_CUT: { icon: Activity, color: "text-white", bg: "bg-orange-500" },
    WIFI_ISSUE: { icon: Wifi, color: "text-white", bg: "bg-cyan-500" },
    PLAN_CHANGE: { icon: User, color: "text-white", bg: "bg-teal-500" },
    BILLING_QUERY: { icon: DollarSign, color: "text-white", bg: "bg-emerald-500" },
    VOIP_ISSUE: { icon: Phone, color: "text-white", bg: "bg-purple-500" },
    IPTV_ISSUE: { icon: Tv, color: "text-white", bg: "bg-rose-500" },
    NEW_CONNECTION: { icon: Router, color: "text-white", bg: "bg-blue-500" },
    OTHER: { icon: HelpCircle, color: "text-white", bg: "bg-slate-500" },
  };
  return iconMap[type] || iconMap.OTHER;
}

// ─── Status Timeline Steps ─────────────────────────────
const STATUS_STEPS = ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"];

function StatusTimeline({ currentStatus, isReopened }: { currentStatus: string; isReopened?: boolean }) {
  const currentIdx = STATUS_STEPS.indexOf(currentStatus);
  const isComplete = (idx: number) => idx < currentIdx || currentStatus === "RESOLVED" || currentStatus === "CLOSED";
  const isCurrent = (idx: number) => idx === currentIdx;

  return (
    <div className="flex items-center gap-0 py-2 px-1">
      {STATUS_STEPS.map((step, idx) => {
        const stepDone = isComplete(idx);
        const stepCurrent = isCurrent(idx);
        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                stepDone ? "bg-green-500 text-white shadow-sm shadow-green-200" :
                stepCurrent ? "bg-amber-500 text-white shadow-sm shadow-amber-200 ring-2 ring-amber-200" :
                "bg-muted text-muted-foreground border border-border"
              }`}>
                {stepDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <CircleDot className={`h-3.5 w-3.5 ${stepCurrent ? "animate-pulse" : ""}`} />
                )}
              </div>
              <span className={`text-[9px] font-medium text-center leading-tight max-w-[52px] ${
                stepDone ? "text-green-600" : stepCurrent ? "text-amber-600" : "text-muted-foreground"
              }`}>
                {getStatusLabel(step).replace("In Progress", "Progress")}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 min-w-[16px] mx-0.5 rounded-full transition-colors duration-300 ${
                isComplete(idx + 1) ? "bg-green-400" : stepCurrent ? "bg-amber-300" : "bg-border"
              }`} />
            )}
          </React.Fragment>
        );
      })}
      {isReopened && (
        <Badge className="text-[9px] px-1.5 py-0 bg-red-100 text-red-600 border border-red-200 ml-1.5">Reopened</Badge>
      )}
    </div>
  );
}

// ─── SLA Timer Component ────────────────────────────────
function SlaTimer({ deadline, slaHours, status, createdAt, isSlaPaused, slaPausedTotalMs }: { deadline: string | null; slaHours: number; status: string; createdAt: string; isSlaPaused?: boolean; slaPausedTotalMs?: number }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [percent, setPercent] = useState(100);
  const [breached, setBreached] = useState(false);

  const updateTimer = useCallback(() => {
    if (!deadline || status === "RESOLVED" || status === "CLOSED") {
      if (status === "RESOLVED" || status === "CLOSED") {
        setTimeLeft("Completed");
        setPercent(100);
      }
      return;
    }
    if (isSlaPaused) {
      setTimeLeft("Paused");
      setPercent(0);
      setBreached(false);
      return;
    }
    const now = new Date().getTime();
    const end = new Date(deadline).getTime();
    const diff = end - now;

    if (diff <= 0) {
      setTimeLeft("Breached!");
      setPercent(0);
      setBreached(true);
      return;
    }

    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    setTimeLeft(`${hours}h ${mins}m`);
    const originalMs = Math.max(slaHours, 1) * 3600000;
    setPercent(Math.min(100, Math.max(0, (diff / originalMs) * 100)));
    setBreached(false);
  }, [deadline, status, slaHours, createdAt, isSlaPaused]);

  useEffect(() => {
    const interval = setInterval(updateTimer, 30000);
    return () => clearInterval(interval);
  }, [updateTimer]);

  if (!deadline) return <span className="text-xs text-muted-foreground">No SLA</span>;
  if (isSlaPaused) return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Pause className="h-3 w-3 text-orange-500" />
        <span className="text-xs font-medium text-orange-600">SLA Paused</span>
      </div>
      {(slaPausedTotalMs || 0) > 0 && (
        <p className="text-[10px] text-muted-foreground">Previously paused: {formatPausedDuration(slaPausedTotalMs || 0)}</p>
      )}
    </div>
  );
  if (status === "RESOLVED" || status === "CLOSED") {
    return (
      <div className="space-y-0.5">
        <span className="text-xs text-green-600 font-medium">Completed</span>
        {(slaPausedTotalMs || 0) > 0 && (
          <p className="text-[10px] text-muted-foreground">Paused total: {formatPausedDuration(slaPausedTotalMs || 0)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Clock className={`h-3 w-3 ${breached ? "text-red-500" : percent < 30 ? "text-orange-500" : "text-green-500"}`} />
        <span className={`text-xs font-semibold tabular-nums ${breached ? "text-red-600" : percent < 30 ? "text-orange-600" : percent < 60 ? "text-yellow-600" : "text-green-600"}`}>{timeLeft}</span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${
            breached ? "bg-red-500" : percent < 30 ? "bg-gradient-to-r from-red-400 to-red-500" : percent < 60 ? "bg-gradient-to-r from-yellow-400 to-amber-500" : "bg-gradient-to-r from-green-400 to-green-500"
          }`}
          style={{ width: `${Math.max(percent, breached ? 2 : 0)}%` }}
        />
      </div>
      {(slaPausedTotalMs || 0) > 0 && (
        <p className="text-[10px] text-muted-foreground">Paused total: {formatPausedDuration(slaPausedTotalMs || 0)}</p>
      )}
    </div>
  );
}

// ─── Star Rating Component ───────────────────────────────
function StarRating({ rating, onChange }: { rating: number; onChange: (r: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange(star)} className="focus:outline-none">
          <Star className={`h-5 w-5 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

// ─── Chart Tooltip ───────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: item.color }} />
          {item.name}: {typeof item.value === "number" ? item.value.toLocaleString("en-IN") : item.value}
        </p>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────
export default function ComplaintsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const limit = 20;

  // Analytics
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Date range filter
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkClose, setShowBulkClose] = useState(false);

  // Create form state
  const [createForm, setCreateForm] = useState({
    subscriberId: "",
    walkInName: "",
    type: "",
    priority: "P3_MEDIUM",
    description: "",
    areaId: "",
    slaHours: "",
  });
  const [isWalkIn, setIsWalkIn] = useState(false);

  // Detail view state
  const [detailStatus, setDetailStatus] = useState("");
  const [detailComplaintState, setDetailComplaintState] = useState<ComplaintDetail | null>(null);
  const [assignTechId, setAssignTechId] = useState("");
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");

  // Comments state
  const [commentText, setCommentText] = useState("");

  // SLA Pause dialog state
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pauseReason, setPauseReason] = useState("");

  // Escalation settings dialog
  const [showEscalationSettings, setShowEscalationSettings] = useState(false);
  const [escalationSettings, setEscalationSettings] = useState<EscalationSettings>({
    complaintEscalationEnabled: true,
    complaintEscalationLevel1Percent: 75,
    complaintEscalationLevel2Percent: 100,
    complaintEscalationRole1: "MANAGER",
    complaintEscalationRole2: "ADMIN",
    escalationPathConfig: [
      { level: "L1", timeoutHours: 2, action: "notify", assigneeRole: "MANAGER" },
      { level: "L2", timeoutHours: 4, action: "escalate", assigneeRole: "ADMIN" },
      { level: "L3", timeoutHours: 8, action: "notify_admin", assigneeRole: "SUPER_ADMIN" },
    ],
  });
  const [escPathLevels, setEscPathLevels] = useState<EscalationPathLevel[]>(escalationSettings.escalationPathConfig);

  // Comment list scroll ref
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Build query params
  const queryParams = new URLSearchParams();
  if (filterStatus !== "all") queryParams.set("status", filterStatus);
  if (filterPriority !== "all") queryParams.set("priority", filterPriority);
  if (filterType !== "all") queryParams.set("type", filterType);
  if (filterArea !== "all") queryParams.set("areaId", filterArea);
  if (searchQuery) queryParams.set("search", searchQuery);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  queryParams.set("page", String(page));
  queryParams.set("limit", String(limit));
  queryParams.set("sortBy", sortBy);
  queryParams.set("sortOrder", sortOrder);

  // Fetch complaints
  const { data, isLoading } = useQuery({
    queryKey: ["complaints", filterStatus, filterPriority, filterType, filterArea, searchQuery, dateFrom, dateTo, page, sortBy, sortOrder],
    queryFn: () => apiFetch(`/api/complaints?${queryParams}`),
  });

  // Fetch detail
  const { data: detailData } = useQuery({
    queryKey: ["complaint-detail", showDetail],
    queryFn: () => apiFetch(`/api/complaints/${showDetail}`),
    enabled: !!showDetail,
  });

  // Fetch comments for detail view
  const { data: commentsData } = useQuery({
    queryKey: ["complaint-comments", showDetail],
    queryFn: () => apiFetch(`/api/complaints/${showDetail}/comments`),
    enabled: !!showDetail,
  });

  // Fetch escalation settings
  const { data: ispSettingsData } = useQuery({
    queryKey: ["isp-settings-escalation"],
    queryFn: () => apiFetch("/api/settings/isp-profile"),
    enabled: showEscalationSettings,
  });

  // Fetch analytics
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["complaints-analytics"],
    queryFn: () => apiFetch("/api/complaints/analytics"),
    enabled: showAnalytics,
  });

  // Fetch subscribers for create form
  const { data: subscribersData } = useQuery({
    queryKey: ["subscribers-list"],
    queryFn: () => apiFetch("/api/subscribers"),
    enabled: showCreate,
  });

  // Fetch technicians for assignment (ALL statuses)
  const { data: techniciansData } = useQuery({
    queryKey: ["technicians-list"],
    queryFn: () => apiFetch("/api/technicians"),
    enabled: !!showDetail,
  });

  // Fetch audit logs for the complaint (activity timeline)
  const { data: auditLogsData } = useQuery({
    queryKey: ["complaint-audit-logs", showDetail],
    queryFn: () => apiFetch(`/api/audit-log/entity/Complaint?entityId=${showDetail}&limit=50`),
    enabled: !!showDetail,
  });

  // Fetch areas
  const { data: areasData } = useQuery({
    queryKey: ["areas-list"],
    queryFn: () => apiFetch("/api/areas"),
  });

  // Sync detail state using render-time pattern (avoids setState-in-effect lint)
  const [prevDetailId, setPrevDetailId] = useState<string | null>(null);
  if (showDetail !== prevDetailId) {
    setPrevDetailId(showDetail);
    if (showDetail && detailData?.complaint) {
      const d = detailData.complaint as ComplaintDetail;
      setDetailComplaintState(d);
      setDetailStatus(d.status);
      setAssignTechId(d.assignedToId || "");
      setRating(d.customerRating || 0);
      setFeedback(d.customerFeedback);
      setResolutionNotes(d.resolutionNotes);
    } else {
      setDetailComplaintState(null);
      setDetailStatus("");
      setAssignTechId("");
      setRating(0);
      setFeedback("");
      setResolutionNotes("");
      setCommentText("");
    }
  }

  // Scroll to bottom of comments when new ones arrive
  useEffect(() => {
    if (commentsData?.comments) {
      commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [commentsData?.comments]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (form: typeof createForm) =>
      apiFetch("/api/complaints", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          slaHours: form.slaHours ? parseInt(form.slaHours) : undefined,
          subscriberId: isWalkIn ? null : (form.subscriberId || null),
          walkInName: isWalkIn ? form.walkInName : undefined,
        }),
      }),
    onSuccess: () => {
      toast.success("Complaint created successfully");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      setShowCreate(false);
      setIsWalkIn(false);
      setCreateForm({ subscriberId: "", walkInName: "", type: "", priority: "P3_MEDIUM", description: "", areaId: "", slaHours: "" });
    },
    onError: () => toast.error("Failed to create complaint"),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/api/complaints/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast.success("Complaint updated successfully");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      queryClient.invalidateQueries({ queryKey: ["complaint-detail"] });
    },
    onError: () => toast.error("Failed to update complaint"),
  });

  // Comment mutation
  const commentMutation = useMutation({
    mutationFn: ({ complaintId, message }: { complaintId: string; message: string }) =>
      apiFetch(`/api/complaints/${complaintId}/comments`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["complaint-comments"] });
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: () => toast.error("Failed to post comment"),
  });

  // Bulk close mutation
  const bulkCloseMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/complaints/bulk-close", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (result: { message: string; closed: number; skipped: number }) => {
      toast.success(result.message);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      setShowBulkClose(false);
    },
    onError: () => toast.error("Failed to close complaints"),
  });

  // Escalation settings save mutation
  const escalationSaveMutation = useMutation({
    mutationFn: (settings: Record<string, unknown>) =>
      apiFetch("/api/settings/isp-profile", {
        method: "PUT",
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      toast.success("Escalation settings saved");
      setShowEscalationSettings(false);
      queryClient.invalidateQueries({ queryKey: ["isp-settings-escalation"] });
    },
    onError: () => toast.error("Failed to save escalation settings"),
  });

  const handleSaveEscalationSettings = () => {
    escalationSaveMutation.mutate({
      ...escalationSettings,
      escalationPathConfig: JSON.stringify(escPathLevels),
    });
  };

  // CSV export
  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterPriority !== "all") params.set("priority", filterPriority);
    if (filterType !== "all") params.set("type", filterType);
    if (filterArea !== "all") params.set("areaId", filterArea);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    window.open(`/api/complaints/export?${params}`, "_blank");
    toast.success("Exporting complaints to CSV...");
  };

  const complaints: Complaint[] = data?.complaints || [];
  const statusCounts: Record<string, number> = data?.statusCounts || {};
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;

  const dc = detailComplaintState;
  const subscribers: Subscriber[] = (subscribersData?.subscribers as Subscriber[]) || [];
  const technicians: Technician[] = (techniciansData?.technicians as Technician[]) || [];
  const areas: AreaItem[] = (Array.isArray(areasData) ? areasData : (areasData as { areas?: AreaItem[] })?.areas || []) as AreaItem[];
  const comments: ComplaintComment[] = (commentsData?.comments as ComplaintComment[]) || [];

  // Bulk selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === complaints.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(complaints.map((c) => c.id)));
    }
  };
  const closableSelected = complaints.filter((c) => selectedIds.has(c.id));
  const hasSelection = selectedIds.size > 0;

  // Auto-assign mutation
  const autoAssignMutation = useMutation({
    mutationFn: (complaintId: string) =>
      apiFetch(`/api/complaints/${complaintId}/auto-assign`, {
        method: "POST",
      }),
    onSuccess: (result: { technician: { id: string; name: string }; message: string }) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      queryClient.invalidateQueries({ queryKey: ["complaint-detail"] });
      setAssignTechId(result.technician.id);
      setDetailStatus("ASSIGNED");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to auto-assign technician");
    },
  });

  const handleAssignTechnician = () => {
    if (!showDetail || !assignTechId) return;
    updateMutation.mutate({ id: showDetail, data: { assignedToId: assignTechId, status: "ASSIGNED" } });
  };

  const handleAutoAssign = () => {
    if (!showDetail) return;
    autoAssignMutation.mutate(showDetail);
  };

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  const handleStatusChange = (newStatus: string) => {
    if (!showDetail) return;
    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (newStatus === "RESOLVED") updatePayload.resolutionNotes = resolutionNotes;
    updateMutation.mutate(
      { id: showDetail, data: updatePayload },
      { onSuccess: () => setDetailStatus(newStatus) },
    );
  };

  const handleRateSubmit = () => {
    if (!showDetail || rating === 0) return;
    updateMutation.mutate({
      id: showDetail,
      data: { customerRating: rating, customerFeedback: feedback, status: "CLOSED" },
    });
  };

  const handleCreateSubmit = () => {
    if (!createForm.type || !createForm.description) {
      toast.error("Complaint type and description are required");
      return;
    }
    if (isWalkIn && !createForm.walkInName.trim()) {
      toast.error("Walk-in customer name is required");
      return;
    }
    createMutation.mutate(createForm);
  };

  // SLA Pause handler
  const handleSlaPause = () => {
    if (!showDetail) return;
    if (!pauseReason.trim()) {
      toast.error("Please provide a reason for pausing SLA");
      return;
    }
    updateMutation.mutate(
      { id: showDetail, data: { isSlaPaused: true, slaPauseReason: pauseReason } },
      {
        onSuccess: () => {
          setShowPauseDialog(false);
          setPauseReason("");
          queryClient.invalidateQueries({ queryKey: ["complaint-detail"] });
        },
      },
    );
  };

  // SLA Resume handler
  const handleSlaResume = () => {
    if (!showDetail) return;
    updateMutation.mutate(
      { id: showDetail, data: { isSlaPaused: false } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["complaint-detail"] });
          toast.success("SLA timer resumed");
        },
      },
    );
  };

  // Open escalation settings dialog and load current values
  const handleOpenEscalationSettings = () => {
    if (ispSettingsData?.settings) {
      const s = ispSettingsData.settings as Record<string, unknown>;
      setEscalationSettings({
        complaintEscalationEnabled: (s.complaintEscalationEnabled as boolean) ?? true,
        complaintEscalationLevel1Percent: (s.complaintEscalationLevel1Percent as number) ?? 75,
        complaintEscalationLevel2Percent: (s.complaintEscalationLevel2Percent as number) ?? 100,
        complaintEscalationRole1: (s.complaintEscalationRole1 as string) ?? "MANAGER",
        complaintEscalationRole2: (s.complaintEscalationRole2 as string) ?? "ADMIN",
        escalationPathConfig: [],
      });
      let pathConfig: EscalationPathLevel[] = [];
      try {
        pathConfig = JSON.parse((s.escalationPathConfig as string) || "[]");
      } catch { /* ignore */ }
      if (Array.isArray(pathConfig) && pathConfig.length > 0) {
        setEscPathLevels(pathConfig);
 }
    }
    setShowEscalationSettings(true);
  };

  const handleAddEscPathLevel = () => {
    const nextLevel = `L${escPathLevels.length + 1}`;
    setEscPathLevels([...escPathLevels, { level: nextLevel, timeoutHours: 2, action: "notify", assigneeRole: "MANAGER" }]);
  };

  const handleRemoveEscPathLevel = (idx: number) => {
    setEscPathLevels(escPathLevels.filter((_, i) => i !== idx));
 };

  const handleEscPathLevelChange = (idx: number, field: keyof EscalationPathLevel, value: string | number) => {
    setEscPathLevels(escPathLevels.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  // Clear filters
  const clearFilters = () => {
    setFilterStatus("all");
    setFilterPriority("all");
    setFilterType("all");
    setFilterArea("all");
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  // ─── Loading Skeleton ──────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="skeleton-wave h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="skeleton-wave h-7 w-52 mb-1" />
            <Skeleton className="skeleton-wave h-4 w-80" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-0 rounded-xl"><CardContent className="p-4"><div className="flex items-center gap-3"><Skeleton className="skeleton-wave h-8 w-8 rounded-full" /><div><Skeleton className="skeleton-wave h-6 w-10 mb-1" /><Skeleton className="skeleton-wave h-3 w-24" /></div></div></CardContent></Card>
          ))}
        </div>
        <Card className="border border-border/50 rounded-xl shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  // Analytics chart data transforms
  const typePieData = (() => {
    if (!analyticsData?.typeDistribution) return [];
    return analyticsData.typeDistribution
      .filter((t) => t.count > 0)
      .map((t) => ({ name: getTypeLabel(t.type), value: t.count }));
  })();

  const trendChartData = analyticsData?.trendData || [];
  const avgResData = analyticsData?.avgResolutionTime || [];

  // Can pause/resume SLA?
  const canPauseSla = dc && ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(dc.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={AlertTriangle}
        title="Complaints & Support"
        description="Track, assign, and resolve customer complaints and support tickets."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={handleOpenEscalationSettings} className="shrink-0" title="Escalation Settings">
              <Settings2 className="h-4 w-4 mr-2" /> Escalation
            </Button>
            <Button variant="outline" onClick={handleExport} className="shrink-0">
              <FileDown className="h-4 w-4 mr-2" /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => setShowAnalytics(!showAnalytics)} className="shrink-0">
              <BarChart3 className="h-4 w-4 mr-2" /> Analytics {showAnalytics ? <ChevronDown className="h-3 w-3 ml-1" /> : null}
            </Button>
            <Button onClick={() => { setIsWalkIn(false); setShowCreate(true); }} className="bg-red-600 hover:bg-red-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> New Complaint
            </Button>
          </div>
        }
      />

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 rounded-xl bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-950/30 dark:to-gray-950/20 ring-1 ring-border/50 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-lg">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{total}</p>
                <p className="text-xs text-muted-foreground">Total Complaints</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-950/30 dark:to-yellow-950/20 ring-1 ring-border/50 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg">
                <CircleAlert className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{statusCounts["OPEN"] || 0}</p>
                <p className="text-xs text-muted-foreground">Open Complaints</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950/30 dark:to-indigo-950/20 ring-1 ring-border/50 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{(statusCounts["IN_PROGRESS"] || 0) + (statusCounts["ASSIGNED"] || 0)}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950/30 dark:to-green-950/20 ring-1 ring-border/50 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg">
                <CheckCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{statusCounts["RESOLVED"] || 0}</p>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="border border-border/50 rounded-xl shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by ticket #, customer, description..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="shrink-0">
              <Filter className="h-4 w-4 mr-2" /> Filters {showFilters && <X className="h-3 w-3 ml-2" />}
            </Button>
            <Button variant="outline" onClick={() => { queryClient.invalidateQueries({ queryKey: ["complaints"] }); }} className="shrink-0">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3 pt-3 border-t">
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={(v) => { setFilterPriority(v); setPage(1); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All Priorities" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {COMPLAINT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterArea} onValueChange={(v) => { setFilterArea(v); setPage(1); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All Areas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Areas</SelectItem>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">From Date</label>
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">To Date</label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
              </div>
              <div className="col-span-full flex gap-2">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <X className="h-3 w-3 mr-1" /> Clear Filters
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Complaints Table */}
      <Card className="border border-border/50 rounded-xl shadow-sm">
        <CardContent className="p-0">
          {/* Bulk actions bar */}
          {hasSelection && (
            <div className="flex items-center gap-3 p-3 border-b bg-muted/50">
              <span className="text-xs font-medium text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Button size="sm" variant="outline" onClick={() => setShowBulkClose(true)} className="bg-green-600 hover:bg-green-700 text-white text-xs">
                <CheckSquare className="h-3 w-3 mr-1" /> Bulk Close
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())} className="text-xs">
                <XSquare className="h-3 w-3 mr-1" /> Clear Selection
              </Button>
            </div>
          )}
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider w-10">
                    <Checkbox
                      checked={complaints.length > 0 && selectedIds.size === complaints.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Ticket #</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Customer</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Priority</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Assigned To</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">SLA</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Created</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {complaints.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-20">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-16 w-16 rounded-2xl bg-muted/80 flex items-center justify-center">
                        <Inbox className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-foreground">No complaints found</p>
                        <p className="text-xs text-muted-foreground mt-1.5 max-w-xs">Try adjusting your search or filters, or create a new complaint to get started</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={clearFilters} className="mt-1">
                          <Filter className="h-3 w-3 mr-1.5" /> Clear Filters
                        </Button>
                        <Button size="sm" onClick={() => { setIsWalkIn(false); setShowCreate(true); }} className="bg-red-600 hover:bg-red-700 text-white mt-1">
                          <Plus className="h-3 w-3 mr-1.5" /> New Complaint
                        </Button>
                      </div>
                    </div>
                  </TableCell></TableRow>
                ) : (
                  complaints.map((c) => {
                    const escBadge = getEscalationBadge(c.escalationLevel);
                    const typeIcon = getTypeIcon(c.type);
                    const TypeIconComponent = typeIcon.icon;
                    return (
                      <TableRow key={c.id} className={`cursor-pointer hover:bg-muted/30 transition-colors duration-150 odd:bg-muted/10 border-l-[3px] border-l-transparent ${PRIORITY_BG[c.priority] || ""} ${PRIORITY_BORDER[c.priority] || ""} ${PRIORITY_BORDER_LIGHT[c.priority] || ""}`} onClick={() => setShowDetail(c.id)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={() => toggleSelect(c.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-red-600">
                          <div className="flex items-center gap-1">
                            {c.ticketNumber}
                            {escBadge && (
                              <Badge variant="outline" className={`text-[9px] px-1 py-0 ${escBadge.cls}`}>
                                <Shield className="h-2.5 w-2.5 mr-0.5" />
                                {escBadge.label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div>
                              <p className="text-xs font-medium">
                                {c.subscriber?.name || c.walkInName || "—"}
                              </p>
                              {(c.subscriber?.code || c.walkInName) && (
                                <p className="text-[10px] text-muted-foreground">
                                  {c.subscriber?.code || "Walk-in"}
                                </p>
                              )}
                            </div>
                            {c.isRepeatCaller && (
                              <Badge className="text-[9px] px-1 py-0 bg-orange-100 text-orange-700 border-orange-200 shrink-0">
                                Repeat
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs">
                            <div className={`flex items-center justify-center h-6 w-6 rounded-lg shrink-0 ${typeIcon.bg}`}>
                              <TypeIconComponent className={`h-3.5 w-3.5 ${typeIcon.color}`} />
                            </div>
                            <span className="truncate max-w-[90px]">{getTypeLabel(c.type)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_BADGE[c.priority]?.cls || ""}`}>
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_BADGE[c.priority]?.dot || ""}`} />
                            {PRIORITY_BADGE[c.priority]?.label || c.priority}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status]?.cls || ""}`}>
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_BADGE[c.status]?.dot || ""}`} />
                            {STATUS_BADGE[c.status]?.label || c.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{c.assignedTo?.name || <span className="text-muted-foreground italic">Unassigned</span>}</TableCell>
                        <TableCell>
                          <div className="min-w-[80px]">
                            <SlaTimer deadline={c.slaDeadline} slaHours={c.slaHours} status={c.status} createdAt={c.createdAt} isSlaPaused={c.isSlaPaused} />
                            {(c._commentCount || 0) > 0 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 mt-1 bg-emerald-50 text-emerald-600 border-emerald-200">
                                <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
                                {c._commentCount}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-muted-foreground">{formatDate(c.createdAt)}</span>
                            <span className={`text-[10px] font-medium ${getTimeAgoColorClass(c.createdAt)}`}>{getTimeAgo(c.createdAt)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="hover:bg-red-50 hover:text-red-600 transition-colors" onClick={() => setShowDetail(c.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Created</SelectItem>
                    <SelectItem value="ticketNumber">Ticket #</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="slaDeadline">SLA Deadline</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="h-7 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descending</SelectItem>
                    <SelectItem value="asc">Ascending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Analytics Section (Collapsible) ──────────── */}
      {showAnalytics && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold text-foreground">Complaint Analytics</h2>
          </div>

          {analyticsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border border-border/50 rounded-xl shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-72 w-full" /></CardContent></Card>
              <Card className="border border-border/50 rounded-xl shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-72 w-full" /></CardContent></Card>
              <Card className="border border-border/50 rounded-xl shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-72 w-full" /></CardContent></Card>
            </div>
          ) : analyticsData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Total Complaints</p>
                    <p className="text-xl font-bold">{analyticsData.totalComplaints}</p>
                  </CardContent>
                </Card>
                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Open / Reopened</p>
                    <p className="text-xl font-bold text-red-600">{analyticsData.openComplaints}</p>
                  </CardContent>
                </Card>
                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Avg Resolution (hrs)</p>
                    <p className="text-xl font-bold text-green-600">{analyticsData.avgResolutionOverall}</p>
                  </CardContent>
                </Card>
                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Resolved (30d)</p>
                    <p className="text-xl font-bold">{analyticsData.trendData.reduce((s, d) => s + d.resolved, 0)}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <PieChartIcon className="h-4 w-4 text-red-600" />Complaint Type Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {typePieData.length > 0 ? (
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={typePieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value" nameKey="name" strokeWidth={2} stroke="#fff">
                              {typePieData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number, name: string) => [value, name]} />
                            <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: "11px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-48 gap-2">
                        <PieChartIcon className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-red-600" />Monthly Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {trendChartData.length > 0 ? (
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trendChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                            <Area type="monotone" dataKey="total" stroke="#DC2626" fill="#DC2626" fillOpacity={0.1} name="Total" />
                            <Area type="monotone" dataKey="open" stroke="#F97316" fill="#F97316" fillOpacity={0.1} name="Open" />
                            <Area type="monotone" dataKey="resolved" stroke="#16A34A" fill="#16A34A" fillOpacity={0.1} name="Resolved" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-48 gap-2">
                        <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-red-600" />Avg Resolution by Priority
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {avgResData.length > 0 ? (
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={avgResData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis type="number" tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="priority" tick={{ fontSize: 11 }} width={100} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="avgHours" fill="#DC2626" radius={[0, 4, 4, 0]} name="Avg Hours" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-48 gap-2">
                        <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ─── Create Complaint Dialog ────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Complaint</DialogTitle>
            <DialogDescription>Create a new support ticket</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium">Walk-in Customer</Label>
              <Switch checked={isWalkIn} onCheckedChange={setIsWalkIn} />
            </div>
            {isWalkIn ? (
              <div>
                <Label className="text-xs text-muted-foreground">Customer Name *</Label>
                <Input value={createForm.walkInName} onChange={(e) => setCreateForm({ ...createForm, walkInName: e.target.value })} placeholder="Customer name" className="mt-1" />
              </div>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground">Subscriber (optional)</Label>
                <Select value={createForm.subscriberId} onValueChange={(v) => setCreateForm({ ...createForm, subscriberId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select subscriber..." /></SelectTrigger>
                  <SelectContent>
                    {subscribers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code}) — {s.phone}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Complaint Type *</Label>
                <Select value={createForm.type} onValueChange={(v) => setCreateForm({ ...createForm, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>{COMPLAINT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={createForm.priority} onValueChange={(v) => setCreateForm({ ...createForm, priority: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Area</Label>
              <Select value={createForm.areaId} onValueChange={(v) => setCreateForm({ ...createForm, areaId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select area..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No Area</SelectItem>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description *</Label>
              <Textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="Describe the issue..." rows={3} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">SLA Hours (optional, auto-set by priority)</Label>
              <Input type="number" value={createForm.slaHours} onChange={(e) => setCreateForm({ ...createForm, slaHours: e.target.value })} placeholder="Auto" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreateSubmit} disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {createMutation.isPending ? "Creating..." : "Create Complaint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Complaint Detail Dialog ─────────────────── */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto print:hidden" a11yTitle="Complaint Details">
          {dc ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-red-600">{dc.ticketNumber}</span>
                  {(() => {
                    const ti = getTypeIcon(dc.type);
                    const TI = ti.icon;
                    return <TI className={`h-4 w-4 ${ti.color}`} />;
                  })()}
                  <Badge variant="outline" className={`text-[10px] ${PRIORITY_BADGE[dc.priority]?.cls || ""}`}>
                    {getPriorityLabel(dc.priority)}
                  </Badge>
                  {dc.escalationLevel > 0 && getEscalationBadge(dc.escalationLevel) && (
                    <Badge variant="outline" className={`text-[10px] ${getEscalationBadge(dc.escalationLevel)?.cls}`}>
                      <Shield className="h-3 w-3 mr-0.5" />
                      {getEscalationBadge(dc.escalationLevel)?.label}
                    </Badge>
                  )}
                  {dc.isSlaPaused && (
                    <Badge variant="outline" className="text-[10px] bg-orange-100 text-orange-700 border-orange-300">
                      <Pause className="h-3 w-3 mr-0.5" /> SLA Paused
                    </Badge>
                  )}
                  {dc.isRepeatCaller && (
                    <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200">
                      Repeat Caller ({dc.repeatCallerCount} in 30d)
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={handlePrint} title="Print Complaint">
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    const ti = getTypeIcon(dc.type);
                    const TI = ti.icon;
                    return <><TI className={`h-3.5 w-3.5 ${ti.color}`} /> {getTypeLabel(dc.type)}</>;
                  })()}
                  <span className="text-muted-foreground">·</span>
                  <CalendarDays className="h-3 w-3 text-muted-foreground" />
                  Created {formatDateTime(dc.createdAt)}
                </DialogDescription>
              </DialogHeader>

              {/* Status Timeline */}
              <div className={`rounded-lg border p-3 ${PRIORITY_BORDER[dc.priority] || ""} bg-gradient-to-r from-card to-muted/20`}>
                <StatusTimeline currentStatus={detailStatus} isReopened={dc.status === "REOPENED"} />
              </div>

              <div className="space-y-4">
                {/* Customer Info */}
                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Customer</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{dc.subscriber?.name || dc.walkInName || "—"}</p>
                        {dc.subscriber ? (
                          <>
                            <p className="text-xs text-muted-foreground">{dc.subscriber.phone} · {dc.subscriber.code}</p>
                            {dc.subscriber.address && <p className="text-xs text-muted-foreground mt-0.5">{dc.subscriber.address}</p>}
                          </>
                        ) : dc.walkInName ? (
                          <p className="text-xs text-muted-foreground">Walk-in Customer</p>
                        ) : null}
                      </div>
                      {dc.area && <Badge variant="outline" className="text-[10px]">{dc.area.name}</Badge>}
                    </div>
                  </CardContent>
                </Card>

                {/* Status & Assignment */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Card className="border border-border/50 rounded-xl shadow-sm">
                    <CardContent className="p-3 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Status</p>
                      <Badge variant="outline" className={`text-xs ${STATUS_BADGE[detailStatus]?.cls || ""}`}>
                        {getStatusLabel(detailStatus)}
                      </Badge>
                      <div className="flex flex-wrap gap-1.5">
                        {detailStatus === "OPEN" && (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange("ASSIGNED")}>
                            <UserCheck className="h-3 w-3 mr-1" /> Assign
                          </Button>
                        )}
                        {detailStatus === "ASSIGNED" && (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange("IN_PROGRESS")}>
                            <ChevronRight className="h-3 w-3 mr-1" /> Start
                          </Button>
                        )}
                        {detailStatus === "IN_PROGRESS" && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleStatusChange("RESOLVED")}>
                            <CheckSquare className="h-3 w-3 mr-1" /> Mark Resolved
                          </Button>
                        )}
                        {detailStatus === "RESOLVED" && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleStatusChange("CLOSED")}>
                            <CheckSquare className="h-3 w-3 mr-1" /> Mark Closed
                          </Button>
                        )}
                        {(detailStatus === "RESOLVED" || detailStatus === "CLOSED") && (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange("REOPENED")}>
                            <RefreshCw className="h-3 w-3 mr-1" /> Reopen
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border border-border/50 rounded-xl shadow-sm">
                    <CardContent className="p-3 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Assign Technician</p>
                      <div className="flex gap-2">
                        <Select value={assignTechId} onValueChange={setAssignTechId}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="All Technicians" /></SelectTrigger>
                          <SelectContent>
                            {technicians.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name} ({t.status === "available" ? "Available" : t.status === "busy" ? "Busy" : t.status === "offline" ? "Offline" : t.status})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {assignTechId && (
                          <Button size="sm" onClick={handleAssignTechnician} disabled={updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white shrink-0">
                            <Send className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleAutoAssign}
                          disabled={autoAssignMutation.isPending || !dc.areaId}
                          className="shrink-0"
                          title={!dc.areaId ? "No area assigned" : "Auto-assign best available technician"}
                        >
                          {autoAssignMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      {dc.assignedTo && (
                        <div className="text-xs space-y-0.5">
                          <p className="font-medium">{dc.assignedTo.name}</p>
                          <p className="text-muted-foreground">{dc.assignedTo.phone}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">SLA ({dc.slaHours}h)</p>
                          <SlaTimer deadline={dc.slaDeadline} slaHours={dc.slaHours} status={dc.status} createdAt={dc.createdAt} isSlaPaused={dc.isSlaPaused} slaPausedTotalMs={dc.slaPausedTotalMs} />
                        </div>
                        <div className="flex items-center gap-1">
                          {canPauseSla && !dc.isSlaPaused && (
                            <Button size="sm" variant="outline" onClick={() => setShowPauseDialog(true)} className="text-xs text-orange-600 border-orange-300 hover:bg-orange-50">
                              <Pause className="h-3 w-3 mr-1" /> Pause
                            </Button>
                          )}
                          {canPauseSla && dc.isSlaPaused && (
                            <Button size="sm" variant="outline" onClick={handleSlaResume} className="text-xs text-green-600 border-green-300 hover:bg-green-50" disabled={updateMutation.isPending}>
                              {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Play className="h-3 w-3 mr-1" /> Resume</>}
                            </Button>
                          )}
                          {canPauseSla && dc.escalationLevel < 2 && (
                            <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: showDetail!, data: { escalationLevel: dc.escalationLevel + 1 } })} className="text-xs text-amber-600 border-amber-300 hover:bg-amber-50" disabled={updateMutation.isPending}>
                              <Shield className="h-3 w-3 mr-1" /> Escalate
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* SLA Pause Info */}
                {(dc.isSlaPaused || (dc.slaPausedTotalMs || 0) > 0) && (
                  <Card className="border-2 border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-orange-600" />
                        <p className="text-xs font-bold text-orange-700">SLA Pause Information</p>
                      </div>
                      <div className="text-xs space-y-1.5">
                        {dc.isSlaPaused && (
                          <div className="flex items-center justify-between">
                            <span className="text-orange-800/80 dark:text-orange-300/80">Status:</span>
                            <Badge variant="outline" className="text-[10px] bg-orange-100 text-orange-700 border-orange-300">
                              <Pause className="h-2.5 w-2.5 mr-0.5" /> Currently Paused
                            </Badge>
                          </div>
                        )}
                        {dc.isSlaPaused && dc.slaPausedAt && (
                          <div className="flex items-center justify-between">
                            <span className="text-orange-800/80 dark:text-orange-300/80">Paused at:</span>
                            <span className="font-medium text-orange-900 dark:text-orange-200">{formatDateTime(dc.slaPausedAt)}</span>
                          </div>
                        )}
                        {dc.slaPauseReason && (
                          <div>
                            <span className="text-orange-800/80 dark:text-orange-300/80">Reason:</span>
                            <p className="mt-0.5 p-2 rounded bg-white/60 dark:bg-black/20 border border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-100">{dc.slaPauseReason}</p>
                          </div>
                        )}
                        {(dc.slaPausedTotalMs || 0) > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-orange-800/80 dark:text-orange-300/80">Total paused time:</span>
                            <span className="font-semibold text-orange-900 dark:text-orange-200">{formatPausedDuration(dc.slaPausedTotalMs || 0)}</span>
                          </div>
                        )}
                        {dc.isSlaPaused && (
                          <div className="flex items-center justify-between">
                            <span className="text-orange-800/80 dark:text-orange-300/80">Original deadline:</span>
                            <span className="font-medium text-orange-900 dark:text-orange-200">{dc.slaDeadline ? formatDateTime(dc.slaDeadline) : "N/A"}</span>
                          </div>
                        )}
                      </div>
                      {canPauseSla && dc.isSlaPaused && (
                        <Button size="sm" onClick={handleSlaResume} disabled={updateMutation.isPending} className="w-full bg-green-600 hover:bg-green-700 text-white mt-1">
                          {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <><Play className="h-3 w-3 mr-1" /> Resume SLA Timer</>}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Escalation Status Card */}
                {dc.escalationLevel > 0 && (
                  <Card className="border-2 border-red-200 bg-red-50 dark:bg-red-950/20">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4 text-red-600" />
                        <p className="text-xs font-bold text-red-700">Escalation Status</p>
                        <Badge variant="outline" className={`text-[10px] ml-auto ${getEscalationBadge(dc.escalationLevel)?.cls || ""}`}>
                          <Shield className="h-2.5 w-2.5 mr-0.5" />
                          Level {dc.escalationLevel}
                        </Badge>
                      </div>
                      <div className="text-xs space-y-1 text-red-800/80 dark:text-red-300/80">
                        {dc.escalationLevel >= 1 && (
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full bg-amber-500" />
                            <span>L1 — {escalationSettings.complaintEscalationRole1 || "MANAGER"} notified at {escalationSettings.complaintEscalationLevel1Percent || 75}% SLA elapsed</span>
                          </div>
                        )}
                        {dc.escalationLevel >= 2 && (
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full bg-red-500" />
                            <span>L2 — {escalationSettings.complaintEscalationRole2 || "ADMIN"} notified at {escalationSettings.complaintEscalationLevel2Percent || 100}% SLA elapsed</span>
                          </div>
                        )}
                        <p className="text-muted-foreground mt-1">Priority was auto-adjusted to {getPriorityLabel(dc.priority)}</p>
                      </div>
                      {canPauseSla && dc.escalationLevel < 2 && (
                        <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: showDetail!, data: { escalationLevel: dc.escalationLevel + 1 } })} className="text-xs text-amber-600 border-amber-300 hover:bg-amber-50 w-full" disabled={updateMutation.isPending}>
                          <ArrowUpRight className="h-3 w-3 mr-1" /> Manually Escalate to L{dc.escalationLevel + 1}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Description */}
                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm leading-relaxed">{dc.description}</p>
                  </CardContent>
                </Card>

                {/* AI Suggested Resolution */}
                <Card className="border-2 border-red-200 bg-red-50 dark:bg-red-950/20">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-red-600" />
                      <p className="text-xs font-bold text-red-700">AI Suggested Resolution</p>
                    </div>
                    {dc.aiProbableCause ? (
                      <div className="text-xs space-y-1 text-red-800/80 dark:text-red-300/80">
                        <p><span className="font-semibold">Probable Cause:</span> {dc.aiProbableCause}</p>
                        <p><span className="font-semibold">Resolution Guide:</span> {dc.aiResolutionGuide}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">AI analysis not yet available for this complaint.</p>
                    )}
                  </CardContent>
                </Card>

                {/* ─── Comments Thread ─── */}
                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" /> Discussion Thread ({comments.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-3">
                    {/* Comments list */}
                    <ScrollArea className="max-h-72">
                      <div className="space-y-3 pr-2">
                        {comments.length === 0 ? (
                          <div className="text-center py-8">
                            <div className="h-12 w-12 rounded-full bg-muted mx-auto mb-2 flex items-center justify-center">
                              <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                            </div>
                            <p className="text-xs font-medium text-muted-foreground">No comments yet</p>
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Start the discussion below</p>
                          </div>
                        ) : (
                          comments.map((c, idx) => {
                            const avatarColors = [
                              "from-red-400 to-red-600",
                              "from-emerald-400 to-emerald-600",
                              "from-amber-400 to-amber-600",
                              "from-rose-400 to-rose-600",
                              "from-teal-400 to-teal-600",
                            ];
                            const colorIndex = (c.user?.name || "U").charCodeAt(0) % avatarColors.length;
                            const timeAgo = getTimeAgo(c.createdAt);
                            return (
                              <div key={c.id} className={`group flex gap-3 p-3 rounded-xl transition-all duration-150 ${idx === 0 ? "bg-gradient-to-r from-primary/5 to-transparent border border-primary/10 shadow-sm" : "bg-muted/30 hover:bg-muted/50"}`}>
                                <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${avatarColors[colorIndex]} text-white flex items-center justify-center shrink-0 text-xs font-bold shadow-sm ring-2 ring-white dark:ring-gray-800`}>
                                  {(c.user?.name || "U").charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold">{c.user?.name || "Unknown"}</span>
                                    {c.user?.role && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">{c.user.role}</Badge>
                                    )}
                                    {idx === 0 && comments.length > 1 && (
                                      <Badge className="text-[8px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">Latest</Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">{c.message}</p>
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                                    <span className="text-[10px] text-muted-foreground/70" title={formatDateTime(c.createdAt)}>{timeAgo}</span>
                                    <span className="text-[10px] text-muted-foreground/40">·</span>
                                    <span className="text-[10px] text-muted-foreground/50">{formatDateTime(c.createdAt)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                        <div ref={commentsEndRef} />
                      </div>
                    </ScrollArea>
                    {/* Comment input */}
                    <div className="flex gap-2 pt-2 border-t">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 text-white flex items-center justify-center shrink-0 text-xs font-bold shadow-sm mt-0.5">
                        <User className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1">
                        <Textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Type your comment... (Ctrl+Enter to send)"
                          rows={2}
                          className="flex-1 text-xs resize-none"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && commentText.trim()) {
                              e.preventDefault();
                              commentMutation.mutate({ complaintId: showDetail!, message: commentText });
                            }
                          }}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => commentText.trim() && commentMutation.mutate({ complaintId: showDetail!, message: commentText })}
                        disabled={!commentText.trim() || commentMutation.isPending}
                        className="bg-red-600 hover:bg-red-700 text-white shrink-0 self-end"
                      >
                        {commentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Resolution Notes */}
                {(detailStatus === "IN_PROGRESS" || detailStatus === "RESOLVED" || dc.resolutionNotes) && (
                  <Card className="border border-border/50 rounded-xl shadow-sm">
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Resolution Notes</p>
                      {detailStatus === "IN_PROGRESS" ? (
                        <>
                          <Textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="Describe the resolution steps taken..." rows={3} />
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleStatusChange("RESOLVED")}>
                            <CheckSquare className="h-3 w-3 mr-1" /> Resolve with Notes
                          </Button>
                        </>
                      ) : (
                        <p className="text-sm">{dc.resolutionNotes || "No resolution notes provided."}</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Customer Rating */}
                {detailStatus === "RESOLVED" && (
                  <Card className="border border-border/50 rounded-xl shadow-sm">
                    <CardContent className="p-3 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Customer Rating</p>
                      <StarRating rating={rating} onChange={setRating} />
                      <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Customer feedback (optional)..." rows={2} />
                      <Button size="sm" onClick={handleRateSubmit} disabled={rating === 0 || updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                        Submit Rating & Close
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Rating Display */}
                {(detailStatus === "CLOSED" || dc.customerRating) && dc.customerRating && (
                  <Card className="border border-border/50 rounded-xl shadow-sm">
                    <CardContent className="p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Customer Rating</p>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-4 w-4 ${i < (dc.customerRating || 0) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                        ))}
                      </div>
                      {dc.customerFeedback && <p className="text-xs text-muted-foreground mt-1">&ldquo;{dc.customerFeedback}&rdquo;</p>}
                    </CardContent>
                  </Card>
                )}

                {/* Activity Log / Audit Trail */}
                {(() => {
                  const logs: AuditLogEntry[] = (auditLogsData?.logs as AuditLogEntry[]) || [];
                  const relevantLogs = logs.filter((l) =>
                    l.action === "STATUS_CHANGE" || l.action === "AUTO_ESCALATION" || l.action === "ESCALATION" ||
                    l.action === "SLA_PAUSED" || l.action === "SLA_RESUMED" || l.action === "COMMENT"
                  );
                  if (relevantLogs.length === 0) return null;
                  return (
                    <Card className="border border-border/50 rounded-xl shadow-sm">
                      <CardHeader className="p-3 pb-0">
                        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                          <History className="h-3.5 w-3.5" /> Activity Log
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-2">
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {relevantLogs.map((log) => {
                            let details: Record<string, unknown> = {};
                            try { details = JSON.parse(log.details || "{}"); } catch { /* ignore */ }
                            return (
                              <div key={log.id} className="flex items-start gap-2 text-xs">
                                <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                                  log.action === "AUTO_ESCALATION" ? "bg-red-500" :
                                  log.action === "SLA_PAUSED" ? "bg-orange-500" :
                                  log.action === "SLA_RESUMED" ? "bg-green-500" :
                                  log.action === "COMMENT" ? "bg-emerald-500" :
                                  "bg-red-500"
                                }`} />
                                <div className="flex-1 min-w-0">
                                  {log.action === "STATUS_CHANGE" && (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-medium">{getStatusLabel((details.from as string) || "")}</span>
                                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                      <span className="font-medium">{getStatusLabel((details.to as string) || "")}</span>
                                    </div>
                                  )}
                                  {log.action === "AUTO_ESCALATION" && (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Shield className="h-3 w-3 text-red-500" />
                                      <span className="font-medium">Auto-escalated to {(details.toRole as string) || "L" + (details.toLevel as string)}</span>
                                      <span className="text-muted-foreground">({String(details.elapsedPercent)}% SLA elapsed)</span>
                                    </div>
                                  )}
                                  {log.action === "ESCALATION" && (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Shield className="h-3 w-3 text-red-500" />
                                      <span className="font-medium">Manually escalated to {(details.toRole as string) || "L" + (details.toLevel as string)}</span>
                                    </div>
                                  )}
                                  {log.action === "SLA_PAUSED" && (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Pause className="h-3 w-3 text-orange-500" />
                                      <span className="font-medium">SLA Paused</span>
                                      {!!details.reason && <span className="text-muted-foreground">— {String(details.reason)}</span>}
                                    </div>
                                  )}
                                  {log.action === "SLA_RESUMED" && (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Play className="h-3 w-3 text-green-500" />
                                      <span className="font-medium">SLA Resumed</span>
                                      {!!details.pausedDurationMins && <span className="text-muted-foreground">({String(details.pausedDurationMins)} min paused)</span>}
                                    </div>
                                  )}
                                  {log.action === "COMMENT" && (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <MessageSquare className="h-3 w-3 text-emerald-500" />
                                      <span className="font-medium">{(details.messagePreview as string) || "Comment added"}</span>
                                    </div>
                                  )}
                                  <p className="text-muted-foreground mt-0.5">
                                    {log.userName || "System"} &middot; {formatDateTime(log.timestamp)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-12"><Skeleton className="skeleton-wave h-40 w-full" /></div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── SLA Pause Dialog ────────────────── */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pause className="h-5 w-5 text-orange-500" />
              Pause SLA Timer
            </DialogTitle>
            <DialogDescription>
              Pausing the SLA timer will stop the countdown until resumed. The remaining time will be preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Reason for pausing SLA *</Label>
              <Textarea
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="e.g., Waiting for vendor response, Parts on order..."
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                The SLA timer will be frozen until manually resumed. The paused duration will be added back to the deadline.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPauseDialog(false)}>Cancel</Button>
            <Button onClick={handleSlaPause} disabled={!pauseReason.trim() || updateMutation.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
              {updateMutation.isPending ? "Pausing..." : "Pause SLA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Escalation Settings Dialog ────────────────── */}
      <Dialog open={showEscalationSettings} onOpenChange={setShowEscalationSettings}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Escalation Settings
            </DialogTitle>
            <DialogDescription>Configure automatic SLA escalation for complaints</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Auto-Escalation</Label>
                <p className="text-xs text-muted-foreground">Automatically escalate complaints when SLA thresholds are reached</p>
              </div>
              <Switch
                checked={escalationSettings.complaintEscalationEnabled}
                onCheckedChange={(v) => setEscalationSettings({ ...escalationSettings, complaintEscalationEnabled: v })}
              />
            </div>

            {escalationSettings.complaintEscalationEnabled && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Level 1 Trigger (%)</Label>
                    <Input
                      type="number"
                      value={escalationSettings.complaintEscalationLevel1Percent}
                      onChange={(e) => setEscalationSettings({ ...escalationSettings, complaintEscalationLevel1Percent: parseInt(e.target.value) || 75 })}
                      min={1}
                      max={100}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Level 1 Role</Label>
                    <Select
                      value={escalationSettings.complaintEscalationRole1}
                      onValueChange={(v) => setEscalationSettings({ ...escalationSettings, complaintEscalationRole1: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANAGER">MANAGER</SelectItem>
                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                        <SelectItem value="SUPER_ADMIN">SUPER_ADMIN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Level 2 Trigger (%)</Label>
                    <Input
                      type="number"
                      value={escalationSettings.complaintEscalationLevel2Percent}
                      onChange={(e) => setEscalationSettings({ ...escalationSettings, complaintEscalationLevel2Percent: parseInt(e.target.value) || 100 })}
                      min={1}
                      max={200}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Level 2 Role</Label>
                    <Select
                      value={escalationSettings.complaintEscalationRole2}
                      onValueChange={(v) => setEscalationSettings({ ...escalationSettings, complaintEscalationRole2: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANAGER">MANAGER</SelectItem>
                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                        <SelectItem value="SUPER_ADMIN">SUPER_ADMIN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/50 border space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">How it works:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>When SLA reaches <span className="font-semibold text-amber-600">{escalationSettings.complaintEscalationLevel1Percent}%</span> → escalated to <span className="font-semibold">{escalationSettings.complaintEscalationRole1}</span></li>
                    <li>When SLA reaches <span className="font-semibold text-red-600">{escalationSettings.complaintEscalationLevel2Percent}%</span> → escalated to <span className="font-semibold">{escalationSettings.complaintEscalationRole2}</span></li>
                    <li>Only OPEN, ASSIGNED, and IN_PROGRESS complaints are auto-escalated</li>
                    <li>Paused SLA timers are excluded from escalation checks</li>
                  </ul>
                </div>

                {/* Escalation Path Configuration */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Escalation Path (L1 → L2 → ...)</p>
                    <Button size="sm" variant="outline" onClick={handleAddEscPathLevel} className="text-xs h-7">
                      <Plus className="h-3 w-3 mr-1" /> Add Level
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {escPathLevels.map((level, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2.5 rounded-lg border bg-card">
                        <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 shrink-0 bg-red-50 text-red-700 border-red-200">
                          {level.level}
                        </Badge>
                        <div className="flex-1 grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">Timeout (hrs)</label>
                            <Input
                              type="number"
                              value={level.timeoutHours}
                              onChange={(e) => handleEscPathLevelChange(idx, "timeoutHours", parseInt(e.target.value) || 0)}
                              min={1}
                              max={168}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">Action</label>
                            <Select
                              value={level.action}
                              onValueChange={(v) => handleEscPathLevelChange(idx, "action", v)}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="notify">Notify</SelectItem>
                                <SelectItem value="escalate">Escalate</SelectItem>
                                <SelectItem value="notify_admin">Notify Admin</SelectItem>
                                <SelectItem value="reassign">Reassign</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">Assignee Role</label>
                            <Select
                              value={level.assigneeRole || "MANAGER"}
                              onValueChange={(v) => handleEscPathLevelChange(idx, "assigneeRole", v)}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="OPERATOR">OPERATOR</SelectItem>
                                <SelectItem value="AGENT">AGENT</SelectItem>
                                <SelectItem value="TECHNICIAN">TECHNICIAN</SelectItem>
                                <SelectItem value="MANAGER">MANAGER</SelectItem>
                                <SelectItem value="ADMIN">ADMIN</SelectItem>
                                <SelectItem value="SUPER_ADMIN">SUPER_ADMIN</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {escPathLevels.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveEscPathLevel(idx)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {escPathLevels.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-lg">No escalation levels configured. Click "Add Level" to define the path.</p>
                    )}
                  </div>
                  {escPathLevels.length > 1 && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>Path flow:</span>
                      {escPathLevels.map((level, idx) => (
                        <span key={idx} className="flex items-center gap-1">
                          {idx > 0 && <ChevronRight className="h-3 w-3" />}
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{level.level}</Badge>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEscalationSettings(false)}>Cancel</Button>
            <Button onClick={handleSaveEscalationSettings} disabled={escalationSaveMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {escalationSaveMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Close Confirmation ────────────────── */}
      <AlertDialog open={showBulkClose} onOpenChange={setShowBulkClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Close Complaints</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close {selectedIds.size} complaint(s)? This will set their status to &quot;Closed&quot; and record the resolved time. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkCloseMutation.mutate(Array.from(selectedIds))}
              disabled={bulkCloseMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {bulkCloseMutation.isPending ? "Closing..." : `Close ${selectedIds.size} Complaint(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Print-Friendly Complaint Details ────────── */}
      {dc && (
        <div className="print:block hidden fixed inset-0 bg-white z-[9999] p-8 overflow-auto">
          <div className="max-w-2xl mx-auto">
            <div className="text-center border-b-2 border-black pb-4 mb-6">
              <h1 className="text-2xl font-bold">Complaint Details</h1>
              <p className="text-sm text-gray-600 mt-1">Cryptsk ISP</p>
            </div>

            <table className="w-full text-sm border-collapse mb-6">
              <tbody>
                <tr className="border-b"><td className="py-2 font-semibold w-40 text-gray-700">Ticket Number</td><td className="py-2 font-mono font-bold">{dc.ticketNumber}</td></tr>
                <tr className="border-b"><td className="py-2 font-semibold text-gray-700">Customer Name</td><td className="py-2">{dc.subscriber?.name || dc.walkInName || "—"}</td></tr>
                {dc.subscriber && (<tr className="border-b"><td className="py-2 font-semibold text-gray-700">Phone</td><td className="py-2">{dc.subscriber.phone}</td></tr>)}
                <tr className="border-b"><td className="py-2 font-semibold text-gray-700">Complaint Type</td><td className="py-2">{getTypeLabel(dc.type)}</td></tr>
                <tr className="border-b"><td className="py-2 font-semibold text-gray-700">Priority</td><td className="py-2">{getPriorityLabel(dc.priority)}</td></tr>
                <tr className="border-b"><td className="py-2 font-semibold text-gray-700">Status</td><td className="py-2">{getStatusLabel(dc.status)}</td></tr>
                {dc.assignedTo && (<tr className="border-b"><td className="py-2 font-semibold text-gray-700">Assigned To</td><td className="py-2">{dc.assignedTo.name} ({dc.assignedTo.phone})</td></tr>)}
                {dc.area && (<tr className="border-b"><td className="py-2 font-semibold text-gray-700">Area</td><td className="py-2">{dc.area.name}</td></tr>)}
                <tr className="border-b"><td className="py-2 font-semibold text-gray-700">SLA Hours</td><td className="py-2">{dc.slaHours}h</td></tr>
                {dc.slaDeadline && (<tr className="border-b"><td className="py-2 font-semibold text-gray-700">SLA Deadline</td><td className="py-2">{formatDateTime(dc.slaDeadline)}</td></tr>)}
                <tr className="border-b"><td className="py-2 font-semibold text-gray-700">Created</td><td className="py-2">{formatDateTime(dc.createdAt)}</td></tr>
                {dc.resolvedAt && (<tr className="border-b"><td className="py-2 font-semibold text-gray-700">Resolved</td><td className="py-2">{formatDateTime(dc.resolvedAt)}</td></tr>)}
              </tbody>
            </table>

            <h2 className="text-lg font-bold mb-2">Description</h2>
            <p className="text-sm mb-6">{dc.description}</p>

            {dc.resolutionNotes && (
              <>
                <h2 className="text-lg font-bold mb-2">Resolution Notes</h2>
                <p className="text-sm mb-6">{dc.resolutionNotes}</p>
              </>
            )}

            <div className="border-t pt-4 mt-6 text-xs text-gray-500 flex justify-between">
              <span>Printed on {new Date().toLocaleString()}</span>
              <span>Cryptsk ISP Platform</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
