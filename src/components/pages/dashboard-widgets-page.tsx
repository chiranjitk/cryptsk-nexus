"use client";

import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Grid3X3, Eye, Settings, CheckCircle2,
  BarChart3, Users, Wifi, Activity, Globe, Shield, Zap, TrendingUp,
  Loader2, Monitor, Package, Clock, AlertTriangle, Layers,
  ArrowUp, ArrowDown, Search,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────
type WidgetCategory = "NETWORK" | "BILLING" | "SUBSCRIBERS" | "SECURITY" | "SYSTEM" | "TRAFFIC";
type WidgetType = "STAT" | "CHART" | "TABLE" | "GAUGE" | "LIST" | "MAP";

interface DashboardWidget {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  type: WidgetType;
  icon: React.ElementType;
  available: boolean;
  defaultPosition: number;
}

interface WidgetLayout {
  widgetId: string;
  position: number;
  visible: boolean;
  size: "SMALL" | "MEDIUM" | "LARGE";
}

interface UserConfig {
  userId: string;
  userName: string;
  layout: WidgetLayout[];
}

const DEMO_WIDGETS: DashboardWidget[] = [
  { id: "w-1", name: "Subscriber Overview", description: "Total subscribers with status breakdown (Active, Suspended, Inactive)", category: "SUBSCRIBERS", type: "STAT", icon: Users, available: true, defaultPosition: 1 },
  { id: "w-2", name: "Active Sessions", description: "Real-time count of active PPPoE/RADIUS sessions", category: "NETWORK", type: "GAUGE", icon: Wifi, available: true, defaultPosition: 2 },
  { id: "w-3", name: "Bandwidth Usage", description: "Current bandwidth utilization with download/upload split", category: "TRAFFIC", type: "CHART", icon: Activity, available: true, defaultPosition: 3 },
  { id: "w-4", name: "Revenue Today", description: "Today's revenue collection with comparison to yesterday", category: "BILLING", type: "STAT", icon: TrendingUp, available: true, defaultPosition: 4 },
  { id: "w-5", name: "Network Health", description: "Overall network health score with device status", category: "SYSTEM", type: "GAUGE", icon: Monitor, available: true, defaultPosition: 5 },
  { id: "w-6", name: "Alert Summary", description: "Count of active alerts by severity (Critical, Warning, Info)", category: "SECURITY", type: "STAT", icon: AlertTriangle, available: true, defaultPosition: 6 },
  { id: "w-7", name: "Top Subscribers", description: "List of top 10 subscribers by data usage this month", category: "TRAFFIC", type: "TABLE", icon: BarChart3, available: true, defaultPosition: 7 },
  { id: "w-8", name: "Traffic Trends", description: "7-day traffic trend chart with peak/off-peak analysis", category: "TRAFFIC", type: "CHART", icon: Activity, available: true, defaultPosition: 8 },
  { id: "w-9", name: "Payment Due", description: "Upcoming and overdue payments in next 7 days", category: "BILLING", type: "LIST", icon: Clock, available: true, defaultPosition: 9 },
  { id: "w-10", name: "New Subscribers", description: "New subscriber registrations in last 30 days", category: "SUBSCRIBERS", type: "CHART", icon: Users, available: true, defaultPosition: 10 },
  { id: "w-11", name: "IPAM Overview", description: "IP address utilization across all pools and subnets", category: "NETWORK", type: "GAUGE", icon: Globe, available: true, defaultPosition: 11 },
  { id: "w-12", name: "Firewall Stats", description: "Blocked connections and firewall rule hit counts", category: "SECURITY", type: "STAT", icon: Shield, available: true, defaultPosition: 12 },
  { id: "w-13", name: "DDoS Protection", description: "Active DDoS mitigation status and attack summary", category: "SECURITY", type: "STAT", icon: Zap, available: true, defaultPosition: 13 },
  { id: "w-14", name: "Top-Up Revenue", description: "Top-up product sales and revenue breakdown", category: "BILLING", type: "TABLE", icon: Package, available: true, defaultPosition: 14 },
  { id: "w-15", name: "Multi-WAN Status", description: "WAN link status, health, and failover information", category: "NETWORK", type: "GAUGE", icon: Globe, available: true, defaultPosition: 15 },
  { id: "w-16", name: "Churn Risk", description: "Subscribers at risk of churning based on usage patterns", category: "SUBSCRIBERS", type: "LIST", icon: Users, available: true, defaultPosition: 16 },
];

