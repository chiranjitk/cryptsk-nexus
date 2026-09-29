"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Shield, ShieldCheck, ShieldAlert, Plus, Trash2, RefreshCw, Copy,
  Play, Square, Download, Key, Eye, Globe, Lock, AlertTriangle,
  CheckCircle, XCircle, Terminal, FileText, Settings, Loader2,
  QrCode, Wifi, Server, ArrowUpDown, ChevronDown, ChevronUp,
  Info, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { useModuleStore } from "@/store/module-store";

// ─── Types ───────────────────────────────────────────────────────
interface VpnStatus {
  wireguard: { installed: boolean; running: boolean; version: string };
  ipsec: { installed: boolean; running: boolean; version: string; swanctlMode: boolean };
}

interface WgPeer {
  publicKey: string;
  allowedIps: string;
  endpoint?: string;
  latestHandshake?: string;
  transferRx?: string;
  transferTx?: string;
  persistentKeepalive?: number;
}

interface IpsecConnection {
  name: string;
  type: string;
  localIp: string;
  remoteIp: string;
  localSubnet?: string;
  remoteSubnet?: string;
  state: string;
  esp?: string;
  ah?: string;
}

// ─── Parsers ──────────────────────────────────────────────────────

function parseWgPeers(output: string): WgPeer[] {
  const peers: WgPeer[] = [];
  const interfaceBlocks = output.split(/\n(?=interface:)/);

  for (const block of interfaceBlocks) {
    const peerSections = block.split(/peer: /);
    for (let i = 1; i < peerSections.length; i++) {
      const lines = peerSections[i].split('\n');
      const peer: WgPeer = { publicKey: lines[0]?.trim() || '', allowedIps: '' };

      for (const line of lines.slice(1)) {
        if (line.trim() === '' || line.match(/^(interface|peer|latest|transfer|endpoint|allowed|persistent)/i)) continue;
        if (line.startsWith('  allowed ips:')) peer.allowedIps = line.replace('  allowed ips:', '').trim();
        else if (line.startsWith('  latest handshake:')) peer.latestHandshake = line.replace('  latest handshake:', '').trim();
        else if (line.startsWith('  transfer:')) {
          const match = line.match(/received[\s\S]*?(\d[\d,]*)[\s\S]*?sent[\s\S]*?(\d[\d,]*)/);
          if (match) {
            peer.transferRx = match[1].replace(/,/g, '');
            peer.transferTx = match[2].replace(/,/g, '');
          }
        }
        else if (line.startsWith('  endpoint:')) peer.endpoint = line.replace('  endpoint:', '').trim();
        else if (line.startsWith('  persistent keepalive:')) peer.persistentKeepalive = parseInt(line.replace('  persistent keepalive:', '').trim());
      }
      if (peer.publicKey) peers.push(peer);
    }
  }
  return peers;
}

function parseWgConfig(config: string): {
  address?: string; listenPort?: string; privateKey?: string;
  publicKey?: string; dns?: string; mtu?: string; peers: WgPeer[];
} {
  const result: ReturnType<typeof parseWgConfig> = { peers: [] };
  let currentPeer: WgPeer | null = null;

  for (const line of config.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '[Interface]') { currentPeer = null; continue; }
    if (trimmed === '[Peer]') { currentPeer = { publicKey: '', allowedIps: '' }; result.peers.push(currentPeer); continue; }
    if (trimmed.startsWith('#')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim();
    if (!key || !value) continue;

    const k = key.trim().toLowerCase();
    if (currentPeer) {
      if (k === 'publickey') currentPeer.publicKey = value;
      else if (k === 'allowedips') currentPeer.allowedIps = value;
      else if (k === 'endpoint') currentPeer.endpoint = value;
      else if (k === 'persistentkeepalive') currentPeer.persistentKeepalive = parseInt(value);
    } else {
      if (k === 'address') result.address = value;
      else if (k === 'listenport') result.listenPort = value;
      else if (k === 'privatekey') result.privateKey = value;
      else if (k === 'publickey') result.publicKey = value;
      else if (k === 'dns') result.dns = value;
      else if (k === 'mtu') result.mtu = value;
    }
  }
  return result;
}

function parseIpsecStatus(output: string): IpsecConnection[] {
  const conns: IpsecConnection[] = [];
  const connBlocks = output.split(/\n(?=\d+\.\s)/);

  for (const block of connBlocks) {
    const lines = block.split('\n');
    const first = lines[0] || '';
    const connMatch = first.match(/\d+\.\s+"?([^"]+)"?\s+(\S+)/);
    if (!connMatch) continue;

    const conn: IpsecConnection = { name: connMatch[1], type: connMatch[2], localIp: '', remoteIp: '', state: 'unknown' };

    for (const line of lines) {
      const l = line.trim();
      if (l.startsWith('local:')) {
        const ipMatch = l.match(/\[([^\]]+)\]/);
        if (ipMatch) conn.localIp = ipMatch[1];
      } else if (l.startsWith('remote:')) {
        const ipMatch = l.match(/\[([^\]]+)\]/);
        if (ipMatch) conn.remoteIp = ipMatch[1];
      } else if (l.includes('ESTABLISHED')) {
        conn.state = 'up';
      } else if (l.includes('CONNECTING')) {
        conn.state = 'connecting';
      } else if (l.includes('ROUTED')) {
        conn.state = 'routed';
      }
    }
    conns.push(conn);
  }
  return conns;
}

