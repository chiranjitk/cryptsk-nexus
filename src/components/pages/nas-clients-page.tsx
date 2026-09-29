"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Server, Plus, Search, MoreHorizontal, Pencil, Trash2, Lock, Eye, EyeOff,
  CheckCircle2, XCircle, Activity, Wifi, Shield, Zap, RefreshCw, Copy,
  Radio, Network, ChevronDown, ChevronRight, Globe, Loader2, CircleDot,
  KeyRound, Settings2, X, Info, MonitorSmartphone,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import PageHeader from "@/components/page-header";
import { useModuleStore } from "@/store/module-store";
import EmptyState from "@/components/ui/empty-state";

// ─── Types ────────────────────────────────────────────────────────────────
interface NasClient {
  id: number;
  nasname: string;
  shortname: string;
  type: string;
  ports: number;
  secret: string;
  server: string | null;
  community: string | null;
  description: string | null;
  vendor: string | null;
  coaEnabled: boolean;
  status: string;
  areaId: number | null;
  activeSessions: number;
  isDefault: boolean;
  isReadOnly: boolean;
}

interface NasStats {
  total: number;
  active: number;
  inactive: number;
}

interface VendorSummary {
  id: string;
  name: string;
  type: string;
  description: string;
  authProtocols: string[];
  defaultPorts: number;
  coaSupport: boolean;
  attributeCount: number;
}

interface VendorDetail {
  id: string;
  name: string;
  coaSupport: boolean;
  description?: string;
  authProtocols?: string[];
  attributes?: VendorAttribute[];
}

interface VendorAttribute {
  name: string;
  type: string;
  dataType: string;
  description: string;
}

interface NasFormData {
  nasname: string;
  shortname: string;
  description: string;
  vendor: string;
  secret: string;
  confirmSecret: string;
  coaEnabled: boolean;
  coaPort: number;
  type: string;
  ports: number;
  status: string;
  server: string;
  community: string;
  authProtocols: string[];
}

interface TestResult {
  success: boolean;
  latency?: number;
  message: string;
}

