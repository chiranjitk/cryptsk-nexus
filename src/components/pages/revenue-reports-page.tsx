"use client";

import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, IndianRupee, Users, Target,
  CalendarDays, BarChart3, PieChart as PieChartIcon,
  RefreshCw, Download, ArrowRight, ArrowLeftRight,
  FileText, AlertTriangle, Printer, ChevronUp,
  Plus, Wallet, Settings, Sheet, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/utils";
import { escapeHtml } from "@/lib/utils/html-escape";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const COLORS = ["#DC2626", "#16A34A", "#D97706", "#0D9488", "#F59E0B", "#EC4899", "#14B8A6", "#F97316"];

const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", ONLINE: "Online",
  BANK_TRANSFER: "Bank Transfer", CHEQUE: "Cheque", WALLET: "Wallet",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", SENT: "Sent", PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid", OVERDUE: "Overdue",
  CANCELLED: "Cancelled", CREDIT_NOTE: "Credit Note",
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  salary: "Salary", equipment: "Equipment", bandwidth: "Bandwidth",
  marketing: "Marketing", maintenance: "Maintenance", other: "Other",
};

const EXPENSE_CATEGORIES = ["salary", "equipment", "bandwidth", "marketing", "maintenance", "other"];

const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  salary: "#DC2626", equipment: "#0D9488", bandwidth: "#F59E0B",
  marketing: "#EC4899", maintenance: "#D97706", other: "#64748B",
};

const KPI_METRIC_OPTIONS = [
  { value: "Monthly Revenue", label: "Monthly Revenue" },
  { value: "Collection Efficiency", label: "Collection Efficiency (%)" },
  { value: "ARPU", label: "ARPU (₹)" },
  { value: "Active Subscribers", label: "Active Subscribers" },
  { value: "Total Invoices", label: "Total Invoices" },
  { value: "Paid Invoices", label: "Paid Invoices" },
];

interface RevenueData {
  summary: {
    totalRevenue: number; totalSubtotal: number; totalTax: number;
    prevRevenue: number; revenueChange: number; arpu: number;
    collectionEfficiency: number; activeSubscribers: number;
    totalInvoices: number; paidCount: number; overdueCount: number;
  };
  monthlyTrend: { month: string; revenue: number }[];
  areaWiseRevenue: { area: string; revenue: number }[];
  planWiseRevenue: { plan: string; revenue: number; count: number }[];
  paymentModes: { mode: string; amount: number }[];
  statusBreakdown: { status: string; count: number; amount: number }[];
  topAreas: { area: string; revenue: number }[];
  dailyRevenue?: { date: string; revenue: number; count: number }[];
  agentWiseRevenue?: { agent: string; revenue: number; count: number }[];
  subscriberGrowth?: { month: string; newSubs: number; churned: number; net: number }[];
  invoiceAging?: { bucket: string; amount: number; count: number }[];
  kpiTargets?: { metric: string; target: number; actual: number; percent: number }[];
  churnImpact?: { month: string; churnedCount: number; lostRevenue: number }[];
  revenueForecast?: { month: string; revenue: number; projected: boolean }[];
}

interface ExpenseItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  reference: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExpensesData {
  expenses: ExpenseItem[];
  summary: {
    total: number;
    count: number;
    byCategory: Record<string, number>;
  };
}

interface TdsData {
  invoices: {
    id: string; invoiceNumber: string; subscriberName: string; subscriberCode: string;
    panNumber: string; gstin: string; invoiceAmount: number; tdsRate: number;
    tdsAmount: number; cgst: number; sgst: number; igst: number;
    paidAmount: number; balanceAmount: number; issueDate: string;
    paidAt: string | null; status: string;
  }[];
  summary: {
    totalTDS: number; totalInvoiceAmount: number; totalTax: number;
    totalCGST: number; totalSGST: number; totalIGST: number; invoiceCount: number;
  };
  rateBreakdown: { rate: number; count: number; tdsAmount: number; invoiceAmount: number }[];
  monthlyTDS: { month: string; tdsAmount: number; invoiceCount: number }[];
}

interface KpiTargetItem {
  metric: string;
  target: number;
  period: string;
}

function CustomTooltip({ active, payload, label, isCurrency = false }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string; isCurrency?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border/60 rounded-lg shadow-xl px-3.5 py-2.5 text-xs backdrop-blur-sm">
      <p className="font-semibold text-foreground mb-1.5 text-[11px] tracking-wide uppercase">{label}</p>
      <div className="space-y-1">
        {payload.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full mr-2 shadow-sm" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-semibold text-foreground tabular-nums">
              {isCurrency ? formatINR(item.value) : item.value.toLocaleString("en-IN")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getDateRange(preset: string) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (preset) {
    case "this_week": {
      const day = now.getDay() || 7;
      const start = new Date(y, m, now.getDate() - day + 1);
      return { start, end: now };
    }
    case "this_month": return { start: new Date(y, m, 1), end: now };
    case "this_quarter": { const qm = Math.floor(m / 3) * 3; return { start: new Date(y, qm, 1), end: now }; }
    case "this_year": return { start: new Date(y, 0, 1), end: now };
    case "last_month": return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59) };
    case "last_quarter": { const qm = Math.floor(m / 3) * 3 - 3; return { start: new Date(y, qm, 1), end: new Date(y, qm + 3, 0, 23, 59, 59) }; }
    default: return { start: new Date(y, m, 1), end: now };
  }
}

function toISO(d: Date) { return d.toISOString().split("T")[0]; }

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
}

