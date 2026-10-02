"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ShieldAlert, Send, Phone, Gift, RefreshCw, Users, UserCheck, TrendingDown, Search,
  ChevronLeft, ChevronRight, ArrowUpDown, Download, Eye, GiftIcon,
  Settings, Plus, MessageSquare, X, CheckCircle2, Bookmark, BookmarkCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";

interface ChurnAlert {
  id: string;
  subscriberId: string;
  subscriberName: string;
  phone: string;
  plan: string;
  riskScore: number;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  lastPaymentDate: string | null;
  overdueAmount: number;
  complaintsCount: number;
  status: string;
  isTracked?: boolean;
}

interface ChurnSummary {
  totalAtRisk: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  contacted: number;
  saved: number;
}

interface ChurnTracking {
  id: string;
  subscriberId: string;
  status: string;
  notes: string;
  createdAt: string;
}

interface ChurnCommunication {
  id: string;
  trackingId: string;
  subscriberId: string;
  actionType: string;
  actionDetail: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

interface WorkflowRule {
  riskLevel: string;
  action: string;
  enabled: boolean;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

const REASON_COLORS: Record<string, string> = {
  "3+ overdue invoices": "#DC2626",
  "2 overdue invoices": "#EA580C",
  "1 overdue invoice": "#D97706",
  "Overdue 30+ days": "#DC2626",
  "Overdue 15 days": "#EA580C",
  "3+ open complaints": "#DC2626",
  "No payment in": "#7C3AED",
  "Pending payments": "#D97706",
  "Payment frequency declining": "#7C3AED",
};

export default function ChurnAlertsPage() {
  const queryClient = useQueryClient();
  const [actionDialog, setActionDialog] = useState<{ open: boolean; subscriberId: string; subscriberName: string; action: string }>({ open: false, subscriberId: "", subscriberName: "", action: "" });
  const [actionNote, setActionNote] = useState("");
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [trackingFilter, setTrackingFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState<string>("riskScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailSubscriber, setDetailSubscriber] = useState<ChurnAlert | null>(null);
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  // Workflow settings dialog
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowRule[]>([]);
  // Communication dialog
  const [commDialog, setCommDialog] = useState(false);
  const [commNote, setCommNote] = useState("");
  const [commActionType, setCommActionType] = useState("reminder");

  // Bookmark / saved tracking (localStorage)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("churn-saved-"));
      return new Set(keys.map(k => k.replace("churn-saved-", "")));
    } catch { return new Set(); }
  });

