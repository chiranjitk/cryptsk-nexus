"use client";

import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, Eye, Edit, Trash2, Star, Wrench, AlertTriangle,
  Download, ChevronLeft, ChevronRight, CheckSquare, Square,
  Send, FileText, X, Calendar as CalendarIcon, LayoutList,
  Clock, CalendarDays, ClipboardCheck, LogIn, LogOut, ShieldCheck, ChevronDown,
  Wallet, Award, UserPlus, Loader2, ChevronUp, Trash as TrashIcon, CircleDot,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Types ───────────────────────────────────────────────
interface Technician {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email: string;
  skills: string;
  areas: string;
  status: string;
  currentLocation: string;
  rating: number;
  totalResolved: number;
  avgResolutionTime: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  daysOff: string;
 monthlySalary: number;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfscCode: string;
  paymentMode: string;
  compensation: string;
  certifications: string;
  createdAt: string;
  user: { id: string; email: string; status: string; lastLoginAt: string | null } | null;
  areasManaged: { id: string; name: string; code: string }[];
  _count?: { complaints: number; installations: number };
}

interface TechnicianDetail extends Technician {
  complaints: { id: string; ticketNumber: string; status: string; type: string; priority: string; createdAt: string; subscriber: { id: string; name: string; code: string } | null; area: { id: string; name: string } | null }[];
  installations: { id: string; status: string; scheduledDate: string; subscriber: { id: string; name: string; code: string } | null; area: { id: string; name: string } | null }[];
}

interface TechnicianStats {
  resolvedComplaints: number;
  totalComplaints: number;
  completedInstallations: number;
  totalInstallations: number;
  avgResolutionMinutes: number;
  rating: number;
}

interface AnalyticsData {
  months: string[];
  complaintsPerMonth: number[];
  avgResolutionMinutes: number[];
}

interface SlaMetrics {
  technicianId: string;
  slaCompliancePercent: number;
  avgResolutionMinutes: number;
  escalationRate: number;
  totalResolved: number;
  totalComplaints: number;
  escalatedCount: number;
  resolvedWithinSla: number;
}

interface LeaveRecord {
  id: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  approvedBy: string | null;
  createdAt: string;
  technician: { id: string; name: string; phone: string };
}

interface AttendanceRecord {
  id: string;
  technicianId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  notes: string;
  technician: { id: string; name: string };
}

interface CalendarDay {
  date: string;
  day: number;
  complaints: { technician: string; ticketNumber: string; type: string; status: string; subscriber: string }[];
  installations: { technician: string; status: string; subscriber: string }[];
}

interface CalendarData {
  year: number;
  month: number;
  daysInMonth: number;
  firstDayOfWeek: number;
  calendar: Record<string, CalendarDay>;
  leaves: { id: string; technicianId: string; technicianName: string; startDate: string; endDate: string; reason: string; status: string }[];
  technicians: { id: string; name: string; status: string }[];
}

interface SubscriberOption {
  id: string;
  name: string;
  code: string;
}

interface AreaOption {
  id: string;
  name: string;
}

interface Compensation {
  basicSalary: number;
  hra: number;
  da: number;
  allowance: number;
  deduction: number;
}

interface Certification {
  name: string;
  issuer: string;
  validUntil: string;
  certificateNumber: string;
}

interface LoginResult {
  success: boolean;
  message: string;
  user: { id: string; email: string; role: string };
  defaultPassword: string;
}