function handlePrintReport(data: RevenueData, startDate: string, endDate: string) {
  const printWin = window.open("", "_blank");
  if (!printWin) { toast.error("Please allow popups"); return; }

  const totalAging = (data.invoiceAging || []).reduce((s, b) => s + b.amount, 0);
  const totalChurned = (data.churnImpact || []).reduce((s, c) => s + c.churnedCount, 0);
  const totalLostRevenue = (data.churnImpact || []).reduce((s, c) => s + c.lostRevenue, 0);
  const forecastTotal = (data.revenueForecast || []).reduce((s, f) => s + f.revenue, 0);

  printWin.document.write(`<!DOCTYPE html><html><head><title>Revenue Report</title>
<style>
  * { box-sizing: border-box; }
  body{font-family:'Segoe UI',system-ui,sans-serif;margin:24px;color:#1f2937;max-width:1100px;margin:0 auto;padding:24px}
  h1{font-size:20px;margin:0 0 4px} .isp{color:#666;font-size:12px} .period{color:#888;font-size:11px;margin:4px 0 16px;border-bottom:2px solid #e5e7eb;padding-bottom:12px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px} th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left} th{background:#f9fafb;font-weight:600}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .metric{display:inline-block;margin:4px 6px;padding:10px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;vertical-align:top;min-width:140px}
  .metric-val{font-size:20px;font-weight:700} .metric-label{font-size:10px;color:#666}
  .positive{color:#16a34a} .negative{color:#dc2626}
  .section-title{font-size:14px;font-weight:700;margin:20px 0 8px;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  .page-break{page-break-before:always}
  @media print{.no-print{display:none!important}body{padding:12px}}
</style></head><body>
<div class="no-print" style="margin-bottom:16px;text-align:center"><button onclick="window.print()" style="padding:10px 28px;background:#DC2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600">Print Report</button></div>

<h1>Revenue Report</h1>
<p class="isp">Cryptsk ISP Management Platform</p>
<p class="period">Report Period: ${escapeHtml(startDate)} to ${escapeHtml(endDate)} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString("en-IN")}</p>

<div style="margin-bottom:20px">
  <span class="metric"><span class="metric-val positive">${formatINR(data.summary.totalRevenue)}</span><span class="metric-label">Total Revenue</span></span>
  <span class="metric"><span class="metric-val">${data.summary.collectionEfficiency}%</span><span class="metric-label">Collection Efficiency</span></span>
  <span class="metric"><span class="metric-val">${formatINR(data.summary.arpu)}</span><span class="metric-label">ARPU</span></span>
  <span class="metric"><span class="metric-val">${data.summary.activeSubscribers}</span><span class="metric-label">Active Subs</span></span>
  <span class="metric"><span class="metric-val ${data.summary.revenueChange >= 0 ? "positive" : "negative"}">${data.summary.revenueChange >= 0 ? "+" : ""}${data.summary.revenueChange}%</span><span class="metric-label">vs Prev Period</span></span>
  <span class="metric"><span class="metric-val">${formatINR(data.summary.totalTax)}</span><span class="metric-label">Tax Collected</span></span>
</div>

<div class="section-title">Monthly Revenue Trend</div>
<table><tr><th>Month</th><th class="num">Revenue</th></tr>${data.monthlyTrend.map((r) => `<tr><td>${escapeHtml(r.month)}</td><td class="num">${formatINR(r.revenue)}</td></tr>`).join("")}</table>

${data.kpiTargets?.length ? `<div class="section-title">KPI Target Tracking</div>
<table><tr><th>Metric</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Achievement</th></tr>${data.kpiTargets.map((k) => `<tr><td>${escapeHtml(k.metric)}</td><td class="num">${typeof k.target === "number" && k.target > 999 ? formatINR(k.target) : k.target}${k.metric.includes("Efficiency") ? "%" : ""}</td><td class="num">${typeof k.actual === "number" && k.actual > 999 ? formatINR(k.actual) : k.actual}${k.metric.includes("Efficiency") ? "%" : ""}</td><td class="num ${k.percent >= 100 ? "positive" : "negative"}">${k.percent}%</td></tr>`).join("")}</table>` : ""}

${(data.invoiceAging || []).length ? `<div class="section-title">Invoice Aging Report</div>
<table><tr><th>Bucket</th><th class="num">Outstanding</th><th>Count</th></tr>${(data.invoiceAging || []).map((b) => `<tr><td>${escapeHtml(b.bucket)}</td><td class="num">${formatINR(b.amount)}</td><td>${b.count}</td></tr>`).join("")}
<tr style="font-weight:700;background:#f0f0f0"><td>Total Outstanding</td><td class="num">${formatINR(totalAging)}</td><td>${(data.invoiceAging || []).reduce((s, b) => s + b.count, 0)}</td></tr></table>` : ""}

${data.subscriberGrowth?.length ? `<div class="section-title">Subscriber Growth</div>
<table><tr><th>Month</th><th class="num">New</th><th class="num">Churned</th><th class="num">Net Growth</th></tr>${data.subscriberGrowth.map((g) => `<tr><td>${escapeHtml(g.month)}</td><td class="num">${g.newSubs}</td><td class="num">${g.churned}</td><td class="num ${g.net >= 0 ? "positive" : "negative"}">${g.net >= 0 ? "+" : ""}${g.net}</td></tr>`).join("")}</table>` : ""}

${(data.churnImpact || []).some((c) => c.churnedCount > 0) ? `<div class="section-title">Churn Impact on Revenue</div>
<table><tr><th>Month</th><th class="num">Churned</th><th class="num">Lost Revenue</th></tr>${(data.churnImpact || []).filter((c) => c.churnedCount > 0).map((c) => `<tr><td>${escapeHtml(c.month)}</td><td class="num">${c.churnedCount}</td><td class="num negative">${formatINR(c.lostRevenue)}</td></tr>`).join("")}
<tr style="font-weight:700;background:#f0f0f0"><td>Total</td><td class="num">${totalChurned}</td><td class="num negative">${formatINR(totalLostRevenue)}</td></tr></table>` : ""}

${(data.revenueForecast || []).length ? `<div class="section-title">Revenue Forecast</div>
<table><tr><th>Period</th><th class="num">Projected Revenue</th></tr>${(data.revenueForecast || []).map((f) => `<tr><td>${escapeHtml(f.month)} (Projected)</td><td class="num">${formatINR(f.revenue)}</td></tr>`).join("")}
<tr style="font-weight:700;background:#f0f0f0"><td>3-Month Forecast Total</td><td class="num">${formatINR(forecastTotal)}</td></tr></table>` : ""}

<div class="section-title">Payment Mode Distribution</div>
<table><tr><th>Mode</th><th class="num">Amount</th></tr>${(data.paymentModes || []).map((p) => `<tr><td>${escapeHtml(PAYMENT_MODE_LABELS[p.mode] || p.mode)}</td><td class="num">${formatINR(p.amount)}</td></tr>`).join("")}</table>

<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#999;text-align:center">
  Cryptsk ISP Management Platform &nbsp;|&nbsp; Generated on ${new Date().toLocaleString("en-IN")} &nbsp;|&nbsp; Confidential
</div>
</body></html>`);
  printWin.document.close();
}

