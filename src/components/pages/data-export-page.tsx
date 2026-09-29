"use client";

import React, { useState, useCallback } from "react";
import {
  Download,
  FileSpreadsheet,
  Users,
  Receipt,
  Wallet,
  AlertTriangle,
  Loader2,
  Filter,
  Table2,
  Database,
  CalendarDays,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ──────────────────────────────────────────────

type ExportTab = "subscribers" | "invoices" | "payments" | "complaints";

interface ExportTabConfig {
  id: ExportTab;
  label: string;
  icon: React.ElementType;
  apiEndpoint: string;
  statusOptions: { value: string; label: string }[];
  extraFilters?: string[];
}

interface PreviewRow {
  [key: string]: unknown;
}

// ─── Tab Configurations ─────────────────────────────────

const TAB_CONFIGS: ExportTabConfig[] = [
  {
    id: "subscribers",
    label: "Subscribers",
    icon: Users,
    apiEndpoint: "/api/export/subscribers",
    statusOptions: [
      { value: "", label: "All Statuses" },
      { value: "ACTIVE", label: "Active" },
      { value: "SUSPENDED", label: "Suspended" },
      { value: "DISCONNECTED", label: "Disconnected" },
      { value: "TRIAL", label: "Trial" },
      { value: "PENDING_ACTIVATION", label: "Pending Activation" },
    ],
    extraFilters: ["connectionType"],
  },
  {
    id: "invoices",
    label: "Invoices",
    icon: Receipt,
    apiEndpoint: "/api/export/invoices",
    statusOptions: [
      { value: "", label: "All Statuses" },
      { value: "DRAFT", label: "Draft" },
      { value: "SENT", label: "Sent" },
      { value: "PAID", label: "Paid" },
      { value: "PARTIALLY_PAID", label: "Partially Paid" },
      { value: "OVERDUE", label: "Overdue" },
      { value: "CANCELLED", label: "Cancelled" },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    icon: Wallet,
    apiEndpoint: "/api/export/payments",
    statusOptions: [
      { value: "", label: "All Statuses" },
      { value: "PENDING", label: "Pending" },
      { value: "VERIFIED", label: "Verified" },
      { value: "FAILED", label: "Failed" },
      { value: "REFUNDED", label: "Refunded" },
    ],
    extraFilters: ["paymentMode"],
  },
  {
    id: "complaints",
    label: "Complaints",
    icon: AlertTriangle,
    apiEndpoint: "/api/export/complaints",
    statusOptions: [
      { value: "", label: "All Statuses" },
      { value: "OPEN", label: "Open" },
      { value: "ASSIGNED", label: "Assigned" },
      { value: "IN_PROGRESS", label: "In Progress" },
      { value: "RESOLVED", label: "Resolved" },
      { value: "CLOSED", label: "Closed" },
      { value: "REOPENED", label: "Reopened" },
    ],
    extraFilters: ["priority"],
  },
];

// Connection type options
const CONNECTION_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "FTTH", label: "FTTH" },
  { value: "WIRELESS", label: "Wireless" },
  { value: "CABLE", label: "Cable" },
  { value: "LEASED_LINE", label: "Leased Line" },
  { value: "ETHERNET", label: "Ethernet" },
];

// Payment mode options
const PAYMENT_MODE_OPTIONS = [
  { value: "", label: "All Modes" },
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "ONLINE", label: "Online" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "WALLET", label: "Wallet" },
];

// Priority options
const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "P1_CRITICAL", label: "Critical" },
  { value: "P2_HIGH", label: "High" },
  { value: "P3_MEDIUM", label: "Medium" },
  { value: "P4_LOW", label: "Low" },
];

// Preview column mapping per tab
const PREVIEW_COLUMNS: Record<ExportTab, string[]> = {
  subscribers: [
    "Code",
    "Name",
    "Email",
    "Phone",
    "Status",
    "Plan",
    "Area",
    "Connection Type",
    "Activation Date",
  ],
  invoices: [
    "Invoice#",
    "Subscriber Name",
    "Plan",
    "Issue Date",
    "Due Date",
    "Subtotal",
    "Tax",
    "Total",
    "Status",
    "Paid Amount",
    "Balance",
  ],
  payments: [
    "Receipt#",
    "Subscriber Name",
    "Amount",
    "Mode",
    "Transaction Ref",
    "Status",
    "Date",
    "Invoice#",
  ],
  complaints: [
    "Ticket#",
    "Subscriber",
    "Type",
    "Priority",
    "Status",
    "Assigned To",
    "Created",
    "Resolved",
    "Area",
  ],
};

// ─── Export Tab Panel Component ─────────────────────────

