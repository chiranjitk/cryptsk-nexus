"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Wifi, Clock, Download, Upload, Server,
  Activity, Zap, RefreshCw, MoreHorizontal, Power,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type Session = {
  radacctid: string; acctsessionid: string; username: string;
  groupname: string; nasipaddress: string; nasportid: string;
  framedipaddress: string; callingstationid: string;
  acctstarttime: string; acctsessiontime: number;
  acctinputoctets: number; acctoutputoctets: number;
  status: string;
};

export function SessionsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [activeOnly, setActiveOnly] = React.useState(true);
  const [page, setPage] = React.useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", search, activeOnly, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (activeOnly) params.set("active", "true");
      if (search) params.set("search", search);
      const res = await fetch(`/api/sessions?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 5000, // auto-refresh every 5s
  });

  const { data: statsData } = useQuery({
    queryKey: ["session-stats"],
    queryFn: async () => {
      const res = await fetch("http://localhost:3010/stats");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 5000,
  });

  const terminateSession = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`http://localhost:3010/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Session termination requested" });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const sessions: Session[] = data?.sessions || [];
  const total = data?.total || 0;

  function fmtDuration(seconds: number) {
    if (!seconds) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function fmtBytes(bytes: number) {
    if (!bytes || bytes === 0) return "0 B";
    const gb = bytes / (1024 ** 3);
    const mb = bytes / (1024 ** 2);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${mb.toFixed(0)} MB`;
  }

  // Stats cards
  const activeCount = statsData?.activeCount || 0;
  const totalInput = statsData?.totalInputGB || "0";
  const totalOutput = statsData?.totalOutputGB || "0";
  const byNas = statsData?.byNas || {};
  const byGroup = statsData?.byGroup || {};

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Sessions</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} active · Session Engine on :3010 · auto-refresh 5s
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeOnly ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => { setActiveOnly(!activeOnly); setPage(1); }}
          >
            <Wifi className="size-4" /> {activeOnly ? "Active Only" : "All Sessions"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => qc.invalidateQueries({ queryKey: ["sessions"] })}
          >
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-lift cryptsk-card-load">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Sessions</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Activity className="size-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{activeCount}</div>
            <p className="text-xs text-muted-foreground mt-1">live now</p>
          </CardContent>
        </Card>

        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "50ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Download</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Download className="size-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{totalOutput} GB</div>
            <p className="text-xs text-muted-foreground mt-1">to subscribers</p>
          </CardContent>
        </Card>

        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "100ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Upload</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Upload className="size-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{totalInput} GB</div>
            <p className="text-xs text-muted-foreground mt-1">from subscribers</p>
          </CardContent>
        </Card>

        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "150ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">NAS Devices</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10">
              <Server className="size-4 text-violet-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{Object.keys(byNas).length}</div>
            <p className="text-xs text-muted-foreground mt-1">serving sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Sessions table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              Live Sessions ({total})
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by user, IP, MAC…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-9 w-64 pl-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="size-6 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>NAS IP</TableHead>
                    <TableHead>Client IP</TableHead>
                    <TableHead>MAC</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Download</TableHead>
                    <TableHead>Upload</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.radacctid} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-bold">
                              {(s.username || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-mono">{s.username || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-violet-600">{s.groupname || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{s.nasipaddress}</TableCell>
                      <TableCell className="text-xs font-mono text-blue-600">{s.framedipaddress || "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{s.callingstationid || "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        <Clock className="inline size-3 mr-1 text-muted-foreground" />
                        {fmtDuration(s.acctsessiontime)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        <Download className="inline size-3 mr-1 text-emerald-500" />
                        {fmtBytes(s.acctoutputoctets)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        <Upload className="inline size-3 mr-1 text-blue-500" />
                        {fmtBytes(s.acctinputoctets)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {s.acctstarttime ? new Date(s.acctstarttime).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </TableCell>
                      <TableCell>
                        {s.status === "active" ? (
                          <Badge variant="outline" className="text-[9px] border-emerald-500/30 bg-emerald-500/5 text-emerald-600">
                            <div className="size-1.5 rounded-full bg-emerald-500 mr-1 cryptsk-pulse-dot" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] border-muted text-muted-foreground">Stopped</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuItem>Send CoA</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-rose-600 focus:text-rose-600 focus:bg-rose-500/10"
                              onClick={() => {
                                if (confirm(`Disconnect session for ${s.username}?`)) terminateSession.mutate(s.radacctid);
                              }}
                            >
                              <Power className="mr-2 size-4" /> Disconnect
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {sessions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                        No live sessions found. FreeRADIUS accounting will populate the radacct table when subscribers connect.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* By NAS + By Group breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="size-4 text-violet-500" /> Sessions by NAS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byNas).map(([nas, count]) => {
              const pct = activeCount > 0 ? (count / activeCount) * 100 : 0;
              return (
                <div key={nas} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-mono">{nas}</span>
                    <span className="tabular-nums font-medium">{count}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })}
            {Object.keys(byNas).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No NAS data yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="size-4 text-blue-500" /> Sessions by Plan/Group
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byGroup).map(([group, count]) => {
              const pct = activeCount > 0 ? (count / activeCount) * 100 : 0;
              return (
                <div key={group} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-mono text-violet-600">{group}</span>
                    <span className="tabular-nums font-medium">{count}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })}
            {Object.keys(byGroup).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No group data yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
