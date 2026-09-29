"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Radio, Plus, Trash2, RefreshCw, Copy, Search, Activity,
  Cpu, HardDrive, MemoryStick, Network, Globe, FileText,
  BarChart3, Server, ChevronDown, ChevronRight, CheckCircle2,
  XCircle, Clock, AlertTriangle, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────
interface SnmpDevice {
  id: string;
  host: string;
  community: string;
  version: string;
  port: number;
  label?: string;
  lastPolled?: string;
}

interface SystemInfoData {
  sysDescr: string;
  sysName: string;
  sysUpTime: string;
  sysContact: string;
  sysLocation: string;
  sysServices: string;
}

interface SnmpInterface {
  index: string;
  description: string;
  type: string;
  typeName: string;
  speed: string;
  speedFormatted: string;
  mac: string;
  adminStatus: string;
  operStatus: string;
  inOctets: string;
  outOctets: string;
}

interface CpuData {
  cpuLoad: number;
  cores: number;
  multiCore: { index: string; load: number }[];
}

interface MemoryData {
  totalReal: number;
  availReal: number;
  usedReal: number;
  usedPercent: number;
  totalSwap: number;
  availSwap: number;
  usedSwap: number;
  buffers: number;
  cached: number;
}

interface DiskEntry {
  index: string;
  path: string;
  device: string;
  total: number;
  used: number;
  avail: number;
  usedPercent: number;
}

interface SnmpVarbind {
  oid: string;
  type: number;
  typeName: string;
  value: string;
}

// ─── Constants ────────────────────────────────────────────────────
const STORAGE_KEY = "snmp-devices";

const OID_PRESETS: { label: string; oid: string; description: string }[] = [
  { label: "System Description", oid: "1.3.6.1.2.1.1.1", description: "sysDescr" },
  { label: "System Name", oid: "1.3.6.1.2.1.1.5", description: "sysName" },
  { label: "System Uptime", oid: "1.3.6.1.2.1.1.3", description: "sysUpTime" },
  { label: "System Contact", oid: "1.3.6.1.2.1.1.4", description: "sysContact" },
  { label: "System Location", oid: "1.3.6.1.2.1.1.6", description: "sysLocation" },
  { label: "All Interfaces", oid: "1.3.6.1.2.1.2.2.1", description: "ifTable walk" },
  { label: "Interface Names", oid: "1.3.6.1.2.1.2.2.1.2", description: "ifDescr" },
  { label: "Interface Status", oid: "1.3.6.1.2.1.2.2.1.8", description: "ifOperStatus" },
  { label: "IP Addresses", oid: "1.3.6.1.2.1.4.20.1", description: "ipAddrTable" },
  { label: "IP Routing", oid: "1.3.6.1.2.1.4.21.1", description: "ipRouteTable" },
  { label: "TCP Connections", oid: "1.3.6.1.2.1.6.13", description: "tcpConnTable" },
  { label: "UDP Listeners", oid: "1.3.6.1.2.1.7.5", description: "udpTable" },
  { label: "CPU Usage", oid: "1.3.6.1.4.1.2021.11", description: "UCD CPU" },
  { label: "Memory", oid: "1.3.6.1.4.1.2021.4", description: "UCD Memory" },
  { label: "Disk Table", oid: "1.3.6.1.4.1.2021.9.1", description: "UCD Disk" },
  { label: "Process Table", oid: "1.3.6.1.2.1.25.4.2.1", description: "hrSWRunTable" },
];

