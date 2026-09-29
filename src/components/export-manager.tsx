"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Download,
  Users,
  CreditCard,
  FileText,
  MessageSquareWarning,
  Globe,
  Router,
  BarChart3,
  ClipboardList,
  UserPlus,
  Wifi,
  AlertTriangle,
  HandCoins,
  FileSpreadsheet,
  Loader2,
  Clock,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppStore } from "@/store/app-store";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ──────────────────────────────────────────────

interface ExportCategory {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  format: string;
  estimatedSize: string;
  url: string;
  iconBg: string;
}

interface RecentExport {
  id: string;
  title: string;
  exportedAt: string;
}

// ─── Export Categories (12 total) ───────────────────────

const EXPORT_CATEGORIES: ExportCategory[] = [
  {
    id: "subscribers",
    title: "Subscribers",
    description: "All subscriber data with contact details",
    icon: Users,
    format: "CSV",
    estimatedSize: "~50 KB",
    url: "/api/subscribers/export",
    iconBg: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  },
  {
    id: "payments",
    title: "Payments",
    description: "Payment collection records",
    icon: CreditCard,
    format: "CSV",
    estimatedSize: "~80 KB",
    url: "/api/payments/export",
    iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  {
    id: "invoices",
    title: "Invoices",
    description: "Invoice details and line items",
    icon: FileText,
    format: "CSV",
    estimatedSize: "~120 KB",
    url: "/api/invoices/export",
    iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  },
  {
    id: "complaints",
    title: "Complaints",
    description: "Complaint tickets and resolutions",
    icon: MessageSquareWarning,
    format: "CSV",
    estimatedSize: "~40 KB",
    url: "/api/complaints/export",
    iconBg: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  },
  {
    id: "plans",
    title: "Plans",
    description: "Plan catalog with pricing and features",
    icon: Globe,
    format: "CSV",
    estimatedSize: "~15 KB",
    url: "/api/plans",
    iconBg: "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400",
  },
  {
    id: "devices",
    title: "Devices",
    description: "Network device inventory",
    icon: Router,
    format: "CSV",
    estimatedSize: "~30 KB",
    url: "/api/devices/export",
    iconBg: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
  },
  {
    id: "revenue",
    title: "Revenue Reports",
    description: "Financial summary data",
    icon: BarChart3,
    format: "CSV",
    estimatedSize: "~60 KB",
    url: "/api/reports?tab=financial&export=csv",
    iconBg: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  },
  {
    id: "audit-log",
    title: "Audit Log",
    description: "System audit trail",
    icon: ClipboardList,
    format: "CSV",
    estimatedSize: "~100 KB",
    url: "/api/audit-log?export=csv",
    iconBg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
  {
    id: "leads",
    title: "Leads",
    description: "Sales leads and pipeline",
    icon: UserPlus,
    format: "CSV",
    estimatedSize: "~25 KB",
    url: "/api/leads?export=csv",
    iconBg: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400",
  },
  {
    id: "bandwidth",
    title: "Bandwidth",
    description: "Bandwidth usage data",
    icon: Wifi,
    format: "CSV",
    estimatedSize: "~200 KB",
    url: "/api/bandwidth/export",
    iconBg: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
  },
  {
    id: "incidents",
    title: "Incidents",
    description: "Incident reports",
    icon: AlertTriangle,
    format: "CSV",
    estimatedSize: "~35 KB",
    url: "/api/incidents/export",
    iconBg: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
  {
    id: "collection",
    title: "Collection",
    description: "Collection agent performance",
    icon: HandCoins,
    format: "CSV",
    estimatedSize: "~45 KB",
    url: "/api/collection/export",
    iconBg: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
];

// ─── LocalStorage helpers ───────────────────────────────

const RECENT_KEY = "export-manager-recent";
const MAX_RECENT = 5;

function getRecentExports(): RecentExport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentExport(exportId: string, title: string) {
  try {
    const existing = getRecentExports();
    const filtered = existing.filter((e) => e.id !== exportId);
    filtered.unshift({ id: exportId, title, exportedAt: new Date().toISOString() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
  } catch {
    // silently fail
  }
}

// ─── Export Category Card ───────────────────────────────

function ExportCard({
  category,
  onExport,
  isLoading,
}: {
  category: ExportCategory;
  onExport: (cat: ExportCategory) => void;
  isLoading: boolean;
}) {
  const Icon = category.icon;

  return (
    <Card
      className={cn(
        "group relative cursor-pointer transition-all duration-200 hover:shadow-md hover:border-[#DC2626]/30 active:scale-[0.98] py-0 gap-0 overflow-hidden",
        isLoading && "pointer-events-none opacity-70"
      )}
      onClick={() => onExport(category)}
    >
      <div className="p-4 flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "flex items-center justify-center h-10 w-10 rounded-lg shrink-0 transition-colors",
            category.iconBg
          )}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#1E293B] dark:text-[#F8FAFC] truncate">
              {category.title}
            </h3>
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0 h-5 bg-[#FEF2F2] text-[#DC2626] border-[#FECACA] dark:bg-[#DC2626]/10 dark:text-[#EF4444] dark:border-[#DC2626]/20"
            >
              {category.format}
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5 line-clamp-2">
            {category.description}
          </p>
          <p className="text-[10px] text-[#94A3B8] dark:text-[#64748B] mt-1.5 font-medium">
            {category.estimatedSize}
          </p>
        </div>
      </div>

      {/* Hover accent bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#DC2626] scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
    </Card>
  );
}

// ─── Recently Exported Section ──────────────────────────

function RecentSection({ recent }: { recent: RecentExport[] }) {
  if (recent.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Clock className="h-3.5 w-3.5 text-[#94A3B8]" />
        <h4 className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
          Recently Exported
        </h4>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {recent.map((item) => (
          <Badge
            key={item.id}
            variant="outline"
            className="text-[11px] font-medium px-2 py-0.5 bg-[#F8FAFC] dark:bg-[#1E293B] text-[#475569] dark:text-[#CBD5E1] border-[#E2E8F0] dark:border-[#334155]"
          >
            <FileSpreadsheet className="h-3 w-3 mr-1 text-[#0D9488]" />
            {item.title}
          </Badge>
        ))}
      </div>
      <Separator className="mt-3" />
    </div>
  );
}

// ─── Export Manager Dialog ──────────────────────────────

function ExportManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Read recent exports fresh each time the dialog renders while open
  const recent: RecentExport[] = open ? getRecentExports() : [];

  const handleExport = useCallback((category: ExportCategory) => {
    setLoadingId(category.id);
    toast.info(`Opening ${category.title} export...`, {
      icon: <Download className="h-4 w-4 text-[#DC2626]" />,
    });

    // Save to recently exported
    saveRecentExport(category.id, category.title);

    // Simulate brief loading then open URL
    setTimeout(() => {
      window.open(category.url, "_blank");
      toast.success(`${category.title} export started`, {
        description: "Your file will download automatically",
      });
      setLoadingId(null);
    }, 600);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[#FEF2F2] dark:bg-[#DC2626]/10">
              <Download className="h-5 w-5 text-[#DC2626]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-[#1E293B] dark:text-[#F8FAFC]">
                Export Manager
              </DialogTitle>
              <DialogDescription className="text-sm text-[#64748B] dark:text-[#94A3B8]">
                Quick CSV exports for all your data categories
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content with scroll */}
        <ScrollArea className="flex-1 px-6 pb-6">
          <RecentSection recent={recent} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXPORT_CATEGORIES.map((cat) => (
              <ExportCard
                key={cat.id}
                category={cat}
                onExport={handleExport}
                isLoading={loadingId === cat.id}
              />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Export Manager Trigger (Dropdown + Dialog) ─────────

export function ExportManager() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleDashboardReport = () => {
    const { setCurrentPage } = useAppStore.getState();
    setCurrentPage("Dashboard", "MAIN");
    setDialogOpen(false);
    toast.info("Navigate to Dashboard to export the report");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-[#64748B] hover:text-[#DC2626] dark:text-[#94A3B8] dark:hover:text-[#EF4444] transition-colors"
            aria-label="Export data"
          >
            <Download className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            className="cursor-pointer py-2.5"
            onClick={() => setDialogOpen(true)}
          >
            <Download className="mr-2 h-4 w-4 text-[#DC2626]" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Export Manager</span>
              <span className="text-[11px] text-[#94A3B8]">12 export categories</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer py-2.5"
            onClick={handleDashboardReport}
          >
            <LayoutDashboard className="mr-2 h-4 w-4 text-[#0D9488]" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Dashboard Report</span>
              <span className="text-[11px] text-[#94A3B8]">KPIs & summaries</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ExportManagerDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

export default ExportManager;
