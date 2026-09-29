"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  Store, IndianRupee, HandCoins, Search, Plus, Eye, Pencil, Ban, Trash2,
  CheckCircle2, Settings, Loader2,
  FileSpreadsheet, ChevronRight, ChevronLeft, ChevronDown, Users,
  AlertTriangle, Building2, CreditCard, History, MapPin, Calculator,
  Landmark, Palette, Ticket, GitBranch, UserPlus, Link2, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Types ───────────────────────────────────────────────────
interface Reseller {
  id: string; businessName: string; contactPerson: string; phone: string; email: string;
  address: string; assignedArea: string; areaIds: string;
  commissionRate: number; commissionCalculationMethod: string;
  subscriberCount: number; commissionEarned: number;
  creditLimit: number; currentCreditUsed: number;
  bankName: string; bankAccountName: string; bankAccount: string; bankIfsc: string; bankBranch: string;
  logoUrl: string; primaryColor: string; secondaryColor: string; customDomain: string; emailTemplate: string; upiId: string;
  parentId: string | null; parentName: string | null;
  status: "Active" | "Suspended" | "Trial";
  joinedDate: string; updatedAt: string;
}

interface CommissionLedger {
  id: string; resellerName: string; month: string; subscriberCount: number;
  revenue: number; commissionRate: number; commissionAmount: number;
  paymentStatus: string; paymentDate: string;
}

interface ResellerPlan {
  id: string; planName: string; basePrice: number; resellerPrice: number; margin: number; assignedResellers: string[];
}

interface AuditLogEntry {
  id: string; action: string; entity: string; entityId: string;
  userName: string; details: string; previousValues: string;
  ipAddress: string; createdAt: string;
}

interface SubscriberEntry {
  id: string; name: string; phone: string; email: string;
  status: string; balance: number; createdAt: string;
  plan: { name: string; priceMonthly: number } | null;
}

interface TicketEntry {
  id: string; ticketNumber: string; type: string; priority: string;
  description: string; status: string; createdAt: string;
  subscriber: { id: string; name: string } | null;
  area: { id: string; name: string } | null;
}

interface AreaOption {
  id: string; name: string; code: string; status: string;
}

interface SubResellerEntry {
  id: string; name: string; phone: string; email: string; status: string;
  subscriberCount: number; commissionEarned: number; assignedArea: string; joinedDate: string;
}

function StatCard({ title, value, subtitle, icon: Icon, gradient }: {
  title: string; value: string | number; subtitle: string; icon: React.ElementType; gradient: string;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">{title}</p>
            <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
            <p className="text-xs mt-1 opacity-75">{subtitle}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm"><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-green-100 text-green-700 border-green-200",
  SUSPENDED: "bg-red-100 text-red-700 border-red-200",
  Trial: "bg-amber-100 text-amber-700 border-amber-200",
  OPEN: "bg-orange-100 text-orange-700 border-orange-200",
  ASSIGNED: "bg-teal-100 text-teal-700 border-teal-200",
  IN_PROGRESS: "bg-teal-100 text-teal-700 border-teal-200",
  RESOLVED: "bg-green-100 text-green-700 border-green-200",
  CLOSED: "bg-gray-100 text-gray-600 border-gray-200",
  REOPENED: "bg-red-100 text-red-700 border-red-200",
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  INACTIVE: "bg-gray-100 text-gray-600 border-gray-200",
};

const PAYMENT_STYLES: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700 border-amber-200",
  Paid: "bg-green-100 text-green-700 border-green-200",
  Processing: "bg-violet-100 text-violet-700 border-violet-200",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  Active: "bg-green-500", SUSPENDED: "bg-red-500", Trial: "bg-amber-500",
  ACTIVE: "bg-green-500", INACTIVE: "bg-gray-400",
  OPEN: "bg-orange-500", ASSIGNED: "bg-teal-500", IN_PROGRESS: "bg-teal-500",
  RESOLVED: "bg-green-500", CLOSED: "bg-gray-400", REOPENED: "bg-red-500",
};

