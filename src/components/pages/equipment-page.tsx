"use client";

import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, Plus, Pencil, Trash2, Loader2, Search, Filter, Eye, ChevronLeft, ChevronRight,
  AlertTriangle, BarChart3, Settings2, ChevronDown, TrendingUp, ArrowRightLeft, RotateCcw,
  Wrench, Star, ClipboardCheck, Warehouse, Truck, Shield, Calculator, X, MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";
import WarehousesTab from "@/components/pages/tabs/warehouses-tab";
import ReturnsTab from "@/components/pages/tabs/returns-tab";
import RepairsTab from "@/components/pages/tabs/repairs-tab";
import StockTab from "@/components/pages/tabs/stock-tab";

// ─── Types ────────────────────────────────────────────────────

interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  condition: string;
  status: string;
  stockLocation: string;
  purchasePrice: number;
  purchaseDate: string | null;
  depreciationRate: number;
  bookValue: number;
  warrantyExpiry: string | null;
  warrantyProvider: string;
  warrantyNumber: string;
  repairStatus: string;
  assignedSubscriberId: string | null;
  assignedSubscriberName: string | null;
  createdAt: string;
  macAddress?: string;
  vendorName?: string;
  vendorId?: string;
  currentValue?: number;
  returnCondition?: string;
  returnedAt?: string;
}

interface StockSummary {
  total: number;
  inStock: number;
  deployed: number;
  returned: number;
  decommissioned: number;
  totalValue: number;
}

interface AnalyticsData {
  categoryDistribution: Array<{ category: string; count: number }>;
  conditionDistribution: Array<{ condition: string; count: number }>;
  monthlyAdditions: Array<{ month: string; label: string; count: number }>;
  lowStockData: Record<string, { inStock: number; total: number }>;
  valueByCategory: Array<{ category: string; totalValue: number }>;
  locationDistribution?: Array<{ location: string; count: number }>;
}

interface VendorItem {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  category: string;
  rating: number;
  notes: string;
  createdAt: string;
  _count?: { equipment: number };
}

interface PurchaseOrderItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  total: number;
  notes: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  vendorId: string | null;
  status: string;
  orderDate: string;
  expectedDate: string | null;
  totalAmount: number;
  notes: string;
  vendor?: { id: string; name: string; contactPerson?: string; phone?: string } | null;
  items: PurchaseOrderItem[];
  createdAt: string;
}

interface StockTransfer {
  id: string;
  equipmentId: string;
  fromLocation: string;
  toLocation: string;
  status: string;
  notes: string;
  createdAt: string;
  equipment?: { id: string; name: string; serialNumber: string; category: string };
}

interface RepairRecord {
  id: string;
  equipmentId: string;
  issueDescription: string;
  diagnosisNotes: string;
  repairAction: string;
  cost: number;
  status: string;
  completedAt: string | null;
  createdAt: string;
}

interface InspectionRecord {
  id: string;
  equipmentId: string;
  condition: string;
  notes: string;
  checklistResult: string;
  passed: boolean;
  createdAt: string;
}

interface StockCountRow {
  category: string;
  stockLocation: string;
  _count: { id: number };
  _sum: { purchasePrice: number | null };
}

interface StockCountData {
  stockCounts: StockCountRow[];
  totalByCategory: Array<{ category: string; _count: { id: number } }>;
  locations: string[];
}

// ─── Form type ────────────────────────────────────────────────

interface EquipmentForm {
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  macAddress: string;
  condition: string;
  status: string;
  stockLocation: string;
  purchasePrice: number;
  purchaseDate: string;
  depreciationRate: number;
  warrantyExpiry: string;
  warrantyProvider: string;
  warrantyNumber: string;
  vendorId: string;
}

// ─── Constants ────────────────────────────────────────────────

const CATEGORIES = ["ROUTER", "ONT", "SWITCH", "AP", "CABLE", "SPLITTER", "ANTENNA", "UPS", "PATCH_CORD", "OLT", "POWER_SUPPLY", "OTHER"];
const CONDITIONS = ["NEW", "GOOD", "DAMAGED", "DEAD"];
const STATUSES = ["IN_STOCK", "DEPLOYED", "RETURNED", "DECOMMISSIONED"];
const PO_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "ORDERED", "RECEIVED", "CANCELLED"];
const REPAIR_STATUSES = ["SUBMITTED", "IN_PROGRESS", "COMPLETED", "UNREPAIRABLE"];
const TRANSFER_STATUSES = ["PENDING", "COMPLETED", "CANCELLED"];
const RETURN_CONDITIONS = ["NEW", "GOOD", "DAMAGED", "DEAD"];
const WARRANTY_FILTERS = ["all", "active", "expiring_soon", "expired"];

const STATUS_STYLES: Record<string, string> = {
  IN_STOCK: "bg-teal-100 text-teal-700 border-teal-200",
  DEPLOYED: "bg-green-100 text-green-700 border-green-200",
  RETURNED: "bg-yellow-100 text-yellow-700 border-yellow-200",
  DECOMMISSIONED: "bg-gray-100 text-gray-600 border-gray-200",
};

const CONDITION_STYLES: Record<string, string> = {
  NEW: "bg-green-100 text-green-700 border-green-200",
  GOOD: "bg-teal-100 text-teal-700 border-teal-200",
  DAMAGED: "bg-orange-100 text-orange-700 border-orange-200",
  DEAD: "bg-red-100 text-red-700 border-red-200",
};

const REPAIR_STATUS_STYLES: Record<string, string> = {
  "": "",
  SUBMITTED: "bg-yellow-100 text-yellow-700 border-yellow-200",
  IN_PROGRESS: "bg-teal-100 text-teal-700 border-teal-200",
  COMPLETED: "bg-green-100 text-green-700 border-green-200",
  UNREPAIRABLE: "bg-red-100 text-red-700 border-red-200",
};

const PO_STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600 border-gray-200",
  SUBMITTED: "bg-yellow-100 text-yellow-700 border-yellow-200",
  APPROVED: "bg-teal-100 text-teal-700 border-teal-200",
  ORDERED: "bg-purple-100 text-purple-700 border-purple-200",
  RECEIVED: "bg-green-100 text-green-700 border-green-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
};

const TRANSFER_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 border-yellow-200",
  COMPLETED: "bg-green-100 text-green-700 border-green-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
};

const CATEGORY_COLORS: Record<string, string> = {
  ROUTER: "#DC2626", ONT: "#EA580C", SWITCH: "#D97706", AP: "#16A34A",
  CABLE: "#2563EB", SPLITTER: "#7C3AED", ANTENNA: "#DB2777", UPS: "#0891B2",
  PATCH_CORD: "#65A30D", OLT: "#9333EA", POWER_SUPPLY: "#CA8A04", OTHER: "#6B7280",
};

const CONDITION_CHART_COLORS: Record<string, string> = {
  NEW: "#16A34A", GOOD: "#2563EB", DAMAGED: "#EA580C", DEAD: "#DC2626",
};

const LS_THRESHOLDS_KEY = "equipment-stock-thresholds";
const LS_DEFAULT_THRESHOLD = 5;

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateInput(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toISOString().slice(0, 10);
}

function getWarrantyStatus(expiry: string | null): "active" | "expiring_soon" | "expired" | "none" {
  if (!expiry) return "none";
  const now = new Date();
  const exp = new Date(expiry);
  const diffDays = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 0) return "expired";
  if (diffDays <= 30) return "expiring_soon";
  return "active";
}

function WarrantyBadge({ expiry }: { expiry: string | null }) {
  const status = getWarrantyStatus(expiry);
  if (status === "none") return <span className="text-xs text-muted-foreground">No warranty</span>;
  if (status === "active") return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">Active</Badge>;
  if (status === "expiring_soon") return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px]">Expiring Soon</Badge>;
  return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">Expired</Badge>;
}

function BookValueBadge({ bookValue, purchasePrice }: { bookValue: number; purchasePrice: number }) {
  if (!purchasePrice || purchasePrice === 0) return <span className="text-xs text-muted-foreground">N/A</span>;
  const ratio = bookValue / purchasePrice;
  if (ratio > 0.5) return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">{formatINR(bookValue)}</Badge>;
  if (ratio > 0.25) return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px]">{formatINR(bookValue)}</Badge>;
  return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">{formatINR(bookValue)}</Badge>;
}

