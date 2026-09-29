"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plug,
  CreditCard,
  MessageSquare,
  Webhook,
  Eye,
  EyeOff,
  Copy,
  Check,
  Settings,
  Save,
  Zap,
  Plus,
  Trash2,
  RefreshCw,
  Send,
  Smartphone,
  Mail,
  Bell,
  Globe,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  DollarSign,
  Receipt,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  RotateCcw,
  Shield,
  Activity,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────
interface IntegrationConfig {
  id: string;
  type: string;
  name: string;
  provider: string;
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  environment: string;
  enabled: boolean;
  config: string;
  costPerRequest: number;
  monthlyBudget: number;
  monthlyCost: number;
  ipAllowlist: string;
  apiCalls: number;
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
}

interface IntegrationTransaction {
  id: string;
  integrationId: string | null;
  gatewayType: string;
  transactionType: string;
  amount: number;
  status: string;
  externalRef: string;
  createdAt: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string;
  secret: string;
  enabled: boolean;
  lastDeliveryAt: string | null;
  successCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
  deliveries: WebhookDelivery[];
}

interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: string;
  statusCode: number;
  success: boolean;
  duration: number;
  errorMessage: string;
  createdAt: string;
}

interface IntegrationLog {
  id: string;
  integrationId: string;
  method: string;
  url: string;
  statusCode: number;
  status: string;
  requestSummary: string;
  responseSummary: string;
  errorMessage: string;
  durationMs: number;
  retryOf: string | null;
  createdAt: string;
}

// ─── Display metadata ──────────────────────────────
const GATEWAY_META: Record<string, { color: string; bgColor: string; borderColor: string; letter: string; badge: string }> = {
  razorpay: { color: "text-sky-600", bgColor: "bg-sky-100", borderColor: "border-sky-300", letter: "R", badge: "Most Popular" },
  phonepe: { color: "text-purple-600", bgColor: "bg-purple-100", borderColor: "border-purple-300", letter: "P", badge: "UPI Leader" },
  paytm: { color: "text-sky-700", bgColor: "bg-sky-50", borderColor: "border-sky-200", letter: "Pay", badge: "UPI + Wallet" },
  cashfree: { color: "text-emerald-600", bgColor: "bg-emerald-100", borderColor: "border-emerald-300", letter: "CF", badge: "Low Cost" },
  ccavenue: { color: "text-orange-600", bgColor: "bg-orange-100", borderColor: "border-orange-300", letter: "CC", badge: "All Banks" },
  payu: { color: "text-teal-700", bgColor: "bg-teal-50", borderColor: "border-teal-200", letter: "PU", badge: "" },
  stripe: { color: "text-violet-600", bgColor: "bg-violet-100", borderColor: "border-violet-300", letter: "S", badge: "International" },
};

const CHANNEL_META: Record<string, { icon: React.ElementType; description: string; color: string; fields: { key: string; label: string; type: "text" | "password" | "number" }[] }> = {
  msg91: { icon: Smartphone, description: "OTP, reminders & notifications via SMS", color: "bg-orange-100 text-orange-600", fields: [
    { key: "apiKey", label: "API Key", type: "password" },
    { key: "senderId", label: "Sender ID", type: "text" },
    { key: "route", label: "Route", type: "text" },
  ]},
  whatsapp: { icon: MessageSquare, description: "Customer messaging via WhatsApp API", color: "bg-green-100 text-green-600", fields: [
    { key: "phoneId", label: "Phone Number ID", type: "text" },
    { key: "accessToken", label: "Access Token", type: "password" },
    { key: "webhookVerify", label: "Webhook Verify Token", type: "text" },
  ]},
  smtp: { icon: Mail, description: "Transactional emails via SMTP server", color: "bg-sky-100 text-sky-600", fields: [
    { key: "host", label: "SMTP Host", type: "text" },
    { key: "port", label: "Port", type: "number" },
    { key: "username", label: "Username", type: "text" },
    { key: "password", label: "Password", type: "password" },
    { key: "encryption", label: "Encryption", type: "text" },
  ]},
  fcm: { icon: Bell, description: "Mobile push notifications via Firebase", color: "bg-amber-100 text-amber-600", fields: [
    { key: "serverKey", label: "FCM Server Key", type: "password" },
    { key: "projectId", label: "Project ID", type: "text" },
  ]},
};

const WEBHOOK_EVENTS = [
  "subscriber.created", "invoice.paid", "complaint.opened",
  "payment.received", "plan.changed", "user.login", "device.alert",
];

// ─── Helpers ─────────────────────────────────────────
function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getGatewayStatus(gw: IntegrationConfig): "connected" | "test_mode" | "not_configured" {
  if (gw.apiKey && gw.apiSecret) return gw.environment === "live" ? "connected" : "test_mode";
  return "not_configured";
}