// ─── Constants ────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; dot: string; badgeClass: string }> = {
  active: { label: "Active", dot: "bg-green-500", badgeClass: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" },
  inactive: { label: "Inactive", dot: "bg-gray-400", badgeClass: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700" },
  unknown: { label: "Unknown", dot: "bg-gray-400", badgeClass: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700" },
};

const ALL_AUTH_PROTOCOLS = ["PAP", "CHAP", "MS-CHAPv2", "EAP-MD5", "EAP-TLS", "EAP-TTLS", "EAP-PEAP"];

const NAS_TYPES = [
  { value: "other", label: "Other" },
  { value: "auth", label: "Authentication" },
  { value: "acct", label: "Accounting" },
];

const VENDOR_ICON_MAP: Record<string, string> = {
  mikrotik: "MikroTik",
  cisco: "Cisco",
  huawei: "Huawei",
  juniper: "Juniper",
  arista: "Arista",
  fortinet: "Fortinet",
  ubiquiti: "Ubiquiti",
  linux: "Linux",
  windows: "Windows",
  cambium: "Cambium",
  tplink: "TP-Link",
};

function getVendorDisplayName(vendor: string | null): string {
  if (!vendor) return "Unknown";
  return VENDOR_ICON_MAP[vendor.toLowerCase()] || vendor.charAt(0).toUpperCase() + vendor.slice(1);
}

const emptyForm: NasFormData = {
  nasname: "",
  shortname: "",
  description: "",
  vendor: "",
  secret: "",
  confirmSecret: "",
  coaEnabled: false,
  coaPort: 3799,
  type: "other",
  ports: 0,
  status: "active",
  server: "",
  community: "",
  authProtocols: [],
};

// ─── Helper: Generate random secret ──────────────────────────────────────
function generateSecret(length = 24): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── Component ────────────────────────────────────────────────────────────
export default function NasClientsPage() {
  const { isModuleEnabled } = useModuleStore();
  const queryClient = useQueryClient();

  // ─── State ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedNas, setSelectedNas] = useState<NasClient | null>(null);

  // Form state
  const [form, setForm] = useState<NasFormData>({ ...emptyForm });
  const [formStep, setFormStep] = useState(0); // 0: Basic, 1: Auth, 2: Advanced
  const [showSecret, setShowSecret] = useState(false);
  const [showConfirmSecret, setShowConfirmSecret] = useState(false);
  const [vendorPanelOpen, setVendorPanelOpen] = useState(false);

  // Connection test state
  const [testingId, setTestingId] = useState<number | null>(null);

  // Table secret visibility
  const [visibleSecrets, setVisibleSecrets] = useState<Set<number>>(new Set());

  // ─── Queries ───────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<{
    success: boolean;
    data: NasClient[];
    stats: NasStats;
  }>({
    queryKey: ["nas-clients"],
    queryFn: () => apiFetch("/api/nas-clients"),
    refetchInterval: 30000,
  });

  const { data: vendorsData } = useQuery<{
    success: boolean;
    data: { vendors: VendorSummary[]; total: number };
  }>({
    queryKey: ["nas-vendors"],
    queryFn: () => apiFetch("/api/nas-clients/vendors"),
    staleTime: 120_000,
  });

  const selectedVendorId = form.vendor;
  const { data: vendorDetail } = useQuery<VendorDetail>({
    queryKey: ["nas-vendor-detail", selectedVendorId],
    queryFn: () => apiFetch<VendorDetail>(`/api/nas-clients/vendors?vendor=${selectedVendorId}`),
    enabled: !!selectedVendorId && (addOpen || editOpen),
    staleTime: 120_000,
  });

  // ─── Derived data ──────────────────────────────────────────────────────
  const nasClients = data?.data ?? [];
  const stats = data?.stats ?? { total: 0, active: 0, inactive: 0 };
  const vendors = vendorsData?.data?.vendors ?? [];

  const totalSessions = nasClients.reduce((sum, n) => sum + (n.activeSessions || 0), 0);

  // Filter clients
  const filteredClients = nasClients.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.nasname.toLowerCase().includes(q) &&
        !c.shortname.toLowerCase().includes(q) &&
        !(c.description || "").toLowerCase().includes(q)
      ) return false;
    }
    if (vendorFilter && c.vendor?.toLowerCase() !== vendorFilter.toLowerCase()) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  const hasActiveFilters = search || vendorFilter || statusFilter;

  // ─── Mutations ─────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/nas-clients", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res: any) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("NAS client added successfully");
      setAddOpen(false);
      setForm({ ...emptyForm });
      setFormStep(0);
      queryClient.invalidateQueries({ queryKey: ["nas-clients"] });
    },
    onError: () => toast.error("Failed to add NAS client"),
  });

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/nas-clients", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (res: any) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("NAS client updated successfully");
      setEditOpen(false);
      setSelectedNas(null);
      queryClient.invalidateQueries({ queryKey: ["nas-clients"] });
    },
    onError: () => toast.error("Failed to update NAS client"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/nas-clients?id=${id}`, { method: "DELETE" }),
    onSuccess: (res: any) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("NAS client deleted");
      setDeleteOpen(false);
      setSelectedNas(null);
      queryClient.invalidateQueries({ queryKey: ["nas-clients"] });
    },
    onError: () => toast.error("Failed to delete NAS client"),
  });

  const testMutation = useMutation({
    mutationFn: ({ nasId }: { nasId: number }) =>
      apiFetch<TestResult>("/api/nas-clients/test-connection", {
        method: "POST",
        body: JSON.stringify({ nasId }),
      }),
    onMutate: (vars) => { setTestingId(vars.nasId); },
    onSettled: () => { setTestingId(null); },
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`${res.message} (${res.latency}ms)`);
      } else {
        toast.error(res.message || "Connection test failed");
      }
    },
    onError: () => toast.error("Connection test failed"),
  });

  // ─── Handlers ──────────────────────────────────────────────────────────
  const updateForm = useCallback(
    <K extends keyof NasFormData>(key: K, value: NasFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const openAddDialog = () => {
    setForm({ ...emptyForm, secret: generateSecret(), confirmSecret: "" });
    setFormStep(0);
    setShowSecret(false);
    setShowConfirmSecret(false);
    setVendorPanelOpen(false);
    setAddOpen(true);
  };

  const openEditDialog = (nas: NasClient) => {
    setSelectedNas(nas);
    setForm({
      nasname: nas.nasname,
      shortname: nas.shortname,
      description: nas.description || "",
      vendor: nas.vendor || "",
      secret: nas.secret,
      confirmSecret: "",
      coaEnabled: nas.coaEnabled,
      coaPort: 3799,
      type: nas.type || "other",
      ports: nas.ports || 0,
      status: nas.status || "active",
      server: nas.server || "",
      community: nas.community || "",
      authProtocols: [],
    });
    setFormStep(0);
    setShowSecret(false);
    setShowConfirmSecret(false);
    setVendorPanelOpen(false);
    setEditOpen(true);
  };

  const openDeleteDialog = (nas: NasClient) => {
    setSelectedNas(nas);
    setDeleteOpen(true);
  };

  const handleVendorChange = (vendorId: string) => {
    const vendor = vendors.find((v) => v.id === vendorId);
    setForm((prev) => ({
      ...prev,
      vendor: vendorId,
      description: prev.description || vendor?.description || "",
      coaEnabled: vendor?.coaSupport ?? prev.coaEnabled,
      authProtocols: vendor?.authProtocols || prev.authProtocols,
    }));
    if (vendor) setVendorPanelOpen(true);
  };

  const handleTestConnection = (nasId: number) => {
    testMutation.mutate({ nasId });
  };

  const toggleSecretVisibility = (id: number) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maskSecret = (secret: string) => "••••••••••••";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Failed to copy")
    );
  };

  // ─── Form validation & submit ──────────────────────────────────────────
  const validateForm = (): boolean => {
    if (!form.nasname.trim()) { toast.error("NAS IP address is required"); setFormStep(0); return false; }
    if (!form.shortname.trim()) { toast.error("Short name is required"); setFormStep(0); return false; }
    if (!form.secret.trim()) { toast.error("Shared secret is required"); setFormStep(1); return false; }
    if (form.secret !== form.confirmSecret) { toast.error("Shared secret and confirmation do not match"); setFormStep(1); return false; }
    if (form.secret.length < 8) { toast.error("Shared secret must be at least 8 characters"); setFormStep(1); return false; }
    return true;
  };

  const handleCreate = () => {
    if (!validateForm()) return;
    const body: Record<string, unknown> = {
      nasname: form.nasname.trim(),
      shortname: form.shortname.trim(),
      secret: form.secret,
      type: form.type,
      vendor: form.vendor || undefined,
      description: form.description || undefined,
      coaEnabled: form.coaEnabled,
      status: form.status,
      ports: form.ports || undefined,
    };
    if (form.server) body.server = form.server;
    if (form.community) body.community = form.community;
    createMutation.mutate(body);
  };

  const handleUpdate = () => {
    if (!selectedNas) return;
    if (!validateForm()) return;
    const body: Record<string, unknown> = {
      id: selectedNas.id,
      nasname: form.nasname.trim(),
      shortname: form.shortname.trim(),
      type: form.type,
      vendor: form.vendor || undefined,
      description: form.description || undefined,
      coaEnabled: form.coaEnabled,
      status: form.status,
      ports: form.ports || undefined,
    };
    // Only send secret if changed
    if (form.secret && form.secret !== selectedNas.secret) {
      body.secret = form.secret;
    }
    if (form.server) body.server = form.server;
    if (form.community) body.community = form.community;
    updateMutation.mutate(body);
  };

  const clearFilters = () => {
    setSearch("");
    setVendorFilter("");
    setStatusFilter("");
  };

  // ─── Loading skeleton ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="skeleton-wave h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="skeleton-wave h-7 w-40" />
            <Skeleton className="skeleton-wave h-4 w-72" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="skeleton-wave h-10 w-full rounded-lg" />
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full mb-2 rounded" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6">
        {/* ─── Page Header ──────────────────────────────────────────── */}
        <PageHeader
          icon={Server}
          title="NAS Clients"
          description="Manage network access servers for RADIUS authentication — gateway and external NAS devices"
          badge={{ text: `${stats.total}`, variant: "secondary" }}
          actions={
            <Button
              onClick={openAddDialog}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add NAS Client
            </Button>
          }
        />

        {/* ─── Stats Cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-card-enter" style={{ animationDelay: "50ms" }}>
          {/* Total NAS Clients */}
          <Card className="stat-gradient-red border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 rounded-xl">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                  <Server className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider opacity-80">
                    Total NAS
                  </p>
                  <p className="text-base sm:text-xl font-bold tabular-nums leading-tight mt-0.5">
                    {stats.total}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active */}
          <Card className="stat-gradient-emerald border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 rounded-xl">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                  <CircleDot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider opacity-80">
                    Active
                  </p>
                  <p className="text-base sm:text-xl font-bold tabular-nums leading-tight mt-0.5">
                    {stats.active}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inactive */}
          <Card className="stat-gradient-slate border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 rounded-xl">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                  <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider opacity-80">
                    Inactive
                  </p>
                  <p className="text-base sm:text-xl font-bold tabular-nums leading-tight mt-0.5">
                    {stats.inactive}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Sessions */}
          <Card className="stat-gradient-teal border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 rounded-xl">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                  <Wifi className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider opacity-80">
                    Active Sessions
                  </p>
                  <p className="text-base sm:text-xl font-bold tabular-nums leading-tight mt-0.5">
                    {totalSessions}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Filter Bar ───────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center animate-card-enter" style={{ animationDelay: "100ms" }}>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by IP, shortname, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={vendorFilter} onValueChange={(v) => setVendorFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="All Vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-9 w-full sm:w-36">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground">
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          )}
        </div>

        {/* ─── NAS Clients Table ────────────────────────────────────── */}
        {filteredClients.length === 0 && !hasActiveFilters ? (
          <EmptyState
            icon={MonitorSmartphone}
            title="No NAS clients configured"
            description="Add your first network access server (MikroTik, Cisco, Huawei, etc.) to enable RADIUS authentication."
            action={{
              label: "Add NAS Client",
              icon: Plus,
              onClick: openAddDialog,
            }}
            size="lg"
            className="animate-card-enter"
          />
        ) : filteredClients.length === 0 && hasActiveFilters ? (
          <EmptyState
            icon={Search}
            title="No matching NAS clients"
            description="Try adjusting your search or filter criteria."
            action={{
              label: "Clear Filters",
              icon: X,
              onClick: clearFilters,
            }}
            size="md"
            className="animate-card-enter"
          />
        ) : (
          <Card className="border shadow-sm animate-card-enter" style={{ animationDelay: "150ms" }}>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">IP Address</TableHead>
                      <TableHead className="text-xs">Short Name</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Vendor</TableHead>
                      <TableHead className="text-xs">Shared Secret</TableHead>
                      <TableHead className="text-xs text-center">CoA</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-center hidden md:table-cell">Sessions</TableHead>
                      <TableHead className="text-xs hidden xl:table-cell">Auth Protocols</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((nas) => {
                      const statusInfo = STATUS_MAP[nas.status] || STATUS_MAP.unknown;
                      const isDefault = nas.isDefault || nas.isReadOnly;
                      const isTesting = testingId === nas.id;
                      const secretVisible = visibleSecrets.has(nas.id);

                      return (
                        <TableRow
                          key={nas.id}
                          className={
                            isDefault
                              ? "bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50/80 dark:hover:bg-amber-950/30"
                              : ""
                          }
                        >
                          {/* IP Address */}
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-semibold">
                                    {nas.nasname}
                                  </span>
                                  {isDefault && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1.5 py-0 border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 gap-0.5"
                                        >
                                          <Lock className="h-2.5 w-2.5" />
                                          Gateway
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs">
                                        Built-in gateway NAS (read-only)
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                                {nas.description && !isDefault && (
                                  <p className="text-[10px] text-muted-foreground truncate max-w-[180px] mt-0.5">
                                    {nas.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Short Name */}
                          <TableCell>
                            <span className="text-xs font-medium">{nas.shortname}</span>
                          </TableCell>

                          {/* Vendor */}
                          <TableCell className="hidden lg:table-cell">
                            {nas.vendor ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50"
                              >
                                <Radio className="h-2.5 w-2.5 mr-1" />
                                {getVendorDisplayName(nas.vendor)}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Shared Secret */}
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <code className="text-[10px] font-mono text-muted-foreground select-all">
                                {secretVisible ? nas.secret : maskSecret(nas.secret)}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                onClick={() => toggleSecretVisibility(nas.id)}
                              >
                                {secretVisible ? (
                                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-3 w-3 text-muted-foreground" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                onClick={() => copyToClipboard(nas.secret, "Secret")}
                              >
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>

                          {/* CoA */}
                          <TableCell className="text-center">
                            {nas.coaEnabled ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                                </TooltipTrigger>
                                <TooltipContent>Change of Authorization enabled</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <XCircle className="h-4 w-4 text-gray-400 mx-auto" />
                                </TooltipTrigger>
                                <TooltipContent>CoA not enabled</TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] flex items-center gap-1 w-fit ${statusInfo.badgeClass}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
                              {statusInfo.label}
                            </Badge>
                          </TableCell>

                          {/* Active Sessions */}
                          <TableCell className="text-center hidden md:table-cell">
                            <div className="flex items-center justify-center gap-1">
                              {(nas.activeSessions || 0) > 0 && (
                                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                              )}
                              <span className="text-xs font-medium tabular-nums">
                                {nas.activeSessions || 0}
                              </span>
                            </div>
                          </TableCell>

                          {/* Auth Protocols */}
                          <TableCell className="hidden xl:table-cell">
                            {nas.vendor && (() => {
                              const v = vendors.find((vendor) => vendor.id === nas.vendor?.toLowerCase());
                              if (v?.authProtocols && v.authProtocols.length > 0) {
                                return (
                                  <div className="flex flex-wrap gap-1">
                                    {v.authProtocols.slice(0, 3).map((proto) => (
                                      <Badge
                                        key={proto}
                                        variant="secondary"
                                        className="text-[9px] px-1.5 py-0"
                                      >
                                        {proto}
                                      </Badge>
                                    ))}
                                    {v.authProtocols.length > 3 && (
                                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                        +{v.authProtocols.length - 3}
                                      </Badge>
                                    )}
                                  </div>
                                );
                              }
                              return <span className="text-xs text-muted-foreground">—</span>;
                            })()}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Test Connection button */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={isTesting || (isDefault && nas.isReadOnly)}
                                    onClick={() => handleTestConnection(nas.id)}
                                  >
                                    {isTesting ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                                    ) : (
                                      <Activity className="h-3.5 w-3.5 text-emerald-600" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Test Connectivity</TooltipContent>
                              </Tooltip>

                              {/* More actions dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={isDefault && nas.isReadOnly}
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => openEditDialog(nas)}
                                    disabled={isDefault && nas.isReadOnly}
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                    {isDefault && nas.isReadOnly && (
                                      <Lock className="h-3 w-3 ml-auto text-muted-foreground" />
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleTestConnection(nas.id)}
                                    disabled={isTesting}
                                  >
                                    {isTesting ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <Activity className="h-4 w-4 mr-2" />
                                    )}
                                    {isTesting ? "Testing..." : "Test Connection"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => openDeleteDialog(nas)}
                                    disabled={isDefault && nas.isReadOnly}
                                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                    {isDefault && nas.isReadOnly && (
                                      <Lock className="h-3 w-3 ml-auto text-muted-foreground" />
                                    )}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Add / Edit Dialog ────────────────────────────────────── */}
        {(addOpen || editOpen) && (
          <Dialog
            open={addOpen || editOpen}
            onOpenChange={(open) => {
              if (!open) {
                setAddOpen(false);
                setEditOpen(false);
                setSelectedNas(null);
                setForm({ ...emptyForm });
                setFormStep(0);
                setVendorPanelOpen(false);
              }
            }}
          >
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {editOpen ? (
                    <>
                      <Pencil className="h-4 w-4 text-red-500" />
                      Edit NAS Client
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 text-red-500" />
                      Add NAS Client
                    </>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {editOpen
                    ? "Update the network access server configuration."
                    : "Configure a new network access server for RADIUS authentication."}
                </DialogDescription>
              </DialogHeader>

              {/* Step tabs */}
              <div className="mb-4">
                <Tabs value={String(formStep)} onValueChange={(v) => setFormStep(Number(v))}>
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="0" className="text-xs">
                      <Globe className="h-3.5 w-3.5 mr-1.5" />
                      Basic Info
                    </TabsTrigger>
                    <TabsTrigger value="1" className="text-xs">
                      <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                      Authentication
                    </TabsTrigger>
                    <TabsTrigger value="2" className="text-xs">
                      <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                      Advanced
                    </TabsTrigger>
                  </TabsList>

                  {/* ─── Step 0: Basic Info ──────────────────────────── */}
                  <TabsContent value="0" className="space-y-4 mt-4">
                    {/* NAS IP Address */}
                    <div className="space-y-2">
                      <Label htmlFor="nasname" className="text-xs font-medium">
                        NAS IP Address <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="nasname"
                        placeholder="192.168.1.1"
                        value={form.nasname}
                        onChange={(e) => updateForm("nasname", e.target.value)}
                        className="font-mono text-sm"
                        disabled={editOpen}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        IP address or hostname of the NAS device
                      </p>
                    </div>

                    {/* Short Name */}
                    <div className="space-y-2">
                      <Label htmlFor="shortname" className="text-xs font-medium">
                        Short Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="shortname"
                        placeholder="e.g. mikrotik-pop1"
                        value={form.shortname}
                        onChange={(e) => updateForm("shortname", e.target.value)}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Friendly identifier for this NAS
                      </p>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <Label htmlFor="nas-desc" className="text-xs font-medium">
                        Description
                      </Label>
                      <Input
                        id="nas-desc"
                        placeholder="Optional description"
                        value={form.description}
                        onChange={(e) => updateForm("description", e.target.value)}
                      />
                    </div>

                    {/* Vendor Selection */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Vendor</Label>
                      <Select
                        value={form.vendor}
                        onValueChange={handleVendorChange}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select vendor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {vendors.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              <div className="flex items-center gap-2">
                                <Radio className="h-3 w-3 text-muted-foreground" />
                                {v.name}
                                {v.coaSupport && (
                                  <Badge variant="secondary" className="text-[8px] px-1 py-0 ml-1">
                                    CoA
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Vendor Info Panel (collapsible) */}
                    {form.vendor && vendorDetail && (
                      <div className="border rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setVendorPanelOpen(!vendorPanelOpen)}
                          className="flex items-center justify-between w-full px-3 py-2 bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Info className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">
                              {vendorDetail.name} — Vendor Info
                            </span>
                          </div>
                          {vendorPanelOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                        {vendorPanelOpen && (
                          <div className="p-3 space-y-3 border-t">
                            {/* Description */}
                            {vendorDetail.description && (
                              <p className="text-xs text-muted-foreground">
                                {vendorDetail.description}
                              </p>
                            )}

                            {/* Auth Protocols */}
                            {vendorDetail.authProtocols && vendorDetail.authProtocols.length > 0 && (
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                                  Supported Auth Protocols
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {vendorDetail.authProtocols.map((proto) => (
                                    <Badge
                                      key={proto}
                                      variant="outline"
                                      className="text-[10px] border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30"
                                    >
                                      <Shield className="h-2.5 w-2.5 mr-0.5" />
                                      {proto}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* CoA Support */}
                            <div className="flex items-center gap-2">
                              {vendorDetail.coaSupport ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-gray-400" />
                              )}
                              <span className="text-xs">
                                Change of Authorization (CoA){" "}
                                {vendorDetail.coaSupport ? "supported" : "not supported"}
                              </span>
                            </div>

                            {/* Vendor-specific RADIUS Attributes */}
                            {vendorDetail.attributes && vendorDetail.attributes.length > 0 && (
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                                  Vendor-Specific RADIUS Attributes ({vendorDetail.attributes.length})
                                </p>
                                <div className="border rounded-md overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-[10px] h-7">Name</TableHead>
                                        <TableHead className="text-[10px] h-7">Type</TableHead>
                                        <TableHead className="text-[10px] h-7 hidden sm:table-cell">Data Type</TableHead>
                                        <TableHead className="text-[10px] h-7 hidden md:table-cell">Description</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {vendorDetail.attributes.map((attr) => (
                                        <TableRow key={attr.name}>
                                          <TableCell className="py-1.5">
                                            <code className="text-[10px] font-mono text-foreground">
                                              {attr.name}
                                            </code>
                                          </TableCell>
                                          <TableCell className="py-1.5">
                                            <Badge
                                              variant="secondary"
                                              className={`text-[9px] px-1 py-0 ${
                                                attr.type === "reply"
                                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                                                  : attr.type === "check"
                                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                                    : ""
                                              }`}
                                            >
                                              {attr.type}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="py-1.5 text-[10px] text-muted-foreground hidden sm:table-cell">
                                            {attr.dataType}
                                          </TableCell>
                                          <TableCell className="py-1.5 text-[10px] text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                                            {attr.description}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                                <p className="text-[9px] text-muted-foreground mt-1">
                                  These attributes are automatically applied based on vendor configuration.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  {/* ─── Step 1: Authentication ─────────────────────── */}
                  <TabsContent value="1" className="space-y-4 mt-4">
                    {/* Shared Secret */}
                    <div className="space-y-2">
                      <Label htmlFor="secret" className="text-xs font-medium">
                        Shared Secret <span className="text-red-500">*</span>
                      </Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            id="secret"
                            type={showSecret ? "text" : "password"}
                            placeholder="Enter shared secret"
                            value={form.secret}
                            onChange={(e) => updateForm("secret", e.target.value)}
                            className="font-mono text-sm pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                            onClick={() => setShowSecret(!showSecret)}
                          >
                            {showSecret ? (
                              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            const newSecret = generateSecret();
                            updateForm("secret", newSecret);
                            updateForm("confirmSecret", "");
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                          Generate
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Must match the secret configured on the NAS device (min 8 characters)
                      </p>
                    </div>

                    {/* Confirm Secret */}
                    <div className="space-y-2">
                      <Label htmlFor="confirmSecret" className="text-xs font-medium">
                        Confirm Secret <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="confirmSecret"
                          type={showConfirmSecret ? "text" : "password"}
                          placeholder="Re-enter shared secret"
                          value={form.confirmSecret}
                          onChange={(e) => updateForm("confirmSecret", e.target.value)}
                          className={`font-mono text-sm pr-10 ${
                            form.confirmSecret && form.confirmSecret !== form.secret
                              ? "border-red-500 focus-visible:ring-red-500"
                              : form.confirmSecret && form.confirmSecret === form.secret
                                ? "border-green-500 focus-visible:ring-green-500"
                                : ""
                          }`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={() => setShowConfirmSecret(!showConfirmSecret)}
                        >
                          {showConfirmSecret ? (
                            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                      {form.confirmSecret && form.confirmSecret !== form.secret && (
                        <p className="text-[10px] text-red-500 flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          Secrets do not match
                        </p>
                      )}
                      {form.confirmSecret && form.confirmSecret === form.secret && (
                        <p className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Secrets match
                        </p>
                      )}
                    </div>

                    <Separator />

                    {/* Auth Protocol Checkboxes */}
                    <div className="space-y-3">
                      <Label className="text-xs font-medium">Authentication Protocols</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Select protocols supported by this NAS. Auto-populated from vendor settings.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {ALL_AUTH_PROTOCOLS.map((proto) => {
                          const checked = form.authProtocols.includes(proto);
                          return (
                            <div
                              key={proto}
                              className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                                checked
                                  ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                                  : "border-border hover:bg-muted/50"
                              }`}
                              onClick={() => {
                                const updated = checked
                                  ? form.authProtocols.filter((p) => p !== proto)
                                  : [...form.authProtocols, proto];
                                updateForm("authProtocols", updated);
                              }}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => {
                                  const updated = checked
                                    ? form.authProtocols.filter((p) => p !== proto)
                                    : [...form.authProtocols, proto];
                                  updateForm("authProtocols", updated);
                                }}
                                className="sr-only"
                              />
                              <div
                                className={`h-3.5 w-3.5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                                  checked
                                    ? "bg-red-600 border-red-600"
                                    : "border-gray-300 dark:border-gray-600"
                                }`}
                              >
                                {checked && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                              </div>
                              <span className="text-[11px] font-medium">{proto}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </TabsContent>

                  {/* ─── Step 2: Advanced Settings ──────────────────── */}
                  <TabsContent value="2" className="space-y-4 mt-4">
                    {/* Type */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">NAS Type</Label>
                      <Select value={form.type} onValueChange={(v) => updateForm("type", v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NAS_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Ports */}
                    <div className="space-y-2">
                      <Label htmlFor="ports" className="text-xs font-medium">
                        Ports
                      </Label>
                      <Input
                        id="ports"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={form.ports}
                        onChange={(e) => updateForm("ports", parseInt(e.target.value) || 0)}
                        className="w-32"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Number of concurrent ports/sessions (0 = unlimited)
                      </p>
                    </div>

                    <Separator />

                    {/* CoA Enabled */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-medium">
                          Change of Authorization (CoA)
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                          Allow dynamic session modification
                        </p>
                      </div>
                      <Switch
                        checked={form.coaEnabled}
                        onCheckedChange={(checked) => updateForm("coaEnabled", checked)}
                      />
                    </div>

                    {/* CoA Port */}
                    {form.coaEnabled && (
                      <div className="space-y-2 pl-2 border-l-2 border-emerald-300 dark:border-emerald-700">
                        <Label htmlFor="coa-port" className="text-xs font-medium">
                          CoA Port
                        </Label>
                        <Input
                          id="coa-port"
                          type="number"
                          min={1}
                          max={65535}
                          value={form.coaPort}
                          onChange={(e) => updateForm("coaPort", parseInt(e.target.value) || 3799)}
                          className="w-32 font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Default: 3799 (RFC 5176)
                        </p>
                      </div>
                    )}

                    <Separator />

                    {/* Status */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Status</Label>
                      <Select value={form.status} onValueChange={(v) => updateForm("status", v)}>
                        <SelectTrigger className="h-9 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">
                            <span className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                              Active
                            </span>
                          </SelectItem>
                          <SelectItem value="inactive">
                            <span className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                              Inactive
                            </span>
                          </SelectItem>
                          <SelectItem value="unknown">
                            <span className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                              Unknown
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    {/* Server override */}
                    <div className="space-y-2">
                      <Label htmlFor="nas-server" className="text-xs font-medium">
                        Server Override
                      </Label>
                      <Input
                        id="nas-server"
                        placeholder="Optional: override RADIUS server address"
                        value={form.server}
                        onChange={(e) => updateForm("server", e.target.value)}
                        className="font-mono text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Override the default RADIUS server for this NAS
                      </p>
                    </div>

                    {/* Community String */}
                    <div className="space-y-2">
                      <Label htmlFor="nas-community" className="text-xs font-medium">
                        SNMP Community String
                      </Label>
                      <Input
                        id="nas-community"
                        placeholder="Optional: SNMP community for monitoring"
                        value={form.community}
                        onChange={(e) => updateForm("community", e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Dialog Footer */}
              <DialogFooter className="flex-row gap-2 sm:gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddOpen(false);
                    setEditOpen(false);
                    setSelectedNas(null);
                    setForm({ ...emptyForm });
                    setFormStep(0);
                    setVendorPanelOpen(false);
                  }}
                >
                  Cancel
                </Button>
                {formStep > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setFormStep(formStep - 1)}
                  >
                    Back
                  </Button>
                )}
                {formStep < 2 ? (
                  <Button
                    onClick={() => setFormStep(formStep + 1)}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Next
                  </Button>
                ) : editOpen ? (
                  <Button
                    onClick={handleUpdate}
                    disabled={updateMutation.isPending}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add NAS Client
                      </>
                    )}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* ─── Delete Confirmation Dialog ───────────────────────────── */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-500" />
                Delete NAS Client
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground">
                  {selectedNas?.shortname}
                </span>{" "}
                ({selectedNas?.nasname})? This action cannot be undone.
                {selectedNas?.activeSessions && selectedNas.activeSessions > 0 && (
                  <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                    ⚠ This NAS has {selectedNas.activeSessions} active session(s).
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setDeleteOpen(false);
                  setSelectedNas(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (selectedNas) deleteMutation.mutate(selectedNas.id);
                }}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
