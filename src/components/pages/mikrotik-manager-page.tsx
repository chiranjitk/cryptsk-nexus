"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Router, Plus, Trash2, RefreshCw, Terminal, Network, Globe,
  ArrowUpDown, Wifi, Users, Shield, Plug, Unplug, Search,
  ChevronRight, Copy, Download, Upload, Cpu, HardDrive, Clock,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────
interface MikroTikDevice {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  label?: string;
  lastConnected?: string;
}

interface SystemInfo {
  identity: string;
  version: string;
  model: string;
  architecture: string;
  platform: string;
  uptime: string;
  cpu: { model: string; count: string; frequency: string; load: string };
  memory: { total: string; free: string };
  storage: { total: string; free: string };
  routerboard: { model: string; serial: string; firmware: string };
}

interface InterfaceInfo {
  id: string;
  name: string;
  type: string;
  mac: string;
  running: boolean;
  enabled: boolean;
  linkStatus: string;
  txBytes: string;
  rxBytes: string;
  speed: string;
  mtu: string;
}

interface IPInfo {
  id: string;
  address: string;
  interface: string;
  network: string;
  broadcast: string;
  disabled: boolean;
  dynamic: boolean;
  comment: string;
}

interface RouteInfo {
  id: string;
  destination: string;
  gateway: string;
  interface: string;
  distance: string;
  status: string;
  type: string;
  disabled: boolean;
  comment: string;
}

interface DHCPLease {
  id: string;
  ip: string;
  mac: string;
  hostname: string;
  status: string;
  address: string;
  lastSeen: string;
  dynamic: boolean;
  expiresAfter: string;
  comment: string;
}

interface ActiveUser {
  id: string;
  ip: string;
  mac: string;
  username: string;
  server: string;
  uptime: string;
  bytesIn: string;
  bytesOut: string;
  name?: string;
  service?: string;
  callerId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatBytes(bytesStr: string): string {
  const b = parseInt(bytesStr, 10) || 0;
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1_024) return `${(b / 1_024).toFixed(1)} KB`;
  return `${b} B`;
}

function memoryPercent(total: string, free: string): number {
  const t = parseInt(total, 10) || 1;
  const f = parseInt(free, 10) || 0;
  return Math.round(((t - f) / t) * 100);
}

const STORAGE_KEY = "mikrotik-devices";

