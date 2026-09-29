"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Network, Search, AlertTriangle, Shield, Clock, Activity,
  RefreshCcw, X, Globe, Zap, Monitor, Loader2,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────
type ChangeSource = "DHCP" | "STATIC" | "MANUAL" | "RADIUS" | "UNKNOWN";

interface IpMacChange {
  id: string;
  timestamp: string;
  ipAddress: string;
  oldMac: string;
  newMac: string;
  subscriberId: string;
  subscriberCode: string;
  subscriberName: string;
  source: ChangeSource;
  isSuspicious: boolean;
}

interface SpoofAlert {
  id: string;
  ipAddress: string;
  macAddress: string;
  subscriberCode: string;
  subscriberName: string;
  detectedAt: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
}

const FALLBACK_CHANGES: IpMacChange[] = [
  { id: "imc-1", timestamp: "2025-01-15T14:32:00Z", ipAddress: "10.0.5.42", oldMac: "AA:BB:CC:DD:EE:FF", newMac: "AA:BB:CC:DD:EE:FF", subscriberId: "sub-104", subscriberCode: "CRY-00104", subscriberName: "Arun Mehta", source: "DHCP", isSuspicious: false },
  { id: "imc-2", timestamp: "2025-01-15T13:15:00Z", ipAddress: "10.0.5.89", oldMac: "11:22:33:44:55:66", newMac: "77:88:99:AA:BB:CC", subscriberId: "sub-218", subscriberCode: "CRY-00218", subscriberName: "Priya Sharma", source: "DHCP", isSuspicious: true },
  { id: "imc-3", timestamp: "2025-01-15T11:00:00Z", ipAddress: "10.0.5.101", oldMac: "DE:AD:BE:EF:00:01", newMac: "DE:AD:BE:EF:00:02", subscriberId: "sub-156", subscriberCode: "CRY-00156", subscriberName: "Rahul Verma", source: "MANUAL", isSuspicious: false },
  { id: "imc-4", timestamp: "2025-01-15T10:45:00Z", ipAddress: "10.0.6.55", oldMac: "FF:EE:DD:CC:BB:AA", newMac: "11:22:33:44:55:77", subscriberId: "sub-301", subscriberCode: "CRY-00301", subscriberName: "Sunita Devi", source: "STATIC", isSuspicious: true },
  { id: "imc-5", timestamp: "2025-01-15T09:20:00Z", ipAddress: "10.0.5.33", oldMac: "00:11:22:33:44:55", newMac: "00:11:22:33:44:55", subscriberId: "sub-89", subscriberCode: "CRY-00089", subscriberName: "Kiran Joshi", source: "RADIUS", isSuspicious: false },
  { id: "imc-6", timestamp: "2025-01-15T08:00:00Z", ipAddress: "10.0.7.12", oldMac: "AA:AA:AA:AA:AA:AA", newMac: "BB:BB:BB:BB:BB:BB", subscriberId: "sub-175", subscriberCode: "CRY-00175", subscriberName: "Deepak Singh", source: "UNKNOWN", isSuspicious: true },
  { id: "imc-7", timestamp: "2025-01-14T16:30:00Z", ipAddress: "10.0.5.67", oldMac: "22:33:44:55:66:77", newMac: "22:33:44:55:66:78", subscriberId: "sub-412", subscriberCode: "CRY-00412", subscriberName: "Meena Patel", source: "DHCP", isSuspicious: false },
  { id: "imc-8", timestamp: "2025-01-14T15:00:00Z", ipAddress: "10.0.5.88", oldMac: "55:66:77:88:99:AA", newMac: "55:66:77:88:99:BB", subscriberId: "sub-100", subscriberCode: "CRY-00100", subscriberName: "Vikram Rao", source: "MANUAL", isSuspicious: false },
  { id: "imc-9", timestamp: "2025-01-14T12:00:00Z", ipAddress: "10.0.8.99", oldMac: "CC:DD:EE:FF:00:11", newMac: "CC:DD:EE:FF:00:22", subscriberId: "sub-200", subscriberCode: "CRY-00200", subscriberName: "Neha Kapoor", source: "DHCP", isSuspicious: true },
  { id: "imc-10", timestamp: "2025-01-14T10:00:00Z", ipAddress: "10.0.5.44", oldMac: "AB:CD:EF:01:23:45", newMac: "AB:CD:EF:01:23:45", subscriberId: "sub-102", subscriberCode: "CRY-00102", subscriberName: "Raj Malhotra", source: "STATIC", isSuspicious: false },
];

