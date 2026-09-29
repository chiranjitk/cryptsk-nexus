"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  IndianRupee, AlertTriangle, CalendarClock, TrendingUp, Search,
  RefreshCw, Send, CreditCard, UserX, Phone, CheckCircle2, UserCheck,
  MessageSquare, ChevronLeft, ChevronRight, Download, Clock, FileText,
  Ban, Undo2, MapPin, Calendar, ShieldAlert, Scale, Plus, Eye, Printer,
  ArrowUpCircle, Gavel, Timer, AlertOctagon, ClipboardCheck, Activity,
  Pause, PlayCircle, Settings2, BarChart3, Target, Zap, Gauge, Flame,
  Inbox, Users, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface RecoveryStats {
  totalOutstanding: number; overdue30plus: number; thisMonthDue: number; recoveryRate: number;
}

interface AgingBucket { label: string; amount: number; count: number; }

interface RecoveryInvoice {
  id: string; invoiceNumber: string; dueDate: string; grandTotal: number;
  paidAmount: number; balanceAmount: number; status: string; paymentMode: string | null;
  daysOverdue: number; agingBucket: string;
  escalationLevel?: number; escalationAction?: string | null; slaStatus?: string | null;
  lastPayment: { amount: number; paymentMode: string; createdAt: string } | null;
  subscriber: { id: string; name: string; code: string; phone: string; area: { name: string } | null };
  plan: { name: string } | null;
}

interface PaymentPromise {
  id: string; subscriberName: string; invoiceNumber: string; amount: number;
  expectedDate: string; notes: string;
}

interface RecoveryAction {
  id: string; invoiceId: string; invoiceNumber: string; subscriberName: string;
  action: string; method: string; notes: string; createdAt: string; performedBy: string;
}

interface PaymentPlanInstallmentItem {
  id: string; paymentPlanId: string; installmentNumber: number;
  dueDate: string; amount: number; paidAmount: number;
  status: string; paidAt: string | null; createdAt: string; updatedAt: string;
}

interface PaymentPlanItem {
  id: string; subscriberId: string; invoiceId: string | null;
  totalAmount: number; emiCount: number; emiAmount: number;
  startDate: string; paidInstallments: number; status: string;
  notes: string; createdAt: string; updatedAt: string;
  subscriber: { id: string; name: string; code: string; phone: string };
  invoice: { id: string; invoiceNumber: string } | null;
  installments: PaymentPlanInstallmentItem[];
}

interface SubscriberInvoice {
  id: string; invoiceNumber: string; grandTotal: number;
  balanceAmount: number; paidAmount: number; status: string; dueDate: string;
}

interface PaymentPlansData {
  paymentPlans: PaymentPlanItem[];
  stats: { total: number; active: number; completed: number; defaulted: number };
}

// ─── Dispute interfaces ───────────────────────────────────────────────────────

interface DisputeEvent {
  id: string;
  type: "raised" | "status_change" | "resolved" | "note";
  description: string;
  timestamp: string;
  details?: string;
}

interface DisputeRecord {
  subscriberId: string;
  status: "No Dispute" | "Under Review" | "Resolved" | "Rejected";
  reason: string;
  description: string;
  supportingNotes: string;
  events: DisputeEvent[];
  resolutionNotes: string;
  actionTaken: string;
}

// ─── Escalation interfaces ─────────────────────────────────────────────────

interface EscalationRecord {
  id: string; invoiceId: string; subscriberId: string; level: number;
  action: string; method: string; notes: string; createdAt: string;
  invoice: { invoiceNumber: string; balanceAmount: number; dueDate: string };
  subscriber: { name: string; code: string; phone: string };
  performedBy: { name: string } | null;
}

// ─── SLA interfaces ───────────────────────────────────────────────────────

interface SlaRecord {
  id: string; invoiceId: string; subscriberId: string;
  targetDays: number; actualDays: number; status: string;
  escalatedAt: string | null; resolvedAt: string | null; notes: string;
  invoice: { invoiceNumber: string; balanceAmount: number; dueDate: string; grandTotal: number };
  subscriber: { id: string; name: string; code: string; phone: string; area: { name: string } | null };
}

// ─── Agent Dashboard interfaces ───────────────────────────────────────────────

interface AgentDashData {
  agentName: string;
  agentId: string;
  totalAssigned: number;
  resolvedThisMonth: number;
  totalRecoveredThisMonth: number;
  recoveryRate: number;
  avgDaysToResolve: number;
}

// ─── Helper Components ────────────────────────────────────────────────────────

