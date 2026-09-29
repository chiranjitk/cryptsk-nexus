"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Building2, Users, Shield, Wifi, FileText, Plus, Search, RefreshCw,
  Edit, Trash2, Download, Upload, Clock, Monitor, Activity, Globe,
  ChevronRight, X, CheckCircle, XCircle, AlertTriangle, Eye,
  Server, UserCheck, ArrowUpDown, Zap, HardDrive, Network,
  Settings, Link2, Unlink, Loader2, Ban, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────

interface LdapConfig {
  id: string;
  subscriberId: string;
  serverHost: string;
  serverPort: number;
  useTls: boolean;
  baseDn: string;
  bindDn: string;
  bindPassword?: string;
  userFilter: string;
  groupRestriction: string | null;
  tlsCert: string | null;
  connectionTimeout: number;
  healthStatus: string;
  lastCheckedAt: string | null;
}

interface EnterpriseUser {
  id: string;
  subscriberId: string;
  username: string;
  displayName: string;
  email: string;
  department: string;
  adGroups: string;
  status: string;
  firstSeenAt: string;
  lastLoginAt: string | null;
  totalUpload: number;
  totalDownload: number;
  sessionCount: number;
}

interface EnterpriseSession {
  id: string;
  subscriberId: string;
  enterpriseUserId: string | null;
  username: string;
  ipAddress: string;
  macAddress: string | null;
  sessionId: string;
  authMethod: string;
  uploadBytes: number;
  downloadBytes: number;
  status: string;
  connectedAt: string;
  lastActivityAt: string;
  disconnectedAt: string | null;
  disconnectReason: string | null;
}