const MIB_TABLE: { name: string; oid: string; type: string; description: string }[] = [
  { name: "sysDescr", oid: "1.3.6.1.2.1.1.1.0", type: "DisplayString", description: "System description" },
  { name: "sysObjectID", oid: "1.3.6.1.2.1.1.2.0", type: "OBJECT IDENTIFIER", description: "Vendor identification" },
  { name: "sysUpTime", oid: "1.3.6.1.2.1.1.3.0", type: "TimeTicks", description: "Time since boot" },
  { name: "sysContact", oid: "1.3.6.1.2.1.1.4.0", type: "DisplayString", description: "Administrator contact" },
  { name: "sysName", oid: "1.3.6.1.2.1.1.5.0", type: "DisplayString", description: "System name" },
  { name: "sysLocation", oid: "1.3.6.1.2.1.1.6.0", type: "DisplayString", description: "Physical location" },
  { name: "sysServices", oid: "1.3.6.1.2.1.1.7.0", type: "INTEGER", description: "Service capabilities" },
  { name: "ifNumber", oid: "1.3.6.1.2.1.2.1.0", type: "INTEGER", description: "Number of interfaces" },
  { name: "ifDescr", oid: "1.3.6.1.2.1.2.2.1.2", type: "DisplayString", description: "Interface description" },
  { name: "ifType", oid: "1.3.6.1.2.1.2.2.1.3", type: "IANAifType", description: "Interface type" },
  { name: "ifSpeed", oid: "1.3.6.1.2.1.2.2.1.5", type: "Gauge32", description: "Bandwidth in bps" },
  { name: "ifPhysAddress", oid: "1.3.6.1.2.1.2.2.1.6", type: "PhysAddress", description: "MAC address" },
  { name: "ifAdminStatus", oid: "1.3.6.1.2.1.2.2.1.7", type: "INTEGER", description: "Admin status (1=up, 2=down)" },
  { name: "ifOperStatus", oid: "1.3.6.1.2.1.2.2.1.8", type: "INTEGER", description: "Operational status" },
  { name: "ifInOctets", oid: "1.3.6.1.2.1.2.2.1.10", type: "Counter32", description: "Bytes received" },
  { name: "ifOutOctets", oid: "1.3.6.1.2.1.2.2.1.16", type: "Counter32", description: "Bytes transmitted" },
  { name: "ipInReceives", oid: "1.3.6.1.2.1.4.3.0", type: "Counter32", description: "IP datagrams received" },
  { name: "ipOutRequests", oid: "1.3.6.1.2.1.4.10.0", type: "Counter32", description: "IP datagrams sent" },
  { name: "icmpInMsgs", oid: "1.3.6.1.2.1.5.1.0", type: "Counter32", description: "ICMP messages received" },
  { name: "tcpCurrEstab", oid: "1.3.6.1.2.1.6.9.0", type: "Gauge32", description: "Current established TCP" },
  { name: "udpInDatagrams", oid: "1.3.6.1.2.1.7.1.0", type: "Counter32", description: "UDP datagrams received" },
  { name: "hrSystemUptime", oid: "1.3.6.1.2.1.25.1.1.0", type: "TimeTicks", description: "Host uptime" },
  { name: "hrSystemNumUsers", oid: "1.3.6.1.2.1.25.1.5.0", type: "Gauge32", description: "Current users" },
  { name: "hrSystemProcesses", oid: "1.3.6.1.2.1.25.1.6.0", type: "Gauge32", description: "Running processes" },
  { name: "hrStorageSize", oid: "1.3.6.1.2.1.25.2.3.1.5", type: "INTEGER", description: "Storage size (KB)" },
  { name: "hrProcessorLoad", oid: "1.3.6.1.2.1.25.3.3.1.2", type: "INTEGER", description: "CPU load %" },
];

