"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSubscriberAuthStore, type ServiceStatus } from "@/store/subscriber-auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Wifi,
  WifiOff,
  Globe,
  Clock,
  Router,
  Server,
  Shield,
  RefreshCw,
  AlertTriangle,
  Zap,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Settings,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Gradient Icon Circle ───────────────────────────────────

function GradientIcon({ icon: Icon, from, to }: { icon: React.ElementType; from?: string; to?: string }) {
  return (
    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${from || "from-red-500"} ${to || "to-red-700"} flex items-center justify-center flex-shrink-0`}>
      <Icon className="w-3.5 h-3.5 text-white" />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "N/A";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return "N/A";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ─── Data Hook ────────────────────────────────────────────────

function useServiceStatus() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriber-auth/service-status");
      const data = await res.json();
      if (data.success) {
        // Map nested API response to flat ServiceStatus interface
        const s = data.service;
        const mapped: ServiceStatus = {
          connectionType: s.connectionType || s.ipConfiguration?.type || "N/A",
          ipType: s.ipConfiguration?.type || "Dynamic",
          ipAddress: s.ipConfiguration?.address || "N/A",
          gateway: undefined,
          macAddress: s.ipConfiguration?.macAddress || "N/A",
          dnsServers: undefined,
          mtu: undefined,
          lastAuthAt: s.authentication?.lastAuthAt,
          lastAuthResult: s.authentication?.lastAuthResult || "N/A",
          sessionDuration: undefined,
          sessionTimeout: s.authentication?.sessionTimeout,
          idleTimeout: s.authentication?.idleTimeout,
          routerRented: s.equipment?.routerRented || false,
          routerSerial: s.equipment?.routerSerial || "N/A",
          routerDeposit: s.equipment?.routerDeposit || 0,
          status: s.isOnline ? "ONLINE" : "OFFLINE",
        };
        setStatus(mapped);
      } else {
        setError(data.error || "Failed to fetch service status");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { status, loading, error, refetch: fetchData };
}

// ─── Skeleton ─────────────────────────────────────────────────

function ServiceSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

// ─── Connection Status Banner ─────────────────────────────────

function ConnectionBanner({ status }: { status: ServiceStatus }) {
  const isOnline = status.status === "ONLINE";
  const isUnknown = status.status === "UNKNOWN";

  return (
    <Card
      className={`rounded-xl border-0 overflow-hidden relative ${
        isOnline
          ? "bg-gradient-to-r from-red-600 via-red-700 to-red-800 text-white"
          : isUnknown
            ? "bg-gradient-to-r from-slate-600 via-slate-700 to-slate-800 text-white"
            : "bg-gradient-to-r from-red-600 via-red-700 to-rose-800 text-white"
      }`}
    >
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-white/5 rounded-full translate-y-1/2" />

      <CardContent className="py-8 px-6 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                  isOnline
                    ? "bg-white/20"
                    : isUnknown
                      ? "bg-white/15"
                      : "bg-white/15"
                }`}
              >
                {isOnline ? (
                  <Wifi className="w-8 h-8 text-white" />
                ) : (
                  <WifiOff className="w-8 h-8 text-white" />
                )}
              </div>
              {isOnline && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-300 animate-pulse border-2 border-red-600" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">
                {isOnline ? "Connection Online" : isUnknown ? "Status Unknown" : "Connection Offline"}
              </h2>
              <p className="text-sm text-white/80 mt-0.5">
                {isOnline
                  ? `Uptime: ${formatUptime(status.uptime || 0)}`
                  : isUnknown
                    ? "Could not determine connection status"
                    : `Last seen: ${formatDateTime(status.lastAuthAt)}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOnline ? (
              <Badge className="bg-red-400/20 text-red-100 border-0 text-xs font-medium px-3 py-1">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Online
              </Badge>
            ) : isUnknown ? (
              <Badge className="bg-white/15 text-white/80 border-0 text-xs font-medium px-3 py-1">
                <HelpCircle className="w-3.5 h-3.5 mr-1" />
                Unknown
              </Badge>
            ) : (
              <Badge className="bg-red-400/20 text-red-100 border-0 text-xs font-medium px-3 py-1">
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Offline
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Info Row ─────────────────────────────────────────────────

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground flex items-center gap-1.5">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

// ─── Speed Test Dialog ──────────────────────────────────────

type SpeedTestPhase = "idle" | "ping" | "download" | "upload" | "done";

// Real network measurement helpers
async function measurePing(samples = 5): Promise<number> {
  const latencies: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await fetch("/api/subscriber-auth/speed-test?type=ping&_=" + Date.now() + Math.random(), {
      cache: "no-store",
    });
    const end = performance.now();
    latencies.push(end - start);
  }
  // Discard highest and lowest, average the rest
  latencies.sort((a, b) => a - b);
  if (latencies.length <= 2) return Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);
  const trimmed = latencies.slice(1, -1);
  return Math.round(trimmed.reduce((s, v) => s + v, 0) / trimmed.length);
}

async function measureDownload(onProgress: (mbps: number) => void, abortSignal: AbortSignal): Promise<number> {
  // Run 3 rounds of increasing size for better accuracy
  const sizes = [512 * 1024, 1024 * 1024, 2 * 1024 * 1024]; // 512KB, 1MB, 2MB
  const speeds: number[] = [];

  for (const size of sizes) {
    if (abortSignal.aborted) break;
    const start = performance.now();
    const res = await fetch(`/api/subscriber-auth/speed-test?type=download&size=${size}&_=${Date.now()}`, {
      cache: "no-store",
      signal: abortSignal,
    });
    const buf = await res.arrayBuffer();
    const end = performance.now();
    const durationSec = (end - start) / 1000;
    const bitsPerSec = (buf.byteLength * 8) / durationSec;
    const mbps = bitsPerSec / 1_000_000;
    speeds.push(mbps);
    onProgress(Math.round(mbps));
  }

  if (speeds.length === 0) return 0;
  // Return the average of the two largest measurements (discard worst)
  speeds.sort((a, b) => b - a);
  const top = speeds.slice(0, Math.max(1, Math.ceil(speeds.length * 0.67)));
  return Math.round(top.reduce((s, v) => s + v, 0) / top.length);
}

async function measureUpload(onProgress: (mbps: number) => void, abortSignal: AbortSignal): Promise<number> {
  // Run 3 rounds of increasing payload
  const sizes = [256 * 1024, 512 * 1024, 1024 * 1024]; // 256KB, 512KB, 1MB
  const speeds: number[] = [];

  for (const size of sizes) {
    if (abortSignal.aborted) break;
    const payload = new Uint8Array(size);
    // Fill with pseudo-random data in chunks (getRandomValues max is 65536 bytes)
    const rndChunk = new Uint8Array(65536);
    crypto.getRandomValues(rndChunk);
    for (let i = 0; i < size; i += 65536) {
      const len = Math.min(65536, size - i);
      payload.set(rndChunk.subarray(0, len), i);
    }

    const start = performance.now();
    await fetch("/api/subscriber-auth/speed-test", {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/octet-stream" },
      signal: abortSignal,
    });
    const end = performance.now();
    const durationSec = (end - start) / 1000;
    const bitsPerSec = (size * 8) / durationSec;
    const mbps = bitsPerSec / 1_000_000;
    speeds.push(mbps);
    onProgress(Math.round(mbps));
  }

  if (speeds.length === 0) return 0;
  speeds.sort((a, b) => b - a);
  const top = speeds.slice(0, Math.max(1, Math.ceil(speeds.length * 0.67)));
  return Math.round(top.reduce((s, v) => s + v, 0) / top.length);
}

function SpeedTestDialog({
  open,
  onOpenChange,
  planSpeedDown,
  planSpeedUp,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planSpeedDown: number;
  planSpeedUp: number;
}) {
  const [phase, setPhase] = useState<SpeedTestPhase>("idle");
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [pingMs, setPingMs] = useState(0);
  const [displayValue, setDisplayValue] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runTest = useCallback(async () => {
    setPhase("ping");
    setDownloadSpeed(0);
    setUploadSpeed(0);
    setPingMs(0);
    setDisplayValue(0);
    setErrorMsg(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // 1. Ping test first (fastest)
      setDisplayValue(0);
      const ping = await measurePing(5);
      if (abort.signal.aborted) return;
      setPingMs(ping);
      setDisplayValue(ping);

      // 2. Download test
      setPhase("download");
      const dlSpeed = await measureDownload((mbps) => {
        if (!abort.signal.aborted) setDisplayValue(mbps);
      }, abort.signal);
      if (abort.signal.aborted) return;
      setDownloadSpeed(dlSpeed);
      setDisplayValue(dlSpeed);

      // 3. Upload test
      setPhase("upload");
      const ulSpeed = await measureUpload((mbps) => {
        if (!abort.signal.aborted) setDisplayValue(mbps);
      }, abort.signal);
      if (abort.signal.aborted) return;
      setUploadSpeed(ulSpeed);
      setDisplayValue(ulSpeed);

      setPhase("done");
    } catch (err) {
      if (abort.signal.aborted) return;
      // logger
      setErrorMsg(err instanceof DOMException ? "Test cancelled" : "Speed test failed. Please try again.");
      setPhase("idle");
    } finally {
      abortRef.current = null;
    }
  }, []);

  // Cleanup on close
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setPhase("idle");
      setErrorMsg(null);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const isRunning = phase === "ping" || phase === "download" || phase === "upload";
  const phaseLabel =
    phase === "ping" ? "Measuring Latency…"
    : phase === "download" ? "Testing Download Speed…"
    : phase === "upload" ? "Testing Upload Speed…"
    : phase === "done" ? "Test Complete"
    : "Ready";

  const downRatio = planSpeedDown > 0 ? downloadSpeed / planSpeedDown : 0;
  const upRatio = planSpeedUp > 0 ? uploadSpeed / planSpeedUp : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isRunning) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-red-500" />
            Speed Test
          </DialogTitle>
          <DialogDescription>
            Measures your connection speed against your plan limits
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Big speed gauge */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {phaseLabel}
            </p>
            <div className="relative flex items-center justify-center w-44 h-44">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle
                  cx="80" cy="80" r="70"
                  fill="none" stroke="currentColor"
                  strokeWidth="8"
                  className="text-muted/20"
                />
                {phase !== "idle" && (
                  <circle
                    cx="80" cy="80" r="70"
                    fill="none"
                    stroke={
                      phase === "ping"
                        ? "#64748b"
                        : phase === "download"
                          ? "#ef4444"
                          : phase === "upload"
                            ? "#f97316"
                            : downRatio >= 0.8
                              ? "#10b981"
                              : "#ef4444"
                    }
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 70}
                    strokeDashoffset={
                      phase === "done"
                        ? 2 * Math.PI * 70 - (Math.min(downRatio, 1) * 2 * Math.PI * 70)
                        : isRunning && phase !== "ping"
                          ? 2 * Math.PI * 70 - (Math.min(displayValue / Math.max(planSpeedDown, 1), 1) * 2 * Math.PI * 70)
                          : phase === "ping" && displayValue > 0
                            ? 2 * Math.PI * 70 - (Math.min(displayValue / 50, 1) * 2 * Math.PI * 70)
                            : 2 * Math.PI * 70
                    }
                    className="transition-all duration-200"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {isRunning ? (
                  <>
                    <span className="text-4xl font-bold text-foreground tabular-nums">
                      {displayValue}
                    </span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {phase === "ping" ? "ms" : "Mbps"}
                    </span>
                  </>
                ) : phase === "done" ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-1" />
                    <span className="text-sm font-semibold text-foreground">Complete</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-8 h-8 text-muted-foreground/40 mb-1" />
                    <span className="text-sm text-muted-foreground">Tap Start</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          {(phase === "done" || downloadSpeed > 0) && (
            <div className="grid grid-cols-3 gap-3">
              {/* Download */}
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <ArrowDownToLine className="w-4 h-4 mx-auto mb-1 text-red-500" />
                <p className="text-lg font-bold text-foreground tabular-nums">
                  {phase === "done" ? downloadSpeed : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">Mbps ↓</p>
                {phase === "done" && (
                  <p className={`text-[10px] mt-0.5 font-medium ${downRatio >= 0.8 ? "text-emerald-600" : "text-amber-600"}`}>
                    {Math.round(downRatio * 100)}% of plan
                  </p>
                )}
              </div>
              {/* Upload */}
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <ArrowUpFromLine className="w-4 h-4 mx-auto mb-1 text-red-400" />
                <p className="text-lg font-bold text-foreground tabular-nums">
                  {phase === "done" ? uploadSpeed : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">Mbps ↑</p>
                {phase === "done" && (
                  <p className={`text-[10px] mt-0.5 font-medium ${upRatio >= 0.8 ? "text-emerald-600" : "text-amber-600"}`}>
                    {Math.round(upRatio * 100)}% of plan
                  </p>
                )}
              </div>
              {/* Ping */}
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <Globe className="w-4 h-4 mx-auto mb-1 text-slate-500" />
                <p className="text-lg font-bold text-foreground tabular-nums">
                  {phase === "done" ? pingMs : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">ms ping</p>
                {phase === "done" && (
                  <p className={`text-[10px] mt-0.5 font-medium ${pingMs <= 15 ? "text-emerald-600" : pingMs <= 25 ? "text-amber-600" : "text-red-600"}`}>
                    {pingMs <= 15 ? "Excellent" : pingMs <= 25 ? "Good" : "Fair"}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Plan comparison note */}
          <p className="text-[11px] text-center text-muted-foreground">
            Plan speed: ↓ {planSpeedDown} / ↑ {planSpeedUp} Mbps
          </p>
        </div>

          {/* Error message */}
          {errorMsg && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {errorMsg}
              </p>
            </div>
          )}

        <DialogFooter>
          {phase === "idle" ? (
            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              onClick={runTest}
            >
              <Zap className="w-4 h-4 mr-1.5" />
              Start Speed Test
            </Button>
          ) : phase === "done" ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                if (abortRef.current) abortRef.current.abort();
              }}
            >
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              {phaseLabel}
              <span className="ml-1.5 text-muted-foreground text-xs">(tap to cancel)</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Report Issue Dialog ──────────────────────────────────────

function ReportIssueDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error("Description required", {
        description: "Please describe the issue you are experiencing.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/subscriber-auth/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "NO_INTERNET",
          priority: "P3_MEDIUM",
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Issue reported", {
          description: `Ticket ${data.complaint.ticketNumber} created. Our team will look into it.`,
        });
        setDescription("");
        onOpenChange(false);
      } else {
        toast.error("Failed to submit", { description: data.error || "Please try again." });
      }
    } catch {
      toast.error("Network error", { description: "Could not reach the server." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Report an Issue
          </DialogTitle>
          <DialogDescription>
            Describe the problem you are facing. A support ticket will be created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="issue-desc" className="text-xs font-medium uppercase tracking-wider">
              Issue Description
            </Label>
            <Textarea
              id="issue-desc"
              placeholder="e.g. Internet is very slow since yesterday evening, pages take a long time to load…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none"
              disabled={submitting}
            />
            <p className="text-[11px] text-muted-foreground">
              {description.length}/5000 characters
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || submitting}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 mr-1.5" />
                Submit Ticket
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Troubleshooting Checklist ────────────────────────────────

const TROUBLESHOOT_STEPS = [
  { label: "Check router power — ensure all lights are on" },
  { label: "Check WAN cable is connected properly" },
  { label: "Restart router — unplug for 30 seconds, then reconnect" },
  { label: "Check signal strength (for wireless connections)" },
  { label: "Try connecting with an ethernet cable directly" },
];

function TroubleshootingSection({
  planSpeedDown,
  planSpeedUp,
}: {
  planSpeedDown: number;
  planSpeedUp: number;
}) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [speedTestOpen, setSpeedTestOpen] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);

  const toggleCheck = (idx: number) => {
    setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const allChecked = TROUBLESHOOT_STEPS.every((_, i) => checked[i]);

  return (
    <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <GradientIcon icon={Settings} from="from-slate-400" to="to-slate-500" />
          Troubleshooting
        </CardTitle>
        <CardDescription>
          Follow these steps if you&apos;re experiencing issues
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {TROUBLESHOOT_STEPS.map((step, i) => (
            <button
              key={i}
              onClick={() => toggleCheck(i)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
            >
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  checked[i]
                    ? "bg-red-500 border-red-500 text-white"
                    : "border-muted-foreground/30"
                }`}
              >
                {checked[i] && (
                  <CheckCircle2 className="w-3 h-3" />
                )}
              </div>
              <span
                className={`text-sm transition-colors ${
                  checked[i]
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                }`}
              >
                {step.label}
              </span>
            </button>
          ))}
        </div>

        <Separator />

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => setSpeedTestOpen(true)}
          >
            <Zap className="w-4 h-4 text-red-600" />
            Run Speed Test
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => setReportIssueOpen(true)}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Report Issue
          </Button>
        </div>

        {allChecked && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
            <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              All troubleshooting steps completed. If the issue persists, please raise a complaint or contact support.
            </p>
          </div>
        )}
      </CardContent>

      <SpeedTestDialog
        open={speedTestOpen}
        onOpenChange={setSpeedTestOpen}
        planSpeedDown={planSpeedDown}
        planSpeedUp={planSpeedUp}
      />
      <ReportIssueDialog
        open={reportIssueOpen}
        onOpenChange={setReportIssueOpen}
      />
    </Card>
  );
}