function StarRating({ rating, onChange }: { rating: number; onChange?: (r: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" onClick={() => onChange?.(s)} className="focus:outline-none">
          <Star className={`h-4 w-4 ${s <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

// ─── Empty form ───────────────────────────────────────────────

const emptyForm: EquipmentForm = {
  name: "", category: "OTHER", manufacturer: "", model: "", serialNumber: "", macAddress: "",
  condition: "NEW", status: "IN_STOCK", stockLocation: "", purchasePrice: 0,
  purchaseDate: "", depreciationRate: 20, warrantyExpiry: "", warrantyProvider: "",
  warrantyNumber: "", vendorId: "",
};

// ─── LocalStorage thresholds ──────────────────────────────────

function getThresholds(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try { const s = localStorage.getItem(LS_THRESHOLDS_KEY); if (s) return JSON.parse(s); } catch { /* */ }
  return {};
}
function setThresholds(t: Record<string, number>) {
  try { localStorage.setItem(LS_THRESHOLDS_KEY, JSON.stringify(t)); } catch { /* */ }
}
function getThresholdFor(cat: string, t: Record<string, number>): number { return t[cat] ?? LS_DEFAULT_THRESHOLD; }

// ─── Component ────────────────────────────────────────────────

export default function EquipmentPage() {
  const queryClient = useQueryClient();

  // ── Main tab ──
  const [mainTab, setMainTab] = useState("equipment");

  // ── Equipment states ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<EquipmentForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterWarranty, setFilterWarranty] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  // ── Feature states ──
  const [lowStockOpen, setLowStockOpen] = useState(true);
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const [localThresholds, setLocalThresholds] = useState<Record<string, number>>(() => getThresholds());
  const [showAnalytics, setShowAnalytics] = useState(false);

  // ── Workflow dialog states ──
  const [transferDialog, setTransferDialog] = useState<{ open: boolean; equipmentId: string; fromLocation: string }>({ open: false, equipmentId: "", fromLocation: "" });
  const [transferTo, setTransferTo] = useState("");
  const [transferNotes, setTransferNotes] = useState("");

  const [returnDialog, setReturnDialog] = useState<{ open: boolean; equipmentId: string }>({ open: false, equipmentId: "" });
  const [returnCondition, setReturnCondition] = useState("GOOD");
  const [returnNotes, setReturnNotes] = useState("");

  const [inspectionDialog, setInspectionDialog] = useState<{ open: boolean; equipmentId: string }>({ open: false, equipmentId: "" });
  const [inspectCondition, setInspectCondition] = useState("GOOD");
  const [inspectNotes, setInspectNotes] = useState("");
  const [inspectChecklist, setInspectChecklist] = useState<Record<string, boolean>>({ "Power Test": true, "Port Check": true, "Firmware": true, "Physical Damage": false });
  const [inspectPassed, setInspectPassed] = useState(true);

  const [repairDialog, setRepairDialog] = useState<{ open: boolean; equipmentId: string }>({ open: false, equipmentId: "" });
  const [repairStatus, setRepairStatus] = useState("SUBMITTED");
  const [repairNotes, setRepairNotes] = useState("");
  const [repairIssue, setRepairIssue] = useState("");
  const [repairCost, setRepairCost] = useState(0);

  // ── Vendor dialog states ──
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [vendorEditId, setVendorEditId] = useState<string | null>(null);
  const [vendorForm, setVendorForm] = useState({ name: "", contactPerson: "", phone: "", email: "", address: "", gstin: "", category: "general", rating: 0, notes: "" });
  const [vendorDeleteId, setVendorDeleteId] = useState<string | null>(null);

  // ── PO dialog states ──
  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [poDetailId, setPoDetailId] = useState<string | null>(null);
  const [poVendorId, setPoVendorId] = useState("");
  const [poExpectedDate, setPoExpectedDate] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [poItems, setPoItems] = useState<Array<{ name: string; category: string; quantity: number; unitPrice: number; total: number; notes: string }>>([
    { name: "", category: "OTHER", quantity: 1, unitPrice: 0, total: 0, notes: "" },
  ]);

  // ── Stock count dialog ──
  const [stockCountOpen, setStockCountOpen] = useState(false);
  const [stockCountInputs, setStockCountInputs] = useState<Record<string, number>>({});

  // ── Detail sub-tab ──
  const [detailSubTab, setDetailSubTab] = useState("general");

  // ═══════════════════════════════════════════════════════════
  // ── QUERIES ──────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filterCategory !== "all") params.set("category", filterCategory);
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterLocation !== "all") params.set("location", filterLocation);
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return params.toString();
  }, [filterCategory, filterStatus, filterLocation, search, page]);

  const { data, isLoading } = useQuery<{
    items: EquipmentItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    summary: StockSummary;
  }>({
    queryKey: ["equipment", filterCategory, filterStatus, filterLocation, search, page],
    queryFn: () => apiFetch(`/api/equipment?${buildQueryParams()}`),
  });

  const equipment = data?.items || [];
  const pagination = data?.pagination;
  const summary = data?.summary || { total: 0, inStock: 0, deployed: 0, returned: 0, decommissioned: 0, totalValue: 0 };

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["equipment-analytics"],
    queryFn: () => apiFetch("/api/equipment/analytics"),
    enabled: showAnalytics,
    staleTime: 30_000,
  });

  const { data: vendors } = useQuery<{ vendors: VendorItem[] }>({
    queryKey: ["vendors"],
    queryFn: () => apiFetch("/api/vendors"),
  });
  const vendorList = vendors?.vendors || [];

  const { data: purchaseOrders } = useQuery<{ orders: PurchaseOrder[] }>({
    queryKey: ["purchase-orders"],
    queryFn: () => apiFetch("/api/purchase-orders"),
    enabled: mainTab === "purchase-orders",
  });
  const poList = purchaseOrders?.orders || [];

  const { data: stockTransfers } = useQuery<{ transfers: StockTransfer[] }>({
    queryKey: ["stock-transfers"],
    queryFn: () => apiFetch("/api/stock-transfers"),
  });
  const transfers = stockTransfers?.transfers || [];

  const { data: repairRecords } = useQuery<{ records: RepairRecord[] }>({
    queryKey: ["repair-records", detailId],
    queryFn: () => apiFetch(`/api/equipment/repair?equipmentId=${detailId}`),
    enabled: !!detailId,
  });

  const { data: inspections } = useQuery<{ inspections: InspectionRecord[] }>({
    queryKey: ["inspections", detailId],
    queryFn: () => apiFetch(`/api/equipment/inspect?equipmentId=${detailId}`),
    enabled: !!detailId,
  });

  const { data: equipmentTransfers } = useQuery<{ transfers: StockTransfer[] }>({
    queryKey: ["equipment-transfers", detailId],
    queryFn: () => apiFetch(`/api/stock-transfers`),
    enabled: !!detailId,
  });

  const { data: stockCountData } = useQuery<StockCountData>({
    queryKey: ["stock-count"],
    queryFn: () => apiFetch("/api/equipment/stock-count"),
    enabled: stockCountOpen,
  });

  // Get distinct locations from analytics or equipment
  const distinctLocations: string[] = (() => {
    const locs = new Set<string>();
    equipment.forEach((e) => { if (e.stockLocation) locs.add(e.stockLocation); });
    if (stockCountData?.locations) stockCountData.locations.forEach((l) => locs.add(l));
    return Array.from(locs).sort();
  })();

  // ═══════════════════════════════════════════════════════════
  // ── MUTATIONS ────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════

  const createMutation = useMutation({
    mutationFn: (body: EquipmentForm) => apiFetch("/api/equipment", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: () => { toast.success("Equipment added"); setDialogOpen(false); setForm(emptyForm); setEditingId(null); queryClient.invalidateQueries({ queryKey: ["equipment"] }); queryClient.invalidateQueries({ queryKey: ["equipment-analytics"] }); queryClient.invalidateQueries({ queryKey: ["stock-count"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to add equipment"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: EquipmentForm & { id: string }) => apiFetch(`/api/equipment/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: () => { toast.success("Equipment updated"); setDialogOpen(false); setForm(emptyForm); setEditingId(null); queryClient.invalidateQueries({ queryKey: ["equipment"] }); queryClient.invalidateQueries({ queryKey: ["equipment-analytics"] }); queryClient.invalidateQueries({ queryKey: ["stock-count"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/equipment/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Equipment deleted"); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["equipment"] }); queryClient.invalidateQueries({ queryKey: ["equipment-analytics"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to delete"),
  });

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: ({ equipmentId, toLocation, notes }: { equipmentId: string; toLocation: string; notes: string }) =>
      apiFetch("/api/stock-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", equipmentId, toLocation, notes }) }),
    onSuccess: () => { toast.success("Transfer initiated"); setTransferDialog({ open: false, equipmentId: "", fromLocation: "" }); setTransferTo(""); setTransferNotes(""); queryClient.invalidateQueries({ queryKey: ["equipment"] }); queryClient.invalidateQueries({ queryKey: ["stock-transfers"] }); },
    onError: (e: Error) => toast.error(e.message || "Transfer failed"),
  });

  // Approve transfer mutation
  const approveTransferMutation = useMutation({
    mutationFn: (transferId: string) =>
      apiFetch("/api/stock-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", transferId }) }),
    onSuccess: () => { toast.success("Transfer completed"); queryClient.invalidateQueries({ queryKey: ["equipment"] }); queryClient.invalidateQueries({ queryKey: ["stock-transfers"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to approve"),
  });

  // Return mutation (uses inspect API)
  const returnMutation = useMutation({
    mutationFn: ({ equipmentId, condition, notes }: { equipmentId: string; condition: string; notes: string }) =>
      apiFetch("/api/equipment/inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ equipmentId, condition, notes, action: "return_to_stock", passed: condition !== "DAMAGED" && condition !== "DEAD" }) }),
    onSuccess: () => { toast.success("Equipment returned"); setReturnDialog({ open: false, equipmentId: "" }); setReturnCondition("GOOD"); setReturnNotes(""); queryClient.invalidateQueries({ queryKey: ["equipment"] }); },
    onError: (e: Error) => toast.error(e.message || "Return failed"),
  });

  // Inspection mutation
  const inspectionMutation = useMutation({
    mutationFn: ({ equipmentId, condition, notes, checklistResult, passed }: { equipmentId: string; condition: string; notes: string; checklistResult: Record<string, boolean>; passed: boolean }) =>
      apiFetch("/api/equipment/inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ equipmentId, condition, notes, checklistResult, passed, action: passed ? "return_to_stock" : "send_for_repair" }) }),
    onSuccess: () => { toast.success("Inspection saved"); setInspectionDialog({ open: false, equipmentId: "" }); queryClient.invalidateQueries({ queryKey: ["equipment"] }); queryClient.invalidateQueries({ queryKey: ["inspections"] }); },
    onError: (e: Error) => toast.error(e.message || "Inspection failed"),
  });

  // Repair mutation
  const repairMutation = useMutation({
    mutationFn: ({ equipmentId, issueDescription, repairNotes, repairCost, status }: { equipmentId: string; issueDescription: string; repairNotes: string; repairCost: number; status: string }) =>
      apiFetch("/api/equipment/repair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ equipmentId, issueDescription, repairNotes, repairCost, status }) }),
    onSuccess: () => { toast.success("Repair record created"); setRepairDialog({ open: false, equipmentId: "" }); setRepairNotes(""); setRepairIssue(""); setRepairCost(0); queryClient.invalidateQueries({ queryKey: ["equipment"] }); queryClient.invalidateQueries({ queryKey: ["repair-records"] }); },
    onError: (e: Error) => toast.error(e.message || "Repair failed"),
  });

  // Vendor mutations
  const vendorCreateMutation = useMutation({
    mutationFn: (body: typeof vendorForm) => apiFetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Vendor added"); setVendorDialogOpen(false); setVendorForm({ name: "", contactPerson: "", phone: "", email: "", address: "", gstin: "", category: "general", rating: 0, notes: "" }); setVendorEditId(null); queryClient.invalidateQueries({ queryKey: ["vendors"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to add vendor"),
  });

  const vendorUpdateMutation = useMutation({
    mutationFn: ({ id, ...body }: typeof vendorForm & { id: string }) => apiFetch(`/api/vendors/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Vendor updated"); setVendorDialogOpen(false); setVendorEditId(null); queryClient.invalidateQueries({ queryKey: ["vendors"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to update"),
  });

  const vendorDeleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/vendors/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Vendor deleted"); setVendorDeleteId(null); queryClient.invalidateQueries({ queryKey: ["vendors"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to delete vendor"),
  });

  // PO mutations
  const poCreateMutation = useMutation({
    mutationFn: (body: { vendorId: string; items: typeof poItems; expectedDate: string; notes: string }) => apiFetch("/api/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Purchase order created"); setPoDialogOpen(false); setPoVendorId(""); setPoExpectedDate(""); setPoNotes(""); setPoItems([{ name: "", category: "OTHER", quantity: 1, unitPrice: 0, total: 0, notes: "" }]); queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to create PO"),
  });

  const poUpdateMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) => apiFetch(`/api/purchase-orders/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, notes }) }),
    onSuccess: () => { toast.success("PO status updated"); queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to update PO"),
  });

  const poDeleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/purchase-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("PO deleted"); setPoDetailId(null); queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to delete PO"),
  });

  // Stock adjustment mutation
  const stockAdjustMutation = useMutation({
    mutationFn: ({ equipmentId, newQty, reason, notes }: { equipmentId: string; newQty: number; reason: string; notes: string }) =>
      apiFetch("/api/equipment/adjust", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ equipmentId, newQty, reason, notes }) }),
    onSuccess: () => { toast.success("Stock adjustment saved"); queryClient.invalidateQueries({ queryKey: ["equipment"] }); queryClient.invalidateQueries({ queryKey: ["stock-count"] }); },
    onError: (e: Error) => toast.error(e.message || "Adjustment failed"),
  });

  // ═══════════════════════════════════════════════════════════
  // ── HANDLERS ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Equipment name is required."); return; }
    if (form.purchasePrice < 0) { toast.error("Purchase price cannot be negative."); return; }
    if (editingId) updateMutation.mutate({ id: editingId, ...form });
    else createMutation.mutate(form);
  };

  const openEdit = (e: EquipmentItem) => {
    setForm({
      name: e.name, category: e.category, manufacturer: e.manufacturer, model: e.model,
      serialNumber: e.serialNumber, macAddress: e.macAddress || "", condition: e.condition,
      status: e.status, stockLocation: e.stockLocation, purchasePrice: e.purchasePrice,
      purchaseDate: formatDateInput(e.purchaseDate || ""), depreciationRate: e.depreciationRate || 20,
      warrantyExpiry: formatDateInput(e.warrantyExpiry || ""), warrantyProvider: e.warrantyProvider || "",
      warrantyNumber: e.warrantyNumber || "", vendorId: e.vendorId || "",
    });
    setEditingId(e.id);
    setDialogOpen(true);
  };

  const openCreate = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const handleFilterChange = (setter: (v: string) => void) => (val: string) => { setter(val); setPage(1); };
  const handleSearchChange = (val: string) => { setSearch(val); setPage(1); };

  const detailItem = detailId ? equipment.find((e) => e.id === detailId) : null;

  // Warranty filter
  const filteredEquipment = (() => {
    if (filterWarranty === "all") return equipment;
    return equipment.filter((e) => getWarrantyStatus(e.warrantyExpiry) === filterWarranty);
  })();

  // Low stock
  const lowStockAlerts: Array<{ category: string; inStock: number; total: number; threshold: number }> = [];
  if (analytics?.lowStockData) {
    for (const [category, d] of Object.entries(analytics.lowStockData)) {
      const threshold = getThresholdFor(category, localThresholds);
      if (d.inStock <= threshold) lowStockAlerts.push({ category, inStock: d.inStock, total: d.total, threshold });
    }
    lowStockAlerts.sort((a, b) => a.inStock - b.inStock);
  }

  const handleThresholdChange = (cat: string, value: number) => { setLocalThresholds({ ...localThresholds, [cat]: value }); };
  const saveThresholds = () => { setThresholds(localThresholds); setThresholdsOpen(false); toast.success("Threshold settings saved"); };
  const resetThresholds = () => { setLocalThresholds({}); setThresholds({}); toast.success("Thresholds reset"); };

  // PO item management
  const addPoItem = () => setPoItems([...poItems, { name: "", category: "OTHER", quantity: 1, unitPrice: 0, total: 0, notes: "" }]);
  const removePoItem = (idx: number) => setPoItems(poItems.filter((_, i) => i !== idx));
  const updatePoItem = (idx: number, field: string, value: string | number) => {
    const updated = [...poItems];
    (updated[idx] as Record<string, unknown>)[field] = value;
    if (field === "quantity" || field === "unitPrice") {
      updated[idx].total = (Number(updated[idx].quantity) || 0) * (Number(updated[idx].unitPrice) || 0);
    }
    setPoItems(updated);
  };

  // ═══════════════════════════════════════════════════════════
  // ── RENDER ───────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipment</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage equipment inventory, vendors &amp; purchase orders.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9 h-9 w-full sm:w-48" />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setThresholdsOpen(true)}><Settings2 className="h-4 w-4" /> Thresholds</Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setShowAnalytics(!showAnalytics)}><BarChart3 className="h-4 w-4" /> {showAnalytics ? "Hide" : "Show"} Analytics</Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { setStockCountOpen(true); }}><Calculator className="h-4 w-4" /> Stock Count</Button>
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add Equipment</Button>
        </div>
      </div>

      {/* ── Main Tabs ── */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="equipment" className="text-xs gap-1.5"><Package className="h-3.5 w-3.5" /> Equipment</TabsTrigger>
          <TabsTrigger value="purchase-orders" className="text-xs gap-1.5"><Truck className="h-3.5 w-3.5" /> Purchase Orders {poList.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{poList.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="vendors" className="text-xs gap-1.5"><Star className="h-3.5 w-3.5" /> Vendors {vendorList.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{vendorList.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="warehouses" className="text-xs gap-1.5"><Warehouse className="h-3.5 w-3.5" /> Warehouses</TabsTrigger>
          <TabsTrigger value="returns" className="text-xs gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Returns</TabsTrigger>
          <TabsTrigger value="repairs" className="text-xs gap-1.5"><Wrench className="h-3.5 w-3.5" /> Repairs</TabsTrigger>
          <TabsTrigger value="stock" className="text-xs gap-1.5"><Calculator className="h-3.5 w-3.5" /> Stock</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════ */}
        {/* EQUIPMENT TAB                                      */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="equipment" className="space-y-6">
          {isLoading ? (
            <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="skeleton-wave h-64" /></div>
          ) : (
            <>
              {/* Stock Summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <Card className="border shadow-sm"><CardContent className="p-4 text-center"><Package className="h-5 w-5 text-red-600 mx-auto mb-1" /><p className="text-2xl font-bold">{summary.total}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-teal-600">{summary.inStock}</p><p className="text-xs text-muted-foreground">In Stock</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{summary.deployed}</p><p className="text-xs text-muted-foreground">Deployed</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-600">{summary.returned}</p><p className="text-xs text-muted-foreground">Returned</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-gray-600">{summary.decommissioned}</p><p className="text-xs text-muted-foreground">Decommissioned</p></CardContent></Card>
                <Card className="border shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-600">{formatINR(summary.totalValue)}</p><p className="text-xs text-muted-foreground">Total Value</p></CardContent></Card>
              </div>

              {/* Location-based summary cards */}
              {distinctLocations.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {distinctLocations.slice(0, 8).map((loc) => {
                    const locCount = equipment.filter((e) => e.stockLocation === loc && e.status === "IN_STOCK").length;
                    return (
                      <Card key={loc} className="border shadow-sm"><CardContent className="p-3 flex items-center gap-3"><MapPin className="h-4 w-4 text-red-500 flex-shrink-0" /><div className="min-w-0"><p className="text-sm font-semibold truncate">{loc}</p><p className="text-xs text-muted-foreground">{locCount} items in stock</p></div></CardContent></Card>
                    );
                  })}
                </div>
              )}

              {/* Low Stock Alerts */}
              <Collapsible open={lowStockOpen} onOpenChange={setLowStockOpen}>
                <Card className="border shadow-sm">
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500" /> Low Stock Alerts
                          {lowStockAlerts.length > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">{lowStockAlerts.length}</Badge>}
                        </CardTitle>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${lowStockOpen ? "rotate-180" : ""}`} />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4">
                      {lowStockAlerts.length === 0 ? (
                        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><div className="h-2 w-2 rounded-full bg-green-500" /> All categories have sufficient stock.</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {lowStockAlerts.map((a) => (
                            <div key={a.category} className={`flex items-center gap-3 p-3 rounded-lg border ${a.inStock === 0 ? "bg-red-50 border-red-200" : a.inStock <= Math.ceil(a.threshold / 2) ? "bg-orange-50 border-orange-200" : "bg-amber-50 border-amber-200"}`}>
                              <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${a.inStock === 0 ? "bg-red-100" : "bg-amber-100"}`}><Package className={`h-4 w-4 ${a.inStock === 0 ? "text-red-600" : "text-amber-600"}`} /></div>
                              <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{a.category.replace("_", " ")}</p><p className="text-xs text-muted-foreground">{a.inStock} in stock (threshold: {a.threshold})</p></div>
                              <Badge variant="outline" className={`flex-shrink-0 text-[10px] ${a.inStock === 0 ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>{a.inStock === 0 ? "OUT" : "LOW"}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Analytics */}
              {showAnalytics && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-red-600" /> Equipment Analytics</CardTitle></CardHeader>
                  <CardContent>
                    {analyticsLoading ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Skeleton className="skeleton-wave h-64" /><Skeleton className="skeleton-wave h-64" /></div> : analytics ? (
                      <Tabs defaultValue="category" className="w-full">
                        <TabsList>
                          <TabsTrigger value="category" className="text-xs gap-1"><TrendingUp className="h-3 w-3" /> Category</TabsTrigger>
                          <TabsTrigger value="condition" className="text-xs gap-1"><Package className="h-3 w-3" /> Condition</TabsTrigger>
                          <TabsTrigger value="monthly" className="text-xs gap-1"><BarChart3 className="h-3 w-3" /> Monthly</TabsTrigger>
                          {distinctLocations.length > 0 && <TabsTrigger value="location" className="text-xs gap-1"><MapPin className="h-3 w-3" /> Location</TabsTrigger>}
                        </TabsList>
                        <TabsContent value="category">
                          <div className="h-72 flex items-center">
                            <div className="w-1/2 h-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analytics.categoryDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2} dataKey="count" nameKey="category" label={({ category: c, count }) => `${c.replace("_", " ")} (${count})`} labelLine={false}>{analytics.categoryDistribution.map((entry) => <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] || "#6B7280"} />)}</Pie><Tooltip formatter={(value: number, name: string) => [`${value} items`, name.replace("_", " ")]} /></PieChart></ResponsiveContainer></div>
                            <div className="w-1/2 space-y-2 max-h-72 overflow-y-auto pl-4">{analytics.categoryDistribution.map((item) => <div key={item.category} className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[item.category] || "#6B7280" }} /><span className="text-sm text-muted-foreground flex-1 truncate">{item.category.replace("_", " ")}</span><Badge variant="outline" className="text-[10px]">{item.count}</Badge></div>)}</div>
                          </div>
                        </TabsContent>
                        <TabsContent value="condition"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.conditionDistribution} barSize={48}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="condition" tick={{ fill: "#94A3B8", fontSize: 12 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} allowDecimals={false} /><Tooltip formatter={(value: number) => [`${value} items`, "Count"]} /><Bar dataKey="count" name="Count" radius={[6, 6, 0, 0]}>{analytics.conditionDistribution.map((entry) => <Cell key={entry.condition} fill={CONDITION_CHART_COLORS[entry.condition] || "#6B7280"} />)}</Bar></BarChart></ResponsiveContainer></div></TabsContent>
                        <TabsContent value="monthly"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.monthlyAdditions} barSize={32}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} allowDecimals={false} /><Tooltip formatter={(value: number) => [`${value} items`, "Added"]} /><Bar dataKey="count" name="Equipment Added" fill="#DC2626" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></TabsContent>
                        {distinctLocations.length > 0 && (
                          <TabsContent value="location"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={distinctLocations.map((l) => ({ location: l, count: equipment.filter((e) => e.stockLocation === l).length })).sort((a, b) => b.count - a.count).slice(0, 10)} barSize={36}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="location" tick={{ fill: "#94A3B8", fontSize: 10 }} angle={-30} textAnchor="end" height={60} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Items" fill="#0891B2" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></TabsContent>
                        )}
                      </Tabs>
                    ) : <p className="text-sm text-muted-foreground py-8 text-center">No analytics data available.</p>}
                  </CardContent>
                </Card>
              )}

              {/* Equipment Table */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-red-600" />Equipment ({pagination?.total || 0})</CardTitle>
                    <div className="flex gap-2 flex-wrap">
                      <Select value={filterCategory} onValueChange={handleFilterChange(setFilterCategory)}><SelectTrigger className="w-[120px] h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
                      <Select value={filterStatus} onValueChange={handleFilterChange(setFilterStatus)}><SelectTrigger className="w-[120px] h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
                      {distinctLocations.length > 0 && <Select value={filterLocation} onValueChange={handleFilterChange(setFilterLocation)}><SelectTrigger className="w-[120px] h-8 text-xs"><MapPin className="h-3 w-3 mr-1" /><SelectValue placeholder="Location" /></SelectTrigger><SelectContent><SelectItem value="all">All Locations</SelectItem>{distinctLocations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select>}
                      <Select value={filterWarranty} onValueChange={handleFilterChange(setFilterWarranty)}><SelectTrigger className="w-[120px] h-8 text-xs"><Shield className="h-3 w-3 mr-1" /><SelectValue placeholder="Warranty" /></SelectTrigger><SelectContent><SelectItem value="all">All Warranty</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="expiring_soon">Expiring Soon</SelectItem><SelectItem value="expired">Expired</SelectItem></SelectContent></Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs">Serial #</TableHead>
                          <TableHead className="text-xs">Location</TableHead>
                          <TableHead className="text-xs">Condition</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Warranty</TableHead>
                          <TableHead className="text-xs">Repair</TableHead>
                          <TableHead className="text-xs">Price</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEquipment.length === 0 ? (
                          <TableRow><TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">{search || filterCategory !== "all" || filterStatus !== "all" || filterWarranty !== "all" || filterLocation !== "all" ? "No equipment match your filters." : "No equipment found."}</TableCell></TableRow>
                        ) : filteredEquipment.map((e) => (
                          <TableRow key={e.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell className="text-sm font-medium">{e.name}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{e.category.replace("_", " ")}</Badge></TableCell>
                            <TableCell className="text-sm font-mono text-xs">{e.serialNumber || "-"}</TableCell>
                            <TableCell className="text-xs">{e.stockLocation || "-"}</TableCell>
                            <TableCell><Badge variant="outline" className={`text-[10px] ${CONDITION_STYLES[e.condition] || ""}`}>{e.condition}</Badge></TableCell>
                            <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[e.status] || ""}`}>{e.status.replace("_", " ")}</Badge></TableCell>
                            <TableCell><WarrantyBadge expiry={e.warrantyExpiry} /></TableCell>
                            <TableCell>{e.repairStatus ? <Badge variant="outline" className={`text-[10px] ${REPAIR_STATUS_STYLES[e.repairStatus] || ""}`}>{e.repairStatus.replace("_", " ")}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-sm tabular-nums">{formatINR(e.purchasePrice)}</TableCell>
                            <TableCell>
                              <div className="flex gap-0.5 justify-end">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View" onClick={() => { setDetailId(e.id); setDetailSubTab("general"); }}><Eye className="h-3.5 w-3.5" /></Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => openEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                                {e.status === "IN_STOCK" && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-cyan-600 hover:text-cyan-700" title="Transfer" onClick={() => setTransferDialog({ open: true, equipmentId: e.id, fromLocation: e.stockLocation || "" })}><ArrowRightLeft className="h-3.5 w-3.5" /></Button>}
                                {e.status === "DEPLOYED" && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700" title="Return" onClick={() => setReturnDialog({ open: true, equipmentId: e.id })}><RotateCcw className="h-3.5 w-3.5" /></Button>}
                                {(e.status === "RETURNED" || e.status === "DEPLOYED" || e.condition === "DAMAGED") && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700" title="Repair" onClick={() => setRepairDialog({ open: true, equipmentId: e.id })}><Wrench className="h-3.5 w-3.5" /></Button>}
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" title="Delete" disabled={e.status === "DEPLOYED"} onClick={() => setDeleteId(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Pagination */}
                  {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t mt-4">
                      <p className="text-sm text-muted-foreground">Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</p>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={pagination.page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                        {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                          let pn: number;
                          if (pagination.totalPages <= 5) pn = i + 1;
                          else if (pagination.page <= 3) pn = i + 1;
                          else if (pagination.page >= pagination.totalPages - 2) pn = pagination.totalPages - 4 + i;
                          else pn = pagination.page - 2 + i;
                          return <Button key={pn} size="sm" variant={pagination.page === pn ? "default" : "outline"} className={pagination.page === pn ? "bg-red-600 hover:bg-red-700 text-white h-8 w-8 p-0" : "h-8 w-8 p-0"} onClick={() => setPage(pn)}>{pn}</Button>;
                        })}
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* PURCHASE ORDERS TAB                               */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="purchase-orders" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{poList.length} purchase order(s)</p>
            <Button className="bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => setPoDialogOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Create PO</Button>
          </div>
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-xs">Order #</TableHead><TableHead className="text-xs">Vendor</TableHead><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Expected</TableHead><TableHead className="text-xs">Items</TableHead><TableHead className="text-xs">Amount</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {poList.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">No purchase orders yet.</TableCell></TableRow> : poList.map((po) => (
                      <TableRow key={po.id} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell className="text-sm font-mono font-semibold">{po.orderNumber}</TableCell>
                        <TableCell className="text-sm">{po.vendor?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{formatDate(po.orderDate)}</TableCell>
                        <TableCell className="text-xs">{formatDate(po.expectedDate || "")}</TableCell>
                        <TableCell className="text-sm">{po.items.length}</TableCell>
                        <TableCell className="text-sm font-semibold tabular-nums">{formatINR(po.totalAmount)}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${PO_STATUS_STYLES[po.status] || ""}`}>{po.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-0.5 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View" onClick={() => setPoDetailId(po.id)}><Eye className="h-3.5 w-3.5" /></Button>
                            {po.status === "DRAFT" && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-teal-600" title="Submit" onClick={() => poUpdateMutation.mutate({ id: po.id, status: "SUBMITTED" })}><Truck className="h-3.5 w-3.5" /></Button>}
                            {po.status === "SUBMITTED" && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" title="Approve" onClick={() => poUpdateMutation.mutate({ id: po.id, status: "APPROVED" })}><Package className="h-3.5 w-3.5" /></Button>}
                            {po.status === "APPROVED" && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-purple-600" title="Mark Ordered" onClick={() => poUpdateMutation.mutate({ id: po.id, status: "ORDERED" })}><BarChart3 className="h-3.5 w-3.5" /></Button>}
                            {po.status === "ORDERED" && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" title="Mark Received" onClick={() => poUpdateMutation.mutate({ id: po.id, status: "RECEIVED" })}><Package className="h-3.5 w-3.5" /></Button>}
                            {["DRAFT", "SUBMITTED"].includes(po.status) && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" title="Cancel" onClick={() => poUpdateMutation.mutate({ id: po.id, status: "CANCELLED" })}><X className="h-3.5 w-3.5" /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* VENDORS TAB                                        */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="vendors" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{vendorList.length} vendor(s)</p>
            <Button className="bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => { setVendorForm({ name: "", contactPerson: "", phone: "", email: "", address: "", gstin: "", category: "general", rating: 0, notes: "" }); setVendorEditId(null); setVendorDialogOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> Add Vendor</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vendorList.length === 0 ? <Card className="border shadow-sm col-span-full"><CardContent className="py-8 text-center text-sm text-muted-foreground">No vendors yet.</CardContent></Card> : vendorList.map((v) => (
              <Card key={v.id} className="border shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0"><p className="font-semibold truncate">{v.name}</p><p className="text-xs text-muted-foreground">{v.contactPerson || "No contact"}</p></div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setVendorForm({ name: v.name, contactPerson: v.contactPerson, phone: v.phone, email: v.email, address: v.address, gstin: v.gstin, category: v.category, rating: v.rating, notes: v.notes }); setVendorEditId(v.id); setVendorDialogOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => setVendorDeleteId(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="text-xs space-y-1">
                    {v.phone && <p className="text-muted-foreground">📞 {v.phone}</p>}
                    {v.email && <p className="text-muted-foreground truncate">✉️ {v.email}</p>}
                    {v.gstin && <p className="text-muted-foreground">GSTIN: {v.gstin}</p>}
                  </div>
                  <div className="flex items-center justify-between">
                    <StarRating rating={v.rating} onChange={() => {}} />
                    <Badge variant="outline" className="text-[10px]">{v._count?.equipment || 0} equipment</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* WAREHOUSES TAB                                    */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="warehouses" className="space-y-4">
          <WarehousesTab />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* RETURNS TAB                                        */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="returns" className="space-y-4">
          <ReturnsTab />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* REPAIRS TAB                                        */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="repairs" className="space-y-4">
          <RepairsTab />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* STOCK ADJUSTMENTS TAB                             */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="stock" className="space-y-4">
          <StockTab />
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* DIALOGS                                             */}
      {/* ═══════════════════════════════════════════════════════ */}

      {/* Create/Edit Equipment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">{editingId ? "Edit" : "Add"} Equipment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label className="text-xs">Equipment Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Manufacturer</Label><Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Model</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Serial Number</Label><Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">MAC Address</Label><Input value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Condition</Label><Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Purchase Price (₹)</Label><Input type="number" min="0" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Purchase Date</Label><Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Depreciation Rate (%)</Label><Input type="number" min="0" max="100" value={form.depreciationRate} onChange={(e) => setForm({ ...form, depreciationRate: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Vendor</Label><Select value={form.vendorId} onValueChange={(v) => setForm({ ...form, vendorId: v })}><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{vendorList.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Warranty Provider</Label><Input value={form.warrantyProvider} onChange={(e) => setForm({ ...form, warrantyProvider: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Warranty Number</Label><Input value={form.warrantyNumber} onChange={(e) => setForm({ ...form, warrantyNumber: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Warranty Expiry</Label><Input type="date" value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} /></div>
              <div className="space-y-1.5 col-span-2"><Label className="text-xs">Stock Location</Label><Input value={form.stockLocation} onChange={(e) => setForm({ ...form, stockLocation: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createMutation.isPending || updateMutation.isPending} onClick={handleSubmit}>{(createMutation.isPending || updateMutation.isPending) ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : editingId ? "Update" : "Add Equipment"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog (with tabs) */}
      <Dialog open={!!detailId} onOpenChange={() => { setDetailId(null); setDetailSubTab("general"); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">Equipment Details</DialogTitle></DialogHeader>
          {detailItem ? (
            <Tabs value={detailSubTab} onValueChange={setDetailSubTab}>
              <TabsList className="mb-3">
                <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
                <TabsTrigger value="depreciation" className="text-xs">Depreciation</TabsTrigger>
                <TabsTrigger value="warranty" className="text-xs">Warranty</TabsTrigger>
                <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Name:</span><p className="font-semibold">{detailItem.name}</p></div>
                  <div><span className="text-muted-foreground">Category:</span><p>{detailItem.category.replace("_", " ")}</p></div>
                  <div><span className="text-muted-foreground">Manufacturer:</span><p>{detailItem.manufacturer || "—"}</p></div>
                  <div><span className="text-muted-foreground">Model:</span><p>{detailItem.model || "—"}</p></div>
                  <div><span className="text-muted-foreground">Serial #:</span><p className="font-mono text-xs">{detailItem.serialNumber || "—"}</p></div>
                  <div><span className="text-muted-foreground">MAC:</span><p className="font-mono text-xs">{detailItem.macAddress || "—"}</p></div>
                  <div><span className="text-muted-foreground">Price:</span><p className="font-semibold">{formatINR(detailItem.purchasePrice)}</p></div>
                  <div><span className="text-muted-foreground">Book Value:</span><BookValueBadge bookValue={detailItem.bookValue || 0} purchasePrice={detailItem.purchasePrice} /></div>
                  <div><span className="text-muted-foreground">Condition:</span><Badge variant="outline" className={`text-[10px] ${CONDITION_STYLES[detailItem.condition] || ""}`}>{detailItem.condition}</Badge></div>
                  <div><span className="text-muted-foreground">Status:</span><Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[detailItem.status] || ""}`}>{detailItem.status.replace("_", " ")}</Badge></div>
                  <div><span className="text-muted-foreground">Repair Status:</span>{detailItem.repairStatus ? <Badge variant="outline" className={`text-[10px] ${REPAIR_STATUS_STYLES[detailItem.repairStatus] || ""}`}>{detailItem.repairStatus.replace("_", " ")}</Badge> : <span className="text-xs">—</span>}</div>
                  <div><span className="text-muted-foreground">Location:</span><p>{detailItem.stockLocation || "—"}</p></div>
                  <div><span className="text-muted-foreground">Vendor:</span><p>{detailItem.vendorName || "—"}</p></div>
                  <div><span className="text-muted-foreground">Assigned To:</span><p>{detailItem.assignedSubscriberName || "—"}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground">Created:</span><p>{formatDate(detailItem.createdAt)}</p></div>
                </div>
                <div className="flex justify-end pt-3 gap-2">
                  {detailItem.status === "IN_STOCK" && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setDetailId(null); setTransferDialog({ open: true, equipmentId: detailItem.id, fromLocation: detailItem.stockLocation || "" }); }}><ArrowRightLeft className="h-3.5 w-3.5" /> Transfer</Button>}
                  {detailItem.status === "DEPLOYED" && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setDetailId(null); setReturnDialog({ open: true, equipmentId: detailItem.id }); }}><RotateCcw className="h-3.5 w-3.5" /> Return</Button>}
                  <Button size="sm" variant="outline" onClick={() => { setDetailId(null); openEdit(detailItem); }}><Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit</Button>
                </div>
              </TabsContent>

              <TabsContent value="depreciation">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Purchase Price:</span><p className="font-semibold">{formatINR(detailItem.purchasePrice)}</p></div>
                    <div><span className="text-muted-foreground">Purchase Date:</span><p>{formatDate(detailItem.purchaseDate || "")}</p></div>
                    <div><span className="text-muted-foreground">Depreciation Rate:</span><p>{detailItem.depreciationRate || 20}% p.a.</p></div>
                    <div><span className="text-muted-foreground">Current Book Value:</span><BookValueBadge bookValue={detailItem.bookValue || 0} purchasePrice={detailItem.purchasePrice} /></div>
                  </div>
                  {detailItem.purchasePrice > 0 && (
                    <div className="p-3 rounded-lg bg-muted/50 text-sm">
                      <p className="font-semibold mb-1">Depreciation Summary</p>
                      <p className="text-muted-foreground">Annual depreciation: {formatINR(detailItem.purchasePrice * (detailItem.depreciationRate || 20) / 100)}</p>
                      <p className="text-muted-foreground">Book value ratio: {detailItem.purchasePrice > 0 ? Math.round(((detailItem.bookValue || 0) / detailItem.purchasePrice) * 100) : 0}% of purchase price</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="warranty">
                <div className="space-y-3 text-sm">
                  <div><span className="text-muted-foreground">Status:</span><div className="mt-1"><WarrantyBadge expiry={detailItem.warrantyExpiry} /></div></div>
                  <div><span className="text-muted-foreground">Provider:</span><p className="font-medium">{detailItem.warrantyProvider || "—"}</p></div>
                  <div><span className="text-muted-foreground">Warranty Number:</span><p className="font-mono">{detailItem.warrantyNumber || "—"}</p></div>
                  <div><span className="text-muted-foreground">Expiry Date:</span><p>{formatDate(detailItem.warrantyExpiry || "")}</p></div>
                  {detailItem.warrantyExpiry && (() => { const status = getWarrantyStatus(detailItem.warrantyExpiry); const exp = new Date(detailItem.warrantyExpiry); const diffDays = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24)); return diffDays > 0 ? <p className="text-xs text-muted-foreground">{diffDays} day(s) remaining</p> : <p className="text-xs text-red-600">Expired {Math.abs(diffDays)} day(s) ago</p>; })()}
                </div>
              </TabsContent>

              <TabsContent value="history">
                <div className="space-y-4">
                  {/* Transfers */}
                  <div>
                    <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><ArrowRightLeft className="h-3.5 w-3.5" /> Transfer History</p>
                    {(() => {
                      const eqTransfers = (equipmentTransfers?.transfers || []).filter((t) => t.equipmentId === detailId);
                      return eqTransfers.length === 0 ? <p className="text-xs text-muted-foreground">No transfers recorded.</p> : (
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {eqTransfers.map((t) => (
                            <div key={t.id} className="flex items-center gap-2 text-xs p-2 rounded border">
                              <span>{t.fromLocation}</span><ArrowRightLeft className="h-3 w-3 text-muted-foreground" /><span>{t.toLocation}</span>
                              <Badge variant="outline" className={`text-[9px] ml-auto ${TRANSFER_STATUS_STYLES[t.status] || ""}`}>{t.status}</Badge>
                              <span className="text-muted-foreground">{formatDate(t.createdAt)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Inspections */}
                  <div>
                    <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" /> Inspections</p>
                    {(!inspections?.inspections || inspections.inspections.length === 0) ? <p className="text-xs text-muted-foreground">No inspections recorded.</p> : (
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {inspections.inspections.map((insp) => (
                          <div key={insp.id} className="text-xs p-2 rounded border space-y-1">
                            <div className="flex items-center gap-2"><Badge variant="outline" className={`text-[9px] ${insp.passed ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>{insp.passed ? "PASSED" : "FAILED"}</Badge><span className="text-muted-foreground">{formatDate(insp.createdAt)}</span></div>
                            {insp.notes && <p className="text-muted-foreground">{insp.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Repairs */}
                  <div>
                    <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" /> Repairs</p>
                    {(!repairRecords?.records || repairRecords.records.length === 0) ? <p className="text-xs text-muted-foreground">No repair records.</p> : (
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {repairRecords.records.map((r) => (
                          <div key={r.id} className="text-xs p-2 rounded border space-y-1">
                            <div className="flex items-center gap-2"><Badge variant="outline" className={`text-[9px] ${REPAIR_STATUS_STYLES[r.status] || ""}`}>{r.status.replace("_", " ")}</Badge><span className="text-muted-foreground">{formatDate(r.createdAt)}</span></div>
                            {r.issueDescription && <p className="text-muted-foreground">Issue: {r.issueDescription}</p>}
                            {r.repairAction && <p className="text-muted-foreground">Action: {r.repairAction}</p>}
                            {r.cost > 0 && <p className="text-muted-foreground">Cost: {formatINR(r.cost)}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          ) : <div className="py-8 text-center text-sm text-muted-foreground">Equipment not found.</div>}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Equipment</AlertDialogTitle><AlertDialogDescription>Are you sure? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" disabled={deleteMutation.isPending} onClick={() => deleteId && deleteMutation.mutate(deleteId)}>{deleteMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Deleting...</> : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialog.open} onOpenChange={(o) => setTransferDialog({ ...transferDialog, open: o })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /> Transfer Equipment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm"><span className="text-muted-foreground">From:</span> <Badge variant="outline">{transferDialog.fromLocation || "Unknown"}</Badge></div>
            <div className="space-y-1.5"><Label className="text-xs">To Location *</Label><Input value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="Enter destination location" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setTransferDialog({ ...transferDialog, open: false })}>Cancel</Button>
              <Button className="bg-cyan-600 hover:bg-cyan-700 text-white" disabled={!transferTo.trim() || transferMutation.isPending} onClick={() => transferMutation.mutate({ equipmentId: transferDialog.equipmentId, toLocation: transferTo, notes: transferNotes })}>{transferMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Transferring...</> : "Transfer"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={returnDialog.open} onOpenChange={(o) => setReturnDialog({ ...returnDialog, open: o })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Return Equipment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Return Condition *</Label><Select value={returnCondition} onValueChange={setReturnCondition}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RETURN_CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={2} /></div>
            <p className="text-xs text-muted-foreground">Equipment will be marked as RETURNED and set to IN_STOCK if condition is acceptable.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReturnDialog({ ...returnDialog, open: false })}>Cancel</Button>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white" disabled={returnMutation.isPending} onClick={() => returnMutation.mutate({ equipmentId: returnDialog.equipmentId, condition: returnCondition, notes: returnNotes })}>{returnMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Returning...</> : "Return"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inspection Dialog */}
      <Dialog open={inspectionDialog.open} onOpenChange={(o) => setInspectionDialog({ ...inspectionDialog, open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Equipment Inspection</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Condition Assessment</Label><Select value={inspectCondition} onValueChange={setInspectCondition}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RETURN_CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Checklist</Label>
              {Object.entries(inspectChecklist).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2"><Checkbox checked={val} onCheckedChange={(c) => setInspectChecklist({ ...inspectChecklist, [key]: !!c })} /><span className="text-sm">{key}</span></div>
              ))}
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Inspector Notes</Label><Textarea value={inspectNotes} onChange={(e) => setInspectNotes(e.target.value)} rows={2} /></div>
            <div className="flex items-center gap-2"><Switch checked={inspectPassed} onCheckedChange={setInspectPassed} /><Label className="text-xs">Passed Inspection</Label></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setInspectionDialog({ ...inspectionDialog, open: false })}>Cancel</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={inspectionMutation.isPending} onClick={() => inspectionMutation.mutate({ equipmentId: inspectionDialog.equipmentId, condition: inspectCondition, notes: inspectNotes, checklistResult: inspectChecklist, passed: inspectPassed })}>{inspectionMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : "Save Inspection"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Repair Dialog */}
      <Dialog open={repairDialog.open} onOpenChange={(o) => setRepairDialog({ ...repairDialog, open: o })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Create Repair Record</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Issue Description *</Label><Textarea value={repairIssue} onChange={(e) => setRepairIssue(e.target.value)} rows={2} placeholder="Describe the issue..." /></div>
            <div className="space-y-1.5"><Label className="text-xs">Repair Notes</Label><Textarea value={repairNotes} onChange={(e) => setRepairNotes(e.target.value)} rows={2} placeholder="Repair action notes..." /></div>
            <div className="space-y-1.5"><Label className="text-xs">Estimated Cost (₹)</Label><Input type="number" min="0" value={repairCost} onChange={(e) => setRepairCost(Number(e.target.value))} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setRepairDialog({ ...repairDialog, open: false })}>Cancel</Button>
              <Button className="bg-amber-600 hover:bg-amber-700 text-white" disabled={!repairIssue.trim() || repairMutation.isPending} onClick={() => repairMutation.mutate({ equipmentId: repairDialog.equipmentId, issueDescription: repairIssue, repairNotes, repairCost, status: "SUBMITTED" })}>{repairMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Creating...</> : "Submit Repair"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vendor Create/Edit Dialog */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">{vendorEditId ? "Edit" : "Add"} Vendor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Vendor Name *</Label><Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Contact Person</Label><Input value={vendorForm.contactPerson} onChange={(e) => setVendorForm({ ...vendorForm, contactPerson: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">GSTIN</Label><Input value={vendorForm.gstin} onChange={(e) => setVendorForm({ ...vendorForm, gstin: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Address</Label><Textarea value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} rows={2} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Rating</Label><StarRating rating={vendorForm.rating} onChange={(r) => setVendorForm({ ...vendorForm, rating: r })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={vendorForm.notes} onChange={(e) => setVendorForm({ ...vendorForm, notes: e.target.value })} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setVendorDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={!vendorForm.name.trim() || vendorCreateMutation.isPending || vendorUpdateMutation.isPending} onClick={() => { if (vendorEditId) vendorUpdateMutation.mutate({ id: vendorEditId, ...vendorForm }); else vendorCreateMutation.mutate(vendorForm); }}>{vendorCreateMutation.isPending || vendorUpdateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : vendorEditId ? "Update" : "Add Vendor"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vendor Delete Confirmation */}
      <AlertDialog open={!!vendorDeleteId} onOpenChange={() => setVendorDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Vendor</AlertDialogTitle><AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" disabled={vendorDeleteMutation.isPending} onClick={() => vendorDeleteId && vendorDeleteMutation.mutate(vendorDeleteId)}>{vendorDeleteMutation.isPending ? "Deleting..." : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* PO Create Dialog */}
      <Dialog open={poDialogOpen} onOpenChange={setPoDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Create Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label className="text-xs">Vendor</Label><Select value={poVendorId} onValueChange={setPoVendorId}><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{vendorList.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Expected Date</Label><Input type="date" value={poExpectedDate} onChange={(e) => setPoExpectedDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={poNotes} onChange={(e) => setPoNotes(e.target.value)} /></div>
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label className="text-xs font-semibold">Line Items</Label><Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addPoItem}><Plus className="h-3 w-3" /> Add</Button></div>
              {poItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 rounded border">
                  <div className="col-span-4 space-y-1"><Label className="text-[10px]">Name</Label><Input className="h-8 text-xs" value={item.name} onChange={(e) => updatePoItem(idx, "name", e.target.value)} /></div>
                  <div className="col-span-2 space-y-1"><Label className="text-[10px]">Category</Label><Select value={item.category} onValueChange={(v) => updatePoItem(idx, "category", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
                  <div className="col-span-2 space-y-1"><Label className="text-[10px]">Qty</Label><Input type="number" min="1" className="h-8 text-xs" value={item.quantity} onChange={(e) => updatePoItem(idx, "quantity", Number(e.target.value))} /></div>
                  <div className="col-span-3 space-y-1"><Label className="text-[10px]">Unit Price</Label><Input type="number" min="0" className="h-8 text-xs" value={item.unitPrice} onChange={(e) => updatePoItem(idx, "unitPrice", Number(e.target.value))} /></div>
                  <div className="col-span-1 flex justify-end"><Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600" onClick={() => removePoItem(idx)}><Trash2 className="h-3 w-3" /></Button></div>
                </div>
              ))}
            </div>
            <div className="text-right text-sm font-semibold">Total: {formatINR(poItems.reduce((s, i) => s + i.total, 0))}</div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPoDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={poItems.filter((i) => i.name.trim()).length === 0 || poCreateMutation.isPending} onClick={() => poCreateMutation.mutate({ vendorId: poVendorId, items: poItems, expectedDate: poExpectedDate, notes: poNotes })}>{poCreateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Creating...</> : "Create PO"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PO Detail Dialog */}
      <Dialog open={!!poDetailId} onOpenChange={() => setPoDetailId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">Purchase Order Details</DialogTitle></DialogHeader>
          {(() => {
            const po = poList.find((p) => p.id === poDetailId);
            if (!po) return <p className="text-sm text-muted-foreground">Order not found.</p>;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Order #:</span><p className="font-mono font-semibold">{po.orderNumber}</p></div>
                  <div><span className="text-muted-foreground">Status:</span><Badge variant="outline" className={`text-[10px] ${PO_STATUS_STYLES[po.status] || ""}`}>{po.status}</Badge></div>
                  <div><span className="text-muted-foreground">Vendor:</span><p>{po.vendor?.name || "—"}</p></div>
                  <div><span className="text-muted-foreground">Order Date:</span><p>{formatDate(po.orderDate)}</p></div>
                  <div><span className="text-muted-foreground">Expected:</span><p>{formatDate(po.expectedDate || "")}</p></div>
                  <div><span className="text-muted-foreground">Total:</span><p className="font-semibold">{formatINR(po.totalAmount)}</p></div>
                </div>
                <Separator />
                <p className="text-xs font-semibold">Items ({po.items.length})</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {po.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-xs p-2 rounded border">
                      <div><p className="font-medium">{item.name || "—"}</p><p className="text-muted-foreground">{item.category.replace("_", " ")} x {item.quantity}</p></div>
                      <span className="font-semibold tabular-nums">{formatINR(item.total)}</span>
                    </div>
                  ))}
                </div>
                {po.status !== "RECEIVED" && po.status !== "CANCELLED" && (
                  <div className="flex gap-2 justify-end pt-2">
                    {po.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => poUpdateMutation.mutate({ id: po.id, status: "SUBMITTED" })}>Submit</Button>}
                    {po.status === "SUBMITTED" && <Button size="sm" variant="outline" onClick={() => poUpdateMutation.mutate({ id: po.id, status: "APPROVED" })}>Approve</Button>}
                    {po.status === "APPROVED" && <Button size="sm" variant="outline" onClick={() => poUpdateMutation.mutate({ id: po.id, status: "ORDERED" })}>Mark Ordered</Button>}
                    {po.status === "ORDERED" && <Button size="sm" variant="outline" onClick={() => poUpdateMutation.mutate({ id: po.id, status: "RECEIVED" })}>Mark Received</Button>}
                    {["DRAFT", "SUBMITTED"].includes(po.status) && <Button size="sm" variant="outline" className="text-red-600" onClick={() => poUpdateMutation.mutate({ id: po.id, status: "CANCELLED" })}>Cancel</Button>}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Stock Count Dialog */}
      <Dialog open={stockCountOpen} onOpenChange={setStockCountOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4" /> Stock Count / Audit</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Enter the actual physical count for each category. Discrepancies will be recorded.</p>
          <div className="space-y-3">
            {stockCountData ? (
              <>
                {stockCountData.totalByCategory.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No in-stock items to count.</p> : (
                  <ScrollArea className="max-h-64 pr-3">
                    <div className="space-y-2">
                      {stockCountData.totalByCategory.map((row) => {
                        const systemCount = row._count.id;
                        return (
                          <div key={row.category} className="flex items-center gap-3 p-2 rounded border">
                            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[row.category] || "#6B7280" }} />
                            <span className="text-sm font-medium flex-shrink-0 w-28 truncate">{row.category.replace("_", " ")}</span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">System: <strong>{systemCount}</strong></span>
                            <Input type="number" min="0" className="h-8 w-20 text-xs" placeholder="Actual" value={stockCountInputs[row.category] ?? ""} onChange={(e) => setStockCountInputs({ ...stockCountInputs, [row.category]: Number(e.target.value) })} />
                            {stockCountInputs[row.category] !== undefined && stockCountInputs[row.category] !== systemCount && (
                              <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${stockCountInputs[row.category] > systemCount ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                                {stockCountInputs[row.category] > systemCount ? `+${stockCountInputs[row.category] - systemCount}` : stockCountInputs[row.category] - systemCount}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setStockCountOpen(false); setStockCountInputs({}); }}>Cancel</Button>
                  <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={Object.keys(stockCountInputs).length === 0} onClick={async () => {
                    try {
                      const adjustments = Object.entries(stockCountInputs)
                        .filter(([_, actualQty]) => actualQty !== undefined && actualQty !== null)
                        .map(([category, actualQty]) => ({ category, actualQty }));
                      const res = await fetch("/api/equipment/stock-count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-count", adjustments }) });
                      if (res.ok) { toast.success("Stock count saved. Adjustments recorded where discrepancies found."); }
                      else { toast.error("Failed to save stock count"); }
                    } catch { toast.error("Failed to save stock count"); }
                    setStockCountOpen(false);
                    setStockCountInputs({});
                    queryClient.invalidateQueries({ queryKey: ["stock-count"] });
                  }}>Save Count</Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Threshold Settings Dialog */}
      <Dialog open={thresholdsOpen} onOpenChange={setThresholdsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Settings2 className="h-4 w-4" /> Stock Threshold Settings</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Set minimum stock thresholds per category.</p>
          <Separator />
          <ScrollArea className="max-h-80 pr-3">
            <div className="space-y-3">
              {CATEGORIES.map((cat) => {
                const threshold = localThresholds[cat] ?? LS_DEFAULT_THRESHOLD;
                return (
                  <div key={cat} className="flex items-center justify-between gap-4 py-1.5">
                    <div className="flex items-center gap-2.5 min-w-0"><div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} /><span className="text-sm font-medium truncate">{cat.replace("_", " ")}</span></div>
                    <Input type="number" min="0" className="w-20 h-8 text-xs text-right" value={threshold} onChange={(e) => handleThresholdChange(cat, Number(e.target.value))} />
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={resetThresholds}>Reset Defaults</Button>
            <div className="flex gap-2"><Button variant="outline" onClick={() => setThresholdsOpen(false)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700 text-white" onClick={saveThresholds}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Transfer Approvals Section */}
      {transfers.filter((t) => t.status === "PENDING").length > 0 && (
        <Card className="border shadow-sm border-amber-200">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-amber-500" /> Pending Transfers</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {transfers.filter((t) => t.status === "PENDING").map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-2 rounded border text-sm">
                  <span className="font-medium">{t.equipment?.name || "—"}</span>
                  <span className="text-muted-foreground">{t.fromLocation}</span>
                  <ArrowRightLeft className="h-3 w-3" />
                  <span className="text-muted-foreground">{t.toLocation}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{formatDate(t.createdAt)}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-green-600" onClick={() => approveTransferMutation.mutate(t.id)}>Approve</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
