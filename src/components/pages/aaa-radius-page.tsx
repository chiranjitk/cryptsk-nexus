"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Shield, Plus, Search, Edit, Trash2, Unplug, Settings, Users, Wifi, Clock, Download,
  Upload, Layers, FileText, Lock, Globe, CheckCircle2, AlertTriangle, Eye, Zap, WifiOff,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useModuleStore } from "@/store/module-store";
import FreeRadiusLivePanel from "@/components/freeradius-live-panel";

// ─── Types ────────────────────────────────────────────────────────
interface RadiusGroup {
  id: string;
  name: string;
  description: string;
  speedLimitDown: number;
  speedLimitUp: number;
  dataLimit: number | null;
  sessionTimeout: number | null;
  priority: number;
  framedIpv6Pool: string;
  delegatedIpv6PrefixPool: string;
  _count: { plans: number; subscribers: number };
  plans: { id: string; name: string; downloadSpeed: number; uploadSpeed: number }[];
}

interface RadiusUser {
  id: string;
  subscriberId: string;
  createdAt: string;
  updatedAt: string;
  subscriber: {
    id: string;
    name: string;
    code: string;
    phone: string;
    serviceUsername: string;
    servicePassword: string;
    status: string;
    radiusGroupId: string | null;
    sessionTimeout: number | null;
    idleTimeout: number | null;
    lastAuthAt: string | null;
    lastAuthResult: string;
    radiusEnabled: boolean;
    plan: {
      id: string;
      name: string;
      downloadSpeed: number;
      uploadSpeed: number;
      dataLimitGb: number | null;
      group: {
        id: string;
        name: string;
        speedLimitDown: number;
        speedLimitUp: number;
        dataLimit: number | null;
      } | null;
    } | null;
    radiusGroup: {
      id: string;
      name: string;
      speedLimitDown: number;
      speedLimitUp: number;
      dataLimit: number | null;
    } | null;
  } | null;
  _count: { sessions: number };
}

interface RadiusSession {
  id: string;
  radiusUserId: string;
  sessionId: string;
  nasIp: string;
  nasPort: string;
  framedIp: string;
  framedIpv6: string;
  delegatedIpv6Prefix: string;
  callingStationId: string;
  acctSessionTime: number;
  inputOctets: bigint;
  outputOctets: bigint;
  startTime: string | null;
  lastUpdate: string | null;
  terminateCause: string;
  radiusUser: {
    id: string;
    subscriber: {
      id: string;
      name: string;
      code: string;
      serviceUsername: string;
    } | null;
  };
}

interface AccountingLog {
  id: string;
  username: string;
  sessionId: string;
  nasIp: string;
  acctStartTime: string | null;
  sessionTime: number;
  inputOctets: bigint;
  outputOctets: bigint;
  callingStationId: string;
  calledStationId: string;
  terminateCause: string;
  createdAt: string;
}

interface RadiusFormData {
  subscriberId: string;
  servicePassword: string;
  radiusGroupId: string;
  sessionTimeout: number;
  idleTimeout: number;
}

interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecial: boolean;
  expiryDays: number;
}

interface CaptivePortalConfig {
  enabled: boolean;
  portalName: string;
  welcomeMessage: string;
  loginMethod: string;
  sessionTimeout: number;
  bandwidthLimit: string;
  redirectUrl: string;
  termsOfService: string;
  allowedHosts: string;
}

interface RadiusGroupFormData {
  name: string;
  description: string;
  speedLimitDown: number;
  speedLimitUp: number;
  dataLimit: number;
  sessionTimeout: number;
  priority: number;
  framedIpv6Pool: string;
  delegatedIpv6PrefixPool: string;
}

const emptyForm: RadiusFormData = {
  subscriberId: "", servicePassword: "", radiusGroupId: "",
  sessionTimeout: 0, idleTimeout: 0,
};

const emptyGroupForm: RadiusGroupFormData = {
  name: "", description: "", speedLimitDown: 0, speedLimitUp: 0, dataLimit: 0, sessionTimeout: 0, priority: 0,
  framedIpv6Pool: "", delegatedIpv6PrefixPool: "",
};

const PAGE_SIZE = 10;

