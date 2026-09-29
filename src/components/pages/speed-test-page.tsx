"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Gauge,
  ArrowDown,
  ArrowUp,
  Activity,
  Globe,
  Server,
  Clock,
  Network,
  Play,
  RotateCcw,
  ExternalLink,
  Wifi,
  Loader2,
  Zap,
  AlertCircle,
} from "lucide-react";

interface SpeedResult {
  ping: { jitter: number; latency: number; low: number; high: number } | null;
  download: { bandwidth: number; bytes: number; elapsed: number } | null;
  upload: { bandwidth: number; bytes: number; elapsed: number } | null;
  isp: string;
  server: { host: string; name: string; location: string } | null;
  interface: { internalIp: string; name: string; macAddr: string } | null;
  resultUrl: string;
  timestamp: string;
}

interface SpeedServer {
  id: number;
  name: string;
  location: string;
  host: string;
  sponsor: string;
}

function speedColor(mbps: number): string {
  if (mbps >= 50) return "text-emerald-600";
  if (mbps >= 10) return "text-amber-600";
  return "text-red-600";
}

function speedBg(mbps: number): string {
  if (mbps >= 50) return "bg-emerald-50 border-emerald-200";
  if (mbps >= 10) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + " MB";
  return (bytes / 1024).toFixed(2) + " KB";
}

