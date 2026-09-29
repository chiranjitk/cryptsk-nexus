"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Phone,
  Mail,
  MessageCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Send,
  CalendarClock,
  DollarSign,
  Target,
  BarChart3,
  RefreshCw,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Bell,
  UserCheck,
  MapPin,
  Zap,
  Filter,
  IndianRupee,
} from "lucide-react";
import { formatINR, apiFetch } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────

interface SmartSubscriber {
  subscriberId: string;
  subscriberName: string;
  phone: string;
  email: string;
  planName: string;
  totalOutstanding: number;
  daysOverdue: number;
  collectionProbability: number;
  probabilityLabel: string;
  avgDaysToPay: number;
  bestChannel: string;
  bestChannelLabel: string;
  bestTime: string;
  invoiceCount: number;
  collectionPriority: number;
}

interface SmartCollectionData {
  subscribers: SmartSubscriber[];
  summary: {
    totalOverdueAmount: number;
    totalOverdueSubscribers: number;
    avgDaysOverdue: number;
    avgCollectionProbability: number;
    highProbabilityCount: number;
    mediumProbabilityCount: number;
    lowProbabilityCount: number;
    veryLowProbabilityCount: number;
    totalRecoverableEstimate: number;
  };
  timestamp: string;
}

interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number;
  count: number;
  amount: number;
  color: string;
}

interface MonthlyRecovery {
  month: string;
  totalOverdue: number;
  recovered: number;
  recoveryRate: number;
}

interface ChannelEffectiveness {
  channel: string;
  label: string;
  totalPayments: number;
  totalAmount: number;
  avgDaysToCollect: number;
  successRate: number;
}

interface AreaPerformance {
  areaName: string;
  totalOutstanding: number;
  recoveredAmount: number;
  recoveryRate: number;
  avgDaysToCollect: number;
  subscriberCount: number;
}

interface TopDebtor {
  subscriberId: string;
  subscriberName: string;
  phone: string;
  planName: string;
  areaName: string;
  totalOutstanding: number;
  daysOverdue: number;
  invoiceCount: number;
}

interface CollectionAnalytics {
  agingBuckets: AgingBucket[];
  monthlyRecovery: MonthlyRecovery[];
  channelEffectiveness: ChannelEffectiveness[];
  areaPerformance: AreaPerformance[];
  topDebtors: TopDebtor[];
  dso: number;
  avgDaysToCollect: number;
  summary: {
    totalOutstanding: number;
    totalOverdueInvoices: number;
    totalRecoveredThisMonth: number;
    overallRecoveryRate: number;
  };
  timestamp: string;
}

type SortField = "collectionPriority" | "totalOutstanding" | "daysOverdue" | "collectionProbability" | "avgDaysToPay";
type SortDirection = "asc" | "desc";

// ── Helpers ────────────────────────────────────────────────────────

function getProbabilityColor(label: string): string {
  switch (label) {
    case "HIGH": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    case "MEDIUM": return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "LOW": return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30";
    case "VERY LOW": return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
    default: return "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30";
  }
}

function getProbabilityBarColor(label: string): string {
  switch (label) {
    case "HIGH": return "bg-emerald-500";
    case "MEDIUM": return "bg-amber-500";
    case "LOW": return "bg-orange-500";
    case "VERY LOW": return "bg-red-500";
    default: return "bg-gray-500";
  }
}

function getChannelIcon(channel: string) {
  switch (channel.toUpperCase()) {
    case "WHATSAPP": return <MessageCircle className="w-4 h-4 text-emerald-500" />;
    case "EMAIL": return <Mail className="w-4 h-4 text-teal-500" />;
    case "SMS": return <Phone className="w-4 h-4 text-amber-500" />;
    default: return <Bell className="w-4 h-4 text-gray-500" />;
  }
}