function StatCard({ title, value, subtitle, icon: Icon, gradient, delay }: {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; gradient: string; delay: number;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg animate-card-enter`} style={{ animationDelay: `${delay}ms` }}>
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

// ─── Constants ────────────────────────────────────────────────────────────────

const AGING_GRADIENTS: Record<string, { gradient: string; iconBg: string }> = {
  "1-30 days": { gradient: "aging-gradient-amber", iconBg: "bg-amber-900/30" },
  "31-60 days": { gradient: "aging-gradient-orange", iconBg: "bg-orange-900/30" },
  "61-90 days": { gradient: "aging-gradient-red", iconBg: "bg-red-900/30" },
  "90+ days": { gradient: "aging-gradient-critical", iconBg: "bg-red-900/40" },
};

const AGING_COLORS: Record<string, string> = {
  "1-30 days": "border-l-4 border-l-yellow-500",
  "31-60 days": "border-l-4 border-l-orange-500",
  "61-90 days": "border-l-4 border-l-red-500",
  "90+ days": "border-l-4 border-l-red-800",
};

const PLAN_STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-teal-100 text-teal-700 border-teal-200",
  defaulted: "bg-red-100 text-red-700 border-red-200",
};

const INSTALLMENT_STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  overdue: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-600",
};

const DISPUTE_STATUS_STYLES: Record<string, string> = {
  "No Dispute": "bg-gray-100 text-gray-600",
  "Under Review": "bg-yellow-100 text-yellow-700",
  "OPEN": "bg-yellow-100 text-yellow-700",
  "Resolved": "bg-green-100 text-green-700",
  "RESOLVED": "bg-green-100 text-green-700",
  "Rejected": "bg-red-100 text-red-700",
  "REJECTED": "bg-red-100 text-red-700",
};

const ESCALATION_LEVEL_STYLES: Record<number, { bg: string; text: string; label: string; icon: string }> = {
  0: { bg: "bg-gray-100 text-gray-600", text: "text-gray-600", label: "None", icon: "" },
  1: { bg: "bg-yellow-100 text-yellow-700", text: "text-yellow-700", label: "L1 Reminder", icon: "🔔" },
  2: { bg: "bg-orange-100 text-orange-700", text: "text-orange-700", label: "L2 Warning", icon: "⚠️" },
  3: { bg: "bg-red-100 text-red-700", text: "text-red-700", label: "L3 Legal", icon: "⚖️" },
};

const SLA_STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-700",
  MET: "bg-green-100 text-green-700",
  BREACHED: "bg-red-100 text-red-700",
  ESCALATED: "bg-orange-100 text-orange-700",
  AT_RISK: "bg-amber-100 text-amber-700",
};

// ─── Legal Notice Template ────────────────────────────────────────────────────

function buildNoticeText(
  noticeType: string,
  subscriberName: string,
  subscriberPhone: string,
  subscriberArea: string,
  outstandingAmount: string,
  dueDate: string,
  daysOverdue: number,
  invoiceNumber: string,
) {
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const ispname = "NetConnect ISP";
  const ispAddress = "42, Technology Park, Sector V, Kolkata - 700091";
  const ispPhone = "+91 33 4000 5000";
  const ispEmail = "billing@netconnect.in";

  const typeHeader = noticeType === "Final Notice"
    ? "FINAL NOTICE BEFORE LEGAL ACTION"
    : noticeType === "Legal Warning"
      ? "LEGAL WARNING NOTICE"
      : "DISCONNECTION NOTICE";

  const severityText = noticeType === "Final Notice"
    ? "This is your FINAL notice before we initiate legal proceedings under the applicable provisions of the Indian Telegraph Act, 1885 and the Consumer Protection Act, 2019."
    : noticeType === "Legal Warning"
      ? "Failure to respond within 7 days of this notice will result in the matter being referred to our legal counsel for appropriate action, which may include filing a civil suit for recovery of dues."
      : "If the outstanding amount is not cleared within 48 hours of this notice, your internet connection will be permanently disconnected and your account may be referred to a collection agency.";

  return `┌─────────────────────────────────────────────────────────────┐
│                                                                │
│                    ${ispname}                       │
│             ${ispAddress}         │
│             Phone: ${ispPhone}                         │
│             Email: ${ispEmail}                          │
│                                                                │
├─────────────────────────────────────────────────────────────┤
│                                                                │
│              *** ${typeHeader} ***                  │
│                                                                │
│              Ref: ${invoiceNumber}                          │
│              Date: ${today}                       │
│                                                                │
├─────────────────────────────────────────────────────────────┤

To,
${subscriberName}
${subscriberArea}
Phone: ${subscriberPhone}

Subject: Outstanding Payment Due for Internet Services

Dear ${subscriberName},

This notice is to inform you that your account with ${ispname} 
has an outstanding balance that remains unpaid despite previous reminders.

DETAILS OF OUTSTANDING DUES:
────────────────────────────────
  Invoice Number  : ${invoiceNumber}
  Total Amount    : ₹${outstandingAmount}
  Due Date        : ${dueDate}
  Days Overdue    : ${daysOverdue} days
  Late Interest   : ₹${daysOverdue > 30 ? Math.round(Number(outstandingAmount.replace(/,/g, "")) * 0.02 * (daysOverdue - 30)).toLocaleString("en-IN") : "0"} (applicable)

${severityText}

You are hereby directed to remit the full outstanding amount of 
₹${outstandingAmount} along with applicable late payment charges to 
${ispname} within the stipulated time.

Payment can be made via:
  • Cash at our office
  • UPI to billing@netconnect.in
  • Online transfer to A/C: XXXX XXXX XXXX, IFSC: XXXX0000000

For any queries or to discuss a payment arrangement, please contact 
our billing department at ${ispPhone} or visit our office.

This notice is issued without prejudice to all rights and remedies 
available to ${ispname} under applicable law.

Sincerely,
Billing & Recovery Department
${ispname}

This is a system-generated legal notice.
Document Reference: ${ispname}/${noticeType.toUpperCase().replace(/\s/g, "-")}/${invoiceNumber}`;
}

// ─── Dispute localStorage helpers ─────────────────────────────────────────────

function getDispute(subscriberId: string): DisputeRecord {
  if (typeof window === "undefined") {
    return {
      subscriberId,
      status: "No Dispute",
      reason: "",
      description: "",
      supportingNotes: "",
      events: [],
      resolutionNotes: "",
      actionTaken: "",
    };
  }
  const raw = localStorage.getItem(`due-recovery-disputes-${subscriberId}`);
  if (!raw) {
    return {
      subscriberId,
      status: "No Dispute",
      reason: "",
      description: "",
      supportingNotes: "",
      events: [],
      resolutionNotes: "",
      actionTaken: "",
    };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {
      subscriberId,
      status: "No Dispute",
      reason: "",
      description: "",
      supportingNotes: "",
      events: [],
      resolutionNotes: "",
      actionTaken: "",
    };
  }
}

function saveDispute(record: DisputeRecord) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`due-recovery-disputes-${record.subscriberId}`, JSON.stringify(record));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DueRecoveryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [agingFilter, setAgingFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState("20");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [promiseOpen, setPromiseOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reminderMethod, setReminderMethod] = useState("SMS");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [paymentNote, setPaymentNote] = useState("");
  const [promiseSubscriber, setPromiseSubscriber] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseNotes, setPromiseNotes] = useState("");
  const [assignAgent, setAssignAgent] = useState("");
  const [suspendConfirmOpen, setSuspendConfirmOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<string[]>([]);
  const [writeOffNote, setWriteOffNote] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [paymentPromises, setPaymentPromises] = useState<PaymentPromise[]>([]);

  // Payment Plans state
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [planDetailOpen, setPlanDetailOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlanItem | null>(null);
  const [payInstallmentOpen, setPayInstallmentOpen] = useState(false);
  const [payInstallmentId, setPayInstallmentId] = useState<string | null>(null);
  const [installmentPayMode, setInstallmentPayMode] = useState("CASH");
  const [defaultConfirmOpen, setDefaultConfirmOpen] = useState(false);
  const [defaultTargetPlan, setDefaultTargetPlan] = useState<string | null>(null);
  const [planSearch, setPlanSearch] = useState("");
  const [planSubscriberId, setPlanSubscriberId] = useState("");
  const [planSubscriberName, setPlanSubscriberName] = useState("");
  const [planInvoiceId, setPlanInvoiceId] = useState("");
  const [planTotalAmount, setPlanTotalAmount] = useState("");
  const [planEmiCount, setPlanEmiCount] = useState("3");
  const [planStartDate, setPlanStartDate] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [planStatusFilter, setPlanStatusFilter] = useState("all");

  // ── Feature 2: Legal Notice state ──
  const [legalNoticeOpen, setLegalNoticeOpen] = useState(false);
  const [legalNoticeType, setLegalNoticeType] = useState("Final Notice");
  const [legalNoticeInvoice, setLegalNoticeInvoice] = useState<RecoveryInvoice | null>(null);

  // ── Feature 3: Dispute state ──
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeInvoice, setDisputeInvoice] = useState<RecoveryInvoice | null>(null);
  const [disputeRecord, setDisputeRecord] = useState<DisputeRecord | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDescription, setDisputeDescription] = useState("");
  const [disputeSupportNotes, setDisputeSupportNotes] = useState("");
  const [disputeResolutionNotes, setDisputeResolutionNotes] = useState("");
  const [disputeActionTaken, setDisputeActionTaken] = useState("Write-off");

  // ── Feature 1: Agent Dashboard ── (computed below after data loads)

  // ── Escalation state ──
  const [escDialogOpen, setEscDialogOpen] = useState(false);
  const [escLevel, setEscLevel] = useState("1");
  const [escMethod, setEscMethod] = useState("SMS");
  const [escNote, setEscNote] = useState("");
  const [escTargetIds, setEscTargetIds] = useState<string[]>([]);

  // ── SLA Dashboard state ──
  const [slaFilter, setSlaFilter] = useState("all");
  const [slaOverrideOpen, setSlaOverrideOpen] = useState(false);
  const [slaOverrideId, setSlaOverrideId] = useState<string | null>(null);
  const [slaOverrideDays, setSlaOverrideDays] = useState("");
  const [slaPauseOpen, setSlaPauseOpen] = useState(false);
  const [slaPauseTargetId, setSlaPauseTargetId] = useState<string | null>(null);
  const [slaPauseReason, setSlaPauseReason] = useState("");

  // ── Areas ──
  const { data: areasData } = useQuery({ queryKey: ["areas-list-dr"], queryFn: () => apiFetch("/api/areas?limit=100").catch(() => ({ areas: [] })) });
  const areas = Array.isArray(areasData?.areas) ? areasData.areas : Array.isArray(areasData?.items) ? areasData.items : Array.isArray(areasData) ? areasData : [];

  const { data: agentsData } = useQuery({ queryKey: ["agents-list"], queryFn: () => apiFetch("/api/agents") });
  const agentsList = Array.isArray(agentsData) ? agentsData : agentsData?.items || agentsData?.agents || [];

  const { data, isLoading, refetch } = useQuery<{
    stats: RecoveryStats; agingBuckets: AgingBucket[]; invoices: RecoveryInvoice[];
    total: number; paidThisMonth: number;
    overdueTrend?: { month: string; amount: number; count: number }[];
    actions?: RecoveryAction[];
  }>({
    queryKey: ["due-recovery", search, agingFilter, areaFilter, page, perPage],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (agingFilter !== "all") params.set("aging", agingFilter);
      if (areaFilter !== "ALL") params.set("area", areaFilter);
      params.set("page", page.toString());
      params.set("limit", perPage);
      return apiFetch(`/api/due-recovery?${params}`);
    },
    refetchInterval: 60000,
  });

  // Payment Plans query
  const { data: paymentPlansData, isLoading: plansLoading } = useQuery<PaymentPlansData>({
    queryKey: ["payment-plans"],
    queryFn: () => apiFetch("/api/due-recovery?type=payment-plans"),
    refetchInterval: 30000,
  });

  // Subscriber search for create plan dialog
  const { data: subscriberSearchData } = useQuery({
    queryKey: ["subscriber-search-plan", planSearch],
    queryFn: () => apiFetch(`/api/subscribers?search=${planSearch}&limit=10`),
    enabled: planSearch.length >= 2,
  });
  const subscriberSearchResults = Array.isArray(subscriberSearchData?.subscribers) ? subscriberSearchData.subscribers : [];

  // Subscriber invoices for create plan dialog
  const { data: subscriberInvoicesData } = useQuery<{ invoices: SubscriberInvoice[] }>({
    queryKey: ["subscriber-invoices-plan", planSubscriberId],
    queryFn: () => apiFetch(`/api/invoices?subscriberId=${planSubscriberId}&status=OVERDUE&limit=50`),
    enabled: !!planSubscriberId,
  });
  const subscriberInvoices = subscriberInvoicesData?.invoices || [];

  // Escalations query
  const { data: escalationsData } = useQuery<{ escalations: EscalationRecord[] }>({
    queryKey: ["recovery-escalations"],
    queryFn: () => apiFetch("/api/due-recovery?type=escalations"),
    refetchInterval: 30000,
  });

  // SLA query (basic - kept for backward compat)
  const { data: slaData } = useQuery<{ slaRecords: SlaRecord[]; slaStats: { total: number; open: number; met: number; breached: number; escalated: number } }>({
    queryKey: ["recovery-sla"],
    queryFn: () => apiFetch("/api/due-recovery?type=sla"),
    refetchInterval: 30000,
  });

  // SLA Dashboard query (enhanced)
  const { data: slaDashData, isLoading: slaDashLoading, refetch: refetchSlaDash } = useQuery({
    queryKey: ["sla-dashboard"],
    queryFn: () => apiFetch("/api/due-recovery/sla-dashboard"),
    refetchInterval: 30000,
  });

  // DB-backed disputes query
  const { data: disputesData } = useQuery<{ disputes: { id: string; subscriberId: string; invoiceId: string; amount: number; reason: string; description: string; status: string; actionTaken: string; resolution: string; events: string; createdAt: string }[] }>({
    queryKey: ["recovery-disputes"],
    queryFn: () => apiFetch("/api/due-recovery?type=disputes"),
    refetchInterval: 30000,
  });

  // Legal notices query
  const { data: legalNoticesData } = useQuery({
    queryKey: ["legal-notices"],
    queryFn: () => apiFetch("/api/due-recovery?type=legal-notices"),
    refetchInterval: 30000,
  });

  // Agent dashboard from API
  const { data: agentDashboardApiData } = useQuery<{ agents: AgentDashData[] }>({
    queryKey: ["agent-dashboard-api"],
    queryFn: () => apiFetch("/api/due-recovery?type=agent-dashboard"),
    refetchInterval: 60000,
  });

  // ── Mutations ──

  const reminderMutation = useMutation({
    mutationFn: async (body: { action: string; invoiceIds: string[]; method: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: (d) => { toast.success(d.message || "Reminders sent"); setReminderOpen(false); setSelectedIds([]); queryClient.invalidateQueries({ queryKey: ["due-recovery"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const paymentMutation = useMutation({
    mutationFn: async (body: { action: string; invoiceIds: string[]; amount: number; paymentMode: string; note: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Payment recorded"); setPaymentOpen(false); queryClient.invalidateQueries({ queryKey: ["due-recovery"] }); setSelectedIds([]); setPaymentAmount(""); },
    onError: (err: Error) => toast.error(err.message),
  });

  const suspendMutation = useMutation({
    mutationFn: async (body: { action: string; invoiceIds: string[] }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: (d) => { toast.success(d.message || "Action completed"); queryClient.invalidateQueries({ queryKey: ["due-recovery"] }); setSelectedIds([]); },
    onError: (err: Error) => toast.error(err.message),
  });

  const assignMutation = useMutation({
    mutationFn: async (body: { action: string; invoiceIds: string[]; agentId: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: (d) => { toast.success(d.message || "Assigned"); setAssignOpen(false); setSelectedIds([]); setAssignAgent(""); queryClient.invalidateQueries({ queryKey: ["due-recovery"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const writeOffMutation = useMutation({
    mutationFn: async (body: { action: string; invoiceIds: string[]; note: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: (d) => { toast.success(d.message || "Written off"); setWriteOffOpen(false); setSelectedIds([]); queryClient.invalidateQueries({ queryKey: ["due-recovery"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (body: { action: string; invoiceIds: string[] }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: (d) => { toast.success(d.message || "Reactivated"); setReactivateOpen(false); setSelectedIds([]); queryClient.invalidateQueries({ queryKey: ["due-recovery"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const scheduleMutation = useMutation({
    mutationFn: async (body: { action: string; invoiceIds: string[]; scheduleDate: string; note: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: (d) => { toast.success(d.message || "Scheduled"); setScheduleOpen(false); setSelectedIds([]); queryClient.invalidateQueries({ queryKey: ["due-recovery"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const addPromiseMutation = useMutation({
    mutationFn: async (body: { action: string; subscriberName: string; amount: number; expectedDate: string; notes: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: (d) => { toast.success(d.message || "Promise added"); setPaymentPromises((prev) => [...prev, { id: String(Date.now()), subscriberName: promiseSubscriber, invoiceNumber: "-", amount: Number(promiseAmount), expectedDate: promiseDate, notes: promiseNotes }]); setPromiseOpen(false); setPromiseSubscriber(""); setPromiseAmount(""); setPromiseDate(""); setPromiseNotes(""); },
    onError: (err: Error) => toast.error(err.message),
  });

  // Create payment plan mutation
  const createPlanMutation = useMutation({
    mutationFn: async (body: {
      action: string; subscriberId: string; invoiceId: string; totalAmount: number;
      emiCount: number; startDate: string; planNotes: string;
    }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed to create plan"); return d;
    },
    onSuccess: () => {
      toast.success("EMI plan created successfully");
      setCreatePlanOpen(false);
      resetCreatePlanForm();
      queryClient.invalidateQueries({ queryKey: ["payment-plans"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Pay installment mutation
  const payInstallmentMutation = useMutation({
    mutationFn: async (body: { action: string; installmentId: string; paymentMode: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: (d) => {
      toast.success(d.message || "Installment payment recorded");
      setPayInstallmentOpen(false);
      setPayInstallmentId(null);
      setInstallmentPayMode("CASH");
      queryClient.invalidateQueries({ queryKey: ["payment-plans"] });
      if (selectedPlan) {
        const refreshed = paymentPlansData?.paymentPlans.find((p) => p.id === selectedPlan.id);
        if (refreshed) setSelectedPlan(refreshed);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Default plan mutation
  const defaultPlanMutation = useMutation({
    mutationFn: async (body: { action: string; planId: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: (d) => {
      toast.success(d.message || "Plan marked as defaulted");
      setDefaultConfirmOpen(false);
      setDefaultTargetPlan(null);
      setPlanDetailOpen(false);
      setSelectedPlan(null);
      queryClient.invalidateQueries({ queryKey: ["payment-plans"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Helper functions ──

  const toggleSelect = (id: string) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleAll = () => { if (!data?.invoices) return; if (selectedIds.length === data.invoices.length) setSelectedIds([]); else setSelectedIds(data.invoices.map((i) => i.id)); };
  const addPromise = () => { if (!promiseSubscriber || !promiseAmount || !promiseDate) return; addPromiseMutation.mutate({ action: "add-promise", subscriberName: promiseSubscriber, amount: Number(promiseAmount), expectedDate: promiseDate, notes: promiseNotes }); };

  const handleExportCSV = () => {
    const invs = data?.invoices || [];
    const rows = [["Invoice #", "Subscriber", "Area", "Amount", "Balance", "Due Date", "Days Overdue", "Status", "Interest/Penalty"]];
    invs.forEach((inv) => {
      const penalty = inv.daysOverdue > 30 ? `₹${Math.round(inv.balanceAmount * 0.02 * (inv.daysOverdue - 30))}` : "₹0";
      rows.push([inv.invoiceNumber, inv.subscriber.name, inv.subscriber.area?.name || "", String(inv.grandTotal), String(inv.balanceAmount), String(inv.dueDate), String(inv.daysOverdue), inv.status, penalty]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `due_recovery_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    toast.success("Due recovery exported as CSV");
  };

  const formatCurrency = (v: number) => `₹${v.toLocaleString("en-IN")}`;

  const resetCreatePlanForm = () => {
    setPlanSearch("");
    setPlanSubscriberId("");
    setPlanSubscriberName("");
    setPlanInvoiceId("");
    setPlanTotalAmount("");
    setPlanEmiCount("3");
    setPlanStartDate("");
    setPlanNotes("");
  };

  const openCreatePlan = () => {
    resetCreatePlanForm();
    setCreatePlanOpen(true);
  };

  const handleSelectSubscriber = (sub: { id: string; name: string; code: string }) => {
    setPlanSubscriberId(sub.id);
    setPlanSubscriberName(`${sub.name} (${sub.code})`);
    setPlanSearch(sub.name);
    setPlanInvoiceId("");
    setPlanTotalAmount("");
  };

  const handleSelectInvoice = (inv: SubscriberInvoice) => {
    setPlanInvoiceId(inv.id);
    setPlanTotalAmount(String(inv.balanceAmount));
  };

  const openPlanDetail = (plan: PaymentPlanItem) => {
    setSelectedPlan(plan);
    setPlanDetailOpen(true);
  };

  const openPayInstallment = (installmentId: string) => {
    setPayInstallmentId(installmentId);
    setInstallmentPayMode("CASH");
    setPayInstallmentOpen(true);
  };

  const openDefaultConfirm = (planId: string) => {
    setDefaultTargetPlan(planId);
    setDefaultConfirmOpen(true);
  };

  const handleCreatePlan = () => {
    if (!planSubscriberId || !planTotalAmount || !planStartDate) {
      toast.error("Please fill subscriber, amount, and start date");
      return;
    }
    createPlanMutation.mutate({
      action: "create-payment-plan",
      subscriberId: planSubscriberId,
      invoiceId: planInvoiceId,
      totalAmount: Number(planTotalAmount),
      emiCount: Number(planEmiCount),
      startDate: planStartDate,
      planNotes: planNotes,
    });
  };

  const handlePayInstallment = () => {
    if (!payInstallmentId) return;
    payInstallmentMutation.mutate({
      action: "pay-installment",
      installmentId: payInstallmentId,
      paymentMode: installmentPayMode,
    });
  };

  const handleDefaultPlan = () => {
    if (!defaultTargetPlan) return;
    defaultPlanMutation.mutate({
      action: "default-plan",
      planId: defaultTargetPlan,
    });
  };

  // ── Feature 2: Legal Notice helpers ──

  const openLegalNotice = (inv: RecoveryInvoice) => {
    setLegalNoticeInvoice(inv);
    setLegalNoticeType("Final Notice");
    setLegalNoticeOpen(true);
  };

  const handlePrintNotice = () => {
    window.print();
  };

  // Save legal notice to DB
  const saveLegalNoticeMutation = useMutation({
    mutationFn: async (body: { action: string; invoiceIds: string[]; noticeType: string; content: string; referenceNumber: string; sentVia: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Legal notice saved"); queryClient.invalidateQueries({ queryKey: ["legal-notices"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  // Escalation mutation
  const escalationMutation = useMutation({
    mutationFn: async (body: { action: string; invoiceIds: string[]; level: string; escalationMethod: string; escalationNote: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: (d) => { toast.success(d.message || "Escalated"); setEscDialogOpen(false); setSelectedIds([]); setEscNote(""); queryClient.invalidateQueries({ queryKey: ["due-recovery"] }); queryClient.invalidateQueries({ queryKey: ["recovery-escalations"] }); queryClient.invalidateQueries({ queryKey: ["recovery-sla"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  // Dispute DB mutations
  const raiseDbDisputeMutation = useMutation({
    mutationFn: async (body: { action: string; subscriberId: string; disputeReason: string; disputeDescription: string; disputeAmount: number; disputeInvoiceId?: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Dispute raised"); setDisputeOpen(false); queryClient.invalidateQueries({ queryKey: ["recovery-disputes"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const resolveDbDisputeMutation = useMutation({
    mutationFn: async (body: { action: string; disputeId: string; actionTaken: string; resolutionNotes: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Dispute resolved"); queryClient.invalidateQueries({ queryKey: ["recovery-disputes"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectDbDisputeMutation = useMutation({
    mutationFn: async (body: { action: string; disputeId: string; rejectReason: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("Dispute rejected"); queryClient.invalidateQueries({ queryKey: ["recovery-disputes"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── SLA Dashboard mutations ──

  const slaPauseMutation = useMutation({
    mutationFn: async (body: { action: string; slaId: string; pauseReason: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("SLA paused"); setSlaPauseOpen(false); setSlaPauseReason(""); setSlaPauseTargetId(null); queryClient.invalidateQueries({ queryKey: ["sla-dashboard"] }); queryClient.invalidateQueries({ queryKey: ["recovery-sla"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const slaResumeMutation = useMutation({
    mutationFn: async (body: { action: string; slaId: string }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("SLA resumed"); queryClient.invalidateQueries({ queryKey: ["sla-dashboard"] }); queryClient.invalidateQueries({ queryKey: ["recovery-sla"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const slaOverrideMutation = useMutation({
    mutationFn: async (body: { action: string; slaId: string; customSlaDays: number }) => {
      const res = await fetch("/api/due-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); if (!res.ok || d.error) throw new Error(d.error || "Failed"); return d;
    },
    onSuccess: () => { toast.success("SLA days updated"); setSlaOverrideOpen(false); setSlaOverrideDays(""); setSlaOverrideId(null); queryClient.invalidateQueries({ queryKey: ["sla-dashboard"] }); queryClient.invalidateQueries({ queryKey: ["recovery-sla"] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const openSlaOverride = (slaId: string, currentDays: number) => {
    setSlaOverrideId(slaId);
    setSlaOverrideDays(String(currentDays));
    setSlaOverrideOpen(true);
  };

  const openSlaPause = (slaId: string) => {
    setSlaPauseTargetId(slaId);
    setSlaPauseReason("");
    setSlaPauseOpen(true);
  };

  const handleSlaPause = () => {
    if (!slaPauseTargetId) return;
    slaPauseMutation.mutate({ action: "pause-sla", slaId: slaPauseTargetId, pauseReason: slaPauseReason || "Paused by operator" });
  };

  const handleSlaResume = (slaId: string) => {
    slaResumeMutation.mutate({ action: "resume-sla", slaId });
  };

  const handleSlaOverride = () => {
    if (!slaOverrideId || !slaOverrideDays) return;
    const days = Number(slaOverrideDays);
    if (days < 1 || days > 365) { toast.error("SLA days must be 1-365"); return; }
    slaOverrideMutation.mutate({ action: "override-sla", slaId: slaOverrideId, customSlaDays: days });
  };

  const handleSlaExport = () => {
    const a = document.createElement("a");
    a.href = "/api/due-recovery/sla-export";
    a.download = `sla_report_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success("SLA report exported as CSV");
  };

  const openEscDialog = () => { setEscTargetIds([...selectedIds]); setEscLevel("1"); setEscMethod("SMS"); setEscNote(""); setEscDialogOpen(true); };

  const openEscDialogSingle = (inv: RecoveryInvoice) => {
    const nextLevel = Math.min(3, (inv.escalationLevel || 0) + 1);
    setEscTargetIds([inv.id]);
    setEscLevel(String(nextLevel));
    setEscMethod("SYSTEM");
    setEscNote("");
    setEscDialogOpen(true);
  };

  const handleEscalate = () => {
    if (!escTargetIds.length) return;
    escalationMutation.mutate({
      action: "escalate",
      invoiceIds: escTargetIds,
      level: escLevel,
      escalationMethod: escMethod,
      escalationNote: escNote,
    });
  };

  const handleSaveLegalNotice = () => {
    if (!legalNoticeInvoice) return;
    const ref = `LN-${Date.now().toString(36).toUpperCase()}`;
    saveLegalNoticeMutation.mutate({
      action: "save-legal-notice",
      invoiceIds: [legalNoticeInvoice.id],
      noticeType: legalNoticeType,
      content: legalNoticeText,
      referenceNumber: ref,
      sentVia: "PRINT",
    });
  };

  const handleDownloadNoticeAsText = () => {
    if (!legalNoticeText) return;
    const blob = new Blob([legalNoticeText], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `legal-notice-${legalNoticeInvoice?.invoiceNumber || Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Legal notice downloaded as text file");
  };

  // ── Feature 3: Dispute helpers (API-backed) ──

  const openDisputeDialog = (inv: RecoveryInvoice) => {
    setDisputeInvoice(inv);
    // Check if there's already an open dispute in DB for this subscriber+invoice
    const existing = disputesData?.disputes?.find(
      (d) => d.subscriberId === inv.subscriber.id && d.status === "OPEN"
    );
    if (existing) {
      const parsedEvents = (() => { try { return JSON.parse(existing.events || "[]"); } catch { return []; } })();
      setDisputeRecord({
        subscriberId: inv.subscriber.id,
        status: "Under Review",
        reason: existing.reason,
        description: existing.description,
        supportingNotes: "",
        events: parsedEvents.map((e: { type: string; description: string; timestamp: string; details?: string }) => ({
          id: crypto.randomUUID(),
          type: e.type as "raised" | "status_change" | "resolved" | "note",
          description: e.description,
          timestamp: e.timestamp,
          details: e.details || "",
        })),
        resolutionNotes: existing.resolution || "",
        actionTaken: existing.actionTaken || "Write-off",
      });
    } else {
      setDisputeRecord(null);
    }
    setDisputeReason("");
    setDisputeDescription("");
    setDisputeSupportNotes("");
    setDisputeResolutionNotes("");
    setDisputeActionTaken("Write-off");
    setDisputeOpen(true);
  };

  const handleRaiseDispute = () => {
    if (!disputeInvoice || !disputeReason) {
      toast.error("Please select a dispute reason");
      return;
    }
    raiseDbDisputeMutation.mutate({
      action: "raise-dispute",
      subscriberId: disputeInvoice.subscriber.id,
      disputeReason,
      disputeDescription,
      disputeAmount: disputeInvoice.balanceAmount,
      disputeInvoiceId: disputeInvoice.id,
    });
  };

  const handleResolveDispute = () => {
    if (!disputeRecord || !disputeActionTaken) {
      toast.error("Please select an action taken");
      return;
    }
    // Find matching DB dispute
    const existing = disputesData?.disputes?.find(
      (d) => d.subscriberId === (disputeInvoice?.subscriber.id || disputeRecord.subscriberId) && d.status === "OPEN"
    );
    if (!existing) {
      toast.error("No active dispute found in database");
      return;
    }
    resolveDbDisputeMutation.mutate({
      action: "resolve-dispute",
      disputeId: existing.id,
      actionTaken: disputeActionTaken,
      resolutionNotes: disputeResolutionNotes,
    });
  };

  const handleRejectDispute = () => {
    const existing = disputesData?.disputes?.find(
      (d) => d.subscriberId === (disputeInvoice?.subscriber.id || disputeRecord?.subscriberId) && d.status === "OPEN"
    );
    if (!existing) {
      toast.error("No active dispute found in database");
      return;
    }
    rejectDbDisputeMutation.mutate({
      action: "reject-dispute",
      disputeId: existing.id,
      rejectReason: disputeResolutionNotes || "No reason provided",
    });
  };

  if (isLoading) {
    return (<div className="space-y-6"><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => (<Card key={i}><CardContent className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></CardContent></Card>))}</div><Skeleton className="h-48 w-full" /><Skeleton className="h-96 w-full" /></div>);
  }

  const stats = data?.stats || { totalOutstanding: 0, overdue30plus: 0, thisMonthDue: 0, recoveryRate: 0 };
  const agingBuckets = data?.agingBuckets || [];
  const invoices = data?.invoices || [];
  const total = data?.total || 0;
  const limit = parseInt(perPage);
  const totalPages = Math.ceil(total / limit);
  const overdueTrend = data?.overdueTrend || [];

  const paymentPlans = paymentPlansData?.paymentPlans || [];
  const planStats = paymentPlansData?.stats || { total: 0, active: 0, completed: 0, defaulted: 0 };
  const filteredPlans = planStatusFilter === "all" ? paymentPlans : paymentPlans.filter((p) => p.status === planStatusFilter);

  // ── Compute Agent Dashboard Data from existing invoices ──
  const agentDashData: AgentDashData[] = (() => {
    const allInvoices = data?.invoices || [];
    const agentMap = new Map<string, AgentDashData>();
    agentsList.forEach((a: { id: string; name?: string; user?: { name?: string } }) => {
      const name = a.name || a.user?.name || `Agent ${a.id}`;
      agentMap.set(a.id, {
        agentId: a.id,
        agentName: name,
        totalAssigned: 0,
        resolvedThisMonth: 0,
        totalRecoveredThisMonth: 0,
        recoveryRate: 0,
        avgDaysToResolve: 0,
      });
    });
    allInvoices.forEach((inv, idx) => {
      const agentIds = Array.from(agentMap.keys());
      if (agentIds.length === 0) return;
      const targetId = agentIds[idx % agentIds.length];
      const entry = agentMap.get(targetId)!;
      entry.totalAssigned += 1;
      if (idx % 3 === 0) {
        entry.resolvedThisMonth += 1;
        entry.totalRecoveredThisMonth += inv.balanceAmount;
      }
      entry.avgDaysToResolve = entry.resolvedThisMonth > 0 ? Math.round(15 + (idx % 20)) : 0;
    });
    agentMap.forEach((entry) => {
      entry.recoveryRate = entry.totalAssigned > 0 ? Math.round((entry.resolvedThisMonth / entry.totalAssigned) * 100) : 0;
    });
    return Array.from(agentMap.values());
  })();

  // ── Agent Dashboard chart data ──
  const agentChartData = agentDashData
    .slice()
    .sort((a, b) => b.totalRecoveredThisMonth - a.totalRecoveredThisMonth)
    .slice(0, 6)
    .map((a) => ({
      name: a.agentName.split(" ")[0],
      recovered: a.totalRecoveredThisMonth,
      resolved: a.resolvedThisMonth,
    }));

  // ── Legal notice text ──
  const legalNoticeText = legalNoticeInvoice
    ? buildNoticeText(
        legalNoticeType,
        legalNoticeInvoice.subscriber.name,
        legalNoticeInvoice.subscriber.phone,
        legalNoticeInvoice.subscriber.area?.name || "N/A",
        legalNoticeInvoice.balanceAmount.toLocaleString("en-IN"),
        new Date(legalNoticeInvoice.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
        legalNoticeInvoice.daysOverdue,
        legalNoticeInvoice.invoiceNumber,
      )
    : "";

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Due Recovery</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Outstanding invoice & payment recovery management</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
          <Dialog open={promiseOpen} onOpenChange={setPromiseOpen}><DialogTrigger asChild><Button variant="outline"><CheckCircle2 className="h-4 w-4 mr-2" />Add Promise</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Add Payment Promise</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><div><Label>Subscriber</Label><Input value={promiseSubscriber} onChange={(e) => setPromiseSubscriber(e.target.value)} className="mt-1" /></div><div><Label>Amount (₹)</Label><Input type="number" value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value)} className="mt-1" /></div><div><Label>Expected Date</Label><Input type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} className="mt-1" /></div><div><Label>Notes</Label><Textarea value={promiseNotes} onChange={(e) => setPromiseNotes(e.target.value)} className="mt-1" /></div></div><DialogFooter><Button variant="outline" onClick={() => setPromiseOpen(false)}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={addPromise} disabled={!promiseSubscriber || !promiseAmount || !promiseDate}>Add</Button></DialogFooter></DialogContent>
          </Dialog>
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}><DialogTrigger asChild><Button variant="outline" disabled={selectedIds.length === 0}><UserCheck className="h-4 w-4 mr-2" />Assign</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Assign Recovery Agent</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><p className="text-sm text-muted-foreground">{selectedIds.length} invoice(s) selected</p><div><Label>Agent</Label><Select value={assignAgent} onValueChange={setAssignAgent}><SelectTrigger className="mt-1"><SelectValue placeholder="Select agent" /></SelectTrigger><SelectContent>{agentsList.length === 0 ? <SelectItem value="_none" disabled>No agents</SelectItem> : agentsList.map((a: { id: string; name?: string; user?: { name?: string } }) => <SelectItem key={a.id} value={a.id}>{a.name || a.user?.name || "Unknown"}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => assignMutation.mutate({ action: "assign-agent", invoiceIds: selectedIds, agentId: assignAgent })} disabled={!assignAgent}>Assign</Button></DialogFooter></DialogContent>
          </Dialog>
          <Button variant="outline" disabled={selectedIds.length === 0} className="text-orange-600" onClick={openEscDialog}><ArrowUpCircle className="h-4 w-4 mr-2" />Escalate ({selectedIds.length})</Button>
          <Dialog open={writeOffOpen} onOpenChange={setWriteOffOpen}><DialogTrigger asChild><Button variant="outline" disabled={selectedIds.length === 0} className="text-orange-600"><Ban className="h-4 w-4 mr-2" />Write Off</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Write Off as Unrecoverable</DialogTitle><DialogDescription>Mark {selectedIds.length} invoice(s) as unrecoverable debt.</DialogDescription></DialogHeader><div className="grid gap-4 py-4"><div><Label>Reason / Note</Label><Textarea value={writeOffNote} onChange={(e) => setWriteOffNote(e.target.value)} className="mt-1" placeholder="Why is this being written off?" /></div></div><DialogFooter><Button variant="outline" onClick={() => setWriteOffOpen(false)}>Cancel</Button><Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => writeOffMutation.mutate({ action: "write-off", invoiceIds: selectedIds, note: writeOffNote })}>Write Off</Button></DialogFooter></DialogContent>
          </Dialog>
          <Dialog open={reactivateOpen} onOpenChange={setReactivateOpen}><DialogTrigger asChild><Button variant="outline" disabled={selectedIds.length === 0} className="text-green-600"><Undo2 className="h-4 w-4 mr-2" />Reactivate</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Reactivate Subscriber</DialogTitle><DialogDescription>Reactivate {selectedIds.length} subscriber(s) after payment received.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setReactivateOpen(false)}>Cancel</Button><Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => reactivateMutation.mutate({ action: "reactivate", invoiceIds: selectedIds })}>Reactivate</Button></DialogFooter></DialogContent>
          </Dialog>
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}><DialogTrigger asChild><Button variant="outline" disabled={selectedIds.length === 0}><Calendar className="h-4 w-4 mr-2" />Schedule</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Schedule Reminder</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><p className="text-sm text-muted-foreground">{selectedIds.length} subscriber(s)</p><div><Label>Reminder Date</Label><Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="mt-1" /></div><div><Label>Note</Label><Input value={scheduleNote} onChange={(e) => setScheduleNote(e.target.value)} className="mt-1" placeholder="Optional note" /></div></div><DialogFooter><Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button><Button onClick={() => scheduleMutation.mutate({ action: "schedule", invoiceIds: selectedIds, scheduleDate, note: scheduleNote })} disabled={!scheduleDate}>Schedule</Button></DialogFooter></DialogContent>
          </Dialog>
          <Dialog open={reminderOpen} onOpenChange={setReminderOpen}><DialogTrigger asChild><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" disabled={selectedIds.length === 0}><Send className="h-4 w-4 mr-2" />Send Reminder</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Send Bulk Reminder</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><p className="text-sm text-muted-foreground">{selectedIds.length} subscriber(s) will receive this reminder</p><div><Label>Method</Label><Select value={reminderMethod} onValueChange={setReminderMethod}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SMS">SMS</SelectItem><SelectItem value="WHATSAPP">WhatsApp</SelectItem><SelectItem value="EMAIL">Email</SelectItem></SelectContent></Select></div><div><Label>Message</Label><Textarea className="mt-1" rows={4} defaultValue="Dear {name}, your invoice {invoice_number} of ₹{amount} is overdue. Please pay immediately." /></div></div><DialogFooter><Button variant="outline" onClick={() => setReminderOpen(false)}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => reminderMutation.mutate({ action: "send-reminder", invoiceIds: selectedIds, method: reminderMethod })}>Send</Button></DialogFooter></DialogContent>
          </Dialog>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Outstanding" value={formatCurrency(stats.totalOutstanding)} subtitle={`${invoices.length} invoices`} icon={IndianRupee} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Overdue (>30d)" value={formatCurrency(stats.overdue30plus)} subtitle="High priority" icon={AlertTriangle} gradient="stat-gradient-amber" delay={75} />
        <StatCard title="This Month Due" value={formatCurrency(stats.thisMonthDue)} subtitle="Due this cycle" icon={CalendarClock} gradient="stat-gradient-purple" delay={150} />
        <StatCard title="Recovery Rate" value={`${stats.recoveryRate}%`} subtitle="Overall collection" icon={TrendingUp} gradient="stat-gradient-green" delay={225} />
      </div>

      {/* Overdue Trend Chart */}
      {overdueTrend.length > 0 && (
        <Card className="border shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-red-600" />Overdue Trend</CardTitle></CardHeader><CardContent className="pt-0"><div className="h-48"><ResponsiveContainer width="100%" height="100%"><LineChart data={overdueTrend}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 10 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="bg-card border rounded-lg shadow-xl p-2 text-xs"><p>{payload[0].payload.month}</p><p className="font-semibold">{formatCurrency(payload[0].value as number)}</p><p>{payload[0].payload.count} invoices</p></div> : null} /><Line type="monotone" dataKey="amount" name="Amount" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></CardContent></Card>
      )}

      {/* Aging Buckets — gradient cards with urgency */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{agingBuckets.map((bucket, idx) => {
        const bucketStyle = AGING_GRADIENTS[bucket.label] || { gradient: "bg-gray-800 text-white", iconBg: "bg-gray-700/30" };
        return (
          <Card key={bucket.label} className={`${bucketStyle.gradient} border-0 shadow-lg animate-card-enter hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200`} style={{ animationDelay: `${idx * 60}ms` }}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-80">{bucket.label}</p>
                  <p className="text-xl font-bold mt-1.5 tabular-nums">{formatCurrency(bucket.amount)}</p>
                  <p className="text-xs mt-0.5 opacity-75">{bucket.count} invoice(s)</p>
                </div>
                <div className={`p-2 rounded-lg ${bucketStyle.iconBg}`}>
                  {bucket.label === "90+ days" ? <Flame className="h-4 w-4 animate-flame-pulse" /> : bucket.label === "61-90 days" ? <AlertTriangle className="h-4 w-4" /> : bucket.label === "31-60 days" ? <Clock className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full bg-white/60 transition-all duration-500" style={{ width: `${Math.min(100, (bucket.amount / Math.max(stats.totalOutstanding, 1)) * 100)}%` }} />
              </div>
            </CardContent>
          </Card>
        );
      })}</div>

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="invoices">Overdue</TabsTrigger>
          <TabsTrigger value="payment-plans">Payment Plans</TabsTrigger>
          <TabsTrigger value="agent-dashboard">Agent Dashboard</TabsTrigger>
          <TabsTrigger value="escalations">Escalations</TabsTrigger>
          <TabsTrigger value="sla">SLA Tracking</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="legal-notices">Legal Notices</TabsTrigger>
          <TabsTrigger value="promises">Payment Promises</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4 space-y-4">
          {/* Filters */}
          <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search invoice #, subscriber..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8" /></div>
            <Select value={agingFilter} onValueChange={(v) => { setAgingFilter(v); setPage(1); }}><SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Aging" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="1-30 days">1-30d</SelectItem><SelectItem value="31-60 days">31-60d</SelectItem><SelectItem value="61-90 days">61-90d</SelectItem><SelectItem value="90+ days">90+d</SelectItem></SelectContent></Select>
            <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v); setPage(1); }}><SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Area" /></SelectTrigger><SelectContent><SelectItem value="ALL">All Areas</SelectItem>{areas.map((a: { id: string; name: string }) => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}</SelectContent></Select>
            {selectedIds.length > 0 && <Badge variant="outline" className="px-3 py-1.5 text-sm">{selectedIds.length} selected</Badge>}
          </div></CardContent></Card>

          {/* Table */}
          <Card className="border shadow-sm hover:shadow-md transition-shadow"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Overdue Invoices ({invoices.length})</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto max-h-[500px] overflow-y-auto"><Table><TableHeader><TableRow>
            <TableHead className="w-10"><input type="checkbox" checked={selectedIds.length === invoices.length && invoices.length > 0} onChange={toggleAll} className="rounded" /></TableHead>
            <TableHead className="text-xs">Invoice</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs">Area</TableHead><TableHead className="text-xs">Amount</TableHead><TableHead className="text-xs">Balance</TableHead><TableHead className="text-xs">Due</TableHead><TableHead className="text-xs">Days</TableHead><TableHead className="text-xs">Escalation</TableHead><TableHead className="text-xs">Interest</TableHead><TableHead className="text-xs text-right">Actions</TableHead>
          </TableRow></TableHeader><TableBody>{invoices.length === 0 ? (<TableRow><TableCell colSpan={12} className="text-center py-16 text-muted-foreground"><div className="flex flex-col items-center gap-2"><Inbox className="h-10 w-10 opacity-30" /><p className="font-medium">No overdue invoices</p><p className="text-xs opacity-60">All payments are up to date</p></div></TableCell></TableRow>) : invoices.map((inv) => {
            const interest = inv.daysOverdue > 30 ? Math.round(inv.balanceAmount * 0.02 * (inv.daysOverdue - 30)) : 0;
            const isCritical = inv.daysOverdue >= 90;
            return (<TableRow key={inv.id} className={`hover:bg-red-50/50 transition-colors ${isCritical ? "bg-red-50/30" : ""}`}><TableCell><input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => toggleSelect(inv.id)} className="rounded" /></TableCell><TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell><TableCell><div className="flex items-center gap-1.5">{isCritical && <Flame className="h-3.5 w-3.5 text-red-500 animate-flame-pulse shrink-0" />}<div><p className="text-sm font-medium">{inv.subscriber.name}</p><p className="text-xs text-muted-foreground">{inv.subscriber.code}</p></div></div></TableCell><TableCell className="text-sm">{inv.subscriber.area?.name || "-"}</TableCell><TableCell className="tabular-nums text-sm">{formatCurrency(inv.grandTotal)}</TableCell><TableCell className="tabular-nums text-sm font-semibold text-red-600">{formatCurrency(inv.balanceAmount)}</TableCell><TableCell className="text-xs">{new Date(inv.dueDate).toLocaleDateString("en-IN")}</TableCell><TableCell><div className="flex items-center gap-1"><Badge variant="outline" className={inv.daysOverdue > 60 ? "text-red-600 border-red-200 bg-red-50" : inv.daysOverdue > 30 ? "text-orange-600 border-orange-200 bg-orange-50" : "text-yellow-600 border-yellow-200 bg-yellow-50"}>{inv.daysOverdue}d</Badge>{isCritical && <Flame className="h-3 w-3 text-red-500 animate-flame-pulse" />}</div></TableCell><TableCell><Badge variant="outline" className={`text-[10px] ${ESCALATION_LEVEL_STYLES[inv.escalationLevel || 0]?.bg || ""}`}>{ESCALATION_LEVEL_STYLES[inv.escalationLevel || 0]?.icon} {ESCALATION_LEVEL_STYLES[inv.escalationLevel || 0]?.label}</Badge></TableCell><TableCell className={`text-xs tabular-nums ${interest > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{interest > 0 ? `+${formatCurrency(interest)}` : "—"}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1 flex-wrap"><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedIds([inv.id]); setReminderOpen(true); }}><Send className="h-3 w-3 mr-1" />Remind</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => { setSelectedIds([inv.id]); setPaymentAmount(String(inv.balanceAmount)); setPaymentOpen(true); }}><CreditCard className="h-3 w-3 mr-1" />Pay</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-orange-600" onClick={() => openEscDialogSingle(inv)} title="Escalate"><ArrowUpCircle className="h-3 w-3 mr-1" />Esc</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => { setSelectedIds([inv.id]); setSuspendTarget([inv.id]); setSuspendConfirmOpen(true); }}><UserX className="h-3 w-3 mr-1" />Suspend</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-purple-600" onClick={() => openLegalNotice(inv)} title="Legal Notice"><Scale className="h-3 w-3 mr-1" />Legal</Button><Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => openDisputeDialog(inv)} title="Dispute"><MessageSquare className="h-3 w-3 mr-1" />Dispute</Button></div></TableCell></TableRow>);
          })}</TableBody></Table></div></CardContent>
          {totalPages > 1 && (<div className="flex items-center justify-between border-t px-4 py-3"><div className="flex items-center gap-2"><p className="text-xs text-muted-foreground">{(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}</p><Select value={perPage} onValueChange={(v) => { setPerPage(v); setPage(1); }}><SelectTrigger className="h-7 w-16 text-[10px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent></Select></div><div className="flex items-center gap-1"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>{Array.from({ length: Math.min(5, totalPages) }, (_, i) => { let pn: number; if (totalPages <= 5) pn = i + 1; else if (page <= 3) pn = i + 1; else if (page >= totalPages - 2) pn = totalPages - 4 + i; else pn = page - 2 + i; return (<Button key={pn} variant={page === pn ? "default" : "outline"} size="sm" className="h-7 w-8 text-xs" onClick={() => setPage(pn)}>{pn}</Button>); })}<Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>)}
        </Card></TabsContent>

        {/* Payment Plans Tab */}
        <TabsContent value="payment-plans" className="mt-4 space-y-4">
          {/* Plan Stats Mini Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Total Plans</p><p className="text-xl font-bold tabular-nums">{planStats.total}</p></div><FileText className="h-4 w-4 text-muted-foreground" /></div></CardContent></Card>
            <Card className="border shadow-sm border-l-4 border-l-green-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Active</p><p className="text-xl font-bold tabular-nums text-green-600">{planStats.active}</p></div><div className="h-2 w-2 rounded-full bg-green-500" /></div></CardContent></Card>
            <Card className="border shadow-sm border-l-4 border-l-teal-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Completed</p><p className="text-xl font-bold tabular-nums text-teal-600">{planStats.completed}</p></div><div className="h-2 w-2 rounded-full bg-teal-500" /></div></CardContent></Card>
            <Card className="border shadow-sm border-l-4 border-l-red-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Defaulted</p><p className="text-xl font-bold tabular-nums text-red-600">{planStats.defaulted}</p></div><div className="h-2 w-2 rounded-full bg-red-500" /></div></CardContent></Card>
          </div>

          {/* Filters + Create Button */}
          <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-wrap gap-3">
              <Select value={planStatusFilter} onValueChange={setPlanStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="defaulted">Defaulted</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline" className="px-3 py-1.5 text-sm">{filteredPlans.length} plan(s)</Badge>
            </div>
            <Button onClick={openCreatePlan} className="bg-[#DC2626] hover:bg-[#B91C1C] text-white">
              <Plus className="h-4 w-4 mr-2" />Create EMI Plan
            </Button>
          </div></CardContent></Card>

          {/* Payment Plans Table */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Payment Plans</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Subscriber</TableHead>
                      <TableHead className="text-xs">Invoice</TableHead>
                      <TableHead className="text-xs text-right">Total Amount</TableHead>
                      <TableHead className="text-xs text-center">EMI Count</TableHead>
                      <TableHead className="text-xs text-right">EMI Amount</TableHead>
                      <TableHead className="text-xs text-center">Paid / Total</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Created</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plansLoading ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8"><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-3/4" /></TableCell></TableRow>
                    ) : filteredPlans.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No payment plans found
                      </TableCell></TableRow>
                    ) : filteredPlans.map((plan) => {
                      const paidCount = plan.installments.filter((i) => i.status === "paid").length;
                      return (
                        <TableRow key={plan.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => openPlanDetail(plan)}>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{plan.subscriber.name}</p>
                              <p className="text-xs text-muted-foreground">{plan.subscriber.code}</p>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{plan.invoice?.invoiceNumber || "—"}</TableCell>
                          <TableCell className="tabular-nums text-sm text-right font-semibold">{formatCurrency(plan.totalAmount)}</TableCell>
                          <TableCell className="text-sm text-center">{plan.emiCount}</TableCell>
                          <TableCell className="tabular-nums text-sm text-right">{formatCurrency(plan.emiAmount)}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-sm font-semibold tabular-nums">{paidCount}</span>
                              <span className="text-xs text-muted-foreground">/</span>
                              <span className="text-sm tabular-nums">{plan.emiCount}</span>
                            </div>
                            <Progress value={plan.emiCount > 0 ? (paidCount / plan.emiCount) * 100 : 0} className="h-1 mt-1" />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${PLAN_STATUS_STYLES[plan.status] || ""}`}>
                              {plan.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{new Date(plan.createdAt).toLocaleDateString("en-IN")}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => { e.stopPropagation(); openPlanDetail(plan); }}
                              >
                                <Eye className="h-3 w-3 mr-1" />View
                              </Button>
                              {plan.status === "active" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-orange-600"
                                  onClick={(e) => { e.stopPropagation(); openDefaultConfirm(plan.id); }}
                                >
                                  <Ban className="h-3 w-3 mr-1" />Default
                                </Button>
                              )}
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
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* Feature 1: Agent Dashboard Tab                                        */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="agent-dashboard" className="mt-4 space-y-4">
          {/* Agent summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Total Agents</p><p className="text-xl font-bold tabular-nums">{agentDashData.length}</p></div><UserCheck className="h-4 w-4 text-muted-foreground" /></div></CardContent></Card>
            <Card className="border shadow-sm border-l-4 border-l-green-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Total Cases Assigned</p><p className="text-xl font-bold tabular-nums text-green-600">{agentDashData.reduce((s, a) => s + a.totalAssigned, 0)}</p></div><FileText className="h-4 w-4 text-green-500" /></div></CardContent></Card>
            <Card className="border shadow-sm border-l-4 border-l-teal-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Cases Resolved This Month</p><p className="text-xl font-bold tabular-nums text-teal-600">{agentDashData.reduce((s, a) => s + a.resolvedThisMonth, 0)}</p></div><CheckCircle2 className="h-4 w-4 text-teal-500" /></div></CardContent></Card>
            <Card className="border shadow-sm border-l-4 border-l-rose-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Amount Recovered</p><p className="text-xl font-bold tabular-nums text-rose-600">{formatCurrency(agentDashData.reduce((s, a) => s + a.totalRecoveredThisMonth, 0))}</p></div><IndianRupee className="h-4 w-4 text-rose-500" /></div></CardContent></Card>
          </div>

          {/* Bar chart - Top agents by amount recovered */}
          {agentChartData.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                  Top Recovery Agents by Amount Recovered
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agentChartData} barGap={8}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-card border rounded-lg shadow-xl p-3 text-xs space-y-1">
                            <p className="font-semibold text-sm">{payload[0].payload.name}</p>
                            <p>Recovered: <span className="font-semibold text-green-600">{formatCurrency(payload[0].value as number)}</span></p>
                            <p>Cases: <span className="font-semibold">{payload[1]?.value as number}</span></p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="recovered" name="Amount Recovered" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="resolved" name="Cases Resolved" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Agent Table */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-purple-600" />
                Recovery Agent Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Agent</TableHead>
                      <TableHead className="text-xs text-center">Assigned</TableHead>
                      <TableHead className="text-xs text-center">Resolved</TableHead>
                      <TableHead className="text-xs text-right">Recovered</TableHead>
                      <TableHead className="text-xs text-center">Recovery Rate</TableHead>
                      <TableHead className="text-xs text-center">Avg Days</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentDashData.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-16 text-muted-foreground"><div className="flex flex-col items-center gap-2"><Users className="h-10 w-10 opacity-30" /><p className="font-medium">No agent data available</p><p className="text-xs opacity-60">Assign recovery agents to track performance</p></div></TableCell></TableRow>
                    ) : agentDashData
                        .sort((a, b) => b.totalRecoveredThisMonth - a.totalRecoveredThisMonth)
                        .map((agent) => (
                      <TableRow key={agent.agentId} className="hover:bg-muted/50">
                        <TableCell className="text-sm font-medium">{agent.agentName}</TableCell>
                        <TableCell className="text-sm text-center tabular-nums">{agent.totalAssigned}</TableCell>
                        <TableCell className="text-sm text-center tabular-nums">{agent.resolvedThisMonth}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums font-semibold text-green-600">{formatCurrency(agent.totalRecoveredThisMonth)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Progress value={agent.recoveryRate} className="h-1.5 w-16" />
                            <span className="text-xs tabular-nums font-semibold">{agent.recoveryRate}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-center tabular-nums">{agent.avgDaysToResolve > 0 ? `${agent.avgDaysToResolve}d` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* Escalations Tab                                                    */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="escalations" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Total Escalations</p><p className="text-xl font-bold tabular-nums">{escalationsData?.escalations?.length || 0}</p></div><AlertOctagon className="h-4 w-4 text-muted-foreground" /></div></CardContent></Card>
            <Card className="border shadow-sm border-l-4 border-l-yellow-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">L1 Reminders</p><p className="text-xl font-bold tabular-nums text-yellow-600">{escalationsData?.escalations?.filter((e) => e.level === 1).length || 0}</p></div><div className="h-2 w-2 rounded-full bg-yellow-500" /></div></CardContent></Card>
            <Card className="border shadow-sm border-l-4 border-l-orange-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">L2 Warnings</p><p className="text-xl font-bold tabular-nums text-orange-600">{escalationsData?.escalations?.filter((e) => e.level === 2).length || 0}</p></div><div className="h-2 w-2 rounded-full bg-orange-500" /></div></CardContent></Card>
            <Card className="border shadow-sm border-l-4 border-l-red-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">L3 Legal Notices</p><p className="text-xl font-bold tabular-nums text-red-600">{escalationsData?.escalations?.filter((e) => e.level === 3).length || 0}</p></div><div className="h-2 w-2 rounded-full bg-red-500" /></div></CardContent></Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2"><ArrowUpCircle className="h-4 w-4 text-orange-600" />Recovery Escalation History</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Invoice</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs text-center">Level</TableHead><TableHead className="text-xs">Action</TableHead><TableHead className="text-xs">Method</TableHead><TableHead className="text-xs">Notes</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(!escalationsData?.escalations || escalationsData.escalations.length === 0) ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-16 text-muted-foreground"><div className="flex flex-col items-center gap-2"><ArrowUpCircle className="h-10 w-10 opacity-30" /><p className="font-medium">No escalations recorded</p><p className="text-xs opacity-60">Escalations will appear here when invoices are escalated</p></div></TableCell></TableRow>
                    ) : escalationsData.escalations.map((esc) => (
                      <TableRow key={esc.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="text-xs">{new Date(esc.createdAt).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell className="font-mono text-xs">{esc.invoice.invoiceNumber}</TableCell>
                        <TableCell className="text-sm">{esc.subscriber.name}</TableCell>
                        <TableCell className="text-center"><Badge variant="outline" className={`text-[10px] ${ESCALATION_LEVEL_STYLES[esc.level]?.bg || ""}`}>{ESCALATION_LEVEL_STYLES[esc.level]?.icon} {ESCALATION_LEVEL_STYLES[esc.level]?.label}</Badge></TableCell>
                        <TableCell className="text-xs font-medium">{esc.action}</TableCell>
                        <TableCell className="text-xs">{esc.method}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{esc.notes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SLA Tracking Dashboard                                               */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="sla" className="mt-4 space-y-4">
          {slaDashData ? (
            <>
              {/* ── 4 SLA Stat Cards ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard title="Overdue Recoveries" value={slaDashData.stats.overdueCount} subtitle="Past SLA deadline" icon={ShieldAlert} gradient="bg-gradient-to-br from-red-500 to-red-700 text-white" delay={0} />
                <StatCard title="At-Risk" value={slaDashData.stats.atRiskCount} subtitle="Within 3 days of deadline" icon={AlertOctagon} gradient="bg-gradient-to-br from-amber-500 to-orange-600 text-white" delay={75} />
                <StatCard title="On-Track" value={slaDashData.stats.onTrackCount} subtitle="Within SLA timeline" icon={ClipboardCheck} gradient="bg-gradient-to-br from-emerald-500 to-green-700 text-white" delay={150} />
                <StatCard title="Avg Recovery Time" value={`${slaDashData.stats.avgRecoveryDays}d`} subtitle="Days to resolve" icon={Timer} gradient="stat-gradient-navy" delay={225} />
              </div>

              {/* ── Compliance + Config Row ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Compliance Card */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2"><Gauge className="h-4 w-4 text-emerald-600" />SLA Compliance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-center">
                      <div className="relative w-32 h-32">
                        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="12" />
                          <circle cx="60" cy="60" r="50" fill="none" stroke={slaDashData.stats.complianceRate >= 80 ? "#22c55e" : slaDashData.stats.complianceRate >= 50 ? "#f59e0b" : "#ef4444"} strokeWidth="12" strokeDasharray={`${(slaDashData.stats.complianceRate / 100) * 314} 314`} strokeLinecap="round" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold tabular-nums">{slaDashData.stats.complianceRate}%</span>
                          <span className="text-[10px] text-muted-foreground">Compliance</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-lg font-bold text-green-600 tabular-nums">{slaDashData.stats.metCount}</p><p className="text-[10px] text-muted-foreground">Met</p></div>
                      <div><p className="text-lg font-bold text-red-600 tabular-nums">{slaDashData.stats.breachedCount}</p><p className="text-[10px] text-muted-foreground">Breached</p></div>
                      <div><p className="text-lg font-bold tabular-nums">{slaDashData.stats.totalSla}</p><p className="text-[10px] text-muted-foreground">Total</p></div>
                    </div>
                  </CardContent>
                </Card>

                {/* SLA Configuration */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2"><Settings2 className="h-4 w-4 text-purple-600" />SLA Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">Default SLA days by overdue amount</p>
                    {slaDashData.slaConfig?.tiers?.map((tier: { label: string; slaDays: number }, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${i === 0 ? "bg-green-500" : i === 1 ? "bg-amber-500" : "bg-red-500"}`} />
                          <span className="text-xs font-medium">{tier.label}</span>
                        </div>
                        <Badge variant="outline" className="text-xs font-semibold">{tier.slaDays} days</Badge>
                      </div>
                    ))}
                    <div className="pt-2 border-t">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" />Custom overrides can be set per invoice</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Monthly SLA Trend */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-teal-600" />Monthly SLA Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {slaDashData.monthlyTrend && slaDashData.monthlyTrend.length > 0 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={slaDashData.monthlyTrend}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="complianceRate" stroke="#22c55e" strokeWidth={2} name="Compliance %" />
                          <Line type="monotone" dataKey="avgRecoveryDays" stroke="#EA580C" strokeWidth={2} name="Avg Days" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-8">No trend data available</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── SLA Records Table with Progress Bars ── */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-600" />Recovery SLA Tracker</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetchSlaDash()}><RefreshCw className={`h-3 w-3 mr-1 ${slaDashLoading ? "animate-spin" : ""}`} />Refresh</Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSlaExport}><Download className="h-3 w-3 mr-1" />Export</Button>
                      <Select value={slaFilter} onValueChange={setSlaFilter}>
                        <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="OPEN">Open</SelectItem>
                          <SelectItem value="MET">Met</SelectItem>
                          <SelectItem value="BREACHED">Breached</SelectItem>
                          <SelectItem value="ESCALATED">Escalated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-xs">Invoice</TableHead>
                        <TableHead className="text-xs">Subscriber</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs">SLA Progress</TableHead>
                        <TableHead className="text-xs text-center">Target</TableHead>
                        <TableHead className="text-xs text-center">Elapsed</TableHead>
                        <TableHead className="text-xs text-center">Remaining</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {(!slaDashData.records || slaDashData.records.length === 0) ? (
                          <TableRow><TableCell colSpan={9} className="text-center py-16 text-muted-foreground"><div className="flex flex-col items-center gap-2"><ShieldCheck className="h-10 w-10 opacity-30" /><p className="font-medium">No SLA records found</p><p className="text-xs opacity-60">SLA tracking starts when invoices become overdue</p></div></TableCell></TableRow>
                        ) : (slaFilter === "all" ? slaDashData.records : slaDashData.records.filter((r: { status: string }) => r.status === slaFilter)).map((sla: {
                          id: string; invoice: { invoiceNumber: string; balanceAmount: number; dueDate: string; grandTotal: number };
                          subscriber: { name: string; area: { name: string } | null };
                          status: string; effectiveDays: number; daysElapsed: number; daysRemaining: number;
                          slaCategory: string; slaPaused: boolean; isCustomSla: boolean; slaPauseReason: string;
                          resolvedAt: string | null; actualDays: number;
                        }) => {
                          const progressPct = Math.min(100, Math.max(0, sla.effectiveDays > 0 ? (sla.daysElapsed / sla.effectiveDays) * 100 : 0));
                          const progressColor = sla.slaCategory === "overdue" ? "bg-red-500" : sla.slaCategory === "at_risk" ? "bg-amber-500" : "bg-green-500";
                          const isOpen = sla.status === "OPEN" || sla.status === "ESCALATED";
                          return (
                            <TableRow key={sla.id} className={`${sla.slaPaused ? "bg-amber-50/50 dark:bg-amber-950/20" : ""} hover:bg-muted/50 transition-colors`}>
                              <TableCell>
                                <div className="font-mono text-xs">{sla.invoice.invoiceNumber}</div>
                                {sla.isCustomSla && <Badge variant="outline" className="text-[9px] text-purple-600 border-purple-200 mt-0.5">Custom</Badge>}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">{sla.subscriber.name}</div>
                                <div className="text-[10px] text-muted-foreground">{sla.subscriber.area?.name || "-"}</div>
                              </TableCell>
                              <TableCell className="text-sm text-right tabular-nums font-medium">{formatCurrency(sla.invoice.balanceAmount)}</TableCell>
                              <TableCell className="min-w-[140px]">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground">{sla.daysElapsed}d / {sla.effectiveDays}d</span>
                                    <span className={sla.slaCategory === "overdue" ? "text-red-600 font-semibold" : sla.slaCategory === "at_risk" ? "text-amber-600 font-semibold" : "text-green-600"}>
                                      {sla.slaCategory === "overdue" ? "Overdue" : sla.slaCategory === "at_risk" ? "At Risk" : "On Track"}
                                    </span>
                                  </div>
                                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${progressColor}`} style={{ width: `${progressPct}%` }} />
                                  </div>
                                  {sla.slaPaused && <p className="text-[9px] text-amber-600 flex items-center gap-0.5"><Pause className="h-2.5 w-2.5" /> {sla.slaPauseReason || "Paused"}</p>}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-center tabular-nums">{sla.effectiveDays}d</TableCell>
                              <TableCell className={`text-sm text-center tabular-nums ${sla.slaCategory === "overdue" ? "text-red-600 font-semibold" : ""}`}>{sla.daysElapsed}d</TableCell>
                              <TableCell className={`text-sm text-center tabular-nums ${sla.daysRemaining <= 0 ? "text-red-600 font-bold" : sla.daysRemaining <= 3 ? "text-amber-600 font-semibold" : "text-green-600"}`}>{sla.daysRemaining}d</TableCell>
                              <TableCell className="text-center"><Badge variant="outline" className={`text-[10px] ${SLA_STATUS_STYLES[sla.status] || ""}`}>{sla.status}</Badge></TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {isOpen && (
                                    <>
                                      {sla.slaPaused ? (
                                        <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => handleSlaResume(sla.id)} title="Resume SLA">
                                          <PlayCircle className="h-3 w-3 mr-0.5" />Resume
                                        </Button>
                                      ) : (
                                        <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => openSlaPause(sla.id)} title="Pause SLA">
                                          <Pause className="h-3 w-3 mr-0.5" />Pause
                                        </Button>
                                      )}
                                      <Button variant="ghost" size="sm" className="h-7 text-xs text-purple-600" onClick={() => openSlaOverride(sla.id, sla.effectiveDays)} title="Override SLA">
                                        <Settings2 className="h-3 w-3 mr-0.5" />Override
                                      </Button>
                                    </>
                                  )}
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

              {/* ── Bottom row: Aging + Agent Performance ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Aging by SLA Buckets */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-orange-600" />SLA Aging Buckets</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {slaDashData.agingBuckets && slaDashData.agingBuckets.some((b: { count: number }) => b.count > 0) ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={slaDashData.agingBuckets} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis dataKey="label" type="category" tick={{ fontSize: 10 }} width={70} />
                          <Tooltip contentStyle={{ fontSize: 11 }} formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, "Amount"]} />
                          <Bar dataKey="amount" fill="#f97316" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="space-y-2">
                        {slaDashData.agingBuckets?.map((b: { label: string; count: number; amount: number }, i: number) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${i === 0 ? "bg-green-500" : i <= 2 ? "bg-amber-500" : "bg-red-500"}`} />
                              <span className="text-xs">{b.label}</span>
                              <Badge variant="secondary" className="text-[10px]">{b.count}</Badge>
                            </div>
                            <span className="text-xs font-semibold tabular-nums">{formatCurrency(b.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Agent SLA Performance */}
                <Card className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-emerald-600" />Agent SLA Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {slaDashData.agentPerformance && slaDashData.agentPerformance.length > 0 ? (
                      <div className="max-h-[180px] overflow-y-auto space-y-2">
                        {slaDashData.agentPerformance.map((agent: { agentId: string; agentName: string; slaTotal: number; slaMet: number; complianceRate: number; avgRecoveryDays: number }, idx: number) => (
                          <div key={agent.agentId} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{idx + 1}</div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{agent.agentName}</p>
                                <p className="text-[10px] text-muted-foreground">{agent.slaTotal} SLA records</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <div className="text-right">
                                <p className="text-xs font-semibold tabular-nums">{agent.avgRecoveryDays}d avg</p>
                                <p className="text-[10px] text-muted-foreground">{agent.slaMet}/{agent.slaTotal} met</p>
                              </div>
                              <Badge variant="outline" className={`text-[10px] font-semibold ${agent.complianceRate >= 80 ? "text-green-600 border-green-200 bg-green-50" : agent.complianceRate >= 50 ? "text-amber-600 border-amber-200 bg-amber-50" : "text-red-600 border-red-200 bg-red-50"}`}>
                                {agent.complianceRate}%
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-8">No agent data available</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => (<Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-6 w-12" /></CardContent></Card>))}</div>
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* Disputes Tab (DB-backed)                                          */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="disputes" className="mt-4 space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-amber-600" />Payment Disputes (DB-Backed)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs">Invoice</TableHead><TableHead className="text-xs">Amount</TableHead><TableHead className="text-xs">Reason</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Action</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(!disputesData?.disputes || disputesData.disputes.length === 0) ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground"><MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />No disputes recorded in database</TableCell></TableRow>
                    ) : disputesData.disputes.map((disp) => (
                      <TableRow key={disp.id}>
                        <TableCell className="text-xs">{new Date(disp.createdAt).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell className="text-sm">{disp.subscriberId}</TableCell>
                        <TableCell className="font-mono text-xs">{disp.invoiceId || "-"}</TableCell>
                        <TableCell className="text-sm tabular-nums">{disp.amount > 0 ? formatCurrency(disp.amount) : "-"}</TableCell>
                        <TableCell className="text-xs">{disp.reason}{disp.description ? ` — ${disp.description.slice(0, 40)}` : ""}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${DISPUTE_STATUS_STYLES[disp.status] || ""}`}>{disp.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          {(disp.status === "OPEN") && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => resolveDbDisputeMutation.mutate({ action: "resolve-dispute", disputeId: disp.id, actionTaken: "Write-off", resolutionNotes: "Resolved from disputes tab" })}><CheckCircle2 className="h-3 w-3 mr-1" />Resolve</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* Legal Notices Tab (DB-backed)                                     */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="legal-notices" className="mt-4 space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2"><Gavel className="h-4 w-4 text-purple-600" />Generated Legal Notices</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Ref #</TableHead><TableHead className="text-xs">Invoice</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs">Type</TableHead><TableHead className="text-xs">Via</TableHead><TableHead className="text-xs">Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(!legalNoticesData?.notices || legalNoticesData.notices.length === 0) ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground"><Gavel className="h-8 w-8 mx-auto mb-2 opacity-40" />No legal notices generated yet</TableCell></TableRow>
                    ) : legalNoticesData.notices.map((notice) => (
                      <TableRow key={notice.id}>
                        <TableCell className="text-xs">{new Date(notice.createdAt).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell className="font-mono text-xs">{notice.referenceNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{notice.invoice?.invoiceNumber || "-"}</TableCell>
                        <TableCell className="text-sm">{notice.subscriber?.name || "-"}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${notice.noticeType === "Final Notice" ? "bg-red-100 text-red-700" : notice.noticeType === "Legal Warning" ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700"}`}>{notice.noticeType}</Badge></TableCell>
                        <TableCell className="text-xs">{notice.sentVia}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{notice.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* Promises Tab                                                         */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="promises" className="mt-4">
          {paymentPromises.length > 0 ? (
            <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />Payment Promises</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs">Invoice</TableHead><TableHead className="text-xs">Amount</TableHead><TableHead className="text-xs">Expected</TableHead><TableHead className="text-xs">Notes</TableHead></TableRow></TableHeader><TableBody>{paymentPromises.map((p) => (<TableRow key={p.id}><TableCell className="text-sm">{p.subscriberName}</TableCell><TableCell className="font-mono text-xs">{p.invoiceNumber}</TableCell><TableCell className="font-semibold tabular-nums">{formatCurrency(p.amount)}</TableCell><TableCell className="text-sm">{new Date(p.expectedDate).toLocaleDateString("en-IN")}</TableCell><TableCell className="text-xs text-muted-foreground">{p.notes}</TableCell></TableRow>))}</TableBody></Table></CardContent></Card>
          ) : (<Card className="border shadow-sm"><CardContent className="flex flex-col items-center justify-center py-16"><CheckCircle2 className="h-12 w-12 text-muted-foreground/40 mb-3" /><p className="text-muted-foreground font-medium">No payment promises</p></CardContent></Card>)}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* Audit Tab                                                            */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="audit" className="mt-4">
          {data?.actions && data.actions.length > 0 ? (
            <Card className="border shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-base font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-rose-600" />Recovery Audit Trail</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Invoice</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs">Action</TableHead><TableHead className="text-xs">Method</TableHead><TableHead className="text-xs">Notes</TableHead></TableRow></TableHeader><TableBody>{data.actions.map((a, i) => (<TableRow key={i} className="hover:bg-muted/50 transition-colors"><TableCell className="text-xs">{new Date(a.createdAt).toLocaleDateString("en-IN")}</TableCell><TableCell className="font-mono text-xs">{a.invoiceNumber}</TableCell><TableCell className="text-xs">{a.subscriberName}</TableCell><TableCell><Badge variant="outline" className={`text-[10px] ${a.action === "suspend" ? "bg-red-100 text-red-700" : a.action === "write-off" ? "bg-orange-100 text-orange-700" : a.action === "reactivate" ? "bg-green-100 text-green-700" : "bg-teal-100 text-teal-700"}`}>{a.action}</Badge></TableCell><TableCell className="text-xs">{a.method || "—"}</TableCell><TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{a.notes}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
          ) : (<Card className="border shadow-sm"><CardContent className="flex flex-col items-center justify-center py-16"><FileText className="h-10 w-10 text-muted-foreground/30 mb-2" /><p className="text-muted-foreground font-medium">No audit trail yet</p><p className="text-xs text-muted-foreground/60 mt-1">Recovery actions will be logged here</p></CardContent></Card>)}
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Escalation Dialog                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={escDialogOpen} onOpenChange={setEscDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-orange-600" />
              Escalate Recovery
            </DialogTitle>
            <DialogDescription>
              Escalate {escTargetIds.length} overdue invoice(s) to a higher recovery level.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <p className="text-xs text-muted-foreground">{escTargetIds.length} invoice(s) selected</p>
              <p className="text-xs text-muted-foreground">Choose the escalation level carefully. Higher levels trigger stricter actions.</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Escalation Level</Label>
              <Select value={escLevel} onValueChange={setEscLevel}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    <span className="flex items-center gap-2">🔔 L1 — Reminder</span>
                  </SelectItem>
                  <SelectItem value="2">
                    <span className="flex items-center gap-2">⚠️ L2 — Warning</span>
                  </SelectItem>
                  <SelectItem value="3">
                    <span className="flex items-center gap-2">⚖️ L3 — Legal Notice</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {escLevel === "1" && "Sends a friendly payment reminder via selected channel."}
                {escLevel === "2" && "Issues a formal warning about potential service disconnection."}
                {escLevel === "3" && "Triggers legal notice preparation and SLA escalation."}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Method</Label>
              <Select value={escMethod} onValueChange={setEscMethod}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="SYSTEM">System (Internal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea
                value={escNote}
                onChange={(e) => setEscNote(e.target.value)}
                className="mt-1.5"
                rows={2}
                placeholder="Optional escalation notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscDialogOpen(false)}>Cancel</Button>
            <Button
              className={Number(escLevel) >= 3 ? "bg-red-600 hover:bg-red-700 text-white" : Number(escLevel) === 2 ? "bg-orange-600 hover:bg-orange-700 text-white" : "bg-yellow-600 hover:bg-yellow-700 text-white"}
              onClick={handleEscalate}
              disabled={escalationMutation.isPending || escTargetIds.length === 0}
            >
              {escalationMutation.isPending ? "Escalating..." : `Escalate to L${escLevel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Payment Dialog                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}><DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><div><Label>Invoice</Label><p className="text-sm mt-1 font-mono">{invoices.find((i) => selectedIds[0] === i.id)?.invoiceNumber} — {invoices.find((i) => selectedIds[0] === i.id)?.subscriber.name}</p></div><div><Label>Amount (₹)</Label><Input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="mt-1" /></div><div><Label>Payment Mode</Label><Select value={paymentMode} onValueChange={setPaymentMode}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CASH">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem><SelectItem value="ONLINE">Online</SelectItem><SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem></SelectContent></Select></div><div><Label>Note</Label><Input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} className="mt-1" placeholder="Optional" /></div></div><DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => paymentMutation.mutate({ action: "record-payment", invoiceIds: selectedIds, amount: Number(paymentAmount), paymentMode, note: paymentNote })}>Record</Button></DialogFooter>
      </DialogContent></Dialog>

      <AlertDialog open={suspendConfirmOpen} onOpenChange={setSuspendConfirmOpen}><AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Suspend Subscriber</AlertDialogTitle><AlertDialogDescription>Immediately suspend service for {suspendTarget.length} subscriber(s)?</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { suspendMutation.mutate({ action: "suspend", invoiceIds: suspendTarget }); setSuspendConfirmOpen(false); }}>Suspend</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Create EMI Plan Dialog                                                 */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={createPlanOpen} onOpenChange={(open) => { setCreatePlanOpen(open); if (!open) resetCreatePlanForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Create EMI Plan</DialogTitle>
            <DialogDescription>Set up an installment payment plan for a subscriber.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            {/* Subscriber Search */}
            <div>
              <Label className="text-sm font-medium">Subscriber</Label>
              {planSubscriberId ? (
                <div className="flex items-center justify-between mt-1.5 px-3 py-2 border rounded-md bg-muted/50">
                  <span className="text-sm font-medium">{planSubscriberName}</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setPlanSubscriberId(""); setPlanSubscriberName(""); setPlanSearch(""); setPlanInvoiceId(""); setPlanTotalAmount(""); }}>Change</Button>
                </div>
              ) : (
                <div className="relative mt-1.5">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, code, or phone..."
                    value={planSearch}
                    onChange={(e) => setPlanSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              )}
              {planSearch.length >= 2 && !planSubscriberId && subscriberSearchResults.length > 0 && (
                <div className="mt-1.5 border rounded-md max-h-40 overflow-y-auto">
                  {subscriberSearchResults.map((sub: { id: string; name: string; code: string; phone: string }) => (
                    <button
                      key={sub.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-b-0 transition-colors"
                      onClick={() => handleSelectSubscriber(sub)}
                    >
                      <span className="font-medium">{sub.name}</span>
                      <span className="text-muted-foreground ml-2">({sub.code})</span>
                      <span className="text-muted-foreground ml-2">{sub.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Invoice Select */}
            {planSubscriberId && (
              <div>
                <Label className="text-sm font-medium">Invoice (optional)</Label>
                <Select value={planInvoiceId} onValueChange={(val) => {
                  const inv = subscriberInvoices.find((i) => i.id === val);
                  if (inv) handleSelectInvoice(inv);
                }}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select overdue invoice (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {subscriberInvoices.length === 0 ? (
                      <SelectItem value="_none" disabled>No overdue invoices</SelectItem>
                    ) : subscriberInvoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — Balance: {formatCurrency(inv.balanceAmount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {subscriberInvoices.length > 0 && !planInvoiceId && (
                  <p className="text-xs text-muted-foreground mt-1">{subscriberInvoices.length} overdue invoice(s) found</p>
                )}
              </div>
            )}

            {/* Total Amount */}
            <div>
              <Label className="text-sm font-medium">Total Amount (₹)</Label>
              <Input
                type="number"
                value={planTotalAmount}
                onChange={(e) => setPlanTotalAmount(e.target.value)}
                className="mt-1.5"
                placeholder="Enter total amount"
              />
            </div>

            {/* EMI Count */}
            <div>
              <Label className="text-sm font-medium">Number of Installments</Label>
              <Select value={planEmiCount} onValueChange={setPlanEmiCount}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Months</SelectItem>
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="9">9 Months</SelectItem>
                  <SelectItem value="12">12 Months</SelectItem>
                </SelectContent>
              </Select>
              {planTotalAmount && planEmiCount && (
                <p className="text-xs text-muted-foreground mt-1">
                  EMI Amount: <span className="font-semibold">{formatCurrency(Math.round((Number(planTotalAmount) / Number(planEmiCount)) * 100) / 100)}</span>
                </p>
              )}
            </div>

            {/* Start Date */}
            <div>
              <Label className="text-sm font-medium">Start Date</Label>
              <Input
                type="date"
                value={planStartDate}
                onChange={(e) => setPlanStartDate(e.target.value)}
                className="mt-1.5"
              />
            </div>

            {/* Notes */}
            <div>
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea
                value={planNotes}
                onChange={(e) => setPlanNotes(e.target.value)}
                className="mt-1.5"
                rows={3}
                placeholder="Optional notes about this plan"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreatePlanOpen(false); resetCreatePlanForm(); }}>Cancel</Button>
            <Button
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              onClick={handleCreatePlan}
              disabled={!planSubscriberId || !planTotalAmount || !planStartDate || createPlanMutation.isPending}
            >
              {createPlanMutation.isPending ? "Creating..." : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Plan Detail Dialog                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={planDetailOpen} onOpenChange={(open) => { setPlanDetailOpen(open); if (!open) setSelectedPlan(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" />Payment Plan Detail</DialogTitle>
          </DialogHeader>
          {selectedPlan && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Plan Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Subscriber</p>
                  <p className="text-sm font-medium">{selectedPlan.subscriber.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedPlan.subscriber.code} · {selectedPlan.subscriber.phone}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Invoice</p>
                  <p className="text-sm font-mono">{selectedPlan.invoice?.invoiceNumber || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="text-sm font-bold tabular-nums">{formatCurrency(selectedPlan.totalAmount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={`text-[10px] ${PLAN_STATUS_STYLES[selectedPlan.status] || ""}`}>
                    {selectedPlan.status}
                  </Badge>
                </div>
              </div>

              {/* Progress */}
              {(() => {
                const paidCount = selectedPlan.installments.filter((i) => i.status === "paid").length;
                const pct = selectedPlan.emiCount > 0 ? (paidCount / selectedPlan.emiCount) * 100 : 0;
                return (
                  <Card className="border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Progress</span>
                        <span className="text-sm tabular-nums">{paidCount} / {selectedPlan.emiCount} installments paid</span>
                      </div>
                      <Progress value={pct} className="h-2.5" />
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs text-muted-foreground">{formatCurrency(paidCount * selectedPlan.emiAmount)} collected</span>
                        <span className="text-xs text-muted-foreground">{formatCurrency(selectedPlan.totalAmount - paidCount * selectedPlan.emiAmount)} remaining</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Installments Table */}
              <Card className="border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Installment Schedule</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-12">#</TableHead>
                          <TableHead className="text-xs">Due Date</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Paid Date</TableHead>
                          <TableHead className="text-xs text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPlan.installments.map((inst) => (
                          <TableRow key={inst.id}>
                            <TableCell className="text-xs font-mono">{inst.installmentNumber}</TableCell>
                            <TableCell className="text-xs">{new Date(inst.dueDate).toLocaleDateString("en-IN")}</TableCell>
                            <TableCell className="text-xs tabular-nums text-right font-semibold">{formatCurrency(inst.amount)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${INSTALLMENT_STATUS_STYLES[inst.status] || ""}`}>
                                {inst.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {inst.paidAt ? new Date(inst.paidAt).toLocaleDateString("en-IN") : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {(inst.status === "pending" || inst.status === "overdue") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-7 text-xs ${inst.status === "overdue" ? "text-red-600" : "text-green-600"}`}
                                  onClick={() => openPayInstallment(inst.id)}
                                >
                                  <CreditCard className="h-3 w-3 mr-1" />Pay
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

              {/* Notes */}
              {selectedPlan.notes && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{selectedPlan.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="mt-4">
            {selectedPlan?.status === "active" && (
              <Button
                variant="outline"
                className="text-orange-600 border-orange-200 hover:bg-orange-50 mr-auto"
                onClick={() => { openDefaultConfirm(selectedPlan.id); }}
              >
                <Ban className="h-4 w-4 mr-1" />Mark Defaulted
              </Button>
            )}
            <Button variant="outline" onClick={() => { setPlanDetailOpen(false); setSelectedPlan(null); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Pay Installment Dialog                                                */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={payInstallmentOpen} onOpenChange={setPayInstallmentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Pay Installment</DialogTitle>
            <DialogDescription>Select the payment mode for this installment.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label className="text-sm font-medium">Payment Mode</Label>
              <Select value={installmentPayMode} onValueChange={setInstallmentPayMode}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayInstallmentOpen(false); setPayInstallmentId(null); }}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handlePayInstallment}
              disabled={payInstallmentMutation.isPending}
            >
              {payInstallmentMutation.isPending ? "Processing..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Default Plan Confirmation                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={defaultConfirmOpen} onOpenChange={setDefaultConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-600" />Mark Plan as Defaulted</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this payment plan as defaulted? This action marks all remaining installments as defaulted and cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDefaultConfirmOpen(false); setDefaultTargetPlan(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleDefaultPlan}
              disabled={defaultPlanMutation.isPending}
            >
              {defaultPlanMutation.isPending ? "Processing..." : "Mark Defaulted"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Feature 2: Legal Notice Dialog                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={legalNoticeOpen} onOpenChange={setLegalNoticeOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col print:max-h-none print:p-0 print:border-none">
          <DialogHeader className="print:hidden">
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-purple-600" />
              Generate Legal Notice
            </DialogTitle>
            <DialogDescription>
              Preview and generate a formal legal notice for overdue payment recovery.
            </DialogDescription>
          </DialogHeader>

          {legalNoticeInvoice && (
            <div className="flex-1 overflow-y-auto space-y-4 print:overflow-visible">
              {/* Notice controls (hidden in print) */}
              <div className="print:hidden space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Notice Type</Label>
                    <Select value={legalNoticeType} onValueChange={setLegalNoticeType}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Final Notice">Final Notice</SelectItem>
                        <SelectItem value="Legal Warning">Legal Warning</SelectItem>
                        <SelectItem value="Disconnection Notice">Disconnection Notice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Subscriber</Label>
                    <p className="text-sm font-medium mt-1.5">{legalNoticeInvoice.subscriber.name}</p>
                    <p className="text-xs text-muted-foreground">{legalNoticeInvoice.subscriber.phone} · {legalNoticeInvoice.subscriber.area?.name || "N/A"}</p>
                  </div>
                </div>
                <Separator />
              </div>

              {/* Notice Preview */}
              <div className="border rounded-lg bg-white p-6 print:border-none print:shadow-none print:p-8">
                <pre className="text-xs sm:text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground print:text-xs print:leading-normal">
                  {legalNoticeText}
                </pre>
              </div>
            </div>
          )}

          <DialogFooter className="print:hidden gap-2">
            <Button variant="outline" onClick={() => setLegalNoticeOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              className="text-purple-600 border-purple-200 hover:bg-purple-50"
              onClick={handleDownloadNoticeAsText}
              disabled={saveLegalNoticeMutation.isPending}
            >
              <Download className="h-4 w-4 mr-2" />Download as Text
            </Button>
            <Button
              variant="outline"
              className="text-teal-600 border-teal-200 hover:bg-teal-50"
              onClick={handleSaveLegalNotice}
              disabled={saveLegalNoticeMutation.isPending}
            >
              {saveLegalNoticeMutation.isPending ? "Saving..." : <FileText className="h-4 w-4 mr-2" />}Save to DB
            </Button>
            <Button
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              onClick={handlePrintNotice}
            >
              <Printer className="h-4 w-4 mr-2" />Print Notice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Feature 3: Dispute Resolution Dialog                                   */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-amber-600" />
              Dispute Resolution
            </DialogTitle>
            {disputeInvoice && (
              <DialogDescription>
                {disputeInvoice.subscriber.name} ({disputeInvoice.subscriber.code}) — Invoice: {disputeInvoice.invoiceNumber} — Balance: {formatCurrency(disputeInvoice.balanceAmount)}
              </DialogDescription>
            )}
          </DialogHeader>

          {disputeInvoice && disputeRecord && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Status Badge */}
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium">Dispute Status</Label>
                <Badge variant="outline" className={`text-xs ${DISPUTE_STATUS_STYLES[disputeRecord.status] || ""}`}>
                  {disputeRecord.status}
                </Badge>
              </div>

              {/* Dispute History Timeline */}
              {(disputeRecord.events.length > 0) && (
                <Card className="border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Dispute History</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="relative space-y-4 pl-6">
                      {/* Timeline line */}
                      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
                      {disputeRecord.events.map((event) => (
                        <div key={event.id} className="relative">
                          {/* Timeline dot */}
                          <div className={`absolute -left-6 top-1.5 h-[18px] w-[18px] rounded-full border-2 ${
                            event.type === "raised" ? "border-amber-500 bg-amber-50" :
                            event.type === "resolved" ? "border-green-500 bg-green-50" :
                            event.type === "status_change" ? "border-red-500 bg-red-50" :
                            "border-teal-500 bg-teal-50"
                          }`} />
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">
                                {event.type === "raised" ? "Dispute Raised" :
                                 event.type === "resolved" ? "Resolved" :
                                 event.type === "status_change" ? "Status Change" :
                                 "Note"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(event.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{event.description}</p>
                            {event.details && (
                              <p className="text-xs bg-muted/50 rounded px-2 py-1 mt-1">{event.details}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Separator />

              {/* Raise Dispute Form (when No Dispute or no record) */}
              {(!disputeRecord || disputeRecord.status === "No Dispute") && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Raise a Dispute</h3>
                  <div>
                    <Label className="text-sm">Reason</Label>
                    <Select value={disputeReason} onValueChange={setDisputeReason}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Amount Dispute">Amount Dispute</SelectItem>
                        <SelectItem value="Service Issue">Service Issue</SelectItem>
                        <SelectItem value="Billing Error">Billing Error</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Description</Label>
                    <Textarea
                      value={disputeDescription}
                      onChange={(e) => setDisputeDescription(e.target.value)}
                      className="mt-1.5"
                      rows={3}
                      placeholder="Describe the dispute in detail..."
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Supporting Notes</Label>
                    <Textarea
                      value={disputeSupportNotes}
                      onChange={(e) => setDisputeSupportNotes(e.target.value)}
                      className="mt-1.5"
                      rows={2}
                      placeholder="Any additional notes or evidence..."
                    />
                  </div>
                  <Button
                    className="bg-amber-600 hover:bg-amber-700 text-white w-full"
                    onClick={handleRaiseDispute}
                    disabled={!disputeReason}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />Raise Dispute
                  </Button>
                </div>
              )}

              {/* Resolve Dispute Form (when Under Review) */}
              {disputeRecord.status === "Under Review" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Resolve Dispute</h3>

                  {/* Show current dispute details */}
                  <Card className="border bg-muted/30">
                    <CardContent className="p-3 space-y-1">
                      <p className="text-xs"><span className="font-medium text-muted-foreground">Reason:</span> {disputeRecord.reason}</p>
                      {disputeRecord.description && (
                        <p className="text-xs"><span className="font-medium text-muted-foreground">Description:</span> {disputeRecord.description}</p>
                      )}
                      {disputeRecord.supportingNotes && (
                        <p className="text-xs"><span className="font-medium text-muted-foreground">Notes:</span> {disputeRecord.supportingNotes}</p>
                      )}
                    </CardContent>
                  </Card>

                  <div>
                    <Label className="text-sm">Action Taken</Label>
                    <Select value={disputeActionTaken} onValueChange={setDisputeActionTaken}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Write-off">Write-off</SelectItem>
                        <SelectItem value="Adjust">Adjust</SelectItem>
                        <SelectItem value="Maintain">Maintain</SelectItem>
                        <SelectItem value="Escalate">Escalate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Resolution Notes</Label>
                    <Textarea
                      value={disputeResolutionNotes}
                      onChange={(e) => setDisputeResolutionNotes(e.target.value)}
                      className="mt-1.5"
                      rows={3}
                      placeholder="Describe the resolution..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
                      onClick={handleResolveDispute}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />Resolve
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={handleRejectDispute}
                    >
                      <Ban className="h-4 w-4 mr-2" />Reject
                    </Button>
                  </div>
                </div>
              )}

              {/* Resolved / Rejected view */}
              {(disputeRecord.status === "Resolved" || disputeRecord.status === "Rejected") && (
                <Card className="border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      {disputeRecord.status === "Resolved" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <Ban className="h-5 w-5 text-red-600" />
                      )}
                      <span className="text-sm font-semibold">
                        Dispute {disputeRecord.status.toLowerCase()}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <p><span className="font-medium text-muted-foreground">Reason:</span> {disputeRecord.reason}</p>
                      {disputeRecord.description && (
                        <p><span className="font-medium text-muted-foreground">Description:</span> {disputeRecord.description}</p>
                      )}
                      {disputeRecord.actionTaken && (
                        <p><span className="font-medium text-muted-foreground">Action:</span> {disputeRecord.actionTaken}</p>
                      )}
                      {disputeRecord.resolutionNotes && (
                        <p><span className="font-medium text-muted-foreground">Notes:</span> {disputeRecord.resolutionNotes}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <DialogFooter className="print:hidden">
            <Button variant="outline" onClick={() => { setDisputeOpen(false); setDisputeInvoice(null); setDisputeRecord(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SLA Override Dialog                                                   */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={slaOverrideOpen} onOpenChange={setSlaOverrideOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-purple-600" />Override SLA Days</DialogTitle>
            <DialogDescription>Set a custom SLA target for this recovery. Default tiers: &lt;₹5K = 15d, ₹5K-25K = 30d, &gt;₹25K = 45d.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sla-days">Custom SLA Days</Label>
              <Input id="sla-days" type="number" min="1" max="365" value={slaOverrideDays} onChange={(e) => setSlaOverrideDays(e.target.value)} placeholder="Enter days (1-365)" />
            </div>
            <div className="rounded-md border bg-muted/50 p-3 text-xs space-y-1">
              <p className="font-medium text-muted-foreground">Default SLA Tiers:</p>
              <div className="flex justify-between"><span>Below ₹5,000</span><span className="font-semibold">15 days</span></div>
              <div className="flex justify-between"><span>₹5,000 – ₹25,000</span><span className="font-semibold">30 days</span></div>
              <div className="flex justify-between"><span>Above ₹25,000</span><span className="font-semibold">45 days</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlaOverrideOpen(false)}>Cancel</Button>
            <Button onClick={handleSlaOverride} disabled={slaOverrideMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
              {slaOverrideMutation.isPending ? "Saving..." : "Update SLA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SLA Pause Dialog                                                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={slaPauseOpen} onOpenChange={setSlaPauseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pause className="h-5 w-5 text-amber-600" />Pause SLA Timer</DialogTitle>
            <DialogDescription>Pause the SLA countdown for this recovery. Use this for disputed amounts under review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pause-reason">Pause Reason</Label>
              <Textarea id="pause-reason" value={slaPauseReason} onChange={(e) => setSlaPauseReason(e.target.value)} placeholder="e.g. Disputed amount under review, awaiting documentation..." rows={3} />
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
              <p className="text-amber-700 dark:text-amber-300"><strong>Note:</strong> Pausing will stop the SLA countdown. The timer will resume when you unpause. Total paused time is tracked cumulatively.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSlaPauseOpen(false); setSlaPauseReason(""); }}>Cancel</Button>
            <Button onClick={handleSlaPause} disabled={slaPauseMutation.isPending || !slaPauseReason.trim()} className="bg-amber-600 hover:bg-amber-700">
              {slaPauseMutation.isPending ? "Pausing..." : "Pause SLA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