const FALLBACK_SPOOF_ALERTS: SpoofAlert[] = [
  { id: "sa-1", ipAddress: "10.0.5.89", macAddress: "77:88:99:AA:BB:CC", subscriberCode: "CRY-00218", subscriberName: "Priya Sharma", detectedAt: "2025-01-15T13:15:00Z", severity: "HIGH", description: "MAC address changed within 2 hours — possible spoofing attempt" },
  { id: "sa-2", ipAddress: "10.0.6.55", macAddress: "11:22:33:44:55:77", subscriberCode: "CRY-00301", subscriberName: "Sunita Devi", detectedAt: "2025-01-15T10:45:00Z", severity: "MEDIUM", description: "New MAC not registered in subscriber profile" },
  { id: "sa-3", ipAddress: "10.0.7.12", macAddress: "BB:BB:BB:BB:BB:BB", subscriberCode: "CRY-00175", subscriberName: "Deepak Singh", detectedAt: "2025-01-15T08:00:00Z", severity: "HIGH", description: "Bogus MAC address pattern detected — likely spoofed" },
  { id: "sa-4", ipAddress: "10.0.8.99", macAddress: "CC:DD:EE:FF:00:22", subscriberCode: "CRY-00200", subscriberName: "Neha Kapoor", detectedAt: "2025-01-14T12:00:00Z", severity: "LOW", description: "MAC change frequency exceeds threshold (3 changes in 24h)" },
];

const PAGE_SIZE = 8;

