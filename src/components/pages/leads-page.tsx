"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  Users, Plus, UserCheck, TrendingUp, Search, Edit, Trash2, Phone, Mail,
  MapPin, Calendar, CheckCircle, Clock, BarChart3, PieChart, ChevronLeft, ChevronRight,
  Download, ArrowUpDown, X, LayoutGrid, List, Flame, Snowflake, Sun,
  AlertTriangle, GripVertical, IndianRupee, Award, Copy, UserPlus, MessageSquare, Loader2,
  RefreshCw, Tag, MessageCircle, Send, Globe, Share2, Footprints,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────
interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  source: string;
  status: string;
  assignedToId: string;
  assignedName?: string;
  notes: string;
  followUpDate: string | null;
  estimatedValue: number;
  dealValue: number;
  lostReason: string;
  createdAt: string;
  convertedSubscriberId: string;
  score: number;
  scoreFactors: string;
  duplicateOf: string | null;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
}

interface TeamMember { id: string; name: string; email: string; role: string; }

interface DuplicateMatch {
  id: string;
  name: string;
  phone: string;
  email: string;
}

interface LeadCommunication { id: string; leadId: string; type: string; date: string; notes: string; outcome: string; }

interface LeadsResponse {
  leads: Lead[];
  stats: { total: number; new: number; converted: number; lost: number; thisMonth: number };
  total: number;
  page: number;
  totalPages: number;
}

const SOURCE_COLORS: Record<string, string> = {
  Website: "bg-teal-100 text-teal-700",
  WhatsApp: "bg-green-100 text-green-700",
  Referral: "bg-purple-100 text-purple-700",
  "Walk-in": "bg-amber-100 text-amber-700",
  Call: "bg-pink-100 text-pink-700",
  "Social Media": "bg-rose-100 text-rose-700",
  Other: "bg-gray-100 text-gray-700",
};

const SOURCE_ICONS: Record<string, typeof Globe> = {
  Website: Globe,
  Referral: Users,
  "Walk-in": Footprints,
  Call: Phone,
  "Social Media": Share2,
  WhatsApp: MessageCircle,
  Other: Mail,
};

const STATUS_COLORS: Record<string, string> = {
  New: "bg-emerald-500 text-white",
  Contacted: "bg-amber-500 text-white",
  Interested: "bg-purple-500 text-white",
  Qualified: "bg-teal-500 text-white",
  Proposal: "bg-purple-500 text-white",
  Negotiation: "bg-orange-500 text-white",
  Converted: "bg-green-500 text-white",
  Won: "bg-green-500 text-white",
  Lost: "bg-red-500 text-white",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  New: "bg-emerald-400",
  Contacted: "bg-amber-400",
  Interested: "bg-purple-400",
  Qualified: "bg-teal-400",
  Proposal: "bg-purple-400",
  Negotiation: "bg-orange-400",
  Converted: "bg-green-400",
  Won: "bg-green-400",
  Lost: "bg-red-400",
};

const STATUS_LEFT_BORDER: Record<string, string> = {
  New: "border-l-emerald-500",
  Contacted: "border-l-amber-500",
  Interested: "border-l-purple-500",
  Qualified: "border-l-teal-500",
  Proposal: "border-l-purple-500",
  Negotiation: "border-l-orange-500",
  Converted: "border-l-green-500",
  Won: "border-l-green-500",
  Lost: "border-l-red-500",
};

const LOST_REASONS = ["Price", "Moved", "No Response", "Competitor", "Other"];

type SortField = "createdAt" | "name" | "status" | "source" | "dealValue" | "followUpDate" | "score";
type SortOrder = "asc" | "desc";
type ViewMode = "table" | "kanban";

// ─── Score helpers ──────────────────────────────────────────────
function getScoreLabel(score: number): { label: string; color: string; bg: string; icon: typeof Flame } {
  if (score >= 70) return { label: "Hot", color: "text-red-700", bg: "bg-red-100 border-red-200", icon: Flame };
  if (score >= 40) return { label: "Warm", color: "text-amber-700", bg: "bg-amber-100 border-amber-200", icon: Sun };
  return { label: "Cold", color: "text-slate-700", bg: "bg-slate-100 border-slate-200", icon: Snowflake };
}

function parseScoreFactors(factorsJson: string): string[] {
  try {
    const f = JSON.parse(factorsJson) as Record<string, unknown>;
    const labels: string[] = [];
    if (f.phonePresent) labels.push("Phone provided (+5)");
    if (f.emailPresent) labels.push("Email provided (+5)");
    if (f.dealValueHigh) labels.push("Deal value > ₹10k (+20)");
    if (f.dealValueMedium) labels.push("Deal value > ₹5k (+10)");
    if (f.dealValueLow) labels.push("Deal value set (+3)");
    if (f.sourceReferral) labels.push("Referral source (+15)");
    if (f.sourceWebsite) labels.push("Website source (+10)");
    if (f.sourceWalkIn) labels.push("Walk-in source (+8)");
    if (f.commCount) {
      const c = f.commCount as number;
      if (c >= 5) labels.push(`High engagement: ${c} comms (+15)`);
      else if (c >= 3) labels.push(`Medium engagement: ${c} comms (+10)`);
      else labels.push(`${c} communication(s) (+5)`);
    }
    if (f.utmPresent) labels.push("UTM tracked (+5)");
    if (f.statusAdvanced) labels.push("Advanced status (+5-10)");
    return labels;
  } catch {
    return [];
  }
}

