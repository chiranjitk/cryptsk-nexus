"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Send, Loader2, RefreshCw, Filter, Trash2, RotateCw, X,
  ChevronLeft, ChevronRight, Download, Clock, FileText, Plus, Edit, ToggleLeft, Zap,
  BarChart3, PieChart, Image as ImageIcon, MousePointerClick, Repeat, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { PieChart as RPieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface NotificationItem {
  id: string;
  subscriberId: string | null;
  subscriberName: string | null;
  subscriberCode: string | null;
  type: string;
  category: string;
  title: string;
  message: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  contentType: string;
  imageUrl: string;
  buttonText: string;
  buttonUrl: string;
  recurringEnabled: boolean;
  recurringFrequency: string;
  recurrencePattern: string;
  nextFireAt: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
}

interface SubscriberOption {
  id: string;
  name: string;
  code: string;
  phone: string;
  status: string;
}

interface NotificationRuleItem {
  id: string;
  name: string;
  triggerEvent: string;
  channel: string;
  templateId: string;
  message: string;
  isActive: boolean;
  createdAt: string;
}

interface AnalyticsData {
  period: string;
  summary: { total: number; sent: number; delivered: number; failed: number; pending: number; deliveryRate: number; failureRate: number };
  channelBreakdown: { name: string; value: number }[];
  dailyTrend: { date: string; label: string; total: number; delivered: number; failed: number }[];
}

const NOTIF_TYPES = ["SMS", "WHATSAPP", "EMAIL", "PUSH", "IN_APP"];
const NOTIF_CATEGORIES = ["BILL_DUE", "PAYMENT_CONFIRM", "DATA_USAGE", "PLAN_CHANGE", "OUTAGE", "MAINTENANCE", "WELCOME", "OTHER"];
const TRIGGER_EVENTS = ["subscriber_activated", "payment_overdue", "complaint_created", "plan_expired", "invoice_generated", "other"];
const RULE_CHANNELS = ["email", "sms", "whatsapp", "push", "in_app"];
const CONTENT_TYPES = ["plain", "with_button", "with_image"];
const RECURRENCE_OPTIONS = [
  { value: "one-time", label: "One-time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

interface NotifTemplate {
  id: string;
  name: string;
  type: string;
  category: string;
  title: string;
  message: string;
}

const TEMPLATE_STORAGE_KEY = "notification-templates";

function loadTemplates(): NotifTemplate[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || "[]"); } catch { return []; }
}

function saveTemplates(templates: NotifTemplate[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}

const DEFAULT_TEMPLATES: NotifTemplate[] = [
  { id: "t1", name: "Payment Reminder", type: "IN_APP", category: "BILL_DUE", title: "Payment Due", message: "Dear {{subscriber_name}}, your bill of {{amount}} for {{plan}} is due on {{due_date}}. Please pay on time to avoid late fees." },
  { id: "t2", name: "Welcome Message", type: "IN_APP", category: "WELCOME", title: "Welcome to Cryptsk", message: "Hi {{subscriber_name}}, welcome to Cryptsk Internet! Your {{plan}} plan is now active. Enjoy high-speed internet!" },
  { id: "t3", name: "Outage Alert", type: "IN_APP", category: "OUTAGE", title: "Service Outage", message: "Dear {{subscriber_name}}, we are experiencing an outage in your area. Our team is working on it. Estimated resolution: {{eta}}." },
];

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 border-yellow-200",
  SENT: "bg-teal-100 text-teal-700 border-teal-200",
  DELIVERED: "bg-green-100 text-green-700 border-green-200",
  FAILED: "bg-red-100 text-red-700 border-red-200",
  READ: "bg-purple-100 text-purple-700 border-purple-200",
};

const CHANNEL_COLORS: Record<string, string> = {
  IN_APP: "#8B5CF6",
  SMS: "#F59E0B",
  EMAIL: "#3B82F6",
  WHATSAPP: "#22C55E",
  PUSH: "#EF4444",
};

const PIE_COLORS = ["#8B5CF6", "#F59E0B", "#3B82F6", "#22C55E", "#EF4444"];

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sendForm, setSendForm] = useState({
    type: "IN_APP", category: "OTHER", title: "", message: "", subscriberId: "",
    recurringEnabled: false, recurrencePattern: "one-time",
    contentType: "plain", imageUrl: "", buttonText: "", buttonUrl: "",
  });
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [selectedSubscriberName, setSelectedSubscriberName] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<NotifTemplate[]>(DEFAULT_TEMPLATES);
  const [templateForm, setTemplateForm] = useState({ name: "", type: "IN_APP", category: "OTHER", title: "", message: "" });
  const [scheduledAt, setScheduledAt] = useState("");
  const [groupTarget, setGroupTarget] = useState<string>("all");
  const [groupArea, setGroupArea] = useState("");
  const [groupPlan, setGroupPlan] = useState("");
  const [groupStatus, setGroupStatus] = useState<string>("ACTIVE");
  const [analyticsPeriod, setAnalyticsPeriod] = useState("30d");

  // Rules state
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRuleItem | null>(null);
  const [ruleForm, setRuleForm] = useState({ name: "", triggerEvent: "", channel: "email", templateId: "", message: "", isActive: true });
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

  React.useEffect(() => { setTemplates(loadTemplates()); }, []);
  React.useEffect(() => { saveTemplates(templates); }, [templates]);

  const { data: subscriberResults } = useQuery<SubscriberOption[]>({
    queryKey: ["subscriber-search-notif", subscriberSearch],
    queryFn: async () => {
      if (!subscriberSearch || subscriberSearch.length < 2) return [];
      const data = await apiFetch<{ subscribers?: SubscriberOption[]; items?: SubscriberOption[] }>(`/api/subscribers?search=${encodeURIComponent(subscriberSearch)}&limit=10`);
      return data.subscribers || data.items || [];
    },
    enabled: subscriberSearch.length >= 2,
  });

  const { data, isLoading } = useQuery<{ items: NotificationItem[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>({
    queryKey: ["notifications", filterType, filterCategory, filterStatus, page],
    queryFn: async () => {
      return apiFetch(`/api/notifications?type=${filterType}&category=${filterCategory}&status=${filterStatus}&page=${page}&limit=20`);
    },
  });

  const { data: rulesData, isLoading: rulesLoading } = useQuery<{ rules: NotificationRuleItem[] }>({
    queryKey: ["notification-rules"],
    queryFn: () => apiFetch("/api/notification-rules"),
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["notification-analytics", analyticsPeriod],
    queryFn: () => apiFetch(`/api/notifications/analytics?period=${analyticsPeriod}`),
  });

  const notifications = data?.items || [];
  const pagination = data?.pagination;
  const rules = rulesData?.rules || [];

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
    setSelectedIds(new Set());
  };

  const sendMutation = useMutation({
    mutationFn: async (body: typeof sendForm) => {
      return apiFetch("/api/notifications/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, recurringFrequency: body.recurrencePattern === "one-time" ? "ONCE" : body.recurrencePattern.toUpperCase() }) });
    },
    onSuccess: (result) => {
      const detail = result.isBroadcast ? `Broadcast to ${result.sentCount} subscriber(s)` : "Notification sent successfully";
      toast.success(detail);
      setSendDialogOpen(false);
      setSendForm({ type: "IN_APP", category: "OTHER", title: "", message: "", subscriberId: "", recurringEnabled: false, recurrencePattern: "one-time", contentType: "plain", imageUrl: "", buttonText: "", buttonUrl: "" });
      setSubscriberSearch("");
      setSelectedSubscriberName("");
      setScheduledAt("");
      setGroupTarget("all");
      setGroupArea("");
      setGroupPlan("");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to send notification"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { return apiFetch(`/api/notifications/${id}`, { method: "DELETE" }); },
    onSuccess: () => { toast.success("Notification deleted"); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["notifications"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to delete notification"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => { return Promise.all(ids.map((id) => apiFetch(`/api/notifications/${id}`, { method: "DELETE" }))); },
    onSuccess: (_, ids) => { toast.success(`${ids.length} notification(s) deleted`); setBulkDeleteOpen(false); setSelectedIds(new Set()); queryClient.invalidateQueries({ queryKey: ["notifications"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to delete notifications"),
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => { return apiFetch(`/api/notifications/${id}/retry`, { method: "POST" }); },
    onSuccess: (result) => { toast.success(result.message || "Notification queued for retry"); queryClient.invalidateQueries({ queryKey: ["notifications"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to retry notification"),
  });

  const bulkRetryMutation = useMutation({
    mutationFn: async () => { return apiFetch("/api/notifications/retry-failed", { method: "POST" }); },
    onSuccess: (result) => { toast.success(result.message || "Bulk retry initiated"); queryClient.invalidateQueries({ queryKey: ["notifications"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to retry notifications"),
  });

  // Rule mutations
  const createRuleMutation = useMutation({
    mutationFn: (body: typeof ruleForm) => apiFetch("/api/notification-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Rule created"); setRuleDialogOpen(false); setRuleForm({ name: "", triggerEvent: "", channel: "email", templateId: "", message: "", isActive: true }); setEditingRule(null); queryClient.invalidateQueries({ queryKey: ["notification-rules"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to create rule"),
  });

  const updateRuleMutation = useMutation({
    mutationFn: (body: typeof ruleForm & { id: string }) => apiFetch(`/api/notification-rules/${body.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Rule updated"); setRuleDialogOpen(false); setRuleForm({ name: "", triggerEvent: "", channel: "email", templateId: "", message: "", isActive: true }); setEditingRule(null); queryClient.invalidateQueries({ queryKey: ["notification-rules"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to update rule"),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notification-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Rule deleted"); setDeleteRuleId(null); queryClient.invalidateQueries({ queryKey: ["notification-rules"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to delete rule"),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (rule: NotificationRuleItem) => apiFetch(`/api/notification-rules/${rule.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !rule.isActive }) }),
    onSuccess: () => { toast.success("Rule toggled"); queryClient.invalidateQueries({ queryKey: ["notification-rules"] }); },
    onError: () => toast.error("Failed to toggle rule"),
  });

  const handleSend = () => {
    if (!sendForm.title || !sendForm.message) { toast.error("Title and message are required."); return; }
    if (sendForm.contentType === "with_button" && !sendForm.buttonText) { toast.error("Button text is required for button notifications."); return; }
    if (sendForm.contentType === "with_button" && !sendForm.buttonUrl) { toast.error("Button URL is required for button notifications."); return; }
    sendMutation.mutate(sendForm);
  };

  const handleExport = () => {
    if (notifications.length === 0) { toast.error("No notifications to export"); return; }
    const headers = ["Type", "Category", "Title", "Recipient", "Status", "Retries", "Created"];
    const rows = notifications.map(n => [n.type, n.category, `"${n.title.replace(/"/g, '""')}"`, n.subscriberName || "System", n.status, n.retryCount, n.createdAt].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `notifications-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${notifications.length} notifications`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === notifications.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(notifications.map((n) => n.id)));
  };

  function openAddRule() {
    setEditingRule(null);
    setRuleForm({ name: "", triggerEvent: "", channel: "email", templateId: "", message: "", isActive: true });
    setRuleDialogOpen(true);
  }

  function openEditRule(rule: NotificationRuleItem) {
    setEditingRule(rule);
    setRuleForm({ name: rule.name, triggerEvent: rule.triggerEvent, channel: rule.channel, templateId: rule.templateId || "", message: rule.message, isActive: rule.isActive });
    setRuleDialogOpen(true);
  }

  const failedCount = notifications.filter((n) => n.status === "FAILED" && n.retryCount < (n.maxRetries || 3)).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Send and track notifications across SMS, WhatsApp, email, and push.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTemplateDialogOpen(true)}>
            <FileText className="h-3.5 w-3.5" /> Templates
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setSendDialogOpen(true)}>
            <Send className="h-4 w-4 mr-1.5" /> Send
          </Button>
        </div>
      </div>

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList className="bg-muted p-1 h-auto flex">
          <TabsTrigger value="history" className="text-xs sm:text-sm gap-1.5"><Bell className="h-3.5 w-3.5" />History</TabsTrigger>
          <TabsTrigger value="rules" className="text-xs sm:text-sm gap-1.5"><Zap className="h-3.5 w-3.5" />Rules</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs sm:text-sm gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Analytics</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Notification History ── */}
        <TabsContent value="history">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Bell className="h-5 w-5 text-yellow-600 mx-auto mb-1" /><p className="text-2xl font-bold text-yellow-600">{notifications.filter((n) => n.status === "PENDING").length}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Send className="h-5 w-5 text-green-600 mx-auto mb-1" /><p className="text-2xl font-bold text-green-600">{notifications.filter((n) => n.status === "SENT" || n.status === "DELIVERED").length}</p><p className="text-xs text-muted-foreground">Sent/Delivered</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><AlertTriangle className="h-5 w-5 text-red-600 mx-auto mb-1" /><p className="text-2xl font-bold text-red-600">{notifications.filter((n) => n.status === "FAILED").length}</p><p className="text-xs text-muted-foreground">Failed</p></CardContent></Card>
            <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Repeat className="h-5 w-5 text-purple-600 mx-auto mb-1" /><p className="text-2xl font-bold text-purple-600">{notifications.filter((n) => n.recurringEnabled && n.recurrencePattern !== "one-time").length}</p><p className="text-xs text-muted-foreground">Recurring</p></CardContent></Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Bell className="h-4 w-4 text-red-600" />Notification History
                  {pagination && <span className="text-xs font-normal text-muted-foreground">({pagination.total} total)</span>}
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Select value={filterType} onValueChange={(v) => handleFilterChange(setFilterType, v)}>
                    <SelectTrigger className="w-[120px] h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Types</SelectItem>{NOTIF_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={filterCategory} onValueChange={(v) => handleFilterChange(setFilterCategory, v)}>
                    <SelectTrigger className="w-[140px] h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Categories</SelectItem>{NOTIF_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={(v) => handleFilterChange(setFilterStatus, v)}>
                    <SelectTrigger className="w-[120px] h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Status</SelectItem>{Object.keys(STATUS_STYLES).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => queryClient.invalidateQueries({ queryKey: ["notifications"] })}><RefreshCw className="h-3 w-3" /></Button>
                  {failedCount > 0 && (
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => bulkRetryMutation.mutate()} disabled={bulkRetryMutation.isPending}>
                      {bulkRetryMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                      Retry Failed ({failedCount})
                    </Button>
                  )}
                  {selectedIds.size > 0 && (
                    <Button variant="destructive" size="sm" className="h-8 gap-1" onClick={() => setBulkDeleteOpen(true)}><Trash2 className="h-3 w-3" /> Delete ({selectedIds.size})</Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2"><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /></div>
              ) : (
                <>
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-10"><Checkbox checked={notifications.length > 0 && selectedIds.size === notifications.length} onCheckedChange={toggleSelectAll} /></TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Title</TableHead>
                          <TableHead className="text-xs">Recipient</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Content</TableHead>
                          <TableHead className="text-xs">Retries</TableHead>
                          <TableHead className="text-xs">Time</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {notifications.length === 0 ? (
                          <TableRow><TableCell colSpan={9} className="text-center py-8"><div className="flex flex-col items-center justify-center gap-2"><div className="empty-state-illustration p-4"><Bell className="h-8 w-8 text-muted-foreground/40" /></div><p className="text-muted-foreground text-sm">{search ? "No notifications match your search." : "No notifications found."}</p></div></TableCell></TableRow>
                        ) : (
                          notifications.map((n) => {
                            const notifBorderClass = n.status === "FAILED" ? "notif-border-critical" : n.status === "DELIVERED" ? "notif-border-success" : n.status === "PENDING" ? "notif-border-warning" : "notif-border-system";
                            const isUnread = n.status === "PENDING" || n.status === "SENT";
                            return (
                            <TableRow key={n.id} className={`${selectedIds.has(n.id) ? "bg-muted/50" : ""} ${isUnread ? "notif-unread" : ""} ${notifBorderClass} hover:bg-muted/50 transition-colors duration-150`}>
                              <TableCell><Checkbox checked={selectedIds.has(n.id)} onCheckedChange={() => toggleSelect(n.id)} /></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-[10px]">{n.type}</Badge>
                                  {n.recurringEnabled && n.recurrencePattern !== "one-time" && (
                                    <Badge className="text-[9px] bg-purple-100 text-purple-700 border-purple-200 gap-0.5">
                                      <Repeat className="h-2 w-2" />{n.recurrencePattern}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm font-medium max-w-[160px] truncate">{n.title}</TableCell>
                              <TableCell className="text-sm">{n.subscriberName ? <span>{n.subscriberName} <span className="text-muted-foreground">({n.subscriberCode})</span></span> : <span className="text-muted-foreground">System</span>}</TableCell>
                              <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[n.status] || ""}`}>{n.status}</Badge></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {n.contentType === "with_button" ? <Badge variant="outline" className="text-[9px] gap-0.5"><MousePointerClick className="h-2 w-2" />Btn</Badge> : null}
                                  {n.contentType === "with_image" ? <Badge variant="outline" className="text-[9px] gap-0.5"><ImageIcon className="h-2 w-2" />Img</Badge> : null}
                                  {n.contentType === "plain" ? <span className="text-[10px] text-muted-foreground">Plain</span> : null}
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className={`text-xs ${n.retryCount > 0 ? "text-orange-600 font-medium" : "text-muted-foreground"}`}>
                                  {n.retryCount}/{n.maxRetries}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap"><span className={n.status === "FAILED" || n.status === "PENDING" ? "time-ago-recent" : "time-ago"}>{new Date(n.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-1">
                                  {n.status === "FAILED" && n.retryCount < (n.maxRetries || 3) && (
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={() => retryMutation.mutate(n.id)} disabled={retryMutation.isPending} title="Retry">
                                      {retryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteId(n.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t mt-2">
                      <p className="text-xs text-muted-foreground">Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</p>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-7 px-2 pagination-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                        {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (pagination.totalPages <= 5) pageNum = i + 1;
                          else if (page <= 3) pageNum = i + 1;
                          else if (page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                          else pageNum = page - 2 + i;
                          return (<Button key={pageNum} variant={page === pageNum ? "default" : "outline"} size="sm" className={`h-7 w-7 p-0 text-xs ${page === pageNum ? "pagination-active" : "pagination-btn"}`} onClick={() => setPage(pageNum)}>{pageNum}</Button>);
                        })}
                        <Button variant="outline" size="sm" className="h-7 px-2 pagination-btn" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Notification Rules ── */}
        <TabsContent value="rules">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">Automated notification rules triggered by system events.</p>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={openAddRule}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Rule</Button>
          </div>
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Trigger Event</TableHead>
                      <TableHead className="text-xs">Channel</TableHead>
                      <TableHead className="text-xs">Template</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Created</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rulesLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : rules.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="flex flex-col items-center justify-center gap-2"><div className="empty-state-illustration p-4"><Zap className="h-8 w-8 text-muted-foreground/40" /></div><p className="text-muted-foreground text-sm">No notification rules configured</p><p className="text-muted-foreground/60 text-xs">Click Add Rule to create one</p></div></TableCell></TableRow>
                    ) : (
                      rules.map((rule) => (
                        <TableRow key={rule.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell className="text-sm font-medium">{rule.name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{rule.triggerEvent.replace(/_/g, " ") || "—"}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{rule.channel}</Badge></TableCell>
                          <TableCell>
                            {rule.templateId ? (
                              (() => { const tpl = templates.find(t => t.id === rule.templateId); return tpl ? <span className="text-xs">{tpl.name}</span> : <span className="text-xs text-muted-foreground">Custom</span>; })()
                            ) : (
                              <span className="text-xs text-muted-foreground max-w-[150px] truncate block">{rule.message || "—"}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch checked={rule.isActive} onCheckedChange={() => toggleRuleMutation.mutate(rule)} disabled={toggleRuleMutation.isPending} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(rule.createdAt).toLocaleDateString("en-IN")}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditRule(rule)}><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => setDeleteRuleId(rule.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Analytics ── */}
        <TabsContent value="analytics">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">Notification delivery analytics and channel breakdown.</p>
            <Select value={analyticsPeriod} onValueChange={setAnalyticsPeriod}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {analyticsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4"><Skeleton className="skeleton-wave h-24" /><Skeleton className="skeleton-wave h-24" /><Skeleton className="skeleton-wave h-24" /><Skeleton className="skeleton-wave h-24" /></div>
          ) : analyticsData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Send className="h-5 w-5 text-teal-600 mx-auto mb-1" /><p className="text-2xl font-bold">{analyticsData.summary.total}</p><p className="text-xs text-muted-foreground">Total Sent</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Bell className="h-5 w-5 text-green-600 mx-auto mb-1" /><p className="text-2xl font-bold text-green-600">{analyticsData.summary.deliveryRate}%</p><p className="text-xs text-muted-foreground">Delivery Rate</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center"><AlertTriangle className="h-5 w-5 text-red-600 mx-auto mb-1" /><p className="text-2xl font-bold text-red-600">{analyticsData.summary.failed}</p><p className="text-xs text-muted-foreground">Failed</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Clock className="h-5 w-5 text-yellow-600 mx-auto mb-1" /><p className="text-2xl font-bold text-yellow-600">{analyticsData.summary.pending}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Channel Breakdown Pie */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><PieChart className="h-4 w-4" />Channel Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    {analyticsData.channelBreakdown.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="w-48 h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <RPieChart>
                              <Pie data={analyticsData.channelBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" strokeWidth={2}>
                                {analyticsData.channelBreakdown.map((_entry, index) => (
                                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <RTooltip />
                            </RPieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex flex-col gap-2">
                          {analyticsData.channelBreakdown.map((ch, i) => (
                            <div key={ch.name} className="flex items-center gap-2 text-xs">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                              <span className="font-medium w-16">{ch.name}</span>
                              <span className="text-muted-foreground">{ch.value} ({analyticsData.summary.total > 0 ? Math.round((ch.value / analyticsData.summary.total) * 100) : 0}%)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Daily Trend */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" />Daily Trend</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analyticsData.dailyTrend.slice(-14)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RTooltip />
                          <Bar dataKey="delivered" fill="#22C55E" name="Delivered" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="failed" fill="#EF4444" name="Failed" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* Send Notification Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4 text-red-600" />Send Notification</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Template Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs">Use Template</Label>
              <Select value="__none__" onValueChange={(v) => {
                if (v === "__none__") return;
                const t = templates.find(tpl => tpl.id === v);
                if (t) setSendForm({ ...sendForm, title: t.title, message: t.message, category: t.category, type: t.type });
              }}>
                <SelectTrigger><SelectValue placeholder="Select a template..." /></SelectTrigger>
                <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Channel</Label>
                <Select value={sendForm.type} onValueChange={(v) => setSendForm({ ...sendForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{NOTIF_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Category</Label>
                <Select value={sendForm.category} onValueChange={(v) => setSendForm({ ...sendForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{NOTIF_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Content Type */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5"><FileText className="h-3 w-3" /> Content Type</Label>
              <div className="flex gap-2">
                {CONTENT_TYPES.map((ct) => (
                  <Badge key={ct} variant={sendForm.contentType === ct ? "default" : "outline"} className="cursor-pointer text-xs capitalize" onClick={() => setSendForm({ ...sendForm, contentType: ct })}>
                    {ct.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Rich Content: Button Fields */}
            {sendForm.contentType === "with_button" && (
              <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
                <Label className="text-xs flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> Button Settings</Label>
                <Input value={sendForm.buttonText} onChange={(e) => setSendForm({ ...sendForm, buttonText: e.target.value })} placeholder="Button text (e.g. Pay Now)" className="h-8 text-xs" />
                <Input value={sendForm.buttonUrl} onChange={(e) => setSendForm({ ...sendForm, buttonUrl: e.target.value })} placeholder="Button URL (e.g. https://...)" className="h-8 text-xs" />
              </div>
            )}

            {/* Rich Content: Image Field */}
            {sendForm.contentType === "with_image" && (
              <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
                <Label className="text-xs flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Image</Label>
                <Input value={sendForm.imageUrl} onChange={(e) => setSendForm({ ...sendForm, imageUrl: e.target.value })} placeholder="Image URL (e.g. https://...)" className="h-8 text-xs" />
                {sendForm.imageUrl && <img src={sendForm.imageUrl} alt="Preview" className="w-full h-24 object-cover rounded-md border" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
              </div>
            )}

            {/* Group Targeting */}
            <div className="space-y-1.5">
              <Label className="text-xs">Send To</Label>
              <Select value={groupTarget} onValueChange={setGroupTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Active Subscribers</SelectItem>
                  <SelectItem value="group">Filtered Group</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {groupTarget === "group" && (
              <div className="grid grid-cols-3 gap-2 p-3 border rounded-lg bg-muted/30">
                <div className="space-y-1"><Label className="text-[10px]">Area</Label><Input value={groupArea} onChange={(e) => setGroupArea(e.target.value)} placeholder="Zone A" className="h-8 text-xs" /></div>
                <div className="space-y-1"><Label className="text-[10px]">Plan</Label><Input value={groupPlan} onChange={(e) => setGroupPlan(e.target.value)} placeholder="Plan name" className="h-8 text-xs" /></div>
                <div className="space-y-1"><Label className="text-[10px]">Status</Label><Input value={groupStatus} onChange={(e) => setGroupStatus(e.target.value)} placeholder="ACTIVE" className="h-8 text-xs" /></div>
              </div>
            )}
            {/* Schedule */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Schedule (optional)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              {scheduledAt && <p className="text-[10px] text-muted-foreground">Will be sent at {new Date(scheduledAt).toLocaleString("en-IN")}</p>}
            </div>
            {/* Recurrence */}
            <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5 font-medium"><ToggleLeft className="h-3.5 w-3.5" />Recurrence</Label>
                <Switch checked={sendForm.recurringEnabled} onCheckedChange={(checked) => setSendForm({ ...sendForm, recurringEnabled: checked, recurrencePattern: "one-time" })} />
              </div>
              {sendForm.recurringEnabled && (
                <Select value={sendForm.recurrencePattern} onValueChange={(v) => setSendForm({ ...sendForm, recurrencePattern: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {sendForm.recurringEnabled && sendForm.recurrencePattern !== "one-time" && (
                <p className="text-[10px] text-muted-foreground">This notification will repeat {sendForm.recurrencePattern} after the initial send.</p>
              )}
            </div>
            {/* Subscriber */}
            <div className="space-y-1.5 relative">
              <Label className="text-xs">Subscriber (optional — leave empty for {groupTarget === "all" ? "all active" : "filtered group"} broadcast)</Label>
              <div className="relative">
                <Input value={sendForm.subscriberId ? "" : subscriberSearch} onChange={(e) => { setSubscriberSearch(e.target.value); if (sendForm.subscriberId) { setSendForm({ ...sendForm, subscriberId: "" }); setSelectedSubscriberName(""); } }} placeholder={selectedSubscriberName ? `Selected: ${selectedSubscriberName}` : "Search by name, code, or phone..."} className="pr-8" />
                {sendForm.subscriberId && (
                  <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0" onClick={() => { setSendForm({ ...sendForm, subscriberId: "" }); setSelectedSubscriberName(""); }}><X className="h-3 w-3" /></Button>
                )}
              </div>
              {subscriberSearch.length >= 2 && (subscriberResults?.length ?? 0) > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {subscriberResults!.map((s) => (
                    <button key={s.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center justify-between" onClick={() => { setSendForm({ ...sendForm, subscriberId: s.id }); setSelectedSubscriberName(`${s.name} (${s.code})`); setSubscriberSearch(""); }}>
                      <span>{s.name} <span className="text-muted-foreground">({s.code})</span></span>
                      <span className="text-xs text-muted-foreground">{s.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Title *</Label><Input value={sendForm.title} onChange={(e) => setSendForm({ ...sendForm, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Message * <span className="text-muted-foreground font-normal">(Variables: {"{{subscriber_name}}"}, {"{{plan}}"}, {"{{amount}}"}, {"{{due_date}}"}, {"{{eta}}"})</span></Label><Textarea value={sendForm.message} onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })} rows={4} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={sendMutation.isPending} onClick={handleSend}>
                {sendMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Sending...</> : <><Send className="h-4 w-4 mr-1.5" />{scheduledAt ? "Schedule" : "Send"}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rule Create/Edit Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{editingRule ? "Edit" : "Create"} Notification Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">Rule Name *</Label><Input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="e.g. Payment Reminder Rule" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Trigger Event</Label>
                <Select value={ruleForm.triggerEvent} onValueChange={(v) => setRuleForm({ ...ruleForm, triggerEvent: v })}>
                  <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                  <SelectContent>{TRIGGER_EVENTS.map((ev) => <SelectItem key={ev} value={ev}>{ev.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Channel</Label>
                <Select value={ruleForm.channel} onValueChange={(v) => setRuleForm({ ...ruleForm, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RULE_CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Template (optional)</Label>
              <Select value={ruleForm.templateId} onValueChange={(v) => {
                const t = templates.find(tpl => tpl.id === v);
                setRuleForm({ ...ruleForm, templateId: v, message: t ? t.message : ruleForm.message });
              }}>
                <SelectTrigger><SelectValue placeholder="Select a template..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Custom Message</SelectItem>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Message Template <span className="text-muted-foreground font-normal">(supports {"{{variables}}"})</span></Label><Textarea value={ruleForm.message} onChange={(e) => setRuleForm({ ...ruleForm, message: e.target.value })} placeholder="Notification message template..." rows={3} /></div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Active</Label>
              <Switch checked={ruleForm.isActive} onCheckedChange={(checked) => setRuleForm({ ...ruleForm, isActive: checked })} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={!ruleForm.name.trim() || (editingRule ? updateRuleMutation.isPending : createRuleMutation.isPending)} onClick={() => {
                const payload = { ...ruleForm, templateId: ruleForm.templateId === "none" ? "" : ruleForm.templateId };
                if (editingRule) updateRuleMutation.mutate({ id: editingRule.id, ...payload });
                else createRuleMutation.mutate(payload);
              }}>
                {(editingRule ? updateRuleMutation.isPending : createRuleMutation.isPending) ? "Saving..." : editingRule ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Templates Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-red-600" />Notification Templates</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{t.name}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">{t.type}</Badge>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => setTemplates(templates.filter(x => x.id !== t.id))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t.category.replace(/_/g, " ")} — {t.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.message}</p>
              </div>
            ))}
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium">Add Template</p>
              <Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="Template name" className="h-8 text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <Select value={templateForm.type} onValueChange={(v) => setTemplateForm({ ...templateForm, type: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{NOTIF_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={templateForm.category} onValueChange={(v) => setTemplateForm({ ...templateForm, category: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{NOTIF_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input value={templateForm.title} onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })} placeholder="Subject/Title" className="h-8 text-xs" />
              <Textarea value={templateForm.message} onChange={(e) => setTemplateForm({ ...templateForm, message: e.target.value })} placeholder="Message body with {{variables}}" rows={3} className="text-xs" />
              <Button size="sm" className="w-full" disabled={!templateForm.name.trim()} onClick={() => { const newTpl = { ...templateForm, id: `t_${Date.now()}` }; setTemplates([...templates, newTpl]); setTemplateForm({ name: "", type: "IN_APP", category: "OTHER", title: "", message: "" }); toast.success("Template added"); }}>Add Template</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Notification Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Notification</AlertDialogTitle><AlertDialogDescription>Are you sure? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {selectedIds.size} Notification(s)</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete {selectedIds.size} notifications? This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}>Delete All</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Rule Dialog */}
      <AlertDialog open={!!deleteRuleId} onOpenChange={() => setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Rule</AlertDialogTitle><AlertDialogDescription>Are you sure? This rule will be permanently removed.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteRuleId && deleteRuleMutation.mutate(deleteRuleId)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
