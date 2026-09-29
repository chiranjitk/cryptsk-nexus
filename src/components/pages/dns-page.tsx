"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Globe, Search, Plus, Trash2, Edit, RefreshCw, Server, Shield, Copy,
  CheckCircle, XCircle, Clock, ArrowUpDown, Play, Zap, Wifi,
  ChevronRight, X, AlertTriangle, Loader2, FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useModuleStore } from "@/store/module-store";

// ─── Types ───────────────────────────────────────────────────────
interface DnsRecord {
  id: string;
  type: string;
  name: string;
  value: string;
  priority?: number;
  ttl: number;
  enabled: boolean;
  interfaceName?: string;
  portalName?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DnsConfig {
  upstreamServers: { address: string; priority: number }[];
  localDomain: string;
  localResolutionEnabled: boolean;
  dnsmasqConfig: string;
  serviceStatus: "running" | "stopped" | "restarting" | "unknown";
}

interface DnsTestResult {
  query: string;
  type: string;
  answer: string;
  time: number;
  status: "success" | "error" | "timeout";
  timestamp: string;
}

interface CaptivePortalRecord {
  id: string;
  portalName: string;
  domain: string;
  ip: string;
  enabled: boolean;
  status: string;
}

interface DnsRecordsResponse {
  records: DnsRecord[];
  stats: {
    total: number;
    aRecords: number;
    cnameRecords: number;
    otherRecords: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  A: "bg-blue-100 text-blue-700 border-blue-200",
  AAAA: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CNAME: "bg-amber-100 text-amber-700 border-amber-200",
  MX: "bg-red-100 text-red-700 border-red-200",
  TXT: "bg-slate-100 text-slate-700 border-slate-200",
  SRV: "bg-purple-100 text-purple-700 border-purple-200",
};

const TYPE_DEFAULT: Record<string, string> = {
  A: "bg-slate-100 text-slate-600 border-slate-200",
};

function getTypeBadgeClass(type: string): string {
  return TYPE_COLORS[type] || TYPE_DEFAULT["A"];
}

const TTL_PRESETS = [
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
  { label: "15 min", value: 900 },
  { label: "1 hour", value: 3600 },
  { label: "1 day", value: 86400 },
];

const PRESET_DNS_SERVERS = [
  { name: "Cloudflare", address: "1.1.1.1" },
  { name: "Google", address: "8.8.8.8" },
  { name: "Quad9", address: "9.9.9.9" },
];

const CAPTIVE_DOMAINS = [
  "captive.apple.com",
  "connectivitycheck.gstatic.com",
  "detectportal.firefox.com",
  "msftconnecttest.com",
];

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV"];

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient,
  delay,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  gradient: string;
  delay: number;
}) {
  return (
    <Card
      className={`${gradient} border-0 shadow-lg animate-card-enter`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">
              {title}
            </p>
            <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
            <p className="text-xs mt-1 opacity-75">{subtitle}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── DNS Page ────────────────────────────────────────────────────
export default function DnsPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  const [tab, setTab] = useState("records");
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Records Tab State ────────────────────────────────────────
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DnsRecord | null>(null);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(
    new Set()
  );
  const [recordForm, setRecordForm] = useState({
    type: "A",
    name: "",
    value: "",
    priority: 10,
    ttl: 3600,
    interfaceName: "",
    portalName: "",
    description: "",
    enabled: true,
  });

  // ─── DNS Config Tab State ────────────────────────────────────
  const [configPreviewOpen, setConfigPreviewOpen] = useState(false);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [newUpstream, setNewUpstream] = useState({ address: "", priority: 1 });
  const [localDomain, setLocalDomain] = useState("");

  // ─── DNS Test Tab State ──────────────────────────────────────
  const [testDomain, setTestDomain] = useState("");
  const [testType, setTestType] = useState("A");
  const [batchDomains, setBatchDomains] = useState("");

  // ─── Captive Portal Tab State ────────────────────────────────
  const [captiveDialogOpen, setCaptiveDialogOpen] = useState(false);
  const [captiveForm, setCaptiveForm] = useState({
    portalName: "",
    domain: "",
    ip: "",
  });

  // ─── Queries ─────────────────────────────────────────────────
  const {
    data: recordsData,
    isLoading: recordsLoading,
    refetch: refetchRecords,
  } = useQuery<DnsRecordsResponse>({
    queryKey: ["dns-records"],
    queryFn: () => apiFetch<DnsRecordsResponse>("/api/dns?section=records"),
    refetchInterval: 30000,
  });

  const { data: configData, isLoading: configLoading } = useQuery<DnsConfig>({
    queryKey: ["dns-config"],
    queryFn: () => apiFetch<DnsConfig>("/api/dns?section=config"),
    refetchInterval: 15000,
  });

  const records = recordsData?.records || [];
  const stats = recordsData?.stats || {
    total: 0,
    aRecords: 0,
    cnameRecords: 0,
    otherRecords: 0,
  };

  const filteredRecords = records.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.value.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q)
    );
  });

  // ─── Mutations ───────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/dns", {
        method: "POST",
        body: JSON.stringify({ action: "create-record", ...body }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("DNS record created successfully");
        setRecordDialogOpen(false);
        resetRecordForm();
        queryClient.invalidateQueries({ queryKey: ["dns-records"] });
      } else {
        toast.error(d.error || "Failed to create record");
      }
    },
    onError: () => toast.error("Failed to create DNS record"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; [key: string]: unknown }) =>
      apiFetch("/api/dns", {
        method: "PUT",
        body: JSON.stringify({ id, ...payload }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("DNS record updated");
        setRecordDialogOpen(false);
        setEditingRecord(null);
        resetRecordForm();
        queryClient.invalidateQueries({ queryKey: ["dns-records"] });
      } else {
        toast.error(d.error || "Failed to update record");
      }
    },
    onError: () => toast.error("Failed to update DNS record"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/dns?id=${id}`, { method: "DELETE" }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("DNS record deleted");
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: ["dns-records"] });
      } else {
        toast.error(d.error || "Failed to delete");
      }
    },
    onError: () => toast.error("Failed to delete DNS record"),
  });

  const bulkEnableMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/dns", {
        method: "POST",
        body: JSON.stringify({ action: "bulk-enable", ids }),
      }),
    onSuccess: () => {
      toast.success("Selected records enabled");
      setSelectedRecords(new Set());
      queryClient.invalidateQueries({ queryKey: ["dns-records"] });
    },
    onError: () => toast.error("Bulk enable failed"),
  });

  const bulkDisableMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/dns", {
        method: "POST",
        body: JSON.stringify({ action: "bulk-disable", ids }),
      }),
    onSuccess: () => {
      toast.success("Selected records disabled");
      setSelectedRecords(new Set());
      queryClient.invalidateQueries({ queryKey: ["dns-records"] });
    },
    onError: () => toast.error("Bulk disable failed"),
  });

  const testMutation = useMutation({
    mutationFn: ({ domain, type }: { domain: string; type: string }) =>
      apiFetch("/api/dns", {
        method: "POST",
        body: JSON.stringify({ action: "test-resolution", domain, type }),
      }),
  });

  const reloadMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/dns", {
        method: "POST",
        body: JSON.stringify({ action: "reload-dnsmasq" }),
      }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("dnsmasq reloaded successfully");
        setReloadConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ["dns-config"] });
      } else {
        toast.error(d.error || "Reload failed");
      }
    },
    onError: () => toast.error("Failed to reload dnsmasq"),
  });

  const generateConfigMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/dns", {
        method: "POST",
        body: JSON.stringify({ action: "generate-config" }),
      }),
    onSuccess: (d: any) => {
      if (d.config) {
        setConfigPreviewOpen(true);
      } else {
        toast.error(d.error || "Failed to generate config");
      }
    },
    onError: () => toast.error("Failed to generate config"),
  });

  const addCaptiveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/dns", {
        method: "POST",
        body: JSON.stringify({ action: "add-captive-record", ...body }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("Captive portal detection record added");
        setCaptiveDialogOpen(false);
        setCaptiveForm({ portalName: "", domain: "", ip: "" });
        queryClient.invalidateQueries({ queryKey: ["dns-records"] });
      } else {
        toast.error(d.error || "Failed to add record");
      }
    },
    onError: () => toast.error("Failed to add captive portal record"),
  });

  // ─── Test history ────────────────────────────────────────────
  const [testHistory, setTestHistory] = useState<DnsTestResult[]>([]);

  function handleResolve() {
    if (!testDomain.trim()) {
      toast.error("Please enter a domain");
      return;
    }
    testMutation.mutate(
      { domain: testDomain, type: testType },
      {
        onSuccess: (result: any) => {
          const entry: DnsTestResult = {
            query: testDomain,
            type: testType,
            answer: result.answer || result.data || "No result",
            time: result.time || 0,
            status: result.status || (result.answer ? "success" : "error"),
            timestamp: new Date().toISOString(),
          };
          setTestHistory((prev) => [entry, ...prev].slice(0, 10));
        },
        onError: () => {
          const entry: DnsTestResult = {
            query: testDomain,
            type: testType,
            answer: "Resolution failed",
            time: 0,
            status: "error",
            timestamp: new Date().toISOString(),
          };
          setTestHistory((prev) => [entry, ...prev].slice(0, 10));
        },
      }
    );
  }

  function handleBatchResolve() {
    const domains = batchDomains
      .split("\n")
      .map((d) => d.trim())
      .filter(Boolean);
    if (domains.length === 0) {
      toast.error("Enter at least one domain");
      return;
    }
    domains.forEach((domain) => {
      testMutation.mutate(
        { domain, type: "A" },
        {
          onSuccess: (result: any) => {
            const entry: DnsTestResult = {
              query: domain,
              type: "A",
              answer: result.answer || result.data || "No result",
              time: result.time || 0,
              status: result.status || (result.answer ? "success" : "error"),
              timestamp: new Date().toISOString(),
            };
            setTestHistory((prev) => [entry, ...prev].slice(0, 10));
          },
          onError: () => {
            const entry: DnsTestResult = {
              query: domain,
              type: "A",
              answer: "Resolution failed",
              time: 0,
              status: "error",
              timestamp: new Date().toISOString(),
            };
            setTestHistory((prev) => [entry, ...prev].slice(0, 10));
          },
        }
      );
    });
    toast.success(`Resolving ${domains.length} domains...`);
  }

  // ─── Helpers ─────────────────────────────────────────────────
  function resetRecordForm() {
    setRecordForm({
      type: "A",
      name: "",
      value: "",
      priority: 10,
      ttl: 3600,
      interfaceName: "",
      portalName: "",
      description: "",
      enabled: true,
    });
    setEditingRecord(null);
  }

  function openRecordDialog(record?: DnsRecord) {
    if (record) {
      setEditingRecord(record);
      setRecordForm({
        type: record.type,
        name: record.name,
        value: record.value,
        priority: record.priority || 10,
        ttl: record.ttl,
        interfaceName: record.interfaceName || "",
        portalName: record.portalName || "",
        description: record.description || "",
        enabled: record.enabled,
      });
    } else {
      resetRecordForm();
    }
    setRecordDialogOpen(true);
  }

  function handleSaveRecord() {
    if (!recordForm.name || !recordForm.value) {
      toast.error("Name and Value are required");
      return;
    }
    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, ...recordForm });
    } else {
      createMutation.mutate(recordForm);
    }
  }

  function toggleSelect(id: string) {
    setSelectedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Copied to clipboard");
    });
  }

  const config = configData || {
    upstreamServers: [],
    localDomain: "",
    localResolutionEnabled: false,
    dnsmasqConfig: "",
    serviceStatus: "unknown" as const,
  };

  // Get captive portal records from the full records list
  const captiveRecords = records.filter(
    (r) =>
      r.portalName ||
      CAPTIVE_DOMAINS.some((d) => r.name.toLowerCase().includes(d))
  );

  // ─── Loading State ───────────────────────────────────────────
  if (recordsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="skeleton-wave h-10 w-full" />
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full mb-2" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            DNS Server Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage DNS records, dnsmasq configuration, and captive portal
            resolution
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => refetchRecords()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog
            open={recordDialogOpen}
            onOpenChange={(o) => {
              setRecordDialogOpen(o);
              if (!o) resetRecordForm();
            }}
          >
            <DialogTrigger asChild>
              <Button
                className="bg-destructive hover:bg-destructive/90 text-white"
                onClick={() => openRecordDialog()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Record
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingRecord ? "Edit DNS Record" : "Add DNS Record"}
                </DialogTitle>
                <DialogDescription>
                  {editingRecord
                    ? "Update an existing DNS record"
                    : "Create a new DNS record"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">
                      Record Type *
                    </Label>
                    <Select
                      value={recordForm.type}
                      onValueChange={(v) =>
                        setRecordForm({ ...recordForm, type: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECORD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">
                      TTL
                    </Label>
                    <Select
                      value={String(recordForm.ttl)}
                      onValueChange={(v) =>
                        setRecordForm({ ...recordForm, ttl: parseInt(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TTL_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={String(p.value)}>
                            {p.label} ({p.value}s)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">
                    Name (Domain) *
                  </Label>
                  <Input
                    value={recordForm.name}
                    onChange={(e) =>
                      setRecordForm({ ...recordForm, name: e.target.value })
                    }
                    placeholder="portal.cryptsk.local"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">
                    Value *
                  </Label>
                  <Input
                    value={recordForm.value}
                    onChange={(e) =>
                      setRecordForm({ ...recordForm, value: e.target.value })
                    }
                    placeholder={
                      recordForm.type === "A"
                        ? "192.168.1.1"
                        : recordForm.type === "CNAME"
                          ? "server.cryptsk.local"
                          : "value"
                    }
                  />
                </div>

                {(recordForm.type === "MX" ||
                  recordForm.type === "SRV") && (
                  <div>
                    <Label className="text-sm font-medium mb-1 block">
                      Priority
                    </Label>
                    <Input
                      type="number"
                      value={recordForm.priority}
                      onChange={(e) =>
                        setRecordForm({
                          ...recordForm,
                          priority: parseInt(e.target.value) || 10,
                        })
                      }
                      min={0}
                      max={65535}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">
                      Interface (optional)
                    </Label>
                    <Input
                      value={recordForm.interfaceName}
                      onChange={(e) =>
                        setRecordForm({
                          ...recordForm,
                          interfaceName: e.target.value,
                        })
                      }
                      placeholder="eth0"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">
                      Captive Portal (optional)
                    </Label>
                    <Input
                      value={recordForm.portalName}
                      onChange={(e) =>
                        setRecordForm({
                          ...recordForm,
                          portalName: e.target.value,
                        })
                      }
                      placeholder="Guest Portal"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1 block">
                    Description
                  </Label>
                  <Input
                    value={recordForm.description}
                    onChange={(e) =>
                      setRecordForm({
                        ...recordForm,
                        description: e.target.value,
                      })
                    }
                    placeholder="Optional description"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={recordForm.enabled}
                    onCheckedChange={(v) =>
                      setRecordForm({ ...recordForm, enabled: v })
                    }
                  />
                  <Label className="text-sm font-medium">Enabled</Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRecordDialogOpen(false);
                    resetRecordForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-destructive hover:bg-destructive/90 text-white"
                  onClick={handleSaveRecord}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingRecord
                      ? "Update"
                      : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Records"
          value={stats.total}
          subtitle="DNS records configured"
          icon={Globe}
          gradient="stat-gradient-red"
          delay={0}
        />
        <StatCard
          title="A Records"
          value={stats.aRecords}
          subtitle="IPv4 address mappings"
          icon={Server}
          gradient="stat-gradient-blue"
          delay={75}
        />
        <StatCard
          title="CNAME Records"
          value={stats.cnameRecords}
          subtitle="Alias mappings"
          icon={ArrowUpDown}
          gradient="stat-gradient-amber"
          delay={150}
        />
        <StatCard
          title="Other Records"
          value={stats.otherRecords}
          subtitle="MX / TXT / SRV / AAAA"
          icon={Shield}
          gradient="stat-gradient-green"
          delay={225}
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="records">DNS Records</TabsTrigger>
          <TabsTrigger value="config">DNS Config</TabsTrigger>
          <TabsTrigger value="test">DNS Test</TabsTrigger>
          <TabsTrigger value="captive">Captive Portal DNS</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: DNS Records ────────────────────────────────── */}
        <TabsContent value="records">
          {/* Search & Bulk Actions */}
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or value..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {selectedRecords.size > 0 && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        bulkEnableMutation.mutate(
                          Array.from(selectedRecords)
                        )
                      }
                      disabled={bulkEnableMutation.isPending}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                      Enable ({selectedRecords.size})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        bulkDisableMutation.mutate(
                          Array.from(selectedRecords)
                        )
                      }
                      disabled={bulkDisableMutation.isPending}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      Disable ({selectedRecords.size})
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Records Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            filteredRecords.length > 0 &&
                            filteredRecords.every((r) =>
                              selectedRecords.has(r.id)
                            )
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedRecords(
                                new Set(filteredRecords.map((r) => r.id))
                              );
                            } else {
                              setSelectedRecords(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase">
                        Type
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase">
                        Name
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase">
                        Value
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase">
                        Priority
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase">
                        TTL
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase">
                        Scope
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="text-center py-12 text-muted-foreground"
                        >
                          No DNS records found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecords.map((record) => (
                        <TableRow
                          key={record.id}
                          className="hover:bg-muted/50 transition-colors duration-150"
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedRecords.has(record.id)}
                              onCheckedChange={() => toggleSelect(record.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs font-semibold ${getTypeBadgeClass(record.type)}`}
                            >
                              {record.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium font-mono truncate max-w-[200px]">
                                {record.name}
                              </span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 shrink-0"
                                      onClick={() =>
                                        copyToClipboard(record.name)
                                      }
                                    >
                                      <Copy className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Copy name
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-mono truncate max-w-[200px]">
                                {record.value}
                              </span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 shrink-0"
                                      onClick={() =>
                                        copyToClipboard(record.value)
                                      }
                                    >
                                      <Copy className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Copy value
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {(record.type === "MX" || record.type === "SRV") &&
                            record.priority
                              ? record.priority
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                    {record.ttl >= 3600
                                      ? `${Math.round(record.ttl / 3600)}h`
                                      : record.ttl >= 60
                                        ? `${Math.round(record.ttl / 60)}m`
                                        : `${record.ttl}s`}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  TTL: {record.ttl} seconds
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              {record.interfaceName && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] w-fit"
                                >
                                  {record.interfaceName}
                                </Badge>
                              )}
                              {record.portalName && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] w-fit bg-orange-50 text-orange-600 border-orange-200"
                                >
                                  <Wifi className="h-2.5 w-2.5 mr-0.5" />
                                  {record.portalName}
                                </Badge>
                              )}
                              {!record.interfaceName && !record.portalName && (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {record.enabled ? (
                              <Badge
                                variant="outline"
                                className="badge-active text-xs"
                              >
                                <CheckCircle className="h-3 w-3 mr-0.5" />
                                Active
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="badge-suspended text-xs"
                              >
                                <XCircle className="h-3 w-3 mr-0.5" />
                                Disabled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() =>
                                        openRecordDialog(record)
                                      }
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit record</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => setDeleteTarget(record)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete record</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: DNS Config ─────────────────────────────────── */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* dnsmasq Service Status */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  dnsmasq Service
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-3 w-3 rounded-full ${config.serviceStatus === "running" ? "bg-green-500 animate-pulse" : config.serviceStatus === "stopped" ? "bg-red-500" : "bg-amber-500"}`}
                  />
                  <span className="text-sm font-medium capitalize">
                    dnsmasq is {config.serviceStatus}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      config.serviceStatus === "running"
                        ? "badge-active text-xs"
                        : "badge-suspended text-xs"
                    }
                  >
                    {config.serviceStatus}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateConfigMutation.mutate()}
                    disabled={generateConfigMutation.isPending}
                  >
                    {generateConfigMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Generate Config
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReloadConfirmOpen(true)}
                    disabled={reloadMutation.isPending}
                  >
                    {reloadMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Reload dnsmasq
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Local Domain Zone */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Local Domain Zone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1 block">
                    Domain Name
                  </Label>
                  <Input
                    value={config.localDomain || localDomain}
                    onChange={(e) => setLocalDomain(e.target.value)}
                    placeholder="cryptsk.local"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Local domain for resolving internal hostnames
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={config.localResolutionEnabled}
                    disabled
                  />
                  <Label className="text-sm font-medium">
                    Enable local resolution
                  </Label>
                </div>
              </CardContent>
            </Card>

            {/* Upstream DNS Servers */}
            <Card className="border shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Upstream DNS Servers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preset servers */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    Quick Add Presets
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_DNS_SERVERS.map((srv) => (
                      <Button
                        key={srv.address}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const exists = config.upstreamServers.some(
                            (s) => s.address === srv.address
                          );
                          if (exists) {
                            toast.info(`${srv.name} already configured`);
                            return;
                          }
                          setNewUpstream({
                            address: srv.address,
                            priority: 1,
                          });
                          toast.info(
                            `${srv.name} (${srv.address}) ready to add`
                          );
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {srv.name} ({srv.address})
                      </Button>
                    ))}
                  </div>
                </div>

                {/* IPv6 DNS Presets */}
                {isModuleEnabled("ipv6") && (
                  <div className="space-y-2 mt-3 pt-3 border-t">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Globe className="h-4 w-4 text-cyan-600" />
                      IPv6 DNS Presets
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "Cloudflare IPv6", value: "2606:4700:4700::1111" },
                        { label: "Google IPv6", value: "2001:4860:4860::8888" },
                        { label: "Quad9 IPv6", value: "2620:fe::fe" },
                      ].map((preset) => (
                        <button key={preset.value} type="button" onClick={() => {
                          const exists = config.upstreamServers.some((s) => s.address === preset.value);
                          if (exists) {
                            toast.info(`${preset.label} already configured`);
                            return;
                          }
                          setNewUpstream({ address: preset.value, priority: 1 });
                          toast.info(`${preset.label} (${preset.value}) ready to add`);
                        }} className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md hover:bg-muted/50 text-xs">
                          <Plus className="h-3 w-3" />
                          {preset.label}
                          <span className="font-mono text-muted-foreground">{preset.value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add upstream form */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      value={newUpstream.address}
                      onChange={(e) =>
                        setNewUpstream({
                          ...newUpstream,
                          address: e.target.value,
                        })
                      }
                      placeholder="DNS server IP (e.g., 1.1.1.1)"
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      value={newUpstream.priority}
                      onChange={(e) =>
                        setNewUpstream({
                          ...newUpstream,
                          priority: parseInt(e.target.value) || 1,
                        })
                      }
                      placeholder="Priority"
                      min={1}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!newUpstream.address}
                    onClick={() => {
                      if (!newUpstream.address) return;
                      createMutation.mutate({
                        type: "A",
                        name: "upstream",
                        value: newUpstream.address,
                        priority: newUpstream.priority,
                        ttl: 86400,
                        enabled: true,
                        description: `Upstream DNS: ${newUpstream.address}`,
                      });
                      setNewUpstream({ address: "", priority: 1 });
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Server list */}
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium uppercase">
                          Address
                        </TableHead>
                        <TableHead className="text-xs font-medium uppercase">
                          Priority
                        </TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!config.upstreamServers ||
                        config.upstreamServers.length === 0) && (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center py-6 text-muted-foreground text-sm"
                          >
                            No upstream DNS servers configured
                          </TableCell>
                        </TableRow>
                      )}
                      {config.upstreamServers?.map((srv, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">
                            {srv.address}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {srv.priority}
                          </TableCell>
                          <TableCell className="text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      testMutation.mutate(
                                        {
                                          domain: "test.local",
                                          type: "A",
                                        },
                                        {
                                          onSuccess: () =>
                                            toast.success(
                                              `Tested ${srv.address}`
                                            ),
                                          onError: () =>
                                            toast.error(
                                              `Test failed for ${srv.address}`
                                            ),
                                        }
                                      );
                                    }}
                                  >
                                    <Play className="h-3 w-3 mr-1" />
                                    Test
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Test DNS server connectivity
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* dnsmasq Config Preview */}
            <Card className="border shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  dnsmasq Configuration
                </CardTitle>
              </CardHeader>
              <CardContent>
                {configLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : config.dnsmasqConfig ? (
                  <pre className="bg-muted/50 border rounded-lg p-4 text-sm font-mono overflow-auto max-h-96 text-foreground whitespace-pre-wrap">
                    {config.dnsmasqConfig}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">
                    No configuration available. Click &quot;Generate Config&quot; to
                    create a dnsmasq configuration.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Tab 3: DNS Test ────────────────────────────────────── */}
        <TabsContent value="test">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Single Test */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  DNS Lookup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1 block">
                    Domain
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={testDomain}
                      onChange={(e) => setTestDomain(e.target.value)}
                      placeholder="example.com"
                      onKeyDown={(e) => e.key === "Enter" && handleResolve()}
                      className="flex-1"
                    />
                    <Select value={testType} onValueChange={setTestType}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["A", "AAAA", "CNAME", "MX", "TXT", "ANY"].map(
                          (t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleResolve}
                      disabled={testMutation.isPending || !testDomain.trim()}
                      className="bg-destructive hover:bg-destructive/90 text-white"
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Result Card */}
                {testMutation.isPending && (
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resolving...
                    </div>
                  </div>
                )}
                {testMutation.data && (
                  <div className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase">
                        Result
                      </span>
                      {testMutation.data.status === "success" ? (
                        <Badge variant="outline" className="badge-active text-xs">
                          <CheckCircle className="h-3 w-3 mr-0.5" />
                          Success
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="badge-suspended text-xs"
                        >
                          <XCircle className="h-3 w-3 mr-0.5" />
                          Failed
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Query:</span>{" "}
                        <span className="font-mono">{testMutation.data.query || testDomain}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>{" "}
                        <span className="font-mono">{testMutation.data.type || testType}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Answer:</span>
                        <span className="font-mono text-green-600 ml-1">
                          {testMutation.data.answer || "No result"}
                        </span>
                      </div>
                      {testMutation.data.time != null && (
                        <div>
                          <span className="text-muted-foreground">Time:</span>{" "}
                          <span className="font-mono">
                            {testMutation.data.time}ms
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Batch Test */}
                <div>
                  <Label className="text-sm font-medium mb-1 block">
                    Batch Test
                  </Label>
                  <Textarea
                    value={batchDomains}
                    onChange={(e) => setBatchDomains(e.target.value)}
                    placeholder={"example.com\ngoogle.com\ncryptsk.local"}
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={handleBatchResolve}
                    disabled={!batchDomains.trim() || testMutation.isPending}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    Resolve All Domains
                  </Button>
                  {isModuleEnabled("ipv6") && (
                    <button type="button" onClick={() => {
                      const domains = batchDomains.split("\n").map((d) => d.trim()).filter(Boolean);
                      if (domains.length === 0) {
                        toast.error("Enter at least one domain");
                        return;
                      }
                      domains.forEach((domain) => {
                        testMutation.mutate(
                          { domain, type: "AAAA" },
                          {
                            onSuccess: (result: any) => {
                              const entry: DnsTestResult = {
                                query: domain,
                                type: "AAAA",
                                answer: result.answer || result.data || "No result",
                                time: result.time || 0,
                                status: result.status || (result.answer ? "success" : "error"),
                                timestamp: new Date().toISOString(),
                              };
                              setTestHistory((prev) => [entry, ...prev].slice(0, 10));
                            },
                            onError: () => {
                              const entry: DnsTestResult = {
                                query: domain,
                                type: "AAAA",
                                answer: "Resolution failed",
                                time: 0,
                                status: "error",
                                timestamp: new Date().toISOString(),
                              };
                              setTestHistory((prev) => [entry, ...prev].slice(0, 10));
                            },
                          }
                        );
                      });
                      toast.success(`Resolving ${domains.length} domains (AAAA)...`);
                    }} className="text-xs px-2 py-1.5 border rounded-md hover:bg-muted/50 mt-2 ml-2">
                      Test AAAA Records
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Lookups */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Recent Lookups
                </CardTitle>
              </CardHeader>
              <CardContent>
                {testHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No lookups yet. Use the form to resolve domains.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {testHistory.map((entry, idx) => (
                      <div
                        key={idx}
                        className="border rounded-lg p-3 space-y-1.5 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">
                              {entry.query}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${getTypeBadgeClass(entry.type)}`}
                            >
                              {entry.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {entry.status === "success" ? (
                              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            )}
                            <span className="text-xs text-muted-foreground">
                              {entry.time}ms
                            </span>
                          </div>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          {entry.answer}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Tab 4: Captive Portal DNS ──────────────────────────── */}
        <TabsContent value="captive">
          <div className="space-y-4">
            {/* Auto-generated detection domains */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-muted-foreground" />
                    Captive Portal Detection Domains
                  </CardTitle>
                  <Dialog
                    open={captiveDialogOpen}
                    onOpenChange={(o) => {
                      setCaptiveDialogOpen(o);
                      if (!o)
                        setCaptiveForm({
                          portalName: "",
                          domain: "",
                          ip: "",
                        });
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCaptiveDialogOpen(true)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add Detection Record
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Captive Detection Record</DialogTitle>
                        <DialogDescription>
                          Map a captive portal detection domain to a portal
                          gateway IP
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div>
                          <Label className="text-sm font-medium mb-1 block">
                            Portal Name
                          </Label>
                          <Input
                            value={captiveForm.portalName}
                            onChange={(e) =>
                              setCaptiveForm({
                                ...captiveForm,
                                portalName: e.target.value,
                              })
                            }
                            placeholder="Guest Portal"
                          />
                        </div>
                        <div>
                          <Label className="text-sm font-medium mb-1 block">
                            Detection Domain
                          </Label>
                          <Select
                            value={captiveForm.domain}
                            onValueChange={(v) =>
                              setCaptiveForm({ ...captiveForm, domain: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select domain" />
                            </SelectTrigger>
                            <SelectContent>
                              {CAPTIVE_DOMAINS.map((d) => (
                                <SelectItem key={d} value={d}>
                                  {d}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-sm font-medium mb-1 block">
                            Portal Gateway IP
                          </Label>
                          <Input
                            value={captiveForm.ip}
                            onChange={(e) =>
                              setCaptiveForm({
                                ...captiveForm,
                                ip: e.target.value,
                              })
                            }
                            placeholder="192.168.1.1"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setCaptiveDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="bg-destructive hover:bg-destructive/90 text-white"
                          onClick={() => addCaptiveMutation.mutate(captiveForm)}
                          disabled={addCaptiveMutation.isPending}
                        >
                          {addCaptiveMutation.isPending
                            ? "Adding..."
                            : "Add Record"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    Standard captive portal detection domains that should resolve
                    to the portal gateway IP. These domains are used by
                    operating systems to detect captive portals.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CAPTIVE_DOMAINS.map((domain) => {
                      const matched = records.find(
                        (r) => r.name.toLowerCase() === domain.toLowerCase()
                      );
                      return (
                        <div
                          key={domain}
                          className="flex items-center justify-between border rounded-lg p-3"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {matched ? (
                              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            )}
                            <span className="text-sm font-mono truncate">
                              {domain}
                            </span>
                          </div>
                          {matched && (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-mono text-muted-foreground">
                                → {matched.value}
                              </span>
                              <Badge
                                variant="outline"
                                className={
                                  matched.enabled
                                    ? "badge-active text-[10px]"
                                    : "badge-suspended text-[10px]"
                                }
                              >
                                {matched.enabled ? "Active" : "Disabled"}
                              </Badge>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Portal-scoped records table */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Portal-scoped DNS Records
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium uppercase">
                          Portal
                        </TableHead>
                        <TableHead className="text-xs font-medium uppercase">
                          Domain
                        </TableHead>
                        <TableHead className="text-xs font-medium uppercase">
                          IP Address
                        </TableHead>
                        <TableHead className="text-xs font-medium uppercase">
                          Status
                        </TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {captiveRecords.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center py-8 text-muted-foreground text-sm"
                          >
                            No portal-scoped DNS records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        captiveRecords.map((record) => (
                          <TableRow
                            key={record.id}
                            className="hover:bg-muted/50 transition-colors duration-150"
                          >
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Wifi className="h-3.5 w-3.5 text-orange-500" />
                                <span className="text-sm font-medium">
                                  {record.portalName || "—"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {record.name}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {record.value}
                            </TableCell>
                            <TableCell>
                              {record.enabled ? (
                                <Badge
                                  variant="outline"
                                  className="badge-active text-xs"
                                >
                                  Active
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="badge-suspended text-xs"
                                >
                                  Disabled
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() =>
                                    updateMutation.mutate({
                                      id: record.id,
                                      enabled: !record.enabled,
                                    })
                                  }
                                >
                                  {record.enabled ? (
                                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                                  ) : (
                                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setDeleteTarget(record)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Config Preview Dialog */}
      <Dialog open={configPreviewOpen} onOpenChange={setConfigPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generated dnsmasq Configuration</DialogTitle>
            <DialogDescription>
              Preview of the generated dnsmasq configuration file
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg bg-muted/30 p-4 max-h-[500px] overflow-auto">
            <pre className="text-sm font-mono whitespace-pre-wrap">
              {generateConfigMutation.data?.config ||
                "# Configuration not yet generated"}
            </pre>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                copyToClipboard(
                  generateConfigMutation.data?.config ||
                    "# No config"
                );
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Config
            </Button>
            <Button onClick={() => setConfigPreviewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reload Confirmation */}
      <AlertDialog
        open={reloadConfirmOpen}
        onOpenChange={setReloadConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reload dnsmasq?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restart the dnsmasq service to apply any configuration
              changes. Active DNS queries may briefly be interrupted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reloadMutation.mutate()}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Reload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete DNS Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the{" "}
              <strong>{deleteTarget?.type}</strong> record for{" "}
              <strong className="font-mono">{deleteTarget?.name}</strong>. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
