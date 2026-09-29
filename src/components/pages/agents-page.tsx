"use client";

import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, Eye, Edit, Trash2, MapPin, Download, Upload,
  Trophy, BarChart3, TrendingUp, Medal,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  DollarSign, ClipboardList, CalendarClock, CheckCircle2, XCircle, Clock,
  Banknote, UserCheck, Target, AlertTriangle, Shield, KeyRound,
  FileSpreadsheet, Copy, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Separator } from "@/components/ui/separator";
import { apiFetch, formatINR } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────
interface Agent {
  id: string;
  userId: string;
  name: string;
  phone: string;
  assignedAreaIds: string;
  dailyTarget: number;
  monthlyTarget: number;
  totalCollectedToday: number;
  totalCollectedMonth: number;
  commissionRate: number;
  totalCommission: number;
  createdAt: string;
  user: { id: string; email: string; status: string; lastLoginAt: string | null } | null;
  areasAssigned: { id: string; name: string; code: string }[];
}

interface AgentStats {
  todayCollected: number;
  monthCollected: number;
  commission: number;
  dailyTargetPercent: number;
  monthlyTargetPercent: number;
}

interface Transaction {
  id: string;
  date: string;
  subscriber: string;
  subscriberCode: string;
  amount: number;
  type: string;
  paymentMode: string;
  receiptNumber: string;
  invoiceNumber: string;
}

interface Area {
  id: string;
  name: string;
  code: string;
}

interface ReconciliationRecord {
  id: string;
  agentId: string;
  date: string;
  expectedAmount: number;
  collectedAmount: number;
  difference: number;
  status: string;
  reconciledBy: string | null;
  createdAt: string;
}

interface FollowUpRecord {
  id: string;
  agentId: string;
  subscriberId: string | null;
  type: string;
  notes: string;
  dueDate: string | null;
  status: string;
  createdAt: string;
  subscriber: { id: string; name: string; code: string } | null;
}

interface PayoutRecord {
  id: string;
  agentId: string;
  amount: number;
  period: string;
  status: string;
  paidOn: string | null;
  approvedBy: string | null;
  createdAt: string;
}

interface SubscriberOption {
  id: string;
  name: string;
  code: string;
}

interface AnalyticsData {
  collectionTrend: { date: string; label: string; total: number; count: number }[];
  topAgents: { id: string; name: string; monthlyCollected: number; monthlyTargetPercent: number }[];
  commissionData: { name: string; value: number }[];
  agents: { id: string; name: string; phone: string; monthlyCollected: number; monthlyTargetPercent: number; commission: number }[];
  summary: {
    totalAgents: number;
    activeAgents: number;
    totalMonthlyCollected: number;
    totalMonthlyTarget: number;
    totalCommission: number;
    avgTargetPercent: number;
  };
}

interface PaginatedResponse {
  items: Agent[];
  total: number;
  page: number;
  totalPages: number;
}

// ─── Helpers ─────────────────────────────────────────────
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const CHART_COLORS = ["#DC2626", "#16A34A", "#F59E0B", "#6366F1", "#EC4899", "#14B8A6", "#F97316", "#8B5CF6", "#06B6D4", "#EF4444"];

const RECONCILIATION_BADGE: Record<string, { label: string; cls: string }> = {
  MATCHED: { label: "Matched", cls: "bg-green-100 text-green-700" },
  MISMATCH: { label: "Mismatch", cls: "bg-red-100 text-red-700" },
  PENDING: { label: "Pending", cls: "bg-yellow-100 text-yellow-700" },
};

const FOLLOWUP_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-yellow-100 text-yellow-700" },
  COMPLETED: { label: "Completed", cls: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-600" },
};

const PAYOUT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-yellow-100 text-yellow-700" },
  APPROVED: { label: "Approved", cls: "bg-teal-100 text-teal-700" },
  PAID: { label: "Paid", cls: "bg-green-100 text-green-700" },
};

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
  return <span className="text-xs font-medium text-muted-foreground w-5 text-center">{rank}</span>;
}