// ─── Helpers ────────────────────────────────────────────────────
function getSourceBadge(source: ChangeSource) {
  const styles: Record<string, string> = {
    DHCP: "bg-teal-600 hover:bg-teal-700 text-white",
    STATIC: "bg-green-600 hover:bg-green-700 text-white",
    MANUAL: "bg-purple-600 hover:bg-purple-700 text-white",
    RADIUS: "bg-cyan-600 hover:bg-cyan-700 text-white",
    UNKNOWN: "bg-gray-500 hover:bg-gray-600 text-white",
  };
  return <Badge className={`text-[10px] ${styles[source] || styles.UNKNOWN}`}>{source}</Badge>;
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case "HIGH": return <Badge className="text-[10px] bg-red-600 hover:bg-red-700 text-white">HIGH</Badge>;
    case "MEDIUM": return <Badge className="text-[10px] bg-amber-600 hover:bg-amber-700 text-white">MEDIUM</Badge>;
    case "LOW": return <Badge className="text-[10px] bg-yellow-500 hover:bg-yellow-600 text-white">LOW</Badge>;
    default: return <Badge variant="secondary" className="text-[10px]">{severity}</Badge>;
  }
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ─── Component ────────────────────────────────────────────────────
export default function IpMacHistoryPage() {
  const [ipSearch, setIpSearch] = useState("");
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<IpMacChange[]>([]);
  const [spoofAlerts, setSpoofAlerts] = useState<SpoofAlert[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [spoofOpen, setSpoofOpen] = useState(false);

  // ─── Data Fetching ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ip-mac-history");
        if (!res.ok) throw new Error("Failed to fetch IP-MAC history");
        const data = await res.json();
        if (data && typeof data === "object") {
          setChanges(Array.isArray(data.changes) ? data.changes : Array.isArray(data) ? data : FALLBACK_CHANGES);
          setSpoofAlerts(Array.isArray(data.alerts) ? data.alerts : FALLBACK_SPOOF_ALERTS);
        } else {
          setChanges(FALLBACK_CHANGES);
          setSpoofAlerts(FALLBACK_SPOOF_ALERTS);
        }
      } catch (err) {
        // logger
        setError(err instanceof Error ? err.message : "Unknown error");
        setChanges(FALLBACK_CHANGES);
        setSpoofAlerts(FALLBACK_SPOOF_ALERTS);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const suspiciousCount = changes.filter((c) => c.isSuspicious).length;
  const highAlerts = spoofAlerts.filter((a) => a.severity === "HIGH").length;

  const filtered = useMemo(() => {
    return changes.filter((change) => {
      if (ipSearch && !change.ipAddress.includes(ipSearch)) return false;
      if (subscriberSearch) {
        const q = subscriberSearch.toLowerCase();
        if (!change.subscriberName.toLowerCase().includes(q) && !change.subscriberCode.toLowerCase().includes(q)) return false;
      }
      if (sourceFilter !== "ALL" && change.source !== sourceFilter) return false;
      if (startDate && new Date(change.timestamp) < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (new Date(change.timestamp) > end) return false;
      }
      return true;
    });
  }, [changes, ipSearch, subscriberSearch, sourceFilter, startDate, endDate]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const latestChanges = changes.slice(0, 20);

  async function handleDetectSpoofing() {
    setDetecting(true);
    try {
      await fetch("/api/ip-mac-history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "detect-spoofing" }) });
      setSpoofOpen(true);
      toast.success(`Spoofing detection complete: ${spoofAlerts.length} alerts found`);
    } catch {
      toast.error("Spoofing detection failed");
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="IP-MAC History"
        description="Monitor IP address to MAC address changes and detect potential spoofing."
        icon={Network}
        actions={
          <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={handleDetectSpoofing} disabled={detecting}>
            {detecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
            {detecting ? "Detecting..." : "Detect Spoofing"}
          </Button>
        }
      />

      {/* Error Banner */}
      {error && (
        <Card className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">Showing demo data — API unavailable: {error}</p>
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => window.location.reload()}>
              <RefreshCcw className="h-3 w-3 mr-1" />Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading && !changes.length ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="h-16 w-full rounded-lg" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="border-0 rounded-xl ring-1 ring-teal-200/60 dark:ring-teal-800/40 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/50 dark:to-cyan-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-sm shadow-teal-500/25"><Activity className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">{changes.length}</p><p className="text-xs text-muted-foreground font-medium">Total Changes</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-red-200/60 dark:ring-red-800/40 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-sm shadow-red-500/25"><AlertTriangle className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">{suspiciousCount}</p><p className="text-xs text-muted-foreground font-medium">Suspicious</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-amber-200/60 dark:ring-amber-800/40 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 shadow-sm shadow-amber-500/25"><Zap className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{highAlerts}</p><p className="text-xs text-muted-foreground font-medium">High Alerts</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-green-200/60 dark:ring-green-800/40 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-500/25"><Monitor className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">{latestChanges.length}</p><p className="text-xs text-muted-foreground font-medium">Recent Entries</p></div></div></CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Filter by IP address..." value={ipSearch} onChange={(e) => { setIpSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Filter by subscriber..." value={subscriberSearch} onChange={(e) => { setSubscriberSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Sources</SelectItem>
                <SelectItem value="DHCP">DHCP</SelectItem>
                <SelectItem value="STATIC">Static</SelectItem>
                <SelectItem value="MANUAL">Manual</SelectItem>
                <SelectItem value="RADIUS">RADIUS</SelectItem>
                <SelectItem value="UNKNOWN">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="w-full sm:w-[140px]" />
            <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="w-full sm:w-[140px]" />
            {(ipSearch || subscriberSearch || sourceFilter !== "ALL" || startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setIpSearch(""); setSubscriberSearch(""); setSourceFilter("ALL"); setStartDate(""); setEndDate(""); setPage(1); }}><X className="h-4 w-4 mr-1" />Clear</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" />Change History</CardTitle>
          <CardDescription className="text-xs">IP to MAC address change log with source tracking.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !changes.length ? (
            <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Timestamp</TableHead>
                      <TableHead className="text-xs">IP Address</TableHead>
                      <TableHead className="text-xs">Old MAC</TableHead>
                      <TableHead className="text-xs">New MAC</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Subscriber</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No changes found matching filters.</TableCell></TableRow>
                    ) : (
                      paginated.map((change) => (
                        <TableRow key={change.id} className={`hover:bg-muted/50 transition-colors duration-150 ${change.isSuspicious ? "bg-red-50/50 dark:bg-red-950/10" : ""}`}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{formatTimestamp(change.timestamp)}</div>
                          </TableCell>
                          <TableCell className="text-xs font-mono font-medium">{change.ipAddress}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{change.oldMac}</TableCell>
                          <TableCell className="text-xs font-mono">
                            <span className={change.oldMac !== change.newMac ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>{change.newMac}</span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div><div className="text-xs font-medium">{change.subscriberName}</div><div className="text-[10px] text-muted-foreground font-mono">{change.subscriberCode}</div></div>
                          </TableCell>
                          <TableCell>{getSourceBadge(change.source)}</TableCell>
                          <TableCell>
                            {change.isSuspicious ? (
                              <Badge variant="destructive" className="text-[10px] flex items-center gap-1 w-fit"><AlertTriangle className="h-2.5 w-2.5" />Suspicious</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-green-400 text-green-700 dark:border-green-600 dark:text-green-400">Normal</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                      <Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs" onClick={() => setPage(p)}>{p}</Button>
                    ))}
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Latest Changes Widget */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />Latest 20 Changes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">IP</TableHead>
                  <TableHead className="text-xs">Old MAC</TableHead>
                  <TableHead className="text-xs">New MAC</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Subscriber</TableHead>
                  <TableHead className="text-xs">Alert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestChanges.map((change) => (
                  <TableRow key={change.id} className={`hover:bg-muted/30 transition-colors ${change.isSuspicious ? "bg-red-50/30 dark:bg-red-950/5" : ""}`}>
                    <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(change.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell className="text-[10px] font-mono">{change.ipAddress}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{change.oldMac}</TableCell>
                    <TableCell className="text-[10px] font-mono">{change.newMac}</TableCell>
                    <TableCell className="text-[10px] hidden sm:table-cell">{change.subscriberCode}</TableCell>
                    <TableCell>{change.isSuspicious && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Spoofing Alerts Dialog */}
      <AlertDialog open={spoofOpen} onOpenChange={setSpoofOpen}>
        <AlertDialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-red-600" />Spoofing Detection Results</AlertDialogTitle>
            <AlertDialogDescription>{spoofAlerts.length} potential spoofing alert{spoofAlerts.length !== 1 ? "s" : ""} detected.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            {spoofAlerts.map((alert) => (
              <div key={alert.id} className={`p-3 rounded-lg border ${alert.severity === "HIGH" ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : alert.severity === "MEDIUM" ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getSeverityBadge(alert.severity)}
                      <span className="text-xs font-medium">{alert.ipAddress}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">({alert.macAddress})</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{alert.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">{alert.subscriberCode}</span>
                      <span>{alert.subscriberName}</span>
                      <span>{formatTimestamp(alert.detectedAt)}</span>
                    </div>
                  </div>
                  {alert.severity === "HIGH" && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={async () => {
              try {
                const res = await fetch("/api/ip-mac-history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "export-report", alerts: spoofAlerts }) });
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `spoof-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Alert report exported");
                } else {
                  toast.error("Failed to export report");
                }
              } catch {
                toast.error("Export failed — try again");
              }
              setSpoofOpen(false);
            }}>Export Report</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