export default function SelfcareServices() {
  const { status, loading, error, refetch } = useServiceStatus();
  const { subscriber } = useSubscriberAuthStore();

  if (loading) return <ServiceSkeleton />;
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={refetch} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        No service status data available.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GradientIcon icon={Wifi} from="from-red-500" to="to-red-700" />
            Service Status
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor your connection and service details
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-1.5 border-border/50 bg-background hover:bg-muted/50">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Connection Banner */}
      <ConnectionBanner status={status} />

      {/* Service Details + Authentication */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Service Details */}
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GradientIcon icon={Globe} from="from-red-500" to="to-cyan-600" />
              Service Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              label="Connection Type"
              value={status.connectionType || "N/A"}
            />
            <Separator />
            <InfoRow
              label="Current Plan"
              value={
                subscriber?.plan
                  ? `${subscriber.plan.name} (↓${subscriber.plan.speedDown} / ↑${subscriber.plan.speedUp} Mbps)`
                  : "N/A"
              }
            />
            <Separator />
            <InfoRow label="IP Configuration" value={status.ipType || "Dynamic"} />
            <Separator />
            <InfoRow label="IP Address" value={status.ipAddress || "N/A"} />
            <Separator />
            <InfoRow label="Gateway" value={status.gateway || "N/A"} />
            <Separator />
            <InfoRow label="MAC Address" value={status.macAddress || "N/A"} />
            <Separator />
            <InfoRow
              label="DNS Servers"
              value={
                status.dnsServers && status.dnsServers.length > 0
                  ? status.dnsServers.join(", ")
                  : "Default"
              }
            />
            <Separator />
            <InfoRow
              label="MTU"
              value={status.mtu ? `${status.mtu}` : "Default (1500)"}
            />
          </CardContent>
        </Card>

        {/* Authentication Info */}
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GradientIcon icon={Shield} from="from-violet-500" to="to-purple-600" />
              Authentication Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              label="Last Authentication"
              value={formatDateTime(status.lastAuthAt)}
            />
            <Separator />
            <InfoRow
              label="Last Auth Result"
              value={status.lastAuthResult || "N/A"}
            />
            <Separator />
            <InfoRow
              label="Session Duration"
              value={formatDuration(status.sessionDuration || 0)}
            />
            <Separator />
            <InfoRow
              label="Session Timeout"
              value={status.sessionTimeout ? `${formatDuration(status.sessionTimeout)}` : "Default"}
            />
            <Separator />
            <InfoRow
              label="Idle Timeout"
              value={status.idleTimeout ? `${formatDuration(status.idleTimeout)}` : "Default"}
            />
            <Separator />
            <InfoRow
              label="RADIUS Enabled"
              value={subscriber?.radiusEnabled ? "Yes" : "No"}
            />
          </CardContent>
        </Card>
      </div>

      {/* Equipment Info */}
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GradientIcon icon={Router} from="from-amber-500" to="to-orange-600" />
            Equipment Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow
            label="Router Provided"
            value={status.routerRented ? "Yes (Rented)" : "No"}
          />
          <Separator />
          <InfoRow
            label="Router Serial"
            value={status.routerSerial || "N/A"}
          />
          <Separator />
          <InfoRow
            label="Router Deposit"
            value={
              status.routerDeposit
                ? `₹${status.routerDeposit.toLocaleString("en-IN")}`
                : "N/A"
            }
          />
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <TroubleshootingSection
        planSpeedDown={subscriber?.plan?.speedDown || 50}
        planSpeedUp={subscriber?.plan?.speedUp || 50}
      />
    </div>
  );
}
