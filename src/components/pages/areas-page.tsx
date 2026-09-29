"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Plus, Pencil, Trash2, Loader2, Users, Search, Eye,
  ChevronLeft, ChevronRight, Map, List, Locate, Navigation,
  Ruler, Copy, BarChart3, BadgeCheck,
  Power, PowerOff, GripVertical, Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";

// ─── Leaflet (dynamic import to avoid SSR issues) ─────────────
import dynamic from "next/dynamic";

const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((mod) => mod.Popup),
  { ssr: false }
);
const Polyline = dynamic(
  () => import("react-leaflet").then((mod) => mod.Polyline),
  { ssr: false }
);

// ─── Types ────────────────────────────────────────────────────

interface AreaItem {
  id: string;
  name: string;
  code: string;
  description: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  subscriberCount: number;
  createdAt: string;
  parentId: string | null;
  parentName: string | null;
  sortOrder: number;
}

interface AreaStats {
  subscriberCount: number;
  deviceCount: number;
  complaintCount: number;
  openComplaints: number;
  totalRevenue: number;
  activeSubs: number;
}

// ─── Haversine distance (km) ──────────────────────────────────

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Area depth helper (for hierarchy indentation) ─────────

function getAreaDepth(area: AreaItem, allAreas: AreaItem[]): number {
  let depth = 0;
  let current = area;
  const visited = new Set<string>();
  while (current.parentId) {
    if (visited.has(current.id)) break; // prevent infinite loops
    visited.add(current.id);
    const parent = allAreas.find((a) => a.id === current.parentId);
    if (!parent) break;
    depth++;
    current = parent;
  }
  return depth;
}

const emptyForm = {
  name: "", code: "", description: "",
  assignedTechnicianId: "", assignedAgentId: "",
  latitude: null as number | null, longitude: null as number | null,
  parentId: "", status: "ACTIVE",
};

const AREA_STATUSES = ["ACTIVE", "INACTIVE", "EXPANDING", "PLANNED"] as const;

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  INACTIVE: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  EXPANDING: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  PLANNED: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
};

// ─── Component ────────────────────────────────────────────────

