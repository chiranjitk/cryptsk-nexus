"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatINR } from "@/lib/utils";
import {
  Wifi,
  MapPin,
  Users,
  IndianRupee,
  Ticket,
  Plus,
  Search,
  Edit2,
  Trash2,
  RefreshCw,
  Clock,
  HardDrive,
  Zap,
  UserX,
  Building,
  Coffee,
  TreePine,
  Train,
  Store,
  Plane,
  Loader2,
  Download,
  ChevronLeft, ChevronRight,
  QrCode,
  TrendingUp,
  BarChart3,
  Database,
  Activity,
  Layers,
  History,
  Globe,
} from "lucide-react";
import { useModuleStore } from "@/store/module-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
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
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
} from "recharts";

const CHART_COLORS = ["#DC2626", "#F97316", "#22C55E", "#3B82F6", "#8B5CF6", "#EC4899"];

// ─── Types ───────────────────────────────────────────────────────
interface HotspotLocation {
  id: string;
  name: string;
  type: string;
  address: string;
  apCount: number;
  activeUsers: number;
  bandwidthUsed: string;
  status: string;
}

interface HotspotPlan {
  id: string;
  name: string;
  planType: string;
  speed: number;
  limit: string;
  price: number;
  activeUsers: number;
  status: string;
  ipv6Enabled?: boolean;
}

interface ActiveUser {
  id: string;
  username: string;
  location: string;
  ip: string;
  mac: string;
  connectedSince: string;
  dataUsed: string;
  timeRemaining: string;
  ipv6Address?: string;
}

interface Voucher {
  id: string; code: string; denomination: number; planId: string | null;
  validityDays: number; status: string;
  usedBySubscriber: { id: string; name: string; code: string } | null;
  plan: { id: string; name: string } | null;
}

interface UserHistorySession {
  id: string; sessionId: string; nasIp: string;
  startTime: string; stopTime: string; duration: string;
  download: string; upload: string; total: string; totalBytes: number;
  mac: string; framedIp: string; terminateCause: string; isActive: boolean;
}

// ─── Constants ──────────────────────────────────────────────────
const LOCATION_TYPES = ["Hotel", "Cafe", "Park", "Station", "Mall", "Airport"];
const LOCATION_ICONS: Record<string, React.ElementType> = { Hotel: Building, Cafe: Coffee, Park: TreePine, Station: Train, Mall: Store, Airport: Plane, Hotspot: MapPin };
const PLAN_TYPES = ["TIME_BASED", "DATA_BASED", "UNLIMITED"];

