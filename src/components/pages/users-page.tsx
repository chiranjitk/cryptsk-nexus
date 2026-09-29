"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Pencil, Trash2, Loader2, UserCheck, UserX, Shield, Search, Eye,
  ChevronLeft, ChevronRight, Filter, Download, Lock, KeyRound, LogOut,
  Monitor, Clock, Activity, CheckCircle2, XCircle, FileText, ChevronDown,
  UserCog, Upload, UploadCloud, X, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

// ─── Types ────────────────────────────────────────────────────

interface UserItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  avatarUrl?: string;
  twoFactorEnabled?: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface UserDetail extends Omit<UserItem, "avatarUrl"> {
  avatarUrl?: string;
  updatedAt?: string;
  twoFactorEnabled?: boolean;
  assignedAreaIds?: string;
  technician?: {
    id: string;
    name: string;
    phone: string;
    skills: string[];
    status: string;
    rating: number;
    totalResolved: number;
  } | null;
  agent?: {
    id: string;
    name: string;
    phone: string;
    dailyTarget: number;
    monthlyTarget: number;
    totalCollectedMonth: number;
  } | null;
}

interface ActivityEntry {
  id: string;
  action: string;
  entity: string;
  details: unknown;
  ipAddress: string;
  timestamp: string;
}

interface SessionEntry {
  id: string;
  ipAddress: string;
  device: string;
  browser: string;
  loginAt: string;
  status: string;
}

interface PermissionsMatrix {
  roles: string[];
  permissions: string[];
  matrix: Record<string, Record<string, boolean>>;
}

interface AreaItem {
  id: string;
  name: string;
  code: string;
  status: string;
}

interface CsvRow {
  name: string;
  email: string;
  role: string;
  phone: string;
  areaId: string;
  _rowNum: number;
  _error?: string;
}

// ─── Constants ────────────────────────────────────────────────

const ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR", "AGENT", "TECHNICIAN", "VIEWER"];
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin", ADMIN: "Admin", OPERATOR: "Operator",
  AGENT: "Agent", TECHNICIAN: "Technician", VIEWER: "Viewer", CUSTOMER: "Customer",
};
const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-700 border-red-200",
  ADMIN: "bg-purple-100 text-purple-700 border-purple-200",
  OPERATOR: "bg-teal-100 text-teal-700 border-teal-200",
  AGENT: "bg-green-100 text-green-700 border-green-200",
  TECHNICIAN: "bg-orange-100 text-orange-700 border-orange-200",
  VIEWER: "bg-gray-100 text-gray-600 border-gray-200",
};

const ROLE_AVATAR_BG: Record<string, string> = {
  SUPER_ADMIN: "bg-red-500",
  ADMIN: "bg-purple-500",
  OPERATOR: "bg-teal-500",
  AGENT: "bg-green-500",
  TECHNICIAN: "bg-orange-500",
  VIEWER: "bg-gray-500",
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  SUSPENDED: "bg-red-100 text-red-700 border-red-200",
  INACTIVE: "bg-gray-100 text-gray-600 border-gray-200",
  LOCKED: "bg-orange-100 text-orange-700 border-orange-200",
};

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "SUSPENDED", label: "Suspended" },
  { key: "INACTIVE", label: "Inactive" },
  { key: "LOCKED", label: "Locked" },
];