const DEMO_USERS: { id: string; name: string }[] = [
  { id: "user-1", name: "Admin" },
  { id: "user-2", name: "NOC Operator" },
  { id: "user-3", name: "Billing Manager" },
  { id: "user-4", name: "Support Lead" },
];

const CATEGORIES: WidgetCategory[] = ["NETWORK", "BILLING", "SUBSCRIBERS", "SECURITY", "SYSTEM", "TRAFFIC"];
const TYPES: WidgetType[] = ["STAT", "CHART", "TABLE", "GAUGE", "LIST", "MAP"];

// ─── Helpers ────────────────────────────────────────────────────
function getCategoryBadge(category: WidgetCategory) {
  const styles: Record<string, string> = {
    NETWORK: "bg-teal-600 hover:bg-teal-700 text-white",
    BILLING: "bg-amber-600 hover:bg-amber-700 text-white",
    SUBSCRIBERS: "bg-purple-600 hover:bg-purple-700 text-white",
    SECURITY: "bg-red-600 hover:bg-red-700 text-white",
    SYSTEM: "bg-slate-600 hover:bg-slate-700 text-white",
    TRAFFIC: "bg-green-600 hover:bg-green-700 text-white",
  };
  return <Badge className={`text-[10px] ${styles[category] || "bg-gray-500 text-white"}`}>{category}</Badge>;
}

function getTypeBadge(type: WidgetType) {
  const styles: Record<string, string> = {
    STAT: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400",
    CHART: "border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-400",
    TABLE: "border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-400",
    GAUGE: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400",
    LIST: "border-pink-300 text-pink-700 dark:border-pink-700 dark:text-pink-400",
    MAP: "border-cyan-300 text-cyan-700 dark:border-cyan-700 dark:text-cyan-400",
  };
  return <Badge variant="outline" className={`text-[10px] ${styles[type] || ""}`}>{type}</Badge>;
}

function getDefaultLayout(): WidgetLayout[] {
  return DEMO_WIDGETS.map((w) => ({
    widgetId: w.id,
    position: w.defaultPosition,
    visible: w.defaultPosition <= 10,
    size: (w.type === "CHART" || w.type === "MAP") ? "LARGE" : (w.type === "TABLE" ? "MEDIUM" : "SMALL") as "SMALL" | "MEDIUM" | "LARGE",
  }));
}