function ExportTabPanel({ config }: { config: ExportTabConfig }) {
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [connectionType, setConnectionType] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [priority, setPriority] = useState("");
  const [exporting, setExporting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasPreviewed, setHasPreviewed] = useState(false);

  const columns = PREVIEW_COLUMNS[config.id];

  // Build query params from filters
  const buildQueryParams = useCallback(
    (format: string) => {
      const params = new URLSearchParams();
      params.set("format", format);
      if (status) params.set("status", status);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (connectionType) params.set("connectionType", connectionType);
      if (paymentMode) params.set("mode", paymentMode);
      if (priority) params.set("priority", priority);
      return params.toString();
    },
    [status, dateFrom, dateTo, connectionType, paymentMode, priority]
  );

  // Load preview (JSON format, limited by API)
  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setHasPreviewed(true);
    try {
      const params = buildQueryParams("json");
      const res = await fetch(`${config.apiEndpoint}?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${text || res.statusText}`);
      }
      const json = await res.json();
      setTotalCount(json.total || 0);
      // Show first 20 for preview
      const data = json.data || [];
      setPreviewData(data.slice(0, 20));
    } catch (err) {
      toast.error("Failed to load preview", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setPreviewData([]);
      setTotalCount(0);
    } finally {
      setPreviewLoading(false);
    }
  }, [config.apiEndpoint, buildQueryParams]);

  // Export CSV download
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const params = buildQueryParams("csv");
      const res = await fetch(`${config.apiEndpoint}?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${text || res.statusText}`);
      }

      // Get filename from Content-Disposition or generate one
      const disposition = res.headers.get("Content-Disposition") || "";
      let filename = `${config.id}_export.csv`;
      const match = disposition.match(/filename="?(.+?)"?(;|$)/);
      if (match && match[1]) filename = match[1];

      // Create blob URL and trigger download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`${config.label} exported successfully`, {
        description: `File: ${filename}`,
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      });
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setExporting(false);
    }
  }, [config, buildQueryParams]);

  const activeFilterCount = [status, dateFrom, dateTo, connectionType, paymentMode, priority].filter(Boolean).length;

  const Icon = config.icon;

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">
                Filters
              </CardTitle>
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-bold bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
                >
                  {activeFilterCount} active
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground"
              onClick={() => {
                setStatus("");
                setDateFrom("");
                setDateTo("");
                setConnectionType("");
                setPaymentMode("");
                setPriority("");
                setHasPreviewed(false);
                setPreviewData([]);
                setTotalCount(0);
              }}
            >
              Clear All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Status Filter */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Status
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  {config.statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value || "__all__"}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                <CalendarDays className="h-3 w-3 inline mr-1" />
                Date From
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Date To */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                <CalendarDays className="h-3 w-3 inline mr-1" />
                Date To
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Extra Filters */}
            {config.extraFilters?.includes("connectionType") && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Connection Type
                </Label>
                <Select value={connectionType} onValueChange={setConnectionType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONNECTION_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value || "__all__"}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {config.extraFilters?.includes("paymentMode") && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Payment Mode
                </Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All Modes" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value || "__all__"}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {config.extraFilters?.includes("priority") && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Priority
                </Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All Priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value || "__all__"}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t">
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span className="text-xs font-semibold">
                {exporting ? "Exporting..." : "Export CSV"}
              </span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={loadPreview}
              disabled={previewLoading}
            >
              {previewLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Table2 className="h-3.5 w-3.5" />
              )}
              <span>{previewLoading ? "Loading..." : "Preview Data"}</span>
            </Button>

            {hasPreviewed && !previewLoading && (
              <div className="flex items-center gap-1.5 ml-auto">
                <Database className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">
                  {totalCount} record{totalCount !== 1 ? "s" : ""}
                  {totalCount > 20 && " · showing first 20"}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Preview Table */}
      {hasPreviewed && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Table2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">
                Data Preview
              </CardTitle>
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-[10px] font-bold"
              >
                {previewData.length} rows
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {previewLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : previewData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Database className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No records found matching the current filters.
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Try adjusting your filter criteria.
                </p>
              </div>
            ) : (
              <div className="rounded-md border overflow-auto max-h-[420px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      {columns.map((col) => (
                        <TableHead
                          key={col}
                          className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap px-3 h-9"
                        >
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row, i) => (
                      <TableRow key={i} className="text-xs">
                        {columns.map((col) => (
                          <TableCell
                            key={col}
                            className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate"
                          >
                            {formatCellValue(row[col])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Cell Value Formatter ───────────────────────────────

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    // Format currency-like numbers
    if (value > 100) {
      return new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    }
    return String(value);
  }
  return String(value);
}

// ─── Main Data Export Page ───────────────────────────────

export default function DataExportPage() {
  return (
    <div className="space-y-6 animate-page-transition">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Data Export
            </h1>
            <p className="text-sm text-muted-foreground">
              Export subscriber, invoice, payment, and complaint data as CSV
              files. Apply filters to customize your export.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TAB_CONFIGS.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <Card
              key={tab.id}
              className="py-0 gap-0 overflow-hidden group hover:shadow-md transition-all duration-200"
            >
              <CardContent className="p-3 flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-lg shrink-0",
                    tab.id === "subscribers" &&
                      "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                    tab.id === "invoices" &&
                      "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
                    tab.id === "payments" &&
                      "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
                    tab.id === "complaints" &&
                      "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                  )}
                >
                  <TabIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {tab.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    CSV Download
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabbed Export Panels */}
      <Tabs defaultValue="subscribers" className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto w-full p-1 bg-muted/50">
          {TAB_CONFIGS.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center justify-center gap-1.5 h-9 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <TabIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TAB_CONFIGS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            <ExportTabPanel config={tab} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