export default function SpeedTestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [selectedServer, setSelectedServer] = useState<string>("auto");
  const [history, setHistory] = useState<SpeedResult[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("speedtest-history");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: serversData } = useQuery<{ servers: SpeedServer[] }>({
    queryKey: ["speedtest-servers"],
    queryFn: () => apiFetch("/api/speed-test?action=servers"),
    staleTime: 300000,
    retry: 1,
  });
  const servers = serversData?.servers || [];

  // Check binary status
  const { data: statusData } = useQuery<{ available: boolean }>({
    queryKey: ["speedtest-status"],
    queryFn: () => apiFetch("/api/speed-test"),
    staleTime: 60000,
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      setPhase("Installing Speedtest CLI...");
      return apiFetch<{ available: boolean; message: string }>("/api/speed-test?action=install");
    },
    onSuccess: (data) => {
      if (data.available) {
        toast({ title: "Installed", description: "Speedtest CLI is ready" });
        setPhase("");
      }
      return data;
    },
    onError: (err: Error) => {
      toast({ title: "Install Failed", description: err.message, variant: "destructive" });
      setPhase("");
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      setIsRunning(true);
      setElapsed(0);
      setProgress(0);
      setPhase("Preparing environment...");
      // Small delay to allow UI to update (binary may need auto-download)
      await new Promise((r) => setTimeout(r, 500));
      setPhase("Initializing...");
      // Start timer
      timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
      progressRef.current = setInterval(() => {
        setProgress((p) => {
          if (p < 90) return p + Math.random() * 2;
          return p;
        });
      }, 500);
      const body: Record<string, string> = { action: "run" };
      if (selectedServer !== "auto") body.serverId = selectedServer;
      // Simulate phase messages
      setTimeout(() => setPhase("Finding server..."), 2000);
      setTimeout(() => setPhase("Testing download..."), 5000);
      setTimeout(() => setPhase("Testing upload..."), 30000);
      const res = await apiFetch<SpeedResult>("/api/speed-test", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return res;
    },
    onSuccess: (data) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(100);
      setPhase("Complete!");
      setIsRunning(false);
      // Add to history
      const newHistory = [data, ...history].slice(0, 20);
      setHistory(newHistory);
      try { localStorage.setItem("speedtest-history", JSON.stringify(newHistory)); } catch {}
      toast({ title: "Speed Test Complete", description: `Download: ${data.download?.bandwidth.toFixed(1) ?? 0} Mbps` });
    },
    onError: (err: Error) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
      setIsRunning(false);
      setProgress(0);
      setPhase("");
      toast({ title: "Speed Test Failed", description: err.message, variant: "destructive" });
    },
  });

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem("speedtest-history"); } catch {}
    toast({ title: "History Cleared" });
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  const lastResult = history[0] || null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Speed Test"
        description="Run network speed tests using Ookla Speedtest CLI"
        icon={Gauge}
      />

      {/* Main Test Area */}
      <Card>
        <CardContent className="p-6">
          {!isRunning && !lastResult ? (
            statusData?.available === false ? (
              /* Not installed — show install prompt */
              <div className="flex flex-col items-center justify-center py-16 gap-6">
                <div className="rounded-full bg-amber-50 p-6">
                  <AlertCircle className="h-12 w-12 text-amber-600" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold">Speedtest CLI Not Installed</h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    The Ookla Speedtest CLI binary is not available. Click below to auto-download and install it (~1 MB).
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={() => installMutation.mutate()}
                  disabled={installMutation.isPending}
                  className="px-8 bg-amber-600 hover:bg-amber-700"
                >
                  {installMutation.isPending ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Installing...</>
                  ) : (
                    <><Wifi className="mr-2 h-5 w-5" /> Install Speedtest CLI</>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Phase: {phase || "Idle"}
                </p>
              </div>
            ) : (
            /* Start button */
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="rounded-full bg-red-50 p-6">
                <Zap className="h-12 w-12 text-red-600" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold">Ready to Test</h2>
                <p className="text-sm text-muted-foreground">Click below to start a speed test</p>
              </div>
              <div className="flex items-center gap-3">
                <Select value={selectedServer} onValueChange={setSelectedServer}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Auto select server" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Nearest Server)</SelectItem>
                    {(servers || []).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} — {s.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="lg"
                onClick={() => runMutation.mutate()}
                className="px-12 py-6 text-lg bg-red-600 hover:bg-red-700"
              >
                <Play className="mr-2 h-6 w-6" />
                Start Test
              </Button>
            </div>
            )
          ) : isRunning ? (
            /* Running state */
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="relative">
                <Loader2 className="h-16 w-16 text-red-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-muted-foreground">{Math.round(progress)}%</span>
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-medium">{phase}</p>
                <p className="text-2xl font-mono text-muted-foreground">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</p>
              </div>
              <Progress value={progress} className="w-80 h-2" />
            </div>
          ) : lastResult ? (
            /* Results display */
            <div className="space-y-6">
              {/* Speed Gauges */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Download */}
                <Card className={`border-2 ${speedBg(lastResult.download?.bandwidth ?? 0)}`}>
                  <CardContent className="p-6 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <ArrowDown className="h-5 w-5 text-emerald-600" />
                      <span className="text-sm font-medium text-muted-foreground">Download</span>
                    </div>
                    <p className={`text-5xl font-bold ${speedColor(lastResult.download?.bandwidth ?? 0)}`}>
                      {lastResult.download?.bandwidth.toFixed(1) ?? "—"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Mbps</p>
                    {lastResult.download && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatBytes(lastResult.download.bytes)} in {(lastResult.download.elapsed / 1000).toFixed(1)}s
                      </p>
                    )}
                  </CardContent>
                </Card>
                {/* Upload */}
                <Card className={`border-2 ${speedBg(lastResult.upload?.bandwidth ?? 0)}`}>
                  <CardContent className="p-6 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <ArrowUp className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-medium text-muted-foreground">Upload</span>
                    </div>
                    <p className={`text-5xl font-bold ${speedColor(lastResult.upload?.bandwidth ?? 0)}`}>
                      {lastResult.upload?.bandwidth.toFixed(1) ?? "—"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Mbps</p>
                    {lastResult.upload && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatBytes(lastResult.upload.bytes)} in {(lastResult.upload.elapsed / 1000).toFixed(1)}s
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Ping & Details Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <Activity className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{lastResult.ping?.latency.toFixed(1) ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">Latency (ms)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Activity className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{lastResult.ping?.jitter.toFixed(2) ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">Jitter (ms)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Globe className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-lg font-bold">{lastResult.isp || "—"}</p>
                    <p className="text-xs text-muted-foreground">ISP</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm font-medium">{lastResult.timestamp ? new Date(lastResult.timestamp).toLocaleString() : "—"}</p>
                    <p className="text-xs text-muted-foreground">Timestamp</p>
                  </CardContent>
                </Card>
              </div>

              {/* Server & Interface Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lastResult.server && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Server className="h-4 w-4" /> Server Info
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">Name:</span> {lastResult.server.name}</p>
                      <p><span className="text-muted-foreground">Location:</span> {lastResult.server.location}</p>
                      <p><span className="text-muted-foreground">Host:</span> {lastResult.server.host}</p>
                    </CardContent>
                  </Card>
                )}
                {lastResult.interface && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Network className="h-4 w-4" /> Interface Info
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">Internal IP:</span> {lastResult.interface.internalIp}</p>
                      <p><span className="text-muted-foreground">Interface:</span> {lastResult.interface.name}</p>
                      <p><span className="text-muted-foreground">MAC:</span> {lastResult.interface.macAddr}</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button onClick={() => runMutation.mutate()} disabled={isRunning} className="bg-red-600 hover:bg-red-700">
                  <RotateCcw className="mr-2 h-4 w-4" /> Test Again
                </Button>
                {lastResult.resultUrl && (
                  <Button variant="outline" asChild>
                    <a href={lastResult.resultUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" /> View on Speedtest.net
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Recent Tests ({history.length})
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={clearHistory}>
              Clear History
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <div className="divide-y">
                {history.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <ArrowDown className={`h-4 w-4 ${speedColor(r.download?.bandwidth ?? 0)}`} />
                        <span className={`font-semibold ${speedColor(r.download?.bandwidth ?? 0)}`}>
                          {r.download?.bandwidth.toFixed(1) ?? 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ArrowUp className="h-4 w-4 text-blue-500" />
                        <span className="font-semibold text-blue-600">
                          {r.upload?.bandwidth.toFixed(1) ?? 0}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">Mbps</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Ping: {r.ping?.latency.toFixed(1) ?? "—"} ms</span>
                      <span>{r.server?.name ?? "—"}</span>
                      <span>{r.timestamp ? new Date(r.timestamp).toLocaleString() : ""}</span>
                      {r.resultUrl && (
                        <a href={r.resultUrl} target="_blank" rel="noopener noreferrer" className="text-red-500 hover:text-red-600">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
