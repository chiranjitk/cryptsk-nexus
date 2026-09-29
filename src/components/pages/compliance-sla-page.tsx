"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Activity,
  FileText,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Info,
  Timer,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──

interface SlaData {
  overallCompliance: number;
  byPriority: Record<string, PriorityStats>;
  uptime: UptimeData;
  responseTime: Record<string, { avgHours: number }>;
  resolutionTime: Record<string, { avgHours: number; medianHours: number; p95Hours: number }>;
  escalation: Record<string, { rate: number; count: number; total: number }>;
  trend: TrendItem[];
  breaches: BreachItem[];
}

interface PriorityStats {
  total: number;
  resolved: number;
  onTime: number;
  breached: number;
  open: number;
  complianceRate: number;
  avgResolutionHours: number;
  avgResponseHours: number;
  p95ResolutionHours: number;
  medianResolutionHours: number;
  escalationRate: number;
  escalatedCount: number;
}

interface UptimeData {
  percentage: number;
  onlineCount: number;
  offlineCount: number;
  totalDevices: number;
  planTarget: number;
  devicesBelowSla: Array<{ name: string; type: string; status: string; lastSeenAt: string | null }>;
}

interface TrendItem {
  month: string;
  complianceRate: number;
  totalResolved: number;
  breachedCount: number;
  avgResolutionHours: number;
}

interface BreachItem {
  ticketNumber: string;
  subscriberName: string;
  priority: string;
  type: string;
  slaHours: number;
  resolvedAt: string | null;
  createdAt: string;
  overdueBy: string;
  status: string;
}

interface AuditData {
  period: { days: number; from: string; to: string };
  userActivity: {
    totalLogins: number;
    uniqueActiveUsers: number;
    avgDailyLogins: number;
    failedLoginCount: number;
    dailyLoginActivity: Array<{ date: string; logins: number; activeUsers: number }>;
    peakLoginDay: { date: string; logins: number; activeUsers: number } | null;
  };
  dataAccess: {
    totalActions: number;
    mostAccessedResources: Array<{ resource: string; count: number }>;
    uniqueIps: number;
  };
  securityEvents: {
    total: number;
    events: Array<{
      id: string;
      type: string;
      userName: string;
      ipAddress: string;
      timestamp: string;
      details: string;
      severity: "LOW" | "MEDIUM" | "HIGH";
    }>;
    highSeverityCount: number;
    mediumSeverityCount: number;
  };
  configChanges: {
    total: number;
    timeline: Array<{
      id: string;
      userName: string;
      action: string;
      entity: string;
      entityId: string;
      ipAddress: string;
      timestamp: string;
      details: Record<string, unknown> | null;
    }>;
    createActionCount: number;
    updateActionCount: number;
    deleteActionCount: number;
  };
  financialAudit: {
    totalInvoiced: number;
    totalDiscounts: number;
    totalLateFees: number;
    totalCreditNotes: number;
    totalRefunds: number;
    invoicesProcessed: number;
    cancelledInvoices: number;
    creditNoteCount: number;
    refundCount: number;
    financialLogEntries: number;
    creditNotes: Array<{ id: string; amount: number; reason: string; status: string; createdAt: string; invoice: { invoiceNumber: string; subscriber: { name: string } } | null }>;
    refunds: Array<{ id: string; amount: number; reason: string; status: string; createdAt: string; payment: { subscriber: { name: string } } | null }>;
  };
}

