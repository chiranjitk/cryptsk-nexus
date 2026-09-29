"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, Filter, Edit, Trash2, Package,
  PackageOpen, AlertTriangle, RotateCcw, Box, ArrowRightLeft,
  TrendingDown, Shield, CheckSquare, Square, X, Download,
  Star, Building2, Phone, Mail, ScanLine, CalendarClock,
  ChevronDown, Printer, Clock, Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiFetch, formatINR } from "@/lib/utils";
import { escapeHtml, escapeJs } from "@/lib/utils/html-escape";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Types ───────────────────────────────────────────────
interface Equipment {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  macAddress: string;
  condition: string;
  status: string;
  stockLocation: string;
  purchaseDate: string | null;
  purchasePrice: number;
  depreciationRate: number;
  currentValue: number;
  warrantyExpiry: string | null;
  warrantyStatus: string;
  vendorName: string;
  vendorId: string | null;
  assignedSubscriberId: string | null;
  createdAt: string;
  assignedSubscriber: { id: string; name: string; code: string } | null;
  vendor: { id: string; name: string } | null;
}

interface Vendor {
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
  _count?: { equipment: number };
}

interface Summary {
  totalItems: number;
  inStock: number;
  deployed: number;
  returned: number;
  decommissioned: number;
  totalValue: number;
  totalCurrentValue: number;
  statusSummary: Record<string, { count: number; totalValue: number; currentTotalValue: number }>;
}

interface StockTransfer {
  id: string;
  equipmentId: string;
  fromLocation: string;
  toLocation: string;
  transferredBy: string | null;
  status: string;
  notes: string;
  createdAt: string;
  equipment: { id: string; name: string; serialNumber: string; category: string } | null;
}

interface AuditLogEntry {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  timestamp: string;
  user: { id: string; name: string; email: string } | null;
}

