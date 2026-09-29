"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/utils";
import { formatINR } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ShieldAlert,
  TrendingDown,
  FileWarning,
  Search,
  RefreshCw,
  Zap,
  Ban,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  Eye,
  Wrench,
  ArrowDownRight,
  CircleDot,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────

interface LeakageItem {
  id: string;
  type: string;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  subscriberId: string;
  subscriberName: string;
  amount: number;
  description: string;
  date: string;
  referenceId: string;
  referenceNumber: string;
  autoFixable: boolean;
}

interface LeakageCategory {
  count: number;
  amount: number;
  severity: string;
  description: string;
}

interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number;
  count: number;
  totalAmount: number;
  weightedAvgDays: number;
  color: string;
}

interface WriteOffCandidate {
  invoiceId: string;
  invoiceNumber: string;
  subscriberId: string;
  subscriberName: string;
  balanceAmount: number;
  daysOverdue: number;
  subscriberStatus: string;
  areaName: string;
}

interface MonthlyTrend {
  month: string;
  label: string;
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
}

interface AreaAging {
  areaId: string;
  areaName: string;
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
  total: number;
}

interface AdjustmentItem {
  id: string;
  type: "CREDIT_NOTE" | "REFUND" | "DISCOUNT";
  amount: number;
  reason: string;
  status: string;
  date: string;
  subscriberName: string;
  referenceNumber: string;
  createdBy: string;
}

interface AnomalyFlag {
  id: string;
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  amount: number;
  subscriberName: string;
  date: string;
  referenceNumber: string;
}

// ── Severity Colors ────────────────────────────────────────────────