function StatusDot({ status }: { status: string }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${STATUS_DOT_COLORS[status] || "bg-gray-400"}`} />
  );
}

function CommissionBadge({ rate }: { rate: number }) {
  const color = rate >= 15 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : rate >= 10 ? "bg-teal-100 text-teal-700 border-teal-200"
    : "bg-amber-100 text-amber-700 border-amber-200";
  return <Badge variant="outline" className={`font-semibold tabular-nums ${color}`}>{rate}%</Badge>;
}

const formatCurrency = (v: number) => `₹${v.toLocaleString("en-IN")}`;

const emptyForm = {
  businessName: "", contactPerson: "", phone: "", email: "",
  address: "", assignedArea: "", commissionRate: 10,
  status: "Trial" as "Active" | "Trial" | "Suspended",
  creditLimit: 0, commissionCalculationMethod: "PERCENTAGE" as string,
  bankName: "", bankAccountName: "", bankAccount: "", bankIfsc: "", bankBranch: "",
  parentId: "" as string,
};

// ─── Reseller Page ───────────────────────────────────────────
export function ResellerPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("resellers");
  const [resellerPage, setResellerPage] = useState(1);
  const [commissionPage, setCommissionPage] = useState(1);

  const [addOpen, setAddOpen] = useState(false);
  const [editReseller, setEditReseller] = useState<Reseller | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [detailReseller, setDetailReseller] = useState<Reseller | null>(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [commissionSettings, setCommissionSettings] = useState({
    defaultRate: 12, slab1: { max: 50, rate: 10 }, slab2: { min: 50, max: 100, rate: 12 },
    slab3: { min: 100, max: 500, rate: 15 }, slab4: { min: 500, rate: 18 },
    cycle: "Monthly", minPayout: 5000,
  });
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<CommissionLedger | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReseller, setBulkReseller] = useState("");
  const [bulkPlans, setBulkPlans] = useState<string[]>([]);
  const [deleteResellerTarget, setDeleteResellerTarget] = useState<Reseller | null>(null);

  // Branding form state
  const [brandingForm, setBrandingForm] = useState({ logoUrl: "", primaryColor: "#DC2626", secondaryColor: "#1F2937", customDomain: "", emailTemplate: "" });

  // Area management state
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);

  const mapReseller = (r: Record<string, unknown>): Reseller => ({
    id: r.id as string,
    businessName: (r.businessName as string) || "",
    contactPerson: (r.contactPerson as string) || (r.businessName as string) || "",
    phone: (r.phone as string) || "",
    email: (r.email as string) || "",
    address: (r.address as string) || "",
    assignedArea: (r.assignedArea as string) || "",
    areaIds: (r.areaIds as string) || "[]",
    commissionRate: (r.commissionRate as number) ?? 10,
    commissionCalculationMethod: (r.commissionCalculationMethod as string) || "PERCENTAGE",
    subscriberCount: (r.subscriberCount as number) ?? 0,
    commissionEarned: (r.commissionEarned as number) ?? 0,
    creditLimit: (r.creditLimit as number) ?? 0,
    currentCreditUsed: (r.currentCreditUsed as number) ?? 0,
    bankName: (r.bankName as string) || "",
    bankAccountName: (r.bankAccountName as string) || "",
    bankAccount: (r.bankAccount as string) || "",
    bankIfsc: (r.bankIfsc as string) || "",
    bankBranch: (r.bankBranch as string) || "",
    logoUrl: (r.logoUrl as string) || "",
    primaryColor: (r.primaryColor as string) || "",
    secondaryColor: (r.secondaryColor as string) || "",
    customDomain: (r.customDomain as string) || "",
    emailTemplate: (r.emailTemplate as string) || "",
    upiId: (r.upiId as string) || "",
    parentId: (r.parentId as string) || null,
    parentName: (r.parentName as string) || null,
    status: ((r.status === "ACTIVE" ? "Active" : r.status === "SUSPENDED" ? "Suspended" : "Trial") as Reseller["status"]),
    joinedDate: (r.joinedDate as string) || "",
    updatedAt: (r.updatedAt as string) || "",
  });

  // Queries
  const { data: resellerData, isLoading: resellerLoading } = useQuery({
    queryKey: ["resellers", resellerPage, search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(resellerPage), search, status: statusFilter });
      return apiFetch(`/api/reseller?${params}`);
    },
  });

  const { data: commissionData } = useQuery({
    queryKey: ["reseller-commission", commissionPage],
    queryFn: () => apiFetch(`/api/reseller?type=commission&page=${commissionPage}`),
  });

  const { data: commissionSettingsData } = useQuery({
    queryKey: ["reseller-commission-settings"],
    queryFn: () => apiFetch("/api/reseller?type=commission-settings"),
  });

  // Sync loaded settings into state
  const loadedSettings = commissionSettingsData?.settings;
  const commissionSettingsLoaded = !!loadedSettings;

  // Effective settings: use loaded data if available, otherwise use defaults
  const effectiveSettings = loadedSettings
    ? {
        defaultRate: loadedSettings.defaultRate ?? commissionSettings.defaultRate,
        slab1: { ...commissionSettings.slab1, ...(loadedSettings.slab1 || {}) },
        slab2: { ...commissionSettings.slab2, ...(loadedSettings.slab2 || {}) },
        slab3: { ...commissionSettings.slab3, ...(loadedSettings.slab3 || {}) },
        slab4: { ...commissionSettings.slab4, ...(loadedSettings.slab4 || {}) },
        cycle: loadedSettings.cycle ?? commissionSettings.cycle,
        minPayout: loadedSettings.minPayout ?? commissionSettings.minPayout,
      }
    : commissionSettings;

  const { data: plansData } = useQuery({
    queryKey: ["reseller-plans"],
    queryFn: () => apiFetch("/api/reseller?type=plans"),
  });

  const { data: areasData } = useQuery({
    queryKey: ["reseller-areas"],
    queryFn: () => apiFetch<{ areas: AreaOption[] }>("/api/reseller?type=areas"),
  });

  // Detail queries
  const { data: subscribersData } = useQuery({
    queryKey: ["reseller-subscribers", detailReseller?.id],
    queryFn: () => apiFetch<{ subscribers: SubscriberEntry[] }>(`/api/reseller?type=subscribers&resellerId=${detailReseller?.id}`),
    enabled: !!detailReseller && detailTab === "subscribers",
  });

  const { data: ticketsData } = useQuery({
    queryKey: ["reseller-tickets", detailReseller?.id],
    queryFn: () => apiFetch<{ tickets: TicketEntry[] }>(`/api/reseller?type=tickets&resellerId=${detailReseller?.id}`),
    enabled: !!detailReseller && detailTab === "tickets",
  });

  const { data: activityData } = useQuery({
    queryKey: ["reseller-activity", detailReseller?.id],
    queryFn: () => apiFetch<{ logs: AuditLogEntry[] }>(`/api/reseller?type=activity&resellerId=${detailReseller?.id}`),
    enabled: !!detailReseller && detailTab === "activity",
  });

  const { data: subResellersData } = useQuery({
    queryKey: ["reseller-sub-resellers", detailReseller?.id],
    queryFn: () => apiFetch<{ subResellers: SubResellerEntry[] }>(`/api/reseller?type=sub-resellers&resellerId=${detailReseller?.id}`),
    enabled: !!detailReseller && detailTab === "hierarchy",
  });

  const { data: calcCommissionData, refetch: refetchCommission } = useQuery({
    queryKey: ["reseller-calc-commission", detailReseller?.id],
    queryFn: () => apiFetch(`/api/reseller?type=calculate-commission&resellerId=${detailReseller?.id}`),
    enabled: false,
  });

  const resellers: Reseller[] = (resellerData?.resellers || []).map(mapReseller);
  const cities: string[] = resellerData?.cities || [];
  const areas: AreaOption[] = areasData?.areas || [];
  const resellerTotalPages = resellerData?.totalPages || 1;
  const commissionLedger: CommissionLedger[] = commissionData?.ledger || [];
  const resellerPlans: ResellerPlan[] = (plansData?.plans || []).map((p: Record<string, unknown>) => ({
    id: p.id, planName: p.planName || "", basePrice: p.basePrice ?? 0,
    resellerPrice: p.resellerPrice ?? 0, margin: p.margin ?? 10, assignedResellers: [],
  }));
  const subscribers = subscribersData?.subscribers || [];
  const tickets = ticketsData?.tickets || [];
  const activityLogs = activityData?.logs || [];
  const subResellers = subResellersData?.subResellers || [];

  const totalResellers = resellerData?.total || resellers.length;
  const activeResellers = resellers.filter((r) => r.status === "Active").length;
  const totalCommission = resellers.reduce((a, r) => a + r.commissionEarned, 0);
  const totalPaid = commissionLedger.filter((c) => c.paymentStatus === "Paid").reduce((a, c) => a + c.commissionAmount, 0);

  // Build hierarchy map for tree display
  const rootResellers = resellers.filter((r) => !r.parentId);
  const childrenMap = new Map<string, Reseller[]>();
  for (const r of resellers) {
    if (r.parentId) {
      const arr = childrenMap.get(r.parentId) || [];
      arr.push(r);
      childrenMap.set(r.parentId, arr);
    }
  }

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/reseller", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d) => {
      if (d.success) { toast.success(d.message || "Saved"); setAddOpen(false); setEditReseller(null); setForm(emptyForm); queryClient.invalidateQueries({ queryKey: ["resellers"] }); }
      else toast.error(d.error || "Failed");
    },
    onError: () => toast.error("Failed to save reseller"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/reseller", { method: "POST", body: JSON.stringify({ action: "delete", id }) }),
    onSuccess: (d) => {
      if (d.success) { toast.success("Reseller deleted"); setDeleteResellerTarget(null); queryClient.invalidateQueries({ queryKey: ["resellers"] }); }
      else toast.error(d.error || "Failed");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch("/api/reseller", { method: "POST", body: JSON.stringify({ action: "update", id, status }) }),
    onSuccess: (d, vars) => {
      if (d.success) { toast.success(`Reseller ${vars.status === "SUSPENDED" ? "suspended" : "activated"}`); queryClient.invalidateQueries({ queryKey: ["resellers"] }); }
      else toast.error(d.error || "Failed");
    },
    onError: () => toast.error("Failed"),
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => apiFetch("/api/reseller", { method: "POST", body: JSON.stringify({ action: "mark-paid", id }) }),
    onSuccess: (d) => {
      if (d.success) { toast.success("Commission marked as paid"); setPayDialogOpen(false); setPayTarget(null); queryClient.invalidateQueries({ queryKey: ["reseller-commission"] }); queryClient.invalidateQueries({ queryKey: ["resellers"] }); }
      else toast.error(d.error || "Failed");
    },
    onError: () => toast.error("Failed"),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (settings: typeof commissionSettings) => apiFetch("/api/reseller", { method: "POST", body: JSON.stringify({ action: "save-settings", settings }) }),
    onSuccess: (d) => {
      if (d.success) { toast.success("Commission settings saved successfully"); queryClient.invalidateQueries({ queryKey: ["reseller-commission-settings"] }); }
      else toast.error(d.error || "Failed");
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const assignPlanMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/reseller", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d) => { if (d.success) toast.success(d.message || "Plans assigned"); else toast.error(d.error || "Failed"); },
    onError: () => toast.error("Failed to assign plans"),
  });

  const saveBrandingMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/reseller", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d) => { if (d.success) toast.success("Branding updated"); else toast.error(d.error || "Failed"); },
    onError: () => toast.error("Failed to save branding"),
  });

  const assignAreasMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/reseller", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (d) => {
      if (d.success) { toast.success(d.message || "Areas updated"); queryClient.invalidateQueries({ queryKey: ["resellers"] }); queryClient.invalidateQueries({ queryKey: ["reseller-areas"] }); }
      else toast.error(d.error || "Failed");
    },
    onError: () => toast.error("Failed to assign areas"),
  });

  const resetForm = () => { setForm(emptyForm); setEditReseller(null); };
  const startEdit = (r: Reseller) => {
    setEditReseller(r);
    setForm({
      businessName: r.businessName, contactPerson: r.contactPerson, phone: r.phone, email: r.email,
      address: r.address, assignedArea: r.assignedArea, commissionRate: r.commissionRate,
      status: r.status, creditLimit: r.creditLimit,
      commissionCalculationMethod: r.commissionCalculationMethod,
      bankName: r.bankName, bankAccountName: r.bankAccountName, bankAccount: r.bankAccount,
      bankIfsc: r.bankIfsc, bankBranch: r.bankBranch,
      parentId: r.parentId || "",
    });
    setAddOpen(true);
  };

  const openDetail = (r: Reseller, tab = "overview") => {
    setDetailReseller(r);
    setDetailTab(tab);
    // Initialize branding form from reseller data
    setBrandingForm({
      logoUrl: r.logoUrl || "",
      primaryColor: r.primaryColor || "#DC2626",
      secondaryColor: r.secondaryColor || "#1F2937",
      customDomain: r.customDomain || "",
      emailTemplate: r.emailTemplate || "",
    });
    // Initialize area selections
    try {
      const ids = JSON.parse(r.areaIds) as string[];
      setSelectedAreaIds(ids);
    } catch {
      setSelectedAreaIds([]);
    }
  };

  const handleSave = () => {
    if (!form.businessName || !form.contactPerson || !form.phone) { toast.error("Business name, contact person, and phone are required"); return; }
    const isEdit = !!editReseller;

    let areaIds = "[]";
    try {
      if (form.assignedArea) {
        const selectedAreas = areas.filter((a) => form.assignedArea.split(", ").includes(a.name));
        if (selectedAreas.length > 0) areaIds = JSON.stringify(selectedAreas.map((a) => a.id));
      }
    } catch { /* ignore */ }

    const body: Record<string, unknown> = {
      action: isEdit ? "update" : "create", name: form.businessName, phone: form.phone,
      email: form.email, address: form.address,
      status: form.status === "Active" ? "ACTIVE" : form.status === "Suspended" ? "SUSPENDED" : "TRIAL",
      commissionRate: form.commissionRate,
      commissionCalculationMethod: form.commissionCalculationMethod,
      monthlyTarget: 0,
      bankName: form.bankName, bankAccountName: form.bankAccountName, bankAccount: form.bankAccount,
      bankIfsc: form.bankIfsc, bankBranch: form.bankBranch,
      ifscCode: form.bankIfsc, areaIds, creditLimit: form.creditLimit,
      parentId: form.parentId || null,
    };
    if (isEdit) body.id = editReseller.id;
    saveMutation.mutate(body);
  };

  const handleSaveBranding = () => {
    if (!detailReseller) return;
    saveBrandingMutation.mutate({
      action: "save-branding",
      resellerId: detailReseller.id,
      ...brandingForm,
    });
  };

  const handleSaveAreas = () => {
    if (!detailReseller) return;
    assignAreasMutation.mutate({
      action: "assign-areas",
      resellerId: detailReseller.id,
      areaIds: selectedAreaIds,
    });
  };

  const toggleArea = (areaId: string) => {
    setSelectedAreaIds((prev) => prev.includes(areaId) ? prev.filter((id) => id !== areaId) : [...prev, areaId]);
  };

  const handleCalcCommission = () => { refetchCommission(); };

  // Hierarchy tree renderer
  const renderResellerRow = (r: Reseller, depth: number) => {
    const creditPct = r.creditLimit > 0 ? Math.min((r.currentCreditUsed / r.creditLimit) * 100, 100) : 0;
    const isCreditAlert = creditPct >= 80;
    const isCreditBlocked = r.creditLimit > 0 && r.currentCreditUsed >= r.creditLimit;
    const children = childrenMap.get(r.id) || [];
    return (
      <div key={r.id}>
        <TableRow className={`hover:bg-muted/50 ${isCreditBlocked ? "bg-red-50/50" : ""}`}>
          <TableCell>
            <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 24}px` }}>
              {children.length > 0 && <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              {depth === 0 && children.length === 0 && <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {r.businessName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.businessName}</p>
                <p className="text-xs text-muted-foreground truncate">{r.phone} · {r.email || ""}</p>
              </div>
            </div>
          </TableCell>
          <TableCell><p className="text-sm">{r.assignedArea || "—"}</p></TableCell>
          <TableCell><div className="flex items-center gap-1.5"><StatusDot status={r.status} /><Badge variant="outline" className={STATUS_STYLES[r.status] || ""}>{r.status}</Badge></div></TableCell>
          <TableCell>
            {r.creditLimit > 0 ? (
              <div className="w-28">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">{formatCurrency(r.currentCreditUsed)}</span>
                  <span className={isCreditBlocked ? "text-red-700 font-bold" : isCreditAlert ? "text-red-600 font-bold" : "text-muted-foreground"}>
                    {isCreditBlocked ? "BLOCKED" : `${Math.round(creditPct)}%`}
                  </span>
                </div>
                <Progress value={creditPct} className={`h-1.5 ${isCreditBlocked ? "[&>div]:bg-red-600" : isCreditAlert ? "[&>div]:bg-red-500" : ""}`} />
                {isCreditBlocked && <p className="text-[10px] text-red-600 mt-0.5 flex items-center gap-0.5"><Ban className="h-2.5 w-2.5" />Credit exceeded</p>}
                {isCreditAlert && !isCreditBlocked && <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />Over 80%</p>}
              </div>
            ) : <span className="text-xs text-muted-foreground">No limit</span>}
          </TableCell>
          <TableCell className="tabular-nums text-sm">
            <CommissionBadge rate={r.commissionRate} />
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(r.commissionEarned)} earned</p>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openDetail(r, "overview")}><Eye className="h-3 w-3" /></Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEdit(r)}><Pencil className="h-3 w-3" /></Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => suspendMutation.mutate({ id: r.id, status: r.status === "Suspended" ? "ACTIVE" : "SUSPENDED" })}><Ban className="h-3 w-3" /></Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => setDeleteResellerTarget(r)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </TableCell>
        </TableRow>
        {children.map((child) => renderResellerRow(child, depth + 1))}
      </div>
    );
  };

  if (resellerLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
        <Skeleton className="skeleton-wave h-9 w-full" />
        <Card className="border shadow-sm"><CardContent className="p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resellers & Franchise</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage reseller network, commissions, branding, and hierarchy</p>
        </div>
        <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => { resetForm(); setAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />Add Reseller
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="animate-card-enter [animation-delay:0ms]">
          <StatCard title="Total Resellers" value={totalResellers} subtitle={`${cities.length} areas`} icon={Store} gradient="stat-gradient-emerald" />
        </div>
        <div className="animate-card-enter [animation-delay:80ms]">
          <StatCard title="Active Resellers" value={activeResellers} subtitle={`${resellers.filter((r) => r.status === "Trial").length} on trial`} icon={Store} gradient="stat-gradient-green" />
        </div>
        <div className="animate-card-enter [animation-delay:160ms]">
          <StatCard title="Commission Earned" value={formatCurrency(totalCommission)} subtitle="Total earned" icon={IndianRupee} gradient="stat-gradient-red" />
        </div>
        <div className="animate-card-enter [animation-delay:240ms]">
          <StatCard title="Commission Paid" value={formatCurrency(totalPaid)} subtitle="Total paid" icon={HandCoins} gradient="stat-gradient-amber" />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="resellers">Resellers</TabsTrigger>
          <TabsTrigger value="commission">Commission</TabsTrigger>
          <TabsTrigger value="plans">Plans & Pricing</TabsTrigger>
        </TabsList>

        {/* Tab 1: Resellers */}
        <TabsContent value="resellers" className="space-y-4">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by name, phone, email..." value={search} onChange={(e) => { setSearch(e.target.value); setResellerPage(1); }} className="pl-8" />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setResellerPage(1); }}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Trial">Trial</SelectItem>
                    <SelectItem value="Suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Reseller</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Area</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Credit</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Commission</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resellers.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-16">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <Store className="h-6 w-6 text-muted-foreground/50" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">No resellers found</p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">Add your first reseller to get started</p>
                          </div>
                        </div>
                      </TableCell></TableRow>
                    ) : rootResellers.map((r) => renderResellerRow(r, 0))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {resellerTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {resellerPage} of {resellerTotalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={resellerPage <= 1} onClick={() => setResellerPage(resellerPage - 1)}><ChevronLeft className="h-4 w-4 mr-1" />Prev</Button>
                <Button variant="outline" size="sm" disabled={resellerPage >= resellerTotalPages} onClick={() => setResellerPage(resellerPage + 1)}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Commission */}
        <TabsContent value="commission" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2"><Settings className="h-4 w-4" />Commission Settings</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Default Commission Rate</Label>
                    <div className="flex items-center gap-3 mt-1">
                      <Slider value={[effectiveSettings.defaultRate]} min={5} max={30} step={1} onValueChange={([v]) => setCommissionSettings((s) => ({ ...s, defaultRate: v }))} className="flex-1" />
                      <span className="text-sm font-semibold w-10 text-right tabular-nums">{effectiveSettings.defaultRate}%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Payment Cycle</Label>
                    <Select value={effectiveSettings.cycle} onValueChange={(v) => setCommissionSettings((s) => ({ ...s, cycle: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Monthly">Monthly</SelectItem><SelectItem value="Quarterly">Quarterly</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Minimum Payout Threshold (₹)</Label>
                    <Input type="number" value={effectiveSettings.minPayout} onChange={(e) => setCommissionSettings((s) => ({ ...s, minPayout: Number(e.target.value) }))} className="mt-1" />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Commission Slab Rates</Label>
                  <div className="space-y-2 mt-1">
                    {[
                      { key: "slab1", label: "Tier 1", range: "< 50 subscribers", rate: effectiveSettings.slab1.rate, tier: 1 },
                      { key: "slab2", label: "Tier 2", range: "50–100 subscribers", rate: effectiveSettings.slab2.rate, tier: 2 },
                      { key: "slab3", label: "Tier 3", range: "100–500 subscribers", rate: effectiveSettings.slab3.rate, tier: 3 },
                      { key: "slab4", label: "Tier 4", range: "500+ subscribers", rate: effectiveSettings.slab4.rate, tier: 4 },
                    ].map((slab) => (
                      <div key={slab.label} className="relative flex items-center justify-between p-3 rounded-lg border border-border/60 hover:border-border transition-all hover:shadow-sm group">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 ${slab.tier === 1 ? "bg-amber-500" : slab.tier === 2 ? "bg-teal-500" : slab.tier === 3 ? "bg-emerald-500" : "bg-green-600"}`}>
                            {slab.tier}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{slab.range}</p>
                            <p className="text-[10px] text-muted-foreground">{slab.label}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input type="number" min={1} max={50} value={slab.rate} onChange={(e) => {
                            const val = Math.max(1, Math.min(50, Number(e.target.value)));
                            setCommissionSettings((s) => ({ ...s, [slab.key]: { ...s[slab.key as keyof typeof s], rate: val } }));
                          }} className="w-16 h-8 text-center text-sm tabular-nums" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => saveSettingsMutation.mutate(effectiveSettings)} disabled={saveSettingsMutation.isPending}>
                    {saveSettingsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Save Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="border shadow-sm hover:shadow-md transition-shadow"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Pending Payout</p><p className="text-xl font-bold mt-1 tabular-nums text-amber-600">{formatCurrency(commissionLedger.filter((c) => c.paymentStatus === "Pending").reduce((a, c) => a + c.commissionAmount, 0))}</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Total Commission</p><p className="text-xl font-bold mt-1 tabular-nums">{formatCurrency(commissionLedger.reduce((a, c) => a + c.commissionAmount, 0))}</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Paid</p><p className="text-xl font-bold mt-1 tabular-nums text-green-600">{formatCurrency(totalPaid)}</p></CardContent></Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Commission Ledger</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Reseller</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Month</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Subscribers</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Revenue</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Rate</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Commission</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissionLedger.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-16">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <Calculator className="h-6 w-6 text-muted-foreground/50" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">No commission data</p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">Commission records will appear here</p>
                          </div>
                        </div>
                      </TableCell></TableRow>
                    ) : commissionLedger.map((c) => (
                      <TableRow key={c.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm font-medium">{c.resellerName}</TableCell>
                        <TableCell className="text-sm">{c.month}</TableCell>
                        <TableCell className="text-sm tabular-nums">{c.subscriberCount}</TableCell>
                        <TableCell className="text-sm tabular-nums">{formatCurrency(c.revenue)}</TableCell>
                        <TableCell className="text-sm tabular-nums font-semibold">{c.commissionRate}%</TableCell>
                        <TableCell className="text-sm tabular-nums font-semibold">{formatCurrency(c.commissionAmount)}</TableCell>
                        <TableCell><Badge variant="outline" className={PAYMENT_STYLES[c.paymentStatus] || ""}>{c.paymentStatus}</Badge></TableCell>
                        <TableCell className="text-right">
                          {c.paymentStatus !== "Paid" && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => { setPayTarget(c); setPayDialogOpen(true); }}>
                              <CheckCircle2 className="h-3 w-3 mr-1" />Pay
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {((commissionData as any)?.totalPages ?? 0) > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {commissionPage} of {(commissionData as any)?.totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={commissionPage <= 1} onClick={() => setCommissionPage(commissionPage - 1)}><ChevronLeft className="h-4 w-4 mr-1" />Prev</Button>
                <Button variant="outline" size="sm" disabled={commissionPage >= ((commissionData as any)?.totalPages ?? 1)} onClick={() => setCommissionPage(commissionPage + 1)}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </div>
          )}

          <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Mark Commission as Paid</DialogTitle></DialogHeader>
              {payTarget && (
                <div className="space-y-3 py-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Reseller</span><span className="font-medium">{payTarget.resellerName}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Month</span><span>{payTarget.month}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Commission Amount</span><span className="font-bold text-lg">{formatCurrency(payTarget.commissionAmount)}</span></div>
                  <Separator />
                  <p className="text-xs text-muted-foreground">This will mark the commission as paid.</p>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => payTarget && markPaidMutation.mutate(payTarget.id)} disabled={markPaidMutation.isPending}>{markPaidMutation.isPending ? "Processing..." : "Confirm Payment"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tab 3: Plans & Pricing */}
        <TabsContent value="plans" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setBulkOpen(true)}><FileSpreadsheet className="h-4 w-4 mr-2" />Bulk Assign Plans</Button>
          </div>
          <Card className="border shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Reseller Plan Assignments</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase sticky left-0 bg-background z-10">Plan</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Base Price</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Reseller Price</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Margin</TableHead>
                      {resellers.filter((r) => r.status !== "Suspended").map((r) => (
                        <TableHead key={r.id} className="text-xs font-medium uppercase text-center min-w-[80px]">
                          <div className="flex flex-col items-center gap-0.5"><span className="text-[10px] truncate max-w-[70px]">{r.businessName.split(" ")[0]}</span></div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resellerPlans.length === 0 ? (
                      <TableRow><TableCell colSpan={4 + resellers.filter((r) => r.status !== "Suspended").length} className="text-center py-16">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <FileSpreadsheet className="h-6 w-6 text-muted-foreground/50" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">No plans available</p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">Create plans in the Plans page first</p>
                          </div>
                        </div>
                      </TableCell></TableRow>
                    ) : resellerPlans.map((p) => (
                      <TableRow key={p.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm font-medium sticky left-0 bg-background z-10"><div className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-muted-foreground" />{p.planName}</div></TableCell>
                        <TableCell className="tabular-nums text-sm">{formatCurrency(p.basePrice)}</TableCell>
                        <TableCell className="tabular-nums text-sm">{formatCurrency(p.resellerPrice)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 tabular-nums">{p.margin}%</Badge></TableCell>
                        {resellers.filter((r) => r.status !== "Suspended").map((r) => (
                          <TableCell key={r.id} className="text-center">
                            <div className="flex justify-center"><Checkbox checked={p.assignedResellers.includes(r.id)} onCheckedChange={() => assignPlanMutation.mutate({ action: "assign-plans", resellerId: r.id, planIds: p.assignedResellers.includes(r.id) ? [] : [p.id] })} /></div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Bulk Assign Plans to Reseller</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div><Label>Select Reseller</Label>
                  <Select value={bulkReseller} onValueChange={setBulkReseller}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choose reseller" /></SelectTrigger>
                    <SelectContent>{resellers.filter((r) => r.status !== "Suspended").map((r) => <SelectItem key={r.id} value={r.id}>{r.businessName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-sm font-medium mb-2 block">Select Plans</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {resellerPlans.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => setBulkPlans((prev) => prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id])}>
                        <Checkbox checked={bulkPlans.includes(p.id)} /><span className="text-sm flex-1">{p.planName}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{formatCurrency(p.basePrice)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => { assignPlanMutation.mutate({ action: "assign-plans", resellerId: bulkReseller, planIds: bulkPlans }); setBulkOpen(false); setBulkReseller(""); setBulkPlans([]); }} disabled={!bulkReseller || bulkPlans.length === 0}>Assign {bulkPlans.length} Plan(s)</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Reseller Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editReseller ? "Edit Reseller" : "Add New Reseller"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div><Label>Business Name *</Label><Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="e.g. SkyNet Broadband" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Person *</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="Full name" className="mt-1" /></div>
              <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit number" className="mt-1" /></div>
            </div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" className="mt-1" /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Credit Limit (₹)</Label><Input type="number" min="0" value={form.creditLimit || ""} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} placeholder="0" className="mt-1" /></div>
              <div><Label>Commission Rate (%)</Label><Input type="number" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: Number(e.target.value) })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Commission Method</Label>
                <Select value={form.commissionCalculationMethod} onValueChange={(v) => setForm({ ...form, commissionCalculationMethod: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                    <SelectItem value="FLAT">Flat</SelectItem>
                    <SelectItem value="SLAB">Slab-based</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Parent Reseller</Label>
                <Select value={form.parentId} onValueChange={(v) => setForm({ ...form, parentId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="None (top-level)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (top-level)</SelectItem>
                    {resellers.filter((r) => r.id !== editReseller?.id).map((r) => <SelectItem key={r.id} value={r.id}>{r.businessName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1"><Landmark className="h-4 w-4" /> Bank Details</Label>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Account Holder Name</Label><Input value={form.bankAccountName} onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} placeholder="Account holder" className="mt-1" /></div>
                <div><Label>Bank Name</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Bank name" className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Account Number</Label><Input value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} placeholder="Account #" className="mt-1" /></div>
                <div><Label>IFSC Code</Label><Input value={form.bankIfsc} onChange={(e) => setForm({ ...form, bankIfsc: e.target.value })} placeholder="IFSC code" className="mt-1" /></div>
              </div>
              <div><Label>Branch</Label><Input value={form.bankBranch} onChange={(e) => setForm({ ...form, bankBranch: e.target.value })} placeholder="Branch name" className="mt-1" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : editReseller ? "Update" : "Add Reseller"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <Sheet open={!!detailReseller} onOpenChange={() => setDetailReseller(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>{detailReseller?.businessName || "Reseller Details"}</SheetTitle></SheetHeader>
          {detailReseller && (
            <div className="space-y-6 mt-6 px-1">
              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="w-full grid grid-cols-4 lg:grid-cols-8 overflow-x-auto">
                  <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="branding" className="text-xs">Branding</TabsTrigger>
                  <TabsTrigger value="tickets" className="text-xs">Tickets</TabsTrigger>
                  <TabsTrigger value="subscribers" className="text-xs">Subscribers</TabsTrigger>
                  <TabsTrigger value="areas" className="text-xs">Areas</TabsTrigger>
                  <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
                  <TabsTrigger value="bank" className="text-xs">Bank</TabsTrigger>
                  <TabsTrigger value="hierarchy" className="text-xs">Hierarchy</TabsTrigger>
                </TabsList>

                {/* ─── Overview Tab ─── */}
                <TabsContent value="overview" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-xs text-muted-foreground">Status</p><div className="flex items-center gap-1.5 mt-1"><StatusDot status={detailReseller.status} /><Badge variant="outline" className={STATUS_STYLES[detailReseller.status]}>{detailReseller.status}</Badge></div></div>
                    <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm font-medium">{detailReseller.phone}</p></div>
                    <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm">{detailReseller.email || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Joined</p><p className="text-sm">{detailReseller.joinedDate || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Commission Rate</p><p className="text-sm font-bold">{detailReseller.commissionRate}% ({detailReseller.commissionCalculationMethod})</p></div>
                    <div><p className="text-xs text-muted-foreground">Subscribers</p><p className="text-sm font-medium">{detailReseller.subscriberCount}</p></div>
                    <div><p className="text-xs text-muted-foreground">Commission Earned</p><p className="text-sm font-bold text-green-600">{formatCurrency(detailReseller.commissionEarned)}</p></div>
                    {detailReseller.parentName && <div><p className="text-xs text-muted-foreground">Parent Reseller</p><p className="text-sm font-medium">{detailReseller.parentName}</p></div>}
                  </div>

                  {/* Credit Limit Card */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" />Credit Usage</CardTitle></CardHeader>
                    <CardContent>
                      {detailReseller.creditLimit > 0 ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{formatCurrency(detailReseller.currentCreditUsed)} used</span>
                            <span className="font-medium">of {formatCurrency(detailReseller.creditLimit)}</span>
                          </div>
                          <Progress value={Math.min((detailReseller.currentCreditUsed / detailReseller.creditLimit) * 100, 100)} className="h-2" />
                          <p className="text-xs text-muted-foreground">Available: {formatCurrency(Math.max(detailReseller.creditLimit - detailReseller.currentCreditUsed, 0))}</p>
                          {detailReseller.currentCreditUsed >= detailReseller.creditLimit && (
                            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 mt-2">
                              <ShieldCheck className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-red-700">Credit Limit Exceeded</p>
                                <p className="text-xs text-red-600">This reseller has exceeded their credit limit. New operations are blocked until payment is received.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : <p className="text-sm text-muted-foreground">No credit limit set</p>}
                    </CardContent>
                  </Card>

                  {/* Area Coverage */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" />Area Coverage</CardTitle></CardHeader>
                    <CardContent>
                      {detailReseller.assignedArea ? (
                        <div className="flex flex-wrap gap-1.5">
                          {detailReseller.assignedArea.split(", ").map((area) => (
                            <Badge key={area} variant="outline" className="text-xs">{area}</Badge>
                          ))}
                        </div>
                      ) : <p className="text-sm text-muted-foreground">No areas assigned</p>}
                    </CardContent>
                  </Card>

                  {/* Commission Calculation — Automated */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calculator className="h-4 w-4" />Automated Commission</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">Apply slab rates to paid invoices from the last 30 days. Creates a CommissionPayout record.</p>
                      <Button variant="outline" size="sm" onClick={handleCalcCommission} className="w-full">
                        <Calculator className="h-3.5 w-3.5 mr-2" />Calculate Commission
                      </Button>
                      {calcCommissionData && (
                        <div className="space-y-2 p-3 bg-muted rounded-lg">
                          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subscribers</span><span className="font-medium">{String((calcCommissionData as Record<string, unknown>).subscriberCount)}</span></div>
                          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Revenue (30d)</span><span className="font-medium">{formatCurrency((calcCommissionData as Record<string, unknown>).totalRevenue as number)}</span></div>
                          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Method</span><span className="font-medium">{String((calcCommissionData as Record<string, unknown>).method)}</span></div>
                          <Separator />
                          <div className="flex justify-between text-sm"><span className="text-muted-foreground font-medium">Commission</span><span className="font-bold text-green-600">{formatCurrency((calcCommissionData as Record<string, unknown>).commissionAmount as number)}</span></div>
                          {String((calcCommissionData as Record<string, unknown>).payoutCreated) && (
                            <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Payout record created</p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Branding Tab ─── */}
                <TabsContent value="branding" className="mt-4">
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Palette className="h-4 w-4" />White-Label Branding</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Logo URL</Label>
                        <Input value={brandingForm.logoUrl} onChange={(e) => setBrandingForm({ ...brandingForm, logoUrl: e.target.value })} placeholder="https://example.com/logo.png" className="mt-1" />
                        {brandingForm.logoUrl && (
                          <div className="mt-2 p-3 bg-muted rounded-lg flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-white border flex items-center justify-center overflow-hidden">
                              <img src={brandingForm.logoUrl} alt="Logo" className="w-10 h-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            </div>
                            <span className="text-xs text-muted-foreground">Logo Preview</span>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Primary Color</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-8 h-8 rounded border" style={{ backgroundColor: brandingForm.primaryColor }} />
                            <Input value={brandingForm.primaryColor} onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })} className="flex-1" />
                          </div>
                        </div>
                        <div>
                          <Label>Secondary Color</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-8 h-8 rounded border" style={{ backgroundColor: brandingForm.secondaryColor }} />
                            <Input value={brandingForm.secondaryColor} onChange={(e) => setBrandingForm({ ...brandingForm, secondaryColor: e.target.value })} className="flex-1" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label>Custom Domain</Label>
                        <Input value={brandingForm.customDomain} onChange={(e) => setBrandingForm({ ...brandingForm, customDomain: e.target.value })} placeholder="portal.example.com" className="mt-1" />
                      </div>
                      <div>
                        <Label>Email Template</Label>
                        <Textarea value={brandingForm.emailTemplate} onChange={(e) => setBrandingForm({ ...brandingForm, emailTemplate: e.target.value })} placeholder="Custom email template content (HTML supported)..." className="mt-1 min-h-[100px]" />
                      </div>
                      <Button onClick={handleSaveBranding} disabled={saveBrandingMutation.isPending} className="bg-[#DC2626] hover:bg-[#B91C1C] text-white">
                        {saveBrandingMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Save Branding
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Tickets Tab ─── */}
                <TabsContent value="tickets" className="mt-4">
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Ticket className="h-4 w-4" />Support Tickets</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-[400px] overflow-y-auto">
                        {tickets.length === 0 ? (
                          <div className="p-10 text-center text-muted-foreground">
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                              <Ticket className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                            <p className="text-sm font-medium">No tickets from this reseller&apos;s coverage areas</p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">Support tickets will appear here</p>
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Ticket</TableHead>
                                <TableHead className="text-xs">Type</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs">Subscriber</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tickets.map((t) => (
                                <TableRow key={t.id} className="hover:bg-muted/50">
                                  <TableCell>
                                    <p className="text-xs font-medium">{t.ticketNumber}</p>
                                    <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">{t.description}</p>
                                  </TableCell>
                                  <TableCell><Badge variant="outline" className="text-[10px]">{t.type.replace(/_/g, " ")}</Badge></TableCell>
                                  <TableCell><Badge variant="outline" className={STATUS_STYLES[t.status] || ""}><span className="text-[10px]">{t.status}</span></Badge></TableCell>
                                  <TableCell className="text-xs">{t.subscriber?.name || "Walk-in"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Subscribers Tab ─── */}
                <TabsContent value="subscribers" className="mt-4">
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Subscribers ({subscribers.length})</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-[400px] overflow-y-auto">
                        {subscribers.length === 0 ? (
                          <div className="p-10 text-center text-muted-foreground">
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                              <Users className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                            <p className="text-sm font-medium">No subscribers in this reseller&apos;s coverage areas</p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">Subscribers will appear here once assigned</p>
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Name</TableHead>
                                <TableHead className="text-xs">Phone</TableHead>
                                <TableHead className="text-xs">Plan</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs text-right">Balance</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {subscribers.map((sub) => (
                                <TableRow key={sub.id} className="hover:bg-muted/50">
                                  <TableCell className="text-sm font-medium">{sub.name}</TableCell>
                                  <TableCell className="text-xs">{sub.phone}</TableCell>
                                  <TableCell className="text-xs">{sub.plan?.name || "—"}</TableCell>
                                  <TableCell><Badge variant="outline" className="text-[10px]">{sub.status}</Badge></TableCell>
                                  <TableCell className="text-xs tabular-nums text-right">{formatCurrency(sub.balance)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Areas Tab ─── */}
                <TabsContent value="areas" className="mt-4">
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" />Coverage Area Management</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs text-muted-foreground">Select areas to assign/unassign from this reseller&apos;s coverage.</p>
                      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                        {areas.map((area) => (
                          <div
                            key={area.id}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedAreaIds.includes(area.id) ? "bg-red-50 border-red-200" : "hover:bg-muted/50 border-transparent"}`}
                            onClick={() => toggleArea(area.id)}
                          >
                            <Checkbox checked={selectedAreaIds.includes(area.id)} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{area.name}</p>
                              <p className="text-xs text-muted-foreground">{area.code}</p>
                            </div>
                            <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[area.status] || ""}`}>{area.status}</Badge>
                          </div>
                        ))}
                        {areas.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No areas configured</p>}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{selectedAreaIds.length} area(s) selected</p>
                        <Button size="sm" onClick={handleSaveAreas} disabled={assignAreasMutation.isPending} className="bg-[#DC2626] hover:bg-[#B91C1C] text-white">
                          {assignAreasMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Save Areas
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Activity Tab ─── */}
                <TabsContent value="activity" className="mt-4">
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" />Audit Log</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-[400px] overflow-y-auto">
                        {activityLogs.length === 0 ? (
                          <div className="p-10 text-center text-muted-foreground">
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                              <History className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                            <p className="text-sm font-medium">No activity recorded</p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">Actions will be logged here</p>
                          </div>
                        ) : (
                          <div className="divide-y">
                            {activityLogs.map((log) => (
                              <div key={log.id} className="p-3 hover:bg-muted/30">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium">{log.action}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      by {log.userName} · {new Date(log.createdAt).toLocaleString()}
                                    </p>
                                    {log.details && log.details !== "{}" && (
                                      <p className="text-xs text-muted-foreground mt-1 bg-muted p-1.5 rounded max-w-[300px] truncate">
                                        {log.details}
                                      </p>
                                    )}
                                  </div>
                                  <Badge variant="outline" className="text-[10px] shrink-0">{log.action.substring(0, 20)}</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Bank Details Tab ─── */}
                <TabsContent value="bank" className="mt-4">
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Landmark className="h-4 w-4" />Bank Details</CardTitle></CardHeader>
                    <CardContent>
                      {detailReseller.bankName || detailReseller.bankAccount ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div><p className="text-xs text-muted-foreground">Account Holder</p><p className="text-sm font-medium">{detailReseller.bankAccountName || "—"}</p></div>
                            <div><p className="text-xs text-muted-foreground">Bank Name</p><p className="text-sm font-medium">{detailReseller.bankName || "—"}</p></div>
                            <div><p className="text-xs text-muted-foreground">Account Number</p><p className="text-sm font-medium">{detailReseller.bankAccount || "—"}</p></div>
                            <div><p className="text-xs text-muted-foreground">IFSC Code</p><p className="text-sm font-medium">{detailReseller.bankIfsc || "—"}</p></div>
                            <div><p className="text-xs text-muted-foreground">Branch</p><p className="text-sm font-medium">{detailReseller.bankBranch || "—"}</p></div>
                            <div><p className="text-xs text-muted-foreground">UPI ID</p><p className="text-sm font-medium">{detailReseller.upiId || "—"}</p></div>
                          </div>
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                            <Building2 className="h-4 w-4 text-amber-600 mt-0.5" />
                            <div>
                              <p className="text-xs font-medium text-amber-800">Payout Information</p>
                              <p className="text-xs text-amber-700 mt-0.5">Commission payouts will be processed to this bank account.</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <Landmark className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">No bank details configured</p>
                          <Button variant="outline" size="sm" className="mt-2" onClick={() => { setDetailReseller(null); startEdit(detailReseller); }}>
                            <Pencil className="h-3 w-3 mr-1" />Add Bank Details
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Hierarchy Tab ─── */}
                <TabsContent value="hierarchy" className="mt-4">
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><GitBranch className="h-4 w-4" />Sub-Resellers</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-[400px] overflow-y-auto">
                        {detailReseller.parentName && (
                          <div className="p-3 bg-muted/50 border-b">
                            <p className="text-xs text-muted-foreground mb-1">Parent Reseller</p>
                            <div className="flex items-center gap-2">
                              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-medium">{detailReseller.parentName}</span>
                            </div>
                          </div>
                        )}
                        {subResellers.length === 0 ? (
                          <div className="p-10 text-center text-muted-foreground">
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                              <GitBranch className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                            <p className="text-sm font-medium">No sub-resellers under this reseller</p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">Sub-resellers will be listed here</p>
                          </div>
                        ) : (
                          <div className="divide-y">
                            {subResellers.map((sub) => (
                              <div key={sub.id} className="p-3 hover:bg-muted/30 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-red-400 to-red-500 flex items-center justify-center text-white text-[10px] font-bold">
                                    {sub.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">{sub.name}</p>
                                    <p className="text-xs text-muted-foreground">{sub.phone} · {sub.assignedArea || "No area"}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <p className="text-xs font-medium">{sub.subscriberCount} subs</p>
                                    <p className="text-xs text-green-600 tabular-nums">{formatCurrency(sub.commissionEarned)}</p>
                                  </div>
                                  <Badge variant="outline" className={STATUS_STYLES[sub.status] || ""}><span className="text-[10px]">{sub.status}</span></Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteResellerTarget} onOpenChange={() => setDeleteResellerTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Reseller</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete <strong>{deleteResellerTarget?.businessName}</strong>? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteResellerTarget && deleteMutation.mutate(deleteResellerTarget.id)} disabled={deleteMutation.isPending} className="bg-red-600 hover:bg-red-700">{deleteMutation.isPending ? "Deleting..." : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export default ResellerPage;
