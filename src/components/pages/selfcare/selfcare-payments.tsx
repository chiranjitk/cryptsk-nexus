"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSubscriberAuthStore, type InvoiceItem, type PaymentItem } from "@/store/subscriber-auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CreditCard,
  IndianRupee,
  AlertTriangle,
  CalendarClock,
  RefreshCw,
  TrendingUp,
  CalendarCheck,
  ArrowUpRight,
  Info,
  ShieldCheck,
  Clock,
  XCircle,
  CheckCircle2,
  Loader2,
  Building2,
  Lock,
  Zap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────

interface PaymentGatewayInfo {
  id: string;
  provider: string;
  name: string;
  enabled: boolean;
  environment: string;
}

interface OutstandingInfo {
  totalOutstanding: number;
  nearestDueDate: string | null;
  overdueCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Gradient Icon Circle ────────────────────────────────────

function GradientIcon({
  icon: Icon,
  from,
  to,
}: {
  icon: React.ElementType;
  from?: string;
  to?: string;
}) {
  return (
    <div
      className={`w-7 h-7 rounded-lg bg-gradient-to-br ${from || "from-red-500"} ${to || "to-red-700"} flex items-center justify-center flex-shrink-0`}
    >
      <Icon className="w-3.5 h-3.5 text-white" />
    </div>
  );
}

// ─── Status Dot Badge ───────────────────────────────────────

function StatusDotBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge
      className={`text-[10px] inline-flex items-center gap-1 ${className || ""}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {children}
    </Badge>
  );
}

// ─── Payment Status Badge ───────────────────────────────────

function paymentStatusBadge(status: string) {
  const map: Record<string, string> = {
    VERIFIED:
      "bg-green-100 text-green-700 hover:bg-green-100 border-0",
    COMPLETED:
      "bg-green-100 text-green-700 hover:bg-green-100 border-0",
    PENDING: "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0",
    FAILED: "bg-red-100 text-red-700 hover:bg-red-100 border-0",
    REFUNDED:
      "bg-slate-100 text-slate-600 hover:bg-slate-100 border-0",
  };
  return map[status] || "bg-muted text-muted-foreground border-0";
}

// ─── Data Hooks ───────────────────────────────────────────────

function useOutstandingData() {
  const [data, setData] = useState<OutstandingInfo>({
    totalOutstanding: 0,
    nearestDueDate: null,
    overdueCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscriber-auth/invoices?limit=100");
      const json = await res.json();
      if (json.success) {
        const invoices: InvoiceItem[] = json.invoices || json.data || [];
        const unpaid = invoices.filter(
          (i) => i.status !== "PAID" && i.status !== "CANCELLED"
        );
        const totalOutstanding = unpaid.reduce(
          (s, i) => s + i.balanceAmount,
          0
        );

        const overdue = unpaid
          .filter((i) => {
            if (!i.dueDate) return false;
            return new Date(i.dueDate) < new Date();
          })
          .sort(
            (a, b) =>
              new Date(a.dueDate!).getTime() -
              new Date(b.dueDate!).getTime()
          );

        setData({
          totalOutstanding,
          nearestDueDate: overdue[0]?.dueDate || null,
          overdueCount: overdue.length,
        });
      }
    } catch {
      // Silent fail, use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...data, loading, refetch: fetchData };
}

function usePaymentHistory() {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ totalPaidThisMonth: 0, totalPaidThisYear: 0 });
  const limit = 10;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * limit;
      const res = await fetch(
        `/api/subscriber-auth/payments?limit=${limit}&offset=${offset}`
      );
      const data = await res.json();
      if (data.success) {
        setPayments(data.payments || []);
        setTotal(data.pagination?.total || 0);
        if (data.summary) {
          setSummary({
            totalPaidThisMonth: data.summary.totalPaidThisMonth || 0,
            totalPaidThisYear: data.summary.totalPaidThisYear || 0,
          });
        }
      } else {
        setError(data.error || "Failed to fetch payments");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / limit);

  return {
    payments,
    loading,
    error,
    refetch: fetchData,
    page,
    setPage,
    totalPages,
    summary,
  };
}

function usePaymentGateway() {
  const [gateway, setGateway] = useState<PaymentGatewayInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchGateway = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "/api/integrations?type=gateways"
      );
      const data = await res.json();
      if (data.gateways && Array.isArray(data.gateways)) {
        const active = data.gateways.find(
          (g: Record<string, unknown>) => g.enabled === true
        );
        if (active) {
          setGateway({
            id: active.id,
            provider: active.provider,
            name: active.name,
            enabled: active.enabled,
            environment: active.environment,
          });
        }
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGateway();
  }, [fetchGateway]);

  return { gateway, loading, refetch: fetchGateway };
}

// ─── Skeleton ─────────────────────────────────────────────────

function PaymentsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Outstanding Balance Card ────────────────────────────────

function OutstandingBalanceCard({
  outstanding,
  loading,
  onPayNow,
}: {
  outstanding: OutstandingInfo;
  loading: boolean;
  onPayNow: () => void;
}) {
  const isOverdue = outstanding.overdueCount > 0;
  const isZero = outstanding.totalOutstanding === 0;

  return (
    <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm overflow-hidden relative">
      {/* Decorative accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-red-700" />

      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <GradientIcon icon={IndianRupee} from="from-red-500" to="to-red-700" />
          Outstanding Balance
        </CardTitle>
        <CardDescription>
          Total unpaid amount across all invoices
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <span
                className={`text-3xl font-bold tracking-tight ${
                  isOverdue
                    ? "text-red-600"
                    : isZero
                      ? "text-foreground"
                      : "text-foreground"
                }`}
              >
                {formatCurrency(outstanding.totalOutstanding)}
              </span>
              {isOverdue && (
                <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-xs">
                  {outstanding.overdueCount} overdue
                </Badge>
              )}
              {isZero && (
                <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-xs">
                  Clear
                </Badge>
              )}
            </div>

            {outstanding.nearestDueDate && !isZero && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock className="w-4 h-4 text-red-500" />
                <span className="text-muted-foreground">
                  Nearest overdue:{" "}
                  <span className="font-medium text-red-600">
                    {formatDate(outstanding.nearestDueDate)}
                  </span>
                </span>
              </div>
            )}

            {!outstanding.nearestDueDate && !isZero && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                No overdue invoices at this time.
              </p>
            )}

            {isZero && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-red-500" />
                All dues are cleared. Thank you!
              </p>
            )}

            <Button
              onClick={onPayNow}
              disabled={isZero}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold shadow-lg shadow-red-500/20 transition-all duration-200 h-10"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Pay Now
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Payment Summary Card ───────────────────────────────────

function PaymentSummaryCard({
  totalPaidThisMonth,
  totalPaidThisYear,
  loading,
}: {
  totalPaidThisMonth: number;
  totalPaidThisYear: number;
  loading: boolean;
}) {
  return (
    <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <GradientIcon
            icon={TrendingUp}
            from="from-amber-500"
            to="to-orange-600"
          />
          Payment Summary
        </CardTitle>
        <CardDescription>Your verified payment totals</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Separator />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <CalendarCheck className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    This Month
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {formatCurrency(totalPaidThisMonth)}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    This Year
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {formatCurrency(totalPaidThisYear)}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Payment History Table ───────────────────────────────────

function PaymentHistoryTable({ payments }: { payments: PaymentItem[] }) {
  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CreditCard className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">No payment history yet</p>
        <p className="text-xs mt-1">
          Payments you make will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground">
              Receipt #
            </th>
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground hidden sm:table-cell">
              Date
            </th>
            <th className="text-right py-3 px-4 font-semibold text-muted-foreground">
              Amount
            </th>
            <th className="text-center py-3 px-4 font-semibold text-muted-foreground hidden md:table-cell">
              Mode
            </th>
            <th className="text-center py-3 px-4 font-semibold text-muted-foreground">
              Status
            </th>
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground hidden lg:table-cell">
              Reference
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((pay) => (
            <tr
              key={pay.id}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors"
            >
              <td className="py-3 px-4 font-medium text-foreground">
                {pay.receiptNumber || pay.id.slice(0, 8).toUpperCase()}
              </td>
              <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">
                {formatDateTime(pay.createdAt)}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-foreground">
                {formatCurrency(pay.amount)}
              </td>
              <td className="py-3 px-4 text-center hidden md:table-cell">
                <StatusDotBadge
                  className={`${
                    pay.paymentMode === "ONLINE"
                      ? "bg-red-100 text-red-700 hover:bg-red-100 border-0"
                      : pay.paymentMode === "CASH"
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-100 border-0"
                  }`}
                >
                  {pay.paymentMode}
                </StatusDotBadge>
              </td>
              <td className="py-3 px-4 text-center">
                <StatusDotBadge className={paymentStatusBadge(pay.status)}>
                  {pay.status}
                </StatusDotBadge>
              </td>
              <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell font-mono text-xs max-w-[180px] truncate">
                {pay.transactionRef || pay.receiptNumber || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Quick Pay Dialog ────────────────────────────────────────

function QuickPayDialog({
  open,
  onOpenChange,
  outstandingBalance,
  onSuccess,
  gateway,
  gatewayLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outstandingBalance: number;
  onSuccess: () => void;
  gateway: PaymentGatewayInfo | null;
  gatewayLoading: boolean;
}) {
  const { subscriber } = useSubscriberAuthStore();
  const [amount, setAmount] = useState<string>("");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [activeQuickBtn, setActiveQuickBtn] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"amount" | "processing" | "success" | "failure">("amount");
  const [paymentResult, setPaymentResult] = useState<{
    receiptNumber: string;
    amount: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Reset on open
  useEffect(() => {
    if (open) {
      setAmount(outstandingBalance > 0 ? String(outstandingBalance) : (subscriber?.plan?.price ? String(subscriber.plan.price) : ""));
      setCustomAmount("");
      setActiveQuickBtn(outstandingBalance > 0 ? "full" : (subscriber?.plan?.price ? "plan" : ""));
      setStep("amount");
      setPaymentResult(null);
      setErrorMsg("");
    }
  }, [open, outstandingBalance, subscriber?.plan?.price]);

  const handleQuickAmount = (value: string, label: string) => {
    setActiveQuickBtn(label);
    setAmount(value);
    setCustomAmount("");
  };

  const handleCustomAmount = (value: string) => {
    setCustomAmount(value);
    setAmount(value);
    setActiveQuickBtn("custom");
  };

  const getProviderLabel = () => {
    if (!gateway) return null;
    const labels: Record<string, string> = {
      razorpay: "Razorpay",
      stripe: "Stripe",
    };
    return labels[gateway.provider] || gateway.provider;
  };

  const handlePay = async () => {
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      toast.error("Invalid amount", {
        description: "Please enter a valid amount to pay.",
      });
      return;
    }

    // Check if gateway is configured
    if (!gateway) {
      toast.error("Payment Unavailable", {
        description:
          "Online payment is not configured. Please contact your ISP to make a payment.",
        duration: 6000,
      });
      return;
    }

    setSubmitting(true);
    setStep("processing");
    setErrorMsg("");

    try {
      // Step 1: Create the payment record via subscriber-auth
      const createRes = await fetch("/api/subscriber-auth/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: payAmount,
          paymentMode: "ONLINE",
        }),
      });
      const createData = await createRes.json();

      if (!createData.success) {
        throw new Error(createData.error || "Failed to create payment record");
      }

      // Step 2: Create order via gateway
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriberId: subscriber?.id,
          amount: payAmount,
          currency: "INR",
          receipt: createData.payment.receiptNumber,
        }),
      });
      const orderData = await orderRes.json();

      if (!orderData.success) {
        throw new Error(
          orderData.error || "Failed to create payment order with gateway"
        );
      }

      // Step 3: Handle based on provider
      const provider = orderData.order?.provider || gateway.provider;

      if (provider === "razorpay") {
        // For Razorpay: open the Razorpay checkout
        // The order ID is returned, user would complete payment via Razorpay
        // In production, you'd use Razorpay Checkout SDK. For self-care, show
        // a message with order details since we can't use the SDK client-side easily
        setStep("success");
        setPaymentResult({
          receiptNumber: createData.payment.receiptNumber,
          amount: payAmount,
        });
        toast.success("Payment Initiated", {
          description: `Order created via Razorpay. Order ID: ${orderData.order.id}`,
          duration: 6000,
        });
      } else if (provider === "stripe") {
        setStep("success");
        setPaymentResult({
          receiptNumber: createData.payment.receiptNumber,
          amount: payAmount,
        });
        toast.success("Payment Initiated", {
          description: `Order created via Stripe. Intent ID: ${orderData.order.id}`,
          duration: 6000,
        });
      } else {
        setStep("success");
        setPaymentResult({
          receiptNumber: createData.payment.receiptNumber,
          amount: payAmount,
        });
        toast.success("Payment Initiated", {
          description: `Payment order created. Receipt: ${createData.payment.receiptNumber}`,
          duration: 6000,
        });
      }

      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment failed";
      setErrorMsg(message);
      setStep("failure");
      toast.error("Payment Failed", {
        description: message,
        duration: 6000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (submitting) return;
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {/* ── Amount Selection Step ── */}
        {step === "amount" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-white" />
                </div>
                Quick Pay
              </DialogTitle>
              <DialogDescription>
                Select or enter the amount you want to pay.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Outstanding balance info */}
              <div className="rounded-lg bg-muted/50 border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Outstanding Balance
                  </span>
                  <span
                    className={`text-lg font-bold ${outstandingBalance > 0 ? "text-red-600" : "text-foreground"}`}
                  >
                    {formatCurrency(outstandingBalance)}
                  </span>
                </div>
                {subscriber?.plan && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">
                      Monthly Plan
                    </span>
                    <span className="text-sm font-medium">
                      {formatCurrency(subscriber.plan.price)}
                    </span>
                  </div>
                )}
              </div>

              {/* Quick fill buttons */}
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider">
                  Quick Amount
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {outstandingBalance > 0 && (
                    <Button
                      variant={activeQuickBtn === "full" ? "default" : "outline"}
                      className={`h-9 text-xs font-medium ${
                        activeQuickBtn === "full"
                          ? "bg-gradient-to-r from-red-500 to-red-700 text-white hover:from-red-600 hover:to-red-800 shadow-sm"
                          : "border-border/50"
                      }`}
                      onClick={() =>
                        handleQuickAmount(
                          String(outstandingBalance),
                          "full"
                        )
                      }
                    >
                      <IndianRupee className="w-3.5 h-3.5 mr-1.5" />
                      Full Amount
                    </Button>
                  )}
                  {subscriber?.plan && (
                    <Button
                      variant={activeQuickBtn === "plan" ? "default" : "outline"}
                      className={`h-9 text-xs font-medium ${
                        activeQuickBtn === "plan"
                          ? "bg-gradient-to-r from-red-500 to-red-700 text-white hover:from-red-600 hover:to-red-800 shadow-sm"
                          : "border-border/50"
                      }`}
                      onClick={() =>
                        handleQuickAmount(
                          String(subscriber.plan!.price),
                          "plan"
                        )
                      }
                    >
                      <IndianRupee className="w-3.5 h-3.5 mr-1.5" />
                      Monthly Plan
                    </Button>
                  )}
                  <Button
                    variant={activeQuickBtn === "500" ? "default" : "outline"}
                    className={`h-9 text-xs font-medium ${
                      activeQuickBtn === "500"
                        ? "bg-gradient-to-r from-red-500 to-red-700 text-white hover:from-red-600 hover:to-red-800 shadow-sm"
                        : "border-border/50"
                    }`}
                    onClick={() => handleQuickAmount("500", "500")}
                  >
                    <IndianRupee className="w-3.5 h-3.5 mr-1.5" />
                    500
                  </Button>
                  <Button
                    variant={activeQuickBtn === "1000" ? "default" : "outline"}
                    className={`h-9 text-xs font-medium ${
                      activeQuickBtn === "1000"
                        ? "bg-gradient-to-r from-red-500 to-red-700 text-white hover:from-red-600 hover:to-red-800 shadow-sm"
                        : "border-border/50"
                    }`}
                    onClick={() => handleQuickAmount("1000", "1000")}
                  >
                    <IndianRupee className="w-3.5 h-3.5 mr-1.5" />
                    1,000
                  </Button>
                </div>
              </div>

              {/* Custom amount */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider">
                  Or Enter Custom Amount
                </Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min={1}
                    max={1000000}
                    step={1}
                    value={customAmount}
                    onChange={(e) => handleCustomAmount(e.target.value)}
                    onFocus={() => {
                      setActiveQuickBtn("custom");
                      if (!customAmount) setAmount("");
                    }}
                    placeholder="Enter amount"
                    className="pl-10 h-11"
                  />
                </div>
              </div>

              {/* Selected amount display */}
              {amount && parseFloat(amount) > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-red-700 dark:text-red-400 font-medium">
                      Amount to Pay
                    </span>
                    <span className="text-xl font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(parseFloat(amount))}
                    </span>
                  </div>
                </div>
              )}

              {/* Gateway info */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Payment Method
                </p>
                {gatewayLoading ? (
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ) : gateway ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-medium">
                        {getProviderLabel()}
                      </span>
                    </div>
                    <Badge
                      className={`text-[10px] border-0 ${
                        gateway.environment === "live"
                          ? "bg-red-100 text-red-700 hover:bg-red-100"
                          : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                      }`}
                    >
                      {gateway.environment === "live" ? "Live" : "Test"}
                    </Badge>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span>
                      Online payment not configured. Please contact your ISP.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePay}
                disabled={
                  submitting ||
                  !amount ||
                  parseFloat(amount) <= 0 ||
                  !gateway
                }
                className="bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white shadow-sm min-w-[120px]"
              >
                <Lock className="w-4 h-4 mr-2" />
                Pay Securely
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Processing Step ── */}
        {step === "processing" && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Processing Payment
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Please wait while we process your payment...
              </p>
            </div>
          </div>
        )}

        {/* ── Success Step ── */}
        {step === "success" && paymentResult && (
          <div className="py-6 space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                Payment Initiated
              </DialogTitle>
              <DialogDescription>
                Your payment has been submitted successfully.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-700 dark:text-green-400">
                  Amount
                </span>
                <span className="text-lg font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(paymentResult.amount)}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-700 dark:text-green-400">
                  Receipt #
                </span>
                <span className="text-sm font-mono font-medium text-foreground">
                  {paymentResult.receiptNumber}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-700 dark:text-green-400">
                  Status
                </span>
                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">
                  <Clock className="w-3 h-3 mr-1" />
                  Pending Verification
                </Badge>
              </div>
            </div>

            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Your payment is being processed. The status will update once
              verified by the payment gateway. You can track it in Payment
              History.
            </p>

            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                className="bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white shadow-sm"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Failure Step ── */}
        {step === "failure" && (
          <div className="py-6 space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-red-600" />
                </div>
                Payment Failed
              </DialogTitle>
              <DialogDescription>
                We could not process your payment at this time.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4">
              <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                {errorMsg || "An unknown error occurred. Please try again."}
              </p>
            </div>

            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              If the problem persists, please contact your ISP for assistance
              with payment.
            </p>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("amount");
                  setErrorMsg("");
                }}
              >
                Try Again
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Auto-Pay Card ──────────────────────────────────────────

function AutoPayCard() {
  return (
    <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm overflow-hidden relative">
      {/* Decorative accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-400 to-slate-500" />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GradientIcon
              icon={Zap}
              from="from-slate-400"
              to="to-slate-500"
            />
            Auto-Pay
          </CardTitle>
          <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-0 text-[10px] font-semibold">
            Coming Soon
          </Badge>
        </div>
        <CardDescription>
          Set up automatic bill payments so you never miss a due date.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Automatic Payment Setup
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Link your preferred payment method and we&apos;ll automatically
              deduct your bill every month.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <Clock className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground font-medium">
              On Schedule
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <ShieldCheck className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground font-medium">
              Secure
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <CreditCard className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground font-medium">
              Flexible
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full h-9 text-xs"
          disabled
        >
          <Lock className="w-3.5 h-3.5 mr-1.5" />
          Enable Auto-Pay (Coming Soon)
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function SelfcarePayments() {
  const {
    totalOutstanding,
    nearestDueDate,
    overdueCount,
    loading: outstandingLoading,
    refetch: refetchOutstanding,
  } = useOutstandingData();

  const {
    payments,
    loading: paymentsLoading,
    error: paymentsError,
    refetch: refetchPayments,
    page: payPage,
    setPage: setPayPage,
    totalPages: payTotalPages,
    summary,
  } = usePaymentHistory();

  const { gateway, loading: gatewayLoading } = usePaymentGateway();

  const [payDialogOpen, setPayDialogOpen] = useState(false);

  const handlePaymentSuccess = () => {
    refetchOutstanding();
    refetchPayments();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GradientIcon
              icon={CreditCard}
              from="from-red-500"
              to="to-red-700"
            />
            Payments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your bills, make payments, and view transaction history
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetchOutstanding();
            refetchPayments();
          }}
          className="gap-1.5 border-border/50 bg-background hover:bg-muted/50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Top cards: Outstanding + Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <OutstandingBalanceCard
          outstanding={{
            totalOutstanding,
            nearestDueDate,
            overdueCount,
          }}
          loading={outstandingLoading}
          onPayNow={() => setPayDialogOpen(true)}
        />
        <PaymentSummaryCard
          totalPaidThisMonth={summary.totalPaidThisMonth}
          totalPaidThisYear={summary.totalPaidThisYear}
          loading={outstandingLoading}
        />
      </div>

      {/* Payment History */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GradientIcon
              icon={CreditCard}
              from="from-slate-400"
              to="to-slate-500"
            />
            Payment History
          </CardTitle>
          <CardDescription>
            All transactions associated with your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : paymentsError ? (
            <div className="text-center py-8">
              <p className="text-sm text-destructive mb-3">
                {paymentsError}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={refetchPayments}
                className="gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
                <PaymentHistoryTable payments={payments} />
              </div>
              <Pagination
                page={payPage}
                totalPages={payTotalPages}
                onPageChange={setPayPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Auto-Pay Card */}
      <AutoPayCard />

      {/* Quick Pay Dialog */}
      <QuickPayDialog
        open={payDialogOpen}
        onOpenChange={setPayDialogOpen}
        outstandingBalance={totalOutstanding}
        onSuccess={handlePaymentSuccess}
        gateway={gateway}
        gatewayLoading={gatewayLoading}
      />
    </div>
  );
}