// ─── Helpers ────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatOctets(octets: bigint | number): string {
  const bytes = Number(octets);
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatKbps(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(0)} Mbps`;
  return `${kbps} Kbps`;
}

function mapAuthResult(result: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  const r = (result || "").toLowerCase();
  if (r === "success" || r === "ok" || r === "active" || r === "accepted" || r === "pass")
    return { label: "Success", variant: "default" };
  if (r === "failed" || r === "reject" || r === "rejected" || r === "invalid")
    return { label: "Failed", variant: "destructive" };
  if (r === "timeout" || r === "no response" || r === "timed out")
    return { label: "Timeout", variant: "outline" };
  return { label: "Idle", variant: "secondary" };
}

function getPasswordStrength(password: string, policy: PasswordPolicy): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= policy.minLength) score++;
  if (password.length >= policy.minLength * 1.5) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;
  if (password.length >= 12) score++;

  if (score <= 2) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 4) return { score, label: "Medium", color: "bg-yellow-500" };
  return { score, label: "Strong", color: "bg-green-500" };
}

function validatePasswordClient(password: string, policy: PasswordPolicy): string[] {
  const errors: string[] = [];
  if (password.length < policy.minLength) errors.push(`At least ${policy.minLength} characters`);
  if (policy.requireUppercase && !/[A-Z]/.test(password)) errors.push("One uppercase letter");
  if (policy.requireLowercase && !/[a-z]/.test(password)) errors.push("One lowercase letter");
  if (policy.requireNumbers && !/[0-9]/.test(password)) errors.push("One number");
  if (policy.requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) errors.push("One special character");
  return errors;
}

// ─── Component ────────────────────────────────────────────────────
export default function AaaRadiusPage() {
  const { isModuleEnabled } = useModuleStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<RadiusFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Pagination
  const [userPage, setUserPage] = useState(1);
  const [sessionPage, setSessionPage] = useState(1);
  const [acctPage, setAcctPage] = useState(1);

  // Subscriber dropdown search for Add dialog
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [subscriberDropdownOpen, setSubscriberDropdownOpen] = useState(false);

  // Batch import
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<string[]>([]);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // RADIUS Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsTab, setSettingsTab] = useState("server");

  // Group CRUD
  const [groupAddOpen, setGroupAddOpen] = useState(false);
  const [groupEditOpen, setGroupEditOpen] = useState(false);
  const [groupDeleteOpen, setGroupDeleteOpen] = useState(false);
  const [groupForm, setGroupForm] = useState<RadiusGroupFormData>(emptyGroupForm);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Accounting filters
  const [acctSearch, setAcctSearch] = useState("");
  const [acctStartDate, setAcctStartDate] = useState("");
  const [acctEndDate, setAcctEndDate] = useState("");

  // Server settings local state
  const [serverSettings, setServerSettings] = useState({ radiusServerIp: "", radiusServerPort: 1812, radiusSecret: "" });
  const [ppState, setPpState] = useState<PasswordPolicy>({ minLength: 8, requireUppercase: false, requireLowercase: true, requireNumbers: true, requireSpecial: false, expiryDays: 90 });
  const [cpState, setCpState] = useState<CaptivePortalConfig>({ enabled: false, portalName: "", welcomeMessage: "", loginMethod: "RADIUS", sessionTimeout: 86400, bandwidthLimit: "", redirectUrl: "", termsOfService: "", allowedHosts: "" });

  // Import result
  const [importResult, setImportResult] = useState<{ count: number; errorCount: number; errors: string[]; message: string } | null>(null);

  // ─── Queries ───
  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: RadiusUser[] }>({
    queryKey: ["radius-users"],
    queryFn: () => apiFetch<{ users: RadiusUser[] }>("/api/radius-users"),
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{
    sessions: RadiusSession[];
    stats: { totalActive: number; totalInputBytes: number; totalOutputBytes: number; totalBytes: number };
  }>({
    queryKey: ["radius-sessions"],
    queryFn: () => apiFetch<{
      sessions: RadiusSession[];
      stats: { totalActive: number; totalInputBytes: number; totalOutputBytes: number; totalBytes: number };
    }>("/api/radius-sessions"),
    refetchInterval: 30000,
  });

  const { data: groupsData, isLoading: groupsLoading } = useQuery<{ groups: RadiusGroup[] }>({
    queryKey: ["radius-groups"],
    queryFn: () => apiFetch<{ groups: RadiusGroup[] }>("/api/radius-groups"),
  });

  const { data: radiusSettings, isLoading: radiusSettingsLoading } = useQuery<{
    passwordPolicy: PasswordPolicy;
    captivePortal: CaptivePortalConfig;
  }>({
    queryKey: ["radius-settings"],
    queryFn: () => apiFetch<{ passwordPolicy: PasswordPolicy; captivePortal: CaptivePortalConfig }>("/api/radius-settings"),
    enabled: settingsOpen,
  });

  const { data: ispSettings } = useQuery<{
    radiusServerIp: string | null; radiusServerPort: number | null; radiusSecret: string | null;
  }>({
    queryKey: ["isp-settings-radius"],
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; settings: { radiusServerIp: string | null; radiusServerPort: number | null; radiusSecret: string | null } }>("/api/settings/isp-profile");
      return res.settings;
    },
    enabled: settingsOpen && settingsTab === "server",
  });

  const acctParams = new URLSearchParams({
    page: acctPage.toString(),
    limit: PAGE_SIZE.toString(),
    ...(acctSearch && { username: acctSearch }),
    ...(acctStartDate && { startDate: acctStartDate }),
    ...(acctEndDate && { endDate: acctEndDate }),
  });

  const { data: acctData, isLoading: acctLoading } = useQuery<{
    items: AccountingLog[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["radius-accounting", acctPage, acctSearch, acctStartDate, acctEndDate],
    queryFn: () => apiFetch(`/api/radius-accounting?${acctParams.toString()}`),
  });

  // Subscriber autocomplete for Add dialog (subscribers not yet RADIUS-enabled)
  const { data: subscriberList } = useQuery<{ subscribers?: { id: string; name: string; code: string; serviceUsername: string; servicePassword: string }[]; items?: { id: string; name: string; code: string; serviceUsername: string; servicePassword: string }[] }>({
    queryKey: ["radius-subscriber-autocomplete", subscriberSearch],
    queryFn: () => apiFetch(`/api/subscribers?search=${encodeURIComponent(subscriberSearch)}&radiusEnabled=false&limit=10`),
    enabled: subscriberSearch.length > 0 && addOpen,
  });

  // ─── Mutations ───
  const createMutation = useMutation({
    mutationFn: (data: RadiusFormData) =>
      apiFetch("/api/radius-users", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("RADIUS user provisioned successfully");
      setAddOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["radius-users"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RadiusFormData> }) =>
      apiFetch(`/api/radius-users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("RADIUS user updated");
      setEditOpen(false);
      setForm(emptyForm);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["radius-users"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/radius-users/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("RADIUS user removed");
      setDeleteOpen(false);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["radius-users"] });
    },
  });

  // Toggle RADIUS enabled on subscriber
  const toggleEnabledMutation = useMutation({
    mutationFn: ({ subscriberId, radiusEnabled }: { subscriberId: string; radiusEnabled: boolean }) =>
      apiFetch("/api/radius-users/toggle-enabled", { method: "POST", body: JSON.stringify({ subscriberId, radiusEnabled }) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "RADIUS status updated");
      queryClient.invalidateQueries({ queryKey: ["radius-users"] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch("/api/radius-sessions", { method: "POST", body: JSON.stringify({ action: "disconnect", sessionId }) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Session disconnect requested");
      queryClient.invalidateQueries({ queryKey: ["radius-sessions"] });
    },
    onError: () => toast.error("Failed to disconnect session"),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/radius-users/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `radius-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => toast.success("CSV exported successfully"),
    onError: () => toast.error("Failed to export CSV"),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/radius-users/import", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: (res) => {
      toast.success(res.message || `${res.count || 0} users imported`);
      setImportResult({ count: res.count || 0, errorCount: res.errorCount || 0, errors: res.errors || [], message: res.message || "" });
      setImportOpen(false);
      setImportFile(null);
      setImportPreview([]);
      queryClient.invalidateQueries({ queryKey: ["radius-users"] });
    },
    onError: () => toast.error("Failed to import users"),
  });

  // Group mutations
  const groupCreateMutation = useMutation({
    mutationFn: (data: RadiusGroupFormData) =>
      apiFetch("/api/radius-groups", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Group created");
      setGroupAddOpen(false);
      setGroupForm(emptyGroupForm);
      queryClient.invalidateQueries({ queryKey: ["radius-groups"] });
    },
  });

  const groupUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RadiusGroupFormData> }) =>
      apiFetch("/api/radius-groups", { method: "PUT", body: JSON.stringify({ id, ...data }) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Group updated");
      setGroupEditOpen(false);
      setSelectedGroupId(null);
      queryClient.invalidateQueries({ queryKey: ["radius-groups"] });
    },
  });

  const groupDeleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/radius-groups?id=${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Group deleted");
      setGroupDeleteOpen(false);
      setSelectedGroupId(null);
      queryClient.invalidateQueries({ queryKey: ["radius-groups"] });
      queryClient.invalidateQueries({ queryKey: ["radius-users"] });
    },
  });

  const settingsSaveMutation = useMutation({
    mutationFn: ({ passwordPolicy, captivePortal }: { passwordPolicy?: Partial<PasswordPolicy>; captivePortal?: Partial<CaptivePortalConfig> }) =>
      apiFetch("/api/radius-settings", { method: "PUT", body: JSON.stringify({ passwordPolicy, captivePortal }) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["radius-settings"] });
    },
  });

  // ─── Effects ───
  useEffect(() => {
    if (ispSettings) {
      setServerSettings({
        radiusServerIp: ispSettings.radiusServerIp || "",
        radiusServerPort: ispSettings.radiusServerPort || 1812,
        radiusSecret: ispSettings.radiusSecret || "",
      });
    }
  }, [ispSettings]);

  useEffect(() => {
    if (radiusSettings) {
      setPpState(radiusSettings.passwordPolicy);
      setCpState(radiusSettings.captivePortal);
    }
  }, [radiusSettings]);

  useEffect(() => { setUserPage(1); }, [search]);
  useEffect(() => { setAcctPage(1); }, [acctSearch, acctStartDate, acctEndDate]);

  // ─── Validation ───
  function validateForm(f: RadiusFormData, isEdit = false): boolean {
    const errors: string[] = [];
    if (!f.subscriberId.trim()) errors.push("Subscriber is required");

    if (!isEdit && !f.servicePassword.trim()) errors.push("Service Password is required");
    if (f.servicePassword.trim() && f.servicePassword.length < 4) errors.push("Password must be at least 4 characters");

    if (f.servicePassword.trim() && radiusSettings?.passwordPolicy) {
      const policyErrs = validatePasswordClient(f.servicePassword, radiusSettings.passwordPolicy);
      errors.push(...policyErrs);
    }

    setFormErrors(errors);
    return errors.length === 0;
  }

  function openEdit(user: RadiusUser) {
    setSelectedId(user.id);
    setForm({
      subscriberId: user.subscriberId,
      servicePassword: "",
      radiusGroupId: user.subscriber?.radiusGroupId || "",
      sessionTimeout: user.subscriber?.sessionTimeout || 0,
      idleTimeout: user.subscriber?.idleTimeout || 0,
    });
    setFormErrors([]);
    setEditOpen(true);
  }

  function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim()).slice(0, 6);
      setImportPreview(lines);
    };
    reader.readAsText(file);
  }

  // ─── Filter & Paginate ───
  const filteredUsers = (usersData?.users || []).filter((u) =>
    !search ||
    u.subscriber?.serviceUsername.toLowerCase().includes(search.toLowerCase()) ||
    u.subscriber?.name.toLowerCase().includes(search.toLowerCase()) ||
    u.subscriber?.code.toLowerCase().includes(search.toLowerCase())
  );
  const totalUserPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
  const paginatedUsers = filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);

  const allSessions = sessionsData?.sessions || [];
  const totalSessionPages = Math.ceil(allSessions.length / PAGE_SIZE);
  const paginatedSessions = allSessions.slice((sessionPage - 1) * PAGE_SIZE, sessionPage * PAGE_SIZE);

  // ─── Loading ───
  if (usersLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="skeleton-wave h-96 rounded-lg" />
      </div>
    );
  }

  const passwordPolicy = radiusSettings?.passwordPolicy || { minLength: 6, requireUppercase: false, requireLowercase: true, requireNumbers: true, requireSpecial: false, expiryDays: 0 };
  const captivePortal = radiusSettings?.captivePortal || { enabled: false, portalName: "", welcomeMessage: "", loginMethod: "RADIUS", sessionTimeout: 86400, bandwidthLimit: "", redirectUrl: "", termsOfService: "", allowedHosts: "" };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageHeader
        title="AAA / RADIUS"
        description="Manage RADIUS authentication, groups, accounting, and captive portal."
        icon={Shield}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
              <Download className="h-4 w-4 mr-2" />Export
            </Button>
            <Button variant="outline" onClick={() => { setImportOpen(true); }}>
              <Upload className="h-4 w-4 mr-2" />Import CSV
            </Button>
            <Button variant="outline" onClick={() => { setSettingsOpen(true); setSettingsTab("server"); }}>
              <Settings className="h-4 w-4 mr-2" />Settings
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { setForm(emptyForm); setFormErrors([]); setAddOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />Provision User
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="users" className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Users</TabsTrigger>
          <TabsTrigger value="groups" className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" />Groups</TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5" />Sessions</TabsTrigger>
          <TabsTrigger value="accounting" className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Accounting</TabsTrigger>
          <TabsTrigger value="captive" className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />Captive Portal</TabsTrigger>
          <TabsTrigger value="freeradius" className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" />FreeRADIUS Live</TabsTrigger>
        </TabsList>

        {/* ─── Users Tab ─── */}
        <TabsContent value="users" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-0 rounded-xl ring-1 ring-teal-200/60 dark:ring-teal-800/40 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/50 dark:to-cyan-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm shadow-teal-500/25"><Shield className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{usersData?.users?.length || 0}</p>
                    <p className="text-xs text-muted-foreground font-medium">Total Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-green-200/60 dark:ring-green-800/40 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-500/25"><Users className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">{usersData?.users?.filter((u) => u.subscriber?.status === "ACTIVE").length || 0}</p>
                    <p className="text-xs text-muted-foreground font-medium">Active Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-red-200/60 dark:ring-red-800/40 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-sm shadow-red-500/25"><Wifi className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">{sessionsData?.stats?.totalActive || 0}</p>
                    <p className="text-xs text-muted-foreground font-medium">Active Sessions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-purple-200/60 dark:ring-purple-800/40 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/50 dark:to-violet-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-sm shadow-purple-500/25"><Clock className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-lg font-bold tabular-nums text-purple-700 dark:text-purple-300">{formatOctets(sessionsData?.stats?.totalBytes || 0)}</p>
                    <p className="text-xs text-muted-foreground font-medium">Session Data</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by service username, subscriber name, or code..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Service Username</TableHead>
                      <TableHead className="text-xs">Subscriber</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Plan</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">RADIUS Group</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Speed</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Last Auth</TableHead>
                      <TableHead className="text-xs text-center">Enabled</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">{search ? "No users match your search" : "No RADIUS users found."}</TableCell></TableRow>
                    ) : (
                      paginatedUsers.map((user) => {
                        const sub = user.subscriber;
                        const auth = mapAuthResult(sub?.lastAuthResult || "");
                        // Effective group: subscriber override > plan default
                        const effectiveGroup = sub?.radiusGroup || sub?.plan?.group || null;
                        // Effective speed from group
                        const speedDown = effectiveGroup?.speedLimitDown || sub?.plan?.downloadSpeed || 0;
                        const speedUp = effectiveGroup?.speedLimitUp || sub?.plan?.uploadSpeed || 0;
                        const dataLimitMb = effectiveGroup?.dataLimit || (sub?.plan?.dataLimitGb ? Math.round(sub.plan.dataLimitGb * 1024) : null);

                        return (
                          <TableRow key={user.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell>
                              <div className="font-mono text-xs font-medium">{sub?.serviceUsername || "—"}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs font-medium">{sub?.name || "—"}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{sub?.code || ""}</div>
                            </TableCell>
                            <TableCell className="text-xs hidden md:table-cell">
                              {sub?.plan ? (
                                <span className="text-foreground">{sub.plan.name}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs hidden md:table-cell">
                              {effectiveGroup ? (
                                <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">{effectiveGroup.name}</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs hidden lg:table-cell">
                              <div className="flex items-center gap-1 tabular-nums">
                                <span className="text-green-600">↓{formatKbps(speedDown)}</span>
                                <span className="text-muted-foreground">/</span>
                                <span className="text-teal-600">↑{formatKbps(speedUp)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={sub?.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">{sub?.status || "—"}</Badge>
                            </TableCell>
                            <TableCell className="text-xs hidden md:table-cell">
                              {sub?.lastAuthAt ? (
                                <div className="space-y-0.5">
                                  <div className="text-[10px] text-muted-foreground">{new Date(sub.lastAuthAt).toLocaleString()}</div>
                                  <Badge variant={auth.variant} className="text-[9px] px-1 py-0">{auth.label}</Badge>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-[10px]">Never</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={sub?.radiusEnabled || false}
                                disabled={toggleEnabledMutation.isPending}
                                onCheckedChange={(checked) => {
                                  if (sub) toggleEnabledMutation.mutate({ subscriberId: sub.id, radiusEnabled: checked });
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => { setSelectedId(user.id); setDeleteOpen(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {totalUserPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">Showing {(userPage - 1) * PAGE_SIZE + 1}–{Math.min(userPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={userPage <= 1} onClick={() => setUserPage((p) => p - 1)}>Prev</Button>
                    {Array.from({ length: totalUserPages }, (_, i) => i + 1).map((p) => (
                      <Button key={p} variant={p === userPage ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs" onClick={() => setUserPage(p)}>{p}</Button>
                    ))}
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={userPage >= totalUserPages} onClick={() => setUserPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Groups Tab ─── */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Create and manage RADIUS groups with speed and data profiles. Groups are linked to Plans and Subscribers.</p>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { setGroupForm(emptyGroupForm); setGroupAddOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />Add Group
            </Button>
          </div>

          {groupsLoading ? (
            <Skeleton className="skeleton-wave h-64 rounded-lg" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(groupsData?.groups || []).length === 0 ? (
                <div className="col-span-full text-center py-12 text-muted-foreground">No groups configured. Create a group to assign profiles to Plans or Subscribers.</div>
              ) : (
                (groupsData?.groups || []).map((group) => {
                  const priorityBorder = group.priority <= 3
                    ? "border-l-emerald-500 dark:border-l-emerald-400"
                    : group.priority <= 7
                      ? "border-l-amber-500 dark:border-l-amber-400"
                      : "border-l-slate-400 dark:border-l-slate-500";
                  return (
                  <Card key={group.id} className={`border border-l-4 ${priorityBorder} shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-semibold">{group.name}</CardTitle>
                          {group._count.plans > 0 && (
                            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">{group._count.plans} plan{group._count.plans > 1 ? "s" : ""}</Badge>
                          )}
                          {isModuleEnabled("ipv6") && group.framedIpv6Pool && (
                            <Badge variant="outline" className="text-[10px] border-cyan-300 text-cyan-700 dark:border-cyan-700 dark:text-cyan-300 flex items-center gap-0.5"><Globe className="h-2.5 w-2.5" />IPv6</Badge>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedGroupId(group.id); setGroupForm({ name: group.name, description: group.description, speedLimitDown: group.speedLimitDown, speedLimitUp: group.speedLimitUp, dataLimit: group.dataLimit || 0, sessionTimeout: group.sessionTimeout || 0, priority: group.priority, framedIpv6Pool: group.framedIpv6Pool || "", delegatedIpv6PrefixPool: group.delegatedIpv6PrefixPool || "" }); setGroupEditOpen(true); }}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => { setSelectedGroupId(group.id); setGroupDeleteOpen(true); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {group.description && <CardDescription className="text-xs">{group.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30">↓</Badge>
                          <span className="font-mono font-medium">{formatKbps(group.speedLimitDown)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">↑</Badge>
                          <span className="font-mono font-medium">{formatKbps(group.speedLimitUp)}</span>
                        </div>
                        <div><span className="text-muted-foreground">Data:</span> <span>{group.dataLimit ? `${group.dataLimit >= 1024 ? `${(group.dataLimit / 1024).toFixed(1)} GB` : `${group.dataLimit} MB`}` : "Unlimited"}</span></div>
                        <div><span className="text-muted-foreground">Subscribers:</span> <span className="font-semibold">{group._count.subscribers}</span></div>
                      </div>
                      {group.plans && group.plans.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-dashed border-muted-foreground/20">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Linked Plans</p>
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {group.plans.map((plan) => (
                              <div key={plan.id} className="flex items-center justify-between text-xs border-l-2 border-muted-foreground/20 pl-2 py-0.5">
                                <span className="font-medium truncate max-w-[140px]">{plan.name}</span>
                                <span className="text-muted-foreground tabular-nums ml-2 shrink-0">↓{formatKbps(plan.downloadSpeed)} / ↑{formatKbps(plan.uploadSpeed)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {isModuleEnabled("ipv6") && (group.framedIpv6Pool || group.delegatedIpv6PrefixPool) && (
                        <div className="text-xs space-y-1 mt-2 pt-2 border-t">
                          {group.framedIpv6Pool && <p className="flex items-center gap-1">IPv6 Pool: <span className="font-mono text-cyan-700 dark:text-cyan-300">{group.framedIpv6Pool}</span></p>}
                          {group.delegatedIpv6PrefixPool && <p className="flex items-center gap-1">Delegation: <span className="font-mono text-cyan-700 dark:text-cyan-300">{group.delegatedIpv6PrefixPool}</span></p>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  );
                })
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── Sessions Tab ─── */}
        <TabsContent value="sessions" className="space-y-4">
          {sessionsLoading ? (
            <Skeleton className="skeleton-wave h-96 rounded-lg" />
          ) : (
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-green-500" />Active RADIUS Sessions
                  <Badge variant="default" className="text-[10px]">{sessionsData?.stats?.totalActive || 0}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Service Username</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Subscriber</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Framed IP</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">NAS IP</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Session Time</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Data (↓/↑)</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">MAC</TableHead>
                        {isModuleEnabled("ipv6") && (
                          <>
                            <TableHead className="text-xs hidden lg:table-cell">IPv6 Address</TableHead>
                            <TableHead className="text-xs hidden xl:table-cell">IPv6 Prefix</TableHead>
                          </>
                        )}
                        <TableHead className="text-xs text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allSessions.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-16">
                          <div className="flex flex-col items-center gap-3">
                            <div className="p-4 rounded-full bg-muted/50">
                              <WifiOff className="h-8 w-8 text-muted-foreground/50" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">No active sessions</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">There are currently no active RADIUS sessions. Sessions will appear here when users authenticate.</p>
                            </div>
                          </div>
                        </TableCell></TableRow>
                      ) : (
                        paginatedSessions.map((session) => (
                          <TableRow key={session.id} className="hover:bg-muted/50 transition-colors duration-150 border-l-[3px] border-l-green-500">
                            <TableCell className="font-mono text-xs font-medium">{session.radiusUser.subscriber?.serviceUsername || "—"}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">
                              <div>{session.radiusUser.subscriber?.name || "—"}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{session.radiusUser.subscriber?.code || ""}</div>
                            </TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{session.framedIp || "—"}</TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{session.nasIp || "—"}</TableCell>
                            <TableCell className="text-xs hidden lg:table-cell tabular-nums">{formatDuration(session.acctSessionTime)}</TableCell>
                            <TableCell className="text-xs hidden lg:table-cell tabular-nums">
                              <span className="text-green-600">↓{formatOctets(session.outputOctets)}</span>
                              <span className="text-muted-foreground mx-0.5">/</span>
                              <span className="text-teal-600">↑{formatOctets(session.inputOctets)}</span>
                            </TableCell>
                            <TableCell className="font-mono text-xs hidden lg:table-cell">{session.callingStationId || "—"}</TableCell>
                            {isModuleEnabled("ipv6") && (
                              <>
                                <TableCell className="font-mono text-xs hidden lg:table-cell">{session.framedIpv6 || "—"}</TableCell>
                                <TableCell className="font-mono text-xs hidden xl:table-cell">{session.delegatedIpv6Prefix || "—"}</TableCell>
                              </>
                            )}
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="h-7 text-red-600 text-xs" onClick={() => disconnectMutation.mutate(session.sessionId)}>
                                <Unplug className="h-3 w-3 mr-1" />Disconnect
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {totalSessionPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-xs text-muted-foreground">Showing {(sessionPage - 1) * PAGE_SIZE + 1}–{Math.min(sessionPage * PAGE_SIZE, allSessions.length)} of {allSessions.length}</p>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={sessionPage <= 1} onClick={() => setSessionPage((p) => p - 1)}>Prev</Button>
                      {Array.from({ length: totalSessionPages }, (_, i) => i + 1).map((p) => (
                        <Button key={p} variant={p === sessionPage ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs" onClick={() => setSessionPage(p)}>{p}</Button>
                      ))}
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={sessionPage >= totalSessionPages} onClick={() => setSessionPage((p) => p + 1)}>Next</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Accounting Tab ─── */}
        <TabsContent value="accounting" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />Accounting Logs
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Username..." value={acctSearch} onChange={(e) => setAcctSearch(e.target.value)} className="pl-8 h-8 text-xs w-40" />
                  </div>
                  <Input type="date" value={acctStartDate} onChange={(e) => setAcctStartDate(e.target.value)} className="h-8 text-xs w-36" />
                  <Input type="date" value={acctEndDate} onChange={(e) => setAcctEndDate(e.target.value)} className="h-8 text-xs w-36" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {acctLoading ? (
                <Skeleton className="skeleton-wave h-64 rounded-lg" />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Username</TableHead>
                          <TableHead className="text-xs">Session ID</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Start Time</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Duration</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">Download</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">Upload</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">NAS IP</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">Terminate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(acctData?.items || []).length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No accounting logs found</TableCell></TableRow>
                        ) : (
                          (acctData?.items || []).map((log, idx) => (
                            <TableRow key={log.id} className={`hover:bg-muted/50 transition-colors duration-150 ${idx % 2 === 0 ? "bg-muted/20" : ""}`}>
                              <TableCell className="font-mono text-xs font-medium">{log.username || "—"}</TableCell>
                              <TableCell className="font-mono text-[10px]">{log.sessionId || "—"}</TableCell>
                              <TableCell className="text-xs hidden md:table-cell">{log.acctStartTime ? new Date(log.acctStartTime).toLocaleString() : "—"}</TableCell>
                              <TableCell className="text-xs hidden md:table-cell tabular-nums">{formatDuration(log.sessionTime)}</TableCell>
                              <TableCell className="text-xs hidden lg:table-cell tabular-nums text-green-600">{formatOctets(log.outputOctets)}</TableCell>
                              <TableCell className="text-xs hidden lg:table-cell tabular-nums text-teal-600">{formatOctets(log.inputOctets)}</TableCell>
                              <TableCell className="font-mono text-xs hidden lg:table-cell">{log.nasIp || "—"}</TableCell>
                              <TableCell className="text-xs hidden lg:table-cell">
                                {log.terminateCause ? (
                                  <Badge variant={log.terminateCause.toLowerCase().includes("user") ? "secondary" : "outline"} className="text-[10px]">{log.terminateCause}</Badge>
                                ) : "—"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {(acctData?.totalPages || 0) > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <p className="text-xs text-muted-foreground">Showing {acctData?.page} of {acctData?.totalPages} ({acctData?.total} total)</p>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={acctPage <= 1} onClick={() => setAcctPage((p) => p - 1)}>Prev</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={acctPage >= (acctData?.totalPages || 1)} onClick={() => setAcctPage((p) => p + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Captive Portal Tab ─── */}
        <TabsContent value="captive" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4" />Captive Portal Configuration
                <Badge variant={captivePortal.enabled ? "default" : "secondary"} className="text-[10px]">
                  {captivePortal.enabled ? "Active" : "Disabled"}
                </Badge>
              </CardTitle>
              <CardDescription>Configure the captive portal for guest and public network access.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between md:col-span-2">
                  <div>
                    <Label>Enable Captive Portal</Label>
                    <p className="text-xs text-muted-foreground">Redirect unauthenticated users to a login page</p>
                  </div>
                  <Switch
                    checked={captivePortal.enabled}
                    onCheckedChange={(v) => setCpState({ ...captivePortal, enabled: v })}
                  />
                </div>
                <div>
                  <Label>Portal URL</Label>
                  <Input
                    value={captivePortal.redirectUrl}
                    onChange={(e) => setCpState({ ...captivePortal, redirectUrl: e.target.value })}
                    placeholder="https://portal.example.com"
                    disabled={!captivePortal.enabled}
                  />
                </div>
                <div>
                  <Label>Portal Name</Label>
                  <Input
                    value={captivePortal.portalName}
                    onChange={(e) => setCpState({ ...captivePortal, portalName: e.target.value })}
                    placeholder="My ISP Portal"
                    disabled={!captivePortal.enabled}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Welcome Message</Label>
                  <Textarea
                    value={captivePortal.welcomeMessage}
                    onChange={(e) => setCpState({ ...captivePortal, welcomeMessage: e.target.value })}
                    placeholder="Welcome to our network. Please log in to continue."
                    rows={2}
                    disabled={!captivePortal.enabled}
                  />
                </div>
                <div>
                  <Label>Session Timeout (minutes)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={Math.round((captivePortal.sessionTimeout || 0) / 60) || ""}
                    onChange={(e) => setCpState({ ...captivePortal, sessionTimeout: (parseInt(e.target.value) || 0) * 60 })}
                    placeholder="60"
                    disabled={!captivePortal.enabled}
                  />
                </div>
                <div>
                  <Label>Bandwidth Limit (Mbps)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={parseInt(captivePortal.bandwidthLimit) || ""}
                    onChange={(e) => setCpState({ ...captivePortal, bandwidthLimit: e.target.value })}
                    placeholder="10"
                    disabled={!captivePortal.enabled}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Allowed Hosts (one per line)</Label>
                  <Textarea
                    value={captivePortal.allowedHosts}
                    onChange={(e) => setCpState({ ...captivePortal, allowedHosts: e.target.value })}
                    placeholder={"example.com\ngoogle.com\n*.isp.com"}
                    rows={4}
                    disabled={!captivePortal.enabled}
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Hosts that bypass the captive portal. One per line.</p>
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={settingsSaveMutation.isPending}
                  onClick={() => settingsSaveMutation.mutate({ captivePortal: cpState })}
                >
                  {settingsSaveMutation.isPending ? "Saving..." : "Save Portal Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── FreeRADIUS Live Tab ─── */}
        <TabsContent value="freeradius" className="space-y-4">
          <FreeRadiusLivePanel />
        </TabsContent>
      </Tabs>

      {/* ─── Add RADIUS User Dialog ─── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Provision RADIUS User</DialogTitle>
            <DialogDescription>Select a subscriber to enable RADIUS authentication. Service credentials and speed profile are inherited from the subscriber&apos;s plan.</DialogDescription>
          </DialogHeader>
          {formErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              {formErrors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>)}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Subscriber *</Label>
              <div className="relative mt-1">
                <Input
                  value={form.subscriberId ? ((subscriberList?.subscribers || subscriberList?.items || [])?.find(s => s.id === form.subscriberId)?.name || form.subscriberId) : subscriberSearch || form.subscriberId}
                  onChange={(e) => { setSubscriberSearch(e.target.value); setSubscriberDropdownOpen(true); if (!e.target.value) setForm({ ...form, subscriberId: "" }); }}
                  onFocus={() => { if (subscriberSearch.length > 0) setSubscriberDropdownOpen(true); }}
                  placeholder="Search subscriber by name or code..."
                />
                {subscriberDropdownOpen && (subscriberList?.subscribers || subscriberList?.items) && (subscriberList?.subscribers || subscriberList?.items)!.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {(subscriberList?.subscribers || subscriberList?.items || []).map((s) => (
                      <button key={s.id} type="button" className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors" onClick={() => {
                        setForm({ ...form, subscriberId: s.id });
                        setSubscriberSearch(s.name);
                        setSubscriberDropdownOpen(false);
                      }}>
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground ml-2 font-mono text-xs">{s.code}</span>
                        {s.serviceUsername && <span className="text-muted-foreground ml-2 font-mono text-[10px]">@{s.serviceUsername}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Auto-filled from subscriber selection */}
            <div>
              <Label>Service Username</Label>
              <Input value={form.subscriberId ? (subscriberList?.subscribers || subscriberList?.items || []).find(s => s.id === form.subscriberId)?.serviceUsername || "— (auto-filled)" : ""} readOnly disabled placeholder="Auto-filled from subscriber" />
            </div>
            <div>
              <Label>Service Password</Label>
              <Input type="password" value={form.servicePassword} onChange={(e) => setForm({ ...form, servicePassword: e.target.value })} placeholder={form.subscriberId ? "Leave blank to use existing" : "Required"} />
              {form.servicePassword && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${getPasswordStrength(form.servicePassword, passwordPolicy).color}`} style={{ width: `${(getPasswordStrength(form.servicePassword, passwordPolicy).score / 7) * 100}%` }} /></div>
                    <span className="text-[10px] text-muted-foreground w-12">{getPasswordStrength(form.servicePassword, passwordPolicy).label}</span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <Label>RADIUS Group (Override)</Label>
              <Select value={form.radiusGroupId || "none"} onValueChange={(v) => setForm({ ...form, radiusGroupId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Use plan default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use plan default</SelectItem>
                  {(groupsData?.groups || []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({formatKbps(g.speedLimitDown)} / {formatKbps(g.speedLimitUp)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Session Timeout (sec)</Label>
              <Input type="number" min="0" value={form.sessionTimeout || ""} onChange={(e) => setForm({ ...form, sessionTimeout: parseInt(e.target.value) || 0 })} placeholder="0 = No limit" />
            </div>
            <div>
              <Label>Idle Timeout (sec)</Label>
              <Input type="number" min="0" value={form.idleTimeout || ""} onChange={(e) => setForm({ ...form, idleTimeout: parseInt(e.target.value) || 0 })} placeholder="0 = No limit" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createMutation.isPending} onClick={() => { if (validateForm(form)) createMutation.mutate(form); }}>
              {createMutation.isPending ? "Provisioning..." : "Provision User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit RADIUS User Dialog ─── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit RADIUS User</DialogTitle>
            <DialogDescription>Update RADIUS settings for this subscriber.</DialogDescription>
          </DialogHeader>
          {formErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              {formErrors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>)}
            </div>
          )}
          {/* Subscriber info summary */}
          {(() => {
            const user = usersData?.users?.find(u => u.id === selectedId);
            const sub = user?.subscriber;
            return sub ? (
              <div className="rounded-lg bg-muted/50 border p-3 space-y-1">
                <p className="text-sm font-medium">{sub.name} <span className="text-muted-foreground font-mono text-xs ml-1">{sub.code}</span></p>
                <p className="text-xs text-muted-foreground">Service Username: <span className="font-mono text-foreground">{sub.serviceUsername}</span></p>
                {sub.plan && (
                  <p className="text-xs text-muted-foreground">Plan: <span className="text-foreground">{sub.plan.name}</span> <span className="tabular-nums">(↓{formatKbps(sub.plan.downloadSpeed)} / ↑{formatKbps(sub.plan.uploadSpeed)})</span></p>
                )}
              </div>
            ) : null;
          })()}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>New Service Password (leave blank to keep current)</Label>
              <Input type="password" value={form.servicePassword} onChange={(e) => setForm({ ...form, servicePassword: e.target.value })} />
              {form.servicePassword && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${getPasswordStrength(form.servicePassword, passwordPolicy).color}`} style={{ width: `${(getPasswordStrength(form.servicePassword, passwordPolicy).score / 7) * 100}%` }} /></div>
                  <span className="text-[10px] text-muted-foreground w-12">{getPasswordStrength(form.servicePassword, passwordPolicy).label}</span>
                </div>
              )}
            </div>
            <div>
              <Label>RADIUS Group (Override)</Label>
              <Select value={form.radiusGroupId || "none"} onValueChange={(v) => setForm({ ...form, radiusGroupId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Use plan default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use plan default</SelectItem>
                  {(groupsData?.groups || []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({formatKbps(g.speedLimitDown)} / {formatKbps(g.speedLimitUp)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:col-span-2">
              <div>
                <Label>Session Timeout (sec)</Label>
                <Input type="number" min="0" value={form.sessionTimeout || ""} onChange={(e) => setForm({ ...form, sessionTimeout: parseInt(e.target.value) || 0 })} placeholder="0 = No limit" />
              </div>
              <div>
                <Label>Idle Timeout (sec)</Label>
                <Input type="number" min="0" value={form.idleTimeout || ""} onChange={(e) => setForm({ ...form, idleTimeout: parseInt(e.target.value) || 0 })} placeholder="0 = No limit" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={updateMutation.isPending} onClick={() => { if (validateForm(form, true) && selectedId) updateMutation.mutate({ id: selectedId, data: form }); }}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Group Add Dialog ─── */}
      <Dialog open={groupAddOpen} onOpenChange={setGroupAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add RADIUS Group</DialogTitle><DialogDescription>Create a new RADIUS group. Link it to Plans to auto-assign speed profiles.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            <div><Label>Group Name *</Label><Input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="50Mbps-FTTH" /></div>
            <div><Label>Description</Label><Textarea value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} placeholder="Optional description" rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Down Speed (Kbps)</Label><Input type="number" min="0" value={groupForm.speedLimitDown || ""} onChange={(e) => setGroupForm({ ...groupForm, speedLimitDown: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Up Speed (Kbps)</Label><Input type="number" min="0" value={groupForm.speedLimitUp || ""} onChange={(e) => setGroupForm({ ...groupForm, speedLimitUp: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data Limit (MB)</Label><Input type="number" min="0" value={groupForm.dataLimit || ""} onChange={(e) => setGroupForm({ ...groupForm, dataLimit: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Priority</Label><Input type="number" min="0" value={groupForm.priority || ""} onChange={(e) => setGroupForm({ ...groupForm, priority: parseInt(e.target.value) || 0 })} /></div>
            </div>
            {isModuleEnabled("ipv6") && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Globe className="h-3.5 w-3.5 text-cyan-600" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">IPv6 RADIUS Attributes</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Framed-IPv6-Pool</Label>
                    <Input value={groupForm.framedIpv6Pool} onChange={(e) => setGroupForm({ ...groupForm, framedIpv6Pool: e.target.value })} placeholder="2001:db8:100::/64" className="font-mono text-xs" />
                    <p className="text-[10px] text-muted-foreground mt-1">RADIUS attribute 100 — DHCPv6 address pool for subscribers</p>
                  </div>
                  <div>
                    <Label className="text-xs">Delegated-IPv6-Prefix-Pool</Label>
                    <Input value={groupForm.delegatedIpv6PrefixPool} onChange={(e) => setGroupForm({ ...groupForm, delegatedIpv6PrefixPool: e.target.value })} placeholder="2001:db8::/48" className="font-mono text-xs" />
                    <p className="text-[10px] text-muted-foreground mt-1">RADIUS attribute 123 — IA_PD prefix delegation pool</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupAddOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={groupCreateMutation.isPending || !groupForm.name.trim()} onClick={() => groupCreateMutation.mutate(groupForm)}>
              {groupCreateMutation.isPending ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Group Edit Dialog ─── */}
      <Dialog open={groupEditOpen} onOpenChange={setGroupEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Group</DialogTitle><DialogDescription>Update RADIUS group settings. Changes affect all linked Plans and Subscribers.</DialogDescription></DialogHeader>
          {/* Show linked plans info */}
          {(() => {
            const group = groupsData?.groups?.find(g => g.id === selectedGroupId);
            if (group && group.plans && group.plans.length > 0) {
              return (
                <div className="rounded-lg bg-muted/50 border p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Linked Plans ({group.plans.length})</p>
                  <div className="space-y-0.5 max-h-24 overflow-y-auto">
                    {group.plans.map((plan) => (
                      <div key={plan.id} className="flex items-center justify-between text-xs">
                        <span className="font-medium">{plan.name}</span>
                        <span className="text-muted-foreground tabular-nums">↓{formatKbps(plan.downloadSpeed)} / ↑{formatKbps(plan.uploadSpeed)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}
          <div className="grid grid-cols-1 gap-4">
            <div><Label>Group Name *</Label><Input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Down Speed (Kbps)</Label><Input type="number" min="0" value={groupForm.speedLimitDown || ""} onChange={(e) => setGroupForm({ ...groupForm, speedLimitDown: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Up Speed (Kbps)</Label><Input type="number" min="0" value={groupForm.speedLimitUp || ""} onChange={(e) => setGroupForm({ ...groupForm, speedLimitUp: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data Limit (MB)</Label><Input type="number" min="0" value={groupForm.dataLimit || ""} onChange={(e) => setGroupForm({ ...groupForm, dataLimit: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Priority</Label><Input type="number" min="0" value={groupForm.priority || ""} onChange={(e) => setGroupForm({ ...groupForm, priority: parseInt(e.target.value) || 0 })} /></div>
            </div>
            {isModuleEnabled("ipv6") && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Globe className="h-3.5 w-3.5 text-cyan-600" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">IPv6 RADIUS Attributes</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Framed-IPv6-Pool</Label>
                    <Input value={groupForm.framedIpv6Pool} onChange={(e) => setGroupForm({ ...groupForm, framedIpv6Pool: e.target.value })} placeholder="2001:db8:100::/64" className="font-mono text-xs" />
                    <p className="text-[10px] text-muted-foreground mt-1">RADIUS attribute 100 — DHCPv6 address pool for subscribers</p>
                  </div>
                  <div>
                    <Label className="text-xs">Delegated-IPv6-Prefix-Pool</Label>
                    <Input value={groupForm.delegatedIpv6PrefixPool} onChange={(e) => setGroupForm({ ...groupForm, delegatedIpv6PrefixPool: e.target.value })} placeholder="2001:db8::/48" className="font-mono text-xs" />
                    <p className="text-[10px] text-muted-foreground mt-1">RADIUS attribute 123 — IA_PD prefix delegation pool</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupEditOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={groupUpdateMutation.isPending} onClick={() => { if (selectedGroupId) groupUpdateMutation.mutate({ id: selectedGroupId, data: groupForm }); }}>
              {groupUpdateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Batch Import Dialog ─── */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setImportFile(null); setImportPreview([]); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import RADIUS Users from CSV</DialogTitle>
            <DialogDescription>Columns: subscriberCode, serviceUsername, servicePassword, group, sessionTimeout, idleTimeout</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-center border-2 border-dashed rounded-lg p-8 hover:border-primary/50 transition-colors relative">
              <div className="text-center">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to select CSV file</p>
                <input ref={importInputRef} type="file" accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleImportFileChange} />
              </div>
            </div>
            {importFile && (
              <div className="text-sm"><p className="font-medium">{importFile.name}</p><p className="text-xs text-muted-foreground">{(importFile.size / 1024).toFixed(1)} KB</p></div>
            )}
            {importPreview.length > 0 && (
              <div className="space-y-1"><p className="text-xs font-medium">Preview:</p><pre className="text-xs bg-muted rounded p-3 overflow-x-auto max-h-40 overflow-y-auto font-mono">{importPreview.join("\n")}</pre></div>
            )}
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">Required: subscriberCode, serviceUsername, servicePassword. Optional: group, sessionTimeout, idleTimeout. Service credentials will be updated on the subscriber record.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportFile(null); setImportPreview([]); }}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => importMutation.mutate()} disabled={!importFile || importMutation.isPending}>
              {importMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Settings Dialog (with tabs) ─── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>RADIUS Settings</DialogTitle>
          </DialogHeader>
          <Tabs value={settingsTab} onValueChange={setSettingsTab} className="space-y-4">
            <TabsList className="w-full">
              <TabsTrigger value="server" className="flex-1"><Shield className="h-3.5 w-3.5 mr-1" />Server</TabsTrigger>
              <TabsTrigger value="password" className="flex-1"><Lock className="h-3.5 w-3.5 mr-1" />Password</TabsTrigger>
              <TabsTrigger value="captive" className="flex-1"><Globe className="h-3.5 w-3.5 mr-1" />Captive</TabsTrigger>
            </TabsList>

            {/* Server Tab */}
            <TabsContent value="server" className="space-y-4">
              <div className="space-y-4">
                  <div><Label>Server IP Address</Label><Input value={serverSettings.radiusServerIp} onChange={(e) => setServerSettings({ ...serverSettings, radiusServerIp: e.target.value })} placeholder="127.0.0.1" /></div>
                  <div><Label>Authentication Port</Label><Input type="number" value={serverSettings.radiusServerPort} onChange={(e) => setServerSettings({ ...serverSettings, radiusServerPort: parseInt(e.target.value) || 1812 })} /></div>
                  <div><Label>Shared Secret</Label><Input type="password" value={serverSettings.radiusSecret} onChange={(e) => setServerSettings({ ...serverSettings, radiusSecret: e.target.value })} placeholder="Enter RADIUS secret" /></div>
                  <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button>
                    <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={settingsSaving} onClick={async () => {
                      setSettingsSaving(true);
                      try {
                        const data = await apiFetch("/api/settings/isp-profile", { method: "PUT", body: JSON.stringify({ radiusServerIp: serverSettings.radiusServerIp || null, radiusServerPort: serverSettings.radiusServerPort || null, radiusSecret: serverSettings.radiusSecret || null }) });
                        if (data.error) { toast.error(data.error); return; }
                        toast.success("Server settings saved");
                        queryClient.invalidateQueries({ queryKey: ["isp-settings-radius"] });
                      } catch { toast.error("Failed to save"); } finally { setSettingsSaving(false); }
                    }}>{settingsSaving ? "Saving..." : "Save"}</Button>
                  </DialogFooter>
              </div>
            </TabsContent>

            {/* Password Policy Tab */}
            <TabsContent value="password" className="space-y-4">
              {radiusSettingsLoading ? (
                <Skeleton className="skeleton-wave h-60 rounded-lg" />
              ) : (
                <div className="space-y-4">
                  <div><Label>Minimum Length</Label><Input type="number" min="4" max="128" value={passwordPolicy.minLength} onChange={(e) => setPpState({ ...passwordPolicy, minLength: parseInt(e.target.value) || 6 })} /></div>
                  <div className="flex items-center justify-between">
                    <Label>Require Uppercase</Label>
                    <Switch checked={passwordPolicy.requireUppercase} onCheckedChange={(v) => setPpState({ ...passwordPolicy, requireUppercase: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Require Lowercase</Label>
                    <Switch checked={passwordPolicy.requireLowercase} onCheckedChange={(v) => setPpState({ ...passwordPolicy, requireLowercase: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Require Numbers</Label>
                    <Switch checked={passwordPolicy.requireNumbers} onCheckedChange={(v) => setPpState({ ...passwordPolicy, requireNumbers: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Require Special Characters</Label>
                    <Switch checked={passwordPolicy.requireSpecial} onCheckedChange={(v) => setPpState({ ...passwordPolicy, requireSpecial: v })} />
                  </div>
                  <div><Label>Password Expiry (days, 0 = never)</Label><Input type="number" min="0" value={passwordPolicy.expiryDays} onChange={(e) => setPpState({ ...passwordPolicy, expiryDays: parseInt(e.target.value) || 0 })} /></div>
                  <div className="rounded-md bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 p-3">
                    <p className="text-xs text-teal-700 dark:text-teal-400"><CheckCircle2 className="inline h-3 w-3 mr-1" />Policy enforced on user provisioning and CSV import</p>
                  </div>
                  <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button>
                    <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={settingsSaveMutation.isPending} onClick={() => settingsSaveMutation.mutate({ passwordPolicy: ppState })}>
                      {settingsSaveMutation.isPending ? "Saving..." : "Save Policy"}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </TabsContent>

            {/* Captive Portal Tab */}
            <TabsContent value="captive" className="space-y-4">
              <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Enable Captive Portal</Label>
                    <Switch checked={captivePortal.enabled} onCheckedChange={(v) => setCpState({ ...captivePortal, enabled: v })} />
                  </div>
                  <div><Label>Portal Name</Label><Input value={captivePortal.portalName} onChange={(e) => setCpState({ ...captivePortal, portalName: e.target.value })} placeholder="My ISP Portal" /></div>
                  <div><Label>Welcome Message</Label><Textarea value={captivePortal.welcomeMessage} onChange={(e) => setCpState({ ...captivePortal, welcomeMessage: e.target.value })} placeholder="Welcome to our network" rows={2} /></div>
                  <div><Label>Login Method</Label>
                    <Select value={captivePortal.loginMethod} onValueChange={(v) => setCpState({ ...captivePortal, loginMethod: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RADIUS">RADIUS Authentication</SelectItem>
                        <SelectItem value="Voucher">Voucher Code</SelectItem>
                        <SelectItem value="None">No Authentication</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Session Timeout (sec)</Label><Input type="number" min="0" value={captivePortal.sessionTimeout} onChange={(e) => setCpState({ ...captivePortal, sessionTimeout: parseInt(e.target.value) || 0 })} /></div>
                    <div><Label>Bandwidth Limit</Label><Input value={captivePortal.bandwidthLimit} onChange={(e) => setCpState({ ...captivePortal, bandwidthLimit: e.target.value })} placeholder="e.g. 10Mbps" /></div>
                  </div>
                  <div><Label>Redirect URL</Label><Input value={captivePortal.redirectUrl} onChange={(e) => setCpState({ ...captivePortal, redirectUrl: e.target.value })} placeholder="https://example.com" /></div>
                  <div><Label>Terms of Service</Label><Textarea value={captivePortal.termsOfService} onChange={(e) => setCpState({ ...captivePortal, termsOfService: e.target.value })} placeholder="Terms and conditions..." rows={3} /></div>
                  <div><Label>Allowed Hosts</Label><Textarea value={captivePortal.allowedHosts} onChange={(e) => setCpState({ ...captivePortal, allowedHosts: e.target.value })} placeholder={"example.com\ngoogle.com"} rows={3} className="font-mono text-xs" /></div>

                  {/* Preview */}
                  {captivePortal.enabled && (
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Eye className="h-3 w-3" />Portal Preview</p>
                      <div className="bg-background rounded-md p-3 border">
                        <p className="text-sm font-semibold">{captivePortal.portalName || "Portal"}</p>
                        <p className="text-xs text-muted-foreground mt-1">{captivePortal.welcomeMessage || "Welcome"}</p>
                        <div className="flex gap-2 mt-3">
                          <div className="flex-1"><div className="h-8 bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">Username</div></div>
                          <div className="flex-1"><div className="h-8 bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">Password</div></div>
                          <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700 text-white">Login</Button>
                        </div>
                        {captivePortal.termsOfService && <p className="text-[10px] text-muted-foreground mt-2 italic">By logging in, you agree to the Terms of Service.</p>}
                      </div>
                    </div>
                  )}

                  <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button>
                    <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={settingsSaveMutation.isPending} onClick={() => settingsSaveMutation.mutate({ captivePortal: cpState })}>
                      {settingsSaveMutation.isPending ? "Saving..." : "Save Portal"}
                    </Button>
                  </DialogFooter>
                </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ─── Import Result Dialog ─── */}
      <Dialog open={!!importResult} onOpenChange={(o) => { if (!o) setImportResult(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {importResult && importResult.errorCount === 0 ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
              Import Result
            </DialogTitle>
            <DialogDescription>{importResult?.message}</DialogDescription>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{importResult.count}</p>
                  <p className="text-xs text-muted-foreground">Imported</p>
                </div>
                {importResult.errorCount > 0 && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{importResult.errorCount}</p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold">Error Details:</p>
                  <div className="max-h-40 overflow-y-auto rounded-md bg-muted p-3">
                    {importResult.errors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>)}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm ─── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove RADIUS User</AlertDialogTitle>
            <AlertDialogDescription>This will remove RADIUS provisioning for this subscriber. The subscriber record and session history will be preserved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (selectedId) deleteMutation.mutate(selectedId); }}>
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Group Delete Confirm ─── */}
      <AlertDialog open={groupDeleteOpen} onOpenChange={setGroupDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the group. Linked Plans and Subscribers will lose their RADIUS group assignment.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (selectedGroupId) groupDeleteMutation.mutate(selectedGroupId); }}>
              {groupDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