export default function RevenueReportsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [datePreset, setDatePreset] = useState("this_month");
  const [startDate, setStartDate] = useState(toISO(getDateRange("this_month").start));
  const [endDate, setEndDate] = useState(toISO(getDateRange("this_month").end));
  const [comparePreset, setComparePreset] = useState("");
  const [compareStart, setCompareStart] = useState("");
  const [compareEnd, setCompareEnd] = useState("");
  const [key, setKey] = useState(0);

  // Expense state
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expDesc, setExpDesc] = useState("");
  const [expCategory, setExpCategory] = useState("other");
  const [expAmount, setExpAmount] = useState("");
  const [expDate, setExpDate] = useState(toISO(new Date()));
  const [expenseKey, setExpenseKey] = useState(0);
  const queryClient = useQueryClient();

  // KPI dialog state
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);
  const [kpiEdits, setKpiEdits] = useState<{ metric: string; target: number; period: string }[]>([]);

  const handlePreset = (preset: string) => {
    setDatePreset(preset);
    const { start, end } = getDateRange(preset);
    setStartDate(toISO(start));
    setEndDate(toISO(end));
  };

  const { data, isLoading, refetch, isFetching } = useQuery<RevenueData>({
    queryKey: ["revenue-report", startDate, endDate, key],
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("detailed", "true");
      return fetch(`/api/reports/revenue?${params}`).then((r) => r.json());
    },
  });

  const { data: compareData } = useQuery<RevenueData>({
    queryKey: ["revenue-compare", compareStart, compareEnd],
    queryFn: () => {
      const params = new URLSearchParams();
      if (compareStart) params.set("startDate", compareStart);
      if (compareEnd) params.set("endDate", compareEnd);
      return fetch(`/api/reports/revenue?${params}`).then((r) => r.json());
    },
    enabled: !!compareStart && !!compareEnd,
  });

  // TDS/TCS data
  const { data: tdsData, isLoading: tdsLoading } = useQuery<TdsData>({
    queryKey: ["tds-report", startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("startDate", startDate);
      params.set("endDate", endDate);
      return fetch(`/api/reports/tds-tcs?${params}`).then((r) => r.json());
    },
  });

  // KPI targets from settings
  const { data: kpiSavedTargets } = useQuery<KpiTargetItem[]>({
    queryKey: ["kpi-targets"],
    queryFn: () => fetch("/api/reports/kpi-targets").then((r) => r.json()).then((d) => d.targets || []),
  });

  // This month expense data
  const now = new Date();
  const monthStart = toISO(new Date(now.getFullYear(), now.getMonth(), 1));

  const { data: expensesData, isLoading: expensesLoading } = useQuery<ExpensesData>({
    queryKey: ["expenses", monthStart, expenseKey],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("startDate", monthStart);
      return fetch(`/api/expenses?${params}`).then((r) => r.json());
    },
  });

  // All-time expenses for trend chart
  const { data: allExpensesData } = useQuery<ExpensesData>({
    queryKey: ["expenses-all", expenseKey],
    queryFn: () => fetch("/api/expenses").then((r) => r.json()),
  });

  // Add expense mutation
  const addExpenseMutation = useMutation({
    mutationFn: async (body: { description: string; category: string; amount: number; date: string }) => {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to add expense"); }
      return res.json();
    },
    onSuccess: () => {
      setExpenseKey((k) => k + 1);
      setExpenseDialogOpen(false);
      setExpDesc(""); setExpCategory("other"); setExpAmount(""); setExpDate(toISO(new Date()));
      toast.success("Expense added successfully");
    },
    onError: (err: Error) => { toast.error(err.message || "Failed to add expense"); },
  });

  // Save KPI targets mutation
  const saveKpiMutation = useMutation({
    mutationFn: async (targets: KpiTargetItem[]) => {
      const res = await fetch("/api/reports/kpi-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to save targets"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kpi-targets"] });
      queryClient.invalidateQueries({ queryKey: ["revenue-report"] });
      setKpiDialogOpen(false);
      toast.success("KPI targets saved successfully");
    },
    onError: (err: Error) => { toast.error(err.message || "Failed to save targets"); },
  });

  const handleAddExpense = () => {
    if (!expDesc.trim() || !expAmount || !expDate) { toast.error("Please fill in all required fields"); return; }
    addExpenseMutation.mutate({ description: expDesc.trim(), category: expCategory, amount: parseFloat(expAmount), date: expDate });
  };

  const openKpiDialog = () => {
    if (kpiSavedTargets && kpiSavedTargets.length > 0) {
      setKpiEdits(kpiSavedTargets.map((t) => ({ ...t })));
    } else if (data?.kpiTargets) {
      setKpiEdits(data.kpiTargets.map((t) => ({ metric: t.metric, target: t.target, period: "monthly" })));
    } else {
      setKpiEdits([
        { metric: "Monthly Revenue", target: 0, period: "monthly" },
        { metric: "Collection Efficiency", target: 90, period: "monthly" },
        { metric: "ARPU", target: 0, period: "monthly" },
        { metric: "Active Subscribers", target: 0, period: "monthly" },
      ]);
    }
    setKpiDialogOpen(true);
  };

  const handleSaveKpiTargets = () => {
    const valid = kpiEdits.filter((t) => t.target > 0);
    if (valid.length === 0) { toast.error("Please set at least one target value"); return; }
    saveKpiMutation.mutate(valid);
  };

  const handleExportCSV = () => {
    if (!data) return;
    const rows: any[][] = [["Report", "Revenue Reports"], ["Period", `${startDate} to ${endDate}`], [""],
      ["Metric", "Value"],
      ["Total Revenue", data.summary.totalRevenue],
      ["ARPU", data.summary.arpu],
      ["Collection Efficiency", `${data.summary.collectionEfficiency}%`],
      ["Paid Invoices", data.summary.paidCount],
      ["Overdue Invoices", data.summary.overdueCount],
    ];
    if (data.planWiseRevenue) rows.push([""], ["Plan", "Revenue", "Count"], ...data.planWiseRevenue.map((p) => [p.plan, p.revenue, p.count]));
    if (data.areaWiseRevenue) rows.push([""], ["Area", "Revenue"], ...data.areaWiseRevenue.map((a) => [a.area, a.revenue]));
    if (data.invoiceAging) rows.push([""], ["Aging Bucket", "Amount", "Count"], ...data.invoiceAging.map((a) => [a.bucket, a.amount, a.count]));
    if (data.subscriberGrowth) rows.push([""], ["Month", "New", "Churned", "Net"], ...data.subscriberGrowth.map((g) => [g.month, g.newSubs, g.churned, g.net]));
    if (data.churnImpact) rows.push([""], ["Month", "Churned", "Lost Revenue"], ...data.churnImpact.map((c) => [c.month, c.churnedCount, c.lostRevenue]));
    if (data.revenueForecast) rows.push([""], ["Forecast Month", "Projected Revenue"], ...data.revenueForecast.map((f) => [f.month, f.revenue]));
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `revenue_report_${startDate}_${endDate}.csv`;
    a.click();
    toast.success("Revenue report exported as CSV");
  };

  // Excel export
  const handleExportExcel = useCallback(async () => {
    if (!data) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summaryData = [
        ["Revenue Report — Cryptsk ISP"],
        [`Period: ${startDate} to ${endDate}`],
        [""],
        ["Metric", "Value"],
        ["Total Revenue", data.summary.totalRevenue],
        ["Total Subtotal", data.summary.totalSubtotal],
        ["Tax Collected", data.summary.totalTax],
        ["ARPU", data.summary.arpu],
        ["Collection Efficiency", `${data.summary.collectionEfficiency}%`],
        ["Active Subscribers", data.summary.activeSubscribers],
        ["Total Invoices", data.summary.totalInvoices],
        ["Paid Invoices", data.summary.paidCount],
        ["Overdue Invoices", data.summary.overdueCount],
        ["Revenue Change vs Prev", `${data.summary.revenueChange}%`],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
      ws1["!cols"] = [{ wch: 30 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Summary");

      // Sheet 2: Monthly Trend
      const trendData = [["Month", "Revenue"], ...data.monthlyTrend.map((r) => [r.month, r.revenue])];
      const ws2 = XLSX.utils.aoa_to_sheet(trendData);
      ws2["!cols"] = [{ wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Monthly Trend");

      // Sheet 3: Plan-wise Revenue
      if (data.planWiseRevenue.length > 0) {
        const planData = [["Plan", "Revenue", "Invoices"], ...data.planWiseRevenue.map((p) => [p.plan, p.revenue, p.count])];
        const ws3 = XLSX.utils.aoa_to_sheet(planData);
        ws3["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws3, "Plan Revenue");
      }

      // Sheet 4: Area-wise Revenue
      if (data.areaWiseRevenue.length > 0) {
        const areaData = [["Area", "Revenue"], ...data.areaWiseRevenue.map((a) => [a.area, a.revenue])];
        const ws4 = XLSX.utils.aoa_to_sheet(areaData);
        ws4["!cols"] = [{ wch: 24 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws4, "Area Revenue");
      }

      // Sheet 5: Invoice Aging
      if (data.invoiceAging && data.invoiceAging.length > 0) {
        const agingData = [["Bucket", "Outstanding Amount", "Count"], ...data.invoiceAging.map((a) => [a.bucket, a.amount, a.count])];
        const ws5 = XLSX.utils.aoa_to_sheet(agingData);
        ws5["!cols"] = [{ wch: 16 }, { wch: 20 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, ws5, "Invoice Aging");
      }

      // Sheet 6: Subscriber Growth
      if (data.subscriberGrowth && data.subscriberGrowth.length > 0) {
        const growthData = [["Month", "New", "Churned", "Net"], ...data.subscriberGrowth.map((g) => [g.month, g.newSubs, g.churned, g.net])];
        const ws6 = XLSX.utils.aoa_to_sheet(growthData);
        ws6["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, ws6, "Subscriber Growth");
      }

      // Sheet 7: Churn Impact
      if (data.churnImpact && data.churnImpact.length > 0) {
        const churnData = [["Month", "Churned Count", "Lost Revenue"], ...data.churnImpact.map((c) => [c.month, c.churnedCount, c.lostRevenue])];
        const ws7 = XLSX.utils.aoa_to_sheet(churnData);
        ws7["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws7, "Churn Impact");
      }

      // Sheet 8: Revenue Forecast
      if (data.revenueForecast && data.revenueForecast.length > 0) {
        const forecastData = [["Month", "Projected Revenue"], ...data.revenueForecast.map((f) => [f.month, f.revenue])];
        const ws8 = XLSX.utils.aoa_to_sheet(forecastData);
        ws8["!cols"] = [{ wch: 16 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws8, "Forecast");
      }

      // Sheet 9: KPI Targets
      if (data.kpiTargets && data.kpiTargets.length > 0) {
        const kpiData = [["Metric", "Target", "Actual", "Achievement %"], ...data.kpiTargets.map((k) => [k.metric, k.target, k.actual, `${k.percent}%`])];
        const ws9 = XLSX.utils.aoa_to_sheet(kpiData);
        ws9["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws9, "KPI Targets");
      }

      // Sheet 10: TDS Summary
      if (tdsData) {
        const tdsSummaryData = [
          ["TDS/TCS Report"],
          [""],
          ["Total TDS Deducted", tdsData.summary.totalTDS],
          ["Total Invoice Amount", tdsData.summary.totalInvoiceAmount],
          ["Total Tax (CGST+SGST+IGST)", tdsData.summary.totalTax],
          ["CGST", tdsData.summary.totalCGST],
          ["SGST", tdsData.summary.totalSGST],
          ["IGST", tdsData.summary.totalIGST],
          ["Invoice Count", tdsData.summary.invoiceCount],
          [""],
          ["Invoice #", "Subscriber", "Amount", "TDS Rate", "TDS Amount", "Status"],
          ...tdsData.invoices.map((i) => [i.invoiceNumber, i.subscriberName, i.invoiceAmount, `${i.tdsRate}%`, i.tdsAmount, i.status]),
        ];
        const ws10 = XLSX.utils.aoa_to_sheet(tdsSummaryData);
        ws10["!cols"] = [{ wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws10, "TDS/TCS Report");
      }

      XLSX.writeFile(wb, `Revenue_Report_${startDate}_${endDate}.xlsx`);
      toast.success("Excel report exported successfully with multiple sheets");
    } catch {
      toast.error("Failed to export Excel. xlsx library not loaded.");
    }
  }, [data, startDate, endDate, tdsData]);

  const handleExportExpensesCSV = () => {
    if (!expensesData?.expenses) return;
    const rows = [
      ["Date", "Description", "Category", "Amount"],
      ...expensesData.expenses.map((e) => [
        e.date ? new Date(e.date).toISOString().split("T")[0] : "",
        e.description,
        EXPENSE_CATEGORY_LABELS[e.category] || e.category,
        e.amount,
      ]),
      [""],
      ["Total", "", "", expensesData.summary.total],
      ["Count", "", "", expensesData.summary.count],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expenses_${monthStart}_${toISO(now)}.csv`;
    a.click();
    toast.success("Expenses exported as CSV");
  };

  const pieChartData = data?.paymentModes
    ? data.paymentModes.map((p) => ({ name: PAYMENT_MODE_LABELS[p.mode] || p.mode, value: p.amount }))
    : [];

  const statusPieData = data?.statusBreakdown
    ? data.statusBreakdown.filter((s) => s.count > 0).map((s) => ({ name: STATUS_LABELS[s.status] || s.status, value: s.count }))
    : [];

  const combinedTrend = [...(data?.monthlyTrend || []), ...(data?.revenueForecast || [])];

  // Compute monthly expense trend (12 months)
  const monthlyExpenseTrend: { month: string; expenses: number }[] = (() => {
    if (!allExpensesData?.expenses) return [];
    const grouped: Record<string, number> = {};
    for (const exp of allExpensesData.expenses) {
      const mk = getMonthKey(exp.date);
      grouped[mk] = (grouped[mk] || 0) + exp.amount;
    }
    const keys = Object.keys(grouped).sort();
    return keys.slice(-12).map((mk) => ({
      month: getMonthLabel(mk),
      expenses: Math.round(grouped[mk]),
    }));
  })();

  const totalMonthExpenses = expensesData?.summary.total ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="skeleton-wave h-7 w-48 mb-2" /><Skeleton className="skeleton-wave h-4 w-64" /></div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (<Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-20 mb-2" /><Skeleton className="skeleton-wave h-7 w-28 mb-1" /><Skeleton className="skeleton-wave h-3 w-16" /></CardContent></Card>))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (<div className="flex flex-col items-center justify-center h-96 gap-2"><AlertTriangle className="h-10 w-10 text-muted-foreground/40" /><p className="text-sm text-muted-foreground">Failed to load revenue report data.</p></div>);
  }

  const { summary } = data;
  const netProfit = summary.totalRevenue - totalMonthExpenses;

  return (
    <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-3 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revenue Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Financial performance and revenue analytics</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            {["this_week", "this_month", "this_quarter", "this_year", "last_month", "last_quarter"].map((p) => (
              <Button key={p} variant={datePreset === p ? "default" : "outline"} size="sm" className="text-[11px] h-7" onClick={() => handlePreset(p)}>
                {p.replace("this_", "This ").replace("last_", "Last ").replace("_", " ")}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setDatePreset(""); }} className="w-32 h-8 text-xs" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setDatePreset(""); }} className="w-32 h-8 text-xs" />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {/* Export dropdown */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={handleExportExcel}><Sheet className="h-3.5 w-3.5 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => handlePrintReport(data, startDate, endDate)}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="comparison">Compare</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="growth">Growth</TabsTrigger>
          <TabsTrigger value="churn">Churn</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="kpi">KPI Targets</TabsTrigger>
          <TabsTrigger value="tds">TDS/TCS</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-red-100 text-red-600"><IndianRupee className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total Revenue</p></div><p className="text-xl font-bold tabular-nums">{formatINR(summary.totalRevenue)}</p><div className="flex items-center gap-1 mt-1">{summary.revenueChange >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-600" />}<span className={`text-xs font-bold ${summary.revenueChange >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{summary.revenueChange >= 0 ? "↑ +" : "↓ "}{summary.revenueChange}%</span><span className="text-[10px] text-muted-foreground">vs prev</span></div></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><BarChart3 className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Tax Collected</p></div><p className="text-xl font-bold tabular-nums">{formatINR(summary.totalTax)}</p><p className="text-[10px] text-muted-foreground mt-1">Net: {formatINR(summary.totalSubtotal)}</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><Users className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">ARPU</p></div><p className="text-xl font-bold tabular-nums">{formatINR(summary.arpu)}</p><p className="text-[10px] text-muted-foreground mt-1">{summary.activeSubscribers} active subs</p></CardContent></Card>
            <Card className={`border shadow-sm hover:shadow-md transition-shadow duration-200 ${netProfit >= 0 ? "bg-emerald-50/60" : "bg-rose-50/60"}`}><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className={`p-1.5 rounded-md ${netProfit >= 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}><Wallet className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Net Profit (This Month)</p></div><p className={`text-xl font-bold tabular-nums ${netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{netProfit >= 0 ? "↑ " : "↓ "}{formatINR(netProfit)}</p><p className="text-[10px] text-muted-foreground mt-1">Revenue {formatINR(summary.totalRevenue)} − Expenses {formatINR(totalMonthExpenses)}</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4">
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><Target className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Collection Efficiency</p></div><p className="text-xl font-bold tabular-nums">{summary.collectionEfficiency}%</p><Progress value={summary.collectionEfficiency} className="h-2 mt-2" /></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><TrendingUp className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Paid Invoices</p></div><p className="text-xl font-bold tabular-nums">{summary.paidCount}</p><p className="text-[10px] text-muted-foreground mt-1">of {summary.totalInvoices} total</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-rose-100 text-rose-600"><TrendingDown className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Overdue</p></div><p className="text-xl font-bold tabular-nums text-rose-600">{summary.overdueCount}</p><p className="text-[10px] text-muted-foreground mt-1">invoices with balance</p></CardContent></Card>
          </div>

          {data.kpiTargets && data.kpiTargets.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-amber-600" />KPI Target Tracking</CardTitle>
                  <Button variant="ghost" size="sm" onClick={openKpiDialog}><Settings className="h-3.5 w-3.5" /></Button>
                </div>
              </CardHeader>
              <CardContent><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{data.kpiTargets.map((kpi, i) => (
                <div key={i} className="space-y-1.5"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{kpi.metric}</p><span className={`text-[10px] font-bold ${kpi.percent >= 100 ? "text-emerald-600" : kpi.percent >= 75 ? "text-amber-600" : "text-rose-600"}`}>{kpi.percent >= 100 ? "↑" : "↓"} {kpi.percent}%</span></div><p className="text-sm font-bold">{typeof kpi.target === "number" && kpi.target > 999 ? formatINR(kpi.actual) : kpi.actual}</p><Progress value={Math.min(100, kpi.percent)} className="h-2" /><p className="text-[10px] text-muted-foreground">{kpi.percent}% of {typeof kpi.target === "number" && kpi.target > 999 ? formatINR(kpi.target) : kpi.target}</p></div>
              ))}</div></CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" />Monthly Revenue Trend</CardTitle></CardHeader>
              <CardContent className="pt-0"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={combinedTrend}><defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#DC2626" stopOpacity={0.3} /><stop offset="95%" stopColor="#DC2626" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><Tooltip content={<CustomTooltip isCurrency />} /><Area type="monotone" dataKey="revenue" name="Revenue" stroke="#DC2626" strokeWidth={2.5} fill="url(#revGrad)" dot={{ r: 3, fill: "#DC2626" }} /></AreaChart></ResponsiveContainer></div></CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><PieChartIcon className="h-4 w-4 text-teal-600" />Payment Mode Distribution</CardTitle></CardHeader>
              <CardContent className="pt-0"><div className="h-72">{pieChartData.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value" nameKey="name" strokeWidth={2} stroke="#fff">{pieChartData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value: number, name: string) => [formatINR(value), name]} /><Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: "11px" }} /></PieChart></ResponsiveContainer>) : (<div className="flex flex-col items-center justify-center h-full gap-2"><PieChartIcon className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No payment data</p></div>)}</div></CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-teal-600" />Area-wise Revenue</CardTitle></CardHeader>
              <CardContent className="pt-0">{data.areaWiseRevenue.length > 0 ? (<div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.areaWiseRevenue} layout="vertical" margin={{ left: 10 }}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} /><XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><YAxis dataKey="area" type="category" tick={{ fill: "#64748B", fontSize: 11 }} width={80} /><Tooltip content={<CustomTooltip isCurrency />} /><Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} barSize={18}>{data.areaWiseRevenue.map((_, index) => <Cell key={`bar-${index}`} fill={COLORS[index % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>) : (<div className="flex flex-col items-center justify-center h-48 gap-2"><BarChart3 className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No area data</p></div>)}</CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-amber-600" />Plan-wise Revenue</CardTitle></CardHeader>
              <CardContent className="pt-0">{data.planWiseRevenue.length > 0 ? (<div className="max-h-72 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs">Plan</TableHead><TableHead className="text-xs text-center">Invoices</TableHead><TableHead className="text-xs text-right">Revenue</TableHead><TableHead className="text-xs text-right">Share</TableHead></TableRow></TableHeader><TableBody>{data.planWiseRevenue.map((p, i) => { const totalRev = data.planWiseRevenue.reduce((s, x) => s + x.revenue, 0); const share = totalRev > 0 ? ((p.revenue / totalRev) * 100).toFixed(1) : "0"; return (<TableRow key={i}><TableCell className="text-xs font-medium">{p.plan}</TableCell><TableCell className="text-xs text-center tabular-nums">{p.count}</TableCell><TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(p.revenue)}</TableCell><TableCell className="text-xs text-right"><div className="flex items-center justify-end gap-1.5"><div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-red-500" style={{ width: `${share}%` }} /></div><span className="tabular-nums w-10 text-right">{share}%</span></div></TableCell></TableRow>); })}</TableBody></Table></div>) : (<div className="flex flex-col items-center justify-center h-48 gap-2"><TrendingUp className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No plan data</p></div>)}</CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><PieChartIcon className="h-4 w-4 text-amber-600" />Invoice Status</CardTitle></CardHeader>
              <CardContent className="pt-0">{statusPieData.length > 0 ? (<div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} dataKey="value" nameKey="name" strokeWidth={2} stroke="#fff">{statusPieData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value: number, name: string) => [value, name]} /><Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: "11px" }} /></PieChart></ResponsiveContainer></div>) : (<div className="flex flex-col items-center justify-center h-48 gap-2"><PieChartIcon className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No invoice status data</p></div>)}</CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-emerald-600" />Subscriber Growth Trend</CardTitle></CardHeader>
              <CardContent className="pt-0"><div className="h-64">{data.subscriberGrowth && data.subscriberGrowth.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><LineChart data={data.subscriberGrowth}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="net" name="Net Growth" stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} /><Line type="monotone" dataKey="newSubs" name="New" stroke="#0D9488" strokeWidth={1.5} strokeDasharray="5 5" /><Line type="monotone" dataKey="churned" name="Churned" stroke="#DC2626" strokeWidth={1.5} strokeDasharray="5 5" /><Legend wrapperStyle={{ fontSize: "11px" }} /></LineChart></ResponsiveContainer>) : (<div className="flex flex-col items-center justify-center h-full gap-2"><Users className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No growth data</p></div>)}</div></CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Daily Breakdown Tab */}
        <TabsContent value="daily" className="space-y-4 mt-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-rose-600" />Daily Revenue (Bar Chart)</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {data.dailyRevenue && data.dailyRevenue.length > 0 ? (
                <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.dailyRevenue}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => v.split("-").slice(1).join("/")} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><Tooltip content={<CustomTooltip isCurrency />} /><Bar dataKey="revenue" name="Revenue" fill="#DC2626" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
              ) : (<div className="flex flex-col items-center justify-center h-48 gap-2"><BarChart3 className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No daily data for this period</p></div>)}
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Daily Revenue Table</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table><TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs text-right">Revenue</TableHead><TableHead className="text-xs text-right">Invoices</TableHead></TableRow></TableHeader>
                <TableBody>{(data.dailyRevenue || []).map((d, i) => (<TableRow key={i}><TableCell className="text-xs">{d.date}</TableCell><TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(d.revenue)}</TableCell><TableCell className="text-xs text-right tabular-nums">{d.count}</TableCell></TableRow>))}</TableBody></Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agent Revenue Tab */}
        <TabsContent value="agents" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Agent-wise Revenue Chart</CardTitle></CardHeader>
              <CardContent className="pt-0">
                {data.agentWiseRevenue && data.agentWiseRevenue.length > 0 ? (
                  <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.agentWiseRevenue} layout="vertical" margin={{ left: 10 }}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} /><XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><YAxis dataKey="agent" type="category" tick={{ fill: "#64748B", fontSize: 11 }} width={80} /><Tooltip content={<CustomTooltip isCurrency />} /><Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} barSize={18}>{data.agentWiseRevenue.map((_, index) => <Cell key={`bar-${index}`} fill={COLORS[index % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
                ) : (<div className="flex flex-col items-center justify-center h-48 gap-2"><BarChart3 className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No agent revenue data</p></div>)}
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Agent Breakdown Table</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <Table><TableHeader><TableRow><TableHead className="text-xs">Agent</TableHead><TableHead className="text-xs text-center">Payments</TableHead><TableHead className="text-xs text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>{(data.agentWiseRevenue || []).map((a, i) => (<TableRow key={i}><TableCell className="text-xs font-medium">{a.agent}</TableCell><TableCell className="text-xs text-center tabular-nums">{a.count}</TableCell><TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(a.revenue)}</TableCell></TableRow>))}</TableBody></Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Comparison Tab */}
        <TabsContent value="comparison" className="space-y-4 mt-4">
          <Card className="border shadow-sm"><CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-sm font-medium flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" />Period Comparison</Label>
              <Select value={comparePreset} onValueChange={(v) => { setComparePreset(v); const range = getDateRange(v); setCompareStart(toISO(range.start)); setCompareEnd(toISO(range.end)); }}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Compare period" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="last_quarter">Last Quarter</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={compareStart} onChange={(e) => setCompareStart(e.target.value)} className="w-32 h-8 text-xs" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" value={compareEnd} onChange={(e) => setCompareEnd(e.target.value)} className="w-32 h-8 text-xs" />
            </div>
          </CardContent></Card>
          {compareData ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Current Period Revenue</p><p className="text-xl font-bold tabular-nums">{formatINR(data.summary.totalRevenue)}</p></CardContent></Card>
              <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Compare Period Revenue</p><p className="text-xl font-bold tabular-nums">{formatINR(compareData.summary.totalRevenue)}</p></CardContent></Card>
              <Card className={`border shadow-sm hover:shadow-md transition-shadow duration-200 ${data.summary.totalRevenue >= compareData.summary.totalRevenue ? "bg-emerald-50/60" : "bg-rose-50/60"}`}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Difference</p><div className="flex items-center gap-1.5">{data.summary.totalRevenue >= compareData.summary.totalRevenue ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : <TrendingDown className="h-4 w-4 text-rose-600" />}<p className={`text-xl font-bold tabular-nums ${data.summary.totalRevenue >= compareData.summary.totalRevenue ? "text-emerald-600" : "text-rose-600"}`}>{data.summary.totalRevenue >= compareData.summary.totalRevenue ? "↑" : "↓"} {formatINR(Math.abs(data.summary.totalRevenue - compareData.summary.totalRevenue))}{compareData.summary.totalRevenue > 0 ? ` (${((data.summary.totalRevenue / compareData.summary.totalRevenue * 100 - 100).toFixed(1))}%)` : ""}</p></div></CardContent></Card>
            </div>
          ) : (
            <Card className="border shadow-sm"><CardContent className="flex flex-col items-center justify-center py-12 gap-2"><ArrowLeftRight className="h-8 w-8 text-muted-foreground/30" /><p className="text-muted-foreground text-sm">Select a comparison period to see side-by-side analysis</p></CardContent></Card>
          )}
        </TabsContent>

        {/* Invoice Aging Tab */}
        <TabsContent value="aging" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{(data.invoiceAging || []).map((b, i) => {
            const riskCls = b.bucket === "90+ days" ? "bg-red-100 text-red-700" : b.bucket === "61-90 days" ? "bg-orange-100 text-orange-700" : b.bucket === "31-60 days" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700";
            const totalOutstanding = (data.invoiceAging || []).reduce((s, a) => s + a.amount, 0);
            return (<Card key={i} className="shadow-sm hover:shadow-md transition-shadow"><CardContent className="p-4"><div className="flex items-center justify-between mb-1"><p className="text-sm font-semibold">{b.bucket}</p><Badge variant="outline" className={`text-[9px] ${riskCls}`}>{b.bucket === "90+ days" ? "Critical" : b.bucket === "61-90 days" ? "High" : b.bucket === "31-60 days" ? "Medium" : "Low"}</Badge></div><p className="text-xl font-bold mt-1 tabular-nums">{formatINR(b.amount)}</p><p className="text-xs text-muted-foreground mt-0.5">{b.count} invoice(s)</p><Progress value={totalOutstanding > 0 ? Math.min(100, (b.amount / totalOutstanding) * 100) : 0} className="h-1.5 mt-2" /></CardContent></Card>);
          })}</div>
          <Card className="border shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Invoice Aging Chart</CardTitle></CardHeader><CardContent className="pt-0"><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.invoiceAging || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bucket" tick={{ fill: "#64748B", fontSize: 11 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><Tooltip content={<CustomTooltip isCurrency />} /><Bar dataKey="amount" name="Outstanding" radius={[4, 4, 0, 0]} barSize={28}>{(data.invoiceAging || []).map((_, index) => { const c = ["#16A34A", "#0D9488", "#D97706", "#DC2626"]; return <Cell key={index} fill={c[index]} />; })}</Bar></BarChart></ResponsiveContainer></div></CardContent></Card>
          <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">Total Outstanding</p><p className="text-xl font-bold tabular-nums text-red-600">{formatINR((data.invoiceAging || []).reduce((s, b) => s + b.amount, 0))}</p></div></CardContent></Card>
        </TabsContent>

        {/* Growth Tab */}
        <TabsContent value="growth" className="space-y-4 mt-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-green-600" />Subscriber Growth Trend</CardTitle><CardDescription>New, churned, and net subscriber growth per month</CardDescription></CardHeader>
            <CardContent className="pt-0"><div className="h-80">{data.subscriberGrowth && data.subscriberGrowth.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><BarChart data={data.subscriberGrowth}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} /><Tooltip /><Bar dataKey="newSubs" name="New" stackId="a" fill="#0D9488" radius={[2, 0, 0, 0]} /><Bar dataKey="churned" name="Churned" stackId="a" fill="#DC2626" radius={[0, 2, 0, 0]} /><Bar dataKey="net" name="Net Growth" fill="#16A34A" radius={[0, 0, 2, 0]} /></BarChart></ResponsiveContainer>) : (<div className="flex flex-col items-center justify-center h-full gap-2"><Users className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No growth data available</p></div>)}</div></CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Growth Summary Table</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <Table><TableHeader><TableRow><TableHead className="text-xs">Month</TableHead><TableHead className="text-xs text-center">New</TableHead><TableHead className="text-xs text-center">Churned</TableHead><TableHead className="text-xs text-right">Net Growth</TableHead></TableRow></TableHeader>
                <TableBody>{(data.subscriberGrowth || []).map((g, i) => (<TableRow key={i}><TableCell className="text-xs font-medium">{g.month}</TableCell><TableCell className="text-xs text-center tabular-nums text-green-600">+{g.newSubs}</TableCell><TableCell className="text-xs text-center tabular-nums text-red-600">{g.churned}</TableCell><TableCell className={`text-xs text-right font-semibold tabular-nums ${g.net >= 0 ? "text-green-600" : "text-red-600"}`}>{g.net >= 0 ? "+" : ""}{g.net}</TableCell></TableRow>))}</TableBody></Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Churn Impact Tab */}
        <TabsContent value="churn" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-rose-100 text-rose-600"><AlertTriangle className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total Churned</p></div><p className="text-2xl font-bold tabular-nums text-rose-600">{(data.churnImpact || []).reduce((s, c) => s + c.churnedCount, 0)}</p><p className="text-xs text-muted-foreground mt-1">subscribers in 12 months</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><IndianRupee className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Revenue Lost to Churn</p></div><p className="text-2xl font-bold tabular-nums text-amber-600">{formatINR((data.churnImpact || []).reduce((s, c) => s + c.lostRevenue, 0))}</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><TrendingUp className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Avg Monthly Loss</p></div><p className="text-2xl font-bold tabular-nums">{formatINR(Math.round((data.churnImpact || []).reduce((s, c) => s + c.lostRevenue, 0) / 12))}</p></CardContent></Card>
          </div>
          <Card className="border shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Churn Revenue Impact Trend</CardTitle></CardHeader>
            <CardContent className="pt-0"><div className="h-64">{data.churnImpact && data.churnImpact.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><LineChart data={data.churnImpact}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="bg-popover border border-border/60 rounded-lg shadow-xl px-3 py-2.5 text-xs backdrop-blur-sm"><p className="font-semibold">{payload[0].payload.month}</p><p className="text-muted-foreground">{payload[0].payload.churnedCount} churned</p><p className="text-rose-600 font-bold">↓ {formatINR(payload[0].value as number)} lost</p></div> : null} /><Line type="monotone" dataKey="lostRevenue" name="Revenue Lost" stroke="#DC2626" strokeWidth={2} dot={{ r: 3, fill: "#DC2626" }} /></LineChart></ResponsiveContainer>) : (<div className="flex flex-col items-center justify-center h-full gap-2"><AlertTriangle className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No churn data</p></div>)}</div></CardContent>
          </Card>
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="forecast" className="space-y-4 mt-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><ChevronUp className="h-4 w-4 text-amber-600" />Revenue Forecast</CardTitle><CardDescription>Linear projection based on last 3 months average</CardDescription></CardHeader>
            <CardContent className="pt-0"><div className="h-72">{combinedTrend.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><LineChart data={combinedTrend}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="bg-popover border border-border/60 rounded-lg shadow-xl px-3 py-2.5 text-xs backdrop-blur-sm"><p className="font-semibold">{payload[0].payload.month}</p><p className="text-muted-foreground">{payload[0].payload.projected ? "Projected" : "Actual"}</p><p className="font-bold">{formatINR(payload[0].value as number)}</p></div> : null} /><Line type="monotone" dataKey="revenue" name="Revenue" stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer>) : (<div className="flex flex-col items-center justify-center h-full gap-2"><BarChart3 className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">Insufficient data for forecast</p></div>)}</div></CardContent>
          </Card>
          {data.revenueForecast && data.revenueForecast.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Forecast Summary</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <Table><TableHeader><TableRow><TableHead className="text-xs">Period</TableHead><TableHead className="text-xs text-right">Projected Revenue</TableHead></TableRow></TableHeader>
                <TableBody>{data.revenueForecast.map((f, i) => (
                  <TableRow key={i}><TableCell className="text-xs font-medium">{f.month} (Projected)</TableCell><TableCell className="text-xs text-right font-bold tabular-nums text-amber-700">{formatINR(f.revenue)}</TableCell></TableRow>
                ))}<TableRow className="font-bold bg-muted/50"><TableCell className="text-xs">3-Month Total</TableCell><TableCell className="text-xs text-right tabular-nums">{formatINR(data.revenueForecast.reduce((s, f) => s + f.revenue, 0))}</TableCell></TableRow></TableBody></Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <Card className="border shadow-sm lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-orange-600" />Monthly Expense Summary</CardTitle>
                <CardDescription>Expenses for {now.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mb-4">
                  <p className="text-3xl font-bold tabular-nums">{formatINR(totalMonthExpenses)}</p>
                  <Badge variant="outline" className="text-[10px]">{expensesData?.summary.count ?? 0} entries</Badge>
                </div>
                <div className="space-y-2">
                  {EXPENSE_CATEGORIES.map((cat) => {
                    const amount = expensesData?.summary.byCategory?.[cat] ?? 0;
                    if (amount === 0) return null;
                    const pct = totalMonthExpenses > 0 ? (amount / totalMonthExpenses) * 100 : 0;
                    return (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: EXPENSE_CATEGORY_COLORS[cat] }} />
                        <span className="text-xs text-muted-foreground w-24 truncate">{EXPENSE_CATEGORY_LABELS[cat]}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: EXPENSE_CATEGORY_COLORS[cat] }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums w-24 text-right">{formatINR(amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-orange-600" />Expense Trend (12 Months)</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="h-52">
                  {monthlyExpenseTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyExpenseTrend}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 10 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><Tooltip content={<CustomTooltip isCurrency />} /><Bar dataKey="expenses" name="Expenses" fill="#F97316" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
                  ) : (<div className="flex flex-col items-center justify-center h-full gap-2"><BarChart3 className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No expense data available</p></div>)}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setExpenseDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />Add Expense</Button>
            <Button variant="outline" size="sm" onClick={handleExportExpensesCSV} disabled={!expensesData?.expenses?.length}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
          </div>
          <Card className="border shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Expense Records</CardTitle></CardHeader>
            <CardContent className="p-0">
              {expensesLoading ? (<div className="flex items-center justify-center py-12"><Skeleton className="skeleton-wave h-6 w-40" /></div>) : expensesData?.expenses && expensesData.expenses.length > 0 ? (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <Table><TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Description</TableHead><TableHead className="text-xs">Category</TableHead><TableHead className="text-xs text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>{expensesData.expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="text-xs tabular-nums">{expense.date ? new Date(expense.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</TableCell>
                      <TableCell className="text-xs font-medium">{expense.description}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="text-[10px] capitalize gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: EXPENSE_CATEGORY_COLORS[expense.category] || "#64748B" }} />{EXPENSE_CATEGORY_LABELS[expense.category] || expense.category}</Badge></TableCell>
                      <TableCell className="text-xs text-right font-semibold tabular-nums text-red-600">{formatINR(expense.amount)}</TableCell>
                    </TableRow>
                  ))}</TableBody></Table>
                </div>
              ) : (<div className="flex flex-col items-center justify-center py-12"><Wallet className="h-10 w-10 text-muted-foreground/40 mb-2" /><p className="text-sm text-muted-foreground">No expenses recorded this month</p><Button variant="outline" size="sm" className="mt-2" onClick={() => setExpenseDialogOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />Add your first expense</Button></div>)}
            </CardContent>
          </Card>
        </TabsContent>

        {/* KPI Targets Tab */}
        <TabsContent value="kpi" className="space-y-4 mt-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-amber-600" />KPI Target Tracking</CardTitle>
                  <CardDescription className="mt-1">Set revenue and operational targets, track actuals vs goals</CardDescription>
                </div>
                <Button size="sm" onClick={openKpiDialog}><Settings className="h-4 w-4 mr-1" />Edit Targets</Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.kpiTargets && data.kpiTargets.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {data.kpiTargets.map((kpi, i) => {
                    const isCurrency = kpi.metric.includes("Revenue") || kpi.metric.includes("ARPU");
                    const isPercent = kpi.metric.includes("Efficiency");
                    const displayTarget = isCurrency ? formatINR(kpi.target) : `${kpi.target}${isPercent ? "%" : ""}`;
                    const displayActual = isCurrency ? formatINR(kpi.actual) : `${kpi.actual}${isPercent ? "%" : ""}`;
                    const statusColor = kpi.percent >= 100 ? "text-emerald-600" : kpi.percent >= 75 ? "text-amber-600" : "text-rose-600";
                    const statusBg = kpi.percent >= 100 ? "bg-emerald-50/60" : kpi.percent >= 75 ? "bg-amber-50/60" : "bg-rose-50/60";
                    return (
                      <Card key={i} className={`border shadow-sm hover:shadow-md transition-shadow duration-200 ${statusBg}`}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{kpi.metric}</p>
                            <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{kpi.percent >= 100 ? "↑ On Track" : kpi.percent >= 75 ? "⚠ At Risk" : "↓ Behind"}</Badge>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Target</span><span className="font-medium">{displayTarget}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Actual</span><span className={`font-bold ${statusColor}`}>{displayActual}</span></div>
                          </div>
                          <Progress value={Math.min(100, kpi.percent)} className="h-2.5" />
                          <div className="flex items-center justify-end gap-1"><span className={`text-[10px] font-bold ${statusColor}`}>{kpi.percent >= 100 ? "↑" : "↓"}</span><p className="text-[10px] text-muted-foreground">{kpi.percent}% achieved</p></div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <Target className="h-10 w-10 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No KPI targets set</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={openKpiDialog}><Settings className="h-3.5 w-3.5 mr-1" />Set your first targets</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TDS/TCS Tab */}
        <TabsContent value="tds" className="space-y-4 mt-4">
          {tdsLoading ? (<Card className="border shadow-sm"><CardContent className="p-8"><Skeleton className="skeleton-wave h-6 w-48 mb-4" /><Skeleton className="skeleton-wave h-4 w-full" /><Skeleton className="skeleton-wave h-4 w-full mt-2" /></CardContent></Card>) : tdsData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-rose-100 text-rose-600"><ShieldCheck className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total TDS Deducted</p></div><p className="text-xl font-bold tabular-nums">{formatINR(tdsData.summary.totalTDS)}</p><p className="text-[10px] text-muted-foreground mt-1">{tdsData.summary.invoiceCount} invoices</p></CardContent></Card>
                <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><FileText className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Invoice Amount</p></div><p className="text-xl font-bold tabular-nums">{formatINR(tdsData.summary.totalInvoiceAmount)}</p></CardContent></Card>
                <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><BarChart3 className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total GST</p></div><p className="text-xl font-bold tabular-nums">{formatINR(tdsData.summary.totalTax)}</p><p className="text-[10px] text-muted-foreground mt-1">CGST {formatINR(tdsData.summary.totalCGST)} | SGST {formatINR(tdsData.summary.totalSGST)}</p></CardContent></Card>
                <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><Target className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">TDS Rate Breakdown</p></div>{tdsData.rateBreakdown.map((r, i) => (<p key={i} className="text-xs"><span className="text-muted-foreground">{r.rate}%:</span> <span className="font-semibold">{formatINR(r.tdsAmount)}</span> <span className="text-muted-foreground">({r.count})</span></p>))}</CardContent></Card>
              </div>

              {tdsData.monthlyTDS.some((m) => m.tdsAmount > 0) && (
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Monthly TDS Trend</CardTitle></CardHeader>
                  <CardContent className="pt-0"><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={tdsData.monthlyTDS}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 10 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><Tooltip content={<CustomTooltip isCurrency />} /><Bar dataKey="tdsAmount" name="TDS Amount" fill="#F59E0B" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent>
                </Card>
              )}

              <Card className="border shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><FileText className="h-4 w-4" />TDS Invoice Details</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <Table><TableHeader><TableRow>
                      <TableHead className="text-xs">Invoice #</TableHead>
                      <TableHead className="text-xs">Subscriber</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs text-center">TDS Rate</TableHead>
                      <TableHead className="text-xs text-right">TDS Amount</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{tdsData.invoices.length > 0 ? tdsData.invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-xs font-medium tabular-nums">{inv.invoiceNumber}</TableCell>
                        <TableCell className="text-xs">{inv.subscriberName}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatINR(inv.invoiceAmount)}</TableCell>
                        <TableCell className="text-xs text-center"><Badge variant="outline" className="text-[10px]">{inv.tdsRate}%</Badge></TableCell>
                        <TableCell className="text-xs text-right font-semibold tabular-nums text-red-600">{formatINR(inv.tdsAmount)}</TableCell>
                        <TableCell className="text-xs"><Badge variant={inv.status === "PAID" ? "default" : "secondary"} className="text-[10px]">{STATUS_LABELS[inv.status] || inv.status}</Badge></TableCell>
                      </TableRow>
                    )) : (<TableRow><TableCell colSpan={6} className="text-xs text-center py-8 text-muted-foreground">No TDS-deducted invoices found in this period</TableCell></TableRow>)}</TableBody></Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (<Card className="border shadow-sm"><CardContent className="flex flex-col items-center justify-center py-12 gap-2"><ShieldCheck className="h-8 w-8 text-muted-foreground/30" /><p className="text-muted-foreground text-sm">Failed to load TDS report data.</p></CardContent></Card>)}
        </TabsContent>
      </Tabs>

      {/* Add Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Add Expense</DialogTitle>
            <DialogDescription>Record a new expense entry for tracking.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="exp-desc">Description *</Label><Input id="exp-desc" placeholder="e.g. Monthly salary, Router purchase..." value={expDesc} onChange={(e) => setExpDesc(e.target.value)} /></div>
            <div className="space-y-2">
              <Label htmlFor="exp-category">Category</Label>
              <Select value={expCategory} onValueChange={setExpCategory}><SelectTrigger id="exp-category"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map((cat) => (<SelectItem key={cat} value={cat} className="capitalize">{EXPENSE_CATEGORY_LABELS[cat]}</SelectItem>))}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="exp-amount">Amount (₹) *</Label><Input id="exp-amount" type="number" min="0" step="0.01" placeholder="0.00" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="exp-date">Date *</Label><Input id="exp-date" type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddExpense} disabled={addExpenseMutation.isPending}>{addExpenseMutation.isPending ? "Adding..." : "Add Expense"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPI Target Edit Dialog */}
      <Dialog open={kpiDialogOpen} onOpenChange={setKpiDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5" />Set KPI Targets</DialogTitle>
            <DialogDescription>Define targets for key performance metrics. Leave target at 0 to exclude.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-96 overflow-y-auto">
            {kpiEdits.map((edit, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex-1">
                  <Label className="text-xs font-medium">{edit.metric}</Label>
                </div>
                <Input type="number" min="0" step="1" className="w-32 h-8 text-sm" value={edit.target || ""} onChange={(e) => {
                  const updated = [...kpiEdits];
                  updated[i] = { ...updated[i], target: parseFloat(e.target.value) || 0 };
                  setKpiEdits(updated);
                }} placeholder="Target value" />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => {
                setKpiEdits([...kpiEdits, { metric: "", target: 0, period: "monthly" }]);
              }}><Plus className="h-3.5 w-3.5 mr-1" />Add Metric</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKpiDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveKpiTargets} disabled={saveKpiMutation.isPending}>{saveKpiMutation.isPending ? "Saving..." : "Save Targets"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
