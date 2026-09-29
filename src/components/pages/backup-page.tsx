"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  HardDrive,
  RefreshCw,
  Archive,
  Download,
  Database,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  Zap,
  Trash2,
  Settings,
  Wifi,
  Wrench,
  RotateCcw,
  ChevronRight,
  Cloud,
  CloudOff,
  Upload,
  Plug,
  Lock,
  ShieldCheck as ShieldCheckIcon,
  Info,
  Cpu,
  MemoryStick,
  Monitor,
  Activity,
  Globe,
  Key,
  Copy,
  Check,
  Disc3,
  ThermometerSun,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
  AreaChart, Area, BarChart, Bar, Cell, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────
interface BackupRecord {
  id: string;
  dateTime: string;
  type: "Auto" | "Manual";
  size: string;
  sizeBytes: number;
  duration: string;
  status: "Success" | "Failed" | "In Progress";
  location: string;
  encrypted?: boolean;
  changeCount?: number;
  verified?: boolean;
  backupMode?: "Full" | "Incremental";
  filePath?: string;
}

interface SystemInfo {
  database: {
    status: string; type: string; health: string; size: number; sizeFormatted: string;
    subscriberCount: number; activeSubscribers: number; invoiceCount: number;
    unpaidInvoices: number; totalRevenue: number; totalCollected: number;
    paymentCount: number; complaintCount: number; openComplaints: number;
    deviceCount: number; onlineDevices: number; auditCount: number;
    planCount: number; areaCount: number; collectionRate: number;
  };
  server: { uptime: number; memoryUsage: { rss: number; heapTotal: number; heapUsed: number }; platform: string; nodeVersion: string };
  tables: { name: string; count: number }[];
}

interface HealthData {
  cpu: { usage: number; cores: number };
  memory: { rss: number; heapUsed: number; heapTotal: number; external: number; rssFormatted: string; heapUsedFormatted: string; heapTotalFormatted: string; usagePercent: number; totalFormatted: string };
  disk: { dbSize: number; dbSizeFormatted: string; usagePercent: number; totalFormatted: string };
  uptime: number;
  uptimeFormatted: string;
  history: { hour: string; cpu: number; memory: number; disk: number }[];
}

interface EnvVar {
  key: string;
  value: string;
  masked: boolean;
}

interface CloudProviderInfo {
  configured: boolean;
  name: string;
}

interface AutoBackupSettings {
  enabled: boolean;
  frequency: string;
  timeOfDay: string;
  dayOfWeek: string;
  retention: number;
  location: string;
}

type CloudProviderKey = "local" | "s3" | "google-drive" | "onedrive" | "dropbox";

const DEFAULT_SETTINGS: AutoBackupSettings = {
  enabled: false, frequency: "Daily", timeOfDay: "02:00", dayOfWeek: "Sunday", retention: 30, location: "local",
};