const severityConfig: Record<string, { color: string; bg: string; border: string; icon: React.ElementType }> = {
  CRITICAL: { color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/40", border: "border-red-200 dark:border-red-800", icon: ShieldAlert },
  HIGH: { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-200 dark:border-orange-800", icon: AlertTriangle },
  MEDIUM: { color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-200 dark:border-amber-800", icon: AlertCircle },
  LOW: { color: "text-teal-700 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/40", border: "border-teal-200 dark:border-teal-800", icon: CheckCircle2 },
};

const severityBadgeVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "default",
  MEDIUM: "secondary",
  LOW: "outline",
};

const typeIcons: Record<string, React.ElementType> = {
  UNREDEEMED_VOUCHER: FileWarning,
  UNUSED_CREDIT: IndianRupee,
  OVERPAYMENT: TrendingDown,
  UNDERPAYMENT: ArrowDownRight,
  DUPLICATE_INVOICE_RISK: AlertTriangle,
  DISCOUNT_LEAKAGE: Zap,
  ZERO_LOW_VALUE: CircleDot,
  UNCOLLECTED_PAYMENT: AlertCircle,
};

// ── Custom tooltip for charts ──────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground" style={{ color: p.color }}>
          {p.name}: {formatINR(p.value)}
        </p>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function RevenueLeakagePage() {
  const [activeTab, setActiveTab] = useState("leakage");

  // Leakage state
  const [leakageItems, setLeakageItems] = useState<LeakageItem[]>([]);
  const [leakageCategories, setLeakageCategories] = useState<Record<string, LeakageCategory>>({});
  const [leakageSummary, setLeakageSummary] = useState<any>(null);
  const [leakageLoading, setLeakageLoading] = useState(true);

  // Aging state
  const [agingBuckets, setAgingBuckets] = useState<AgingBucket[]>([]);
  const [agingTotal, setAgingTotal] = useState(0);
  const [agingInvoiceCount, setAgingInvoiceCount] = useState(0);
  const [doubtfulDebt, setDoubtfulDebt] = useState(0);
  const [writeOffCandidates, setWriteOffCandidates] = useState<WriteOffCandidate[]>([]);
  const [writeOffSummary, setWriteOffSummary] = useState({ count: 0, totalAmount: 0 });
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>([]);
  const [areaAging, setAreaAging] = useState<AreaAging[]>([]);
  const [agingLoading, setAgingLoading] = useState(true);

  // Audit state
  const [auditAdjustments, setAuditAdjustments] = useState<AdjustmentItem[]>([]);
  const [auditGroups, setAuditGroups] = useState<any[]>([]);
  const [auditTop10, setAuditTop10] = useState<AdjustmentItem[]>([]);
  const [auditAnomalies, setAuditAnomalies] = useState<AnomalyFlag[]>([]);
  const [auditSummary, setAuditSummary] = useState<any>(null);
  const [auditTrend, setAuditTrend] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // Filters
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterSeverity, setFilterSeverity] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // ══════════════════════════════════════════════════════════════
  // Fetch Data
  // ══════════════════════════════════════════════════════════════

  const fetchLeakage = useCallback(async () => {
    setLeakageLoading(true);
    try {
      const data = await apiFetch<any>("/api/revenue/leakage");
      setLeakageItems(data.leakageItems || []);
      setLeakageCategories(data.categories || {});
      setLeakageSummary(data.summary || {});
    } catch (err) {
      toast.error("Failed to load revenue leakage data");
    } finally {
      setLeakageLoading(false);
    }
  }, []);

  const fetchAging = useCallback(async () => {
    setAgingLoading(true);
    try {
      const data = await apiFetch<any>("/api/revenue/aging-enhanced");
      setAgingBuckets(data.buckets || []);
      setAgingTotal(data.totalOutstanding || 0);
      setAgingInvoiceCount(data.invoiceCount || 0);
      setDoubtfulDebt(data.doubtfulDebtProvision || 0);
      setWriteOffCandidates(data.writeOffCandidates || []);
      setWriteOffSummary(data.writeOffSummary || { count: 0, totalAmount: 0 });
      setMonthlyTrend(data.monthlyTrend || []);
      setAreaAging(data.areaAging || []);
    } catch (err) {
      toast.error("Failed to load aging analysis");
    } finally {
      setAgingLoading(false);
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const data = await apiFetch<any>("/api/revenue/audit");
      setAuditAdjustments(data.adjustments || []);
      setAuditGroups(data.groups || []);
      setAuditTop10(data.top10 || []);
      setAuditAnomalies(data.anomalies || []);
      setAuditSummary(data.summary || {});
      setAuditTrend(data.monthlyTrend || []);
    } catch (err) {
      toast.error("Failed to load audit trail");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeakage();
    fetchAging();
    fetchAudit();
  }, [fetchLeakage, fetchAging, fetchAudit]);

  // ══════════════════════════════════════════════════════════════
  // Auto-Fix Handler
  // ══════════════════════════════════════════════════════════════

  const handleAutoFix = async () => {
    const fixableIds = leakageItems.filter((i) => i.autoFixable).map((i) => i.id);
    if (fixableIds.length === 0) {
      toast.info("No auto-fixable items found");
      return;
    }
    try {
      await apiFetch("/api/revenue/leakage", {
        method: "POST",
        body: JSON.stringify({ itemIds: fixableIds }),
      });
      toast.success(`Fixed ${fixableIds.length} item(s)`);
      fetchLeakage();
    } catch {
      toast.error("Auto-fix failed");
    }
  };

  // ══════════════════════════════════════════════════════════════
  // Filtered leakage items
  // ══════════════════════════════════════════════════════════════

  const filteredItems = leakageItems.filter((item) => {
    if (filterCategory !== "ALL" && item.category !== filterCategory) return false;
    if (filterSeverity !== "ALL" && item.severity !== filterSeverity) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.subscriberName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.referenceNumber.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ══════════════════════════════════════════════════════════════
  // Skeleton Loaders
  // ══════════════════════════════════════════════════════════════

  const SummarySkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Revenue Leakage & Aging Analysis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated detection of revenue leakage, invoice aging, and financial audit anomalies
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchLeakage(); fetchAging(); fetchAudit(); }}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh All
          </Button>
          {!leakageLoading && leakageSummary?.autoFixableCount > 0 && (
            <Button variant="destructive" size="sm" onClick={handleAutoFix}>
              <Wrench className="h-4 w-4 mr-1" />
              Auto-Fix ({leakageSummary.autoFixableCount})
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="leakage">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Leakage Detection
          </TabsTrigger>
          <TabsTrigger value="aging">
            <TrendingDown className="h-4 w-4 mr-1" />
            Aging Analysis
          </TabsTrigger>
          <TabsTrigger value="audit">
            <Eye className="h-4 w-4 mr-1" />
            Audit Trail
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB 1: LEAKAGE DETECTION                              */}
        {/* ══════════════════════════════════════════════════════ */}
        <TabsContent value="leakage" className="space-y-6">
          {leakageLoading ? (
            <div className="space-y-6">
              <SummarySkeleton />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-red-200 dark:border-red-800/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldAlert className="h-4 w-4 text-red-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Leakage</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {formatINR(leakageSummary?.totalLeakage || 0)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <FileWarning className="h-4 w-4 text-amber-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Leakage Items</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {leakageSummary?.totalItems || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-orange-200 dark:border-orange-800/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Ban className="h-4 w-4 text-orange-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Write-off Candidates</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {leakageSummary?.writeOffCandidates || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-teal-200 dark:border-teal-800/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-teal-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auto-Fixable</span>
                    </div>
                    <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                      {leakageSummary?.autoFixableCount || 0}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Category Cards */}
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-3">Leakage Categories</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.entries(leakageCategories).map(([category, data]) => {
                    const sev = severityConfig[data.severity] || severityConfig.MEDIUM;
                    const SevIcon = sev.icon;
                    return (
                      <Card key={category} className={`${sev.border} transition-all hover:shadow-md`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-sm font-semibold text-foreground">{category}</span>
                            <Badge variant={severityBadgeVariant[data.severity] || "secondary"} className="text-[10px]">
                              <SevIcon className="h-3 w-3 mr-0.5" />
                              {data.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">{data.description}</p>
                          <div className="flex items-end justify-between">
                            <div>
                              <p className="text-lg font-bold text-foreground">{data.count}</p>
                              <p className="text-[10px] text-muted-foreground uppercase">Items</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatINR(data.amount)}</p>
                              <p className="text-[10px] text-muted-foreground uppercase">Amount</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by subscriber, description, reference..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
                  />
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Categories</SelectItem>
                    {Object.keys(leakageCategories).map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Severity</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="secondary" className="h-10 px-3 flex items-center text-xs">
                  {filteredItems.length} of {leakageItems.length}
                </Badge>
              </div>

              {/* Leakage Items Table */}
              <Card>
                <CardContent className="p-0">
                  <div className="max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Severity</TableHead>
                          <TableHead className="w-[140px]">Type</TableHead>
                          <TableHead>Subscriber</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="hidden lg:table-cell">Reference</TableHead>
                          <TableHead className="hidden md:table-cell">Date</TableHead>
                          <TableHead className="w-[80px]">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              {leakageItems.length === 0 ? "No revenue leakage detected" : "No items match the current filters"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredItems.map((item) => {
                            const sev = severityConfig[item.severity] || severityConfig.MEDIUM;
                            const TypeIcon = typeIcons[item.type] || AlertCircle;
                            return (
                              <TableRow key={item.id} className={sev.bg}>
                                <TableCell>
                                  <Badge variant={severityBadgeVariant[item.severity]} className="text-[10px]">
                                    {item.severity}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    <TypeIcon className={`h-3.5 w-3.5 ${sev.color}`} />
                                    <span className="text-xs font-medium">{item.category}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="text-sm font-medium">{item.subscriberName}</p>
                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="text-sm font-bold text-red-600 dark:text-red-400">{formatINR(item.amount)}</span>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <span className="text-xs font-mono text-muted-foreground">{item.referenceNumber}</span>
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(item.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {item.autoFixable ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
                                      onClick={() => {
                                        apiFetch("/api/revenue/leakage", {
                                          method: "POST",
                                          body: JSON.stringify({ itemIds: [item.id] }),
                                        }).then(() => {
                                          toast.success("Item fixed successfully");
                                          fetchLeakage();
                                        }).catch(() => toast.error("Fix failed"));
                                      }}
                                    >
                                      Fix
                                    </Button>
                                  ) : (
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                      View
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB 2: AGING ANALYSIS                                 */}
        {/* ══════════════════════════════════════════════════════ */}
        <TabsContent value="aging" className="space-y-6">
          {agingLoading ? (
            <div className="space-y-6">
              <SummarySkeleton />
              <Skeleton className="h-80 w-full" />
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <IndianRupee className="h-4 w-4 text-red-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Outstanding</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatINR(agingTotal)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{agingInvoiceCount} invoices</p>
                  </CardContent>
                </Card>
                <Card className="border-red-200 dark:border-red-800/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldAlert className="h-4 w-4 text-red-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Doubtful Debt Provision</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatINR(doubtfulDebt)}</p>
                    <p className="text-xs text-muted-foreground mt-1">50% of 61-90d + 100% of 90+d</p>
                  </CardContent>
                </Card>
                <Card className="border-orange-200 dark:border-orange-800/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Ban className="h-4 w-4 text-orange-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Write-off Candidates</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{writeOffSummary.count}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatINR(writeOffSummary.totalAmount)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">90+ Days Overdue</span>
                    </div>
                    {(() => {
                      const b90 = agingBuckets.find((b) => b.label === "90+ Days");
                      return (
                        <>
                          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{b90?.count || 0}</p>
                          <p className="text-xs text-muted-foreground mt-1">{formatINR(b90?.totalAmount || 0)}</p>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>

              {/* Aging Bucket Bar Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Invoice Aging Buckets</CardTitle>
                  <CardDescription>Outstanding receivables by age</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={agingBuckets} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="totalAmount" name="Outstanding" radius={[6, 6, 0, 0]}>
                          {agingBuckets.map((b, i) => (
                            <rect key={i} fill={b.color} />
                          ))}
                          {agingBuckets.map((b, i) => (
                            <rect key={`bg-${i}`} fill={b.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Bucket Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                    {agingBuckets.map((b) => {
                      const pct = agingTotal > 0 ? ((b.totalAmount / agingTotal) * 100).toFixed(1) : "0";
                      return (
                        <div key={b.label} className="text-center p-2 rounded-lg border" style={{ borderColor: b.color + "40", backgroundColor: b.color + "08" }}>
                          <p className="text-xs font-medium text-muted-foreground">{b.label}</p>
                          <p className="text-sm font-bold" style={{ color: b.color }}>{formatINR(b.totalAmount)}</p>
                          <p className="text-[10px] text-muted-foreground">{b.count} inv · {b.weightedAvgDays}d avg · {pct}%</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Monthly Aging Trend */}
              {monthlyTrend.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Monthly Aging Trend</CardTitle>
                    <CardDescription>Last 6 months aging distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend />
                          <Line type="monotone" dataKey="d1to30" name="1-30 Days" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="d31to60" name="31-60 Days" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="d61to90" name="61-90 Days" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="d90plus" name="90+ Days" stroke="#991B1B" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Write-off Recommendations + Area Aging side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Write-off Candidates */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Ban className="h-4 w-4 text-red-500" />
                          Write-off Recommendations
                        </CardTitle>
                        <CardDescription>90+ days overdue with SUSPENDED/DISCONNECTED subscriber</CardDescription>
                      </div>
                      <Badge variant="destructive">{writeOffSummary.count}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[300px] overflow-y-auto">
                      {writeOffCandidates.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No write-off candidates</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice</TableHead>
                              <TableHead>Subscriber</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {writeOffCandidates.slice(0, 20).map((c) => (
                              <TableRow key={c.invoiceId} className="bg-red-50/50 dark:bg-red-950/20">
                                <TableCell className="text-xs font-mono">{c.invoiceNumber}</TableCell>
                                <TableCell>
                                  <p className="text-sm font-medium">{c.subscriberName}</p>
                                  <p className="text-[10px] text-muted-foreground">{c.daysOverdue}d overdue · {c.areaName}</p>
                                </TableCell>
                                <TableCell className="text-right text-sm font-bold text-red-600 dark:text-red-400">{formatINR(c.balanceAmount)}</TableCell>
                                <TableCell>
                                  <Badge variant={c.subscriberStatus === "DISCONNECTED" ? "destructive" : "secondary"} className="text-[10px]">
                                    {c.subscriberStatus}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Area-wise Aging */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Area-wise Aging</CardTitle>
                    <CardDescription>Outstanding breakdown by area</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[300px] overflow-y-auto">
                      {areaAging.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No area data</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Area</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-right hidden sm:table-cell">1-30d</TableHead>
                              <TableHead className="text-right hidden sm:table-cell">61-90d</TableHead>
                              <TableHead className="text-right">90+d</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {areaAging.slice(0, 20).map((a) => (
                              <TableRow key={a.areaId}>
                                <TableCell className="text-sm font-medium">{a.areaName}</TableCell>
                                <TableCell className="text-right text-sm font-bold">{formatINR(a.total)}</TableCell>
                                <TableCell className="text-right hidden sm:table-cell text-xs text-amber-600 dark:text-amber-400">{formatINR(a.d1to30)}</TableCell>
                                <TableCell className="text-right hidden sm:table-cell text-xs text-orange-600 dark:text-orange-400">{formatINR(a.d61to90)}</TableCell>
                                <TableCell className="text-right text-xs text-red-600 dark:text-red-400 font-semibold">{formatINR(a.d90plus)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════ */}
        {/* TAB 3: AUDIT TRAIL                                    */}
        {/* ══════════════════════════════════════════════════════ */}
        <TabsContent value="audit" className="space-y-6">
          {auditLoading ? (
            <div className="space-y-6">
              <SummarySkeleton />
              <Skeleton className="h-80 w-full" />
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <IndianRupee className="h-4 w-4 text-red-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Adjustments</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{formatINR(auditSummary?.totalAdjustments || 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{auditAdjustments.length} total items</p>
                  </CardContent>
                </Card>
                <Card className="border-teal-200 dark:border-teal-800/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-teal-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Credit Notes</span>
                    </div>
                    <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">{formatINR(auditSummary?.totalCreditNotes || 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{auditGroups[0]?.count || 0} notes</p>
                  </CardContent>
                </Card>
                <Card className="border-orange-200 dark:border-orange-800/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="h-4 w-4 text-orange-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Refunds</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{formatINR(auditSummary?.totalRefunds || 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{auditGroups[1]?.count || 0} refunds</p>
                  </CardContent>
                </Card>
                <Card className="border-red-200 dark:border-red-800/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldAlert className="h-4 w-4 text-red-500" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Audit Flags</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{auditSummary?.anomalyCount || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">{auditSummary?.criticalAnomalies || 0} critical</p>
                  </CardContent>
                </Card>
              </div>

              {/* Anomaly Flags */}
              {auditAnomalies.length > 0 && (
                <Card className="border-red-200 dark:border-red-800/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-red-500" />
                      <div>
                        <CardTitle className="text-base">Anomaly Flags</CardTitle>
                        <CardDescription>Unusual patterns detected in financial adjustments</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[250px] overflow-y-auto">
                      {auditAnomalies.map((a) => {
                        const sev = severityConfig[a.severity] || severityConfig.MEDIUM;
                        const SevIcon = sev.icon;
                        return (
                          <div key={a.id} className={`flex items-start gap-3 p-3 rounded-lg mb-2 border ${sev.bg} ${sev.border}`}>
                            <SevIcon className={`h-4 w-4 mt-0.5 shrink-0 ${sev.color}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <Badge variant={severityBadgeVariant[a.severity]} className="text-[10px]">{a.severity}</Badge>
                                <span className="text-xs font-medium text-muted-foreground uppercase">{a.type.replace(/_/g, " ")}</span>
                              </div>
                              <p className="text-sm text-foreground">{a.description}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {a.subscriberName} · {formatINR(a.amount)} · {a.referenceNumber}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Monthly Adjustment Trend */}
              {auditTrend.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Monthly Adjustment Trend</CardTitle>
                    <CardDescription>Last 6 months breakdown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={auditTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend />
                          <Bar dataKey="creditNotes" name="Credit Notes" fill="#0D9488" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="refunds" name="Refunds" fill="#F97316" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="discounts" name="Discounts" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top 10 Largest Adjustments + Financial Adjustments Table */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top 10 Largest */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Top 10 Largest Adjustments</CardTitle>
                    <CardDescription>Highest value financial adjustments</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Subscriber</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditTop10.map((item, idx) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-muted-foreground w-4">{idx + 1}.</span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {item.type === "CREDIT_NOTE" ? "CN" : item.type === "REFUND" ? "RF" : "DI"}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm font-medium">{item.subscriberName}</p>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">{item.referenceNumber}</p>
                              </TableCell>
                              <TableCell className="text-right text-sm font-bold text-red-600 dark:text-red-400">{formatINR(item.amount)}</TableCell>
                            </TableRow>
                          ))}
                          {auditTop10.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-6 text-muted-foreground text-sm">No adjustments</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* All Financial Adjustments */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Financial Adjustments</CardTitle>
                    <CardDescription>Credit notes, refunds, and discounts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Subscriber</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="hidden sm:table-cell">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditAdjustments.slice(0, 30).map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Badge
                                  variant={item.type === "CREDIT_NOTE" ? "outline" : item.type === "REFUND" ? "secondary" : "default"}
                                  className="text-[10px]"
                                >
                                  {item.type === "CREDIT_NOTE" ? "CN" : item.type === "REFUND" ? "Refund" : "Disc"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm font-medium">{item.subscriberName}</p>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{item.reason}</p>
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium">{formatINR(item.amount)}</TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {auditAdjustments.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">No adjustments found</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