// ─── Stat Card ───────────────────────────────────────────────────
function StatCard({ title, value, subtitle, icon: Icon, gradient, delay }: {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; gradient: string; delay: number;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg animate-card-enter`} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">{title}</p>
            <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
            <p className="text-xs mt-1 opacity-75">{subtitle}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Mini Sparkline ─────────────────────────────────────────────
function MiniSparkline({ data, dataKey, color }: { data: { date: string; [k: string]: string | number }[]; dataKey: string; color: string }) {
  if (!data || data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#grad-${dataKey})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Pagination helper ─────────────────────────────────────
function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  let start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        {pages.map((p) => (
          <Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="h-8 w-8 text-xs" onClick={() => setPage(p)}>{p}</Button>
        ))}
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ─── Hotspot Page ────────────────────────────────────────────────
export default function HotspotPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  const [tab, setTab] = useState("dashboard");
  const [locSearch, setLocSearch] = useState("");
  const [planSearch, setPlanSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [locPage, setLocPage] = useState(1);
  const [planPage, setPlanPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const LOC_PAGE_SIZE = 10;
  const PLAN_PAGE_SIZE = 9;
  const USER_PAGE_SIZE = 15;
  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<HotspotLocation | null>(null);
  const [editingPlan, setEditingPlan] = useState<HotspotPlan | null>(null);
  const [deleteLocTarget, setDeleteLocTarget] = useState<HotspotLocation | null>(null);
  const [deletePlanTarget, setDeletePlanTarget] = useState<HotspotPlan | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ActiveUser | null>(null);
  const [locForm, setLocForm] = useState({ name: "", type: "Hotel", address: "", apCount: "1", status: "Active" });
  const [planForm, setPlanForm] = useState({ name: "", planType: "TIME_BASED", speed: "10", limit: "1 hour", price: "30", status: "Active", ipv6Enabled: false });
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ prefix: "HS_", count: "5", baseSpeed: "10", speedIncrement: "5", basePrice: "30", priceIncrement: "20", planType: "TIME_BASED", limit: "1 hour" });

  // User history dialog state
  const [historyUser, setHistoryUser] = useState<ActiveUser | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  // ─── Queries ─────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["hotspot"],
    queryFn: () => apiFetch("/api/hotspot"),
  });

  // Auto-refresh connected users every 30 seconds
  useQuery({
    queryKey: ["hotspot-users-refresh"],
    queryFn: () => apiFetch("/api/hotspot"),
    refetchInterval: tab === "users" ? 30000 : false,
  });

  // ─── Dashboard query ───────────────────────────────
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ["hotspot-dashboard"],
    queryFn: () => apiFetch<{
      activeUsers: number; bandwidthToday: number; sessionsToday: number;
      revenueThisMonth: number; hotspotPlanCount: number; activeLocations: number;
      trendData: { date: string; sessions: number; bandwidth: number }[];
    }>("/api/hotspot/dashboard"),
    staleTime: 30_000,
    enabled: tab === "dashboard",
  });

  // ─── Voucher state & queries ─────────────────
  const [voucherSearch, setVoucherSearch] = useState("");
  const [voucherStatus, setVoucherStatus] = useState("ALL");
  const [voucherPage, setVoucherPage] = useState(1);
  const VOUCHER_PAGE_SIZE = 15;

  const { data: vouchersData, isLoading: voucherLoading } = useQuery({
    queryKey: ["hotspot-vouchers", voucherStatus, voucherSearch, voucherPage],
    queryFn: () => apiFetch<{ vouchers: Voucher[]; total: number }>(`/api/vouchers?status=${voucherStatus}&search=${voucherSearch}&page=${voucherPage}&limit=${VOUCHER_PAGE_SIZE}&planId=ALL`),
    staleTime: 30_000,
    enabled: tab === "vouchers",
  });

  // ─── Data History query ────────────────────────────
  const { data: dataHistory, isLoading: dataHistoryLoading } = useQuery({
    queryKey: ["hotspot-data-history"],
    queryFn: () => apiFetch<{ history: { id: string; username: string; sessionStart: string; duration: string; download: string; upload: string; total: string; mac: string }[] }>("/api/hotspot/data-history"),
    staleTime: 60_000,
    enabled: tab === "data-history",
  });

  // ─── Revenue query ────────────────────────────────
  const { data: revenueRes, isLoading: revenueLoading } = useQuery({
    queryKey: ["hotspot-revenue"],
    queryFn: () => apiFetch<{ revenue: { areaId: string; areaName: string; activeSubscribers: number; totalRevenue: number }[] }>("/api/hotspot/revenue"),
    staleTime: 60_000,
    enabled: tab === "revenue",
  });

  // Analytics query
  const { data: analyticsData } = useQuery({
    queryKey: ["hotspot-analytics"],
    queryFn: () => apiFetch<{
      planDistribution: { name: string; count: number; revenue: number }[];
      locationUsage: { name: string; activeUsers: number; bandwidthUsed: string }[];
      revenueByLocation: { name: string; revenue: number }[];
      summary: { totalRevenue: number; avgRevenuePerUser: number; peakConcurrent: number; popularPlan: string };
    }>("/api/hotspot/analytics"),
    staleTime: 60_000,
    enabled: tab === "analytics",
  });

  // User history query
  const { data: userHistoryData, isLoading: userHistoryLoading } = useQuery({
    queryKey: ["user-history", historyUser?.id],
    queryFn: () => apiFetch<{
      sessions: UserHistorySession[];
      summary: { totalSessions: number; activeSessions: number; totalDataUsed: string; totalSessionDuration: string; avgSessionDuration: string };
    }>(`/api/hotspot/users/${historyUser!.id}/history`),
    staleTime: 30_000,
    enabled: !!historyUser && historyDialogOpen,
  });

  // ─── Derived data ────────────────────────────────
  const locations: HotspotLocation[] = data?.locations || [];
  const plans: HotspotPlan[] = data?.plans || [];
  const activeUsers: ActiveUser[] = data?.activeUsers || [];
  const revenueToday = data?.revenueToday || 0;
  const totalActiveUsers = locations.reduce((s, l) => s + l.activeUsers, 0);
  const vouchersSold = plans.reduce((s, p) => s + p.activeUsers, 0);
  const vouchers: Voucher[] = vouchersData?.vouchers || [];
  const revenueData = revenueRes?.revenue || [];
  const totalMonthlyRevenue = revenueData.reduce((s, r) => s + r.totalRevenue, 0);
  const revenueChartData = revenueData.map((r) => ({ areaName: r.areaName, totalRevenue: r.totalRevenue }));

  const voucherStats = {
    active: vouchers.filter((v) => v.status === "ACTIVE").length,
    used: vouchers.filter((v) => v.status === "USED").length,
    expired: vouchers.filter((v) => v.status === "EXPIRED").length,
    totalValue: vouchers.reduce((s, v) => s + (v.denomination || 0), 0),
  };

  const dashboardStats = dashboardData
    ? {
        activeUsers: dashboardData.activeUsers,
        bandwidthToday: dashboardData.bandwidthToday,
        sessionsToday: dashboardData.sessionsToday,
        revenueThisMonth: dashboardData.revenueThisMonth,
        plans: dashboardData.hotspotPlanCount,
        locations: dashboardData.activeLocations,
        trendData: dashboardData.trendData,
      }
    : {
        activeUsers: totalActiveUsers,
        bandwidthToday: 0,
        sessionsToday: 0,
        revenueThisMonth: 0,
        plans: plans.length,
        locations: locations.length,
        trendData: [] as { date: string; sessions: number; bandwidth: number }[],
      };

  const formatBytes = (b: number) => {
    if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
    if (b >= 1048576) return `${(b / 1048576).toFixed(0)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${b} B`;
  };

  // ─── Mutations ──────────────────────────────────────
  const locationMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiFetch("/api/hotspot", { method: "POST", body: JSON.stringify(body) });
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: (_, variables) => {
      const isEdit = variables.action === "update-location";
      toast.success(isEdit ? "Location updated" : "Location added");
      queryClient.invalidateQueries({ queryKey: ["hotspot"] });
      setLocDialogOpen(false);
      setEditingLoc(null);
      resetLocForm();
    },
    onError: (err) => toast.error(err.message || "Failed to save location"),
  });

  const planMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiFetch("/api/hotspot", { method: "POST", body: JSON.stringify(body) });
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: (_, variables) => {
      const isEdit = variables.action === "update-plan";
      toast.success(isEdit ? "Plan updated" : "Plan added");
      queryClient.invalidateQueries({ queryKey: ["hotspot"] });
      setPlanDialogOpen(false);
      setEditingPlan(null);
      resetPlanForm();
    },
    onError: (err) => toast.error(err.message || "Failed to save plan"),
  });

  const deleteLocMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/hotspot", { method: "POST", body: JSON.stringify({ action: "delete-location", id }) }),
    onSuccess: () => { toast.success("Location deleted"); queryClient.invalidateQueries({ queryKey: ["hotspot"] }); setDeleteLocTarget(null); },
    onError: () => toast.error("Failed to delete location"),
  });

  const deletePlanMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/hotspot", { method: "POST", body: JSON.stringify({ action: "delete-plan", id }) }),
    onSuccess: () => { toast.success("Plan deleted"); queryClient.invalidateQueries({ queryKey: ["hotspot"] }); setDeletePlanTarget(null); },
    onError: () => toast.error("Failed to delete plan"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/hotspot", { method: "POST", body: JSON.stringify({ action: "disconnect-user", id }) }),
    onSuccess: () => { toast.success("User disconnected"); queryClient.invalidateQueries({ queryKey: ["hotspot"] }); setDisconnectTarget(null); },
    onError: () => toast.error("Failed to disconnect user"),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hotspot/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `hotspot-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
    },
    onSuccess: () => toast.success("CSV exported successfully"),
    onError: () => toast.error("Failed to export CSV"),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiFetch("/api/hotspot", { method: "POST", body: JSON.stringify(body) });
      if (res.error) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      toast.success(`${res.count || 1} plans created`);
      queryClient.invalidateQueries({ queryKey: ["hotspot"] });
      setBulkDialogOpen(false);
    },
    onError: (err) => toast.error(err.message || "Failed to create plans"),
  });

  // ─── Form helpers ───────────────────────────────────
  function resetLocForm() { setLocForm({ name: "", type: "Hotel", address: "", apCount: "1", status: "Active" }); }
  function resetPlanForm() { setPlanForm({ name: "", planType: "TIME_BASED", speed: "10", limit: "1 hour", price: "30", status: "Active", ipv6Enabled: false }); }

  function openEditLoc(loc: HotspotLocation) {
    setEditingLoc(loc);
    setLocForm({ name: loc.name, type: loc.type, address: loc.address, apCount: String(loc.apCount), status: loc.status });
    setLocDialogOpen(true);
  }

  function openEditPlan(plan: HotspotPlan) {
    setEditingPlan(plan);
    setPlanForm({ name: plan.name, planType: plan.planType, speed: String(plan.speed), limit: plan.limit, price: String(plan.price), status: plan.status, ipv6Enabled: plan.ipv6Enabled || false });
    setPlanDialogOpen(true);
  }

  function openUserHistory(user: ActiveUser) {
    setHistoryUser(user);
    setHistoryDialogOpen(true);
  }

  function saveLocation() {
    if (!locForm.name) return toast.error("Location name is required");
    const action = editingLoc ? "update-location" : "create-location";
    const body: Record<string, unknown> = { action, name: locForm.name, type: locForm.type, address: locForm.address };
    if (editingLoc) { body.id = editingLoc.id; body.status = locForm.status; }
    locationMutation.mutate(body);
  }

  function savePlan() {
    if (!planForm.name) return toast.error("Plan name is required");
    const action = editingPlan ? "update-plan" : "create-plan";
    const body: Record<string, unknown> = {
      action, name: planForm.name,
      speed: parseInt(planForm.speed) || 10,
      price: parseFloat(planForm.price) || 0,
      planType: planForm.planType,
      limit: planForm.limit,
      status: planForm.status,
      ipv6Enabled: planForm.ipv6Enabled,
    };
    if (editingPlan) body.id = editingPlan.id;
    planMutation.mutate(body);
  }

  function handleBulkCreate() {
    const count = Math.min(Math.max(parseInt(bulkForm.count) || 1, 2), 20);
    const baseSpeed = parseInt(bulkForm.baseSpeed) || 10;
    const speedInc = parseInt(bulkForm.speedIncrement) || 0;
    const basePrice = parseFloat(bulkForm.basePrice) || 0;
    const priceInc = parseFloat(bulkForm.priceIncrement) || 0;
    const planNames: { name: string; speed: number; price: number }[] = [];
    for (let i = 1; i <= count; i++) {
      planNames.push({
        name: `${bulkForm.prefix}${i}`,
        speed: baseSpeed + (i - 1) * speedInc,
        price: Math.round((basePrice + (i - 1) * priceInc) * 100) / 100,
      });
    }
    bulkCreateMutation.mutate({
      action: "bulk-create-plans",
      plans: planNames.map((p) => ({ ...p, planType: bulkForm.planType, limit: bulkForm.limit, status: "Active" })),
    });
  }

  // ─── Filters ────────────────────────────────────────
  const filteredLocations = locations.filter((l) => !locSearch || l.name.toLowerCase().includes(locSearch.toLowerCase()) || l.address.toLowerCase().includes(locSearch.toLowerCase()));
  const filteredPlans = plans.filter((p) => !planSearch || p.name.toLowerCase().includes(planSearch.toLowerCase()));
  const filteredUsers = activeUsers.filter((u) => !userSearch || u.username.toLowerCase().includes(userSearch.toLowerCase()) || u.location.toLowerCase().includes(userSearch.toLowerCase()));
  const filteredVouchers = vouchers;

  const paginatedLocations = filteredLocations.slice((locPage - 1) * LOC_PAGE_SIZE, locPage * LOC_PAGE_SIZE);
  const totalLocPages = Math.ceil(filteredLocations.length / LOC_PAGE_SIZE);
  const paginatedPlans = filteredPlans.slice((planPage - 1) * PLAN_PAGE_SIZE, planPage * PLAN_PAGE_SIZE);
  const totalPlanPages = Math.ceil(filteredPlans.length / PLAN_PAGE_SIZE);
  const paginatedUsers = filteredUsers.slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);
  const totalUserPages = Math.ceil(filteredUsers.length / USER_PAGE_SIZE);
  const paginatedVouchers = filteredVouchers.slice((voucherPage - 1) * VOUCHER_PAGE_SIZE, voucherPage * VOUCHER_PAGE_SIZE);
  const totalVoucherPages = Math.ceil(filteredVouchers.length / VOUCHER_PAGE_SIZE);

  // ─── Loading Skeleton ──────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><div className="h-7 w-40 bg-muted animate-pulse rounded" /><div className="h-4 w-64 mt-2 bg-muted animate-pulse rounded" /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
        <div className="h-96 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hotspot & WiFi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage hotspot locations, plans, and connected users</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Dialog open={locDialogOpen} onOpenChange={(o) => { setLocDialogOpen(o); if (!o) { setEditingLoc(null); resetLocForm(); } }}>
            <DialogTrigger asChild>
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"><Plus className="h-4 w-4 mr-2" />Add Location</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingLoc ? "Edit Location" : "Add Hotspot Location"}</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div><label className="text-sm font-medium mb-1 block">Location Name *</label><Input value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} placeholder="Grand Hotel Lobby" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm font-medium mb-1 block">Type *</label><Select value={locForm.type} onValueChange={(v) => setLocForm({ ...locForm, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LOCATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                  <div><label className="text-sm font-medium mb-1 block">AP Count</label><Input type="number" value={locForm.apCount} onChange={(e) => setLocForm({ ...locForm, apCount: e.target.value })} /></div>
                </div>
                <div><label className="text-sm font-medium mb-1 block">Address</label><Input value={locForm.address} onChange={(e) => setLocForm({ ...locForm, address: e.target.value })} placeholder="42 MG Road, Sector 15" /></div>
                <div className="flex items-center gap-3"><Switch checked={locForm.status === "Active"} onCheckedChange={(c) => setLocForm({ ...locForm, status: c ? "Active" : "Inactive" })} /><label className="text-sm font-medium">Active</label></div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => { setLocDialogOpen(false); setEditingLoc(null); resetLocForm(); }}>Cancel</Button>
                  <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={saveLocation} disabled={!locForm.name || locationMutation.isPending}>
                    {locationMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingLoc ? "Update" : "Add Location"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={planDialogOpen} onOpenChange={(o) => { setPlanDialogOpen(o); if (!o) { setEditingPlan(null); resetPlanForm(); } }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="h-4 w-4 mr-2" />Add Plan</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingPlan ? "Edit Plan" : "Add Hotspot Plan"}</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div><label className="text-sm font-medium mb-1 block">Plan Name *</label><Input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Quick Browse" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm font-medium mb-1 block">Type *</label><Select value={planForm.planType} onValueChange={(v) => setPlanForm({ ...planForm, planType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLAN_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
                  <div><label className="text-sm font-medium mb-1 block">Speed (Mbps) *</label><Input type="number" value={planForm.speed} onChange={(e) => setPlanForm({ ...planForm, speed: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm font-medium mb-1 block">Duration / Data Limit</label><Input value={planForm.limit} onChange={(e) => setPlanForm({ ...planForm, limit: e.target.value })} placeholder={planForm.planType === "UNLIMITED" ? "Unlimited" : "1 hour"} /></div>
                  <div><label className="text-sm font-medium mb-1 block">Price (₹) *</label><Input type="number" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} /></div>
                </div>
                <div className="flex items-center gap-3"><Switch checked={planForm.status === "Active"} onCheckedChange={(c) => setPlanForm({ ...planForm, status: c ? "Active" : "Inactive" })} /><label className="text-sm font-medium">Active</label></div>
                {isModuleEnabled("ipv6") && (
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">IPv6 Support</label>
                    <Switch checked={planForm.ipv6Enabled} onCheckedChange={(v) => setPlanForm({ ...planForm, ipv6Enabled: v })} />
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => { setPlanDialogOpen(false); setEditingPlan(null); resetPlanForm(); }}>Cancel</Button>
                  <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={savePlan} disabled={!planForm.name || planMutation.isPending}>
                    {planMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingPlan ? "Update" : "Add Plan"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {/* Bulk Create Dialog */}
          <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Bulk Create Plans</DialogTitle></DialogHeader>
              <p className="text-xs text-muted-foreground">Auto-generate multiple plans with incrementing speed and price. Example: Hourly_1, Hourly_2, etc.</p>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm font-medium mb-1 block">Base Name *</label><Input value={bulkForm.prefix} onChange={(e) => setBulkForm({ ...bulkForm, prefix: e.target.value })} placeholder="Hourly_" /></div>
                  <div><label className="text-sm font-medium mb-1 block">Count (2-20) *</label><Input type="number" min={2} max={20} value={bulkForm.count} onChange={(e) => setBulkForm({ ...bulkForm, count: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm font-medium mb-1 block">Min Speed (Mbps)</label><Input type="number" value={bulkForm.baseSpeed} onChange={(e) => setBulkForm({ ...bulkForm, baseSpeed: e.target.value })} /></div>
                  <div><label className="text-sm font-medium mb-1 block">Max Speed (Mbps)</label><Input type="number" value={bulkForm.speedIncrement === "0" ? bulkForm.baseSpeed : String(parseInt(bulkForm.baseSpeed) + parseInt(bulkForm.speedIncrement) * (parseInt(bulkForm.count) - 1))} disabled /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm font-medium mb-1 block">Base Price (₹)</label><Input type="number" value={bulkForm.basePrice} onChange={(e) => setBulkForm({ ...bulkForm, basePrice: e.target.value })} /></div>
                  <div><label className="text-sm font-medium mb-1 block">Price Increment (₹)</label><Input type="number" value={bulkForm.priceIncrement} onChange={(e) => setBulkForm({ ...bulkForm, priceIncrement: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm font-medium mb-1 block">Plan Type</label><Select value={bulkForm.planType} onValueChange={(v) => setBulkForm({ ...bulkForm, planType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLAN_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
                  <div><label className="text-sm font-medium mb-1 block">Limit</label><Input value={bulkForm.limit} onChange={(e) => setBulkForm({ ...bulkForm, limit: e.target.value })} /></div>
                </div>
                <div className="border rounded-lg p-3 bg-muted/30">
                  <p className="text-xs font-medium mb-2">Preview ({Math.min(parseInt(bulkForm.count) || 2, 20)} plans):</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {Array.from({ length: Math.min(parseInt(bulkForm.count) || 2, 20) }).map((_, i) => {
                      const speed = (parseInt(bulkForm.baseSpeed) || 10) + i * (parseInt(bulkForm.speedIncrement) || 0);
                      const price = ((parseFloat(bulkForm.basePrice) || 0) + i * (parseFloat(bulkForm.priceIncrement) || 0)).toFixed(0);
                      return <p key={i} className="text-xs text-muted-foreground">{bulkForm.prefix}{i + 1}: {speed} Mbps — ₹{price}</p>;
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
                  <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={handleBulkCreate} disabled={bulkCreateMutation.isPending || (parseInt(bulkForm.count) < 2 || parseInt(bulkForm.count) > 20)}>
                    {bulkCreateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create {bulkForm.count} Plans
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Locations" value={locations.length} subtitle="All hotspot zones" icon={MapPin} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Active Users" value={totalActiveUsers} subtitle="Currently connected" icon={Users} gradient="stat-gradient-green" delay={75} />
        <StatCard title="Revenue Today" value={formatINR(revenueToday)} subtitle="From hotspot sales" icon={IndianRupee} gradient="stat-gradient-blue" delay={150} />
        <StatCard title="Vouchers Sold" value={vouchersSold} subtitle="This month" icon={Ticket} gradient="stat-gradient-purple" delay={225} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 flex-wrap">
          <TabsTrigger value="dashboard"><Activity className="h-3.5 w-3.5 mr-1.5" />Dashboard</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="users">Active Users</TabsTrigger>
          <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
          <TabsTrigger value="data-history">History</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════
            FEATURE 5: Usage Analytics Dashboard (first tab)
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="dashboard">
          {dashboardLoading ? (
            <div className="flex items-center justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading dashboard...</span></div>
          ) : (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-md bg-green-100 dark:bg-green-900/30"><Users className="h-4 w-4 text-green-600" /></div>
                      <span className="text-xs text-muted-foreground">Active Users</span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums">{dashboardStats.activeUsers}</p>
                    <div className="mt-2"><MiniSparkline data={dashboardStats.trendData} dataKey="sessions" color="#22C55E" /></div>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-md bg-teal-100 dark:bg-teal-900/30"><Database className="h-4 w-4 text-teal-600" /></div>
                      <span className="text-xs text-muted-foreground">Bandwidth Today</span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums">{formatBytes(dashboardStats.bandwidthToday)}</p>
                    <div className="mt-2"><MiniSparkline data={dashboardStats.trendData} dataKey="bandwidth" color="#3B82F6" /></div>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-md bg-orange-100 dark:bg-orange-900/30"><Wifi className="h-4 w-4 text-orange-600" /></div>
                      <span className="text-xs text-muted-foreground">Sessions Today</span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums">{dashboardStats.sessionsToday}</p>
                    <div className="mt-2"><MiniSparkline data={dashboardStats.trendData} dataKey="sessions" color="#F97316" /></div>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-900/30"><IndianRupee className="h-4 w-4 text-red-600" /></div>
                      <span className="text-xs text-muted-foreground">Revenue This Month</span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums">{formatINR(dashboardStats.revenueThisMonth)}</p>
                    <div className="mt-1 text-xs text-muted-foreground">{dashboardStats.locations} active locations · {dashboardStats.plans} plans</div>
                  </CardContent>
                </Card>
              </div>

              {/* IPv6 Awareness */}
              {isModuleEnabled("ipv6") && (
                <div className="p-3 bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-cyan-600" />
                    <p className="text-sm font-medium">IPv6 Hotspot</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">IPv6-connected devices are tracked and billed through the same RADIUS session.</p>
                </div>
              )}

              {/* Trend Chart */}
              {dashboardStats.trendData.length > 0 && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">7-Day Trend</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={dashboardStats.trendData}>
                        <defs>
                          <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22C55E" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gradBandwidth" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                        <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                        <YAxis yAxisId="left" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `${v} MB`} />
                        <Tooltip />
                        <Legend />
                        <Area yAxisId="left" type="monotone" dataKey="sessions" name="Sessions" stroke="#22C55E" fill="url(#gradSessions)" strokeWidth={2} />
                        <Area yAxisId="right" type="monotone" dataKey="bandwidth" name="Bandwidth (MB)" stroke="#3B82F6" fill="url(#gradBandwidth)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
            Locations Tab
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="locations">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search locations..." value={locSearch} onChange={(e) => setLocSearch(e.target.value)} className="pl-8" />
                </div>
                <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}><RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /></Button>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Location</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Address</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-center">APs</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-center">Users</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Bandwidth</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLocations.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No locations found.</TableCell></TableRow>
                    ) : paginatedLocations.map((loc) => {
                      const LocIcon = LOCATION_ICONS[loc.type] || MapPin;
                      return (
                        <TableRow key={loc.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-md bg-muted"><LocIcon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                              <span className="text-sm font-medium">{loc.name}</span>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{loc.type}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{loc.address}</TableCell>
                          <TableCell className="text-center text-sm tabular-nums">{loc.apCount}</TableCell>
                          <TableCell className="text-center text-sm tabular-nums">{loc.activeUsers}</TableCell>
                          <TableCell className="text-sm">{loc.bandwidthUsed}</TableCell>
                          <TableCell><Badge variant="outline" className={loc.status === "Active" ? "badge-active" : "badge-disconnected"}>{loc.status}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditLoc(loc)}><Edit2 className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteLocTarget(loc)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <Pagination page={locPage} totalPages={totalLocPages} setPage={setLocPage} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
            Plans Tab + FEATURE 6: Bulk Plan Creation button
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="plans">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search plans..." value={planSearch} onChange={(e) => setPlanSearch(e.target.value)} className="pl-8" />
                </div>
                <Button variant="outline" className="border-dashed" onClick={() => setBulkDialogOpen(true)}>
                  <Layers className="h-4 w-4 mr-2" />Bulk Create
                </Button>
              </div>
              {paginatedPlans.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">No hotspot plans found. Click &quot;Add Plan&quot; or &quot;Bulk Create&quot; to get started.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paginatedPlans.map((plan) => (
                    <Card key={plan.id} className="border shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{plan.name}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">{plan.planType.replace("_", " ")} Plan</p>
                          </div>
                          <Badge variant="outline" className={plan.status === "Active" ? "badge-active" : "badge-disconnected"}>{plan.status}</Badge>
                          {isModuleEnabled("ipv6") && plan.ipv6Enabled && (
                            <Badge variant="outline" className="bg-cyan-100 text-cyan-700 border-cyan-200 text-[10px]">
                              <Globe className="h-2.5 w-2.5 mr-0.5" />IPv6
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2 text-sm"><Zap className="h-4 w-4 text-[#DC2626]" /><span>{plan.speed} Mbps</span></div>
                        <div className="flex items-center gap-2 text-sm">
                          {plan.planType === "TIME_BASED" ? <Clock className="h-4 w-4 text-muted-foreground" /> : <HardDrive className="h-4 w-4 text-muted-foreground" />}
                          <span>{plan.limit}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-muted-foreground" /><span>{plan.activeUsers} active users</span></div>
                        <div className="flex items-center justify-between pt-3 border-t">
                          <span className="text-xl font-bold">₹{plan.price}</span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPlan(plan)}><Edit2 className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeletePlanTarget(plan)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <Pagination page={planPage} totalPages={totalPlanPages} setPage={setPlanPage} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
            Users Tab + FEATURE 2: Per-user History button
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="users">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by username or location..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="pl-8" />
                </div>
                <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}><RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /></Button>
                <Badge variant="outline" className="text-xs shrink-0 h-9 px-3 flex items-center">
                  <div className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />Auto-refresh 30s
                </Badge>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Username</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Location</TableHead>
                      <TableHead className="text-xs font-medium uppercase">IP</TableHead>
                      <TableHead className="text-xs font-medium uppercase">MAC</TableHead>
                      {isModuleEnabled("ipv6") && (
                        <TableHead className="text-xs font-medium uppercase hidden md:table-cell">IPv6 Address</TableHead>
                      )}
                      <TableHead className="text-xs font-medium uppercase">Connected Since</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Data Used</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Remaining</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedUsers.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No active users found.</TableCell></TableRow>
                    ) : filteredUsers.map((user) => (
                      <TableRow key={user.id} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell><div className="flex items-center gap-2"><Wifi className="h-3.5 w-3.5 text-[#DC2626]" /><span className="text-sm font-mono font-medium">{user.username}</span></div></TableCell>
                        <TableCell className="text-sm">{user.location || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{user.ip || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{user.mac || "—"}</TableCell>
                        {isModuleEnabled("ipv6") && (
                          <TableCell className="hidden md:table-cell font-mono text-xs">{user.ipv6Address || "—"}</TableCell>
                        )}
                        <TableCell className="text-xs">{user.connectedSince}</TableCell>
                        <TableCell className="text-sm tabular-nums">{user.dataUsed}</TableCell>
                        <TableCell className="text-xs">{user.timeRemaining}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-teal-600 hover:text-teal-700 hover:bg-teal-50" onClick={() => openUserHistory(user)}>
                              <History className="h-3.5 w-3.5 mr-1" />History
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDisconnectTarget(user)}>
                              <UserX className="h-3.5 w-3.5 mr-1" />Disconnect
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination page={userPage} totalPages={totalUserPages} setPage={setUserPage} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
            FEATURE 1: Voucher Management Tab
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="vouchers">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Voucher Management</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search vouchers..." value={voucherSearch} onChange={(e) => setVoucherSearch(e.target.value)} className="pl-8 h-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex gap-3 mb-4">
                <Select value={voucherStatus} onValueChange={(v) => { setVoucherStatus(v); setVoucherPage(1); }}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent><SelectItem value="ALL">All</SelectItem><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="USED">Used</SelectItem><SelectItem value="EXPIRED">Expired</SelectItem><SelectItem value="CANCELLED">Cancelled</SelectItem></SelectContent>
                </Select>
              </div>
              {voucherLoading ? (
                <div className="flex items-center justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading vouchers...</span></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 p-3"><p className="text-xs text-green-600 font-medium">Active</p><p className="text-lg font-bold text-green-700">{voucherStats.active}</p></div>
                    <div className="rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-200 p-3"><p className="text-xs text-teal-600 font-medium">Used</p><p className="text-lg font-bold text-teal-700">{voucherStats.used}</p></div>
                    <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 p-3"><p className="text-xs text-orange-600 font-medium">Expired</p><p className="text-lg font-bold text-orange-700">{voucherStats.expired}</p></div>
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 p-3"><p className="text-xs text-red-600 font-medium">Total Value</p><p className="text-lg font-bold text-red-700">{formatINR(voucherStats.totalValue)}</p></div>
                  </div>
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs font-medium uppercase">Code</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Denomination</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Plan</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Validity</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Used By</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedVouchers.length === 0 ? (
                          <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No vouchers found.</TableCell></TableRow>
                        ) : paginatedVouchers.map((v) => (
                          <TableRow key={v.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell className="font-mono text-xs font-medium">{v.code}</TableCell>
                            <TableCell className="text-sm font-semibold">{formatINR(v.denomination)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{v.plan?.name || "—"}</TableCell>
                            <TableCell className="text-xs">{v.validityDays}d</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{v.usedBySubscriber?.name || "—"}</TableCell>
                            <TableCell><Badge variant="outline" className={v.status === "ACTIVE" ? "bg-green-100 text-green-700" : v.status === "USED" ? "bg-teal-100 text-teal-700" : v.status === "EXPIRED" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}>{v.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination page={voucherPage} totalPages={totalVoucherPages} setPage={setVoucherPage} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
            FEATURE 2 (continued): Data History Tab
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="data-history">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">User Data & Bandwidth History</CardTitle>
              <p className="text-xs text-muted-foreground">View historical usage data for sessions</p>
            </CardHeader>
            <CardContent className="p-4">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Username</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Session Start</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Duration</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Download</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Upload</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Total</TableHead>
                      <TableHead className="text-xs font-medium uppercase">MAC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataHistoryLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : !dataHistory?.history?.length ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No data history available. Recent sessions will appear here.</TableCell></TableRow>
                    ) : dataHistory.history.map((d) => (
                      <TableRow key={d.id} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell className="text-xs font-mono">{d.username}</TableCell>
                        <TableCell className="text-xs">{d.sessionStart}</TableCell>
                        <TableCell className="text-xs tabular-nums">{d.duration}</TableCell>
                        <TableCell className="text-xs text-teal-600">{d.download}</TableCell>
                        <TableCell className="text-xs text-purple-600">{d.upload}</TableCell>
                        <TableCell className="text-xs font-semibold">{d.total}</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{d.mac || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
            FEATURE 3: Revenue Reports Per Location
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="revenue">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Revenue Reports by Location</CardTitle>
              <p className="text-xs text-muted-foreground">Monthly recurring revenue distribution across locations</p>
            </CardHeader>
            <CardContent className="p-4">
              {revenueLoading ? (
                <div className="flex items-center justify-center py-16"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading revenue data...</span></div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white p-4 shadow-lg">
                      <p className="text-xs opacity-80">Total Monthly Revenue</p>
                      <p className="text-2xl font-bold">{formatINR(totalMonthlyRevenue)}</p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 text-white p-4 shadow-lg">
                      <p className="text-xs opacity-80">Active Subscribers</p>
                      <p className="text-2xl font-bold">{revenueData.reduce((s, r) => s + r.activeSubscribers, 0)}</p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-green-500 to-green-600 text-white p-4 shadow-lg">
                      <p className="text-xs opacity-80">Avg Revenue/Subscriber</p>
                      <p className="text-2xl font-bold">{revenueData.length > 0 ? formatINR(Math.round(totalMonthlyRevenue / Math.max(revenueData.reduce((s, r) => s + r.activeSubscribers, 0), 1))) : "₹0"}</p>
                    </div>
                  </div>
                  <Card className="border shadow-sm mb-4">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Revenue by Location</CardTitle></CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={revenueChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="areaName" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} height={60} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: number, _n: string, props: any) => [formatINR(props?.payload?.totalRevenue ?? v), "Revenue"]} />
                          <Bar dataKey="totalRevenue" name="Revenue" fill="#DC2626" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs font-medium uppercase">Location</TableHead>
                          <TableHead className="text-xs font-medium uppercase text-right">Subscribers</TableHead>
                          <TableHead className="text-xs font-medium uppercase text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {revenueData.length === 0 ? (
                          <TableRow><TableCell colSpan={3} className="text-center py-12 text-muted-foreground">No revenue data available.</TableCell></TableRow>
                        ) : revenueData.map((r) => (
                          <TableRow key={r.areaId} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell className="text-sm font-medium">{r.areaName}</TableCell>
                            <TableCell className="text-right text-sm tabular-nums">{r.activeSubscribers}</TableCell>
                            <TableCell className="text-right text-sm font-semibold text-green-600">{formatINR(r.totalRevenue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
            FEATURE 4: Plan Analytics Tab with donut chart
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="analytics">
          {analyticsData ? (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border shadow-sm"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{formatINR(analyticsData.summary.totalRevenue)}</p>
                  <p className="text-xs text-muted-foreground">Total Revenue</p>
                </CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{formatINR(analyticsData.summary.avgRevenuePerUser)}</p>
                  <p className="text-xs text-muted-foreground">Avg Revenue / User</p>
                </CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{analyticsData.summary.peakConcurrent}</p>
                  <p className="text-xs text-muted-foreground">Peak Concurrent</p>
                </CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center">
                  <p className="text-lg font-bold">{analyticsData.summary.popularPlan || "—"}</p>
                  <p className="text-xs text-muted-foreground">Most Popular Plan</p>
                </CardContent></Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* FEATURE 4a: Plan Popularity Donut Chart */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Plan Popularity</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    {analyticsData.planDistribution.length > 0 ? (
                      <div className="h-64 flex items-center">
                        <ResponsiveContainer width="60%" height="100%">
                          <PieChart>
                            <Pie data={analyticsData.planDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="count" nameKey="name" paddingAngle={2} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                              {analyticsData.planDistribution.map((_entry, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => [`${value} users`, "Subscribers"]} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-2 pl-2">
                          {analyticsData.planDistribution.slice(0, 6).map((plan, i) => (
                            <div key={plan.name} className="flex items-center gap-2 text-xs">
                              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="truncate">{plan.name}</span>
                              <span className="ml-auto font-medium tabular-nums">{plan.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No plan data available.</div>}
                  </CardContent>
                </Card>

                {/* FEATURE 4b: Active Users Per Plan (Bar Chart) */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Active Users Per Plan</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    {analyticsData.planDistribution.length > 0 ? (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analyticsData.planDistribution}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                            <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} angle={-30} textAnchor="end" interval={0} height={60} />
                            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="count" name="Active Users" fill="#DC2626" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No plan data available.</div>}
                  </CardContent>
                </Card>

                {/* FEATURE 4c: Revenue Per Plan (Horizontal Bar) */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Revenue Per Plan</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    {analyticsData.planDistribution.length > 0 ? (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analyticsData.planDistribution} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                            <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                            <YAxis type="category" dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} width={120} />
                            <Tooltip formatter={(v: number) => formatINR(v)} />
                            <Bar dataKey="revenue" name="Revenue" fill="#22C55E" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No revenue data available.</div>}
                  </CardContent>
                </Card>

                {/* Revenue by Location */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Revenue by Location</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    {analyticsData.revenueByLocation.length > 0 ? (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analyticsData.revenueByLocation} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                            <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                            <YAxis type="category" dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} width={120} />
                            <Tooltip formatter={(v: number) => formatINR(v)} />
                            <Bar dataKey="revenue" name="Revenue" fill="#F97316" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No revenue data available.</div>}
                  </CardContent>
                </Card>
              </div>

              {/* Location Usage Table */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Location Usage Details</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  {analyticsData.locationUsage.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="text-xs">Location</TableHead>
                          <TableHead className="text-xs text-center">Active Users</TableHead>
                          <TableHead className="text-xs">Bandwidth Used</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {analyticsData.locationUsage.map((loc) => (
                            <TableRow key={loc.name} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="text-sm">{loc.name}</TableCell><TableCell className="text-center text-sm tabular-nums">{loc.activeUsers}</TableCell><TableCell className="text-sm">{loc.bandwidthUsed}</TableCell></TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">No location usage data.</div>}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading analytics...</span>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Location Confirmation */}
      <AlertDialog open={!!deleteLocTarget} onOpenChange={(open) => { if (!open) setDeleteLocTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete <strong>{deleteLocTarget?.name}</strong>? This will remove the hotspot location and all associated configuration.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLocMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteLocTarget && deleteLocMutation.mutate(deleteLocTarget.id)} disabled={deleteLocMutation.isPending} className="bg-red-600 hover:bg-red-700">
              {deleteLocMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Plan Confirmation */}
      <AlertDialog open={!!deletePlanTarget} onOpenChange={(open) => { if (!open) setDeletePlanTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Hotspot Plan</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete plan <strong>{deletePlanTarget?.name}</strong> (₹{deletePlanTarget?.price})? Active subscribers on this plan will not be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePlanMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletePlanTarget && deletePlanMutation.mutate(deletePlanTarget.id)} disabled={deletePlanMutation.isPending} className="bg-red-600 hover:bg-red-700">
              {deletePlanMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disconnect User Confirmation */}
      <AlertDialog open={!!disconnectTarget} onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect User</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to disconnect <strong>{disconnectTarget?.username}</strong>? The user will need to re-authenticate to regain access.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => disconnectTarget && disconnectMutation.mutate(disconnectTarget.id)} disabled={disconnectMutation.isPending} className="bg-red-600 hover:bg-red-700">
              {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════════════════════════════════════════════════════════
          FEATURE 2: Per-User History Dialog
      ════════════════════════════════════════════════════════ */}
      <Dialog open={historyDialogOpen} onOpenChange={(open) => { setHistoryDialogOpen(open); if (!open) setHistoryUser(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Session History</DialogTitle>
            <p className="text-xs text-muted-foreground">
              {historyUser?.username} · IP: {historyUser?.ip || "—"} · MAC: {historyUser?.mac || "—"}
            </p>
            {isModuleEnabled("ipv6") && historyUser?.ipv6Address && (
              <div className="flex items-center gap-2 text-xs">
                <Globe className="h-3 w-3 text-cyan-500" />
                <span className="text-muted-foreground">IPv6:</span>
                <span className="font-mono">{historyUser.ipv6Address}</span>
              </div>
            )}
          </DialogHeader>
          {userHistoryLoading ? (
            <div className="flex items-center justify-center py-16"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading history...</span></div>
          ) : userHistoryData ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center"><p className="text-xs text-muted-foreground">Total Sessions</p><p className="text-lg font-bold">{userHistoryData.summary.totalSessions}</p></div>
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3 text-center"><p className="text-xs text-green-600">Active</p><p className="text-lg font-bold text-green-700">{userHistoryData.summary.activeSessions}</p></div>
                <div className="rounded-lg bg-teal-50 dark:bg-teal-950/30 p-3 text-center"><p className="text-xs text-teal-600">Total Data</p><p className="text-lg font-bold text-teal-700">{userHistoryData.summary.totalDataUsed}</p></div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3 text-center"><p className="text-xs text-orange-600">Total Duration</p><p className="text-sm font-bold text-orange-700">{userHistoryData.summary.totalSessionDuration}</p></div>
                <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-3 text-center"><p className="text-xs text-purple-600">Avg Duration</p><p className="text-sm font-bold text-purple-700">{userHistoryData.summary.avgSessionDuration}</p></div>
              </div>
              {/* Sessions Table */}
              <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Start</TableHead>
                      <TableHead className="text-xs">End</TableHead>
                      <TableHead className="text-xs">Duration</TableHead>
                      <TableHead className="text-xs text-right">Download</TableHead>
                      <TableHead className="text-xs text-right">Upload</TableHead>
                      <TableHead className="text-xs text-right">Total</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userHistoryData.sessions.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No session history found for this user.</TableCell></TableRow>
                    ) : userHistoryData.sessions.map((s) => (
                      <TableRow key={s.id} className="hover:bg-muted/50">
                        <TableCell className="text-xs">{s.startTime}</TableCell>
                        <TableCell className="text-xs">{s.stopTime}</TableCell>
                        <TableCell className="text-xs tabular-nums">{s.duration}</TableCell>
                        <TableCell className="text-xs text-right text-teal-600">{s.download}</TableCell>
                        <TableCell className="text-xs text-right text-purple-600">{s.upload}</TableCell>
                        <TableCell className="text-xs text-right font-semibold">{s.total}</TableCell>
                        <TableCell>
                          {s.isActive ? (
                            <Badge variant="outline" className="bg-green-100 text-green-700 text-[10px]">Active</Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">{s.terminateCause || "Ended"}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
