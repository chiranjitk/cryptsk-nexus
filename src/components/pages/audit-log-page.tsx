"use client";

import React, { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Filter,
  Download,
  Eye,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Activity,
  Users,
  CalendarDays,
  TrendingUp,
  Clock,
  Globe,
  Monitor,
  FileText,
  ArrowUpDown,
  RefreshCw,
  AlertTriangle,
  X,
  ShieldCheck,
  Settings,
  Archive,
  FileDown,
  Printer,
  HardDrive,
  Database,
  GitCompare,
  History,
  ArchiveRestore,
  Sparkles,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { apiFetch, safeJsonParse } from "@/lib/utils";
import { escapeHtml } from "@/lib/utils/html-escape";

// ─── Types ───────────────────────────────────────────────────────

interface AuditLogUser {
  id: string;
  name: string;
  email: string;
}

interface AuditLogItem {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  previousValues: string | null;
  endpoint: string;
  method: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  isArchived: boolean;
  archivedAt: string | null;
  user: AuditLogUser | null;
}

interface AuditLogStats {
  totalCount: number;
  todayCount: number;
  weekCount: number;
  prevWeekCount: number;
  monthCount: number;
  uniqueUserCount: number;
  dailyCounts: { date: string; count: number }[];
  topActions: { action: string; count: number }[];
  topEntities: { entity: string; count: number }[];
  topUsers: { userId: string; userName: string; count: number }[];
}

interface AuditLogResponse {
  logs: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: AuditLogStats;
}

interface ComplianceReport {
  totalActions: number;
  actionCounts: { action: string; count: number }[];
  topUsers: { name: string; count: number }[];
  entityCounts: { entity: string; count: number }[];
  afterHoursCount: number;
  exportCount: number;
}

// ─── Constants ───────────────────────────────────────────────────

const ACTION_OPTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "STATUS_CHANGE",
  "PAYMENT",
  "EXPORT",
  "CONFIG_CHANGE",
  "BULK_CREATE",
  "BULK_DELETE",
  "VERIFICATION",
  "REJECTION",
  "PLAN_CHANGE",
] as const;

const ENTITY_OPTIONS = [
  "User",
  "Subscriber",
  "Plan",
  "Invoice",
  "Payment",
  "Complaint",
  "Area",
  "Equipment",
  "Device",
  "Technician",
  "Agent",
  "Lead",
  "Notification",
  "Voucher",
  "Installation",
  "Incident",
  "Inventory",
  "Promotion",
  "Integration",
  "Settings",
  "RADIUS",
  "FTTH",
  "IPAM",
  "MultiWAN",
  "Backup",
  "KnowledgeBase",
  "Competitor",
  "WhatsApp",
  "API Key",
  "Session",
  "Referral",
  "Collection",
] as const;

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  UPDATE: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  DELETE: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  LOGIN: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  LOGOUT: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  STATUS_CHANGE: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  PAYMENT: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  EXPORT: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
  CONFIG_CHANGE: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  BULK_CREATE: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  BULK_DELETE: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  LOGIN_FAILED: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
  VERIFICATION: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  REJECTION: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
  PLAN_CHANGE: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
  RETENTION_SWEEP: "bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-950 dark:text-lime-300 dark:border-lime-800",
  AUTO_ESCALATION: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  RESTORE: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  ARCHIVE: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  PURGE: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
};

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-600",
  POST: "text-teal-600",
  PUT: "text-amber-600",
  PATCH: "text-orange-600",
  DELETE: "text-red-600",
};

const CHART_COLORS = [
  "#dc2626", "#ea580c", "#d97706", "#65a30d", "#059669",
  "#0891b2", "#2563eb", "#7c3aed", "#c026d3", "#e11d48",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PAGE_SIZE_OPTIONS = [25, 50, 100];

// ─── Helpers ─────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatShortTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildSummary(log: AuditLogItem): string {
  const details = safeJsonParse<Record<string, unknown>>(log.details, {} as Record<string, unknown>);
  const prev = safeJsonParse<Record<string, unknown>>(log.previousValues, {} as Record<string, unknown>);
  const userName = log.userName || log.user?.name || "Unknown";

  switch (log.action) {
    case "CREATE":
    case "BULK_CREATE": {
      if (!details) return `${log.action} on ${log.entity}`;
      const name =
        (details.name as string) ||
        (details.userName as string) ||
        (details.title as string) ||
        "";
      const plan = (details.planName as string) || (details.plan as string) || "";
      if (name && plan) return `Created: ${name} (${plan})`;
      if (name) return `Created: ${name}`;
      return `${log.action}: ${log.entity}`;
    }
    case "UPDATE": {
      if (prev && details) {
        const prevKeys = Object.keys(prev);
        const firstPrevVal = prev[prevKeys[0]];
        if (firstPrevVal && typeof firstPrevVal === "object" && "old" in (firstPrevVal as object) && "new" in (firstPrevVal as object)) {
          const diffEntries = prevKeys.map((k) => ({
            field: k,
            ...(prev[k] as { old: unknown; new: unknown }),
          }));
          if (diffEntries.length > 0) {
            const entry = diffEntries[0];
            const label = entry.field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
            return `${label}: ${String(entry.old)} → ${String(entry.new)}`;
          }
        } else {
          const detailKeys = Object.keys(details);
          const changed = detailKeys.filter((k) => {
            const old = prev[k];
            const new_ = details[k];
            return old !== undefined && new_ !== undefined && JSON.stringify(old) !== JSON.stringify(new_);
          });
          if (changed.length > 0) {
            const field = changed[0];
            const oldVal = String(prev[field] ?? "");
            const newVal = String(details[field] ?? "");
            const label = field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
            return `${label}: ${oldVal} → ${newVal}`;
          }
        }
      }
      if (details) {
        const name =
          (details.name as string) ||
          (details.userName as string) ||
          "";
        if (name) return `Updated: ${name}`;
      }
      return `Updated ${log.entity}`;
    }
    case "DELETE":
    case "BULK_DELETE": {
      if (details) {
        const name = (details.name as string) || (details.userName as string) || "";
        if (name) return `Deleted: ${name}`;
      }
      return `Deleted ${log.entity}`;
    }
    case "LOGIN":
      return `Logged in as ${log.user?.email || userName}`;
    case "LOGOUT":
      return `Logged out`;
    case "LOGIN_FAILED":
      return `Failed login attempt from ${log.ipAddress}`;
    case "STATUS_CHANGE": {
      if (details) {
        const from = (details.from as string) || (prev?.status as string) || "";
        const to = (details.to as string) || (details.status as string) || "";
        if (from && to) return `Status: ${from} → ${to}`;
      }
      return `Status changed on ${log.entity}`;
    }
    case "PAYMENT": {
      if (details) {
        const amount = (details.amount as string) || "";
        const method = (details.method as string) || (details.paymentMethod as string) || "";
        if (amount) return `Payment: ₹${amount}${method ? ` via ${method}` : ""}`;
      }
      return `Payment on ${log.entity}`;
    }
    case "VERIFICATION":
      return `Verified ${log.entity}`;
    case "REJECTION":
      return `Rejected ${log.entity}`;
    case "PLAN_CHANGE": {
      if (details) {
        const from = (details.fromPlan as string) || (details.oldPlan as string) || "";
        const to = (details.toPlan as string) || (details.newPlan as string) || "";
        if (from && to) return `Plan: ${from} → ${to}`;
      }
      return `Plan changed on ${log.entity}`;
    }
    case "EXPORT":
      return `Exported ${log.entity} data`;
    case "CONFIG_CHANGE":
      return `Configuration changed`;
    default:
      if (details) {
        const name =
          (details.name as string) ||
          (details.userName as string) ||
          (details.title as string) ||
          "";
        if (name) return `${log.action}: ${name}`;
      }
      return `${log.action} on ${log.entity}`;
  }
}

function getChangedFields(
  log: AuditLogItem
): { field: string; oldValue: string; newValue: string }[] | null {
  const details = safeJsonParse<Record<string, unknown>>(log.details, {} as Record<string, unknown>);
  const prev = safeJsonParse<Record<string, unknown>>(log.previousValues, {} as Record<string, unknown>);
  if (!prev || !details) return null;

  const changed: { field: string; oldValue: string; newValue: string }[] = [];

  const prevKeys = Object.keys(prev);
  const firstPrevVal = prev[prevKeys[0]];
  if (firstPrevVal && typeof firstPrevVal === "object" && "old" in (firstPrevVal as object) && "new" in (firstPrevVal as object)) {
    for (const key of prevKeys) {
      const entry = prev[key] as { old: unknown; new: unknown };
      changed.push({
        field: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
        oldValue: String(entry.old ?? "-"),
        newValue: String(entry.new ?? "-"),
      });
    }
  } else {
    for (const key of Object.keys(details)) {
      const old = prev[key];
      const new_ = details[key];
      if (old !== undefined && new_ !== undefined && JSON.stringify(old) !== JSON.stringify(new_)) {
        changed.push({
          field: key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
          oldValue: String(old ?? "-"),
          newValue: String(new_ ?? "-"),
        });
      }
    }
  }

  return changed.length > 0 ? changed : null;
}