const PERMISSION_LABELS: Record<string, string> = {
  read: "Read", create: "Create", update: "Update", delete: "Delete",
  verify: "Verify", assign: "Assign", export: "Export", backup: "Backup",
};

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo}mo ago`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function humanizePermission(perm: string): string {
  const parts = perm.split(".");
  if (parts.length !== 2) return perm;
  const entity = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const action = PERMISSION_LABELS[parts[1]] || parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  return `${entity} ${action}`;
}

function safeJsonParse(str: string | undefined | null): string[] {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

const emptyForm = { name: "", email: "", phone: "", role: "OPERATOR" as string, password: "" };

// ─── Component ────────────────────────────────────────────────

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // RBAC permissions
  const userRole = user?.role || "VIEWER";
  const canImpersonate = userRole === "SUPER_ADMIN";
  const permissions = useMemo(() => ({
    create: ["SUPER_ADMIN", "ADMIN"].includes(userRole),
    update: ["SUPER_ADMIN", "ADMIN"].includes(userRole),
    delete: userRole === "SUPER_ADMIN",
    read: true,
  }), [userRole]);

  // State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formAreaIds, setFormAreaIds] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<"activate" | "suspend" | "delete" | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [terminateSessionsOpen, setTerminateSessionsOpen] = useState(false);

  // Feature 1: Impersonation
  const [impersonateTarget, setImpersonateTarget] = useState<UserItem | null>(null);
  const [impersonateConfirmOpen, setImpersonateConfirmOpen] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonateName, setImpersonateName] = useState("");

  // Feature 2: CSV Import
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvRaw, setCsvRaw] = useState("");
  const [csvParsedRows, setCsvParsedRows] = useState<CsvRow[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);

  // Feature 4: Self-Service Password Change
  const [selfPasswordOpen, setSelfPasswordOpen] = useState(false);
  const [selfCurrentPassword, setSelfCurrentPassword] = useState("");
  const [selfNewPassword, setSelfNewPassword] = useState("");
  const [selfConfirmPassword, setSelfConfirmPassword] = useState("");

  // Legacy: admin reset password (kept for backward compat)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const limit = 20;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Queries ──

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterRole !== "all") params.set("role", filterRole);
    if (filterStatus !== "all") params.set("status", filterStatus);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return params.toString();
  }, [search, filterRole, filterStatus, page]);

  const { data, isLoading } = useQuery<{
    items: UserItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    roleCounts: Record<string, number>;
    statusCounts: Record<string, number>;
  }>({
    queryKey: ["users", search, filterRole, filterStatus, page],
    queryFn: async () => {
      return apiFetch(`/api/users?${buildQueryParams()}`);
    },
  });

  const users = data?.items || [];
  const pagination = data?.pagination;
  const roleCounts = data?.roleCounts || {};
  const statusCounts = data?.statusCounts || {};

  const { data: detailUser, isLoading: detailLoading } = useQuery<UserDetail>({
    queryKey: ["user-detail", detailId],
    queryFn: async () => {
      return apiFetch(`/api/users/${detailId}`);
    },
    enabled: !!detailId,
  });

  const { data: activityData, isLoading: activityLoading } = useQuery<{
    userId: string;
    userName: string;
    entries: ActivityEntry[];
  }>({
    queryKey: ["user-activity", detailId],
    queryFn: async () => {
      return apiFetch(`/api/users/${detailId}/activity`);
    },
    enabled: !!detailId,
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{
    userId: string;
    userName: string;
    sessions: SessionEntry[];
  }>({
    queryKey: ["user-sessions", detailId],
    queryFn: async () => {
      return apiFetch(`/api/users/${detailId}/sessions`);
    },
    enabled: !!detailId,
  });

  const { data: permsData, isLoading: permsLoading } = useQuery<PermissionsMatrix>({
    queryKey: ["users-permissions"],
    queryFn: async () => {
      return apiFetch("/api/users/permissions");
    },
    enabled: permissionsOpen,
  });

  // Areas query for area assignment
  const { data: areasData } = useQuery<{ items: AreaItem[] }>({
    queryKey: ["areas-list"],
    queryFn: async () => {
      return apiFetch("/api/areas?limit=200");
    },
  });

  const areas = areasData?.items || [];

  // Check impersonation state on mount
  React.useEffect(() => {
    const impName = document.cookie
      .split("; ")
      .find((row) => row.startsWith("impersonating_name="))
      ?.split("=")[1];
    if (impName) {
      setIsImpersonating(true);
      setImpersonateName(decodeURIComponent(impName));
    }
  }, []);

  // ── Mutations ──

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return apiFetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: () => { toast.success("User created successfully"); setDialogOpen(false); setForm(emptyForm); setEditingId(null); setFormAreaIds([]); queryClient.invalidateQueries({ queryKey: ["users"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to create user"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: Record<string, unknown> & { id: string }) => {
      return apiFetch(`/api/users/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: () => { toast.success("User updated successfully"); setDialogOpen(false); setForm(emptyForm); setEditingId(null); setFormAreaIds([]); queryClient.invalidateQueries({ queryKey: ["users"] }); queryClient.invalidateQueries({ queryKey: ["user-detail"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to update user"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/users/${id}`, { method: "DELETE" });
    },
    onSuccess: () => { toast.success("User deleted"); setDeleteId(null); setDetailId(null); queryClient.invalidateQueries({ queryKey: ["users"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to delete user"),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiFetch(`/api/users/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    },
    onSuccess: () => { toast.success("User status updated"); queryClient.invalidateQueries({ queryKey: ["users"] }); queryClient.invalidateQueries({ queryKey: ["user-detail"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to update status"),
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ action, userIds }: { action: "activate" | "suspend"; userIds: string[] }) => {
      return apiFetch("/api/users/bulk", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userIds: [...userIds] }) });
    },
    onSuccess: (_, vars) => { toast.success(`${vars.userIds.length} user(s) ${vars.action}d successfully`); setSelectedIds(new Set()); setBulkConfirm(null); queryClient.invalidateQueries({ queryKey: ["users"] }); },
    onError: (err: Error) => toast.error(err.message || "Bulk operation failed"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      return apiFetch("/api/users/bulk", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", userIds: [...userIds] }) });
    },
    onSuccess: (_, ids) => { toast.success(`${ids.length} user(s) deleted`); setSelectedIds(new Set()); setBulkConfirm(null); queryClient.invalidateQueries({ queryKey: ["users"] }); },
    onError: (err: Error) => toast.error(err.message || "Bulk delete failed"),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      return apiFetch(`/api/users/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      setChangePasswordOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ["user-detail"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to change password"),
  });

  const terminateSessionsMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/users/${id}/sessions`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("All sessions terminated");
      setTerminateSessionsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["user-sessions"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to terminate sessions"),
  });

  // Feature 1: Impersonate mutation
  const impersonateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/users/${id}/impersonate`, { method: "POST" });
    },
    onSuccess: (data) => {
      toast.success(`Now impersonating ${impersonateTarget?.name}`);
      setImpersonateConfirmOpen(false);
      setImpersonateTarget(null);
      // Reload the page to pick up new session
      setTimeout(() => { window.location.reload(); }, 500);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to impersonate user"),
  });

  // Feature 2: Bulk import mutation
  const bulkImportMutation = useMutation({
    mutationFn: async (csvContent: string) => {
      return apiFetch("/api/users/bulk-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: csvContent }) });
    },
    onSuccess: (result) => {
      toast.success(result.message || `Imported ${result.imported} user(s)`);
      setCsvDialogOpen(false);
      setCsvRaw("");
      setCsvParsedRows([]);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to import users"),
  });

  // Feature 4: Self-service password change
  const selfPasswordMutation = useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      return apiFetch("/api/users/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      setSelfPasswordOpen(false);
      setSelfCurrentPassword("");
      setSelfNewPassword("");
      setSelfConfirmPassword("");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to change password"),
  });

  // ── Handlers ──

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Name is required."); return; }
    if (!form.email.trim()) { toast.error("Email is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error("Invalid email format."); return; }
    if (form.phone && !/^[+]?[\d\s-]{7,15}$/.test(form.phone)) { toast.error("Invalid phone number."); return; }
    if (!editingId && !form.password) { toast.error("Password is required for new users."); return; }
    if (form.password && form.password.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    if (editingId) {
      const body: Record<string, unknown> = { id: editingId, name: form.name, email: form.email, phone: form.phone, role: form.role, assignedAreaIds: formAreaIds };
      if (form.password) body.password = form.password;
      updateMutation.mutate(body as any);
    } else {
      createMutation.mutate({ ...form, assignedAreaIds: formAreaIds });
    }
  };

  const handleChangePassword = () => {
    if (!newPassword) { toast.error("Password is required."); return; }
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match."); return; }
    if (detailId) changePasswordMutation.mutate({ id: detailId, password: newPassword });
  };

  const handleSelfPasswordChange = () => {
    if (!selfCurrentPassword) { toast.error("Current password is required."); return; }
    if (!selfNewPassword) { toast.error("New password is required."); return; }
    if (selfNewPassword.length < 6) { toast.error("New password must be at least 6 characters."); return; }
    if (selfNewPassword !== selfConfirmPassword) { toast.error("New passwords do not match."); return; }
    selfPasswordMutation.mutate({ currentPassword: selfCurrentPassword, newPassword: selfNewPassword });
  };

  const openEdit = (u: UserItem) => {
    setForm({ name: u.name, email: u.email, phone: u.phone, role: u.role, password: "" });
    setEditingId(u.id);
    setDialogOpen(true);
  };

  const openCreate = () => { setForm(emptyForm); setEditingId(null); setFormAreaIds([]); setDialogOpen(true); };

  const handleFilterChange = (setter: (v: string) => void) => (val: string) => { setter(val); setPage(1); };
  const handleSearchChange = (val: string) => { setSearch(val); setPage(1); };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === users.length && users.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map(u => u.id)));
    }
  };

  const toggleArea = (areaId: string) => {
    setFormAreaIds(prev => {
      if (prev.includes(areaId)) return prev.filter(a => a !== areaId);
      return [...prev, areaId];
    });
  };

  const handleCsvExport = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterRole !== "all") params.set("role", filterRole);
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await fetch(`/api/users/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users_export.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported successfully");
    } catch {
      toast.error("Failed to export CSV");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvRaw(text);
      parseCSVContent(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const parseCSVContent = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length < 2) {
      toast.error("CSV must have a header row and at least one data row");
      setCsvParsedRows([]);
      return;
    }
    const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    const rows: CsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0 || (values.length === 1 && !values[0])) continue;
      const nameIdx = headers.indexOf("name");
      const emailIdx = headers.indexOf("email");
      const roleIdx = headers.indexOf("role");
      const phoneIdx = headers.indexOf("phone");
      const areaIdIdx = headers.indexOf("areaid");
      const row: CsvRow = {
        name: nameIdx >= 0 ? values[nameIdx] || "" : "",
        email: emailIdx >= 0 ? values[emailIdx] || "" : "",
        role: roleIdx >= 0 ? values[roleIdx] || "OPERATOR" : "OPERATOR",
        phone: phoneIdx >= 0 ? values[phoneIdx] || "" : "",
        areaId: areaIdIdx >= 0 ? values[areaIdIdx] || "" : "",
        _rowNum: i + 1,
      };
      if (!row.name) row._error = "Name is empty";
      else if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) row._error = "Invalid email";
      rows.push(row);
    }
    setCsvParsedRows(rows);
  };

  const handleStopImpersonating = () => {
    document.cookie = "impersonating_from=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "impersonating_name=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "cryptsk_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/api/auth/logout";
  };

  const getActivityIcon = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes("create") || lower.includes("add")) return <Plus className="h-3.5 w-3.5 text-green-600" />;
    if (lower.includes("update") || lower.includes("edit") || lower.includes("change")) return <Pencil className="h-3.5 w-3.5 text-teal-600" />;
    if (lower.includes("delete") || lower.includes("remove")) return <Trash2 className="h-3.5 w-3.5 text-red-600" />;
    if (lower.includes("login") || lower.includes("auth")) return <LogOut className="h-3.5 w-3.5 text-purple-600" />;
    return <Activity className="h-3.5 w-3.5 text-gray-500" />;
  };

  const getActivityColor = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes("create") || lower.includes("add")) return "bg-green-100 text-green-700 border-green-200";
    if (lower.includes("update") || lower.includes("edit") || lower.includes("change")) return "bg-teal-100 text-teal-700 border-teal-200";
    if (lower.includes("delete") || lower.includes("remove")) return "bg-red-100 text-red-700 border-red-200";
    if (lower.includes("login") || lower.includes("auth")) return "bg-purple-100 text-purple-700 border-purple-200";
    return "bg-gray-100 text-gray-600 border-gray-200";
  };

  const totalUsers = Object.values(roleCounts).reduce((a, b) => a + b, 0);

  const detailAreaIds = safeJsonParse(detailUser?.assignedAreaIds);
  const detailAreaNames = detailAreaIds
    .map((id) => areas.find((a) => a.id === id))
    .filter(Boolean) as AreaItem[];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── Impersonation Banner ── */}
      {isImpersonating && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-amber-800">
            <UserCog className="h-4 w-4" />
            <span className="text-sm font-medium">
              You are impersonating <strong>{impersonateName || "another user"}</strong>
            </span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100" onClick={handleStopImpersonating}>
            <LogOut className="h-3.5 w-3.5 mr-1" /> Stop Impersonating
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage team members and their access roles.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search by name, email, or phone..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9 h-9 w-full sm:w-56" />
          </div>
          {permissions.create && (
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" /> Add User
            </Button>
          )}
          {permissions.create && (
            <Button variant="outline" className="h-9 text-xs gap-1.5" onClick={() => { setCsvRaw(""); setCsvParsedRows([]); setCsvDialogOpen(true); }}>
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </Button>
          )}
          <Button variant="outline" className="h-9 text-xs" onClick={() => { setSelfCurrentPassword(""); setSelfNewPassword(""); setSelfConfirmPassword(""); setSelfPasswordOpen(true); }}>
            <Lock className="h-3.5 w-3.5 mr-1" /> Change Password
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="border shadow-sm"><CardContent className="p-3 text-center"><Users className="h-4 w-4 text-red-600 mx-auto mb-1" /><p className="text-xl font-bold">{totalUsers}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
        {ROLES.map((role) => (
          <Card key={role} className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleFilterChange(setFilterRole)(filterRole === role ? "all" : role)}>
            <CardContent className="p-3 text-center">
              <Shield className={`h-4 w-4 mx-auto mb-1 ${ROLE_STYLES[role]?.split(" ").pop() || "text-gray-600"}`} />
              <p className="text-xl font-bold">{roleCounts[role] || 0}</p>
              <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[role]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-red-600" />
              Team Members ({pagination?.total || 0})
            </CardTitle>
            <div className="flex gap-2 flex-wrap items-center">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleCsvExport}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setPermissionsOpen(true)}>
                <Shield className="h-3.5 w-3.5" /> Permissions Matrix
              </Button>
              <Select value={filterRole} onValueChange={handleFilterChange(setFilterRole)}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex rounded-lg border overflow-hidden">
                {STATUS_TABS.map((tab) => (
                  <Button key={tab.key} size="sm" variant={filterStatus === tab.key ? "default" : "ghost"} className={filterStatus === tab.key ? "bg-red-600 hover:bg-red-700 text-white rounded-none h-8 text-xs px-2.5" : "rounded-none h-8 text-xs px-2.5"} onClick={() => handleFilterChange(setFilterStatus)(tab.key)}>
                    {tab.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-10 pl-4">
                      <Checkbox checked={users.length > 0 && selectedIds.size === users.length} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                    </TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Email</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Phone</TableHead>
                    <TableHead className="text-xs">Role</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Status</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">2FA</TableHead>
                    <TableHead className="text-xs hidden xl:table-cell">Last Login</TableHead>
                    <TableHead className="text-xs text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">{search || filterRole !== "all" || filterStatus !== "all" ? "No users match your filters." : "No users found."}</TableCell></TableRow>
                  ) : (
                    users.map((u) => (
                      <TableRow key={u.id} className={`${selectedIds.has(u.id) ? "bg-muted/50" : ""} hover:bg-muted/50 transition-colors duration-150`}>
                        <TableCell className="pl-4">
                          <Checkbox checked={selectedIds.has(u.id)} onCheckedChange={() => toggleSelect(u.id)} aria-label={`Select ${u.name}`} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${ROLE_AVATAR_BG[u.role] || "bg-gray-500"}`}>{getInitials(u.name)}</div>
                            <span className="text-sm font-medium">{u.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{u.email}</TableCell>
                        <TableCell className="text-sm hidden lg:table-cell">{u.phone || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] gap-1 ${ROLE_STYLES[u.role] || ""}`}><Shield className="h-2.5 w-2.5" />{ROLE_LABELS[u.role] || u.role}</Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell"><Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[u.status] || ""}`}>{u.status}</Badge></TableCell>
                        <TableCell className="hidden lg:table-cell">{u.twoFactorEnabled ? <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />On</Badge> : <span className="text-[10px] text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end pr-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View" onClick={() => setDetailId(u.id)}><Eye className="h-3.5 w-3.5" /></Button>
                            {permissions.update && (
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                            )}
                            {canImpersonate && u.id !== user?.id && (
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-50" title="Impersonate" onClick={() => { setImpersonateTarget(u); setImpersonateConfirmOpen(true); }}><UserCog className="h-3.5 w-3.5" /></Button>
                            )}
                            {permissions.update && (
                              u.status === "ACTIVE" ? (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50" title="Suspend" disabled={toggleStatusMutation.isPending} onClick={() => toggleStatusMutation.mutate({ id: u.id, status: "SUSPENDED" })}><UserX className="h-3.5 w-3.5" /></Button>
                              ) : (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" title="Activate" disabled={toggleStatusMutation.isPending} onClick={() => toggleStatusMutation.mutate({ id: u.id, status: "ACTIVE" })}><UserCheck className="h-3.5 w-3.5" /></Button>
                              )
                            )}
                            {permissions.delete && (
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" title="Delete" onClick={() => setDeleteId(u.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={pagination.page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (pagination.totalPages <= 5) pageNum = i + 1;
                      else if (pagination.page <= 3) pageNum = i + 1;
                      else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                      else pageNum = pagination.page - 2 + i;
                      return (
                        <Button key={pageNum} size="sm" variant={pagination.page === pageNum ? "default" : "outline"} className={pagination.page === pageNum ? "bg-red-600 hover:bg-red-700 text-white h-8 w-8 p-0" : "h-8 w-8 p-0"} onClick={() => setPage(pageNum)}>{pageNum}</Button>
                      );
                    })}
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Floating Bulk Action Bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border shadow-lg rounded-lg px-4 py-3">
          <span className="text-sm font-medium">{selectedIds.size} user{selectedIds.size > 1 ? "s" : ""} selected</span>
          <Separator orientation="vertical" className="h-5" />
          {permissions.update && (<>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={bulkMutation.isPending} onClick={() => setBulkConfirm("activate")}><UserCheck className="h-3.5 w-3.5" /> Activate</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={bulkMutation.isPending} onClick={() => setBulkConfirm("suspend")}><UserX className="h-3.5 w-3.5" /> Suspend</Button>
          </>)}
          {permissions.delete && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-red-600 hover:text-red-700" disabled={bulkDeleteMutation.isPending} onClick={() => setBulkConfirm("delete")}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
        </div>
      )}

      {/* ── Create/Edit Dialog with Area Assignment ── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setFormAreaIds([]); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">{editingId ? "Edit" : "Add"} User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* Feature 3: Area Assignment */}
            <div className="space-y-1.5">
              <Label className="text-xs">Assigned Areas</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-auto min-h-9 justify-start text-left font-normal">
                    {formAreaIds.length === 0 ? (
                      <span className="text-muted-foreground text-xs">Select areas...</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {formAreaIds.slice(0, 3).map((id) => {
                          const area = areas.find((a) => a.id === id);
                          return <Badge key={id} variant="secondary" className="text-[10px]">{area?.name || id}</Badge>;
                        })}
                        {formAreaIds.length > 3 && <Badge variant="secondary" className="text-[10px]">+{formAreaIds.length - 3} more</Badge>}
                      </div>
                    )}
                    <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 max-h-60 overflow-y-auto p-2" align="start">
                  <div className="space-y-1">
                    {areas.length === 0 && <p className="text-xs text-muted-foreground p-2">No areas found</p>}
                    {areas.filter((a) => a.status === "ACTIVE").map((area) => (
                      <label key={area.id} className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                        <Checkbox checked={formAreaIds.includes(area.id)} onCheckedChange={() => toggleArea(area.id)} />
                        <span className="text-xs">{area.name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{editingId ? "New Password (leave blank to keep current)" : "Password *"}</Label>
              <Input type="password" placeholder={editingId ? "Leave blank to keep current" : "Min 6 characters"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createMutation.isPending || updateMutation.isPending} onClick={handleSubmit}>
                {(createMutation.isPending || updateMutation.isPending) ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : editingId ? "Update" : "Create User"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Enhanced Detail Dialog with Tabs ── */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">User Details</DialogTitle></DialogHeader>
          {detailLoading ? (
            <div className="space-y-3 p-4"><Skeleton className="h-20 w-20 rounded-full mx-auto" /><Skeleton className="h-5 w-40 mx-auto" /><div className="grid grid-cols-2 gap-3"><Skeleton className="h-4" /><Skeleton className="h-4" /></div></div>
          ) : detailUser ? (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
                <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
                <TabsTrigger value="sessions" className="flex-1">Sessions</TabsTrigger>
              </TabsList>

              {/* Tab 1: Overview */}
              <TabsContent value="overview" className="space-y-4 pt-2">
                <div className="flex flex-col items-center gap-3 pb-4 border-b">
                  <div className={`h-16 w-16 rounded-full flex items-center justify-center text-white text-xl font-bold ${ROLE_AVATAR_BG[detailUser.role] || "bg-gray-500"}`}>{getInitials(detailUser.name)}</div>
                  <div className="text-center">
                    <h3 className="font-semibold text-lg">{detailUser.name}</h3>
                    <p className="text-sm text-muted-foreground">{detailUser.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className={`text-[10px] gap-1 ${ROLE_STYLES[detailUser.role] || ""}`}><Shield className="h-2.5 w-2.5" />{ROLE_LABELS[detailUser.role] || detailUser.role}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[detailUser.status] || ""}`}>{detailUser.status}</Badge>
                  </div>
                </div>

                {/* Assigned Areas Badges */}
                {detailAreaNames.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">Assigned Areas</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {detailAreaNames.map((area) => (
                        <Badge key={area.id} variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">{area.name}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-3.5 w-3.5" /> Phone:</div>
                  <div className="font-medium">{detailUser.phone || "—"}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Shield className="h-3.5 w-3.5" /> 2FA:</div>
                  <div className="font-medium">{detailUser.twoFactorEnabled ? <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">Enabled</Badge> : <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-500 border-gray-200">Disabled</Badge>}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Last Login:</div>
                  <div className="font-medium">{detailUser.lastLoginAt ? formatDateTime(detailUser.lastLoginAt) : "Never"}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><FileText className="h-3.5 w-3.5" /> Created:</div>
                  <div className="font-medium">{formatDate(detailUser.createdAt)}</div>
                  {detailUser.updatedAt && (<><div className="flex items-center gap-2 text-muted-foreground"><Pencil className="h-3.5 w-3.5" /> Updated:</div><div className="font-medium">{formatDate(detailUser.updatedAt)}</div></>)}
                </div>

                {/* 2FA Toggle */}
                {permissions.update && (
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <div><p className="text-sm font-medium">Two-Factor Authentication</p><p className="text-xs text-muted-foreground">Require 2FA for this user&apos;s login</p></div>
                    </div>
                    <Switch checked={detailUser.twoFactorEnabled || false} onCheckedChange={(checked) => { apiFetch(`/api/users/${detailUser.id}`, { method: "PUT", body: JSON.stringify({ twoFactorEnabled: checked }) }).then(() => { toast.success(`2FA ${checked ? "enabled" : "disabled"}`); queryClient.invalidateQueries({ queryKey: ["user-detail"] }); queryClient.invalidateQueries({ queryKey: ["users"] }); }).catch(() => toast.error("Failed to update 2FA")); }} />
                  </div>
                )}

                {/* Action Buttons */}
                {permissions.update && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => { setNewPassword(""); setConfirmPassword(""); setChangePasswordOpen(true); }}><KeyRound className="h-3.5 w-3.5" /> Reset Password</Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700" onClick={() => setTerminateSessionsOpen(true)}><XCircle className="h-3.5 w-3.5" /> Terminate Sessions</Button>
                  </div>
                )}

                {/* Linked Profiles */}
                {(detailUser.technician || detailUser.agent) && (
                  <div className="space-y-3 pt-3 border-t">
                    <h4 className="text-sm font-semibold text-muted-foreground">Linked Profiles</h4>
                    {detailUser.technician && (
                      <Card className="border shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-[10px] bg-orange-100 text-orange-700 border-orange-200">Technician</Badge>
                            <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[detailUser.technician.status] || ""}`}>{detailUser.technician.status}</Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div><p className="text-[10px] text-muted-foreground">Skills</p><p className="font-medium text-xs">{Array.isArray(detailUser.technician.skills) ? detailUser.technician.skills.slice(0, 3).join(", ") : "—"}</p></div>
                            <div><p className="text-[10px] text-muted-foreground">Rating</p><p className="font-medium text-xs">{detailUser.technician.rating || "—"}</p></div>
                            <div><p className="text-[10px] text-muted-foreground">Resolved</p><p className="font-medium text-xs">{detailUser.technician.totalResolved}</p></div>
                            <div><p className="text-[10px] text-muted-foreground">Phone</p><p className="font-medium text-xs">{detailUser.technician.phone || "—"}</p></div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {detailUser.agent && (
                      <Card className="border shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">Collection Agent</Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div><p className="text-[10px] text-muted-foreground">Daily Target</p><p className="font-medium text-xs">{detailUser.agent.dailyTarget}</p></div>
                            <div><p className="text-[10px] text-muted-foreground">Monthly Target</p><p className="font-medium text-xs">{detailUser.agent.monthlyTarget}</p></div>
                            <div><p className="text-[10px] text-muted-foreground">Collected (Month)</p><p className="font-medium text-xs">{detailUser.agent.totalCollectedMonth}</p></div>
                            <div><p className="text-[10px] text-muted-foreground">Phone</p><p className="font-medium text-xs">{detailUser.agent.phone || "—"}</p></div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* Tab 2: Activity */}
              <TabsContent value="activity" className="pt-2">
                {activityLoading ? (
                  <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
                ) : activityData && activityData.entries.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {activityData.entries.slice(0, 50).map((entry) => (
                      <div key={entry.id} className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs ${getActivityColor(entry.action)}`}>
                        {getActivityIcon(entry.action)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{entry.action}</p>
                          <p className="text-muted-foreground">{entry.entity} • {timeAgo(entry.timestamp)}</p>
                        </div>
                        <span className="text-muted-foreground shrink-0">{entry.ipAddress}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">No activity recorded</div>
                )}
              </TabsContent>

              {/* Tab 3: Sessions */}
              <TabsContent value="sessions" className="pt-2">
                {sessionsLoading ? (
                  <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
                ) : sessionsData && sessionsData.sessions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-xs">Device</TableHead>
                        <TableHead className="text-xs">IP Address</TableHead>
                        <TableHead className="text-xs">Login Time</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {sessionsData.sessions.map((s) => (
                          <TableRow key={s.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell className="text-xs">{s.device} / {s.browser}</TableCell>
                            <TableCell className="text-xs font-mono">{s.ipAddress}</TableCell>
                            <TableCell className="text-xs">{s.loginAt ? formatDateTime(s.loginAt) : "—"}</TableCell>
                            <TableCell><Badge variant="outline" className={`text-[10px] ${s.status === "active" ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>{s.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">No active sessions</div>
                )}
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete User</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete this user? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Confirmation ── */}
      <AlertDialog open={!!bulkConfirm} onOpenChange={() => setBulkConfirm(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Bulk Action</AlertDialogTitle><AlertDialogDescription>Are you sure you want to {bulkConfirm} {selectedIds.size} selected user{selectedIds.size > 1 ? "s" : ""}?{bulkConfirm === "delete" && " This cannot be undone."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className={bulkConfirm === "delete" ? "bg-red-600 hover:bg-red-700 text-white" : ""} onClick={() => { if (!bulkConfirm) return; if (bulkConfirm === "delete") bulkDeleteMutation.mutate([...selectedIds]); else bulkMutation.mutate({ action: bulkConfirm, userIds: [...selectedIds] }); }}>{bulkConfirm === "activate" ? "Activate" : bulkConfirm === "suspend" ? "Suspend" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* ── Admin Reset Password Dialog ── */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">Reset User Password</DialogTitle><DialogDescription>Set a new password for this user.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">New Password *</Label><Input type="password" placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Confirm Password *</Label><Input type="password" placeholder="Re-enter password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setChangePasswordOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={changePasswordMutation.isPending} onClick={handleChangePassword}>{changePasswordMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : "Reset Password"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Feature 4: Self-Service Password Change Dialog ── */}
      <Dialog open={selfPasswordOpen} onOpenChange={setSelfPasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">Change Your Password</DialogTitle><DialogDescription>Enter your current password and choose a new one.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Current Password *</Label>
              <Input type="password" placeholder="Enter current password" value={selfCurrentPassword} onChange={(e) => setSelfCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">New Password *</Label>
              <Input type="password" placeholder="Min 6 characters" value={selfNewPassword} onChange={(e) => setSelfNewPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Confirm New Password *</Label>
              <Input type="password" placeholder="Re-enter new password" value={selfConfirmPassword} onChange={(e) => setSelfConfirmPassword(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSelfPasswordOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={selfPasswordMutation.isPending} onClick={handleSelfPasswordChange}>
                {selfPasswordMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Changing...</> : "Change Password"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Feature 1: Impersonate Confirmation Dialog ── */}
      <AlertDialog open={impersonateConfirmOpen} onOpenChange={setImpersonateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><UserCog className="h-5 w-5 text-purple-600" /> Impersonate User</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to impersonate <strong>{impersonateTarget?.name}</strong> ({impersonateTarget?.email}).
              You will be logged in as this user. All actions will be attributed to you via audit logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-purple-600 hover:bg-purple-700 text-white" disabled={impersonateMutation.isPending} onClick={() => impersonateTarget && impersonateMutation.mutate(impersonateTarget.id)}>
              {impersonateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Switching...</> : "Impersonate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Feature 2: CSV Import Dialog ── */}
      <Dialog open={csvDialogOpen} onOpenChange={(open) => { setCsvDialogOpen(open); if (!open) { setCsvRaw(""); setCsvParsedRows([]); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Upload className="h-5 w-5" /> Import Users from CSV</DialogTitle><DialogDescription>Upload a CSV file with columns: name, email, role (optional), phone (optional), areaId (optional). A default password will be set for imported users.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-red-300 hover:bg-red-50/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const file = e.dataTransfer.files?.[0]; if (file && file.name.endsWith(".csv")) { const reader = new FileReader(); reader.onload = (ev) => { const text = ev.target?.result as string; setCsvRaw(text); parseCSVContent(text); }; reader.readAsText(file); } }}
            >
              <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Click to upload or drag and drop a CSV file</p>
              <p className="text-xs text-muted-foreground mt-1">Accepts .csv files</p>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </div>

            {csvRaw && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">{csvParsedRows.length} row(s) parsed</p>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setCsvRaw(""); setCsvParsedRows([]); }}><X className="h-3 w-3 mr-1" />Clear</Button>
                </div>
                {csvParsedRows.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded border">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-[10px] h-8">#</TableHead>
                        <TableHead className="text-[10px] h-8">Name</TableHead>
                        <TableHead className="text-[10px] h-8">Email</TableHead>
                        <TableHead className="text-[10px] h-8">Role</TableHead>
                        <TableHead className="text-[10px] h-8">Status</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {csvParsedRows.map((row) => (
                          <TableRow key={row._rowNum} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell className="text-[10px] py-1">{row._rowNum}</TableCell>
                            <TableCell className="text-[10px] py-1">{row.name}</TableCell>
                            <TableCell className="text-[10px] py-1">{row.email}</TableCell>
                            <TableCell className="text-[10px] py-1">{row.role}</TableCell>
                            <TableCell className="text-[10px] py-1">{row._error ? <Badge variant="outline" className="text-[9px] bg-red-100 text-red-700 border-red-200">{row._error}</Badge> : <Badge variant="outline" className="text-[9px] bg-green-100 text-green-700 border-green-200">OK</Badge>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {csvParsedRows.some((r) => r._error) && (
                  <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Some rows have errors and will be skipped during import.</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCsvDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={csvParsedRows.length === 0 || csvImporting || bulkImportMutation.isPending} onClick={() => { setCsvImporting(true); bulkImportMutation.mutate(csvRaw); }}>
                {bulkImportMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Importing...</> : <><Upload className="h-4 w-4 mr-1.5" />Import {csvParsedRows.filter((r) => !r._error).length} User(s)</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Terminate Sessions Confirmation ── */}
      <AlertDialog open={terminateSessionsOpen} onOpenChange={setTerminateSessionsOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Terminate All Sessions</AlertDialogTitle><AlertDialogDescription>This will log out {detailUser?.name || "this user"} from all active sessions.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => detailId && terminateSessionsMutation.mutate(detailId)}>Terminate</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* ── Permissions Matrix Dialog ── */}
      <Dialog open={permissionsOpen} onOpenChange={setPermissionsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">Permissions Matrix</DialogTitle></DialogHeader>
          {permsLoading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : permsData ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="text-xs">Permission</TableHead>{permsData.roles.map((r) => <TableHead key={r} className="text-xs text-center">{ROLE_LABELS[r] || r}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {permsData.permissions.map((perm) => (
                    <TableRow key={perm} className="hover:bg-muted/50 transition-colors duration-150">
                      <TableCell className="text-xs font-medium py-2">{humanizePermission(perm)}</TableCell>
                      {permsData.roles.map((role) => (
                        <TableCell key={role} className="text-center py-2">
                          <Checkbox checked={permsData.matrix[role]?.[perm] || false} disabled />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
