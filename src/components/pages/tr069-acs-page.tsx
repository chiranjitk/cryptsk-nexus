"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Radio, Server, Cpu, Database, FileText, Trash2, Plus, Search,
  RefreshCw, PlayCircle, PowerOff, RotateCcw, Eye, Upload,
  AlertTriangle, Wifi, WifiOff, Download, X, ChevronRight,
  Clock, Hash, Settings, Wrench, Shield, Loader2, CheckCircle2,
  XCircle, Info, Copy, Terminal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Types ────────────────────────────────────────────────────────────────

interface Tr069Device {
  _id: string;
  _lastInform?: number;
  _lastBoot?: number;
  _lastBootstrap?: number;
  _registered?: string;
  _tags: string[];
  oui: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  softwareVersion: string;
  isOnline: boolean;
  lastInformDate: string | null;
}

interface Tr069Task {
  _id: string;
  device: string;
  name: string;
  type?: string;
  [key: string]: unknown;
}

interface Tr069Provision {
  _id: string;
  name?: string;
  script?: string;
  created?: string;
  [key: string]: unknown;
}

interface Tr069Preset {
  _id: string;
  name?: string;
  created?: string;
  parameters?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface Tr069File {
  _id: string;
  _createdAt?: string;
  metadata?: Record<string, unknown>;
  fileType?: string;
  [key: string]: unknown;
}

interface Tr069Fault {
  _id: string;
  device?: string;
  timestamp?: string;
  message?: string;
  faultCode?: string;
  [key: string]: unknown;
}

interface ServiceStatus {
  success: boolean;
  mongodb: { running: boolean; port: number; dataPath?: string };
  services: Array<{
    name: string;
    port: number;
    bin: string;
    running: boolean;
    processRunning: boolean;
  }>;
  allRunning: boolean;
}

interface ServiceActionResponse {
  success: boolean;
  results?: Array<{ service: string; success: boolean; message: string }>;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function StatusBadge({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
      online
        ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
        : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-green-500" : "bg-red-500"} ${!online ? "animate-pulse" : ""}`} />
      {online ? "Online" : "Offline"}
    </span>
  );
}

function ServiceBadge({ running }: { running: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
      running
        ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
        : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-green-500" : "bg-red-500"}`} />
      {running ? "Running" : "Stopped"}
    </span>
  );
}

function formatTimestamp(ts: string | number | undefined | null): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function timeAgo(ts: number | undefined | null): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function Tr069AcsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");

  // ─── Dialog States ───
  // Devices
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [deviceDetailOpen, setDeviceDetailOpen] = useState(false);
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [addDeviceForm, setAddDeviceForm] = useState({ serialNumber: "", oui: "", productClass: "" });
  const [deleteDeviceConfirm, setDeleteDeviceConfirm] = useState(false);
  const [deleteDeviceTarget, setDeleteDeviceTarget] = useState<string | null>(null);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [deviceFilterStatus, setDeviceFilterStatus] = useState("all");