  const toggleBookmark = (subscriberId: string) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(subscriberId)) {
        next.delete(subscriberId);
        localStorage.removeItem(`churn-saved-${subscriberId}`);
        toast.success("Removed from tracking");
      } else {
        next.add(subscriberId);
        localStorage.setItem(`churn-saved-${subscriberId}`, new Date().toISOString());
        toast.success("Marked as being retained");
      }
      return next;
    });
  };

  const { data, isLoading } = useQuery<{ summary: ChurnSummary; subscribers: ChurnAlert[] }>({
    queryKey: ["churn-alerts"],
    queryFn: () => apiFetch("/api/churn-alerts"),
  });

  // Fetch tracking data
  const { data: trackingData } = useQuery<ChurnTracking[]>({
    queryKey: ["churn-tracking"],
    queryFn: () => apiFetch("/api/churn-alerts/tracking"),
  });

  // Fetch communication history
  const { data: commHistory, refetch: refetchCommHistory } = useQuery<ChurnCommunication[]>({
    queryKey: ["churn-comm", detailSubscriber?.subscriberId],
    queryFn: () => apiFetch(`/api/churn-alerts/communications?subscriberId=${detailSubscriber?.subscriberId}`),
    enabled: !!detailSubscriber?.subscriberId,
  });

  // Fetch workflow config
  const { data: workflowConfig } = useQuery<{ workflows: WorkflowRule[] }>({
    queryKey: ["churn-workflow-config"],
    queryFn: () => apiFetch("/api/churn-alerts/workflows"),
  });

  // Load workflows when dialog opens - derive state during render instead of useMemo
  const [prevWorkflowConfig, setPrevWorkflowConfig] = useState<{ workflows: WorkflowRule[] } | undefined>(undefined);
  if (workflowConfig && workflowConfig !== prevWorkflowConfig) {
    setPrevWorkflowConfig(workflowConfig);
    setWorkflows(workflowConfig.workflows);
  }

  const actionMutation = useMutation({
    mutationFn: async ({ subscriberId, action, note }: { subscriberId: string; action: string; note: string }) => {
      return apiFetch("/api/churn-alerts", { method: "POST", body: JSON.stringify({ subscriberId, action, note }) });
    },
    onSuccess: () => {
      toast.success("Action completed successfully!");
      setActionDialog({ ...actionDialog, open: false });
      setActionNote("");
      queryClient.invalidateQueries({ queryKey: ["churn-alerts"] });
      if (detailSubscriber) refetchCommHistory();
    },
    onError: () => { toast.error("Failed to perform action."); },
  });

  // Track subscriber
  const trackMutation = useMutation({
    mutationFn: async ({ subscriberId, action }: { subscriberId: string; action: string }) => {
      return apiFetch("/api/churn-alerts/tracking", { method: "POST", body: JSON.stringify({ subscriberId, action }) });
    },
    onSuccess: () => {
      toast.success("Tracking updated!");
      queryClient.invalidateQueries({ queryKey: ["churn-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["churn-tracking"] });
      setDetailSubscriber(null);
    },
    onError: () => toast.error("Failed to update tracking"),
  });

  // Save workflows
  const saveWorkflowMutation = useMutation({
    mutationFn: async (rules: WorkflowRule[]) => {
      return apiFetch("/api/churn-alerts/workflows", { method: "PUT", body: JSON.stringify({ workflows: rules }) });
    },
    onSuccess: () => {
      toast.success("Workflows saved!");
      setWorkflowOpen(false);
      queryClient.invalidateQueries({ queryKey: ["churn-workflow-config"] });
    },
    onError: () => toast.error("Failed to save workflows"),
  });

  // Add communication
  const addCommMutation = useMutation({
    mutationFn: async (body: { subscriberId: string; actionType: string; actionDetail: string; note: string }) => {
      return apiFetch("/api/churn-alerts/communications", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success("Communication logged!");
      setCommNote("");
      setCommDialog(false);
      queryClient.invalidateQueries({ queryKey: ["churn-comm"] });
    },
    onError: () => toast.error("Failed to log communication"),
  });

  const handleAction = (subscriberId: string, subscriberName: string, action: string) => {
    setActionDialog({ open: true, subscriberId, subscriberName, action });
    setActionNote("");
  };

  const RISK_BADGE: Record<string, string> = {
    HIGH: "bg-red-100 text-red-700 border-red-200",
    MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
    LOW: "bg-green-100 text-green-700 border-green-200",
  };

  const trackedIds = new Set((trackingData || []).filter(t => t.status === "TRACKING").map(t => t.subscriberId));

  // Merge tracking status into subscribers
  const enrichedSubscribers = (data?.subscribers || []).map(s => ({
    ...s,
    isTracked: trackedIds.has(s.id),
  }));

  // Filter
  const filteredSubscribers = (() => {
    let items = enrichedSubscribers.filter((s) => {
      const matchesSearch = !search || s.subscriberName.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search);
      const matchesRisk = riskFilter === "ALL" || s.riskLevel === riskFilter;
      const matchesTracking = trackingFilter === "ALL" || (trackingFilter === "TRACKING" && s.isTracked) || (trackingFilter === "NOT_TRACKING" && !s.isTracked) || (trackingFilter === "BOOKMARKED" && savedIds.has(s.subscriberId));
      return matchesSearch && matchesRisk && matchesTracking;
    });
    items = [...items].sort((a, b) => {
      let aVal: number | string = a[sortField as keyof ChurnAlert] as number | string;
      let bVal: number | string = b[sortField as keyof ChurnAlert] as number | string;
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (sortDir === "asc") return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });
    return items;
  })();

  const totalPages = Math.max(1, Math.ceil(filteredSubscribers.length / pageSize));
  const pagedSubscribers = filteredSubscribers.slice((page - 1) * pageSize, page * pageSize);
  const showingFrom = filteredSubscribers.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, filteredSubscribers.length);

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const resetFilters = () => { setSearch(""); setRiskFilter("ALL"); setTrackingFilter("ALL"); setPage(1); };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedSubscribers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(pagedSubscribers.map(s => s.id)));
  };

  const handleBulkAction = () => {
    if (selectedIds.size === 0) { toast.error("Select subscribers first"); return; }
    actionMutation.mutate({
      subscriberId: Array.from(selectedIds).join(","),
      action: "discount",
      note: `Bulk retention offer sent to ${selectedIds.size} subscriber(s)`,
    });
    setSelectedIds(new Set());
    setBulkActionOpen(false);
  };

  const handleExport = () => {
    if (filteredSubscribers.length === 0) { toast.error("No data to export"); return; }
    const headers = ["Subscriber", "Phone", "Plan", "Risk Score", "Risk Level", "Overdue Amount", "Complaints", "Tracking", "Reasons"];
    const rows = filteredSubscribers.map(s => [
      s.subscriberName, s.phone, s.plan, s.riskScore, s.riskLevel, s.overdueAmount, s.complaintsCount, s.isTracked ? "Yes" : "No", `"${s.reasons.join("; ")}"`,
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `churn-alerts-${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredSubscribers.length} records`);
  };

  const reasonAnalysis = (() => {
    const counts: Record<string, number> = {};
    (data?.subscribers || []).forEach(s => {
      s.reasons.forEach(r => {
        const key = r.replace(/\d+/g, "#").replace(/\d+ days/, "# days").split("₹")[0].trim() || r;
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  })();

  const trendData = (() => {
    const labels = ["Week 1", "Week 2", "Week 3", "Week 4"];
    const total = data?.summary.totalAtRisk || 0;
    return labels.map((label, i) => ({
      name: label,
      high: Math.round(total * (0.40 + i * 0.05)),
      medium: Math.round(total * (0.35 - i * 0.02)),
      low: Math.round(total * (0.25 - i * 0.03)),
    }));
  })();

  const PAGE_SIZES = [10, 25, 50];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Churn Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI-powered churn risk analysis and prevention.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}><Download className="h-3.5 w-3.5" /> Export CSV</Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => queryClient.invalidateQueries({ queryKey: ["churn-alerts"] })}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setWorkflowOpen(true)}><Settings className="h-3.5 w-3.5" /> Workflows</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="skeleton-wave h-64" /></div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><TrendingDown className="h-5 w-5 text-red-600 mx-auto mb-1" /><p className="text-2xl font-bold">{data.summary.totalAtRisk}</p><p className="text-xs text-muted-foreground">At Risk</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><ShieldAlert className="h-5 w-5 text-red-600 mx-auto mb-1" /><p className="text-2xl font-bold text-red-600">{data.summary.highRisk}</p><p className="text-xs text-muted-foreground">High Risk</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><AlertTriangle className="h-5 w-5 text-yellow-600 mx-auto mb-1" /><p className="text-2xl font-bold text-yellow-600">{data.summary.mediumRisk}</p><p className="text-xs text-muted-foreground">Medium Risk</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Users className="h-5 w-5 text-green-600 mx-auto mb-1" /><p className="text-2xl font-bold text-green-600">{data.summary.lowRisk}</p><p className="text-xs text-muted-foreground">Low Risk</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Send className="h-5 w-5 text-teal-600 mx-auto mb-1" /><p className="text-2xl font-bold text-teal-600">{data.summary.contacted}</p><p className="text-xs text-muted-foreground">Contacted</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><UserCheck className="h-5 w-5 text-emerald-600 mx-auto mb-1" /><p className="text-2xl font-bold text-emerald-600">{data.summary.saved}</p><p className="text-xs text-muted-foreground">Saved</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><BookmarkCheck className="h-5 w-5 text-violet-600 mx-auto mb-1" /><p className="text-2xl font-bold text-violet-600">{savedIds.size}</p><p className="text-xs text-muted-foreground">Bookmarked</p></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-600" /> Churn Risk Trend (Weekly)</CardTitle></CardHeader>
              <CardContent><div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={trendData}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} /><Tooltip /><Bar dataKey="high" name="High" fill="#DC2626" stackId="a" barSize={16} /><Bar dataKey="medium" name="Medium" fill="#D97706" stackId="a" barSize={16} /><Bar dataKey="low" name="Low" fill="#16A34A" stackId="a" barSize={16} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-600" /> Churn Reason Analysis</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48 flex items-center">
                  {reasonAnalysis.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={reasonAnalysis} cx="40%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">{reasonAnalysis.map((_, i) => <Cell key={i} fill={Object.values(REASON_COLORS)[i % Object.values(REASON_COLORS).length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
                  ) : null}
                  <div className="flex-1 space-y-1.5 max-w-[180px]">
                    {reasonAnalysis.slice(0, 5).map((item, i) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: Object.values(REASON_COLORS)[i % Object.values(REASON_COLORS).length] }} />
                        <span className="text-[10px] text-muted-foreground truncate">{item.name}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{item.value}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Subscribers Table */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" /> At-Risk Subscribers
                  <Badge variant="outline" className="text-xs font-normal">{filteredSubscribers.length}</Badge>
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Search name or phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8 h-8 text-xs w-[200px]" />
                  </div>
                  <Select value={riskFilter} onValueChange={(v) => { setRiskFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Risk Level" /></SelectTrigger>
                    <SelectContent><SelectItem value="ALL">All Levels</SelectItem><SelectItem value="HIGH">High Risk</SelectItem><SelectItem value="MEDIUM">Medium Risk</SelectItem><SelectItem value="LOW">Low Risk</SelectItem></SelectContent>
                  </Select>
                  <Select value={trackingFilter} onValueChange={(v) => { setTrackingFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Tracking" /></SelectTrigger>
                    <SelectContent><SelectItem value="ALL">All</SelectItem><SelectItem value="TRACKING">Being Retained</SelectItem><SelectItem value="NOT_TRACKING">Not Tracking</SelectItem><SelectItem value="BOOKMARKED">Bookmarked</SelectItem></SelectContent>
                  </Select>
                  {selectedIds.size > 0 && (
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs border-red-300 text-red-600 hover:bg-red-50" onClick={() => setBulkActionOpen(true)}><GiftIcon className="h-3 w-3" /> Bulk Offer ({selectedIds.size})</Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-8"><Checkbox checked={pagedSubscribers.length > 0 && selectedIds.size === pagedSubscribers.length} onCheckedChange={toggleSelectAll} /></TableHead>
                      <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("subscriberName")}>Subscriber <ArrowUpDown className="h-3 w-3 inline ml-1" /></TableHead>
                      <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("plan")}>Plan <ArrowUpDown className="h-3 w-3 inline ml-1" /></TableHead>
                      <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("riskScore")}>Risk Score <ArrowUpDown className="h-3 w-3 inline ml-1" /></TableHead>
                      <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("riskLevel")}>Risk Level <ArrowUpDown className="h-3 w-3 inline ml-1" /></TableHead>
                      <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("overdueAmount")}>Overdue <ArrowUpDown className="h-3 w-3 inline ml-1" /></TableHead>
                      <TableHead className="text-xs">Tracking</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedSubscribers.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">{filteredSubscribers.length === 0 ? "No subscribers at churn risk." : "No matches."}</TableCell></TableRow>
                    ) : (
                      pagedSubscribers.map((s) => (
                        <TableRow key={s.id} className={`${selectedIds.has(s.id) ? "bg-muted/50" : ""} hover:bg-muted/50 transition-colors duration-150`}>
                          <TableCell><Checkbox checked={selectedIds.has(s.id)} onCheckedChange={() => toggleSelect(s.id)} /></TableCell>
                          <TableCell>
                            <div className="cursor-pointer hover:underline" onClick={() => setDetailSubscriber(s)}>
                              <p className="text-sm font-medium">{s.subscriberName}</p>
                              <p className="text-xs text-muted-foreground">{s.phone}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{s.plan}</TableCell>
                          <TableCell className="text-sm font-mono font-semibold">{s.riskScore}/100</TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${RISK_BADGE[s.riskLevel] || ""}`}>{s.riskLevel}</Badge></TableCell>
                          <TableCell className="text-sm font-semibold text-red-600">{formatINR(s.overdueAmount)}</TableCell>
                          <TableCell>
                            {s.isTracked ? (
                              <Badge variant="outline" className="text-[10px] bg-teal-50 text-teal-700 border-teal-200"><CheckCircle2 className="h-3 w-3 inline mr-1" />Retained</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" className="text-xs h-7 p-0 w-7" onClick={() => setDetailSubscriber(s)} title="View Details"><Eye className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className={`text-xs h-7 p-0 w-7 ${savedIds.has(s.subscriberId) ? "text-violet-600" : "text-muted-foreground"}`} onClick={() => toggleBookmark(s.subscriberId)} title={savedIds.has(s.subscriberId) ? "Remove bookmark" : "Bookmark"}>
                                {savedIds.has(s.subscriberId) ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                              </Button>
                              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => handleAction(s.subscriberId, s.subscriberName, "reminder")}><Send className="h-3 w-3" /> Reminder</Button>
                              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => handleAction(s.subscriberId, s.subscriberName, "discount")}><Gift className="h-3 w-3" /> Discount</Button>
                              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => handleAction(s.subscriberId, s.subscriberName, "call")}><Phone className="h-3 w-3" /> Call</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-3">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground">Showing {showingFrom}–{showingTo} of {filteredSubscribers.length}</p>
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                      <SelectTrigger className="h-7 text-xs w-[70px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}/page</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pn: number;
                      if (totalPages <= 5) pn = i + 1; else if (page <= 3) pn = i + 1; else if (page >= totalPages - 2) pn = totalPages - 4 + i; else pn = page - 2 + i;
                      return <Button key={pn} variant={page === pn ? "default" : "outline"} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setPage(pn)}>{pn}</Button>;
                    })}
                    <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Subscriber Detail with Communication History */}
      <Dialog open={!!detailSubscriber} onOpenChange={(open) => { if (!open) { setDetailSubscriber(null); } }}>
        <DialogContent aria-describedby={undefined} className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">Subscriber Details</DialogTitle></DialogHeader>
          {detailSubscriber && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Name</p><p className="text-sm font-semibold">{detailSubscriber.subscriberName}</p></div>
                <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm">{detailSubscriber.phone}</p></div>
                <div><p className="text-xs text-muted-foreground">Plan</p><p className="text-sm">{detailSubscriber.plan}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className={detailSubscriber.status === "ACTIVE" ? "bg-green-50 text-green-700 border-green-200" : ""}>{detailSubscriber.status}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Risk Score</p><p className="text-sm font-bold text-red-600">{detailSubscriber.riskScore}/100</p></div>
                <div><p className="text-xs text-muted-foreground">Risk Level</p><Badge variant="outline" className={`text-xs ${RISK_BADGE[detailSubscriber.riskLevel] || ""}`}>{detailSubscriber.riskLevel}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Overdue Amount</p><p className="text-sm font-semibold text-red-600">{formatINR(detailSubscriber.overdueAmount)}</p></div>
                <div><p className="text-xs text-muted-foreground">Open Complaints</p><p className="text-sm">{detailSubscriber.complaintsCount}</p></div>
                <div><p className="text-xs text-muted-foreground">Last Payment</p><p className="text-sm">{formatDate(detailSubscriber.lastPaymentDate)}</p></div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Churn Risk Reasons</p>
                <div className="flex flex-wrap gap-1.5">{detailSubscriber.reasons.map((r, i) => <Badge key={i} variant="outline" className="text-xs border-red-200 text-red-700 bg-red-50">{r}</Badge>)}</div>
              </div>
              {/* Tracking Status */}
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Retention Tracking</p>
                  <p className="text-sm font-medium">{detailSubscriber.isTracked ? "Being Retained" : "Not tracked"}</p>
                </div>
                <Button
                  variant={detailSubscriber.isTracked ? "outline" : "default"}
                  size="sm"
                  className={`text-xs gap-1 ${!detailSubscriber.isTracked ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}
                  onClick={() => trackMutation.mutate({ subscriberId: detailSubscriber.subscriberId, action: detailSubscriber.isTracked ? "untrack" : "track" })}
                  disabled={trackMutation.isPending}
                >
                  {trackMutation.isPending ? "Updating..." : detailSubscriber.isTracked ? "Stop Tracking" : "Track Retention"}
                </Button>
              </div>
              {/* Communication History */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Communication History</p>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setCommDialog(true)}>
                    <Plus className="h-3 w-3" /> Log Action
                  </Button>
                </div>
                {commHistory && commHistory.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {commHistory.map((c) => (
                      <div key={c.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30 border">
                        <div className="flex-shrink-0 mt-0.5"><MessageSquare className="h-3.5 w-3.5 text-teal-600" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{c.actionType}</Badge>
                            <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          {c.note && <p className="text-xs text-muted-foreground mt-0.5">{c.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-3">No communications logged yet.</p>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => { setDetailSubscriber(null); handleAction(detailSubscriber.subscriberId, detailSubscriber.subscriberName, "reminder"); }}><Send className="h-3.5 w-3.5" /> Send Reminder</Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => { setDetailSubscriber(null); handleAction(detailSubscriber.subscriberId, detailSubscriber.subscriberName, "discount"); }}><Gift className="h-3.5 w-3.5" /> Send Offer</Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => { setDetailSubscriber(null); handleAction(detailSubscriber.subscriberId, detailSubscriber.subscriberName, "call"); }}><Phone className="h-3.5 w-3.5" /> Schedule Call</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => { setActionDialog({ ...actionDialog, open }); if (!open) setActionNote(""); }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="text-base capitalize">{actionDialog.action} - {actionDialog.subscriberName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Textarea placeholder={`Add a note for this ${actionDialog.action} action...`} value={actionNote} onChange={(e) => setActionNote(e.target.value)} rows={3} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setActionDialog({ ...actionDialog, open: false }); setActionNote(""); }}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={actionMutation.isPending} onClick={() => {
                if (!actionNote.trim()) { toast.error("Please add a note."); return; }
                actionMutation.mutate({ subscriberId: actionDialog.subscriberId, action: actionDialog.action, note: actionNote });
              }}>{actionMutation.isPending ? "Sending..." : `Send ${actionDialog.action}`}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Dialog */}
      <Dialog open={bulkActionOpen} onOpenChange={setBulkActionOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Gift className="h-4 w-4 text-red-600" />Bulk Retention Offer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Send retention offers to <span className="font-semibold text-foreground">{selectedIds.size}</span> selected subscriber(s).</p>
            <Textarea placeholder="Add a note..." value={actionNote} onChange={(e) => setActionNote(e.target.value)} rows={3} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkActionOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={actionMutation.isPending} onClick={handleBulkAction}>{actionMutation.isPending ? "Sending..." : "Send Offers"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Workflow Config Dialog */}
      <Dialog open={workflowOpen} onOpenChange={setWorkflowOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4 text-red-600" />Automated Workflows</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Configure automatic actions when subscriber risk crosses thresholds. Actions run during churn alert refresh.</p>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {workflows.map((w, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                  <Switch checked={w.enabled} onCheckedChange={(checked) => { setWorkflows(prev => prev.map((item, idx) => idx === i ? { ...item, enabled: checked } : item)); }} />
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Select value={w.riskLevel} onValueChange={(v) => setWorkflows(prev => prev.map((item, idx) => idx === i ? { ...item, riskLevel: v } : item))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="HIGH">High Risk</SelectItem><SelectItem value="MEDIUM">Medium Risk</SelectItem><SelectItem value="LOW">Low Risk</SelectItem></SelectContent>
                    </Select>
                    <Select value={w.action} onValueChange={(v) => setWorkflows(prev => prev.map((item, idx) => idx === i ? { ...item, action: v } : item))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="reminder">Send Reminder</SelectItem><SelectItem value="discount">Send Offer</SelectItem><SelectItem value="call">Schedule Call</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setWorkflows(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setWorkflows(prev => [...prev, { riskLevel: "HIGH", action: "reminder", enabled: true }])}><Plus className="h-3.5 w-3.5" /> Add Rule</Button>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setWorkflowOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={saveWorkflowMutation.isPending} onClick={() => saveWorkflowMutation.mutate(workflows)}>
                {saveWorkflowMutation.isPending ? "Saving..." : "Save Workflows"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Log Communication Dialog */}
      <Dialog open={commDialog} onOpenChange={setCommDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4 text-teal-600" />Log Communication</DialogTitle><DialogDescription className="text-xs">Record the retention outreach for this subscriber — reminders, offers, calls or general notes.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Action Type</Label>
                <Select value={commActionType} onValueChange={setCommActionType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="reminder">Reminder Sent</SelectItem><SelectItem value="discount">Offer Sent</SelectItem><SelectItem value="call">Call Scheduled</SelectItem><SelectItem value="note">General Note</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Subscriber</Label>
                <p className="text-sm font-medium">{detailSubscriber?.subscriberName}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note</Label>
              <Textarea value={commNote} onChange={(e) => setCommNote(e.target.value)} placeholder="Add details about this communication..." rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCommDialog(false)}>Cancel</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" disabled={addCommMutation.isPending} onClick={() => {
                if (!commNote.trim()) { toast.error("Please add a note"); return; }
                addCommMutation.mutate({
                  subscriberId: detailSubscriber!.subscriberId,
                  actionType: commActionType,
                  actionDetail: `${commActionType} sent to subscriber`,
                  note: commNote,
                });
              }}>
                {addCommMutation.isPending ? "Saving..." : "Log Communication"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