interface RegulatoryData {
  overallScore: number;
  checklist: Array<{
    item: string;
    status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";
    details: string;
    recommendation?: string;
  }>;
  tax: {
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalTaxCollected: number;
    totalRevenue: number;
    currentMonthTax: number;
    currentMonthRevenue: number;
    invoicesWithTax: number;
    taxComplianceRate: number;
    currentMonth: string;
  };
  kyc: {
    totalSubscribers: number;
    kycVerified: number;
    kycPending: number;
    kycRate: number;
    pendingSubscribers: Array<{ id: string; name: string; phone: string; createdAt: string; status: string }>;
  };
  license: {
    companyName: string;
    gstin: string;
    panNumber: string;
    cinNumber: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  dataRetention: {
    earliestEntry: string | null;
    latestEntry: string | null;
    totalLogs: number;
    coverageDays: number;
    retentionDays: number;
    autoDeleteEnabled: boolean;
  };
  summary: { total: number; compliant: number; partial: number; nonCompliant: number };
}

// ── Priority config ──
const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  P1_CRITICAL: { label: "P1 Critical", color: "text-red-600", bg: "bg-red-500" },
  P2_HIGH: { label: "P2 High", color: "text-amber-600", bg: "bg-amber-500" },
  P3_MEDIUM: { label: "P3 Medium", color: "text-teal-600", bg: "bg-teal-500" },
  P4_LOW: { label: "P4 Low", color: "text-emerald-600", bg: "bg-emerald-500" },
};

const PRIORITIES = ["P1_CRITICAL", "P2_HIGH", "P3_MEDIUM", "P4_LOW"];

// ── Circular Gauge Component ──
function CircularGauge({ value, size = 160, strokeWidth = 12, target = 95 }: { value: number; size?: number; strokeWidth?: number; target?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value, 100) / 100;
  const offset = circumference - progress * circumference;

  const color = value >= target ? "#0D9488" : value >= 80 ? "#F59E0B" : "#DC2626";
  const label = value >= target ? "Target Met" : value >= 80 ? "Below Target" : "Critical";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{value}%</span>
        <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
      </div>
    </div>
  );
}

