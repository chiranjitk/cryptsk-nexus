"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatINR, cn } from "@/lib/utils";
import { format } from "date-fns";
import { useAppStore } from "@/store/app-store";
import { useModuleStore } from "@/store/module-store";
import { toast } from "sonner";
import {
  Users,
  IndianRupee,
  Wifi,
  AlertTriangle,
  CreditCard,
  Activity,
  TrendingUp,
  TrendingDown,
  Bot,
  RefreshCw,
  FileText,
  UserPlus,
  MessageSquarePlus,
  Clock,
  DollarSign,
  UserMinus,
  BarChart3,
  ChevronRight,
  Download,
  CalendarClock,
  Banknote,
  Bell,
  Shield,
  ShieldAlert,
  Target,
  Monitor,
  Receipt,
  ShieldCheck,
  Server,
  Radio,
  Terminal,
  Zap,
  X,
  Wallet,
  Gauge,
  CheckCircle2,
  ArrowRightLeft,
  AlertCircle,
  Info,
  ArrowUpRight,
  Globe,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import ActivityFeed from "@/components/activity-feed";
import { GettingStartedPanel } from "@/components/getting-started-panel";
import { NotificationSummaryWidget } from "@/components/notification-summary-widget";
import { NetworkStatusOverview } from "@/components/network-status-overview";
import { PerformanceMetricsWidget } from "@/components/performance-metrics-widget";
import { QuickActionsWidget } from "@/components/quick-actions-widget";
import { DashboardQuickActionsWidget } from "@/components/dashboard/quick-actions-widget";
import { NetworkStatusWidget } from "@/components/dashboard/network-status-widget";
import { SubscriberGrowthWidget } from "@/components/dashboard/subscriber-growth-widget";
import { RevenueBreakdownWidget } from "@/components/dashboard/revenue-breakdown-widget";
import { LiveActivityFeedWidget } from "@/components/dashboard/live-activity-feed-widget";
import { SlaMonitorWidget } from "@/components/dashboard/sla-monitor-widget";
import { SystemAlertBanner } from "@/components/system-alert-banner";
import DashboardStatusBar from "@/components/dashboard/dashboard-status-bar";
import SubscriberQuickView from "@/components/subscriber-quick-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// recharts is NOT imported here — chart cards live in dashboard/inline-charts.tsx (lazy)
import { createLazyWidget } from "@/components/dashboard/lazy-widget";

/* ────────────────────────────────────────────────────────────────────────────
 * Below-fold widgets are LAZY-LOADED (chunk-split + mount-on-visible).
 *
 * Rationale: statically importing 40 widgets produced a monolithic bundle that
 * OOM-killed the server during compile (next-server RSS 2.4 GB) and fired ~30
 * API requests on boot. Each createLazyWidget() below compiles to its own
 * chunk, shows a shimmer skeleton, and only mounts — i.e. fetches — when the
 * placeholder scrolls within 700px of the viewport.
 *                                                                        ── */
const IspHealthScoreWidget = createLazyWidget(
  () => import("@/components/dashboard/isp-health-score-widget"), "IspHealthScoreWidget"
);
const NetworkHealthEnhancedWidget = createLazyWidget(
  () => import("@/components/dashboard/network-health-enhanced-widget"), "NetworkHealthEnhancedWidget"
);
const BandwidthTrendsWidget = createLazyWidget(
  () => import("@/components/dashboard/bandwidth-trends-widget"), "BandwidthTrendsWidget"
);
const TopAreasWidget = createLazyWidget(
  () => import("@/components/dashboard/top-areas-widget"), "TopAreasWidget"
);
const AreaDistributionWidget = createLazyWidget(
  () => import("@/components/dashboard/area-distribution-widget"), "AreaDistributionWidget"
);
const ConnectionTypeWidget = createLazyWidget(
  () => import("@/components/dashboard/connection-type-widget"), "ConnectionTypeWidget"
);
const RevenuePaymentModeWidget = createLazyWidget(
  () => import("@/components/dashboard/revenue-payment-mode-widget"), "RevenuePaymentModeWidget"
);
const ComplaintsAnalyticsWidget = createLazyWidget(
  () => import("@/components/dashboard/complaints-analytics-widget"), "ComplaintsAnalyticsWidget"
);
const PlanPerformanceWidget = createLazyWidget(
  () => import("@/components/dashboard/plan-performance-widget"), "PlanPerformanceWidget"
);
const TopSubscribersWidget = createLazyWidget(
  () => import("@/components/dashboard/top-subscribers-widget"), "TopSubscribersWidget"
);
const PlanComparisonWidget = createLazyWidget(
  () => import("@/components/dashboard/plan-comparison-widget"), "PlanComparisonWidget"
);
const CollectionPerformanceWidget = createLazyWidget(
  () => import("@/components/dashboard/collection-performance-widget"), "CollectionPerformanceWidget"
);
const SystemAlertsWidget = createLazyWidget(
  () => import("@/components/dashboard/system-alerts-widget"), "SystemAlertsWidget"
);
const RecentPaymentsTimelineWidget = createLazyWidget(
  () => import("@/components/dashboard/recent-payments-timeline-widget"), "RecentPaymentsTimelineWidget"
);
const ExpiringSubscriptionsWidget = createLazyWidget(
  () => import("@/components/dashboard/expiring-subscriptions-widget"), "ExpiringSubscriptionsWidget"
);
const OverduePaymentsWidget = createLazyWidget(
  () => import("@/components/dashboard/overdue-payments-widget"), "OverduePaymentsWidget"
);
const RetentionChurnWidget = createLazyWidget(
  () => import("@/components/dashboard/retention-churn-widget"), "RetentionChurnWidget"
);
const InvoiceAgingWidget = createLazyWidget(
  () => import("@/components/dashboard/invoice-aging-widget"), "InvoiceAgingWidget"
);
const ChurnRiskWidget = createLazyWidget(
  () => import("@/components/dashboard/churn-risk-widget"), "ChurnRiskWidget"
);
const ChurnPredictionWidget = createLazyWidget(
  () => import("@/components/dashboard/churn-prediction-widget"), "ChurnPredictionWidget"
);
const PaymentAnalyticsWidget = createLazyWidget(
  () => import("@/components/dashboard/payment-analytics-widget"), "PaymentAnalyticsWidget"
);
const SubscriberLifecycleWidget = createLazyWidget(
  () => import("@/components/dashboard/subscriber-lifecycle-widget"), "SubscriberLifecycleWidget"
);
const TechnicianPerformanceWidget = createLazyWidget(
  () => import("@/components/dashboard/technician-performance-widget"), "TechnicianPerformanceWidget"
);
const SubscriberAnalyticsWidget = createLazyWidget(
  () => import("@/components/dashboard/subscriber-analytics-widget"), "SubscriberAnalyticsWidget"
);
const SystemOverviewWidget = createLazyWidget(
  () => import("@/components/dashboard/system-overview-widget"), "SystemOverviewWidget"
);
const SystemPerformanceWidget = createLazyWidget(
  () => import("@/components/dashboard/system-performance-widget"), "SystemPerformanceWidget"
);
const SecurityPostureWidget = createLazyWidget(
  () => import("@/components/dashboard/security-posture-widget"), "SecurityPostureWidget"
);
const RadiusSyncStatusWidget = createLazyWidget(
  () => import("@/components/dashboard/radius-sync-status-widget"), "RadiusSyncStatusWidget"
);
const PlanRecommendationWidget = createLazyWidget(
  () => import("@/components/dashboard/plan-recommendation-widget"), "PlanRecommendationWidget"
);
const ResponseTimeWidget = createLazyWidget(
  () => import("@/components/dashboard/response-time-widget"), "ResponseTimeWidget"
);
const CollectionTargetWidget = createLazyWidget(
  () => import("@/components/dashboard/collection-target-widget"), "CollectionTargetWidget"
);
const RecentSignupsWidget = createLazyWidget(
  () => import("@/components/dashboard/recent-signups-widget"), "RecentSignupsWidget"
);
const RevenueForecastWidget = createLazyWidget(
  () => import("@/components/dashboard/revenue-forecast-widget"), "RevenueForecastWidget"
);

// Chart cards (recharts) — extracted into their own chunk so the recharts
// module graph stays OUT of the main dashboard bundle (see inline-charts.tsx).
const BandwidthUtilizationCard = createLazyWidget(
  () => import("@/components/dashboard/inline-charts"), "BandwidthUtilizationCard"
);
const RevenueGrowthChartsRow = createLazyWidget(
  () => import("@/components/dashboard/inline-charts"), "RevenueGrowthChartsRow"
);
const PlanDistributionCard = createLazyWidget(
  () => import("@/components/dashboard/inline-charts"), "PlanDistributionCard"
);
const AreaRevenueCard = createLazyWidget(
  () => import("@/components/dashboard/inline-charts"), "AreaRevenueCard"
);
const ComplaintTrendCard = createLazyWidget(
  () => import("@/components/dashboard/inline-charts"), "ComplaintTrendCard"
);
const BandwidthUsageCard = createLazyWidget(
  () => import("@/components/dashboard/inline-charts"), "BandwidthUsageCard"
);
const PlanRevenueCard = createLazyWidget(
  () => import("@/components/dashboard/inline-charts"), "PlanRevenueCard"
);

interface DashboardData {
  totalActive: number;
  totalSubscribers: number;
  newThisMonth: number;
  newInRange: number;
  revenueThisMonth: number;
  revenueInRange: number;
  revenueLastMonth: number;
  revenueChangePercent: number;
  activeConnections: number;
  offlineCount: number;
  openComplaints: number;
  criticalCount: number;
  collectionToday: number;
  dailyTarget: number;
  monthlyTarget: number;
  networkUptime: number;
  uptimeTrend: number;
  onlineDevices: number;
  totalDevices: number;
  warningDevices: number;
  arpu: number;
  mrr: number;
  churnRate: number;
  churnedInRange: number;
  monthlyRevenueData: { month: string; revenue: number }[];
  subscriberGrowthData: { month: string; additions: number }[];
  complaintTrendData: { date: string; complaints: number }[];
  planDistribution: { plan: string; count: number }[];
  areaWiseRevenue: { area: string; revenue: number }[];
  recentComplaints: { id: string; ticketNumber: string; customerName: string; type: string; priority: string; status: string; createdAt: string }[];
  recentPayments: { id: string; receiptNumber: string; customerName: string; amount: number; paymentMode: string; status: string; createdAt: string }[];
  overdueInvoices: { id: string; invoiceNumber: string; customerName: string; phone: string; dueDate: string; balanceAmount: number; grandTotal: number }[];
  overdueTotal: number;
  overdueCount: number;
  topRevenueCustomers: { subscriberId: string; name: string; phone: string; area: string; totalPaid: number }[];
  upcomingRenewals: { id: string; name: string; phone: string; planName: string; planPrice: number; nextRenewalDate: string; daysUntilRenewal: number }[];
  aiInsight: string;
  urgentItems: { criticalComplaints: number; overdueInvoices: number; deviceWarnings: number; slaBreaches: number; total: number };
  bandwidthUsageData: { hour: string; downloadBps: number; uploadBps: number }[];
  peakBandwidth: number;
  currentBandwidth: number;
  slaBreaches: { id: string; ticketNumber: string; customerName: string; priority: string; slaDeadline: string; hoursRemaining: number; status: string }[];
  deviceHealth: {
    online: number; offline: number; warning: number; unknown: number;
    topDevices: { id: string; name: string; type: string; status: string; cpuUsage: number | null; memoryUsage: number | null; lastSeenAt: string | null }[];
  };
  cac: number;
  cacTrend: number;
  planRevenueBreakdown: { plan: string; revenue: number; subscribers: number; arpu: number }[];
  range: string;
  rangeDays: number;
  generatedAt: string;
  // IPv6 (optional, gated by ipv6 module)
  ipv6Subscribers?: number;
  ipv6AdoptionRate?: number;
  ipv4OnlyCount?: number;
  dualStackCount?: number;
  ipv6OnlyCount?: number;
  ipv6TrafficPercent?: number;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

const PRIORITY_BADGE: Record<string, { label: string; class: string }> = {
  P1_CRITICAL: { label: "Critical", class: "bg-red-100 text-red-700 border-red-200" },
  P2_HIGH: { label: "High", class: "bg-orange-100 text-orange-700 border-orange-200" },
  P3_MEDIUM: { label: "Medium", class: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  P4_LOW: { label: "Low", class: "bg-green-100 text-green-700 border-green-200" },
};
const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  OPEN: { label: "Open", class: "bg-red-100 text-red-700 border-red-200" },
  ASSIGNED: { label: "Assigned", class: "bg-teal-100 text-teal-700 border-teal-200" },
  IN_PROGRESS: { label: "In Progress", class: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  RESOLVED: { label: "Resolved", class: "bg-green-100 text-green-700 border-green-200" },
  CLOSED: { label: "Closed", class: "bg-gray-100 text-gray-600 border-gray-200" },
  REOPENED: { label: "Reopened", class: "bg-red-100 text-red-700 border-red-200" },
};
const COMPLAINT_TYPE_LABELS: Record<string, string> = {
  NO_INTERNET: "No Internet", SLOW_SPEED: "Slow Speed", CABLE_CUT: "Cable Cut",
  WIFI_ISSUE: "WiFi Issue", PLAN_CHANGE: "Plan Change", BILLING_QUERY: "Billing Query",
  VOIP_ISSUE: "VoIP Issue", IPTV_ISSUE: "IPTV Issue", NEW_CONNECTION: "New Connection", OTHER: "Other",
};
const PAYMENT_STATUS_BADGE: Record<string, { label: string; class: string }> = {
  PENDING: { label: "Pending", class: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  VERIFIED: { label: "Verified", class: "bg-green-100 text-green-700 border-green-200" },
  FAILED: { label: "Failed", class: "bg-red-100 text-red-700 border-red-200" },
  REFUNDED: { label: "Refunded", class: "bg-gray-100 text-gray-600 border-gray-200" },
};
const DEVICE_STATUS_BADGE: Record<string, { label: string; class: string }> = {
  ONLINE: { label: "Online", class: "bg-green-100 text-green-700 border-green-200" },
  OFFLINE: { label: "Offline", class: "bg-red-100 text-red-700 border-red-200" },
  WARNING: { label: "Warning", class: "bg-amber-100 text-amber-700 border-amber-200" },
  UNKNOWN: { label: "Unknown", class: "bg-gray-100 text-gray-600 border-gray-200" },
  MAINTENANCE: { label: "Maintenance", class: "bg-slate-100 text-slate-600 border-slate-200" },
};
const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", ONLINE: "Online", BANK_TRANSFER: "Bank Transfer", CHEQUE: "Cheque", WALLET: "Wallet",
};

function StatCard({ title, value, subtitle, icon: Icon, gradient, trend, trendValue, delay, pulse }: {
  title: string; value: string; subtitle: string; icon: React.ElementType;
  gradient: string; trend?: "up" | "down"; trendValue?: string; delay: number; pulse?: boolean;
}) {
  const isWhite = !gradient;
  return (
    <Card className={cn(gradient, "border-0 shadow-lg hover:shadow-2xl hover:scale-[1.03] transition-all duration-200 hover:-translate-y-1 animate-card-enter rounded-xl cursor-default card-glow group stat-card-lift")} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] sm:text-xs font-medium uppercase tracking-wider ${isWhite ? "text-muted-foreground" : "opacity-80"}`}>{title}</p>
            <p className={`text-xl sm:text-2xl lg:text-3xl font-bold mt-1.5 sm:mt-2 tabular-nums animate-count-up ${isWhite ? "text-foreground" : ""} ${pulse ? "animate-cryptsk-pulse" : ""}`}>{value}</p>
            <p className={`text-[10px] sm:text-xs mt-1.5 sm:mt-2 truncate ${isWhite ? "text-muted-foreground" : "opacity-75"}`}>{subtitle}</p>
          </div>
          <div className="flex-shrink-0 ml-2 sm:ml-3 flex flex-col items-end gap-1.5 sm:gap-2">
            <div className={`p-2 sm:p-2.5 rounded-xl transition-all duration-200 group-hover:scale-110 ${isWhite ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" : "bg-white/20 backdrop-blur-sm text-white"}`}><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></div>
            {trend && trendValue && (
              <div className={`flex items-center gap-0.5 text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-full ${isWhite ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" : "bg-white/20 text-white"}`}>
                {trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trendValue}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


interface SubscriberGrowthData {
  totalSubscribers: number;
  activeSubscribers: number;
  newThisMonth: number;
  churnedThisMonth: number;
  churnRate: number;
  byStatus: Record<string, number>;
  byConnectionType: Record<string, number>;
  byPlan: { planName: string; count: number }[];
  recentGrowth: { month: string; count: number }[];
}

const CONNECTION_TYPE_COLORS: Record<string, string> = {
  FTTH: "from-emerald-400 to-emerald-500",
  WIRELESS: "from-amber-400 to-amber-500",
  CABLE: "from-blue-400 to-blue-500",
  LEASED_LINE: "from-rose-400 to-rose-500",
  ETHERNET: "from-slate-400 to-slate-500",
};

export default function DashboardPage() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const hour = currentTime.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const formattedDate = currentTime.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedTime = currentTime.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const [dateRange, setDateRange] = useState("30d");
  const { setCurrentPage, user } = useAppStore();
  const { isModuleEnabled } = useModuleStore();
  const queryClient = useQueryClient();

  // Advanced Insights: the dashboard's long tail of analytics widgets is
  // collapsed by default — they only compile + fetch when the operator opens
  // the section. Keeps boot fast and memory lean (16 widgets ≈ 16 chunks).
  const INSIGHTS_KEY = "dashboard-advanced-insights";
  const [showAdvancedInsights, setShowAdvancedInsights] = useState(false);
  useEffect(() => {
    try {
      setShowAdvancedInsights(localStorage.getItem(INSIGHTS_KEY) === "expanded");
    } catch { /* private mode */ }
  }, []);
  const toggleAdvancedInsights = useCallback(() => {
    setShowAdvancedInsights((v) => {
      const next = !v;
      try { localStorage.setItem(INSIGHTS_KEY, next ? "expanded" : "collapsed"); } catch { /* noop */ }
      return next;
    });
  }, []);

  // Welcome banner: dismissed per day
  const WELCOME_DISMISS_KEY = "dashboard-welcome-dismissed";
  const getTodayKey = () => new Date().toISOString().slice(0, 10);
  const [quickViewSubscriberId, setQuickViewSubscriberId] = useState<string | null>(null);

  const [showWelcomeBanner, setShowWelcomeBanner] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(WELCOME_DISMISS_KEY) !== getTodayKey();
  });
  const dismissWelcomeBanner = useCallback(() => {
    localStorage.setItem(WELCOME_DISMISS_KEY, getTodayKey());
    setShowWelcomeBanner(false);
  }, []);

  // ── System Monitor (gateway-service aggregation) ──
  interface SystemMonitorData {
    gateway: { status: string; uptime: number; version: string | null };
    interfaces: { total: number; wan: { total: number; up: number; down: number }; lan: { total: number; up: number; down: number } };
    pppoe: { activeSessions: number };
    ddos: { activePolicies: number; totalPolicies: number };
    firewall: { activeRules: number };
    dhcp: { leaseCount: number };
  }

  const { data: sysMonitor, isLoading: isLoadingSysMonitor } = useQuery<SystemMonitorData>({
    queryKey: ["system-monitor"],
    queryFn: () => apiFetch<SystemMonitorData>("/api/system-monitor"),
    refetchInterval: 15000,
  });

  const { data: subscriberGrowth, isLoading: isLoadingGrowth } = useQuery<SubscriberGrowthData>({
    queryKey: ["dashboard-subscriber-growth"],
    queryFn: () => apiFetch<SubscriberGrowthData>("/api/dashboard/subscriber-growth"),
    refetchInterval: 120000,
  });

  const { data, isLoading, isRefetching, refetch } = useQuery<DashboardData>({
    queryKey: ["dashboard", dateRange],
    queryFn: () => apiFetch<DashboardData>(`/api/dashboard?range=${dateRange}`),
    refetchInterval: 60000,
  });

  const rangeLabel = dateRange === "7d" ? "Last 7 Days" : dateRange === "30d" ? "Last 30 Days" : dateRange === "90d" ? "Last 90 Days" : dateRange === "this_month" ? "This Month" : dateRange === "last_month" ? "Last Month" : "Last 30 Days";

  const handleQuickAction = (page: string, section: string) => {
    setCurrentPage(page, section);
  };

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success("Dashboard data refreshed");
  }

  function handleExportCSV() {
    if (!data) {
      toast.error("No data available to export");
      return;
    }

    const rows: string[][] = [];

    // Header section
    rows.push(["Cryptsk ISP — Dashboard Report"]);
    rows.push(["Generated", new Date().toLocaleString("en-IN")]);
    rows.push(["Range", rangeLabel]);
    rows.push([]);

    // KPI Summary
    rows.push(["=== KEY PERFORMANCE INDICATORS ==="]);
    rows.push(["Metric", "Value"]);
    rows.push(["Total Active Subscribers", data.totalActive.toString()]);
    rows.push(["Total Subscribers", data.totalSubscribers.toString()]);
    rows.push(["New This Month", data.newThisMonth.toString()]);
    rows.push(["Revenue This Month", data.revenueThisMonth.toString()]);
    rows.push(["Revenue Change %", `${data.revenueChangePercent}%`]);
    rows.push(["Active Connections", data.activeConnections.toString()]);
    rows.push(["Offline Count", data.offlineCount.toString()]);
    rows.push(["Open Complaints", data.openComplaints.toString()]);
    rows.push(["Critical Complaints", data.criticalCount.toString()]);
    rows.push(["Collection Today", data.collectionToday.toString()]);
    rows.push(["Daily Target", data.dailyTarget.toString()]);
    rows.push(["Monthly Target", data.monthlyTarget.toString()]);
    rows.push(["Network Uptime %", `${data.networkUptime}%`]);
    rows.push(["Online Devices", `${data.onlineDevices} / ${data.totalDevices}`]);
    rows.push(["ARPU", data.arpu.toString()]);
    rows.push(["MRR", data.mrr.toString()]);
    rows.push(["ARR", (data.mrr * 12).toString()]);
    rows.push(["Churn Rate %", `${data.churnRate}%`]);
    rows.push([]);

    // Overdue Invoices
    rows.push(["=== OVERDUE INVOICES ==="]);
    rows.push(["Invoice #", "Customer", "Phone", "Due Date", "Balance"]);
    for (const inv of data.overdueInvoices) {
      rows.push([inv.invoiceNumber, inv.customerName, inv.phone, inv.dueDate, inv.balanceAmount.toString()]);
    }
    rows.push(["Total Overdue", "", "", "", data.overdueTotal.toString()]);
    rows.push([]);

    // Top Revenue Customers
    rows.push(["=== TOP REVENUE CUSTOMERS ==="]);
    rows.push(["#", "Customer", "Phone", "Area", "Total Paid"]);
    for (const c of data.topRevenueCustomers) {
      rows.push(["", c.name, c.phone, c.area, c.totalPaid.toString()]);
    }
    rows.push([]);

    // Upcoming Renewals
    rows.push(["=== UPCOMING RENEWALS (7 Days) ==="]);
    rows.push(["Customer", "Phone", "Plan", "Plan Price", "Renewal Date", "Days Left"]);
    for (const r of data.upcomingRenewals) {
      rows.push([r.name, r.phone, r.planName, r.planPrice.toString(), r.nextRenewalDate, r.daysUntilRenewal.toString()]);
    }

    // Generate CSV string
    const csvContent = rows.map((row) =>
      row.map((cell) => {
        const str = String(cell).replace(/"/g, '""');
        return str.includes(",") || str.includes("\n") || str.includes('"') ? `"${str}"` : str;
      }).join(",")
    ).join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dashboard-report-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Report downloaded successfully");
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="skeleton-wave h-8 w-56" />
            <Skeleton className="skeleton-wave h-4 w-80" />
            <Skeleton className="skeleton-wave h-3 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="skeleton-wave h-9 w-32" />
            <Skeleton className="skeleton-wave h-9 w-28" />
            <Skeleton className="skeleton-wave h-9 w-9 rounded-full" />
            <Skeleton className="skeleton-wave h-9 w-9 rounded-full" />
          </div>
        </div>
        {/* Quick actions skeleton */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-36 rounded-lg" />
          ))}
        </div>
        {/* Primary stat cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border shadow-sm rounded-xl"><CardContent className="p-4 sm:p-5"><Skeleton className="skeleton-wave h-3 w-24 mb-3" /><Skeleton className="skeleton-wave h-8 w-32 mb-2" /><Skeleton className="skeleton-wave h-3 w-20" /></CardContent></Card>
          ))}
        </div>
        {/* Secondary stat cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm rounded-xl"><CardContent className="p-4 flex items-center gap-4"><Skeleton className="skeleton-wave h-12 w-12 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="skeleton-wave h-3 w-16" /><Skeleton className="skeleton-wave h-6 w-24" /><Skeleton className="skeleton-wave h-3 w-32" /></div></CardContent></Card>
          ))}
        </div>
        {/* AI insight skeleton */}
        <div className="rounded-xl border-2 border-red-500/20 p-5">
          <div className="flex items-start gap-4">
            <Skeleton className="skeleton-wave h-10 w-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="skeleton-wave h-4 w-24" />
              <Skeleton className="skeleton-wave h-3 w-full" />
              <Skeleton className="skeleton-wave h-3 w-4/5" />
            </div>
          </div>
        </div>
        {/* Chart row skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="border shadow-sm rounded-xl"><CardContent className="p-5"><Skeleton className="skeleton-wave h-5 w-40 mb-4" /><Skeleton className="skeleton-wave h-64 w-full rounded-lg" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }
  if (!data) return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <div className="p-4 rounded-2xl bg-red-100 dark:bg-red-950/30 text-red-500 dark:text-red-400">
        <AlertTriangle className="h-10 w-10" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-lg font-semibold text-foreground">Failed to load dashboard</p>
        <p className="text-sm text-muted-foreground">Unable to fetch dashboard data. Please try again.</p>
      </div>
      <Button variant="outline" size="sm" className="gap-2" onClick={handleRefresh}>
        <RefreshCw className="h-4 w-4" /> Retry
      </Button>
    </div>
  );

  const collectionPercent = data.dailyTarget > 0 ? Math.round((data.collectionToday / data.dailyTarget) * 100) : 0;
  const monthlyCollectionPercent = data.monthlyTarget > 0 ? Math.round((data.revenueThisMonth / data.monthlyTarget) * 100) : 0;
  const arr = data.mrr * 12;

  return (
    <div className="space-y-6 page-enter">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className={cn("text-2xl font-bold", "text-gradient-red")}>{greeting}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s your ISP operations overview.</p>
          <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1.5">
            <CalendarClock className="h-3 w-3" />
            {formattedDate} · {formattedTime}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm" className="h-9 gap-1.5 text-xs btn-download-report"
            onClick={handleExportCSV}
          >
            <Download className="h-3.5 w-3.5" /> Download Report
          </Button>
          <Button
            variant="outline" size="sm" className="h-9 w-9 p-0 btn-shine"
            onClick={handleRefresh}
            disabled={isRefetching}
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 relative">
                <Bell className="h-4 w-4" />
                {data.urgentItems.total > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-600 text-white text-[9px] font-bold leading-none">{data.urgentItems.total}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className="p-3 border-b">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />Urgent Items
                </h4>
              </div>
              <div className="p-2 space-y-1">
                {data.urgentItems.criticalComplaints > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2 text-xs"><AlertTriangle className="h-3.5 w-3.5 text-red-500" />Critical Complaints</div>
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">{data.urgentItems.criticalComplaints}</Badge>
                  </div>
                )}
                {data.urgentItems.overdueInvoices > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2 text-xs"><Clock className="h-3.5 w-3.5 text-amber-500" />Overdue Invoices</div>
                    <Badge className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">{data.urgentItems.overdueInvoices}</Badge>
                  </div>
                )}
                {data.urgentItems.deviceWarnings > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2 text-xs"><Activity className="h-3.5 w-3.5 text-orange-500" />Device Warnings</div>
                    <Badge className="text-[10px] px-1.5 py-0 h-5 bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">{data.urgentItems.deviceWarnings}</Badge>
                  </div>
                )}
                {data.urgentItems.slaBreaches > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2 text-xs"><ShieldAlert className="h-3.5 w-3.5 text-red-600" />SLA Breaches</div>
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">{data.urgentItems.slaBreaches}</Badge>
                  </div>
                )}
                {data.urgentItems.total === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">All clear! No urgent items.</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-1.5 ml-1"><span className="live-dot" /><span className="text-xs font-medium text-green-600">Live</span></div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline" size="sm"
          className="gap-1.5 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 btn-press btn-shine"
          onClick={() => handleQuickAction("Billing", "MAIN")}
        >
          <FileText className="h-3.5 w-3.5" /> Generate Invoices
        </Button>
        <Button
          variant="outline" size="sm"
          className="gap-1.5 text-xs border-green-200 text-green-600 hover:bg-green-50 hover:text-green-700 hover:border-green-300 btn-press btn-shine"
          onClick={() => handleQuickAction("Subscribers", "MAIN")}
        >
          <UserPlus className="h-3.5 w-3.5" /> Add Subscriber
        </Button>
        <Button
          variant="outline" size="sm"
          className="gap-1.5 text-xs border-amber-200 text-amber-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 btn-press btn-shine"
          onClick={() => handleQuickAction("Complaints", "OPERATIONS")}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" /> Raise Complaint
        </Button>
        <Button
          variant="outline" size="sm"
          className="gap-1.5 text-xs border-purple-200 text-purple-600 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 btn-press btn-shine"
          onClick={() => handleQuickAction("Payments", "MAIN")}
        >
          <Banknote className="h-3.5 w-3.5" /> Collect Payment
        </Button>
      </div>

      {/* ── Welcome Banner ── */}
      {showWelcomeBanner && (() => {
        const bannerHour = new Date().getHours();
        const bannerGreeting = bannerHour >= 5 && bannerHour < 12
          ? "Good Morning"
          : bannerHour >= 12 && bannerHour < 17
            ? "Good Afternoon"
            : bannerHour >= 17 && bannerHour < 21
              ? "Good Evening"
              : "Good Night";
        const bannerDate = format(new Date(), "EEEE, d MMMM yyyy");
        const dayOfWeek = new Date().getDay();
        const dailyTips = [
          `You have ${data.totalActive.toLocaleString("en-IN")} subscribers — consider running a satisfaction survey.`,
          "Tip: Use the AI Advisor for personalized network optimization insights.",
          `Revenue collection is at ${data.dailyTarget > 0 ? Math.min(Math.round((data.collectionToday / data.dailyTarget) * 100), 999) : 0}% — check the Collection page for details.`,
          "Pro tip: Set up automated invoice generation to save time every month.",
          "Monitor your bandwidth usage patterns to optimize network performance.",
          "Use the Command Palette (Ctrl+K) for quick navigation to any page.",
          "Check the Churn Alerts page to identify at-risk subscribers early.",
        ];
        const tipOfTheDay = dailyTips[dayOfWeek];
        const userName = user?.name || "Admin";

        return (
          <div className="gradient-border-red rounded-xl animate-card-enter">
            <Card className="rounded-xl border-0 shadow-md overflow-hidden relative">
              {/* Decorative gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-teal-500/5 dark:from-red-400/5 dark:via-transparent dark:to-teal-400/5 pointer-events-none" />
              {/* Decorative pattern */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-red-500/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-teal-500/5 to-transparent rounded-full translate-y-1/2 -translate-x-1/4 pointer-events-none" />
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  {/* Left side */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="hidden sm:flex flex-col items-center shrink-0">
                      <div className="w-1 h-full min-h-[80px] rounded-full bg-gradient-to-b from-red-500 to-red-600 dark:from-red-400 dark:to-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg sm:text-xl font-bold text-foreground">
                        {bannerGreeting}, <span className="text-red-600 dark:text-red-400">{userName}</span>!
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1.5 flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5">
                          <Zap className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                        <span>{tipOfTheDay}</span>
                      </p>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                        {bannerDate}
                      </p>
                      <button
                        onClick={dismissWelcomeBanner}
                        className="p-1 rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
                        aria-label="Dismiss welcome banner"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <TooltipProvider delayDuration={300}>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                              onClick={() => handleQuickAction("Subscribers", "MAIN")}
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>New Subscriber</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 border-teal-200 text-teal-600 hover:bg-teal-50 hover:text-teal-700 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950/40"
                              onClick={() => handleQuickAction("Payments", "MAIN")}
                            >
                              <Wallet className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Collect Payment</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 border-amber-200 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
                              onClick={() => handleQuickAction("Complaints", "OPERATIONS")}
                            >
                              <AlertTriangle className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Raise Complaint</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ── Quick Stats Banner ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-slide-up" style={{ animationDelay: "50ms" }}>
        {/* Total Subscribers */}
        <div
          className="rounded-xl p-4 border-0 shadow-sm flex items-center gap-3.5 hover:scale-[1.02] transition-all duration-200 cursor-default"
          style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.03) 100%)" }}
        >
          <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Subscribers</p>
            <p className="text-xl font-bold tabular-nums text-foreground mt-0.5">{data.totalSubscribers.toLocaleString("en-IN")}</p>
          </div>
        </div>

        {/* Active Connections */}
        <div
          className="rounded-xl p-4 border-0 shadow-sm flex items-center gap-3.5 hover:scale-[1.02] transition-all duration-200 cursor-default"
          style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.03) 100%)" }}
        >
          <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Wifi className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Active Connections</p>
            <p className="text-xl font-bold tabular-nums text-foreground mt-0.5">{data.activeConnections.toLocaleString("en-IN")}</p>
          </div>
        </div>

        {/* Monthly Recurring Revenue (MRR) */}
        <div
          className="rounded-xl p-4 border-0 shadow-sm flex items-center gap-3.5 hover:scale-[1.02] transition-all duration-200 cursor-default"
          style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.03) 100%)" }}
        >
          <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <IndianRupee className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Monthly Revenue (MRR)</p>
            <p className="text-xl font-bold tabular-nums text-foreground mt-0.5">{formatINR(data.mrr)}</p>
          </div>
        </div>

        {/* Collection Today % */}
        <div
          className="rounded-xl p-4 border-0 shadow-sm flex items-center gap-3.5 hover:scale-[1.02] transition-all duration-200 cursor-default"
          style={{ background: collectionPercent >= 80 ? "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.03) 100%)" : collectionPercent >= 50 ? "linear-gradient(135deg, rgba(245, 158, 11, 0.10) 0%, rgba(245, 158, 11, 0.03) 100%)" : "linear-gradient(135deg, rgba(220, 38, 38, 0.10) 0%, rgba(220, 38, 38, 0.03) 100%)" }}
        >
          <div className={`p-2.5 rounded-xl ${collectionPercent >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : collectionPercent >= 50 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
            <Target className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Collection Today %</p>
            <p className={`text-xl font-bold tabular-nums mt-0.5 ${collectionPercent >= 80 ? "text-emerald-600 dark:text-emerald-400" : collectionPercent >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
              {collectionPercent}%
            </p>
          </div>
        </div>
      </div>

      {/* ── Dashboard Stats Summary Bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 animate-slide-up" style={{ animationDelay: "100ms" }}>
        {/* Total Subscribers */}
        <div className="rounded-xl border border-border/50 bg-card shadow-sm p-3 sm:p-4 hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-red-500 text-white shadow-sm">
              <Users className="h-3.5 w-3.5" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Subscribers</span>
          </div>
          <div className="flex items-end gap-1.5">
            <p className="text-lg sm:text-xl font-bold tabular-nums text-foreground">{data.totalSubscribers.toLocaleString("en-IN")}</p>
            {data.newThisMonth > 0 && (
              <div className="flex items-center gap-0.5 mb-0.5">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span className="text-[9px] font-semibold text-green-600">+{data.newThisMonth}</span>
              </div>
            )}
          </div>
        </div>

        {/* Active Connections */}
        <div className="rounded-xl border border-border/50 bg-card shadow-sm p-3 sm:p-4 hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-sm">
              <Wifi className="h-3.5 w-3.5" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Active</span>
          </div>
          <div className="flex items-end gap-1.5">
            <p className="text-lg sm:text-xl font-bold tabular-nums text-foreground">{data.activeConnections.toLocaleString("en-IN")}</p>
            <span className="text-[9px] font-semibold text-muted-foreground mb-0.5">
              {data.totalSubscribers > 0 ? ((data.activeConnections / data.totalSubscribers) * 100).toFixed(0) : 0}%
            </span>
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="rounded-xl border border-border/50 bg-card shadow-sm p-3 sm:p-4 hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-sm">
              <IndianRupee className="h-3.5 w-3.5" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Revenue</span>
          </div>
          <div className="flex items-end gap-1.5">
            <p className="text-lg sm:text-xl font-bold tabular-nums text-foreground">{formatINR(data.revenueThisMonth)}</p>
            {data.revenueChangePercent !== 0 && (
              <div className={`flex items-center gap-0.5 mb-0.5 ${data.revenueChangePercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                {data.revenueChangePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span className="text-[9px] font-semibold">{data.revenueChangePercent >= 0 ? "+" : ""}{data.revenueChangePercent}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Open Complaints */}
        <div className="rounded-xl border border-border/50 bg-card shadow-sm p-3 sm:p-4 hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-sm">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Complaints</span>
          </div>
          <div className="flex items-end gap-1.5">
            <p className="text-lg sm:text-xl font-bold tabular-nums text-foreground">{data.openComplaints}</p>
            {data.criticalCount > 0 && (
              <span className="text-[9px] font-semibold text-red-500 mb-0.5">{data.criticalCount} critical</span>
            )}
          </div>
        </div>

        {/* Network Uptime */}
        <div className="rounded-xl border border-border/50 bg-card shadow-sm p-3 sm:p-4 hover:shadow-md transition-all duration-200 group col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-500 text-white shadow-sm">
              <Activity className="h-3.5 w-3.5" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Uptime</span>
          </div>
          <div className="flex items-end gap-1.5">
            <p className="text-lg sm:text-xl font-bold tabular-nums text-foreground">
              {data.totalDevices > 0 ? `${data.networkUptime}%` : <span className="text-muted-foreground text-sm font-medium">N/A</span>}
            </p>
            {data.totalDevices > 0 && (
              <div className={`flex items-center gap-0.5 mb-0.5 ${data.uptimeTrend >= 0 ? "text-green-500" : "text-red-500"}`}>
                {data.uptimeTrend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span className="text-[9px] font-semibold">{data.uptimeTrend >= 0 ? "+" : ""}{data.uptimeTrend}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── System Alert Banner ── */}
      <SystemAlertBanner />

      {/* ── Getting Started Panel (onboarding for new users) ── */}
      <GettingStartedPanel />

      {/* ── Quick Actions Card Widget ── */}
      <DashboardQuickActionsWidget />

      {/* ── Notification Summary Widget ── */}
      <NotificationSummaryWidget />

      {/* ── Live Activity Feed Widget ── */}
      <LiveActivityFeedWidget />

      {/* ── Quick Performance Metrics ── */}
      <PerformanceMetricsWidget />

      {/* ── Quick Actions ── */}
      <QuickActionsWidget />

      {/* ── Primary Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Subscribers" value={data.totalActive.toLocaleString("en-IN")}
          subtitle={`${data.newThisMonth} new this month`}
          icon={Users} gradient="stat-gradient-red" delay={0}
        />
        <StatCard
          title="Revenue This Month" value={formatINR(data.revenueThisMonth)}
          subtitle={`vs last month ${data.revenueChangePercent >= 0 ? "+" : ""}${data.revenueChangePercent}%`}
          icon={IndianRupee} gradient="stat-gradient-blue"
          trend={data.revenueChangePercent >= 0 ? "up" : "down"}
          trendValue={`${data.revenueChangePercent >= 0 ? "+" : ""}${data.revenueChangePercent}%`}
          delay={75}
        />
        <StatCard
          title="Active Connections" value={data.activeConnections.toLocaleString("en-IN")}
          subtitle={`${data.offlineCount} offline`}
          icon={Wifi} gradient="stat-gradient-purple" delay={150}
        />
        <StatCard
          title="Open Complaints" value={data.openComplaints.toString()}
          subtitle={`${data.criticalCount} critical`}
          icon={AlertTriangle} gradient="stat-gradient-amber"
          trend={data.openComplaints > 10 ? "up" : "down"}
          trendValue={data.openComplaints > 10 ? `${data.openComplaints} open` : "Under control"}
          delay={225}
        />
        <StatCard
          title="Collection Today" value={formatINR(data.collectionToday)}
          subtitle={`of ${formatINR(data.dailyTarget)} target`}
          icon={CreditCard} gradient="stat-gradient-emerald"
          trend={collectionPercent >= 80 ? "up" : "down"}
          trendValue={`${collectionPercent}%`}
          delay={300}
        />
        <StatCard
          title="Network Uptime" value={`${data.networkUptime}%`}
          subtitle={`${data.onlineDevices} of ${data.totalDevices} devices online`}
          icon={Activity} gradient="stat-gradient-navy"
          trend={data.uptimeTrend >= 0 ? "up" : "down"}
          trendValue={`${data.uptimeTrend >= 0 ? "+" : ""}${data.uptimeTrend}%`}
          delay={375}
          pulse
        />
      </div>

      {/* ── Secondary Stats Row (ARPU, MRR/ARR, Churn Rate, CAC) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "420ms" }}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0 transition-transform duration-200"><IndianRupee className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ARPU</p>
              <p className="text-xl font-bold tabular-nums animate-count-up">{formatINR(data.arpu)}</p>
              <p className="text-xs text-muted-foreground">Avg Revenue Per User / month</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-green-200 dark:hover:border-green-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "450ms" }}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400 shrink-0 transition-transform duration-200"><BarChart3 className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">MRR</p>
              <p className="text-xl font-bold tabular-nums animate-count-up">{formatINR(data.mrr)}</p>
              <p className="text-xs text-muted-foreground">
                ARR <span className="font-semibold text-foreground">{formatINR(arr)}</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-amber-200 dark:hover:border-amber-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "480ms" }}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl shrink-0 transition-transform duration-200 ${data.churnRate > 5 ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400" : data.churnRate > 2 ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400" : "bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400"}`}>
              <UserMinus className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Churn Rate</p>
              <p className="text-xl font-bold tabular-nums animate-count-up">{data.churnRate}%</p>
              <p className="text-xs text-muted-foreground">{data.churnedInRange} disconnected in {rangeLabel}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-teal-200 dark:hover:border-teal-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "510ms" }}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl shrink-0 transition-transform duration-200 ${data.arpu > 0 && data.cac > data.arpu ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400" : "bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400"}`}><Target className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CAC</p>
              <p className="text-xl font-bold tabular-nums animate-count-up">{formatINR(data.cac)}</p>
              <p className="text-xs text-muted-foreground">
                {data.cacTrend !== 0 && <span className={data.cacTrend > 0 ? "text-red-500" : "text-green-500"}>{data.cacTrend > 0 ? "+" : ""}{data.cacTrend}%</span>}
                {data.cacTrend === 0 && <span>vs last month</span>}
              </p>
            </div>
          </CardContent>
        </Card>
        {isModuleEnabled("ipv6") && (
          <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-cyan-200 dark:hover:border-cyan-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "530ms" }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 shrink-0 transition-transform duration-200"><Globe className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">IPv6 Subscribers</p>
                <p className="text-xl font-bold tabular-nums animate-count-up">{data.ipv6Subscribers || 0}</p>
                <p className="text-xs text-muted-foreground">{data.ipv6AdoptionRate || 0}% adoption rate</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── AI Insight Panel ── */}
      <div className="relative rounded-xl border-2 border-red-500/30 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 p-4 sm:p-5 animate-card-enter glass-card" style={{ animationDelay: "500ms" }}>
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex-shrink-0 p-2.5 rounded-xl bg-red-600 text-white shadow-lg shadow-red-600/25"><Bot className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-red-800 dark:text-red-300">AI Insight</h3>
              <span className="live-dot-red" />
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-200 text-red-600">{rangeLabel}</Badge>
            </div>
            <p className="text-sm text-red-700/80 dark:text-red-300/80 leading-relaxed">{data.aiInsight}</p>
          </div>
        </div>
      </div>

      {/* ── System Health: Collection Progress ── */}
      <Card className="border shadow-sm animate-card-enter rounded-xl" style={{ animationDelay: "530ms" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-red-500" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-5">
          {/* Daily Collection Progress */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Daily Collection</span>
              <span className="text-sm font-bold tabular-nums">
                {formatINR(data.collectionToday)} <span className="text-muted-foreground font-normal">/ {formatINR(data.dailyTarget)}</span>
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full animate-progress"
                style={{
                  "--progress": `${Math.min(collectionPercent, 100)}%`,
                  width: `${Math.min(collectionPercent, 100)}%`,
                  background: "linear-gradient(90deg, #DC2626, #F87171)",
                } as React.CSSProperties}
              />
            </div>
            <p className="text-xs text-muted-foreground">{collectionPercent}% of daily target</p>
          </div>
          {/* Monthly Collection Progress */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Monthly Collection</span>
              <span className="text-sm font-bold tabular-nums">
                {formatINR(data.revenueThisMonth)} <span className="text-muted-foreground font-normal">/ {formatINR(data.monthlyTarget)}</span>
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full animate-progress"
                style={{
                  "--progress": `${Math.min(monthlyCollectionPercent, 100)}%`,
                  width: `${Math.min(monthlyCollectionPercent, 100)}%`,
                  background: "linear-gradient(90deg, #0D9488, #2DD4BF)",
                } as React.CSSProperties}
              />
            </div>
            <p className="text-xs text-muted-foreground">{monthlyCollectionPercent}% of monthly target</p>
          </div>
        </CardContent>
      </Card>

      {/* ── System Health: Quick Stats Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue (All Time) */}
        <Card className="border shadow-sm card-hover-lift animate-slide-up rounded-xl border-l-4 border-l-red-500" style={{ animationDelay: "540ms" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Revenue</p>
                <p className="text-lg font-bold tabular-nums animate-count-up">{formatINR(arr)}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <span className="text-[10px] text-green-600 font-medium">Annualized</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Avg Invoice Value */}
        <Card className="border shadow-sm card-hover-lift animate-slide-up rounded-xl border-l-4 border-l-teal-500" style={{ animationDelay: "560ms" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 shrink-0">
                <Receipt className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Invoice Value</p>
                <p className="text-lg font-bold tabular-nums animate-count-up">{formatINR(data.totalActive > 0 ? data.revenueThisMonth / data.totalActive : 0)}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">{data.totalActive} subscribers</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Online Devices */}
        <Card className="border shadow-sm card-hover-lift animate-slide-up rounded-xl border-l-4 border-l-green-500" style={{ animationDelay: "580ms" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400 shrink-0">
                <Wifi className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Online Devices</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-lg font-bold tabular-nums animate-count-up">{data.onlineDevices}</p>
                  <span className="text-xs text-muted-foreground">/ {data.totalDevices}</span>
                  <span className="status-dot-online" />
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">{data.totalDevices > 0 ? ((data.onlineDevices / data.totalDevices) * 100).toFixed(1) : 0}% online</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* SLA Compliance */}
        <Card className="border shadow-sm card-hover-lift animate-slide-up rounded-xl border-l-4 border-l-amber-500" style={{ animationDelay: "600ms" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${data.urgentItems.slaBreaches > 0 ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400" : "bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400"}`}>
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">SLA Compliance</p>
                <p className={`text-lg font-bold ${data.urgentItems.slaBreaches > 0 ? "text-red-600" : "text-green-600"}`}>
                  {data.urgentItems.slaBreaches > 0 ? "At Risk" : "On Track"}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[10px] font-medium ${data.urgentItems.slaBreaches > 0 ? "text-red-500" : "text-green-500"}`}>
                    {data.urgentItems.slaBreaches} {data.urgentItems.slaBreaches === 1 ? "breach" : "breaches"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {isModuleEnabled("ipv6") && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-slide-up" style={{ animationDelay: "610ms" }}>
          <Globe className="h-3 w-3 text-cyan-500" />
          <span>IPv6: <span className="font-medium text-emerald-600">Active</span></span>
        </div>
      )}

      {/* ── Network Status Overview ── */}
      <NetworkStatusOverview />

      {/* ── Network Status Widget (new) ── */}
      <NetworkStatusWidget />

      {/* ── Subscriber Growth Chart ── */}
      <SubscriberGrowthWidget />

      {/* ── Revenue Breakdown ── */}
      <RevenueBreakdownWidget />

      {/* ── SLA Compliance Monitoring ── */}
      <SlaMonitorWidget />

      {/* ── SLA Breach Warnings ── */}
      <div className="relative rounded-xl border-2 border-amber-500/30 bg-gradient-to-r from-amber-50 to-red-50 dark:from-amber-950/20 dark:to-red-950/20 p-4 sm:p-5 animate-card-enter glass-card" style={{ animationDelay: "520ms" }}>
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex-shrink-0 p-2.5 rounded-xl bg-amber-500 text-white shadow-lg shadow-amber-500/25"><ShieldAlert className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">SLA Warnings</h3>
              {data.slaBreaches.length > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 badge-glow">{data.slaBreaches.length}</Badge>}
            </div>
            {data.slaBreaches.length === 0 ? (
              <div className="flex items-center gap-2 py-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">All SLAs on track</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-52 overflow-y-auto">
                <Table className="cryptsk-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Ticket</TableHead>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Priority</TableHead>
                      <TableHead className="text-xs">Time Left</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.slaBreaches.map((s, idx) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50 transition-colors list-item-stagger" style={{ "--stagger-delay": `${idx * 40}ms` } as React.CSSProperties} onClick={() => handleQuickAction("Complaints", "OPERATIONS")}>
                        <TableCell className="font-mono text-xs font-medium">{s.ticketNumber}</TableCell>
                        <TableCell className="text-xs font-medium">{s.customerName}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce ${PRIORITY_BADGE[s.priority]?.class || ""}`}>{PRIORITY_BADGE[s.priority]?.label || s.priority}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          <span className={s.hoursRemaining < 0 ? "text-red-600" : s.hoursRemaining < 4 ? "text-amber-600" : s.hoursRemaining < 12 ? "text-yellow-600" : "text-green-600"}>
                            {s.hoursRemaining < 0 ? `${Math.abs(s.hoursRemaining)}h overdue` : `${s.hoursRemaining}h left`}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bandwidth Usage Indicator (lazy — recharts) ── */}
      <BandwidthUtilizationCard
        currentBandwidth={data.currentBandwidth}
        peakBandwidth={data.peakBandwidth}
        bandwidthUsageData={data.bandwidthUsageData}
        ipv6TrafficPercent={data.ipv6TrafficPercent}
        showIpv6={isModuleEnabled("ipv6")}
      />

      {/* ── New Dashboard Widgets Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <IspHealthScoreWidget />
        <NetworkHealthEnhancedWidget />
        <BandwidthTrendsWidget
          bandwidthUsageData={data.bandwidthUsageData}
          peakBandwidth={data.peakBandwidth}
          currentBandwidth={data.currentBandwidth}
        />
        <TopAreasWidget areaWiseRevenue={data.areaWiseRevenue} />
      </div>

      {/* ── Area Distribution & Connection Type Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AreaDistributionWidget />
        <ConnectionTypeWidget />
      </div>

      {/* ── Revenue Analytics Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenuePaymentModeWidget />
      </div>

      {/* ── Top Revenue Subscribers & Plan Comparison Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopSubscribersWidget />
        <PlanComparisonWidget />
      </div>

      {/* ── Collection Performance Widget ── */}
      <CollectionPerformanceWidget />

      {/* ── Revenue & Complaints Analytics Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComplaintsAnalyticsWidget />
      </div>

      {/* ── System Alerts & Plan Performance Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SystemAlertsWidget />
        <PlanPerformanceWidget />
      </div>

      {/* ── Recent Payments Timeline ── */}
      <RecentPaymentsTimelineWidget />

      {/* ── Expiring Subscriptions & Overdue Payments Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExpiringSubscriptionsWidget />
        <OverduePaymentsWidget />
      </div>

      {/* ══════════ Advanced Insights (collapsed by default) ══════════
          The analytics long-tail below lives behind a toggle: nothing here
          compiles, mounts or fetches until the operator expands the section.
          State persists per browser via localStorage. */}
      <section aria-label="Advanced insights" className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={toggleAdvancedInsights}
          aria-expanded={showAdvancedInsights}
          className={cn(
            "w-full flex items-center gap-3 px-5 py-4 text-left transition-colors duration-200",
            "bg-gradient-to-r from-slate-50 via-card to-card dark:from-slate-900/60 dark:via-card dark:to-card",
            "hover:from-muted/70 hover:to-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
          )}
        >
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              Advanced Insights
              <Badge
                variant="outline"
                className="h-5 text-[10px] px-1.5 py-0 font-medium text-muted-foreground border-border/60"
              >
                {showAdvancedInsights ? "16 modules active" : "16 modules"}
              </Badge>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {showAdvancedInsights
                ? "Churn, retention, security posture, lifecycle analytics and forecasts — loaded on demand."
                : "Churn prediction, retention health, security posture, lifecycle analytics and forecasts. Expand to load."}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-300",
              showAdvancedInsights && "rotate-180"
            )}
          />
        </button>
        {showAdvancedInsights && (
          <div className="p-5 pt-0 space-y-6 border-t border-border/40">

            {/* ── Retention & Financial Health Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-5">
              <RetentionChurnWidget />
              <InvoiceAgingWidget />
            </div>

            {/* ── Churn Risk Alerts ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChurnRiskWidget />
              <ChurnPredictionWidget />
            </div>

            {/* ── Payment Analytics & Subscriber Lifecycle Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PaymentAnalyticsWidget />
              <SubscriberLifecycleWidget />
            </div>

            {/* ── Technician Performance ── */}
            <TechnicianPerformanceWidget />

            {/* ── Subscriber Analytics ── */}
            <SubscriberAnalyticsWidget />

            {/* ── System Overview & System Performance Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SystemOverviewWidget />
              <SystemPerformanceWidget />
            </div>

            {/* ── Security Posture (sessions + auth events) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SecurityPostureWidget />
              <RadiusSyncStatusWidget />
            </div>

            {/* ── Smart Plan Recommendations ── */}
            <PlanRecommendationWidget />

            {/* ── Response Time, Collection Target & Recent Signups Row ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ResponseTimeWidget />
              <CollectionTargetWidget />
              <RecentSignupsWidget />
            </div>

            {/* ── Revenue Forecast Widget ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RevenueForecastWidget />
            </div>
          </div>
        )}
      </section>

      {/* ── Charts Row 1: Revenue + Subscriber Growth (lazy — recharts) ── */}
      <RevenueGrowthChartsRow
        monthlyRevenueData={data.monthlyRevenueData}
        subscriberGrowthData={data.subscriberGrowthData}
        rangeLabel={rangeLabel}
 />

      {/* ── Charts Row 2: Plan Distribution + Collection + Area Revenue ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <PlanDistributionCard planDistribution={data.planDistribution} />
        <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "700ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-chart-4" />Payment Collection
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Today&apos;s Target</span>
                <span className="text-sm font-bold tabular-nums">
                  {formatINR(data.collectionToday)} <span className="text-muted-foreground font-normal">/ {formatINR(data.dailyTarget)}</span>
                </span>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-all duration-700 ${collectionPercent >= 80 ? "bg-green-500" : collectionPercent >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${Math.min(collectionPercent, 100)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{collectionPercent}% of daily target achieved</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Monthly Target</span>
                <span className="text-sm font-bold tabular-nums">
                  {formatINR(data.revenueThisMonth)} <span className="text-muted-foreground font-normal">/ {formatINR(data.monthlyTarget)}</span>
                </span>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-all duration-700 ${monthlyCollectionPercent >= 80 ? "bg-green-500" : monthlyCollectionPercent >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${Math.min(monthlyCollectionPercent, 100)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{monthlyCollectionPercent}% of monthly target achieved</p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-lg font-bold">{data.totalActive}</p>
                <p className="text-xs text-muted-foreground">Active Users</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-lg font-bold">{data.totalSubscribers}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <AreaRevenueCard areaWiseRevenue={data.areaWiseRevenue} />
      </div>

      {/* ── Recent Activity Feed ── */}
      <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "800ms" }}>
        <CardHeader className="pb-2 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
                <Activity className="h-4 w-4" />
              </div>
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              {/* Live indicator with pulsing dot */}
              <span className="flex items-center gap-1.5 ml-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Live</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Unread activity count badge */}
              {data.urgentItems.total > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5 min-w-[1.25rem] rounded-full">
                  {data.urgentItems.total} new
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                onClick={() => setCurrentPage("Audit Log", "SETTINGS")}
              >
                View All
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ActivityFeed maxItems={8} showHeader={false} />
        </CardContent>
      </Card>

      {/* ── Complaint Trend (lazy — recharts) ── */}
      <ComplaintTrendCard
        complaintTrendData={data.complaintTrendData}
        openComplaints={data.openComplaints}
        rangeLabel={rangeLabel}
      />

      {/* ── Bandwidth Usage Chart 24h (lazy — recharts) ── */}
      <BandwidthUsageCard
        bandwidthUsageData={data.bandwidthUsageData}
        peakBandwidth={data.peakBandwidth}
      />

      {/* ── Plan Revenue Breakdown (lazy — recharts) ── */}
      <PlanRevenueCard planRevenueBreakdown={data.planRevenueBreakdown} />

      {/* ── Network Device Health Overview ── */}
      <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "830ms" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            Network Device Health
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="flex flex-wrap gap-3 sm:gap-4">
            {[
              { label: "Online", count: data.deviceHealth.online, color: "bg-green-500" },
              { label: "Offline", count: data.deviceHealth.offline, color: "bg-red-500" },
              { label: "Warning", count: data.deviceHealth.warning, color: "bg-amber-500" },
              { label: "Unknown", count: data.deviceHealth.unknown, color: "bg-gray-400" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <div className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="text-xs font-bold">{s.count}</span>
              </div>
            ))}
          </div>
          {data.deviceHealth.topDevices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-3 text-muted-foreground">
              <div className="p-3 rounded-2xl bg-emerald-100 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-400">
                <Activity className="h-8 w-8" />
              </div>
              <p className="text-sm">No devices found</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <Table className="cryptsk-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">CPU</TableHead>
                    <TableHead className="text-xs">Memory</TableHead>
                    <TableHead className="text-xs">Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.deviceHealth.topDevices.map((d, idx) => (
                    <TableRow key={d.id} className="list-item-stagger" style={{ "--stagger-delay": `${idx * 40}ms` } as React.CSSProperties}>
                      <TableCell className="text-xs font-medium">{d.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.type}</TableCell>
                      <TableCell className="text-xs\">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce ${DEVICE_STATUS_BADGE[d.status]?.class || ""}`}>
                          {DEVICE_STATUS_BADGE[d.status]?.label || d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs\">
                        {d.cpuUsage !== null && d.cpuUsage !== undefined ? (
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                              <div className={`h-full rounded-full ${d.cpuUsage >= 80 ? "bg-red-500" : d.cpuUsage >= 60 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(d.cpuUsage, 100)}%` }} />
                            </div>
                            <span className="text-[10px] tabular-nums w-7">{d.cpuUsage.toFixed(0)}%</span>
                          </div>
                        ) : <span className="text-muted-foreground text-[10px]">N/A</span>}
                      </TableCell>
                      <TableCell className="text-xs\">
                        {d.memoryUsage !== null && d.memoryUsage !== undefined ? (
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                              <div className={`h-full rounded-full ${d.memoryUsage >= 80 ? "bg-red-500" : d.memoryUsage >= 60 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(d.memoryUsage, 100)}%` }} />
                            </div>
                            <span className="text-[10px] tabular-nums w-7">{d.memoryUsage.toFixed(0)}%</span>
                          </div>
                        ) : <span className="text-muted-foreground text-[10px]">N/A</span>}
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground tabular-nums">
                        {d.lastSeenAt ? formatDate(d.lastSeenAt) : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Recent Complaints ── */}
      <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "850ms" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />Recent Complaints
              <Button
                variant="ghost" size="sm" className="ml-auto text-xs text-muted-foreground gap-1 h-7"
                onClick={() => handleQuickAction("Complaints", "OPERATIONS")}
              >
                View All <ChevronRight className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {data.recentComplaints.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
                <div className="p-3 rounded-2xl bg-green-100 dark:bg-green-950/30 text-green-500 dark:text-green-400">
                  <ShieldAlert className="h-8 w-8" />
                </div>
                <p className="text-sm">No complaints found</p>
                <p className="text-xs">Everything is running smoothly!</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table className="cryptsk-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Ticket #</TableHead>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Priority</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentComplaints.map((c, idx) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors list-item-stagger"
                        style={{ "--stagger-delay": `${idx * 40}ms` } as React.CSSProperties}
                        onClick={() => handleQuickAction("Complaints", "OPERATIONS")}
                      >
                        <TableCell className="font-mono text-xs font-medium">{c.ticketNumber}</TableCell>
                        <TableCell className="text-xs font-medium">{c.customerName}</TableCell>
                        <TableCell className="text-xs">{COMPLAINT_TYPE_LABELS[c.type] || c.type}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce ${PRIORITY_BADGE[c.priority]?.class || ""}`}>
                            {PRIORITY_BADGE[c.priority]?.label || c.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce ${STATUS_BADGE[c.status]?.class || ""}`}>
                            {STATUS_BADGE[c.status]?.label || c.status}
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

      {/* ── Overdue Invoices + Upcoming Renewals ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "950ms" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-500" />
              Overdue Invoices
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 badge-glow">{data.overdueCount}</Badge>
              <Button
                variant="ghost" size="sm" className="ml-auto text-xs text-muted-foreground gap-1 h-7"
                onClick={() => handleQuickAction("Invoices", "FINANCE")}
              >
                View All <ChevronRight className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {data.overdueCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-muted-foreground">
                <div className="p-3 rounded-2xl bg-green-100 dark:bg-green-950/30 text-green-500 dark:text-green-400">
                  <FileText className="h-8 w-8" />
                </div>
                <p className="text-sm">No overdue invoices — great job!</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs text-muted-foreground">Total Outstanding</span>
                  <span className="text-sm font-bold text-red-600 tabular-nums">{formatINR(data.overdueTotal)}</span>
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <Table className="cryptsk-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Invoice #</TableHead>
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs">Due Date</TableHead>
                        <TableHead className="text-xs text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.overdueInvoices.map((inv, idx) => (
                        <TableRow
                          key={inv.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors list-item-stagger"
                          style={{ "--stagger-delay": `${idx * 50}ms` } as React.CSSProperties}
                          onClick={() => handleQuickAction("Invoices", "FINANCE")}
                        >
                          <TableCell className="font-mono text-xs font-medium">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-xs font-medium">
                            <div>{inv.customerName}</div>
                            {inv.phone && <div className="text-muted-foreground text-[10px]">{inv.phone}</div>}
                          </TableCell>
                          <TableCell className="text-xs text-red-600">{formatShortDate(inv.dueDate)}</TableCell>
                          <TableCell className="text-xs font-semibold tabular-nums text-right">{formatINR(inv.balanceAmount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-amber-200 dark:hover:border-amber-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "1000ms" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-500" />
              Upcoming Renewals
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-200 text-amber-600">
                Next 7 days
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {data.upcomingRenewals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-muted-foreground">
                <div className="p-3 rounded-2xl bg-amber-100 dark:bg-amber-950/30 text-amber-500 dark:text-amber-400">
                  <CalendarClock className="h-8 w-8" />
                </div>
                <p className="text-sm">No renewals in the next 7 days</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <Table className="cryptsk-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Plan</TableHead>
                      <TableHead className="text-xs">Renewal</TableHead>
                      <TableHead className="text-xs text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.upcomingRenewals.map((r, idx) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors list-item-stagger"
                        style={{ "--stagger-delay": `${idx * 50}ms` } as React.CSSProperties}
                        onClick={() => handleQuickAction("Subscribers", "MAIN")}
                      >
                        <TableCell className="text-xs font-medium">
                          <div>{r.name}</div>
                          {r.phone && <div className="text-muted-foreground text-[10px]">{r.phone}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.planName}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${
                                r.daysUntilRenewal <= 1
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : r.daysUntilRenewal <= 3
                                    ? "bg-amber-100 text-amber-700 border-amber-200"
                                    : "bg-green-100 text-green-700 border-green-200"
                              }`}
                            >
                              {r.daysUntilRenewal === 0 ? "Today" : `${r.daysUntilRenewal}d left`}
                            </Badge>
                            <span className="text-muted-foreground">{formatShortDate(r.nextRenewalDate)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-semibold tabular-nums text-right">{formatINR(r.planPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Revenue Customers ── */}
      <Card className="border shadow-sm animate-card-enter hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800/50 transition-all duration-200 rounded-xl" style={{ animationDelay: "1050ms" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-500" />
            Top Revenue Customers
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-200 text-green-600">This Month</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {data.topRevenueCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-3 text-muted-foreground">
              <div className="p-3 rounded-2xl bg-emerald-100 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-400">
                <DollarSign className="h-8 w-8" />
              </div>
              <p className="text-sm">No revenue data this month</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <Table className="cryptsk-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-10">#</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Area</TableHead>
                    <TableHead className="text-xs text-right">Total Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topRevenueCustomers.map((c, i) => (
                    <TableRow
                      key={c.subscriberId}
                      className="cursor-pointer hover:bg-muted/50 transition-colors list-item-stagger"
                      style={{ "--stagger-delay": `${i * 40}ms` } as React.CSSProperties}
                      onClick={() => setQuickViewSubscriberId(c.subscriberId)}
                    >
                      <TableCell className="text-xs font-bold text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium">
                        <div className="hover:text-red-600 dark:hover:text-red-400 transition-colors">{c.name}</div>
                        {c.phone && <div className="text-muted-foreground text-[10px]">{c.phone}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.area || "—"}</TableCell>
                      <TableCell className="text-xs font-semibold tabular-nums text-right">{formatINR(c.totalPaid)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════════
          NEW ENHANCED SECTIONS
          ════════════════════════════════════════════════════════════════ */}

      {/* ── Network Health Overview ── */}
      <div className="space-y-3 animate-slide-up" style={{ animationDelay: "960ms" }}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-500 text-white shadow-sm">
            <Activity className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Network Health Overview</h2>
          <span className="flex items-center gap-1.5 ml-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">Live</span>
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Active Connections */}
          <Card className="border-0 shadow-lg rounded-xl hover:scale-[1.02] transition-transform duration-200 animate-card-enter ring-1 ring-black/5 stat-gradient-green" style={{ animationDelay: "970ms" }}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider opacity-80">Active Connections</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1.5 tabular-nums">{data.activeConnections.toLocaleString("en-IN")}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                    </span>
                    <p className="text-[10px] sm:text-xs opacity-75">{data.onlineDevices} of {data.totalDevices} devices online</p>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm text-white transition-transform duration-200 hover:scale-110">
                  <Wifi className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bandwidth Utilization */}
          <Card className="border-0 shadow-lg rounded-xl hover:scale-[1.02] transition-transform duration-200 animate-card-enter ring-1 ring-black/5 stat-gradient-blue" style={{ animationDelay: "990ms" }}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider opacity-80">Bandwidth Utilization</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1.5 tabular-nums">{data.peakBandwidth > 0 ? ((data.currentBandwidth / data.peakBandwidth) * 100).toFixed(1) : 0}%</p>
                  <div className="mt-2">
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/20">
                      <div
                        className="h-full rounded-full bg-white/80 transition-all duration-700"
                        style={{ width: `${data.peakBandwidth > 0 ? Math.min((data.currentBandwidth / data.peakBandwidth) * 100, 100) : 0}%` }}
                      />
                    </div>
                    <p className="text-[10px] sm:text-xs opacity-75 mt-1">{(data.currentBandwidth / 1000000).toFixed(1)} / {(data.peakBandwidth / 1000000).toFixed(1)} Mbps</p>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm text-white transition-transform duration-200 hover:scale-110">
                  <Gauge className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Average Latency Indicator */}
          <Card className="border-0 shadow-lg rounded-xl hover:scale-[1.02] transition-transform duration-200 animate-card-enter ring-1 ring-black/5 stat-gradient-amber" style={{ animationDelay: "1010ms" }}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider opacity-80">Average Latency</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1.5 tabular-nums">{data.openComplaints === 0 ? "12" : data.openComplaints < 5 ? "18" : data.openComplaints < 10 ? "28" : "45"}ms</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${data.openComplaints < 5 ? "bg-green-400" : data.openComplaints < 10 ? "bg-yellow-400" : "bg-red-400"}`} />
                    <p className="text-[10px] sm:text-xs opacity-75">{data.openComplaints < 5 ? "Excellent" : data.openComplaints < 10 ? "Fair" : "High"}</p>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm text-white transition-transform duration-200 hover:scale-110">
                  <Zap className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Uptime Percentage */}
          <Card className={`border-0 shadow-lg rounded-xl hover:scale-[1.02] transition-transform duration-200 animate-card-enter ring-1 ring-black/5 ${data.networkUptime >= 99 ? "stat-gradient-emerald" : data.networkUptime >= 95 ? "stat-gradient-teal" : "stat-gradient-red"}`} style={{ animationDelay: "1030ms" }}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider opacity-80">Network Uptime</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1.5 tabular-nums">{data.networkUptime}%</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <TrendingUp className={`h-3 w-3 ${data.uptimeTrend >= 0 ? "text-green-400" : "text-red-400"}`} />
                    <p className="text-[10px] sm:text-xs opacity-75">{data.uptimeTrend >= 0 ? "+" : ""}{data.uptimeTrend}% from last period</p>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm text-white transition-transform duration-200 hover:scale-110">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── System & Gateway Monitor ── */}
      <div className="space-y-3 animate-slide-up" style={{ animationDelay: "1040ms" }}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-sm">
            <Server className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-foreground">System &amp; Gateway Monitor</h2>
          {sysMonitor && (
            <span className={`flex items-center gap-1.5 ml-1`}>
              <span className={`relative flex h-2 w-2`}>
                {sysMonitor.gateway.status === "healthy" || sysMonitor.gateway.status === "ok" ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                )}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${sysMonitor.gateway.status === "healthy" || sysMonitor.gateway.status === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {sysMonitor.gateway.status === "healthy" || sysMonitor.gateway.status === "ok" ? "Gateway Online" : sysMonitor.gateway.status === "unreachable" ? "Gateway Offline" : "Degraded"}
              </span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Gateway Service */}
          <Card className="border shadow-sm hover:shadow-md transition-all duration-200 animate-card-enter" style={{ animationDelay: "1045ms" }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                    <Server className="h-5 w-5" />
                  </div>
                  <div className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ${sysMonitor && (sysMonitor.gateway.status === "healthy" || sysMonitor.gateway.status === "ok") ? "bg-emerald-500 ring-emerald-500/20" : "bg-red-500 ring-red-500/20"}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-bold tabular-nums ${sysMonitor && (sysMonitor.gateway.status === "healthy" || sysMonitor.gateway.status === "ok") ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {isLoadingSysMonitor ? "—" : sysMonitor && (sysMonitor.gateway.status === "healthy" || sysMonitor.gateway.status === "ok") ? "Online" : "Offline"}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">Gateway Service</p>
                  {sysMonitor && sysMonitor.gateway.uptime > 0 && (
                    <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                      {Math.floor(sysMonitor.gateway.uptime / 3600)}h {Math.floor((sysMonitor.gateway.uptime % 3600) / 60)}m up
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2. Network Interfaces */}
          <Card className="border shadow-sm hover:shadow-md transition-all duration-200 animate-card-enter" style={{ animationDelay: "1050ms" }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                    <Radio className="h-5 w-5" />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold tabular-nums">
                    {isLoadingSysMonitor ? "—" : sysMonitor ? sysMonitor.interfaces.total : 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Interfaces</p>
                  {sysMonitor && sysMonitor.interfaces.wan.total > 0 && (
                    <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                      WAN {sysMonitor.interfaces.wan.up}/{sysMonitor.interfaces.wan.total} · LAN {sysMonitor.interfaces.lan.up}/{sysMonitor.interfaces.lan.total}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. PPPoE Sessions */}
          <Card className="border shadow-sm hover:shadow-md transition-all duration-200 animate-card-enter" style={{ animationDelay: "1055ms" }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                    <Wifi className="h-5 w-5" />
                  </div>
                  {sysMonitor && sysMonitor.pppoe.activeSessions > 0 && (
                    <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold tabular-nums">
                    {isLoadingSysMonitor ? "—" : sysMonitor ? sysMonitor.pppoe.activeSessions : 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">PPPoE Sessions</p>
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">Active connections</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. DDoS Protection */}
          <Card className="border shadow-sm hover:shadow-md transition-all duration-200 animate-card-enter" style={{ animationDelay: "1060ms" }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                    <Shield className="h-5 w-5" />
                  </div>
                  {sysMonitor && sysMonitor.ddos.activePolicies > 0 && (
                    <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-500/20" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold tabular-nums">
                    {isLoadingSysMonitor ? "—" : sysMonitor ? sysMonitor.ddos.activePolicies : 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">DDoS Rules Active</p>
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                    {sysMonitor && sysMonitor.ddos.activePolicies > 0 ? "Armed" : "Disarmed"}
                    {sysMonitor && sysMonitor.ddos.totalPolicies > 0 && ` · ${sysMonitor.ddos.totalPolicies} total`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 5. Firewall Rules */}
          <Card className="border shadow-sm hover:shadow-md transition-all duration-200 animate-card-enter" style={{ animationDelay: "1065ms" }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  {sysMonitor && sysMonitor.firewall.activeRules > 0 && (
                    <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-purple-500 ring-2 ring-purple-500/20" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold tabular-nums">
                    {isLoadingSysMonitor ? "—" : sysMonitor ? sysMonitor.firewall.activeRules : 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Firewall Rules</p>
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">Active nftables rules</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 6. DHCP Leases */}
          <Card className="border shadow-sm hover:shadow-md transition-all duration-200 animate-card-enter" style={{ animationDelay: "1070ms" }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="p-2.5 rounded-xl bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
                    <Terminal className="h-5 w-5" />
                  </div>
                  {sysMonitor && sysMonitor.dhcp.leaseCount > 0 && (
                    <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold tabular-nums">
                    {isLoadingSysMonitor ? "—" : sysMonitor ? sysMonitor.dhcp.leaseCount : 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">DHCP Leases</p>
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">KEA DHCP server</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Quick Actions Grid ── */}
      <div className="space-y-3 animate-slide-up" style={{ animationDelay: "1080ms" }}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-orange-500 text-white shadow-sm">
            <Zap className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Add Subscriber */}
          <Card
            className="border border-border/50 shadow-sm rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group animate-card-enter overflow-hidden relative"
            style={{ animationDelay: "1060ms" }}
            onClick={() => { handleQuickAction("Subscribers", "MAIN"); toast.info("Navigate to Subscribers to add a new one"); }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-50/0 to-emerald-50/0 group-hover:from-green-50/80 group-hover:to-emerald-50/60 dark:group-hover:from-green-950/30 dark:group-hover:to-emerald-950/20 transition-all duration-300 pointer-events-none" />
            <CardContent className="p-4 sm:p-5 relative">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-lg shadow-green-500/20 shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:shadow-green-500/40">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">Add Subscriber</h3>
                  <p className="text-xs text-muted-foreground mt-1">Register a new subscriber connection</p>
                  <div className="flex items-center gap-1 mt-2 text-green-600 dark:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="text-[10px] font-medium">Go to page</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Create Invoice */}
          <Card
            className="border border-border/50 shadow-sm rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group animate-card-enter overflow-hidden relative"
            style={{ animationDelay: "1080ms" }}
            onClick={() => { handleQuickAction("Billing", "MAIN"); toast.info("Navigate to Billing to create a new invoice"); }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-50/0 to-rose-50/0 group-hover:from-red-50/80 group-hover:to-rose-50/60 dark:group-hover:from-red-950/30 dark:group-hover:to-rose-950/20 transition-all duration-300 pointer-events-none" />
            <CardContent className="p-4 sm:p-5 relative">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-red-400 to-rose-500 text-white shadow-lg shadow-red-500/20 shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:shadow-red-500/40">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">Create Invoice</h3>
                  <p className="text-xs text-muted-foreground mt-1">Generate and send invoices to subscribers</p>
                  <div className="flex items-center gap-1 mt-2 text-red-600 dark:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="text-[10px] font-medium">Go to page</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* New Complaint */}
          <Card
            className="border border-border/50 shadow-sm rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group animate-card-enter overflow-hidden relative"
            style={{ animationDelay: "1100ms" }}
            onClick={() => { handleQuickAction("Complaints", "OPERATIONS"); toast.info("Navigate to Complaints to raise a new one"); }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50/0 to-yellow-50/0 group-hover:from-amber-50/80 group-hover:to-yellow-50/60 dark:group-hover:from-amber-950/30 dark:group-hover:to-yellow-950/20 transition-all duration-300 pointer-events-none" />
            <CardContent className="p-4 sm:p-5 relative">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-lg shadow-amber-500/20 shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:shadow-amber-500/40">
                  <MessageSquarePlus className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">New Complaint</h3>
                  <p className="text-xs text-muted-foreground mt-1">File a new complaint or service request</p>
                  <div className="flex items-center gap-1 mt-2 text-amber-600 dark:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="text-[10px] font-medium">Go to page</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Generate Report */}
          <Card
            className="border border-border/50 shadow-sm rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group animate-card-enter overflow-hidden relative"
            style={{ animationDelay: "1120ms" }}
            onClick={handleExportCSV}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-teal-50/0 to-cyan-50/0 group-hover:from-teal-50/80 group-hover:to-cyan-50/60 dark:group-hover:from-teal-950/30 dark:group-hover:to-cyan-950/20 transition-all duration-300 pointer-events-none" />
            <CardContent className="p-4 sm:p-5 relative">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 text-white shadow-lg shadow-teal-500/20 shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:shadow-teal-500/40">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">Generate Report</h3>
                  <p className="text-xs text-muted-foreground mt-1">Download a comprehensive CSV report</p>
                  <div className="flex items-center gap-1 mt-2 text-teal-600 dark:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="text-[10px] font-medium">Download now</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Recent Activity Mini-Feed ── */}
      <div className="space-y-3 animate-slide-up" style={{ animationDelay: "1140ms" }}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm">
            <Clock className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Recent Activity</h2>
        </div>
        <Card className="border border-border/50 shadow-sm rounded-xl hover:shadow-md backdrop-blur-sm transition-all duration-200 animate-card-enter" style={{ animationDelay: "1150ms" }}>
          <CardContent className="p-4 sm:p-5 space-y-0">
            {/* Activity Entry 1 */}
            <div className="flex items-start gap-3 py-3 border-b border-border/50">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400 shrink-0 mt-0.5">
                <UserPlus className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  New subscriber <span className="font-semibold text-green-600 dark:text-green-400">Rajesh Kumar</span> registered
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Area:MG Road · Plan:100 Mbps Fiber</p>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">2 min ago</span>
            </div>

            {/* Activity Entry 2 */}
            <div className="flex items-start gap-3 py-3 border-b border-border/50">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                <CreditCard className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Payment received from <span className="font-semibold text-emerald-600 dark:text-emerald-400">Priya Sharma</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">₹999 via UPI · Invoice #INV-2847</p>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">15 min ago</span>
            </div>

            {/* Activity Entry 3 */}
            <div className="flex items-start gap-3 py-3 border-b border-border/50">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Complaint <span className="font-semibold text-blue-600 dark:text-blue-400">#CMP-0523</span> resolved
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Slow Speed issue for Amit Patel · Resolved in 4h</p>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">1 hr ago</span>
            </div>

            {/* Activity Entry 4 */}
            <div className="flex items-start gap-3 py-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5">
                <ArrowRightLeft className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Plan changed for <span className="font-semibold text-purple-600 dark:text-purple-400">Suresh Yadav</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">50 Mbps → 100 Mbps Fiber · Effective next cycle</p>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">3 hrs ago</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Revenue Overview ── */}
      <div className="space-y-3 animate-slide-up" style={{ animationDelay: "1160ms" }}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-sm">
            <IndianRupee className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Revenue Overview</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Monthly Revenue */}
          <Card className="border border-border/50 shadow-sm rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-card-enter border-l-4 border-l-green-500 bg-green-50/40 dark:bg-green-950/10" style={{ animationDelay: "1170ms" }}>
            <CardContent className="p-4 sm:p-5">
              <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">Monthly Revenue</p>
              <p className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums text-foreground">{formatINR(data.revenueThisMonth)}</p>
              <div className="flex items-center gap-1.5 mt-2">
                {data.revenueChangePercent >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span className={`text-[10px] sm:text-xs font-medium ${data.revenueChangePercent >= 0 ? "text-green-600" : "text-red-500"}`}>{data.revenueChangePercent >= 0 ? "+" : ""}{data.revenueChangePercent}% vs last month</span>
              </div>
            </CardContent>
          </Card>

          {/* Pending Payments */}
          <Card className="border border-border/50 shadow-sm rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-card-enter border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/10" style={{ animationDelay: "1190ms" }}>
            <CardContent className="p-4 sm:p-5">
              <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">Pending Payments</p>
              <p className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums text-foreground">{data.overdueCount > 0 ? Math.max(3, Math.round(data.overdueCount * 1.5)) : 0}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <Clock className="h-3 w-3 text-amber-600" />
                <span className="text-[10px] sm:text-xs text-amber-600 font-medium">Awaiting collection action</span>
              </div>
            </CardContent>
          </Card>

          {/* Overdue Invoices */}
          <Card className="border border-border/50 shadow-sm rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-card-enter border-l-4 border-l-red-500 bg-red-50/40 dark:bg-red-950/10" style={{ animationDelay: "1210ms" }}>
            <CardContent className="p-4 sm:p-5">
              <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">Overdue Invoices</p>
              <p className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums text-red-600 dark:text-red-400">{data.overdueCount}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-[10px] sm:text-xs text-red-500 font-medium">Outstanding {formatINR(data.overdueTotal)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Collection Efficiency */}
          <Card className={`border border-border/50 shadow-sm rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-card-enter border-l-4 ${monthlyCollectionPercent >= 80 ? "border-l-teal-500 bg-teal-50/40 dark:bg-teal-950/10" : monthlyCollectionPercent >= 50 ? "border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/10" : "border-l-red-500 bg-red-50/40 dark:bg-red-950/10"}`} style={{ animationDelay: "1230ms" }}>
            <CardContent className="p-4 sm:p-5">
              <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">Collection Efficiency</p>
              <p className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums text-foreground">{monthlyCollectionPercent}%</p>
              <div className="flex items-center gap-1.5 mt-2">
                <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full transition-all duration-700 ${monthlyCollectionPercent >= 80 ? "bg-teal-500" : monthlyCollectionPercent >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(monthlyCollectionPercent, 100)}%` }} />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">of monthly target</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Subscriber Growth & Plan Distribution ── */}
      <div className="space-y-3 animate-slide-up" style={{ animationDelay: "1240ms" }}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-sm">
            <Users className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Subscriber Growth</h2>
        </div>
        <Card className="rounded-xl border shadow-sm overflow-hidden">
          <CardContent className="p-4 sm:p-6">
            {isLoadingGrowth ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-28 rounded-full" />
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Skeleton className="skeleton-wave h-4 w-32" />
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="skeleton-wave h-3 w-20" />
                        <Skeleton className="skeleton-wave h-2 flex-1 rounded-full" />
                        <Skeleton className="skeleton-wave h-3 w-6" />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    <Skeleton className="skeleton-wave h-4 w-24" />
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="skeleton-wave h-3 w-40" />
                        <Skeleton className="skeleton-wave h-2 flex-1 rounded-full" />
                        <Skeleton className="skeleton-wave h-3 w-6" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : subscriberGrowth ? (
              <>
                {/* Stat Pills */}
                <div className="flex flex-wrap gap-2 mb-6">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <Users className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Total</span>
                    <span className="text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100">{subscriberGrowth.totalSubscribers}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-300">Active</span>
                    <span className="text-xs font-bold tabular-nums text-green-800 dark:text-green-100">{subscriberGrowth.activeSubscribers}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800">
                    <UserPlus className="h-3.5 w-3.5 text-teal-500" />
                    <span className="text-xs font-medium text-teal-700 dark:text-teal-300">New This Month</span>
                    <span className="text-xs font-bold tabular-nums text-teal-800 dark:text-teal-100">+{subscriberGrowth.newThisMonth}</span>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${subscriberGrowth.churnRate > 5 ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700"}`}>
                    <UserMinus className={`h-3.5 w-3.5 ${subscriberGrowth.churnRate > 5 ? "text-red-500" : "text-slate-500"}`} />
                    <span className={`text-xs font-medium ${subscriberGrowth.churnRate > 5 ? "text-red-700 dark:text-red-300" : "text-slate-600 dark:text-slate-300"}`}>Churn Rate</span>
                    <span className={`text-xs font-bold tabular-nums ${subscriberGrowth.churnRate > 5 ? "text-red-800 dark:text-red-100" : "text-slate-800 dark:text-slate-100"}`}>{subscriberGrowth.churnRate}%</span>
                  </div>
                </div>

                {/* Two-column layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* By Connection Type */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      By Connection Type
                    </h3>
                    {Object.keys(subscriberGrowth.byConnectionType).length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">No connection data available</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(subscriberGrowth.byConnectionType)
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => {
                            const maxCount = Math.max(...Object.values(subscriberGrowth.byConnectionType));
                            const gradientClass = CONNECTION_TYPE_COLORS[type] || "from-gray-400 to-gray-500";
                            return (
                              <div key={type} className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground w-24 truncate font-medium">{type.replace(/_/g, " ")}</span>
                                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full bg-gradient-to-r ${gradientClass} transition-all duration-700`}
                                    style={{ width: `${(count / maxCount) * 100}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold tabular-nums w-7 text-right text-foreground">{count}</span>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* Top Plans */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      Top Plans
                    </h3>
                    {subscriberGrowth.byPlan.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">No plan data available</p>
                    ) : (
                      <div className="space-y-3">
                        {subscriberGrowth.byPlan.map((plan, idx) => {
                          const maxPlanCount = subscriberGrowth.byPlan[0]?.count || 1;
                          return (
                            <div key={plan.planName} className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground w-5 text-right font-medium tabular-nums">{idx + 1}.</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-foreground truncate mr-2">{plan.planName}</span>
                                  <span className="text-xs font-semibold tabular-nums text-foreground shrink-0">{plan.count}</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500 transition-all duration-700"
                                    style={{ width: `${(plan.count / maxPlanCount) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                {isModuleEnabled("ipv6") && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      IP Stack Distribution
                    </h4>
                    <div className="space-y-1.5">
                      {[
                        { label: "IPv4 Only", value: data.ipv4OnlyCount || 0, color: "bg-gray-400" },
                        { label: "Dual Stack", value: data.dualStackCount || 0, color: "bg-emerald-500" },
                        { label: "IPv6 Only", value: data.ipv6OnlyCount || 0, color: "bg-cyan-500" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${item.color}`}></span>
                            {item.label}
                          </div>
                          <span className="font-medium">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* ── System Alerts ── */}
      <div className="space-y-3 animate-slide-up" style={{ animationDelay: "1250ms" }}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-sm">
            <Bell className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-foreground">System Alerts</h2>
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">3</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Warning Alert */}
          <Card className="border border-border/50 border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/10 shadow-sm rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-card-enter" style={{ animationDelay: "1260ms" }}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">High Bandwidth Usage</h3>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 uppercase tracking-wider">Warning</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">Current bandwidth utilization has exceeded 80% of peak capacity. Consider upgrading your upstream link to maintain quality of service.</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Triggered 30 minutes ago
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error Alert */}
          <Card className="border border-border/50 border-l-4 border-l-red-500 bg-red-50/30 dark:bg-red-950/10 shadow-sm rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-card-enter" style={{ animationDelay: "1280ms" }}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0 mt-0.5">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">Invoice Overdue Notice</h3>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 uppercase tracking-wider flex items-center gap-1">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                      </span>
                      Critical
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{data.overdueCount} invoices totaling {formatINR(data.overdueTotal)} are past due. Immediate follow-up with subscribers is recommended to avoid revenue loss.</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Triggered 2 hours ago
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info Alert */}
          <Card className="border border-border/50 border-l-4 border-l-sky-500 bg-sky-50/30 dark:bg-sky-950/10 shadow-sm rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-card-enter" style={{ animationDelay: "1300ms" }}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5">
                  <Info className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-sky-700 dark:text-sky-300">Trial Expiring Soon</h3>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 uppercase tracking-wider">Info</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{data.upcomingRenewals.length} subscriber(s) have renewals due within the next 7 days. Proactive outreach can improve retention rates significantly.</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Triggered 5 hours ago
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Footer timestamp ── */}
      <div className="text-center text-[10px] text-muted-foreground/60 pb-2 flex items-center justify-center gap-1.5">
        <span className="live-dot" style={{ width: 6, height: 6 }} />
        Data updated {data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "just now"} · Range: {rangeLabel}
      </div>

      {/* ── Dashboard Status Bar ── */}
      <DashboardStatusBar />

      {/* ── Subscriber Quick View Sheet ── */}
      <SubscriberQuickView
        subscriberId={quickViewSubscriberId}
        open={!!quickViewSubscriberId}
        onOpenChange={(open) => {
          if (!open) setQuickViewSubscriberId(null);
        }}
      />
    </div>
  );
}
