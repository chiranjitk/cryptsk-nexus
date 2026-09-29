"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Terminal, Search, Play, Square, RefreshCw, Download, Trash2,
  Loader2, Globe, Network, Wifi, ArrowRight, Clock, FileText,
  RotateCcw, Filter, Eye, XCircle, CheckCircle, AlertTriangle,
  ChevronDown, ChevronUp, Activity, Radio, Database, History,
  Server, Shield, Monitor, Zap, Copy, Save, Settings,
  Circle, RadioTower, ArrowDownToLine, ArrowUpFromLine, Hash,
  BookOpen, Cloud, MapPin, Router, Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────
interface TcpdumpCapture {
  id: string;
  interface: string;
  filter: string;
  status: "RUNNING" | "STOPPED" | "COMPLETED" | "FAILED";
  startTime: string;
  stopTime?: string;
  fileSize: number;
  packetCount: number;
  snapshotLength: number;
  fileName: string;
}

interface TcpdumpStatus {
  active: boolean;
  interface: string;
  filter: string;
  startTime: string;
  packetCount: number;
  captureId: string;
}

interface PingResult {
  host: string;
  count: number;
  interface: string;
  output: string;
  sent: number;
  received: number;
  loss: number;
  minRtt: number;
  avgRtt: number;
  maxRtt: number;
  method?: string;
  timestamp: string;
  id?: string;
}

interface TracerouteResult {
  host: string;
  maxHops: number;
  output: string;
  hopCount: number;
  timestamp: string;
  id?: string;
}

interface DnsLookupResult {
  domain: string;
  recordType: string;
  dnsServer: string;
  output: string;
  answers: DnsAnswer[];
  timestamp: string;
  id?: string;
  tool?: "nslookup" | "dig";
}

interface DnsAnswer {
  name: string;
  type: string;
  ttl: number;
  value: string;
}

interface ArpEntry {
  ip: string;
  mac: string;
  device: string;
  interface: string;
  state: "REACHABLE" | "STALE" | "FAILED" | "DELAY" | "PERMANENT" | "NOARP";
  age: string;
}

interface HistoryEntry {
  id: string;
  tool: "tcpdump" | "ping" | "traceroute" | "nslookup" | "dig" | "arp";
  target: string;
  output: string;
  timestamp: string;
  status: "success" | "failed" | "running";
  metadata?: Record<string, unknown>;
}

interface TcpdumpResponse {
  captures: TcpdumpCapture[];
  activeCapture: TcpdumpStatus | null;
}

interface ArpResponse {
  entries: ArpEntry[];
  total: number;
}

interface HistoryResponse {
  entries: HistoryEntry[];
  total: number;
}

// ─── Constants ────────────────────────────────────────────────────
const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "ANY"];

const ARP_STATE_COLORS: Record<string, string> = {
  REACHABLE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  STALE: "bg-amber-100 text-amber-700 border-amber-200",
  FAILED: "bg-red-100 text-red-700 border-red-200",
  DELAY: "bg-yellow-100 text-yellow-700 border-yellow-200",
  PERMANENT: "bg-blue-100 text-blue-700 border-blue-200",
  NOARP: "bg-slate-100 text-slate-600 border-slate-200",
};

const TOOL_ICONS: Record<string, React.ElementType> = {
  tcpdump: Radio,
  ping: Activity,
  traceroute: ArrowRight,
  nslookup: Globe,
  dig: Search,
  arp: Network,
};

const TOOL_COLORS: Record<string, string> = {
  tcpdump: "bg-red-100 text-red-700",
  ping: "bg-emerald-100 text-emerald-700",
  traceroute: "bg-blue-100 text-blue-700",
  nslookup: "bg-purple-100 text-purple-700",
  dig: "bg-amber-100 text-amber-700",
  arp: "bg-cyan-100 text-cyan-700",
};

const QUICK_DIAGS = [
  { label: "Google DNS", tool: "ping", target: "8.8.8.8", icon: Globe, description: "Test internet connectivity via Google DNS", color: "from-red-500 to-orange-500" },
  { label: "Cloudflare DNS", tool: "ping", target: "1.1.1.1", icon: Cloud, description: "Test via Cloudflare DNS", color: "from-amber-500 to-yellow-500" },
  { label: "Local Gateway", tool: "ping", target: "10.0.0.1", icon: Router, description: "Ping default gateway", color: "from-emerald-500 to-teal-500" },
  { label: "ISP DNS Resolve", tool: "nslookup", target: "google.com", icon: Search, description: "DNS resolution test", color: "from-purple-500 to-pink-500" },
  { label: "Reverse DNS GW", tool: "nslookup", target: "8.8.8.8", icon: Globe, description: "Reverse lookup gateway", color: "from-blue-500 to-indigo-500" },
  { label: "Traceroute ISP", tool: "traceroute", target: "8.8.8.8", icon: MapPin, description: "Trace path to internet", color: "from-slate-500 to-zinc-500" },
  { label: "Flush ARP Cache", tool: "arp-flush", target: "all", icon: RefreshCw, description: "Clear ARP table", color: "from-cyan-500 to-sky-500" },
  { label: "DNS Record Check", tool: "dig", target: "google.com", icon: FileText, description: "DIG query for google.com", color: "from-teal-500 to-emerald-500" },
];

