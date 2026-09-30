"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, Server, Network, Zap, CheckCircle2, XCircle,
  RefreshCw, Cpu, HardDrive, Settings, AlertTriangle
} from "lucide-react";

export default function VPPGatewayPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const healthQuery = useQuery({
    queryKey: ["vpp-health"],
    queryFn: async () => {
      const res = await fetch("http://127.0.0.1:3015/health");
      if (!res.ok) throw new Error("VPP adapter unavailable");
      return res.json();
    },
    refetchInterval: autoRefresh ? 5000 : false,
    retry: 1,
  });

  const interfacesQuery = useQuery({
    queryKey: ["vpp-interfaces"],
    queryFn: async () => {
      const res = await fetch("http://127.0.0.1:3015/interfaces");
      if (!res.ok) throw new Error("VPP interfaces unavailable");
      return res.json();
    },
    refetchInterval: autoRefresh ? 10000 : false,
    retry: 1,
  });

  const configQuery = useQuery({
    queryKey: ["vpp-config"],
    queryFn: async () => {
      const res = await fetch("http://127.0.0.1:3015/config/generate");
      if (!res.ok) throw new Error("VPP config unavailable");
      return res.json();
    },
    refetchInterval: false,
    retry: 1,
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("http://127.0.0.1:3015/reconcile", { method: "POST" });
      return res.json();
    },
  });

  const health = healthQuery.data;
  const interfaces = interfacesQuery.data?.interfaces || [];
  const configText = configQuery.data?.config || "";

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            VPP Gateway
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            VPP v26.06 + DPDK dataplane status, interfaces, and config
          </p>
        </div>
        <Button
          variant={autoRefresh ? "default" : "outline"}
          size="sm"
          onClick={() => setAutoRefresh(!autoRefresh)}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
          {autoRefresh ? "Auto ON" : "Auto OFF"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" />Status</CardTitle></CardHeader>
          <CardContent>
            {health ? (
              <div className="space-y-1">
                <div className="text-xl font-bold capitalize">{health.status}</div>
                <Badge variant={health.vppConnected ? "default" : "destructive"} className="text-xs">{health.vppConnected ? "VPP Connected" : "VPP Disconnected"}</Badge>
              </div>
            ) : <Skeleton className="h-12 w-full" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-4 w-4 text-blue-500" />Uptime</CardTitle></CardHeader>
          <CardContent>
            {health ? <div className="text-xl font-bold">{health.uptime}s</div> : <Skeleton className="h-12 w-full" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Network className="h-4 w-4 text-purple-500" />Interfaces</CardTitle></CardHeader>
          <CardContent>
            {health ? <div className="text-xl font-bold">{health.interfaces || interfaces.length}</div> : <Skeleton className="h-12 w-full" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" />Configs Gen</CardTitle></CardHeader>
          <CardContent>
            {health?.stats ? <div className="text-xl font-bold">{health.stats.configsGenerated || 0}</div> : <Skeleton className="h-12 w-full" />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />VPP Interfaces</CardTitle>
        </CardHeader>
        <CardContent>
          {interfacesQuery.isLoading ? <Skeleton className="h-20 w-full" /> : interfaces.length > 0 ? (
            <div className="space-y-2">
              {interfaces.map((iface, i) => (
                <div key={i} className="flex items-center justify-between border rounded p-3">
                  <div>
                    <span className="font-mono font-medium">{iface.name || iface.dev_name}</span>
                    {iface.mac && <span className="text-xs text-muted-foreground ml-2">{iface.mac}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={iface.state === "up" || iface.link === "up" ? "default" : "secondary"}>{iface.state || iface.link || "?"}</Badge>
                    <span className="text-xs text-muted-foreground">{iface.speed || ""} {iface.driver || ""}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              No VPP interfaces data (VPP adapter may be in config-generation mode)
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-primary" />Generated VPP Config</CardTitle>
          </CardHeader>
          <CardContent>
            {configQuery.isLoading ? <Skeleton className="h-48 w-full" /> : (
              <pre className="text-xs bg-muted/50 p-3 rounded overflow-auto max-h-96 cryptsk-scrollbar whitespace-pre-wrap">{configText || "No config generated"}</pre>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-primary" />Dataplane Reconciliation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Force VPP config regeneration from OSS/BSS state (subscribers, policies, NAS).
            </p>
            <Button
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {reconcileMutation.isPending ? "Reconciling..." : "Reconcile Now"}
            </Button>
            {reconcileMutation.data && (
              <div className="mt-3 text-sm">
                <Badge variant="default">Success</Badge>
                <pre className="mt-2 text-xs bg-muted/50 p-2 rounded">{JSON.stringify(reconcileMutation.data, null, 2)}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
