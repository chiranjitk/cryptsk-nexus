"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Server,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Pause,
  Search,
  Radio,
  Terminal,
  Filter,
} from "lucide-react";

interface SyslogMsg {
  id: string;
  timestamp: string;
  facility: string;
  severity: string;
  hostname: string;
  appname: string | null;
  procid: string | null;
  message: string;
  source: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  emerg: "text-red-600 bg-red-50",
  alert: "text-red-600 bg-red-50",
  crit: "text-red-600 bg-red-50",
  err: "text-orange-600 bg-orange-50",
  warn: "text-yellow-600 bg-yellow-50",
  notice: "text-blue-600 bg-blue-50",
  info: "text-gray-500 bg-gray-50",
  debug: "text-gray-400 bg-gray-50",
};

const FACILITIES = ["kern", "user", "mail", "daemon", "auth", "syslog", "lpr", "news", "uucp", "cron", "authpriv", "ftp", "local0", "local1", "local2", "local3", "local4", "local5", "local6", "local7"];
const SEVERITIES = ["emerg", "alert", "crit", "err", "warn", "notice", "info", "debug"];

export default function SyslogServerPage() {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterFacility, setFilterFacility] = useState("all");
  const [filterSource, setFilterSource] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const liveEndRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);

  const { data: statusData, isLoading: statusLoading } = useQuery<{ running: boolean; port: number; messageCount: number }>({
    queryKey: ["syslog-status"],
    queryFn: () => apiFetch("/api/syslog-server?action=status"),
    refetchInterval: 5000,
  });

  const { data: messagesData } = useQuery<{ messages: SyslogMsg[]; total: number }>({
    queryKey: ["syslog-messages", page, filterSeverity, filterFacility, filterSource, searchText],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "200" });
      if (filterSeverity !== "all") params.set("severity", filterSeverity);
      if (filterFacility !== "all") params.set("facility", filterFacility);
      if (filterSource) params.set("source", filterSource);
      if (searchText) params.set("search", searchText);
      return apiFetch(`/api/syslog-server?action=messages&${params}`);
    },
    refetchInterval: isPaused ? false : 3000,
  });

  useEffect(() => {
    if (!isPaused && liveEndRef.current) {
      liveEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messagesData, isPaused]);

  const startMutation = useMutation({
    mutationFn: () => apiFetch("/api/syslog-server", { method: "POST", body: JSON.stringify({ action: "start" }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["syslog-status"] }); toast({ title: "Syslog server started" }); },
    onError: (err: Error) => toast({ title: "Failed to start", description: err.message, variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: () => apiFetch("/api/syslog-server", { method: "POST", body: JSON.stringify({ action: "stop" }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["syslog-status"] }); toast({ title: "Syslog server stopped" }); },
    onError: (err: Error) => toast({ title: "Failed to stop", description: err.message, variant: "destructive" }),
  });

  const clearMutation = useMutation({
    mutationFn: () => apiFetch("/api/syslog-server", { method: "POST", body: JSON.stringify({ action: "clear" }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["syslog-messages"] }); queryClient.invalidateQueries({ queryKey: ["syslog-status"] }); toast({ title: "Messages cleared" }); },
  });

  const messages = messagesData?.messages || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Syslog Server"
        description="Receive and monitor syslog messages from network devices"
        icon={Terminal}
      />

      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live">Live Messages</TabsTrigger>
          <TabsTrigger value="search">Search & Filter</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4 mt-4">
          {/* Status & Controls */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${statusData?.running ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
                  <span className="font-medium">
                    {statusData?.running ? "Running" : "Stopped"}
                  </span>
                  <Badge variant="outline">Port {statusData?.port ?? 1514}</Badge>
                  <Badge variant="secondary">{statusData?.messageCount ?? 0} messages</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {!statusData?.running ? (
                    <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                      <Play className="mr-2 h-4 w-4" /> Start
                    </Button>
                  ) : (
                    <Button onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending} variant="destructive">
                      <Square className="mr-2 h-4 w-4" /> Stop
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
                    <Trash2 className="mr-2 h-4 w-4" /> Clear
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsPaused(!isPaused)}
                  >
                    {isPaused ? <Play className="mr-1 h-3 w-3" /> : <Pause className="mr-1 h-3 w-3" />}
                    {isPaused ? "Resume" : "Pause"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterSeverity} onValueChange={(v) => { setFilterSeverity(v); setPage(1); }}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search text..."
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
              className="w-64 h-8 text-xs"
            />
          </div>

          {/* Live Log Viewer */}
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px] bg-gray-950 rounded-md">
                <div className="p-4 font-mono text-xs space-y-0.5">
                  {messages.length === 0 ? (
                    <div className="text-gray-500 text-center py-12">
                      {statusData?.running ? "Waiting for syslog messages..." : "Syslog server is not running. Start it to receive messages."}
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const sevColor = SEVERITY_COLORS[msg.severity] || "text-gray-400";
                      return (
                        <div key={msg.id} className={`flex gap-2 px-2 py-1 rounded hover:bg-gray-800/50 ${sevColor}`}>
                          <span className="text-gray-500 whitespace-nowrap">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="text-gray-500 w-12 whitespace-nowrap">{msg.severity}</span>
                          <span className="text-gray-500 w-16 whitespace-nowrap">{msg.facility}</span>
                          <span className="text-gray-400 w-20 truncate">{msg.hostname}</span>
                          {msg.appname && <span className="text-gray-300 w-16 truncate">{msg.appname}</span>}
                          <span className="text-gray-200 truncate">{msg.message}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={liveEndRef} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search" className="space-y-4 mt-4">
          {/* Advanced Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Facility</label>
                  <Select value={filterFacility} onValueChange={(v) => { setFilterFacility(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Facilities</SelectItem>
                      {FACILITIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Severity</label>
                  <Select value={filterSeverity} onValueChange={(v) => { setFilterSeverity(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Source IP</label>
                  <Input placeholder="e.g. 192.168.1.1" value={filterSource} onChange={(e) => { setFilterSource(e.target.value); setPage(1); }} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Search Text</label>
                  <Input placeholder="Search message content..." value={searchText} onChange={(e) => { setSearchText(e.target.value); setPage(1); }} className="h-8 text-xs" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results Table */}
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Timestamp</TableHead>
                      <TableHead className="text-xs">Facility</TableHead>
                      <TableHead className="text-xs">Severity</TableHead>
                      <TableHead className="text-xs">Hostname</TableHead>
                      <TableHead className="text-xs">App</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="text-xs">Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.map((msg) => (
                      <TableRow key={msg.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(msg.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs font-mono">{msg.facility}</Badge></TableCell>
                        <TableCell>
                          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${SEVERITY_COLORS[msg.severity] || ""}`}>
                            {msg.severity}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{msg.hostname}</TableCell>
                        <TableCell className="text-xs">{msg.appname ?? "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{msg.source}</TableCell>
                        <TableCell className="text-xs max-w-64 truncate">{msg.message}</TableCell>
                      </TableRow>
                    ))}
                    {messages.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No messages found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
              {messagesData && messagesData.total > 200 && (
                <div className="flex items-center justify-between p-3 border-t">
                  <span className="text-xs text-muted-foreground">Showing {messages.length} of {messagesData.total}</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                    <Button variant="outline" size="sm" disabled={messages.length < 200} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