interface QuickDiagResult {
  status: "idle" | "running" | "success" | "failed";
  latency?: string;
  output?: string;
  timestamp?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── TerminalBox ──────────────────────────────────────────────────
function TerminalBox({ output, loading, title }: { output: string; loading?: boolean; title?: string }) {
  return (
    <div className="bg-zinc-900 text-zinc-100 font-mono p-4 rounded-lg overflow-auto max-h-96 border border-zinc-800">
      {title && (
        <div className="flex items-center gap-2 mb-3 text-zinc-400 text-xs border-b border-zinc-700 pb-2">
          <Terminal className="h-3.5 w-3.5" />
          <span>{title}</span>
          <span className="ml-auto text-zinc-500">{new Date().toLocaleTimeString()}</span>
        </div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Running...</span>
        </div>
      ) : output ? (
        <pre className="text-xs leading-relaxed whitespace-pre-wrap break-all">{output}</pre>
      ) : (
        <span className="text-zinc-500 text-xs">No output yet. Run a command to see results.</span>
      )}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────
function StatCard({
  title, value, subtitle, icon: Icon, gradient, delay,
}: {
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
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function DiagnosticToolsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("tcpdump");

  // ─── TCPDump State ───────────────────────────────────────────
  const [tcpdumpInterface, setTcpdumpInterface] = useState("eth0");
  const [tcpdumpFilter, setTcpdumpFilter] = useState("");
  const [tcpdumpCount, setTcpdumpCount] = useState(100);
  const [tcpdumpSnaplen, setTcpdumpSnaplen] = useState(262144);
  const [tcpdumpRunning, setTcpdumpRunning] = useState(false);
  const [tcpdeleteTarget, setTcpdeleteTarget] = useState<TcpdumpCapture | null>(null);

  // ─── Ping State ──────────────────────────────────────────────
  const [pingHost, setPingHost] = useState("");
  const [pingCount, setPingCount] = useState("4");
  const [pingInterface, setPingInterface] = useState("any");
  const [pingOutput, setPingOutput] = useState("");
  const [pingRunning, setPingRunning] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);

  // ─── Traceroute State ────────────────────────────────────────
  const [traceHost, setTraceHost] = useState("");
  const [traceMaxHops, setTraceMaxHops] = useState("30");
  const [traceOutput, setTraceOutput] = useState("");
  const [traceRunning, setTraceRunning] = useState(false);

  // ─── DNS Lookup State ────────────────────────────────────────
  const [dnsSubTab, setDnsSubTab] = useState("nslookup");
  const [nslookupDomain, setNslookupDomain] = useState("");
  const [nslookupServer, setNslookupServer] = useState("");
  const [nslookupOutput, setNslookupOutput] = useState("");
  const [nslookupRunning, setNslookupRunning] = useState(false);
  const [digDomain, setDigDomain] = useState("");
  const [digType, setDigType] = useState("A");
  const [digServer, setDigServer] = useState("");
  const [digOutput, setDigOutput] = useState("");
  const [digRunning, setDigRunning] = useState(false);

  // ─── ARP State ───────────────────────────────────────────────
  const [arpSearch, setArpSearch] = useState("");
  const [flushInterface, setFlushInterface] = useState("all");

  // ─── History State ───────────────────────────────────────────
  const [historyToolFilter, setHistoryToolFilter] = useState("All");
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  // ─── TCPDump capture counter ─────────────────────────────────
  const [capturePacketCount, setCapturePacketCount] = useState(0);
  const [captureTick, setCaptureTick] = useState(0);
  const isTcpdumpActiveRef = useRef(false);

  // ─── Quick Diagnostics State ────────────────────────────────
  const [quickDiagResults, setQuickDiagResults] = useState<Record<string, QuickDiagResult>>({});

  // ─── Real Interfaces Query ────────────────────────────────────
  const { data: interfacesData } = useQuery<{ success: boolean; data: Array<{ name: string; type: string; carrierStatus: boolean; ipv4Addresses: string[] }> }>({
    queryKey: ["diag-interfaces"],
    queryFn: () =>
      apiFetch("/api/interfaces").catch(() => ({ success: false, data: [] })),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const realInterfaces = (interfacesData?.data || []).filter(
    (i) => i.name !== "lo" && !i.name.startsWith("docker") && !i.name.startsWith("veth")
  );
  const interfaceNames = realInterfaces.map((i) => i.name);

  // Auto-select first interface on load
  useEffect(() => {
    if (interfaceNames.length > 0 && tcpdumpInterface === "eth0") {
      setTcpdumpInterface(interfaceNames[0]);
    }
    if (interfaceNames.length > 0 && pingInterface === "any") {
      setPingInterface(interfaceNames[0]);
    }
    if (interfaceNames.length > 0 && flushInterface === "all") {
      // Keep "all" as default for ARP flush
    }
  }, [interfaceNames]);

  // ─── Queries ─────────────────────────────────────────────────
  const { data: tcpdumpData, isLoading: tcpdumpLoading, refetch: refetchTcpdump } = useQuery<TcpdumpResponse>({
    queryKey: ["diag-tcpdump", captureTick],
    queryFn: () =>
      apiFetch<TcpdumpResponse>("/api/diag?tool=tcpdump").catch(() => ({
        captures: [], activeCapture: null,
      })),
    refetchInterval: isTcpdumpActiveRef.current ? 3000 : 15000,
    staleTime: 2000,
  });

  const { data: arpData, isLoading: arpLoading, refetch: refetchArp } = useQuery<ArpResponse>({
    queryKey: ["diag-arp", arpSearch],
    queryFn: () =>
      apiFetch<ArpResponse>(`/api/diag?tool=arp${arpSearch ? `&search=${arpSearch}` : ""}`).catch(() => ({
        entries: [], total: 0,
      })),
    refetchInterval: 30000,
    staleTime: 5000,
    enabled: tab === "arp",
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<HistoryResponse>({
    queryKey: ["diag-history", historyToolFilter, historyPage],
    queryFn: () =>
      apiFetch<HistoryResponse>(`/api/diag?tool=history&filter=${historyToolFilter}&page=${historyPage}&limit=20`).catch(() => ({
        entries: [], total: 0,
      })),
    refetchInterval: 30000,
    staleTime: 5000,
    enabled: tab === "history",
  });

  // Sync tcpdump state from API (derived from query data, no useEffect needed)
  const activeCapture = tcpdumpData?.activeCapture;
  const captures = tcpdumpData?.captures || [];
  const arpEntries = arpData?.entries || [];
  const historyEntries = historyData?.entries || [];
  const isTcpdumpActiveFromApi = activeCapture?.active || false;
  const capturePacketCountFromApi = activeCapture?.packetCount || 0;

  // Sync tcpdumpRunning with API state
  useEffect(() => {
    setTcpdumpRunning(isTcpdumpActiveFromApi);
  }, [isTcpdumpActiveFromApi]);

  // Keep ref in sync for useQuery refetchInterval
  isTcpdumpActiveRef.current = isTcpdumpActiveFromApi;

  // Tick for capture counter
  useEffect(() => {
    if (isTcpdumpActiveFromApi) {
      setCapturePacketCount(capturePacketCountFromApi);
      const timer = setInterval(() => setCaptureTick((t) => t + 1), 3000);
      return () => clearInterval(timer);
    }
  }, [isTcpdumpActiveFromApi, capturePacketCountFromApi]);

  // ─── Mutations ───────────────────────────────────────────────
  const startCaptureMutation = useMutation({
    mutationFn: (params: Record<string, unknown>) =>
      apiFetch("/api/diag", { method: "POST", body: JSON.stringify({ tool: "tcpdump", action: "start", ...params }) }),
    onSuccess: (d: any) => {
      if (d.success || d.captureId) {
        toast.success("Packet capture started");
        setTcpdumpRunning(true);
        queryClient.invalidateQueries({ queryKey: ["diag-tcpdump"] });
      } else {
        toast.error(d.error || "Failed to start capture");
      }
    },
    onError: () => toast.error("Failed to start packet capture"),
  });

  const stopCaptureMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/diag", { method: "POST", body: JSON.stringify({ tool: "tcpdump", action: "stop" }) }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("Packet capture stopped");
        setTcpdumpRunning(false);
        setCapturePacketCount(0);
        queryClient.invalidateQueries({ queryKey: ["diag-tcpdump"] });
      } else {
        toast.error(d.error || "Failed to stop capture");
      }
    },
    onError: () => toast.error("Failed to stop packet capture"),
  });

  const deleteCaptureMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/diag/tcpdump/captures/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Delete failed" }));
        throw new Error(err.error || "Failed to delete capture");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Capture deleted");
      setTcpdeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["diag-tcpdump"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete capture"),
  });

  const pingMutation = useMutation({
    mutationFn: (params: Record<string, unknown>) =>
      apiFetch("/api/diag", { method: "POST", body: JSON.stringify({ tool: "ping", ...params }) }),
    onMutate: () => { setPingRunning(true); setPingOutput(""); setPingResult(null); },
    onSuccess: (d: any) => {
      setPingOutput(d.output || "");
      setPingResult({
        host: d.host || pingHost,
        count: d.count || parseInt(pingCount) || 4,
        interface: pingInterface,
        output: d.output || "",
        sent: d.sent || 0,
        received: d.received || 0,
        loss: d.loss || 0,
        minRtt: d.minRtt || 0,
          avgRtt: d.avgRtt || 0,
          maxRtt: d.maxRtt || 0,
        method: d.method || "icmp",
        timestamp: d.timestamp || new Date().toISOString(),
        id: d.id,
      });
      setPingRunning(false);
      queryClient.invalidateQueries({ queryKey: ["diag-history"] });
    },
    onError: (err) => { setPingOutput(`Error: ${err.message}`); setPingRunning(false); },
  });

  const tracerouteMutation = useMutation({
    mutationFn: (params: Record<string, unknown>) =>
      apiFetch("/api/diag", { method: "POST", body: JSON.stringify({ tool: "traceroute", ...params }) }),
    onMutate: () => { setTraceRunning(true); setTraceOutput(""); },
    onSuccess: (d: any) => {
      setTraceOutput(d.output || "");
      setTraceRunning(false);
      queryClient.invalidateQueries({ queryKey: ["diag-history"] });
    },
    onError: (err) => { setTraceOutput(`Error: ${err.message}`); setTraceRunning(false); },
  });

  const nslookupMutation = useMutation({
    mutationFn: (params: Record<string, unknown>) =>
      apiFetch("/api/diag", { method: "POST", body: JSON.stringify({ tool: "nslookup", ...params }) }),
    onMutate: () => { setNslookupRunning(true); setNslookupOutput(""); },
    onSuccess: (d: any) => {
      setNslookupOutput(d.output || "");
      setNslookupRunning(false);
      queryClient.invalidateQueries({ queryKey: ["diag-history"] });
    },
    onError: (err) => { setNslookupOutput(`Error: ${err.message}`); setNslookupRunning(false); },
  });

  const digMutation = useMutation({
    mutationFn: (params: Record<string, unknown>) =>
      apiFetch("/api/diag", { method: "POST", body: JSON.stringify({ tool: "dig", ...params }) }),
    onMutate: () => { setDigRunning(true); setDigOutput(""); },
    onSuccess: (d: any) => {
      setDigOutput(d.output || "");
      setDigRunning(false);
      queryClient.invalidateQueries({ queryKey: ["diag-history"] });
    },
    onError: (err) => { setDigOutput(`Error: ${err.message}`); setDigRunning(false); },
  });

  const flushArpMutation = useMutation({
    mutationFn: (ifaceName: string) =>
      apiFetch("/api/diag", { method: "POST", body: JSON.stringify({ tool: "arp", action: "flush", interface: ifaceName }) }),
    onSuccess: (_d: any, ifaceName: string) => {
      toast.success(`ARP cache flushed for ${ifaceName}`);
      queryClient.invalidateQueries({ queryKey: ["diag-arp"] });
    },
    onError: () => toast.error("Failed to flush ARP cache"),
  });

  // ─── Handlers ────────────────────────────────────────────────
  const handleStartCapture = () => {
    startCaptureMutation.mutate({
      interface: tcpdumpInterface,
      filter: tcpdumpFilter,
      count: tcpdumpCount,
      snapshotLength: tcpdumpSnaplen,
    });
  };

  const handlePing = () => {
    if (!pingHost.trim()) { toast.error("Host is required"); return; }
    pingMutation.mutate({ host: pingHost, count: parseInt(pingCount) || 4, interface: pingInterface });
  };

  const handleTraceroute = () => {
    if (!traceHost.trim()) { toast.error("Host is required"); return; }
    tracerouteMutation.mutate({ host: traceHost, maxHops: parseInt(traceMaxHops) || 30 });
  };

  const handleNslookup = () => {
    if (!nslookupDomain.trim()) { toast.error("Domain is required"); return; }
    nslookupMutation.mutate({ domain: nslookupDomain, server: nslookupServer || undefined });
  };

  const handleDig = () => {
    if (!digDomain.trim()) { toast.error("Domain is required"); return; }
    digMutation.mutate({ domain: digDomain, recordType: digType, server: digServer || undefined });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard"));
  };

  // ─── Quick Diagnostics Handler ──────────────────────────────
  const handleQuickDiag = async (diag: typeof QUICK_DIAGS[number]) => {
    const key = `${diag.tool}:${diag.target}`;
    setQuickDiagResults((prev) => ({ ...prev, [key]: { status: "running" } }));

    try {
      if (diag.tool === "arp-flush") {
        flushArpMutation.mutate(diag.target);
        setQuickDiagResults((prev) => ({
          ...prev,
          [key]: { status: "success", latency: "—", output: "ARP cache flushed", timestamp: new Date().toISOString() },
        }));
        return;
      }

      let endpoint = "/api/diag";
      let body: Record<string, unknown> = { tool: diag.tool };

      if (diag.tool === "ping") {
        body = { tool: "ping", host: diag.target, count: 2, interface: "any" };
      } else if (diag.tool === "nslookup") {
        body = { tool: "nslookup", domain: diag.target };
      } else if (diag.tool === "traceroute") {
        body = { tool: "traceroute", host: diag.target, maxHops: 10 };
      } else if (diag.tool === "dig") {
        body = { tool: "dig", domain: diag.target, recordType: "A" };
      }

      const d = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });

      let latency = "—";
      if (diag.tool === "ping" && d.avgRtt !== undefined) {
        latency = `${d.avgRtt} ms`;
        if (d.loss > 0) {
          setQuickDiagResults((prev) => ({
            ...prev,
            [key]: { status: "failed", latency, output: d.output || `${d.loss}% packet loss`, timestamp: new Date().toISOString() },
          }));
          return;
        }
      }

      setQuickDiagResults((prev) => ({
        ...prev,
        [key]: { status: "success", latency, output: d.output || "", timestamp: new Date().toISOString() },
      }));
    } catch {
      setQuickDiagResults((prev) => ({
        ...prev,
        [key]: { status: "failed", output: "Connection error or gateway unavailable" },
      }));
    }
  };