export default function AreasPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [showDistances, setShowDistances] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [reportAreaId, setReportAreaId] = useState<string | null>(null);
  const [detailStatsAreaId, setDetailStatsAreaId] = useState<string | null>(null);
  const [filterParentId, setFilterParentId] = useState("all");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const limit = 20;

  // ── Queries ──

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterParentId !== "all") params.set("parentId", filterParentId);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return params.toString();
  }, [search, page, filterStatus, filterParentId]);

  const { data, isLoading } = useQuery<{
    items: AreaItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["areas", search, page, filterStatus, filterParentId],
    queryFn: async () => {
      return apiFetch(`/api/areas?${buildQueryParams()}`);
    },
  });

  // Fetch all areas for map (no pagination)
  const { data: allAreasData } = useQuery<{
    items: AreaItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["areas-all"],
    queryFn: async () => {
      return apiFetch("/api/areas?limit=1000");
    },
  });

  const areas = data?.items || [];
  const pagination = data?.pagination;
  const mapAreas = allAreasData?.items || [];

  const { data: technicians } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["technicians-list"],
    queryFn: async () => {
      try {
        const data = await apiFetch<{ technicians?: any[]; items?: any[] }>("/api/technicians?limit=200");
        const list = data.technicians || data.items || [];
        return (Array.isArray(list) ? list : []).map((t: any) => ({ id: t.id, name: t.name }));
      } catch { return []; }
    },
  });

  const { data: agents } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["agents-list"],
    queryFn: async () => {
      try {
        const data = await apiFetch<{ agents?: any[]; items?: any[] }>("/api/agents");
        const list = data.agents || data.items || [];
        return (Array.isArray(list) ? list : []).map((a: any) => ({ id: a.id, name: a.name }));
      } catch { return []; }
    },
  });

  // ── Area stats for report dialog ──
  const { data: areaStats } = useQuery<{ [key: string]: AreaStats }>({
    queryKey: ["area-stats", reportAreaId],
    queryFn: async () => {
      if (!reportAreaId) return {};
      return apiFetch(`/api/areas/${reportAreaId}?stats=true`);
    },
    enabled: !!reportAreaId,
  });

  // ── Area stats for detail dialog ──
  const { data: detailAreaData } = useQuery<any>({
    queryKey: ["area-detail", detailStatsAreaId],
    queryFn: async () => {
      if (!detailStatsAreaId) return null;
      return apiFetch(`/api/areas/${detailStatsAreaId}?stats=true`);
    },
    enabled: !!detailStatsAreaId,
  });

  // ── Mutations ──

  const createMutation = useMutation({
    mutationFn: async (body: typeof emptyForm) => {
      return apiFetch("/api/areas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: () => {
      if (isCloning) {
        toast.success("Area cloned successfully");
      } else {
        toast.success("Area created");
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      setIsCloning(false);
      queryClient.invalidateQueries({ queryKey: ["areas"] });
      queryClient.invalidateQueries({ queryKey: ["areas-all"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create area"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: typeof emptyForm & { id: string }) => {
      return apiFetch(`/api/areas/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: () => { toast.success("Area updated"); setDialogOpen(false); setForm(emptyForm); setEditingId(null); queryClient.invalidateQueries({ queryKey: ["areas"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to update area"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/areas/${id}`, { method: "DELETE" });
    },
    onSuccess: () => { toast.success("Area deleted"); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["areas"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to delete area"),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiFetch("/api/areas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle-status", id, status }) });
    },
    onSuccess: () => { toast.success("Area status updated"); queryClient.invalidateQueries({ queryKey: ["areas"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to update status"),
  });

  const reorderMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      apiFetch("/api/areas/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }),
    onSuccess: () => { toast.success("Area order updated"); queryClient.invalidateQueries({ queryKey: ["areas"] }); queryClient.invalidateQueries({ queryKey: ["areas-all"] }); },
    onError: (err: Error) => toast.error(err.message || "Failed to reorder areas"),
  });

  const importMutation = useMutation({
    mutationFn: async (rows: any[]) =>
      apiFetch("/api/areas/bulk-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }),
    onSuccess: (res: any) => {
      toast.success(`Imported ${res.created} areas (${res.errors} errors)`);
      setImportDialogOpen(false);
      setImportPreview([]);
      setImportFile(null);
      queryClient.invalidateQueries({ queryKey: ["areas"] });
      queryClient.invalidateQueries({ queryKey: ["areas-all"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to import areas"),
  });

  // ── Handlers ──

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Area name is required."); return; }
    if (!form.code.trim()) { toast.error("Area code is required."); return; }
    if (form.latitude !== null && (form.latitude < -90 || form.latitude > 90)) { toast.error("Latitude must be between -90 and 90."); return; }
    if (form.longitude !== null && (form.longitude < -180 || form.longitude > 180)) { toast.error("Longitude must be between -180 and 180."); return; }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length === 0) return;
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const rows = lines.slice(1).filter((l) => l.trim()).map((line) => {
        const cols = line.split(",").map((c) => c.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = cols[i] || ""; });
        return row;
      });
      setImportPreview(rows);
    };
    reader.readAsText(file);
  };

  // ── Drag-and-Drop handlers ──

  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the current row (not entering a child)
    const relatedTarget = e.relatedTarget as Node | null;
    if (relatedTarget && (e.currentTarget as Node).contains(relatedTarget)) return;
    setOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragIndex !== null && dragIndex !== index) {
      const newIds = areas.map((a) => a.id);
      const draggedId = newIds.splice(dragIndex, 1)[0];
      newIds.splice(index, 0, draggedId);
      reorderMutation.mutate(newIds);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const openEdit = (a: AreaItem) => {
    setForm({
      name: a.name, code: a.code, description: a.description,
      assignedTechnicianId: a.assignedTechnicianId || "", assignedAgentId: a.assignedAgentId || "",
      latitude: a.latitude, longitude: a.longitude,
      parentId: a.parentId || "",
      status: a.status || "ACTIVE",
    });
    setEditingId(a.id);
    setIsCloning(false);
    setDialogOpen(true);
  };

  const openClone = (a: AreaItem) => {
    setForm({
      name: `${a.name} (Copy)`,
      code: "",
      description: a.description,
      assignedTechnicianId: "",
      assignedAgentId: "",
      latitude: a.latitude,
      longitude: a.longitude,
      parentId: a.parentId || "",
      status: a.status || "ACTIVE",
    });
    setEditingId(null);
    setIsCloning(true);
    setDialogOpen(true);
  };

  const openCreate = () => { setForm(emptyForm); setEditingId(null); setIsCloning(false); setDialogOpen(true); };

  const handleSearchChange = (val: string) => { setSearch(val); setPage(1); };
  const handleStatusChange = (val: string) => { setFilterStatus(val); setPage(1); };
  const handleParentChange = (val: string) => { setFilterParentId(val); setPage(1); };

  const locateOnMap = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: parseFloat(pos.coords.latitude.toFixed(6)), longitude: parseFloat(pos.coords.longitude.toFixed(6)) }));
        toast.success("Location detected!");
      },
      () => toast.error("Could not detect location. Check browser permissions."),
      { enableHighAccuracy: true }
    );
  };

  const cycleStatus = (a: AreaItem) => {
    const statuses = ["ACTIVE", "INACTIVE", "EXPANDING", "PLANNED"];
    const idx = statuses.indexOf(a.status);
    const nextStatus = statuses[(idx + 1) % statuses.length];
    toggleStatusMutation.mutate({ id: a.id, status: nextStatus });
  };

  // ── Status distribution counts ──

  const activeCount = mapAreas.filter((a) => a.status === "ACTIVE").length;
  const inactiveCount = mapAreas.filter((a) => a.status === "INACTIVE").length;
  const expandingCount = mapAreas.filter((a) => a.status === "EXPANDING").length;
  const plannedCount = mapAreas.filter((a) => a.status === "PLANNED").length;

  // ── Map computed values ──

  const geoAreas = mapAreas.filter((a) => a.latitude !== null && a.longitude !== null);
  const selectedArea = mapAreas.find((a) => a.id === selectedAreaId);

  let mapCenter: [number, number] = [20.5937, 78.9629];
  if (selectedArea && selectedArea.latitude !== null && selectedArea.longitude !== null) {
    mapCenter = [selectedArea.latitude, selectedArea.longitude];
  } else if (geoAreas.length > 0) {
    const avgLat = geoAreas.reduce((s, a) => s + (a.latitude || 0), 0) / geoAreas.length;
    const avgLon = geoAreas.reduce((s, a) => s + (a.longitude || 0), 0) / geoAreas.length;
    mapCenter = [avgLat, avgLon];
  }

  let distanceLines: { from: AreaItem; to: AreaItem; distance: number }[] = [];
  if (showDistances && geoAreas.length >= 2) {
    const base = selectedArea || geoAreas[0];
    const lines: { from: AreaItem; to: AreaItem; distance: number }[] = [];
    for (const area of geoAreas) {
      if (area.id === base.id) continue;
      const dist = haversineDistance(base.latitude!, base.longitude!, area.latitude!, area.longitude!);
      lines.push({ from: base, to: area, distance: dist });
    }
    distanceLines = lines.sort((a, b) => a.distance - b.distance);
  }

  // Leaflet CSS
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  const detailItem = detailId ? areas.find((a) => a.id === detailId) : null;

  // Report data for selected area
  const reportData = reportAreaId ? (areaStats?.[reportAreaId] as AreaStats | undefined) : null;

  // Dialog title based on mode
  const dialogTitle = isCloning ? "Clone Area" : editingId ? "Edit Area" : "Add Area";

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Areas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage service areas, zones, and coverage regions with map view.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search by area name, code..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9 h-9 w-full sm:w-56" />
          </div>
          {/* Status Filter */}
          <Select value={filterStatus} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {AREA_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Parent Area Filter */}
          <Select value={filterParentId} onValueChange={handleParentChange}>
            <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="All Areas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              {mapAreas.filter((a) => !a.parentId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* View mode toggle */}
          <div className="flex rounded-lg border overflow-hidden">
            <Button size="sm" variant={viewMode === "list" ? "default" : "ghost"} className={viewMode === "list" ? "bg-red-600 hover:bg-red-700 text-white rounded-none h-9 px-3" : "rounded-none h-9 px-3"} onClick={() => setViewMode("list")}>
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant={viewMode === "map" ? "default" : "ghost"} className={viewMode === "map" ? "bg-red-600 hover:bg-red-700 text-white rounded-none h-9 px-3" : "rounded-none h-9 px-3"} onClick={() => setViewMode("map")}>
              <Map className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Area
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => { setImportPreview([]); setImportFile(null); setImportDialogOpen(true); }}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
          </Button>
        </div>
      </div>

      {/* Stats row with status distribution */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <Card className="border shadow-sm"><CardContent className="p-4 text-center"><MapPin className="h-5 w-5 text-red-600 mx-auto mb-1" /><p className="text-2xl font-bold">{pagination?.total || 0}</p><p className="text-xs text-muted-foreground">Total Areas</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4 text-center"><MapPin className="h-5 w-5 text-green-600 mx-auto mb-1" /><p className="text-2xl font-bold text-green-600">{geoAreas.length}</p><p className="text-xs text-muted-foreground">With Location</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Users className="h-5 w-5 text-teal-600 mx-auto mb-1" /><p className="text-2xl font-bold text-teal-600">{mapAreas.reduce((s, a) => s + a.subscriberCount, 0)}</p><p className="text-xs text-muted-foreground">Subscribers</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4 text-center"><BadgeCheck className="h-5 w-5 text-green-600 mx-auto mb-1" /><p className="text-2xl font-bold text-green-600">{activeCount}</p><p className="text-xs text-muted-foreground">Active</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4 text-center"><PowerOff className="h-5 w-5 text-gray-500 mx-auto mb-1" /><p className="text-2xl font-bold text-gray-500">{inactiveCount}</p><p className="text-xs text-muted-foreground">Inactive</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Ruler className="h-5 w-5 text-teal-600 mx-auto mb-1" /><p className="text-2xl font-bold text-teal-600">{expandingCount}</p><p className="text-xs text-muted-foreground">Expanding</p></CardContent></Card>
        <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Navigation className="h-5 w-5 text-amber-600 mx-auto mb-1" /><p className="text-2xl font-bold text-amber-600">{plannedCount}</p><p className="text-xs text-muted-foreground">Planned</p></CardContent></Card>
      </div>

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-red-600" />
              Service Areas ({pagination?.total || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2"><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /><Skeleton className="skeleton-wave h-10" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-10"></TableHead>
                      <TableHead className="text-xs">Area</TableHead>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Location</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Subscribers</TableHead>
                      <TableHead className="text-xs">Technician</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {areas.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">{search ? "No areas match your search." : "No areas defined yet."}</TableCell></TableRow>
                    ) : (
                      areas.map((a, index) => (
                        <TableRow
                          key={a.id}
                          className={`${dragIndex === index ? "opacity-40" : ""} ${dragIndex !== null && overIndex === index ? "border-t-2 border-t-red-500" : ""} transition-colors`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={(e) => handleDragLeave(e)}
                          onDrop={(e) => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                        >
                          <TableCell className="text-xs">
                            <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"><GripVertical className="h-4 w-4" /></div>
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            <div className="flex items-center gap-1" style={{ paddingLeft: (a.parentId ? (getAreaDepth(a, mapAreas) * 20) : 0) }}>
                              {a.parentId && <span className="text-muted-foreground text-xs">↳</span>}
                              {a.name}
                              {a.parentName && <span className="text-muted-foreground text-xs ml-1">({a.parentName})</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-mono">{a.code}</TableCell>
                          <TableCell>
                            {a.latitude !== null && a.longitude !== null ? (
                              <Badge variant="outline" className="text-[10px] gap-1 text-green-700 border-green-200">
                                <MapPin className="h-2.5 w-2.5" />
                                {a.latitude.toFixed(4)}, {a.longitude.toFixed(4)}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not set</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">{a.description || "-"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs gap-1"><Users className="h-3 w-3" />{a.subscriberCount}</Badge></TableCell>
                          <TableCell className="text-sm">{a.assignedTechnicianName || <span className="text-muted-foreground text-xs">Unassigned</span>}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[a.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                {a.status}
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={`h-6 w-6 p-0 ${a.status === "INACTIVE" ? "text-green-600 hover:text-green-700 hover:bg-green-50" : a.status === "ACTIVE" ? "text-gray-500 hover:text-gray-700 hover:bg-gray-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                                title={a.status === "INACTIVE" ? "Activate" : a.status === "ACTIVE" ? "Deactivate" : "Toggle Status"}
                                onClick={() => toggleStatusMutation.mutate({ id: a.id, status: a.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}
                                disabled={toggleStatusMutation.isPending}
                              >
                                {a.status === "INACTIVE" ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View" onClick={() => { setDetailId(a.id); setDetailStatsAreaId(a.id); }}><Eye className="h-3.5 w-3.5" /></Button>
                              {a.latitude !== null && a.longitude !== null && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Show on Map" onClick={() => { setSelectedAreaId(a.id); setViewMode("map"); }}>
                                  <Navigation className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Report" onClick={() => setReportAreaId(a.id)}><BarChart3 className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Clone" onClick={() => openClone(a)}><Copy className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" title="Delete" onClick={() => setDeleteId(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={pagination.page <= 1} onClick={() => setPage((p) => p - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (pagination.totalPages <= 5) pageNum = i + 1;
                        else if (pagination.page <= 3) pageNum = i + 1;
                        else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                        else pageNum = pagination.page - 2 + i;
                        return (
                          <Button key={pageNum} size="sm" variant={pagination.page === pageNum ? "default" : "outline"} className={pagination.page === pageNum ? "bg-red-600 hover:bg-red-700 text-white h-8 w-8 p-0" : "h-8 w-8 p-0"} onClick={() => setPage(pageNum)}>
                            {pageNum}
                          </Button>
                        );
                      })}
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MAP VIEW */}
      {viewMode === "map" && (
        <>
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Map className="h-4 w-4 text-red-600" />
                  Area Map ({geoAreas.length} with location)
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant={showDistances ? "default" : "outline"} className={showDistances ? "bg-red-600 hover:bg-red-700 text-white h-8 text-xs" : "h-8 text-xs"} onClick={() => setShowDistances(!showDistances)}>
                    <Ruler className="h-3 w-3 mr-1" />
                    {showDistances ? "Hide Distances" : "Show Distances"}
                  </Button>
                  {selectedArea && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSelectedAreaId(null)}>
                      Clear Selection
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg overflow-hidden border" style={{ height: "500px" }}>
                {typeof window !== "undefined" && (
                  <MapContainer center={mapCenter} zoom={geoAreas.length > 0 ? 12 : 5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {geoAreas.map((area) => (
                      <Marker key={area.id} position={[area.latitude!, area.longitude!]} eventHandlers={{ click: () => setSelectedAreaId(area.id) }}>
                        <Popup>
                          <div className="text-xs space-y-1 min-w-[150px]">
                            <p className="font-bold text-sm">{area.name}</p>
                            <p><span className="text-gray-500">Code:</span> {area.code}</p>
                            <p><span className="text-gray-500">Subscribers:</span> {area.subscriberCount}</p>
                            <p><span className="text-gray-500">Status:</span> {area.status}</p>
                            <p><span className="text-gray-500">Coords:</span> {area.latitude!.toFixed(5)}, {area.longitude!.toFixed(5)}</p>
                            {area.assignedTechnicianName && <p><span className="text-gray-500">Tech:</span> {area.assignedTechnicianName}</p>}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    {showDistances && distanceLines.map((line) => (
                      <Polyline
                        key={`${line.from.id}-${line.to.id}`}
                        positions={[[line.from.latitude!, line.from.longitude!], [line.to.latitude!, line.to.longitude!]]}
                        pathOptions={{ color: "#DC2626", weight: 2, opacity: 0.6, dashArray: "6 4" }}
                      >
                        <Popup>
                          <div className="text-xs">
                            <p className="font-semibold">{line.from.name} → {line.to.name}</p>
                            <p className="text-red-600 font-bold">{line.distance.toFixed(1)} km</p>
                          </div>
                        </Popup>
                      </Polyline>
                    ))}
                  </MapContainer>
                )}
              </div>

              {/* Distance table */}
              {showDistances && distanceLines.length > 0 && (
                <div className="mt-4 border rounded-lg overflow-hidden max-h-[250px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">From</TableHead>
                        <TableHead className="text-xs">To</TableHead>
                        <TableHead className="text-xs">Distance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {distanceLines.map((line) => (
                        <TableRow key={`${line.from.id}-${line.to.id}`} className={`${selectedArea?.id === line.from.id ? "bg-red-50" : ""} hover:bg-muted/50 transition-colors duration-150`}>
                          <TableCell className="text-sm font-medium">{line.from.name}</TableCell>
                          <TableCell className="text-sm">{line.to.name}</TableCell>
                          <TableCell className="text-sm font-semibold text-red-600">{line.distance.toFixed(1)} km</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Create/Edit/Clone Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setForm(emptyForm); setEditingId(null); setIsCloning(false); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{dialogTitle}</DialogTitle>
            {isCloning && (
              <DialogDescription className="text-xs text-muted-foreground">
                Create a new area based on an existing one. Provide a unique code and adjust details as needed.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Area Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Area Code *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder={isCloning ? "Enter unique code" : undefined} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {AREA_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${s === "ACTIVE" ? "bg-green-500" : s === "INACTIVE" ? "bg-gray-400" : s === "EXPANDING" ? "bg-teal-500" : "bg-amber-500"}`} />
                        {s}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parent Area */}
            <div className="space-y-1.5">
              <Label className="text-xs">Parent Area</Label>
              <Select value={form.parentId || "none"} onValueChange={(v) => setForm({ ...form, parentId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None (Top-level)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top-level)</SelectItem>
                  {mapAreas
                    .filter((a) => !a.parentId && a.id !== editingId)
                    .map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-red-600" />Location (Lat/Long)</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={locateOnMap}>
                  <Locate className="h-3 w-3" /> Detect My Location
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Latitude</Label>
                  <Input type="number" step="0.000001" placeholder="e.g. 20.5937" value={form.latitude ?? ""} onChange={(e) => setForm({ ...form, latitude: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Longitude</Label>
                  <Input type="number" step="0.000001" placeholder="e.g. 78.9629" value={form.longitude ?? ""} onChange={(e) => setForm({ ...form, longitude: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
              {form.latitude !== null && form.longitude !== null && (
                <p className="text-[10px] text-muted-foreground">{form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Assign Technician</Label>
                <Select value={form.assignedTechnicianId} onValueChange={(v) => setForm({ ...form, assignedTechnicianId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {technicians?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Assign Agent</Label>
                <Select value={form.assignedAgentId} onValueChange={(v) => setForm({ ...form, assignedAgentId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {agents?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setDialogOpen(false); setForm(emptyForm); setEditingId(null); setIsCloning(false); }}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createMutation.isPending || updateMutation.isPending} onClick={handleSubmit}>
                {(createMutation.isPending || updateMutation.isPending) ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : isCloning ? "Clone Area" : editingId ? "Update" : "Create Area"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import CSV Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) { setImportDialogOpen(false); setImportPreview([]); setImportFile(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Import Areas from CSV</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Upload a CSV file with columns: name, code, description, status, parentName, latitude, longitude
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept=".csv"
                onChange={handleImportFile}
                className="flex-1 text-sm"
              />
            </div>
            {importFile && (
              <p className="text-xs text-muted-foreground">File: {importFile.name} ({importPreview.length} rows)</p>
            )}
            {importPreview.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Code</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Parent</TableHead>
                        <TableHead className="text-xs">Lat</TableHead>
                        <TableHead className="text-xs">Lng</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.map((row, i) => (
                        <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="text-sm font-medium">{row.name || "-"}</TableCell>
                          <TableCell className="text-sm font-mono">{row.code || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[row.status?.toUpperCase()] || STATUS_COLORS.ACTIVE}`}>
                              {row.status || "ACTIVE"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.parentname || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.latitude || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.longitude || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportPreview([]); setImportFile(null); }}>Cancel</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={importPreview.length === 0 || importMutation.isPending}
                onClick={() => importMutation.mutate(importPreview)}
              >
                {importMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Importing...</> : `Import ${importPreview.length} Areas`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">Area Details</DialogTitle></DialogHeader>
          {detailItem ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Name:</span><p className="font-semibold">{detailItem.name}</p></div>
                <div><span className="text-muted-foreground">Code:</span><p className="font-mono">{detailItem.code}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground">Description:</span><p>{detailItem.description || "—"}</p></div>
                <div><span className="text-muted-foreground">Location:</span>
                  {detailItem.latitude !== null && detailItem.longitude !== null ? (
                    <p className="font-mono text-xs">{detailItem.latitude.toFixed(6)}, {detailItem.longitude.toFixed(6)}</p>
                  ) : <p className="text-muted-foreground">Not set</p>}
                </div>
                <div><span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[detailItem.status] || ""}`}>{detailItem.status}</Badge>
                </div>
                <div><span className="text-muted-foreground">Technician:</span><p>{detailItem.assignedTechnicianName || "—"}</p></div>
                <div><span className="text-muted-foreground">Agent:</span><p>{detailItem.assignedAgentName || "—"}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground">Created:</span><p>{new Date(detailItem.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p></div>
              </div>
              {/* Coverage Stats */}
              {detailAreaData?.stats && (
                <div className="border rounded-lg p-3 mt-2">
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Coverage Statistics</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-muted/50 text-center"><p className="text-[10px] text-muted-foreground">Subscribers</p><p className="text-sm font-bold">{detailAreaData.stats.subscriberCount}</p></div>
                    <div className="p-2 rounded bg-muted/50 text-center"><p className="text-[10px] text-muted-foreground">Active Subs</p><p className="text-sm font-bold text-green-600">{detailAreaData.stats.activeSubs}</p></div>
                    <div className="p-2 rounded bg-muted/50 text-center"><p className="text-[10px] text-muted-foreground">Devices</p><p className="text-sm font-bold text-teal-600">{detailAreaData.stats.deviceCount}</p></div>
                    <div className="p-2 rounded bg-muted/50 text-center"><p className="text-[10px] text-muted-foreground">Complaints</p><p className="text-sm font-bold">{detailAreaData.stats.complaintCount}<span className="text-xs text-orange-600 ml-1">({detailAreaData.stats.openComplaints} open)</span></p></div>
                    <div className="col-span-2 p-2 rounded bg-muted/50 text-center"><p className="text-[10px] text-muted-foreground">Total Revenue</p><p className="text-sm font-bold text-emerald-600">{formatINR(detailAreaData.stats.totalRevenue)}</p></div>
                  </div>
                </div>
              )}
              {detailItem.latitude !== null && detailItem.longitude !== null && (() => {
                const dists = geoAreas
                  .filter((a) => a.id !== detailItem.id && a.latitude !== null && a.longitude !== null)
                  .map((a) => ({ name: a.name, distance: haversineDistance(detailItem.latitude!, detailItem.longitude!, a.latitude!, a.longitude!) }))
                  .sort((a, b) => a.distance - b.distance)
                  .slice(0, 5);
                if (dists.length === 0) return null;
                return (
                  <div className="border rounded-lg p-3 mt-2">
                    <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Ruler className="h-3 w-3" /> Nearest Areas</p>
                    <div className="space-y-1">
                      {dists.map((d) => (
                        <div key={d.name} className="flex justify-between text-xs">
                          <span>{d.name}</span>
                          <span className="font-semibold text-red-600">{d.distance.toFixed(1)} km</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="flex justify-end pt-2 gap-2">
                {detailItem.latitude !== null && detailItem.longitude !== null && (
                  <Button variant="outline" onClick={() => { setDetailId(null); setSelectedAreaId(detailItem.id); setViewMode("map"); }}>
                    <Navigation className="h-3.5 w-3.5 mr-1.5" /> Show on Map
                  </Button>
                )}
                <Button variant="outline" onClick={() => { setDetailId(null); openEdit(detailItem); }}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">Area not found.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Report Dialog */}
      <Dialog open={!!reportAreaId} onOpenChange={() => setReportAreaId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-red-600" />Area Report</DialogTitle></DialogHeader>
          {reportData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Subscribers</p><p className="text-xl font-bold">{reportData.subscriberCount}</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active Subs</p><p className="text-xl font-bold text-green-600">{reportData.activeSubs}</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Devices</p><p className="text-xl font-bold">{reportData.deviceCount}</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Complaints</p><p className="text-xl font-bold">{reportData.complaintCount}</p></CardContent></Card>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open Complaints</p><p className="text-xl font-bold text-orange-600">{reportData.openComplaints}</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-xl font-bold text-emerald-600">{formatINR(reportData.totalRevenue)}</p></CardContent></Card>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setReportAreaId(null)}>Close</Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /><p className="text-sm text-muted-foreground">Loading report data...</p></div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Area</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete this area? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" disabled={deleteMutation.isPending} onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {deleteMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Deleting...</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
