"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, Eye, Calendar, Clock,
  CheckCircle, XCircle, Wrench, ChevronRight, RefreshCw,
  Pencil, Package, Timer, AlertTriangle, Star, ChevronLeft,
  LayoutGrid, List, FileBarChart, Users, CalendarDays, Loader2, Copy, GanttChart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
import { apiFetch } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────
interface Installation {
  id: string;
  subscriberId: string;
  subscriber: { id: string; name: string; phone: string; code: string; address: string } | null;
  technicianId: string;
  technician: { id: string; name: string; phone: string; status: string } | null;
  areaId: string | null;
  area: { id: string; name: string; code: string } | null;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  checklist: string;
  notes: string;
  completedAt: string | null;
  estimatedDurationHours: number;
  equipmentIds: string;
  cancellationReason: string;
  createdAt: string;
}

interface InstallationDetail extends Installation {
  subscriber: { id: string; name: string; phone: string; email: string; code: string; address: string; plan: { name: string } | null } | null;
  technician: { id: string; name: string; phone: string; email: string; status: string; skills: string } | null;
}

interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  condition: string;
  status: string;
  stockLocation: string;
  purchasePrice: number;
}

interface ConflictInfo {
  hasConflict: boolean;
  conflicts: { id: string; scheduledTime: string; subscriber: { name: string; code: string } | null; area: { name: string } | null }[];
  onLeave: boolean;
  technicianName: string;
  dailyCount: number;
}

// ─── Constants ───────────────────────────────────────────
const CHECKLIST_ITEMS = [
  "Site survey completed",
  "Fiber cable laid from pole to customer",
  "ONT installed and configured",
  "Router configured and connected",
  "WiFi signal tested at all rooms",
  "Speed test completed (download/upload)",
  "Customer trained on basic usage",
  "Payment collected (if applicable)",
  "Photos uploaded",
  "Customer signed acceptance form",
];

const STATUS_OPTIONS = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NO_SHOW", label: "No Show" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  SCHEDULED: { label: "Scheduled", cls: "bg-teal-100 text-teal-700 border-teal-200" },
  IN_PROGRESS: { label: "In Progress", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  COMPLETED: { label: "Completed", cls: "bg-green-100 text-green-700 border-green-200" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  NO_SHOW: { label: "No Show", cls: "bg-red-100 text-red-700 border-red-200" },
};

const CAL_STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-teal-100 text-teal-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
  NO_SHOW: "bg-red-100 text-red-700",
};

function parseChecklist(str: string): string[] {
  try { return JSON.parse(str); } catch { return []; }
}