// ─── Provider Definitions ────────────────────────────────────
const PROVIDERS = [
  { key: "s3" as const, name: "AWS S3", icon: Cloud, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", desc: "Amazon S3 cloud storage" },
  { key: "google-drive" as const, name: "Google Drive", icon: HardDrive, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", desc: "Google Drive cloud storage" },
  { key: "onedrive" as const, name: "Microsoft OneDrive", icon: Cloud, color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200", desc: "Microsoft OneDrive storage" },
  { key: "dropbox" as const, name: "Dropbox", icon: Upload, color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-200", desc: "Dropbox cloud storage" },
];

const S3_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "eu-west-1", label: "EU (Ireland)" },
  { value: "eu-central-1", label: "EU (Frankfurt)" },
];

// ─── Mock Data Generators ────────────────────────────────────
function generateCpuHistory(): { hour: string; cpu: number }[] {
  const now = new Date();
  const data: { hour: string; cpu: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600000);
    const h = d.getHours();
    const hourLabel = `${String(h).padStart(2, "0")}:00`;
    // Simulate realistic CPU: lower at night, higher during business hours
    let base = 15 + Math.sin((h - 6) * Math.PI / 12) * 25;
    // Add deterministic "randomness" based on hour
    const seed = ((h * 7 + 13) * 31) % 100;
    const noise = (seed % 20) - 10;
    const cpu = Math.max(5, Math.min(95, Math.round(base + noise)));
    data.push({ hour: hourLabel, cpu });
  }
  return data;
}

function generateDiskCategories() {
  return [
    { name: "Database", size: 48.3, color: "#6366f1" },
    { name: "Logs", size: 12.7, color: "#f59e0b" },
    { name: "Backups", size: 156.2, color: "#22c55e" },
    { name: "Uploads", size: 34.5, color: "#3b82f6" },
    { name: "Other", size: 18.4, color: "#8b5cf6" },
  ];
}

function generateEnvVars(envApiResponse?: Record<string, string>): EnvVar[] {
  const vars: EnvVar[] = [
    { key: "NODE_ENV", value: envApiResponse?.NODE_ENV || "production", masked: false },
    { key: "DATABASE_URL", value: envApiResponse?.DATABASE_URL || "file:./db/dev.db", masked: true },
    { key: "PORT", value: envApiResponse?.PORT || "3000", masked: false },
    { key: "NEXT_TELEMETRY_DISABLED", value: envApiResponse?.NEXT_TELEMETRY_DISABLED || "1", masked: false },
    { key: "RUNTIME", value: "Bun", masked: false },
    { key: "NEXT_PUBLIC_APP_URL", value: envApiResponse?.NEXT_PUBLIC_APP_URL || "http://localhost:3000", masked: false },
  ];
  // Add any NEXT_PUBLIC_ vars from API that aren't already listed
  if (envApiResponse) {
    for (const [k, v] of Object.entries(envApiResponse)) {
      if (k.startsWith("NEXT_PUBLIC_") && !vars.find((ev) => ev.key === k)) {
        vars.push({ key: k, value: v, masked: false });
      }
    }
  }
  return vars;
}

// ─── Stat Card ───────────────────────────────────────────────
function StatCard({ title, value, subtitle, icon: Icon, gradient }: {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; gradient: string;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">{title}</p>
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

const BACKUP_STATUS_STYLES: Record<string, string> = {
  Success: "bg-green-100 text-green-700 border-green-200",
  Failed: "bg-red-100 text-red-700 border-red-200",
  "In Progress": "bg-amber-100 text-amber-700 border-amber-200",
};

const BACKUP_MODE_STYLES: Record<string, string> = {
  Full: "bg-slate-100 text-slate-700 border-slate-200",
  Incremental: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

const EXPORT_TYPES = [
  { id: "Subscribers Data", title: "Subscribers Data", desc: "Export all subscriber records with plans, areas, and status", icon: Users },
  { id: "Financial Data", title: "Financial Data", desc: "Invoices, payments, GST reports, and billing summaries", icon: FileText },
  { id: "Network Data", title: "Network Data", desc: "Devices, bandwidth logs, alerts, and topology", icon: Wifi },
  { id: "Operations Data", title: "Operations Data", desc: "Complaints, installations, tickets, and technician info", icon: Wrench },
];

// ─── Helpers ─────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatINR(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
}

function postApi(body: Record<string, unknown>) {
  return fetch("/api/backup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const text = await r.text();
    try { return JSON.parse(text); } catch { throw new Error(text || `API error: ${r.status}`); }
  });
}

function cpuColor(value: number): string {
  if (value > 80) return "#ef4444";
  if (value > 50) return "#f59e0b";
  return "#22c55e";
}

function cpuLabel(value: number): string {
  if (value > 80) return "High";
  if (value > 50) return "Medium";
  return "Normal";
}

function maskValue(val: string): string {
  if (!val) return "";
  if (val.length <= 6) return "••••••";
  return val.slice(0, 3) + "••••••••" + val.slice(-3);
}

// ─── Backup Page ─────────────────────────────────────────────
export function BackupPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{
    backups: BackupRecord[];
    exports: any[];
    version?: string;
    systemInfo: SystemInfo;
    backupSettings: AutoBackupSettings;
    cloudProviders: Record<string, CloudProviderInfo>;
  }>({
    queryKey: ["backup-data"],
    queryFn: () => apiFetch("/api/backup"),
  });

  const backups = data?.backups || [];
  const systemInfo = data?.systemInfo;
  const dbInfo = systemInfo?.database;
  const srv = systemInfo?.server;
  const tables = systemInfo?.tables || [];
  const cloudProviders = data?.cloudProviders || {};

  const [settings, setSettings] = useState<AutoBackupSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  // Live clock for Version Info card
  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // settingsLoaded flag removed — always sync from backend

  const [activeTab, setActiveTab] = useState("backups");

  // Dialogs
  const [backupNowOpen, setBackupNowOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportType, setExportType] = useState("");
  const [exportFormat, setExportFormat] = useState("CSV");
  const [exportActiveOnly, setExportActiveOnly] = useState(true);

  // Cloud config dialog
  const [configProvider, setConfigProvider] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Cloud backups dialog
  const [cloudBackupsOpen, setCloudBackupsOpen] = useState(false);
  const [cloudBackupsProvider, setCloudBackupsProvider] = useState<string | null>(null);
  const [cloudBackups, setCloudBackups] = useState<Array<{ id: string; name: string; size: number; lastModified: string }>>([]);
  const [cloudBackupsLoading, setCloudBackupsLoading] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null);
  const [cloudDeleteTarget, setCloudDeleteTarget] = useState<{ provider: string; id: string; name: string } | null>(null);

  // Backup destination dialog state
  const [backupDestinations, setBackupDestinations] = useState<Set<string>>(new Set(["local"]));

  // Maintenance
  const [optimizeRunning, setOptimizeRunning] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [integrityRunning, setIntegrityRunning] = useState(false);

  // Encrypted backup
  const [encryptedBackupRunning, setEncryptedBackupRunning] = useState(false);
  const [restoreEncryptedOpen, setRestoreEncryptedOpen] = useState(false);
  const [restoreEncryptedTarget, setRestoreEncryptedTarget] = useState<BackupRecord | null>(null);
  const [restoreEncryptedConfirm, setRestoreEncryptedConfirm] = useState(false);

  // Verify backup states
  const [verifyState, setVerifyState] = useState<Record<string, { loading: boolean; valid?: boolean; size?: number }>>({});

  // ─── Feature 1: Incremental Backup ───
  const [incrementalBackup, setIncrementalBackup] = useState(false);

  // ─── Feature 2: Conflict Detection ───
  const [restoreConflictChecked, setRestoreConflictChecked] = useState(false);

  // ─── Feature 5: Environment Variables ───
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [envLoading, setEnvLoading] = useState(false);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const loadEnvVars = useCallback(async () => {
    setEnvLoading(true);
    try {
      const res = await apiFetch<{ variables: Record<string, string> }>("/api/settings/environment");
      if (res?.variables) {
        setEnvVars(generateEnvVars(res.variables));
      } else {
        setEnvVars(generateEnvVars());
      }
    } catch {
      // Fallback to static values
      setEnvVars(generateEnvVars());
    } finally {
      setEnvLoading(false);
    }
  }, []);

  // Load env vars when the system or resources tab is selected
  useEffect(() => {
    if ((activeTab === "system" || activeTab === "resources") && envVars.length === 0) {
      loadEnvVars();
    }
  }, [activeTab, envVars.length, loadEnvVars]);

  const copyEnvVar = (key: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedVar(key);
      toast.success(`Copied ${key}`);
      setTimeout(() => setCopiedVar(null), 2000);
    }).catch(() => {
      toast.error("Failed to copy");
    });
  };

  // Encrypted backup history - filePath from DB is mapped to 'location' by mapBackupRecord
  const encryptedBackups = backups.filter((b) => b.location?.endsWith(".cryptsk.enc"));

  // Verify backup handler
  const verifyBackup = async (backupId: string) => {
    setVerifyState((prev) => ({ ...prev, [backupId]: { loading: true } }));
    try {
      const res = await apiFetch<{ valid: boolean; size: number }>(`/api/backup/${backupId}/verify`);
      setVerifyState((prev) => ({ ...prev, [backupId]: { loading: false, valid: res.valid, size: res.size } }));
      toast.success(res.valid ? "Backup verified successfully" : "Backup file is invalid or missing");
    } catch {
      setVerifyState((prev) => ({ ...prev, [backupId]: { loading: false, valid: false } }));
      toast.error("Verification failed");
    }
  };

  // Download backup handler
  const downloadBackup = async (backupId: string) => {
    try {
      toast.info("Preparing download...");
      const res = await fetch(`/api/backup/${backupId}/download`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Download failed" }));
        toast.error(errData.error || "Download failed");
        return;
      }
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename[^;=\n]*=((['\"]).*?\2|[^;\n]*)/);
      const filename = match ? match[1].replace(/['"]/g, "") : `backup_${backupId}.db`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded: ${filename}`);
    } catch {
      toast.error("Download failed");
    }
  };

  // ── Mutations ──
  const backupMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postApi(body),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Backup completed!");
      setBackupNowOpen(false);
      setIncrementalBackup(false);
      queryClient.invalidateQueries({ queryKey: ["backup-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postApi(body),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Restored!");
      setRestoreOpen(false);
      setRestoreTarget(null);
      setRestoreConflictChecked(false);
      queryClient.invalidateQueries({ queryKey: ["backup-data"] });
    },
    onError: () => toast.error("Restore failed"),
  });

  const exportMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
        const contentType = r.headers.get("content-type") || "";
        if (contentType.includes("text/csv") || (contentType.includes("json") && !contentType.includes("error"))) {
          const blob = await r.blob();
          const disposition = r.headers.get("content-disposition") || "";
          const match = disposition.match(/filename="(.+?)"/);
          const filename = match ? match[1] : `export.${body.format === "JSON" ? "json" : "csv"}`;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return { success: true, filename };
        }
        return r.json();
      }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Export downloaded${res.filename ? `: ${res.filename}` : ""}`);
      setExportOpen(false);
      setExportType("");
      queryClient.invalidateQueries({ queryKey: ["backup-data"] });
    },
    onError: () => toast.error("Export failed"),
  });

  const maintenanceMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postApi(body),
    onSuccess: (res) => toast.success(res.message || "Done"),
    onError: () => toast.error("Action failed"),
  });

  const settingsMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postApi(body),
    onSuccess: (res) => {
      toast.success(res.message || "Settings saved");
      queryClient.invalidateQueries({ queryKey: ["backup-data"] });
    },
    onError: () => toast.error("Failed to save settings"),
  });

  // Sync settings from backend whenever query data changes (after saves, etc.)
  const backupSettings = data?.backupSettings;
  useEffect(() => {
    if (backupSettings) {
      setSettings(backupSettings);
      setSettingsLoaded(true);
    }
  }, [backupSettings]);

  const deleteBackupMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postApi(body),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Deleted");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["backup-data"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  // Cloud config save
  const saveCloudConfigMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postApi(body),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Config saved");
      queryClient.invalidateQueries({ queryKey: ["backup-data"] });
    },
    onError: () => toast.error("Failed to save config"),
  });

  // Cloud backup mutation
  const cloudBackupMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postApi(body),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Cloud backup uploaded!");
      queryClient.invalidateQueries({ queryKey: ["backup-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Cloud delete mutation
  const cloudDeleteMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postApi(body),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Cloud backup deleted");
      setCloudDeleteTarget(null);
      // Refresh cloud backups list
      if (cloudBackupsProvider) loadCloudBackups(cloudBackupsProvider);
    },
    onError: () => toast.error("Failed to delete cloud backup"),
  });

  // Handlers
  const openConfigDialog = (providerKey: string) => {
    setConfigProvider(providerKey);
    setTestResult(null);
    // Initialize form with existing config (empty if new)
    const defaults: Record<string, Record<string, string>> = {
      s3: { accessKeyId: "", secretAccessKey: "", bucket: "", region: "us-east-1", pathPrefix: "cryptsk-backups/" },
      "google-drive": { clientId: "", clientSecret: "", accessToken: "", folderName: "CryptskBackups" },
      onedrive: { clientId: "", clientSecret: "", accessToken: "", folderName: "CryptskBackups" },
      dropbox: { accessToken: "", folderPath: "/CryptskBackups" },
    };
    setConfigForm({ ...defaults[providerKey] });
  };

  const saveCloudConfig = () => {
    if (!configProvider) return;
    saveCloudConfigMutation.mutate({ action: "save-cloud-config", provider: configProvider, config: configForm });
  };

  const [directTesting, setDirectTesting] = useState<string | null>(null);

  const testConnection = async () => {
    if (!configProvider) return;
    setTestingConnection(true);
    setTestResult(null);
    try {
      // First save the config temporarily to test
      await postApi({ action: "save-cloud-config", provider: configProvider, config: configForm });
      const result = await postApi({ action: "test-cloud-connection", provider: configProvider });
      setTestResult(result);
      queryClient.invalidateQueries({ queryKey: ["backup-data"] });
    } catch (e: unknown) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : "Connection test failed" });
    } finally {
      setTestingConnection(false);
    }
  };

  const testConnectionForProvider = async (providerKey: string) => {
    setDirectTesting(providerKey);
    try {
      const result = await postApi({ action: "test-cloud-connection", provider: providerKey });
      if (result.success) toast.success(result.message);
      else toast.error(result.message || "Connection test failed");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setDirectTesting(null);
    }
  };

  const loadCloudBackups = async (provider: string) => {
    setCloudBackupsProvider(provider);
    setCloudBackupsOpen(true);
    setCloudBackupsLoading(true);
    setCloudBackups([]);
    try {
      const result = await postApi({ action: "list-cloud-backups", provider });
      if (result.success) setCloudBackups(result.files || []);
      else toast.error(result.message || "Failed to list backups");
    } catch {
      toast.error("Failed to list cloud backups");
    } finally {
      setCloudBackupsLoading(false);
    }
  };

  // ─── Feature 1: Updated triggerBackup with incremental support ───
  const triggerBackup = () => {
    const backupMode = incrementalBackup ? "incremental" : "full";
    if (backupDestinations.has("local")) {
      backupMutation.mutate({ action: "backup-now", type: "full", location: "local", backupMode });
    }
    // Also backup to each selected cloud provider
    for (const dest of backupDestinations) {
      if (dest !== "local" && cloudProviders[dest]?.configured) {
        cloudBackupMutation.mutate({ action: "cloud-backup", provider: dest, backupMode });
      }
    }
  };

  // ─── Feature 2: Updated restoreBackup with conflict check ───
  const restoreBackup = () => {
    if (!restoreTarget || !restoreConflictChecked) return;
    restoreMutation.mutate({ action: "restore", backupId: restoreTarget.id });
  };

  const confirmDeleteBackup = () => {
    if (!deleteTarget) return;
    deleteBackupMutation.mutate({ action: "delete-backup", backupId: deleteTarget.id });
  };

  const confirmDeleteCloudBackup = () => {
    if (!cloudDeleteTarget) return;
    cloudDeleteMutation.mutate({ action: "delete-cloud-backup", provider: cloudDeleteTarget.provider, backupId: cloudDeleteTarget.id });
  };

  const triggerExport = () => {
    if (!exportType) { toast.error("Please select an export type"); return; }
    exportMutation.mutate({ action: "export", exportType, format: exportFormat, activeOnly: exportActiveOnly });
  };

  const runOptimize = () => { setOptimizeRunning(true); maintenanceMutation.mutate({ action: "optimize" }, { onSettled: () => setOptimizeRunning(false) }); };
  const clearCache = () => { setCacheClearing(true); maintenanceMutation.mutate({ action: "clear-cache" }, { onSettled: () => setCacheClearing(false) }); };
  const runIntegrity = () => { setIntegrityRunning(true); maintenanceMutation.mutate({ action: "integrity-check" }, { onSettled: () => setIntegrityRunning(false) }); };

  // Encrypted backup mutation
  const encryptedBackupMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postApi(body),
    onSuccess: async (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Encrypted backup created!");
      queryClient.invalidateQueries({ queryKey: ["backup-data"] });
      // Auto-download the created backup
      if (res.backupId) {
        try {
          await downloadEncryptedBackup(res.backupId);
        } catch {
          // downloadEncryptedBackup handles its own errors via toast
        }
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const encryptedRestoreMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postApi(body),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Database restored!");
      setRestoreEncryptedOpen(false);
      setRestoreEncryptedTarget(null);
      setRestoreEncryptedConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["backup-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerEncryptedBackup = () => {
    setEncryptedBackupRunning(true);
    encryptedBackupMutation.mutate(
      { action: "encrypted-backup" },
      { onSettled: () => setEncryptedBackupRunning(false) }
    );
  };

  const downloadEncryptedBackup = async (backupId?: string) => {
    try {
      toast.info(backupId ? "Preparing download..." : "Creating fresh encrypted backup for download...");
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download-encrypted-backup", backupId: backupId || null }),
      });

      if (!res.ok) {
        let errorMsg = "Download failed";
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch { /* ignore parse error */ }
        toast.error(errorMsg);
        return;
      }

      // Check content-type: if JSON, it's an unexpected error
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errData = await res.json();
        toast.error(errData.error || "Download failed");
        return;
      }

      // Binary data - use arrayBuffer to avoid UTF-8 corruption
      const buffer = await res.arrayBuffer();
      const blob = new Blob([buffer], { type: "application/octet-stream" });

      // Extract filename from Content-Disposition header
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const filename = match ? match[1].replace(/['"]/g, "") : `backup_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}.cryptsk.enc`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded: ${filename}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  const triggerEncryptedRestore = () => {
    if (!restoreEncryptedTarget) return;
    setRestoreEncryptedConfirm(false);
    encryptedRestoreMutation.mutate({ action: "restore-encrypted", backupId: restoreEncryptedTarget.id });
  };

  const saveSettings = () => {
    settingsMutation.mutate({ action: "save-settings", settings });
  };

  const toggleBackupDestination = (dest: string) => {
    setBackupDestinations((prev) => {
      const next = new Set(prev);
      if (next.has(dest)) next.delete(dest);
      else next.add(dest);
      return next;
    });
  };

  // ─── Feature 2: Conflict detection data ───
  const restoreBackupDate = restoreTarget ? new Date(restoreTarget.dateTime) : null;
  const now = new Date();
  const hoursSinceBackup = restoreBackupDate ? Math.max(0, Math.floor((now.getTime() - restoreBackupDate.getTime()) / 3600000)) : 0;
  const estimatedModifiedRecords = restoreBackupDate
    ? Math.max(0, Math.floor(hoursSinceBackup * (Math.sin(hoursSinceBackup * 0.3) * 5 + 8)))
    : 0;
  const hasConflict = restoreTarget && hoursSinceBackup > 0 && estimatedModifiedRecords > 0;

  // Derived
  const lastBackup = backups[0];
  const successfulBackups = backups.filter((b) => b.status === "Success");
  const lastBackupDate = lastBackup ? new Date(lastBackup.dateTime).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";
  const totalBackupSize = successfulBackups.reduce((a, b) => a + b.sizeBytes, 0);
  const configuredProviderCount = Object.values(cloudProviders).filter((p) => p.configured).length;

  // ─── Feature 3 & 4: Resource monitoring data ───
  const cpuHistory = generateCpuHistory();
  const currentCpu = cpuHistory[cpuHistory.length - 1]?.cpu || 0;
  const avgCpu = Math.round(cpuHistory.reduce((a, c) => a + c.cpu, 0) / cpuHistory.length);
  const peakCpu = Math.max(...cpuHistory.map((c) => c.cpu));

  const diskCategories = generateDiskCategories();
  const totalDiskUsed = diskCategories.reduce((a, c) => a + c.size, 0);
  const totalDiskSize = 512; // Total 512 GB
  const diskUsagePercent = Math.round((totalDiskUsed / totalDiskSize) * 100);
  const freeSpace = totalDiskSize - totalDiskUsed;

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
          <h1 className="text-2xl font-bold text-foreground">Backup & Data Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">System backups, cloud storage, data exports, and maintenance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { setRestoreConflictChecked(false); setRestoreOpen(true); }}>
            <RotateCcw className="h-4 w-4 mr-2" />Restore
          </Button>
          <Button variant="outline" onClick={() => { setExportType(""); setExportOpen(true); }}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
          <Dialog open={backupNowOpen} onOpenChange={(open) => {
            if (open) { setBackupDestinations(new Set(["local"])); setIncrementalBackup(false); }
            setBackupNowOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" disabled={backupMutation.isPending || cloudBackupMutation.isPending}>
                {(backupMutation.isPending || cloudBackupMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Archive className="h-4 w-4 mr-2" />}
                {(backupMutation.isPending || cloudBackupMutation.isPending) ? "Backing Up..." : "Backup Now"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Backup</DialogTitle>
                <DialogDescription>Select backup destinations and mode</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                {/* ─── Feature 1: Incremental Backup Toggle ─── */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <Label className="text-sm font-medium">Incremental Backup</Label>
                    <p className="text-xs text-muted-foreground">Only backs up changes since last backup</p>
                  </div>
                  <Switch
                    checked={incrementalBackup}
                    onCheckedChange={(v) => setIncrementalBackup(v)}
                    disabled={successfulBackups.length === 0}
                  />
                </div>
                {incrementalBackup && lastBackup ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-cyan-50 border border-cyan-200">
                    <Info className="h-4 w-4 text-cyan-600 shrink-0" />
                    <p className="text-xs text-cyan-700">
                      Based on: <span className="font-medium">{new Date(lastBackup.dateTime).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </p>
                  </div>
                ) : incrementalBackup && successfulBackups.length === 0 ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700">No previous backup found. A full backup will be created instead.</p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Select Destinations:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${backupDestinations.has("local") ? "border-green-300 bg-green-50" : "border-muted hover:bg-muted/50"}`}
                      onClick={() => toggleBackupDestination("local")}
                    >
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${backupDestinations.has("local") ? "bg-green-600 border-green-600" : "border-muted-foreground"}`}>
                        {backupDestinations.has("local") && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Local Storage</span>
                    </button>
                    {PROVIDERS.filter((p) => cloudProviders[p.key]?.configured).map((p) => (
                      <button
                        key={p.key}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${backupDestinations.has(p.key) ? "border-green-300 bg-green-50" : "border-muted hover:bg-muted/50"}`}
                        onClick={() => toggleBackupDestination(p.key)}
                      >
                        <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${backupDestinations.has(p.key) ? "bg-green-600 border-green-600" : "border-muted-foreground"}`}>
                          {backupDestinations.has(p.key) && <CheckCircle2 className="h-3 w-3 text-white" />}
                        </div>
                        <p.icon className={`h-4 w-4 ${p.color}`} />
                        <span className="text-sm font-medium">{p.name}</span>
                      </button>
                    ))}
                    {PROVIDERS.filter((p) => !cloudProviders[p.key]?.configured).length > 0 && (
                      <p className="col-span-2 text-xs text-muted-foreground">
                        Configure cloud providers below to enable backup destinations.
                      </p>
                    )}
                  </div>
                </div>
                {backupDestinations.size === 0 && (
                  <p className="text-xs text-red-600">Please select at least one destination.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBackupNowOpen(false)}>Cancel</Button>
                <Button
                  className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
                  onClick={triggerBackup}
                  disabled={backupMutation.isPending || cloudBackupMutation.isPending || backupDestinations.size === 0}
                >
                  {(backupMutation.isPending || cloudBackupMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Start {incrementalBackup ? "Incremental " : ""}Backup{backupDestinations.size > 1 ? ` (${backupDestinations.size} destinations)` : ""}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="cloud">Cloud Storage</TabsTrigger>
          <TabsTrigger value="export">Backup & Export</TabsTrigger>
          <TabsTrigger value="system">System Info</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>

        {/* Tab 1: Backups */}
        <TabsContent value="backups" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Last Backup" value={lastBackupDate.split(",")[0]} subtitle={lastBackupDate.split(",")[1] || ""} icon={Clock} gradient="stat-gradient-purple" />
            <StatCard title="Backup Size" value={lastBackup?.size || "N/A"} subtitle="Latest backup" icon={HardDrive} gradient="stat-gradient-blue" />
            <StatCard title="Auto-Backup" value={settings.enabled ? "Active" : "Disabled"} subtitle={settings.frequency} icon={RefreshCw} gradient="stat-gradient-green" />
            <StatCard title="Cloud Providers" value={`${configuredProviderCount}/4`} subtitle="Configured" icon={Cloud} gradient="stat-gradient-amber" />
          </div>

          {/* Auto-Backup Settings */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><Settings className="h-4 w-4" />Auto-Backup Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <Label className="text-sm font-medium">Enable Auto-Backup</Label>
                      <p className="text-xs text-muted-foreground">Automatically create scheduled backups</p>
                    </div>
                    <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />
                  </div>
                  <div>
                    <Label>Frequency</Label>
                    <Select value={settings.frequency} onValueChange={(v) => setSettings({ ...settings, frequency: v as "Daily" | "Weekly" | "Monthly" })} disabled={!settings.enabled}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Daily">Daily</SelectItem>
                        <SelectItem value="Weekly">Weekly</SelectItem>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {settings.frequency === "Daily" && (
                    <div>
                      <Label>Time of Day</Label>
                      <Input type="time" value={settings.timeOfDay} onChange={(e) => setSettings({ ...settings, timeOfDay: e.target.value })} className="mt-1" disabled={!settings.enabled} />
                    </div>
                  )}
                  {settings.frequency === "Weekly" && (
                    <div>
                      <Label>Day of Week</Label>
                      <Select value={settings.dayOfWeek} onValueChange={(v) => setSettings({ ...settings, dayOfWeek: v })} disabled={!settings.enabled}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>Retention (keep last N backups)</Label>
                    <Input type="number" value={settings.retention} onChange={(e) => setSettings({ ...settings, retention: Number(e.target.value) })} className="mt-1" disabled={!settings.enabled} min={1} max={365} />
                    <p className="text-xs text-muted-foreground mt-1">Older backups will be automatically deleted</p>
                  </div>
                  <div>
                    <Label>Default Location</Label>
                    <Select value={settings.location} onValueChange={(v) => setSettings({ ...settings, location: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local Storage</SelectItem>
                        {PROVIDERS.filter((p) => cloudProviders[p.key]?.configured).map((p) => (
                          <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {configuredProviderCount === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No cloud providers configured. Configure them in the Cloud Storage tab.</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="mt-2" onClick={saveSettings} disabled={settingsMutation.isPending}>
                    {settingsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    Save Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Backup History */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Backup History ({backups.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Date/Time</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                      {/* ─── Feature 1: Backup Mode Column ─── */}
                      <TableHead className="text-xs font-medium uppercase">Mode</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Size</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Duration</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Location</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No backups yet. Create your first backup.</TableCell></TableRow>
                    ) : backups.map((b) => (
                      <TableRow key={b.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm">
                          <p>{new Date(b.dateTime).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                          <p className="text-xs text-muted-foreground">{new Date(b.dateTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={b.type === "Auto" ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-purple-50 text-purple-700 border-purple-200"}>
                            {b.type}
                          </Badge>
                        </TableCell>
                        {/* ─── Feature 1: Mode Badge ─── */}
                        <TableCell>
                          <Badge variant="outline" className={BACKUP_MODE_STYLES[b.backupMode || "Full"]}>
                            {b.backupMode || "Full"}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-sm">{b.size}</TableCell>
                        <TableCell className="text-sm">{b.duration}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={BACKUP_STATUS_STYLES[b.status] || ""}>
                            {b.status === "In Progress" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                            {b.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate" title={b.location}>{b.location}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {b.status === "Success" && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => downloadBackup(b.id)} title="Download">
                                <Download className="h-3 w-3" />
                              </Button>
                            )}
                            {verifyState[b.id]?.loading ? (
                              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled title="Verifying...">
                                <Loader2 className="h-3 w-3 animate-spin" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => verifyBackup(b.id)} title="Verify integrity">
                                <ShieldCheckIcon className="h-3 w-3" />
                              </Button>
                            )}
                            {verifyState[b.id]?.valid === true && (
                              <span className="text-[10px] text-green-600 font-medium">Valid</span>
                            )}
                            {verifyState[b.id]?.valid === false && (
                              <span className="text-[10px] text-red-600 font-medium">Invalid</span>
                            )}
                            {b.status === "Success" && b.location === "Local" && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setRestoreTarget(b); setRestoreConflictChecked(false); setRestoreOpen(true); }} title="Restore">
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => setDeleteTarget(b)} title="Delete">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Cloud Storage */}
        <TabsContent value="cloud" className="space-y-4">
          {/* Local Storage Card */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card className="border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-green-50 shrink-0">
                    <HardDrive className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold">Local Storage</h3>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">Active</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{backups.filter((b) => b.location === "Local" || b.location.includes("backup_")).length} backups</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t">
                  <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => backupMutation.mutate({ action: "backup-now", type: "full", location: "local" })} disabled={backupMutation.isPending}>
                    {backupMutation.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Upload className="h-3 w-3 mr-1.5" />}
                    Backup Now
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Cloud Provider Cards */}
            {PROVIDERS.map((p) => {
              const isConfigured = !!cloudProviders[p.key]?.configured;
              return (
                <Card key={p.key} className="border shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl ${p.bg} shrink-0`}>
                        <p.icon className={`h-5 w-5 ${p.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold">{p.name}</h3>
                        <div className="flex items-center gap-1 mt-1">
                          {isConfigured ? (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">Configured</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">Not Configured</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t space-y-2">
                      {isConfigured && (
                        <Button variant="outline" size="sm" className="w-full text-xs bg-green-50 border-green-200 text-green-700 hover:bg-green-100" onClick={() => cloudBackupMutation.mutate({ action: "cloud-backup", provider: p.key })} disabled={cloudBackupMutation.isPending}>
                          {cloudBackupMutation.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Upload className="h-3 w-3 mr-1.5" />}
                          Backup Now
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => openConfigDialog(p.key)}>
                        <Settings className="h-3 w-3 mr-1.5" />
                        {isConfigured ? "Edit Config" : "Configure"}
                      </Button>
                      {isConfigured && (
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => testConnectionForProvider(p.key)} disabled={directTesting === p.key}>
                            {directTesting === p.key ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plug className="h-3 w-3 mr-1" />}
                            {directTesting === p.key ? "Testing..." : "Test"}
                          </Button>
                          <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => loadCloudBackups(p.key)}>
                            <Database className="h-3 w-3 mr-1" />View
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 3: Encrypted Full Backup */}
        <TabsContent value="export" className="space-y-4">
          {/* Encrypted Database Backup Card */}
          <Card className="border-2 border-dashed border-amber-300 bg-gradient-to-br from-amber-50/50 to-orange-50/50">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-amber-100 shrink-0">
                  <ShieldCheck className="h-6 w-6 text-amber-700" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground">Encrypted Full Database Backup</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Creates a complete SQL dump of all {tables.length} tables encrypted with AES-256-GCM.
                    Only this application instance can decrypt and restore the backup.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-xs">
                      <ShieldCheck className="h-3 w-3 mr-1" />AES-256-GCM
                    </Badge>
                    <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700 text-xs">
                      <Database className="h-3 w-3 mr-1" />Full SQL Dump
                    </Badge>
                    <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700 text-xs">
                      <Lock className="h-3 w-3 mr-1" />App-Only Decrypt
                    </Badge>
                    <Badge variant="outline" className="bg-teal-50 border-teal-200 text-teal-700 text-xs">
                      <Zap className="h-3 w-3 mr-1" />PostgreSQL Ready
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <Button
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={triggerEncryptedBackup}
                      disabled={encryptedBackupRunning || encryptedBackupMutation.isPending}
                    >
                      {(encryptedBackupRunning || encryptedBackupMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Archive className="h-4 w-4 mr-2" />}
                      {(encryptedBackupRunning || encryptedBackupMutation.isPending) ? "Creating Backup..." : "Create Encrypted Backup"}
                    </Button>
                    <Button variant="outline" onClick={() => downloadEncryptedBackup()}>
                      <Download className="h-4 w-4 mr-2" />Download Fresh
                    </Button>
                    <Button variant="outline" onClick={() => setRestoreEncryptedOpen(true)} disabled={encryptedBackups.length === 0}>
                      <RotateCcw className="h-4 w-4 mr-2" />Restore from Backup
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Encrypted Backup History */}
          {encryptedBackups.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-600" />
                  Encrypted Backups ({encryptedBackups.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium uppercase">Date/Time</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Size</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Duration</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                        <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {encryptedBackups.map((b) => (
                        <TableRow key={b.id} className="hover:bg-muted/50">
                          <TableCell className="text-sm">
                            <p>{new Date(b.dateTime).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                            <p className="text-xs text-muted-foreground">{new Date(b.dateTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">{b.size}</TableCell>
                          <TableCell className="text-sm">{b.duration}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={BACKUP_STATUS_STYLES[b.status] || ""}>
                              {b.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => downloadEncryptedBackup(b.id)} title="Download">
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={() => { setRestoreEncryptedTarget(b); setRestoreEncryptedOpen(true); setRestoreEncryptedConfirm(false); }} title="Restore">
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => setDeleteTarget(b)} title="Delete">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Data Export Section */}
          <div className="pt-2">
            <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Data Export (CSV / JSON)
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {EXPORT_TYPES.map((et) => (
              <Card key={et.id} className="border shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-red-50 shrink-0">
                      <et.icon className="h-5 w-5 text-[#DC2626]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold">{et.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{et.desc}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => { setExportType(et.id); setExportOpen(true); }}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />Export
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 4: System Info */}
        <TabsContent value="system" className="space-y-4">
          {/* Version Info Card */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><Info className="h-4 w-4" />Version Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Platform</p>
                  <p className="text-sm font-semibold">Cryptsk ISP Platform</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Version</p>
                  <p className="text-sm font-semibold">v{data?.version || "0.2.0"}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Current Time</p>
                  <p className="text-sm font-semibold tabular-nums">{currentTime}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Node.js</p>
                  <p className="text-sm font-semibold">{srv?.nodeVersion || "—"}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Runtime</p>
                  <p className="text-sm font-semibold">{srv?.platform || "—"}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Database Size</p>
                  <p className="text-sm font-semibold tabular-nums">{dbInfo?.sizeFormatted || formatSize(dbInfo?.size || 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" />System Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Database Connected</p>
                    <p className="text-xs text-green-600">{dbInfo?.type || "SQLite"} · {dbInfo?.health || "Healthy"}</p>
                  </div>
                </div>
                <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Database Size</span>
                    <span className="text-sm font-semibold tabular-nums">{dbInfo?.sizeFormatted || formatSize(dbInfo?.size || 0)}</span>
                  </div>
                  <Progress value={dbInfo?.size ? Math.min((dbInfo.size / 1024) * 100, 100) : 0} className="h-2" />
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium">Server Uptime</p>
                  <p className="text-lg font-bold tabular-nums">{srv ? formatUptime(srv.uptime) : "—"}</p>
                  <p className="text-xs text-muted-foreground">{srv?.platform} · Node {srv?.nodeVersion || ""}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium">Active Subscribers</p>
                  <p className="text-lg font-bold tabular-nums">{dbInfo?.activeSubscribers?.toLocaleString() || "—"}</p>
                  <p className="text-xs text-muted-foreground">of {dbInfo?.subscriberCount?.toLocaleString() || "0"} total</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium">Online Devices</p>
                  <p className="text-lg font-bold tabular-nums">{dbInfo?.onlineDevices || "—"}</p>
                  <p className="text-xs text-muted-foreground">of {dbInfo?.deviceCount || "0"} total</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium">Memory Usage</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-lg font-bold tabular-nums">{srv ? formatSize(srv.memoryUsage?.rss || 0) : "—"}</span>
                    <span className="text-xs text-muted-foreground">RSS</span>
                  </div>
                  <Progress value={srv ? Math.min(((srv.memoryUsage?.heapUsed || 0) / (srv.memoryUsage?.heapTotal || 1)) * 100, 100) : 0} className="h-2 mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Subscribers" value={dbInfo?.subscriberCount?.toLocaleString() || "—"} subtitle={`${dbInfo?.activeSubscribers || 0} active`} icon={Users} gradient="stat-gradient-green" />
            <StatCard title="Total Invoices" value={dbInfo?.invoiceCount?.toLocaleString() || "—"} subtitle={`${formatINR(dbInfo?.totalRevenue || 0)} revenue`} icon={FileText} gradient="stat-gradient-purple" />
            <StatCard title="Total Payments" value={dbInfo?.paymentCount?.toLocaleString() || "—"} subtitle={`${formatINR(dbInfo?.totalCollected || 0)} collected`} icon={CheckCircle2} gradient="stat-gradient-blue" />
            <StatCard title="Open Complaints" value={dbInfo?.openComplaints || 0} subtitle={`of ${dbInfo?.complaintCount || 0} total`} icon={AlertTriangle} gradient="stat-gradient-amber" />
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><Database className="h-4 w-4" />Database Tables</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Table</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Rows</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Distribution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tables.map((t) => {
                      const maxRows = Math.max(...tables.map((x) => x.count), 1);
                      return (
                        <TableRow key={t.name} className="hover:bg-muted/50">
                          <TableCell className="text-sm font-medium font-mono">{t.name}</TableCell>
                          <TableCell className="tabular-nums text-sm text-muted-foreground">{t.count.toLocaleString()}</TableCell>
                          <TableCell className="w-48"><Progress value={(t.count / maxRows) * 100} className="h-2" /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><Zap className="h-4 w-4" />Maintenance Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "Optimize Database", desc: "Vacuum & reindex tables", icon: Database, bg: "from-green-50", iconBg: "bg-green-100", iconColor: "text-green-600", running: optimizeRunning, onClick: runOptimize },
                  { label: "Clear Cache", desc: "Purge all cached data", icon: RefreshCw, bg: "from-teal-50", iconBg: "bg-teal-100", iconColor: "text-teal-600", running: cacheClearing, onClick: clearCache },
                  { label: "Integrity Check", desc: "Verify data consistency", icon: ShieldCheck, bg: "from-purple-50", iconBg: "bg-purple-100", iconColor: "text-purple-600", running: integrityRunning, onClick: runIntegrity },
                ].map((item) => (
                  <div key={item.label} className={`p-4 rounded-xl border bg-gradient-to-br ${item.bg} to-white space-y-3`}>
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${item.iconBg}`}><item.icon className={`h-4 w-4 ${item.iconColor}`} /></div>
                      <div><p className="text-sm font-semibold">{item.label}</p><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={item.onClick} disabled={item.running || maintenanceMutation.isPending}>
                      {item.running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                      {item.running ? "Running..." : item.label}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ─── Feature 5: Environment Variables ─── */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Key className="h-4 w-4" />
                Environment Variables
                <Button variant="ghost" size="sm" className="h-7 ml-auto text-xs" onClick={loadEnvVars} disabled={envLoading}>
                  {envLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Refresh
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Variable</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Value</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {envLoading && envVars.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">Loading environment variables...</p>
                        </TableCell>
                      </TableRow>
                    ) : envVars.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                          No environment variables loaded
                        </TableCell>
                      </TableRow>
                    ) : envVars.map((v) => (
                      <TableRow key={v.key} className="hover:bg-muted/50">
                        <TableCell className="text-sm font-mono font-medium">{v.key}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {v.masked ? maskValue(v.value) : v.value || "—"}
                        </TableCell>
                        <TableCell>
                          {v.value ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5 py-0">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Set
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px] px-1.5 py-0">
                              <XCircle className="h-2.5 w-2.5 mr-0.5" />Unset
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => copyEnvVar(v.key, v.value)}
                            disabled={!v.value}
                            title="Copy value"
                          >
                            {copiedVar === v.key ? (
                              <><Check className="h-3 w-3 mr-1 text-green-600" />Copied</>
                            ) : (
                              <><Copy className="h-3 w-3 mr-1" />Copy</>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-3 border-t bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  <Info className="h-3 w-3 inline mr-1" />
                  Sensitive values are masked. Copy reveals the actual value to your clipboard.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 5: System Resources (CPU & Disk Monitoring) ─── */}
        <TabsContent value="resources" className="space-y-4">
          {/* CPU Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${currentCpu > 80 ? "bg-red-100" : currentCpu > 50 ? "bg-amber-100" : "bg-green-100"}`}>
                    <Cpu className={`h-5 w-5 ${currentCpu > 80 ? "text-red-600" : currentCpu > 50 ? "text-amber-600" : "text-green-600"}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Current CPU</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: cpuColor(currentCpu) }}>{currentCpu}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-100">
                    <Activity className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Average (24h)</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: cpuColor(avgCpu) }}>{avgCpu}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${peakCpu > 80 ? "bg-red-100" : "bg-amber-100"}`}>
                    <ThermometerSun className={`h-5 w-5 ${peakCpu > 80 ? "text-red-600" : "text-amber-600"}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Peak (24h)</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: cpuColor(peakCpu) }}>{peakCpu}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Feature 3: CPU Usage Chart ─── */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                CPU Usage — Last 24 Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cpuHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={cpuColor(currentCpu)} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={cpuColor(currentCpu)} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval={2}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                        fontSize: "12px",
                      }}
                      formatter={(value: number) => [`${value}%`, "CPU Usage"]}
                      labelFormatter={(label: string) => `Time: ${label}`}
                    />
                    <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="6 4" label={{ value: "High", position: "right", fontSize: 10, fill: "#ef4444" }} />
                    <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="6 4" label={{ value: "Medium", position: "right", fontSize: 10, fill: "#f59e0b" }} />
                    <Area
                      type="monotone"
                      dataKey="cpu"
                      stroke={cpuColor(currentCpu)}
                      strokeWidth={2}
                      fill="url(#cpuGradient)"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, fill: "white" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  <span>Normal (&lt;50%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span>Medium (50-80%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span>High (&gt;80%)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Feature 4: Disk Usage ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Disk Usage Summary */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Disc3 className="h-4 w-4" />
                  Disk Usage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Total usage bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Total Usage</span>
                    <span className={`font-bold tabular-nums ${diskUsagePercent > 80 ? "text-red-600" : diskUsagePercent > 60 ? "text-amber-600" : "text-foreground"}`}>
                      {totalDiskUsed.toFixed(1)} GB / {totalDiskSize} GB ({diskUsagePercent}%)
                    </span>
                  </div>
                  <Progress value={diskUsagePercent} className={`h-3 ${diskUsagePercent > 80 ? "[&>div]:bg-red-500" : ""}`} />
                  {diskUsagePercent > 80 && (
                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-red-50 border border-red-200">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                      <p className="text-xs text-red-700">Disk usage exceeds 80%. Consider cleaning up old backups or logs.</p>
                    </div>
                  )}
                </div>

                {/* Free space */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">Free Space</span>
                  <span className="text-sm font-semibold tabular-nums">{freeSpace.toFixed(1)} GB</span>
                </div>

                <Separator />

                {/* Per-category progress bars */}
                <div className="space-y-3">
                  {diskCategories.map((cat) => {
                    const pct = Math.round((cat.size / totalDiskUsed) * 100);
                    return (
                      <div key={cat.name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span className="font-medium">{cat.name}</span>
                          </div>
                          <span className="tabular-nums text-muted-foreground">{cat.size.toFixed(1)} GB ({pct}%)</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Disk Usage Bar Chart */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Disk Usage by Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={diskCategories} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v}GB`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                          fontSize: "12px",
                        }}
                        formatter={(value: number) => [`${value.toFixed(1)} GB`, "Size"]}
                      />
                      <Bar dataKey="size" radius={[4, 4, 0, 0]}>
                        {diskCategories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Dialogs ─────────────────────────────────────────── */}

      {/* Cloud Provider Config Dialog */}
      <Dialog open={!!configProvider} onOpenChange={(open) => { if (!open) { setConfigProvider(null); setTestResult(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {configProvider ? `${PROVIDERS.find((p) => p.key === configProvider)?.name || ""} Configuration` : ""}
            </DialogTitle>
            <DialogDescription>Configure your cloud backup provider credentials</DialogDescription>
          </DialogHeader>

          {configProvider && (
            <div className="space-y-4">
              {/* S3 Config */}
              {configProvider === "s3" && (
                <>
                  <div>
                    <Label>Access Key ID <span className="text-red-500">*</span></Label>
                    <Input value={configForm.accessKeyId || ""} onChange={(e) => setConfigForm({ ...configForm, accessKeyId: e.target.value })} placeholder="AKIA..." className="mt-1" />
                  </div>
                  <div>
                    <Label>Secret Access Key <span className="text-red-500">*</span></Label>
                    <Input type="password" value={configForm.secretAccessKey || ""} onChange={(e) => setConfigForm({ ...configForm, secretAccessKey: e.target.value })} placeholder="Your secret key" className="mt-1" />
                  </div>
                  <div>
                    <Label>Bucket Name <span className="text-red-500">*</span></Label>
                    <Input value={configForm.bucket || ""} onChange={(e) => setConfigForm({ ...configForm, bucket: e.target.value })} placeholder="my-backup-bucket" className="mt-1" />
                  </div>
                  <div>
                    <Label>Region</Label>
                    <Select value={configForm.region || "us-east-1"} onValueChange={(v) => setConfigForm({ ...configForm, region: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {S3_REGIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Path Prefix</Label>
                    <Input value={configForm.pathPrefix || ""} onChange={(e) => setConfigForm({ ...configForm, pathPrefix: e.target.value })} placeholder="cryptsk-backups/" className="mt-1" />
                    <p className="text-xs text-muted-foreground mt-1">Folder prefix in your S3 bucket</p>
                  </div>
                </>
              )}

              {/* Google Drive Config */}
              {configProvider === "google-drive" && (
                <>
                  <div>
                    <Label>Client ID</Label>
                    <Input value={configForm.clientId || ""} onChange={(e) => setConfigForm({ ...configForm, clientId: e.target.value })} placeholder="Your Google OAuth Client ID" className="mt-1" />
                  </div>
                  <div>
                    <Label>Client Secret</Label>
                    <Input type="password" value={configForm.clientSecret || ""} onChange={(e) => setConfigForm({ ...configForm, clientSecret: e.target.value })} placeholder="Your Google OAuth Client Secret" className="mt-1" />
                  </div>
                  <div>
                    <Label>Access Token <span className="text-red-500">*</span></Label>
                    <Textarea value={configForm.accessToken || ""} onChange={(e) => setConfigForm({ ...configForm, accessToken: e.target.value })} placeholder="Paste your OAuth access token" className="mt-1 min-h-[80px]" />
                    <p className="text-xs text-muted-foreground mt-1">Generate from Google Cloud Console OAuth Playground</p>
                  </div>
                  <div>
                    <Label>Folder Name</Label>
                    <Input value={configForm.folderName || ""} onChange={(e) => setConfigForm({ ...configForm, folderName: e.target.value })} placeholder="CryptskBackups" className="mt-1" />
                  </div>
                </>
              )}

              {/* OneDrive Config */}
              {configProvider === "onedrive" && (
                <>
                  <div>
                    <Label>Client ID</Label>
                    <Input value={configForm.clientId || ""} onChange={(e) => setConfigForm({ ...configForm, clientId: e.target.value })} placeholder="Your Microsoft App Client ID" className="mt-1" />
                  </div>
                  <div>
                    <Label>Client Secret</Label>
                    <Input type="password" value={configForm.clientSecret || ""} onChange={(e) => setConfigForm({ ...configForm, clientSecret: e.target.value })} placeholder="Your Microsoft App Client Secret" className="mt-1" />
                  </div>
                  <div>
                    <Label>Access Token <span className="text-red-500">*</span></Label>
                    <Textarea value={configForm.accessToken || ""} onChange={(e) => setConfigForm({ ...configForm, accessToken: e.target.value })} placeholder="Paste your Microsoft Graph access token" className="mt-1 min-h-[80px]" />
                    <p className="text-xs text-muted-foreground mt-1">Generate from Azure AD / Microsoft Authentication Library</p>
                  </div>
                  <div>
                    <Label>Folder Name</Label>
                    <Input value={configForm.folderName || ""} onChange={(e) => setConfigForm({ ...configForm, folderName: e.target.value })} placeholder="CryptskBackups" className="mt-1" />
                  </div>
                </>
              )}

              {/* Dropbox Config */}
              {configProvider === "dropbox" && (
                <>
                  <div>
                    <Label>Access Token <span className="text-red-500">*</span></Label>
                    <Textarea value={configForm.accessToken || ""} onChange={(e) => setConfigForm({ ...configForm, accessToken: e.target.value })} placeholder="Paste your Dropbox API access token" className="mt-1 min-h-[80px]" />
                    <p className="text-xs text-muted-foreground mt-1">Generate from Dropbox App Console</p>
                  </div>
                  <div>
                    <Label>Folder Path</Label>
                    <Input value={configForm.folderPath || ""} onChange={(e) => setConfigForm({ ...configForm, folderPath: e.target.value })} placeholder="/CryptskBackups" className="mt-1" />
                  </div>
                </>
              )}

              {/* Test Result */}
              {testResult && (
                <div className={`flex items-start gap-2 p-3 rounded-lg border ${testResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <p className={`text-sm ${testResult.success ? "text-green-700" : "text-red-700"}`}>{testResult.message}</p>
                </div>
              )}

              <Separator />

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={testConnection} disabled={testingConnection}>
                  {testingConnection ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plug className="h-3.5 w-3.5 mr-1.5" />}
                  Test Connection
                </Button>
                <Button onClick={saveCloudConfig} disabled={saveCloudConfigMutation.isPending}>
                  {saveCloudConfigMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                  Save Configuration
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cloud Backups List Dialog */}
      <Dialog open={cloudBackupsOpen} onOpenChange={(open) => { setCloudBackupsOpen(open); if (!open) setCloudBackups([]); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Cloud Backups — {cloudBackupsProvider ? PROVIDERS.find((p) => p.key === cloudBackupsProvider)?.name : ""}
            </DialogTitle>
            <DialogDescription>Backups stored in your cloud provider</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {cloudBackupsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : cloudBackups.length === 0 ? (
              <div className="text-center py-12">
                <CloudOff className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No cloud backups found</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {cloudBackups.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <Database className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground">{formatSize(f.size)} · {f.lastModified ? new Date(f.lastModified).toLocaleString("en-IN") : "—"}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 shrink-0" onClick={() => setCloudDeleteTarget({ provider: cloudBackupsProvider!, id: f.id, name: f.name })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Feature 2: Restore Dialog with Conflict Detection ─── */}
      <Dialog open={restoreOpen} onOpenChange={(open) => { if (!open) { setRestoreTarget(null); setRestoreConflictChecked(false); } setRestoreOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Restore from Backup</DialogTitle><DialogDescription>Select a local backup to restore from</DialogDescription></DialogHeader>
          {!restoreTarget ? (
            <div className="py-4 max-h-60 overflow-y-auto space-y-2">
              {successfulBackups.filter((b) => b.location === "Local" || (!b.location.includes("AWS") && !b.location.includes("Google") && !b.location.includes("OneDrive") && !b.location.includes("Dropbox"))).length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No completed local backups available</p>
              ) : successfulBackups.filter((b) => !b.location.includes("AWS") && !b.location.includes("Google") && !b.location.includes("OneDrive") && !b.location.includes("Dropbox")).slice(0, 10).map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => { setRestoreTarget(b); setRestoreConflictChecked(false); }}>
                  <div className="flex items-center gap-3">
                    <Archive className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{new Date(b.dateTime).toLocaleString("en-IN")}</p>
                      <p className="text-xs text-muted-foreground">{b.type} · {b.backupMode || "Full"} · {b.size} · {b.location}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 space-y-3">
              {/* ─── Feature 2: Conflict Detection Warning ─── */}
              {hasConflict && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-800">Data conflict detected</p>
                      <p className="text-xs text-amber-700">
                        ⚠️ This backup is from <span className="font-medium">{restoreBackupDate?.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>.
                        You have approximately <span className="font-bold">{estimatedModifiedRecords} records</span> modified since then ({hoursSinceBackup}h ago).
                      </p>
                      <p className="text-xs text-amber-700">Restoring will overwrite these changes.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="restore-conflict-ack"
                      checked={restoreConflictChecked}
                      onCheckedChange={(v) => setRestoreConflictChecked(!!v)}
                    />
                    <Label htmlFor="restore-conflict-ack" className="text-xs text-amber-800 cursor-pointer select-none">
                      I understand this may overwrite newer data
                    </Label>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Warning: Destructive operation!</p>
                  <p className="text-xs text-red-700">This will overwrite all current data. Cannot be undone.</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Date:</span><span className="font-medium">{new Date(restoreTarget.dateTime).toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Mode:</span><span>{restoreTarget.backupMode || "Full"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Size:</span><span>{restoreTarget.size}</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRestoreTarget(null); setRestoreConflictChecked(false); setRestoreOpen(false); }}>Cancel</Button>
            {restoreTarget && (
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={restoreBackup}
                disabled={(restoreMutation.isPending || (hasConflict && !restoreConflictChecked)) ?? undefined}
              >
                {restoreMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {hasConflict && !restoreConflictChecked ? "Acknowledge to Restore" : "Restore"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={(open) => { setExportOpen(open); if (!open) { setExportType(""); setExportFormat("CSV"); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Export Data</DialogTitle><DialogDescription>Export data from your database</DialogDescription></DialogHeader>
          {exportType && (
            <div className="space-y-4">
              <div>
                <Label>Export Type</Label>
                <p className="text-sm font-medium mt-1">{exportType}</p>
              </div>
              <div>
                <Label>Format</Label>
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CSV">CSV</SelectItem>
                    <SelectItem value="JSON">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {exportType === "Subscribers Data" && (
                <div className="flex items-center gap-2">
                  <Checkbox id="active-only" checked={exportActiveOnly} onCheckedChange={(v) => setExportActiveOnly(!!v)} />
                  <Label htmlFor="active-only" className="text-sm">Active subscribers only</Label>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button onClick={triggerExport} disabled={exportMutation.isPending}>
              {exportMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Backup Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this backup? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmDeleteBackup}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Cloud Backup Confirmation */}
      <AlertDialog open={!!cloudDeleteTarget} onOpenChange={(open) => { if (!open) setCloudDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cloud Backup</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{cloudDeleteTarget?.name}&quot; from the cloud provider? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmDeleteCloudBackup}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Encrypted Backup Restore Dialog */}
      <Dialog open={restoreEncryptedOpen} onOpenChange={(open) => { if (!open) { setRestoreEncryptedOpen(false); setRestoreEncryptedTarget(null); setRestoreEncryptedConfirm(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-600" />Restore Encrypted Backup</DialogTitle>
            <DialogDescription>Select an encrypted backup to restore. This will replace the entire database.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!restoreEncryptedConfirm && restoreEncryptedTarget && (
              <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-medium">{restoreEncryptedTarget.filePath}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>Date: {new Date(restoreEncryptedTarget.dateTime).toLocaleDateString("en-IN")}</div>
                  <div>Size: {restoreEncryptedTarget.size}</div>
                  <div>Status: {restoreEncryptedTarget.status}</div>
                </div>
              </div>
            )}
            {!restoreEncryptedConfirm && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                    <RotateCcw className="h-4 w-4 mr-2" />Proceed with Restore
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-red-600">⚠️ Danger: Full Database Restore</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will completely replace your current database with the encrypted backup.
                      All current data will be lost. This action cannot be undone.
                      Are you absolutely sure?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => setRestoreEncryptedConfirm(true)}>
                      Yes, Restore Database
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {restoreEncryptedConfirm && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                  <p className="font-medium">Final Confirmation Required</p>
                  <p className="mt-1">Click below to start the restore. The database will be replaced with the encrypted backup.</p>
                </div>
                <Button
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                  onClick={triggerEncryptedRestore}
                  disabled={encryptedRestoreMutation.isPending}
                >
                  {encryptedRestoreMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                  {encryptedRestoreMutation.isPending ? "Restoring Database..." : "Confirm Restore Now"}
                </Button>
              </div>
            )}
            {!restoreEncryptedTarget && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Select a backup from the list:</p>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {encryptedBackups.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No encrypted backups found.</p>
                  )}
                  {encryptedBackups.map((b) => (
                    <button
                      key={b.id}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left text-sm hover:bg-muted/50 transition-colors`}
                      onClick={() => { setRestoreEncryptedTarget(b); setRestoreEncryptedConfirm(false); }}
                    >
                      <div>
                        <p className="font-medium text-xs">{b.filePath}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(b.dateTime).toLocaleDateString("en-IN")} · {b.size} · {b.duration}
                        </p>
                      </div>
                      <Badge variant="outline" className={BACKUP_STATUS_STYLES[b.status] || ""}>{b.status}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default BackupPage;