function ScoreBadge({ score, factorsJson }: { score: number; factorsJson: string }) {
  const { label, color, bg, icon: ScoreIcon } = getScoreLabel(score);
  const factors = parseScoreFactors(factorsJson);
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${bg} ${color} border text-xs font-semibold gap-1 cursor-default`}>
            <ScoreIcon className="h-3 w-3" />
            {score} · {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <p className="font-semibold text-xs mb-1">Score Breakdown ({score}/100)</p>
          {factors.length > 0 ? (
            <ul className="text-xs space-y-0.5">{factors.map((f) => <li key={f}>• {f}</li>)}</ul>
          ) : (
            <p className="text-xs text-muted-foreground">No scoring factors</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Sort icon
function SortIcon({ field, currentField }: { field: SortField; currentField: SortField }) {
  return (
    <ArrowUpDown className={`h-3 w-3 ml-1 inline ${field === currentField ? "text-foreground" : "text-muted-foreground/40"}`} />
  );
}

// ─── Kanban columns ─────────────────────────────────────────────
const KANBAN_COLUMNS = ["New", "Contacted", "Interested", "Qualified", "Converted", "Lost"] as const;
const KANBAN_COL_COLORS: Record<string, string> = {
  New: "border-t-emerald-500",
  Contacted: "border-t-amber-500",
  Interested: "border-t-purple-500",
  Qualified: "border-t-teal-500",
  Converted: "border-t-green-500",
  Lost: "border-t-red-500",
};

// ─── Deal value formatter ─────────────────────────────────────
function formatDealValue(val: number): string {
  if (!val) return "—";
  if (val >= 100000) {
    const lac = val / 100000;
    return `₹${lac % 1 === 0 ? lac.toFixed(0) : lac.toFixed(1)}L`;
  }
  if (val >= 1000) {
    const k = val / 1000;
    return `₹${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `₹${val}`;
}

// ─── Source icon helper ────────────────────────────────────────
function SourceIcon({ source }: { source: string }) {
  const Icon = SOURCE_ICONS[source] || Mail;
  return <Icon className="h-3 w-3" />;
}

// ─── Status dot badge ─────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={`${STATUS_COLORS[status] || "bg-gray-500 text-white"} border-0 text-xs gap-1.5`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLORS[status] || "bg-gray-300"} ring-1 ring-white/30`} />
      {status}
    </Badge>
  );
}

const emptyForm = {
  name: "", phone: "", email: "", area: "", source: "Website" as const,
  status: "New" as string, assignedTo: "", notes: "", followUpDate: "",
  dealValue: "", lostReason: "",
  utmSource: "", utmMedium: "", utmCampaign: "", utmContent: "",
};

