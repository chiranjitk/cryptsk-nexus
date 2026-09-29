"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Terminal, Server, Plus, Trash2, Play, XCircle, CheckCircle,
  Copy, RefreshCw, Send, ChevronDown, ChevronUp, Monitor,
  Zap, List, Layers, Loader2, Square, Eye, Wifi, ArrowRight,
  AlertTriangle, Key, Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────
interface SshDevice {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "key";
  password?: string;
  privateKey?: string;
  status?: "online" | "offline" | "unknown";
  lastTested?: string;
}

interface TerminalLine {
  type: "input" | "output" | "error" | "info";
  content: string;
  timestamp: Date;
}

interface BatchResult {
  device: SshDevice;
  command: string;
  results: Array<{ command: string; stdout: string; stderr: string; exitCode: number; success: boolean }>;
  error?: string;
}

// ─── Quick Commands ───────────────────────────────────────────────
const QUICK_COMMANDS = [
  { label: "Show System", icon: Monitor, command: "uname -a; echo '---'; uptime; echo '---'; free -m; echo '---'; df -h", description: "System info, uptime, memory, disk" },
  { label: "Show Interfaces", icon: Globe, command: "ip addr show 2>/dev/null || ifconfig", description: "Network interfaces and IPs" },
  { label: "Show Routes", icon: Layers, command: "ip route show 2>/dev/null || netstat -rn", description: "Routing table" },
  { label: "Show Processes", icon: List, command: "ps aux --sort=-%mem | head -20", description: "Top 20 processes by memory" },
  { label: "Show DNS", icon: Zap, command: "cat /etc/resolv.conf", description: "DNS resolver configuration" },
];

// ─── LocalStorage helpers ─────────────────────────────────────────
const STORAGE_KEY = "ssh-device-manager-devices";