function getMessageTemplate(channel: string, name: string, amount: number): string {
  const amt = formatINR(amount);
  switch (channel.toUpperCase()) {
    case "WHATSAPP":
      return `Dear ${name},\n\nThis is a friendly reminder from Cryptsk ISP regarding your pending payment of ${amt}.\n\nPlease clear your dues at the earliest to avoid service interruption.\n\nThank you for being a valued customer! 🙏`;
    case "EMAIL":
      return `Dear ${name},\n\nThis is a reminder from Cryptsk ISP regarding your outstanding balance of ${amt}.\n\nWe kindly request you to clear your dues at your earliest convenience to continue enjoying uninterrupted services.\n\nFor payment options, please contact our support team.\n\nBest regards,\nCryptsk ISP Team`;
    case "SMS":
      return `Dear ${name}, your Cryptsk ISP bill of ${amt} is overdue. Please pay now to avoid disconnection. Call us for assistance. Thank you!`;
    default:
      return `Dear ${name}, your outstanding balance of ${amt} is overdue. Please clear your dues at the earliest.`;
  }
}

// ── Simple Bar Chart Component ─────────────────────────────────────

function HorizontalBarChart({ data, maxValue, valueFormatter }: {
  data: { label: string; value: number; color: string }[];
  maxValue: number;
  valueFormatter: (v: number) => string;
}) {
  return (
    <div className="space-y-3">
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-24 text-right shrink-0">{item.label}</span>
          <div className="flex-1 h-6 bg-muted/50 rounded-md overflow-hidden relative">
            <div
              className="h-full rounded-md transition-all duration-700 ease-out"
              style={{
                width: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`,
                backgroundColor: item.color,
                minWidth: item.value > 0 ? "4px" : "0px",
              }}
            />
          </div>
          <span className="text-xs font-semibold text-foreground w-24 text-right shrink-0">
            {valueFormatter(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Recovery Rate Mini Chart ───────────────────────────────────────

function RecoveryRateChart({ data }: { data: MonthlyRecovery[] }) {
  const maxRate = Math.max(...data.map((d) => d.recoveryRate), 100);
  return (
    <div className="space-y-2">
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-16 shrink-0">{item.month}</span>
          <div className="flex-1 h-5 bg-muted/50 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-700 ease-out"
              style={{
                width: `${maxRate > 0 ? (item.recoveryRate / maxRate) * 100 : 0}%`,
                backgroundColor: item.recoveryRate >= 80 ? "#10B981" : item.recoveryRate >= 50 ? "#F59E0B" : "#EF4444",
                minWidth: item.recoveryRate > 0 ? "3px" : "0px",
              }}
            />
          </div>
          <span className="text-xs font-medium w-14 text-right shrink-0">
            {item.recoveryRate.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Channel Comparison Bars ────────────────────────────────────────

function ChannelComparison({ channels }: { channels: ChannelEffectiveness[] }) {
  const channelColors: Record<string, string> = {
    UPI: "#10B981",
    ONLINE: "#0D9488",
    BANK_TRANSFER: "#F59E0B",
    CASH: "#EF4444",
    CHEQUE: "#F97316",
    WALLET: "#8B5CF6",
  };

  return (
    <div className="space-y-3">
      {channels.map((ch, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-28 text-right shrink-0">{ch.label}</span>
          <div className="flex-1 h-6 bg-muted/50 rounded-md overflow-hidden">
            <div
              className="h-full rounded-md transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(100, (ch.avgDaysToCollect / 60) * 100)}%`,
                backgroundColor: channelColors[ch.channel] || "#6B7280",
              }}
            />
          </div>
          <span className="text-xs font-medium w-16 text-right shrink-0">
            {ch.avgDaysToCollect.toFixed(1)}d
          </span>
          <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
            {formatINR(ch.totalAmount)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export default function SmartCollectionsPage() {
  // Data state
  const [smartData, setSmartData] = useState<SmartCollectionData | null>(null);
  const [analytics, setAnalytics] = useState<CollectionAnalytics | null>(null);
  const [loadingSmart, setLoadingSmart] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Table state
  const [sortField, setSortField] = useState<SortField>("collectionPriority");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterProb, setFilterProb] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogChannel, setDialogChannel] = useState("WHATSAPP");
  const [dialogMessage, setDialogMessage] = useState("");
  const [dialogScheduledAt, setDialogScheduledAt] = useState("");
  const [sending, setSending] = useState(false);

  // Fetch smart collection data
  const fetchSmartData = useCallback(async () => {
    try {
      setLoadingSmart(true);
      const data = await apiFetch<SmartCollectionData>("/api/collections/smart", {
        credentials: "include",
      });
      setSmartData(data);
    } catch (err) {
      console.error("Failed to fetch smart data:", err);
      toast.error("Failed to load collection data");
    } finally {
      setLoadingSmart(false);
    }
  }, []);

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    try {
      setLoadingAnalytics(true);
      const data = await apiFetch<CollectionAnalytics>("/api/collections/analytics", {
        credentials: "include",
      });
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
      toast.error("Failed to load analytics data");
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => {
    fetchSmartData();
  }, [fetchSmartData]);

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // Filter and sort subscribers
  const getFilteredSubscribers = (): SmartSubscriber[] => {
    if (!smartData) return [];

    let subs = [...smartData.subscribers];

    // Filter by probability
    if (filterProb !== "ALL") {
      subs = subs.filter((s) => s.probabilityLabel === filterProb);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      subs = subs.filter(
        (s) =>
          s.subscriberName.toLowerCase().includes(q) ||
          s.phone.includes(q) ||
          s.planName.toLowerCase().includes(q)
      );
    }

    // Sort
    subs.sort((a, b) => {
      let valA: number, valB: number;
      switch (sortField) {
        case "collectionPriority": valA = a.collectionPriority; valB = b.collectionPriority; break;
        case "totalOutstanding": valA = a.totalOutstanding; valB = b.totalOutstanding; break;
        case "daysOverdue": valA = a.daysOverdue; valB = b.daysOverdue; break;
        case "collectionProbability": valA = a.collectionProbability; valB = b.collectionProbability; break;
        case "avgDaysToPay": valA = a.avgDaysToPay; valB = b.avgDaysToPay; break;
        default: valA = a.collectionPriority; valB = b.collectionPriority;
      }
      return sortDir === "asc" ? valA - valB : valB - valA;
    });

    return subs;
  };

  // Select handlers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const filtered = getFilteredSubscribers();
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.subscriberId)));
    }
  };

  // Open reminder dialog
  const openReminderDialog = () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one subscriber");
      return;
    }
    // Set default scheduled time to 1 hour from now
    const scheduled = new Date(Date.now() + 60 * 60 * 1000);
    const tzOffset = scheduled.getTimezoneOffset() * 60000;
    const local = new Date(scheduled.getTime() - tzOffset).toISOString().slice(0, 16);
    setDialogScheduledAt(local);

    // Set default message using first selected subscriber
    const firstSub = smartData?.subscribers.find((s) => s.subscriberId === Array.from(selectedIds)[0]);
    if (firstSub) {
      setDialogMessage(getMessageTemplate(dialogChannel, "{name}", firstSub.totalOutstanding));
    }
    setDialogOpen(true);
  };

  // Send reminders
  const handleSendReminders = async () => {
    if (selectedIds.size === 0) return;

    try {
      setSending(true);
      const result = await apiFetch<{
        success: boolean;
        created: number;
        message: string;
      }>("/api/collections/schedule", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          subscriberIds: Array.from(selectedIds),
          channel: dialogChannel,
          message: dialogMessage,
          scheduledAt: new Date(dialogScheduledAt).toISOString(),
        }),
      });

      if (result.success) {
        toast.success(result.message);
        setDialogOpen(false);
        setSelectedIds(new Set());
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to schedule reminders";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  // Handle immediate send (schedule for now)
  const handleImmediateSend = (sub: SmartSubscriber, channel: string) => {
    const message = getMessageTemplate(channel, sub.subscriberName, sub.totalOutstanding);
    setSelectedIds(new Set([sub.subscriberId]));
    setDialogChannel(channel);
    setDialogMessage(message);
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    setDialogScheduledAt(new Date(now.getTime() - tzOffset).toISOString().slice(0, 16));
    setDialogOpen(true);
  };

  // ── Loading State ──
  if (loadingSmart) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!smartData) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertTriangle className="w-12 h-12 text-amber-500" />
        <p className="text-muted-foreground">Failed to load collection data</p>
        <Button variant="outline" onClick={fetchSmartData}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const filteredSubs = getFilteredSubscribers();
  const summary = smartData.summary;
  const maxAgingAmount = analytics
    ? Math.max(...analytics.agingBuckets.map((b) => b.amount), 1)
    : 1;

  return (
    <TooltipProvider>
      <div className="space-y-6 p-4 md:p-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Target className="w-5 h-5 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Smart Collections</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-powered payment reminders & collection optimization — prioritize, schedule, and track recovery
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchSmartData}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="card-hover-pollish">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-500/10">
                  <IndianRupee className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Overdue</p>
                  <p className="text-xl font-bold text-red-600">{formatINR(summary.totalOverdueAmount)}</p>
                  <p className="text-xs text-muted-foreground">{summary.totalOverdueSubscribers} subscribers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover-pollish">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Recovery Estimate</p>
                  <p className="text-xl font-bold text-emerald-600">{formatINR(summary.totalRecoverableEstimate)}</p>
                  <p className="text-xs text-muted-foreground">Based on {summary.avgCollectionProbability}% avg probability</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover-pollish">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Avg Days Overdue</p>
                  <p className="text-xl font-bold text-amber-600">{summary.avgDaysOverdue} days</p>
                  <p className="text-xs text-muted-foreground">Across all overdue invoices</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover-pollish">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-teal-500/10">
                  <Zap className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Avg Collection Score</p>
                  <p className="text-xl font-bold text-teal-600">{summary.avgCollectionProbability}%</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-muted-foreground">{summary.highProbabilityCount} high</span>
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-1" />
                    <span className="text-xs text-muted-foreground">{summary.mediumProbabilityCount} med</span>
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-1" />
                    <span className="text-xs text-muted-foreground">{summary.lowProbabilityCount + summary.veryLowProbabilityCount} low</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="queue" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid">
            <TabsTrigger value="queue" className="gap-2">
              <UserCheck className="w-4 h-4" /> Collection Queue
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2" onClick={fetchAnalytics}>
              <BarChart3 className="w-4 h-4" /> Analytics
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════ */}
          {/* QUEUE TAB                                                */}
          {/* ════════════════════════════════════════════════════════ */}
          <TabsContent value="queue" className="space-y-4">
            {/* ── Aging Analysis Chart ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-red-500" />
                  Aging Analysis
                </CardTitle>
                <CardDescription>Outstanding amounts by days overdue</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics ? (
                  <HorizontalBarChart
                    data={analytics.agingBuckets.map((b) => ({
                      label: b.label,
                      value: b.amount,
                      color: b.color,
                    }))}
                    maxValue={maxAgingAmount}
                    valueFormatter={(v) => formatINR(v)}
                  />
                ) : (
                  <div className="flex justify-center py-8">
                    <Button variant="outline" size="sm" onClick={fetchAnalytics}>
                      Load Aging Data
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Toolbar ── */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search name, phone, plan..."
                        className="pl-9 w-56 h-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <Select value={filterProb} onValueChange={setFilterProb}>
                      <SelectTrigger className="w-36 h-9">
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Probabilities</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="VERY LOW">Very Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary" className="h-9 px-3">
                      {filteredSubs.length} result{filteredSubs.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                      <Badge variant="destructive" className="h-9 px-3">
                        {selectedIds.size} selected
                      </Badge>
                    )}
                    <Button size="sm" onClick={openReminderDialog} disabled={selectedIds.size === 0}>
                      <Send className="w-4 h-4 mr-1" /> Send Reminder
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Smart Queue Table ── */}
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="table-polish">
                        <TableHead className="w-10 px-3">
                          <Checkbox
                            checked={filteredSubs.length > 0 && selectedIds.size === filteredSubs.length}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Subscriber</TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort("totalOutstanding")}
                        >
                          <span className="flex items-center gap-1">
                            Outstanding <ArrowUpDown className="w-3 h-3" />
                          </span>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort("daysOverdue")}
                        >
                          <span className="flex items-center gap-1">
                            Days <ArrowUpDown className="w-3 h-3" />
                          </span>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort("collectionProbability")}
                        >
                          <span className="flex items-center gap-1">
                            Probability <ArrowUpDown className="w-3 h-3" />
                          </span>
                        </TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Best Time</TableHead>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => handleSort("avgDaysToPay")}
                        >
                          <span className="flex items-center gap-1">
                            Pay Score <ArrowUpDown className="w-3 h-3" />
                          </span>
                        </TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                            {searchQuery || filterProb !== "ALL"
                              ? "No subscribers match your filters"
                              : "No overdue invoices found"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredSubs.map((sub, idx) => (
                          <TableRow
                            key={sub.subscriberId}
                            className={`table-polish ${selectedIds.has(sub.subscriberId) ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}
                          >
                            <TableCell className="px-3">
                              <Checkbox
                                checked={selectedIds.has(sub.subscriberId)}
                                onCheckedChange={() => toggleSelect(sub.subscriberId)}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm text-foreground">{sub.subscriberName}</p>
                                <p className="text-xs text-muted-foreground">{sub.phone}</p>
                                <p className="text-xs text-muted-foreground/70">{sub.planName}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-semibold text-red-600 dark:text-red-400">
                                {formatINR(sub.totalOutstanding)}
                              </span>
                              <p className="text-xs text-muted-foreground">{sub.invoiceCount} invoice{sub.invoiceCount > 1 ? "s" : ""}</p>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  sub.daysOverdue <= 7
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                    : sub.daysOverdue <= 30
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                                    : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                                }
                              >
                                {sub.daysOverdue}d
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1.5 min-w-[100px]">
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${getProbabilityColor(sub.probabilityLabel)}`}
                                >
                                  {sub.probabilityLabel}
                                </Badge>
                                <Progress
                                  value={sub.collectionProbability}
                                  className="h-1.5"
                                />
                                <p className="text-xs text-muted-foreground">{sub.collectionProbability}%</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5">
                                    {getChannelIcon(sub.bestChannel)}
                                    <span className="text-xs">{sub.bestChannelLabel}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>Best contact channel</TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs">{sub.bestTime}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm font-medium">
                                    {sub.avgDaysToPay}d
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Avg days to pay historically</TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center gap-1 justify-end">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleImmediateSend(sub, "WHATSAPP")}
                                    >
                                      <MessageCircle className="w-4 h-4 text-emerald-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Send WhatsApp</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleImmediateSend(sub, "SMS")}
                                    >
                                      <Phone className="w-4 h-4 text-amber-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Send SMS</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleImmediateSend(sub, "EMAIL")}
                                    >
                                      <Mail className="w-4 h-4 text-teal-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Send Email</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════ */}
          {/* ANALYTICS TAB                                            */}
          {/* ════════════════════════════════════════════════════════ */}
          <TabsContent value="analytics" className="space-y-4">
            {loadingAnalytics ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-64 rounded-xl" />
                ))}
              </div>
            ) : analytics ? (
              <>
                {/* ── Analytics Summary Cards ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="card-hover-pollish">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium">DSO (Days Sales Outstanding)</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{analytics.dso} days</p>
                      <p className="text-xs text-muted-foreground">Weighted avg collection time</p>
                    </CardContent>
                  </Card>
                  <Card className="card-hover-pollish">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium">Avg Days to Collect</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{analytics.avgDaysToCollect} days</p>
                      <p className="text-xs text-muted-foreground">Unweighted average</p>
                    </CardContent>
                  </Card>
                  <Card className="card-hover-pollish">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium">Recovered This Month</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">{formatINR(analytics.summary.totalRecoveredThisMonth)}</p>
                      <p className="text-xs text-muted-foreground">{analytics.summary.overallRecoveryRate}% recovery rate</p>
                    </CardContent>
                  </Card>
                  <Card className="card-hover-pollish">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium">Total Outstanding</p>
                      <p className="text-2xl font-bold text-red-600 mt-1">{formatINR(analytics.summary.totalOutstanding)}</p>
                      <p className="text-xs text-muted-foreground">{analytics.summary.totalOverdueInvoices} overdue invoices</p>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Recovery Rate Trend ── */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      Recovery Rate Trend (Last 6 Months)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RecoveryRateChart data={analytics.monthlyRecovery} />
                  </CardContent>
                </Card>

                {/* ── Channel Effectiveness ── */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-teal-500" />
                      Channel Effectiveness
                    </CardTitle>
                    <CardDescription>Avg days to collect by payment channel</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analytics.channelEffectiveness.length > 0 ? (
                      <ChannelComparison channels={analytics.channelEffectiveness} />
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">No channel data available</p>
                    )}
                  </CardContent>
                </Card>

                {/* ── Area Performance ── */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-amber-500" />
                      Area-wise Collection Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="max-h-96">
                      <Table>
                        <TableHeader>
                          <TableRow className="table-polish">
                            <TableHead>Area</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead className="text-right">Recovered</TableHead>
                            <TableHead className="text-right">Recovery Rate</TableHead>
                            <TableHead className="text-right">Avg Days</TableHead>
                            <TableHead className="text-right">Subscribers</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analytics.areaPerformance.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                No area data available
                              </TableCell>
                            </TableRow>
                          ) : (
                            analytics.areaPerformance.map((area, idx) => (
                              <TableRow key={idx} className="table-polish">
                                <TableCell className="font-medium">{area.areaName}</TableCell>
                                <TableCell className="text-right text-red-600 font-medium">
                                  {formatINR(area.totalOutstanding)}
                                </TableCell>
                                <TableCell className="text-right text-emerald-600">
                                  {formatINR(area.recoveredAmount)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge
                                    variant="outline"
                                    className={
                                      area.recoveryRate >= 70
                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                        : area.recoveryRate >= 40
                                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                                        : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                                    }
                                  >
                                    {area.recoveryRate.toFixed(1)}%
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">{area.avgDaysToCollect}d</TableCell>
                                <TableCell className="text-right">{area.subscriberCount}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* ── Top Debtors ── */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      Top Debtors
                    </CardTitle>
                    <CardDescription>Subscribers with highest outstanding amounts</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="max-h-96">
                      <Table>
                        <TableHeader>
                          <TableRow className="table-polish">
                            <TableHead>#</TableHead>
                            <TableHead>Subscriber</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Plan</TableHead>
                            <TableHead>Area</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead className="text-right">Days Overdue</TableHead>
                            <TableHead className="text-right">Invoices</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analytics.topDebtors.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                No debtors found
                              </TableCell>
                            </TableRow>
                          ) : (
                            analytics.topDebtors.map((debtor, idx) => (
                              <TableRow key={debtor.subscriberId} className="table-polish">
                                <TableCell className="font-bold text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell className="font-medium">{debtor.subscriberName}</TableCell>
                                <TableCell className="text-muted-foreground">{debtor.phone}</TableCell>
                                <TableCell>{debtor.planName}</TableCell>
                                <TableCell>{debtor.areaName}</TableCell>
                                <TableCell className="text-right font-semibold text-red-600">
                                  {formatINR(debtor.totalOutstanding)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge
                                    variant="outline"
                                    className={
                                      debtor.daysOverdue <= 14
                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                        : debtor.daysOverdue <= 30
                                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                                        : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                                    }
                                  >
                                    {debtor.daysOverdue}d
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">{debtor.invoiceCount}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <BarChart3 className="w-12 h-12 text-muted-foreground" />
                <p className="text-muted-foreground">Loading analytics...</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ════════════════════════════════════════════════════════ */}
        {/* REMINDER SCHEDULING DIALOG                                */}
        {/* ════════════════════════════════════════════════════════ */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-red-500" />
                Schedule Reminders
              </DialogTitle>
              <DialogDescription>
                Send payment reminders to {selectedIds.size} selected subscriber{selectedIds.size !== 1 ? "s" : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={dialogChannel} onValueChange={(val) => {
                  setDialogChannel(val);
                  // Update message template when channel changes
                  const firstSub = smartData?.subscribers.find((s) => s.subscriberId === Array.from(selectedIds)[0]);
                  if (firstSub) {
                    setDialogMessage(getMessageTemplate(val, "{name}", firstSub.totalOutstanding));
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WHATSAPP">
                      <span className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-emerald-500" /> WhatsApp
                      </span>
                    </SelectItem>
                    <SelectItem value="SMS">
                      <span className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-amber-500" /> SMS
                      </span>
                    </SelectItem>
                    <SelectItem value="EMAIL">
                      <span className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-teal-500" /> Email
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Message Template</Label>
                <Textarea
                  rows={6}
                  value={dialogMessage}
                  onChange={(e) => setDialogMessage(e.target.value)}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{name}"} as a placeholder for subscriber name
                </p>
              </div>

              <div className="space-y-2">
                <Label>Schedule Time</Label>
                <Input
                  type="datetime-local"
                  value={dialogScheduledAt}
                  onChange={(e) => setDialogScheduledAt(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {selectedIds.size} reminder{selectedIds.size !== 1 ? "s" : ""} will be scheduled via {dialogChannel}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendReminders}
                disabled={sending || !dialogMessage.trim() || !dialogScheduledAt}
              >
                {sending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Scheduling...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1" /> Schedule Reminders
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