  // ─── Loading State ───────────────────────────────────────────
  if (tcpdumpLoading) {
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
          <h1 className="text-2xl font-bold text-foreground">Diagnostic Tools</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Network diagnostics: packet capture, ping, traceroute, DNS lookup, ARP table
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { queryClient.invalidateQueries({ queryKey: ["diag-tcpdump"] }); queryClient.invalidateQueries({ queryKey: ["diag-arp"] }); queryClient.invalidateQueries({ queryKey: ["diag-history"] }); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Packet Captures" value={captures.length} subtitle="Saved capture files" icon={Radio} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Capture Status" value={tcpdumpRunning ? "Running" : "Idle"} subtitle={tcpdumpRunning ? `${capturePacketCount} packets captured` : "No active capture"} icon={tcpdumpRunning ? RadioTower : Radio} gradient="stat-gradient-green" delay={75} />
        <StatCard title="ARP Entries" value={arpData?.total || arpEntries.length} subtitle="ARP cache entries" icon={Network} gradient="stat-gradient-amber" delay={150} />
        <StatCard title="History" value={historyData?.total || historyEntries.length} subtitle="Past diagnostic runs" icon={History} gradient="stat-gradient-blue" delay={225} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="tcpdump" className="gap-1.5">
            <Radio className="h-3.5 w-3.5" />
            TCPDump
            {tcpdumpRunning && <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="ping" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Ping
          </TabsTrigger>
          <TabsTrigger value="traceroute" className="gap-1.5">
            <ArrowRight className="h-3.5 w-3.5" />
            Traceroute
          </TabsTrigger>
          <TabsTrigger value="dns" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            DNS Lookup
          </TabsTrigger>
          <TabsTrigger value="arp" className="gap-1.5">
            <Network className="h-3.5 w-3.5" />
            ARP Table
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: TCPDump Capture ─────────────────────────── */}
        <TabsContent value="tcpdump" className="space-y-4">
          {/* Capture Configuration */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Radio className="h-4 w-4 text-[#DC2626]" />
                Capture Configuration
                {tcpdumpRunning && (
                  <Badge className="bg-red-500 text-white border-0 ml-2 text-xs gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    CAPTURING
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label className="text-sm font-medium mb-1 block">Interface</Label>
                  {interfaceNames.length > 0 ? (
                    <Select value={tcpdumpInterface} onValueChange={setTcpdumpInterface} disabled={tcpdumpRunning}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {interfaceNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}{realInterfaces.find((i) => i.name === name)?.carrierStatus ? " ✓" : " ⚠"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={tcpdumpInterface} onChange={(e) => setTcpdumpInterface(e.target.value)} placeholder="eth0" disabled={tcpdumpRunning} />
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Filter Expression</Label>
                  <Input value={tcpdumpFilter} onChange={(e) => setTcpdumpFilter(e.target.value)} placeholder="e.g. port 80 or host 10.0.0.1" disabled={tcpdumpRunning} />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Packet Count</Label>
                  <Input type="number" value={tcpdumpCount} onChange={(e) => setTcpdumpCount(parseInt(e.target.value) || 100)} min={1} disabled={tcpdumpRunning} />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Snapshot Length</Label>
                  <Input type="number" value={tcpdumpSnaplen} onChange={(e) => setTcpdumpSnaplen(parseInt(e.target.value) || 262144)} min={68} disabled={tcpdumpRunning} />
                </div>
              </div>
              <div className="flex gap-2 items-center">
                {!tcpdumpRunning ? (
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleStartCapture} disabled={startCaptureMutation.isPending}>
                    {startCaptureMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</> : <><Play className="h-4 w-4 mr-2" />Start Capture</>}
                  </Button>
                ) : (
                  <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => stopCaptureMutation.mutate()} disabled={stopCaptureMutation.isPending}>
                    {stopCaptureMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Stopping...</> : <><Square className="h-4 w-4 mr-2" />Stop Capture</>}
                  </Button>
                )}
                {tcpdumpRunning && (
                  <div className="flex items-center gap-3 ml-4">
                    <span className="inline-block h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-mono tabular-nums">
                      <span className="text-muted-foreground">Packets:</span> <span className="font-bold">{capturePacketCount}</span>
                      <span className="text-muted-foreground ml-3">Interface:</span> <span className="font-bold">{activeCapture?.interface}</span>
                      {activeCapture?.filter && (
                        <>
                          <span className="text-muted-foreground ml-3">Filter:</span> <span className="font-bold">{activeCapture.filter}</span>
                        </>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Past Captures */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Database className="h-4 w-4 text-[#DC2626]" />
                  Past Captures
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => refetchTcpdump()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Date</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Interface</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Filter</TableHead>
                      <TableHead className="text-xs font-medium uppercase">File Size</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Packets</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {captures.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          <Database className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No captures found. Start a packet capture to see results here.
                        </TableCell>
                      </TableRow>
                    ) : captures.map((cap) => (
                      <TableRow key={cap.id} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(cap.startTime)}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs font-mono">{cap.interface}</Badge></TableCell>
                        <TableCell className="text-xs font-mono max-w-[200px] truncate hidden md:table-cell">{cap.filter || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{formatFileSize(cap.fileSize)}</TableCell>
                        <TableCell className="text-xs font-mono tabular-nums">{cap.packetCount.toLocaleString()}</TableCell>
                        <TableCell>
                          {cap.status === "COMPLETED" ? (
                            <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs"><CheckCircle className="h-3 w-3 mr-0.5" />Done</Badge>
                          ) : cap.status === "RUNNING" ? (
                            <Badge className="bg-red-500 text-white border-0 text-xs"><span className="inline-block h-1.5 w-1.5 rounded-full bg-white mr-0.5 animate-pulse" />Running</Badge>
                          ) : cap.status === "FAILED" ? (
                            <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-0.5" />Failed</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">{cap.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = `/api/diag/tcpdump/download/${cap.id}`;
                                    link.download = `capture-${cap.id}.pcap`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    toast.info("Downloading PCAP file...");
                                  }}>
                                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download PCAP</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setTcpdeleteTarget(cap)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete capture</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Live Packet Capture Analysis */}
          {isTcpdumpActiveFromApi && (
            <Card className="border shadow-sm border-red-200 bg-red-50/30 dark:bg-red-950/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <RadioTower className="h-4 w-4 text-red-500" />
                    Live Packet Capture Analysis
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Timer className="h-3 w-3" />
                    Auto-refresh 2s
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Live Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-background border border-border/50">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Capture Duration</p>
                    <p className="text-lg font-bold tabular-nums text-foreground mt-0.5">
                      {activeCapture?.startTime ? (() => {
                        const diff = Math.floor((Date.now() - new Date(activeCapture.startTime).getTime()) / 1000);
                        const mins = Math.floor(diff / 60);
                        const secs = diff % 60;
                        return `${mins}:${secs.toString().padStart(2, "0")}`;
                      })() : "0:00"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-background border border-border/50">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Packets Captured</p>
                    <p className="text-lg font-bold tabular-nums text-foreground mt-0.5">{capturePacketCount.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background border border-border/50">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Interface</p>
                    <p className="text-lg font-bold font-mono text-foreground mt-0.5">{activeCapture?.interface || "—"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background border border-border/50">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Est. File Size</p>
                    <p className="text-lg font-bold tabular-nums text-foreground mt-0.5">{formatFileSize(capturePacketCount * 262)}</p>
                  </div>
                </div>

                {/* Filter Expression */}
                {activeCapture?.filter && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-900 text-zinc-100 font-mono text-xs border border-zinc-800">
                    <Filter className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <span className="text-zinc-500">filter:</span>
                    <span className="text-amber-400">{activeCapture.filter}</span>
                  </div>
                )}

                {/* Live Capture Status */}
                <div className="bg-zinc-900 text-zinc-100 font-mono rounded-lg overflow-hidden border border-zinc-800">
                  <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 text-zinc-400 text-[10px] uppercase tracking-wider border-b border-zinc-700">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    Packet Capture in Progress
                    <span className="ml-auto tabular-nums">{new Date().toLocaleTimeString()}</span>
                  </div>
                  <div className="p-4 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <RadioTower className="h-8 w-8 text-red-400 animate-pulse" />
                      <p className="text-sm text-zinc-300">
                        Capturing on <span className="text-amber-400 font-bold">{activeCapture?.interface || tcpdumpInterface}</span>
                        {activeCapture?.filter && <span> with filter <span className="text-emerald-400">{activeCapture.filter}</span></span>}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {capturePacketCount.toLocaleString()} packets captured • File: <code className="text-zinc-400">/tmp/cryptsk-capture-*.pcap</code>
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-2">Packets are being written to PCAP file. Stop capture to view results.</p>
                    </div>
                  </div>
                </div>

                {/* Stop button */}
                <div className="flex justify-center">
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => stopCaptureMutation.mutate()}
                    disabled={stopCaptureMutation.isPending}
                  >
                    {stopCaptureMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Stopping...</>
                    ) : (
                      <><Square className="h-4 w-4 mr-2" />Stop Live Capture</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Tab 2: Ping ────────────────────────────────────── */}
        <TabsContent value="ping" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#DC2626]" />
                ICMP Ping Test
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label className="text-sm font-medium mb-1 block">Target Host *</Label>
                  <Input value={pingHost} onChange={(e) => setPingHost(e.target.value)} placeholder="e.g. 8.8.8.8 or google.com" onKeyDown={(e) => e.key === "Enter" && handlePing()} />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Count (1-50)</Label>
                  <Input type="number" value={pingCount} onChange={(e) => setPingCount(e.target.value)} min={1} max={50} />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Interface</Label>
                  {interfaceNames.length > 0 ? (
                    <Select value={pingInterface} onValueChange={setPingInterface}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">any (default route)</SelectItem>
                        {interfaceNames.map((name) => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={pingInterface} onChange={(e) => setPingInterface(e.target.value)} placeholder="e.g. eth0 (or 'any')" />
                  )}
                </div>
                <div className="flex items-end">
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white w-full" onClick={handlePing} disabled={pingRunning}>
                    {pingRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Pinging...</> : <><Activity className="h-4 w-4 mr-2" />Execute Ping</>}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Output */}
          <TerminalBox output={pingOutput} loading={pingRunning} title={`ping ${pingHost}`} />

          {/* Results Summary */}
          {pingResult && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#DC2626]" />
                  Results Summary
                  {pingResult.method && pingResult.method !== "icmp" && (
                    <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200 ml-2">
                      {pingResult.method === "tcp-connect" ? "⚡ TCP Connect" : pingResult.method}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  {[
                    { label: "Packets Sent", value: String(pingResult.sent || "—"), color: "text-foreground" },
                    { label: "Received", value: String(pingResult.received || "—"), color: pingResult.received > 0 ? "text-emerald-600" : "text-muted-foreground" },
                    { label: "Loss", value: `${pingResult.loss}%`, color: pingResult.loss > 0 ? "text-red-600" : "text-emerald-600" },
                    { label: "Min RTT", value: pingResult.minRtt ? `${pingResult.minRtt} ms` : "—", color: "text-blue-600" },
                    { label: "Avg RTT", value: pingResult.avgRtt ? `${pingResult.avgRtt} ms` : "—", color: "text-amber-600" },
                    { label: "Max RTT", value: pingResult.maxRtt ? `${pingResult.maxRtt} ms` : "—", color: "text-purple-600" },
                  ].map((item) => (
                    <div key={item.label} className="p-3 rounded-lg bg-muted/30 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">{item.label}</p>
                      <p className={`text-lg font-bold tabular-nums ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(pingResult.output)}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />Copy Output
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const res = await fetch("/api/diag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "ping", action: "save", host: pingResult?.host, output: pingResult?.output, sent: pingResult?.sent, received: pingResult?.received, loss: pingResult?.loss, minRtt: pingResult?.minRtt, avgRtt: pingResult?.avgRtt, maxRtt: pingResult?.maxRtt }) });
                      if (res.ok) { toast.success("Results saved to history"); }
                      else { toast.error("Failed to save results"); }
                    } catch { toast.error("Failed to save results"); }
                  }}>
                    <Save className="h-3.5 w-3.5 mr-1.5" />Save Results
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Tab 3: Traceroute ──────────────────────────────── */}
        <TabsContent value="traceroute" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-[#DC2626]" />
                Traceroute
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label className="text-sm font-medium mb-1 block">Target Host *</Label>
                  <Input value={traceHost} onChange={(e) => setTraceHost(e.target.value)} placeholder="e.g. 8.8.8.8 or google.com" onKeyDown={(e) => e.key === "Enter" && handleTraceroute()} />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1 block">Max Hops</Label>
                  <Input type="number" value={traceMaxHops} onChange={(e) => setTraceMaxHops(e.target.value)} min={1} max={64} />
                </div>
                <div className="flex items-end">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white w-full" onClick={handleTraceroute} disabled={traceRunning}>
                    {traceRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Tracing...</> : <><ArrowRight className="h-4 w-4 mr-2" />Run Traceroute</>}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <TerminalBox output={traceOutput} loading={traceRunning} title={`traceroute ${traceHost}`} />

          {traceOutput && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(traceOutput)}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />Copy Output
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 4: DNS Lookup ──────────────────────────────── */}
        <TabsContent value="dns" className="space-y-4">
          <Tabs value={dnsSubTab} onValueChange={setDnsSubTab}>
            <TabsList className="bg-muted">
              <TabsTrigger value="nslookup">NSLookup</TabsTrigger>
              <TabsTrigger value="dig">Dig</TabsTrigger>
            </TabsList>

            {/* NSLookup */}
            <TabsContent value="nslookup" className="space-y-4">
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4 text-[#DC2626]" />
                    NSLookup
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Domain *</Label>
                      <Input value={nslookupDomain} onChange={(e) => setNslookupDomain(e.target.value)} placeholder="e.g. google.com" onKeyDown={(e) => e.key === "Enter" && handleNslookup()} />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">DNS Server</Label>
                      <Input value={nslookupServer} onChange={(e) => setNslookupServer(e.target.value)} placeholder="e.g. 8.8.8.8 (optional)" />
                    </div>
                    <div className="flex items-end">
                      <Button className="bg-purple-600 hover:bg-purple-700 text-white w-full" onClick={handleNslookup} disabled={nslookupRunning}>
                        {nslookupRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Looking up...</> : <><Search className="h-4 w-4 mr-2" />NSLookup</>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <TerminalBox output={nslookupOutput} loading={nslookupRunning} title={`nslookup ${nslookupDomain}${nslookupServer ? ` @${nslookupServer}` : ""}`} />
              {nslookupOutput && (
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(nslookupOutput)}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />Copy Output
                </Button>
              )}
            </TabsContent>

            {/* Dig */}
            <TabsContent value="dig" className="space-y-4">
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-[#DC2626]" />
                    Dig
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-4">
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Domain *</Label>
                      <Input value={digDomain} onChange={(e) => setDigDomain(e.target.value)} placeholder="e.g. google.com" onKeyDown={(e) => e.key === "Enter" && handleDig()} />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Record Type</Label>
                      <Select value={digType} onValueChange={setDigType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DNS_RECORD_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1 block">DNS Server</Label>
                      <Input value={digServer} onChange={(e) => setDigServer(e.target.value)} placeholder="e.g. 8.8.8.8 (optional)" />
                    </div>
                    <div className="flex items-end">
                      <Button className="bg-amber-600 hover:bg-amber-700 text-white w-full" onClick={handleDig} disabled={digRunning}>
                        {digRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Querying...</> : <><Search className="h-4 w-4 mr-2" />Dig</>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <TerminalBox output={digOutput} loading={digRunning} title={`dig ${digDomain} ${digType}${digServer ? ` @${digServer}` : ""}`} />
              {digOutput && (
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(digOutput)}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />Copy Output
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ─── Tab 5: ARP Table ───────────────────────────────── */}
        <TabsContent value="arp" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-1 gap-3">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by IP or MAC..." value={arpSearch} onChange={(e) => setArpSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={flushInterface} onValueChange={setFlushInterface}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Interfaces</SelectItem>
                  {interfaceNames.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => flushArpMutation.mutate(flushInterface)} disabled={flushArpMutation.isPending}>
                {flushArpMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Flushing...</> : <><RotateCcw className="h-4 w-4 mr-2" />Flush ARP</>}
              </Button>
              <Button variant="outline" onClick={() => refetchArp()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">IP Address</TableHead>
                      <TableHead className="text-xs font-medium uppercase">MAC Address</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Device</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden lg:table-cell">Interface</TableHead>
                      <TableHead className="text-xs font-medium uppercase">State</TableHead>
                      <TableHead className="text-xs font-medium uppercase hidden md:table-cell">Age</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {arpLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                          <span className="text-sm text-muted-foreground">Loading ARP table...</span>
                        </TableCell>
                      </TableRow>
                    ) : arpEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          <Network className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No ARP entries found.
                        </TableCell>
                      </TableRow>
                    ) : arpEntries.map((entry, idx) => (
                      <TableRow key={`${entry.ip}-${entry.mac}-${idx}`} className="hover:bg-muted/50 transition-colors duration-150">
                        <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{entry.ip}</code></TableCell>
                        <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{entry.mac}</code></TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{entry.device || "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell"><Badge variant="outline" className="text-xs font-mono">{entry.interface}</Badge></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${ARP_STATE_COLORS[entry.state] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                            {entry.state}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{entry.age}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 6: History ─────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4">
          {/* Quick Diagnostics Panel */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Quick Diagnostics
                </CardTitle>
                <span className="text-xs text-muted-foreground">One-click network tests</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {QUICK_DIAGS.map((diag) => {
                  const key = `${diag.tool}:${diag.target}`;
                  const result = quickDiagResults[key];
                  const Icon = diag.icon;
                  const isRunning = result?.status === "running";

                  return (
                    <button
                      key={key}
                      onClick={() => !isRunning && handleQuickDiag(diag)}
                      disabled={isRunning}
                      className="relative group text-left p-3 rounded-xl border border-border/50 hover:border-border hover:shadow-sm transition-all duration-200 bg-background hover:bg-muted/20 disabled:opacity-70 disabled:cursor-wait"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${diag.color} text-white shrink-0 shadow-sm`}>
                          {isRunning ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground leading-tight">{diag.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight truncate">{diag.description}</p>
                          <p className="text-[10px] font-mono text-muted-foreground/70 mt-1">{diag.tool} → {diag.target}</p>
                        </div>
                      </div>
                      {/* Result badge */}
                      {result && result.status !== "idle" && result.status !== "running" && (
                        <div className="mt-2 flex items-center gap-1.5">
                          {result.status === "success" ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-0.5">
                              <CheckCircle className="h-2.5 w-2.5" />
                              {result.latency !== "—" ? result.latency : "OK"}
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px] gap-0.5">
                              <XCircle className="h-2.5 w-2.5" />
                              Failed
                            </Badge>
                          )}
                          {result.timestamp && (
                            <span className="text-[10px] text-muted-foreground/60">{new Date(result.timestamp).toLocaleTimeString()}</span>
                          )}
                        </div>
                      )}
                      {/* Loading bar */}
                      {isRunning && (
                        <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full animate-pulse w-2/3" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <Select value={historyToolFilter} onValueChange={(v) => { setHistoryToolFilter(v); setHistoryPage(1); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Tools" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Tools</SelectItem>
                <SelectItem value="tcpdump">TCPDump</SelectItem>
                <SelectItem value="ping">Ping</SelectItem>
                <SelectItem value="traceroute">Traceroute</SelectItem>
                <SelectItem value="nslookup">NSLookup</SelectItem>
                <SelectItem value="dig">Dig</SelectItem>
                <SelectItem value="arp">ARP Flush</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["diag-history"] })}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[520px]">
                {historyLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : historyEntries.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No diagnostic history found.</p>
                  </div>
                ) : historyEntries.map((entry) => {
                  const ToolIcon = TOOL_ICONS[entry.tool] || Terminal;
                  const toolColor = TOOL_COLORS[entry.tool] || "bg-slate-100 text-slate-600";
                  const isExpanded = expandedHistory === entry.id;
                  return (
                    <div key={entry.id} className="border-b last:border-b-0">
                      <button
                        className="w-full text-left p-4 hover:bg-muted/30 transition-colors flex items-center gap-3"
                        onClick={() => setExpandedHistory(isExpanded ? null : entry.id)}
                      >
                        <div className={`p-2 rounded-lg shrink-0 ${toolColor}`}>
                          <ToolIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{entry.tool.toUpperCase()}</span>
                            <Badge variant="outline" className="text-[10px] font-mono">{entry.target}</Badge>
                            {entry.status === "success" ? (
                              <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Success</Badge>
                            ) : entry.status === "failed" ? (
                              <Badge variant="destructive" className="text-[10px]">Failed</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">Running</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatTimestamp(entry.timestamp)}</p>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </button>
                      {isExpanded && entry.output && (
                        <div className="px-4 pb-4">
                          <div className="bg-zinc-900 text-zinc-100 font-mono p-3 rounded-lg overflow-auto max-h-64 border border-zinc-800">
                            <pre className="text-xs leading-relaxed whitespace-pre-wrap break-all">{entry.output}</pre>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(entry.output)}>
                              <Copy className="h-3.5 w-3.5 mr-1" />Copy
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Pagination */}
          {historyData && historyData.total > 20 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {((historyPage - 1) * 20) + 1}–{Math.min(historyPage * 20, historyData.total)} of {historyData.total}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={historyPage * 20 >= historyData.total} onClick={() => setHistoryPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Capture Confirmation */}
      <AlertDialog open={!!tcpdeleteTarget} onOpenChange={(o) => !o && setTcpdeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Capture</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the capture from <strong>{tcpdeleteTarget?.startTime ? formatTimestamp(tcpdeleteTarget.startTime) : "unknown"}</strong>?
              This will permanently delete the PCAP file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => tcpdeleteTarget && deleteCaptureMutation.mutate(tcpdeleteTarget.id)}
              disabled={deleteCaptureMutation.isPending}
            >
              {deleteCaptureMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