function compareEntryFields(
  entry1: AuditLogItem,
  entry2: AuditLogItem
): { key: string; status: "unchanged" | "added" | "removed" | "changed"; value1?: string; value2?: string }[] {
  const d1 = safeJsonParse<Record<string, unknown>>(entry1.details, {} as Record<string, unknown>);
  const d2 = safeJsonParse<Record<string, unknown>>(entry2.details, {} as Record<string, unknown>);
  const p1 = safeJsonParse<Record<string, unknown>>(entry1.previousValues, {} as Record<string, unknown>);
  const p2 = safeJsonParse<Record<string, unknown>>(entry2.previousValues, {} as Record<string, unknown>);

  const merged1: Record<string, unknown> = { ...p1, ...d1 };
  const merged2: Record<string, unknown> = { ...p2, ...d2 };
  const allKeys = new Set([...Object.keys(merged1), ...Object.keys(merged2)]);

  const result: { key: string; status: "unchanged" | "added" | "removed" | "changed"; value1?: string; value2?: string }[] = [];

  for (const key of allKeys) {
    const v1 = key in merged1 ? JSON.stringify(merged1[key], null, 0) : undefined;
    const v2 = key in merged2 ? JSON.stringify(merged2[key], null, 0) : undefined;

    if (v1 === v2) {
      result.push({ key, status: "unchanged", value1: v1 });
    } else if (v1 === undefined) {
      result.push({ key, status: "added", value2: v2 });
    } else if (v2 === undefined) {
      result.push({ key, status: "removed", value1: v1 });
    } else {
      result.push({ key, status: "changed", value1: v1, value2: v2 });
    }
  }

  return result;
}