interface EnterpriseSubscriber {
  id: string;
  companyName: string;
  subscriberId: string;
  planId: string | null;
  plan: { id: string; name: string } | null;
  location: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  authMethod: string;
  bandwidthMode: string;
  sharedPoolMbps: number;
  perUserDownMbps: number;
  perUserUpMbps: number;
  dataQuotaGB: number | null;
  overageAction: string;
  sessionTimeout: number;
  maxConcurrent: number;
  macBinding: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  ldapConfig: LdapConfig | null;
  _count?: { sessions: number; users: number };
  sessions?: EnterpriseSession[];
  users?: EnterpriseUser[];
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatBytes(n: number | string | undefined | null): string {
  const bytes = typeof n === "string" ? parseInt(n, 10) : n;
  if (bytes == null || bytes === 0) return "0 B";
  const b = Number(bytes);
  if (b >= 1099511627776) return `${(b / 1099511627776).toFixed(1)} TB`;
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function duration(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  suspended: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  terminated: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  disconnected: "bg-slate-100 text-slate-600 border-slate-200",
  idle: "bg-amber-100 text-amber-600 border-amber-200",
};

const HEALTH_STYLES: Record<string, string> = {
  reachable: "bg-emerald-100 text-emerald-700 border-emerald-200",
  unreachable: "bg-red-100 text-red-700 border-red-200",
  unknown: "bg-slate-100 text-slate-500 border-slate-200",
};

const AUTH_METHOD_STYLES: Record<string, string> = {
  ldap: "bg-violet-100 text-violet-700 border-violet-200",
  radius: "bg-cyan-100 text-cyan-700 border-cyan-200",
  local: "bg-slate-100 text-slate-600 border-slate-200",
};

// ─── Main Component ───────────────────────────────────────────────

export default function EnterpriseAuthPage() {
  const queryClient = useQueryClient();
  const [selectedSubscriber, setSelectedSubscriber] = useState<EnterpriseSubscriber | null>(null);
  const [tab, setTab] = useState("subscribers");
  const [searchQuery, setSearchQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EnterpriseSubscriber | null>(null);
  const [ldapTestResult, setLdapTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);

  // Form state for Add/Edit
  const emptyForm = {
    companyName: "", subscriberId: "", planId: "", location: "",
    contactEmail: "", contactPhone: "", status: "active" as string, authMethod: "local" as string,
    bandwidthMode: "shared_pool" as string, sharedPoolMbps: 100,
    perUserDownMbps: 50, perUserUpMbps: 20, dataQuotaGB: "" as string,
    overageAction: "throttle" as string, sessionTimeout: 28800,
    maxConcurrent: 1, macBinding: false, notes: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [ldapForm, setLdapForm] = useState({
    serverHost: "", serverPort: "636", useTls: true, baseDn: "",
    bindDn: "", bindPassword: "", userFilter: "(sAMAccountName=%s)",
    groupRestriction: "", connectionTimeout: "5",
  });

  // LDAP config detail state
  const [ldapDetail, setLdapDetail] = useState({
    serverHost: "", serverPort: "636", useTls: true, baseDn: "",
    bindDn: "", bindPassword: "", userFilter: "(sAMAccountName=%s)",
    groupRestriction: "", connectionTimeout: "5",
  });

  // ─── Queries ────────────────────────────────────────────────
  const { data: subscribersData, isLoading: subscribersLoading } = useQuery<{
    subscribers: EnterpriseSubscriber[];
  }>({
    queryKey: ["enterprise-subscribers"],
    queryFn: () => apiFetch<{ subscribers: EnterpriseSubscriber[] }>("/api/enterprise-auth"),
    refetchInterval: 15000,
  });

  const { data: subscriberDetail, isLoading: detailLoading } = useQuery<{
    subscriber: EnterpriseSubscriber;
    stats: { activeSessions: number; totalSessions: number; totalUsers: number };
  }>({
    queryKey: ["enterprise-detail", selectedSubscriber?.id],
    queryFn: () => apiFetch("/api/enterprise-auth/" + selectedSubscriber!.id),
    enabled: !!selectedSubscriber,
    refetchInterval: 10000,
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{
    sessions: EnterpriseSession[];
    stats: { total: number; active: number; totalDownload: number; totalUpload: number };
  }>({
    queryKey: ["enterprise-sessions", selectedSubscriber?.id],
    queryFn: () => apiFetch("/api/enterprise-auth/" + selectedSubscriber!.id + "/sessions"),
    enabled: !!selectedSubscriber && (tab === "sessions" || tab === "usage"),
    refetchInterval: 10000,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<{
    users: EnterpriseUser[];
  }>({
    queryKey: ["enterprise-users", selectedSubscriber?.id],
    queryFn: () => apiFetch("/api/enterprise-auth/" + selectedSubscriber!.id + "/users"),
    enabled: !!selectedSubscriber && (tab === "users" || tab === "usage"),
    refetchInterval: 30000,
  });

  // ─── Mutations ─────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/enterprise-auth", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d: any) => {
      if (d.subscriber) {
        toast.success("Enterprise subscriber created");
        closeAddDialog();
        queryClient.invalidateQueries({ queryKey: ["enterprise-subscribers"] });
      } else {
        toast.error(d.error || "Failed to create subscriber");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: Record<string, unknown>) =>
      apiFetch("/api/enterprise-auth/" + id, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: (d: any) => {
      if (d.subscriber) {
        toast.success("Subscriber updated");
        closeEditDialog();
        queryClient.invalidateQueries({ queryKey: ["enterprise-subscribers"] });
        queryClient.invalidateQueries({ queryKey: ["enterprise-detail"] });
      } else {
        toast.error(d.error || "Failed to update");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/enterprise-auth/" + id, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Subscriber deleted");
      setDeleteTarget(null);
      setSelectedSubscriber(null);
      setTab("subscribers");
      queryClient.invalidateQueries({ queryKey: ["enterprise-subscribers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testLdapMutation = useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown>) =>
      apiFetch("/api/enterprise-auth/" + id + "/test-ldap", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d: any) => {
      if (d.success) {
        setLdapTestResult({ success: true, message: d.message, latencyMs: d.latencyMs });
        toast.success("LDAP connection successful");
      } else {
        setLdapTestResult({ success: false, message: d.error || d.details || "Connection failed" });
        toast.error(d.error || "LDAP connection failed");
      }
      queryClient.invalidateQueries({ queryKey: ["enterprise-detail"] });
    },
    onError: (e: Error) => {
      setLdapTestResult({ success: false, message: e.message });
      toast.error(e.message);
    },
  });

  const syncUsersMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch("/api/enterprise-auth/" + id + "/users", { method: "POST" }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success(d.message || `Synced ${d.createdCount + d.updatedCount} users`);
        queryClient.invalidateQueries({ queryKey: ["enterprise-users"] });
        queryClient.invalidateQueries({ queryKey: ["enterprise-sessions"] });
        queryClient.invalidateQueries({ queryKey: ["enterprise-detail"] });
      } else {
        toast.error(d.error || "Sync failed");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectSessionMutation = useMutation({
    mutationFn: ({ id, sessionIds }: { id: string; sessionIds: string[] }) =>
      apiFetch("/api/enterprise-auth/" + id + "/sessions", {
        method: "POST", body: JSON.stringify({ sessionIds }),
      }),
    onSuccess: (d: any) => {
      toast.success(`Disconnected ${d.disconnected} session(s)`);
      queryClient.invalidateQueries({ queryKey: ["enterprise-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["enterprise-detail"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectAllMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch("/api/enterprise-auth/" + id + "/sessions", { method: "DELETE" }),
    onSuccess: (d: any) => {
      toast.success(`Disconnected all ${d.disconnected} sessions`);
      queryClient.invalidateQueries({ queryKey: ["enterprise-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["enterprise-detail"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Derived data ──────────────────────────────────────────
  const subscribers = subscribersData?.subscribers || [];
  const sessions = sessionsData?.sessions || [];
  const users = usersData?.users || [];
  const detail = subscriberDetail?.subscriber;
  const stats = subscriberDetail?.stats || { activeSessions: 0, totalSessions: 0, totalUsers: 0 };
  const sessionStats = sessionsData?.stats || { total: 0, active: 0, totalDownload: 0, totalUpload: 0 };

  const filteredSubscribers = useMemo(() => {
    if (!searchQuery) return subscribers;
    const q = searchQuery.toLowerCase();
    return subscribers.filter(
      (s) =>
        s.companyName.toLowerCase().includes(q) ||
        s.subscriberId.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        s.contactEmail.toLowerCase().includes(q)
    );
  }, [subscribers, searchQuery]);

  // Usage report data
  const departmentUsage = useMemo(() => {
    const map: Record<string, { download: number; upload: number; count: number }> = {};
    for (const u of users) {
      const dept = u.department || "Unknown";
      if (!map[dept]) map[dept] = { download: 0, upload: 0, count: 0 };
      map[dept].download += Number(u.totalDownload);
      map[dept].upload += Number(u.totalUpload);
      map[dept].count++;
    }
    return Object.entries(map).sort((a, b) => (b[1].download + b[1].upload) - (a[1].download + a[1].upload));
  }, [users]);

  const topConsumers = useMemo(() => {
    return [...users].sort(
      (a, b) => Number(b.totalDownload) + Number(b.totalUpload) - (Number(a.totalDownload) + Number(a.totalUpload))
    ).slice(0, 10);
  }, [users]);

  // ─── Form handlers ─────────────────────────────────────────
  function openAddDialog() {
    setForm(emptyForm);
    setLdapForm({ serverHost: "", serverPort: "636", useTls: true, baseDn: "", bindDn: "", bindPassword: "", userFilter: "(sAMAccountName=%s)", groupRestriction: "", connectionTimeout: "5" });
    setAddDialogOpen(true);
  }

  function closeAddDialog() {
    setAddDialogOpen(false);
    setForm(emptyForm);
  }

  function openEditDialog(sub: EnterpriseSubscriber) {
    setForm({
      companyName: sub.companyName,
      subscriberId: sub.subscriberId,
      planId: sub.planId || "",
      location: sub.location,
      contactEmail: sub.contactEmail,
      contactPhone: sub.contactPhone,
      status: sub.status,
      authMethod: sub.authMethod,
      bandwidthMode: sub.bandwidthMode,
      sharedPoolMbps: sub.sharedPoolMbps,
      perUserDownMbps: sub.perUserDownMbps,
      perUserUpMbps: sub.perUserUpMbps,
      dataQuotaGB: sub.dataQuotaGB != null ? String(sub.dataQuotaGB) : "",
      overageAction: sub.overageAction,
      sessionTimeout: sub.sessionTimeout,
      maxConcurrent: sub.maxConcurrent,
      macBinding: sub.macBinding,
      notes: sub.notes,
    });
    setEditDialogOpen(true);
  }

  function closeEditDialog() {
    setEditDialogOpen(false);
  }

  function handleSave() {
    if (!form.companyName.trim()) { toast.error("Company name is required"); return; }
    if (!form.subscriberId.trim()) { toast.error("Subscriber ID is required"); return; }

    const payload: Record<string, unknown> = {
      companyName: form.companyName,
      subscriberId: form.subscriberId,
      planId: form.planId || null,
      location: form.location,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      authMethod: form.authMethod,
      bandwidthMode: form.bandwidthMode,
      sharedPoolMbps: form.sharedPoolMbps,
      perUserDownMbps: form.perUserDownMbps,
      perUserUpMbps: form.perUserUpMbps,
      dataQuotaGB: form.dataQuotaGB ? parseInt(form.dataQuotaGB, 10) : null,
      overageAction: form.overageAction,
      sessionTimeout: form.sessionTimeout,
      maxConcurrent: form.maxConcurrent,
      macBinding: form.macBinding,
      notes: form.notes,
    };

    if (form.authMethod === "ldap") {
      payload.ldapConfig = {
        serverHost: ldapForm.serverHost,
        serverPort: parseInt(ldapForm.serverPort, 10) || 636,
        useTls: ldapForm.useTls,
        baseDn: ldapForm.baseDn,
        bindDn: ldapForm.bindDn,
        bindPassword: ldapForm.bindPassword,
        userFilter: ldapForm.userFilter,
        groupRestriction: ldapForm.groupRestriction || null,
        connectionTimeout: parseInt(ldapForm.connectionTimeout, 10) || 5,
      };
    }

    createMutation.mutate(payload);
  }

  function handleUpdate() {
    if (!selectedSubscriber) return;
    const payload: Record<string, unknown> = {
      companyName: form.companyName,
      planId: form.planId || null,
      location: form.location,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      status: form.status || detail?.status,
      authMethod: form.authMethod,
      bandwidthMode: form.bandwidthMode,
      sharedPoolMbps: form.sharedPoolMbps,
      perUserDownMbps: form.perUserDownMbps,
      perUserUpMbps: form.perUserUpMbps,
      dataQuotaGB: form.dataQuotaGB ? parseInt(form.dataQuotaGB, 10) : null,
      overageAction: form.overageAction,
      sessionTimeout: form.sessionTimeout,
      maxConcurrent: form.maxConcurrent,
      macBinding: form.macBinding,
      notes: form.notes,
    };
    updateMutation.mutate({ id: selectedSubscriber.id, ...payload });
  }

  function handleSelectSubscriber(sub: EnterpriseSubscriber) {
    setSelectedSubscriber(sub);
    setTab("overview");
    setLdapTestResult(null);
    if (sub.ldapConfig) {
      setLdapDetail({
        serverHost: sub.ldapConfig.serverHost,
        serverPort: String(sub.ldapConfig.serverPort),
        useTls: sub.ldapConfig.useTls,
        baseDn: sub.ldapConfig.baseDn,
        bindDn: sub.ldapConfig.bindDn,
        bindPassword: "",
        userFilter: sub.ldapConfig.userFilter,
        groupRestriction: sub.ldapConfig.groupRestriction || "",
        connectionTimeout: String(sub.ldapConfig.connectionTimeout),
      });
    }
  }

  // ─── Loading ────────────────────────────────────────────────
  if (subscribersLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-violet-500" />
            Enterprise Authentication
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AD/LDAP authentication for enterprise subscribers — session management, bandwidth tracking, usage reports
          </p>
        </div>
        <div className="flex gap-2">
          {selectedSubscriber && (
            <Button variant="outline" size="sm" onClick={() => { setSelectedSubscriber(null); setTab("subscribers"); }}>
              <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
              All Subscribers
            </Button>
          )}
          <Button size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ["enterprise-subscribers"] }); queryClient.invalidateQueries({ queryKey: ["enterprise-detail"] }); queryClient.invalidateQueries({ queryKey: ["enterprise-sessions"] }); queryClient.invalidateQueries({ queryKey: ["enterprise-users"] }); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Enterprise
          </Button>
        </div>
      </div>

      {/* Tab navigation */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="subscribers" className="text-xs sm:text-sm">Subscribers</TabsTrigger>
          {selectedSubscriber && (
            <>
              <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
              <TabsTrigger value="ldap" className="text-xs sm:text-sm">LDAP Config</TabsTrigger>
              <TabsTrigger value="sessions" className="text-xs sm:text-sm">Sessions</TabsTrigger>
              <TabsTrigger value="users" className="text-xs sm:text-sm">Users</TabsTrigger>
              <TabsTrigger value="usage" className="text-xs sm:text-sm">Usage Reports</TabsTrigger>
            </>
          )}
        </TabsList>

        {/* ═══════════════════════════════════════════════════ */}
        {/* Tab: Subscribers                                   */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="subscribers">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="border shadow-sm animate-card-enter" style={{ animationDelay: "0ms" }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30"><Building2 className="h-4 w-4 text-violet-600 dark:text-violet-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Enterprises</p>
                    <p className="text-xl font-bold">{subscribers.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm animate-card-enter" style={{ animationDelay: "75ms" }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-xl font-bold">{subscribers.filter((s) => s.status === "active").length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm animate-card-enter" style={{ animationDelay: "150ms" }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30"><Shield className="h-4 w-4 text-cyan-600 dark:text-cyan-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">LDAP Auth</p>
                    <p className="text-xl font-bold">{subscribers.filter((s) => s.authMethod === "ldap").length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm animate-card-enter" style={{ animationDelay: "225ms" }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30"><Users className="h-4 w-4 text-amber-600 dark:text-amber-400" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Users</p>
                    <p className="text-xl font-bold">{subscribers.reduce((sum, s) => sum + (s._count?.users || 0), 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search enterprises..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 max-w-md" />
            </div>
          </div>

          {/* Subscriber Cards */}
          {filteredSubscribers.length === 0 ? (
            <Card className="border shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Building2 className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">No enterprise subscribers found</p>
                <p className="text-xs mt-1">Add your first enterprise subscriber to get started</p>
                <Button size="sm" className="mt-4" onClick={openAddDialog}><Plus className="h-4 w-4 mr-2" />Add Enterprise</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSubscribers.map((sub, idx) => (
                <Card
                  key={sub.id}
                  className="border shadow-sm hover:shadow-md transition-all cursor-pointer animate-card-enter"
                  style={{ animationDelay: `${idx * 50}ms` }}
                  onClick={() => handleSelectSubscriber(sub)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0">
                          <Building2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-semibold truncate">{sub.companyName}</CardTitle>
                          <p className="text-xs text-muted-foreground font-mono">{sub.subscriberId}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_STYLES[sub.status] || ""}`}>{sub.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Auth Method</span>
                        <Badge variant="outline" className={`text-[10px] ${AUTH_METHOD_STYLES[sub.authMethod] || ""}`}>{sub.authMethod.toUpperCase()}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Plan</span>
                        <span className="font-medium">{sub.plan?.name || "No Plan"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Users</span>
                        <span className="font-medium">{sub._count?.users || 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Active Sessions</span>
                        <span className="font-medium">{sub._count?.sessions || 0}</span>
                      </div>
                      {sub.authMethod === "ldap" && sub.ldapConfig && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">LDAP Health</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${sub.ldapConfig.healthStatus === "reachable" ? "bg-emerald-500" : sub.ldapConfig.healthStatus === "unreachable" ? "bg-red-500" : "bg-slate-400"}`} />
                            <Badge variant="outline" className={`text-[10px] ${HEALTH_STYLES[sub.ldapConfig.healthStatus] || ""}`}>{sub.ldapConfig.healthStatus}</Badge>
                          </div>
                        </div>
                      )}
                      {sub.location && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Location</span>
                          <span className="font-medium truncate ml-2">{sub.location}</span>
                        </div>
                      )}
                    </div>
                    <Separator className="my-3" />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Created {timeAgo(sub.createdAt)}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditDialog(sub); }}><Edit className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setDeleteTarget(sub); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* Tab: Overview                                      */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="overview">
          {selectedSubscriber && detail && (
            <div className="space-y-6">
              {/* Subscriber Header */}
              <Card className="border shadow-sm">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-xl bg-violet-100 dark:bg-violet-900/30">
                        <Building2 className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{detail.companyName}</CardTitle>
                        <CardDescription className="font-mono">{detail.subscriberId}</CardDescription>
                      </div>
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[detail.status] || ""}`}>{detail.status}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(selectedSubscriber)}><Edit className="h-4 w-4 mr-2" />Edit</Button>
                      <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(selectedSubscriber)}><Trash2 className="h-4 w-4 mr-2" />Delete</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">{stats.totalUsers}</p>
                      <p className="text-xs text-muted-foreground">Total Users</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold text-emerald-600">{stats.activeSessions}</p>
                      <p className="text-xs text-muted-foreground">Active Sessions</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">{stats.totalSessions}</p>
                      <p className="text-xs text-muted-foreground">Total Sessions</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">{detail.bandwidthMode === "shared_pool" ? `${detail.sharedPoolMbps} Mbps` : `${detail.perUserDownMbps}/${detail.perUserUpMbps}`}</p>
                      <p className="text-xs text-muted-foreground">Bandwidth</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">{detail.dataQuotaGB ? `${detail.dataQuotaGB} GB` : "Unlimited"}</p>
                      <p className="text-xs text-muted-foreground">Data Quota</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">{detail.overageAction}</p>
                      <p className="text-xs text-muted-foreground">Overage Action</p>
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <p><span className="text-muted-foreground">Plan:</span> <span className="font-medium ml-1">{detail.plan?.name || "None"}</span></p>
                      <p><span className="text-muted-foreground">Auth:</span> <Badge variant="outline" className={`ml-1 text-[10px] ${AUTH_METHOD_STYLES[detail.authMethod] || ""}`}>{detail.authMethod.toUpperCase()}</Badge></p>
                      <p><span className="text-muted-foreground">Location:</span> <span className="font-medium ml-1">{detail.location || "—"}</span></p>
                      <p><span className="text-muted-foreground">Contact:</span> <span className="font-medium ml-1">{detail.contactEmail || "—"}</span></p>
                    </div>
                    <div className="space-y-1">
                      <p><span className="text-muted-foreground">Session Timeout:</span> <span className="font-medium ml-1">{Math.floor(detail.sessionTimeout / 3600)}h</span></p>
                      <p><span className="text-muted-foreground">Max Concurrent:</span> <span className="font-medium ml-1">{detail.maxConcurrent}</span></p>
                      <p><span className="text-muted-foreground">MAC Binding:</span> <Badge variant="outline" className="ml-1 text-[10px]">{detail.macBinding ? "Enabled" : "Disabled"}</Badge></p>
                      <p><span className="text-muted-foreground">Created:</span> <span className="font-medium ml-1">{formatDate(detail.createdAt)}</span></p>
                    </div>
                  </div>
                  {detail.notes && (
                    <>
                      <Separator className="my-4" />
                      <p><span className="text-muted-foreground text-sm">Notes:</span> <span className="text-sm ml-1">{detail.notes}</span></p>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setTab("sessions")}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><Wifi className="h-5 w-5 text-emerald-600" /></div>
                    <div>
                      <p className="text-sm font-semibold">Active Sessions</p>
                      <p className="text-xs text-muted-foreground">{stats.activeSessions} online now</p>
                    </div>
                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                  </CardContent>
                </Card>
                <Card className="border shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setTab("users")}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30"><Users className="h-5 w-5 text-cyan-600" /></div>
                    <div>
                      <p className="text-sm font-semibold">User Directory</p>
                      <p className="text-xs text-muted-foreground">{stats.totalUsers} synced users</p>
                    </div>
                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                  </CardContent>
                </Card>
                <Card className="border shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setTab("usage")}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30"><FileText className="h-5 w-5 text-amber-600" /></div>
                    <div>
                      <p className="text-sm font-semibold">Usage Reports</p>
                      <p className="text-xs text-muted-foreground">Bandwidth & data analytics</p>
                    </div>
                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* Tab: LDAP Config                                    */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="ldap">
          {selectedSubscriber && (
            <div className="space-y-6">
              {selectedSubscriber.authMethod !== "ldap" ? (
                <Card className="border shadow-sm">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Shield className="h-12 w-12 mb-3 opacity-20" />
                    <p className="text-sm font-medium">LDAP Authentication Not Configured</p>
                    <p className="text-xs mt-1">Change the auth method to &quot;LDAP&quot; in the enterprise settings to configure LDAP</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* LDAP Server Config */}
                  <Card className="border shadow-sm">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Server className="h-4 w-4 text-violet-500" />
                          LDAP Server Configuration
                        </CardTitle>
                        {detail?.ldapConfig && (
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${detail.ldapConfig.healthStatus === "reachable" ? "bg-emerald-500" : detail.ldapConfig.healthStatus === "unreachable" ? "bg-red-500" : "bg-slate-400"}`} />
                            <Badge variant="outline" className={`text-[10px] ${HEALTH_STYLES[detail.ldapConfig.healthStatus] || ""}`}>
                              {detail.ldapConfig.healthStatus}
                            </Badge>
                            {detail.ldapConfig.lastCheckedAt && (
                              <span className="text-[10px] text-muted-foreground">
                                Last checked {timeAgo(detail.ldapConfig.lastCheckedAt)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Server Host</Label>
                          <Input
                            value={ldapDetail.serverHost}
                            onChange={(e) => setLdapDetail({ ...ldapDetail, serverHost: e.target.value })}
                            placeholder="ad.company.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Server Port</Label>
                          <Input
                            value={ldapDetail.serverPort}
                            onChange={(e) => setLdapDetail({ ...ldapDetail, serverPort: e.target.value })}
                            placeholder="636"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Base DN</Label>
                          <Input
                            value={ldapDetail.baseDn}
                            onChange={(e) => setLdapDetail({ ...ldapDetail, baseDn: e.target.value })}
                            placeholder="DC=company,DC=com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Bind DN</Label>
                          <Input
                            value={ldapDetail.bindDn}
                            onChange={(e) => setLdapDetail({ ...ldapDetail, bindDn: e.target.value })}
                            placeholder="CN=isp-readonly,DC=company,DC=com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Bind Password</Label>
                          <Input
                            type="password"
                            value={ldapDetail.bindPassword}
                            onChange={(e) => setLdapDetail({ ...ldapDetail, bindPassword: e.target.value })}
                            placeholder="Leave blank to keep existing"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">User Filter</Label>
                          <Input
                            value={ldapDetail.userFilter}
                            onChange={(e) => setLdapDetail({ ...ldapDetail, userFilter: e.target.value })}
                            placeholder="(sAMAccountName=%s)"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Group Restriction</Label>
                          <Input
                            value={ldapDetail.groupRestriction}
                            onChange={(e) => setLdapDetail({ ...ldapDetail, groupRestriction: e.target.value })}
                            placeholder="CN=VPNUsers,DC=company,DC=com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Connection Timeout (sec)</Label>
                          <Input
                            value={ldapDetail.connectionTimeout}
                            onChange={(e) => setLdapDetail({ ...ldapDetail, connectionTimeout: e.target.value })}
                            placeholder="5"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={ldapDetail.useTls}
                          onCheckedChange={(checked) => setLdapDetail({ ...ldapDetail, useTls: checked })}
                        />
                        <Label className="text-xs">Use TLS/SSL (LDAPS)</Label>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={testLdapMutation.isPending}
                          onClick={() => testLdapMutation.mutate({
                            id: selectedSubscriber.id,
                            serverHost: ldapDetail.serverHost,
                            serverPort: parseInt(ldapDetail.serverPort, 10),
                            useTls: ldapDetail.useTls,
                            baseDn: ldapDetail.baseDn,
                            bindDn: ldapDetail.bindDn,
                            bindPassword: ldapDetail.bindPassword || undefined,
                            connectionTimeout: parseInt(ldapDetail.connectionTimeout, 10),
                          })}
                        >
                          {testLdapMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                          Test Connection
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateMutation.mutate({
                            id: selectedSubscriber.id,
                            authMethod: "ldap",
                            ldapConfig: {
                              serverHost: ldapDetail.serverHost,
                              serverPort: parseInt(ldapDetail.serverPort, 10),
                              useTls: ldapDetail.useTls,
                              baseDn: ldapDetail.baseDn,
                              bindDn: ldapDetail.bindDn,
                              ...(ldapDetail.bindPassword ? { bindPassword: ldapDetail.bindPassword } : {}),
                              userFilter: ldapDetail.userFilter,
                              groupRestriction: ldapDetail.groupRestriction || null,
                              connectionTimeout: parseInt(ldapDetail.connectionTimeout, 10),
                            },
                          })}
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings className="h-4 w-4 mr-2" />}
                          Save Configuration
                        </Button>
                      </div>

                      {/* Test Result */}
                      {ldapTestResult && (
                        <div className={`mt-3 p-3 rounded-lg border ${ldapTestResult.success ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800" : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"}`}>
                          <div className="flex items-center gap-2">
                            {ldapTestResult.success ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                            <span className={`text-sm font-medium ${ldapTestResult.success ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                              {ldapTestResult.message}
                            </span>
                            {ldapTestResult.latencyMs && (
                              <span className="text-xs text-muted-foreground ml-auto">{ldapTestResult.latencyMs}ms</span>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* Tab: Sessions                                      */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="sessions">
          {selectedSubscriber && (
            <div className="space-y-4">
              {/* Session Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2"><Wifi className="h-4 w-4 text-emerald-500" /><div><p className="text-xs text-muted-foreground">Active Sessions</p><p className="text-xl font-bold text-emerald-600">{sessionStats.active}</p></div></div></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2"><Clock className="h-4 w-4 text-cyan-500" /><div><p className="text-xs text-muted-foreground">Total Sessions</p><p className="text-xl font-bold">{sessionStats.total}</p></div></div></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2"><Download className="h-4 w-4 text-blue-500" /><div><p className="text-xs text-muted-foreground">Total Download</p><p className="text-xl font-bold">{formatBytes(sessionStats.totalDownload)}</p></div></div></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2"><Upload className="h-4 w-4 text-orange-500" /><div><p className="text-xs text-muted-foreground">Total Upload</p><p className="text-xl font-bold">{formatBytes(sessionStats.totalUpload)}</p></div></div></CardContent></Card>
              </div>

              {sessionStats.active > 0 && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => disconnectAllMutation.mutate(selectedSubscriber.id)} disabled={disconnectAllMutation.isPending}>
                    {disconnectAllMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unlink className="h-4 w-4 mr-2" />}
                    Disconnect All ({sessionStats.active})
                  </Button>
                </div>
              )}

              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  {sessionsLoading ? (
                    <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Wifi className="h-10 w-10 mb-2 opacity-20" /><p className="text-sm">No sessions found</p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[500px]">
                      <Table>
                        <TableHeader><TableRow className="bg-muted/50">
                          <TableHead className="text-xs font-medium uppercase">Username</TableHead>
                          <TableHead className="text-xs font-medium uppercase">IP Address</TableHead>
                          <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">MAC</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                          <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Duration</TableHead>
                          <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Download</TableHead>
                          <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Upload</TableHead>
                          <TableHead className="text-xs font-medium uppercase text-right">Action</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {sessions.map((session) => (
                            <TableRow key={session.id} className="hover:bg-muted/50 transition-colors">
                              <TableCell className="text-xs font-medium">{session.username}</TableCell>
                              <TableCell className="font-mono text-xs">{session.ipAddress}</TableCell>
                              <TableCell className="font-mono text-xs hidden sm:table-cell">{session.macAddress || "—"}</TableCell>
                              <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[session.status] || STATUS_STYLES.active}`}>{session.status}</Badge></TableCell>
                              <TableCell className="text-xs hidden md:table-cell">{session.status === "active" ? duration(session.connectedAt) : "—"}</TableCell>
                              <TableCell className="text-xs hidden lg:table-cell">{formatBytes(session.downloadBytes)}</TableCell>
                              <TableCell className="text-xs hidden lg:table-cell">{formatBytes(session.uploadBytes)}</TableCell>
                              <TableCell className="text-right">
                                {session.status === "active" && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => disconnectSessionMutation.mutate({ id: selectedSubscriber.id, sessionIds: [session.id] })}>
                                    <Unlink className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* Tab: Users                                         */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="users">
          {selectedSubscriber && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{users.length} users synced from directory</p>
                <Button size="sm" onClick={() => syncUsersMutation.mutate(selectedSubscriber.id)} disabled={syncUsersMutation.isPending}>
                  {syncUsersMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Sync from LDAP
                </Button>
              </div>

              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  {usersLoading ? (
                    <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Users className="h-10 w-10 mb-2 opacity-20" />
                      <p className="text-sm">No users synced yet</p>
                      <p className="text-xs mt-1">Click &quot;Sync from LDAP&quot; to import users from Active Directory</p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[500px]">
                      <Table>
                        <TableHeader><TableRow className="bg-muted/50">
                          <TableHead className="text-xs font-medium uppercase">Username</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Display Name</TableHead>
                          <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Email</TableHead>
                          <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Department</TableHead>
                          <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">AD Groups</TableHead>
                          <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Last Login</TableHead>
                          <TableHead className="text-xs font-medium uppercase text-right">Data</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {users.map((user) => {
                            const groups: string[] = JSON.parse(user.adGroups || "[]");
                            return (
                              <TableRow key={user.id} className="hover:bg-muted/50 transition-colors">
                                <TableCell className="text-xs font-medium">{user.username}</TableCell>
                                <TableCell className="text-xs">{user.displayName || "—"}</TableCell>
                                <TableCell className="text-xs hidden sm:table-cell">{user.email || "—"}</TableCell>
                                <TableCell className="text-xs hidden md:table-cell"><Badge variant="outline" className="text-[10px]">{user.department || "—"}</Badge></TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {groups.slice(0, 2).map((g) => <Badge key={g} variant="secondary" className="text-[9px]">{g}</Badge>)}
                                    {groups.length > 2 && <Badge variant="secondary" className="text-[9px]">+{groups.length - 2}</Badge>}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs hidden lg:table-cell">{timeAgo(user.lastLoginAt)}</TableCell>
                                <TableCell className="text-xs text-right">
                                  <span className="text-blue-600">↓{formatBytes(user.totalDownload)}</span>
                                  {" / "}
                                  <span className="text-orange-600">↑{formatBytes(user.totalUpload)}</span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* Tab: Usage Reports                                 */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="usage">
          {selectedSubscriber && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Consumers */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-500" />
                      Top 10 Data Consumers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {topConsumers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Zap className="h-8 w-8 mb-2 opacity-20" /><p className="text-sm">No usage data</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-[400px]">
                        <Table>
                          <TableHeader><TableRow className="bg-muted/50">
                            <TableHead className="text-xs font-medium uppercase">#</TableHead>
                            <TableHead className="text-xs font-medium uppercase">User</TableHead>
                            <TableHead className="text-xs font-medium uppercase hidden sm:table-cell">Department</TableHead>
                            <TableHead className="text-xs font-medium uppercase text-right">Download</TableHead>
                            <TableHead className="text-xs font-medium uppercase text-right">Upload</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {topConsumers.map((user, idx) => {
                              const total = Number(user.totalDownload) + Number(user.totalUpload);
                              return (
                                <TableRow key={user.id} className="hover:bg-muted/50">
                                  <TableCell className="text-xs font-bold text-muted-foreground">{idx + 1}</TableCell>
                                  <TableCell className="text-xs font-medium">{user.displayName || user.username}</TableCell>
                                  <TableCell className="text-xs hidden sm:table-cell">{user.department || "—"}</TableCell>
                                  <TableCell className="text-xs text-right text-blue-600">{formatBytes(user.totalDownload)}</TableCell>
                                  <TableCell className="text-xs text-right text-orange-600">{formatBytes(user.totalUpload)}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {/* Department Usage */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-violet-500" />
                      Department-wise Usage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {departmentUsage.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <HardDrive className="h-8 w-8 mb-2 opacity-20" /><p className="text-sm">No usage data</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {departmentUsage.map(([dept, data]) => {
                          const totalBytes = departmentUsage.reduce((s, [, d]) => s + d.download + d.upload, 0);
                          const pct = totalBytes > 0 ? ((data.download + data.upload) / totalBytes * 100) : 0;
                          return (
                            <div key={dept} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{dept}</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-muted-foreground">{data.count} users</span>
                                  <span className="font-mono">{formatBytes(data.download + data.upload)}</span>
                                </div>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>↓ {formatBytes(data.download)}</span>
                                <span>{pct.toFixed(1)}%</span>
                                <span>↑ {formatBytes(data.upload)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Quota Alerts */}
              {detail?.dataQuotaGB && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Data Quota Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {users.map((user) => {
                        const totalGB = (Number(user.totalDownload) + Number(user.totalUpload)) / 1073741824;
                        const quotaGB = detail.dataQuotaGB!;
                        const pct = Math.min((totalGB / quotaGB) * 100, 100);
                        const isOver = totalGB > quotaGB;
                        return (
                          <div key={user.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">{user.displayName || user.username}</span>
                              <div className="flex items-center gap-2">
                                <span className={`font-mono ${isOver ? "text-red-600 font-bold" : ""}`}>{totalGB.toFixed(2)} / {quotaGB} GB</span>
                                {isOver && <Badge variant="destructive" className="text-[9px]">OVER</Badge>}
                              </div>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════ */}
      {/* Add Enterprise Dialog                           */}
      {/* ═══════════════════════════════════════════════════ */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-violet-500" />Add Enterprise Subscriber</DialogTitle>
            <DialogDescription>Create a new enterprise subscriber with LDAP authentication configuration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-xs">Company Name *</Label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Acme Corporation" /></div>
              <div className="space-y-2"><Label className="text-xs">Subscriber ID *</Label><Input value={form.subscriberId} onChange={(e) => setForm({ ...form, subscriberId: e.target.value })} placeholder="ENT-2024-0042" /></div>
              <div className="space-y-2"><Label className="text-xs">Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Building A, Tech Park" /></div>
              <div className="space-y-2"><Label className="text-xs">Contact Email</Label><Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="admin@company.com" /></div>
              <div className="space-y-2"><Label className="text-xs">Contact Phone</Label><Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="+91 98765 43210" /></div>
              <div className="space-y-2">
                <Label className="text-xs">Auth Method</Label>
                <Select value={form.authMethod} onValueChange={(v) => setForm({ ...form, authMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="ldap">LDAP / Active Directory</SelectItem>
                    <SelectItem value="radius">RADIUS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Bandwidth Mode</Label>
                <Select value={form.bandwidthMode} onValueChange={(v) => setForm({ ...form, bandwidthMode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared_pool">Shared Pool</SelectItem>
                    <SelectItem value="per_user">Per User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="text-xs">Shared Pool (Mbps)</Label><Input type="number" value={form.sharedPoolMbps} onChange={(e) => setForm({ ...form, sharedPoolMbps: parseInt(e.target.value) || 100 })} /></div>
              <div className="space-y-2"><Label className="text-xs">Per User Down (Mbps)</Label><Input type="number" value={form.perUserDownMbps} onChange={(e) => setForm({ ...form, perUserDownMbps: parseInt(e.target.value) || 50 })} /></div>
              <div className="space-y-2"><Label className="text-xs">Per User Up (Mbps)</Label><Input type="number" value={form.perUserUpMbps} onChange={(e) => setForm({ ...form, perUserUpMbps: parseInt(e.target.value) || 20 })} /></div>
              <div className="space-y-2">
                <Label className="text-xs">Overage Action</Label>
                <Select value={form.overageAction} onValueChange={(v) => setForm({ ...form, overageAction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="throttle">Throttle</SelectItem>
                    <SelectItem value="block">Block</SelectItem>
                    <SelectItem value="charge">Charge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="text-xs">Data Quota (GB)</Label><Input value={form.dataQuotaGB} onChange={(e) => setForm({ ...form, dataQuotaGB: e.target.value })} placeholder="Leave empty for unlimited" /></div>
            </div>
            <div className="space-y-2"><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes..." rows={2} /></div>

            {/* LDAP Config section */}
            {form.authMethod === "ldap" && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-3"><Shield className="h-4 w-4 text-violet-500" />LDAP Configuration</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label className="text-xs">Server Host *</Label><Input value={ldapForm.serverHost} onChange={(e) => setLdapForm({ ...ldapForm, serverHost: e.target.value })} placeholder="ad.company.com" /></div>
                    <div className="space-y-2"><Label className="text-xs">Server Port</Label><Input value={ldapForm.serverPort} onChange={(e) => setLdapForm({ ...ldapForm, serverPort: e.target.value })} /></div>
                    <div className="space-y-2"><Label className="text-xs">Base DN *</Label><Input value={ldapForm.baseDn} onChange={(e) => setLdapForm({ ...ldapForm, baseDn: e.target.value })} placeholder="DC=company,DC=com" /></div>
                    <div className="space-y-2"><Label className="text-xs">Bind DN *</Label><Input value={ldapForm.bindDn} onChange={(e) => setLdapForm({ ...ldapForm, bindDn: e.target.value })} placeholder="CN=readonly,DC=company,DC=com" /></div>
                    <div className="space-y-2"><Label className="text-xs">Bind Password *</Label><Input type="password" value={ldapForm.bindPassword} onChange={(e) => setLdapForm({ ...ldapForm, bindPassword: e.target.value })} /></div>
                    <div className="space-y-2"><Label className="text-xs">Group Restriction</Label><Input value={ldapForm.groupRestriction} onChange={(e) => setLdapForm({ ...ldapForm, groupRestriction: e.target.value })} placeholder="CN=VPNUsers,DC=company,DC=com" /></div>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <Switch checked={ldapForm.useTls} onCheckedChange={(c) => setLdapForm({ ...ldapForm, useTls: c })} />
                    <Label className="text-xs">Use TLS/SSL (LDAPS)</Label>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAddDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Subscriber
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════ */}
      {/* Edit Enterprise Dialog                          */}
      {/* ═══════════════════════════════════════════════════ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Enterprise Subscriber</DialogTitle>
            <DialogDescription>Update enterprise subscriber settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-xs">Company Name</Label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
              <div className="space-y-2"><Label className="text-xs">Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div className="space-y-2"><Label className="text-xs">Contact Email</Label><Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></div>
              <div className="space-y-2"><Label className="text-xs">Contact Phone</Label><Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></div>
              <div className="space-y-2">
                <Label className="text-xs">Status</Label>
                <Select value={form.status || "active"} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Auth Method</Label>
                <Select value={form.authMethod} onValueChange={(v) => setForm({ ...form, authMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="ldap">LDAP / Active Directory</SelectItem>
                    <SelectItem value="radius">RADIUS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Bandwidth Mode</Label>
                <Select value={form.bandwidthMode} onValueChange={(v) => setForm({ ...form, bandwidthMode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared_pool">Shared Pool</SelectItem>
                    <SelectItem value="per_user">Per User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="text-xs">Shared Pool (Mbps)</Label><Input type="number" value={form.sharedPoolMbps} onChange={(e) => setForm({ ...form, sharedPoolMbps: parseInt(e.target.value) || 100 })} /></div>
              <div className="space-y-2"><Label className="text-xs">Per User Down (Mbps)</Label><Input type="number" value={form.perUserDownMbps} onChange={(e) => setForm({ ...form, perUserDownMbps: parseInt(e.target.value) || 50 })} /></div>
              <div className="space-y-2"><Label className="text-xs">Per User Up (Mbps)</Label><Input type="number" value={form.perUserUpMbps} onChange={(e) => setForm({ ...form, perUserUpMbps: parseInt(e.target.value) || 20 })} /></div>
              <div className="space-y-2">
                <Label className="text-xs">Overage Action</Label>
                <Select value={form.overageAction} onValueChange={(v) => setForm({ ...form, overageAction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="throttle">Throttle</SelectItem>
                    <SelectItem value="block">Block</SelectItem>
                    <SelectItem value="charge">Charge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="text-xs">Data Quota (GB)</Label><Input value={form.dataQuotaGB} onChange={(e) => setForm({ ...form, dataQuotaGB: e.target.value })} placeholder="Empty = unlimited" /></div>
              <div className="space-y-2"><Label className="text-xs">Max Concurrent</Label><Input type="number" value={form.maxConcurrent} onChange={(e) => setForm({ ...form, maxConcurrent: parseInt(e.target.value) || 1 })} /></div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.macBinding} onCheckedChange={(c) => setForm({ ...form, macBinding: c })} />
              <Label className="text-xs">MAC Binding</Label>
            </div>
            <div className="space-y-2"><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Edit className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════ */}
      {/* Delete Confirmation Dialog                      */}
      {/* ═══════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Enterprise Subscriber</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.companyName}</strong> ({deleteTarget?.subscriberId})?
              This will permanently remove all associated LDAP configuration, users, and session history.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