function loadDevices(): MikroTikDevice[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveDevices(devices: MikroTikDevice[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

// ─── Component ────────────────────────────────────────────────────
export default function MikrotikManagerPage() {
  const [devices, setDevices] = useState<MikroTikDevice[]>([]);
  const [activeDevice, setActiveDevice] = useState<MikroTikDevice | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addIPDialogOpen, setAddIPDialogOpen] = useState(false);
  const [addRouteDialogOpen, setAddRouteDialogOpen] = useState(false);
  const [deleteIPDialogOpen, setDeleteIPDialogOpen] = useState(false);
  const [deleteRouteDialogOpen, setDeleteRouteDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Add device form
  const [newHost, setNewHost] = useState("");
  const [newPort, setNewPort] = useState("8728");
  const [newUsername, setNewUsername] = useState("admin");
  const [newPassword, setNewPassword] = useState("");
  const [newLabel, setNewLabel] = useState("");

  // Add IP form
  const [ipAddress, setIpAddress] = useState("");
  const [ipInterface, setIpInterface] = useState("");

  // Add Route form
  const [routeDest, setRouteDest] = useState("");
  const [routeGateway, setRouteGateway] = useState("");
  const [routeInterface, setRouteInterface] = useState("");
  const [routeDistance, setRouteDistance] = useState("1");

  // Terminal
  const [terminalCmd, setTerminalCmd] = useState("");
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Tab data
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [ips, setIps] = useState<IPInfo[]>([]);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [dhcpLeases, setDhcpLeases] = useState<DHCPLease[]>([]);
  const [hotspotUsers, setHotspotUsers] = useState<ActiveUser[]>([]);
  const [pppUsers, setPppUsers] = useState<ActiveUser[]>([]);

  // Loading states for tabs
  const [loadingInterfaces, setLoadingInterfaces] = useState(false);
  const [loadingIPs, setLoadingIPs] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingDHCP, setLoadingDHCP] = useState(false);
  const [loadingHotspot, setLoadingHotspot] = useState(false);
  const [loadingPPP, setLoadingPPP] = useState(false);

  // Load saved devices on mount
  useEffect(() => {
    setDevices(loadDevices());
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  // ─── Device management ───────────────────────────────────────
  function addDevice() {
    if (!newHost.trim()) { toast.error("Host is required"); return; }
    const device: MikroTikDevice = {
      id: crypto.randomUUID(),
      host: newHost.trim(),
      port: parseInt(newPort, 10) || 8728,
      username: newUsername.trim() || "admin",
      password: newPassword,
      label: newLabel.trim() || newHost.trim(),
    };
    const updated = [...devices, device];
    setDevices(updated);
    saveDevices(updated);
    setAddDialogOpen(false);
    setNewHost(""); setNewPort("8728"); setNewUsername("admin"); setNewPassword(""); setNewLabel("");
    toast.success("Device saved");
  }

  function removeDevice(id: string) {
    const updated = devices.filter((d) => d.id !== id);
    setDevices(updated);
    saveDevices(updated);
    if (activeDevice?.id === id) {
      setActiveDevice(null);
      setSystemInfo(null);
    }
    toast.success("Device removed");
  }

  // ─── Connect mutation ───────────────────────────────────────
  const connectMutation = useMutation({
    mutationFn: (device: MikroTikDevice) =>
      apiFetch<{ success: boolean; data: SystemInfo; error?: string }>("/api/mikrotik-manager", {
        method: "POST",
        body: JSON.stringify({ action: "connect", host: device.host, port: device.port, username: device.username, password: device.password }),
      }),
    onMutate: () => setConnecting(true),
    onSuccess: (res, device) => {
      setConnecting(false);
      if (res.success && res.data) {
        setActiveDevice(device);
        setSystemInfo(res.data);
        // Update last connected
        const updated = devices.map((d) => d.id === device.id ? { ...d, lastConnected: new Date().toISOString() } : d);
        setDevices(updated);
        saveDevices(updated);
        toast.success(`Connected to ${res.data.identity}`);
      } else {
        toast.error("Connection failed", { description: res.error || "Unknown error" });
      }
    },
    onError: (err) => {
      setConnecting(false);
      toast.error("Connection failed", { description: err.message });
    },
  });

  // ─── Generic data fetcher ───────────────────────────────────
  function fetchFromDevice(action: string, body: Record<string, unknown>) {
    if (!activeDevice) return Promise.resolve({ success: false, data: [], error: "No device selected" } as { success: boolean; data: unknown[]; error?: string });
    const req = { action, host: activeDevice.host, port: activeDevice.port, username: activeDevice.username, password: activeDevice.password, ...body };
    return apiFetch<{ success: boolean; data: unknown[]; error?: string }>("/api/mikrotik-manager", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  // ─── Fetch functions ────────────────────────────────────────
  const fetchInterfaces = useCallback(() => {
    if (!activeDevice) return;
    setLoadingInterfaces(true);
    fetchFromDevice("getInterfaces", {}).then((res) => {
      if (res.success) setInterfaces(res.data as InterfaceInfo[]);
      else toast.error("Failed to load interfaces", { description: res.error });
    }).catch((e) => toast.error("Failed", { description: e.message }))
      .finally(() => setLoadingInterfaces(false));
  }, [activeDevice]);

  const fetchIPs = useCallback(() => {
    if (!activeDevice) return;
    setLoadingIPs(true);
    fetchFromDevice("getIPs", {}).then((res) => {
      if (res.success) setIps(res.data as IPInfo[]);
      else toast.error("Failed to load IPs", { description: res.error });
    }).catch((e) => toast.error("Failed", { description: e.message }))
      .finally(() => setLoadingIPs(false));
  }, [activeDevice]);

  const fetchRoutes = useCallback(() => {
    if (!activeDevice) return;
    setLoadingRoutes(true);
    fetchFromDevice("getRoutes", {}).then((res) => {
      if (res.success) setRoutes(res.data as RouteInfo[]);
      else toast.error("Failed to load routes", { description: res.error });
    }).catch((e) => toast.error("Failed", { description: e.message }))
      .finally(() => setLoadingRoutes(false));
  }, [activeDevice]);

  const fetchDHCP = useCallback(() => {
    if (!activeDevice) return;
    setLoadingDHCP(true);
    fetchFromDevice("getDHCPLeases", {}).then((res) => {
      if (res.success) setDhcpLeases(res.data as DHCPLease[]);
      else toast.error("Failed to load DHCP leases", { description: res.error });
    }).catch((e) => toast.error("Failed", { description: e.message }))
      .finally(() => setLoadingDHCP(false));
  }, [activeDevice]);

  const fetchActiveUsers = useCallback(() => {
    if (!activeDevice) return;
    setLoadingHotspot(true);
    setLoadingPPP(true);
    Promise.all([
      fetchFromDevice("getHotspotActive", {}),
      fetchFromDevice("getPPPActive", {}),
    ]).then(([hsRes, pppRes]) => {
      if (hsRes.success) setHotspotUsers(hsRes.data as ActiveUser[]);
      else toast.error("Failed to load hotspot users", { description: hsRes.error });
      if (pppRes.success) setPppUsers(pppRes.data as ActiveUser[]);
      else toast.error("Failed to load PPP users", { description: pppRes.error });
    }).catch((e) => toast.error("Failed", { description: e.message }))
      .finally(() => { setLoadingHotspot(false); setLoadingPPP(false); });
  }, [activeDevice]);

  // ─── Toggle interface mutation ──────────────────────────────
  const toggleInterfaceMutation = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      fetchFromDevice(enable ? "enableInterface" : "disableInterface", { interfaceId: id }),
    onSuccess: (_, vars) => {
      toast.success(`Interface ${vars.enable ? "enabled" : "disabled"}`);
      fetchInterfaces();
    },
    onError: (err) => toast.error("Failed", { description: err.message }),
  });

  // ─── Add IP mutation ────────────────────────────────────────
  const addIPMutation = useMutation({
    mutationFn: () =>
      fetchFromDevice("addIP", { address: ipAddress, interface: ipInterface }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("IP address added");
        setAddIPDialogOpen(false);
        setIpAddress("");
        setIpInterface("");
        fetchIPs();
      } else {
        toast.error("Failed", { description: res.error });
      }
    },
    onError: (err) => toast.error("Failed", { description: err.message }),
  });

  // ─── Remove IP mutation ─────────────────────────────────────
  const removeIPMutation = useMutation({
    mutationFn: (ipId: string) =>
      fetchFromDevice("removeIP", { ipId }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("IP address removed");
        setDeleteIPDialogOpen(false);
        fetchIPs();
      } else {
        toast.error("Failed", { description: res.error });
      }
    },
    onError: (err) => toast.error("Failed", { description: err.message }),
  });

  // ─── Add Route mutation ─────────────────────────────────────
  const addRouteMutation = useMutation({
    mutationFn: () =>
      fetchFromDevice("addRoute", { destination: routeDest, gateway: routeGateway, interface: routeInterface || undefined, distance: routeDistance || undefined }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Route added");
        setAddRouteDialogOpen(false);
        setRouteDest(""); setRouteGateway(""); setRouteInterface(""); setRouteDistance("1");
        fetchRoutes();
      } else {
        toast.error("Failed", { description: res.error });
      }
    },
    onError: (err) => toast.error("Failed", { description: err.message }),
  });

  // ─── Remove Route mutation ──────────────────────────────────
  const removeRouteMutation = useMutation({
    mutationFn: (routeId: string) =>
      fetchFromDevice("removeRoute", { routeId }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Route removed");
        setDeleteRouteDialogOpen(false);
        fetchRoutes();
      } else {
        toast.error("Failed", { description: res.error });
      }
    },
    onError: (err) => toast.error("Failed", { description: err.message }),
  });

  // ─── Terminal command ───────────────────────────────────────
  async function executeCommand() {
    if (!activeDevice || !terminalCmd.trim()) return;
    const cmd = terminalCmd.trim();
    setTerminalOutput((prev) => [...prev, `> ${cmd}`]);
    setTerminalCmd("");
    setTerminalRunning(true);

    try {
      const res = await fetchFromDevice("command", { command: cmd });
      if (res.success) {
        const data = res.data as Record<string, string>[];
        if (data.length === 0) {
          setTerminalOutput((prev) => [...prev, "  (no output)"]);
        } else {
          const lines = data.map((row) => {
            return Object.entries(row)
              .filter(([k]) => !k.startsWith("."))
              .map(([k, v]) => `  ${k}: ${v}`)
              .join("\n");
          });
          setTerminalOutput((prev) => [...prev, ...lines]);
        }
      } else {
        setTerminalOutput((prev) => [...prev, `  Error: ${res.error || "Command failed"}`]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTerminalOutput((prev) => [...prev, `  Error: ${msg}`]);
    } finally {
      setTerminalRunning(false);
    }
  }

  // ─── Tab change handler ─────────────────────────────────────
  function handleTabChange(value: string) {
    if (!activeDevice) return;
    if (value === "interfaces" && interfaces.length === 0) fetchInterfaces();
    if (value === "ips" && ips.length === 0) fetchIPs();
    if (value === "routes" && routes.length === 0) fetchRoutes();
    if (value === "dhcp" && dhcpLeases.length === 0) fetchDHCP();
    if (value === "users" && hotspotUsers.length === 0) fetchActiveUsers();
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Router className="h-6 w-6 text-orange-500" />
            MikroTik Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage MikroTik RouterOS devices via API
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="bg-orange-600 hover:bg-orange-700 text-white">
          <Plus className="h-4 w-4 mr-2" />Add Device
        </Button>
      </div>

      {/* Connections / Device List */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Connections</CardTitle>
          <CardDescription className="text-xs">Add and manage MikroTik devices</CardDescription>
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
                    <Router className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No devices added yet.
                    <br />Click &quot;Add Device&quot; to get started.
                  </div>
                ) : (
                  <div className="space-y-2 pr-3">
                    {devices.map((device) => (
                      <div
                        key={device.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer hover:shadow-sm ${activeDevice?.id === device.id ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "border-border hover:border-orange-200"}`}
                      >
                        <div className="p-1.5 rounded-md bg-orange-100 dark:bg-orange-950/40 shrink-0">
                          <Router className="h-4 w-4 text-orange-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{device.label || device.host}</p>
                          <p className="text-xs text-muted-foreground font-mono">{device.host}:{device.port}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {activeDevice?.id === device.id && (
                            <Badge variant="default" className="bg-orange-500 text-white text-[10px] px-1.5 py-0">Active</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={connecting}
                            onClick={() => connectMutation.mutate(device)}
                          >
                            {connecting && activeDevice?.id === device.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <Plug className="h-3 w-3" />
                            )}
                            <span className="ml-1">Connect</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                            onClick={() => removeDevice(device.id)}
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

            {/* Device Info Card */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Device Info
              </p>
              {connecting ? (
                <div className="space-y-3 mt-2">
                  <Skeleton className="h-32 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                </div>
              ) : systemInfo ? (
                <div className="space-y-3 mt-2">
                  <div className="rounded-lg border p-4 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/10">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 rounded-full bg-orange-200 dark:bg-orange-800/60">
                        <Router className="h-4 w-4 text-orange-700 dark:text-orange-300" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{systemInfo.identity}</p>
                        <p className="text-xs text-muted-foreground">{systemInfo.version} / {systemInfo.model}</p>
                      </div>
                      <Badge variant="outline" className="ml-auto text-[10px] bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-green-200">
                        Connected
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Cpu className="h-3 w-3" />
                        <span>CPU: {systemInfo.cpu.load}%</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <HardDrive className="h-3 w-3" />
                        <span>MEM: {memoryPercent(systemInfo.memory.total, systemInfo.memory.free)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>Up: {systemInfo.uptime}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        <span>{systemInfo.architecture}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">CPU Model</span>
                      <span className="font-medium">{systemInfo.cpu.model} ({systemInfo.cpu.count} cores)</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">RouterBoard</span>
                      <span className="font-medium">{systemInfo.routerboard.model || "N/A"}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Serial Number</span>
                      <span className="font-mono text-xs">{systemInfo.routerboard.serial || "N/A"}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Firmware</span>
                      <span className="font-medium">{systemInfo.routerboard.firmware || "N/A"}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Memory</span>
                      <span className="font-medium">{systemInfo.memory.total} total / {systemInfo.memory.free} free</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Storage</span>
                      <span className="font-medium">{systemInfo.storage.total} total / {systemInfo.storage.free} free</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm border rounded-lg mt-2 border-dashed">
                  <Plug className="h-8 w-8 mb-2 opacity-40" />
                  Connect to a device to see details
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs (only shown when connected) */}
      {activeDevice && systemInfo && (
        <Card className="border shadow-sm">
          <Tabs defaultValue="interfaces" onValueChange={handleTabChange}>
            <CardHeader className="pb-0">
              <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b rounded-none">
                <TabsTrigger value="interfaces" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  <Network className="h-3.5 w-3.5 mr-1.5" />Interfaces
                </TabsTrigger>
                <TabsTrigger value="ips" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  <Globe className="h-3.5 w-3.5 mr-1.5" />IP Addresses
                </TabsTrigger>
                <TabsTrigger value="routes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />Routes
                </TabsTrigger>
                <TabsTrigger value="dhcp" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  <Wifi className="h-3.5 w-3.5 mr-1.5" />DHCP Leases
                </TabsTrigger>
                <TabsTrigger value="users" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  <Users className="h-3.5 w-3.5 mr-1.5" />Active Users
                </TabsTrigger>
                <TabsTrigger value="terminal" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  <Terminal className="h-3.5 w-3.5 mr-1.5" />Terminal
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="p-4 pt-4">
              {/* Tab 1: Interfaces */}
              <TabsContent value="interfaces" className="mt-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">Network Interfaces</p>
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
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">MAC</TableHead>
                          <TableHead className="text-xs">Running</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">TX Bytes</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">RX Bytes</TableHead>
                          <TableHead className="text-xs">Enabled</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {interfaces.map((iface) => (
                          <TableRow key={iface.id}>
                            <TableCell className="font-medium text-sm">{iface.name}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-[10px]">{iface.type}</Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono hidden md:table-cell">{iface.mac || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={iface.running ? "default" : "destructive"} className={`text-[10px] ${iface.running ? "bg-green-500 text-white" : ""}`}>
                                {iface.running ? "Up" : "Down"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs hidden sm:table-cell">{formatBytes(iface.txBytes)}</TableCell>
                            <TableCell className="text-xs hidden sm:table-cell">{formatBytes(iface.rxBytes)}</TableCell>
                            <TableCell>
                              <Switch
                                checked={iface.enabled}
                                onCheckedChange={(checked) => toggleInterfaceMutation.mutate({ id: iface.id, enable: checked })}
                                disabled={toggleInterfaceMutation.isPending}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Tab 2: IP Addresses */}
              <TabsContent value="ips" className="mt-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">IP Addresses</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={fetchIPs} disabled={loadingIPs}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingIPs ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                    <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setAddIPDialogOpen(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" />Add IP
                    </Button>
                  </div>
                </div>
                {loadingIPs ? (
                  <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : ips.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No IP addresses found</div>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Address</TableHead>
                          <TableHead className="text-xs">Interface</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Network</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Broadcast</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ips.map((ip) => (
                          <TableRow key={ip.id}>
                            <TableCell className="font-mono text-sm">{ip.address}</TableCell>
                            <TableCell className="text-sm">{ip.interface}</TableCell>
                            <TableCell className="font-mono text-xs hidden sm:table-cell">{ip.network}</TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{ip.broadcast}</TableCell>
                            <TableCell className="text-right">
                              {ip.dynamic ? (
                                <Badge variant="secondary" className="text-[10px]">Dynamic</Badge>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-red-500 hover:text-red-700"
                                  onClick={() => { setSelectedItemId(ip.id); setDeleteIPDialogOpen(true); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Tab 3: Routes */}
              <TabsContent value="routes" className="mt-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">Routing Table</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={fetchRoutes} disabled={loadingRoutes}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingRoutes ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                    <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setAddRouteDialogOpen(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" />Add Route
                    </Button>
                  </div>
                </div>
                {loadingRoutes ? (
                  <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : routes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No routes found</div>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Destination</TableHead>
                          <TableHead className="text-xs">Gateway</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Interface</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Distance</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">Type</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {routes.map((route) => (
                          <TableRow key={route.id}>
                            <TableCell className="font-mono text-sm">{route.destination}</TableCell>
                            <TableCell className="font-mono text-sm">{route.gateway}</TableCell>
                            <TableCell className="text-sm hidden sm:table-cell">{route.interface}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">{route.distance}</TableCell>
                            <TableCell className="text-xs hidden lg:table-cell">
                              <Badge variant="outline" className="text-[10px]">{route.type || "static"}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {route.type !== "connect" && route.type !== "unicast" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-red-500 hover:text-red-700"
                                  onClick={() => { setSelectedItemId(route.id); setDeleteRouteDialogOpen(true); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Tab 4: DHCP Leases */}
              <TabsContent value="dhcp" className="mt-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">DHCP Server Leases</p>
                  <Button variant="outline" size="sm" onClick={fetchDHCP} disabled={loadingDHCP}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingDHCP ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
                {loadingDHCP ? (
                  <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : dhcpLeases.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No DHCP leases found</div>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">IP</TableHead>
                          <TableHead className="text-xs">MAC</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Hostname</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Last Seen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dhcpLeases.map((lease) => (
                          <TableRow key={lease.id}>
                            <TableCell className="font-mono text-sm">{lease.ip}</TableCell>
                            <TableCell className="font-mono text-xs">{lease.mac}</TableCell>
                            <TableCell className="text-sm hidden sm:table-cell">{lease.hostname || "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={lease.status === "bound" ? "default" : "outline"}
                                className={`text-[10px] ${lease.status === "bound" ? "bg-green-500 text-white" : lease.status === "waiting" ? "bg-amber-500 text-white" : ""}`}
                              >
                                {lease.status || "unknown"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{lease.lastSeen || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Tab 5: Active Users (Hotspot + PPP) */}
              <TabsContent value="users" className="mt-0">
                <div className="space-y-6">
                  {/* Hotspot */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Wifi className="h-4 w-4 text-orange-500" /> Hotspot Active Users
                        <Badge variant="secondary" className="text-[10px]">{hotspotUsers.length}</Badge>
                      </p>
                      <Button variant="outline" size="sm" onClick={fetchActiveUsers} disabled={loadingHotspot}>
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingHotspot ? "animate-spin" : ""}`} />
                        Refresh
                      </Button>
                    </div>
                    {loadingHotspot ? (
                      <Skeleton className="h-20 w-full rounded-lg" />
                    ) : hotspotUsers.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg border-dashed">No active hotspot users</div>
                    ) : (
                      <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">User</TableHead>
                              <TableHead className="text-xs">IP</TableHead>
                              <TableHead className="text-xs hidden sm:table-cell">MAC</TableHead>
                              <TableHead className="text-xs hidden md:table-cell">Uptime</TableHead>
                              <TableHead className="text-xs hidden lg:table-cell">Download</TableHead>
                              <TableHead className="text-xs hidden lg:table-cell">Upload</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {hotspotUsers.map((user) => (
                              <TableRow key={user.id}>
                                <TableCell className="text-sm font-medium">{user.username}</TableCell>
                                <TableCell className="font-mono text-xs">{user.ip}</TableCell>
                                <TableCell className="font-mono text-xs hidden sm:table-cell">{user.mac}</TableCell>
                                <TableCell className="text-xs hidden md:table-cell">{user.uptime}</TableCell>
                                <TableCell className="text-xs hidden lg:table-cell">{formatBytes(user.bytesIn)}</TableCell>
                                <TableCell className="text-xs hidden lg:table-cell">{formatBytes(user.bytesOut)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* PPP */}
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5 mb-3">
                      <Users className="h-4 w-4 text-blue-500" /> PPP Active Connections
                      <Badge variant="secondary" className="text-[10px]">{pppUsers.length}</Badge>
                    </p>
                    {loadingPPP ? (
                      <Skeleton className="h-20 w-full rounded-lg" />
                    ) : pppUsers.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg border-dashed">No active PPP connections</div>
                    ) : (
                      <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Name</TableHead>
                              <TableHead className="text-xs">Service</TableHead>
                              <TableHead className="text-xs hidden sm:table-cell">Caller ID</TableHead>
                              <TableHead className="text-xs hidden md:table-cell">IP</TableHead>
                              <TableHead className="text-xs hidden lg:table-cell">Uptime</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pppUsers.map((user) => (
                              <TableRow key={user.id}>
                                <TableCell className="text-sm font-medium">{user.name}</TableCell>
                                <TableCell className="text-xs">
                                  <Badge variant="outline" className="text-[10px]">{user.service}</Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs hidden sm:table-cell">{user.callerId || "—"}</TableCell>
                                <TableCell className="font-mono text-xs hidden md:table-cell">{user.ip}</TableCell>
                                <TableCell className="text-xs hidden lg:table-cell">{user.uptime}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Tab 6: Terminal */}
              <TabsContent value="terminal" className="mt-0">
                <p className="text-sm font-medium mb-3 flex items-center gap-1.5">
                  <Terminal className="h-4 w-4 text-orange-500" /> RouterOS Terminal
                </p>
                <div className="rounded-lg border bg-zinc-950 text-green-400 font-mono text-xs overflow-hidden">
                  <div
                    ref={terminalRef}
                    className="max-h-72 overflow-y-auto p-4 space-y-1"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {terminalOutput.length === 0 ? (
                      <p className="text-zinc-500">Type a RouterOS command and press Execute.</p>
                    ) : (
                      terminalOutput.map((line, i) => (
                        <pre key={i} className="whitespace-pre-wrap break-all leading-relaxed">{line}</pre>
                      ))
                    )}
                    {terminalRunning && (
                      <pre className="text-zinc-400 animate-pulse">Executing...</pre>
                    )}
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-zinc-900 border-t border-zinc-800">
                    <Input
                      value={terminalCmd}
                      onChange={(e) => setTerminalCmd(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") executeCommand(); }}
                      placeholder="/system/resource/print"
                      className="flex-1 bg-transparent border-zinc-700 text-green-400 font-mono text-xs h-8"
                      disabled={terminalRunning}
                    />
                    <Button
                      size="sm"
                      onClick={executeCommand}
                      disabled={terminalRunning || !terminalCmd.trim()}
                      className="bg-orange-600 hover:bg-orange-700 text-white h-8"
                    >
                      Execute
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setTerminalOutput([])}
                      className="text-zinc-400 hover:text-white h-8"
                    >
                      Clear
                    </Button>
                  </div>
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
              <Router className="h-5 w-5 text-orange-500" />
              Add MikroTik Device
            </DialogTitle>
            <DialogDescription>Enter the connection details for the MikroTik device</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="device-label">Label (optional)</Label>
              <Input id="device-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Core Router" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="device-host">Host / IP Address *</Label>
              <Input id="device-host" value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder="192.168.88.1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="device-port">API Port</Label>
                <Input id="device-port" type="number" value={newPort} onChange={(e) => setNewPort(e.target.value)} placeholder="8728" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="device-username">Username *</Label>
                <Input id="device-username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="admin" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="device-password">Password</Label>
              <Input id="device-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={addDevice} className="bg-orange-600 hover:bg-orange-700 text-white" disabled={!newHost.trim()}>
              <Plus className="h-4 w-4 mr-1.5" />Add Device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add IP Dialog ──────────────────────────────────────── */}
      <Dialog open={addIPDialogOpen} onOpenChange={setAddIPDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add IP Address</DialogTitle>
            <DialogDescription>Add a new IP address to the device</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>IP Address / CIDR *</Label>
              <Input value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} placeholder="192.168.1.1/24" />
            </div>
            <div className="space-y-2">
              <Label>Interface *</Label>
              <Select value={ipInterface} onValueChange={setIpInterface}>
                <SelectTrigger><SelectValue placeholder="Select interface" /></SelectTrigger>
                <SelectContent>
                  {interfaces.map((i) => (
                    <SelectItem key={i.id} value={i.name}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddIPDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => addIPMutation.mutate()} className="bg-orange-600 hover:bg-orange-700 text-white" disabled={addIPMutation.isPending || !ipAddress || !ipInterface}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Route Dialog ───────────────────────────────────── */}
      <Dialog open={addRouteDialogOpen} onOpenChange={setAddRouteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Static Route</DialogTitle>
            <DialogDescription>Add a new static route to the routing table</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Destination *</Label>
              <Input value={routeDest} onChange={(e) => setRouteDest(e.target.value)} placeholder="10.0.0.0/24" />
            </div>
            <div className="space-y-2">
              <Label>Gateway *</Label>
              <Input value={routeGateway} onChange={(e) => setRouteGateway(e.target.value)} placeholder="192.168.88.1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Interface</Label>
                <Select value={routeInterface || "__all__"} onValueChange={(v) => setRouteInterface(v === "__all__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any</SelectItem>
                    {interfaces.map((i) => (
                      <SelectItem key={i.id} value={i.name}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Distance</Label>
                <Input type="number" value={routeDistance} onChange={(e) => setRouteDistance(e.target.value)} placeholder="1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRouteDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => addRouteMutation.mutate()} className="bg-orange-600 hover:bg-orange-700 text-white" disabled={addRouteMutation.isPending || !routeDest || !routeGateway}>
              Add Route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete IP Dialog ───────────────────────────────────── */}
      <AlertDialog open={deleteIPDialogOpen} onOpenChange={setDeleteIPDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove IP Address</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove this IP address from the device?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => selectedItemId && removeIPMutation.mutate(selectedItemId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Route Dialog ─────────────────────────────────── */}
      <AlertDialog open={deleteRouteDialogOpen} onOpenChange={setDeleteRouteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Route</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove this static route?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => selectedItemId && removeRouteMutation.mutate(selectedItemId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
