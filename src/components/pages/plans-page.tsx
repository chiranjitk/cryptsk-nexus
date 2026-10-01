"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatINR } from "@/lib/utils";
import {
  Zap, Plus, Pencil, Trash2, Star, Check, Archive, StarOff, LayoutGrid, List, Search, Copy,
  BarChart3, GitCompare, ArrowRightLeft, ChevronLeft, ChevronRight, Users, DollarSign,
  PieChart as PieChartIcon, TrendingUp, GripVertical,
  ArrowDown, ArrowUp, Home, Briefcase, Building2, Wifi, Cable, Radio, Layers,
  Info, Settings, Tag, Gauge, Sparkles, Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { toast } from "sonner";
import { useModuleStore } from "@/store/module-store";
import PageHeader from "@/components/page-header";

// ─── Types ──────────────────────────────────────────────
interface Plan {
  id: string; name: string; description: string; category: string;
  downloadSpeed: number; uploadSpeed: number; speedUnit: string;
  priceMonthly: number; priceQuarterly: number | null;
  priceHalfYearly: number | null; priceYearly: number | null;
  installationCharge: number; securityDeposit: number; routerRental: number;
  validityDays: number; cgstPercent: number; sgstPercent: number; igstPercent: number;
  dataLimitGb: number | null; contentionRatio: string;
  status: string; isPopular: boolean; sortOrder: number;
  downloadSpeedFup: number | null; uploadSpeedFup: number | null;
  burstSpeed: number | null; burstDuration: number | null;
  maxConcurrentSessions: number; freeTrialDays: number; slaUptime: number;
  ipv6Enabled: boolean;
  ipv6PrefixDelegation: boolean;
  ipv6DefaultPoolId: string | null;
  ipv6AssignmentMode: string;
  _count: { subscribers: number };
}

interface PaginatedResponse {
  items: Plan[]; total: number; page: number; limit: number; totalPages: number;
}

interface AnalyticsData {
  adoption: { planId: string; planName: string; category: string; subscribers: number }[];
  revenue: { planId: string | null; planName: string; totalRevenue: number; totalBilled: number; invoiceCount: number }[];
  categoryDistribution: { category: string; count: number }[];
  stats: { totalPlans: number; activePlans: number; totalSubscribers: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  FTTH: "FTTH", WIRELESS: "Wireless", CABLE: "Cable", LEASED_LINE: "Leased Line", HOTSPOT: "Hotspot", COMBO: "Combo",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  FTTH: Home, WIRELESS: Wifi, CABLE: Cable, LEASED_LINE: Building2, HOTSPOT: Radio, COMBO: Layers,
};

const CATEGORY_COLORS: Record<string, string> = {
  FTTH: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20",
  WIRELESS: "border-amber-500 bg-amber-50 dark:bg-amber-950/20",
  CABLE: "border-orange-500 bg-orange-50 dark:bg-orange-950/20",
  LEASED_LINE: "border-rose-500 bg-rose-50 dark:bg-rose-950/20",
  HOTSPOT: "border-teal-500 bg-teal-50 dark:bg-teal-950/20",
  COMBO: "border-pink-500 bg-pink-50 dark:bg-pink-950/20",
};

const CATEGORY_ICON_COLORS: Record<string, string> = {
  FTTH: "text-emerald-600",
  WIRELESS: "text-amber-600",
  CABLE: "text-orange-600",
  LEASED_LINE: "text-rose-600",
  HOTSPOT: "text-teal-600",
  COMBO: "text-pink-600",
};

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f97316", "#a855f7", "#06b6d4", "#ef4444", "#eab308", "#ec4899"];

const defaultForm = {
  name: "", description: "", category: "FTTH" as string, status: "ACTIVE" as string,
  downloadSpeed: 50, uploadSpeed: 50, speedUnit: "MBPS" as string,
  downloadSpeedFup: null as number | null, uploadSpeedFup: null as number | null,
  dataLimitGb: null as number | null, dataLimitUnit: "GB" as string,
  priceMonthly: 499, priceQuarterly: null as number | null,
  priceHalfYearly: null as number | null, priceYearly: null as number | null,
  installationCharge: 0, securityDeposit: 0, routerRental: 0,
  validityDays: 30, cgstPercent: 9, sgstPercent: 9, igstPercent: 0,
  contentionRatio: "1:10", isPopular: false, sortOrder: 0,
  burstSpeed: null as number | null, burstDuration: null as number | null,
  maxConcurrentSessions: 1, freeTrialDays: 0, slaUptime: 99.5,
  ipv6Enabled: false,
  ipv6PrefixDelegation: false,
  ipv6DefaultPoolId: null as string | null,
  ipv6AssignmentMode: "SLAAC" as string,
};

export default function PlansPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  const [activeTab, setActiveTab] = useState("plans");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [migrateSourceId, setMigrateSourceId] = useState<string | null>(null);
  const [migrateTargetId, setMigrateTargetId] = useState("");
  const [subscribersOpen, setSubscribersOpen] = useState(false);
  const [subscribersPlanId, setSubscribersPlanId] = useState<string | null>(null);
  const [subscribersPlanName, setSubscribersPlanName] = useState<string>("");

  const [form, setForm] = useState({ ...defaultForm });
  const [editForm, setEditForm] = useState({ ...defaultForm });

  // Drag-and-drop reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Fetch plans with pagination
  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["plans", page, limit, search, categoryFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      if (statusFilter) params.set("status", statusFilter);
      return apiFetch(`/api/plans?${params.toString()}`);
    },
  });

  const plans = data?.items ?? [];
  const totalPlans = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const activePlansCount = useMemo(() => plans.filter((p) => p.status === "ACTIVE").length, [plans]);

  // Fetch analytics
  const { data: analytics } = useQuery<AnalyticsData>({
    queryKey: ["plan-analytics"],
    queryFn: () => apiFetch("/api/plans/analytics"),
    enabled: activeTab === "analytics",
  });

  // Fetch subscribers for a specific plan
  const { data: planSubscribers, isLoading: loadingPlanSubs } = useQuery<{
    subscribers: { id: string; code: string; name: string; phone: string; email: string; status: string; connectionType: string }[];
    total: number;
  }>({
    queryKey: ["plan-subscribers", subscribersPlanId],
    queryFn: () => apiFetch(`/api/subscribers?planId=${subscribersPlanId}&limit=100`),
    enabled: subscribersOpen && !!subscribersPlanId,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiFetch("/api/plans", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d: any) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Plan created successfully");
      setAddOpen(false);
      setForm({ ...defaultForm });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Plan> }) => apiFetch(`/api/plans/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (d: any) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Plan updated");
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/plans/${id}`, { method: "DELETE" }),
    onSuccess: (d: any) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Plan deleted");
      setDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  const migrateMutation = useMutation({
    mutationFn: (body: { sourcePlanId: string; targetPlanId: string }) =>
      apiFetch("/api/plans/migrate", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d: any) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success(d.message || "Migration completed");
      setMigrateOpen(false);
      setMigrateTargetId("");
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-analytics"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Migration failed");
    },
  });

  const togglePopular = (plan: Plan) => {
    updateMutation.mutate({ id: plan.id, body: { isPopular: !plan.isPopular } });
  };

  const toggleStatus = (plan: Plan) => {
    const newStatus = plan.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    updateMutation.mutate({ id: plan.id, body: { status: newStatus } });
  };

  const openEdit = (plan: Plan) => {
    setSelectedId(plan.id);
    setEditForm({
      name: plan.name, description: plan.description, category: plan.category,
      status: plan.status,
      downloadSpeed: plan.downloadSpeed, uploadSpeed: plan.uploadSpeed, speedUnit: plan.speedUnit,
      downloadSpeedFup: plan.downloadSpeedFup, uploadSpeedFup: plan.uploadSpeedFup,
      dataLimitGb: plan.dataLimitGb, dataLimitUnit: plan.dataLimitGb ? "GB" : "UNLIMITED",
      priceMonthly: plan.priceMonthly, priceQuarterly: plan.priceQuarterly,
      priceHalfYearly: plan.priceHalfYearly, priceYearly: plan.priceYearly,
      installationCharge: plan.installationCharge,
      securityDeposit: plan.securityDeposit, routerRental: plan.routerRental,
      validityDays: plan.validityDays, cgstPercent: plan.cgstPercent,
      sgstPercent: plan.sgstPercent, igstPercent: plan.igstPercent,
      contentionRatio: plan.contentionRatio,
      isPopular: plan.isPopular, sortOrder: plan.sortOrder,
      burstSpeed: plan.burstSpeed, burstDuration: plan.burstDuration,
      maxConcurrentSessions: plan.maxConcurrentSessions,
      freeTrialDays: plan.freeTrialDays, slaUptime: plan.slaUptime,
      ipv6Enabled: plan.ipv6Enabled ?? false,
      ipv6PrefixDelegation: plan.ipv6PrefixDelegation ?? false,
      ipv6DefaultPoolId: plan.ipv6DefaultPoolId ?? null,
      ipv6AssignmentMode: plan.ipv6AssignmentMode || "SLAAC",
    });
    setEditOpen(true);
  };

  const handleDuplicate = (plan: Plan) => {
    setSelectedId(null);
    setForm({
      name: `${plan.name} (Copy)`, description: plan.description, category: plan.category,
      status: "ACTIVE",
      downloadSpeed: plan.downloadSpeed, uploadSpeed: plan.uploadSpeed, speedUnit: plan.speedUnit,
      downloadSpeedFup: plan.downloadSpeedFup, uploadSpeedFup: plan.uploadSpeedFup,
      dataLimitGb: plan.dataLimitGb, dataLimitUnit: plan.dataLimitGb ? "GB" : "UNLIMITED",
      priceMonthly: plan.priceMonthly, priceQuarterly: plan.priceQuarterly,
      priceHalfYearly: plan.priceHalfYearly, priceYearly: plan.priceYearly,
      installationCharge: plan.installationCharge,
      securityDeposit: plan.securityDeposit, routerRental: plan.routerRental,
      validityDays: plan.validityDays, cgstPercent: plan.cgstPercent,
      sgstPercent: plan.sgstPercent, igstPercent: plan.igstPercent,
      contentionRatio: plan.contentionRatio,
      isPopular: false, sortOrder: plan.sortOrder + 1,
      burstSpeed: plan.burstSpeed, burstDuration: plan.burstDuration,
      maxConcurrentSessions: plan.maxConcurrentSessions,
      freeTrialDays: plan.freeTrialDays, slaUptime: plan.slaUptime,
      ipv6Enabled: plan.ipv6Enabled ?? false,
      ipv6PrefixDelegation: plan.ipv6PrefixDelegation ?? false,
      ipv6DefaultPoolId: plan.ipv6DefaultPoolId ?? null,
      ipv6AssignmentMode: plan.ipv6AssignmentMode || "SLAAC",
    });
    setAddOpen(true);
    toast.info(`Duplicated "${plan.name}" — edit and save to create`);
  };

  const toggleCompare = (planId: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else if (next.size < 4) next.add(planId);
      else toast.warning("You can compare up to 4 plans at a time");
      return next;
    });
  };

  const openMigrate = (plan: Plan) => {
    setMigrateSourceId(plan.id);
    setMigrateTargetId("");
    setMigrateOpen(true);
  };

  const openSubscribers = (plan: Plan) => {
    setSubscribersPlanId(plan.id);
    setSubscribersPlanName(plan.name);
    setSubscribersOpen(true);
  };

  const handleCreate = () => {
    if (!form.name.trim()) { toast.error("Plan name is required"); return; }
    if (form.downloadSpeed <= 0) { toast.error("Download speed must be greater than 0"); return; }
    createMutation.mutate(form);
  };

  const handleUpdate = () => {
    if (!editForm.name.trim()) { toast.error("Plan name is required"); return; }
    updateMutation.mutate({ id: selectedId!, body: editForm });
  };

  const handleMigrate = () => {
    if (!migrateSourceId || !migrateTargetId) { toast.error("Select a target plan"); return; }
    migrateMutation.mutate({ sourcePlanId: migrateSourceId, targetPlanId: migrateTargetId });
  };

  const comparisonPlans = plans.filter((p) => compareIds.has(p.id));

  // Drag-and-drop reorder mutation
  const reorderMutation = useMutation({
    mutationFn: (planIds: string[]) =>
      apiFetch("/api/plans/reorder", { method: "POST", body: JSON.stringify({ planIds }) }),
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Plan order updated");
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: () => toast.error("Failed to reorder plans"),
  });

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const index = Number((e.target as HTMLElement).closest("tr")?.getAttribute("data-row-index"));
    setDragIndex(index >= 0 ? index : null);
    // Hide default drag ghost
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    img.style.width = "1px";
    img.style.height = "1px";
    document.body.appendChild(img);
    (window as unknown as Record<string, HTMLImageElement>)._planDragImg = img;
    e.dataTransfer.setDragImage(img, 0, 0);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setOverIndex(null);
  }, []);

  const handleDrop = useCallback((index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const reordered = [...plans];
    const [removed] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, removed);
    reorderMutation.mutate(reordered.map((p) => p.id));
    setDragIndex(null);
    setOverIndex(null);
  }, [dragIndex, plans, reorderMutation]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setOverIndex(null);
    const img = (window as unknown as Record<string, HTMLImageElement>)._planDragImg;
    if (img) { document.body.removeChild(img); delete (window as unknown as Record<string, HTMLImageElement>)._planDragImg; }
  }, []);

  const renderSkeleton = () => (
    <div className="space-y-6">
      <Skeleton className="skeleton-wave h-7 w-32 mb-2" />
      <Skeleton className="skeleton-wave h-4 w-60" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="border shadow-sm"><CardContent className="p-6"><Skeleton className="skeleton-wave h-6 w-32 mb-3" /><Skeleton className="skeleton-wave h-10 w-20 mb-4" /><Skeleton className="skeleton-wave h-3 w-full mb-2" /><Skeleton className="skeleton-wave h-3 w-3/4" /></CardContent></Card>)}
      </div>
    </div>
  );

  if (isLoading && activeTab === "plans") return renderSkeleton();

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={Wifi}
        title="Plans"
        description="Manage internet plans, pricing, and subscriber packages"
        badge={{ text: `${activePlansCount} Active` }}
        actions={
          <>
            {compareIds.size >= 2 && (
              <Button variant="outline" onClick={() => setCompareOpen(true)}>
                <GitCompare className="h-4 w-4 mr-2" />Compare ({compareIds.size})
              </Button>
            )}
            <Button onClick={() => setAddOpen(true)} className="bg-red-600 hover:bg-red-700 text-white">
              <Plus className="h-4 w-4 mr-2" />Add Plan
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="plans" className="gap-1.5"><Zap className="h-3.5 w-3.5" />Plans</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Analytics</TabsTrigger>
        </TabsList>

        {/* ═══════ PLANS TAB ═══════ */}
        <TabsContent value="plans" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 animate-slide-up" style={{ animationDelay: "50ms" }}>
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search plans..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={categoryFilter || "all"} onValueChange={(v) => { setCategoryFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="FTTH">FTTH</SelectItem>
                <SelectItem value="WIRELESS">Wireless</SelectItem>
                <SelectItem value="CABLE">Cable</SelectItem>
                <SelectItem value="LEASED_LINE">Leased Line</SelectItem>
                <SelectItem value="HOTSPOT">Hotspot</SelectItem>
                <SelectItem value="COMBO">Combo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
              <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}>
                <List className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* Empty state */}
          {plans.length === 0 && (
            <Card className="border shadow-sm animate-slide-up" style={{ animationDelay: "100ms" }}>
              <CardContent className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-300">
                <div className="h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-950/20 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-red-400/60" />
                </div>
                <p className="text-foreground font-semibold text-base">No plans found</p>
                <p className="text-xs text-muted-foreground/70 mt-1 mb-4 text-center max-w-xs">Create your first internet plan to get started with subscriber management</p>
                <Button onClick={() => setAddOpen(true)} className="bg-red-600 hover:bg-red-700 text-white" size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />Create Plan
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Grid View */}
          {view === "grid" && plans.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-slide-up" style={{ animationDelay: "100ms" }}>
                {plans.map((plan) => {
                  const CategoryIcon = CATEGORY_ICONS[plan.category] || Zap;
                  const ipv6Detail = `${plan.ipv6AssignmentMode}${plan.ipv6PrefixDelegation ? " + PD" : ""}${plan.ipv6DefaultPoolId ? " · Pool" : ""}`;
                  return (
                  <Card key={plan.id} className={`card-hover-lift border-t-4 ${CATEGORY_COLORS[plan.category] || "border-gray-500"} border shadow-sm relative overflow-hidden min-w-0 ${plan.status === "ARCHIVED" ? "opacity-60" : ""} group`}>
                    {plan.isPopular && (
                      <div className="absolute top-3 right-3 bg-emerald-500/10 text-emerald-600 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                        <Star className="h-3 w-3" />POPULAR
                      </div>
                    )}
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Checkbox
                          checked={compareIds.has(plan.id)}
                          onCheckedChange={() => toggleCompare(plan.id)}
                          className="h-4 w-4 shrink-0"
                          aria-label={`Compare ${plan.name}`}
                        />
                        <div className={`h-6 w-6 rounded-md bg-background border flex items-center justify-center shrink-0 ${CATEGORY_ICON_COLORS[plan.category] || ""}`}>
                          <CategoryIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{CATEGORY_LABELS[plan.category]}</Badge>
                        <Badge variant={plan.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px] shrink-0">
                          {plan.status}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg font-bold">{plan.name}</CardTitle>
                      {plan.description && <p className="text-xs text-muted-foreground line-clamp-2">{plan.description}</p>}
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="mb-4">
                        <span className="text-3xl font-bold text-foreground">{formatINR(plan.priceMonthly)}</span>
                        <span className="text-sm text-muted-foreground">/month</span>
                        {(plan.priceQuarterly || plan.priceHalfYearly || plan.priceYearly) && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {plan.priceQuarterly && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                Quarterly: {formatINR(plan.priceQuarterly)}
                              </span>
                            )}
                            {plan.priceHalfYearly && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                Half-Yearly: {formatINR(plan.priceHalfYearly)}
                              </span>
                            )}
                            {plan.priceYearly && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                Yearly: {formatINR(plan.priceYearly)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground flex items-center gap-1 shrink-0"><ArrowDown className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />Download</span>
                          <span className="font-semibold flex items-center justify-end min-w-0">
                            <span title={`Download speed: ${plan.downloadSpeed} ${plan.speedUnit}`} className="inline-flex items-center gap-0.5 min-w-0 max-w-full text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-md font-medium">
                              <ArrowDown className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{plan.downloadSpeed} {plan.speedUnit}</span>
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground flex items-center gap-1 shrink-0"><ArrowUp className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />Upload</span>
                          <span className="font-semibold flex items-center justify-end min-w-0">
                            <span title={`Upload speed: ${plan.uploadSpeed} ${plan.speedUnit}`} className="inline-flex items-center gap-0.5 min-w-0 max-w-full text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-md font-medium">
                              <ArrowUp className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{plan.uploadSpeed} {plan.speedUnit}</span>
                            </span>
                          </span>
                        </div>
                        {(plan.downloadSpeedFup || plan.uploadSpeedFup) && (
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="shrink-0">FUP Speed</span>
                            <span className="min-w-0 truncate text-right" title={`Post-FUP speeds: ${plan.downloadSpeedFup || "—"} / ${plan.uploadSpeedFup || "—"} ${plan.speedUnit}`}>
                              {plan.downloadSpeedFup || "—"}/{plan.uploadSpeedFup || "—"} {plan.speedUnit}
                            </span>
                          </div>
                        )}
                        {plan.dataLimitGb ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground shrink-0">Data Limit</span>
                            <span className="font-semibold min-w-0 truncate text-right" title={`${plan.dataLimitGb} GB data limit`}>{plan.dataLimitGb} GB</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground shrink-0">Data</span>
                            <span className="font-semibold text-green-600 min-w-0 truncate text-right" title="No data cap — unlimited">Unlimited</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">SLA</span>
                          <span className="font-semibold min-w-0 truncate text-right" title={`${plan.slaUptime}% uptime SLA`}>{plan.slaUptime}%</span>
                        </div>
                        {plan.freeTrialDays > 0 && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground shrink-0">Free Trial</span>
                            <span className="font-semibold text-green-600 min-w-0 truncate text-right" title={`${plan.freeTrialDays}-day free trial`}>{plan.freeTrialDays} days</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">Subscribers</span>
                          <button type="button" onClick={() => openSubscribers(plan)} title="View subscribers on this plan" className="font-semibold text-red-600 hover:underline cursor-pointer flex items-center gap-1 min-w-0">
                            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{plan._count.subscribers}</span>
                          </button>
                        </div>
                        {isModuleEnabled("ipv6") && plan.ipv6Enabled && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground flex items-center gap-1 shrink-0"><Globe className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />IPv6</span>
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 min-w-0 truncate text-right" title={ipv6Detail}>
                              {ipv6Detail}
                            </span>
                          </div>
                        )}
                      </div>
                      {(plan.installationCharge > 0 || plan.securityDeposit > 0 || plan.routerRental > 0) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {plan.installationCharge > 0 && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded" title="One-time installation charge">{formatINR(plan.installationCharge)} Install</span>
                          )}
                          {plan.securityDeposit > 0 && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded" title="Refundable security deposit">{formatINR(plan.securityDeposit)} Deposit</span>
                          )}
                          {plan.routerRental > 0 && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded" title="Monthly router rental">{formatINR(plan.routerRental)}/mo Router</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="flex items-center gap-1.5 pt-3 border-t flex-wrap mt-auto">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                        <Pencil className="h-3 w-3 mr-1" />Edit
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleDuplicate(plan)} title="Clone Plan" aria-label="Clone plan">
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openMigrate(plan)} title="Migrate Subscribers" aria-label="Migrate subscribers">
                        <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => togglePopular(plan)} title={plan.isPopular ? "Remove Popular" : "Mark Popular"} aria-label={plan.isPopular ? "Remove popular" : "Mark popular"}>
                        {plan.isPopular ? <StarOff className="h-4 w-4" aria-hidden="true" /> : <Star className="h-4 w-4" aria-hidden="true" />}
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toggleStatus(plan)} title={plan.status === "ACTIVE" ? "Archive" : "Activate"} aria-label={plan.status === "ACTIVE" ? "Archive plan" : "Activate plan"}>
                        {plan.status === "ACTIVE" ? <Archive className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => { setSelectedId(plan.id); setDeleteOpen(true); }} title="Delete Plan" aria-label="Delete plan">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </CardFooter>
                  </Card>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Rows per page:</span>
                    <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
                      <SelectTrigger className="w-[70px] h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">6</SelectItem>
                        <SelectItem value="12">12</SelectItem>
                        <SelectItem value="24">24</SelectItem>
                        <SelectItem value="48">48</SelectItem>
                      </SelectContent>
                    </Select>
                    <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalPlans)} of {totalPlans}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === "..." ? (
                          <span key={`dots-${i}`} className="px-2 text-muted-foreground">...</span>
                        ) : (
                          <Button key={p} variant={p === page ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setPage(p as number)}>
                            {p}
                          </Button>
                        )
                      )}
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* List View */}
          {view === "list" && plans.length > 0 && (
            <div className="animate-slide-up" style={{ animationDelay: "100ms" }}>
              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-8"></TableHead>
                          <TableHead className="text-xs w-8"></TableHead>
                          <TableHead className="text-xs">Plan Name</TableHead>
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs">Speed</TableHead>
                          <TableHead className="text-xs">Monthly Price</TableHead>
                          <TableHead className="text-xs">Subscribers</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Popular</TableHead>
                          {isModuleEnabled("ipv6") && (
                            <TableHead className="text-xs hidden lg:table-cell">IPv6</TableHead>
                          )}
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plans.map((plan, idx) => (
                          <TableRow
                            key={plan.id}
                            className={`table-row-hover ${plan.status === "ARCHIVED" ? "opacity-60" : ""} ${dragIndex === idx ? "opacity-40" : ""} relative`}
                            draggable
                            data-row-index={idx}
                            onDragStart={(e) => handleDragStart(e)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDragLeave={handleDragLeave}
                            onDrop={() => handleDrop(idx)}
                            onDragEnd={handleDragEnd}
                          >
                            {overIndex === idx && dragIndex !== null && dragIndex !== idx && (
                              <div className={`absolute left-0 right-0 z-10 h-0.5 bg-[#DC2626] ${dragIndex < idx ? "top-0" : "bottom-0"}`} />
                            )}
                            <TableCell>
                              <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                                <GripVertical className="h-4 w-4" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Checkbox checked={compareIds.has(plan.id)} onCheckedChange={() => toggleCompare(plan.id)} className="h-4 w-4" aria-label={`Compare ${plan.name}`} />
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              <div>
                                <span>{plan.name}</span>
                                {(plan.priceQuarterly || plan.priceYearly) && (
                                  <span className="text-[10px] text-muted-foreground ml-2">
                                    Q: {formatINR(plan.priceQuarterly || 0)} / Y: {formatINR(plan.priceYearly || 0)}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[plan.category]}</Badge></TableCell>
                            <TableCell className="text-sm">{plan.downloadSpeed}/{plan.uploadSpeed} {plan.speedUnit}</TableCell>
                            <TableCell className="text-sm font-semibold">{formatINR(plan.priceMonthly)}</TableCell>
                            <TableCell className="text-sm"><button type="button" onClick={() => openSubscribers(plan)} title="View subscribers on this plan" className="font-semibold text-red-600 hover:underline cursor-pointer">{plan._count.subscribers}</button></TableCell>
                            <TableCell><Badge variant={plan.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">{plan.status}</Badge></TableCell>
                            <TableCell>{plan.isPopular ? <Star className="h-4 w-4 text-red-500 fill-red-500" /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                            {isModuleEnabled("ipv6") && (
                              <TableCell className="hidden lg:table-cell">
                                {plan.ipv6Enabled ? (
                                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 gap-1">
                                    <Globe className="h-3 w-3" />IPv6
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(plan)} title="Edit plan" aria-label="Edit plan"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(plan)} title="Clone plan" aria-label="Clone plan"><Copy className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openMigrate(plan)} title="Migrate subscribers" aria-label="Migrate subscribers"><ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => togglePopular(plan)} title={plan.isPopular ? "Remove popular" : "Mark popular"} aria-label={plan.isPopular ? "Remove popular" : "Mark popular"}>{plan.isPopular ? <StarOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Star className="h-3.5 w-3.5" aria-hidden="true" />}</Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => { setSelectedId(plan.id); setDeleteOpen(true); }} title="Delete plan" aria-label="Delete plan"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Pagination for list */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Rows per page:</span>
                    <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
                      <SelectTrigger className="w-[70px] h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalPlans)} of {totalPlans}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === "..." ? (
                          <span key={`dots-${i}`} className="px-2 text-muted-foreground">...</span>
                        ) : (
                          <Button key={p} variant={p === page ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setPage(p as number)}>
                            {p}
                          </Button>
                        )
                      )}
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ═══════ ANALYTICS TAB ═══════ */}
        <TabsContent value="analytics" className="space-y-6 animate-in fade-in duration-200">
          {!analytics ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Card key={i}><CardContent className="p-6"><Skeleton className="skeleton-wave h-20 w-full" /></CardContent></Card>)}
            </div>
          ) : (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border shadow-sm card-hover-lift animate-slide-up" style={{ animationDelay: "50ms" }}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground truncate">Total Plans</p>
                      <p className="text-2xl font-bold truncate" title="Total plans">{analytics.stats.totalPlans}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm card-hover-lift animate-slide-up" style={{ animationDelay: "100ms" }}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-teal-100 dark:bg-teal-950/30 flex items-center justify-center">
                      <Check className="h-5 w-5 text-teal-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground truncate">Active Plans</p>
                      <p className="text-2xl font-bold truncate" title="Active plans">{analytics.stats.activePlans}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm card-hover-lift animate-slide-up" style={{ animationDelay: "150ms" }}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
                      <Users className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground truncate">Total Active Subscribers</p>
                      <p className="text-2xl font-bold truncate" title="Total active subscribers">{analytics.stats.totalSubscribers}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Adoption Rate */}
                <Card className="border shadow-sm animate-slide-up min-w-0" style={{ animationDelay: "200ms" }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />Adoption Rate
                    </CardTitle>
                    <CardDescription>Subscribers per plan</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.adoption} layout="vertical" margin={{ left: 10, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" className="text-xs" />
                          <YAxis type="category" dataKey="planName" width={100} className="text-xs" tick={{ fontSize: 11 }} />
                          <Tooltip
                            formatter={(value: number) => [`${value} subscribers`, "Subscribers"]}
                            contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                          />
                          <Bar dataKey="subscribers" fill="#22c55e" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Revenue per Plan */}
                <Card className="border shadow-sm min-w-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />Revenue per Plan
                    </CardTitle>
                    <CardDescription>Total collected from paid invoices</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      {analytics.revenue.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                          No revenue data yet
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.revenue} layout="vertical" margin={{ left: 10, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" className="text-xs" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="planName" width={100} className="text-xs" tick={{ fontSize: 11 }} />
                            <Tooltip
                              formatter={(value: number) => [formatINR(value), "Revenue"]}
                              contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                            />
                            <Bar dataKey="totalRevenue" fill="#f97316" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Category Distribution */}
                <Card className="border shadow-sm min-w-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <PieChartIcon className="h-4 w-4" />Category Distribution
                    </CardTitle>
                    <CardDescription>Subscribers by plan category</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.categoryDistribution.map((c) => ({ name: CATEGORY_LABELS[c.category] || c.category, value: c.count }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            {analytics.categoryDistribution.map((_, index) => (
                              <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Top Plans by Revenue */}
                <Card className="border shadow-sm min-w-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />Top Revenue Plans
                    </CardTitle>
                    <CardDescription>Highest earning plans</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analytics.revenue.length === 0 ? (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                        No revenue data yet
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-3">
                          {analytics.revenue.slice(0, 10).map((r, i) => (
                            <div key={r.planId || i} className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="h-6 w-6 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center text-xs font-bold text-orange-600 shrink-0">
                                  {i + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate" title={r.planName}>{r.planName}</p>
                                  <p className="text-xs text-muted-foreground">{r.invoiceCount} invoices</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold">{formatINR(r.totalRevenue)}</p>
                                <p className="text-xs text-muted-foreground">of {formatINR(r.totalBilled)} billed</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Plan Form Dialog (shared for Add & Edit) ─── */}
      <PlanFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Create New Plan"
        description="Define pricing, speeds, and features for a new internet plan."
        form={form}
        setForm={setForm}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
        submitLabel={createMutation.isPending ? "Creating..." : "Create Plan"}
      />

      <PlanFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Plan"
        description="Update plan details."
        form={editForm}
        setForm={setEditForm}
        onSubmit={handleUpdate}
        isPending={updateMutation.isPending}
        submitLabel={updateMutation.isPending ? "Saving..." : "Save Changes"}
      />

      {/* ─── Delete Confirm ─── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Plan</DialogTitle>
            <DialogDescription>Are you sure? Plans with active subscribers cannot be deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => selectedId && deleteMutation.mutate(selectedId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Compare Dialog ─── */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compare Plans</DialogTitle>
            <DialogDescription>Side-by-side comparison of selected plans</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Feature</TableHead>
                  {comparisonPlans.map((p) => (
                    <TableHead key={p.id} className="text-center">{p.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: "Category", fn: (p: Plan) => CATEGORY_LABELS[p.category] },
                  { label: "Status", fn: (p: Plan) => p.status },
                  { label: "Download Speed", fn: (p: Plan) => `${p.downloadSpeed} ${p.speedUnit}` },
                  { label: "Upload Speed", fn: (p: Plan) => `${p.uploadSpeed} ${p.speedUnit}` },
                  { label: "Data Limit", fn: (p: Plan) => p.dataLimitGb ? `${p.dataLimitGb} GB` : "Unlimited" },
                  { label: "FUP Speed", fn: (p: Plan) => (p.downloadSpeedFup || p.uploadSpeedFup) ? `${p.downloadSpeedFup || "—"}/${p.uploadSpeedFup || "—"} ${p.speedUnit}` : "N/A" },
                  { label: "Monthly Price", fn: (p: Plan) => formatINR(p.priceMonthly) },
                  { label: "Quarterly Price", fn: (p: Plan) => p.priceQuarterly ? formatINR(p.priceQuarterly) : "—" },
                  { label: "Half-Yearly Price", fn: (p: Plan) => p.priceHalfYearly ? formatINR(p.priceHalfYearly) : "—" },
                  { label: "Yearly Price", fn: (p: Plan) => p.priceYearly ? formatINR(p.priceYearly) : "—" },
                  { label: "Installation", fn: (p: Plan) => formatINR(p.installationCharge) },
                  { label: "Security Deposit", fn: (p: Plan) => formatINR(p.securityDeposit) },
                  { label: "Router Rental", fn: (p: Plan) => p.routerRental > 0 ? `${formatINR(p.routerRental)}/mo` : "—" },
                  { label: "Contention Ratio", fn: (p: Plan) => p.contentionRatio },
                  { label: "Burst Speed", fn: (p: Plan) => p.burstSpeed ? `${p.burstSpeed} ${p.speedUnit}` : "—" },
                  { label: "Burst Duration", fn: (p: Plan) => p.burstDuration ? `${p.burstDuration}s` : "—" },
                  { label: "Max Sessions", fn: (p: Plan) => String(p.maxConcurrentSessions) },
                  { label: "Free Trial", fn: (p: Plan) => p.freeTrialDays > 0 ? `${p.freeTrialDays} days` : "—" },
                  { label: "SLA Uptime", fn: (p: Plan) => `${p.slaUptime}%` },
                  { label: "Validity", fn: (p: Plan) => `${p.validityDays} days` },
                  { label: "GST", fn: (p: Plan) => `${p.cgstPercent + p.sgstPercent}%` },
                  { label: "Subscribers", fn: (p: Plan) => String(p._count.subscribers) },
                ].map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium text-sm">{row.label}</TableCell>
                    {comparisonPlans.map((p) => (
                      <TableCell key={p.id} className="text-center text-sm">
                        {row.fn(p)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ─── Migrate Dialog ─── */}
      <Dialog open={migrateOpen} onOpenChange={setMigrateOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Migrate Subscribers</DialogTitle>
            <DialogDescription>Move all active subscribers from one plan to another. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Source Plan</Label>
              <div className="p-3 rounded-md bg-muted text-sm font-medium">
                {plans.find((p) => p.id === migrateSourceId)?.name || "—"}
              </div>
              <p className="text-xs text-muted-foreground">
                {plans.find((p) => p.id === migrateSourceId)?._count.subscribers || 0} active subscribers will be migrated
              </p>
            </div>
            <div className="space-y-2">
              <Label>Target Plan *</Label>
              <Select value={migrateTargetId} onValueChange={setMigrateTargetId}>
                <SelectTrigger><SelectValue placeholder="Select target plan" /></SelectTrigger>
                <SelectContent>
                  {plans.filter((p) => p.id !== migrateSourceId && p.status === "ACTIVE").map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {formatINR(p.priceMonthly)}/mo</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {migrateTargetId && (
              <Card className="border border-orange-300 bg-orange-50 dark:bg-orange-950/20">
                <CardContent className="p-3">
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                    ⚠️ {plans.find((p) => p.id === migrateSourceId)?._count.subscribers || 0} subscribers will be moved to &quot;{plans.find((p) => p.id === migrateTargetId)?.name}&quot;
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMigrateOpen(false)}>Cancel</Button>
            <Button onClick={handleMigrate} disabled={!migrateTargetId || migrateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {migrateMutation.isPending ? "Migrating..." : "Migrate Subscribers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── View Subscribers Dialog ─── */}
      <Dialog open={subscribersOpen} onOpenChange={setSubscribersOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Subscribers — {subscribersPlanName}</DialogTitle>
            <DialogDescription>List of subscribers on this plan</DialogDescription>
          </DialogHeader>
          {loadingPlanSubs ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-10 w-full" />)}
            </div>
          ) : (planSubscribers?.subscribers && planSubscribers.subscribers.length > 0) ? (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Phone</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Connection</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planSubscribers.subscribers.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="text-sm font-medium">{sub.name}</TableCell>
                      <TableCell className="text-sm">{sub.phone}</TableCell>
                      <TableCell className="text-sm">{sub.email || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={sub.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">{sub.status}</Badge>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{sub.connectionType}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2">Showing {planSubscribers.subscribers.length} of {planSubscribers.total} subscribers</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No subscribers found on this plan</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── IPv6 Configuration Section ──────────────────────────────────
function Ipv6Section({
  form, setForm,
}: {
  form: typeof defaultForm;
  setForm: React.Dispatch<React.SetStateAction<typeof defaultForm>>;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: dhcpv6PoolsData } = useQuery<{ items: { id: string; prefix: string; name: string; description: string }[] }>({
    queryKey: ["dhcpv6-subnets-list"],
    queryFn: () => apiFetch("/api/dhcpv6/subnets?limit=100"),
    enabled: form.ipv6Enabled,
  });
  const dhcpv6Pools = dhcpv6PoolsData?.items ?? [];

  return (
    <>
      <Separator />
      <button
        type="button"
        className="flex items-center justify-between w-full py-1 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2">
          <span className="h-5 w-5 rounded flex items-center justify-center bg-muted">
            <Globe className="h-3 w-3 text-muted-foreground" />
          </span>
          IPv6 Configuration
          {form.ipv6Enabled && (
            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">Active</Badge>
          )}
        </span>
        <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="space-y-3 pl-1">
          <div className="flex items-center justify-between">
            <Label>Enable IPv6 for this Plan</Label>
            <Switch checked={form.ipv6Enabled} onCheckedChange={(v) => setForm({ ...form, ipv6Enabled: v })} />
          </div>

          {form.ipv6Enabled && (
            <div className="space-y-3 pl-0.5">
              <Separator className="my-1" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>IPv6 Prefix Delegation</Label>
                  <p className="text-[11px] text-muted-foreground">Give subscribers a /64 prefix for their home router</p>
                </div>
                <Switch checked={form.ipv6PrefixDelegation} onCheckedChange={(v) => setForm({ ...form, ipv6PrefixDelegation: v })} />
              </div>

              <div className="space-y-1.5">
                <Label>IPv6 Assignment Mode</Label>
                <Select value={form.ipv6AssignmentMode} onValueChange={(v) => setForm({ ...form, ipv6AssignmentMode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SLAAC">SLAAC</SelectItem>
                    <SelectItem value="DHCPV6">DHCPv6</SelectItem>
                    <SelectItem value="PD_ONLY">PD Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Default DHCPv6 Pool</Label>
                <Select value={form.ipv6DefaultPoolId ?? ""} onValueChange={(v) => setForm({ ...form, ipv6DefaultPoolId: v || null })}>
                  <SelectTrigger><SelectValue placeholder="Select a DHCPv6 pool..." /></SelectTrigger>
                  <SelectContent>
                    {dhcpv6Pools.length === 0 && (
                      <SelectItem value="none" disabled>No pools available</SelectItem>
                    )}
                    {dhcpv6Pools.map((pool) => (
                      <SelectItem key={pool.id} value={pool.id}>
                        {pool.prefix} — {pool.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Select a default IPv6 pool for assigning addresses to subscribers on this plan
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Shared Plan Form Dialog Component ──────────────────────────
function PlanFormDialog({
  open, onOpenChange, title, description, form, setForm, onSubmit, isPending, submitLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  form: typeof defaultForm;
  setForm: React.Dispatch<React.SetStateAction<typeof defaultForm>>;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { isModuleEnabled } = useModuleStore();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["basic", "speed", "pricing", "advanced"]));

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const sectionHeader = (section: string, label: string, icon: React.ElementType) => {
    const Icon = icon;
    return (
    <button
      type="button"
      className="flex items-center justify-between w-full py-1 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
      onClick={() => toggleSection(section)}
    >
      <span className="flex items-center gap-2">
        <span className="h-5 w-5 rounded flex items-center justify-center bg-muted">
          <Icon className="h-3 w-3 text-muted-foreground" />
        </span>
        {label}
      </span>
      <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${expandedSections.has(section) ? "rotate-90" : ""}`} />
    </button>
  );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* ─── BASIC ─── */}
          <Separator />
          {sectionHeader("basic", "Basic Information", Info)}
          {expandedSections.has("basic") && (
            <div className="space-y-3 pl-1">
              <div className="space-y-1.5">
                <Label>Plan Name *</Label>
                <Input placeholder="e.g., Fiber 100 Mbps" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea placeholder="Plan description..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FTTH">FTTH</SelectItem>
                      <SelectItem value="WIRELESS">Wireless</SelectItem>
                      <SelectItem value="CABLE">Cable</SelectItem>
                      <SelectItem value="LEASED_LINE">Leased Line</SelectItem>
                      <SelectItem value="HOTSPOT">Hotspot</SelectItem>
                      <SelectItem value="COMBO">Combo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="ARCHIVED">Archived</SelectItem>
                      <SelectItem value="HIDDEN">Hidden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sort Order</Label>
                  <Input type="number" placeholder="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="flex items-end gap-3 pb-0.5">
                  <Switch checked={form.isPopular} onCheckedChange={(v) => setForm({ ...form, isPopular: v })} />
                  <Label>Mark as Popular</Label>
                </div>
              </div>
            </div>
          )}

          {/* ─── SPEED & DATA ─── */}
          <Separator />
          {sectionHeader("speed", "Speed & Data", Gauge)}
          {expandedSections.has("speed") && (
            <div className="space-y-3 pl-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Download Speed *</Label>
                  <Input type="number" value={form.downloadSpeed} onChange={(e) => setForm({ ...form, downloadSpeed: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Upload Speed</Label>
                  <Input type="number" value={form.uploadSpeed} onChange={(e) => setForm({ ...form, uploadSpeed: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Speed Unit</Label>
                  <Select value={form.speedUnit} onValueChange={(v) => setForm({ ...form, speedUnit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MBPS">Mbps</SelectItem>
                      <SelectItem value="KBPS">Kbps</SelectItem>
                      <SelectItem value="GBPS">Gbps</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data Limit</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Unlimited"
                      value={form.dataLimitUnit === "UNLIMITED" ? "" : (form.dataLimitGb ?? "")}
                      onChange={(e) => setForm({ ...form, dataLimitGb: e.target.value ? parseFloat(e.target.value) : null, dataLimitUnit: e.target.value ? form.dataLimitUnit : "UNLIMITED" })}
                      className="flex-1"
                    />
                    <Select value={form.dataLimitUnit} onValueChange={(v) => setForm({ ...form, dataLimitUnit: v })}>
                      <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GB">GB</SelectItem>
                        <SelectItem value="TB">TB</SelectItem>
                        <SelectItem value="UNLIMITED">∞</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="p-2 rounded-md bg-muted/50">
                <p className="text-xs font-medium text-muted-foreground mb-2">FUP Speed (after data limit)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>FUP Download Speed</Label>
                    <Input type="number" placeholder="Post-FUP download" value={form.downloadSpeedFup ?? ""} onChange={(e) => setForm({ ...form, downloadSpeedFup: e.target.value ? parseInt(e.target.value) : null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>FUP Upload Speed</Label>
                    <Input type="number" placeholder="Post-FUP upload" value={form.uploadSpeedFup ?? ""} onChange={(e) => setForm({ ...form, uploadSpeedFup: e.target.value ? parseInt(e.target.value) : null })} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── PRICING ─── */}
          <Separator />
          {sectionHeader("pricing", "Pricing", DollarSign)}
          {expandedSections.has("pricing") && (
            <div className="space-y-3 pl-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Monthly Price *</Label>
                  <Input type="number" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Installation Charge</Label>
                  <Input type="number" value={form.installationCharge} onChange={(e) => setForm({ ...form, installationCharge: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Quarterly Price</Label>
                  <Input type="number" placeholder="Optional" value={form.priceQuarterly ?? ""} onChange={(e) => setForm({ ...form, priceQuarterly: e.target.value ? parseFloat(e.target.value) : null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Half-Yearly Price</Label>
                  <Input type="number" placeholder="Optional" value={form.priceHalfYearly ?? ""} onChange={(e) => setForm({ ...form, priceHalfYearly: e.target.value ? parseFloat(e.target.value) : null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Yearly Price</Label>
                  <Input type="number" placeholder="Optional" value={form.priceYearly ?? ""} onChange={(e) => setForm({ ...form, priceYearly: e.target.value ? parseFloat(e.target.value) : null })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Security Deposit</Label>
                  <Input type="number" value={form.securityDeposit} onChange={(e) => setForm({ ...form, securityDeposit: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Router Rental (/mo)</Label>
                  <Input type="number" value={form.routerRental} onChange={(e) => setForm({ ...form, routerRental: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>CGST (%)</Label>
                  <Input type="number" step="0.5" value={form.cgstPercent} onChange={(e) => setForm({ ...form, cgstPercent: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>SGST (%)</Label>
                  <Input type="number" step="0.5" value={form.sgstPercent} onChange={(e) => setForm({ ...form, sgstPercent: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>IGST (%)</Label>
                  <Input type="number" step="0.5" value={form.igstPercent} onChange={(e) => setForm({ ...form, igstPercent: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
          )}

          {/* ─── ADVANCED ─── */}
          <Separator />
          {sectionHeader("advanced", "Advanced Settings", Settings)}
          {expandedSections.has("advanced") && (
            <div className="space-y-3 pl-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Contention Ratio</Label>
                  <Select value={form.contentionRatio} onValueChange={(v) => setForm({ ...form, contentionRatio: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1:4">1:4 (Premium)</SelectItem>
                      <SelectItem value="1:8">1:8 (Standard)</SelectItem>
                      <SelectItem value="1:10">1:10 (Normal)</SelectItem>
                      <SelectItem value="1:16">1:16 (Economy)</SelectItem>
                      <SelectItem value="1:20">1:20 (Budget)</SelectItem>
                      <SelectItem value="1:25">1:25 (Basic)</SelectItem>
                      <SelectItem value="1:50">1:50 (Shared)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Validity (days)</Label>
                  <Input type="number" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: parseInt(e.target.value) || 30 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Burst Speed ({form.speedUnit})</Label>
                  <Input type="number" placeholder="Optional" value={form.burstSpeed ?? ""} onChange={(e) => setForm({ ...form, burstSpeed: e.target.value ? parseInt(e.target.value) : null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Burst Duration (seconds)</Label>
                  <Input type="number" placeholder="Optional" value={form.burstDuration ?? ""} onChange={(e) => setForm({ ...form, burstDuration: e.target.value ? parseInt(e.target.value) : null })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Max Concurrent Sessions</Label>
                  <Input type="number" value={form.maxConcurrentSessions} onChange={(e) => setForm({ ...form, maxConcurrentSessions: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Free Trial Days</Label>
                  <Input type="number" value={form.freeTrialDays} onChange={(e) => setForm({ ...form, freeTrialDays: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>SLA Uptime (%)</Label>
                  <Input type="number" step="0.1" value={form.slaUptime} onChange={(e) => setForm({ ...form, slaUptime: parseFloat(e.target.value) || 99.5 })} />
                </div>
              </div>
            </div>
          )}
        </div>
        {isModuleEnabled("ipv6") && (
          <Ipv6Section form={form} setForm={setForm} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={isPending} className="bg-red-600 hover:bg-red-700 text-white">
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