function loadDevices(): SshDevice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDevices(devices: SshDevice[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

// ─── Stat Card ────────────────────────────────────────────────────
function StatCard({ title, value, subtitle, icon: Icon, gradient }: {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; gradient: string;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">{title}</p>
            <p className="text-xl font-bold mt-1 tabular-nums">{value}</p>
            <p className="text-xs mt-0.5 opacity-75">{subtitle}</p>
          </div>
          <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function SshDeviceManagerPage() {
  const [devices, setDevices] = useState<SshDevice[]>([]);
  const [activeTab, setActiveTab] = useState("devices");

  // Device form state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deviceForm, setDeviceForm] = useState({
    label: "", host: "", port: "22", username: "root",
    authType: "password" as "password" | "key",
    password: "", privateKey: "",
  });

  // Terminal state
  const [selectedDevice, setSelectedDevice] = useState<SshDevice | null>(null);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalOutput, setTerminalOutput] = useState<TerminalLine[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Quick command state
  const [quickDevice, setQuickDevice] = useState<SshDevice | null>(null);
  const [quickResult, setQuickResult] = useState("");
  const [customCommand, setCustomCommand] = useState("");

  // Batch state
  const [batchCommands, setBatchCommands] = useState("");
  const [batchDevices, setBatchDevices] = useState<string[]>([]);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  // Load devices on mount
  useEffect(() => {
    setDevices(loadDevices());
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalOutput]);

  // ─── SSH mutations ─────────────────────────────────────────
  const testConnection = useMutation({
    mutationFn: (device: SshDevice) =>
      apiFetch("/api/ssh-device-manager", {
        method: "POST",
        body: JSON.stringify({
          action: "connect",
          host: device.host,
          port: device.port,
          username: device.username,
          password: device.authType === "password" ? device.password : undefined,
          privateKey: device.authType === "key" ? device.privateKey : undefined,
        }),
      }),
    onSuccess: (data: any, device) => {
      if (data.success) {
        toast.success(`Connected to ${device.label || device.host}`);
        setDevices((prev) =>
          prev.map((d) => d.id === device.id ? { ...d, status: "online", lastTested: new Date().toISOString() } : d)
        );
      } else {
        toast.error(`Connection failed: ${data.error}`);
        setDevices((prev) =>
          prev.map((d) => d.id === device.id ? { ...d, status: "offline", lastTested: new Date().toISOString() } : d)
        );
      }
    },
    onError: (err) => toast.error(`Connection error: ${err.message}`),
  });

  const executeCommand = useMutation({
    mutationFn: ({ device, command }: { device: SshDevice; command: string }) =>
      apiFetch("/api/ssh-device-manager", {
        method: "POST",
        body: JSON.stringify({
          action: "execute",
          host: device.host,
          port: device.port,
          username: device.username,
          password: device.authType === "password" ? device.password : undefined,
          privateKey: device.authType === "key" ? device.privateKey : undefined,
          command,
        }),
      }),
  });

  const executeBatch = useMutation({
    mutationFn: ({ device, commands }: { device: SshDevice; commands: string[] }) =>
      apiFetch("/api/ssh-device-manager", {
        method: "POST",
        body: JSON.stringify({
          action: "executeBatch",
          host: device.host,
          port: device.port,
          username: device.username,
          password: device.authType === "password" ? device.password : undefined,
          privateKey: device.authType === "key" ? device.privateKey : undefined,
          commands,
        }),
      }),
  });

  // ─── Helpers ───────────────────────────────────────────────
  function addDevice() {
    if (!deviceForm.host || !deviceForm.username) {
      toast.error("Host and username are required");
      return;
    }
    const newDevice: SshDevice = {
      id: crypto.randomUUID(),
      label: deviceForm.label || deviceForm.host,
      host: deviceForm.host,
      port: parseInt(deviceForm.port) || 22,
      username: deviceForm.username,
      authType: deviceForm.authType,
      password: deviceForm.password,
      privateKey: deviceForm.privateKey,
      status: "unknown",
    };
    const updated = [...devices, newDevice];
    setDevices(updated);
    saveDevices(updated);
    setAddDialogOpen(false);
    setDeviceForm({ label: "", host: "", port: "22", username: "root", authType: "password", password: "", privateKey: "" });
    toast.success(`Device "${newDevice.label}" added`);
  }

  function removeDevice(id: string) {
    const updated = devices.filter((d) => d.id !== id);
    setDevices(updated);
    saveDevices(updated);
    if (selectedDevice?.id === id) setSelectedDevice(null);
    if (quickDevice?.id === id) setQuickDevice(null);
    toast.success("Device removed");
  }

  function addTerminalLine(type: TerminalLine["type"], content: string) {
    setTerminalOutput((prev) => [...prev, { type, content, timestamp: new Date() }]);
  }

  const sendTerminalCommand = useCallback(async () => {
    if (!terminalInput.trim() || !selectedDevice || isExecuting) return;

    const cmd = terminalInput.trim();
    addTerminalLine("input", `$ ${cmd}`);
    setTerminalInput("");
    setCommandHistory((prev) => [...prev.filter((c) => c !== cmd), cmd]);
    setHistoryIndex(-1);
    setIsExecuting(true);

    try {
      const data = await executeCommand.mutateAsync({ device: selectedDevice, command: cmd });
      if (data.success) {
        if (data.stdout) addTerminalLine("output", data.stdout);
        if (data.stderr) addTerminalLine("error", data.stderr);
      } else {
        addTerminalLine("error", data.error || "Command failed");
      }
    } catch (err: any) {
      addTerminalLine("error", err.message || "Execution failed");
    } finally {
      setIsExecuting(false);
    }
  }, [terminalInput, selectedDevice, isExecuting]);

  function handleTerminalKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTerminalCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setTerminalInput(commandHistory[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setTerminalInput("");
        } else {
          setHistoryIndex(newIndex);
          setTerminalInput(commandHistory[newIndex]);
        }
      }
    }
  }

  async function runQuickCommand(cmd: string) {
    if (!quickDevice) {
      toast.error("Select a device first");
      return;
    }
    setQuickResult("Executing...");
    try {
      const data = await executeCommand.mutateAsync({ device: quickDevice, command: cmd });
      if (data.success) {
        setQuickResult((data.stdout || "(no output)") + (data.stderr ? "\n\nSTDERR:\n" + data.stderr : ""));
      } else {
        setQuickResult("Error: " + (data.error || "Command failed"));
      }
    } catch (err: any) {
      setQuickResult("Error: " + err.message);
    }
  }

  async function runCustomCommand() {
    if (!customCommand.trim()) return;
    await runQuickCommand(customCommand);
  }

  async function runBatch() {
    const cmds = batchCommands.split("\n").map((c) => c.trim()).filter(Boolean);
    if (cmds.length === 0) {
      toast.error("Enter at least one command");
      return;
    }
    if (batchDevices.length === 0) {
      toast.error("Select at least one device");
      return;
    }

    setIsBatchRunning(true);
    setBatchResults([]);
    const results: BatchResult[] = [];

    for (const deviceId of batchDevices) {
      const device = devices.find((d) => d.id === deviceId);
      if (!device) continue;
      try {
        const data = await executeBatch.mutateAsync({ device, commands: cmds });
        results.push({ device, command: cmds.join("; "), results: data.results || [] });
      } catch (err: any) {
        results.push({ device, command: cmds.join("; "), results: [], error: err.message });
      }
    }

    setBatchResults(results);
    setIsBatchRunning(false);
    toast.success(`Batch execution complete on ${results.length} device(s)`);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  function toggleBatchDevice(id: string) {
    setBatchDevices((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  // ─── Stats ──────────────────────────────────────────────────
  const onlineCount = devices.filter((d) => d.status === "online").length;
  const offlineCount = devices.filter((d) => d.status === "offline").length;

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SSH Device Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect to network devices via SSH, execute commands, and manage remote systems
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-destructive hover:bg-destructive/90 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Add Device
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add SSH Device</DialogTitle>
              <DialogDescription>Configure a new device to connect via SSH</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label className="text-sm font-medium mb-1 block">Label</Label>
                <Input placeholder="e.g. Core Router" value={deviceForm.label} onChange={(e) => setDeviceForm({ ...deviceForm, label: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1 block">Host *</Label>
                <Input placeholder="e.g. 192.168.1.1" value={deviceForm.host} onChange={(e) => setDeviceForm({ ...deviceForm, host: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium mb-1 block">Port</Label>
                  <Input placeholder="22" value={deviceForm.port} onChange={(e) => setDeviceForm({ ...deviceForm, port: e.target.value })} />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Username *</Label>
                  <Input placeholder="root" value={deviceForm.username} onChange={(e) => setDeviceForm({ ...deviceForm, username: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium mb-1 block">Auth Type</Label>
                <Select value={deviceForm.authType} onValueChange={(v) => setDeviceForm({ ...deviceForm, authType: v as "password" | "key" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="password">Password</SelectItem>
                    <SelectItem value="key">Private Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {deviceForm.authType === "password" ? (
                <div>
                  <Label className="text-sm font-medium mb-1 block">Password</Label>
                  <Input type="password" placeholder="SSH password" value={deviceForm.password} onChange={(e) => setDeviceForm({ ...deviceForm, password: e.target.value })} />
                </div>
              ) : (
                <div>
                  <Label className="text-sm font-medium mb-1 block">Private Key (PEM)</Label>
                  <Textarea placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" value={deviceForm.privateKey} onChange={(e) => setDeviceForm({ ...deviceForm, privateKey: e.target.value })} rows={4} className="font-mono text-xs" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
              <Button className="bg-destructive hover:bg-destructive/90 text-white" onClick={addDevice}>Add Device</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Devices" value={devices.length} subtitle="Saved devices" icon={Server} gradient="stat-gradient-red" />
        <StatCard title="Online" value={onlineCount} subtitle="Reachable via SSH" icon={CheckCircle} gradient="stat-gradient-green" />
        <StatCard title="Offline" value={offlineCount} subtitle="Connection failed" icon={XCircle} gradient="stat-gradient-amber" />
        <StatCard title="Commands Run" value={terminalOutput.length} subtitle="This session" icon={Terminal} gradient="stat-gradient-blue" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="devices"><Server className="h-4 w-4 mr-1.5" />Devices</TabsTrigger>
          <TabsTrigger value="terminal"><Terminal className="h-4 w-4 mr-1.5" />Terminal</TabsTrigger>
          <TabsTrigger value="quick"><Zap className="h-4 w-4 mr-1.5" />Quick Commands</TabsTrigger>
          <TabsTrigger value="batch"><Layers className="h-4 w-4 mr-1.5" />Batch Execute</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Devices ──────────────────────────────────── */}
        <TabsContent value="devices">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Saved Devices</CardTitle>
              <CardDescription>Manage your SSH device connections. Credentials are stored in browser localStorage.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Label</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Host:Port</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Username</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Auth</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Last Tested</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          <Server className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No devices added yet. Click &quot;Add Device&quot; to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      devices.map((device) => (
                        <TableRow key={device.id} className="odd:bg-muted/10 hover:bg-muted/30 transition-colors">
                          <TableCell>
                            {device.status === "online" ? (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5" />Online
                              </Badge>
                            ) : device.status === "offline" ? (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 mr-1.5" />Offline
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 mr-1.5" />Unknown
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{device.label}</TableCell>
                          <TableCell className="text-xs font-mono">{device.host}:{device.port}</TableCell>
                          <TableCell className="text-xs">{device.username}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {device.authType === "password" ? <Key className="h-3 w-3 mr-1" /> : null}
                              {device.authType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {device.lastTested ? new Date(device.lastTested).toLocaleTimeString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm" variant="ghost"
                                      disabled={testConnection.isPending}
                                      onClick={() => testConnection.mutate(device)}
                                    >
                                      {testConnection.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Test Connection</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="sm" variant="ghost" onClick={() => { setSelectedDevice(device); setActiveTab("terminal"); }}>
                                      <Terminal className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Open Terminal</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeDevice(device.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Remove</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Terminal ──────────────────────────────────── */}
        <TabsContent value="terminal">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Device selector */}
            <Card className="border shadow-sm lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Select Device</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-1">
                    {devices.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3 text-center">No devices. Add one in the Devices tab.</p>
                    ) : (
                      devices.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => {
                            setSelectedDevice(d);
                            setTerminalOutput([{ type: "info", content: `Connected to ${d.label} (${d.host}:${d.port}) as ${d.username}`, timestamp: new Date() }]);
                          }}
                          className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-left text-sm transition-colors ${
                            selectedDevice?.id === d.id
                              ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                              : "hover:bg-muted/50 text-foreground"
                          }`}
                        >
                          <Monitor className="h-3.5 w-3.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{d.label}</p>
                            <p className="text-xs text-muted-foreground truncate">{d.host}:{d.port}</p>
                          </div>
                          {d.status === "online" && <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
                          {d.status === "offline" && <span className="ml-auto h-2 w-2 rounded-full bg-red-500 shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Terminal */}
            <Card className="border shadow-sm lg:col-span-3">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    Terminal {selectedDevice ? `— ${selectedDevice.label}` : ""}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    {isExecuting && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(terminalOutput.map((l) => l.content).join("\n"))} disabled={terminalOutput.length === 0}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy Output</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => setTerminalOutput([])}>
                            <Square className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Clear Output</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Output area */}
                <div className="bg-slate-950 text-green-400 rounded-b-xl p-4 font-mono text-xs leading-relaxed">
                  <ScrollArea className="max-h-[380px]">
                    {terminalOutput.length === 0 ? (
                      <p className="text-slate-500">
                        {selectedDevice
                          ? "Ready. Type a command and press Enter."
                          : "Select a device from the left panel to start a terminal session."}
                      </p>
                    ) : (
                      terminalOutput.map((line, i) => (
                        <div key={i} className={`whitespace-pre-wrap break-all ${
                          line.type === "input" ? "text-cyan-400" :
                          line.type === "error" ? "text-red-400" :
                          line.type === "info" ? "text-slate-400" :
                          "text-green-400"
                        }`}>
                          {line.content}
                        </div>
                      ))
                    )}
                    <div ref={terminalEndRef} />
                  </ScrollArea>
                </div>

                {/* Command input */}
                <div className="border-t bg-muted/30 p-3 rounded-b-xl">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 shrink-0">
                      {selectedDevice && <span className="text-xs text-muted-foreground font-mono">{selectedDevice.username}@{selectedDevice.host}</span>}
                      <span className="text-xs text-muted-foreground">$</span>
                    </div>
                    <Textarea
                      value={terminalInput}
                      onChange={(e) => setTerminalInput(e.target.value)}
                      onKeyDown={handleTerminalKeyDown}
                      placeholder={selectedDevice ? "Enter command (Shift+Enter for multiline)... Use ↑↓ for history" : "Select a device first"}
                      disabled={!selectedDevice || isExecuting}
                      rows={1}
                      className="font-mono text-xs bg-background resize-none min-h-[32px] max-h-[120px]"
                    />
                    <Button
                      size="sm"
                      onClick={sendTerminalCommand}
                      disabled={!selectedDevice || !terminalInput.trim() || isExecuting}
                    >
                      {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Tab 3: Quick Commands ────────────────────────────── */}
        <TabsContent value="quick">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Device selector + commands */}
            <Card className="border shadow-sm lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Quick Commands</CardTitle>
                <CardDescription className="text-xs">Select device, then click a command</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Device</Label>
                  <Select value={quickDevice?.id || ""} onValueChange={(v) => setQuickDevice(devices.find((d) => d.id === v) || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select device..." />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.label} ({d.host})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  {QUICK_COMMANDS.map((qc) => (
                    <TooltipProvider key={qc.label}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left h-auto py-2 px-3"
                            onClick={() => runQuickCommand(qc.command)}
                            disabled={!quickDevice || executeCommand.isPending}
                          >
                            <qc.icon className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                            <span className="text-xs font-medium">{qc.label}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs max-w-[200px]">{qc.description}</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Result area */}
            <Card className="border shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Command Output</CardTitle>
                  {quickResult && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(quickResult)}>
                            <Copy className="h-3.5 w-3.5 mr-1.5" />Copy
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy Output</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="bg-slate-950 text-green-400 rounded-b-xl p-4 font-mono text-xs leading-relaxed">
                  <ScrollArea className="max-h-[450px]">
                    {quickResult ? (
                      <pre className="whitespace-pre-wrap break-all">{quickResult}</pre>
                    ) : (
                      <p className="text-slate-500">Select a device and click a command to see output here.</p>
                    )}
                  </ScrollArea>
                </div>
              </CardContent>
              {/* Custom command */}
              <div className="border-t p-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Run custom command..."
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runCustomCommand()}
                    className="font-mono text-xs"
                    disabled={!quickDevice || executeCommand.isPending}
                  />
                  <Button size="sm" onClick={runCustomCommand} disabled={!quickDevice || !customCommand.trim() || executeCommand.isPending}>
                    {executeCommand.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Tab 4: Batch Execute ─────────────────────────────── */}
        <TabsContent value="batch">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Config */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Batch Configuration</CardTitle>
                <CardDescription className="text-xs">Enter commands (one per line) and select target devices</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Commands (one per line)</Label>
                  <Textarea
                    placeholder={`uname -a\nfree -m\ndf -h\nip addr show`}
                    value={batchCommands}
                    onChange={(e) => setBatchCommands(e.target.value)}
                    rows={6}
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-sm font-medium">Target Devices</Label>
                    {devices.length > 0 && (
                      <Button variant="ghost" size="sm" className="text-xs h-6"
                        onClick={() => setBatchDevices(batchDevices.length === devices.length ? [] : devices.map((d) => d.id))}
                      >
                        {batchDevices.length === devices.length ? "Deselect All" : "Select All"}
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="max-h-[200px] border rounded-lg p-2">
                    {devices.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No devices. Add some in the Devices tab.</p>
                    ) : (
                      <div className="space-y-1">
                        {devices.map((d) => (
                          <label key={d.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                            <Checkbox checked={batchDevices.includes(d.id)} onCheckedChange={() => toggleBatchDevice(d.id)} />
                            <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{d.label}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{d.host}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
                <Button
                  className="w-full bg-destructive hover:bg-destructive/90 text-white"
                  onClick={runBatch}
                  disabled={!batchCommands.trim() || batchDevices.length === 0 || isBatchRunning}
                >
                  {isBatchRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                  {isBatchRunning ? "Executing..." : `Execute on ${batchDevices.length} Device(s)`}
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Batch Results</CardTitle>
                  {batchResults.length > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(batchResults.map((r) => `=== ${r.device.label} ===\n${r.results.map((c) => `$ ${c.command}\n${c.stdout}`).join("\n\n")}`).join("\n\n"))}>
                            <Copy className="h-3.5 w-3.5 mr-1.5" />Copy All
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy All Results</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[500px]">
                  {batchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Layers className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">No batch results yet. Configure and run a batch.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {batchResults.map((result, i) => (
                        <div key={i} className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Monitor className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{result.device.label}</span>
                            <Badge variant={result.error ? "destructive" : "outline"} className="text-xs ml-auto">
                              {result.error ? "Failed" : "Success"}
                            </Badge>
                          </div>
                          {result.error ? (
                            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded font-mono">{result.error}</p>
                          ) : (
                            <div className="space-y-2">
                              {result.results.map((cmd, j) => (
                                <div key={j} className="bg-slate-950 text-green-400 rounded-lg p-3 font-mono text-xs">
                                  <p className="text-cyan-400 mb-1">$ {cmd.command}</p>
                                  <pre className="whitespace-pre-wrap break-all">{cmd.stdout || "(no output)"}{cmd.stderr ? `\nSTDERR: ${cmd.stderr}` : ""}</pre>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