function parseJsonArray(str: string): string[] {
  try { return JSON.parse(str); } catch { return []; }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function calcActualDurationHours(scheduledDate: string, completedAt: string): number | null {
  if (!scheduledDate || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(scheduledDate).getTime();
  if (ms < 0) return null;
  return Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
}

function getDurationBadge(inst: Installation) {
  if (inst.status === "COMPLETED" && inst.completedAt) {
    const actual = calcActualDurationHours(inst.scheduledDate, inst.completedAt);
    const estimated = inst.estimatedDurationHours || 2;
    if (actual === null) return { label: "N/A", cls: "bg-gray-100 text-gray-600 border-gray-200" };
    if (actual <= estimated) return { label: "On Time", cls: "bg-green-100 text-green-700 border-green-200" };
    return { label: "Overdue", cls: "bg-red-100 text-red-700 border-red-200" };
  }
  if (inst.status === "SCHEDULED" || inst.status === "IN_PROGRESS") {
    const now = Date.now();
    const scheduled = new Date(inst.scheduledDate).getTime();
    const estimated = (inst.estimatedDurationHours || 2) * 3600 * 1000;
    const deadline = scheduled + estimated;
    if (now > deadline) return { label: "Overdue", cls: "bg-red-100 text-red-700 border-red-200" };
    return { label: "In Progress", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" };
  }
  return null;
}

// ─── Star Rating Component ──────────────────────────────
function StarRating({ value, onChange, size = "sm" }: { value: number; onChange?: (v: number) => void; size?: "sm" | "md" }) {
  const starSize = size === "md" ? "h-6 w-6" : "h-4 w-4";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          className={`${onChange ? "cursor-pointer hover:scale-110" : "cursor-default"} transition-transform`}
        >
          <Star className={`${starSize} ${star <= value ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

// ─── Calendar Helpers ───────────────────────────────────
function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  }
  return days;
}

// ─── Main Component ──────────────────────────────────────
export default function InstallationsPage() {
  const queryClient = useQueryClient();

  // View mode: schedule or calendar
  const [viewMode, setViewMode] = useState<"schedule" | "calendar" | "timeline">("schedule");
  const [draggedInst, setDraggedInst] = useState<Installation | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState<string | null>(null);
  const [showEquipment, setShowEquipment] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showBatchCreate, setShowBatchCreate] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showAutoAssign, setShowAutoAssign] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Create form
  const emptyForm = { subscriberId: "", technicianId: "", areaId: "", scheduledDate: "", scheduledTime: "10:00", estimatedDurationHours: "2" };
  const [createForm, setCreateForm] = useState(emptyForm);

  // Edit form
  const [editForm, setEditForm] = useState({ scheduledDate: "", scheduledTime: "", technicianId: "", areaId: "", estimatedDurationHours: "2" });

  // Cancel form
  const [cancelReason, setCancelReason] = useState("");

  // Feedback form
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");

  // Batch create form
  const [batchForm, setBatchForm] = useState({ technicianId: "", areaId: "", startDate: "", endDate: "", scheduledTime: "10:00", estimatedDurationHours: "2" });

  // Conflict state
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [overrideConflict, setOverrideConflict] = useState(false);

  // Detail state
  const [detailChecklist, setDetailChecklist] = useState<string[]>([]);
  const [detailNotes, setDetailNotes] = useState("");
  const [prevDetailId, setPrevDetailId] = useState<string | null>(null);

  // ─── Queries ──────────────────────────────────────────
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (searchQuery) params.set("search", searchQuery);
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    return params.toString();
  }, [filterStatus, searchQuery, page, pageSize]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["installations", filterStatus, searchQuery, page, pageSize],
    queryFn: () => apiFetch(`/api/installations?${queryParams}`),
  });

  // Calendar data
  const { data: calendarData } = useQuery({
    queryKey: ["installations-calendar", calendarMonth, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("view", "calendar");
      params.set("calendarMonth", calendarMonth);
      if (filterStatus !== "all") params.set("status", filterStatus);
      return apiFetch(`/api/installations?${params}`);
    },
    enabled: viewMode === "calendar",
  });

  // Fetch detail
  const { data: detailData } = useQuery({
    queryKey: ["installation-detail", showDetail],
    queryFn: () => apiFetch(`/api/installations/${showDetail}`),
    enabled: !!showDetail,
  });

  // Equipment in stock
  const { data: equipmentData, isLoading: equipmentLoading } = useQuery({
    queryKey: ["equipment-instock"],
    queryFn: () => apiFetch("/api/equipment?status=IN_STOCK&limit=50"),
    enabled: showEquipment,
  });

  // Form data
  const { data: subscribersData } = useQuery({
    queryKey: ["subscribers-list-inst"],
    queryFn: () => apiFetch("/api/subscribers"),
    enabled: showCreate || showBatchCreate,
  });

  const { data: techniciansData } = useQuery({
    queryKey: ["technicians-list-inst"],
    queryFn: () => apiFetch("/api/technicians"),
    enabled: showCreate || showBatchCreate || !!showDetail || !!showEdit,
  });

  const { data: areasData } = useQuery({
    queryKey: ["areas-list-inst"],
    queryFn: () => apiFetch("/api/areas"),
    enabled: showCreate || showBatchCreate || !!showEdit,
  });

  // Daily report
  const { data: dailyReportData, isLoading: reportLoading } = useQuery({
    queryKey: ["daily-report"],
    queryFn: () => apiFetch("/api/installations/daily-report"),
    enabled: showDailyReport,
  });

  // Timeline data — vertical chronological timeline via dedicated API
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePageSize] = useState(25);

  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ["installations-timeline", filterStatus, searchQuery, timelinePage, timelinePageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (searchQuery) params.set("search", searchQuery);
      params.set("page", String(timelinePage));
      params.set("limit", String(timelinePageSize));
      return apiFetch(`/api/installations/timeline?${params}`);
    },
    enabled: viewMode === "timeline",
  });

  const timelineItems: Installation[] = (timelineData?.items || []) as Installation[];
  const timelinePagination = timelineData?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 } as { page: number; limit: number; total: number; totalPages: number };

  // Group timeline items by date category: Today, Yesterday, This Week, Earlier
  const timelineGroups = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Start of this week (Sunday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekStr = startOfWeek.toISOString().split("T")[0];

    const groups: { key: string; label: string; items: Installation[] }[] = [
      { key: "today", label: "Today", items: [] },
      { key: "yesterday", label: "Yesterday", items: [] },
      { key: "thisWeek", label: "This Week", items: [] },
      { key: "earlier", label: "Earlier", items: [] },
    ];

    for (const inst of timelineItems) {
      const instDate = new Date(inst.scheduledDate).toISOString().split("T")[0];
      if (instDate === todayStr) {
        groups[0].items.push(inst);
      } else if (instDate === yesterdayStr) {
        groups[1].items.push(inst);
      } else if (instDate > startOfWeekStr) {
        groups[2].items.push(inst);
      } else {
        groups[3].items.push(inst);
      }
    }

    return groups.filter(g => g.items.length > 0);
  }, [timelineItems]);

  // Timeline page range
  const timelinePageRange = useMemo(() => {
    const total = timelinePagination.totalPages;
    const current = timelinePagination.page;
    const delta = 2;
    const range: (number | "...")[] = [];
    for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
      range.push(i);
    }
    if (Number(range[0]) > 1) {
      range.unshift(1);
      if (range[1] !== 2) range.splice(1, 0, "...");
    }
    if (Number(range[range.length - 1]) < total) {
      if (range[range.length - 1] !== total - 1) range.push("...");
      range.push(total);
    }
    return range;
  }, [timelinePagination]);

  // Color-coded left border based on status
  const timelineBorderColors: Record<string, string> = {
    COMPLETED: "border-l-green-500",
    SCHEDULED: "border-l-amber-400",
    IN_PROGRESS: "border-l-amber-500",
    CANCELLED: "border-l-red-500",
    NO_SHOW: "border-l-red-400",
  };

  const timelineDotColors: Record<string, string> = {
    COMPLETED: "bg-green-500",
    SCHEDULED: "bg-amber-400",
    IN_PROGRESS: "bg-amber-500",
    CANCELLED: "bg-red-500",
    NO_SHOW: "bg-red-400",
  };

  // ─── Derived Data ────────────────────────────────────
  const installations: Installation[] = data?.installations || [];
  const statusCounts: Record<string, number> = data?.statusCounts || {};
  const pagination = data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 } as { page: number; limit: number; total: number; totalPages: number };

  const calendarInstallations: Installation[] = calendarData?.installations || [];
  const detailInst: InstallationDetail | null = (detailData?.installation as InstallationDetail) || null;
  const avgRating = detailData?.avgRating as number | null;
  const feedbackCount = detailData?.feedbackCount as number | null;

  // Reset detail state
  if (showDetail !== prevDetailId) {
    setPrevDetailId(showDetail);
    if (detailInst) {
      setDetailChecklist(parseChecklist(detailInst.checklist));
      setDetailNotes(detailInst.notes);
    } else {
      setDetailChecklist([]);
      setDetailNotes("");
    }
  }

  const subscribers = (subscribersData?.subscribers || []) as { id: string; name: string; code: string; phone: string }[];
  const technicians = (techniciansData?.technicians || []) as { id: string; name: string; phone: string; status: string }[];
  const areas = (Array.isArray(areasData) ? areasData : areasData?.items || areasData?.areas || []) as { id: string; name: string; code: string }[];
  const equipmentList: EquipmentItem[] = (equipmentData?.items || equipmentData?.equipment || []) as EquipmentItem[];

  // Calendar grouped by date
  const calendarMap = useMemo(() => {
    const map: Record<string, Installation[]> = {};
    for (const inst of calendarInstallations) {
      const key = new Date(inst.scheduledDate).toISOString().split("T")[0];
      if (!map[key]) map[key] = [];
      map[key].push(inst);
    }
    return map;
  }, [calendarInstallations]);

  const calParts = useMemo(() => {
    const [y, m] = calendarMonth.split("-").map(Number);
    return { year: y, month: m - 1 };
  }, [calendarMonth]);

  const calendarDays = useMemo(() => getCalendarDays(calParts.year, calParts.month), [calParts]);

  const monthLabel = useMemo(() => {
    return new Date(calParts.year, calParts.month).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }, [calParts]);

  // Schedule view: group by date (only in schedule mode with pagination)
  const groupedByDate = useMemo(() => {
    return installations.reduce<Record<string, Installation[]>>((acc, inst) => {
      const dateKey = formatDate(inst.scheduledDate);
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(inst);
      return acc;
    }, {});
  }, [installations]);

  // Page range for pagination
  const pageRange = useMemo(() => {
    const total = pagination.totalPages;
    const current = pagination.page;
    const delta = 2;
    const range: (number | "...")[] = [];
    for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
      range.push(i);
    }
    if (Number(range[0]) > 1) {
      range.unshift(1);
      if (range[1] !== 2) range.splice(1, 0, "...");
    }
    if (Number(range[range.length - 1]) < total) {
      if (range[range.length - 1] !== total - 1) range.push("...");
      range.push(total);
    }
    return range;
  }, [pagination]);

  // ─── Mutations (declared before handlers that reference them) ──
  const createMutation = useMutation({
    mutationFn: (form: typeof createForm) =>
      apiFetch("/api/installations", {
        method: "POST",
        body: JSON.stringify({ ...form, estimatedDurationHours: Number(form.estimatedDurationHours) || 2 }),
      }),
    onSuccess: () => {
      toast.success("Installation scheduled successfully");
      queryClient.invalidateQueries({ queryKey: ["installations"] });
      queryClient.invalidateQueries({ queryKey: ["installations-timeline"] });
      setShowCreate(false);
      setCreateForm(emptyForm);
      setConflictInfo(null);
      setOverrideConflict(false);
    },
    onError: () => toast.error("Failed to schedule installation"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/api/installations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast.success("Installation updated");
      queryClient.invalidateQueries({ queryKey: ["installations"] });
      queryClient.invalidateQueries({ queryKey: ["installation-detail"] });
      queryClient.invalidateQueries({ queryKey: ["installations-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["installations-timeline"] });
    },
    onError: () => toast.error("Failed to update installation"),
  });

  const allocateEquipmentMutation = useMutation({
    mutationFn: ({ installationId, equipmentIds }: { installationId: string; equipmentIds: string[] }) => {
      const currentIds = detailInst ? parseJsonArray(detailInst.equipmentIds) : [];
      const merged = [...new Set([...currentIds, ...equipmentIds])];
      return Promise.all([
        apiFetch(`/api/installations/${installationId}`, { method: "PUT", body: JSON.stringify({ equipmentIds: merged }) }),
        ...equipmentIds.map((eqId) => apiFetch(`/api/equipment/${eqId}`, { method: "PUT", body: JSON.stringify({ status: "DEPLOYED" }) })),
      ]);
    },
    onSuccess: () => {
      toast.success("Equipment allocated successfully");
      queryClient.invalidateQueries({ queryKey: ["installation-detail"] });
      queryClient.invalidateQueries({ queryKey: ["equipment-instock"] });
      setShowEquipment(false);
    },
    onError: () => toast.error("Failed to allocate equipment"),
  });

  const feedbackMutation = useMutation({
    mutationFn: (data: { installationId: string; rating: number; feedback: string }) =>
      apiFetch("/api/installations/feedback", { method: "POST", body: JSON.stringify(data) }),
    onError: () => toast.error("Failed to submit feedback"),
  });

  const batchMutation = useMutation({
    mutationFn: (form: typeof batchForm) =>
      apiFetch("/api/installations", {
        method: "POST",
        body: JSON.stringify({
          action: "batch-create",
          technicianId: form.technicianId,
          areaId: form.areaId || null,
          startDate: form.startDate,
          endDate: form.endDate,
          scheduledTime: form.scheduledTime,
          estimatedDurationHours: Number(form.estimatedDurationHours) || 2,
        }),
      }),
    onSuccess: (res) => {
      toast.success(res.message || "Batch created successfully");
      queryClient.invalidateQueries({ queryKey: ["installations"] });
      queryClient.invalidateQueries({ queryKey: ["installations-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["installations-timeline"] });
      setShowBatchCreate(false);
      setBatchForm({ technicianId: "", areaId: "", startDate: "", endDate: "", scheduledTime: "10:00", estimatedDurationHours: "2" });
    },
    onError: (err: any) => {
      if (err?.conflicts) {
        toast.error(`Conflicts on ${err.conflicts.length} days: ${err.conflicts.join(", ")}`);
      } else {
        toast.error(err?.error || "Failed to create batch");
      }
    },
  });

  const autoAssignMutation = useMutation({
    mutationFn: (installationIds: string[]) =>
      apiFetch("/api/installations/auto-assign", {
        method: "POST",
        body: JSON.stringify({ installationIds }),
      }),
    onSuccess: (res) => {
      toast.success(`Assigned ${res.assigned} of ${res.total} installations`);
      if (res.failed > 0) toast.warning(`${res.failed} could not be assigned`);
      queryClient.invalidateQueries({ queryKey: ["installations"] });
      queryClient.invalidateQueries({ queryKey: ["installation-detail"] });
      queryClient.invalidateQueries({ queryKey: ["installations-timeline"] });
      setShowAutoAssign(false);
    },
    onError: () => toast.error("Failed to auto-assign"),
  });

  // ─── Handlers ────────────────────────────────────────
  const handleOpenEdit = useCallback((inst: Installation) => {
    setEditForm({
      scheduledDate: inst.scheduledDate ? new Date(inst.scheduledDate).toISOString().split("T")[0] : "",
      scheduledTime: inst.scheduledTime || "",
      technicianId: inst.technicianId || "",
      areaId: inst.areaId || "",
      estimatedDurationHours: String(inst.estimatedDurationHours || 2),
    });
    setConflictInfo(null);
    setOverrideConflict(false);
    setShowEdit(inst.id);
  }, []);

  const handleCheckConflict = useCallback(async (technicianId: string, date: string, excludeId?: string) => {
    try {
      const res = await apiFetch("/api/installations", {
        method: "POST",
        body: JSON.stringify({ action: "check-conflict", technicianId, scheduledDate: date, excludeId }),
      });
      setConflictInfo(res);
      return res;
    } catch {
      return null;
    }
  }, []);

  const handleCreateSubmit = useCallback(() => {
    if (!createForm.subscriberId || !createForm.technicianId || !createForm.scheduledDate) {
      toast.error("Subscriber, technician, and date are required");
      return;
    }
    createMutation.mutate(createForm);
  }, [createForm]);

  const handleEditSubmit = useCallback(() => {
    if (!showEdit || !editForm.scheduledDate || !editForm.technicianId) {
      toast.error("Date and technician are required");
      return;
    }
    if (conflictInfo?.hasConflict && !overrideConflict) {
      toast.error("Please confirm conflict override before saving");
      return;
    }
    updateMutation.mutate({
      id: showEdit,
      data: {
        scheduledDate: editForm.scheduledDate,
        scheduledTime: editForm.scheduledTime,
        technicianId: editForm.technicianId,
        areaId: editForm.areaId || null,
        estimatedDurationHours: Number(editForm.estimatedDurationHours) || 2,
      },
    }, {
      onSuccess: () => {
        toast.success("Installation updated");
        setShowEdit(null);
        setConflictInfo(null);
        setOverrideConflict(false);
      },
    });
  }, [showEdit, editForm, conflictInfo, overrideConflict]);

  const handleCancelConfirm = useCallback(() => {
    if (!showCancel) return;
    if (!cancelReason.trim()) {
      toast.error("Please provide a cancellation reason");
      return;
    }
    updateMutation.mutate({
      id: showCancel,
      data: { status: "CANCELLED", cancellationReason: cancelReason.trim() },
    }, {
      onSuccess: () => {
        toast.success("Installation cancelled");
        setShowCancel(null);
        setShowDetail(null);
        setCancelReason("");
      },
    });
  }, [showCancel, cancelReason]);

  const handleFeedbackSubmit = useCallback(() => {
    if (!showDetail || feedbackRating === 0) {
      toast.error("Please select a rating");
      return;
    }
    feedbackMutation.mutate({
      installationId: showDetail,
      rating: feedbackRating,
      feedback: feedbackText,
    }, {
      onSuccess: () => {
        toast.success("Feedback submitted");
        setShowFeedback(false);
        setFeedbackRating(0);
        setFeedbackText("");
        queryClient.invalidateQueries({ queryKey: ["installation-detail"] });
      },
    });
  }, [showDetail, feedbackRating, feedbackText]);

  const handleBatchSubmit = useCallback(() => {
    if (!batchForm.technicianId || !batchForm.startDate || !batchForm.endDate) {
      toast.error("Technician, start date, and end date are required");
      return;
    }
    batchMutation.mutate(batchForm);
  }, [batchForm]);

  const handleChecklistToggle = useCallback((item: string) => {
    setDetailChecklist((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  }, []);

  const handleSaveChecklist = useCallback(() => {
    if (!showDetail) return;
    updateMutation.mutate({ id: showDetail, data: { checklist: detailChecklist, notes: detailNotes } });
  }, [showDetail, detailChecklist, detailNotes]);

  const handleStatusChange = useCallback((newStatus: string) => {
    if (!showDetail) return;
    updateMutation.mutate({ id: showDetail, data: { status: newStatus } });
  }, [showDetail]);

  const handleCalendarDayClick = useCallback((dateStr: string) => {
    const hasInst = calendarMap[dateStr] && calendarMap[dateStr].length > 0;
    if (hasInst) {
      setFilterStatus("all");
      setSearchQuery("");
      setPage(1);
      setViewMode("schedule");
      const first = calendarMap[dateStr][0];
      setShowDetail(first.id);
    }
  }, [calendarMap]);

  // ─── Drag & Drop Handlers ─────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, inst: Installation) => {
    setDraggedInst(inst);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", inst.id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, newDate: string) => {
    e.preventDefault();
    setDragOverDate(null);
    if (!draggedInst) return;
    const oldDate = new Date(draggedInst.scheduledDate).toISOString().split("T")[0];
    if (oldDate === newDate) return;
    updateMutation.mutate(
      { id: draggedInst.id, data: { scheduledDate: newDate } },
      {
        onSuccess: () => {
          toast.success(`Rescheduled to ${formatDate(newDate)}`);
          setDraggedInst(null);
        },
      }
    );
  }, [draggedInst]);

  const handleDragEnd = useCallback(() => {
    setDraggedInst(null);
    setDragOverDate(null);
  }, []);


  // ─── Loading ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-40 mb-2" /><Skeleton className="skeleton-wave h-4 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Card key={i} className="border shadow-sm"><CardContent className="p-3"><Skeleton className="skeleton-wave h-4 w-12 mb-2" /><Skeleton className="skeleton-wave h-6 w-8" /></CardContent></Card>)}
        </div>
        <Card className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Installations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Schedule and track new connection installations</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAutoAssign(true)}>
            <Users className="h-4 w-4 mr-1.5" /> Auto-Assign
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDailyReport(true)}>
            <FileBarChart className="h-4 w-4 mr-1.5" /> Daily Report
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowBatchCreate(true)}>
            <Copy className="h-4 w-4 mr-1.5" /> Batch Create
          </Button>
          <Button onClick={() => setShowCreate(true)} className="bg-red-600 hover:bg-red-700 text-white">
            <Plus className="h-4 w-4 mr-2" /> Schedule Installation
          </Button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STATUS_OPTIONS.map((s) => (
          <Card key={s.value} className={`border shadow-sm cursor-pointer ${filterStatus === s.value ? "ring-2 ring-red-500" : ""}`} onClick={() => { setFilterStatus(filterStatus === s.value ? "all" : s.value); setPage(1); setTimelinePage(1); }}>
            <CardContent className="p-3">
              <p className="text-[10px] font-medium text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold">{statusCounts[s.value] || 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + View Toggle + Page Size */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by customer, technician, area..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); setTimelinePage(1); }} className="pl-9" />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex border rounded-md">
                <Button variant={viewMode === "schedule" ? "secondary" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("schedule")}>
                  <List className="h-4 w-4" />
                </Button>
                <Button variant={viewMode === "calendar" ? "secondary" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("calendar")}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button variant={viewMode === "timeline" ? "secondary" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("timeline")}>
                  <GanttChart className="h-4 w-4" />
                </Button>
              </div>
              {viewMode === "schedule" && (
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="w-[70px] h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Calendar View ─────────────────────────────── */}
      {viewMode === "calendar" && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 px-4 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-red-500" />
                {monthLabel}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => {
                  const d = new Date(calParts.year, calParts.month - 1);
                  setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const now = new Date();
                  setCalendarMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
                }}>
                  Today
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const d = new Date(calParts.year, calParts.month + 1);
                  setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                }}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px">
              {calendarDays.map((day, idx) => {
                const dateStr = day.date.toISOString().split("T")[0];
                const dayInst = calendarMap[dateStr] || [];
                const isToday = dateStr === new Date().toISOString().split("T")[0];
                const isDragOver = dragOverDate === dateStr && day.isCurrentMonth;
                return (
                  <div
                    key={idx}
                    onClick={() => day.isCurrentMonth && handleCalendarDayClick(dateStr)}
                    onDragOver={(e) => day.isCurrentMonth && handleDragOver(e, dateStr)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => day.isCurrentMonth && handleDrop(e, dateStr)}
                    className={`min-h-[80px] p-1 border rounded-sm cursor-pointer transition-colors ${!day.isCurrentMonth ? "opacity-30" : "hover:bg-muted/50"} ${isToday ? "bg-muted/30" : ""} ${isDragOver ? "ring-2 ring-red-400 bg-red-50" : ""}`}
                  >
                    <div className={`text-xs font-medium mb-0.5 ${isToday ? "text-red-600" : "text-foreground"}`}>
                      {day.date.getDate()}
                    </div>
                    {dayInst.length > 0 && (
                      <div className="space-y-0.5">
                        <div className="text-[9px] font-semibold text-muted-foreground">{dayInst.length} install.</div>
                        <div className="flex flex-wrap gap-0.5">
                          {dayInst.slice(0, 3).map((inst) => (
                            <Badge
                              key={inst.id}
                              draggable={inst.status === "SCHEDULED"}
                              onDragStart={(e) => handleDragStart(e, inst)}
                              onDragEnd={handleDragEnd}
                              className={`text-[8px] px-1 py-0 leading-tight cursor-grab active:cursor-grabbing ${CAL_STATUS_COLORS[inst.status] || ""} ${draggedInst?.id === inst.id ? "opacity-50" : ""}`}
                            >
                              {inst.scheduledTime || "—"}
                            </Badge>
                          ))}
                          {dayInst.length > 3 && (
                            <span className="text-[8px] text-muted-foreground">+{dayInst.length - 3}</span>
                          )}
                        </div>
                        <div className="text-[8px] text-muted-foreground truncate">
                          {dayInst.map(i => i.subscriber?.name?.split(" ")[0] || i.technician?.name?.split(" ")[0]).filter(Boolean).slice(0, 2).join(", ")}
                        </div>
                      </div>
                    )}
                    {isDragOver && dayInst.length === 0 && (
                      <div className="text-[9px] text-red-500 font-medium mt-1">Drop here</div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Schedule View (Grouped by Date) ───────────── */}
      {viewMode === "schedule" && (
        <div className="space-y-4">
          {Object.entries(groupedByDate).length === 0 ? (
            <Card className="border shadow-sm"><CardContent className="py-12 text-center text-muted-foreground">No installations found</CardContent></Card>
          ) : (
            Object.entries(groupedByDate).map(([dateKey, items]) => (
              <Card key={dateKey} className="border shadow-sm">
                <CardHeader className="pb-2 px-4 pt-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-red-500" />
                    {dateKey}
                    <Badge variant="secondary" className="text-[10px] ml-1">{items.length} installation{items.length > 1 ? "s" : ""}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-8"></TableHead>
                          <TableHead className="text-xs">Time</TableHead>
                          <TableHead className="text-xs">Customer</TableHead>
                          <TableHead className="text-xs">Technician</TableHead>
                          <TableHead className="text-xs">Area</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Duration</TableHead>
                          <TableHead className="text-xs">Checklist</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((inst) => {
                          const checkItems = parseChecklist(inst.checklist);
                          const checkTotal = CHECKLIST_ITEMS.length;
                          const checkDone = checkItems.length;
                          const durationBadge = getDurationBadge(inst);
                          const isDraggable = inst.status === "SCHEDULED";
                          return (
                            <TableRow
                              key={inst.id}
                              className={`hover:bg-muted/50 ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""} ${draggedInst?.id === inst.id ? "opacity-40" : ""} ${dragOverDate === dateKey && isDraggable === false ? "" : ""}`}
                              draggable={isDraggable}
                              onDragStart={(e) => isDraggable && handleDragStart(e, inst)}
                              onDragEnd={handleDragEnd}
                            >
                              <TableCell className="text-xs">
                                {isDraggable && <GanttChart className="h-3 w-3 text-muted-foreground" />}
                              </TableCell>
                              <TableCell className="text-xs">
                                <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" /><span>{inst.scheduledTime || "N/A"}</span></div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="text-xs font-medium">{inst.subscriber?.name || "N/A"}</p>
                                  <p className="text-[10px] text-muted-foreground">{inst.subscriber?.code}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs">{inst.technician?.name || "N/A"}</TableCell>
                              <TableCell className="text-xs">{inst.area?.name || "N/A"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce ${STATUS_BADGE[inst.status]?.cls || ""}`}>
                                  {STATUS_BADGE[inst.status]?.label || inst.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {durationBadge ? (
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce w-fit ${durationBadge.cls}`}>{durationBadge.label}</Badge>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">{inst.estimatedDurationHours || 2}h est.</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                <span className="tabular-nums">{checkDone}/{checkTotal}</span>
                                {checkDone > 0 && <span className="text-green-600 ml-1">({Math.round((checkDone / checkTotal) * 100)}%)</span>}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {inst.status === "SCHEDULED" && (
                                    <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(inst)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                                  )}
                                  <Button variant="ghost" size="sm" onClick={() => setShowDetail(inst.id)} title="View Details"><Eye className="h-4 w-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            ))
          )}
          {/* Drop zone hint */}
          {draggedInst && (
            <div className="text-center text-xs text-muted-foreground py-2 animate-pulse">
              Drag to a date on the Calendar view to reschedule
            </div>
          )}
        </div>
      )}

      {/* ─── Pagination (Schedule View) ───────────────── */}
      {viewMode === "schedule" && pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} installations
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => setPage(1)}>
              <ChevronLeft className="h-4 w-4 mr-0.5" /><ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageRange.map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="px-2 text-xs text-muted-foreground">...</span>
              ) : (
                <Button key={p} variant={p === pagination.page ? "default" : "outline"} size="sm" onClick={() => setPage(p as number)} className={p === pagination.page ? "bg-red-600 hover:bg-red-700 text-white" : ""}>
                  {p}
                </Button>
              )
            )}
            <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.totalPages)}>
              <ChevronRight className="h-4 w-4" /><ChevronRight className="h-4 w-4 ml-0.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Timeline (Vertical) View ───────────────────── */}
      {viewMode === "timeline" && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 px-4 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-red-500" />
                Timeline
                <Badge variant="secondary" className="text-[10px] ml-1">{timelinePagination.total} total</Badge>
              </CardTitle>
              {/* Legend */}
              <div className="flex items-center gap-2 flex-wrap">
                {STATUS_OPTIONS.map(s => (
                  <div key={s.value} className="flex items-center gap-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${timelineDotColors[s.value] || "bg-gray-300"}`} />
                    <span className="text-[9px] text-muted-foreground hidden sm:inline">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {timelineLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="skeleton-wave h-4 w-20 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="skeleton-wave h-16 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : timelineGroups.length === 0 ? (
              <div className="py-12 text-center">
                <Clock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No installations found</p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters or search query</p>
              </div>
            ) : (
              <div className="space-y-6">
                {timelineGroups.map((group) => (
                  <div key={group.key}>
                    {/* Group Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-px bg-border flex-1" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                        {group.label}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{group.items.length}</Badge>
                      <div className="h-px bg-border flex-1" />
                    </div>

                    {/* Timeline entries */}
                    <div className="relative ml-4 border-l-2 border-muted pl-6 space-y-3">
                      {group.items.map((inst) => {
                        const statusBadge = STATUS_BADGE[inst.status] || { label: inst.status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
                        const borderColor = timelineBorderColors[inst.status] || "border-l-gray-300";
                        const dotColor = timelineDotColors[inst.status] || "bg-gray-300";
                        const durBadge = getDurationBadge(inst);
                        return (
                          <div key={inst.id} className="relative">
                            {/* Timeline dot */}
                            <div className={`absolute -left-[29px] top-3 w-3 h-3 rounded-full border-2 border-background ${dotColor}`} />

                            {/* Entry card */}
                            <div
                              className={`border border-l-4 ${borderColor} rounded-lg bg-card hover:shadow-md transition-shadow cursor-pointer group/tl`}
                              onClick={() => setShowDetail(inst.id)}
                            >
                              <div className="p-3">
                                {/* Top row: time + status */}
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {inst.scheduledTime || "--:--"}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      · {inst.estimatedDurationHours || 2}h est.
                                    </span>
                                    {durBadge && (
                                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${durBadge.cls}`}>{durBadge.label}</Badge>
                                    )}
                                  </div>
                                  <Badge variant="outline" className={`text-[10px] shrink-0 ${statusBadge.cls}`}>
                                    {statusBadge.label}
                                  </Badge>
                                </div>

                                {/* Subscriber name */}
                                <p className="text-sm font-semibold text-foreground mb-1 group-hover/tl:text-red-600 transition-colors">
                                  {inst.subscriber?.name || "Unknown Subscriber"}
                                </p>

                                {/* Details row */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  {inst.technician?.name && (
                                    <span className="flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {inst.technician.name}
                                    </span>
                                  )}
                                  {inst.area?.name && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {inst.area.name}
                                    </span>
                                  )}
                                  {inst.subscriber?.code && (
                                    <span className="text-muted-foreground/60">{inst.subscriber.code}</span>
                                  )}
                                </div>

                                {/* Action buttons on hover */}
                                <div className="flex items-center gap-1 mt-2 opacity-0 group-hover/tl:opacity-100 transition-opacity">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={(e) => { e.stopPropagation(); setShowDetail(inst.id); }}
                                  >
                                    <Eye className="h-3 w-3 mr-1" /> View
                                  </Button>
                                  {inst.status === "SCHEDULED" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={(e) => { e.stopPropagation(); handleOpenEdit(inst); }}
                                    >
                                      <Pencil className="h-3 w-3 mr-1" /> Edit
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Timeline Pagination */}
                {timelinePagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                      Showing {(timelinePagination.page - 1) * timelinePagination.limit + 1}–{Math.min(timelinePagination.page * timelinePagination.limit, timelinePagination.total)} of {timelinePagination.total}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" disabled={timelinePage <= 1} onClick={() => setTimelinePage(1)}>
                        First
                      </Button>
                      <Button variant="outline" size="sm" disabled={timelinePage <= 1} onClick={() => setTimelinePage(timelinePage - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {timelinePageRange.map((p) =>
                        p === "..." ? (
                          <span key="..." className="px-1 text-xs text-muted-foreground">…</span>
                        ) : (
                          <Button
                            key={p}
                            variant={timelinePage === p ? "default" : "outline"}
                            size="sm"
                            className="w-8 h-8 p-0 text-xs"
                            onClick={() => setTimelinePage(p as number)}
                          >
                            {p}
                          </Button>
                        )
                      )}
                      <Button variant="outline" size="sm" disabled={timelinePage >= timelinePagination.totalPages} onClick={() => setTimelinePage(timelinePage + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={timelinePage >= timelinePagination.totalPages} onClick={() => setTimelinePage(timelinePagination.totalPages)}>
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Create Dialog ──────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) { setConflictInfo(null); setOverrideConflict(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-red-500" /> Schedule Installation</DialogTitle>
            <DialogDescription>Schedule a new connection installation</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Subscriber *</Label>
              <Select value={createForm.subscriberId} onValueChange={(v) => setCreateForm({ ...createForm, subscriberId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select subscriber" /></SelectTrigger>
                <SelectContent>
                  {subscribers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Technician *</Label>
              <Select value={createForm.technicianId} onValueChange={(v) => setCreateForm({ ...createForm, technicianId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select technician" /></SelectTrigger>
                <SelectContent>
                  {technicians.filter((t) => t.status !== "offline").map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} {t.status === "busy" ? "(Busy)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Area</Label>
              <Select value={createForm.areaId} onValueChange={(v) => setCreateForm({ ...createForm, areaId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select area" /></SelectTrigger>
                <SelectContent>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={createForm.scheduledDate} onChange={(e) => { setCreateForm({ ...createForm, scheduledDate: e.target.value }); setConflictInfo(null); }} min={new Date().toISOString().split("T")[0]} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={createForm.scheduledTime} onChange={(e) => setCreateForm({ ...createForm, scheduledTime: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-muted-foreground" /> Estimated Duration (hours)</Label>
              <Input type="number" min="0.5" step="0.5" value={createForm.estimatedDurationHours} onChange={(e) => setCreateForm({ ...createForm, estimatedDurationHours: e.target.value })} placeholder="2" />
            </div>
            {/* Conflict Warning */}
            {conflictInfo?.hasConflict && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {conflictInfo.onLeave ? `${conflictInfo.technicianName} is on leave this day` : `${conflictInfo.technicianName} already has ${conflictInfo.dailyCount} installation(s)`}
                </div>
                {conflictInfo.conflicts.length > 0 && (
                  <div className="space-y-1">
                    {conflictInfo.conflicts.map((c) => (
                      <div key={c.id} className="text-xs text-amber-600 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {c.scheduledTime} — {c.subscriber?.name || "N/A"} ({c.area?.name || "N/A"})
                      </div>
                    ))}
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={overrideConflict} onCheckedChange={(v) => setOverrideConflict(v === true)} />
                  Override and schedule anyway
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setConflictInfo(null); }}>Cancel</Button>
            <Button onClick={() => {
              if (createForm.technicianId && createForm.scheduledDate) {
                handleCheckConflict(createForm.technicianId, createForm.scheduledDate).then((res) => {
                  if (res?.hasConflict && !overrideConflict) return; // Show warning first
                  handleCreateSubmit();
                });
              } else {
                handleCreateSubmit();
              }
            }} disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {createMutation.isPending ? "Scheduling..." : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ──────────────────────────────── */}
      <Dialog open={!!showEdit} onOpenChange={(open) => { setShowEdit(open ? showEdit : null); if (!open) { setConflictInfo(null); setOverrideConflict(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-orange-500" /> Edit Installation</DialogTitle>
            <DialogDescription>Modify scheduled installation details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Technician *</Label>
              <Select value={editForm.technicianId} onValueChange={(v) => { setEditForm({ ...editForm, technicianId: v }); setConflictInfo(null); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select technician" /></SelectTrigger>
                <SelectContent>
                  {technicians.filter((t) => t.status !== "offline").map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} {t.status === "busy" ? "(Busy)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Area</Label>
              <Select value={editForm.areaId} onValueChange={(v) => setEditForm({ ...editForm, areaId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select area" /></SelectTrigger>
                <SelectContent>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={editForm.scheduledDate} onChange={(e) => { setEditForm({ ...editForm, scheduledDate: e.target.value }); setConflictInfo(null); }} min={new Date().toISOString().split("T")[0]} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={editForm.scheduledTime} onChange={(e) => setEditForm({ ...editForm, scheduledTime: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-muted-foreground" /> Estimated Duration (hours)</Label>
              <Input type="number" min="0.5" step="0.5" value={editForm.estimatedDurationHours} onChange={(e) => setEditForm({ ...editForm, estimatedDurationHours: e.target.value })} placeholder="2" />
            </div>
            {/* Conflict Warning */}
            {conflictInfo?.hasConflict && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {conflictInfo.onLeave ? `${conflictInfo.technicianName} is on leave` : `Technician has ${conflictInfo.dailyCount} other installation(s)`}
                </div>
                {conflictInfo.conflicts.length > 0 && (
                  <div className="space-y-1">
                    {conflictInfo.conflicts.map((c) => (
                      <div key={c.id} className="text-xs text-amber-600 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {c.scheduledTime} — {c.subscriber?.name || "N/A"}
                      </div>
                    ))}
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={overrideConflict} onCheckedChange={(v) => setOverrideConflict(v === true)} />
                  Override conflict
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEdit(null); setConflictInfo(null); }}>Cancel</Button>
            <Button onClick={() => {
              if (editForm.technicianId && editForm.scheduledDate) {
                handleCheckConflict(editForm.technicianId, editForm.scheduledDate, showEdit || undefined).then((res) => {
                  if (res?.hasConflict && !overrideConflict) return;
                  handleEditSubmit();
                });
              } else {
                handleEditSubmit();
              }
            }} disabled={updateMutation.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cancel Dialog ──────────────────────────────── */}
      <Dialog open={!!showCancel} onOpenChange={() => { setShowCancel(null); setCancelReason(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" /> Cancel Installation</DialogTitle>
            <DialogDescription>Are you sure you want to cancel this installation?</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Cancellation Reason *</Label>
              <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Please provide a reason..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCancel(null); setCancelReason(""); }}>Keep</Button>
            <Button onClick={handleCancelConfirm} disabled={updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {updateMutation.isPending ? "Cancelling..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Feedback Dialog ────────────────────────────── */}
      <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Star className="h-5 w-5 text-yellow-500" /> Rate Installation</DialogTitle>
            <DialogDescription>How was the installation experience?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rating *</Label>
              <StarRating value={feedbackRating} onChange={setFeedbackRating} size="md" />
            </div>
            <div className="space-y-2">
              <Label>Feedback (optional)</Label>
              <Textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="Share your experience..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFeedback(false); setFeedbackRating(0); setFeedbackText(""); }}>Cancel</Button>
            <Button onClick={handleFeedbackSubmit} disabled={feedbackMutation.isPending} className="bg-yellow-600 hover:bg-yellow-700 text-white">
              {feedbackMutation.isPending ? "Submitting..." : "Submit Rating"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Batch Create Dialog ────────────────────────── */}
      <Dialog open={showBatchCreate} onOpenChange={setShowBatchCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Copy className="h-5 w-5 text-purple-500" /> Batch Create Installations</DialogTitle>
            <DialogDescription>Create multiple installations for a date range</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Technician *</Label>
              <Select value={batchForm.technicianId} onValueChange={(v) => setBatchForm({ ...batchForm, technicianId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select technician" /></SelectTrigger>
                <SelectContent>
                  {technicians.filter((t) => t.status !== "offline").map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Area</Label>
              <Select value={batchForm.areaId} onValueChange={(v) => setBatchForm({ ...batchForm, areaId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select area (optional)" /></SelectTrigger>
                <SelectContent>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input type="date" value={batchForm.startDate} onChange={(e) => setBatchForm({ ...batchForm, startDate: e.target.value })} min={new Date().toISOString().split("T")[0]} />
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input type="date" value={batchForm.endDate} onChange={(e) => setBatchForm({ ...batchForm, endDate: e.target.value })} min={batchForm.startDate || new Date().toISOString().split("T")[0]} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={batchForm.scheduledTime} onChange={(e) => setBatchForm({ ...batchForm, scheduledTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Duration (hours)</Label>
                <Input type="number" min="0.5" step="0.5" value={batchForm.estimatedDurationHours} onChange={(e) => setBatchForm({ ...batchForm, estimatedDurationHours: e.target.value })} />
              </div>
            </div>
            {batchForm.startDate && batchForm.endDate && (() => {
              const s = new Date(batchForm.startDate);
              const e = new Date(batchForm.endDate);
              const days = Math.max(0, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
              return <p className="text-xs text-muted-foreground">Will create {days} installation(s)</p>;
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchCreate(false)}>Cancel</Button>
            <Button onClick={handleBatchSubmit} disabled={batchMutation.isPending} className="bg-purple-600 hover:bg-purple-700 text-white">
              {batchMutation.isPending ? "Creating..." : "Create Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Auto-Assign Dialog ─────────────────────────── */}
      <Dialog open={showAutoAssign} onOpenChange={setShowAutoAssign}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-teal-500" /> Auto-Assign Technicians</DialogTitle>
            <DialogDescription>Automatically assign available technicians to scheduled installations</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will find the best available technician for each scheduled installation based on:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              <li>Technician availability (not on leave)</li>
              <li>Working hours match</li>
              <li>Current daily workload (max 5 per day)</li>
              <li>Area expertise preference</li>
            </ul>
            <div className="bg-teal-50 border border-teal-200 rounded-md p-3">
              <p className="text-xs text-teal-700 font-medium">Only SCHEDULED installations will be processed.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutoAssign(false)}>Cancel</Button>
            <Button onClick={() => {
              const scheduledIds = installations.filter(i => i.status === "SCHEDULED").map(i => i.id);
              if (scheduledIds.length === 0) { toast.error("No scheduled installations found"); return; }
              autoAssignMutation.mutate(scheduledIds);
            }} disabled={autoAssignMutation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white">
              {autoAssignMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Assigning...</> : "Auto-Assign All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Daily Report Dialog ────────────────────────── */}
      <Dialog open={showDailyReport} onOpenChange={setShowDailyReport}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileBarChart className="h-5 w-5 text-green-500" /> Daily Report</DialogTitle>
            <DialogDescription>Today&apos;s installation summary</DialogDescription>
          </DialogHeader>
          {reportLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : dailyReportData ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{dailyReportData.date}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Total", value: dailyReportData.total, color: "text-foreground" },
                  { label: "Scheduled", value: dailyReportData.totalScheduled, color: "text-teal-600" },
                  { label: "In Progress", value: dailyReportData.totalInProgress, color: "text-yellow-600" },
                  { label: "Completed", value: dailyReportData.totalCompleted, color: "text-green-600" },
                  { label: "Cancelled", value: dailyReportData.totalCancelled, color: "text-gray-600" },
                  { label: "No Show", value: dailyReportData.totalNoShow, color: "text-red-600" },
                ].map((s) => (
                  <Card key={s.label} className="border shadow-sm">
                    <CardContent className="p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground">Avg Duration</p>
                    <p className="text-lg font-bold tabular-nums">{dailyReportData.avgDuration}h</p>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground">Completion Rate</p>
                    <p className="text-lg font-bold tabular-nums">{dailyReportData.completionRate}%</p>
                  </CardContent>
                </Card>
              </div>
              {dailyReportData.technicianBreakdown && dailyReportData.technicianBreakdown.length > 0 && (
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Technician Breakdown</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Technician</TableHead>
                          <TableHead className="text-xs text-center">Total</TableHead>
                          <TableHead className="text-xs text-center">Done</TableHead>
                          <TableHead className="text-xs text-center">Active</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyReportData.technicianBreakdown.map((t: { name: string; total: number; completed: number; inProgress: number; scheduled: number }) => (
                          <TableRow key={t.name} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell className="text-xs font-medium">{t.name}</TableCell>
                            <TableCell className="text-xs text-center">{t.total}</TableCell>
                            <TableCell className="text-xs text-center text-green-600">{t.completed}</TableCell>
                            <TableCell className="text-xs text-center text-yellow-600">{t.inProgress}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ─── Equipment Allocation Dialog ──────────────────── */}
      <Dialog open={showEquipment} onOpenChange={setShowEquipment}>
        <DialogContent className="sm:max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-teal-500" /> Allocate Equipment</DialogTitle>
            <DialogDescription>Select equipment to allocate</DialogDescription>
          </DialogHeader>
          {equipmentLoading ? (
            <div className="py-8 flex justify-center"><Skeleton className="skeleton-wave h-40 w-full" /></div>
          ) : equipmentList.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No equipment in stock</div>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-2">
                {equipmentList.map((eq) => (
                  <EquipmentSelectCard key={eq.id} equipment={eq} onAllocate={(eqId) => {
                    if (!showDetail) return;
                    allocateEquipmentMutation.mutate({ installationId: showDetail, equipmentIds: [eqId] });
                  }} isPending={allocateEquipmentMutation.isPending} />
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ──────────────────────────────── */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" a11yTitle="Installation Details">
          {detailInst ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-red-500" />
                  Installation Details
                  <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[detailInst.status]?.cls || ""}`}>
                    {STATUS_BADGE[detailInst.status]?.label || detailInst.status}
                  </Badge>
                  {avgRating !== null && avgRating > 0 && (
                    <div className="flex items-center gap-1 ml-2">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-medium">{avgRating}</span>
                      {feedbackCount && feedbackCount > 0 && <span className="text-[10px] text-muted-foreground">({feedbackCount})</span>}
                    </div>
                  )}
                </DialogTitle>
                <DialogDescription>Scheduled for {formatDateTime(detailInst.scheduledDate)} {detailInst.scheduledTime && `at ${detailInst.scheduledTime}`}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Cancellation banner */}
                {detailInst.status === "CANCELLED" && detailInst.cancellationReason && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-xs font-medium text-red-700 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Cancellation Reason</p>
                    <p className="text-xs text-red-600 mt-1">{detailInst.cancellationReason}</p>
                  </div>
                )}

                {/* Info Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Card className="border shadow-sm">
                    <CardContent className="p-3">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">Customer</p>
                      <p className="text-sm font-semibold">{detailInst.subscriber?.name}</p>
                      <p className="text-xs text-muted-foreground">{detailInst.subscriber?.phone} · {detailInst.subscriber?.code}</p>
                      {detailInst.subscriber?.address && <p className="text-xs text-muted-foreground mt-0.5">{detailInst.subscriber.address}</p>}
                      {detailInst.subscriber?.plan && <p className="text-xs text-red-600 mt-1">Plan: {detailInst.subscriber.plan.name}</p>}
                    </CardContent>
                  </Card>
                  <Card className="border shadow-sm">
                    <CardContent className="p-3">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">Technician</p>
                      <p className="text-sm font-semibold">{detailInst.technician?.name}</p>
                      <p className="text-xs text-muted-foreground">{detailInst.technician?.phone} · {detailInst.technician?.email}</p>
                      {detailInst.area && <p className="text-xs text-muted-foreground mt-0.5">Area: {detailInst.area.name}</p>}
                    </CardContent>
                  </Card>
                </div>

                {/* Duration Tracking */}
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" /> Duration Tracking</p>
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Estimated</p>
                        <p className="text-lg font-bold tabular-nums">{detailInst.estimatedDurationHours || 2}h</p>
                      </div>
                      {detailInst.status === "COMPLETED" && detailInst.completedAt && (
                        <>
                          <div className="h-8 w-px bg-border" />
                          <div>
                            <p className="text-[10px] text-muted-foreground">Actual</p>
                            <p className="text-lg font-bold tabular-nums">{calcActualDurationHours(detailInst.scheduledDate, detailInst.completedAt) ?? "N/A"}h</p>
                          </div>
                          <div className="h-8 w-px bg-border" />
                          <div>
                            {(() => {
                              const actual = calcActualDurationHours(detailInst.scheduledDate, detailInst.completedAt);
                              const estimated = detailInst.estimatedDurationHours || 2;
                              let badge = { label: "On Time", cls: "bg-green-100 text-green-700 border-green-200" };
                              if (actual === null) badge = { label: "N/A", cls: "bg-gray-100 text-gray-600 border-gray-200" };
                              else if (actual > estimated) badge = { label: "Overdue", cls: "bg-red-100 text-red-700 border-red-200" };
                              return <Badge variant="outline" className={`text-xs ${badge.cls}`}>{badge.label}</Badge>;
                            })()}
                          </div>
                        </>
                      )}
                      {(detailInst.status === "SCHEDULED" || detailInst.status === "IN_PROGRESS") && (
                        <div className="h-8 w-px bg-border" />
                      )}
                      {(detailInst.status === "SCHEDULED" || detailInst.status === "IN_PROGRESS") && (
                        <div>
                          {(() => {
                            const now = Date.now();
                            const scheduled = new Date(detailInst.scheduledDate).getTime();
                            const estimated = (detailInst.estimatedDurationHours || 2) * 3600 * 1000;
                            const deadline = scheduled + estimated;
                            const isOverdue = now > deadline;
                            return <Badge variant="outline" className={`text-xs ${isOverdue ? "bg-red-100 text-red-700 border-red-200" : "bg-yellow-100 text-yellow-700 border-yellow-200"}`}>{isOverdue ? "Overdue" : "In Progress"}</Badge>;
                          })()}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Status Actions */}
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Update Status</p>
                    <div className="flex flex-wrap gap-2">
                      {detailInst.status === "SCHEDULED" && (
                        <>
                          <Button size="sm" onClick={() => handleStatusChange("IN_PROGRESS")} className="bg-yellow-600 hover:bg-yellow-700 text-white">
                            <ChevronRight className="h-3 w-3 mr-1" /> Start
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setShowCancel(detailInst.id)}>Cancel</Button>
                        </>
                      )}
                      {detailInst.status === "IN_PROGRESS" && (
                        <>
                          <Button size="sm" onClick={() => handleStatusChange("COMPLETED")} className="bg-green-600 hover:bg-green-700 text-white">
                            <CheckCircle className="h-3 w-3 mr-1" /> Complete
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange("NO_SHOW")} className="text-red-600">
                            No Show
                          </Button>
                        </>
                      )}
                      {detailInst.status === "COMPLETED" && !avgRating && (
                        <Button size="sm" variant="outline" onClick={() => setShowFeedback(true)} className="text-yellow-600 border-yellow-300 hover:bg-yellow-50">
                          <Star className="h-3 w-3 mr-1" /> Rate Installation
                        </Button>
                      )}
                      {detailInst.status === "COMPLETED" && avgRating && (
                        <Button size="sm" variant="outline" onClick={() => setShowFeedback(true)} className="text-yellow-600 border-yellow-300 hover:bg-yellow-50">
                          <Star className="h-3 w-3 mr-1" /> Update Rating
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Equipment Allocation */}
                {(detailInst.status === "SCHEDULED" || detailInst.status === "IN_PROGRESS") && (
                  <Card className="border shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Allocated Equipment</p>
                        <Button size="sm" variant="outline" onClick={() => setShowEquipment(true)} className="h-7 text-xs">
                          <Plus className="h-3 w-3 mr-1" /> Allocate
                        </Button>
                      </div>
                      {(() => {
                        const eqIds = parseJsonArray(detailInst.equipmentIds);
                        if (eqIds.length === 0) return <p className="text-xs text-muted-foreground">No equipment allocated</p>;
                        return (
                          <div className="space-y-1">
                            {eqIds.map((eqId) => <AllocatedEquipmentRow key={eqId} equipmentId={eqId} />)}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}

                {/* Checklist */}
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Installation Checklist</p>
                    <div className="space-y-1.5">
                      {CHECKLIST_ITEMS.map((item) => (
                        <label key={item} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox checked={detailChecklist.includes(item)} onCheckedChange={() => handleChecklistToggle(item)} />
                          <span className={detailChecklist.includes(item) ? "line-through text-muted-foreground" : ""}>{item}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-[10px] text-muted-foreground">{detailChecklist.length}/{CHECKLIST_ITEMS.length} completed</p>
                      <Button size="sm" variant="outline" onClick={handleSaveChecklist} disabled={updateMutation.isPending} className="h-7 text-xs">
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Notes</p>
                    <Textarea value={detailNotes} onChange={(e) => setDetailNotes(e.target.value)} placeholder="Add notes..." rows={3} className="text-xs" />
                    <Button size="sm" variant="outline" onClick={handleSaveChecklist} disabled={updateMutation.isPending} className="h-7 text-xs mt-2">
                      {updateMutation.isPending ? "Saving..." : "Save Notes"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────
function EquipmentSelectCard({ equipment, onAllocate, isPending }: { equipment: EquipmentItem; onAllocate: (id: string) => void; isPending: boolean }) {
  return (
    <div className="flex items-center gap-3 p-2 border rounded-md hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{equipment.name}</p>
        <p className="text-[10px] text-muted-foreground">{equipment.category} · {equipment.serialNumber}</p>
        <p className="text-[10px] text-muted-foreground">{equipment.manufacturer} {equipment.model}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => onAllocate(equipment.id)} disabled={isPending} className="h-7 text-xs shrink-0">
        Allocate
      </Button>
    </div>
  );
}

function AllocatedEquipmentRow({ equipmentId }: { equipmentId: string }) {
  const { data: eq } = useQuery({
    queryKey: ["equipment-item", equipmentId],
    queryFn: () => apiFetch(`/api/equipment/${equipmentId}`),
    enabled: !!equipmentId,
  });
  if (!eq) return <div className="text-xs text-muted-foreground p-1">Loading equipment...</div>;
  const item = eq.equipment || eq;
  return (
    <div className="flex items-center gap-2 p-1.5 bg-muted/30 rounded text-xs">
      <span className="font-medium truncate">{item.name}</span>
      <Badge variant="secondary" className="text-[9px] shrink-0">{item.category}</Badge>
      <span className="text-muted-foreground shrink-0">{item.serialNumber}</span>
      <span className="text-muted-foreground shrink-0">{item.manufacturer} {item.model}</span>
      <Badge variant="outline" className="text-[9px] text-green-600 shrink-0">Deployed</Badge>
    </div>
  );
}