  // Tasks
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    deviceId: "",
    taskType: "reboot",
    parameterName: "",
    parameterValue: "",
    fileUrl: "",
  });
  const [deleteTaskConfirm, setDeleteTaskConfirm] = useState(false);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<string | null>(null);
  const [taskFilterStatus, setTaskFilterStatus] = useState("all");

  // Provisions
  const [createProvisionOpen, setCreateProvisionOpen] = useState(false);
  const [provisionForm, setProvisionForm] = useState({ name: "", script: "" });
  const [deleteProvisionConfirm, setDeleteProvisionConfirm] = useState(false);
  const [deleteProvisionTarget, setDeleteProvisionTarget] = useState<string | null>(null);

  // Presets
  const [createPresetOpen, setCreatePresetOpen] = useState(false);
  const [presetForm, setPresetForm] = useState({ name: "", parameters: "", precondition: "" });
  const [deletePresetConfirm, setDeletePresetConfirm] = useState(false);
  const [deletePresetTarget, setDeletePresetTarget] = useState<string | null>(null);

  // Files
  const [uploadFileOpen, setUploadFileOpen] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [fileMetadata, setFileMetadata] = useState("{}");
  const [deleteFileConfirm, setDeleteFileConfirm] = useState(false);
  const [deleteFileTarget, setDeleteFileTarget] = useState<string | null>(null);

  // Faults
  const [deleteFaultConfirm, setDeleteFaultConfirm] = useState(false);
  const [deleteFaultTarget, setDeleteFaultTarget] = useState<string | null>(null);

  // ─── Data Fetching ───

  // Service status
  const { data: serviceStatus, isLoading: serviceLoading, refetch: refetchService } = useQuery<ServiceStatus>({
    queryKey: ["tr069-service"],
    queryFn: () => apiFetch<ServiceStatus>("/api/tr069-acs/service"),
    refetchInterval: 15000,
  });

  // Devices
  const { data: devicesData, isLoading: devicesLoading, isFetching: devicesFetching } = useQuery({
    queryKey: ["tr069-devices"],
    queryFn: () => apiFetch<{ success: boolean; devices: Tr069Device[]; total: number; online: number; offline: number; serviceUnavailable?: boolean }>("/api/tr069-acs?resource=devices"),
    refetchInterval: 15000,
  });

  // Tasks
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["tr069-tasks"],
    queryFn: () => apiFetch<{ success: boolean; tasks: Tr069Task[]; serviceUnavailable?: boolean }>("/api/tr069-acs?resource=tasks"),
    refetchInterval: 15000,
  });

  // Provisions
  const { data: provisionsData, isLoading: provisionsLoading } = useQuery({
    queryKey: ["tr069-provisions"],
    queryFn: () => apiFetch<{ success: boolean; provisions: Tr069Provision[]; serviceUnavailable?: boolean }>("/api/tr069-acs?resource=provisions"),
    refetchInterval: 15000,
  });

  // Presets
  const { data: presetsData, isLoading: presetsLoading } = useQuery({
    queryKey: ["tr069-presets"],
    queryFn: () => apiFetch<{ success: boolean; presets: Tr069Preset[]; serviceUnavailable?: boolean }>("/api/tr069-acs?resource=presets"),
    refetchInterval: 15000,
  });

  // Files
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ["tr069-files"],
    queryFn: () => apiFetch<{ success: boolean; files: Tr069File[]; serviceUnavailable?: boolean }>("/api/tr069-acs?resource=files"),
    refetchInterval: 15000,
  });

  // Faults
  const { data: faultsData, isLoading: faultsLoading } = useQuery({
    queryKey: ["tr069-faults"],
    queryFn: () => apiFetch<{ success: boolean; faults: Tr069Fault[]; serviceUnavailable?: boolean }>("/api/tr069-acs?resource=faults"),
    refetchInterval: 15000,
  });

  // Device detail
  const { data: deviceDetail, isLoading: deviceDetailLoading } = useQuery({
    queryKey: ["tr069-device-detail", selectedDeviceId],
    queryFn: () => apiFetch<{ success: boolean; device: Record<string, unknown> }>(`/api/tr069-acs?resource=devices&id=${selectedDeviceId}`),
    enabled: !!selectedDeviceId && deviceDetailOpen,
  });

  // Extract data
  const devices = devicesData?.devices || [];
  const tasks = tasksData?.tasks || [];
  const provisions = provisionsData?.provisions || [];
  const presets = presetsData?.presets || [];
  const files = filesData?.files || [];
  const faults = faultsData?.faults || [];

  const totalDevices = devicesData?.total || 0;
  const onlineDevices = devicesData?.online || 0;
  const offlineDevices = devicesData?.offline || 0;

  const isServiceAvailable = serviceStatus?.allRunning ?? false;
  const isNbiAvailable = serviceStatus?.services?.find((s) => s.name === "NBI")?.running ?? false;

  // ─── Mutations ───

  // Service control
  const serviceActionMutation = useMutation({
    mutationFn: (action: string) =>
      apiFetch<ServiceActionResponse>("/api/tr069-acs/service", {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Service action completed`);
      } else {
        toast.error(data.error || "Service action failed");
      }
      queryClient.invalidateQueries({ queryKey: ["tr069-service"] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["tr069-service"] });
      }, 3000);
    },
    onError: (err) => toast.error(`Service action failed: ${String(err)}`),
  });

  // Create task
  const createTaskMutation = useMutation({
    mutationFn: (taskData: Record<string, unknown>) =>
      apiFetch("/api/tr069-acs", {
        method: "POST",
        body: JSON.stringify({ resource: "tasks", data: taskData }),
      }),
    onSuccess: () => {
      toast.success("Task created");
      queryClient.invalidateQueries({ queryKey: ["tr069-tasks"] });
      setCreateTaskOpen(false);
    },
    onError: (err) => toast.error(`Failed to create task: ${String(err)}`),
  });

  // Delete task
  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tr069-acs?resource=tasks&id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Task deleted");
      queryClient.invalidateQueries({ queryKey: ["tr069-tasks"] });
      setDeleteTaskConfirm(false);
      setDeleteTaskTarget(null);
    },
    onError: (err) => toast.error(`Failed to delete task: ${String(err)}`),
  });

  // Create provision
  const createProvisionMutation = useMutation({
    mutationFn: (provisionData: Record<string, unknown>) =>
      apiFetch("/api/tr069-acs", {
        method: "POST",
        body: JSON.stringify({ resource: "provisions", data: provisionData }),
      }),
    onSuccess: () => {
      toast.success("Provision created");
      queryClient.invalidateQueries({ queryKey: ["tr069-provisions"] });
      setCreateProvisionOpen(false);
    },
    onError: (err) => toast.error(`Failed to create provision: ${String(err)}`),
  });

  // Delete provision
  const deleteProvisionMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tr069-acs?resource=provisions&id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Provision deleted");
      queryClient.invalidateQueries({ queryKey: ["tr069-provisions"] });
      setDeleteProvisionConfirm(false);
      setDeleteProvisionTarget(null);
    },
    onError: (err) => toast.error(`Failed to delete provision: ${String(err)}`),
  });

  // Create preset
  const createPresetMutation = useMutation({
    mutationFn: (presetData: Record<string, unknown>) =>
      apiFetch("/api/tr069-acs", {
        method: "POST",
        body: JSON.stringify({ resource: "presets", data: presetData }),
      }),
    onSuccess: () => {
      toast.success("Preset created");
      queryClient.invalidateQueries({ queryKey: ["tr069-presets"] });
      setCreatePresetOpen(false);
    },
    onError: (err) => toast.error(`Failed to create preset: ${String(err)}`),
  });

  // Delete preset
  const deletePresetMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tr069-acs?resource=presets&id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Preset deleted");
      queryClient.invalidateQueries({ queryKey: ["tr069-presets"] });
      setDeletePresetConfirm(false);
      setDeletePresetTarget(null);
    },
    onError: (err) => toast.error(`Failed to delete preset: ${String(err)}`),
  });

  // Upload file
  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, metadata }: { file: File; metadata: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("metadata", metadata);
      const res = await fetch("/api/tr069-acs?resource=files", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
      return res.json();
    },
    onSuccess: () => {
      toast.success("File uploaded");
      queryClient.invalidateQueries({ queryKey: ["tr069-files"] });
      setUploadFileOpen(false);
      setFileToUpload(null);
      setFileMetadata("{}");
    },
    onError: (err) => toast.error(`Upload failed: ${String(err)}`),
  });

  // Delete file
  const deleteFileMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tr069-acs?resource=files&id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("File deleted");
      queryClient.invalidateQueries({ queryKey: ["tr069-files"] });
      setDeleteFileConfirm(false);
      setDeleteFileTarget(null);
    },
    onError: (err) => toast.error(`Failed to delete file: ${String(err)}`),
  });

  // Delete device
  const deleteDeviceMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tr069-acs?resource=devices&id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Device deleted");
      queryClient.invalidateQueries({ queryKey: ["tr069-devices"] });
      setDeleteDeviceConfirm(false);
      setDeleteDeviceTarget(null);
    },
    onError: (err) => toast.error(`Failed to delete device: ${String(err)}`),
  });

  // Reboot device
  const rebootDeviceMutation = useMutation({
    mutationFn: (deviceId: string) =>
      apiFetch("/api/tr069-acs", {
        method: "POST",
        body: JSON.stringify({ resource: "tasks", data: [{ device: deviceId, name: "reboot", task: { name: "reboot" } }] }),
      }),
    onSuccess: () => {
      toast.success("Reboot task created");
      queryClient.invalidateQueries({ queryKey: ["tr069-tasks"] });
    },
    onError: (err) => toast.error(`Failed to reboot device: ${String(err)}`),
  });

  // Factory reset device
  const factoryResetMutation = useMutation({
    mutationFn: (deviceId: string) =>
      apiFetch("/api/tr069-acs", {
        method: "POST",
        body: JSON.stringify({ resource: "tasks", data: [{ device: deviceId, name: "factoryReset", task: { name: "factoryReset" } }] }),
      }),
    onSuccess: () => {
      toast.success("Factory reset task created");
      queryClient.invalidateQueries({ queryKey: ["tr069-tasks"] });
    },
    onError: (err) => toast.error(`Failed to factory reset device: ${String(err)}`),
  });

  // Refresh device
  const refreshDeviceMutation = useMutation({
    mutationFn: (deviceId: string) =>
      apiFetch("/api/tr069-acs", {
        method: "POST",
        body: JSON.stringify({ resource: "tasks", data: [{ device: deviceId, name: "getParameterValues", task: { name: "getParameterValues", parameterNames: ["InternetGatewayDevice."] } }] }),
      }),
    onSuccess: () => {
      toast.success("Device refresh task created");
      queryClient.invalidateQueries({ queryKey: ["tr069-tasks"] });
    },
    onError: (err) => toast.error(`Failed to refresh device: ${String(err)}`),
  });

  // Delete fault
  const deleteFaultMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tr069-acs?resource=faults&id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Fault deleted");
      queryClient.invalidateQueries({ queryKey: ["tr069-faults"] });
      setDeleteFaultConfirm(false);
      setDeleteFaultTarget(null);
    },
    onError: (err) => toast.error(`Failed to delete fault: ${String(err)}`),
  });

  // ─── Handlers ───

  function openDeviceDetail(deviceId: string) {
    setSelectedDeviceId(deviceId);
    setDeviceDetailOpen(true);
  }

  function handleCreateTask() {
    const { deviceId, taskType, parameterName, parameterValue, fileUrl } = taskForm;
    if (!deviceId) {
      toast.error("Please select a device");
      return;
    }

    let taskData: Record<string, unknown>;

    switch (taskType) {
      case "reboot":
        taskData = { device: deviceId, name: "reboot", task: { name: "reboot" } };
        break;
      case "factoryReset":
        taskData = { device: deviceId, name: "factoryReset", task: { name: "factoryReset" } };
        break;
      case "download":
        taskData = {
          device: deviceId,
          name: "download",
          task: {
            name: "download",
            file: fileUrl || "firmware.bin",
          },
        };
        break;
      case "setParameter":
        taskData = {
          device: deviceId,
          name: "setParameterValues",
          task: {
            name: "setParameterValues",
            parameterValues: [[parameterName, parameterValue, "xsd:string"]],
          },
        };
        break;
      case "getParameter":
        taskData = {
          device: deviceId,
          name: "getParameterValues",
          task: {
            name: "getParameterValues",
            parameterNames: [parameterName],
          },
        };
        break;
      default:
        taskData = { device: deviceId, name: "reboot", task: { name: "reboot" } };
    }

    createTaskMutation.mutate(taskData);
  }

  function handleCreateProvision() {
    if (!provisionForm.name || !provisionForm.script) {
      toast.error("Name and script are required");
      return;
    }
    createProvisionMutation.mutate({
      name: provisionForm.name,
      script: provisionForm.script,
    });
  }

  function handleCreatePreset() {
    if (!presetForm.name) {
      toast.error("Name is required");
      return;
    }

    const paramLines = presetForm.parameters.split("\n").filter(Boolean);
    const parameters: Array<Record<string, unknown>> = [];
    for (const line of paramLines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const paramPath = line.substring(0, colonIdx).trim();
        const paramValue = line.substring(colonIdx + 1).trim();
        parameters.push({
          parameterPath: paramPath,
          value: paramValue,
        });
      }
    }

    const presetData: Record<string, unknown> = {
      name: presetForm.name,
      parameters: parameters.length > 0 ? parameters : [],
    };

    if (presetForm.precondition.trim()) {
      presetData.precondition = presetForm.precondition.trim();
    }

    createPresetMutation.mutate(presetData);
  }

  function handleUploadFile() {
    if (!fileToUpload) {
      toast.error("Please select a file");
      return;
    }
    uploadFileMutation.mutate({ file: fileToUpload, metadata: fileMetadata });
  }

  // ─── Filtered Data ───

  const filteredDevices = devices.filter((d) => {
    const matchesSearch = !deviceSearch ||
      d.serialNumber.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      d.manufacturer.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      d.model.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      d._id.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      d.oui.toLowerCase().includes(deviceSearch.toLowerCase());
    const matchesStatus =
      deviceFilterStatus === "all" ||
      (deviceFilterStatus === "online" && d.isOnline) ||
      (deviceFilterStatus === "offline" && !d.isOnline);
    return matchesSearch && matchesStatus;
  });

  // ─── Loading ───
  if (serviceLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="skeleton-wave h-20 rounded-lg" />
        <Skeleton className="skeleton-wave h-96 rounded-lg" />
      </div>
    );
  }

  // ─── Service Unavailable Banner JSX ───
  const unavailableBanner = (
    <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">GenieACS Services Not Running</h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              The TR-069 ACS services (CWMP, NBI, FS) are not running. Start them from the Overview tab to manage CPE devices.
              MongoDB must be running before GenieACS can start.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="bg-green-600 hover:bg-green-700 text-white border-green-600"
            onClick={() => serviceActionMutation.mutate("start")}
            disabled={serviceActionMutation.isPending}
          >
            {serviceActionMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1.5" />}
            Start Services
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // ─── Render ───
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">TR-069 ACS</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                isServiceAvailable
                  ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
              }`}>
                <span className={`h-2 w-2 rounded-full ${isServiceAvailable ? "bg-green-500" : "bg-red-500"} ${!isServiceAvailable ? "animate-pulse" : ""}`} />
                {isServiceAvailable ? "GenieACS Connected" : "Services Offline"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Auto Configuration Server — manage TR-069 CPE devices, tasks, provisions, and firmware.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["tr069-service"] });
              queryClient.invalidateQueries({ queryKey: ["tr069-devices"] });
              queryClient.invalidateQueries({ queryKey: ["tr069-tasks"] });
              queryClient.invalidateQueries({ queryKey: ["tr069-provisions"] });
              queryClient.invalidateQueries({ queryKey: ["tr069-presets"] });
              queryClient.invalidateQueries({ queryKey: ["tr069-files"] });
              queryClient.invalidateQueries({ queryKey: ["tr069-faults"] });
            }}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${devicesFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Service Unavailable Banner (shown when not on overview tab) */}
      {!isServiceAvailable && tab !== "overview" && unavailableBanner}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">
            <Eye className="h-4 w-4 mr-1.5 hidden sm:inline" />Overview
          </TabsTrigger>
          <TabsTrigger value="devices">
            <Radio className="h-4 w-4 mr-1.5 hidden sm:inline" />Devices
            {totalDevices > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 h-4">{totalDevices}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <Settings className="h-4 w-4 mr-1.5 hidden sm:inline" />Tasks
            {tasks.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 h-4">{tasks.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="provisions">
            <Terminal className="h-4 w-4 mr-1.5 hidden sm:inline" />Provisions
          </TabsTrigger>
          <TabsTrigger value="presets">
            <Wrench className="h-4 w-4 mr-1.5 hidden sm:inline" />Presets
          </TabsTrigger>
          <TabsTrigger value="files">
            <Upload className="h-4 w-4 mr-1.5 hidden sm:inline" />Files
          </TabsTrigger>
          <TabsTrigger value="faults">
            <AlertTriangle className="h-4 w-4 mr-1.5 hidden sm:inline" />Faults
            {faults.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0 h-4">{faults.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════ TAB 1: Overview ═══════════════════ */}
        <TabsContent value="overview">
          <div className="space-y-6">
            {/* Service Status Banner */}
            <Card className={`border-border/50 shadow-sm rounded-xl ${!isServiceAvailable ? "border-amber-300 dark:border-amber-700" : ""}`}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${isServiceAvailable ? "bg-green-100 dark:bg-green-950/40" : "bg-red-100 dark:bg-red-950/40"}`}>
                      {isServiceAvailable ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div>
                      <h3 className={`text-sm font-semibold ${isServiceAvailable ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                        {isServiceAvailable ? "All Services Running" : "Services Not Running"}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isServiceAvailable
                          ? "MongoDB, CWMP, NBI, and File Server are all operational."
                          : "Start all services to enable TR-069 device management."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-green-600 hover:bg-green-700 text-white border-green-600"
                      onClick={() => serviceActionMutation.mutate("start")}
                      disabled={serviceActionMutation.isPending || isServiceAvailable}
                    >
                      {serviceActionMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1.5" />}
                      Start
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                      onClick={() => serviceActionMutation.mutate("stop")}
                      disabled={serviceActionMutation.isPending || !isServiceAvailable}
                    >
                      {serviceActionMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PowerOff className="h-4 w-4 mr-1.5" />}
                      Stop
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => serviceActionMutation.mutate("restart")}
                      disabled={serviceActionMutation.isPending}
                    >
                      {serviceActionMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
                      Restart
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Service Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* MongoDB */}
              <Card className="border-0 rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/20 ring-1 ring-emerald-200/60 hover:scale-[1.02] transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gradient-to-br from-emerald-200 to-green-300 dark:from-emerald-800/60 dark:to-green-700/40 shadow-sm shadow-emerald-500/25">
                        <Database className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">MongoDB</p>
                        <p className="text-xs text-muted-foreground">Port 27017</p>
                      </div>
                    </div>
                    <ServiceBadge running={serviceStatus?.mongodb?.running ?? false} />
                  </div>
                </CardContent>
              </Card>
              {/* CWMP */}
              <Card className="border-0 rounded-xl bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-950/30 dark:to-cyan-950/20 ring-1 ring-sky-200/60 hover:scale-[1.02] transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gradient-to-br from-sky-200 to-cyan-300 dark:from-sky-800/60 dark:to-cyan-700/40 shadow-sm shadow-sky-500/25">
                        <Radio className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">CWMP</p>
                        <p className="text-xs text-muted-foreground">Port 7547</p>
                      </div>
                    </div>
                    <ServiceBadge running={serviceStatus?.services?.find((s) => s.name === "CWMP")?.running ?? false} />
                  </div>
                </CardContent>
              </Card>
              {/* NBI */}
              <Card className="border-0 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20 ring-1 ring-violet-200/60 hover:scale-[1.02] transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gradient-to-br from-violet-200 to-purple-300 dark:from-violet-800/60 dark:to-purple-700/40 shadow-sm shadow-violet-500/25">
                        <Cpu className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">NBI API</p>
                        <p className="text-xs text-muted-foreground">Port 7548</p>
                      </div>
                    </div>
                    <ServiceBadge running={serviceStatus?.services?.find((s) => s.name === "NBI")?.running ?? false} />
                  </div>
                </CardContent>
              </Card>
              {/* FS */}
              <Card className="border-0 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 ring-1 ring-amber-200/60 hover:scale-[1.02] transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gradient-to-br from-amber-200 to-orange-300 dark:from-amber-800/60 dark:to-orange-700/40 shadow-sm shadow-amber-500/25">
                        <Server className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">File Server</p>
                        <p className="text-xs text-muted-foreground">Port 7567</p>
                      </div>
                    </div>
                    <ServiceBadge running={serviceStatus?.services?.find((s) => s.name === "FS")?.running ?? false} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-0 rounded-xl bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/20 ring-1 ring-slate-200/60">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800/60 dark:to-slate-700/40">
                      <Radio className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{totalDevices}</p>
                      <p className="text-xs text-muted-foreground">Total Devices</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 ring-1 ring-green-200/60">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-gradient-to-br from-green-200 to-green-300 dark:from-green-800/60 dark:to-green-700/40">
                      <Wifi className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-green-600">{onlineDevices}</p>
                      <p className="text-xs text-muted-foreground">Online</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20 ring-1 ring-amber-200/60">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-800/60 dark:to-amber-700/40">
                      <Settings className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-amber-600">{tasks.length}</p>
                      <p className="text-xs text-muted-foreground">Tasks</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 rounded-xl bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-950/30 dark:to-red-950/20 ring-1 ring-rose-200/60">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-gradient-to-br from-rose-200 to-red-300 dark:from-rose-800/60 dark:to-red-700/40">
                      <AlertTriangle className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-rose-600">{faults.length}</p>
                      <p className="text-xs text-muted-foreground">Faults</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Service Info */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Service Information</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Shield className="h-3.5 w-3.5" />
                      <span>ACS URL:</span>
                      <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">http://&lt;server&gt;:7547</code>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Cpu className="h-3.5 w-3.5" />
                      <span>NBI API:</span>
                      <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">http://127.0.0.1:7548</code>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Server className="h-3.5 w-3.5" />
                      <span>File Server:</span>
                      <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">http://127.0.0.1:7567</code>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Database className="h-3.5 w-3.5" />
                      <span>MongoDB:</span>
                      <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">127.0.0.1:27017/genieacs</code>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 2: Devices ═══════════════════ */}
        <TabsContent value="devices">
          {!isNbiAvailable && unavailableBanner}
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-2 flex-1 w-full sm:w-auto">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search devices..."
                    className="pl-8 h-9"
                    value={deviceSearch}
                    onChange={(e) => setDeviceSearch(e.target.value)}
                  />
                </div>
                <Select value={deviceFilterStatus} onValueChange={setDeviceFilterStatus}>
                  <SelectTrigger className="h-9 w-full sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={() => setAddDeviceOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Device
              </Button>
            </div>

            {/* Devices Table */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 bg-background z-10">
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Serial Number</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Manufacturer</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Model</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Software</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Last Inform</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {devicesLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          </TableRow>
                        ))
                      ) : filteredDevices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                            <Radio className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                            <p className="text-sm">
                              {!isNbiAvailable ? "Start services to view devices" : "No devices found"}
                            </p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredDevices.map((device) => (
                          <TableRow key={device._id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDeviceDetail(device._id)}>
                            <TableCell><StatusBadge online={device.isOnline} /></TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium font-mono">{device.serialNumber || device._id}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{device.oui}</p>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm">{device.manufacturer || "—"}</TableCell>
                            <TableCell className="hidden lg:table-cell text-sm">{device.model || "—"}</TableCell>
                            <TableCell className="hidden xl:table-cell text-sm font-mono text-xs">{device.softwareVersion || "—"}</TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                              {timeAgo(device._lastInform)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View Details" onClick={() => openDeviceDetail(device._id)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Refresh" onClick={() => refreshDeviceMutation.mutate(device._id)}>
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600" title="Reboot" onClick={() => rebootDeviceMutation.mutate(device._id)}>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" title="Delete" onClick={() => { setDeleteDeviceTarget(device._id); setDeleteDeviceConfirm(true); }}>
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

            {/* Devices count */}
            {filteredDevices.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                Showing {filteredDevices.length} of {totalDevices} devices
              </p>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 3: Tasks ═══════════════════ */}
        <TabsContent value="tasks">
          {!isNbiAvailable && unavailableBanner}
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <Select value={taskFilterStatus} onValueChange={setTaskFilterStatus}>
                <SelectTrigger className="h-9 w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => setCreateTaskOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                New Task
              </Button>
            </div>

            {/* Tasks Table */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 bg-background z-10">
                        <TableHead className="text-xs">Task</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Device</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Name</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Created</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasksLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-40" /></TableCell>
                            <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                            <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          </TableRow>
                        ))
                      ) : tasks.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                            <Settings className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                            <p className="text-sm">{!isNbiAvailable ? "Start services to view tasks" : "No tasks found"}</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        tasks.map((task) => {
                          const taskId = task._id || "";
                          const taskName = task.name || "Unknown";
                          const taskDevice = task.device || "";
                          const taskStatus = (task as Record<string, unknown>).status as string || "pending";
                          const taskCreated = formatTimestamp((task as Record<string, unknown>)._createdAt as string);

                          return (
                            <TableRow key={taskId}>
                              <TableCell className="text-xs font-mono max-w-[100px] truncate">{taskId.substring(0, 16)}...</TableCell>
                              <TableCell className="hidden md:table-cell text-xs font-mono max-w-[150px] truncate">{taskDevice}</TableCell>
                              <TableCell className="hidden lg:table-cell text-sm">{taskName}</TableCell>
                              <TableCell>
                                <Badge className={`border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                  taskStatus === "done"
                                    ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                                    : taskStatus === "error"
                                      ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                                }`}>
                                  {taskStatus}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">{taskCreated}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { setDeleteTaskTarget(taskId); setDeleteTaskConfirm(true); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 4: Provisions ═══════════════════ */}
        <TabsContent value="provisions">
          {!isNbiAvailable && unavailableBanner}
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setProvisionForm({ name: "", script: 'declare("InternetGatewayDevice.DeviceInfo.", {value: Date.now()});\nlog("Provision executed");' }); setCreateProvisionOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" />
                New Provision
              </Button>
            </div>

            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 bg-background z-10">
                        <TableHead className="text-xs">ID</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Script Preview</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {provisionsLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-60" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          </TableRow>
                        ))
                      ) : provisions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                            <Terminal className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                            <p className="text-sm">{!isNbiAvailable ? "Start services to view provisions" : "No provisions found"}</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        provisions.map((prov) => {
                          const provId = prov._id || "";
                          const provName = (prov.name as string) || provId;
                          const provScript = (prov.script as string) || "";

                          return (
                            <TableRow key={provId}>
                              <TableCell className="text-xs font-mono max-w-[100px] truncate">{provId.substring(0, 16)}...</TableCell>
                              <TableCell className="text-sm font-medium">{provName}</TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono max-w-[300px] truncate">{provScript.substring(0, 80)}{provScript.length > 80 ? "..." : ""}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { setDeleteProvisionTarget(provId); setDeleteProvisionConfirm(true); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 5: Presets ═══════════════════ */}
        <TabsContent value="presets">
          {!isNbiAvailable && unavailableBanner}
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setPresetForm({ name: "", parameters: "", precondition: "" }); setCreatePresetOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" />
                New Preset
              </Button>
            </div>

            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 bg-background z-10">
                        <TableHead className="text-xs">ID</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Parameters</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Precondition</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {presetsLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                            <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-40" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          </TableRow>
                        ))
                      ) : presets.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                            <Wrench className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                            <p className="text-sm">{!isNbiAvailable ? "Start services to view presets" : "No presets found"}</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        presets.map((preset) => {
                          const presetId = preset._id || "";
                          const presetName = (preset.name as string) || presetId;
                          const presetParams = Array.isArray(preset.parameters) ? preset.parameters : [];
                          const presetPrecondition = (preset.precondition as string) || "";

                          return (
                            <TableRow key={presetId}>
                              <TableCell className="text-xs font-mono max-w-[100px] truncate">{presetId.substring(0, 16)}...</TableCell>
                              <TableCell className="text-sm font-medium">{presetName}</TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge variant="secondary" className="text-[10px]">{presetParams.length} param{presetParams.length !== 1 ? "s" : ""}</Badge>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{presetPrecondition || "—"}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { setDeletePresetTarget(presetId); setDeletePresetConfirm(true); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 6: Files ═══════════════════ */}
        <TabsContent value="files">
          {!isNbiAvailable && unavailableBanner}
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setFileToUpload(null); setFileMetadata("{}"); setUploadFileOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" />
                Upload File
              </Button>
            </div>

            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 bg-background z-10">
                        <TableHead className="text-xs">ID</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Type</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Created</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Metadata</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filesLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                            <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          </TableRow>
                        ))
                      ) : files.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                            <p className="text-sm">{!isNbiAvailable ? "Start services to view files" : "No files uploaded"}</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        files.map((file) => {
                          const fileId = file._id || "";
                          const fileType = (file.fileType as string) || (file.metadata?.fileType as string) || "unknown";
                          const fileCreatedAt = formatTimestamp(file._createdAt);

                          return (
                            <TableRow key={fileId}>
                              <TableCell className="text-xs font-mono max-w-[100px] truncate">{fileId.substring(0, 16)}...</TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge variant="outline" className="text-[10px]">{fileType}</Badge>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{fileCreatedAt}</TableCell>
                              <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                                {file.metadata ? JSON.stringify(file.metadata).substring(0, 50) : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { setDeleteFileTarget(fileId); setDeleteFileConfirm(true); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 7: Faults ═══════════════════ */}
        <TabsContent value="faults">
          {!isNbiAvailable && unavailableBanner}
          <div className="space-y-4">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 bg-background z-10">
                        <TableHead className="text-xs">ID</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Device</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Timestamp</TableHead>
                        <TableHead className="text-xs">Message</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Fault Code</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {faultsLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          </TableRow>
                        ))
                      ) : faults.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500/50" />
                            <p className="text-sm">{!isNbiAvailable ? "Start services to view faults" : "No faults reported"}</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        faults.map((fault) => {
                          const faultId = fault._id || "";
                          const faultDevice = (fault.device as string) || "";
                          const faultMessage = (fault.message as string) || "—";
                          const faultCode = (fault.faultCode as string) || "";
                          const faultTimestamp = formatTimestamp(fault.timestamp);

                          return (
                            <TableRow key={faultId}>
                              <TableCell className="text-xs font-mono max-w-[80px] truncate">{faultId.substring(0, 12)}...</TableCell>
                              <TableCell className="hidden md:table-cell text-xs font-mono max-w-[120px] truncate">{faultDevice}</TableCell>
                              <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{faultTimestamp}</TableCell>
                              <TableCell className="text-sm max-w-[250px] truncate text-red-600">{faultMessage}</TableCell>
                              <TableCell className="hidden md:table-cell">
                                {faultCode ? (
                                  <Badge variant="destructive" className="text-[10px]">{faultCode}</Badge>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { setDeleteFaultTarget(faultId); setDeleteFaultConfirm(true); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════ DIALOGS ═══════════════════ */}

      {/* Device Detail Dialog */}
      <Dialog open={deviceDetailOpen} onOpenChange={(open) => { if (!open) { setDeviceDetailOpen(false); setSelectedDeviceId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              Device Details
            </DialogTitle>
            <DialogDescription>Viewing device parameters and information</DialogDescription>
          </DialogHeader>
          {deviceDetailLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-32" />
              <Skeleton className="h-48" />
            </div>
          ) : deviceDetail?.device ? (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                {/* Device ID and basic info */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Device ID</Label>
                    <p className="text-sm font-mono mt-0.5 break-all">{String(deviceDetail.device._id || "—")}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Serial Number</Label>
                    <p className="text-sm font-mono mt-0.5">
                      {String((deviceDetail.device._deviceId as Record<string, unknown>)?.SerialNumber || "—")}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Manufacturer</Label>
                    <p className="text-sm mt-0.5">{String((deviceDetail.device._deviceId as Record<string, unknown>)?.Manufacturer || "—")}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Model</Label>
                    <p className="text-sm mt-0.5">{String((deviceDetail.device._deviceId as Record<string, unknown>)?.ProductClass || "—")}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Software Version</Label>
                    <p className="text-sm mt-0.5">{String((deviceDetail.device._deviceId as Record<string, unknown>)?.SoftwareVersion || "—")}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Inform</Label>
                    <p className="text-sm mt-0.5">{formatTimestamp(deviceDetail.device._lastInform as number)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Boot</Label>
                    <p className="text-sm mt-0.5">{formatTimestamp(deviceDetail.device._lastBoot as number)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tags</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.isArray(deviceDetail.device._tags) && (deviceDetail.device._tags as string[]).length > 0
                        ? (deviceDetail.device._tags as string[]).map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                          ))
                        : <span className="text-sm text-muted-foreground">—</span>
                      }
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Device Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { rebootDeviceMutation.mutate(String(deviceDetail.device._id)); }}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Reboot
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { factoryResetMutation.mutate(String(deviceDetail.device._id)); }}>
                    <Settings className="h-3.5 w-3.5 mr-1.5" />Factory Reset
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { refreshDeviceMutation.mutate(String(deviceDetail.device._id)); }}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-500" onClick={() => { deleteDeviceMutation.mutate(String(deviceDetail.device._id)); setDeviceDetailOpen(false); }}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
                  </Button>
                </div>

                <Separator />

                {/* Parameter Tree */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Device Parameters</Label>
                  <div className="mt-2 bg-muted/50 rounded-lg p-3 max-h-[300px] overflow-y-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                      {JSON.stringify(deviceDetail.device, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Failed to load device details</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Device Dialog */}
      <Dialog open={addDeviceOpen} onOpenChange={setAddDeviceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Device
            </DialogTitle>
            <DialogDescription>Manually register a CPE device. The device will need to contact the ACS for full provisioning.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Serial Number *</Label>
              <Input
                placeholder="e.g. SN123456789"
                value={addDeviceForm.serialNumber}
                onChange={(e) => setAddDeviceForm({ ...addDeviceForm, serialNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>OUI (Organization Unique Identifier)</Label>
              <Input
                placeholder="e.g. 001122"
                value={addDeviceForm.oui}
                onChange={(e) => setAddDeviceForm({ ...addDeviceForm, oui: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Product Class</Label>
              <Input
                placeholder="e.g. InternetGatewayDevice"
                value={addDeviceForm.productClass}
                onChange={(e) => setAddDeviceForm({ ...addDeviceForm, productClass: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDeviceOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!addDeviceForm.serialNumber) {
                toast.error("Serial number is required");
                return;
              }
              // Create a preset-based registration or inform user
              toast.info("Device will be registered when it contacts the ACS. Configure the device with the ACS URL and credentials.");
              setAddDeviceOpen(false);
            }}>
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Device Confirm */}
      <Dialog open={deleteDeviceConfirm} onOpenChange={setDeleteDeviceConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Device
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this device? This action cannot be undone. The device ID: <code className="font-mono text-xs">{deleteDeviceTarget}</code>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDeviceConfirm(false); setDeleteDeviceTarget(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteDeviceTarget) deleteDeviceMutation.mutate(deleteDeviceTarget); }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      <Dialog open={createTaskOpen} onOpenChange={setCreateTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Task
            </DialogTitle>
            <DialogDescription>Create a new task for a device (reboot, factory reset, download, set/get parameter)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Device *</Label>
              <Select value={taskForm.deviceId} onValueChange={(v) => setTaskForm({ ...taskForm, deviceId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a device" />
                </SelectTrigger>
                <SelectContent>
                  {devices.length === 0 ? (
                    <SelectItem value="__none__" disabled>No devices available</SelectItem>
                  ) : (
                    devices.map((d) => (
                      <SelectItem key={d._id} value={d._id}>
                        <span className="font-mono text-xs">{d.serialNumber || d._id}</span>
                        <span className="ml-2 text-muted-foreground">{d.manufacturer} {d.model}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Task Type *</Label>
              <Select value={taskForm.taskType} onValueChange={(v) => setTaskForm({ ...taskForm, taskType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reboot">Reboot</SelectItem>
                  <SelectItem value="factoryReset">Factory Reset</SelectItem>
                  <SelectItem value="download">Download Firmware</SelectItem>
                  <SelectItem value="setParameter">Set Parameter</SelectItem>
                  <SelectItem value="getParameter">Get Parameter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(taskForm.taskType === "setParameter" || taskForm.taskType === "getParameter") && (
              <>
                <div className="space-y-2">
                  <Label>Parameter Name</Label>
                  <Input
                    placeholder="e.g. InternetGatewayDevice.DeviceInfo.Manufacturer"
                    value={taskForm.parameterName}
                    onChange={(e) => setTaskForm({ ...taskForm, parameterName: e.target.value })}
                  />
                </div>
                {taskForm.taskType === "setParameter" && (
                  <div className="space-y-2">
                    <Label>Parameter Value</Label>
                    <Input
                      placeholder="e.g. MyISP"
                      value={taskForm.parameterValue}
                      onChange={(e) => setTaskForm({ ...taskForm, parameterValue: e.target.value })}
                    />
                  </div>
                )}
              </>
            )}
            {taskForm.taskType === "download" && (
              <div className="space-y-2">
                <Label>File URL</Label>
                <Input
                  placeholder="e.g. firmware.bin"
                  value={taskForm.fileUrl}
                  onChange={(e) => setTaskForm({ ...taskForm, fileUrl: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTaskOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={createTaskMutation.isPending}>
              {createTaskMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Task Confirm */}
      <Dialog open={deleteTaskConfirm} onOpenChange={setDeleteTaskConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Task
            </DialogTitle>
            <DialogDescription>Are you sure you want to delete this task?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTaskConfirm(false); setDeleteTaskTarget(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteTaskTarget) deleteTaskMutation.mutate(deleteTaskTarget); }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Provision Dialog */}
      <Dialog open={createProvisionOpen} onOpenChange={setCreateProvisionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Provision
            </DialogTitle>
            <DialogDescription>Write a JavaScript provision script that runs when a device connects</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Provision Name *</Label>
              <Input
                placeholder="e.g. configure-wan-pppoe"
                value={provisionForm.name}
                onChange={(e) => setProvisionForm({ ...provisionForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Script *</Label>
              <Textarea
                placeholder={`// GenieACS provision script\ndeclare("InternetGatewayDevice.DeviceInfo.", {value: Date.now()});\nlog("Provision executed");`}
                className="font-mono text-xs min-h-[200px]"
                value={provisionForm.script}
                onChange={(e) => setProvisionForm({ ...provisionForm, script: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateProvisionOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProvision} disabled={createProvisionMutation.isPending}>
              {createProvisionMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Create Provision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Provision Confirm */}
      <Dialog open={deleteProvisionConfirm} onOpenChange={setDeleteProvisionConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Provision
            </DialogTitle>
            <DialogDescription>Are you sure you want to delete this provision?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteProvisionConfirm(false); setDeleteProvisionTarget(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteProvisionTarget) deleteProvisionMutation.mutate(deleteProvisionTarget); }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Preset Dialog */}
      <Dialog open={createPresetOpen} onOpenChange={setCreatePresetOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Preset
            </DialogTitle>
            <DialogDescription>Define parameter values that will be applied to matching devices</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Preset Name *</Label>
              <Input
                placeholder="e.g. default-wan-config"
                value={presetForm.name}
                onChange={(e) => setPresetForm({ ...presetForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Parameters (one per line: path: value)</Label>
              <Textarea
                placeholder={`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username: user@isp\nInternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password: password123`}
                className="font-mono text-xs min-h-[120px]"
                value={presetForm.parameters}
                onChange={(e) => setPresetForm({ ...presetForm, parameters: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">Each line should be in format: <code className="font-mono">parameter.path: value</code></p>
            </div>
            <div className="space-y-2">
              <Label>Precondition (optional)</Label>
              <Textarea
                placeholder='e.g. declare("InternetGatewayDevice.DeviceInfo.Manufacturer", {value: "TP-Link"});'
                className="font-mono text-xs min-h-[80px]"
                value={presetForm.precondition}
                onChange={(e) => setPresetForm({ ...presetForm, precondition: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">JavaScript expression that determines when this preset applies</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePresetOpen(false)}>Cancel</Button>
            <Button onClick={handleCreatePreset} disabled={createPresetMutation.isPending}>
              {createPresetMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Create Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Preset Confirm */}
      <Dialog open={deletePresetConfirm} onOpenChange={setDeletePresetConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Preset
            </DialogTitle>
            <DialogDescription>Are you sure you want to delete this preset?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeletePresetConfirm(false); setDeletePresetTarget(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deletePresetTarget) deletePresetMutation.mutate(deletePresetTarget); }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload File Dialog */}
      <Dialog open={uploadFileOpen} onOpenChange={setUploadFileOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload File
            </DialogTitle>
            <DialogDescription>Upload firmware or configuration files for device provisioning</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>File *</Label>
              <Input
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setFileToUpload(file);
                }}
              />
              {fileToUpload && (
                <p className="text-xs text-muted-foreground">
                  Selected: {fileToUpload.name} ({(fileToUpload.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Metadata (JSON)</Label>
              <Textarea
                placeholder='{"fileType": "firmware", "version": "1.0.0"}'
                className="font-mono text-xs min-h-[80px]"
                value={fileMetadata}
                onChange={(e) => setFileMetadata(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadFileOpen(false)}>Cancel</Button>
            <Button onClick={handleUploadFile} disabled={uploadFileMutation.isPending || !fileToUpload}>
              {uploadFileMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete File Confirm */}
      <Dialog open={deleteFileConfirm} onOpenChange={setDeleteFileConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete File
            </DialogTitle>
            <DialogDescription>Are you sure you want to delete this file?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteFileConfirm(false); setDeleteFileTarget(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteFileTarget) deleteFileMutation.mutate(deleteFileTarget); }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Fault Confirm */}
      <Dialog open={deleteFaultConfirm} onOpenChange={setDeleteFaultConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Clear Fault
            </DialogTitle>
            <DialogDescription>Are you sure you want to clear this fault?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteFaultConfirm(false); setDeleteFaultTarget(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteFaultTarget) deleteFaultMutation.mutate(deleteFaultTarget); }}>
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