interface MaintenanceRecord {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  expectedDuration: string;
  description: string;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────
const CATEGORIES = [
  { value: "ROUTER", label: "Router" }, { value: "ONT", label: "ONT" },
  { value: "SWITCH", label: "Switch" }, { value: "AP", label: "Access Point" },
  { value: "CABLE", label: "Cable" }, { value: "SPLITTER", label: "Splitter" },
  { value: "ANTENNA", label: "Antenna" }, { value: "UPS", label: "UPS" },
  { value: "PATCH_CORD", label: "Patch Cord" }, { value: "OLT", label: "OLT" },
  { value: "POWER_SUPPLY", label: "Power Supply" }, { value: "OTHER", label: "Other" },
];

const CONDITIONS = [
  { value: "NEW", label: "New" }, { value: "GOOD", label: "Good" },
  { value: "DAMAGED", label: "Damaged" }, { value: "DEAD", label: "Dead" },
];

const STATUS_OPTIONS = [
  { value: "IN_STOCK", label: "In Stock" }, { value: "DEPLOYED", label: "Deployed" },
  { value: "RETURNED", label: "Returned" }, { value: "DECOMMISSIONED", label: "Decommissioned" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  IN_STOCK: { label: "In Stock", cls: "bg-green-100 text-green-700 border-green-200" },
  DEPLOYED: { label: "Deployed", cls: "bg-teal-100 text-teal-700 border-teal-200" },
  RETURNED: { label: "Returned", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  DECOMMISSIONED: { label: "Decommissioned", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

const CONDITION_BADGE: Record<string, { label: string; cls: string }> = {
  NEW: { label: "New", cls: "bg-green-100 text-green-700 border-green-200" },
  GOOD: { label: "Good", cls: "bg-teal-100 text-teal-700 border-teal-200" },
  DAMAGED: { label: "Damaged", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  DEAD: { label: "Dead", cls: "bg-red-100 text-red-700 border-red-200" },
};

const WARRANTY_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-green-100 text-green-700 border-green-200" },
  "expiring-soon": { label: "Expiring Soon", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  expired: { label: "Expired", cls: "bg-red-100 text-red-700 border-red-200" },
  none: { label: "N/A", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const TRANSFER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  COMPLETED: { label: "Completed", cls: "bg-green-100 text-green-700 border-green-200" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const ACTION_DOT_COLORS: Record<string, string> = {
  CREATE: "bg-green-500",
  UPDATE: "bg-teal-500",
  DELETE: "bg-red-500",
  DEPLOYED: "bg-emerald-500",
  RETURNED: "bg-yellow-500",
  TRANSFERRED: "bg-purple-500",
};

function getActionDotColor(action: string) {
  const upper = action.toUpperCase();
  if (upper.includes("CREATE") || upper.includes("ADD")) return ACTION_DOT_COLORS.CREATE;
  if (upper.includes("DELETE") || upper.includes("REMOVE")) return ACTION_DOT_COLORS.DELETE;
  if (upper.includes("UPDATE") || upper.includes("EDIT") || upper.includes("MODIFY")) return ACTION_DOT_COLORS.UPDATE;
  if (upper.includes("DEPLOY")) return ACTION_DOT_COLORS.DEPLOYED;
  if (upper.includes("RETURN")) return ACTION_DOT_COLORS.RETURNED;
  if (upper.includes("TRANSFER")) return ACTION_DOT_COLORS.TRANSFERRED;
  return "bg-gray-400";
}

function getCategoryLabel(c: string) { return CATEGORIES.find((x) => x.value === c)?.label || c; }

function formatDate(dateStr: string | null) {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }).map((_, i) => (
    <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? "text-amber-400 fill-amber-400" : "text-gray-300"}`} />
  ));
}

// ─── CSS Barcode Generator ──────────────────────────────
function generateBarcodePattern(serialNumber: string) {
  const chars = serialNumber || "UNKNOWN";
  const bars: Array<{ width: number; black: boolean }> = [];
  for (let i = 0; i < chars.length; i++) {
    const code = chars.charCodeAt(i);
    // Generate deterministic pattern from character code
    bars.push({ width: (code % 3) + 1, black: true });
    bars.push({ width: (code % 2) + 1, black: false });
    bars.push({ width: ((code * 2) % 3) + 1, black: true });
    bars.push({ width: ((code * 3) % 2) + 1, black: false });
  }
  // Add quiet zone bars
  bars.unshift({ width: 2, black: false });
  bars.push({ width: 2, black: false });
  return bars;
}

function BarcodeDisplay({ serialNumber }: { serialNumber: string }) {
  const bars = generateBarcodePattern(serialNumber);
  const totalWidth = bars.reduce((sum, b) => sum + b.width, 0);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-white p-4 rounded-lg border">
        <svg width="240" height="80" viewBox={`0 0 ${totalWidth * 2} 80`} preserveAspectRatio="none">
          {bars.map((bar, i) => {
            const x = bars.slice(0, i).reduce((sum, b) => sum + b.width, 0) * 2;
            return (
              <rect
                key={i}
                x={x}
                y={0}
                width={bar.width * 2}
                height={70}
                fill={bar.black ? "#000000" : "#ffffff"}
              />
            );
          })}
        </svg>
      </div>
      <p className="font-mono text-sm font-bold tracking-widest text-center">{serialNumber}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────
export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState("inventory");

  // Inventory states
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterVendor, setFilterVendor] = useState<string>("all");
  const [filterWarranty, setFilterWarranty] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("");

  // Transfer states
  const [transferDialogId, setTransferDialogId] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [transferNotes, setTransferNotes] = useState("");

  // Vendor dialog
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [editVendorId, setEditVendorId] = useState<string | null>(null);
  const [deleteVendorId, setDeleteVendorId] = useState<string | null>(null);
  const emptyVendorForm = { name: "", contactPerson: "", phone: "", email: "", address: "", gstin: "", category: "general", rating: "0", notes: "" };
  const [vendorForm, setVendorForm] = useState(emptyVendorForm);

  // Form state
  const emptyForm = {
    name: "", category: "OTHER", manufacturer: "", model: "", serialNumber: "",
    macAddress: "", condition: "NEW", purchasePrice: "", stockLocation: "",
    purchaseDate: "", vendorName: "", vendorId: "", depreciationRate: "20", warrantyExpiry: "",
  };
  const [form, setForm] = useState(emptyForm);

  // ── Feature 1: Low Stock Alerts ──
  const [lowStockOpen, setLowStockOpen] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  // ── Feature 2: Audit Trail ──
  // (uses query, no extra state needed beyond tab)

  // ── Feature 3: Barcode Dialog ──
  const [barcodeDialogId, setBarcodeDialogId] = useState<string | null>(null);
  const barcodePrintRef = useRef<HTMLDivElement>(null);

  // ── Feature 4: Maintenance Scheduling ──
  const [maintenanceDialogId, setMaintenanceDialogId] = useState<string | null>(null);
  const [maintenanceForm, setMaintenanceForm] = useState({
    scheduledDate: "",
    scheduledTime: "",
    expectedDuration: "1h",
    description: "",
  });
  const [maintenanceRecords, setMaintenanceRecords] = useState<Record<string, MaintenanceRecord[]>>({});

  // Load localStorage values on mount
  useEffect(() => {
    try {
      const savedThresholds = localStorage.getItem("inventory-stock-thresholds");
      if (savedThresholds) {
        const parsed = JSON.parse(savedThresholds);
        if (typeof parsed === "number") setLowStockThreshold(parsed);
      }
    } catch { /* ignore */ }

    // Load maintenance records
    try {
      const savedMaintenance = localStorage.getItem("equipment-maintenance-records");
      if (savedMaintenance) {
        setMaintenanceRecords(JSON.parse(savedMaintenance));
      }
    } catch { /* ignore */ }
  }, []);

  const saveThresholdToStorage = (val: number) => {
    setLowStockThreshold(val);
    try { localStorage.setItem("inventory-stock-thresholds", JSON.stringify(val)); } catch { /* ignore */ }
  };

  const saveMaintenanceRecordsToStorage = (records: Record<string, MaintenanceRecord[]>) => {
    setMaintenanceRecords(records);
    try { localStorage.setItem("equipment-maintenance-records", JSON.stringify(records)); } catch { /* ignore */ }
  };

  // Build query params
  const buildParams = () => {
    const params = new URLSearchParams();
    if (filterCategory !== "all") params.set("category", filterCategory);
    if (filterCondition !== "all") params.set("condition", filterCondition);
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterVendor !== "all") params.set("vendorId", filterVendor);
    if (filterWarranty !== "all") params.set("warranty", filterWarranty);
    return params.toString();
  };

  // Fetch inventory
  const { data, isLoading } = useQuery({
    queryKey: ["inventory", filterCategory, filterCondition, filterStatus, filterVendor, filterWarranty],
    queryFn: () => apiFetch(`/api/inventory?${buildParams()}`),
  });

  const equipment: Equipment[] = data?.equipment || [];
  const summary: Summary | null = data?.summary || null;

  // Fetch vendors
  const { data: vendorsData } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => apiFetch("/api/vendors"),
  });
  const vendors: Vendor[] = vendorsData?.vendors || [];

  // Fetch stock transfers
  const { data: transfersData } = useQuery({
    queryKey: ["stock-transfers"],
    queryFn: () => apiFetch("/api/stock-transfers"),
  });
  const transfers: StockTransfer[] = transfersData?.transfers || [];

  // ── Feature 1: Fetch low stock analytics ──
  const { data: analyticsData } = useQuery({
    queryKey: ["equipment-analytics"],
    queryFn: () => apiFetch("/api/equipment/analytics"),
  });
  const lowStockData = analyticsData?.lowStockData as Record<string, { inStock: number; total: number }> | undefined;

  // ── Feature 2: Fetch audit log ──
  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["audit-logs", "Equipment"],
    queryFn: () => apiFetch("/api/audit-log/entity/Equipment?limit=50"),
    enabled: mainTab === "activity",
  });
  const auditLogs: AuditLogEntry[] = auditData?.logs || [];

  const filtered = equipment.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) || e.serialNumber.toLowerCase().includes(q) ||
      e.macAddress.toLowerCase().includes(q) || e.model.toLowerCase().includes(q) ||
      e.manufacturer.toLowerCase().includes(q) || (e.vendor?.name || "").toLowerCase().includes(q)
    );
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (f: typeof form) =>
      apiFetch("/api/inventory", { method: "POST", body: JSON.stringify({ ...f, purchasePrice: parseFloat(f.purchasePrice) || 0, depreciationRate: parseFloat(f.depreciationRate) || 20 }) }),
    onSuccess: () => { toast.success("Equipment added to inventory"); queryClient.invalidateQueries({ queryKey: ["inventory"] }); setShowCreate(false); setForm(emptyForm); },
    onError: () => toast.error("Failed to add equipment"),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/api/inventory/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { toast.success("Equipment updated"); queryClient.invalidateQueries({ queryKey: ["inventory"] }); setEditId(null); setForm(emptyForm); },
    onError: () => toast.error("Failed to update equipment"),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/inventory/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Equipment removed"); queryClient.invalidateQueries({ queryKey: ["inventory"] }); setDeleteId(null); },
    onError: () => toast.error("Failed to delete equipment"),
  });

  // Bulk action mutation
  const bulkMutation = useMutation({
    mutationFn: ({ action, ids, status }: { action: string; ids: string[]; status?: string }) =>
      apiFetch("/api/inventory/bulk", { method: "POST", body: JSON.stringify({ action, ids, status }) }),
    onSuccess: (_, vars) => {
      toast.success(`Bulk ${vars.action} completed`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setBulkStatus("");
    },
    onError: () => toast.error("Bulk action failed"),
  });

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: ({ equipmentId, toLocation, notes }: { equipmentId: string; toLocation: string; notes: string }) =>
      apiFetch("/api/stock-transfers", { method: "POST", body: JSON.stringify({ action: "create", equipmentId, toLocation, notes }) }),
    onSuccess: () => { toast.success("Transfer request created"); setTransferDialogId(null); setTransferTo(""); setTransferNotes(""); queryClient.invalidateQueries({ queryKey: ["inventory"] }); queryClient.invalidateQueries({ queryKey: ["stock-transfers"] }); },
    onError: () => toast.error("Failed to create transfer"),
  });

  // Approve transfer mutation
  const approveTransferMutation = useMutation({
    mutationFn: (transferId: string) =>
      apiFetch("/api/stock-transfers", { method: "POST", body: JSON.stringify({ action: "approve", transferId }) }),
    onSuccess: () => { toast.success("Transfer completed"); queryClient.invalidateQueries({ queryKey: ["stock-transfers"] }); queryClient.invalidateQueries({ queryKey: ["inventory"] }); },
    onError: () => toast.error("Failed to approve transfer"),
  });

  // Vendor CRUD mutations
  const vendorCreateMutation = useMutation({
    mutationFn: (f: typeof vendorForm) => apiFetch("/api/vendors", { method: "POST", body: JSON.stringify({ ...f, rating: parseInt(f.rating) || 0 }) }),
    onSuccess: () => { toast.success("Vendor added"); setVendorDialogOpen(false); setVendorForm(emptyVendorForm); setEditVendorId(null); queryClient.invalidateQueries({ queryKey: ["vendors"] }); },
    onError: () => toast.error("Failed to add vendor"),
  });

  const vendorUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/api/vendors/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { toast.success("Vendor updated"); setVendorDialogOpen(false); setEditVendorId(null); setVendorForm(emptyVendorForm); queryClient.invalidateQueries({ queryKey: ["vendors"] }); },
    onError: () => toast.error("Failed to update vendor"),
  });

  const vendorDeleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/vendors/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Vendor deleted"); setDeleteVendorId(null); queryClient.invalidateQueries({ queryKey: ["vendors"] }); },
    onError: () => toast.error("Failed to delete vendor"),
  });

  // Quick status change
  const deployMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/inventory/${id}`, { method: "PUT", body: JSON.stringify({ status: "DEPLOYED" }) }),
    onSuccess: () => { toast.success("Marked as deployed"); queryClient.invalidateQueries({ queryKey: ["inventory"] }); },
    onError: () => toast.error("Failed to update"),
  });

  const returnMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/inventory/${id}`, { method: "PUT", body: JSON.stringify({ status: "RETURNED" }) }),
    onSuccess: () => { toast.success("Marked as returned"); queryClient.invalidateQueries({ queryKey: ["inventory"] }); },
    onError: () => toast.error("Failed to update"),
  });

  const openEdit = useCallback((id: string) => {
    const eq = equipment.find((e) => e.id === id);
    if (eq) {
      setForm({
        name: eq.name, category: eq.category, manufacturer: eq.manufacturer, model: eq.model,
        serialNumber: eq.serialNumber, macAddress: eq.macAddress, condition: eq.condition,
        purchasePrice: String(eq.purchasePrice), stockLocation: eq.stockLocation,
        purchaseDate: eq.purchaseDate ? eq.purchaseDate.split("T")[0] : "",
        vendorName: eq.vendorName, vendorId: eq.vendorId || "",
        depreciationRate: String(eq.depreciationRate || 20),
        warrantyExpiry: eq.warrantyExpiry ? eq.warrantyExpiry.split("T")[0] : "",
      });
    }
    setEditId(id);
  }, [equipment]);

  const openEditVendor = (v: Vendor) => {
    setVendorForm({ name: v.name, contactPerson: v.contactPerson, phone: v.phone, email: v.email, address: v.address, gstin: v.gstin, category: v.category, rating: String(v.rating), notes: v.notes });
    setEditVendorId(v.id);
    setVendorDialogOpen(true);
  };

  const closeEdit = () => { setEditId(null); setForm(emptyForm); };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Equipment name is required"); return; }
    if (editId) {
      updateMutation.mutate({ id: editId, data: { ...form, purchasePrice: parseFloat(form.purchasePrice) || 0, purchaseDate: form.purchaseDate || null, vendorId: form.vendorId || null, depreciationRate: parseFloat(form.depreciationRate) || 20, warrantyExpiry: form.warrantyExpiry || null } });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleVendorSubmit = () => {
    if (!vendorForm.name.trim()) { toast.error("Vendor name is required"); return; }
    if (editVendorId) {
      vendorUpdateMutation.mutate({ id: editVendorId, data: { ...vendorForm, rating: parseInt(vendorForm.rating) || 0 } });
    } else {
      vendorCreateMutation.mutate(vendorForm);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e.id)));
  };

  const handleBulkAction = (action: string) => {
    if (selected.size === 0) return;
    if (action === "update-status" && !bulkStatus) { toast.error("Select a status first"); return; }
    bulkMutation.mutate({ action, ids: Array.from(selected), status: bulkStatus });
  };

  const handleExportSelected = async () => {
    if (selected.size === 0) return;
    try {
      const result = await apiFetch<{ equipment: Equipment[] }>("/api/inventory/bulk", { method: "POST", body: JSON.stringify({ action: "export", ids: Array.from(selected) }) });
      const headers = ["Name", "Category", "Serial #", "MAC", "Condition", "Status", "Price", "Current Value", "Location", "Vendor", "Warranty"];
      const rows = result.equipment.map((e) => [e.name, e.category, e.serialNumber, e.macAddress, e.condition, e.status, e.purchasePrice, e.currentValue, e.stockLocation, e.vendor?.name || e.vendorName || "", e.warrantyExpiry ? formatDate(e.warrantyExpiry) : "N/A"]);
      const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `equipment-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch { toast.error("Export failed"); }
  };

  // ── Feature 3: Print barcode label ──
  const handlePrintBarcode = (eq: Equipment) => {
    const printWindow = window.open("", "_blank", "width=400,height=300");
    if (!printWindow) { toast.error("Please allow popups to print labels"); return; }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Equipment Label - ${escapeHtml(eq.name)}</title>
        <style>
          body { font-family: 'Courier New', monospace; text-align: center; padding: 20px; }
          .label { border: 2px solid #000; padding: 20px; display: inline-block; }
          .barcode { display: flex; justify-content: center; margin: 10px 0; }
          .bar { display: inline-block; height: 60px; background: #000; }
          .space { display: inline-block; height: 60px; background: #fff; }
          .info { margin-top: 10px; font-size: 12px; }
          .name { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
          .serial { font-size: 14px; letter-spacing: 3px; margin-top: 5px; }
          .category { font-size: 11px; color: #666; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="name">${escapeHtml(eq.name)}</div>
          <div class="barcode" id="barcode"></div>
          <div class="serial">S/N: ${escapeHtml(eq.serialNumber || "N/A")}</div>
          <div class="category">${escapeHtml(getCategoryLabel(eq.category))}</div>
        </div>
        <script>
          const serial = ${JSON.stringify(eq.serialNumber || "UNKNOWN")};
          const bars = [];
          for (let i = 0; i < serial.length; i++) {
            const code = serial.charCodeAt(i);
            bars.push({ width: (code % 3) + 1, black: true });
            bars.push({ width: (code % 2) + 1, black: false });
            bars.push({ width: ((code * 2) % 3) + 1, black: true });
            bars.push({ width: ((code * 3) % 2) + 1, black: false });
          }
          const container = document.getElementById('barcode');
          bars.forEach(bar => {
            const el = document.createElement('span');
            el.style.width = (bar.width * 2) + 'px';
            el.style.height = '60px';
            el.style.display = 'inline-block';
            el.style.backgroundColor = bar.black ? '#000' : '#fff';
            container.appendChild(el);
          });
          window.onload = () => window.print();
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ── Feature 4: Handle maintenance scheduling ──
  const handleScheduleMaintenance = () => {
    if (!maintenanceDialogId) return;
    if (!maintenanceForm.scheduledDate) { toast.error("Please select a date"); return; }
    const record: MaintenanceRecord = {
      id: `maint-${Date.now()}`,
      scheduledDate: maintenanceForm.scheduledDate,
      scheduledTime: maintenanceForm.scheduledTime || "09:00",
      expectedDuration: maintenanceForm.expectedDuration || "1h",
      description: maintenanceForm.description,
      createdAt: new Date().toISOString(),
    };
    const existing = maintenanceRecords[maintenanceDialogId] || [];
    const updated = { ...maintenanceRecords, [maintenanceDialogId]: [...existing, record] };
    saveMaintenanceRecordsToStorage(updated);
    setMaintenanceDialogId(null);
    setMaintenanceForm({ scheduledDate: "", scheduledTime: "", expectedDuration: "1h", description: "" });
    toast.success("Maintenance scheduled");
  };

  const getMaintenanceForEquipment = (eqId: string): MaintenanceRecord[] => {
    return maintenanceRecords[eqId] || [];
  };

  const getNextMaintenance = (eqId: string): MaintenanceRecord | null => {
    const records = getMaintenanceForEquipment(eqId);
    if (records.length === 0) return null;
    // Sort by date ascending and return the next upcoming one
    const sorted = [...records].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
    const now = new Date();
    const upcoming = sorted.find((r) => new Date(`${r.scheduledDate}T${r.scheduledTime || "09:00"}`).getTime() >= now.getTime());
    return upcoming || sorted[sorted.length - 1];
  };

  const displaySummary = summary;

  // ─── Loading ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-40 mb-2" /><Skeleton className="skeleton-wave h-4 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-4 w-16 mb-2" /><Skeleton className="skeleton-wave h-7 w-20" /></CardContent></Card>)}
        </div>
        <Card className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  // ── Feature 1: Compute low stock alerts ──
  const lowStockAlerts: Array<{ category: string; inStock: number; total: number; threshold: number }> = [];
  if (lowStockData) {
    for (const [category, d] of Object.entries(lowStockData)) {
      if (d.inStock <= lowStockThreshold) lowStockAlerts.push({ category, inStock: d.inStock, total: d.total, threshold: lowStockThreshold });
    }
    lowStockAlerts.sort((a, b) => a.inStock - b.inStock);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipment Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and manage network equipment stock</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={vendorDialogOpen || !!editVendorId} onOpenChange={(open) => { if (!open) { setVendorDialogOpen(false); setEditVendorId(null); setVendorForm(emptyVendorForm); } }}>
            <Button variant="outline" onClick={() => { setVendorForm(emptyVendorForm); setEditVendorId(null); setVendorDialogOpen(true); }}>
              <Building2 className="h-4 w-4 mr-2" />Add Vendor
            </Button>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{editVendorId ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Name *</Label><Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="Vendor name" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Contact Person</Label><Input value={vendorForm.contactPerson} onChange={(e) => setVendorForm({ ...vendorForm, contactPerson: e.target.value })} placeholder="Name" /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} placeholder="Phone" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} placeholder="email@vendor.com" /></div>
                  <div className="space-y-2"><Label>GSTIN</Label><Input value={vendorForm.gstin} onChange={(e) => setVendorForm({ ...vendorForm, gstin: e.target.value })} placeholder="GSTIN" /></div>
                </div>
                <div className="space-y-2"><Label>Address</Label><Textarea value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} placeholder="Full address" rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Category</Label><Input value={vendorForm.category} onChange={(e) => setVendorForm({ ...vendorForm, category: e.target.value })} placeholder="e.g., networking" /></div>
                  <div className="space-y-2"><Label>Rating (0-5)</Label><Input type="number" min="0" max="5" value={vendorForm.rating} onChange={(e) => setVendorForm({ ...vendorForm, rating: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Textarea value={vendorForm.notes} onChange={(e) => setVendorForm({ ...vendorForm, notes: e.target.value })} placeholder="Additional notes" rows={2} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setVendorDialogOpen(false); setEditVendorId(null); }}>Cancel</Button>
                <Button onClick={handleVendorSubmit} disabled={vendorCreateMutation.isPending || vendorUpdateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                  {(vendorCreateMutation.isPending || vendorUpdateMutation.isPending) ? "Saving..." : editVendorId ? "Update" : "Add Vendor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={() => { setForm(emptyForm); closeEdit(); setShowCreate(true); }} className="bg-red-600 hover:bg-red-700 text-white">
            <Plus className="h-4 w-4 mr-2" />Add Equipment
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="inventory">Equipment</TabsTrigger>
          <TabsTrigger value="vendors">Vendors ({vendors.length})</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="h-3.5 w-3.5 mr-1.5" />Activity
          </TabsTrigger>
        </TabsList>

        {/* ── Inventory Tab ── */}
        <TabsContent value="inventory" className="space-y-4">
          {/* Stock Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="border shadow-sm"><CardContent className="p-4">
              <div className="flex items-center gap-2"><Box className="h-4 w-4 text-foreground" /><p className="text-xs font-medium text-muted-foreground">Total Items</p></div>
              <p className="text-2xl font-bold mt-1">{displaySummary?.totalItems || 0}</p>
              <p className="text-[10px] text-muted-foreground">Value: {formatINR(displaySummary?.totalValue || 0)}</p>
            </CardContent></Card>
            <Card className="border shadow-sm bg-green-50 dark:bg-green-950/30"><CardContent className="p-4">
              <div className="flex items-center gap-2"><Package className="h-4 w-4 text-green-600" /><p className="text-xs font-medium text-muted-foreground">In Stock</p></div>
              <p className="text-2xl font-bold text-green-600 mt-1">{displaySummary?.inStock || 0}</p>
            </CardContent></Card>
            <Card className="border shadow-sm bg-teal-50 dark:bg-teal-950/30"><CardContent className="p-4">
              <div className="flex items-center gap-2"><PackageOpen className="h-4 w-4 text-teal-600" /><p className="text-xs font-medium text-muted-foreground">Deployed</p></div>
              <p className="text-2xl font-bold text-teal-600 mt-1">{displaySummary?.deployed || 0}</p>
            </CardContent></Card>
            <Card className="border shadow-sm bg-yellow-50 dark:bg-yellow-950/30"><CardContent className="p-4">
              <div className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-yellow-600" /><p className="text-xs font-medium text-muted-foreground">Returned</p></div>
              <p className="text-2xl font-bold text-yellow-600 mt-1">{displaySummary?.returned || 0}</p>
            </CardContent></Card>
            <Card className="border shadow-sm bg-orange-50 dark:bg-orange-950/30"><CardContent className="p-4">
              <div className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-orange-600" /><p className="text-xs font-medium text-muted-foreground">Current Value</p></div>
              <p className="text-lg font-bold text-orange-600 mt-1">{formatINR(displaySummary?.totalCurrentValue || 0)}</p>
            </CardContent></Card>
          </div>

          {/* ── Feature 1: Low Stock Alerts Section ── */}
          <Collapsible open={lowStockOpen} onOpenChange={setLowStockOpen}>
            <Card className="border shadow-sm">
              <CollapsibleTrigger className="w-full">
                <CardHeader className="py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <CardTitle className="text-sm font-semibold">Low Stock Alerts</CardTitle>
                      {lowStockAlerts.length > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">{lowStockAlerts.length}</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Threshold:</Label>
                        <Input
                          type="number"
                          min={1}
                          value={lowStockThreshold}
                          onChange={(e) => saveThresholdToStorage(parseInt(e.target.value) || 5)}
                          className="h-7 w-16 text-xs text-center"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${lowStockOpen ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-4">
                  {lowStockAlerts.length === 0 ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      All categories have sufficient stock (threshold: {lowStockThreshold}).
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {lowStockAlerts.map((a) => (
                        <div key={a.category} className={`flex items-center gap-3 p-3 rounded-lg border ${a.inStock === 0 ? "bg-red-50 border-red-200" : a.inStock <= Math.ceil(a.threshold / 2) ? "bg-orange-50 border-orange-200" : "bg-amber-50 border-amber-200"}`}>
                          <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${a.inStock === 0 ? "bg-red-100" : "bg-amber-100"}`}><Package className={`h-4 w-4 ${a.inStock === 0 ? "text-red-600" : "text-amber-600"}`} /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{getCategoryLabel(a.category)}</p>
                            <p className="text-xs text-muted-foreground">{a.inStock} in stock of {a.total} total</p>
                          </div>
                          <Badge variant="outline" className={`flex-shrink-0 text-[10px] ${a.inStock === 0 ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>{a.inStock === 0 ? "OUT" : "LOW"}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Search & Filters */}
          <Card className="border shadow-sm"><CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name, serial #, MAC, model, vendor..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="shrink-0">
                <Filter className="h-4 w-4 mr-2" /> Filters
                {(filterCategory !== "all" || filterCondition !== "all" || filterStatus !== "all" || filterVendor !== "all" || filterWarranty !== "all") && <Badge variant="default" className="ml-2 bg-red-600 text-[10px] px-1.5">Active</Badge>}
              </Button>
            </div>
            {showFilters && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3 pt-3 border-t">
                <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setSelected(new Set()); }}>
                  <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All Categories</SelectItem>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filterCondition} onValueChange={(v) => { setFilterCondition(v); setSelected(new Set()); }}>
                  <SelectTrigger><SelectValue placeholder="All Conditions" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All Conditions</SelectItem>{CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setSelected(new Set()); }}>
                  <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filterVendor} onValueChange={(v) => { setFilterVendor(v); setSelected(new Set()); }}>
                  <SelectTrigger><SelectValue placeholder="All Vendors" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All Vendors</SelectItem>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filterWarranty} onValueChange={(v) => { setFilterWarranty(v); setSelected(new Set()); }}>
                  <SelectTrigger><SelectValue placeholder="Warranty Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Warranty</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expiring-soon">Expiring Soon</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent></Card>

          {/* Selection Bar */}
          {selected.size > 0 && (
            <Card className="border-2 border-red-200 bg-red-50 dark:bg-red-950/20"><CardContent className="p-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium">{selected.size} item(s) selected</span>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="h-7 text-xs"><X className="h-3 w-3 mr-1" />Clear</Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={bulkStatus} onValueChange={setBulkStatus}>
                    <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Set Status" /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleBulkAction("update-status")} disabled={!bulkStatus || bulkMutation.isPending}>Update Status</Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs text-red-600" onClick={() => handleBulkAction("delete")} disabled={bulkMutation.isPending}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExportSelected}><Download className="h-3 w-3 mr-1" />Export CSV</Button>
                </div>
              </div>
            </CardContent></Card>
          )}

          {/* Equipment Table */}
          <Card className="border shadow-sm"><CardContent className="p-0">
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs w-10"><Checkbox checked={selected.size > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead className="text-xs">Equipment</TableHead>
                  <TableHead className="text-xs">Serial #</TableHead>
                  <TableHead className="text-xs">Condition</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Depreciation</TableHead>
                  <TableHead className="text-xs">Warranty</TableHead>
                  <TableHead className="text-xs">Vendor</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No equipment found</TableCell></TableRow>
                  ) : (
                    filtered.map((eq) => (
                      <TableRow key={eq.id} className="hover:bg-muted/50">
                        <TableCell><Checkbox checked={selected.has(eq.id)} onCheckedChange={() => toggleSelect(eq.id)} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {/* Feature 4: Maintenance indicator */}
                            {getNextMaintenance(eq.id) && (
                              <span title={`Maintenance: ${formatDate(getNextMaintenance(eq.id)!.scheduledDate)}`}><Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" /></span>
                            )}
                            <div>
                              <p className="text-xs font-medium">{eq.name}</p>
                              <p className="text-[10px] text-muted-foreground">{eq.manufacturer} {eq.model}</p>
                              <p className="text-[10px] text-muted-foreground">{eq.vendor?.name || eq.vendorName || "—"} · {eq.stockLocation || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[10px]">{eq.serialNumber || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce ${CONDITION_BADGE[eq.condition]?.cls || ""}`}>
                            {CONDITION_BADGE[eq.condition]?.label || eq.condition}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce ${STATUS_BADGE[eq.status]?.cls || ""}`}>
                            {STATUS_BADGE[eq.status]?.label || eq.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            <p className="font-medium tabular-nums">{formatINR(eq.currentValue || eq.purchasePrice)}</p>
                            <p className="text-[10px] text-muted-foreground">of {formatINR(eq.purchasePrice)} · {eq.depreciationRate || 20}%/yr</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce ${WARRANTY_BADGE[eq.warrantyStatus]?.cls || ""}`}>
                            {WARRANTY_BADGE[eq.warrantyStatus]?.label || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {eq.vendor?.name || eq.vendorName || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {eq.status === "IN_STOCK" && (
                              <Button variant="ghost" size="sm" onClick={() => deployMutation.mutate(eq.id)} title="Deploy"><PackageOpen className="h-4 w-4 text-teal-500" /></Button>
                            )}
                            {eq.status === "DEPLOYED" && (
                              <Button variant="ghost" size="sm" onClick={() => returnMutation.mutate(eq.id)} title="Return"><RotateCcw className="h-4 w-4 text-yellow-500" /></Button>
                            )}
                            {/* Feature 4: Schedule maintenance (only for IN_STOCK) */}
                            {eq.status === "IN_STOCK" && (
                              <Button variant="ghost" size="sm" onClick={() => { setMaintenanceForm({ scheduledDate: "", scheduledTime: "", expectedDuration: "1h", description: "" }); setMaintenanceDialogId(eq.id); }} title="Schedule Maintenance"><CalendarClock className="h-4 w-4 text-amber-500" /></Button>
                            )}
                            {/* Feature 3: Barcode button */}
                            <Button variant="ghost" size="sm" onClick={() => setBarcodeDialogId(eq.id)} title="Barcode"><ScanLine className="h-4 w-4 text-gray-500" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => { setTransferDialogId(eq.id); }} title="Transfer"><ArrowRightLeft className="h-4 w-4 text-purple-500" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(eq.id)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteId(eq.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>

        {/* ── Vendors Tab ── */}
        <TabsContent value="vendors" className="space-y-4">
          <Card className="border shadow-sm"><CardContent className="p-0">
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Vendor</TableHead>
                  <TableHead className="text-xs">Contact</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">Rating</TableHead>
                  <TableHead className="text-xs">Equipment</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {vendors.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No vendors added yet</TableCell></TableRow>
                  ) : (
                    vendors.map((v) => (
                      <TableRow key={v.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{v.name}</p>
                            {v.gstin && <p className="text-[10px] text-muted-foreground">GSTIN: {v.gstin}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs">{v.contactPerson || "—"}</p>
                          {v.phone && <p className="text-[10px] text-muted-foreground"><Phone className="h-2.5 w-2.5 inline mr-1" />{v.phone}</p>}
                          {v.email && <p className="text-[10px] text-muted-foreground"><Mail className="h-2.5 w-2.5 inline mr-1" />{v.email}</p>}
                        </TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{v.category}</Badge></TableCell>
                        <TableCell><div className="flex gap-0.5">{renderStars(v.rating)}</div></TableCell>
                        <TableCell className="text-xs font-medium">{v._count?.equipment || 0}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditVendor(v)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteVendorId(v.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>

        {/* ── Transfers Tab ── */}
        <TabsContent value="transfers" className="space-y-4">
          <Card className="border shadow-sm"><CardContent className="p-0">
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Equipment</TableHead>
                  <TableHead className="text-xs">From</TableHead>
                  <TableHead className="text-xs">To</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {transfers.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No transfer requests</TableCell></TableRow>
                  ) : (
                    transfers.map((t) => (
                      <TableRow key={t.id} className="hover:bg-muted/50">
                        <TableCell>
                          <p className="text-xs font-medium">{t.equipment?.name || "—"}</p>
                          <p className="text-[10px] text-muted-foreground">{t.equipment?.serialNumber || ""}</p>
                        </TableCell>
                        <TableCell className="text-xs">{t.fromLocation}</TableCell>
                        <TableCell className="text-xs font-medium">{t.toLocation}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${TRANSFER_STATUS[t.status]?.cls || ""}`}>{TRANSFER_STATUS[t.status]?.label || t.status}</Badge></TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{new Date(t.createdAt).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell className="text-right">
                          {t.status === "PENDING" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-green-600" onClick={() => approveTransferMutation.mutate(t.id)}>
                              <CheckSquare className="h-3 w-3 mr-1" />Approve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>

        {/* ── Feature 2: Activity / Audit Trail Tab ── */}
        <TabsContent value="activity" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-foreground" />
                Equipment Activity History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="space-y-3 py-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="skeleton-wave h-3 w-3 rounded-full mt-1.5 flex-shrink-0" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="skeleton-wave h-4 w-48" />
                        <Skeleton className="skeleton-wave h-3 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No activity recorded yet.
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-1">
                    {auditLogs.map((log, idx) => {
                      let detailsStr = "";
                      try {
                        const parsed = JSON.parse(log.details || "{}");
                        detailsStr = parsed.name || parsed.description || parsed.summary || log.details || "";
                      } catch {
                        detailsStr = log.details || "";
                      }
                      const isLast = idx === auditLogs.length - 1;
                      return (
                        <div key={log.id} className="flex gap-3 relative">
                          {/* Timeline line */}
                          {!isLast && (
                            <div className="absolute left-[5px] top-4 bottom-0 w-px bg-border" />
                          )}
                          {/* Action dot */}
                          <div className={`flex-shrink-0 h-3 w-3 rounded-full mt-1.5 relative z-10 ${getActionDotColor(log.action)}`} />
                          {/* Content */}
                          <div className="flex-1 min-w-0 pb-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted">
                                {log.action}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatDateTime(log.timestamp)}</span>
                              {log.user?.name && (
                                <span className="text-[10px] text-muted-foreground">by {log.user.name}</span>
                              )}
                            </div>
                            {detailsStr && (
                              <p className="text-xs text-foreground mt-1 truncate">{String(detailsStr)}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Entity ID: {log.entityId ? String(log.entityId).substring(0, 8) + "..." : "N/A"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Create/Edit Equipment Dialog ──────────────── */}
      <Dialog open={showCreate || !!editId} onOpenChange={(open) => { if (!open) { setShowCreate(false); closeEdit(); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-red-500" />{editId ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
            <DialogDescription>{editId ? "Update equipment details" : "Add new equipment to inventory"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Equipment Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., TP-Link Archer C6" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-2"><Label>Condition</Label>
                <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></div>
              <div className="space-y-2"><Label>Model</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Serial Number</Label><Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></div>
              <div className="space-y-2"><Label>MAC Address</Label><Input value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} /></div>
            </div>
            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Purchase & Depreciation</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Purchase Price (₹)</Label><Input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} placeholder="0" min="0" /></div>
              <div className="space-y-2"><Label>Purchase Date</Label><Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Depreciation Rate (%/yr)</Label><Input type="number" value={form.depreciationRate} onChange={(e) => setForm({ ...form, depreciationRate: e.target.value })} placeholder="20" min="0" /></div>
              <div className="space-y-2"><Label>Warranty Expiry</Label><Input type="date" value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} /></div>
            </div>
            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location & Vendor</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Vendor</Label>
                <Select value={form.vendorId} onValueChange={(v) => { setForm({ ...form, vendorId: v }); const vendor = vendors.find((vd) => vd.id === v); if (vendor) setForm((prev) => ({ ...prev, vendorName: vendor.name })); }}>
                  <SelectTrigger><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">None</SelectItem>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Stock Location</Label><Input value={form.stockLocation} onChange={(e) => setForm({ ...form, stockLocation: e.target.value })} placeholder="e.g., Warehouse A" /></div>
            </div>
            {/* Feature 4: Show maintenance info in edit dialog */}
            {editId && getMaintenanceForEquipment(editId).length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />Scheduled Maintenance
                  </p>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {getMaintenanceForEquipment(editId).map((m) => (
                      <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200">
                        <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{formatDate(m.scheduledDate)} at {m.scheduledTime}</p>
                          <p className="text-[10px] text-muted-foreground">{m.expectedDuration} duration{m.description ? ` — ${m.description}` : ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {(form.purchasePrice && form.purchaseDate && form.depreciationRate) && (() => {
              const price = parseFloat(form.purchasePrice) || 0;
              const date = new Date(form.purchaseDate);
              const rate = parseFloat(form.depreciationRate) || 20;
              const years = (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
              const cv = Math.max(0, price - price * (rate / 100) * years);
              return (
                <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200">
                  <div className="flex items-center gap-2 text-xs font-medium text-orange-700"><TrendingDown className="h-3.5 w-3.5" />Estimated Current Value</div>
                  <p className="text-lg font-bold text-orange-600 mt-1">{formatINR(Math.round(cv * 100) / 100)}</p>
                  <p className="text-[10px] text-muted-foreground">Age: {Math.max(0, years).toFixed(1)} years · Depreciation: {formatINR(Math.round((price - cv) * 100) / 100)}</p>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); closeEdit(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editId ? "Update" : "Add Equipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Transfer Dialog ─────────────────────── */}
      <Dialog open={!!transferDialogId} onOpenChange={(open) => { if (!open) setTransferDialogId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-purple-600" />Transfer Equipment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Destination Location *</Label>
              <Input value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="e.g., Warehouse B, Site 2" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} placeholder="Reason for transfer" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogId(null)}>Cancel</Button>
            <Button onClick={() => transferDialogId && transferMutation.mutate({ equipmentId: transferDialogId, toLocation: transferTo, notes: transferNotes })} disabled={!transferTo || transferMutation.isPending} className="bg-purple-600 hover:bg-purple-700 text-white">
              {transferMutation.isPending ? "Creating..." : "Create Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Feature 3: Barcode Dialog ──────────────────── */}
      <Dialog open={!!barcodeDialogId} onOpenChange={(open) => { if (!open) setBarcodeDialogId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5" />Equipment Barcode</DialogTitle>
            <DialogDescription>Scan or print this barcode label for the equipment item.</DialogDescription>
          </DialogHeader>
          {(() => {
            const eq = equipment.find((e) => e.id === barcodeDialogId);
            if (!eq) return null;
            return (
              <div className="space-y-4" ref={barcodePrintRef}>
                <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-lg border">
                  <p className="text-sm font-bold text-black">{eq.name}</p>
                  <BarcodeDisplay serialNumber={eq.serialNumber || "NO-SERIAL"} />
                  <p className="text-xs text-gray-600">{getCategoryLabel(eq.category)}</p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBarcodeDialogId(null)}>Close</Button>
            <Button variant="outline" onClick={() => {
              const eq = equipment.find((e) => e.id === barcodeDialogId);
              if (eq) handlePrintBarcode(eq);
            }}>
              <Printer className="h-4 w-4 mr-2" />Print Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Feature 4: Maintenance Scheduling Dialog ──── */}
      <Dialog open={!!maintenanceDialogId} onOpenChange={(open) => { if (!open) { setMaintenanceDialogId(null); setMaintenanceForm({ scheduledDate: "", scheduledTime: "", expectedDuration: "1h", description: "" }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-amber-500" />Schedule Maintenance</DialogTitle>
            <DialogDescription>Plan a maintenance session for this equipment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={maintenanceForm.scheduledDate} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, scheduledDate: e.target.value })} min={new Date().toISOString().split("T")[0]} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={maintenanceForm.scheduledTime} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, scheduledTime: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Expected Duration</Label>
              <Select value={maintenanceForm.expectedDuration} onValueChange={(v) => setMaintenanceForm({ ...maintenanceForm, expectedDuration: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30m">30 minutes</SelectItem>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="2h">2 hours</SelectItem>
                  <SelectItem value="4h">4 hours</SelectItem>
                  <SelectItem value="8h">Full day</SelectItem>
                  <SelectItem value="multi">Multiple days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={maintenanceForm.description} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} placeholder="e.g., Annual inspection, firmware update, cleaning..." rows={3} />
            </div>
            {/* Show existing maintenance for this equipment */}
            {maintenanceDialogId && getMaintenanceForEquipment(maintenanceDialogId).length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Existing Scheduled Maintenance</Label>
                <div className="space-y-1.5 max-h-24 overflow-y-auto">
                  {getMaintenanceForEquipment(maintenanceDialogId).map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted">
                      <Clock className="h-3 w-3 text-amber-500" />
                      <span>{formatDate(m.scheduledDate)} {m.scheduledTime} — {m.expectedDuration}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMaintenanceDialogId(null); setMaintenanceForm({ scheduledDate: "", scheduledTime: "", expectedDuration: "1h", description: "" }); }}>Cancel</Button>
            <Button onClick={handleScheduleMaintenance} disabled={!maintenanceForm.scheduledDate} className="bg-amber-600 hover:bg-amber-700 text-white">
              <CalendarClock className="h-4 w-4 mr-2" />Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Equipment Confirmation ─────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader>
          <AlertDialogTitle>Delete Equipment</AlertDialogTitle>
          <AlertDialogDescription>Are you sure? Deployed equipment cannot be deleted.</AlertDialogDescription>
        </AlertDialogHeader><AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
        </AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Vendor Confirmation ─────────── */}
      <AlertDialog open={!!deleteVendorId} onOpenChange={() => setDeleteVendorId(null)}>
        <AlertDialogContent><AlertDialogHeader>
          <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
          <AlertDialogDescription>This will remove the vendor. Equipment linked to this vendor will keep their vendor name.</AlertDialogDescription>
        </AlertDialogHeader><AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => deleteVendorId && vendorDeleteMutation.mutate(deleteVendorId)} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
        </AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