// ─── Pagination Component ────────────────────────────────
function PaginationControls({ page, totalPages, total, limit, onPageChange, onLimitChange }: {
  page: number; totalPages: number; total: number; limit: number;
  onPageChange: (p: number) => void; onLimitChange: (l: number) => void;
}) {
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  function getPageNumbers() {
    const pages: (number | "...")[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const s = Math.max(2, page - 1);
      const e = Math.min(totalPages - 1, page + 1);
      for (let i = s; i <= e; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Showing {total > 0 ? startItem : 0}–{endItem} of {total}</span>
        <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
          <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem></SelectContent>
        </Select>
        <span>per page</span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => onPageChange(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
        {getPageNumbers().map((p, i) =>
          p === "..." ? <span key={`dots-${i}`} className="px-1 text-xs text-muted-foreground">…</span> : (
            <Button key={p} variant={page === p ? "default" : "outline"} size="icon" className="h-7 w-7 text-xs" onClick={() => onPageChange(p)}>{p}</Button>
          )
        )}
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

// ─── Area Multi-Select ───────────────────────────────────
function AreaMultiSelect({ selected, onChange, areas, loading }: {
  selected: string[]; onChange: (ids: string[]) => void; areas: Area[]; loading: boolean;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <div className="space-y-2">
      <Label>Assigned Areas</Label>
      {loading ? <div className="flex flex-wrap gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-20 rounded" />)}</div> : areas.length === 0 ? (
        <p className="text-xs text-muted-foreground">No areas available</p>
      ) : (
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border rounded-md p-2">
          {areas.map((area) => (
            <label key={area.id} className="flex items-center gap-1.5 cursor-pointer rounded border px-2 py-1 text-xs hover:bg-muted/50 transition-colors">
              <Checkbox checked={selected.includes(area.id)} onCheckedChange={() => toggle(area.id)} className="h-3.5 w-3.5" />
              <span>{area.name}</span>
            </label>
          ))}
        </div>
      )}
      {selected.length > 0 && <p className="text-[10px] text-muted-foreground">{selected.length} area(s) selected</p>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────
export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // CSV Import
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [hasFile, setHasFile] = useState(false);

  // Reconciliation dialog
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [reconcileForm, setReconcileForm] = useState({ expectedAmount: "", collectedAmount: "", date: new Date().toISOString().slice(0, 10) });

  // Follow-up dialog
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpForm, setFollowUpForm] = useState({ subscriberId: "", type: "GENERAL", notes: "", dueDate: "" });

  // Payout dialog
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ amount: "", period: "", status: "PENDING" });

  // Create Login dialog
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "", confirmPassword: "" });

  // Daily target dialog (in detail view)
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [targetForm, setTargetForm] = useState({ dailyTarget: "", monthlyTarget: "", commissionRate: "" });

  // Form state
  const emptyForm = { name: "", phone: "", dailyTarget: "", monthlyTarget: "", commissionRate: "", assignedAreaIds: [] as string[] };
  const [form, setForm] = useState(emptyForm);

  // Fetch areas
  const { data: areasData, isLoading: areasLoading } = useQuery({
    queryKey: ["areas-list"],
    queryFn: () => apiFetch<{ items: Area[]; total: number }>("/api/areas?limit=100"),
  });
  const areas: Area[] = areasData?.items || [];

  // Fetch agents list
  const { data, isLoading } = useQuery({
    queryKey: ["agents", page, limit, searchQuery],
    queryFn: () => apiFetch<PaginatedResponse>(`/api/agents?page=${page}&limit=${limit}&search=${encodeURIComponent(searchQuery)}`),
  });

  // Fetch analytics
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["agents-analytics"],
    queryFn: () => apiFetch<AnalyticsData>("/api/agents/analytics"),
    enabled: showAnalytics || showLeaderboard,
  });

  // Fetch agent detail
  const { data: detailData } = useQuery({
    queryKey: ["agent-detail", showDetail],
    queryFn: () => apiFetch<{ agent: Agent; stats: AgentStats; transactions: Transaction[] }>(`/api/agents/${showDetail}`),
    enabled: !!showDetail,
  });

  // Fetch reconciliation records
  const { data: reconData } = useQuery({
    queryKey: ["agent-reconciliations", showDetail],
    queryFn: () => apiFetch<{ records: ReconciliationRecord[] }>(`/api/agents/reconciliation?agentId=${showDetail}&limit=50`),
    enabled: !!showDetail,
  });

  // Fetch follow-up records
  const { data: followUpData } = useQuery({
    queryKey: ["agent-followups", showDetail],
    queryFn: () => apiFetch<{ records: FollowUpRecord[] }>(`/api/agents/followups?agentId=${showDetail}`),
    enabled: !!showDetail,
  });

  // Fetch payout records
  const { data: payoutData } = useQuery({
    queryKey: ["agent-payouts", showDetail],
    queryFn: () => apiFetch<{ records: PayoutRecord[] }>(`/api/agents/payouts?agentId=${showDetail}`),
    enabled: !!showDetail,
  });

  // Fetch subscribers for follow-up dialog
  const { data: subscribersData } = useQuery({
    queryKey: ["subscribers-list"],
    queryFn: () => apiFetch<{ subscribers: SubscriberOption[] }>("/api/subscribers?limit=100"),
    enabled: showFollowUpDialog,
  });

  const agents: Agent[] = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const detailAgent: Agent | null = detailData?.agent || null;
  const detailStats: AgentStats | null = detailData?.stats || null;
  const detailTransactions: Transaction[] = detailData?.transactions || [];
  const analytics: AnalyticsData | null = analyticsData || null;
  const reconciliationRecords = reconData?.records || [];
  const followUpRecords = followUpData?.records || [];
  const payoutRecords = payoutData?.records || [];
  const subscribers: SubscriberOption[] = subscribersData?.subscribers || [];

  const totalMonthlyCollected = analytics?.summary.totalMonthlyCollected ?? agents.reduce((s, a) => s + a.totalCollectedMonth, 0);
  const totalMonthlyTarget = analytics?.summary.totalMonthlyTarget ?? agents.reduce((s, a) => s + a.monthlyTarget, 0);
  const totalDailyTarget = agents.reduce((s, a) => s + a.dailyTarget, 0);
  const monthlyTargetPercent = totalMonthlyTarget > 0 ? Math.round((totalMonthlyCollected / totalMonthlyTarget) * 100) : 0;

  const leaderboard = analytics?.agents ? [...analytics.agents].sort((a, b) => b.monthlyTargetPercent - a.monthlyTargetPercent) : [];

  // Derived stats for reconciliation
  const reconTotalExpected = reconciliationRecords.reduce((s, r) => s + r.expectedAmount, 0);
  const reconTotalCollected = reconciliationRecords.reduce((s, r) => s + r.collectedAmount, 0);
  const reconTotalDifference = reconTotalCollected - reconTotalExpected;
  const reconMismatchCount = reconciliationRecords.filter((r) => r.status === "MISMATCH").length;

  // Derived stats for follow-ups
  const pendingFollowUps = followUpRecords.filter((f) => f.status === "PENDING");
  const overdueFollowUps = pendingFollowUps.filter((f) => isOverdue(f.dueDate));

  // Derived stats for payouts
  const payoutTotalAmount = payoutRecords.reduce((s, p) => s + p.amount, 0);
  const payoutPaidAmount = payoutRecords.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
  const payoutPendingAmount = payoutRecords.filter((p) => p.status === "PENDING" || p.status === "APPROVED").reduce((s, p) => s + p.amount, 0);

  // ─── Mutations ──────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (f: typeof form) => apiFetch("/api/agents", { method: "POST", body: JSON.stringify({ name: f.name, phone: f.phone, dailyTarget: parseFloat(f.dailyTarget) || 0, monthlyTarget: parseFloat(f.monthlyTarget) || 0, commissionRate: parseFloat(f.commissionRate) || 0, assignedAreaIds: f.assignedAreaIds }) }),
    onSuccess: () => { toast.success("Agent added successfully"); queryClient.invalidateQueries({ queryKey: ["agents"] }); queryClient.invalidateQueries({ queryKey: ["agents-analytics"] }); setShowCreate(false); setForm(emptyForm); },
    onError: () => toast.error("Failed to add agent"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: updateData }: { id: string; data: Record<string, unknown> }) => apiFetch(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(updateData) }),
    onSuccess: () => { toast.success("Agent updated successfully"); queryClient.invalidateQueries({ queryKey: ["agents"] }); queryClient.invalidateQueries({ queryKey: ["agent-detail"] }); queryClient.invalidateQueries({ queryKey: ["agents-analytics"] }); setEditId(null); setForm(emptyForm); },
    onError: () => toast.error("Failed to update agent"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/agents/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Agent deleted"); queryClient.invalidateQueries({ queryKey: ["agents"] }); queryClient.invalidateQueries({ queryKey: ["agents-analytics"] }); setDeleteId(null); },
    onError: () => toast.error("Failed to delete agent"),
  });

  const detailAreaMutation = useMutation({
    mutationFn: ({ id, assignedAreaIds }: { id: string; assignedAreaIds: string[] }) => apiFetch(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify({ assignedAreaIds }) }),
    onSuccess: () => { toast.success("Areas updated"); queryClient.invalidateQueries({ queryKey: ["agent-detail"] }); queryClient.invalidateQueries({ queryKey: ["agents"] }); },
    onError: () => toast.error("Failed to update areas"),
  });

  const reconcileMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/agents/reconciliation", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Reconciliation saved"); queryClient.invalidateQueries({ queryKey: ["agent-reconciliations"] }); setShowReconcileDialog(false); setReconcileForm({ expectedAmount: "", collectedAmount: "", date: new Date().toISOString().slice(0, 10) }); },
    onError: () => toast.error("Failed to save reconciliation"),
  });

  const followUpMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/agents/followups", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Follow-up added"); queryClient.invalidateQueries({ queryKey: ["agent-followups"] }); setShowFollowUpDialog(false); setFollowUpForm({ subscriberId: "", type: "GENERAL", notes: "", dueDate: "" }); },
    onError: () => toast.error("Failed to add follow-up"),
  });

  const followUpUpdateMutation = useMutation({
    mutationFn: (body: { id: string; status: string }) => apiFetch("/api/agents/followups", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Follow-up updated"); queryClient.invalidateQueries({ queryKey: ["agent-followups"] }); },
    onError: () => toast.error("Failed to update follow-up"),
  });

  const payoutMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/agents/payouts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Payout recorded"); queryClient.invalidateQueries({ queryKey: ["agent-payouts"] }); setShowPayoutDialog(false); setPayoutForm({ amount: "", period: "", status: "PENDING" }); },
    onError: () => toast.error("Failed to record payout"),
  });

  const payoutUpdateMutation = useMutation({
    mutationFn: (body: { id: string; status: string }) => apiFetch("/api/agents/payouts", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Payout updated"); queryClient.invalidateQueries({ queryKey: ["agent-payouts"] }); },
    onError: () => toast.error("Failed to update payout"),
  });

  const createLoginMutation = useMutation({
    mutationFn: (body: { agentId: string; email?: string; password?: string }) => apiFetch("/api/agents/create-login", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Login account created successfully"); queryClient.invalidateQueries({ queryKey: ["agent-detail"] }); queryClient.invalidateQueries({ queryKey: ["agents"] }); setShowLoginDialog(false); setLoginForm({ email: "", password: "", confirmPassword: "" }); },
    onError: () => toast.error("Failed to create login account"),
  });

  const targetUpdateMutation = useMutation({
    mutationFn: ({ id, data: updateData }: { id: string; data: Record<string, unknown> }) => apiFetch(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(updateData) }),
    onSuccess: () => { toast.success("Targets updated successfully"); queryClient.invalidateQueries({ queryKey: ["agents"] }); queryClient.invalidateQueries({ queryKey: ["agent-detail"] }); queryClient.invalidateQueries({ queryKey: ["agents-analytics"] }); setShowTargetDialog(false); },
    onError: () => toast.error("Failed to update targets"),
  });

  // ─── Handlers ──────────────────────────────────────────
  const openEdit = (id: string) => {
    const agent = agents.find((a) => a.id === id);
    if (agent) {
      setForm({ name: agent.name, phone: agent.phone, dailyTarget: String(agent.dailyTarget), monthlyTarget: String(agent.monthlyTarget), commissionRate: String(agent.commissionRate), assignedAreaIds: agent.areasAssigned.map((a) => a.id) });
    }
    setEditId(id);
  };
  const closeEdit = () => { setEditId(null); setForm(emptyForm); };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (editId) {
      updateMutation.mutate({ id: editId, data: { name: form.name, phone: form.phone, dailyTarget: parseFloat(form.dailyTarget) || 0, monthlyTarget: parseFloat(form.monthlyTarget) || 0, commissionRate: parseFloat(form.commissionRate) || 0, assignedAreaIds: form.assignedAreaIds } });
    } else { createMutation.mutate(form); }
  };

  const handleSearch = (val: string) => { setSearchQuery(val); setPage(1); };

  const handleExport = () => {
    const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : "";
    window.open(`/api/agents/export${params}`, "_blank");
    toast.success("CSV download started");
  };

  const handleImportCSV = async () => {
    const fileInput = fileInputRef.current;
    if (!fileInput || !fileInput.files?.[0]) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      const res = await fetch("/api/agents/import", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Imported ${data.created} agents (${data.skipped} skipped)`);
        queryClient.invalidateQueries({ queryKey: ["agents"] });
        queryClient.invalidateQueries({ queryKey: ["agents-analytics"] });
        setShowImportDialog(false);
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch { toast.error("Import failed"); }
    setImporting(false);
    if (fileInput) fileInput.value = "";
    setSelectedFileName("");
    setHasFile(false);
  };

  const handleReconcile = () => {
    if (!showDetail) return;
    reconcileMutation.mutate({ agentId: showDetail, date: reconcileForm.date, expectedAmount: parseFloat(reconcileForm.expectedAmount) || 0, collectedAmount: parseFloat(reconcileForm.collectedAmount) || 0 });
  };

  const handleAddFollowUp = () => {
    if (!showDetail) return;
    if (!followUpForm.notes.trim()) { toast.error("Notes are required"); return; }
    followUpMutation.mutate({ agentId: showDetail, subscriberId: followUpForm.subscriberId || null, type: followUpForm.type, notes: followUpForm.notes, dueDate: followUpForm.dueDate || null, status: "PENDING" });
  };

  const handleAddPayout = () => {
    if (!showDetail) return;
    if (!payoutForm.amount || !payoutForm.period) { toast.error("Amount and period are required"); return; }
    payoutMutation.mutate({ agentId: showDetail, amount: parseFloat(payoutForm.amount), period: payoutForm.period, status: payoutForm.status });
  };

  const handleCreateLogin = () => {
    if (!showDetail) return;
    if (!loginForm.email.trim()) { toast.error("Email is required"); return; }
    if (!loginForm.password || loginForm.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (loginForm.password !== loginForm.confirmPassword) { toast.error("Passwords do not match"); return; }
    createLoginMutation.mutate({ agentId: showDetail, email: loginForm.email, password: loginForm.password });
  };

  const openTargetDialog = () => {
    if (!detailAgent) return;
    setTargetForm({
      dailyTarget: String(detailAgent.dailyTarget),
      monthlyTarget: String(detailAgent.monthlyTarget),
      commissionRate: String(detailAgent.commissionRate),
    });
    setShowTargetDialog(true);
  };

  const handleSaveTargets = () => {
    if (!showDetail) return;
    targetUpdateMutation.mutate({
      id: showDetail,
      data: {
        dailyTarget: parseFloat(targetForm.dailyTarget) || 0,
        monthlyTarget: parseFloat(targetForm.monthlyTarget) || 0,
        commissionRate: parseFloat(targetForm.commissionRate) || 0,
      },
    });
  };

  const handleDownloadTemplate = () => {
    const csvContent = "name,phone,email,area,dailytarget,commissionrate\nJohn Doe,9876543210,john@agent.com,Downtown,5000,2\nJane Smith,9876543211,jane@agent.com,Uptown,8000,2.5\nRaj Kumar,9876543212,raj@agent.com,Suburb,6000,1.5";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agents_template.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  // ─── Loading ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-40 mb-2" /><Skeleton className="skeleton-wave h-4 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-4 w-16 mb-2" /><Skeleton className="skeleton-wave h-7 w-20" /></CardContent></Card>)}
        </div>
        <Card className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Collection Agents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage collection agents, targets, and track performance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowAnalytics(!showAnalytics)} className="h-9"><BarChart3 className="h-4 w-4 mr-2" />Analytics</Button>
          <Button variant="outline" onClick={() => setShowImportDialog(true)} className="h-9"><Upload className="h-4 w-4 mr-2" />Import CSV</Button>
          <Button variant="outline" onClick={handleExport} className="h-9"><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          <Button onClick={() => { setForm(emptyForm); closeEdit(); setShowCreate(true); }} className="bg-red-600 hover:bg-red-700 text-white h-9"><Plus className="h-4 w-4 mr-2" />Add Agent</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Total Agents</p><p className="text-2xl font-bold text-foreground">{analytics?.summary.totalAgents ?? total}</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Daily Target</p><p className="text-2xl font-bold text-red-600">{formatINR(totalDailyTarget)}</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Monthly Collection</p><p className="text-2xl font-bold text-green-600">{formatINR(totalMonthlyCollected)}</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Monthly Target Progress</p><p className="text-2xl font-bold text-foreground">{monthlyTargetPercent}%</p></CardContent></Card>
      </div>

      {/* ─── Analytics Section ──────────────────────── */}
      {showAnalytics && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-red-500" />Agent Analytics</h2>
          {analyticsLoading ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{[1, 2, 3].map((i) => <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-64 w-full" /></CardContent></Card>)}</div> : analytics ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active Agents</p><p className="text-xl font-bold">{analytics.summary.activeAgents}</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Commission</p><p className="text-xl font-bold text-green-600">{formatINR(analytics.summary.totalCommission)}</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Avg Target %</p><p className="text-xl font-bold">{analytics.summary.avgTargetPercent}%</p></CardContent></Card>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border shadow-sm"><CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-medium">Collection Trend (Last 7 Days)</CardTitle></CardHeader><CardContent className="px-4 pb-4"><ResponsiveContainer width="100%" height={240}><LineChart data={analytics.collectionTrend}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }} formatter={(value: number) => [formatINR(value), "Collection"]} /><Line type="monotone" dataKey="total" stroke="#DC2626" strokeWidth={2} dot={{ r: 4 }} /></LineChart></ResponsiveContainer></CardContent></Card>
                <Card className="border shadow-sm"><CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-medium">Top Performing Agents</CardTitle></CardHeader><CardContent className="px-4 pb-4"><ResponsiveContainer width="100%" height={240}><BarChart data={analytics.topAgents.slice(0, 7)} layout="vertical"><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }} formatter={(value: number) => [formatINR(value), "Monthly Collection"]} /><Bar dataKey="monthlyCollected" fill="#DC2626" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
                <Card className="border shadow-sm"><CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-medium">Commission Distribution</CardTitle></CardHeader><CardContent className="px-4 pb-4">{analytics.commissionData.length > 0 ? (<ResponsiveContainer width="100%" height={240}><PieChart><Pie data={analytics.commissionData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value">{analytics.commissionData.map((_, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }} formatter={(value: number) => [formatINR(value), "Commission"]} /><Legend wrapperStyle={{ fontSize: "11px" }} /></PieChart></ResponsiveContainer>) : <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">No commission data</div>}</CardContent></Card>
                <Card className="border shadow-sm"><CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-medium">Daily Collections (Count)</CardTitle></CardHeader><CardContent className="px-4 pb-4"><ResponsiveContainer width="100%" height={240}><BarChart data={analytics.collectionTrend}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }} /><Bar dataKey="count" fill="#16A34A" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ─── Leaderboard ──────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-0 px-4 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2 cursor-pointer" onClick={() => setShowLeaderboard(!showLeaderboard)}><Trophy className="h-4 w-4 text-yellow-500" />Agent Leaderboard — Monthly Performance</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowLeaderboard(!showLeaderboard)}>{showLeaderboard ? "Hide" : "Show"}</Button>
          </div>
        </CardHeader>
        {showLeaderboard && (
          <CardContent className="px-4 pb-4">
            {analyticsLoading ? <div className="space-y-2 py-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : leaderboard.length > 0 ? (
              <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
                {leaderboard.map((agent, index) => {
                  const rank = index + 1;
                  const barColor = rank === 1 ? "bg-yellow-500" : rank === 2 ? "bg-gray-400" : rank === 3 ? "bg-amber-700" : "bg-muted-foreground/30";
                  return (
                    <div key={agent.id} className={`flex items-center gap-3 rounded-lg p-2 ${rank <= 3 ? "bg-muted/50" : ""}`}>
                      <div className="flex items-center justify-center w-6"><RankBadge rank={rank} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1"><span className="text-xs font-medium truncate">{agent.name}</span><span className="text-xs font-bold tabular-nums">{agent.monthlyTargetPercent}%</span></div>
                        <div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(agent.monthlyTargetPercent, 100)}%` }} /></div><span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{formatINR(agent.monthlyCollected)}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-xs text-muted-foreground py-4 text-center">No agents to rank</p>}
          </CardContent>
        )}
      </Card>

      {/* Search */}
      <Card className="border shadow-sm"><CardContent className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by name, phone..." value={searchQuery} onChange={(e) => handleSearch(e.target.value)} className="pl-9" /></div></CardContent></Card>

      {/* Agents Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Agent</TableHead>
                <TableHead className="text-xs">Daily Target</TableHead>
                <TableHead className="text-xs">Daily Progress</TableHead>
                <TableHead className="text-xs">Monthly Collection</TableHead>
                <TableHead className="text-xs">Monthly Target</TableHead>
                <TableHead className="text-xs">Commission %</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No agents found</TableCell></TableRow>
              ) : agents.map((a) => {
                const dailyPercent = a.dailyTarget > 0 ? Math.round((a.totalCollectedToday / a.dailyTarget) * 100) : 0;
                const monthlyPercent = a.monthlyTarget > 0 ? Math.round((a.totalCollectedMonth / a.monthlyTarget) * 100) : 0;
                return (
                  <TableRow key={a.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8"><AvatarFallback className="bg-red-100 text-red-700 text-xs">{a.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback></Avatar>
                        <div><p className="text-xs font-medium">{a.name}</p><p className="text-[10px] text-muted-foreground">{a.phone}</p></div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{formatINR(a.dailyTarget)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between"><span className="text-[10px] tabular-nums">{formatINR(a.totalCollectedToday)}</span><span className="text-[10px] font-medium">{dailyPercent}%</span></div>
                        <Progress value={Math.min(dailyPercent, 100)} className="h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums font-medium text-green-600">{formatINR(a.totalCollectedMonth)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between"><span className="text-[10px] tabular-nums">{formatINR(a.monthlyTarget)}</span><span className="text-[10px] font-medium">{monthlyPercent}%</span></div>
                        <Progress value={Math.min(monthlyPercent, 100)} className={`h-1.5 ${monthlyPercent >= 80 ? "[&>div]:bg-green-500" : monthlyPercent >= 50 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"}`} />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{a.commissionRate}%</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setShowDetail(a.id)}><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(a.id)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(a.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {totalPages > 0 && <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1); }} />}
        </CardContent>
      </Card>

      {/* ─── Create/Edit Dialog ──────────────────────── */}
      <Dialog open={showCreate || !!editId} onOpenChange={(open) => { if (!open) { setShowCreate(false); closeEdit(); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit Agent" : "Add Agent"}</DialogTitle><DialogDescription>{editId ? "Update agent details and targets" : "Add a new collection agent to the team"}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Daily Target (₹)</Label><Input type="number" value={form.dailyTarget} onChange={(e) => setForm({ ...form, dailyTarget: e.target.value })} placeholder="0" min="0" /></div>
              <div className="space-y-2"><Label>Monthly Target (₹)</Label><Input type="number" value={form.monthlyTarget} onChange={(e) => setForm({ ...form, monthlyTarget: e.target.value })} placeholder="0" min="0" /></div>
            </div>
            <div className="space-y-2"><Label>Commission Rate (%)</Label><Input type="number" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} placeholder="0" min="0" max="100" step="0.1" /></div>
            <AreaMultiSelect selected={form.assignedAreaIds} onChange={(ids) => setForm({ ...form, assignedAreaIds: ids })} areas={areas} loading={areasLoading} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); closeEdit(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{createMutation.isPending || updateMutation.isPending ? "Saving..." : editId ? "Update" : "Add Agent"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Agent Detail Dialog ─────────────────────── */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" a11yTitle="Agent Details">
          {detailAgent && detailStats ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Avatar className="h-10 w-10"><AvatarFallback className="bg-red-100 text-red-700">{detailAgent.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback></Avatar>
                  <div>
                    <p>{detailAgent.name}</p>
                    <p className="text-sm text-muted-foreground font-normal">{detailAgent.phone} · Joined {formatDate(detailAgent.createdAt)}</p>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <Tabs defaultValue="overview">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="targets">Targets</TabsTrigger>
                  <TabsTrigger value="transactions">Transactions</TabsTrigger>
                  <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
                  <TabsTrigger value="followups">Follow-ups</TabsTrigger>
                  <TabsTrigger value="payouts">Payouts</TabsTrigger>
                  <TabsTrigger value="areas">Areas</TabsTrigger>
                </TabsList>

                {/* ── Overview Tab ── */}
                <TabsContent value="overview" className="space-y-4 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="border shadow-sm"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Today&apos;s Collection</p><p className="text-lg font-bold text-green-600">{formatINR(detailStats.todayCollected)}</p><div className="flex items-center justify-between mt-1"><span className="text-[10px] text-muted-foreground">of {formatINR(detailAgent.dailyTarget)}</span><span className="text-[10px] font-bold">{detailStats.dailyTargetPercent}%</span></div><Progress value={Math.min(detailStats.dailyTargetPercent, 100)} className="h-1.5 mt-1" /></CardContent></Card>
                    <Card className="border shadow-sm"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Monthly Collection</p><p className="text-lg font-bold text-green-600">{formatINR(detailStats.monthCollected)}</p><div className="flex items-center justify-between mt-1"><span className="text-[10px] text-muted-foreground">of {formatINR(detailAgent.monthlyTarget)}</span><span className="text-[10px] font-bold">{detailStats.monthlyTargetPercent}%</span></div><Progress value={Math.min(detailStats.monthlyTargetPercent, 100)} className={`h-1.5 mt-1 ${detailStats.monthlyTargetPercent >= 80 ? "[&>div]:bg-green-500" : "[&>div]:bg-yellow-500"}`} /></CardContent></Card>
                  </div>
                  <Card className="border shadow-sm"><CardContent className="p-3"><div className="grid grid-cols-3 gap-3 text-center"><div><p className="text-[10px] text-muted-foreground">Commission Rate</p><p className="text-lg font-bold text-red-600">{detailAgent.commissionRate}%</p></div><div><p className="text-[10px] text-muted-foreground">Commission Earned</p><p className="text-lg font-bold text-green-600">{formatINR(detailStats.commission)}</p></div><div><p className="text-[10px] text-muted-foreground">Daily Target</p><p className="text-lg font-bold text-red-600">{formatINR(detailAgent.dailyTarget)}</p></div></div></CardContent></Card>
                  {/* Feature 1: Login Account Section */}
                  {!detailAgent.user && (
                    <Card className="border border-dashed shadow-sm bg-muted/30"><CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100"><Shield className="h-5 w-5 text-amber-600" /></div>
                        <div>
                          <p className="text-sm font-medium text-amber-700">No Login Account</p>
                          <p className="text-xs text-muted-foreground">Create platform login credentials for this agent</p>
                        </div>
                      </div>
                      <Button className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={createLoginMutation.isPending} onClick={() => { setLoginForm({ email: "", password: "", confirmPassword: "" }); setShowLoginDialog(true); }}>
                        <KeyRound className="h-4 w-4 mr-2" />Create Login Credentials
                      </Button>
                    </CardContent></Card>
                  )}
                  {detailAgent.user && (
                    <Card className="border shadow-sm"><CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100"><UserCheck className="h-5 w-5 text-green-600" /></div>
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground">Login Account</p>
                          <p className="text-sm font-medium">{detailAgent.user.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${detailAgent.user.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{detailAgent.user.status}</Badge>
                            {detailAgent.user.lastLoginAt && <span className="text-[10px] text-muted-foreground">Last login: {formatDateTime(detailAgent.user.lastLoginAt)}</span>}
                          </div>
                        </div>
                      </div>
                    </CardContent></Card>
                  )}
                </TabsContent>

                {/* ── Targets Tab (Feature 6: Daily Collection Target Configuration) ── */}
                <TabsContent value="targets" className="space-y-4 mt-3">
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2 px-4 pt-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2"><Target className="h-4 w-4 text-red-500" />Collection Target Configuration</CardTitle>
                        <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={openTargetDialog}><Edit className="h-3.5 w-3.5 mr-1.5" />Edit Targets</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Card className="border bg-muted/30"><CardContent className="p-3 text-center"><p className="text-[10px] text-muted-foreground">Daily Target</p><p className="text-xl font-bold text-red-600">{formatINR(detailAgent.dailyTarget)}</p><Progress value={detailStats.dailyTargetPercent} className="h-1.5 mt-2" /><p className="text-[10px] text-muted-foreground mt-1">{detailStats.dailyTargetPercent}% achieved today</p></CardContent></Card>
                        <Card className="border bg-muted/30"><CardContent className="p-3 text-center"><p className="text-[10px] text-muted-foreground">Monthly Target</p><p className="text-xl font-bold text-red-600">{formatINR(detailAgent.monthlyTarget)}</p><Progress value={detailStats.monthlyTargetPercent} className="h-1.5 mt-2" /><p className="text-[10px] text-muted-foreground mt-1">{detailStats.monthlyTargetPercent}% achieved this month</p></CardContent></Card>
                        <Card className="border bg-muted/30"><CardContent className="p-3 text-center"><p className="text-[10px] text-muted-foreground">Commission Rate</p><p className="text-xl font-bold text-green-600">{detailAgent.commissionRate}%</p><p className="text-[10px] text-muted-foreground mt-2">Earned: {formatINR(detailStats.commission)}</p><p className="text-[10px] text-muted-foreground">On {formatINR(detailStats.monthCollected)} collected</p></CardContent></Card>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium mb-2">Target Summary</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex justify-between p-2 bg-muted/30 rounded"><span className="text-muted-foreground">Today&apos;s Gap</span><span className={`font-medium ${detailStats.todayCollected >= detailAgent.dailyTarget ? "text-green-600" : "text-red-600"}`}>{formatINR(Math.max(0, detailAgent.dailyTarget - detailStats.todayCollected))}</span></div>
                          <div className="flex justify-between p-2 bg-muted/30 rounded"><span className="text-muted-foreground">Monthly Gap</span><span className={`font-medium ${detailStats.monthCollected >= detailAgent.monthlyTarget ? "text-green-600" : "text-red-600"}`}>{formatINR(Math.max(0, detailAgent.monthlyTarget - detailStats.monthCollected))}</span></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Transactions Tab ── */}
                <TabsContent value="transactions" className="mt-3">
                  <Card className="border shadow-sm"><CardContent className="p-0">{detailTransactions.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No transactions found</div> : (
                    <div className="max-h-80 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs">Amount</TableHead><TableHead className="text-xs">Mode</TableHead><TableHead className="text-xs">Status</TableHead></TableRow></TableHeader><TableBody>{detailTransactions.map((tx) => (<TableRow key={tx.id} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="text-xs whitespace-nowrap">{formatDateTime(tx.date)}</TableCell><TableCell><div><p className="text-xs font-medium">{tx.subscriber}</p>{tx.invoiceNumber && <p className="text-[10px] text-muted-foreground">{tx.invoiceNumber}</p>}</div></TableCell><TableCell className="text-xs font-medium tabular-nums">{formatINR(tx.amount)}</TableCell><TableCell className="text-xs">{tx.paymentMode}</TableCell><TableCell><Badge variant={tx.type === "Collection" ? "default" : "secondary"} className={`text-[10px] ${tx.type === "Collection" ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}`}>{tx.type}</Badge></TableCell></TableRow>))}</TableBody></Table></div>
                  )}</CardContent></Card>
                </TabsContent>

                {/* ── Reconciliation Tab (Feature 3: Cash Reconciliation) ── */}
                <TabsContent value="reconciliation" className="space-y-4 mt-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4 text-red-500" />Cash Reconciliation</h3>
                    <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => { setReconcileForm({ expectedAmount: "", collectedAmount: "", date: new Date().toISOString().slice(0, 10) }); setShowReconcileDialog(true); }}><Banknote className="h-3.5 w-3.5 mr-1.5" />Reconcile</Button>
                  </div>
                  {/* Reconciliation Summary Cards */}
                  {reconciliationRecords.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Card className="border bg-muted/20"><CardContent className="p-2 text-center"><p className="text-[9px] text-muted-foreground">Total Expected</p><p className="text-sm font-bold">{formatINR(reconTotalExpected)}</p></CardContent></Card>
                      <Card className="border bg-muted/20"><CardContent className="p-2 text-center"><p className="text-[9px] text-muted-foreground">Total Collected</p><p className="text-sm font-bold">{formatINR(reconTotalCollected)}</p></CardContent></Card>
                      <Card className={`border ${reconTotalDifference < 0 ? "bg-red-50" : reconTotalDifference === 0 ? "bg-green-50" : "bg-green-50"}`}><CardContent className="p-2 text-center"><p className="text-[9px] text-muted-foreground">Net Difference</p><p className={`text-sm font-bold ${reconTotalDifference < 0 ? "text-red-600" : reconTotalDifference === 0 ? "text-green-600" : "text-green-600"}`}>{reconTotalDifference >= 0 ? "+" : ""}{formatINR(reconTotalDifference)}</p></CardContent></Card>
                      <Card className={`border ${reconMismatchCount > 0 ? "bg-red-50" : "bg-green-50"}`}><CardContent className="p-2 text-center"><p className="text-[9px] text-muted-foreground">Discrepancies</p><p className={`text-sm font-bold ${reconMismatchCount > 0 ? "text-red-600" : "text-green-600"}`}>{reconMismatchCount}</p></CardContent></Card>
                    </div>
                  )}
                  {reconciliationRecords.length > 0 ? (
                    <Card className="border shadow-sm"><CardContent className="p-0">
                      <ScrollArea className="max-h-64">
                        <Table>
                          <TableHeader><TableRow><TableHead className="text-[10px]">Date</TableHead><TableHead className="text-[10px]">Expected</TableHead><TableHead className="text-[10px]">Collected</TableHead><TableHead className="text-[10px]">Difference</TableHead><TableHead className="text-[10px]">Status</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {reconciliationRecords.map((r) => (
                              <TableRow key={r.id} className="hover:bg-muted/50 transition-colors duration-150">
                                <TableCell className="text-[10px]">{formatDate(r.date)}</TableCell>
                                <TableCell className="text-[10px] tabular-nums">{formatINR(r.expectedAmount)}</TableCell>
                                <TableCell className="text-[10px] tabular-nums">{formatINR(r.collectedAmount)}</TableCell>
                                <TableCell className={`text-[10px] tabular-nums font-medium ${Math.abs(r.difference) < 0.01 ? "text-green-600" : "text-red-600"}`}>{r.difference >= 0 ? "+" : ""}{formatINR(r.difference)}</TableCell>
                                <TableCell><Badge variant="outline" className={`text-[9px] px-1 py-0 ${RECONCILIATION_BADGE[r.status]?.cls || ""}`}>{RECONCILIATION_BADGE[r.status]?.label || r.status}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent></Card>
                  ) : <p className="text-xs text-muted-foreground py-4">No reconciliation records yet. Click &quot;Reconcile&quot; to compare cash collected vs deposited.</p>}
                </TabsContent>

                {/* ── Follow-ups Tab (Feature 4: Follow-up Tracking) ── */}
                <TabsContent value="followups" className="space-y-4 mt-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4 text-red-500" />Follow-up Tracking</h3>
                    <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => { setFollowUpForm({ subscriberId: "", type: "GENERAL", notes: "", dueDate: "" }); setShowFollowUpDialog(true); }}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Follow-up</Button>
                  </div>
                  {/* Follow-up Summary */}
                  {followUpRecords.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      <Card className="border bg-yellow-50"><CardContent className="p-2 text-center"><p className="text-[9px] text-muted-foreground">Pending</p><p className="text-sm font-bold text-yellow-700">{pendingFollowUps.length}</p></CardContent></Card>
                      <Card className="border bg-red-50"><CardContent className="p-2 text-center"><p className="text-[9px] text-muted-foreground">Overdue</p><p className="text-sm font-bold text-red-600">{overdueFollowUps.length}</p></CardContent></Card>
                      <Card className="border bg-green-50"><CardContent className="p-2 text-center"><p className="text-[9px] text-muted-foreground">Completed</p><p className="text-sm font-bold text-green-600">{followUpRecords.filter((f) => f.status === "COMPLETED").length}</p></CardContent></Card>
                    </div>
                  )}
                  {followUpRecords.length > 0 ? (
                    <Card className="border shadow-sm"><CardContent className="p-0">
                      <ScrollArea className="max-h-64">
                        <Table>
                          <TableHeader><TableRow><TableHead className="text-[10px]">Type</TableHead><TableHead className="text-[10px]">Subscriber</TableHead><TableHead className="text-[10px]">Notes</TableHead><TableHead className="text-[10px]">Due Date</TableHead><TableHead className="text-[10px]">Status</TableHead><TableHead className="text-[10px]">Actions</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {followUpRecords.map((f) => (
                              <TableRow key={f.id} className={isOverdue(f.dueDate) && f.status === "PENDING" ? "bg-red-50/50 hover:bg-muted/50 transition-colors duration-150" : "hover:bg-muted/50 transition-colors duration-150"}>
                                <TableCell><Badge variant="outline" className="text-[9px] px-1 py-0">{f.type}</Badge></TableCell>
                                <TableCell className="text-[10px]">{f.subscriber?.name || "—"}</TableCell>
                                <TableCell className="text-[10px] max-w-[140px] truncate">{f.notes}</TableCell>
                                <TableCell className="text-[10px]">
                                  <div className="flex items-center gap-1">
                                    {f.dueDate ? formatDate(f.dueDate) : "—"}
                                    {isOverdue(f.dueDate) && f.status === "PENDING" && <AlertTriangle className="h-3 w-3 text-red-500" />}
                                  </div>
                                </TableCell>
                                <TableCell><Badge variant="outline" className={`text-[9px] px-1 py-0 ${FOLLOWUP_STATUS_BADGE[f.status]?.cls || ""}`}>{FOLLOWUP_STATUS_BADGE[f.status]?.label || f.status}</Badge></TableCell>
                                <TableCell>
                                  {f.status === "PENDING" && (
                                    <div className="flex gap-1">
                                      <Button variant="outline" size="sm" className="h-6 text-[9px] px-2 text-green-600" onClick={() => followUpUpdateMutation.mutate({ id: f.id, status: "COMPLETED" })}><CheckCircle2 className="h-3 w-3 mr-0.5" />Done</Button>
                                      <Button variant="outline" size="sm" className="h-6 text-[9px] px-2 text-gray-500" onClick={() => followUpUpdateMutation.mutate({ id: f.id, status: "CANCELLED" })}><XCircle className="h-3 w-3 mr-0.5" />Cancel</Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent></Card>
                  ) : <p className="text-xs text-muted-foreground py-4">No follow-ups yet. Click &quot;Add Follow-up&quot; to assign a follow-up task.</p>}
                </TabsContent>

                {/* ── Payouts Tab (Feature 5: Commission Payout History) ── */}
                <TabsContent value="payouts" className="space-y-4 mt-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-red-500" />Commission Payout History</h3>
                    <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => { setPayoutForm({ amount: String(detailStats.commission), period: new Date().toISOString().slice(0, 7), status: "PENDING" }); setShowPayoutDialog(true); }}><Plus className="h-3.5 w-3.5 mr-1.5" />Record Payout</Button>
                  </div>
                  {/* Payout Summary Cards */}
                  {payoutRecords.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      <Card className="border bg-muted/20"><CardContent className="p-2 text-center"><p className="text-[9px] text-muted-foreground">Total Payouts</p><p className="text-sm font-bold">{formatINR(payoutTotalAmount)}</p></CardContent></Card>
                      <Card className="border bg-green-50"><CardContent className="p-2 text-center"><p className="text-[9px] text-muted-foreground">Total Paid</p><p className="text-sm font-bold text-green-600">{formatINR(payoutPaidAmount)}</p></CardContent></Card>
                      <Card className="border bg-yellow-50"><CardContent className="p-2 text-center"><p className="text-[9px] text-muted-foreground">Pending/Approved</p><p className="text-sm font-bold text-yellow-700">{formatINR(payoutPendingAmount)}</p></CardContent></Card>
                    </div>
                  )}
                  {payoutRecords.length > 0 ? (
                    <Card className="border shadow-sm"><CardContent className="p-0">
                      <ScrollArea className="max-h-64">
                        <Table>
                          <TableHeader><TableRow><TableHead className="text-[10px]">Period</TableHead><TableHead className="text-[10px]">Amount</TableHead><TableHead className="text-[10px]">Status</TableHead><TableHead className="text-[10px]">Paid On</TableHead><TableHead className="text-[10px]">Actions</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {payoutRecords.map((p) => (
                              <TableRow key={p.id} className="hover:bg-muted/50 transition-colors duration-150">
                                <TableCell className="text-[10px]">{p.period}</TableCell>
                                <TableCell className="text-[10px] tabular-nums font-medium">{formatINR(p.amount)}</TableCell>
                                <TableCell><Badge variant="outline" className={`text-[9px] px-1 py-0 ${PAYOUT_STATUS_BADGE[p.status]?.cls || ""}`}>{PAYOUT_STATUS_BADGE[p.status]?.label || p.status}</Badge></TableCell>
                                <TableCell className="text-[10px]">{p.paidOn ? formatDate(p.paidOn) : "—"}</TableCell>
                                <TableCell>
                                  {p.status !== "PAID" && (
                                    <div className="flex gap-1">
                                      {p.status === "PENDING" && <Button variant="outline" size="sm" className="h-6 text-[9px] px-2 text-teal-600" onClick={() => payoutUpdateMutation.mutate({ id: p.id, status: "APPROVED" })}>Approve</Button>}
                                      <Button variant="outline" size="sm" className="h-6 text-[9px] px-2 text-green-600" onClick={() => payoutUpdateMutation.mutate({ id: p.id, status: "PAID" })}><UserCheck className="h-3 w-3 mr-0.5" />Paid</Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent></Card>
                  ) : <p className="text-xs text-muted-foreground py-4">No payout records yet. Click &quot;Record Payout&quot; to log a commission payment.</p>}
                </TabsContent>

                {/* ── Areas Tab ── */}
                <TabsContent value="areas" className="mt-3">
                  <DetailAreaSection agent={detailAgent} areas={areas} loading={areasLoading} isUpdating={detailAreaMutation.isPending} onUpdate={(ids) => detailAreaMutation.mutate({ id: detailAgent.id, assignedAreaIds: ids })} />
                </TabsContent>
              </Tabs>
            </>
          ) : <div className="py-12"><Skeleton className="skeleton-wave h-40 w-full" /></div>}
        </DialogContent>
      </Dialog>

      {/* ─── Import CSV Dialog (Feature 2: Bulk Entry/Import) ───────── */}
      <Dialog open={showImportDialog} onOpenChange={() => setShowImportDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-red-500" />Import Agents from CSV</DialogTitle><DialogDescription>Upload a CSV file to bulk-create collection agents</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-red-300 transition-colors">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to select a CSV file</p>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; setSelectedFileName(file?.name || ""); setHasFile(!!file); }} />
              <Button variant="outline" size="sm" className="mt-3" onClick={() => fileInputRef.current?.click()}>Choose File</Button>
              {selectedFileName && <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1"><FileSpreadsheet className="h-3 w-3" />{selectedFileName}</p>}
            </div>
            <div className="bg-muted/50 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">CSV Format:</p>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={handleDownloadTemplate}><Copy className="h-3 w-3 mr-1" />Download Template</Button>
              </div>
              <code className="text-[10px] text-muted-foreground block">name, phone, email, area, dailytarget, commissionrate</code>
              <p className="text-[10px] text-muted-foreground"><span className="font-medium">Required:</span> name · <span className="font-medium">Optional:</span> phone, email, area, dailytarget, commissionrate</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancel</Button>
            <Button onClick={handleImportCSV} disabled={importing || !hasFile} className="bg-red-600 hover:bg-red-700 text-white">{importing ? "Importing..." : "Import Agents"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create Login Dialog (Feature 1: Login/User Account Creation) ─── */}
      <Dialog open={showLoginDialog} onOpenChange={() => setShowLoginDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-red-500" />Create Login Account</DialogTitle><DialogDescription>Set up platform login credentials for this agent</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-md p-3 flex items-center gap-2">
              <Avatar className="h-8 w-8"><AvatarFallback className="bg-red-100 text-red-700 text-xs">{detailAgent?.name.split(" ").map((n) => n[0]).join("").slice(0, 2) || "??"}</AvatarFallback></Avatar>
              <div><p className="text-xs font-medium">{detailAgent?.name}</p><p className="text-[10px] text-muted-foreground">{detailAgent?.phone}</p></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-email">Email Address *</Label>
              <Input id="login-email" type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} placeholder="agent@cryptsk.agent" />
              <p className="text-[10px] text-muted-foreground">This will be used as the login username</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password *</Label>
              <Input id="login-password" type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="Min 6 characters" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-confirm">Confirm Password *</Label>
              <Input id="login-confirm" type="password" value={loginForm.confirmPassword} onChange={(e) => setLoginForm({ ...loginForm, confirmPassword: e.target.value })} placeholder="Re-enter password" />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />The agent will use these credentials to log into the platform</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLoginDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateLogin} disabled={createLoginMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{createLoginMutation.isPending ? "Creating..." : "Create Login"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reconciliation Dialog ─────────────────────── */}
      <Dialog open={showReconcileDialog} onOpenChange={() => setShowReconcileDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-red-500" />Reconcile Cash</DialogTitle><DialogDescription>Compare expected vs collected amount for the day</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={reconcileForm.date} onChange={(e) => setReconcileForm({ ...reconcileForm, date: e.target.value })} /></div>
            <div className="space-y-2"><Label>Expected Amount (₹)</Label><Input type="number" value={reconcileForm.expectedAmount} onChange={(e) => setReconcileForm({ ...reconcileForm, expectedAmount: e.target.value })} placeholder="0" min="0" /></div>
            <div className="space-y-2"><Label>Collected Amount (₹)</Label><Input type="number" value={reconcileForm.collectedAmount} onChange={(e) => setReconcileForm({ ...reconcileForm, collectedAmount: e.target.value })} placeholder="0" min="0" /></div>
            {reconcileForm.expectedAmount && reconcileForm.collectedAmount && (
              <div className={`rounded-md p-3 ${Math.abs((parseFloat(reconcileForm.collectedAmount) || 0) - (parseFloat(reconcileForm.expectedAmount) || 0)) < 0.01 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <p className="text-xs text-muted-foreground">Difference</p>
                <p className={`text-lg font-bold ${(parseFloat(reconcileForm.collectedAmount) || 0) - (parseFloat(reconcileForm.expectedAmount) || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatINR((parseFloat(reconcileForm.collectedAmount) || 0) - (parseFloat(reconcileForm.expectedAmount) || 0))}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReconcileDialog(false)}>Cancel</Button>
            <Button onClick={handleReconcile} disabled={reconcileMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{reconcileMutation.isPending ? "Saving..." : "Save Reconciliation"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Follow-up Dialog ─────────────────────── */}
      <Dialog open={showFollowUpDialog} onOpenChange={() => setShowFollowUpDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Follow-up</DialogTitle><DialogDescription>Schedule a follow-up task for this agent</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Type</Label><Select value={followUpForm.type} onValueChange={(v) => setFollowUpForm({ ...followUpForm, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PAYMENT">Payment</SelectItem><SelectItem value="COMPLAINT">Complaint</SelectItem><SelectItem value="GENERAL">General</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Subscriber (Optional)</Label><Select value={followUpForm.subscriberId} onValueChange={(v) => setFollowUpForm({ ...followUpForm, subscriberId: v })}><SelectTrigger><SelectValue placeholder="Select subscriber" /></SelectTrigger><SelectContent>{subscribers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={followUpForm.dueDate} onChange={(e) => setFollowUpForm({ ...followUpForm, dueDate: e.target.value })} /></div>
            <div className="space-y-2"><Label>Notes *</Label><Textarea value={followUpForm.notes} onChange={(e) => setFollowUpForm({ ...followUpForm, notes: e.target.value })} placeholder="Follow-up notes" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFollowUpDialog(false)}>Cancel</Button>
            <Button onClick={handleAddFollowUp} disabled={followUpMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{followUpMutation.isPending ? "Saving..." : "Add Follow-up"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Payout Dialog ─────────────────────── */}
      <Dialog open={showPayoutDialog} onOpenChange={() => setShowPayoutDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Record Commission Payout</DialogTitle><DialogDescription>Record a commission payout for this agent</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Period *</Label><Input type="month" value={payoutForm.period} onChange={(e) => setPayoutForm({ ...payoutForm, period: e.target.value })} /></div>
            <div className="space-y-2"><Label>Amount (₹) *</Label><Input type="number" value={payoutForm.amount} onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })} placeholder="0" min="0" /></div>
            <div className="space-y-2"><Label>Status</Label><Select value={payoutForm.status} onValueChange={(v) => setPayoutForm({ ...payoutForm, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PENDING">Pending</SelectItem><SelectItem value="APPROVED">Approved</SelectItem><SelectItem value="PAID">Paid</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayoutDialog(false)}>Cancel</Button>
            <Button onClick={handleAddPayout} disabled={payoutMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{payoutMutation.isPending ? "Saving..." : "Record Payout"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Target Configuration Dialog (Feature 6) ─────────────────────── */}
      <Dialog open={showTargetDialog} onOpenChange={() => setShowTargetDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-red-500" />Configure Collection Targets</DialogTitle><DialogDescription>Set daily and monthly collection targets for this agent</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="target-daily">Daily Target (₹)</Label>
                <Input id="target-daily" type="number" value={targetForm.dailyTarget} onChange={(e) => setTargetForm({ ...targetForm, dailyTarget: e.target.value })} placeholder="0" min="0" />
                <p className="text-[10px] text-muted-foreground">Amount the agent should collect per day</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-monthly">Monthly Target (₹)</Label>
                <Input id="target-monthly" type="number" value={targetForm.monthlyTarget} onChange={(e) => setTargetForm({ ...targetForm, monthlyTarget: e.target.value })} placeholder="0" min="0" />
                <p className="text-[10px] text-muted-foreground">Total monthly collection goal</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-commission">Commission Rate (%)</Label>
              <Input id="target-commission" type="number" value={targetForm.commissionRate} onChange={(e) => setTargetForm({ ...targetForm, commissionRate: e.target.value })} placeholder="0" min="0" max="100" step="0.1" />
              <p className="text-[10px] text-muted-foreground">Commission percentage on total collections</p>
            </div>
            {targetForm.dailyTarget && targetForm.monthlyTarget && (
              <div className="bg-muted/50 rounded-md p-3 space-y-1">
                <p className="text-xs font-medium">Quick Preview</p>
                <p className="text-[10px] text-muted-foreground">Working days needed for monthly target (at daily rate): {parseFloat(targetForm.dailyTarget) > 0 ? Math.ceil(parseFloat(targetForm.monthlyTarget) / parseFloat(targetForm.dailyTarget)) : "—"} days</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTargetDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveTargets} disabled={targetUpdateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{targetUpdateMutation.isPending ? "Saving..." : "Save Targets"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Agent</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete this agent? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Detail Area Assignment Section ─────────────────────
function DetailAreaSection({ agent, areas, loading, isUpdating, onUpdate }: {
  agent: Agent; areas: Area[]; loading: boolean; isUpdating: boolean; onUpdate: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(agent.areasAssigned.map((a) => a.id));
  const [changed, setChanged] = useState(false);
  const currentSelected = agent.areasAssigned.map((a) => a.id);

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    const isSame = next.length === currentSelected.length && next.every((x) => currentSelected.includes(x));
    setChanged(!isSame);
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 px-3 pt-3"><CardTitle className="text-xs font-medium flex items-center gap-1"><MapPin className="h-3 w-3 text-red-500" />Assigned Areas</CardTitle></CardHeader>
      <CardContent className="px-3 pb-3">
        {loading ? <div className="flex flex-wrap gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-20 rounded" />)}</div> : areas.length === 0 ? (
          <p className="text-xs text-muted-foreground">No areas available</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
              {areas.map((area) => (
                <label key={area.id} className="flex items-center gap-1.5 cursor-pointer rounded border px-2 py-1 text-xs hover:bg-muted/50 transition-colors">
                  <Checkbox checked={selected.includes(area.id)} onCheckedChange={() => toggle(area.id)} className="h-3.5 w-3.5" />
                  <span>{area.name}</span>
                  <span className="text-muted-foreground">({area.code})</span>
                </label>
              ))}
            </div>
            {changed && (
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-amber-600">{selected.length} area(s) selected — unsaved changes</p>
                <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={() => { onUpdate(selected); setChanged(false); }} disabled={isUpdating}>{isUpdating ? "Saving..." : "Save Areas"}</Button>
              </div>
            )}
            {!changed && <p className="text-[10px] text-muted-foreground">{selected.length} area(s) assigned</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
