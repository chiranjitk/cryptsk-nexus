"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Server, Network, Zap, Activity, RefreshCw, Cpu, HardDrive,
  AlertCircle, CheckCircle2, FileCode, Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export function VppPanel() {
  const { toast } = useToast();
  const [config, setConfig] = React.useState<string>("");
  const [generating, setGenerating] = React.useState(false);

  // Health check (auto-refresh)
  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ["vpp-health"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=health");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Generate config on load + on button click
  const generateConfig = React.useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/vpp?action=config");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setConfig(data.config || "");
      toast({ title: "VPP config generated", description: `${data.configsGenerated} configs generated` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }, [toast]);

  React.useEffect(() => { generateConfig(); }, [generateConfig]);

  // Parse config for summary
  const configLines = config.split("\n");
  const nasCount = (config.match(/set interface state/g) || []).length;
  const natCount = (config.match(/nat44 add/g) || []).length;
  const aclCount = (config.match(/acl add/g) || []).length;
  const qosCount = (config.match(/policer add/g) || []).length;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">VPP Gateway</h1>
          <p className="text-sm text-muted-foreground">
            DPDK/VPP dataplane — config generator + GoVPP adapter
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={generateConfig}
            disabled={generating}
          >
            <RefreshCw className={`size-4 ${generating ? "cryptsk-spin" : ""}`} />
            {generating ? "Generating…" : "Regenerate"}
          </Button>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-lift cryptsk-card-load">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">VPP Status</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
              <Server className="size-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {healthLoading ? "…" : health?.vppConnected ? "Connected" : "Not Running"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {health?.message || "VPP binary not installed"}
            </p>
          </CardContent>
        </Card>

        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "50ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">NAS Interfaces</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10">
              <Network className="size-4 text-violet-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{nasCount}</div>
            <p className="text-xs text-muted-foreground mt-1">interfaces configured</p>
          </CardContent>
        </Card>

        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "100ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">NAT Entries</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Activity className="size-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{natCount}</div>
            <p className="text-xs text-muted-foreground mt-1">subscriber NAT rules</p>
          </CardContent>
        </Card>

        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "150ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">QoS Policers</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Zap className="size-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{qosCount}</div>
            <p className="text-xs text-muted-foreground mt-1">bandwidth policers</p>
          </CardContent>
        </Card>
      </div>

      {/* Config + Summary split */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Config text (2/3 width) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileCode className="size-4 text-primary" />
                Generated VPP Config
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                {configLines.length} lines
              </Badge>
            </div>
            <CardDescription>Auto-generated from OSS/BSS state (subscribers, policies, NAS)</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted/50 rounded-lg p-4 overflow-auto max-h-[500px] cryptsk-scrollbar whitespace-pre-wrap break-all">
              {config || "Click 'Regenerate' to generate VPP config…"}
            </pre>
          </CardContent>
        </Card>

        {/* Summary (1/3 width) */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dataplane Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Network className="size-3.5" /> NAS Interfaces</span>
                <span className="font-bold tabular-nums">{nasCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Activity className="size-3.5" /> NAT Entries</span>
                <span className="font-bold tabular-nums">{natCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Shield className="size-3.5" /> ACL Rules</span>
                <span className="font-bold tabular-nums">{aclCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Zap className="size-3.5" /> QoS Policers</span>
                <span className="font-bold tabular-nums">{qosCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">VPP Adapter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Cpu className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Port:</span>
                <Badge variant="secondary" className="text-[10px]">3015</Badge>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <HardDrive className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Uptime:</span>
                <span className="font-mono text-xs">{health?.uptime ? `${Math.floor(health.uptime / 60)}m` : "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <FileCode className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Configs:</span>
                <span className="font-mono text-xs">{health?.stats?.configsGenerated || 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="size-4 text-amber-500" />
                Production Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-[11px] text-muted-foreground space-y-1.5">
                <li>• VPP binary requires DPDK + hugepages</li>
                <li>• NIC must be bound to uio_pci_generic</li>
                <li>• CPU isolation (isolcpus) recommended</li>
                <li>• Go GoVPP adapter replaces TypeScript in prod</li>
                <li>• Binary API socket: /run/vpp/api.sock</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