// ── Mini progress bar ──
function MiniBar({ value, max = 100, color = "bg-teal-500", className = "" }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className={`h-2 bg-muted rounded-full overflow-hidden ${className}`}>
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Skeleton loader ──
function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

// ── MAIN COMPONENT ──
export default function ComplianceSlaPage() {
  const [activeTab, setActiveTab] = useState("sla-dashboard");
  const [slaData, setSlaData] = useState<SlaData | null>(null);
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [regData, setRegData] = useState<RegulatoryData | null>(null);
  const [loadingSla, setLoadingSla] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingReg, setLoadingReg] = useState(false);
  const [auditDays, setAuditDays] = useState("30");
  const [breachSearch, setBreachSearch] = useState("");

  const fetchSla = useCallback(async () => {
    setLoadingSla(true);
    try {
      const data = await apiFetch<SlaData>("/api/compliance/sla", { credentials: "include" });
      setSlaData(data);
    } catch {
      toast.error("Failed to load SLA compliance data");
    } finally {
      setLoadingSla(false);
    }
  }, []);

  const fetchAudit = useCallback(async (days: string) => {
    setLoadingAudit(true);
    try {
      const data = await apiFetch<AuditData>(`/api/compliance/audit-report?days=${days}`, { credentials: "include" });
      setAuditData(data);
    } catch {
      toast.error("Failed to load audit report");
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  const fetchReg = useCallback(async () => {
    setLoadingReg(true);
    try {
      const data = await apiFetch<RegulatoryData>("/api/compliance/regulatory", { credentials: "include" });
      setRegData(data);
    } catch {
      toast.error("Failed to load regulatory compliance data");
    } finally {
      setLoadingReg(false);
    }
  }, []);

  useEffect(() => { fetchSla(); }, [fetchSla]);
  useEffect(() => { fetchAudit(auditDays); }, [fetchAudit, auditDays]);
  useEffect(() => { fetchReg(); }, [fetchReg]);

  const handleExportAudit = () => {
    if (!auditData) return;
    const report = JSON.stringify(auditData, null, 2);
    const blob = new Blob([report], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-report-${auditDays}d-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit report exported");
  };

  // ── Render helpers ──
  const complianceColor = (rate: number) => rate >= 95 ? "text-teal-600" : rate >= 80 ? "text-amber-600" : "text-red-600";
  const complianceBadge = (rate: number) => rate >= 95 ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" : rate >= 80 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";

  const filteredBreaches = slaData?.breaches.filter(
    (b) =>
      !breachSearch ||
      b.ticketNumber.toLowerCase().includes(breachSearch.toLowerCase()) ||
      b.subscriberName.toLowerCase().includes(breachSearch.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-teal-600" />
            Compliance & SLA Reporting
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            SLA compliance, audit trails, regulatory compliance dashboard
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchSla(); fetchAudit(auditDays); fetchReg(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh All
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="sla-dashboard" className="text-xs">
            <BarChart3 className="w-3.5 h-3.5 mr-1" />
            SLA Dashboard
          </TabsTrigger>
          <TabsTrigger value="response-resolution" className="text-xs">
            <Timer className="w-3.5 h-3.5 mr-1" />
            Response & Resolution
          </TabsTrigger>
          <TabsTrigger value="audit-report" className="text-xs">
            <FileText className="w-3.5 h-3.5 mr-1" />
            Audit Report
          </TabsTrigger>
          <TabsTrigger value="regulatory" className="text-xs">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            Regulatory
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: SLA Dashboard ═══ */}
        <TabsContent value="sla-dashboard" className="space-y-6 mt-6">
          {loadingSla ? <TabSkeleton /> : slaData ? (
            <>
              {/* Top summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-teal-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Overall SLA Compliance</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center gap-4">
                    <CircularGauge value={slaData.overallCompliance} size={80} strokeWidth={8} />
                    <div>
                      <p className={`text-2xl font-bold ${complianceColor(slaData.overallCompliance)}`}>
                        {slaData.overallCompliance}%
                      </p>
                      <p className="text-xs text-muted-foreground">Target: 95%</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-red-500">
                  <CardHeader className="pb-2">
                    <CardDescription>SLA Breaches</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-red-600">{slaData.breaches.length}</p>
                    <p className="text-xs text-muted-foreground">Total complaints breaching SLA</p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-amber-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Network Uptime</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${complianceColor(slaData.uptime.percentage)}`}>
                      {slaData.uptime.percentage}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {slaData.uptime.onlineCount} / {slaData.uptime.totalDevices} devices online
                      {slaData.uptime.planTarget > 0 && ` (Target: ${slaData.uptime.planTarget}%)`}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-teal-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Avg Resolution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {slaData.resolutionTime.P3_MEDIUM?.avgHours || 0}h
                    </p>
                    <p className="text-xs text-muted-foreground">P3 average across all resolved</p>
                  </CardContent>
                </Card>
              </div>

              {/* Priority-wise compliance + Trend */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Priority bars */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Priority-wise Compliance</CardTitle>
                    <CardDescription>SLA compliance rate broken by priority level</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {PRIORITIES.map((p) => {
                      const stats = slaData.byPriority[p];
                      const cfg = PRIORITY_CONFIG[p];
                      if (!stats) return null;
                      return (
                        <div key={p} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5">
                                {stats.resolved}/{stats.total}
                              </Badge>
                            </div>
                            <span className={`font-bold ${complianceColor(stats.complianceRate)}`}>
                              {stats.complianceRate}%
                            </span>
                          </div>
                          <MiniBar value={stats.complianceRate} color={cfg.bg} />
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{stats.breached} breached</span>
                            <span>{stats.open} open</span>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Monthly trend */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Monthly Compliance Trend</CardTitle>
                    <CardDescription>Last 6 months SLA compliance and resolution time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {slaData.trend.map((t, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-16 shrink-0">{t.month}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <MiniBar
                                value={t.complianceRate}
                                color={t.complianceRate >= 95 ? "bg-teal-500" : t.complianceRate >= 80 ? "bg-amber-500" : "bg-red-500"}
                              />
                            </div>
                          </div>
                          <span className={`text-xs font-bold w-12 text-right ${complianceColor(t.complianceRate)}`}>
                            {t.complianceRate}%
                          </span>
                          <span className="text-[10px] text-muted-foreground w-20 text-right">
                            {t.totalResolved} resolved
                          </span>
                          {t.breachedCount > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1.5">
                              {t.breachedCount} breached
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Uptime comparison */}
                    <div className="mt-6 pt-4 border-t">
                      <h4 className="text-sm font-medium mb-3">Uptime Compliance vs Target</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Actual Uptime</span>
                          <span className={`font-bold ${complianceColor(slaData.uptime.percentage)}`}>
                            {slaData.uptime.percentage}%
                          </span>
                        </div>
                        <MiniBar value={slaData.uptime.percentage} color={slaData.uptime.percentage >= (slaData.uptime.planTarget || 99) ? "bg-teal-500" : "bg-red-500"} />
                        {slaData.uptime.planTarget > 0 && (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Plan Target</span>
                              <span className="font-medium">{slaData.uptime.planTarget}%</span>
                            </div>
                            <MiniBar value={slaData.uptime.planTarget} color="bg-muted" />
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* SLA Breach list */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        SLA Breach List
                      </CardTitle>
                      <CardDescription>Complaints that breached their SLA deadline</CardDescription>
                    </div>
                    <Badge variant="destructive">{filteredBreaches.length} breaches</Badge>
                  </div>
                  <div className="mt-3">
                    <input
                      type="text"
                      placeholder="Search by ticket or subscriber..."
                      value={breachSearch}
                      onChange={(e) => setBreachSearch(e.target.value)}
                      className="w-full md:w-72 px-3 py-1.5 text-sm rounded-md border bg-background input-cryptsk"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredBreaches.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-teal-500 mb-2" />
                      <p className="text-sm font-medium">No SLA breaches found</p>
                      {breachSearch && <p className="text-xs mt-1">Try a different search term</p>}
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Ticket</TableHead>
                            <TableHead className="text-xs">Subscriber</TableHead>
                            <TableHead className="text-xs">Priority</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">SLA Hours</TableHead>
                            <TableHead className="text-xs">Overdue By</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredBreaches.slice(0, 30).map((b, idx) => (
                            <TableRow key={idx} className="hover:bg-red-50/50 dark:hover:bg-red-950/10">
                              <TableCell className="text-xs font-mono">{b.ticketNumber}</TableCell>
                              <TableCell className="text-xs">{b.subscriberName}</TableCell>
                              <TableCell>
                                <Badge className={`text-[10px] ${PRIORITY_CONFIG[b.priority]?.bg || "bg-gray-500"} text-white`}>
                                  {PRIORITY_CONFIG[b.priority]?.label || b.priority}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">{b.type.replace(/_/g, " ")}</TableCell>
                              <TableCell className="text-xs">{b.slaHours}h</TableCell>
                              <TableCell className="text-xs font-bold text-red-600">{b.overdueBy}</TableCell>
                              <TableCell>
                                <Badge variant={b.resolvedAt ? "secondary" : "destructive"} className="text-[10px]">
                                  {b.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ═══ TAB 2: Response & Resolution ═══ */}
        <TabsContent value="response-resolution" className="space-y-6 mt-6">
          {loadingSla ? <TabSkeleton /> : slaData ? (
            <>
              {/* Response time cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {PRIORITIES.map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  const resp = slaData.responseTime[p];
                  const res = slaData.resolutionTime[p];
                  const esc = slaData.escalation[p];
                  return (
                    <Card key={p} className={`border-l-4 ${cfg.bg.replace("bg-", "border-l-")}`}>
                      <CardHeader className="pb-2">
                        <CardDescription className={cfg.color}>{cfg.label}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Avg Response</span>
                          <span className="font-semibold">{resp?.avgHours || 0}h</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Avg Resolution</span>
                          <span className="font-semibold">{res?.avgHours || 0}h</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Median</span>
                          <span className="font-semibold">{res?.medianHours || 0}h</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">P95</span>
                          <span className="font-bold text-red-600">{res?.p95Hours || 0}h</span>
                        </div>
                        <div className="flex justify-between text-xs pt-1 border-t">
                          <span className="text-muted-foreground">Escalation Rate</span>
                          <span className={`font-semibold ${esc?.rate > 20 ? "text-red-600" : "text-teal-600"}`}>
                            {esc?.rate || 0}% ({esc?.count || 0}/{esc?.total || 0})
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Resolution time charts (bar representation) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resolution Time by Priority</CardTitle>
                  <CardDescription>Average, median, and P95 resolution times</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">
                    {PRIORITIES.map((p) => {
                      const cfg = PRIORITY_CONFIG[p];
                      const res = slaData.resolutionTime[p];
                      if (!res || res.avgHours === 0) return null;
                      const maxVal = Math.max(res.avgHours, res.p95Hours, 1);
                      return (
                        <div key={p} className="space-y-2">
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-medium ${cfg.color} w-24`}>{cfg.label}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">Average</span>
                                <span className="font-medium">{res.avgHours}h</span>
                              </div>
                              <MiniBar value={res.avgHours} max={maxVal} color="bg-teal-500" />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">Median</span>
                                <span className="font-medium">{res.medianHours}h</span>
                              </div>
                              <MiniBar value={res.medianHours} max={maxVal} color="bg-amber-500" />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">P95</span>
                                <span className="font-medium text-red-600">{res.p95Hours}h</span>
                              </div>
                              <MiniBar value={res.p95Hours} max={maxVal} color="bg-red-500" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* P95 Cards */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">P95 Resolution Time</CardTitle>
                  <CardDescription>95th percentile resolution time by priority</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {PRIORITIES.map((p) => {
                      const cfg = PRIORITY_CONFIG[p];
                      const res = slaData.resolutionTime[p];
                      return (
                        <div key={p} className="text-center p-4 rounded-lg bg-muted/50 border">
                          <p className={`text-sm font-medium ${cfg.color} mb-2`}>{cfg.label}</p>
                          <p className="text-3xl font-bold">{res?.p95Hours || 0}</p>
                          <p className="text-xs text-muted-foreground">hours</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Escalation trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Escalation Tracking</CardTitle>
                  <CardDescription>Escalation rate and count by priority</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {PRIORITIES.map((p) => {
                      const cfg = PRIORITY_CONFIG[p];
                      const esc = slaData.escalation[p];
                      return (
                        <div key={p} className="flex items-center gap-4">
                          <span className={`text-sm font-medium w-24 ${cfg.color}`}>{cfg.label}</span>
                          <div className="flex-1">
                            <MiniBar
                              value={esc?.rate || 0}
                              max={100}
                              color={esc?.rate > 20 ? "bg-red-500" : esc?.rate > 10 ? "bg-amber-500" : "bg-teal-500"}
                            />
                          </div>
                          <div className="text-right w-28">
                            <span className={`text-sm font-bold ${esc?.rate > 20 ? "text-red-600" : "text-foreground"}`}>
                              {esc?.rate || 0}%
                            </span>
                            <p className="text-[10px] text-muted-foreground">{esc?.count || 0} of {esc?.total || 0}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ═══ TAB 3: Audit Report ═══ */}
        <TabsContent value="audit-report" className="space-y-6 mt-6">
          {loadingAudit ? <TabSkeleton /> : auditData ? (
            <>
              {/* Period selector + Export */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Period:</span>
                  <Select value={auditDays} onValueChange={setAuditDays}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="14">Last 14 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="60">Last 60 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    ({auditData.period.from.split("T")[0]} to {auditData.period.to.split("T")[0]})
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportAudit}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Export Report
                </Button>
              </div>

              {/* User activity summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="border-l-4 border-l-teal-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Total Logins</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-teal-600">{auditData.userActivity.totalLogins}</p>
                    <p className="text-xs text-muted-foreground">Last {auditData.period.days} days</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-emerald-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Active Users</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-emerald-600">{auditData.userActivity.uniqueActiveUsers}</p>
                    <p className="text-xs text-muted-foreground">Unique users</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-amber-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Avg Daily Logins</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-amber-600">{auditData.userActivity.avgDailyLogins}</p>
                    {auditData.userActivity.peakLoginDay && (
                      <p className="text-xs text-muted-foreground">
                        Peak: {auditData.userActivity.peakLoginDay.date} ({auditData.userActivity.peakLoginDay.logins})
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Failed Logins</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-red-600">{auditData.userActivity.failedLoginCount}</p>
                    <p className="text-xs text-muted-foreground">Authentication failures</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-teal-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Total Actions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{auditData.dataAccess.totalActions}</p>
                    <p className="text-xs text-muted-foreground">From {auditData.dataAccess.uniqueIps} IPs</p>
                  </CardContent>
                </Card>
              </div>

              {/* Security events + Config changes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Security events */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      Security Events
                      {auditData.securityEvents.highSeverityCount > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {auditData.securityEvents.highSeverityCount} HIGH
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Unusual login times, brute force attempts, excessive access
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {auditData.securityEvents.events.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <CheckCircle2 className="w-6 h-6 mx-auto text-teal-500 mb-1" />
                        <p className="text-sm">No security events detected</p>
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {auditData.securityEvents.events.map((evt, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg border text-xs ${
                              evt.severity === "HIGH"
                                ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
                                : evt.severity === "MEDIUM"
                                  ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
                                  : "bg-muted/50 border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{evt.type}</span>
                              <Badge variant={evt.severity === "HIGH" ? "destructive" : "secondary"} className="text-[10px]">
                                {evt.severity}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground mt-1">{evt.details}</p>
                            <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                              <span>{evt.userName}</span>
                              <span>{evt.ipAddress}</span>
                              <span>{new Date(evt.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Configuration changes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="w-4 h-4 text-teal-500" />
                      Configuration Changes
                    </CardTitle>
                    <CardDescription>
                      {auditData.configChanges.total} changes ({auditData.configChanges.createActionCount} create,{" "}
                      {auditData.configChanges.updateActionCount} update,{" "}
                      {auditData.configChanges.deleteActionCount} delete)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {auditData.configChanges.timeline.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Info className="w-6 h-6 mx-auto text-muted mb-1" />
                        <p className="text-sm">No configuration changes in this period</p>
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Action</TableHead>
                              <TableHead className="text-xs">User</TableHead>
                              <TableHead className="text-xs">Entity</TableHead>
                              <TableHead className="text-xs">IP</TableHead>
                              <TableHead className="text-xs">Time</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {auditData.configChanges.timeline.slice(0, 25).map((item, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  <Badge
                                    variant="secondary"
                                    className={`text-[10px] ${
                                      item.action.toLowerCase().includes("delete")
                                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                        : item.action.toLowerCase().includes("create")
                                          ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
                                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                    }`}
                                  >
                                    {item.action}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">{item.userName}</TableCell>
                                <TableCell className="text-xs">{item.entity}</TableCell>
                                <TableCell className="text-xs font-mono">{item.ipAddress}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {new Date(item.timestamp).toLocaleDateString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Financial audit */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    Financial Audit Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Total Invoiced</p>
                      <p className="text-lg font-bold">{formatINR(auditData.financialAudit.totalInvoiced)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Discounts</p>
                      <p className="text-lg font-bold text-amber-600">{formatINR(auditData.financialAudit.totalDiscounts)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Late Fees</p>
                      <p className="text-lg font-bold text-red-600">{formatINR(auditData.financialAudit.totalLateFees)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Credit Notes</p>
                      <p className="text-lg font-bold text-teal-600">{formatINR(auditData.financialAudit.totalCreditNotes)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Refunds</p>
                      <p className="text-lg font-bold text-red-600">{formatINR(auditData.financialAudit.totalRefunds)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Invoices</p>
                      <p className="text-lg font-bold">{auditData.financialAudit.invoicesProcessed}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Cancelled</p>
                      <p className="text-lg font-bold text-red-600">{auditData.financialAudit.cancelledInvoices}</p>
                    </div>
                  </div>

                  {/* Credit notes + Refunds table */}
                  {auditData.financialAudit.creditNotes.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium mb-2">Recent Credit Notes</h4>
                      <div className="max-h-40 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Invoice</TableHead>
                              <TableHead className="text-xs">Subscriber</TableHead>
                              <TableHead className="text-xs">Amount</TableHead>
                              <TableHead className="text-xs">Reason</TableHead>
                              <TableHead className="text-xs">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {auditData.financialAudit.creditNotes.slice(0, 10).map((cn, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="text-xs font-mono">{cn.invoice?.invoiceNumber || "-"}</TableCell>
                                <TableCell className="text-xs">{cn.invoice?.subscriber?.name || "-"}</TableCell>
                                <TableCell className="text-xs font-bold text-teal-600">{formatINR(cn.amount)}</TableCell>
                                <TableCell className="text-xs">{cn.reason}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{new Date(cn.createdAt).toLocaleDateString()}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {auditData.financialAudit.refunds.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Recent Refunds</h4>
                      <div className="max-h-40 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Subscriber</TableHead>
                              <TableHead className="text-xs">Amount</TableHead>
                              <TableHead className="text-xs">Reason</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {auditData.financialAudit.refunds.slice(0, 10).map((r, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="text-xs">{r.payment?.subscriber?.name || "-"}</TableCell>
                                <TableCell className="text-xs font-bold text-red-600">{formatINR(r.amount)}</TableCell>
                                <TableCell className="text-xs">{r.reason}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-[10px]">{r.status}</Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ═══ TAB 4: Regulatory Compliance ═══ */}
        <TabsContent value="regulatory" className="space-y-6 mt-6">
          {loadingReg ? <TabSkeleton /> : regData ? (
            <>
              {/* Overall score + Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-teal-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Compliance Score</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center gap-4">
                    <CircularGauge value={regData.overallScore} size={80} strokeWidth={8} target={80} />
                    <div>
                      <p className="text-sm font-medium">{regData.summary.compliant} Compliant</p>
                      <p className="text-xs text-amber-600">{regData.summary.partial} Partial</p>
                      <p className="text-xs text-red-600">{regData.summary.nonCompliant} Non-Compliant</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-amber-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Tax Collected (All Time)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatINR(regData.tax.totalTaxCollected)}</p>
                    <p className="text-xs text-muted-foreground">
                      CGST: {formatINR(regData.tax.totalCgst)} | SGST: {formatINR(regData.tax.totalSgst)} | IGST: {formatINR(regData.tax.totalIgst)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-teal-500">
                  <CardHeader className="pb-2">
                    <CardDescription>KYC Verification</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${complianceColor(regData.kyc.kycRate)}`}>
                      {regData.kyc.kycRate}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {regData.kyc.kycVerified} / {regData.kyc.totalSubscribers} verified
                      {regData.kyc.kycPending > 0 && ` (${regData.kyc.kycPending} pending)`}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-l-4 border-l-emerald-500">
                  <CardHeader className="pb-2">
                    <CardDescription>Data Retention</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{regData.dataRetention.coverageDays} days</p>
                    <p className="text-xs text-muted-foreground">
                      {regData.dataRetention.totalLogs.toLocaleString()} audit logs | Target: {regData.dataRetention.retentionDays}d
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Compliance Checklist */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Compliance Checklist</CardTitle>
                  <CardDescription>Regulatory compliance status for each requirement</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {regData.checklist.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-lg border ${
                          item.status === "COMPLIANT"
                            ? "bg-teal-50 border-teal-200 dark:bg-teal-950/20 dark:border-teal-900"
                            : item.status === "PARTIAL"
                              ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
                              : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            {item.status === "COMPLIANT" ? (
                              <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                            ) : item.status === "PARTIAL" ? (
                              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{item.item}</span>
                                <Badge
                                  className={`text-[10px] ${
                                    item.status === "COMPLIANT"
                                      ? "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400"
                                      : item.status === "PARTIAL"
                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                  }`}
                                >
                                  {item.status.replace("_", " ")}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{item.details}</p>
                              {item.recommendation && (
                                <p className="text-xs mt-1.5 flex items-start gap-1">
                                  <ArrowUpRight className="w-3 h-3 shrink-0 mt-0.5 text-amber-600" />
                                  <span className="text-amber-700 dark:text-amber-400">{item.recommendation}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Tax + KYC details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Tax compliance detail */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tax Compliance Summary</CardTitle>
                    <CardDescription>GST collection and invoice tax compliance</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Total Revenue</p>
                        <p className="text-lg font-bold">{formatINR(regData.tax.totalRevenue)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Total Tax Collected</p>
                        <p className="text-lg font-bold text-teal-600">{formatINR(regData.tax.totalTaxCollected)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">{regData.tax.currentMonth} Tax</p>
                        <p className="text-lg font-bold">{formatINR(regData.tax.currentMonthTax)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Tax Compliance</p>
                        <p className={`text-lg font-bold ${complianceColor(regData.tax.taxComplianceRate)}`}>
                          {regData.tax.taxComplianceRate}%
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Invoices with Tax</span>
                        <span className="font-medium">{regData.tax.invoicesWithTax}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tax Filing Readiness</span>
                        <Badge className={regData.tax.taxComplianceRate >= 95 ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}>
                          {regData.tax.taxComplianceRate >= 95 ? "Ready" : "Review Needed"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* KYC detail */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">KYC Verification Status</CardTitle>
                    <CardDescription>Subscriber identity verification progress</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 mb-4">
                      <MiniBar value={regData.kyc.kycRate} color={regData.kyc.kycRate >= 95 ? "bg-teal-500" : "bg-amber-500"} className="flex-1" />
                      <span className={`text-sm font-bold ${complianceColor(regData.kyc.kycRate)}`}>
                        {regData.kyc.kycRate}%
                      </span>
                    </div>

                    {regData.kyc.pendingSubscribers.length > 0 ? (
                      <div className="max-h-48 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Subscriber</TableHead>
                              <TableHead className="text-xs">Phone</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs">Since</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {regData.kyc.pendingSubscribers.slice(0, 15).map((sub, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="text-xs">{sub.name}</TableCell>
                                <TableCell className="text-xs font-mono">{sub.phone}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-[10px]">{sub.status}</Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {new Date(sub.createdAt).toLocaleDateString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <CheckCircle2 className="w-6 h-6 mx-auto text-teal-500 mb-1" />
                        <p className="text-sm">All subscribers verified</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Data retention */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Data Retention & Audit Coverage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">First Entry</p>
                      <p className="text-sm font-medium">
                        {regData.dataRetention.earliestEntry
                          ? new Date(regData.dataRetention.earliestEntry).toLocaleDateString()
                          : "N/A"}
                      </p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Last Entry</p>
                      <p className="text-sm font-medium">
                        {regData.dataRetention.latestEntry
                          ? new Date(regData.dataRetention.latestEntry).toLocaleDateString()
                          : "N/A"}
                      </p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Coverage</p>
                      <p className="text-lg font-bold">{regData.dataRetention.coverageDays} days</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Retention Policy</p>
                      <p className="text-lg font-bold">{regData.dataRetention.retentionDays} days</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Auto-Delete</p>
                      <Badge className={regData.dataRetention.autoDeleteEnabled ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}>
                        {regData.dataRetention.autoDeleteEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