function formatBytes(bytes: string | number | undefined): string {
  if (!bytes) return '0 B';
  const b = typeof bytes === 'string' ? parseInt(bytes.replace(/,/g, '')) : bytes;
  if (isNaN(b)) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
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

// ─── Installation Instructions ────────────────────────────────────
function InstallInstructions({ tool }: { tool: "wireguard" | "ipsec" }) {
  if (tool === "wireguard") {
    return (
      <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">WireGuard Not Installed</AlertTitle>
        <AlertDescription className="text-xs font-mono mt-2 text-amber-700 dark:text-amber-400">
          <pre className="whitespace-pre-wrap">{`# Debian/Ubuntu:
sudo apt update
sudo apt install wireguard wireguard-tools

# RHEL/CentOS:
sudo yum install epel-release
sudo yum install wireguard-tools`}</pre>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-300">strongSwan Not Installed</AlertTitle>
      <AlertDescription className="text-xs font-mono mt-2 text-amber-700 dark:text-amber-400">
        <pre className="whitespace-pre-wrap">{`# Debian/Ubuntu:
sudo apt update
sudo apt install strongswan strongswan-pki libcharon-extra-plugins

# RHEL/CentOS:
sudo yum install strongswan`}</pre>
      </AlertDescription>
    </Alert>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function VpnServerPage() {
  const queryClient = useQueryClient();
  const { isModuleEnabled } = useModuleStore();
  const [activeTab, setActiveTab] = useState("overview");
  const [vpnType, setVpnType] = useState<"wireguard" | "ipsec">("wireguard");

  // WireGuard dialog state
  const [addPeerOpen, setAddPeerOpen] = useState(false);
  const [newPeer, setNewPeer] = useState({ publicKey: "", allowedIps: "", endpoint: "", keepalive: "" });
  const [deletePeerKey, setDeletePeerKey] = useState<string | null>(null);

  // IPsec dialog state
  const [addConnOpen, setAddConnOpen] = useState(false);
  const [newConn, setNewConn] = useState({
    name: "", type: "tunnel", localIp: "", localSubnet: "", remoteIp: "", remoteSubnet: "",
    psk: "", ike: "aes256-sha256-modp2048", esp: "aes256-sha256", pfs: "dh21",
  });
  const [deleteConnName, setDeleteConnName] = useState<string | null>(null);

  // Generated keys
  const [generatedKeys, setGeneratedKeys] = useState<{ privateKey: string; publicKey: string } | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  // VPN Logs state
  const [logFilter, setLogFilter] = useState("");
  const [showFullStatus, setShowFullStatus] = useState(false);

  // ─── Queries ───────────────────────────────────────────────
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<VpnStatus>({
    queryKey: ["vpn-status"],
    queryFn: () => apiFetch<VpnStatus>("/api/vpn-server?action=status"),
    refetchInterval: 15000,
  });

  const { data: wgPeersRaw, isLoading: wgPeersLoading, refetch: refetchWgPeers } = useQuery<{ success: boolean; output: string; exitCode: number }>({
    queryKey: ["wg-peers"],
    queryFn: () => apiFetch("/api/vpn-server?action=wireguard-peers"),
    refetchInterval: 15000,
    enabled: vpnType === "wireguard",
  });

  const { data: wgConfigRaw, refetch: refetchWgConfig } = useQuery<{ success: boolean; config: string; exists: boolean }>({
    queryKey: ["wg-config"],
    queryFn: () => apiFetch("/api/vpn-server?action=wireguard-config"),
    enabled: activeTab === "wireguard",
  });

  const { data: ipsecTunnelsRaw, isLoading: ipsecLoading, refetch: refetchIpsec } = useQuery<{ success: boolean; output: string; exitCode: number }>({
    queryKey: ["ipsec-tunnels"],
    queryFn: () => apiFetch("/api/vpn-server?action=ipsec-tunnels"),
    refetchInterval: 15000,
    enabled: vpnType === "ipsec",
  });

  const { data: vpnLogsRaw, refetch: refetchLogs } = useQuery<{ success: boolean; logs: string; totalLines: number }>({
    queryKey: ["vpn-logs", logFilter],
    queryFn: () => apiFetch(`/api/vpn-server?action=vpn-logs&connection=${encodeURIComponent(logFilter)}&limit=300`),
    enabled: activeTab === "logs",
    refetchInterval: 10000,
  });

  // ─── Parsed Data ───────────────────────────────────────────
  const wgConfig = wgConfigRaw?.exists ? parseWgConfig(wgConfigRaw.config || "") : { address: '', listenPort: '', privateKey: '', publicKey: '', dns: '', mtu: '', peers: [] };
  const wgPeers = wgPeersRaw?.output ? parseWgPeers(wgPeersRaw.output) : wgConfig.peers || [];
  const ipsecConnections = ipsecTunnelsRaw?.output ? parseIpsecStatus(ipsecTunnelsRaw.output) : [];

  const wgInstalled = status?.wireguard?.installed ?? false;
  const wgRunning = status?.wireguard?.running ?? false;
  const ipsecInstalled = status?.ipsec?.installed ?? false;
  const ipsecRunning = status?.ipsec?.running ?? false;

  // ─── Mutations ─────────────────────────────────────────────
  const generateKeysMutation = useMutation({
    mutationFn: () => apiFetch("/api/vpn-server", { method: "POST", body: JSON.stringify({ action: "wg-generate-keys" }) }),
    onSuccess: (data: any) => {
      if (data.success) {
        setGeneratedKeys({ privateKey: data.privateKey, publicKey: data.publicKey });
        toast.success("WireGuard keypair generated");
      } else {
        toast.error(data.error || "Failed to generate keys");
      }
    },
    onError: (err) => toast.error(`Key generation failed: ${err.message}`),
  });

  const addPeerMutation = useMutation({
    mutationFn: (peer: { publicKey: string; allowedIps: string; endpoint: string; keepalive: string }) =>
      apiFetch("/api/vpn-server", { method: "POST", body: JSON.stringify({ action: "wg-add-peer", ...peer }) }),
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success("Peer added to config");
        setAddPeerOpen(false);
        setNewPeer({ publicKey: "", allowedIps: "", endpoint: "", keepalive: "" });
        queryClient.invalidateQueries({ queryKey: ["wg-config"] });
        queryClient.invalidateQueries({ queryKey: ["wg-peers"] });
      } else {
        toast.error(data.error || "Failed to add peer");
      }
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const removePeerMutation = useMutation({
    mutationFn: (publicKey: string) =>
      apiFetch("/api/vpn-server", { method: "POST", body: JSON.stringify({ action: "wg-remove-peer", publicKey }) }),
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success("Peer removed");
        setDeletePeerKey(null);
        queryClient.invalidateQueries({ queryKey: ["wg-config"] });
        queryClient.invalidateQueries({ queryKey: ["wg-peers"] });
      } else {
        toast.error(data.error || "Failed to remove peer");
      }
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const saveConfigMutation = useMutation({
    mutationFn: (config: string) =>
      apiFetch("/api/vpn-server", { method: "POST", body: JSON.stringify({ action: "wg-save-config", config }) }),
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success("Config saved and applied");
        queryClient.invalidateQueries({ queryKey: ["wg-config"] });
        queryClient.invalidateQueries({ queryKey: ["wg-peers"] });
        queryClient.invalidateQueries({ queryKey: ["vpn-status"] });
      } else {
        toast.error(data.error || "Failed to save");
      }
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const addIpsecConnMutation = useMutation({
    mutationFn: (conn: typeof newConn) =>
      apiFetch("/api/vpn-server", { method: "POST", body: JSON.stringify({ action: "ipsec-add-conn", ...conn }) }),
    onSuccess: (data: any, variables: typeof newConn) => {
      if (data.success) {
        toast.success(`IPsec connection "${variables.name}" added`);
        setAddConnOpen(false);
        setNewConn({ name: "", type: "tunnel", localIp: "", localSubnet: "", remoteIp: "", remoteSubnet: "", psk: "", ike: "aes256-sha256-modp2048", esp: "aes256-sha256", pfs: "dh21" });
        queryClient.invalidateQueries({ queryKey: ["ipsec-tunnels"] });
      } else {
        toast.error(data.error || "Failed");
      }
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const ipsecActionMutation = useMutation({
    mutationFn: ({ action, name }: { action: string; name: string }) =>
      apiFetch("/api/vpn-server", { method: "POST", body: JSON.stringify({ action, name }) }),
    onSuccess: (data: any, vars) => {
      if (data.success) {
        toast.success(`IPsec ${vars.action.replace("ipsec-", "")} successful`);
        queryClient.invalidateQueries({ queryKey: ["ipsec-tunnels"] });
        queryClient.invalidateQueries({ queryKey: ["vpn-status"] });
      } else {
        toast.error(data.error || `IPsec ${vars.action} failed`);
      }
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const ipsecReloadMutation = useMutation({
    mutationFn: () => apiFetch("/api/vpn-server", { method: "POST", body: JSON.stringify({ action: "ipsec-reload" }) }),
    onSuccess: (data: any) => {
      if (data.success) toast.success("IPsec reloaded");
      else toast.error(data.error || "Reload failed");
      queryClient.invalidateQueries({ queryKey: ["ipsec-tunnels"] });
    },
    onError: (err) => toast.error(`Reload failed: ${err.message}`),
  });

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  function generateQrConfig(): string {
    if (!wgConfigRaw?.exists || !wgConfigRaw.config) return "";
    const cfg = parseWgConfig(wgConfigRaw.config);
    return `[Interface]\nAddress = ${cfg.address || "10.0.0.2/24"}\nDNS = ${cfg.dns || "1.1.1.1"}\nPrivateKey = <your-private-key>\n\n[Peer]\nPublicKey = ${generatedKeys?.publicKey || cfg.publicKey || "<server-public-key>"}\nEndpoint = <server-public-ip>:${cfg.listenPort || "51820"}\nAllowedIPs = 0.0.0.0/0\nPersistentKeepalive = 25`;
  }

  // ─── Loading ───────────────────────────────────────────────
  if (statusLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">VPN Server</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage WireGuard and IPsec (strongSwan) VPN tunnels and configurations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchStatus()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="WireGuard" value={wgInstalled ? (wgRunning ? "Running" : "Stopped") : "Not Installed"} subtitle={wgInstalled ? status?.wireguard?.version || "" : "Install required"} icon={Shield} gradient="stat-gradient-green" />
        <StatCard title="WireGuard Peers" value={wgPeers.length} subtitle="Active connections" icon={Wifi} gradient="stat-gradient-blue" />
        <StatCard title="IPsec" value={ipsecInstalled ? (ipsecRunning ? "Running" : "Stopped") : "Not Installed"} subtitle={ipsecInstalled ? status?.ipsec?.version?.substring(0, 30) || "" : "Install required"} icon={ShieldCheck} gradient="stat-gradient-red" />
        <StatCard title="IPsec Tunnels" value={ipsecConnections.length} subtitle={ipsecConnections.filter(c => c.state === 'up').length + " established"} icon={Lock} gradient="stat-gradient-amber" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="overview"><Info className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="wireguard"><Shield className="h-4 w-4 mr-1.5" />WireGuard</TabsTrigger>
          <TabsTrigger value="ipsec"><ShieldCheck className="h-4 w-4 mr-1.5" />IPsec / strongSwan</TabsTrigger>
          <TabsTrigger value="logs"><Terminal className="h-4 w-4 mr-1.5" />VPN Logs</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Overview ──────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* WireGuard Card */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${wgInstalled ? (wgRunning ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600") : "bg-slate-100 text-slate-400"}`}>
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">WireGuard</CardTitle>
                      <CardDescription className="text-xs">Modern, fast VPN protocol</CardDescription>
                    </div>
                  </div>
                  <Badge variant={wgRunning ? "default" : wgInstalled ? "secondary" : "outline"} className={wgRunning ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                    {wgInstalled ? (wgRunning ? "Running" : "Stopped") : "Not Installed"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {wgInstalled ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-mono text-xs">{status?.wireguard?.version || "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Active Peers</span>
                      <span className="font-medium">{wgPeers.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Config</span>
                      <span className="font-mono text-xs">{wgConfigRaw?.exists ? "/etc/wireguard/wg0.conf" : "Not found"}</span>
                    </div>
                    <Separator className="my-3" />
                    <Button variant="outline" size="sm" className="w-full" onClick={() => { setVpnType("wireguard"); setActiveTab("wireguard"); }}>
                      <Settings className="h-4 w-4 mr-2" />Configure WireGuard
                    </Button>
                  </div>
                ) : (
                  <InstallInstructions tool="wireguard" />
                )}
              </CardContent>
            </Card>

            {/* IPsec Card */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${ipsecInstalled ? (ipsecRunning ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600") : "bg-slate-100 text-slate-400"}`}>
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">IPsec / strongSwan</CardTitle>
                      <CardDescription className="text-xs">Enterprise-grade VPN (IKEv2/IKEv1)</CardDescription>
                    </div>
                  </div>
                  <Badge variant={ipsecRunning ? "default" : ipsecInstalled ? "secondary" : "outline"} className={ipsecRunning ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                    {ipsecInstalled ? (ipsecRunning ? "Running" : "Stopped") : "Not Installed"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {ipsecInstalled ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-mono text-xs">{status?.ipsec?.version?.substring(0, 40) || "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Active Tunnels</span>
                      <span className="font-medium">{ipsecConnections.filter(c => c.state === 'up').length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Config</span>
                      <span className="font-mono text-xs">{status?.ipsec?.swanctlMode ? "swanctl" : "ipsec.conf"}</span>
                    </div>
                    <Separator className="my-3" />
                    <Button variant="outline" size="sm" className="w-full" onClick={() => { setVpnType("ipsec"); setActiveTab("ipsec"); }}>
                      <Settings className="h-4 w-4 mr-2" />Configure IPsec
                    </Button>
                  </div>
                ) : (
                  <InstallInstructions tool="ipsec" />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Tab 2: WireGuard ──────────────────────────────────── */}
        <TabsContent value="wireguard">
          {!wgInstalled ? (
            <InstallInstructions tool="wireguard" />
          ) : (
            <div className="space-y-4">
              {/* Server Config */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Server Configuration</CardTitle>
                      <CardDescription className="text-xs">WireGuard server interface settings</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => generateKeysMutation.mutate()} disabled={generateKeysMutation.isPending}>
                        {generateKeysMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Key className="h-3.5 w-3.5 mr-1.5" />}
                        Generate Keypair
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => refetchWgConfig()}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Reload
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Address (CIDR)</Label>
                      <p className="text-sm font-mono mt-0.5">{wgConfig.address || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Listen Port</Label>
                      <p className="text-sm font-mono mt-0.5">{wgConfig.listenPort || "51820"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">DNS</Label>
                      <p className="text-sm font-mono mt-0.5">{wgConfig.dns || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">MTU</Label>
                      <p className="text-sm font-mono mt-0.5">{wgConfig.mtu || "default (1420)"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Public Key</Label>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="text-sm font-mono truncate">{wgConfig.publicKey || (generatedKeys?.publicKey || "—")}</p>
                        {(wgConfig.publicKey || generatedKeys?.publicKey) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyToClipboard(wgConfig.publicKey || generatedKeys?.publicKey || "")}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy Public Key</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Private Key</Label>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="text-sm font-mono truncate">
                          {showPrivateKey ? (wgConfig.privateKey || generatedKeys?.privateKey || "—") : "••••••••••••"}
                        </p>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowPrivateKey(!showPrivateKey)}>
                                <Eye className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{showPrivateKey ? "Hide" : "Show"} Private Key</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {(wgConfig.privateKey || generatedKeys?.privateKey) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyToClipboard(wgConfig.privateKey || generatedKeys?.privateKey || "")}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy Private Key</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Generated keys display */}
                  {generatedKeys && (
                    <Alert className="mt-4 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
                      <Key className="h-4 w-4 text-emerald-600" />
                      <AlertTitle className="text-emerald-800 dark:text-emerald-300 text-sm">New Keypair Generated</AlertTitle>
                      <AlertDescription className="text-xs mt-1 space-y-1">
                        <p><span className="font-medium">Public:</span> <span className="font-mono">{generatedKeys.publicKey}</span></p>
                        <p><span className="font-medium">Private:</span> <span className="font-mono">{generatedKeys.privateKey}</span></p>
                        <p className="text-amber-600 mt-1">⚠ Store the private key securely. It cannot be recovered.</p>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Peers Table */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Peers ({wgPeers.length})</CardTitle>
                      <CardDescription className="text-xs">Connected WireGuard clients</CardDescription>
                    </div>
                    <Dialog open={addPeerOpen} onOpenChange={setAddPeerOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-white">
                          <Plus className="h-3.5 w-3.5 mr-1.5" />Add Peer
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Add WireGuard Peer</DialogTitle>
                          <DialogDescription>Add a new peer to the WireGuard server</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div>
                            <Label className="text-sm font-medium mb-1 block">Public Key *</Label>
                            <Input placeholder="Peer public key" value={newPeer.publicKey} onChange={(e) => setNewPeer({ ...newPeer, publicKey: e.target.value })} className="font-mono text-xs" />
                          </div>
                          <div>
                            <Label className="text-sm font-medium mb-1 block">Allowed IPs *</Label>
                            <Input placeholder="e.g. 10.0.0.3/32" value={newPeer.allowedIps} onChange={(e) => setNewPeer({ ...newPeer, allowedIps: e.target.value })} className="font-mono text-xs" />
                          </div>
                          <div>
                            <Label className="text-sm font-medium mb-1 block">Endpoint (optional)</Label>
                            <Input placeholder="e.g. 203.0.113.5:51820" value={newPeer.endpoint} onChange={(e) => setNewPeer({ ...newPeer, endpoint: e.target.value })} className="font-mono text-xs" />
                          </div>
                          <div>
                            <Label className="text-sm font-medium mb-1 block">Keepalive (seconds, optional)</Label>
                            <Input placeholder="e.g. 25" value={newPeer.keepalive} onChange={(e) => setNewPeer({ ...newPeer, keepalive: e.target.value })} className="font-mono text-xs" />
                          </div>
                          {isModuleEnabled("ipv6") && (
                            <>
                              <div className="space-y-1.5">
                                <Label className="text-sm font-medium">Peer IPv6 Address</Label>
                                <Input placeholder="fd00::1/128" className="font-mono text-sm" />
                                <p className="text-xs text-muted-foreground">IPv6 address assigned to this peer</p>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-sm font-medium">AllowedIPs IPv6</Label>
                                <Input placeholder="::/0" className="font-mono text-sm" />
                                <p className="text-xs text-muted-foreground">IPv6 routes allowed through this peer</p>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-sm font-medium">Endpoint IPv6</Label>
                                <Input placeholder="2001:db8::1" className="font-mono text-sm" />
                                <p className="text-xs text-muted-foreground">Optional IPv6 endpoint address</p>
                              </div>
                            </>
                          )}
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setAddPeerOpen(false)}>Cancel</Button>
                          <Button className="bg-destructive hover:bg-destructive/90 text-white" onClick={() => {
                            if (!newPeer.publicKey.trim()) { toast.error("Public key is required"); return; }
                            if (!newPeer.allowedIps.trim()) { toast.error("Allowed IPs is required"); return; }
                            addPeerMutation.mutate(newPeer);
                          }} disabled={addPeerMutation.isPending}>
                            {addPeerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                            Add Peer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs font-medium uppercase">Public Key</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Allowed IPs</TableHead>
                          {isModuleEnabled("ipv6") && (
                            <TableHead className="text-xs font-medium uppercase">IPv6 Address</TableHead>
                          )}
                          <TableHead className="text-xs font-medium uppercase">Endpoint</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Handshake</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Transfer</TableHead>
                          <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {wgPeers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={isModuleEnabled("ipv6") ? 7 : 6} className="text-center py-12 text-muted-foreground">
                              <Wifi className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              No peers configured. Add a peer to get started.
                            </TableCell>
                          </TableRow>
                        ) : (
                          wgPeers.map((peer, i) => (
                            <TableRow key={i} className="odd:bg-muted/10 hover:bg-muted/30 transition-colors">
                              <TableCell className="text-xs font-mono max-w-[200px]">
                                <div className="flex items-center gap-1">
                                  <span className="truncate">{peer.publicKey.substring(0, 20)}...</span>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 shrink-0" onClick={() => copyToClipboard(peer.publicKey)}>
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Copy Full Key</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-mono">{peer.allowedIps || "—"}</TableCell>
                              {isModuleEnabled("ipv6") && (
                                <TableCell className="text-xs font-mono text-cyan-700 dark:text-cyan-400">
                                  {peer.allowedIps?.includes(":") ? peer.allowedIps.split(",").find(ip => ip.includes(":")).trim() : "—"}
                                </TableCell>
                              )}
                              <TableCell className="text-xs font-mono">{peer.endpoint || "—"}</TableCell>
                              <TableCell className="text-xs">{peer.latestHandshake || <span className="text-muted-foreground">Never</span>}</TableCell>
                              <TableCell className="text-xs">
                                <div className="flex flex-col">
                                  <span className="text-emerald-600">↓ {formatBytes(peer.transferRx)}</span>
                                  <span className="text-amber-600">↑ {formatBytes(peer.transferTx)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeletePeerKey(peer.publicKey)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Remove Peer</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* QR Code / Mobile Config */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Mobile Client Config</CardTitle>
                  <CardDescription className="text-xs">Configuration for WireGuard mobile apps</CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="bg-slate-950 text-green-400 rounded-lg p-4 font-mono text-xs leading-relaxed">
                    <ScrollArea className="max-h-[250px]">
                      <pre className="whitespace-pre-wrap">{generateQrConfig()}</pre>
                    </ScrollArea>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(generateQrConfig())}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />Copy Config
                    </Button>
                    {isModuleEnabled("ipv6") && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" />
                        AllowedIPs: 0.0.0.0/0, ::/0
                      </p>
                    )}
                    <Button size="sm" variant="outline" onClick={() => saveConfigMutation.mutate(wgConfigRaw?.config || "")} disabled={saveConfigMutation.isPending}>
                      {saveConfigMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
                      Apply / Save Config
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Delete Peer Dialog */}
              <AlertDialog open={!!deletePeerKey} onOpenChange={() => setDeletePeerKey(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove WireGuard Peer</AlertDialogTitle>
                    <AlertDialogDescription>
                      Remove this peer from the WireGuard configuration? The peer will lose access immediately.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-white" onClick={() => deletePeerKey && removePeerMutation.mutate(deletePeerKey)}>
                      Remove Peer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 3: IPsec / strongSwan ─────────────────────────── */}
        <TabsContent value="ipsec">
          {!ipsecInstalled ? (
            <InstallInstructions tool="ipsec" />
          ) : (
            <div className="space-y-4">
              {/* IPsec Connections Table */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">IPsec Connections ({ipsecConnections.length})</CardTitle>
                      <CardDescription className="text-xs">Site-to-site and remote access tunnels</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Dialog open={addConnOpen} onOpenChange={setAddConnOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-white">
                            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Connection
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Add IPsec Connection</DialogTitle>
                            <DialogDescription>Configure a new IPsec tunnel</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-sm font-medium mb-1 block">Name *</Label>
                                <Input placeholder="e.g. site-a" value={newConn.name} onChange={(e) => setNewConn({ ...newConn, name: e.target.value })} />
                              </div>
                              <div>
                                <Label className="text-sm font-medium mb-1 block">Type</Label>
                                <Select value={newConn.type} onValueChange={(v) => setNewConn({ ...newConn, type: v })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="tunnel">Tunnel</SelectItem>
                                    <SelectItem value="transport">Transport</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-sm font-medium mb-1 block">Local IP *</Label>
                                <Input placeholder="e.g. 192.168.1.1" value={newConn.localIp} onChange={(e) => setNewConn({ ...newConn, localIp: e.target.value })} className="font-mono text-xs" />
                              </div>
                              <div>
                                <Label className="text-sm font-medium mb-1 block">Remote IP *</Label>
                                <Input placeholder="e.g. 203.0.113.1" value={newConn.remoteIp} onChange={(e) => setNewConn({ ...newConn, remoteIp: e.target.value })} className="font-mono text-xs" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-sm font-medium mb-1 block">Local Subnet</Label>
                                <Input placeholder="e.g. 10.0.0.0/24" value={newConn.localSubnet} onChange={(e) => setNewConn({ ...newConn, localSubnet: e.target.value })} className="font-mono text-xs" />
                              </div>
                              <div>
                                <Label className="text-sm font-medium mb-1 block">Remote Subnet</Label>
                                <Input placeholder="e.g. 10.1.0.0/24" value={newConn.remoteSubnet} onChange={(e) => setNewConn({ ...newConn, remoteSubnet: e.target.value })} className="font-mono text-xs" />
                              </div>
                            </div>
                            {isModuleEnabled("ipv6") && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-sm font-medium mb-1 block">Local IPv6 Network</Label>
                                  <Input placeholder="2001:db8:vpn::/64" className="font-mono text-xs" />
                                  <p className="text-xs text-muted-foreground mt-0.5">IPv6 local subnet for the tunnel</p>
                                </div>
                                <div>
                                  <Label className="text-sm font-medium mb-1 block">Remote IPv6 Network</Label>
                                  <Input placeholder="2001:db8:vpn::/64" className="font-mono text-xs" />
                                  <p className="text-xs text-muted-foreground mt-0.5">IPv6 remote subnet for the tunnel</p>
                                </div>
                              </div>
                            )}
                            <div>
                              <Label className="text-sm font-medium mb-1 block">Pre-Shared Key (PSK)</Label>
                              <Input type="password" placeholder="Shared secret for authentication" value={newConn.psk} onChange={(e) => setNewConn({ ...newConn, psk: e.target.value })} />
                            </div>
                            <Separator />
                            <div>
                              <Label className="text-sm font-medium mb-1 block">IKE Proposal</Label>
                              <Input placeholder="e.g. aes256-sha256-modp2048" value={newConn.ike} onChange={(e) => setNewConn({ ...newConn, ike: e.target.value })} className="font-mono text-xs" />
                            </div>
                            <div>
                              <Label className="text-sm font-medium mb-1 block">ESP Proposal</Label>
                              <Input placeholder="e.g. aes256-sha256" value={newConn.esp} onChange={(e) => setNewConn({ ...newConn, esp: e.target.value })} className="font-mono text-xs" />
                            </div>
                            <div>
                              <Label className="text-sm font-medium mb-1 block">PFS Group</Label>
                              <Input placeholder="e.g. dh21" value={newConn.pfs} onChange={(e) => setNewConn({ ...newConn, pfs: e.target.value })} className="font-mono text-xs" />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setAddConnOpen(false)}>Cancel</Button>
                            <Button className="bg-destructive hover:bg-destructive/90 text-white" onClick={() => {
                              if (!newConn.name.trim()) { toast.error("Connection name is required"); return; }
                              if (!newConn.localIp.trim()) { toast.error("Local IP is required"); return; }
                              if (!newConn.remoteIp.trim()) { toast.error("Remote IP is required"); return; }
                              if (!newConn.psk.trim()) { toast.error("Pre-shared key (PSK) is required"); return; }
                              addIpsecConnMutation.mutate(newConn);
                            }} disabled={addIpsecConnMutation.isPending}>
                              {addIpsecConnMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                              Add Connection
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => ipsecReloadMutation.mutate()} disabled={ipsecReloadMutation.isPending}>
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Reload
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reload IPsec Configuration</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs font-medium uppercase">Name</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Local</TableHead>
                          <TableHead className="text-xs font-medium uppercase">Remote</TableHead>
                          {isModuleEnabled("ipv6") && (
                            <TableHead className="text-xs font-medium uppercase">IPv6 Local</TableHead>
                          )}
                          <TableHead className="text-xs font-medium uppercase">State</TableHead>
                          <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ipsecConnections.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={isModuleEnabled("ipv6") ? 7 : 6} className="text-center py-12 text-muted-foreground">
                              <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              No IPsec connections found. Add a connection or check strongSwan status.
                            </TableCell>
                          </TableRow>
                        ) : (
                          ipsecConnections.map((conn, i) => (
                            <TableRow key={i} className="odd:bg-muted/10 hover:bg-muted/30 transition-colors">
                              <TableCell className="text-sm font-medium">{conn.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs font-mono">{conn.type}</Badge>
                              </TableCell>
                              <TableCell className="text-xs font-mono">{conn.localIp}</TableCell>
                              <TableCell className="text-xs font-mono">{conn.remoteIp}</TableCell>
                              {isModuleEnabled("ipv6") && (
                                <TableCell className="text-xs font-mono text-cyan-700 dark:text-cyan-400">
                                  {conn.localIp?.includes(":") ? conn.localIp : "—"}
                                </TableCell>
                              )}
                              <TableCell>
                                <Badge variant={conn.state === "up" ? "default" : conn.state === "connecting" ? "secondary" : "outline"} className={conn.state === "up" ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                                  <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${conn.state === "up" ? "bg-white" : conn.state === "connecting" ? "bg-current" : "bg-muted-foreground"}`} />
                                  {conn.state}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" onClick={() => ipsecActionMutation.mutate({ action: "ipsec-up", name: conn.name })} disabled={ipsecActionMutation.isPending}>
                                          <Play className="h-3.5 w-3.5 text-emerald-600" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Bring Up</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" onClick={() => ipsecActionMutation.mutate({ action: "ipsec-down", name: conn.name })} disabled={ipsecActionMutation.isPending}>
                                          <Square className="h-3.5 w-3.5 text-red-600" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Bring Down</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteConnName(conn.name)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Delete</TooltipContent>
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

              {/* IPsec Status Output */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">IPsec Status Output</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => refetchIpsec()} disabled={ipsecLoading}>
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${ipsecLoading ? 'animate-spin' : ''}`} />Refresh
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowFullStatus(!showFullStatus)}>
                        {showFullStatus ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                        {showFullStatus ? "Collapse" : "Expand"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {showFullStatus && (
                    <div className="bg-slate-950 text-green-400 p-4 font-mono text-xs leading-relaxed rounded-b-xl">
                      <ScrollArea className="max-h-[400px]">
                        <pre className="whitespace-pre-wrap break-all">{ipsecTunnelsRaw?.output || "No output available"}</pre>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Delete Connection Dialog */}
              <AlertDialog open={!!deleteConnName} onOpenChange={() => setDeleteConnName(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete IPsec Connection</AlertDialogTitle>
                    <AlertDialogDescription>
                      Delete connection &quot;{deleteConnName}&quot;? This will remove it from the configuration. The tunnel will be brought down if active.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-white">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 4: VPN Logs ────────────────────────────────────── */}
        <TabsContent value="logs">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">VPN Connection Logs</CardTitle>
                  <CardDescription className="text-xs">Real-time VPN event log from system journal</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Filter by connection name..."
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    className="w-48 h-8 text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={() => refetchLogs()}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
                  </Button>
                  {vpnLogsRaw && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(vpnLogsRaw.logs)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy Logs</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-slate-950 text-green-400 p-4 font-mono text-xs leading-relaxed rounded-b-xl">
                <ScrollArea className="max-h-[500px]">
                  {vpnLogsRaw?.logs ? (
                    vpnLogsRaw.logs.split('\n').map((line, i) => {
                      let colorClass = "text-slate-400";
                      if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) colorClass = "text-red-400";
                      else if (line.toLowerCase().includes('warning') || line.toLowerCase().includes('warn')) colorClass = "text-amber-400";
                      else if (line.toLowerCase().includes('established') || line.toLowerCase().includes('up') || line.toLowerCase().includes('success')) colorClass = "text-emerald-400";
                      else if (line.toLowerCase().includes('ike') || line.toLowerCase().includes('esp')) colorClass = "text-cyan-400";

                      return (
                        <div key={i} className={`whitespace-pre-wrap break-all ${colorClass}`}>
                          {line}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-slate-500">No VPN logs found. Ensure strongSwan or WireGuard is running and generating logs.</p>
                  )}
                </ScrollArea>
              </div>
              {vpnLogsRaw && (
                <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Showing {vpnLogsRaw.logs.split('\n').filter(Boolean).length} log entries</span>
                  <span>Total: {vpnLogsRaw.totalLines} VPN entries</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