// ─── Constants ───────────────────────────────────────────
const SKILL_OPTIONS = ["Fiber Splicing", "Router Config", "WiFi Setup", "Cable Laying", "ONT Setup", "Switch Config", "Network Debugging", "Customer Service"];
const STATUS_OPTIONS = ["available", "busy", "offline", "on-leave"];
const COMPLAINT_TYPES = ["NO_INTERNET", "SLOW_SPEED", "INTERMITTENT", "ROUTER_ISSUE", "BILLING", "FTTH", "WiFi", "OTHER"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STATUS_BADGE: Record<string, { label: string; cls: string; dot: string }> = {
  available: { label: "Available", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  busy: { label: "Busy", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  offline: { label: "Offline", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" },
  "on-leave": { label: "On Leave", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
};

const SKILL_COLORS: Record<string, string> = {
  "Fiber Splicing": "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  "Router Config": "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  "WiFi Setup": "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  "Cable Laying": "bg-stone-100 text-stone-700 dark:bg-stone-950/40 dark:text-stone-300",
  "ONT Setup": "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  "Switch Config": "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  "Network Debugging": "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  "Customer Service": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function isOnline(lastLoginAt: string | null): boolean {
  if (!lastLoginAt) return false;
  return Date.now() - new Date(lastLoginAt).getTime() < 2 * 60 * 60 * 1000;
}

const LEAVE_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-yellow-100 text-yellow-700" },
  APPROVED: { label: "Approved", cls: "bg-green-100 text-green-700" },
  REJECTED: { label: "Rejected", cls: "bg-red-100 text-red-700" },
};

const ATTENDANCE_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PRESENT: { label: "Present", cls: "bg-green-100 text-green-700" },
  ABSENT: { label: "Absent", cls: "bg-red-100 text-red-700" },
  HALF_DAY: { label: "Half Day", cls: "bg-orange-100 text-orange-700" },
  LATE: { label: "Late", cls: "bg-yellow-100 text-yellow-700" },
};

function parseSkills(skillsStr: string | null): string[] {
  if (!skillsStr) return [];
  try { const parsed = JSON.parse(skillsStr); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function parseDaysOff(daysOffStr: string | null): string[] {
  if (!daysOffStr) return [];
  try { const parsed = JSON.parse(daysOffStr); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function parseCompensation(str: string | null): Compensation {
  if (!str) return { basicSalary: 0, hra: 0, da: 0, allowance: 0, deduction: 0 };
  try { return JSON.parse(str); } catch { return { basicSalary: 0, hra: 0, da: 0, allowance: 0, deduction: 0 }; }
}

function parseCertifications(str: string | null): Certification[] {
  if (!str) return [];
  try { const parsed = JSON.parse(str); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function StatusDot({ status }: { status: string }) {
  const dotColor = STATUS_BADGE[status]?.dot || "bg-gray-400";
  return <span className={`inline-block h-2 w-2 rounded-full ${dotColor} ring-2 ring-white dark:ring-gray-900 shrink-0`} />;
}

function OnlineDot({ lastLoginAt }: { lastLoginAt: string | null }) {
  const online = isOnline(lastLoginAt);
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${online ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-gray-300"}`} />;
}

function SkillBadge({ skill }: { skill: string }) {
  return <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 font-medium ${SKILL_COLORS[skill] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>{skill}</Badge>;
}

// ─── Main Component ──────────────────────────────────────
export default function TechniciansPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // View mode: table or calendar
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calDayDetail, setCalDayDetail] = useState<CalendarDay | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);

  // Dispatch task
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchType, setDispatchType] = useState<"complaint" | "installation">("complaint");
  const [dispatchForm, setDispatchForm] = useState({
    type: "NO_INTERNET",
    priority: "P3_MEDIUM",
    description: "",
    subscriberId: "",
    walkInName: "",
    areaId: "",
    scheduledDate: new Date().toISOString().slice(0, 10),
    scheduledTime: "10:00",
  });

  // Leave & Availability
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ startDate: "", endDate: "", reason: "" });

  // Set Availability dialog
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [availabilityForm, setAvailabilityForm] = useState({ workingHoursStart: "", workingHoursEnd: "", daysOff: [] as string[] });

  // Attendance
  const [showCheckIn, setShowCheckIn] = useState(false);

  // Compensation
  const [showCompensationDialog, setShowCompensationDialog] = useState(false);
  const [compensationForm, setCompensationForm] = useState<Compensation>({ basicSalary: 0, hra: 0, da: 0, allowance: 0, deduction: 0 });

  // Bank Details
  const [showBankDialog, setShowBankDialog] = useState(false);
  const [bankForm, setBankForm] = useState({ bankAccountName: "", bankAccountNumber: "", bankIfscCode: "", paymentMode: "BANK_TRANSFER", monthlySalary: 0 });

  // Certifications
  const [showCertDialog, setShowCertDialog] = useState(false);
  const [certForm, setCertForm] = useState<Certification>({ name: "", issuer: "", validUntil: "", certificateNumber: "" });
  const [editingCertIdx, setEditingCertIdx] = useState<number | null>(null);

  // Create Login
  const [showLoginResult, setShowLoginResult] = useState<LoginResult | null>(null);

  // Weekly calendar state
  const [calWeekOffset, setCalWeekOffset] = useState(0);
  const [calendarView, setCalendarView] = useState<"monthly" | "weekly">("monthly");
  const [attendanceMonth, setAttendanceMonth] = useState(new Date().getMonth() + 1);
  const [attendanceYear, setAttendanceYear] = useState(new Date().getFullYear());
  const [showAttendanceStatusDialog, setShowAttendanceStatusDialog] = useState(false);
  const [attendanceStatusDate, setAttendanceStatusDate] = useState("");
  const [attendanceStatusValue, setAttendanceStatusValue] = useState("PRESENT");
  const [attendanceNotesValue, setAttendanceNotesValue] = useState("");

  // Set Availability handler
  const openAvailabilityDialog = () => {
    if (detailTech) {
      setAvailabilityForm({
        workingHoursStart: detailTech.workingHoursStart,
        workingHoursEnd: detailTech.workingHoursEnd,
        daysOff: parseDaysOff(detailTech.daysOff),
      });
    }
    setShowAvailabilityDialog(true);
  };

  const openCompensationDialog = () => {
    if (detailTech) {
      setCompensationForm(parseCompensation(detailTech.compensation || "{}"));
    }
    setShowCompensationDialog(true);
  };

  const openBankDialog = () => {
    if (detailTech) {
      setBankForm({
        bankAccountName: detailTech.bankAccountName || "",
        bankAccountNumber: detailTech.bankAccountNumber || "",
        bankIfscCode: detailTech.bankIfscCode || "",
        paymentMode: detailTech.paymentMode || "BANK_TRANSFER",
        monthlySalary: detailTech.monthlySalary || 0,
      });
    }
    setShowBankDialog(true);
  };

  const handleSaveBankDetails = () => {
    if (!showDetail) return;
    updateMutation.mutate(
      { id: showDetail, data: { ...bankForm } },
      { onSuccess: () => { setShowBankDialog(false); queryClient.invalidateQueries({ queryKey: ["technician-detail"] }); } },
    );
  };

  const handleSaveCompensation = () => {
    if (!showDetail) return;
    updateMutation.mutate(
      { id: showDetail, data: { compensation: compensationForm } },
      { onSuccess: () => { setShowCompensationDialog(false); queryClient.invalidateQueries({ queryKey: ["technician-detail"] }); } },
    );
  };

  const handleAddCert = () => {
    if (!showDetail) return;
    const certs = parseCertifications(detailTech?.certifications || "[]");
    if (editingCertIdx !== null) {
      certs[editingCertIdx] = certForm;
      setEditingCertIdx(null);
    } else {
      certs.push(certForm);
    }
    updateMutation.mutate(
      { id: showDetail, data: { certifications: certs } },
      { onSuccess: () => { setShowCertDialog(false); setCertForm({ name: "", issuer: "", validUntil: "", certificateNumber: "" }); queryClient.invalidateQueries({ queryKey: ["technician-detail"] }); } },
    );
  };

  const handleRemoveCert = (idx: number) => {
    if (!showDetail) return;
    const certs = parseCertifications(detailTech?.certifications || "[]");
    certs.splice(idx, 1);
    updateMutation.mutate(
      { id: showDetail, data: { certifications: certs } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["technician-detail"] }); } },
    );
  };

  const handleEditCert = (idx: number) => {
    const certs = parseCertifications(detailTech?.certifications || "[]");
    setCertForm(certs[idx]);
    setEditingCertIdx(idx);
    setShowCertDialog(true);
  };

  const handleSaveAvailability = () => {
    if (!showDetail) return;
    updateMutation.mutate(
      { id: showDetail, data: { workingHoursStart: availabilityForm.workingHoursStart, workingHoursEnd: availabilityForm.workingHoursEnd, daysOff: availabilityForm.daysOff } },
      { onSuccess: () => { setShowAvailabilityDialog(false); queryClient.invalidateQueries({ queryKey: ["technician-detail"] }); } },
    );
  };

  const handleToggleDayOff = (day: string) => {
    setAvailabilityForm((prev) => ({
      ...prev,
      daysOff: (prev.daysOff || []).includes(day) ? prev.daysOff.filter((d) => d !== day) : [...(prev.daysOff || []), day],
    }));
  };

  // Detail tabs
  const [detailTab, setDetailTab] = useState("overview");

  // Form state
  const emptyForm = { name: "", phone: "", email: "", skills: [] as string[], status: "available" };
  const [form, setForm] = useState(emptyForm);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Queries ──────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ["technicians", filterStatus, searchQuery, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (searchQuery) params.set("search", searchQuery);
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      return apiFetch(`/api/technicians?${params}`);
    },
  });

  const { data: detailData } = useQuery({
    queryKey: ["technician-detail", showDetail],
    queryFn: () => apiFetch(`/api/technicians/${showDetail}`),
    enabled: !!showDetail,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["technician-analytics", showDetail],
    queryFn: () => apiFetch<AnalyticsData>(`/api/technicians/${showDetail}/analytics`),
    enabled: !!showDetail,
  });

  const { data: slaData } = useQuery({
    queryKey: ["technician-sla", showDetail],
    queryFn: () => apiFetch<SlaMetrics>(`/api/technicians/sla?technicianId=${showDetail}`),
    enabled: !!showDetail && detailTab === "sla",
  });

  const { data: leaveRecordsData } = useQuery({
    queryKey: ["technician-leaves", showDetail],
    queryFn: () => apiFetch<{ records: LeaveRecord[] }>(`/api/technicians/leave?technicianId=${showDetail}`),
    enabled: !!showDetail && detailTab === "availability",
  });

  const { data: attendanceData } = useQuery({
    queryKey: ["technician-attendance", showDetail, attendanceMonth, attendanceYear],
    queryFn: () => apiFetch<{ records: AttendanceRecord[] }>(`/api/technicians/attendance?technicianId=${showDetail}&month=${attendanceMonth}&year=${attendanceYear}`),
    enabled: !!showDetail && detailTab === "attendance",
  });

  const { data: calendarData } = useQuery({
    queryKey: ["technician-calendar", calMonth, calYear],
    queryFn: () => apiFetch<CalendarData>(`/api/technicians/calendar?month=${calMonth}&year=${calYear}`),
    enabled: viewMode === "calendar",
  });

  // Fetch subscribers for dispatch dialog
  const { data: subscribersData } = useQuery({
    queryKey: ["subscribers-list"],
    queryFn: () => apiFetch<{ subscribers: SubscriberOption[] }>("/api/subscribers?limit=100"),
    enabled: showDispatch,
  });

  // Fetch areas for dispatch dialog
  const { data: areasData } = useQuery({
    queryKey: ["areas-list"],
    queryFn: () => apiFetch<AreaOption[]>("/api/areas?limit=100"),
    enabled: showDispatch,
  });

  // ─── Derived Data ──────────────────────────────────────

  const technicians: Technician[] = data?.technicians || [];
  const statusCounts: Record<string, number> = data?.statusCounts || {};
  const totalItems: number = data?.total || 0;
  const totalPages: number = data?.totalPages || 1;
  const detailTech: TechnicianDetail | null = (detailData?.technician as TechnicianDetail) || null;
  const detailStats: TechnicianStats | null = (detailData?.stats as TechnicianStats) || null;
  const subscribers: SubscriberOption[] = subscribersData?.subscribers || [];
  const areas: AreaOption[] = ((areasData as any)?.items || (areasData as any)?.areas || (Array.isArray(areasData) ? areasData as AreaOption[] : []));

  const chartData = analyticsData
    ? analyticsData.months.map((month, i) => ({
        month,
        complaints: analyticsData.complaintsPerMonth[i] || 0,
        avgTime: analyticsData.avgResolutionMinutes[i] || 0,
      }))
    : [];

  // ─── Handlers ──────────────────────────────────────────

  const handleFilterChange = (val: string) => { setFilterStatus(val); setPage(1); setSelectedIds(new Set()); };
  const handleSearchChange = (val: string) => { setSearchQuery(val); setPage(1); setSelectedIds(new Set()); };

  const allSelected = technicians.length > 0 && technicians.every((t) => selectedIds.has(t.id));
  const someSelected = technicians.some((t) => selectedIds.has(t.id)) && !allSelected;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(technicians.map((t) => t.id)));
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: (f: typeof form) => apiFetch("/api/technicians", { method: "POST", body: JSON.stringify(f) }),
    onSuccess: () => { toast.success("Technician added successfully"); queryClient.invalidateQueries({ queryKey: ["technicians"] }); setShowCreate(false); setForm(emptyForm); },
    onError: () => toast.error("Failed to add technician"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiFetch(`/api/technicians/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { toast.success("Technician updated successfully"); queryClient.invalidateQueries({ queryKey: ["technicians"] }); queryClient.invalidateQueries({ queryKey: ["technician-detail"] }); setEditId(null); setForm(emptyForm); },
    onError: () => toast.error("Failed to update technician"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/technicians/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Technician deleted"); queryClient.invalidateQueries({ queryKey: ["technicians"] }); setDeleteId(null); },
    onError: () => toast.error("Failed to delete technician"),
  });

  const bulkMutation = useMutation({
    mutationFn: (body: { action: string; ids: string[]; status?: string }) => apiFetch("/api/technicians/bulk", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res) => { toast.success(res.message || "Bulk action completed"); queryClient.invalidateQueries({ queryKey: ["technicians"] }); setSelectedIds(new Set()); setShowBulkDelete(false); setShowBulkStatus(false); setBulkStatus(null); },
    onError: () => toast.error("Bulk action failed"),
  });

  const dispatchComplaintMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const complaint = await apiFetch("/api/complaints", { method: "POST", body: JSON.stringify(body) });
      if (showDetail) { await apiFetch(`/api/complaints/${complaint.complaint.id}`, { method: "PUT", body: JSON.stringify({ assignedToId: showDetail, status: "ASSIGNED" }) }); }
      return complaint;
    },
    onSuccess: () => { toast.success("Complaint dispatched"); queryClient.invalidateQueries({ queryKey: ["technician-detail"] }); queryClient.invalidateQueries({ queryKey: ["technician-analytics"] }); queryClient.invalidateQueries({ queryKey: ["technicians"] }); setShowDispatch(false); },
    onError: () => toast.error("Failed to dispatch complaint"),
  });

  const dispatchInstallationMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/installations", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Installation dispatched"); queryClient.invalidateQueries({ queryKey: ["technician-detail"] }); queryClient.invalidateQueries({ queryKey: ["technicians"] }); setShowDispatch(false); },
    onError: () => toast.error("Failed to dispatch installation"),
  });

  // Leave mutation
  const leaveMutation = useMutation({
    mutationFn: (body: { technicianId: string; startDate: string; endDate: string; reason: string }) => apiFetch("/api/technicians/leave", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Leave applied"); queryClient.invalidateQueries({ queryKey: ["technician-leaves"] }); setShowLeaveDialog(false); setLeaveForm({ startDate: "", endDate: "", reason: "" }); },
    onError: () => toast.error("Failed to apply leave"),
  });

  const leaveStatusMutation = useMutation({
    mutationFn: (body: { id: string; status: string }) => apiFetch("/api/technicians/leave", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Leave updated"); queryClient.invalidateQueries({ queryKey: ["technician-leaves"] }); },
    onError: () => toast.error("Failed to update leave"),
  });

  // Attendance check-in/out mutation
  const attendanceMutation = useMutation({
    mutationFn: (body: { technicianId: string; date: string; action: string }) => apiFetch("/api/technicians/attendance", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Attendance recorded"); queryClient.invalidateQueries({ queryKey: ["technician-attendance"] }); },
    onError: () => toast.error("Failed to record attendance"),
  });

  const openEdit = (id: string) => {
    const tech = technicians.find((t) => t.id === id);
    if (tech) { setForm({ name: tech.name, phone: tech.phone, email: tech.email, skills: parseSkills(tech.skills), status: tech.status }); }
    setEditId(id);
  };
  const closeEdit = () => { setEditId(null); setForm(emptyForm); };

  const handleToggleSkill = (skill: string) => {
    setForm((prev) => ({ ...prev, skills: (prev.skills || []).includes(skill) ? prev.skills.filter((s) => s !== skill) : [...(prev.skills || []), skill] }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (editId) { updateMutation.mutate({ id: editId, data: form }, { onSuccess: () => closeEdit() }); }
    else { createMutation.mutate(form); }
  };

  const handleDispatchSubmit = () => {
    if (dispatchType === "complaint") {
      if (!dispatchForm.description.trim()) { toast.error("Description is required"); return; }
      dispatchComplaintMutation.mutate({ type: dispatchForm.type, priority: dispatchForm.priority, description: dispatchForm.description, subscriberId: dispatchForm.subscriberId || null, walkInName: dispatchForm.walkInName, areaId: dispatchForm.areaId || null });
    } else {
      if (!dispatchForm.subscriberId) { toast.error("Subscriber is required"); return; }
      dispatchInstallationMutation.mutate({ subscriberId: dispatchForm.subscriberId, technicianId: showDetail, areaId: dispatchForm.areaId || null, scheduledDate: dispatchForm.scheduledDate, scheduledTime: dispatchForm.scheduledTime });
    }
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (searchQuery) params.set("search", searchQuery);
    window.open(`/api/technicians/export?${params}`, "_blank");
    toast.success("Exporting CSV...");
  };

  const handleApplyLeave = () => {
    if (!showDetail || !leaveForm.startDate || !leaveForm.endDate) { toast.error("Start and end dates are required"); return; }
    leaveMutation.mutate({ technicianId: showDetail, startDate: leaveForm.startDate, endDate: leaveForm.endDate, reason: leaveForm.reason });
  };

  const handleCheckIn = () => {
    if (!showDetail) return;
    attendanceMutation.mutate({ technicianId: showDetail, date: new Date().toISOString().slice(0, 10), action: "checkin" });
    setShowCheckIn(false);
  };

  const handleCheckOut = () => {
    if (!showDetail) return;
    attendanceMutation.mutate({ technicianId: showDetail, date: new Date().toISOString().slice(0, 10), action: "checkout" });
  };

  // Calendar navigation
  const prevMonth = () => { if (calMonth === 1) { setCalMonth(12); setCalYear(calYear - 1); } else { setCalMonth(calMonth - 1); } };
  const nextMonth = () => { if (calMonth === 12) { setCalMonth(1); setCalYear(calYear + 1); } else { setCalMonth(calMonth + 1); } };

  // Weekly calendar helpers
  const getWeekDates = (offset: number) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + offset * 7);
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const weekDates = getWeekDates(calWeekOffset);
  const prevWeek = () => setCalWeekOffset((w) => w - 1);
  const nextWeek = () => setCalWeekOffset((w) => w + 1);
  const goToThisWeek = () => setCalWeekOffset(0);

  // Attendance calendar navigation
  const prevAttMonth = () => { if (attendanceMonth === 1) { setAttendanceMonth(12); setAttendanceYear(attendanceYear - 1); } else { setAttendanceMonth(attendanceMonth - 1); } };
  const nextAttMonth = () => { if (attendanceMonth === 12) { setAttendanceMonth(1); setAttendanceYear(attendanceYear + 1); } else { setAttendanceMonth(attendanceMonth + 1); } };

  // Attendance status mutation
  const attendanceStatusMutation = useMutation({
    mutationFn: (body: { technicianId: string; date: string; status: string; notes?: string }) =>
      apiFetch("/api/technicians/attendance", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Attendance updated"); queryClient.invalidateQueries({ queryKey: ["technician-attendance"] }); setShowAttendanceStatusDialog(false); },
    onError: () => toast.error("Failed to update attendance"),
  });

  const openAttendanceStatus = (dateStr: string, currentStatus?: string) => {
    setAttendanceStatusDate(dateStr);
    setAttendanceStatusValue(currentStatus || "PRESENT");
    setAttendanceNotesValue("");
    setShowAttendanceStatusDialog(true);
  };

  const handleSaveAttendanceStatus = () => {
    if (!showDetail || !attendanceStatusDate) return;
    attendanceStatusMutation.mutate({ technicianId: showDetail, date: attendanceStatusDate, status: attendanceStatusValue, notes: attendanceNotesValue });
  };

  // Create login mutation
  const createLoginMutation = useMutation({
    mutationFn: (techId: string) => apiFetch<LoginResult>(`/api/technicians/${techId}`, { method: "POST" }),
    onSuccess: (result) => { setShowLoginResult(result); queryClient.invalidateQueries({ queryKey: ["technician-detail"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to create login"),
  });

  // ─── Loading ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-40 mb-2" /><Skeleton className="skeleton-wave h-4 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-4 w-16 mb-2" /><Skeleton className="skeleton-wave h-7 w-12" /></CardContent></Card>)}
        </div>
        <Card className="border border-border/50 rounded-xl shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);

  function getPageRange(currentPage: number, tp: number): (number | string)[] {
    const pages: (number | string)[] = [];
    if (tp <= 7) { for (let i = 1; i <= tp; i++) pages.push(i); return pages; }
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(tp - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < tp - 2) pages.push("...");
    pages.push(tp);
    return pages;
  }

  // ─── Calendar Render ───────────────────────────────────
  const renderWeeklyCalendar = () => {
    const today = new Date().toISOString().slice(0, 10);
    const leaveDaysSet = new Set<string>();
    if (calendarData?.leaves) {
      for (const l of calendarData.leaves) {
        const start = new Date(l.startDate);
        const end = new Date(l.endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          leaveDaysSet.add(d.toISOString().slice(0, 10));
        }
      }
    }
    const cal = calendarData?.calendar || {};
    const timeSlots = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
    const weekRange = weekDates.length === 7
      ? `${weekDates[0].toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${weekDates[6].toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
      : "";

    return (
      <Card className="border border-border/50 rounded-xl shadow-sm">
        <CardHeader className="pb-2 px-4 pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-medium">Weekly Schedule</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={prevWeek}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-medium min-w-[200px] text-center">{weekRange}</span>
              <Button variant="outline" size="sm" onClick={nextWeek}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={goToThisWeek} className="text-xs">Today</Button>
              <div className="flex border rounded-md ml-2">
                <Button variant={calendarView === "weekly" ? "default" : "outline"} size="sm" className="rounded-r-none text-xs px-2" onClick={() => setCalendarView("weekly")}>Week</Button>
                <Button variant={calendarView === "monthly" ? "default" : "outline"} size="sm" className="rounded-l-none text-xs px-2" onClick={() => setCalendarView("monthly")}>Month</Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-8 gap-px bg-border rounded-t-md overflow-hidden">
                <div className="bg-muted/50 p-2 text-[10px] font-medium text-muted-foreground">Time</div>
                {weekDates.map((date, i) => {
                  const dateStr = date.toISOString().slice(0, 10);
                  const isToday = dateStr === today;
                  return (
                    <div key={i} className={`p-2 text-center ${isToday ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/30"}`}>
                      <p className="text-[10px] font-medium text-muted-foreground">{DAY_NAMES[i]}</p>
                      <p className={`text-sm font-bold ${isToday ? "text-red-600" : ""}`}>{date.getDate()}</p>
                    </div>
                  );
                })}
              </div>
              {timeSlots.map((time) => (
                <div key={time} className="grid grid-cols-8 gap-px bg-border">
                  <div className="bg-card p-1.5 text-[10px] text-muted-foreground font-mono flex items-start">{time}</div>
                  {weekDates.map((date, i) => {
                    const dateStr = date.toISOString().slice(0, 10);
                    const dayData = cal[dateStr];
                    const isToday = dateStr === today;
                    const isLeave = leaveDaysSet.has(dateStr);
                    const hasItems = (dayData?.complaints.length || 0) > 0 || (dayData?.installations.length || 0) > 0;
                    return (
                      <div key={i} className={`bg-card min-h-[48px] p-1 transition-colors hover:bg-muted/30 ${isToday ? "bg-red-50/30 dark:bg-red-950/10" : ""} ${isLeave ? "bg-yellow-50/30" : ""}`}>
                        {hasItems ? (
                          <div className="space-y-0.5">
                            {dayData!.complaints.slice(0, 1).map((c, ci) => (
                              <div key={`c-${ci}`} className="text-[8px] bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded px-1 py-0.5 truncate cursor-pointer" title={`${c.subscriber}: ${c.type}`} onClick={() => setCalDayDetail(dayData!)}>
                                {c.technician.split(" ")[0]} · {c.type.replace(/_/g, " ")}
                              </div>
                            ))}
                            {dayData!.installations.slice(0, 1).map((inst, ii) => (
                              <div key={`i-${ii}`} className="text-[8px] bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 rounded px-1 py-0.5 truncate" title={`Install: ${inst.subscriber}`}>
                                {inst.technician.split(" ")[0]} · Install
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderCalendar = () => {
    if (calendarView === "weekly") return renderWeeklyCalendar();

    if (!calendarData) return <Skeleton className="skeleton-wave h-96 w-full" />;
    const { firstDayOfWeek, daysInMonth } = calendarData;
    const cal = calendarData.calendar;
    const leaves = calendarData.leaves;
    const today = new Date().toISOString().slice(0, 10);
    const leaveDaysSet = new Set<string>();
    for (const l of leaves) {
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        leaveDaysSet.add(d.toISOString().slice(0, 10));
      }
    };

    const cells: React.ReactNode[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(<div key={`empty-${i}`} className="min-h-[80px] border border-dashed border-muted/30 rounded-md bg-muted/10" />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayData = cal[dateStr];
      const complaintCount = dayData?.complaints.length || 0;
      const installCount = dayData?.installations.length || 0;
      const isToday = dateStr === today;
      const isLeave = leaveDaysSet.has(dateStr);
      const hasActivity = complaintCount > 0 || installCount > 0;

      cells.push(
        <div
          key={dateStr}
          className={`min-h-[80px] border rounded-lg p-1.5 cursor-pointer transition-all duration-150 hover:shadow-sm hover:scale-[1.02] hover:border-foreground/20 ${isToday ? "bg-red-50 dark:bg-red-950/20 border-red-300 ring-1 ring-red-200 dark:ring-red-800" : isLeave ? "bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800" : "border-border hover:bg-muted/30"}`}
          onClick={() => hasActivity && setCalDayDetail(dayData || null)}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-semibold ${isToday ? "bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center" : "text-foreground/70"}`}>{d}</span>
            {isLeave && <span className="text-[9px] font-medium text-yellow-600 bg-yellow-100 dark:bg-yellow-900/40 rounded px-1">Leave</span>}
          </div>
          {hasActivity ? (
            <div className="space-y-0.5">
              {dayData!.complaints.slice(0, 2).map((c, i) => (
                <div key={`c-${i}`} className="text-[9px] text-muted-foreground truncate flex items-center gap-0.5" title={`${c.subscriber} - ${c.type}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" /> {c.technician}
                </div>
              ))}
              {(complaintCount + installCount) > 2 && <div className="text-[9px] text-muted-foreground font-medium">+{complaintCount + installCount - 2} more</div>}
            </div>
          ) : <p className="text-[9px] text-muted-foreground/30">—</p>}
        </div>
      );
    }

    return (
      <Card className="border border-border/50 rounded-xl shadow-sm">
        <CardHeader className="pb-2 px-4 pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-medium">Schedule Calendar</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-medium min-w-[140px] text-center">{MONTH_NAMES[calMonth - 1]} {calYear}</span>
              <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
              <div className="flex border rounded-md ml-2">
                <Button variant={(calendarView as string) === "weekly" ? "default" : "outline"} size="sm" className="rounded-r-none text-xs px-2" onClick={() => setCalendarView("weekly")}>Week</Button>
                <Button variant={(calendarView as string) === "monthly" ? "default" : "outline"} size="sm" className="rounded-l-none text-xs px-2" onClick={() => setCalendarView("monthly")}>Month</Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_NAMES.map((d) => <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">{cells}</div>
        </CardContent>
      </Card>
    );
  };

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in-0 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Technicians</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage field technicians and track performance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
          <Button onClick={() => { setForm(emptyForm); closeEdit(); setShowCreate(true); }} className="bg-red-600 hover:bg-red-700 text-white"><Plus className="h-4 w-4 mr-2" /> Add Technician</Button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4 flex items-center gap-3"><div className="flex flex-col"><p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Available</p><p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{statusCounts["available"] || 0}</p></div><div className="ml-auto h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg"><CircleDot className="h-5 w-5 text-white" /></div></CardContent></Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4 flex items-center gap-3"><div className="flex flex-col"><p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Busy</p><p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{statusCounts["busy"] || 0}</p></div><div className="ml-auto h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg"><Clock className="h-5 w-5 text-white" /></div></CardContent></Card>
        <Card className="bg-gradient-to-br from-slate-500/10 to-slate-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4 flex items-center gap-3"><div className="flex flex-col"><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Offline</p><p className="text-2xl font-bold text-slate-600 dark:text-slate-400">{statusCounts["offline"] || 0}</p></div><div className="ml-auto h-10 w-10 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-lg"><LogOut className="h-5 w-5 text-white" /></div></CardContent></Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4 flex items-center gap-3"><div className="flex flex-col"><p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">On Leave</p><p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{statusCounts["on-leave"] || 0}</p></div><div className="ml-auto h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg"><CalendarDays className="h-5 w-5 text-white" /></div></CardContent></Card>
      </div>

      {/* Search, Filter, View Toggle */}
      <Card className="border border-border/50 rounded-xl shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, phone, email..." value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={handleFilterChange}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="10">10 / page</SelectItem><SelectItem value="20">20 / page</SelectItem><SelectItem value="50">50 / page</SelectItem></SelectContent>
            </Select>
            <div className="flex border rounded-md">
              <Button variant={viewMode === "table" ? "default" : "outline"} size="sm" className="rounded-r-none" onClick={() => setViewMode("table")}><LayoutList className="h-4 w-4" /></Button>
              <Button variant={viewMode === "calendar" ? "default" : "outline"} size="sm" className="rounded-l-none" onClick={() => setViewMode("calendar")}><CalendarIcon className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 border border-border/50 rounded-xl">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Separator orientation="vertical" className="h-5" />
          <Button variant="outline" size="sm" onClick={() => setShowBulkStatus(true)}>Set Status</Button>
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setShowBulkDelete(true)}><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Bulk Delete</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}><X className="h-3.5 w-3.5 mr-1" /> Clear</Button>
        </div>
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && renderCalendar()}

      {/* Table View */}
      {viewMode === "table" && (
        <Card className="border border-border/50 rounded-xl shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-semibold text-xs uppercase tracking-wider w-10"><Checkbox checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={toggleSelectAll} /></TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">Technician</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">Availability</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">Skills</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">Rating</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">Resolved</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">Avg Time</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicians.length === 0 ? (
                  <TableRow><TableCell colSpan={9}>
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Wrench className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-semibold">No technicians found</p>
                      <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">Add your first field technician to start assigning complaints and installations.</p>
                      <div className="mt-4 flex justify-center">
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { setForm(emptyForm); closeEdit(); setShowCreate(true); }}>
                          <Plus className="h-4 w-4 mr-2" />Add Technician
                        </Button>
                      </div>
                    </div>
                  </TableCell></TableRow>
                ) : (
                  technicians.map((t, idx) => {
                    const daysOff = parseDaysOff(t.daysOff);
                    const isOnLeave = daysOff.includes(new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase());
                    return (
                    <TableRow key={t.id} className={`group border-l-[3px] ${t.status === "available" ? "border-l-emerald-500" : t.status === "busy" ? "border-l-blue-500" : t.status === "offline" ? "border-l-slate-400" : "border-l-amber-500"} hover:bg-muted/30 transition-all duration-150 ${selectedIds.has(t.id) ? "bg-muted/30" : ""}`} style={{ animationDelay: `${idx * 30}ms` }}>
                      <TableCell><Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Avatar className="h-8 w-8"><AvatarFallback className="bg-red-100 text-red-700 text-xs">{t.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback></Avatar>
                            <span className={`absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full border-2 border-background ${isOnline(t.user?.lastLoginAt ?? null) ? "bg-green-500" : "bg-gray-300"}`} />
                          </div>
                          <div><p className="text-xs font-medium">{t.name}</p><p className="text-[10px] text-muted-foreground">{t.phone || t.email}</p></div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status]?.cls || ""}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_BADGE[t.status]?.dot || "bg-gray-400"}`} />
                          {STATUS_BADGE[t.status]?.label || t.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px]">{t.workingHoursStart}–{t.workingHoursEnd}</span>
                          {isOnLeave && <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Leave</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {parseSkills(t.skills).slice(0, 2).map((s) => <SkillBadge key={s} skill={s} />)}
                          {parseSkills(t.skills).length > 2 && <Badge variant="secondary" className="text-[9px] px-1 py-0">+{parseSkills(t.skills).length - 2}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          <span className="text-xs font-semibold">{t.rating.toFixed(1)}</span>
                        </div>
                        <div className="mt-0.5 h-1 w-12 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-yellow-400 transition-all duration-500" style={{ width: `${Math.min(100, (t.rating / 5) * 100)}%` }} /></div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold min-w-[28px] h-6 px-1.5">{t.totalResolved}</span>
                        {t._count?.complaints ? (
                          <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500/10 text-red-700 dark:text-red-400 text-[10px] font-medium min-w-[20px] h-5 px-1">{t._count.complaints}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatMinutes(t.avgResolutionTime)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity duration-150">
                          <Button variant="ghost" size="sm" onClick={() => { setShowDetail(t.id); setDetailTab("overview"); }}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(t.id)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {viewMode === "table" && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Showing {totalItems === 0 ? 0 : startIdx + 1}–{endIdx} of {totalItems} technicians</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            {getPageRange(page, totalPages).map((p, i) => typeof p === "string" ? (<span key={`ellipsis-${i}`} className="px-2 text-sm text-muted-foreground">...</span>) : (
              <Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setPage(p)}>{p}</Button>
            ))}
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* ─── Create/Edit Dialog ──────────────────────── */}
      <Dialog open={showCreate || !!editId} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditId(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Technician" : "Add Technician"}</DialogTitle>
            <DialogDescription>{editId ? "Update technician information" : "Add a new field technician"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email address" /></div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Skills</Label>
              <div className="flex flex-wrap gap-2">{SKILL_OPTIONS.map((skill) => (
                <Badge key={skill} variant={(form.skills || []).includes(skill) ? "default" : "outline"} className={`cursor-pointer text-[10px] ${(form.skills || []).includes(skill) ? "bg-red-600 text-white hover:bg-red-700" : ""}`} onClick={() => handleToggleSkill(skill)}>{skill}</Badge>
              ))}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{createMutation.isPending || updateMutation.isPending ? "Saving..." : editId ? "Update" : "Add Technician"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ───────────────────────────── */}
      <Dialog open={!!showDetail} onOpenChange={() => { setShowDetail(null); setDetailTab("overview"); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" a11yTitle="Technician Details">
          {detailTech ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10"><AvatarFallback className="bg-red-100 text-red-700">{detailTech.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback></Avatar>
                    <OnlineDot lastLoginAt={detailTech.user?.lastLoginAt ?? null} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {detailTech.name}
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={detailTech.status} />
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[detailTech.status]?.cls || ""}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_BADGE[detailTech.status]?.dot || "bg-gray-400"}`} />
                          {STATUS_BADGE[detailTech.status]?.label || detailTech.status}
                        </span>
                      </div>
                      {isOnline(detailTech.user?.lastLoginAt ?? null) && <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><CircleDot className="h-2.5 w-2.5" />Online</span>}
                    </div>
                    <p className="text-xs text-muted-foreground font-normal">{detailTech.phone} · {detailTech.email}</p>
                  </div>
                </DialogTitle>
                <DialogDescription>Technician details and performance metrics</DialogDescription>
              </DialogHeader>

              <div className="flex gap-2 mb-2 flex-wrap">
                <Button variant="outline" size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => { setShowDispatch(true); setDispatchType("complaint"); }}><Send className="h-3.5 w-3.5 mr-1.5" /> Dispatch Complaint</Button>
                <Button variant="outline" size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => { setShowDispatch(true); setDispatchType("installation"); }}><Wrench className="h-3.5 w-3.5 mr-1.5" /> Dispatch Installation</Button>
                {!(detailTech.user?.email) || (detailTech.user?.email || "").includes("cryptsk.local") ? (
                  <Button variant="outline" size="sm" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => createLoginMutation.mutate(detailTech.id)} disabled={createLoginMutation.isPending}>
                    {createLoginMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />} Create Login
                  </Button>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200"><CircleDot className="h-2.5 w-2.5 mr-1" /> Login Active: {detailTech.user.email}</Badge>
                )}
              </div>

              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="sla">SLA Metrics</TabsTrigger>
                  <TabsTrigger value="availability">Availability</TabsTrigger>
                  <TabsTrigger value="attendance">Attendance</TabsTrigger>
                  <TabsTrigger value="compensation">Compensation</TabsTrigger>
                  <TabsTrigger value="certifications">Certifications</TabsTrigger>
                </TabsList>

                {/* ── Overview Tab ── */}
                <TabsContent value="overview" className="space-y-4 mt-3">
                  {detailStats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <Card className="border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-red-600">{detailStats.totalComplaints}</p><p className="text-[10px] text-muted-foreground mb-2">Total Complaints</p><div className="h-1 w-full rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-red-400" style={{ width: `${Math.min(100, detailStats.totalComplaints * 5)}%` }} /></div></CardContent></Card>
                      <Card className="border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-green-600">{detailStats.resolvedComplaints}</p><p className="text-[10px] text-muted-foreground mb-2">Resolved</p><div className="h-1 w-full rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-green-400" style={{ width: `${detailStats.totalComplaints > 0 ? Math.min(100, (detailStats.resolvedComplaints / detailStats.totalComplaints) * 100) : 0}%` }} /></div></CardContent></Card>
                      <Card className="border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-emerald-600">{detailStats.completedInstallations}</p><p className="text-[10px] text-muted-foreground mb-2">Installations</p><div className="h-1 w-full rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, detailStats.completedInstallations * 10)}%` }} /></div></CardContent></Card>
                      <Card className="border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-amber-600">{formatMinutes(detailStats.avgResolutionMinutes)}</p><p className="text-[10px] text-muted-foreground mb-2">Avg Resolution</p><div className="h-1 w-full rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, Math.max(0, 100 - detailStats.avgResolutionMinutes))}%` }} /></div></CardContent></Card>
                    </div>
                  )}
                  {chartData.length > 0 && (
                    <Card className="border border-border/50 rounded-xl shadow-sm">
                      <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-semibold">Performance Trends</CardTitle></CardHeader>
                      <CardContent className="px-4 pb-4 space-y-4">
                        <div><p className="text-xs text-muted-foreground mb-2">Complaints Resolved per Month</p><div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" className="opacity-30" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} formatter={(value: number) => [`${value} resolved`, "Complaints"]} /><Bar dataKey="complaints" fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
                        <div><p className="text-xs text-muted-foreground mb-2">Average Resolution Time</p><div className="h-48"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" className="opacity-30" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} formatter={(value: number) => [`${formatMinutes(value)}`, "Avg Time"]} /><Line type="monotone" dataKey="avgTime" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 4 }} /></LineChart></ResponsiveContainer></div></div>
                      </CardContent>
                    </Card>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Card className="border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200"><CardHeader className="pb-2 pt-3 px-3"><CardTitle className="text-xs font-medium text-muted-foreground">Skills</CardTitle></CardHeader><CardContent className="px-3 pb-3"><div className="flex flex-wrap gap-1.5">{parseSkills(detailTech.skills).length > 0 ? parseSkills(detailTech.skills).map((s) => <SkillBadge key={s} skill={s} />) : <p className="text-xs text-muted-foreground italic">No skills added</p>}</div></CardContent></Card>
                    <Card className="border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200"><CardHeader className="pb-2 pt-3 px-3"><CardTitle className="text-xs font-medium text-muted-foreground">Managed Areas</CardTitle></CardHeader><CardContent className="px-3 pb-3"><div className="flex flex-wrap gap-1.5">{detailTech.areasManaged.length > 0 ? detailTech.areasManaged.map((a) => <Badge key={a.id} variant="outline" className="text-[10px] bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-900/40 dark:text-stone-300">{a.name}</Badge>) : <p className="text-xs text-muted-foreground italic">No areas assigned</p>}</div></CardContent></Card>
                  </div>
                  <Card className="border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200"><CardHeader className="pb-2 px-3 pt-3"><CardTitle className="text-xs font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Recent Complaints</CardTitle></CardHeader><CardContent className="px-3 pb-3">{detailTech.complaints.length > 0 ? (<ScrollArea className="max-h-48"><Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Ticket</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Customer</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Status</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Date</TableHead></TableRow></TableHeader><TableBody>{detailTech.complaints.slice(0, 10).map((c) => (<TableRow key={c.id} className="hover:bg-muted/30 transition-colors"><TableCell className="font-mono text-[10px] text-red-600">{c.ticketNumber}</TableCell><TableCell className="text-[10px]">{c.subscriber?.name || "N/A"}</TableCell><TableCell className="text-[10px]"><Badge variant="outline" className="text-[9px] px-1 py-0">{c.status}</Badge></TableCell><TableCell className="text-[10px] text-muted-foreground">{formatDate(c.createdAt)}</TableCell></TableRow>))}</TableBody></Table></ScrollArea>) : <div className="py-4 flex flex-col items-center gap-1 text-muted-foreground"><AlertTriangle className="h-6 w-6 text-muted-foreground/40" /><p className="text-xs">No complaints yet</p></div>}</CardContent></Card>
                  <Card className="border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200"><CardHeader className="pb-2 px-3 pt-3"><CardTitle className="text-xs font-medium flex items-center gap-1"><Wrench className="h-3 w-3 text-emerald-500" /> Installations</CardTitle></CardHeader><CardContent className="px-3 pb-3">{detailTech.installations.length > 0 ? (<ScrollArea className="max-h-48"><Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Customer</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Area</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Status</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Date</TableHead></TableRow></TableHeader><TableBody>{detailTech.installations.slice(0, 10).map((inst) => (<TableRow key={inst.id} className="hover:bg-muted/30 transition-colors"><TableCell className="text-[10px]">{inst.subscriber?.name || "N/A"}</TableCell><TableCell className="text-[10px]">{inst.area?.name || "N/A"}</TableCell><TableCell className="text-[10px]"><Badge variant="outline" className="text-[9px] px-1 py-0">{inst.status}</Badge></TableCell><TableCell className="text-[10px] text-muted-foreground">{formatDate(inst.scheduledDate)}</TableCell></TableRow>))}</TableBody></Table></ScrollArea>) : <div className="py-4 flex flex-col items-center gap-1 text-muted-foreground"><Wrench className="h-6 w-6 text-muted-foreground/40" /><p className="text-xs">No installations yet</p></div>}</CardContent></Card>
                </TabsContent>

                {/* ── SLA Metrics Tab ── */}
                <TabsContent value="sla" className="space-y-4 mt-3">
                  {slaData ? (
                    <>
                      <Card className="border border-border/50 rounded-xl shadow-sm">
                        <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-red-500" /> SLA Compliance</CardTitle></CardHeader>
                        <CardContent className="px-4 pb-4 space-y-4">
                          <div>
                            <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">SLA Compliance Rate</span><span className={`text-sm font-bold ${slaData.slaCompliancePercent >= 90 ? "text-green-600" : slaData.slaCompliancePercent >= 70 ? "text-yellow-600" : "text-red-600"}`}>{slaData.slaCompliancePercent}%</span></div>
                            <Progress value={slaData.slaCompliancePercent} className={`h-2 ${slaData.slaCompliancePercent >= 90 ? "[&>div]:bg-green-500" : slaData.slaCompliancePercent >= 70 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"}`} />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">Avg Resolution Time</span><span className="text-sm font-bold">{formatMinutes(slaData.avgResolutionMinutes)}</span></div>
                            <Progress value={Math.min(100, slaData.avgResolutionMinutes <= 60 ? 100 : Math.max(0, 100 - (slaData.avgResolutionMinutes - 60) * 2))} className="h-2 [&>div]:bg-amber-500" />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">Escalation Rate (Reopened)</span><span className={`text-sm font-bold ${slaData.escalationRate <= 10 ? "text-green-600" : slaData.escalationRate <= 25 ? "text-yellow-600" : "text-red-600"}`}>{slaData.escalationRate}%</span></div>
                            <Progress value={Math.min(100, 100 - slaData.escalationRate * 3)} className={`h-2 ${slaData.escalationRate <= 10 ? "[&>div]:bg-green-500" : "[&>div]:bg-red-500"}`} />
                          </div>
                        </CardContent>
                      </Card>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Card className="border border-border/50 rounded-xl shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-foreground">{slaData.totalResolved}</p><p className="text-[10px] text-muted-foreground">Resolved</p></CardContent></Card>
                        <Card className="border border-border/50 rounded-xl shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-foreground">{slaData.resolvedWithinSla}</p><p className="text-[10px] text-muted-foreground">Within SLA</p></CardContent></Card>
                        <Card className="border border-border/50 rounded-xl shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-red-600">{slaData.escalatedCount}</p><p className="text-[10px] text-muted-foreground">Escalated</p></CardContent></Card>
                        <Card className="border border-border/50 rounded-xl shadow-sm"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-foreground">{slaData.totalComplaints}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
                      </div>
                    </>
                  ) : <div className="py-8"><Skeleton className="skeleton-wave h-40 w-full" /></div>}
                </TabsContent>

                {/* ── Availability Tab ── */}
                <TabsContent value="availability" className="space-y-4 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="border border-border/50 rounded-xl shadow-sm">
                      <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-medium flex items-center gap-2"><CalendarDays className="h-4 w-4 text-red-500" /> Working Hours</CardTitle></CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="flex justify-end mb-2"><Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={openAvailabilityDialog}><Clock className="h-3 w-3 mr-1.5" /> Set Availability</Button></div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div><p className="text-xs text-muted-foreground mb-1">Start</p><p className="font-medium">{detailTech.workingHoursStart}</p></div>
                          <div><p className="text-xs text-muted-foreground mb-1">End</p><p className="font-medium">{detailTech.workingHoursEnd}</p></div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border border-border/50 rounded-xl shadow-sm">
                      <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-medium flex items-center gap-2">Quick Status</CardTitle></CardHeader>
                      <CardContent className="px-4 pb-4 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {["available", "busy", "offline", "on-leave"].map((s) => (
                            <Badge
                              key={s}
                              variant={detailTech.status === s ? "default" : "outline"}
                              className={`cursor-pointer text-[10px] ${detailTech.status === s ? "bg-red-600 text-white hover:bg-red-700" : ""}`}
                              onClick={() => updateMutation.mutate({ id: detailTech.id, data: { status: s } })}
                            >
                              {STATUS_BADGE[s]?.label || s}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground">Click to change status</p>
                        <p className="text-xs">Current: <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[detailTech.status]?.cls || ""}`}><span className={`h-1.5 w-1.5 rounded-full ${STATUS_BADGE[detailTech.status]?.dot || "bg-gray-400"}`} />{STATUS_BADGE[detailTech.status]?.label || detailTech.status}</span></p>
                      </CardContent>
                    </Card>
                  </div>
                  <Card className="border border-border/50 rounded-xl shadow-sm">
                    <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-medium flex items-center gap-2">Days Off</CardTitle></CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="flex flex-wrap gap-1.5">
                        {parseDaysOff(detailTech.daysOff).length > 0 ? parseDaysOff(detailTech.daysOff).map((d) => <Badge key={d} variant="secondary" className="text-[10px] capitalize bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{d}</Badge>) : <span className="text-xs text-muted-foreground">No days off configured</span>}
                      </div>
                    </CardContent>
                  </Card>
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold">Leave Records</h3>
                    <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => setShowLeaveDialog(true)}>Apply Leave</Button>
                  </div>
                  {leaveRecordsData ? (
                    leaveRecordsData.records.length > 0 ? (
                      <ScrollArea className="max-h-64">
                        <Table>
                          <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="font-semibold text-[10px] uppercase tracking-wider">From</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">To</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Reason</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Status</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Actions</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {leaveRecordsData.records.map((lr) => (
                              <TableRow key={lr.id}>
                                <TableCell className="text-[10px]">{formatDate(lr.startDate)}</TableCell>
                                <TableCell className="text-[10px]">{formatDate(lr.endDate)}</TableCell>
                                <TableCell className="text-[10px] max-w-[120px] truncate">{lr.reason || "—"}</TableCell>
                                <TableCell><Badge variant="outline" className={`text-[9px] px-1 py-0 ${LEAVE_STATUS_BADGE[lr.status]?.cls || ""}`}>{LEAVE_STATUS_BADGE[lr.status]?.label || lr.status}</Badge></TableCell>
                                <TableCell>
                                  {lr.status === "PENDING" && (
                                    <div className="flex gap-1">
                                      <Button variant="outline" size="sm" className="h-6 text-[9px] px-2" onClick={() => leaveStatusMutation.mutate({ id: lr.id, status: "APPROVED" })}>Approve</Button>
                                      <Button variant="outline" size="sm" className="h-6 text-[9px] px-2 text-red-600" onClick={() => leaveStatusMutation.mutate({ id: lr.id, status: "REJECTED" })}>Reject</Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    ) : <p className="text-xs text-muted-foreground py-4 italic">No leave records</p>
                  ) : <div className="py-4"><Skeleton className="skeleton-wave h-32 w-full" /></div>}
                </TabsContent>

                {/* ── Attendance Tab ── */}
                <TabsContent value="attendance" className="space-y-4 mt-3">
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={handleCheckIn}><LogIn className="h-3.5 w-3.5 mr-1.5" /> Check In</Button>
                    <Button size="sm" variant="outline" onClick={handleCheckOut}><LogOut className="h-3.5 w-3.5 mr-1.5" /> Check Out</Button>
                    <div className="ml-auto flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={prevAttMonth}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                      <span className="text-xs font-medium min-w-[100px] text-center">{MONTH_NAMES[attendanceMonth - 1]} {attendanceYear}</span>
                      <Button variant="outline" size="sm" onClick={nextAttMonth}><ChevronRight className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  {attendanceData ? (
                    <Card className="border border-border/50 rounded-xl shadow-sm">
                    <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-medium flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-red-500" /> Monthly Attendance</CardTitle></CardHeader>
                    <CardContent className="px-4 pb-4">
                      {(() => {
                        const records = attendanceData.records;
                        const presentCount = records.filter((r) => r.status === "PRESENT").length;
                        const absentCount = records.filter((r) => r.status === "ABSENT").length;
                        const lateCount = records.filter((r) => r.status === "LATE").length;
                        const halfDayCount = records.filter((r) => r.status === "HALF_DAY").length;
                        const recordByDate: Record<string, AttendanceRecord> = {};
                        for (const r of records) { recordByDate[new Date(r.date).toISOString().slice(0, 10)] = r; }
                        const daysInAttMonth = new Date(attendanceYear, attendanceMonth, 0).getDate();
                        const firstDayOfAttMonth = new Date(attendanceYear, attendanceMonth - 1, 1).getDay();
                        const todayStr = new Date().toISOString().slice(0, 10);
                        const attCells: React.ReactNode[] = [];
                        for (let i = 0; i < firstDayOfAttMonth; i++) attCells.push(<div key={`e-${i}`} className="min-h-[52px] rounded border border-dashed border-muted/20" />);
                        for (let d = 1; d <= daysInAttMonth; d++) {
                          const dateStr = `${attendanceYear}-${String(attendanceMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                          const rec = recordByDate[dateStr];
                          const statusColor = rec ? (rec.status === "PRESENT" ? "bg-green-100 dark:bg-green-950/30 border-green-200" : rec.status === "ABSENT" ? "bg-red-100 dark:bg-red-950/30 border-red-200" : rec.status === "HALF_DAY" ? "bg-orange-100 dark:bg-orange-950/30 border-orange-200" : "bg-yellow-100 dark:bg-yellow-950/30 border-yellow-200") : "border border-muted/30";
                          const isToday = dateStr === todayStr;
                          attCells.push(
                            <div key={dateStr} className={`min-h-[52px] rounded p-1 cursor-pointer transition-colors hover:ring-2 hover:ring-primary/30 ${statusColor} ${isToday ? "ring-2 ring-primary" : ""}`} onClick={() => openAttendanceStatus(dateStr, rec?.status)}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[10px] font-medium">{d}</span>
                                {rec && <span className={`text-[8px] font-semibold ${rec.status === "PRESENT" ? "text-green-700" : rec.status === "ABSENT" ? "text-red-700" : rec.status === "HALF_DAY" ? "text-orange-700" : "text-yellow-700"}`}>{rec.status === "HALF_DAY" ? "HD" : rec.status.slice(0, 1)}</span>}
                              </div>
                              {rec && <p className="text-[8px] text-muted-foreground truncate">{formatTime(rec.checkIn)}{rec.checkOut ? `–${formatTime(rec.checkOut)}` : ""}</p>}
                            </div>,
                          );
                        }
                        return (
                          <>
                            <div className="grid grid-cols-4 gap-3 mb-4">
                              <div className="text-center"><p className="text-lg font-bold text-green-600">{presentCount}</p><p className="text-[10px] text-muted-foreground">Present</p></div>
                              <div className="text-center"><p className="text-lg font-bold text-red-600">{absentCount}</p><p className="text-[10px] text-muted-foreground">Absent</p></div>
                              <div className="text-center"><p className="text-lg font-bold text-yellow-600">{lateCount}</p><p className="text-[10px] text-muted-foreground">Late</p></div>
                              <div className="text-center"><p className="text-lg font-bold text-orange-600">{halfDayCount}</p><p className="text-[10px] text-muted-foreground">Half Day</p></div>
                            </div>
                            <div className="mb-4">
                              <div className="grid grid-cols-7 gap-1 mb-1">{DAY_NAMES.map((d) => <div key={d} className="text-center text-[9px] font-medium text-muted-foreground py-0.5">{d}</div>)}</div>
                              <div className="grid grid-cols-7 gap-1">{attCells}</div>
                            </div>
                            {records.length > 0 ? (
                              <ScrollArea className="max-h-48">
                                <Table>
                                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Date</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Check In</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Check Out</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Status</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Notes</TableHead></TableRow></TableHeader>
                                  <TableBody>
                                    {records.map((r) => (
                                      <TableRow key={r.id}>
                                        <TableCell className="text-[10px]">{formatDate(r.date)}</TableCell>
                                        <TableCell className="text-[10px] tabular-nums">{formatTime(r.checkIn)}</TableCell>
                                        <TableCell className="text-[10px] tabular-nums">{formatTime(r.checkOut)}</TableCell>
                                        <TableCell><Badge variant="outline" className={`text-[9px] px-1 py-0 ${ATTENDANCE_STATUS_BADGE[r.status]?.cls || ""}`}>{ATTENDANCE_STATUS_BADGE[r.status]?.label || r.status}</Badge></TableCell>
                                        <TableCell className="text-[10px] text-muted-foreground max-w-[120px] truncate">{r.notes || "—"}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </ScrollArea>
                            ) : <p className="text-xs text-muted-foreground italic">No attendance records this month</p>}
                          </>
                        );
                      })()}
                    </CardContent>
                    </Card>
                  ) : <div className="py-4"><Skeleton className="skeleton-wave h-40 w-full" /></div>}
                </TabsContent>

                {/* ── Compensation Tab ── */}
                <TabsContent value="compensation" className="space-y-4 mt-3">
                  {detailTech && (() => {
                    const comp = parseCompensation(detailTech.compensation || "{}");
                    const gross = comp.basicSalary + comp.hra + comp.da + comp.allowance;
                    const net = gross - comp.deduction;
                    return (
                      <>
                        <Card className="border border-border/50 rounded-xl shadow-sm">
                          <CardHeader className="pb-2 px-4 pt-4">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm font-medium flex items-center gap-2"><Wallet className="h-4 w-4 text-red-500" /> Salary Breakdown</CardTitle>
                              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={openCompensationDialog}><Edit className="h-3 w-3 mr-1.5" /> Edit</Button>
                            </div>
                          </CardHeader>
                          <CardContent className="px-4 pb-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Basic Salary</span><span className="font-medium">{formatINR(comp.basicSalary)}</span></div>
                              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">HRA</span><span className="font-medium">{formatINR(comp.hra)}</span></div>
                              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">DA</span><span className="font-medium">{formatINR(comp.da)}</span></div>
                              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Allowance</span><span className="font-medium">{formatINR(comp.allowance)}</span></div>
                              <Separator />
                              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Gross</span><span className="font-bold">{formatINR(gross)}</span></div>
                              <div className="flex items-center justify-between text-sm text-red-600"><span className="text-muted-foreground">Deduction</span><span className="font-medium">-{formatINR(comp.deduction)}</span></div>
                              <Separator />
                              <div className="flex items-center justify-between text-lg"><span className="font-semibold">Net Pay</span><span className="font-bold text-green-600">{formatINR(net)}</span></div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="border border-border/50 rounded-xl shadow-sm">
                          <CardHeader className="pb-2 px-4 pt-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-xs font-medium text-muted-foreground">Bank Details</CardTitle>
                              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={openBankDialog}><Edit className="h-3 w-3 mr-1.5" /> Edit</Button>
                            </div>
                          </CardHeader>
                          <CardContent className="px-4 pb-3 space-y-1">
                            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Bank</span><span className="font-medium">{detailTech.bankAccountName || "—"}</span></div>
                            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Account</span><span className="font-mono text-xs">{detailTech.bankAccountNumber || "—"}</span></div>
                            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">IFSC</span><span className="font-mono text-xs">{detailTech.bankIfscCode || "—"}</span></div>
                            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Payment Mode</span><span className="font-medium">{detailTech.paymentMode || "—"}</span></div>
                          </CardContent>
                        </Card>
                      </>
                    );
                  })()}
                </TabsContent>

                {/* ── Certifications Tab ── */}
                <TabsContent value="certifications" className="space-y-4 mt-3">
                  {detailTech && (() => {
                    const certs = parseCertifications(detailTech.certifications || "[]");
                    return (
                      <>
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-semibold flex items-center gap-2"><Award className="h-4 w-4 text-red-500" /> Certifications ({certs.length})</h3>
                          <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => { setCertForm({ name: "", issuer: "", validUntil: "", certificateNumber: "" }); setEditingCertIdx(null); setShowCertDialog(true); }}>Add Cert</Button>
                        </div>
                        {certs.length > 0 ? (
                          <ScrollArea className="max-h-96">
                            <div className="space-y-2">
                              {certs.map((cert, idx) => {
                                const isExpired = cert.validUntil && new Date(cert.validUntil) < new Date();
                                const isExpiringSoon = cert.validUntil && !isExpired && new Date(cert.validUntil).getTime() - Date.now() < 90 * 24 * 3600 * 1000;
                                return (
                                  <Card key={idx} className={`border shadow-sm hover:shadow-md transition-all duration-200 ${isExpired ? "border-red-200 bg-red-50/50" : isExpiringSoon ? "border-yellow-200 bg-yellow-50/50" : ""}`}>
                                    <CardContent className="p-3">
                                      <div className="flex items-start justify-between">
                                        <div className="space-y-1 flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold">{cert.name}</p>
                                            {isExpired && <Badge className="text-[9px] bg-red-100 text-red-700">Expired</Badge>}
                                            {isExpiringSoon && <Badge className="text-[9px] bg-yellow-100 text-yellow-700">Expiring Soon</Badge>}
                                          </div>
                                          <p className="text-xs text-muted-foreground">Issued by: {cert.issuer}</p>
                                          {cert.certificateNumber && <p className="text-xs text-muted-foreground font-mono">Cert #: {cert.certificateNumber}</p>}
                                          {cert.validUntil && <p className="text-xs text-muted-foreground">Valid until: {formatDate(cert.validUntil)}</p>}
                                        </div>
                                        <div className="flex gap-1 shrink-0 ml-2">
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEditCert(idx)}><Edit className="h-3 w-3" /></Button>
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleRemoveCert(idx)}><TrashIcon className="h-3 w-3" /></Button>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        ) : (
                          <Card className="border border-border/50 rounded-xl shadow-sm"><CardContent className="p-8 text-center"><Award className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-sm font-medium text-muted-foreground">No certifications added yet</p><p className="text-xs text-muted-foreground/60 mt-1">Click "Add Cert" to get started</p></CardContent></Card>
                        )}
                      </>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            </>
          ) : <div className="py-12"><Skeleton className="skeleton-wave h-40 w-full" /></div>}
        </DialogContent>
      </Dialog>

      {/* ─── Calendar Day Detail Dialog ────────────────── */}
      <Dialog open={!!calDayDetail} onOpenChange={() => setCalDayDetail(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Schedule for {calDayDetail?.date}</DialogTitle>
          </DialogHeader>
          {calDayDetail && (
            <div className="space-y-4">
              {calDayDetail.complaints.length > 0 && (
                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardHeader className="pb-2 pt-3 px-3"><CardTitle className="text-xs font-medium text-red-600">Complaints ({calDayDetail.complaints.length})</CardTitle></CardHeader>
                  <CardContent className="px-3 pb-3">
                    <ScrollArea className="max-h-48">
                      <Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Technician</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Ticket</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Type</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Customer</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Status</TableHead></TableRow></TableHeader>
                      <TableBody>{calDayDetail.complaints.map((c, i) => (<TableRow key={i}><TableCell className="text-[10px]">{c.technician}</TableCell><TableCell className="text-[10px] font-mono text-red-600">{c.ticketNumber}</TableCell><TableCell className="text-[10px]">{c.type}</TableCell><TableCell className="text-[10px]">{c.subscriber}</TableCell><TableCell className="text-[10px]"><Badge variant="outline" className="text-[9px] px-1 py-0">{c.status}</Badge></TableCell></TableRow>))}</TableBody></Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
              {calDayDetail.installations.length > 0 && (
                <Card className="border border-border/50 rounded-xl shadow-sm">
                  <CardHeader className="pb-2 pt-3 px-3"><CardTitle className="text-xs font-medium text-emerald-600">Installations ({calDayDetail.installations.length})</CardTitle></CardHeader>
                  <CardContent className="px-3 pb-3">
                    <ScrollArea className="max-h-48">
                      <Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Technician</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Status</TableHead><TableHead className="font-semibold text-[10px] uppercase tracking-wider">Customer</TableHead></TableRow></TableHeader>
                      <TableBody>{calDayDetail.installations.map((inst, i) => (<TableRow key={i}><TableCell className="text-[10px]">{inst.technician}</TableCell><TableCell className="text-[10px]"><Badge variant="outline" className="text-[9px] px-1 py-0">{inst.status}</Badge></TableCell><TableCell className="text-[10px]">{inst.subscriber}</TableCell></TableRow>))}</TableBody></Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Leave Dialog ─────────────────────────────── */}
      <Dialog open={showLeaveDialog} onOpenChange={() => setShowLeaveDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Apply Leave</DialogTitle><DialogDescription>Submit a leave request for this technician</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Start Date *</Label><Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} /></div>
            <div className="space-y-2"><Label>End Date *</Label><Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} min={leaveForm.startDate} /></div>
            <div className="space-y-2"><Label>Reason</Label><Textarea value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Optional reason" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>Cancel</Button>
            <Button onClick={handleApplyLeave} disabled={leaveMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{leaveMutation.isPending ? "Submitting..." : "Submit Leave"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Set Availability Dialog ─────────────────── */}
      <Dialog open={showAvailabilityDialog} onOpenChange={() => setShowAvailabilityDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Set Availability</DialogTitle><DialogDescription>Configure working hours and days off for this technician</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Start Time</Label><Input type="time" value={availabilityForm.workingHoursStart} onChange={(e) => setAvailabilityForm({ ...availabilityForm, workingHoursStart: e.target.value })} /></div>
              <div className="space-y-2"><Label>End Time</Label><Input type="time" value={availabilityForm.workingHoursEnd} onChange={(e) => setAvailabilityForm({ ...availabilityForm, workingHoursEnd: e.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Days Off</Label>
              <div className="flex flex-wrap gap-2">
                {["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => (
                  <Badge key={day} variant={(availabilityForm.daysOff || []).includes(day) ? "default" : "outline"} className={`cursor-pointer text-[10px] capitalize ${(availabilityForm.daysOff || []).includes(day) ? "bg-red-600 text-white hover:bg-red-700" : ""}`} onClick={() => handleToggleDayOff(day)}>{day.slice(0, 3)}</Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAvailabilityDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveAvailability} disabled={updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{updateMutation.isPending ? "Saving..." : "Save Availability"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dispatch Dialog ──────────────────────────── */}
      <Dialog open={showDispatch} onOpenChange={(open) => { if (!open) setShowDispatch(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Dispatch {dispatchType === "complaint" ? "Complaint" : "Installation"}</DialogTitle><DialogDescription>Create and assign a task</DialogDescription></DialogHeader>
          {dispatchType === "complaint" ? (
            <div className="space-y-4">
              <div className="space-y-2"><Label>Type *</Label><Select value={dispatchForm.type} onValueChange={(v) => setDispatchForm({ ...dispatchForm, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COMPLAINT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Priority *</Label><Select value={dispatchForm.priority} onValueChange={(v) => setDispatchForm({ ...dispatchForm, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="P1_CRITICAL">P1 Critical</SelectItem><SelectItem value="P2_HIGH">P2 High</SelectItem><SelectItem value="P3_MEDIUM">P3 Medium</SelectItem><SelectItem value="P4_LOW">P4 Low</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Description *</Label><Textarea value={dispatchForm.description} onChange={(e) => setDispatchForm({ ...dispatchForm, description: e.target.value })} placeholder="Describe the issue" rows={3} /></div>
              <div className="space-y-2"><Label>Subscriber</Label><Select value={dispatchForm.subscriberId} onValueChange={(v) => setDispatchForm({ ...dispatchForm, subscriberId: v })}><SelectTrigger><SelectValue placeholder="Select subscriber" /></SelectTrigger><SelectContent>{subscribers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Walk-in Name</Label><Input value={dispatchForm.walkInName} onChange={(e) => setDispatchForm({ ...dispatchForm, walkInName: e.target.value })} placeholder="Walk-in customer name" /></div>
              <div className="space-y-2"><Label>Area</Label><Select value={dispatchForm.areaId} onValueChange={(v) => setDispatchForm({ ...dispatchForm, areaId: v })}><SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger><SelectContent>{areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2"><Label>Subscriber *</Label><Select value={dispatchForm.subscriberId} onValueChange={(v) => setDispatchForm({ ...dispatchForm, subscriberId: v })}><SelectTrigger><SelectValue placeholder="Select subscriber" /></SelectTrigger><SelectContent>{subscribers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Area</Label><Select value={dispatchForm.areaId} onValueChange={(v) => setDispatchForm({ ...dispatchForm, areaId: v })}><SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger><SelectContent>{areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Scheduled Date *</Label><Input type="date" value={dispatchForm.scheduledDate} onChange={(e) => setDispatchForm({ ...dispatchForm, scheduledDate: e.target.value })} /></div>
                <div className="space-y-2"><Label>Scheduled Time</Label><Input type="time" value={dispatchForm.scheduledTime} onChange={(e) => setDispatchForm({ ...dispatchForm, scheduledTime: e.target.value })} /></div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setShowDispatch(false)}>Cancel</Button><Button onClick={handleDispatchSubmit} disabled={dispatchComplaintMutation.isPending || dispatchInstallationMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{dispatchComplaintMutation.isPending || dispatchInstallationMutation.isPending ? "Dispatching..." : "Dispatch"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Status Dialog ────────────────────── */}
      <Dialog open={showBulkStatus} onOpenChange={() => setShowBulkStatus(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Set Status</DialogTitle><DialogDescription>Change status for {selectedIds.size} technicians</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>New Status</Label><Select value={bulkStatus || ""} onValueChange={setBulkStatus}><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowBulkStatus(false)}>Cancel</Button><Button disabled={!bulkStatus} onClick={() => { if (bulkStatus) bulkMutation.mutate({ action: "set-status", ids: Array.from(selectedIds), status: bulkStatus }); }} className="bg-red-600 hover:bg-red-700 text-white">Update</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Delete Dialog ───────────────────── */}
      <AlertDialog open={showBulkDelete} onOpenChange={() => setShowBulkDelete(false)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Technicians</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete {selectedIds.size} technicians? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => bulkMutation.mutate({ action: "bulk-delete", ids: Array.from(selectedIds) })} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Dialog ──────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Technician</AlertDialogTitle><AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* ─── Compensation Dialog ─────────────────── */}
      <Dialog open={showCompensationDialog} onOpenChange={() => setShowCompensationDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Compensation</DialogTitle><DialogDescription>Update salary breakdown for this technician</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Basic Salary</Label><Input type="number" value={compensationForm.basicSalary || ""} onChange={(e) => setCompensationForm({ ...compensationForm, basicSalary: parseFloat(e.target.value) || 0 })} placeholder="0" /></div>
            <div className="space-y-1"><Label className="text-xs">HRA</Label><Input type="number" value={compensationForm.hra || ""} onChange={(e) => setCompensationForm({ ...compensationForm, hra: parseFloat(e.target.value) || 0 })} placeholder="0" /></div>
            <div className="space-y-1"><Label className="text-xs">DA</Label><Input type="number" value={compensationForm.da || ""} onChange={(e) => setCompensationForm({ ...compensationForm, da: parseFloat(e.target.value) || 0 })} placeholder="0" /></div>
            <div className="space-y-1"><Label className="text-xs">Allowance</Label><Input type="number" value={compensationForm.allowance || ""} onChange={(e) => setCompensationForm({ ...compensationForm, allowance: parseFloat(e.target.value) || 0 })} placeholder="0" /></div>
            <div className="space-y-1"><Label className="text-xs">Deduction</Label><Input type="number" value={compensationForm.deduction || ""} onChange={(e) => setCompensationForm({ ...compensationForm, deduction: parseFloat(e.target.value) || 0 })} placeholder="0" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompensationDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveCompensation} disabled={updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{updateMutation.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bank Details Dialog ─────────────────── */}
      <Dialog open={showBankDialog} onOpenChange={() => setShowBankDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Bank Details</DialogTitle><DialogDescription>Update bank account and payment information</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Bank Account Name</Label><Input value={bankForm.bankAccountName} onChange={(e) => setBankForm({ ...bankForm, bankAccountName: e.target.value })} placeholder="Account holder name" /></div>
            <div className="space-y-1"><Label className="text-xs">Bank Account Number</Label><Input value={bankForm.bankAccountNumber} onChange={(e) => setBankForm({ ...bankForm, bankAccountNumber: e.target.value })} placeholder="Account number" /></div>
            <div className="space-y-1"><Label className="text-xs">IFSC Code</Label><Input value={bankForm.bankIfscCode} onChange={(e) => setBankForm({ ...bankForm, bankIfscCode: e.target.value })} placeholder="IFSC code" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Mode</Label>
              <Select value={bankForm.paymentMode} onValueChange={(v) => setBankForm({ ...bankForm, paymentMode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Monthly Salary (CTC)</Label><Input type="number" value={bankForm.monthlySalary || ""} onChange={(e) => setBankForm({ ...bankForm, monthlySalary: parseFloat(e.target.value) || 0 })} placeholder="0" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBankDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveBankDetails} disabled={updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{updateMutation.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Certification Dialog ─────────────────── */}
      <Dialog open={showCertDialog} onOpenChange={() => setShowCertDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingCertIdx !== null ? "Edit Certification" : "Add Certification"}</DialogTitle><DialogDescription>{editingCertIdx !== null ? "Update certification details" : "Add a new professional certification"}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Certification Name *</Label><Input value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} placeholder="e.g. CCNA, Fiber Optic Technician" /></div>
            <div className="space-y-1"><Label className="text-xs">Issuing Organization *</Label><Input value={certForm.issuer} onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })} placeholder="e.g. Cisco, IEEE" /></div>
            <div className="space-y-1"><Label className="text-xs">Certificate Number</Label><Input value={certForm.certificateNumber} onChange={(e) => setCertForm({ ...certForm, certificateNumber: e.target.value })} placeholder="Cert #12345" /></div>
            <div className="space-y-1"><Label className="text-xs">Valid Until</Label><Input type="date" value={certForm.validUntil} onChange={(e) => setCertForm({ ...certForm, validUntil: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCertDialog(false); setEditingCertIdx(null); }}>Cancel</Button>
            <Button onClick={handleAddCert} disabled={!certForm.name || !certForm.issuer || updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{updateMutation.isPending ? "Saving..." : editingCertIdx !== null ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Login Result Dialog ─────────────────── */}
      <Dialog open={!!showLoginResult} onOpenChange={() => setShowLoginResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Login Account Created</DialogTitle><DialogDescription>User account has been set up for this technician</DialogDescription></DialogHeader>
          {showLoginResult && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 space-y-2">
                <p className="text-sm font-medium text-green-700">{showLoginResult.message}</p>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Email: <span className="font-medium text-foreground">{showLoginResult.user.email}</span></p>
                  <p className="text-xs text-muted-foreground">Role: <Badge variant="outline" className="text-[10px]">{showLoginResult.user.role}</Badge></p>
                </div>
                <div className="p-2 rounded bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200">
                  <p className="text-xs font-semibold text-yellow-700">Default Password:</p>
                  <p className="text-sm font-mono font-bold text-yellow-800">{showLoginResult.defaultPassword}</p>
                  <p className="text-[10px] text-yellow-700 mt-1">Share this with the technician. They should change it after first login.</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={() => setShowLoginResult(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Attendance Status Dialog ─────────────────── */}
      <Dialog open={showAttendanceStatusDialog} onOpenChange={() => setShowAttendanceStatusDialog(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Mark Attendance</DialogTitle><DialogDescription>Date: {attendanceStatusDate}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              <Select value={attendanceStatusValue} onValueChange={setAttendanceStatusValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESENT">Present</SelectItem>
                  <SelectItem value="ABSENT">Absent</SelectItem>
                  <SelectItem value="HALF_DAY">Half Day</SelectItem>
                  <SelectItem value="LATE">Late</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label className="text-xs">Notes (optional)</Label><Input value={attendanceNotesValue} onChange={(e) => setAttendanceNotesValue(e.target.value)} placeholder="Optional notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAttendanceStatusDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveAttendanceStatus} disabled={attendanceStatusMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{attendanceStatusMutation.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input type="file" ref={fileInputRef} className="hidden" accept=".csv" />
    </div>
  );
}