function computeComplianceReport(allLogs: AuditLogItem[]): ComplianceReport {
  const actionCountsMap: Record<string, number> = {};
  const userCountsMap: Record<string, { name: string; count: number }> = {};
  const entityCountsMap: Record<string, number> = {};
  let afterHoursCount = 0;
  let exportCount = 0;

  for (const log of allLogs) {
    actionCountsMap[log.action] = (actionCountsMap[log.action] || 0) + 1;
    entityCountsMap[log.entity] = (entityCountsMap[log.entity] || 0) + 1;
    const userName = log.userName || log.user?.name || "Unknown";
    if (userCountsMap[log.userId]) {
      userCountsMap[log.userId].count++;
    } else {
      userCountsMap[log.userId] = { name: userName, count: 1 };
    }

    const hour = new Date(log.timestamp).getHours();
    if (hour < 9 || hour >= 18) afterHoursCount++;

    if (log.action === "EXPORT") exportCount++;
  }

  return {
    totalActions: allLogs.length,
    actionCounts: Object.entries(actionCountsMap)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count),
    topUsers: Object.values(userCountsMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    entityCounts: Object.entries(entityCountsMap)
      .map(([entity, count]) => ({ entity, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    afterHoursCount,
    exportCount,
  };
}

// ─── Stats Card Component ────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg: string;
  trend?: { value: number; label: string };
}

function StatCard({ title, value, subtitle, icon, iconBg, trend }: StatCardProps) {
  return (
    <Card className="border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </p>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-1">
                <span
                  className={`text-xs font-medium ${
                    trend.value >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%
                </span>
                <span className="text-xs text-muted-foreground">{trend.label}</span>
              </div>
            )}
          </div>
          <div className={`rounded-xl p-2.5 ${iconBg}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Activity Bar Chart Component ────────────────────────────────

function ActivityChart({ stats }: { stats: AuditLogStats | undefined }) {
  let bars: { day: string; count: number; isToday: boolean }[] = [];
  if (stats?.dailyCounts) {
    const today = new Date();
    bars = stats.dailyCounts.map((dc) => {
      const d = new Date(dc.date + "T00:00:00");
      return {
        day: DAY_NAMES[d.getDay()],
        count: dc.count,
        isToday: dc.date === today.toISOString().split("T")[0],
      };
    });
  }

  const maxCount = Math.max(...bars.map((b) => b.count), 1);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-red-600" />
          Activity (Last 7 Days)
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-end gap-2 sm:gap-3 h-32">
          {bars.map((bar, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex flex-col items-center">
                <span className="text-[10px] text-muted-foreground font-medium">
                  {formatNumber(bar.count)}
                </span>
                <div
                  className={`w-full rounded-t-md transition-all duration-500 ${
                    bar.isToday
                      ? "bg-red-600"
                      : "bg-red-200 dark:bg-red-900/60"
                  }`}
                  style={{
                    height: `${Math.max((bar.count / maxCount) * 80, 4)}px`,
                  }}
                />
              </div>
              <span
                className={`text-[10px] font-medium ${
                  bar.isToday ? "text-red-600" : "text-muted-foreground"
                }`}
              >
                {bar.day}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export default function AuditLogPage() {
  const queryClient = useQueryClient();

  // ─── Filter State ─────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sort, setSort] = useState<string>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filtersOpen, setFiltersOpen] = useState(true);

  // ─── Dialog State ─────────────────────────────────────
  const [detailLog, setDetailLog] = useState<AuditLogItem | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeDate, setPurgeDate] = useState<string>("");
  const [purgeEntity, setPurgeEntity] = useState<string>("all");
  const [uaExpanded, setUaExpanded] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [retentionDays, setRetentionDays] = useState("90");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("logs");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [exportAllLoading, setExportAllLoading] = useState(false);
  const [archiveDeleteLoading, setArchiveDeleteLoading] = useState(false);
  const [autoDelete, setAutoDelete] = useState(false);

  // ─── Compare Mode State ──────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);

  // ─── Session Reconstruction State ────────────────────
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionUserId, setSessionUserId] = useState("");
  const [sessionStartDate, setSessionStartDate] = useState("");
  const [sessionEndDate, setSessionEndDate] = useState("");

  // ─── Compliance Report State ─────────────────────────
  const [complianceStart, setComplianceStart] = useState("");
  const [complianceEnd, setComplianceEnd] = useState("");
  const [complianceReport, setComplianceReport] = useState<ComplianceReport | null>(null);

  // ─── Retention Info Query ─────────────────────────────
  const { data: retentionInfo } = useQuery<{
    retentionDays: number;
    autoDelete: boolean;
    totalCount: number;
    oldCount: number;
    todayCount: number;
    archivedCount: number;
    activeCount: number;
    estimatedStorageMB: number;
    cutoffDate: string;
    automation: {
      enabled: boolean;
      jobId: string;
      jobName: string;
      schedule: string;
      archiveDays: number;
      purgeDays: number;
      sessionDays: number;
      notificationDays: number;
      lastSweepAt: string | null;
      lastSweepResult: { archivedAuditLogs?: number; purgedAuditLogs?: number; purgedSessions?: number } | null;
    } | null;
  }>({
    queryKey: ["audit-retention-info"],
    queryFn: async () => apiFetch("/api/audit-log?type=retention-info"),
    refetchInterval: 60_000,
  });

  // ─── Archived lifecycle filter [NEW-FEATURE] ─────────
  const [archivedFilter, setArchivedFilter] = useState<"active" | "archived" | "all">("active");

  // ─── Derived params ───────────────────────────────────
  const queryParamsObj = new URLSearchParams();
  if (filterAction !== "all") queryParamsObj.set("action", filterAction);
  if (filterEntity !== "all") queryParamsObj.set("entity", filterEntity);
  if (filterUser !== "all") queryParamsObj.set("userId", filterUser);
  if (search) queryParamsObj.set("search", search);
  if (startDate) queryParamsObj.set("startDate", startDate);
  if (endDate) queryParamsObj.set("endDate", endDate);
  if (archivedFilter === "active") queryParamsObj.set("archived", "exclude");
  else if (archivedFilter === "archived") queryParamsObj.set("archived", "only");
  queryParamsObj.set("page", String(page));
  queryParamsObj.set("limit", String(pageSize));
  queryParamsObj.set("sort", sort === "newest" ? "desc" : "asc");
  const queryParams = queryParamsObj.toString();

  // ─── Data Fetching ────────────────────────────────────
  const {
    data: response,
    isLoading,
    isFetching,
  } = useQuery<AuditLogResponse>({
    queryKey: ["audit-log", queryParams],
    queryFn: async () => {
      return apiFetch<AuditLogResponse>(`/api/audit-log?${queryParams}`);
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  const logs = response?.logs ?? [];
  const total = response?.total ?? 0;
  const totalPages = response?.totalPages ?? 1;
  const stats = response?.stats;

  // ─── Entity Timeline Query ────────────────────────────
  const { data: timelineLogs } = useQuery<AuditLogResponse>({
    queryKey: ["audit-log-timeline", detailLog?.entity, detailLog?.entityId],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("entity", detailLog!.entity);
      p.set("entityId", detailLog!.entityId);
      p.set("limit", "10");
      p.set("sort", "desc");
      return apiFetch<AuditLogResponse>(`/api/audit-log?${p.toString()}`);
    },
    enabled: !!detailLog?.entityId,
  });

  // ─── User Timeline Query ──────────────────────────────
  const { data: userTimelineLogs } = useQuery<AuditLogResponse>({
    queryKey: ["audit-log-user-timeline", detailLog?.userId],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("userId", detailLog!.userId);
      p.set("limit", "10");
      p.set("sort", "desc");
      return apiFetch<AuditLogResponse>(`/api/audit-log?${p.toString()}`);
    },
    enabled: !!detailLog?.userId && detailLog?.userId !== "",
  });

  // ─── Anomalies Query ────────────────────────────────
  const { data: anomalyData, refetch: refetchAnomalies } = useQuery<{
    anomalies: { type: string; description: string; severity: string; count: number; details: unknown[] }[];
    totalAnomalies: number;
    flaggedUserIds?: string[];
  }>({
    queryKey: ["audit-anomalies"],
    queryFn: async () => {
      return apiFetch("/api/audit-log?type=anomalies");
    },
    enabled: activeTab === "anomalies",
    refetchInterval: 60_000,
  });

  const anomalies = anomalyData?.anomalies || [];
  const flaggedUserIds = (anomalyData as Record<string, unknown>)?.flaggedUserIds
    ? ((anomalyData as Record<string, unknown>).flaggedUserIds as string[])
    : [];

  // ─── Session Reconstruction Query ────────────────────
  const { data: sessionLogsData, isLoading: sessionLoading } = useQuery<AuditLogResponse>({
    queryKey: ["audit-session-logs", sessionUserId, sessionStartDate, sessionEndDate],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("userId", sessionUserId);
      if (sessionStartDate) p.set("startDate", sessionStartDate);
      if (sessionEndDate) p.set("endDate", sessionEndDate);
      p.set("limit", "200");
      p.set("sort", "asc");
      return apiFetch<AuditLogResponse>(`/api/audit-log?${p.toString()}`);
    },
    enabled: sessionOpen && !!sessionUserId,
  });

  const sessionLogs = sessionLogsData?.logs ?? [];

  // ─── Compliance Report Mutation ──────────────────────
  const complianceMutation = useMutation({
    mutationFn: async (params: { startDate: string; endDate: string }) => {
      const p = new URLSearchParams();
      p.set("type", "export-all");
      if (params.startDate) p.set("startDate", params.startDate);
      if (params.endDate) p.set("endDate", params.endDate);
      const res = await apiFetch<{ logs: AuditLogItem[]; total: number }>(`/api/audit-log?${p.toString()}`);
      const allLogs = res.logs || [];
      return computeComplianceReport(allLogs);
    },
    onSuccess: (report) => {
      setComplianceReport(report);
      toast.success("Compliance report generated");
    },
    onError: (err: Error) => toast.error(`Failed to generate report: ${err.message}`),
  });

  // ─── Retention Mutation ─────────────────────────────
  const retentionMutation = useMutation({
    mutationFn: async (params: { days: number; autoDelete?: boolean }) => {
      return apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditRetentionDays: params.days, auditAutoDelete: params.autoDelete ?? false }),
      });
    },
    onSuccess: () => {
      toast.success(`Retention set to ${retentionDays} days`);
      setRetentionOpen(false);
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["audit-retention-info"] });
    },
    onError: (err: Error) => toast.error(`Failed to update retention: ${err.message}`),
  });

  // ─── Bulk Delete Mutation ───────────────────────────
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return apiFetch("/api/audit-log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-selected", ids }),
      });
    },
    onSuccess: (res: Record<string, number>) => {
      toast.success(`Deleted ${res.deletedCount || selectedIds.size} log entries`);
      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    },
    onError: (err: Error) => toast.error(`Failed to delete: ${err.message}`),
  });

  // ─── Lifecycle Mutation (archive / restore) [NEW-FEATURE] ──
  const lifecycleMutation = useMutation({
    mutationFn: async (params: { action: "archive" | "restore"; ids: string[] }) => {
      return apiFetch<{ updatedCount: number; message?: string }>("/api/audit-log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    },
    onSuccess: (res, vars) => {
      if (res.updatedCount === 0) {
        toast.info(vars.action === "restore" ? "Nothing to restore — already active" : "Nothing to archive — already archived");
      } else {
        toast.success(res.message || `Updated ${res.updatedCount} entries`);
      }
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["audit-retention-info"] });
    },
    onError: (err: Error) => toast.error(`Lifecycle update failed: ${err.message}`),
  });

  // ─── Run Retention Sweep Now [NEW-FEATURE] ──────────
  // Triggers job-009 in billing-cron (:3004) through the dev gateway, then
  // refreshes retention info so "Last sweep" + counts update. The sweep is
  // async server-side, so we poll the info query a couple of times.
  const [sweepRunning, setSweepRunning] = useState(false);
  const runSweepMutation = useMutation({
    mutationFn: async () =>
      apiFetch<{ success: boolean; message?: string }>("/api/retention-sweep?XTransformPort=3004", {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Retention sweep started — job-009 is running");
      setSweepRunning(true);
      // The sweep finishes within seconds; poll retention info to catch it.
      const pollDelays = [3000, 6000, 10000];
      pollDelays.forEach((d) =>
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["audit-retention-info"] });
          queryClient.invalidateQueries({ queryKey: ["audit-log"] });
        }, d)
      );
      setTimeout(() => setSweepRunning(false), 12000);
    },
    onError: (err: Error) => {
      setSweepRunning(false);
      if (err.message.includes("409")) {
        toast.warning("A retention sweep is already in progress");
      } else if (err.message.includes("401") || err.message.includes("403")) {
        toast.error("Session expired or insufficient role — please re-login as admin");
      } else {
        toast.error(`Failed to start sweep: ${err.message}`);
      }
    },
  });

  // ─── Purge Mutation ───────────────────────────────────
  const purgeMutation = useMutation({
    mutationFn: async () => {
      const body: { beforeDate: string; entity?: string } = {
        beforeDate: purgeDate,
      };
      if (purgeEntity !== "all") body.entity = purgeEntity;
      return apiFetch("/api/audit-log", {
        method: "DELETE",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success("Old logs purged successfully");
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      setPurgeOpen(false);
      setPurgeDate("");
      setPurgeEntity("all");
    },
    onError: (err: Error) => {
      toast.error(`Failed to purge: ${err.message}`);
    },
  });

  // ─── Clear Filters ───────────────────────────────────
  const clearFilters = useCallback(() => {
    setSearch("");
    setFilterAction("all");
    setFilterEntity("all");
    setFilterUser("all");
    setStartDate("");
    setEndDate("");
    setSort("newest");
    setArchivedFilter("active");
    setPage(1);
  }, []);

  // Reset page when filters change
  const handleFilterChange = useCallback(
    (setter: (val: string) => void) => (val: string) => {
      setter(val);
      setPage(1);
    },
    []
  );

  // ─── Export CSV (current page) ──────────────────────
  const handleExport = useCallback(() => {
    if (logs.length === 0) {
      toast.error("No logs to export");
      return;
    }
    const headers = [
      "Timestamp",
      "User",
      "Email",
      "Action",
      "Entity",
      "Entity ID",
      "Summary",
      "Endpoint",
      "Method",
      "IP Address",
    ];
    const rows = logs.map((l) => {
      const d = safeJsonParse<Record<string, unknown>>(l.details, {});
      return [
        l.timestamp,
        l.userName || l.user?.name || "",
        l.user?.email || "",
        l.action,
        l.entity,
        l.entityId,
        `"${buildSummary(l).replace(/"/g, '""')}"`,
        l.endpoint || "",
        l.method || "",
        l.ipAddress,
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${formatNumber(logs.length)} log entries`);
  }, [logs]);

  // ─── Export All Logs ────────────────────────────────
  const handleExportAll = useCallback(async () => {
    setExportAllLoading(true);
    try {
      const res = await apiFetch<{ logs: AuditLogItem[]; total: number }>("/api/audit-log?type=export-all");
      const allLogs = res.logs || [];
      if (allLogs.length === 0) {
        toast.error("No logs to export");
        return;
      }
      const headers = ["Timestamp", "User", "Email", "Action", "Entity", "Entity ID", "Summary", "Endpoint", "Method", "IP Address"];
      const rows = allLogs.map((l) => [
        l.timestamp,
        l.userName || l.user?.name || "",
        l.user?.email || "",
        l.action,
        l.entity,
        l.entityId,
        `"${buildSummary(l).replace(/"/g, '""')}"`,
        l.endpoint || "",
        l.method || "",
        l.ipAddress,
      ].join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-all-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${formatNumber(res.total)} log entries`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportAllLoading(false);
    }
  }, []);

  // ─── Archive & Delete ──────────────────────────────
  const handleArchiveAndDelete = useCallback(async () => {
    setArchiveDeleteLoading(true);
    try {
      const cutoff = retentionInfo?.cutoffDate;
      if (!cutoff) {
        toast.error("Retention info not available");
        return;
      }
      const res = await apiFetch<{ logs: AuditLogItem[]; total: number }>("/api/audit-log?type=export-all");
      const allLogs = res.logs || [];
      if (allLogs.length === 0) {
        toast.error("No logs to archive");
        return;
      }
      const headers = ["Timestamp", "User", "Email", "Action", "Entity", "Entity ID", "Summary", "Endpoint", "Method", "IP Address"];
      const rows = allLogs.map((l) => [
        l.timestamp, l.userName || l.user?.name || "", l.user?.email || "",
        l.action, l.entity, l.entityId,
        `"${buildSummary(l).replace(/"/g, '""')}"`,
        l.endpoint || "", l.method || "", l.ipAddress,
      ].join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-archive-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      await apiFetch("/api/audit-log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beforeDate: cutoff }),
      });
      toast.success(`Archived ${formatNumber(res.total)} entries and deleted logs older than ${retentionInfo?.retentionDays || 90} days`);
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["audit-retention-info"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Archive & delete failed");
    } finally {
      setArchiveDeleteLoading(false);
    }
  }, [retentionInfo, queryClient]);

  // ─── Export PDF ─────────────────────────────────────
  const handleExportPdf = useCallback(() => {
    if (logs.length === 0) {
      toast.error("No logs to export");
      return;
    }
    toast.info("Preparing PDF export...");
    setTimeout(() => {
      const dateRangeStr = [startDate, endDate].filter(Boolean).join(" to ") || "All time";
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Audit Log Report</title>
<style>
@media print { body { margin: 0; } }
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:24px;color:#111}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;color:#666;margin:0 0 4px;font-weight:normal}
.meta{font-size:11px;color:#888;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:10px}
th{background:#f3f4f6;text-align:left;padding:6px 8px;font-weight:600;border-bottom:2px solid #e5e7eb;white-space:nowrap}
td{padding:5px 8px;border-bottom:1px solid #f3f4f6}
tr:nth-child(even){background:#fafafa}
.badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:600}
.badge-create{background:#dcfce7;color:#166534}.badge-update{background:#dbeafe;color:#1e40af}
.badge-delete{background:#fee2e2;color:#991b1b}.badge-login{background:#f3e8ff;color:#7e22ce}
.badge-default{background:#f3f4f6;color:#374151}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#888;display:flex;justify-content:space-between}
</style></head><body>
<h1>Audit Log Report</h1>
<h2>Generated: ${new Date().toLocaleString("en-IN")} — Date Range: ${escapeHtml(dateRangeStr)}</h2>
<p class="meta">ISP Management Platform — Showing page ${page} of ${totalPages} (${formatNumber(logs.length)} entries on this page, ${formatNumber(total)} total)</p>
<table><thead><tr>
<th>#</th><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>Summary</th><th>IP Address</th>
</tr></thead><tbody>
${logs.map((l, i) => `<tr>
<td>${i + 1}</td>
<td>${new Date(l.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</td>
<td>${escapeHtml(l.userName || l.user?.name || "System")}</td>
<td><span class="badge badge-${l.action.toLowerCase() || "default"}">${escapeHtml(l.action)}</span></td>
<td>${escapeHtml(l.entity)}</td>
<td>${escapeHtml(buildSummary(l))}</td>
<td>${escapeHtml(l.ipAddress || "-")}</td>
</tr>`).join("")}
</tbody></table>
<div class="footer">
<span>Total entries: ${formatNumber(total)}</span>
<span>Page ${page} of ${totalPages}</span>
</div>
</body></html>`;
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 200);
      } else {
        toast.error("Failed to open print window. Please allow popups.");
      }
    }, 300);
  }, [logs, total, totalPages, page, startDate, endDate]);

  // ─── Pagination ───────────────────────────────────────
  const pageRange: number[] = (() => {
    const range: number[] = [];
    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, page + 2);
    if (end - start < 4) {
      if (start === 1) end = Math.min(totalPages, start + 4);
      else start = Math.max(1, end - 4);
    }
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  })();

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  // ─── Stats calculations ───────────────────────────────
  const weekChange = (() => {
    if (!stats || !stats.prevWeekCount) return null;
    const change = stats.prevWeekCount > 0
      ? Math.round(((stats.weekCount - stats.prevWeekCount) / stats.prevWeekCount) * 100)
      : stats.weekCount > 0 ? 100 : 0;
    return change;
  })();

  const activeUsersCount = stats?.uniqueUserCount ?? stats?.topUsers?.length ?? 0;

  // ─── Active filter count ──────────────────────────────
  const activeFilterCount = [
    search,
    filterAction !== "all" ? filterAction : null,
    filterEntity !== "all" ? filterEntity : null,
    filterUser !== "all" ? filterUser : null,
    startDate,
    endDate,
    sort !== "newest" ? sort : null,
  ].filter(Boolean).length;

  const toggleSelectId = (id: string) => {
    if (compareMode) {
      setCompareIds((prev) => {
        if (prev.has(id)) {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }
        if (prev.size >= 2) {
          toast.info("Select exactly 2 entries to compare");
          return prev;
        }
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const toggleSelectAll = () => {
    if (compareMode) {
      if (compareIds.size >= 2) {
        setCompareIds(new Set());
      } else {
        const toSelect = logs.slice(0, 2 - compareIds.size);
        setCompareIds(new Set([...compareIds, ...toSelect.map((l) => l.id)]));
      }
    } else {
      if (selectedIds.size === logs.length) setSelectedIds(new Set());
      else setSelectedIds(new Set(logs.map((l) => l.id)));
    }
  };

  // ─── Compare entries ─────────────────────────────────
  const compareEntry1 = compareIds.size >= 1 ? logs.find((l) => l.id === Array.from(compareIds)[0]) : null;
  const compareEntry2 = compareIds.size >= 2 ? logs.find((l) => l.id === Array.from(compareIds)[1]) : null;
  const compareFields = (compareEntry1 && compareEntry2) ? compareEntryFields(compareEntry1, compareEntry2) : [];

  const openCompareDialog = () => {
    if (compareIds.size === 2) {
      setCompareDialogOpen(true);
    }
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setCompareIds(new Set());
  };

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Audit Log
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track all system activities and changes
            </p>
          </div>
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-950/50 rounded-full border border-green-200 dark:border-green-800">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider">
              Live
            </span>
          </div>
          {isFetching && !isLoading && (
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export Page</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportAll} disabled={exportAllLoading}>
            {exportAllLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Export All</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPdf}>
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export PDF</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSessionOpen(true)}>
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reconstruct Session</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleArchiveAndDelete} disabled={archiveDeleteLoading}>
            {archiveDeleteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Archive & Delete</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRetentionOpen(true)}>
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Retention</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={() => setPurgeOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Purge Old Logs</span>
          </Button>
        </div>
      </div>

      {/* ── Stats Dashboard Cards ───────────────────────── */}
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="logs"><ClipboardList className="h-3.5 w-3.5 mr-1" />Activity Log</TabsTrigger>
          <TabsTrigger value="anomalies"><AlertTriangle className="h-3.5 w-3.5 mr-1" />Anomalies</TabsTrigger>
          <TabsTrigger value="compliance"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="logs">
      {/* ── Retention Policy Card ── */}
      {retentionInfo && (
        <Card className="border shadow-sm bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Retention Policy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="flex items-center gap-2.5 rounded-lg border border-transparent hover:border-border hover:bg-background/60 px-2 py-1.5 transition-colors">
                <span className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-900/60 flex items-center justify-center flex-shrink-0">
                  <Database className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground leading-tight">Total Logs</p>
                  <p className="text-sm font-bold leading-tight">{formatNumber(retentionInfo.totalCount)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-transparent hover:border-border hover:bg-background/60 px-2 py-1.5 transition-colors">
                <span className="h-8 w-8 rounded-lg bg-cyan-100 dark:bg-cyan-950/50 flex items-center justify-center flex-shrink-0">
                  <HardDrive className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground leading-tight">Est. Storage</p>
                  <p className="text-sm font-bold leading-tight">{retentionInfo.estimatedStorageMB} MB</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-transparent hover:border-border hover:bg-background/60 px-2 py-1.5 transition-colors">
                <span className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground leading-tight">Expiring Soon</p>
                  <p className={`text-sm font-bold leading-tight ${retentionInfo.oldCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{formatNumber(retentionInfo.oldCount)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-transparent hover:border-border hover:bg-background/60 px-2 py-1.5 transition-colors">
                <span className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center flex-shrink-0">
                  <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground leading-tight">Retention</p>
                  <p className="text-sm font-bold leading-tight">{retentionInfo.retentionDays} days</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                {retentionInfo.automation?.enabled ? (
                  <>
                    <span className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      Automated · {retentionInfo.automation.jobId}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Archive {retentionInfo.automation.archiveDays}d · Purge {retentionInfo.automation.purgeDays}d · Sessions {retentionInfo.automation.sessionDays}d · Notifications {retentionInfo.automation.notificationDays}d
                    </span>
                    {retentionInfo.automation.lastSweepAt && (
                      <span className="text-[10px] text-muted-foreground/70">
                        Last sweep {formatShortTimestamp(retentionInfo.automation.lastSweepAt)}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">Auto-Delete</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${retentionInfo.autoDelete ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {retentionInfo.autoDelete ? "Enabled" : "Disabled"}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* [NEW-FEATURE] Manual trigger for job-009 through the gateway */}
                {(retentionInfo.automation?.lastSweepResult || sweepRunning) && (
                  <span className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground/80" aria-live="polite">
                    {sweepRunning ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">Sweep running…</span>
                      </>
                    ) : (
                      (() => {
                        const r = retentionInfo.automation?.lastSweepResult;
                        const parts = [
                          r?.archivedAuditLogs != null ? `${r.archivedAuditLogs} archived` : null,
                          r?.purgedAuditLogs != null ? `${r.purgedAuditLogs} purged` : null,
                          r?.purgedSessions != null ? `${r.purgedSessions} sessions` : null,
                        ].filter(Boolean);
                        return parts.length > 0 ? <span title="Result of last sweep">{parts.join(" · ")}</span> : null;
                      })()
                    )}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-7 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40 ${sweepRunning ? "opacity-80" : ""}`}
                  onClick={() => runSweepMutation.mutate()}
                  disabled={runSweepMutation.isPending || sweepRunning}
                  aria-label="Run retention sweep now"
                >
                  {runSweepMutation.isPending || sweepRunning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {sweepRunning ? "Sweeping…" : "Run Sweep Now"}
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setRetentionOpen(true)}>
                  <Settings className="h-3 w-3" /> Configure
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="space-y-2">
                  <Skeleton className="skeleton-wave h-3 w-24" />
                  <Skeleton className="skeleton-wave h-8 w-20" />
                  <Skeleton className="skeleton-wave h-3 w-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Logs"
            value={formatNumber(stats?.totalCount ?? total)}
            subtitle={`${formatNumber(stats?.todayCount ?? 0)} today`}
            icon={<ClipboardList className="h-5 w-5 text-red-600" />}
            iconBg="bg-red-100 dark:bg-red-950/60"
          />
          <StatCard
            title="This Week"
            value={formatNumber(stats?.weekCount ?? 0)}
            icon={<CalendarDays className="h-5 w-5 text-teal-600" />}
            iconBg="bg-teal-100 dark:bg-teal-950/60"
            trend={
              weekChange !== null
                ? { value: weekChange, label: "vs last week" }
                : undefined
            }
          />
          <StatCard
            title="This Month"
            value={formatNumber(stats?.monthCount ?? 0)}
            icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
            iconBg="bg-emerald-100 dark:bg-emerald-950/60"
          />
          <StatCard
            title="Active Users"
            value={formatNumber(activeUsersCount)}
            subtitle="performed actions this month"
            icon={<Users className="h-5 w-5 text-violet-600" />}
            iconBg="bg-violet-100 dark:bg-violet-950/60"
          />
        </div>
      )}

      {/* ── Activity Chart ──────────────────────────────── */}
      {isLoading ? (
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <Skeleton className="skeleton-wave h-3 w-32 mb-4" />
            <div className="flex items-end gap-3 h-32">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 space-y-2">
                  <Skeleton className="skeleton-wave h-2 w-8 mx-auto" />
                  <Skeleton
                    className="w-full rounded-t-md"
                    style={{ height: `${20 + Math.random() * 60}px` }}
                  />
                  <Skeleton className="skeleton-wave h-2 w-6 mx-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <ActivityChart stats={stats} />
      )}

      {/* ── Filters + Table Card ────────────────────────── */}
      <Card className="border shadow-sm">
        {/* ── Collapsible Filter Panel ──────────────────── */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-red-600" />
                Activity Log
                {total > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({formatNumber(total)} entries)
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Compare Mode Toggle */}
                <Button
                  variant={compareMode ? "default" : "outline"}
                  size="sm"
                  className={`h-8 text-xs gap-1.5 ${compareMode ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}
                  onClick={() => {
                    if (compareMode) {
                      exitCompareMode();
                    } else {
                      setCompareMode(true);
                      setSelectedIds(new Set());
                      toast.info("Compare mode: select 2 entries to compare");
                    }
                  }}
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  Compare
                </Button>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs">
                    <Filter className="h-3.5 w-3.5" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge
                        variant="default"
                        className="h-5 w-5 p-0 text-[10px] rounded-full bg-red-600"
                      >
                        {activeFilterCount}
                      </Badge>
                    )}
                    {filtersOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
          </div>

          <CollapsibleContent>
            <div className="px-4 sm:px-6 pt-3 pb-4">
              <Separator className="mb-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search logs..."
                    value={search}
                    onChange={(e) => handleFilterChange(setSearch)(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>

                {/* Lifecycle filter [NEW-FEATURE]: active / archived / all */}
                <div
                  role="group"
                  aria-label="Archived state filter"
                  className="flex items-center h-9 rounded-lg border bg-muted/30 p-0.5 w-fit"
                >
                  {([
                    { key: "active", label: "Active", count: retentionInfo?.activeCount },
                    { key: "archived", label: "Archived", count: retentionInfo?.archivedCount },
                    { key: "all", label: "All", count: undefined as number | undefined },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={archivedFilter === opt.key}
                      onClick={() => { setArchivedFilter(opt.key); setPage(1); }}
                      className={`h-8 px-3 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                        archivedFilter === opt.key
                          ? opt.key === "archived"
                            ? "bg-amber-100 text-amber-800 shadow-sm dark:bg-amber-950/50 dark:text-amber-300"
                            : "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Archive className="h-3 w-3 opacity-70" />
                      {opt.label}
                      {opt.count !== undefined && (
                        <span className={`text-[10px] tabular-nums font-bold ${archivedFilter === opt.key ? "opacity-80" : "opacity-50"}`}>
                          {formatNumber(opt.count)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Action Filter */}
                <Select
                  value={filterAction}
                  onValueChange={handleFilterChange(setFilterAction)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    {ACTION_OPTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Entity Filter */}
                <Select
                  value={filterEntity}
                  onValueChange={handleFilterChange(setFilterEntity)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Entity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Entities</SelectItem>
                    {ENTITY_OPTIONS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* User Filter */}
                <Select
                  value={filterUser}
                  onValueChange={handleFilterChange(setFilterUser)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <Users className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="User" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {stats?.topUsers?.map((u) => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.userName} ({formatNumber(u.count)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Start Date */}
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                    From
                  </label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleFilterChange(setStartDate)(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                    To
                  </label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleFilterChange(setEndDate)(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                {/* Sort */}
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                    Sort
                  </label>
                  <Select value={sort} onValueChange={handleFilterChange(setSort)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Clear Filters */}
                <div className="flex items-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-full gap-1.5 text-muted-foreground"
                    onClick={clearFilters}
                    disabled={activeFilterCount === 0}
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear Filters
                  </Button>
                  <Button
                    variant={showFlaggedOnly ? "destructive" : "outline"}
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={() => { setShowFlaggedOnly(!showFlaggedOnly); setPage(1); }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {showFlaggedOnly ? "Show All" : "Flagged"}
                  </Button>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* ── Bulk Actions Bar ── */}
        {!compareMode && selectedIds.size > 0 && (
          <div className="px-4 sm:px-6 py-2 bg-muted/50 flex items-center justify-between border-b">
            <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
            <div className="flex gap-2">
              {/* [NEW-FEATURE] Restore rows out of the archive (visible when the
                  Archived filter is active — those rows are the restore targets) */}
              {archivedFilter === "only" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-950/40"
                  onClick={() => lifecycleMutation.mutate({ action: "restore", ids: Array.from(selectedIds) })}
                  disabled={lifecycleMutation.isPending}
                >
                  {lifecycleMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3 w-3" />}
                  Restore Selected
                </Button>
              )}
              <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="h-3 w-3" /> Delete Selected
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* ── Compare Actions Bar ── */}
        {compareMode && compareIds.size > 0 && (
          <div className="px-4 sm:px-6 py-2 bg-red-50 dark:bg-red-950/20 flex items-center justify-between border-b border-red-200 dark:border-red-800">
            <span className="text-sm text-red-700 dark:text-red-400 font-medium">
              {compareIds.size} of 2 selected for comparison
            </span>
            <div className="flex gap-2">
              {compareIds.size === 2 && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={openCompareDialog}
                >
                  <GitCompare className="h-3 w-3" /> Compare Entries
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setCompareIds(new Set())}>
                Clear Selection
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={exitCompareMode}>
                Exit Compare
              </Button>
            </div>
          </div>
        )}

        {/* ── Log Table ──────────────────────────────────── */}
        <div className="max-h-[600px] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="rounded-full bg-muted p-4 mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                No logs found
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                {search || activeFilterCount > 0
                  ? "No audit logs match your current filters. Try adjusting your search criteria."
                  : "No audit log entries exist yet. System activities will be recorded here."}
              </p>
              {activeFilterCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={clearFilters}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold w-10">
                    <Checkbox
                      checked={compareMode
                        ? compareIds.size === 2
                        : logs.length > 0 && selectedIds.size === logs.length
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold w-[160px]">Timestamp</TableHead>
                  <TableHead className="text-xs font-semibold w-[150px]">User</TableHead>
                  <TableHead className="text-xs font-semibold w-[100px]">Action</TableHead>
                  <TableHead className="text-xs font-semibold w-[100px]">Entity</TableHead>
                  <TableHead className="text-xs font-semibold">Summary</TableHead>
                  <TableHead className="text-xs font-semibold w-[140px] hidden lg:table-cell">Endpoint</TableHead>
                  <TableHead className="text-xs font-semibold w-[120px] hidden xl:table-cell">IP Address</TableHead>
                  <TableHead className="text-xs font-semibold w-[60px] text-center">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const isFlagged = flaggedUserIds.length > 0 && log.userId && flaggedUserIds.includes(log.userId);
                  if (showFlaggedOnly && !isFlagged) return null;
                  const isChecked = compareMode
                    ? compareIds.has(log.id)
                    : selectedIds.has(log.id);
                  const rowHighlight = compareMode
                    ? compareIds.has(log.id)
                    : selectedIds.has(log.id);
                  return (
                  <TableRow
                    key={log.id}
                    className={`group hover:bg-muted/30 cursor-default transition-colors ${rowHighlight ? (compareMode ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/50") : ""} ${isFlagged ? "bg-red-50/50 dark:bg-red-950/10" : ""} ${log.isArchived && !rowHighlight && !isFlagged ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
                  >
                    <TableCell className="w-10">
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleSelectId(log.id)} />
                    </TableCell>
                    {/* Timestamp */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-2.5">
                      <div className="flex items-center gap-1.5">
                        {isFlagged && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                        <Clock className="h-3 w-3 text-muted-foreground/60" />
                        {formatShortTimestamp(log.timestamp)}
                      </div>
                    </TableCell>

                    {/* User */}
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${isFlagged ? "bg-red-100 dark:bg-red-950/60" : "bg-red-100 dark:bg-red-950/60"}`}>
                          <span className={`text-[10px] font-bold ${isFlagged ? "text-red-600" : "text-red-700 dark:text-red-300"}`}>
                            {(log.userName || log.user?.name || "S")[0]?.toUpperCase() || "?"}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">
                            {log.userName || log.user?.name || "System"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {log.user?.email || ""}
                          </p>
                        </div>
                        {isFlagged && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>Flagged: {">"}50 actions in 1 hour</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-1">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold px-1.5 py-0 ${
                            ACTION_STYLES[log.action] ||
                            "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {log.action}
                        </Badge>
                        {log.isArchived && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50 whitespace-nowrap">
                                Archived
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Past the {retentionInfo?.retentionDays ?? 90}-day retention window — managed by job-009
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>

                    {/* Entity */}
                    <TableCell className="text-xs font-medium py-2.5">
                      {log.entity}
                    </TableCell>

                    {/* Summary */}
                    <TableCell className="py-2.5">
                      <p className="text-xs text-foreground/80 truncate max-w-[300px]">
                        {buildSummary(log)}
                      </p>
                    </TableCell>

                    {/* Endpoint (hidden on smaller screens) */}
                    <TableCell className="py-2.5 hidden lg:table-cell">
                      {log.endpoint && (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold ${
                              METHOD_COLORS[log.method] || "text-gray-600"
                            }`}
                          >
                            {log.method}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground truncate">
                            {log.endpoint}
                          </span>
                        </div>
                      )}
                    </TableCell>

                    {/* IP Address (hidden on smaller screens) */}
                    <TableCell className="py-2.5 hidden xl:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3 w-3 text-muted-foreground/60" />
                        <span className="text-xs font-mono text-muted-foreground">
                          {log.ipAddress || "-"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Details Button */}
                    <TableCell className="text-center py-2.5">
                      <div className="flex items-center justify-center gap-0.5">
                        {/* [NEW-FEATURE] One-click restore for archived rows */}
                        {log.isArchived && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40"
                                onClick={() => lifecycleMutation.mutate({ action: "restore", ids: [log.id] })}
                                disabled={lifecycleMutation.isPending}
                              >
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Restore from archive</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setDetailLog(log);
                                setUaExpanded(false);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View Details</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* ── Pagination ─────────────────────────────────── */}
        {total > 0 && (
          <>
            <Separator />
            <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Left: showing info + page size */}
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{formatNumber(showingFrom)}</span>–
                  <span className="font-medium text-foreground">{formatNumber(showingTo)}</span> of{" "}
                  <span className="font-medium text-foreground">{formatNumber(total)}</span> logs
                </p>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => {
                    setPageSize(Number(val));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-7 w-[70px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s} / pg
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Right: pagination controls */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>

                {/* First page */}
                {pageRange[0] > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setPage(1)}
                    >
                      1
                    </Button>
                    {pageRange[0] > 2 && (
                      <span className="text-xs text-muted-foreground px-1">…</span>
                    )}
                  </>
                )}

                {/* Page numbers */}
                {pageRange.map((p) => (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className={`h-7 w-7 p-0 text-xs ${
                      p === page
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : ""
                    }`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}

                {/* Last page */}
                {pageRange[pageRange.length - 1] < totalPages && (
                  <>
                    {pageRange[pageRange.length - 1] < totalPages - 1 && (
                      <span className="text-xs text-muted-foreground px-1">…</span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setPage(totalPages)}
                    >
                      {totalPages}
                    </Button>
                  </>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ── Detail Dialog ───────────────────────────────── */}
      <Dialog open={!!detailLog} onOpenChange={() => setDetailLog(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 flex-wrap">
              {detailLog && (
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold ${
                    ACTION_STYLES[detailLog.action] || ""
                  }`}
                >
                  {detailLog.action}
                </Badge>
              )}
              {detailLog?.entity && (
                <span className="text-sm font-medium">{detailLog.entity}</span>
              )}
              {detailLog?.entityId && (
                <span className="text-xs text-muted-foreground font-mono">
                  {detailLog.entityId.slice(0, 12)}…
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailLog && (
            <Tabs defaultValue="overview" className="mt-0">
              <TabsList className="w-full">
                <TabsTrigger value="overview" className="flex-1 text-xs gap-1">
                  <Eye className="h-3 w-3" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="changes" className="flex-1 text-xs gap-1">
                  <ArrowUpDown className="h-3 w-3" />
                  Changes
                </TabsTrigger>
                <TabsTrigger value="json" className="flex-1 text-xs gap-1">
                  <FileText className="h-3 w-3" />
                  Raw JSON
                </TabsTrigger>
                <TabsTrigger value="timeline" className="flex-1 text-xs gap-1">
                  <Clock className="h-3 w-3" />
                  Timeline
                </TabsTrigger>
              </TabsList>

              {/* ── Overview Tab ──────────────────────────── */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                {/* User Info */}
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    User Information
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950/60 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-red-700 dark:text-red-300">
                        {(detailLog.user?.name || "S")[0]?.toUpperCase() || "?"}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {detailLog.userName || detailLog.user?.name || "System"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {detailLog.user?.email || "No email"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Timestamp
                    </p>
                    <p className="text-sm mt-1">{formatTimestamp(detailLog.timestamp)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      IP Address
                    </p>
                    <p className="text-sm font-mono mt-1">{detailLog.ipAddress || "-"}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Request
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          METHOD_COLORS[detailLog.method] || "text-gray-600"
                        } bg-muted`}
                      >
                        {detailLog.method}
                      </span>
                      <span className="text-xs font-mono truncate">
                        {detailLog.endpoint || "-"}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Entity
                    </p>
                    <p className="text-sm mt-1">
                      {detailLog.entity}
                      {detailLog.entityId && (
                        <span className="text-xs text-muted-foreground font-mono ml-2">
                          {detailLog.entityId}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* User Agent */}
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      User Agent
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Monitor className="h-3 w-3 text-muted-foreground" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[10px] p-0"
                        onClick={() => setUaExpanded(!uaExpanded)}
                      >
                        {uaExpanded ? "Collapse" : "Expand"}
                      </Button>
                    </div>
                  </div>
                  <p
                    className={`text-xs font-mono text-muted-foreground break-all ${
                      !uaExpanded ? "line-clamp-2" : ""
                    }`}
                  >
                    {detailLog.userAgent || "-"}
                  </p>
                </div>

                {/* Summary */}
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
                  <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">
                    Summary
                  </p>
                  <p className="text-sm font-medium">{buildSummary(detailLog)}</p>
                </div>
              </TabsContent>

              {/* ── Changes Tab ───────────────────────────── */}
              <TabsContent value="changes" className="mt-4">
                {(() => {
                  const changed = getChangedFields(detailLog);
                  if (!changed) {
                    return (
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground">
                          {detailLog.action === "CREATE" || detailLog.action === "BULK_CREATE"
                            ? "This is a new record — no previous values to compare."
                            : detailLog.previousValues
                            ? "No detectable field changes."
                            : "No change tracking data available for this entry."}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="text-xs font-semibold">Field</TableHead>
                            <TableHead className="text-xs font-semibold text-red-600">
                              Old Value
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-green-600">
                              New Value
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {changed.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-medium py-2">
                                {c.field}
                              </TableCell>
                              <TableCell className="py-2">
                                <span className="inline-block text-xs font-mono bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded line-through">
                                  {c.oldValue}
                                </span>
                              </TableCell>
                              <TableCell className="py-2">
                                <span className="inline-block text-xs font-mono bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                                  {c.newValue}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()}
              </TabsContent>

              {/* ── Raw JSON Tab ──────────────────────────── */}
              <TabsContent value="json" className="mt-4 space-y-4">
                {/* Details JSON */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Details
                  </p>
                  <div className="rounded-lg border bg-muted/30 p-3 max-h-64 overflow-y-auto">
                    <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(detailLog.details), null, 2);
                        } catch {
                          return detailLog.details;
                        }
                      })()}
                    </pre>
                  </div>
                </div>

                {/* Previous Values JSON */}
                {detailLog.previousValues && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Previous Values
                    </p>
                    <div className="rounded-lg border bg-muted/30 p-3 max-h-64 overflow-y-auto">
                      <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(detailLog.previousValues!), null, 2);
                          } catch {
                            return detailLog.previousValues;
                          }
                        })()}
                      </pre>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── Timeline Tab ──────────────────────────── */}
              <TabsContent value="timeline" className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Entity: {detailLog.entity} ({detailLog.entityId})</p>
                {!timelineLogs || timelineLogs.logs.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No timeline entries found for this entity.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0 relative">
                    <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />
                    {timelineLogs.logs.map((tLog) => {
                      const isCurrent = tLog.id === detailLog.id;
                      return (
                        <div key={tLog.id} className="flex gap-3 py-2">
                          <div className="relative z-10 flex-shrink-0 mt-0.5">
                            <div
                              className={`h-[10px] w-[10px] rounded-full border-2 ${
                                isCurrent
                                  ? "bg-red-600 border-red-600 ring-4 ring-red-100 dark:ring-red-950"
                                  : "bg-background border-muted-foreground/30"
                              }`}
                            />
                          </div>
                          <div
                            className={`flex-1 min-w-0 rounded-lg border p-2.5 ${
                              isCurrent
                                ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                                : "bg-muted/20"
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">
                                {formatShortTimestamp(tLog.timestamp)}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1 py-0 ${
                                  ACTION_STYLES[tLog.action] || ""
                                }`}
                              >
                                {tLog.action}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {tLog.userName || tLog.user?.name || "System"}
                              </span>
                            </div>
                            <p className="text-xs mt-1 text-foreground/80">
                              {buildSummary(tLog)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ── User Timeline Tab ───────────────────── */}
              {detailLog?.userId && detailLog.userId !== "" && (
                <TabsContent value="user-timeline" className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">User: {detailLog.userName || detailLog.user?.name} ({detailLog.userId})</p>
                  {!userTimelineLogs || userTimelineLogs.logs.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No timeline entries found for this user.</p>
                    </div>
                  ) : (
                    <div className="space-y-0 relative">
                      <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />
                      {userTimelineLogs.logs.map((tLog) => {
                        const isCurrent = tLog.id === detailLog.id;
                        return (
                          <div key={tLog.id} className="flex gap-3 py-2">
                            <div className="relative z-10 flex-shrink-0 mt-0.5">
                              <div className={`h-[10px] w-[10px] rounded-full border-2 ${isCurrent ? "bg-red-600 border-red-600 ring-4 ring-red-100 dark:ring-red-950" : "bg-background border-muted-foreground/30"}`} />
                            </div>
                            <div className={`flex-1 min-w-0 rounded-lg border p-2.5 ${isCurrent ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" : "bg-muted/20"}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-muted-foreground">{formatShortTimestamp(tLog.timestamp)}</span>
                                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${ACTION_STYLES[tLog.action] || ""}`}>{tLog.action}</Badge>
                                <Badge variant="outline" className="text-[9px] px-1 py-0">{tLog.entity}</Badge>
                              </div>
                              <p className="text-xs mt-1 text-foreground/80">{buildSummary(tLog)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              )}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Purge Old Logs Dialog ───────────────────────── */}
      <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Purge Old Logs
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-left">
                <p>
                  This will permanently delete all audit logs before the specified date. This action
                  cannot be undone.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-foreground">
                      Delete logs before date
                    </label>
                    <Input
                      type="date"
                      value={purgeDate}
                      onChange={(e) => setPurgeDate(e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground">
                      Entity (optional)
                    </label>
                    <Select value={purgeEntity} onValueChange={setPurgeEntity}>
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue placeholder="All entities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Entities</SelectItem>
                        {ENTITY_OPTIONS.map((e) => (
                          <SelectItem key={e} value={e}>
                            {e}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => purgeMutation.mutate()}
              disabled={!purgeDate || purgeMutation.isPending}
            >
              {purgeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Purge Logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        </TabsContent>

        {/* ── Anomalies Tab ── */}
        <TabsContent value="anomalies">
          <div className="space-y-4">
            {anomalies.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No anomalies detected</p>
              </div>
            ) : (
              anomalies.map((a, i) => (
                <div key={i} className={`p-4 rounded-lg border ${a.severity === "high" ? "border-red-200 bg-red-50 dark:bg-red-950/20" : a.severity === "medium" ? "border-amber-200 bg-amber-50 dark:bg-amber-950/20" : "border-teal-200 bg-teal-50 dark:bg-teal-950/20"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{a.description}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{a.count} occurrences</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{a.type}</p>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* ── Compliance Tab ── */}
        <TabsContent value="compliance">
          <div className="space-y-6">
            {/* Date range picker + generate button */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-red-600" />
                  Compliance Report
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-end gap-3">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Start Date</Label>
                    <Input
                      type="date"
                      value={complianceStart}
                      onChange={(e) => setComplianceStart(e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">End Date</Label>
                    <Input
                      type="date"
                      value={complianceEnd}
                      onChange={(e) => setComplianceEnd(e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                    disabled={complianceMutation.isPending}
                    onClick={() => complianceMutation.mutate({ startDate: complianceStart, endDate: complianceEnd })}
                  >
                    {complianceMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    Generate Report
                  </Button>
                </div>
              </CardContent>
            </Card>

            {complianceMutation.isPending && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="border shadow-sm">
                    <CardContent className="p-4">
                      <Skeleton className="skeleton-wave h-3 w-20 mb-2" />
                      <Skeleton className="skeleton-wave h-8 w-16" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {complianceReport && !complianceMutation.isPending && (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  <StatCard
                    title="Total Actions"
                    value={formatNumber(complianceReport.totalActions)}
                    icon={<ClipboardList className="h-5 w-5 text-red-600" />}
                    iconBg="bg-red-100 dark:bg-red-950/60"
                  />
                  <StatCard
                    title="CREATE Actions"
                    value={formatNumber(complianceReport.actionCounts.find((a) => a.action === "CREATE")?.count ?? 0)}
                    icon={<Activity className="h-5 w-5 text-green-600" />}
                    iconBg="bg-green-100 dark:bg-green-950/60"
                  />
                  <StatCard
                    title="UPDATE Actions"
                    value={formatNumber(complianceReport.actionCounts.find((a) => a.action === "UPDATE")?.count ?? 0)}
                    icon={<RefreshCw className="h-5 w-5 text-teal-600" />}
                    iconBg="bg-teal-100 dark:bg-teal-950/60"
                  />
                  <StatCard
                    title="DELETE Actions"
                    value={formatNumber(complianceReport.actionCounts.find((a) => a.action === "DELETE")?.count ?? 0)}
                    icon={<Trash2 className="h-5 w-5 text-red-600" />}
                    iconBg="bg-red-100 dark:bg-red-950/60"
                  />
                  <StatCard
                    title="After-Hours"
                    value={formatNumber(complianceReport.afterHoursCount)}
                    subtitle="Outside 9 AM–6 PM"
                    icon={<Clock className="h-5 w-5 text-amber-600" />}
                    iconBg="bg-amber-100 dark:bg-amber-950/60"
                  />
                  <StatCard
                    title="Data Exports"
                    value={formatNumber(complianceReport.exportCount)}
                    subtitle="EXPORT actions"
                    icon={<Download className="h-5 w-5 text-cyan-600" />}
                    iconBg="bg-cyan-100 dark:bg-cyan-950/60"
                  />
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Actions by Type */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Actions by Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={complianceReport.actionCounts} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis
                              dataKey="action"
                              tick={{ fontSize: 10 }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis tick={{ fontSize: 10 }} />
                            <RechartsTooltip
                              contentStyle={{ fontSize: 12 }}
                              formatter={(value: number) => [formatNumber(value), "Count"]}
                            />
                            <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]}>
                              {complianceReport.actionCounts.map((_entry, index) => (
                                <rect key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Most Active Users */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Most Active Users (Top 10)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={complianceReport.topUsers} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis type="number" tick={{ fontSize: 10 }} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              tick={{ fontSize: 10 }}
                              width={100}
                            />
                            <RechartsTooltip
                              contentStyle={{ fontSize: 12 }}
                              formatter={(value: number) => [formatNumber(value), "Actions"]}
                            />
                            <Bar dataKey="count" fill="#ea580c" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Actions by Entity */}
                  <Card className="border shadow-sm lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Actions by Entity Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={complianceReport.entityCounts} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis
                              dataKey="entity"
                              tick={{ fontSize: 10 }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis tick={{ fontSize: 10 }} />
                            <RechartsTooltip
                              contentStyle={{ fontSize: 12 }}
                              formatter={(value: number) => [formatNumber(value), "Count"]}
                            />
                            <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Retention Config Dialog ───────────────────── */}
      <Dialog open={retentionOpen} onOpenChange={setRetentionOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4" />Configure Retention</DialogTitle>
            <DialogDescription>
              Set the retention window before log entries are automatically archived and purged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Retention Period (days)</Label>
              <Input type="number" value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} min={1} max={3650} className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">Logs older than this will be eligible for deletion. Default: 90 days.</p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <Label className="text-sm font-medium">Auto-Delete</Label>
                <p className="text-[10px] text-muted-foreground">Automatically purge expired logs</p>
              </div>
              <Switch checked={autoDelete} onCheckedChange={setAutoDelete} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRetentionOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={retentionMutation.isPending} onClick={() => {
                retentionMutation.mutate({ days: Number(retentionDays), autoDelete });
              }}>
                {retentionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Delete Confirmation ───────────────────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Selected Logs</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to permanently delete {selectedIds.size} selected log entries?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))} disabled={bulkDeleteMutation.isPending}>
              {bulkDeleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}Delete {selectedIds.size} Logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Compare Entries Dialog ──────────────────────── */}
      <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <GitCompare className="h-4 w-4" />
              Compare Log Entries
            </DialogTitle>
            <DialogDescription>
              Side-by-side comparison of two audit log entries
            </DialogDescription>
          </DialogHeader>

          {compareEntry1 && compareEntry2 && (
            <div className="space-y-4">
              {/* Metadata comparison */}
              <div className="grid grid-cols-2 gap-4">
                {/* Entry 1 */}
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Entry 1</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Action</span>
                      <Badge variant="outline" className={`text-[10px] ${ACTION_STYLES[compareEntry1.action] || ""}`}>{compareEntry1.action}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Entity</span>
                      <span className="text-xs font-medium">{compareEntry1.entity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">User</span>
                      <span className="text-xs font-medium">{compareEntry1.userName || compareEntry1.user?.name || "System"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Timestamp</span>
                      <span className="text-xs font-mono">{formatShortTimestamp(compareEntry1.timestamp)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">IP</span>
                      <span className="text-xs font-mono">{compareEntry1.ipAddress || "-"}</span>
                    </div>
                  </div>
                </div>

                {/* Entry 2 */}
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Entry 2</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Action</span>
                      <Badge variant="outline" className={`text-[10px] ${ACTION_STYLES[compareEntry2.action] || ""}`}>{compareEntry2.action}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Entity</span>
                      <span className="text-xs font-medium">{compareEntry2.entity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">User</span>
                      <span className="text-xs font-medium">{compareEntry2.userName || compareEntry2.user?.name || "System"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Timestamp</span>
                      <span className="text-xs font-mono">{formatShortTimestamp(compareEntry2.timestamp)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">IP</span>
                      <span className="text-xs font-mono">{compareEntry2.ipAddress || "-"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Field differences */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Field Comparison (Details & Previous Values)
                </p>
                {compareFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No fields to compare — both entries have no detail data.
                  </p>
                ) : (
                  <div className="rounded-lg border overflow-hidden max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="text-xs font-semibold">Field</TableHead>
                          <TableHead className="text-xs font-semibold">Entry 1</TableHead>
                          <TableHead className="text-xs font-semibold">Entry 2</TableHead>
                          <TableHead className="text-xs font-semibold w-[80px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {compareFields.map((f, i) => (
                          <TableRow key={i} className={
                            f.status === "added" ? "bg-green-50/50 dark:bg-green-950/10"
                            : f.status === "removed" ? "bg-red-50/50 dark:bg-red-950/10"
                            : f.status === "changed" ? "bg-amber-50/50 dark:bg-amber-950/10"
                            : ""
                          }>
                            <TableCell className="text-xs font-medium py-2 font-mono">
                              {f.key}
                            </TableCell>
                            <TableCell className="py-2">
                              {f.status === "removed" ? (
                                <span className="text-xs font-mono bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded line-through">
                                  {f.value1}
                                </span>
                              ) : f.status === "unchanged" ? (
                                <span className="text-xs font-mono text-muted-foreground">
                                  {f.value1}
                                </span>
                              ) : f.status === "changed" ? (
                                <span className="text-xs font-mono bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded line-through">
                                  {f.value1}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2">
                              {f.status === "added" ? (
                                <span className="text-xs font-mono bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                                  {f.value2}
                                </span>
                              ) : f.status === "unchanged" ? (
                                <span className="text-xs font-mono text-muted-foreground">
                                  {f.value2}
                                </span>
                              ) : f.status === "changed" ? (
                                <span className="text-xs font-mono bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                                  {f.value2}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2">
                              {f.status === "unchanged" && (
                                <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500">Same</Badge>
                              )}
                              {f.status === "added" && (
                                <Badge variant="secondary" className="text-[9px] bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">Added</Badge>
                              )}
                              {f.status === "removed" && (
                                <Badge variant="secondary" className="text-[9px] bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">Removed</Badge>
                              )}
                              {f.status === "changed" && (
                                <Badge variant="secondary" className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Changed</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-sm bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-800" />
                  New / Added
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-sm bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800" />
                  Removed
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-sm bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800" />
                  Changed
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600" />
                  Unchanged
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Session Reconstruction Dialog ────────────────── */}
      <Dialog open={sessionOpen} onOpenChange={(open) => { setSessionOpen(open); if (!open) { setSessionUserId(""); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Reconstruct Session
            </DialogTitle>
            <DialogDescription>
              View a chronological timeline of a user&apos;s actions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* User Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <Label className="text-xs text-muted-foreground">User</Label>
                <Select value={sessionUserId} onValueChange={setSessionUserId}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {stats?.topUsers?.map((u) => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.userName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Start Date</Label>
                <Input
                  type="date"
                  value={sessionStartDate}
                  onChange={(e) => setSessionStartDate(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">End Date</Label>
                <Input
                  type="date"
                  value={sessionEndDate}
                  onChange={(e) => setSessionEndDate(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
            </div>

            {/* Session Timeline */}
            {!sessionUserId ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select a user to reconstruct their session</p>
              </div>
            ) : sessionLoading ? (
              <div className="space-y-2 py-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : sessionLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No actions found for this user in the selected time range</p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(sessionLogs.length)} actions found
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    Chronological Order
                  </Badge>
                </div>
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-0 relative pr-4">
                    {/* Vertical line */}
                    <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />
                    {sessionLogs.map((sLog) => (
                      <div key={sLog.id} className="flex gap-3 py-2">
                        {/* Dot */}
                        <div className="relative z-10 flex-shrink-0 mt-1">
                          <div
                            className={`h-[10px] w-[10px] rounded-full border-2 ${
                              ACTION_STYLES[sLog.action]?.includes("green")
                                ? "bg-green-600 border-green-600"
                                : ACTION_STYLES[sLog.action]?.includes("red")
                                ? "bg-red-600 border-red-600"
                                : ACTION_STYLES[sLog.action]?.includes("amber")
                                ? "bg-amber-600 border-amber-600"
                                : "bg-muted-foreground/30 border-muted-foreground/30"
                            }`}
                          />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 rounded-lg border p-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatTimestamp(sLog.timestamp)}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1 py-0 ${
                                ACTION_STYLES[sLog.action] || ""
                              }`}
                            >
                              {sLog.action}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              {sLog.entity}
                            </Badge>
                          </div>
                          <p className="text-xs mt-1.5 text-foreground/80 font-medium">
                            {buildSummary(sLog)}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            IP: {sLog.ipAddress || "—"} · {sLog.method} {sLog.endpoint || ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