// ─── Helpers ──────────────────────────────────────────────────────
function loadDevices(): SnmpDevice[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveDevices(devices: SnmpDevice[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

function formatKB(kb: number): string {
  if (kb >= 1_048_576) return `${(kb / 1_048_576).toFixed(1)} GB`;
  if (kb >= 1_024) return `${(kb / 1_024).toFixed(1)} MB`;
  return `${kb} KB`;
}

function getProgressColor(value: number): string {
  if (value > 90) return "bg-red-500";
  if (value > 70) return "bg-amber-500";
  return "bg-emerald-500";
}

// ─── Component ────────────────────────────────────────────────────
export default function SnmpManagerPage() {
  const queryClient = useQueryClient();
  const [devices, setDevices] = useState<SnmpDevice[]>([]);
  const [activeDevice, setActiveDevice] = useState<SnmpDevice | null>(null);

  // Tab data
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [interfaces, setInterfaces] = useState<SnmpInterface[]>([]);
  const [cpuData, setCpuData] = useState<CpuData | null>(null);
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null);
  const [diskData, setDiskData] = useState<DiskEntry[]>([]);
  const [oidResults, setOidResults] = useState<SnmpVarbind[]>([]);

  // Loading states
  const [loadingSystem, setLoadingSystem] = useState(false);
  const [loadingInterfaces, setLoadingInterfaces] = useState(false);
  const [loadingPerf, setLoadingPerf] = useState(false);
  const [loadingOid, setLoadingOid] = useState(false);
  const [polling, setPolling] = useState(false);

  // Add device form
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newHost, setNewHost] = useState("");
  const [newCommunity, setNewCommunity] = useState("public");
  const [newVersion, setNewVersion] = useState("2c");
  const [newPort, setNewPort] = useState("161");
  const [newLabel, setNewLabel] = useState("");

  // OID browser
  const [oidInput, setOidInput] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");

  // Auto-refresh interval ref
  const perfIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved devices on mount
  useEffect(() => {
    setDevices(loadDevices());
    return () => {
      if (perfIntervalRef.current) clearInterval(perfIntervalRef.current);
    };
  }, []);

  // ─── Device management ───────────────────────────────────────
  function addDevice() {
    if (!newHost.trim()) { toast.error("Host is required"); return; }
    const device: SnmpDevice = {
      id: crypto.randomUUID(),
      host: newHost.trim(),
      community: newCommunity.trim() || "public",
      version: newVersion,
      port: parseInt(newPort, 10) || 161,
      label: newLabel.trim() || newHost.trim(),
    };
    const updated = [...devices, device];
    setDevices(updated);
    saveDevices(updated);
    setAddDialogOpen(false);
    setNewHost(""); setNewCommunity("public"); setNewVersion("2c"); setNewPort("161"); setNewLabel("");
    toast.success("Device saved");
  }

  function removeDevice(id: string) {
    const updated = devices.filter((d) => d.id !== id);
    setDevices(updated);
    saveDevices(updated);
    if (activeDevice?.id === id) {
      setActiveDevice(null);
      if (perfIntervalRef.current) clearInterval(perfIntervalRef.current);
    }
    toast.success("Device removed");
  }

  function selectDevice(device: SnmpDevice) {
    setActiveDevice(device);
    setSystemInfo(null);
    setInterfaces([]);
    setCpuData(null);
    setMemoryData(null);
    setDiskData([]);
    setOidResults([]);
    // Auto-poll system info
    pollSystemInfo(device);
  }

  // ─── Quick Poll ──────────────────────────────────────────────
  const pollMutation = useMutation({
    mutationFn: (device: SnmpDevice) =>
      apiFetch<{ success: boolean; data: SystemInfoData; error?: string }>("/api/snmp-manager", {
        method: "POST",
        body: JSON.stringify({ action: "getSystemInfo", host: device.host, community: device.community, version: device.version }),
      }),
    onSuccess: (res, device) => {
      if (res.success) {
        setSystemInfo(res.data);
        const updated = devices.map((d) => d.id === device.id ? { ...d, lastPolled: new Date().toISOString() } : d);
        setDevices(updated);
        saveDevices(updated);
      } else {
        toast.error("Poll failed", { description: res.error });
      }
    },
    onError: (err) => toast.error("Poll failed", { description: err.message }),
  });

  // ─── Generic fetch ───────────────────────────────────────────
  function snmpFetch<T>(action: string, body: Record<string, unknown>): Promise<{ success: boolean; data: T; error?: string }> {
    if (!activeDevice) return Promise.reject(new Error("No device selected"));
    return apiFetch("/api/snmp-manager", {
      method: "POST",
      body: JSON.stringify({ action, host: activeDevice.host, community: activeDevice.community, version: activeDevice.version, ...body }),
    });
  }

  // ─── Poll System Info ────────────────────────────────────────
  async function pollSystemInfo(device?: SnmpDevice) {
    const dev = device || activeDevice;
    if (!dev) return;
    setLoadingSystem(true);
    try {
      const res = await apiFetch<{ success: boolean; data: SystemInfoData; error?: string }>("/api/snmp-manager", {
        method: "POST",
        body: JSON.stringify({ action: "getSystemInfo", host: dev.host, community: dev.community, version: dev.version }),
      });
      if (res.success) {
        setSystemInfo(res.data);
        const updated = devices.map((d) => d.id === dev.id ? { ...d, lastPolled: new Date().toISOString() } : d);
        setDevices(updated);
        saveDevices(updated);
      } else {
        toast.error("Failed to get system info", { description: res.error });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed", { description: msg });
    } finally {
      setLoadingSystem(false);
    }
  }

  // ─── Fetch Interfaces ────────────────────────────────────────
  async function fetchInterfaces() {
    if (!activeDevice) return;
    setLoadingInterfaces(true);
    try {
      const res = await snmpFetch<SnmpInterface[]>("getInterfaces", {});
      if (res.success) setInterfaces(res.data);
      else toast.error("Failed", { description: res.error });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed", { description: msg });
    } finally {
      setLoadingInterfaces(false);
    }
  }

  // ─── Fetch Performance ───────────────────────────────────────
  async function fetchPerformance() {
    if (!activeDevice) return;
    setLoadingPerf(true);
    try {
      const [cpuRes, memRes, diskRes] = await Promise.all([
        snmpFetch<CpuData>("getCPU", {}),
        snmpFetch<MemoryData>("getMemory", {}),
        snmpFetch<DiskEntry[]>("getDisk", {}),
      ]);
      if (cpuRes.success) setCpuData(cpuRes.data);
      if (memRes.success) setMemoryData(memRes.data);
      if (diskRes.success) setDiskData(diskRes.data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed", { description: msg });
    } finally {
      setLoadingPerf(false);
    }
  }

  // ─── OID Walk ────────────────────────────────────────────────
  async function oidWalk() {
    if (!activeDevice || !oidInput.trim()) return;
    setLoadingOid(true);
    try {
      const res = await snmpFetch<SnmpVarbind[]>("walk", { oid: oidInput.trim() });
      if (res.success) setOidResults(res.data);
      else toast.error("Walk failed", { description: res.error });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Walk failed", { description: msg });
    } finally {
      setLoadingOid(false);
    }
  }

  // ─── Copy OID ────────────────────────────────────────────────
  function copyOid(oid: string) {
    navigator.clipboard.writeText(oid).then(() => {
      toast.success("OID copied", { description: oid });
    });
  }

  // ─── Auto-refresh toggle ─────────────────────────────────────
  function toggleAutoRefresh() {
    if (polling) {
      setPolling(false);
      if (perfIntervalRef.current) clearInterval(perfIntervalRef.current);
      perfIntervalRef.current = null;
    } else {
      setPolling(true);
      fetchPerformance();
      perfIntervalRef.current = setInterval(() => {
        fetchPerformance();
      }, 30000);
    }
  }

  // ─── Tab change ──────────────────────────────────────────────
  function handleTabChange(value: string) {
    if (!activeDevice) return;
    if (value === "system" && !systemInfo) pollSystemInfo();
    if (value === "interfaces" && interfaces.length === 0) fetchInterfaces();
    if (value === "performance" && !cpuData) fetchPerformance();
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Radio className="h-6 w-6 text-teal-500" />
            SNMP Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor SNMP-enabled devices
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
          <Plus className="h-4 w-4 mr-2" />Add Device
        </Button>
      </div>

      {/* Devices Tab */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Devices</CardTitle>
          <CardDescription className="text-xs">Add and manage SNMP-enabled devices</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Device List */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Saved Devices ({devices.length})
              </p>
              <ScrollArea className="max-h-72">
                {devices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Radio className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No SNMP devices added yet.
                  </div>
                ) : (
                  <div className="space-y-2 pr-3">
                    {devices.map((device) => (
                      <div
                        key={device.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer hover:shadow-sm ${activeDevice?.id === device.id ? "border-teal-400 bg-teal-50 dark:bg-teal-950/20" : "border-border hover:border-teal-200"}`}
                        onClick={() => selectDevice(device)}
                      >
                        <div className="p-1.5 rounded-md bg-teal-100 dark:bg-teal-950/40 shrink-0">
                          <Radio className="h-4 w-4 text-teal-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{device.label || device.host}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {device.host}:{device.port} · v{device.version} · {device.community}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {activeDevice?.id === device.id && (
                            <Badge variant="default" className="bg-teal-500 text-white text-[10px] px-1.5 py-0">Active</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={pollMutation.isPending}
                            onClick={(e) => { e.stopPropagation(); pollMutation.mutate(device); }}
                          >
                            <RefreshCw className={`h-3 w-3 ${pollMutation.isPending ? "animate-spin" : ""}`} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                            onClick={(e) => { e.stopPropagation(); removeDevice(device.id); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Quick Poll Results */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Quick Poll
              </p>
              {pollMutation.isPending || loadingSystem ? (
                <div className="space-y-3 mt-2">
                  <Skeleton className="h-24 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </div>
              ) : systemInfo ? (
                <div className="space-y-3 mt-2">
                  <div className="rounded-lg border p-4 bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/10">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 rounded-full bg-teal-200 dark:bg-teal-800/60">
                        <Server className="h-4 w-4 text-teal-700 dark:text-teal-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{systemInfo.sysName || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground truncate">{systemInfo.sysLocation || "No location"}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />Reachable
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{systemInfo.sysDescr || "No description"}</p>
                  </div>

                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Uptime</span>
                      <span className="font-medium">{systemInfo.sysUpTime || "N/A"}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Contact</span>
                      <span className="font-medium">{systemInfo.sysContact || "N/A"}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Services</span>
                      <span className="font-mono text-xs">{systemInfo.sysServices || "N/A"}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm border rounded-lg mt-2 border-dashed">
                  <Radio className="h-8 w-8 mb-2 opacity-40" />
                  Click a device to quick poll
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Tabs */}
      {activeDevice && (
        <Card className="border shadow-sm">
          <Tabs defaultValue="system" onValueChange={handleTabChange}>
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b rounded-none">
                  <TabsTrigger value="system" className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                    <Info className="h-3.5 w-3.5 mr-1.5" />System Info
                  </TabsTrigger>
                  <TabsTrigger value="interfaces" className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                    <Network className="h-3.5 w-3.5 mr-1.5" />Interfaces
                  </TabsTrigger>
                  <TabsTrigger value="performance" className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                    <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Performance
                  </TabsTrigger>
                  <TabsTrigger value="oid-browser" className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                    <Search className="h-3.5 w-3.5 mr-1.5" />OID Browser
                  </TabsTrigger>
                  <TabsTrigger value="mib-tools" className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                    <FileText className="h-3.5 w-3.5 mr-1.5" />MIB Tools
                  </TabsTrigger>
                </TabsList>
              </div>
            </CardHeader>

            <CardContent className="p-4 pt-4">
              {/* Tab 1: System Info */}
              <TabsContent value="system" className="mt-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">System Information</p>
                  <Button variant="outline" size="sm" onClick={() => pollSystemInfo()} disabled={loadingSystem}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingSystem ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
                {loadingSystem ? (
                  <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
                ) : systemInfo ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border">
                      <CardContent className="p-4 space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5"><Server className="h-4 w-4 text-teal-500" />Device Identity</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Name</span>
                            <span className="font-medium">{systemInfo.sysName}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Description</span>
                            <span className="font-medium max-w-[200px] truncate">{systemInfo.sysDescr}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Location</span>
                            <span className="font-medium">{systemInfo.sysLocation}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Contact</span>
                            <span className="font-medium">{systemInfo.sysContact}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Services</span>
                            <span className="font-mono">{systemInfo.sysServices}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border">
                      <CardContent className="p-4 space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5"><Clock className="h-4 w-4 text-teal-500" />Uptime & Status</h4>
                        <div className="rounded-lg bg-teal-50 dark:bg-teal-950/20 p-3 text-center">
                          <p className="text-2xl font-bold text-teal-700 dark:text-teal-400">{systemInfo.sysUpTime}</p>
                          <p className="text-xs text-muted-foreground mt-1">System Uptime</p>
                        </div>
                        <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-3 text-center">
                          <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-1" />
                          <p className="text-sm font-medium text-green-700 dark:text-green-400">SNMP Reachable</p>
                          <p className="text-xs text-muted-foreground">{activeDevice.host}:{activeDevice.port} (v{activeDevice.version})</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">No system info available</div>
                )}
              </TabsContent>

              {/* Tab 2: Interfaces */}
              <TabsContent value="interfaces" className="mt-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">
                    Network Interfaces
                    <Badge variant="secondary" className="ml-2 text-[10px]">{interfaces.length}</Badge>
                  </p>
                  <Button variant="outline" size="sm" onClick={fetchInterfaces} disabled={loadingInterfaces}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingInterfaces ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
                {loadingInterfaces ? (
                  <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : interfaces.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No interfaces found</div>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-12">#</TableHead>
                          <TableHead className="text-xs">Description</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Type</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">Speed</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">MAC</TableHead>
                          <TableHead className="text-xs">Admin</TableHead>
                          <TableHead className="text-xs">Oper</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">In</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Out</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {interfaces.map((iface) => (
                          <TableRow key={iface.index}>
                            <TableCell className="text-xs text-muted-foreground">{iface.index}</TableCell>
                            <TableCell className="text-sm font-medium">{iface.description}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">
                              <Badge variant="outline" className="text-[10px]">{iface.typeName}</Badge>
                            </TableCell>
                            <TableCell className="text-xs hidden lg:table-cell">{iface.speedFormatted}</TableCell>
                            <TableCell className="font-mono text-[11px] hidden md:table-cell">{iface.mac}</TableCell>
                            <TableCell>
                              <Badge variant={iface.adminStatus === "up" ? "default" : "destructive"} className={`text-[10px] ${iface.adminStatus === "up" ? "bg-green-500 text-white" : ""}`}>
                                {iface.adminStatus}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={iface.operStatus === "up" ? "default" : "destructive"} className={`text-[10px] ${iface.operStatus === "up" ? "bg-blue-500 text-white" : iface.operStatus === "down" ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}>
                                {iface.operStatus}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs hidden sm:table-cell">{formatKB(Math.round(parseInt(iface.inOctets, 10) / 1024))}</TableCell>
                            <TableCell className="text-xs hidden sm:table-cell">{formatKB(Math.round(parseInt(iface.outOctets, 10) / 1024))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Tab 3: Performance */}
              <TabsContent value="performance" className="mt-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">Performance Metrics</p>
                  <div className="flex gap-2">
                    <Button
                      variant={polling ? "default" : "outline"}
                      size="sm"
                      onClick={toggleAutoRefresh}
                      className={polling ? "bg-teal-600 text-white" : ""}
                    >
                      <Activity className={`h-3.5 w-3.5 mr-1.5 ${polling ? "animate-pulse" : ""}`} />
                      {polling ? "Auto: ON (30s)" : "Auto: OFF"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={fetchPerformance} disabled={loadingPerf}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingPerf ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>
                </div>

                {loadingPerf && !cpuData ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Skeleton className="h-40 rounded-lg" />
                    <Skeleton className="h-40 rounded-lg" />
                    <Skeleton className="h-40 rounded-lg" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* CPU */}
                    <Card className="border">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Cpu className="h-4 w-4 text-teal-500" />
                          <h4 className="text-sm font-semibold">CPU Usage</h4>
                        </div>
                        {cpuData ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-center">
                              <div className="relative w-24 h-24">
                                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
                                    strokeDasharray={`${cpuData.cpuLoad * 2.51} ${251 - cpuData.cpuLoad * 2.51}`}
                                    className={cpuData.cpuLoad > 80 ? "text-red-500" : cpuData.cpuLoad > 50 ? "text-amber-500" : "text-teal-500"}
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-lg font-bold">{cpuData.cpuLoad}%</span>
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground text-center">{cpuData.cores} core(s)</p>
                            {cpuData.multiCore.length > 1 && (
                              <div className="space-y-1">
                                {cpuData.multiCore.map((core) => (
                                  <div key={core.index} className="flex items-center gap-2 text-xs">
                                    <span className="w-12 text-muted-foreground">Core {core.index}</span>
                                    <Progress value={core.load} className="h-1.5 flex-1" />
                                    <span className="w-8 text-right tabular-nums">{core.load}%</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-muted-foreground text-xs">N/A</div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Memory */}
                    <Card className="border">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <MemoryStick className="h-4 w-4 text-teal-500" />
                          <h4 className="text-sm font-semibold">Memory Usage</h4>
                        </div>
                        {memoryData ? (
                          <div className="space-y-3">
                            <div className="text-center">
                              <p className="text-3xl font-bold">{memoryData.usedPercent}%</p>
                              <p className="text-xs text-muted-foreground">
                                {formatKB(memoryData.usedReal)} / {formatKB(memoryData.totalReal)}
                              </p>
                            </div>
                            <Progress value={memoryData.usedPercent} className="h-2" />
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div className="flex justify-between">
                                <span>Available</span>
                                <span className="font-medium text-foreground">{formatKB(memoryData.availReal)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Buffers</span>
                                <span className="font-medium text-foreground">{formatKB(memoryData.buffers)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Cached</span>
                                <span className="font-medium text-foreground">{formatKB(memoryData.cached)}</span>
                              </div>
                              <Separator />
                              <div className="flex justify-between">
                                <span>Swap Used</span>
                                <span className="font-medium text-foreground">{formatKB(memoryData.usedSwap)} / {formatKB(memoryData.totalSwap)}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-6 text-muted-foreground text-xs">N/A</div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Disk */}
                    <Card className="border">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <HardDrive className="h-4 w-4 text-teal-500" />
                          <h4 className="text-sm font-semibold">Disk Usage</h4>
                        </div>
                        {diskData.length > 0 ? (
                          <div className="space-y-3">
                            {diskData.map((disk) => (
                              <div key={disk.index} className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-mono truncate max-w-[120px]">{disk.path}</span>
                                  <span className={`font-medium ${disk.usedPercent > 90 ? "text-red-600" : disk.usedPercent > 70 ? "text-amber-600" : ""}`}>
                                    {disk.usedPercent}%
                                  </span>
                                </div>
                                <Progress value={disk.usedPercent} className="h-1.5" />
                                <p className="text-[10px] text-muted-foreground">
                                  {formatKB(disk.used)} / {formatKB(disk.total)} used
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-muted-foreground text-xs">No disk data available</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>

              {/* Tab 4: OID Browser */}
              <TabsContent value="oid-browser" className="mt-0">
                <p className="text-sm font-medium mb-3 flex items-center gap-1.5">
                  <Search className="h-4 w-4 text-teal-500" /> OID Browser
                </p>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <div className="flex-1">
                    <Input
                      value={oidInput}
                      onChange={(e) => setOidInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") oidWalk(); }}
                      placeholder="Enter OID (e.g. 1.3.6.1.2.1.1)"
                      className="font-mono text-sm"
                    />
                  </div>
                  <Select value={selectedPreset} onValueChange={(v) => {
                    setSelectedPreset(v);
                    const preset = OID_PRESETS.find((p) => p.oid === v);
                    if (preset) setOidInput(preset.oid);
                  }}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Presets..." />
                    </SelectTrigger>
                    <SelectContent>
                      {OID_PRESETS.map((p) => (
                        <SelectItem key={p.oid} value={p.oid}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={oidWalk} className="bg-teal-600 hover:bg-teal-700 text-white" disabled={loadingOid || !oidInput.trim()}>
                    {loadingOid ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
                    Walk
                  </Button>
                </div>

                {loadingOid ? (
                  <Skeleton className="h-48 w-full rounded-lg" />
                ) : oidResults.length > 0 ? (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">OID</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Value</TableHead>
                          <TableHead className="text-xs w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {oidResults.map((vb, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-[11px]">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button className="hover:text-teal-600" onClick={() => copyOid(vb.oid)}>
                                      {vb.oid}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Click to copy</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{vb.typeName}</Badge>
                            </TableCell>
                            <TableCell className="text-sm max-w-[300px] truncate">{vb.value}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyOid(vb.value)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg border-dashed">
                    Enter an OID and click Walk to browse the SNMP tree
                  </div>
                )}
              </TabsContent>

              {/* Tab 5: MIB Tools */}
              <TabsContent value="mib-tools" className="mt-0">
                <p className="text-sm font-medium mb-3 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-teal-500" /> Common SNMP MIB Reference
                </p>
                <p className="text-xs text-muted-foreground mb-3">Click the copy button to copy OID values for use in the OID Browser.</p>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">OID</TableHead>
                        <TableHead className="text-xs hidden sm:table-cell">Type</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Description</TableHead>
                        <TableHead className="text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MIB_TABLE.map((entry) => (
                        <TableRow key={entry.oid}>
                          <TableCell className="font-mono text-xs font-medium">{entry.name}</TableCell>
                          <TableCell className="font-mono text-[11px] text-teal-600">{entry.oid}</TableCell>
                          <TableCell className="text-xs hidden sm:table-cell">
                            <Badge variant="outline" className="text-[10px]">{entry.type}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{entry.description}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyOid(entry.oid)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      )}

      {/* ─── Add Device Dialog ──────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-teal-500" />
              Add SNMP Device
            </DialogTitle>
            <DialogDescription>Enter connection details for the SNMP-enabled device</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="snmp-label">Label (optional)</Label>
              <Input id="snmp-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Core Switch" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="snmp-host">Host / IP Address *</Label>
              <Input id="snmp-host" value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder="192.168.1.1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="snmp-version">Version</Label>
                <Select value={newVersion} onValueChange={setNewVersion}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">v1</SelectItem>
                    <SelectItem value="2c">v2c</SelectItem>
                    <SelectItem value="3">v3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="snmp-port">Port</Label>
                <Input id="snmp-port" type="number" value={newPort} onChange={(e) => setNewPort(e.target.value)} placeholder="161" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snmp-community">Community</Label>
                <Input id="snmp-community" value={newCommunity} onChange={(e) => setNewCommunity(e.target.value)} placeholder="public" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={addDevice} className="bg-teal-600 hover:bg-teal-700 text-white" disabled={!newHost.trim()}>
              <Plus className="h-4 w-4 mr-1.5" />Add Device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
