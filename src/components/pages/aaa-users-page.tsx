"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Shield, Plus, Search, Eye, Pencil, Trash2, Unplug, Users, Wifi,
  Cable, Plug, Server, Network, KeyRound, Lock, ChevronLeft, ChevronRight,
  Copy, EyeOff, RefreshCw, Download, Filter, AlertTriangle,
  Globe, Activity, Clock, UserCheck, UserX, Layers, MonitorSmartphone,
  CircleDot, X, Loader2,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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

// ─── Types ──────────────────────────────────────────────────────────────────────
interface RadiusGroupOption {
  id: string;
  name: string;
  description?: string;
  priority?: number;
}

interface CheckAttr {
  attribute: string;
  op: string;
  value: string;
}

interface ReplyAttr {
  attribute: string;
  op: string;
  value: string;
}

interface AAAUser {
  username: string;
  password: string;
  checkAttributes: CheckAttr[];
  replyAttributes: ReplyAttr[];
  group: { name: string; priority: number } | null;
  subscriber: {
    id: string;
    name: string;
    code: string;
    phone: string;
    email: string;
    status: string;
    radiusEnabled: boolean;
    ipAddress: string | null;
    macAddress: string | null;
    connectionType: string | null;
  } | null;
  radiusGroup: {
    id: string;
    name: string;
    speedLimitDown: number;
    speedLimitUp: number;
    dataLimit: number | null;
    sessionTimeout: number | null;
  } | null;
}

interface AAAUserDetail {
  username: string;
  checkAttributes: { id: number; attribute: string; op: string; value: string; createdAt: string }[];
  replyAttributes: { id: number; attribute: string; op: string; value: string; createdAt: string }[];
  groups: { id: number; name: string; priority: number }[];
  groupCheckAttributes: CheckAttr[];
  groupReplyAttributes: ReplyAttr[];
  subscriber: {
    id: string;
    name: string;
    code: string;
    phone: string;
    email: string;
    status: string;
    radiusEnabled: boolean;
    ipAddress: string | null;
    macAddress: string | null;
    connectionType: string | null;
    planId: string | null;
    planName: string | null;
    areaId: string | null;
    areaName: string | null;
    sessionTimeout: number | null;
    idleTimeout: number | null;
    lastAuthAt: string | null;
    lastAuthResult: string;
  } | null;
  radiusGroup: Record<string, unknown> | null;
  recentAuthAttempts: { result: string; date: string; nasIp: string; clientIp: string }[];
  activeSessions: { sessionId: string; nasIp: string; framedIp: string; startTime: string; callingStationId: string }[];
}

interface UsersApiResponse {
  success: boolean;
  data: AAAUser[];
  pagination: { page: number; limit: number; total: number; pages: number };
  stats: {
    totalUsers: number;
    activeSubscribers: number;
    radiusEnabled: number;
    byGroup: { group: string; count: number }[];
    byStatus: { status: string; count: number }[];
  };
}

interface DetailApiResponse {
  success: boolean;
  data: AAAUserDetail;
}

// ─── Constants ──────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ACTIVE: { label: "Active", variant: "default" },
  INACTIVE: { label: "Inactive", variant: "secondary" },
  SUSPENDED: { label: "Suspended", variant: "destructive" },
  DISCONNECTED: { label: "Disconnected", variant: "outline" },
  TRIAL: { label: "Trial", variant: "outline" },
  PENDING_ACTIVATION: { label: "Pending", variant: "secondary" },
};