// ─── Component ──────────────────────────────────────────────────
export function LeadsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [followUpFrom, setFollowUpFrom] = useState("");
  const [followUpTo, setFollowUpTo] = useState("");
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState("");
  const [analyticsDateTo, setAnalyticsDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateMatch[] | null>(null);
  const [pendingForm, setPendingForm] = useState<Record<string, unknown> | null>(null);

  // Kanban drag state
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);

  // Communications
  const [commsLeadId, setCommsLeadId] = useState<string | null>(null);
  const [commForm, setCommForm] = useState({ type: "Call", notes: "", outcome: "" });
  const [editingCommId, setEditingCommId] = useState<string | null>(null);

  // Team members for round-robin assignment
  const { data: teamData } = useQuery<{ members: TeamMember[] }>({
    queryKey: ["team-members"],
    queryFn: () => apiFetch("/api/leads?type=team-members"),
  });
  const teamMembers = teamData?.members || [];

  // Rescore all leads mutation
  const rescoreMutation = useMutation({
    mutationFn: () => apiFetch("/api/leads", { method: "POST", body: JSON.stringify({ action: "rescore-all" }) }),
    onSuccess: (d) => { toast.success(d.message || "All leads rescored"); queryClient.invalidateQueries({ queryKey: ["leads"] }); },
    onError: () => toast.error("Rescore failed"),
  });

  const { data: commsData } = useQuery<{ communications: LeadCommunication[] }>({
    queryKey: ["lead-comms", commsLeadId],
    queryFn: () => apiFetch(`/api/leads?type=communications&leadId=${commsLeadId}`),
    enabled: !!commsLeadId,
  });

  const commSaveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/leads", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Communication saved"); setCommForm({ type: "Call", notes: "", outcome: "" }); setEditingCommId(null); queryClient.invalidateQueries({ queryKey: ["lead-comms"] }); queryClient.invalidateQueries({ queryKey: ["leads"] }); },
    onError: () => toast.error("Failed"),
  });

  const commDeleteMutation = useMutation({
    mutationFn: (commId: string) => apiFetch("/api/leads", { method: "POST", body: JSON.stringify({ action: "delete-communication", commId }) }),
    onSuccess: () => { toast.success("Deleted"); queryClient.invalidateQueries({ queryKey: ["lead-comms"] }); queryClient.invalidateQueries({ queryKey: ["leads"] }); },
    onError: () => toast.error("Failed"),
  });

  // Queries
  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey: ["leads", page, search, sourceFilter, statusFilter, sortField, sortOrder],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        search,
        source: sourceFilter,
        status: statusFilter,
        sortField,
        sortOrder,
      });
      return apiFetch<LeadsResponse>(`/api/leads?${params}`);
    },
  });

  const leads = data?.leads || [];
  const stats = data?.stats || { total: 0, new: 0, converted: 0, lost: 0, thisMonth: 0 };
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;
  const rate = stats.total > 0 ? ((stats.converted / stats.total) * 100).toFixed(1) : "0";

  // Follow-ups
  const followUps = leads.filter((l) => {
    if (!l.followUpDate || l.status === "Converted" || l.status === "Lost") return false;
    if (followUpFrom && l.followUpDate < followUpFrom) return false;
    if (followUpTo && l.followUpDate > followUpTo) return false;
    return true;
  }).sort((a, b) => (a.followUpDate || "").localeCompare(b.followUpDate || ""));

  // All leads for analytics
  const { data: allLeadsData } = useQuery<LeadsResponse>({
    queryKey: ["leads-all", analyticsDateFrom, analyticsDateTo],
    queryFn: () => {
      const params = new URLSearchParams({ page: "1", perPage: "9999" });
      if (analyticsDateFrom) params.set("dateFrom", analyticsDateFrom);
      if (analyticsDateTo) params.set("dateTo", analyticsDateTo);
      return apiFetch<LeadsResponse>(`/api/leads?${params}`);
    },
  });
  const allLeads = allLeadsData?.leads || leads;

  // Kanban: all leads without pagination for drag-and-drop
  const { data: kanbanData } = useQuery<LeadsResponse>({
    queryKey: ["leads-kanban", search, sourceFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: "1", perPage: "9999", search, source: sourceFilter });
      return apiFetch<LeadsResponse>(`/api/leads?${params}`);
    },
    enabled: viewMode === "kanban",
  });
  const kanbanLeads = kanbanData?.leads || leads;

  const sourceData = ["Website", "WhatsApp", "Referral", "Walk-in", "Call", "Social Media"].map((s) => ({
    name: s, count: allLeads.filter((l) => l.source === s).length,
  })).sort((a, b) => b.count - a.count);

  const funnelData = [
    { stage: "New", count: allLeads.filter((l) => ["New", "Contacted", "Interested", "Qualified", "Converted"].includes(l.status)).length },
    { stage: "Contacted", count: allLeads.filter((l) => ["Contacted", "Interested", "Qualified", "Converted"].includes(l.status)).length },
    { stage: "Qualified", count: allLeads.filter((l) => ["Qualified", "Converted"].includes(l.status)).length },
    { stage: "Converted", count: allLeads.filter((l) => l.status === "Converted").length },
  ];
  const maxFunnel = Math.max(...funnelData.map((f) => f.count), 1);

  const lostReasonsBreakdown = (() => {
    const lostLeads = allLeads.filter((l) => l.status === "Lost");
    const breakdown: Record<string, number> = {};
    lostLeads.forEach((l) => {
      const reason = l.lostReason || "Unspecified";
      breakdown[reason] = (breakdown[reason] || 0) + 1;
    });
    return Object.entries(breakdown).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }));
  })();

  const totalDealValue = allLeads.reduce((sum, l) => sum + (l.dealValue || 0), 0);
  const avgDealValue = allLeads.length > 0 ? totalDealValue / allLeads.length : 0;

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortOrder("asc"); }
    setPage(1);
  };

  const exportCsv = () => {
    const params = new URLSearchParams({ page: "1", perPage: "9999", search, source: sourceFilter, status: statusFilter, export: "csv" });
    window.open(`/api/leads?${params}`, "_blank");
    toast.success("CSV export started");
  };

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => apiFetch("/api/leads", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d, vars) => {
      const isEdit = vars.action === "update";
      if (d.success) {
        toast.success(isEdit ? "Lead updated successfully" : "Lead added successfully");
        setDialogOpen(false);
        setEditingLead(null);
        setForm(emptyForm);
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      } else {
        toast.error(d.error || "Failed to save lead");
      }
    },
    onError: () => toast.error("Failed to save lead"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/leads", { method: "POST", body: JSON.stringify({ action: "delete", leadId: id }) }),
    onSuccess: (d) => {
      if (d.success) { toast.success("Lead deleted"); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["leads"] }); }
      else toast.error(d.error || "Failed to delete");
    },
    onError: () => toast.error("Failed to delete lead"),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/leads", { method: "POST", body: JSON.stringify({ action: "update-status", leadId: id, status: "Converted" }) }),
    onSuccess: (d) => {
      if (d.success) { toast.success(d.message || "Lead converted"); queryClient.invalidateQueries({ queryKey: ["leads"] }); }
      else toast.error(d.error || "Failed to convert");
    },
    onError: () => toast.error("Failed to convert lead"),
  });

  const statusChangeMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch("/api/leads", { method: "POST", body: JSON.stringify({ action: "update-status", leadId: id, status }) }),
    onSuccess: (d) => {
      if (d.success) { toast.success(d.message || "Status updated"); queryClient.invalidateQueries({ queryKey: ["leads"] }); }
      else toast.error(d.error || "Failed to update");
    },
    onError: () => toast.error("Failed to update status"),
  });

  const openNew = () => { setEditingLead(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (lead: Lead) => {
    setEditingLead(lead);
    setForm({
      name: lead.name, phone: lead.phone, email: lead.email, area: lead.address,
      source: lead.source as typeof emptyForm.source, status: lead.status as typeof emptyForm.status,
      assignedTo: lead.assignedToId || "", notes: lead.notes,
      followUpDate: lead.followUpDate || "",
      dealValue: lead.dealValue ? String(lead.dealValue) : "",
      lostReason: lead.lostReason || "",
      utmSource: lead.utmSource || "", utmMedium: lead.utmMedium || "",
      utmCampaign: lead.utmCampaign || "", utmContent: lead.utmContent || "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.phone) { toast.error("Name and phone are required"); return; }
    const body: Record<string, unknown> = {
      name: form.name, phone: form.phone, email: form.email, address: form.area,
      source: form.source, status: form.status, assignedToId: form.assignedTo || null,
      notes: form.notes, followUpDate: form.followUpDate || null,
      dealValue: form.dealValue ? Number(form.dealValue) : 0,
      lostReason: form.status === "Lost" ? form.lostReason : "",
      utmSource: form.utmSource, utmMedium: form.utmMedium,
      utmCampaign: form.utmCampaign, utmContent: form.utmContent,
    };
    if (editingLead) {
      saveMutation.mutate({ action: "update", leadId: editingLead.id, ...body });
    } else {
      // Check for duplicates first
      setPendingForm({ action: "create", ...body });
      saveMutation.mutate(
        { action: "create", ...body },
        {
          onError: (err: unknown) => {
            // Try to parse duplicates from the error message (apiFetch throws Error with JSON text)
            try {
              const errMsg = (err as Error).message || "";
              const jsonMatch = errMsg.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as { duplicates?: DuplicateMatch[] };
                if (parsed?.duplicates && Array.isArray(parsed.duplicates) && parsed.duplicates.length > 0) {
                  setDuplicateWarning(parsed.duplicates);
                  return;
                }
              }
            } catch { /* fall through */ }
            toast.error("Failed to save lead");
          },
        }
      );
    }
  };

  // Override duplicate and force create
  const handleOverrideDuplicate = () => {
    if (!pendingForm) return;
    saveMutation.mutate({ ...pendingForm, skipDuplicate: true });
    setDuplicateWarning(null);
    setPendingForm(null);
  };

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  // Kanban DnD handlers
  const handleDragStart = useCallback((e: React.DragEvent, leadId: string) => {
    setDragLeadId(leadId);
    e.dataTransfer.effectAllowed = "move";
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(img, 0, 0);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, col: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(col);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback((col: string) => {
    if (dragLeadId && col) {
      statusChangeMutation.mutate({ id: dragLeadId, status: col });
    }
    setDragLeadId(null);
    setDragOverColumn(null);
  }, [dragLeadId, statusChangeMutation]);

  const handleDragEnd = useCallback(() => {
    setDragLeadId(null);
    setDragOverColumn(null);
  }, []);

  const paginationRange = (() => {
    const range: number[] = [];
    const delta = 2;
    const left = Math.max(1, page - delta);
    const right = Math.min(totalPages, page + delta);
    for (let i = left; i <= right; i++) range.push(i);
    return range;
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads & Prospects</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and convert new connection inquiries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Button onClick={openNew} className="bg-[#DC2626] hover:bg-[#B91C1C]">
            <Plus className="h-4 w-4 mr-2" /> Add Lead
          </Button>
          <Button variant="outline" size="sm" onClick={() => rescoreMutation.mutate()} disabled={rescoreMutation.isPending} title="Recalculate all lead scores based on communications and criteria">
            {rescoreMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Award className="h-4 w-4 mr-1" />} Rescore All
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: stats.total, icon: Users, gradient: "from-emerald-500 to-emerald-700" },
          { label: "This Month New", value: stats.thisMonth, icon: Plus, gradient: "from-amber-500 to-amber-700" },
          { label: "Converted", value: stats.converted, icon: UserCheck, gradient: "from-green-500 to-green-700" },
          { label: "Conversion Rate", value: `${rate}%`, icon: TrendingUp, gradient: "from-[#DC2626] to-[#991B1B]" },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-md overflow-hidden">
            <div className={`bg-gradient-to-br ${s.gradient} p-4 rounded-xl`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-xs font-medium">{s.label}</p>
                  <p className="text-white text-2xl font-bold mt-1">{s.value}</p>
                </div>
                <s.icon className="h-8 w-8 text-white/30" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="flex gap-3"><Skeleton className="skeleton-wave h-9 w-64" /><Skeleton className="skeleton-wave h-9 w-32" /><Skeleton className="skeleton-wave h-9 w-32" /></div>
          <Card className="border"><CardContent className="p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)}</CardContent></Card>
        </div>
      ) : (
        <Tabs defaultValue="pipeline">
          <TabsList className="bg-muted">
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="followups">Follow-ups ({followUps.length})</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Pipeline Tab */}
          <TabsContent value="pipeline" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search leads..." value={search} onChange={(e) => handleFilterChange(setSearch, e.target.value)} className="pl-9" />
              </div>
              <Select value={sourceFilter} onValueChange={(v) => handleFilterChange(setSourceFilter, v)}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Sources</SelectItem>
                  {Object.keys(SOURCE_COLORS).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => handleFilterChange(setStatusFilter, v)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Status</SelectItem>
                  {Object.keys(STATUS_COLORS).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* View Toggle */}
              <div className="flex border rounded-md">
                <Button variant={viewMode === "table" ? "default" : "ghost"} size="sm" className="h-9 px-3" onClick={() => setViewMode("table")}>
                  <List className="h-4 w-4" />
                </Button>
                <Button variant={viewMode === "kanban" ? "default" : "ghost"} size="sm" className="h-9 px-3" onClick={() => setViewMode("kanban")}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* ─── TABLE VIEW ─── */}
            {viewMode === "table" && (
              <>
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("name")}>
                              Name <SortIcon field="name" currentField={sortField} />
                            </th>
                            <th className="text-left p-3 font-medium">Phone</th>
                            <th className="text-left p-3 font-medium hidden md:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("source")}>
                              Source <SortIcon field="source" currentField={sortField} />
                            </th>
                            <th className="text-left p-3 font-medium hidden lg:table-cell">Area</th>
                            <th className="text-left p-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("status")}>
                              Status <SortIcon field="status" currentField={sortField} />
                            </th>
                            <th className="text-left p-3 font-medium hidden md:table-cell">Score</th>
                            <th className="text-left p-3 font-medium hidden md:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("dealValue")}>
                              Deal Value <SortIcon field="dealValue" currentField={sortField} />
                            </th>
                            <th className="text-left p-3 font-medium hidden lg:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("followUpDate")}>
                              Follow-up <SortIcon field="followUpDate" currentField={sortField} />
                            </th>
                            <th className="text-left p-3 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leads.map((lead) => (
                            <tr key={lead.id} className="border-b hover:bg-muted/40 hover:shadow-sm transition-all duration-200 animate-in fade-in-0 slide-in-from-bottom-1">
                              <td className="p-3">
                                <button onClick={() => setViewLead(lead)} className="font-medium text-foreground hover:text-[#DC2626] transition-colors">{lead.name}</button>
                                {lead.email && <p className="text-xs text-muted-foreground mt-0.5">{lead.email}</p>}
                                {lead.duplicateOf && (
                                  <Badge variant="outline" className="text-[10px] mt-1 border-amber-300 text-amber-700 bg-amber-50 gap-0.5">
                                    <Copy className="h-2.5 w-2.5" /> Duplicate
                                  </Badge>
                                )}
                              </td>
                              <td className="p-3 text-muted-foreground">{lead.phone}</td>
                              <td className="p-3 hidden md:table-cell"><Badge className={`${SOURCE_COLORS[lead.source] || ""} border-0 text-xs gap-1`}><SourceIcon source={lead.source} />{lead.source}</Badge></td>
                              <td className="p-3 hidden lg:table-cell text-muted-foreground">{lead.address || "—"}</td>
                              <td className="p-3">
                                <StatusBadge status={lead.status} />
                                {lead.status === "Lost" && lead.lostReason && <span className="text-xs text-muted-foreground ml-1">({lead.lostReason})</span>}
                              </td>
                              <td className="p-3 hidden md:table-cell">
                                <ScoreBadge score={lead.score || 0} factorsJson={lead.scoreFactors || "{}"} />
                              </td>
                              <td className="p-3 hidden md:table-cell font-medium text-foreground">
                                {formatDealValue(lead.dealValue)}
                              </td>
                              <td className="p-3 hidden lg:table-cell text-muted-foreground">{lead.followUpDate || "—"}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(lead)}><Edit className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-teal-500" onClick={() => { setViewLead(lead); setTimeout(() => setCommsLeadId(lead.id), 100); }} title="Communications"><MessageSquare className="h-3.5 w-3.5" /></Button>
                                  {!["Converted", "Lost"].includes(lead.status) && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => convertMutation.mutate(lead.id)}><CheckCircle className="h-3.5 w-3.5" /></Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setDeleteId(lead.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {leads.length === 0 && (
                            <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                              <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                              <p className="font-medium">No leads found</p>
                              <p className="text-xs text-muted-foreground/60 mt-1">Add your first lead to get started</p>
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Showing {((page - 1) * 15) + 1}–{Math.min(page * 15, total)} of {total}</p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                      {paginationRange[0] > 1 && (<><Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPage(1)}>1</Button>{paginationRange[0] > 2 && <span className="px-1 text-muted-foreground">...</span>}</>)}
                      {paginationRange.map((p) => (<Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" onClick={() => setPage(p)}>{p}</Button>))}
                      {paginationRange[paginationRange.length - 1] < totalPages && (<>{paginationRange[paginationRange.length - 1] < totalPages - 1 && <span className="px-1 text-muted-foreground">...</span>}<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPage(totalPages)}>{totalPages}</Button></>)}
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ─── KANBAN VIEW ─── */}
            {viewMode === "kanban" && (
              <div className="overflow-x-auto pb-2 -mx-1">
              <div className="flex gap-4 min-w-[1200px] px-1">
                {KANBAN_COLUMNS.map((col) => {
                  const colLeads = kanbanLeads.filter((l) => l.status === col);
                  const isOver = dragOverColumn === col;
                  return (
                    <div
                      key={col}
                      className={`rounded-xl border-2 border-t-4 bg-muted/30 min-w-[280px] max-w-[320px] flex-shrink-0 min-h-[400px] transition-colors ${KANBAN_COL_COLORS[col] || ""} ${isOver ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
                      onDragOver={(e) => handleDragOver(e, col)}
                      onDragLeave={handleDragLeave}
                      onDrop={() => handleDrop(col)}
                    >
                      <div className="flex items-center justify-between p-3 border-b">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={col} />
                          <span className="text-xs font-medium text-muted-foreground">{colLeads.length}</span>
                        </div>
                        {colLeads.length > 0 && (
                          <span className="text-[10px] text-muted-foreground font-medium">{formatDealValue(colLeads.reduce((s, l) => s + (l.dealValue || 0), 0))}</span>
                        )}
                      </div>
                      <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto">
                        {colLeads.map((lead) => (
                          <Card
                            key={lead.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, lead.id)}
                            onDragEnd={handleDragEnd}
                            className={`cursor-grab active:cursor-grabbing hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-l-4 ${STATUS_LEFT_BORDER[col] || ""} ${dragLeadId === lead.id ? "opacity-40 scale-95" : "animate-in fade-in-0 slide-in-from-bottom-1"}`}
                            onClick={() => setViewLead(lead)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm truncate">{lead.name}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{lead.phone}</p>
                                </div>
                                <ScoreBadge score={lead.score || 0} factorsJson={lead.scoreFactors || "{}"} />
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge className={`${SOURCE_COLORS[lead.source] || ""} border-0 text-[10px] gap-1`}><SourceIcon source={lead.source} />{lead.source}</Badge>
                                {lead.dealValue > 0 && (
                                  <span className="text-[10px] text-foreground font-semibold">{formatDealValue(lead.dealValue)}</span>
                                )}
                              </div>
                              {lead.followUpDate && (
                                <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {lead.followUpDate}
                                </div>
                              )}
                              <div className="flex items-center gap-1 mt-2">
                                <GripVertical className="h-3 w-3 text-muted-foreground/30" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        {colLeads.length === 0 && (
                          <div className="flex flex-col items-center justify-center h-20 text-xs text-muted-foreground/50 gap-1">
                            <GripVertical className="h-4 w-4" />
                            Drop leads here
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            )}
          </TabsContent>

          {/* Follow-ups Tab */}
          <TabsContent value="followups" className="space-y-4">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div><Label className="text-xs text-muted-foreground mb-1 block">From</Label><Input type="date" value={followUpFrom} onChange={(e) => setFollowUpFrom(e.target.value)} className="w-full sm:w-44" /></div>
                  <div><Label className="text-xs text-muted-foreground mb-1 block">To</Label><Input type="date" value={followUpTo} onChange={(e) => setFollowUpTo(e.target.value)} className="w-full sm:w-44" /></div>
                  {(followUpFrom || followUpTo) && <Button variant="ghost" size="sm" onClick={() => { setFollowUpFrom(""); setFollowUpTo(""); }}><X className="h-3.5 w-3.5 mr-1" /> Clear</Button>}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Upcoming Follow-ups</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Lead</th>
                      <th className="text-left p-3 font-medium">Phone</th>
                      <th className="text-left p-3 font-medium">Score</th>
                      <th className="text-left p-3 font-medium">Follow-up Date</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Notes</th>
                      <th className="text-left p-3 font-medium">Actions</th>
                    </tr></thead>
                    <tbody>
                      {followUps.map((lead) => {
                        const isOverdue = lead.followUpDate && new Date(lead.followUpDate) < new Date();
                        return (
                          <tr key={lead.id} className="border-b hover:bg-muted/30">
                            <td className="p-3 font-medium">{lead.name}</td>
                            <td className="p-3 text-muted-foreground">{lead.phone}</td>
                            <td className="p-3"><ScoreBadge score={lead.score || 0} factorsJson={lead.scoreFactors || "{}"} /></td>
                            <td className="p-3">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium ${isOverdue ? "text-red-600 bg-red-50" : "text-foreground bg-muted"}`}>
                                <Clock className="h-3 w-3" /> {lead.followUpDate} {isOverdue && "(Overdue)"}
                              </span>
                            </td>
                            <td className="p-3 hidden md:table-cell text-muted-foreground max-w-[200px] truncate">{lead.notes || "—"}</td>
                            <td className="p-3"><div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(lead)}>Update</Button>
                              <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => convertMutation.mutate(lead.id)}>Convert</Button>
                            </div></td>
                          </tr>
                        );
                      })}
                      {followUps.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No pending follow-ups</td></tr>}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div><Label className="text-xs text-muted-foreground mb-1 block">Date From</Label><Input type="date" value={analyticsDateFrom} onChange={(e) => setAnalyticsDateFrom(e.target.value)} className="w-full sm:w-44" /></div>
                  <div><Label className="text-xs text-muted-foreground mb-1 block">Date To</Label><Input type="date" value={analyticsDateTo} onChange={(e) => setAnalyticsDateTo(e.target.value)} className="w-full sm:w-44" /></div>
                  {(analyticsDateFrom || analyticsDateTo) && <Button variant="ghost" size="sm" onClick={() => { setAnalyticsDateFrom(""); setAnalyticsDateTo(""); }}><X className="h-3.5 w-3.5 mr-1" /> Clear</Button>}
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><PieChart className="h-4 w-4" /> Lead Source Distribution</CardTitle></CardHeader>
                <CardContent><div className="space-y-3">{sourceData.map((s) => {
                  const pct = stats.total > 0 ? ((s.count / stats.total) * 100).toFixed(0) : "0";
                  return (<div key={s.name} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-24">{s.name}</span>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden"><div className="h-full bg-[#DC2626] rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                    <span className="text-sm text-muted-foreground w-16 text-right">{s.count} ({pct}%)</span>
                  </div>);
                })}</div></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Conversion Funnel</CardTitle></CardHeader>
                <CardContent><div className="space-y-2">{funnelData.map((f, i) => {
                  const pct = ((f.count / maxFunnel) * 100).toFixed(0);
                  const dropPct = i > 0 && funnelData[i - 1].count > 0 ? (((funnelData[i - 1].count - f.count) / funnelData[i - 1].count) * 100).toFixed(0) : "0";
                  return (<div key={f.stage}>
                    <div className="flex items-center justify-between mb-1"><span className="text-sm font-medium">{f.stage}</span><span className="text-sm text-muted-foreground">{f.count} {i > 0 && <span className="text-red-500 ml-1">(-{dropPct}%)</span>}</span></div>
                    <div className="h-8 bg-muted rounded-lg overflow-hidden"><div className="h-full bg-gradient-to-r from-[#DC2626] to-[#F87171] rounded-lg flex items-center pl-3 transition-all" style={{ width: `${Math.max(Number(pct), 15)}%` }}><span className="text-xs text-white font-bold">{pct}%</span></div></div>
                  </div>);
                })}</div></CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Deal Value Summary</CardTitle></CardHeader>
                <CardContent><div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg"><p className="text-2xl font-bold text-foreground">{formatDealValue(totalDealValue)}</p><p className="text-xs text-muted-foreground mt-1">Total Pipeline Value</p></div>
                  <div className="text-center p-4 bg-muted rounded-lg"><p className="text-2xl font-bold text-foreground">{formatDealValue(avgDealValue)}</p><p className="text-xs text-muted-foreground mt-1">Avg. Deal Value</p></div>
                </div></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Lost Reason Breakdown</CardTitle></CardHeader>
                <CardContent>{lostReasonsBreakdown.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-4">No lost leads</p>) : (
                  <div className="space-y-2">{lostReasonsBreakdown.map((item) => {
                    const pct = stats.total > 0 ? ((item.count / stats.total) * 100).toFixed(0) : "0";
                    return (<div key={item.reason} className="flex items-center gap-3"><span className="text-sm font-medium w-24">{item.reason}</span><div className="flex-1 h-5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${pct}%` }} /></div><span className="text-sm text-muted-foreground w-16 text-right">{item.count}</span></div>);
                  })}</div>
                )}</CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="border-0 shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{rate}%</p><p className="text-xs text-muted-foreground mt-1">Overall Conversion</p></CardContent></Card>
              <Card className="border-0 shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{sourceData[0]?.name || "—"}</p><p className="text-xs text-muted-foreground mt-1">Top Source</p></CardContent></Card>
              <Card className="border-0 shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{allLeads.filter((l) => l.status === "Lost").length}</p><p className="text-xs text-muted-foreground mt-1">Lost Leads</p></CardContent></Card>
              <Card className="border-0 shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{allLeads.filter((l) => (l.score || 0) >= 70).length}</p><p className="text-xs text-muted-foreground mt-1">Hot Leads (≥70)</p></CardContent></Card>
            </div>
            {/* UTM Attribution Analytics */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4" />UTM Source Attribution</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const utmLeads = allLeads.filter((l) => l.utmSource);
                  if (utmLeads.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No UTM-tracked leads yet. Add UTM parameters when creating leads.</p>;
                  const utmSources: Record<string, number> = {};
                  utmLeads.forEach((l) => { const key = l.utmSource; utmSources[key] = (utmSources[key] || 0) + 1; });
                  const utmEntries = Object.entries(utmSources).sort((a, b) => b[1] - a[1]);
                  return (
                    <div className="space-y-2">
                      {utmEntries.map(([src, cnt]) => {
                        const pct = ((cnt / utmLeads.length) * 100).toFixed(0);
                        return (
                          <div key={src} className="flex items-center gap-3">
                            <span className="text-sm font-medium w-28 truncate">{src}</span>
                            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                            <span className="text-sm text-muted-foreground w-16 text-right">{cnt} ({pct}%)</span>
                          </div>
                        );
                      })}
                      <p className="text-[10px] text-muted-foreground pt-1">{utmLeads.length} of {allLeads.length} leads have UTM tracking ({((utmLeads.length / allLeads.length) * 100).toFixed(0)}%)</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLead ? "Edit Lead" : "Add New Lead"}</DialogTitle>
            <DialogDescription>{editingLead ? "Update lead information" : "Enter new lead details"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" /></div>
              <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" /></div>
              <div><Label>Area</Label><Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Sector/Area name" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v as typeof emptyForm.source })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(SOURCE_COLORS).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof emptyForm.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(STATUS_COLORS).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Deal Value (₹)</Label><Input type="number" min="0" value={form.dealValue} onChange={(e) => setForm({ ...form, dealValue: e.target.value })} placeholder="0" /></div>
              <div><Label>Assigned To</Label>
                <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v })}>
                  <SelectTrigger><SelectValue placeholder="Auto-assign (round-robin)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Auto-assign (round-robin)</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name} ({m.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Follow-up Date</Label><Input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} /></div>
              {form.status === "Lost" && (
                <div><Label>Lost Reason</Label>
                  <Select value={form.lostReason} onValueChange={(v) => setForm({ ...form, lostReason: v })}>
                    <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="border-t border-dashed pt-4 mt-2"><p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5"><Calendar className="h-3 w-3" />UTM Tracking (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>UTM Source</Label><Input value={form.utmSource} onChange={(e) => setForm({ ...form, utmSource: e.target.value })} placeholder="google / facebook" className="mt-1" /></div>
              <div><Label>UTM Medium</Label><Input value={form.utmMedium} onChange={(e) => setForm({ ...form, utmMedium: e.target.value })} placeholder="cpc / organic" className="mt-1" /></div>
              <div><Label>UTM Campaign</Label><Input value={form.utmCampaign} onChange={(e) => setForm({ ...form, utmCampaign: e.target.value })} placeholder="summer-sale" className="mt-1" /></div>
              <div><Label>UTM Content</Label><Input value={form.utmContent} onChange={(e) => setForm({ ...form, utmContent: e.target.value })} placeholder="hero-banner" className="mt-1" /></div>
            </div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this lead..." rows={3} /></div>
            {!editingLead && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Leave empty for auto round-robin assignment to sales team</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#DC2626] hover:bg-[#B91C1C]" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : editingLead ? "Update" : "Add Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Warning Dialog */}
      <AlertDialog open={!!duplicateWarning} onOpenChange={() => { setDuplicateWarning(null); setPendingForm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Possible Duplicate Found</AlertDialogTitle>
            <AlertDialogDescription>
              A lead with similar contact information already exists:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            {duplicateWarning?.map((dup) => (
              <div key={dup.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{dup.name}</p>
                  <p className="text-xs text-muted-foreground">{dup.phone} {dup.email ? `· ${dup.email}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDuplicateWarning(null); setPendingForm(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleOverrideDuplicate} className="bg-[#DC2626] hover:bg-[#B91C1C]">
              Create Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Dialog */}
      <Dialog open={!!viewLead} onOpenChange={(open) => { if (!open) { setViewLead(null); setCommsLeadId(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {viewLead && (
            <>
              <DialogHeader>
                <DialogTitle>{viewLead.name}</DialogTitle>
                <DialogDescription>Lead Details — {viewLead.id.substring(0, 8)}</DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="details">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="communications" onClick={() => setCommsLeadId(viewLead.id)}>Communications</TabsTrigger>
                </TabsList>

                {/* Details Tab */}
                <TabsContent value="details" className="mt-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <ScoreBadge score={viewLead.score || 0} factorsJson={viewLead.scoreFactors || "{}"} />
                      {viewLead.duplicateOf && <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-xs"><Copy className="h-3 w-3 mr-1" />Duplicate</Badge>}
                    </div>
                    <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{viewLead.phone}</span></div>
                    {viewLead.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{viewLead.email}</span></div>}
                    <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{viewLead.address || "—"}</span></div>
                    <div className="flex items-center gap-2"><IndianRupee className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">{viewLead.dealValue ? formatDealValue(viewLead.dealValue) : "No deal value"}</span></div>
                    <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-sm">Created: {viewLead.createdAt}</span></div>
                    <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-sm">Follow-up: {viewLead.followUpDate || "Not set"}</span></div>
                    <div className="flex gap-2">
                      <Badge className={`${SOURCE_COLORS[viewLead.source] || ""} border-0 gap-1`}><SourceIcon source={viewLead.source} />{viewLead.source}</Badge>
                      <StatusBadge status={viewLead.status} />
                    </div>
                    {viewLead.assignedToId && <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-muted-foreground" /><span className="text-sm">Assigned to: {viewLead.assignedName || viewLead.assignedToId.substring(0, 8)}</span></div>}
                    {viewLead.notes && <div className="text-sm text-muted-foreground bg-muted p-2 rounded-lg">{viewLead.notes}</div>}
                    {viewLead.utmSource && (
                      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
                        <span className="font-medium">UTM:</span> {viewLead.utmSource}{viewLead.utmMedium ? ` / ${viewLead.utmMedium}` : ""}{viewLead.utmCampaign ? ` / ${viewLead.utmCampaign}` : ""}{viewLead.utmContent ? ` (${viewLead.utmContent})` : ""}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Communications Tab */}
                <TabsContent value="communications" className="mt-4 space-y-4">
                  {commsData && commsData.communications.length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {commsData.communications.map((c) => {
                        const commIcon = c.type === "Call" ? <Phone className="h-3 w-3" /> : c.type === "Email" ? <Mail className="h-3 w-3" /> : c.type === "WhatsApp" ? <MessageCircle className="h-3 w-3" /> : <Send className="h-3 w-3" />;
                        const commColor = c.type === "Call" ? "text-green-600" : c.type === "Email" ? "text-slate-600" : c.type === "WhatsApp" ? "text-emerald-600" : "text-gray-600";
                        return (
                          <Card key={c.id} className="border p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={commColor}>{commIcon}</span>
                                  <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600">{c.type}</Badge>
                                  <span className="text-[10px] text-muted-foreground">{new Date(c.date).toLocaleDateString()}</span>
                                </div>
                                {c.notes && <p className="text-xs text-foreground">{c.notes}</p>}
                                {c.outcome && <p className="text-[10px] text-muted-foreground mt-1">Outcome: {c.outcome}</p>}
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingCommId(c.id); setCommForm({ type: c.type, notes: c.notes, outcome: c.outcome }); }}><Edit className="h-3 w-3" /></Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => commDeleteMutation.mutate(c.id)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                  {(!commsData || commsData.communications.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-4">No communications recorded yet.</p>
                  )}

                  {/* Add/Edit Communication Form */}
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{editingCommId ? "Edit Communication" : "Log New Communication"}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Select value={commForm.type} onValueChange={(v) => setCommForm({ ...commForm, type: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Call">Call</SelectItem>
                            <SelectItem value="Email">Email</SelectItem>
                            <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                            <SelectItem value="Visit">Visit</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Input value={commForm.outcome} onChange={(e) => setCommForm({ ...commForm, outcome: e.target.value })} placeholder="Outcome" className="h-8 text-xs" />
                      </div>
                    </div>
                    <Textarea value={commForm.notes} onChange={(e) => setCommForm({ ...commForm, notes: e.target.value })} placeholder="Notes..." rows={2} className="text-xs" />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => {
                        if (editingCommId) {
                          commSaveMutation.mutate({ action: "update-communication", commId: editingCommId, ...commForm });
                        } else {
                          commSaveMutation.mutate({ action: "add-communication", leadId: viewLead.id, ...commForm });
                        }
                      }} disabled={commSaveMutation.isPending}>
                        {commSaveMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {editingCommId ? "Update" : "Add"}
                      </Button>
                      {editingCommId && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingCommId(null); setCommForm({ type: "Call", notes: "", outcome: "" }); }}>Cancel</Button>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Lead</AlertDialogTitle><AlertDialogDescription>Are you sure? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending} className="bg-red-600 hover:bg-red-700">{deleteMutation.isPending ? "Deleting..." : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export default LeadsPage;