// ─── Component ────────────────────────────────────────────────────
export default function DashboardWidgetsPage() {
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // User config
  const [selectedUserId, setSelectedUserId] = useState("user-1");
  const [layout, setLayout] = useState<WidgetLayout[]>(getDefaultLayout());

  // ─── Data Fetching ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dashboard-widgets");
        if (!res.ok) throw new Error("Failed to fetch dashboard widgets");
        const data = await res.json();
        if (data && typeof data === "object") {
          if (Array.isArray(data.layouts)) {
            const userLayout = data.layouts.find((l: { userId: string }) => l.userId === selectedUserId);
            if (userLayout) setLayout(userLayout.widgets);
          }
        }
      } catch (err) {
        // logger
        setError(err instanceof Error ? err.message : "Unknown error");
        setLayout(getDefaultLayout());
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [selectedUserId]);

  const filteredWidgets = useMemo(() => {
    return DEMO_WIDGETS.filter((w) => {
      if (categoryFilter !== "ALL" && w.category !== categoryFilter) return false;
      if (typeFilter !== "ALL" && w.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [search, categoryFilter, typeFilter]);

  const visibleWidgets = useMemo(() => {
    return layout
      .filter((l) => l.visible)
      .sort((a, b) => a.position - b.position)
      .map((l) => DEMO_WIDGETS.find((w) => w.id === l.widgetId)!)
      .filter(Boolean);
  }, [layout]);

  function toggleVisibility(widgetId: string) {
    setLayout((prev) => prev.map((l) => l.widgetId === widgetId ? { ...l, visible: !l.visible } : l));
  }

  function updatePosition(widgetId: string, newPosition: number) {
    const pos = Math.max(1, Math.min(newPosition, layout.length));
    setLayout((prev) => prev.map((l) => l.widgetId === widgetId ? { ...l, position: pos } : l));
  }

  function updateSize(widgetId: string, size: "SMALL" | "MEDIUM" | "LARGE") {
    setLayout((prev) => prev.map((l) => l.widgetId === widgetId ? { ...l, size } : l));
  }

  function moveUp(widgetId: string) {
    const item = layout.find((l) => l.widgetId === widgetId);
    if (!item || item.position <= 1) return;
    const swapItem = layout.find((l) => l.position === item.position - 1);
    if (swapItem) {
      setLayout((prev) =>
        prev.map((l) => {
          if (l.widgetId === widgetId) return { ...l, position: l.position - 1 };
          if (l.widgetId === swapItem.widgetId) return { ...l, position: l.position + 1 };
          return l;
        }),
      );
    }
  }

  function moveDown(widgetId: string) {
    const item = layout.find((l) => l.widgetId === widgetId);
    if (!item || item.position >= layout.length) return;
    const swapItem = layout.find((l) => l.position === item.position + 1);
    if (swapItem) {
      setLayout((prev) =>
        prev.map((l) => {
          if (l.widgetId === widgetId) return { ...l, position: l.position + 1 };
          if (l.widgetId === swapItem.widgetId) return { ...l, position: l.position - 1 };
          return l;
        }),
      );
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/dashboard-widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, widgets: layout }),
      });
      toast.success("Dashboard layout saved successfully");
    } catch {
      toast.error("Failed to save layout");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setLayout(getDefaultLayout());
    toast.info("Layout reset to defaults");
  }

  const totalWidgets = DEMO_WIDGETS.length;
  const visibleCount = layout.filter((l) => l.visible).length;
  const categoryCount = new Set(DEMO_WIDGETS.map((w) => w.category)).size;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Dashboard Widgets"
        description="Configure dashboard widgets, layout positions, and visibility settings."
        icon={LayoutDashboard}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>Reset to Defaults</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Save Layout
            </Button>
          </div>
        }
      />

      {/* Error Banner */}
      {error && (
        <Card className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">Using default layout — API unavailable: {error}</p>
          </CardContent>
        </Card>
      )}

      {/* User Config Section */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Settings className="h-4 w-4 text-muted-foreground" />User Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Select User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  {DEMO_USERS.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Configure widget positions and visibility for <span className="font-medium text-foreground">{DEMO_USERS.find((u) => u.id === selectedUserId)?.name}</span>. Changes are per-user.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="h-16 w-full rounded-lg" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="border-0 rounded-xl ring-1 ring-teal-200/60 dark:ring-teal-800/40 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/50 dark:to-cyan-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-sm shadow-teal-500/25"><Grid3X3 className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">{totalWidgets}</p><p className="text-xs text-muted-foreground font-medium">Total Widgets</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-green-200/60 dark:ring-green-800/40 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-500/25"><Eye className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">{visibleCount}</p><p className="text-xs text-muted-foreground font-medium">Visible</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-amber-200/60 dark:ring-amber-800/40 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 shadow-sm shadow-amber-500/25"><Layers className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{categoryCount}</p><p className="text-xs text-muted-foreground font-medium">Categories</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-purple-200/60 dark:ring-purple-800/40 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/50 dark:to-violet-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-sm shadow-purple-500/25"><LayoutDashboard className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-purple-700 dark:text-purple-300">{totalWidgets - visibleCount}</p><p className="text-xs text-muted-foreground font-medium">Hidden</p></div></div></CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="catalog" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="catalog" className="flex items-center gap-1.5"><Grid3X3 className="h-3.5 w-3.5" />Widget Catalog</TabsTrigger>
          <TabsTrigger value="layout" className="flex items-center gap-1.5"><Settings className="h-3.5 w-3.5" />Configure Layout</TabsTrigger>
          <TabsTrigger value="preview" className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" />Preview</TabsTrigger>
        </TabsList>

        {/* Widget Catalog Tab */}
        <TabsContent value="catalog" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search widgets by name or description..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="border shadow-sm"><CardContent className="p-6"><Skeleton className="h-28 w-full rounded-lg" /></CardContent></Card>
              ))
            ) : filteredWidgets.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">No widgets match your filters.</div>
            ) : (
              filteredWidgets.map((widget) => {
                const IconComp = widget.icon;
                const layoutItem = layout.find((l) => l.widgetId === widget.id);
                return (
                  <Card key={widget.id} className="border shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-muted/50"><IconComp className="h-5 w-5 text-muted-foreground" /></div>
                          <div>
                            <CardTitle className="text-sm font-semibold">{widget.name}</CardTitle>
                            <div className="flex items-center gap-1.5 mt-1">
                              {getCategoryBadge(widget.category)}
                              {getTypeBadge(widget.type)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground mb-3">{widget.description}</p>
                      <div className="flex items-center justify-between">
                        <Badge variant={layoutItem?.visible ? "default" : "secondary"} className="text-[10px]">{layoutItem?.visible ? "Enabled" : "Disabled"}</Badge>
                        <Switch checked={layoutItem?.visible || false} onCheckedChange={() => toggleVisibility(widget.id)} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Configure Layout Tab */}
        <TabsContent value="layout" className="space-y-4">
          <p className="text-sm text-muted-foreground">Use arrows to reorder widgets, toggle visibility, and set sizes for <span className="font-medium text-foreground">{DEMO_USERS.find((u) => u.id === selectedUserId)?.name}</span>.</p>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-16">Position</TableHead>
                        <TableHead className="text-xs">Widget</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Category</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Type</TableHead>
                        <TableHead className="text-xs">Visible</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Size</TableHead>
                        <TableHead className="text-xs text-right">Order</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...layout].sort((a, b) => a.position - b.position).map((item) => {
                        const widget = DEMO_WIDGETS.find((w) => w.id === item.widgetId);
                        if (!widget) return null;
                        const IconComp = widget.icon;
                        return (
                          <TableRow key={item.widgetId} className={`hover:bg-muted/50 transition-colors ${!item.visible ? "opacity-50" : ""}`}>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                max={layout.length}
                                value={item.position}
                                onChange={(e) => updatePosition(item.widgetId, parseInt(e.target.value) || 1)}
                                className="h-7 w-14 text-xs text-center font-mono"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded bg-muted/50"><IconComp className="h-3.5 w-3.5 text-muted-foreground" /></div>
                                <span className="text-xs font-medium">{widget.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">{getCategoryBadge(widget.category)}</TableCell>
                            <TableCell className="hidden md:table-cell">{getTypeBadge(widget.type)}</TableCell>
                            <TableCell><Switch checked={item.visible} onCheckedChange={() => toggleVisibility(item.widgetId)} className="scale-75" /></TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Select value={item.size} onValueChange={(v) => updateSize(item.widgetId, v as "SMALL" | "MEDIUM" | "LARGE")}>
                                <SelectTrigger className="h-7 w-[100px] text-[10px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="SMALL">Small</SelectItem>
                                  <SelectItem value="MEDIUM">Medium</SelectItem>
                                  <SelectItem value="LARGE">Large</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={item.position <= 1} onClick={() => moveUp(item.widgetId)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={item.position >= layout.length} onClick={() => moveDown(item.widgetId)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preview Tab */}
        <TabsContent value="preview" className="space-y-4">
          <p className="text-sm text-muted-foreground">Preview of how the dashboard will look with your current widget configuration.</p>
          {visibleWidgets.length === 0 ? (
            <Card className="border shadow-sm">
              <CardContent className="p-12 text-center text-muted-foreground">
                <Grid3X3 className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No widgets are visible. Toggle widgets in the catalog or layout tab.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleWidgets.map((widget) => {
                const layoutItem = layout.find((l) => l.widgetId === widget.id);
                const sizeClass = layoutItem?.size === "LARGE" ? "md:col-span-2 lg:col-span-2" : "";
                const heightClass = layoutItem?.size === "LARGE" ? "h-40" : layoutItem?.size === "MEDIUM" ? "h-32" : "h-24";
                const IconComp = widget.icon;
                return (
                  <Card key={widget.id} className={`border shadow-sm ${sizeClass}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center h-7 w-7 rounded-md bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"><IconComp className="h-3.5 w-3.5" /></div>
                          <CardTitle className="text-xs font-semibold">{widget.name}</CardTitle>
                        </div>
                        <Badge variant="outline" className="text-[9px]">#{layoutItem?.position}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className={`${heightClass} rounded-lg bg-muted/20 border border-dashed border-muted-foreground/20 flex items-center justify-center`}>
                        <div className="text-center">
                          <IconComp className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                          <p className="text-[10px] text-muted-foreground/60">
                            {widget.type === "CHART" ? "Chart Preview" : widget.type === "GAUGE" ? "Gauge Preview" : widget.type === "TABLE" ? "Table Preview" : widget.type === "LIST" ? "List Preview" : widget.type === "MAP" ? "Map Preview" : "Stat Preview"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