function getChannelStatus(ch: IntegrationConfig): "connected" | "not_configured" {
  const config = parseConfig(ch.config);
  const hasKey = config.apiKey || config.serverKey || config.accessToken || config.password;
  return ch.enabled && hasKey ? "connected" : "not_configured";
}

function parseConfig(configStr: string): Record<string, string> {
  try { return JSON.parse(configStr || "{}"); } catch { return {}; }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "connected": return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>;
    case "not_configured": return <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-[10px]">Not Configured</Badge>;
    case "test_mode": return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]"><Zap className="h-3 w-3 mr-1" />Test Mode</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function getLogStatusBadge(status: string) {
  switch (status) {
    case "success": return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Success</Badge>;
    case "failed": return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Failed</Badge>;
    case "retried": return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Retried</Badge>;
    case "pending": return <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-[10px]">Pending</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

// ─── Integrations Page ──────────────────────────────
export function IntegrationsPage() {
  const queryClient = useQueryClient();

  // Payment Gateways state
  const [configGateway, setConfigGateway] = useState<IntegrationConfig | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string>("");

  // Add new gateway state
  const [addGatewayOpen, setAddGatewayOpen] = useState(false);
  const [newGwProvider, setNewGwProvider] = useState("");
  const [newGwName, setNewGwName] = useState("");

  // Communication state
  const [configChannel, setConfigChannel] = useState<IntegrationConfig | null>(null);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [channelForm, setChannelForm] = useState<Record<string, string>>({});
  const [showChannelKeys, setShowChannelKeys] = useState<Record<string, boolean>>({});

  // Add new channel state
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [newChProvider, setNewChProvider] = useState("");
  const [newChName, setNewChName] = useState("");

  // Webhooks state
  const [addWebhookOpen, setAddWebhookOpen] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState<Record<string, boolean>>({});
  const [newWebhook, setNewWebhook] = useState({ url: "", events: [] as string[], secret: "" });
  const [deleteWebhookTarget, setDeleteWebhookTarget] = useState<Webhook | null>(null);

  // Test connection tracking
  const [testingId, setTestingId] = useState<string | null>(null);

  // Transactions state
  const [txnGatewayFilter, setTxnGatewayFilter] = useState<string>("all");

  // Logs state (per integration)
  const [selectedLogIntegration, setSelectedLogIntegration] = useState<string>("");
  const [logPage, setLogPage] = useState(1);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // IP Allowlist and Cost state for gateway config
  const [gwIpAllowlist, setGwIpAllowlist] = useState("");
  const [gwCostPerRequest, setGwCostPerRequest] = useState("0");
  const [ipError, setIpError] = useState("");

  // Transaction log per gateway (mock)
  const [txnLogOpen, setTxnLogOpen] = useState(false);
  const [txnLogGateway, setTxnLogGateway] = useState<string>("");
  const [txnLogFilter, setTxnLogFilter] = useState<string>("all");
  const [mockTxnLogs, setMockTxnLogs] = useState<{ id: string; timestamp: string; direction: string; status: string; payload: string; duration: string }[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("txn-logs");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const generateMockTxnLogs = (gatewayId: string) => {
    const directions = ["Sent", "Received"];
    const statuses = ["Success", "Success", "Success", "Failed", "Success"];
    const payloads = ["Payment confirmation", "Subscription update", "Invoice data sync", "Webhook event", "Balance check", "Refund request", "Plan upgrade", "Status inquiry"];
    const logs = Array.from({ length: 8 }, (_, i) => ({
      id: `txn_${Date.now()}_${i}`,
      timestamp: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
      direction: directions[Math.floor(Math.random() * directions.length)],
      status: statuses[Math.floor(Math.random() * statuses.length)],
      payload: payloads[Math.floor(Math.random() * payloads.length)],
      duration: `${(Math.random() * 2000 + 100).toFixed(0)}ms`,
    }));
    return logs;
  };

  const openTxnLog = (gatewayId: string) => {
    const key = `txn-logs-${gatewayId}`;
    let logs: { id: string; timestamp: string; direction: string; status: string; payload: string; duration: string }[];
    try { const saved = localStorage.getItem(key); logs = saved ? JSON.parse(saved) : null; } catch { logs = null as unknown as typeof logs; }
    if (!logs || logs.length === 0) {
      logs = generateMockTxnLogs(gatewayId);
      try { localStorage.setItem(key, JSON.stringify(logs)); } catch { /* ignore */ }
    }
    setMockTxnLogs(logs);
    setTxnLogGateway(gatewayId);
    setTxnLogFilter("all");
    setTxnLogOpen(true);
  };

  const clearTxnLog = () => {
    setMockTxnLogs([]);
    try { localStorage.removeItem(`txn-logs-${txnLogGateway}`); } catch { /* ignore */ }
    toast.success("Transaction log cleared");
  };

  const filteredTxnLogs = txnLogFilter === "all" ? mockTxnLogs : mockTxnLogs.filter(l => l.status === txnLogFilter);

  // ── Fetch all data ──
  const { data, isLoading } = useQuery<{
    stats: { active: number; inactive: number; total: number; totalApiCalls: number; totalEstimatedCost: number };
    gateways: IntegrationConfig[];
    channels: IntegrationConfig[];
  }>({
    queryKey: ["integrations"],
    queryFn: () => apiFetch("/api/integrations"),
  });

  const { data: webhooksData } = useQuery<{ webhooks: Webhook[] }>({
    queryKey: ["integrations-webhooks"],
    queryFn: () => apiFetch("/api/integrations?type=webhooks"),
  });

  const { data: txnData, isLoading: txnLoading } = useQuery<{
    transactions: IntegrationTransaction[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["integrations-transactions", txnGatewayFilter],
    queryFn: () => apiFetch(`/api/integrations/transactions?gatewayType=${txnGatewayFilter === "all" ? "" : txnGatewayFilter}`),
  });

  // Logs query
  const { data: logsData, isLoading: logsLoading } = useQuery<{
    logs: IntegrationLog[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["integration-logs", selectedLogIntegration, logPage],
    queryFn: () => apiFetch(`/api/integrations/logs?integrationId=${selectedLogIntegration}&page=${logPage}&limit=15`),
    enabled: !!selectedLogIntegration && logsDialogOpen,
  });

  const gateways = data?.gateways || [];
  const channels = data?.channels || [];
  const webhooks = webhooksData?.webhooks || [];
  const transactions = txnData?.transactions || [];
  const integrationLogs = logsData?.logs || [];
  const logsPagination = logsData?.pagination;

  const activeCount = [...gateways.filter((g) => getGatewayStatus(g) === "connected"), ...channels.filter((c) => getChannelStatus(c) === "connected")].length + webhooks.filter((w) => w.enabled).length;
  const inactiveCount = [...gateways.filter((g) => getGatewayStatus(g) === "not_configured"), ...channels.filter((c) => getChannelStatus(c) === "not_configured")].length + webhooks.filter((w) => !w.enabled).length;

  const allIntegrations = [...gateways, ...channels];

  // ── Mutations ──
  const saveGatewayMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `API error: ${r.status}`); }
        return r.json();
      }),
    onSuccess: () => {
      toast.success(`${configGateway?.name} configuration saved`);
      setConfigDialogOpen(false); setConfigGateway(null);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) => toast.error(e.message || "Failed to save gateway config"),
  });

  const saveChannelMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
        if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json();
      }),
    onSuccess: () => {
      toast.success(`${configChannel?.name} configuration saved`);
      setChannelDialogOpen(false); setConfigChannel(null);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: () => toast.error("Failed to save channel config"),
  });

  const createWebhookMutation = useMutation({
    mutationFn: (body: { action: string; url: string; events: string[]; secret: string }) =>
      fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
        if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json();
      }),
    onSuccess: () => {
      toast.success("Webhook created successfully");
      setAddWebhookOpen(false); setNewWebhook({ url: "", events: [], secret: "" });
      queryClient.invalidateQueries({ queryKey: ["integrations-webhooks"] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: () => toast.error("Failed to create webhook"),
  });

  const toggleWebhookMutation = useMutation({
    mutationFn: (body: { action: string; webhookId: string }) =>
      fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
        if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-webhooks"] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: () => toast.error("Failed to toggle webhook"),
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (body: { action: string; webhookId: string }) =>
      fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
        if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json();
      }),
    onSuccess: () => {
      toast.success("Webhook deleted");
      queryClient.invalidateQueries({ queryKey: ["integrations-webhooks"] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: () => toast.error("Failed to delete webhook"),
  });

  const testConnectionMutation = useMutation({
    mutationFn: (body: { integrationId: string; type: string; to?: string }) =>
      fetch("/api/integrations/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
        if (!r.ok) throw new Error(`Test failed: ${r.status}`); return r.json();
      }),
    onSuccess: (data) => {
      toast.success(data.message || "Connection successful!");
      setTestingId(null);
    },
    onError: (error) => { toast.error(error.message || "Test failed"); setTestingId(null); },
  });

  const retryLogMutation = useMutation({
    mutationFn: (logId: string) =>
      fetch("/api/integrations/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry", logId }) }).then(async (r) => {
        if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json();
      }),
    onSuccess: () => {
      toast.success("Retry initiated successfully");
      setRetryingId(null);
      queryClient.invalidateQueries({ queryKey: ["integration-logs"] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) => { toast.error(e.message || "Retry failed"); setRetryingId(null); },
  });

  function confirmDeleteWebhook() {
    if (!deleteWebhookTarget) return;
    deleteWebhookMutation.mutate({ action: "delete_webhook", webhookId: deleteWebhookTarget.id });
    setDeleteWebhookTarget(null);
  }

  function testConnection(integrationId: string) {
    setTestingId(integrationId);
    testConnectionMutation.mutate({ integrationId, type: "test_connection" });
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
    toast.success("Copied to clipboard");
  }

  // Validate IP allowlist
  function validateIps(ips: string): boolean {
    if (!ips.trim()) { setIpError(""); return true; }
    const parts = ips.split(",").map((s) => s.trim()).filter(Boolean);
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/(\d{1,2}|(\d{1,3}\.){3}\d{1,3}))?$/;
    for (const ip of parts) {
      if (!ipRegex.test(ip)) {
        setIpError(`Invalid IP: "${ip}"`);
        return false;
      }
    }
    setIpError("");
    return true;
  }

  // Gateway config handlers
  function openGatewayConfig(gw: IntegrationConfig) {
    setConfigGateway({ ...gw });
    setGwIpAllowlist(gw.ipAllowlist || "");
    setGwCostPerRequest(String(gw.costPerRequest || 0));
    setIpError("");
    setConfigDialogOpen(true);
  }

  function saveGatewayConfig() {
    if (!configGateway) return;
    if (!validateIps(gwIpAllowlist)) return;
    const isConnected = configGateway.apiKey && configGateway.apiSecret;
    saveGatewayMutation.mutate({
      action: "save_gateway",
      gatewayId: configGateway.id,
      name: configGateway.name,
      provider: configGateway.provider,
      apiKey: configGateway.apiKey,
      apiSecret: configGateway.apiSecret,
      merchantId: configGateway.merchantId,
      environment: configGateway.environment,
      enabled: isConnected ? true : false,
      ipAllowlist: gwIpAllowlist,
      costPerRequest: parseFloat(gwCostPerRequest) || 0,
    });
  }

  // Channel config handlers
  function openChannelConfig(ch: IntegrationConfig) {
    setConfigChannel({ ...ch });
    setChannelForm(parseConfig(ch.config));
    setChannelDialogOpen(true);
  }

  function saveChannelConfig() {
    if (!configChannel) return;
    const hasKey = channelForm.apiKey || channelForm.serverKey || channelForm.accessToken || channelForm.password;
    saveChannelMutation.mutate({
      action: "save_channel",
      channelId: configChannel.id,
      name: configChannel.name,
      provider: configChannel.provider,
      apiKey: channelForm.apiKey || "",
      apiSecret: channelForm.accessToken || channelForm.password || "",
      environment: configChannel.environment,
      enabled: !!hasKey,
      config: channelForm,
    });
  }

  function toggleEvent(event: string) {
    setNewWebhook((prev) => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter((e) => e !== event) : [...prev.events, event],
    }));
  }

  // Open logs dialog for an integration
  function openLogs(integrationId: string) {
    setSelectedLogIntegration(integrationId);
    setLogPage(1);
    setLogsDialogOpen(true);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="skeleton-wave h-4 w-24 mb-3" /><Skeleton className="skeleton-wave h-8 w-16" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="skeleton-wave h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Connect third-party services to automate your ISP operations</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />{activeCount} Active
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
            <AlertCircle className="h-3.5 w-3.5" />{inactiveCount} Inactive
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="payment" className="space-y-4">
        <TabsList className="bg-muted p-1 h-auto flex flex-wrap">
          <TabsTrigger value="payment" className="text-xs sm:text-sm gap-1.5"><CreditCard className="h-3.5 w-3.5" />Payment Gateways</TabsTrigger>
          <TabsTrigger value="communication" className="text-xs sm:text-sm gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Communication</TabsTrigger>
          <TabsTrigger value="webhooks" className="text-xs sm:text-sm gap-1.5"><Webhook className="h-3.5 w-3.5" />Webhooks</TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs sm:text-sm gap-1.5"><Receipt className="h-3.5 w-3.5" />Transactions</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Payment Gateways ── */}
        <TabsContent value="payment">
          {/* Monthly Cost Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Card className="border shadow-sm bg-gradient-to-br from-emerald-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100"><Activity className="h-5 w-5 text-emerald-600" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total API Calls</p>
                    <p className="text-xl font-bold text-emerald-700">{data?.stats?.totalApiCalls || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm bg-gradient-to-br from-amber-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100"><DollarSign className="h-5 w-5 text-amber-600" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Est. Monthly Cost</p>
                    <p className="text-xl font-bold text-amber-700">₹{(data?.stats?.totalEstimatedCost || 0).toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm bg-gradient-to-br from-teal-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-teal-100"><Shield className="h-5 w-5 text-teal-600" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">IP Allowlisted</p>
                    <p className="text-xl font-bold text-teal-700">{gateways.filter((g) => g.ipAllowlist).length}/{gateways.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">Select a gateway to configure API keys and enable online payments.</p>
            <Dialog open={addGatewayOpen} onOpenChange={setAddGatewayOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs h-8"><Plus className="h-3 w-3 mr-1" />Add Gateway</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Add Payment Gateway</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div><Label className="text-sm">Provider</Label>
                    <Select value={newGwProvider} onValueChange={setNewGwProvider}><SelectTrigger className="mt-1"><SelectValue placeholder="Select provider" /></SelectTrigger>
                      <SelectContent>{Object.keys(GATEWAY_META).map((p) => (<SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>))}<SelectItem value="custom">Custom Gateway</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-sm">Display Name</Label><Input value={newGwName} onChange={(e) => setNewGwName(e.target.value)} placeholder="e.g. My Payment Gateway" className="mt-1" /></div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setAddGatewayOpen(false); setNewGwProvider(""); setNewGwName(""); }}>Cancel</Button>
                    <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" disabled={!newGwProvider} onClick={() => {
                      const name = newGwName || newGwProvider.charAt(0).toUpperCase() + newGwProvider.slice(1);
                      saveGatewayMutation.mutate({ action: "save_gateway", gatewayId: `new_${Date.now()}`, name, provider: newGwProvider, apiKey: "", apiSecret: "", merchantId: "", environment: "test", enabled: false });
                      setAddGatewayOpen(false); setNewGwProvider(""); setNewGwName("");
                    }}>Add Gateway</Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {gateways.length === 0 ? (
            <Card className="border"><CardContent className="py-16 text-center"><CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-lg font-semibold">No Payment Gateways</p><p className="text-sm text-muted-foreground mt-1">Payment gateways can be configured via the API or settings.</p></CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {gateways.map((gw) => {
                const meta = GATEWAY_META[gw.provider] || GATEWAY_META[gw.id] || { color: "text-gray-600", bgColor: "bg-gray-100", borderColor: "border-gray-300", letter: gw.name.charAt(0).toUpperCase(), badge: "" };
                const status = getGatewayStatus(gw);
                return (
                  <Card key={gw.id} className={`${meta.borderColor} border-2 relative overflow-hidden transition-all hover:shadow-md`}>
                    {meta.badge && <div className="absolute top-3 right-3"><Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">{meta.badge}</Badge></div>}
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-xl ${meta.bgColor} flex items-center justify-center`}><span className={`text-xl font-bold ${meta.color}`}>{meta.letter}</span></div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base">{gw.name}</CardTitle>
                          <div className="mt-1">{getStatusBadge(status)}</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <CardDescription className="text-xs">
                        {status === "not_configured" ? "Configure your API keys to enable payments" : `${gw.environment === "live" ? "Live" : "Test"} mode active`}
                      </CardDescription>
                      {/* Cost tracking */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{gw.apiCalls || 0} calls</span>
                        <span>₹{(gw.estimatedCost || 0).toFixed(2)}</span>
                      </div>
                      {/* IP Allowlist indicator */}
                      {gw.ipAllowlist && <div className="flex items-center gap-1 text-xs text-emerald-600"><Shield className="h-3 w-3" /><span>IP restricted</span></div>}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => openGatewayConfig(gw)}><Settings className="h-3 w-3 mr-1" />Configure</Button>
                        {status !== "not_configured" && (
                          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => testConnection(gw.id)} disabled={testingId === gw.id}>
                            {testingId === gw.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => openLogs(gw.id)} title="View Logs"><FileText className="h-3 w-3" /></Button>
                        <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => openTxnLog(gw.id)} title="Transaction Log"><Receipt className="h-3 w-3" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: Communication ── */}
        <TabsContent value="communication">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">Select a channel to configure credentials and enable notifications.</p>
            <Dialog open={addChannelOpen} onOpenChange={setAddChannelOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs h-8"><Plus className="h-3 w-3 mr-1" />Add Channel</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Add Communication Channel</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div><Label className="text-sm">Provider</Label>
                    <Select value={newChProvider} onValueChange={setNewChProvider}><SelectTrigger className="mt-1"><SelectValue placeholder="Select provider" /></SelectTrigger>
                      <SelectContent>{Object.keys(CHANNEL_META).map((p) => (<SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>))}<SelectItem value="custom">Custom Channel</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-sm">Display Name</Label><Input value={newChName} onChange={(e) => setNewChName(e.target.value)} placeholder="e.g. My SMS Provider" className="mt-1" /></div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setAddChannelOpen(false); setNewChProvider(""); setNewChName(""); }}>Cancel</Button>
                    <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" disabled={!newChProvider} onClick={() => {
                      const name = newChName || newChProvider.charAt(0).toUpperCase() + newChProvider.slice(1);
                      saveChannelMutation.mutate({ action: "save_channel", channelId: `new_ch_${Date.now()}`, name, provider: newChProvider, apiKey: "", apiSecret: "", environment: "live", enabled: false, config: {} });
                      setAddChannelOpen(false); setNewChProvider(""); setNewChName("");
                    }}>Add Channel</Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {channels.length === 0 ? (
            <Card className="border"><CardContent className="py-16 text-center"><MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-lg font-semibold">No Communication Channels</p><p className="text-sm text-muted-foreground mt-1">Click "Add Channel" to set up your first communication channel.</p></CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {channels.map((ch) => {
                const meta = CHANNEL_META[ch.provider] || CHANNEL_META[ch.id] || { icon: Plug, description: "", color: "bg-gray-100 text-gray-600", fields: [] };
                const ChIcon = meta.icon;
                const status = getChannelStatus(ch);
                return (
                  <Card key={ch.id} className="border shadow-sm hover:shadow-md transition-all">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg ${meta.color} flex items-center justify-center`}><ChIcon className="h-5 w-5" /></div>
                        <div className="flex-1"><CardTitle className="text-sm">{ch.name}</CardTitle><div className="mt-1">{getStatusBadge(status)}</div></div>
                      </div>
                      <CardDescription className="mt-2 text-xs">{meta.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{ch.apiCalls || 0} calls</span>
                        <span>₹{(ch.estimatedCost || 0).toFixed(2)}</span>
                      </div>
                      {ch.ipAllowlist && <div className="flex items-center gap-1 text-xs text-emerald-600"><Shield className="h-3 w-3" /><span>IP restricted</span></div>}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => openChannelConfig(ch)}><Settings className="h-3 w-3 mr-1" />Configure</Button>
                        {status === "connected" && (
                          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => testConnection(ch.id)} disabled={testingId === ch.id}>
                            {testingId === ch.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}{testingId === ch.id ? "Testing..." : "Test"}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => openLogs(ch.id)} title="View Logs"><FileText className="h-3 w-3" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 3: Webhooks ── */}
        <TabsContent value="webhooks" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div><CardTitle className="text-base">Webhook Endpoints</CardTitle><CardDescription>Configure URLs to receive real-time event notifications</CardDescription></div>
                <Dialog open={addWebhookOpen} onOpenChange={setAddWebhookOpen}>
                  <DialogTrigger asChild><Button size="sm" className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs h-8"><Plus className="h-3 w-3 mr-1" />Add Webhook</Button></DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>Add Webhook Endpoint</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-2">
                      <div><Label className="text-sm">Endpoint URL *</Label><Input value={newWebhook.url} onChange={(e) => setNewWebhook((prev) => ({ ...prev, url: e.target.value }))} placeholder="https://myapp.com/api/webhooks" className="mt-1" /></div>
                      <div><Label className="text-sm mb-2 block">Events *</Label><div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">{WEBHOOK_EVENTS.map((ev) => (
                        <label key={ev} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"><Checkbox checked={newWebhook.events.includes(ev)} onCheckedChange={() => toggleEvent(ev)} /><code className="text-xs font-mono">{ev}</code></label>
                      ))}</div></div>
                      <div><Label className="text-sm">Secret Key</Label><Input value={newWebhook.secret} onChange={(e) => setNewWebhook((prev) => ({ ...prev, secret: e.target.value }))} placeholder="Auto-generated if left empty" className="mt-1" /></div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAddWebhookOpen(false)}>Cancel</Button>
                        <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => createWebhookMutation.mutate({ action: "create_webhook", url: newWebhook.url, events: newWebhook.events, secret: newWebhook.secret })} disabled={!newWebhook.url || newWebhook.events.length === 0 || createWebhookMutation.isPending}>
                          {createWebhookMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Create Webhook
                        </Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto"><Table><TableHeader><TableRow>
                <TableHead className="text-xs font-medium uppercase">URL</TableHead>
                <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Events</TableHead>
                <TableHead className="text-xs font-medium uppercase">Secret</TableHead>
                <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Last Delivery</TableHead>
                <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Failures</TableHead>
                <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
              </TableRow></TableHeader><TableBody>
                {webhooks.length === 0 ? (<TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No webhooks configured</TableCell></TableRow>) : webhooks.map((wh) => {
                  const events = (() => { try { return JSON.parse(wh.events || "[]"); } catch { return []; } })();
                  return (<TableRow key={wh.id} className="hover:bg-muted/50 transition-colors duration-150">
                    <TableCell><div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="text-xs font-mono max-w-[200px] truncate">{wh.url}</span></div></TableCell>
                    <TableCell className="hidden md:table-cell"><div className="flex flex-wrap gap-1 max-w-[250px]">{events.slice(0, 3).map((ev: string) => (<Badge key={ev} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{ev.split(".")[0]}</Badge>))}{events.length > 3 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{events.length - 3}</Badge>}</div></TableCell>
                    <TableCell><div className="flex items-center gap-1"><code className="text-[10px] font-mono">{showWebhookSecret[wh.id] ? wh.secret : "••••••••••"}</code><Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setShowWebhookSecret((prev) => ({ ...prev, [wh.id]: !prev[wh.id] })); }}>{showWebhookSecret[wh.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</Button><Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(wh.secret, wh.id)}>{copied === wh.id ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}</Button></div></TableCell>
                    <TableCell><Switch checked={wh.enabled} onCheckedChange={() => toggleWebhookMutation.mutate({ action: "toggle_webhook", webhookId: wh.id })} disabled={toggleWebhookMutation.isPending} /></TableCell>
                    <TableCell className="hidden lg:table-cell">{wh.lastDeliveryAt ? (<div className="flex items-center gap-1.5">{wh.successCount > 0 ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <AlertCircle className="h-3 w-3 text-red-500" />}<span className="text-[10px] text-muted-foreground">{formatTimestamp(wh.lastDeliveryAt)}</span></div>) : (<span className="text-xs text-muted-foreground">Never</span>)}</TableCell>
                    <TableCell className="hidden lg:table-cell"><Badge variant={wh.failureCount > 0 ? "destructive" : "outline"} className="text-[10px]">{wh.failureCount}</Badge></TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteWebhookTarget(wh)} disabled={deleteWebhookMutation.isPending}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                  </TableRow>);
                })}
              </TableBody></Table></div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Transactions ── */}
        <TabsContent value="transactions" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Select value={txnGatewayFilter} onValueChange={setTxnGatewayFilter}><SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Filter by gateway" /></SelectTrigger><SelectContent><SelectItem value="all">All Gateways</SelectItem><SelectItem value="razorpay">Razorpay</SelectItem><SelectItem value="stripe">Stripe</SelectItem><SelectItem value="payu">PayU</SelectItem></SelectContent></Select>
            </div>
          </div>
          <Card className="border shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto max-h-[500px] overflow-y-auto"><Table><TableHeader><TableRow>
            <TableHead className="text-xs font-medium uppercase">Ref</TableHead><TableHead className="text-xs font-medium uppercase">Type</TableHead><TableHead className="text-xs font-medium uppercase">Amount</TableHead><TableHead className="text-xs font-medium uppercase">Status</TableHead><TableHead className="text-xs font-medium uppercase">Gateway</TableHead><TableHead className="text-xs font-medium uppercase">Date</TableHead>
          </TableRow></TableHeader><TableBody>
            {txnLoading ? (<TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>) :
            transactions.length === 0 ? (<TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No transactions found</TableCell></TableRow>) :
            transactions.map((txn) => (
              <TableRow key={txn.id} className="hover:bg-muted/50"><TableCell className="text-xs font-mono">{txn.externalRef || txn.id.slice(0, 8)}</TableCell><TableCell className="text-xs">{txn.transactionType}</TableCell><TableCell className="text-xs font-medium">₹{txn.amount.toFixed(2)}</TableCell>
                <TableCell><Badge variant={txn.status === "success" || txn.status === "completed" ? "outline" : "destructive"} className="text-[10px]">{txn.status}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{txn.gatewayType}</TableCell><TableCell className="text-xs text-muted-foreground">{formatTimestamp(txn.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table></div></CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* ── Gateway Config Dialog (with IP Allowlist & Cost) ── */}
      <Dialog open={configDialogOpen} onOpenChange={(open) => { setConfigDialogOpen(open); if (!open) { setConfigGateway(null); setIpError(""); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Configure {configGateway?.name}</DialogTitle></DialogHeader>
          {configGateway && (
            <div className="grid gap-4 py-4">
              <div><Label>API Key</Label><div className="relative mt-1"><Input type={showKeys[configGateway.id] ? "text" : "password"} value={configGateway.apiKey} onChange={(e) => setConfigGateway({ ...configGateway, apiKey: e.target.value })} placeholder="Enter API key" /><Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => { setShowKeys((p) => ({ ...p, [configGateway.id]: !p[configGateway.id] })); }}>{showKeys[configGateway.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</Button></div></div>
              <div><Label>API Secret</Label><Input type="password" value={configGateway.apiSecret} onChange={(e) => setConfigGateway({ ...configGateway, apiSecret: e.target.value })} placeholder="Enter API secret" className="mt-1" /></div>
              <div><Label>Merchant ID</Label><Input value={configGateway.merchantId} onChange={(e) => setConfigGateway({ ...configGateway, merchantId: e.target.value })} placeholder="Merchant ID" className="mt-1" /></div>
              <div><Label>Environment</Label>
                <Select value={configGateway.environment} onValueChange={(v) => setConfigGateway({ ...configGateway, environment: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="test">Test</SelectItem><SelectItem value="live">Live</SelectItem></SelectContent></Select>
              </div>
              {/* IP Allowlist */}
              <div><Label>IP Allowlist</Label><Input value={gwIpAllowlist} onChange={(e) => { setGwIpAllowlist(e.target.value); validateIps(e.target.value); }} placeholder="e.g. 192.168.1.1, 10.0.0.0/24" className="mt-1" /><p className="text-xs text-muted-foreground mt-1">Comma-separated IPs or CIDR ranges. Leave empty to allow all.</p>{ipError && <p className="text-xs text-red-500 mt-1">{ipError}</p>}</div>
              {/* Cost per request */}
              <div><Label>Cost per Request (₹)</Label><Input type="number" step="0.01" value={gwCostPerRequest} onChange={(e) => setGwCostPerRequest(e.target.value)} placeholder="0.00" className="mt-1" /><p className="text-xs text-muted-foreground mt-1">Used to estimate monthly API costs.</p></div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={saveGatewayConfig} disabled={saveGatewayMutation.isPending || !!ipError}>
                  {saveGatewayMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Save
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Channel Config Dialog ── */}
      <Dialog open={channelDialogOpen} onOpenChange={(open) => { setChannelDialogOpen(open); if (!open) { setConfigChannel(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Configure {configChannel?.name}</DialogTitle></DialogHeader>
          {configChannel && (() => {
            const meta = CHANNEL_META[configChannel.provider] || CHANNEL_META[configChannel.id] || { fields: [] };
            return (
              <div className="grid gap-4 py-4">
                {meta.fields.map((field) => (
                  <div key={field.key}><Label>{field.label}</Label><Input type={field.type} value={channelForm[field.key] || ""} onChange={(e) => setChannelForm({ ...channelForm, [field.key]: e.target.value })} className="mt-1" /></div>
                ))}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setChannelDialogOpen(false)}>Cancel</Button>
                  <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={saveChannelConfig} disabled={saveChannelMutation.isPending}>
                    {saveChannelMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Save
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Logs Dialog ── */}
      <Dialog open={logsDialogOpen} onOpenChange={(open) => { setLogsDialogOpen(open); if (!open) { setSelectedLogIntegration(""); setLogPage(1); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>API Call Logs</DialogTitle></DialogHeader>
          {logsLoading ? (<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>) : (
            <div className="space-y-4">
              {integrationLogs.length === 0 ? (<p className="text-center text-muted-foreground py-8 text-sm">No logs found for this integration.</p>) : (
                <div className="max-h-[500px] overflow-y-auto"><Table><TableHeader><TableRow>
                  <TableHead className="text-xs">Time</TableHead><TableHead className="text-xs">Method</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Code</TableHead><TableHead className="text-xs">Duration</TableHead><TableHead className="text-xs">Request</TableHead><TableHead className="text-xs">Response</TableHead><TableHead className="text-xs">Action</TableHead>
                </TableRow></TableHeader><TableBody>
                  {integrationLogs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/50">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTimestamp(log.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{log.method}</Badge></TableCell>
                      <TableCell>{getLogStatusBadge(log.status)}</TableCell>
                      <TableCell className="text-xs">{log.statusCode || "-"}</TableCell>
                      <TableCell className="text-xs">{log.durationMs}ms</TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">{log.requestSummary || "-"}</TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">{log.responseSummary || "-"}</TableCell>
                      <TableCell>
                        {(log.status === "failed") && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => { setRetryingId(log.id); retryLogMutation.mutate(log.id); }} disabled={retryingId === log.id}>
                            {retryingId === log.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}Retry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table></div>
              )}
              {/* Pagination */}
              {logsPagination && logsPagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">Page {logPage} of {logsPagination.totalPages}</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={logPage <= 1} onClick={() => setLogPage((p) => p - 1)}><ChevronLeft className="h-3 w-3" /></Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={logPage >= logsPagination.totalPages} onClick={() => setLogPage((p) => p + 1)}><ChevronRight className="h-3 w-3" /></Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Webhook AlertDialog */}
      <AlertDialog open={!!deleteWebhookTarget} onOpenChange={(open) => { if (!open) setDeleteWebhookTarget(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Webhook</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete this webhook? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={confirmDeleteWebhook}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* ── Transaction Log Dialog ── */}
      <Dialog open={txnLogOpen} onOpenChange={(open) => { setTxnLogOpen(open); if (!open) { setTxnLogGateway(""); setTxnLogFilter("all"); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" />Transaction Log</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                {(["all", "Success", "Failed"] as const).map((f) => (
                  <Button key={f} variant={txnLogFilter === f ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setTxnLogFilter(f)}>{f === "all" ? "All" : f}</Button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={clearTxnLog}><Trash2 className="h-3 w-3" /> Clear Log</Button>
            </div>
            {filteredTxnLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No transactions found.</p>
            ) : (
              <div className="max-h-[400px] overflow-y-auto"><Table><TableHeader><TableRow>
                <TableHead className="text-xs">Timestamp</TableHead>
                <TableHead className="text-xs">Direction</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Payload Summary</TableHead>
                <TableHead className="text-xs">Duration</TableHead>
              </TableRow></TableHeader><TableBody>
                {filteredTxnLogs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/50">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTimestamp(log.timestamp)}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${log.direction === "Sent" ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-green-50 text-green-700 border-green-200"}`}>{log.direction === "Sent" ? <ArrowUpRight className="h-2.5 w-2.5 inline mr-0.5" /> : <ArrowDownRight className="h-2.5 w-2.5 inline mr-0.5" />}{log.direction}</Badge></TableCell>
                    <TableCell><Badge className={`text-[10px] ${log.status === "Success" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{log.status}</Badge></TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{log.payload}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.duration}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table></div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default IntegrationsPage;