function ConnectionTypeIcon({ type, className = "h-3.5 w-3.5" }: { type: string; className?: string }) {
  switch (type) {
    case "FTTH": return <Cable className={`${className} text-green-500`} />;
    case "WIRELESS": return <Wifi className={`${className} text-amber-500`} />;
    case "CABLE": return <Plug className={`${className} text-teal-500`} />;
    case "LEASED_LINE": return <Server className={`${className} text-purple-500`} />;
    case "ETHERNET": return <Network className={`${className} text-gray-500`} />;
    default: return <MonitorSmartphone className={`${className} text-gray-400`} />;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────────
export default function AaaUsersPage() {
  const queryClient = useQueryClient();

  // ─── Filter State ───
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // ─── Dialog State ───
  const [addOpen, setAddOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [changeGroupOpen, setChangeGroupOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AAAUser | null>(null);

  // ─── Add User Form ───
  const [addForm, setAddForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    groupname: "",
    linkSubscriber: "",
  });
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [subscriberSearch, setSubscriberSearch] = useState("");

  // ─── Change Password Form ───
  const [cpForm, setCpForm] = useState({ newPassword: "", confirmPassword: "" });
  const [showCpPassword, setShowCpPassword] = useState(false);

  // ─── Change Group Form ───
  const [cgForm, setCgForm] = useState({ groupname: "", priority: 1 });

  // ─── Detail Panel ───
  const [detailUsername, setDetailUsername] = useState<string | null>(null);
  const [showDetailPassword, setShowDetailPassword] = useState(false);

  // ─── Queries ───
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
    ...(search && { search }),
    ...(groupFilter && { group: groupFilter }),
    ...(statusFilter && { status: statusFilter }),
  });

  const {
    data: usersResponse,
    isLoading,
    isError,
    error,
  } = useQuery<UsersApiResponse>({
    queryKey: ["aaa-users", page, search, groupFilter, statusFilter],
    queryFn: () => apiFetch<UsersApiResponse>(`/api/aaa/users?${params.toString()}`),
  });

  const { data: groupsData } = useQuery<{ groups: RadiusGroupOption[] }>({
    queryKey: ["radius-groups-aaa"],
    queryFn: () => apiFetch<{ groups: RadiusGroupOption[] }>("/api/radius-groups"),
  });

  const { data: detailResponse, isLoading: detailLoading } = useQuery<DetailApiResponse>({
    queryKey: ["aaa-user-detail", detailUsername],
    queryFn: () => apiFetch<DetailApiResponse>(`/api/aaa/users/${encodeURIComponent(detailUsername!)}`),
    enabled: !!detailUsername && detailOpen,
  });

  // Subscriber search for Add User dialog
  const { data: subscriberSearchResults } = useQuery<{
    subscribers: { id: string; name: string; code: string; serviceUsername: string; phone?: string; email?: string }[];
  }>({
    queryKey: ["subscriber-lookup", subscriberSearch],
    queryFn: () =>
      apiFetch(`/api/subscribers?search=${encodeURIComponent(subscriberSearch)}&limit=10`),
    enabled: subscriberSearch.length >= 2 && addOpen,
  });

  // Reset page on filter change
  useEffect(() => setPage(1), [search, groupFilter, statusFilter]);

  // ─── Mutations ───
  const createUserMutation = useMutation({
    mutationFn: (body: {
      username: string;
      password: string;
      groupname?: string;
      priority?: number;
      subscriberData?: { name: string; code?: string; phone?: string; email?: string };
    }) => apiFetch("/api/aaa/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res: any) => {
      if (!res.success) {
        toast.error(res.error || "Failed to create user");
        return;
      }
      toast.success(`User '${res.data?.username}' created successfully`);
      setAddOpen(false);
      setAddForm({ username: "", password: "", confirmPassword: "", groupname: "", linkSubscriber: "" });
      queryClient.invalidateQueries({ queryKey: ["aaa-users"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create user"),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (username: string) =>
      apiFetch(`/api/aaa/users?username=${encodeURIComponent(username)}`, { method: "DELETE" }),
    onSuccess: (res: any) => {
      if (!res.success) {
        toast.error(res.error || "Failed to delete user");
        return;
      }
      toast.success(res.message || "User deleted");
      setDeleteOpen(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["aaa-users"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete user"),
  });

  const changePasswordMutation = useMutation({
    mutationFn: ({ username, newPassword }: { username: string; newPassword: string }) =>
      apiFetch("/api/aaa/users", {
        method: "PUT",
        body: JSON.stringify({ username, action: "change-password", newPassword }),
      }),
    onSuccess: (res: any) => {
      if (!res.success) {
        toast.error(res.error || "Failed to change password");
        return;
      }
      toast.success(res.message || "Password updated");
      setChangePasswordOpen(false);
      setCpForm({ newPassword: "", confirmPassword: "" });
      queryClient.invalidateQueries({ queryKey: ["aaa-users"] });
      if (detailUsername) queryClient.invalidateQueries({ queryKey: ["aaa-user-detail", detailUsername] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to change password"),
  });

  const changeGroupMutation = useMutation({
    mutationFn: ({
      username,
      groupname,
      priority,
    }: {
      username: string;
      groupname: string;
      priority: number;
    }) =>
      apiFetch("/api/aaa/users", {
        method: "PUT",
        body: JSON.stringify({ username, action: "change-group", groupname, priority }),
      }),
    onSuccess: (res: any) => {
      if (!res.success) {
        toast.error(res.error || "Failed to change group");
        return;
      }
      toast.success(res.message || "Group updated");
      setChangeGroupOpen(false);
      setCgForm({ groupname: "", priority: 1 });
      queryClient.invalidateQueries({ queryKey: ["aaa-users"] });
      if (detailUsername) queryClient.invalidateQueries({ queryKey: ["aaa-user-detail", detailUsername] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to change group"),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ username, enabled }: { username: string; enabled: boolean }) =>
      apiFetch("/api/aaa/users", {
        method: "PUT",
        body: JSON.stringify({ username, action: "toggle-enabled", enabled }),
      }),
    onSuccess: (res: any, vars: { username: string; enabled: boolean }) => {
      if (!res.success) {
        toast.error(res.error || "Failed to update");
        return;
      }
      toast.success(vars.enabled ? "RADIUS enabled" : "RADIUS disabled");
      queryClient.invalidateQueries({ queryKey: ["aaa-users"] });
      if (detailUsername) queryClient.invalidateQueries({ queryKey: ["aaa-user-detail", detailUsername] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update RADIUS status"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (username: string) =>
      apiFetch(`/api/aaa/users/${encodeURIComponent(username)}`, {
        method: "PUT",
        body: JSON.stringify({ action: "disconnect" }),
      }),
    onSuccess: (res: any) => {
      if (!res.success) {
        toast.error(res.error || "Disconnect failed");
        return;
      }
      toast.success(res.message || "Session disconnected");
      if (detailUsername) queryClient.invalidateQueries({ queryKey: ["aaa-user-detail", detailUsername] });
    },
    onError: (err: Error) => toast.error(err.message || "Disconnect failed"),
  });

  // ─── Helpers ───
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Failed to copy")
    );
  }, []);

  const openDetail = useCallback((username: string) => {
    setDetailUsername(username);
    setDetailOpen(true);
    setShowDetailPassword(false);
  }, []);

  const openChangePassword = useCallback((user: AAAUser) => {
    setSelectedUser(user);
    setCpForm({ newPassword: "", confirmPassword: "" });
    setShowCpPassword(false);
    setChangePasswordOpen(true);
  }, []);

  const openChangeGroup = useCallback((user: AAAUser) => {
    setSelectedUser(user);
    setCgForm({ groupname: user.group?.name || "", priority: user.group?.priority || 1 });
    setChangeGroupOpen(true);
  }, []);

  const openDelete = useCallback((user: AAAUser) => {
    setSelectedUser(user);
    setDeleteOpen(true);
  }, []);

  const handleCreateUser = useCallback(() => {
    if (!addForm.username.trim()) { toast.error("Username is required"); return; }
    if (!addForm.password.trim()) { toast.error("Password is required"); return; }
    if (addForm.password !== addForm.confirmPassword) { toast.error("Passwords do not match"); return; }
    if (addForm.password.length < 4) { toast.error("Password must be at least 4 characters"); return; }

    // Check if linking to subscriber
    const subMatch = subscriberSearchResults?.subscribers?.find(
      (s) => s.serviceUsername === addForm.linkSubscriber || s.code === addForm.linkSubscriber
    );

    createUserMutation.mutate({
      username: addForm.username.trim(),
      password: addForm.password,
      ...(addForm.groupname && { groupname: addForm.groupname, priority: 1 }),
      ...(subMatch && {
        subscriberData: { name: subMatch.name, code: subMatch.code, phone: subMatch.phone, email: subMatch.email },
      }),
    });
  }, [addForm, subscriberSearchResults, createUserMutation]);

  const handleChangePassword = useCallback(() => {
    if (!cpForm.newPassword.trim()) { toast.error("New password is required"); return; }
    if (cpForm.newPassword !== cpForm.confirmPassword) { toast.error("Passwords do not match"); return; }
    if (cpForm.newPassword.length < 4) { toast.error("Password must be at least 4 characters"); return; }
    changePasswordMutation.mutate({
      username: selectedUser!.username,
      newPassword: cpForm.newPassword,
    });
  }, [cpForm, selectedUser, changePasswordMutation]);

  const handleChangeGroup = useCallback(() => {
    if (!cgForm.groupname.trim()) { toast.error("Group is required"); return; }
    changeGroupMutation.mutate({
      username: selectedUser!.username,
      groupname: cgForm.groupname,
      priority: cgForm.priority,
    });
  }, [cgForm, selectedUser, changeGroupMutation]);

  // ─── Derived Data ───
  const users = usersResponse?.data ?? [];
  const pagination = usersResponse?.pagination;
  const stats = usersResponse?.stats;
  const groups = groupsData?.groups ?? [];
  const detail = detailResponse?.data ?? null;

  const suspendedCount =
    stats?.byStatus?.find((s) => s.status === "SUSPENDED")?.count ??
    stats?.byStatus?.find((s) => s.status === "DISCONNECTED")?.count ??
    0;

  // ─── Loading Skeleton ───
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28 ml-auto" />
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AAA Users"
          description="Manage FreeRADIUS user accounts"
          icon={Shield}
        />
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto text-red-500 mb-3" />
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Failed to load AAA users
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {error?.message || "Unknown error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["aaa-users"] })}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Render ───
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageHeader
        title="AAA Users"
        description="Manage FreeRADIUS user accounts, groups, and authentication policies"
        icon={Shield}
        badge={{ text: `${pagination?.total ?? 0} Users`, variant: "secondary" }}
        breadcrumbs={[
          { label: "Dashboard" },
          { label: "AAA" },
          { label: "Users" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["aaa-users"] })}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                setAddForm({ username: "", password: "", confirmPassword: "", groupname: "", linkSubscriber: "" });
                setAddOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>
        }
      />

      {/* ─── Stats Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* Total AAA Users */}
        <Card className="border-0 rounded-xl ring-1 ring-slate-200/60 dark:ring-slate-700/50 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/50 dark:to-gray-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 shadow-sm shadow-slate-500/25">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {stats?.totalUsers?.toLocaleString() ?? 0}
                </p>
                <p className="text-xs text-muted-foreground font-medium">Total AAA Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RADIUS Enabled */}
        <Card className="border-0 rounded-xl ring-1 ring-green-200/60 dark:ring-green-800/40 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-500/25">
                <Wifi className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">
                  {stats?.radiusEnabled?.toLocaleString() ?? 0}
                </p>
                <p className="text-xs text-muted-foreground font-medium">RADIUS Enabled</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Subscribers */}
        <Card className="border-0 rounded-xl ring-1 ring-emerald-200/60 dark:ring-emerald-800/40 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm shadow-emerald-500/25">
                <UserCheck className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {stats?.activeSubscribers?.toLocaleString() ?? 0}
                </p>
                <p className="text-xs text-muted-foreground font-medium">Active Subscribers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Suspended */}
        <Card className="border-0 rounded-xl ring-1 ring-red-200/60 dark:ring-red-800/40 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-sm shadow-red-500/25">
                <UserX className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">
                  {suspendedCount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground font-medium">Suspended</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-44">
            <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="All Groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Groups</SelectItem>
            {(stats?.byGroup ?? []).map((g) => (
              <SelectItem key={g.group} value={g.group}>
                {g.group} ({g.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-40">
            <Activity className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            {(stats?.byStatus ?? []).map((s) => (
              <SelectItem key={s.status} value={s.status}>
                {s.status} ({s.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── Users Table ─── */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold">Username</TableHead>
                  <TableHead className="text-xs font-semibold">Subscriber</TableHead>
                  <TableHead className="text-xs font-semibold hidden md:table-cell">Group</TableHead>
                  <TableHead className="text-xs font-semibold hidden sm:table-cell">Status</TableHead>
                  <TableHead className="text-xs font-semibold hidden lg:table-cell">Type</TableHead>
                  <TableHead className="text-xs font-semibold hidden lg:table-cell">Plan / Speed</TableHead>
                  <TableHead className="text-xs font-semibold text-center">RADIUS</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-16">
                      <div className="flex flex-col items-center gap-2">
                        <Shield className="h-10 w-10 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">
                          {search || groupFilter || statusFilter
                            ? "No users match your filters"
                            : "No AAA users found"}
                        </p>
                        {(search || groupFilter || statusFilter) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              setSearch("");
                              setGroupFilter("");
                              setStatusFilter("");
                            }}
                          >
                            Clear Filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const statusInfo = STATUS_MAP[user.subscriber?.status ?? ""] ?? {
                      label: "N/A",
                      variant: "outline" as const,
                    };

                    return (
                      <TableRow
                        key={user.username}
                        className="hover:bg-muted/50 transition-colors duration-150 cursor-pointer"
                        onClick={() => openDetail(user.username)}
                      >
                        {/* Username */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <code className="text-xs font-mono font-medium text-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                              {user.username}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 opacity-40 hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(user.username);
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>

                        {/* Subscriber Name */}
                        <TableCell>
                          {user.subscriber ? (
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{user.subscriber.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {user.subscriber.code}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Group Badge */}
                        <TableCell className="hidden md:table-cell">
                          {user.group ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400"
                            >
                              <Layers className="h-2.5 w-2.5 mr-1" />
                              {user.group.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="hidden sm:table-cell">
                          {user.subscriber ? (
                            <Badge variant={statusInfo.variant} className="text-[10px]">
                              <CircleDot className="h-2 w-2 mr-1" />
                              {statusInfo.label}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              Unlinked
                            </Badge>
                          )}
                        </TableCell>

                        {/* Connection Type */}
                        <TableCell className="hidden lg:table-cell">
                          {user.subscriber?.connectionType ? (
                            <div className="flex items-center gap-1.5">
                              <ConnectionTypeIcon type={user.subscriber.connectionType} />
                              <span className="text-xs">{user.subscriber.connectionType}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Plan / Speed */}
                        <TableCell className="hidden lg:table-cell">
                          {user.radiusGroup ? (
                            <div className="text-xs space-y-0.5">
                              <p className="font-medium text-foreground">{user.radiusGroup.name}</p>
                              <p className="text-[10px] text-muted-foreground tabular-nums">
                                ↓{(user.radiusGroup.speedLimitDown / 1000).toFixed(0)} Mbps
                                {" / "}
                                ↑{(user.radiusGroup.speedLimitUp / 1000).toFixed(0)} Mbps
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* RADIUS Enabled Toggle */}
                        <TableCell className="text-center">
                          <Switch
                            checked={user.subscriber?.radiusEnabled ?? false}
                            disabled={!user.subscriber || toggleEnabledMutation.isPending}
                            onCheckedChange={(checked) => {
                              toggleEnabledMutation.mutate({
                                username: user.username,
                                enabled: checked,
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div
                            className="flex items-center justify-end gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="View Detail"
                              onClick={() => openDetail(user.username)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Change Password"
                              onClick={() => openChangePassword(user)}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Change Group"
                              onClick={() => openChangeGroup(user)}
                            >
                              <Layers className="h-3.5 w-3.5" />
                            </Button>
                            {(user.subscriber?.status === "ACTIVE" ||
                              detail?.activeSessions?.length) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-600"
                                title="Disconnect"
                                onClick={() => disconnectMutation.mutate(user.username)}
                              >
                                <Unplug className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600"
                              title="Delete"
                              onClick={() => openDelete(user)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}
                –{Math.min(page * PAGE_SIZE, pagination.total)} of {pagination.total}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                {Array.from(
                  { length: Math.min(pagination.pages, 7) },
                  (_, i) => {
                    let pageNum: number;
                    if (pagination.pages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                    } else if (page >= pagination.pages - 3) {
                      pageNum = pagination.pages - 6 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return pageNum;
                  }
                )
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((p) => (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 text-xs"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Add User Dialog ─── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-red-600" />
              Add AAA User
            </DialogTitle>
            <DialogDescription>
              Create a new FreeRADIUS user account in the radcheck table.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="add-username">Username *</Label>
              <Input
                id="add-username"
                placeholder="e.g. cry1002@cryptsk"
                value={addForm.username}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, username: e.target.value }))
                }
                className="font-mono"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="add-password">Password *</Label>
              <div className="relative">
                <Input
                  id="add-password"
                  type={showAddPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={addForm.password}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, password: e.target.value }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowAddPassword(!showAddPassword)}
                >
                  {showAddPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="add-confirm-password">Confirm Password *</Label>
              <Input
                id="add-confirm-password"
                type={showAddPassword ? "text" : "password"}
                placeholder="Confirm password"
                value={addForm.confirmPassword}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, confirmPassword: e.target.value }))
                }
              />
              {addForm.confirmPassword &&
                addForm.password !== addForm.confirmPassword && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
            </div>

            <Separator />

            {/* Group */}
            <div className="space-y-2">
              <Label>RADIUS Group</Label>
              <Select
                value={addForm.groupname}
                onValueChange={(v) =>
                  setAddForm((f) => ({ ...f, groupname: v === "__none__" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No group (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No Group</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.name}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Link to Subscriber */}
            <div className="space-y-2">
              <Label>Link to Subscriber (optional)</Label>
              <Input
                placeholder="Search by name or code..."
                value={subscriberSearch}
                onChange={(e) => {
                  setSubscriberSearch(e.target.value);
                  setAddForm((f) => ({ ...f, linkSubscriber: "" }));
                }}
              />
              {subscriberSearchResults?.subscribers &&
                subscriberSearchResults.subscribers.length > 0 && (
                  <div className="max-h-36 overflow-y-auto border rounded-md mt-1">
                    {subscriberSearchResults.subscribers.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/50 border-b last:border-b-0 transition-colors ${
                          addForm.linkSubscriber === sub.serviceUsername
                            ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                            : ""
                        }`}
                        onClick={() => {
                          setAddForm((f) => ({
                            ...f,
                            linkSubscriber: sub.serviceUsername,
                          }));
                          setSubscriberSearch(sub.name);
                        }}
                      >
                        <span className="font-medium">{sub.name}</span>
                        <span className="ml-2 text-muted-foreground font-mono">
                          {sub.code}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleCreateUser}
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── User Detail Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-600" />
              User Detail
            </DialogTitle>
            <DialogDescription>
              {detail ? `Full details for ${detail.username}` : "Loading..."}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : detail ? (
            <div className="space-y-6">
              {/* User Info Section */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono font-semibold bg-muted/60 px-2 py-0.5 rounded">
                        {detail.username}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopy(detail.username)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    {detail.subscriber && (
                      <p className="text-xs text-muted-foreground">
                        {detail.subscriber.name} &middot; {detail.subscriber.code}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {detail.groups.length > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400"
                      >
                        <Layers className="h-3 w-3 mr-1" />
                        {detail.groups.map((g) => g.name).join(", ")}
                      </Badge>
                    )}
                    {detail.subscriber && (
                      <Badge variant={STATUS_MAP[detail.subscriber.status]?.variant ?? "outline"}>
                        <CircleDot className="h-2.5 w-2.5 mr-1" />
                        {detail.subscriber.status}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDetailOpen(false);
                      openChangePassword({
                        username: detail.username,
                        password: "",
                        checkAttributes: [],
                        replyAttributes: [],
                        group: detail.groups[0]
                          ? { name: detail.groups[0].name, priority: detail.groups[0].priority }
                          : null,
                        subscriber: null,
                        radiusGroup: null,
                      });
                    }}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                    Change Password
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDetailOpen(false);
                      openChangeGroup({
                        username: detail.username,
                        password: "",
                        checkAttributes: [],
                        replyAttributes: [],
                        group: detail.groups[0]
                          ? { name: detail.groups[0].name, priority: detail.groups[0].priority }
                          : null,
                        subscriber: null,
                        radiusGroup: null,
                      });
                    }}
                  >
                    <Layers className="h-3.5 w-3.5 mr-1.5" />
                    Change Group
                  </Button>
                  {detail.activeSessions.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-600"
                      onClick={() => disconnectMutation.mutate(detail.username)}
                      disabled={disconnectMutation.isPending}
                    >
                      <Unplug className="h-3.5 w-3.5 mr-1.5" />
                      {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  )}
                  {detail.subscriber && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        toggleEnabledMutation.mutate({
                          username: detail.username,
                          enabled: !detail.subscriber?.radiusEnabled,
                        })
                      }
                      disabled={toggleEnabledMutation.isPending}
                    >
                      <Wifi className="h-3.5 w-3.5 mr-1.5" />
                      {detail.subscriber.radiusEnabled ? "Disable RADIUS" : "Enable RADIUS"}
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              {/* Tabs for detailed info */}
              <Tabs defaultValue="attributes" className="w-full">
                <TabsList className="flex-wrap w-full">
                  <TabsTrigger value="attributes" className="flex-1 min-w-fit text-xs">
                    Attributes
                  </TabsTrigger>
                  <TabsTrigger value="subscriber" className="flex-1 min-w-fit text-xs">
                    Subscriber
                  </TabsTrigger>
                  <TabsTrigger value="auth-history" className="flex-1 min-w-fit text-xs">
                    Auth History
                  </TabsTrigger>
                  <TabsTrigger value="sessions" className="flex-1 min-w-fit text-xs">
                    Sessions
                  </TabsTrigger>
                </TabsList>

                {/* Attributes Tab */}
                <TabsContent value="attributes" className="space-y-4 mt-3">
                  {/* Check Attributes (radcheck) */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Check Attributes (radcheck)
                    </h4>
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-xs">Attribute</TableHead>
                            <TableHead className="text-xs">Op</TableHead>
                            <TableHead className="text-xs">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.checkAttributes.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-xs py-4 text-muted-foreground">
                                No check attributes
                              </TableCell>
                            </TableRow>
                          ) : (
                            detail.checkAttributes.map((attr, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-mono">{attr.attribute}</TableCell>
                                <TableCell className="text-xs font-mono text-muted-foreground">{attr.op}</TableCell>
                                <TableCell className="text-xs font-mono">
                                  {attr.attribute === "Cleartext-Password" ? (
                                    <span className="flex items-center gap-1">
                                      {showDetailPassword ? (
                                        attr.value
                                      ) : (
                                        "••••••••"
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        onClick={() => setShowDetailPassword(!showDetailPassword)}
                                      >
                                        {showDetailPassword ? (
                                          <EyeOff className="h-3 w-3" />
                                        ) : (
                                          <Eye className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </span>
                                  ) : (
                                    attr.value
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Reply Attributes (radreply) */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Reply Attributes (radreply)
                    </h4>
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-xs">Attribute</TableHead>
                            <TableHead className="text-xs">Op</TableHead>
                            <TableHead className="text-xs">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.replyAttributes.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-xs py-4 text-muted-foreground">
                                No reply attributes
                              </TableCell>
                            </TableRow>
                          ) : (
                            detail.replyAttributes.map((attr, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-mono">{attr.attribute}</TableCell>
                                <TableCell className="text-xs font-mono text-muted-foreground">{attr.op}</TableCell>
                                <TableCell className="text-xs font-mono">{attr.value}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Group Inherited Attributes */}
                  {detail.groupCheckAttributes.length > 0 ||
                  detail.groupReplyAttributes.length > 0 ? (
                    <>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Group Inherited — Check (radgroupcheck)
                          <Badge variant="outline" className="text-[9px] ml-1.5">
                            {detail.groups[0]?.name}
                          </Badge>
                        </h4>
                        <div className="border rounded-md overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className="text-xs">Attribute</TableHead>
                                <TableHead className="text-xs">Op</TableHead>
                                <TableHead className="text-xs">Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detail.groupCheckAttributes.map((attr, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-xs font-mono">{attr.attribute}</TableCell>
                                  <TableCell className="text-xs font-mono text-muted-foreground">{attr.op}</TableCell>
                                  <TableCell className="text-xs font-mono">{attr.value}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Group Inherited — Reply (radgroupreply)
                        </h4>
                        <div className="border rounded-md overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className="text-xs">Attribute</TableHead>
                                <TableHead className="text-xs">Op</TableHead>
                                <TableHead className="text-xs">Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detail.groupReplyAttributes.map((attr, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-xs font-mono">{attr.attribute}</TableCell>
                                  <TableCell className="text-xs font-mono text-muted-foreground">{attr.op}</TableCell>
                                  <TableCell className="text-xs font-mono">{attr.value}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </>
                  ) : null}
                </TabsContent>

                {/* Subscriber Tab */}
                <TabsContent value="subscriber" className="mt-3">
                  {detail.subscriber ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <InfoField label="Name" value={detail.subscriber.name} />
                        <InfoField label="Code" value={detail.subscriber.code} mono />
                        <InfoField label="Phone" value={detail.subscriber.phone} />
                        <InfoField label="Email" value={detail.subscriber.email} />
                        <InfoField label="Status" value={detail.subscriber.status}>
                          <Badge
                            variant={STATUS_MAP[detail.subscriber.status]?.variant ?? "outline"}
                            className="text-[10px]"
                          >
                            {STATUS_MAP[detail.subscriber.status]?.label ?? detail.subscriber.status}
                          </Badge>
                        </InfoField>
                        <InfoField label="RADIUS Enabled" value={detail.subscriber.radiusEnabled ? "Yes" : "No"}>
                          <Badge
                            variant={detail.subscriber.radiusEnabled ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {detail.subscriber.radiusEnabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </InfoField>
                        <InfoField label="Connection" value={detail.subscriber.connectionType}>
                          {detail.subscriber.connectionType && (
                            <div className="flex items-center gap-1.5">
                              <ConnectionTypeIcon type={detail.subscriber.connectionType} />
                              <span className="text-xs">{detail.subscriber.connectionType}</span>
                            </div>
                          )}
                        </InfoField>
                        <InfoField label="IP Address" value={detail.subscriber.ipAddress} mono />
                        <InfoField label="MAC Address" value={detail.subscriber.macAddress} mono />
                        <InfoField label="Plan" value={detail.subscriber.planName} />
                        <InfoField label="Area" value={detail.subscriber.areaName} />
                        <InfoField
                          label="Session Timeout"
                          value={
                            detail.subscriber.sessionTimeout
                              ? `${detail.subscriber.sessionTimeout}s`
                              : "Default"
                          }
                        />
                        <InfoField
                          label="Last Auth"
                          value={
                            detail.subscriber.lastAuthAt
                              ? new Date(detail.subscriber.lastAuthAt).toLocaleString()
                              : "Never"
                          }
                        />
                        <InfoField label="Last Result" value={detail.subscriber.lastAuthResult} mono>
                          <Badge
                            variant={
                              detail.subscriber.lastAuthResult?.toLowerCase() === "success" ||
                              detail.subscriber.lastAuthResult?.toLowerCase() === "ok"
                                ? "default"
                                : "destructive"
                            }
                            className="text-[10px]"
                          >
                            {detail.subscriber.lastAuthResult || "N/A"}
                          </Badge>
                        </InfoField>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No linked subscriber for this RADIUS user
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* Auth History Tab */}
                <TabsContent value="auth-history" className="mt-3">
                  {detail.recentAuthAttempts.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">No auth history found</p>
                    </div>
                  ) : (
                    <div className="border rounded-md overflow-hidden max-h-72 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 sticky top-0">
                            <TableHead className="text-xs">Result</TableHead>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs hidden sm:table-cell">NAS IP</TableHead>
                            <TableHead className="text-xs hidden md:table-cell">Client IP</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.recentAuthAttempts.map((auth, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Badge
                                  variant={
                                    auth.result?.toLowerCase() === "access-accept" ||
                                    auth.result?.toLowerCase() === "ok"
                                      ? "default"
                                      : "destructive"
                                  }
                                  className="text-[10px]"
                                >
                                  {auth.result || "N/A"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {auth.date
                                  ? new Date(auth.date).toLocaleString()
                                  : "N/A"}
                              </TableCell>
                              <TableCell className="text-xs font-mono hidden sm:table-cell">
                                {auth.nasIp || "—"}
                              </TableCell>
                              <TableCell className="text-xs font-mono hidden md:table-cell">
                                {auth.clientIp || "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Sessions Tab */}
                <TabsContent value="sessions" className="mt-3">
                  {detail.activeSessions.length === 0 ? (
                    <div className="text-center py-8">
                      <Wifi className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">No active sessions</p>
                    </div>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-xs">Session ID</TableHead>
                            <TableHead className="text-xs">Framed IP</TableHead>
                            <TableHead className="text-xs hidden sm:table-cell">NAS IP</TableHead>
                            <TableHead className="text-xs hidden md:table-cell">Start Time</TableHead>
                            <TableHead className="text-xs hidden md:table-cell">MAC</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.activeSessions.map((session, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-mono">
                                {session.sessionId || "—"}
                              </TableCell>
                              <TableCell className="text-xs font-mono">
                                {session.framedIp || "—"}
                              </TableCell>
                              <TableCell className="text-xs font-mono hidden sm:table-cell">
                                {session.nasIp || "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                                {session.startTime
                                  ? new Date(session.startTime).toLocaleString()
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-xs font-mono hidden md:table-cell">
                                {session.callingStationId || "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ─── Change Password Dialog ─── */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-red-600" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Update the RADIUS password for this user.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={selectedUser?.username ?? ""}
                disabled
                className="font-mono bg-muted/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cp-new-password">New Password *</Label>
              <div className="relative">
                <Input
                  id="cp-new-password"
                  type={showCpPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={cpForm.newPassword}
                  onChange={(e) =>
                    setCpForm((f) => ({ ...f, newPassword: e.target.value }))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowCpPassword(!showCpPassword)}
                >
                  {showCpPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cp-confirm-password">Confirm Password *</Label>
              <Input
                id="cp-confirm-password"
                type={showCpPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={cpForm.confirmPassword}
                onChange={(e) =>
                  setCpForm((f) => ({ ...f, confirmPassword: e.target.value }))
                }
              />
              {cpForm.confirmPassword &&
                cpForm.newPassword !== cpForm.confirmPassword && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setChangePasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleChangePassword}
              disabled={changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Save Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Change Group Dialog ─── */}
      <Dialog open={changeGroupOpen} onOpenChange={setChangeGroupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-red-600" />
              Change Group
            </DialogTitle>
            <DialogDescription>
              Assign a new RADIUS group to this user.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={selectedUser?.username ?? ""}
                disabled
                className="font-mono bg-muted/50"
              />
            </div>

            <div className="space-y-2">
              <Label>New Group *</Label>
              <Select
                value={cgForm.groupname}
                onValueChange={(v) =>
                  setCgForm((f) => ({ ...f, groupname: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.name}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cg-priority">Priority</Label>
              <Input
                id="cg-priority"
                type="number"
                min={1}
                max={100}
                value={cgForm.priority}
                onChange={(e) =>
                  setCgForm((f) => ({
                    ...f,
                    priority: parseInt(e.target.value) || 1,
                  }))
                }
              />
              <p className="text-[10px] text-muted-foreground">
                Lower value = higher priority (1 is highest)
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setChangeGroupOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleChangeGroup}
              disabled={changeGroupMutation.isPending || !cgForm.groupname}
            >
              {changeGroupMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Layers className="h-4 w-4 mr-2" />
              )}
              Save Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Delete AAA User
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <code className="font-mono text-xs bg-muted/60 px-1.5 py-0.5 rounded">
                {selectedUser?.username}
              </code>
              ? This will remove the user from all FreeRADIUS tables (radcheck, radreply,
              radusergroup). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (selectedUser) deleteUserMutation.mutate(selectedUser.username);
              }}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── InfoField Helper ───
function InfoField({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      {children ? (
        children
      ) : value ? (
        <p className={`text-xs ${mono ? "font-mono" : ""} text-foreground`}>{value}</p>
      ) : (
        <p className="text-xs text-muted-foreground">—</p>
      )}
    </div>
  );
}
