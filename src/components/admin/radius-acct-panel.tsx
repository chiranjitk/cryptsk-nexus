"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, Wifi, Clock, Download, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function RadiusAcctPanel() {
  const [page, setPage] = React.useState(1);
  const [username, setUsername] = React.useState("");
  const [nasIp, setNasIp] = React.useState("");
  const [activeOnly, setActiveOnly] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["radius-acct", page, username, nasIp, activeOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (username) params.set("username", username);
      if (nasIp) params.set("nasip", nasIp);
      if (activeOnly) params.set("active", "true");
      const res = await fetch(`/api/radius/acct?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const sessions = data?.sessions || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  function fmtDuration(seconds: number | null) {
    if (!seconds) return "—";
    const h = Math.floor(Number(seconds) / 3600);
    const m = Math.floor((Number(seconds) % 3600) / 60);
    const s = Number(seconds) % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function fmtBytes(bytes: number | null) {
    if (!bytes || bytes === 0) return "0 B";
    const gb = Number(bytes) / (1024 ** 3);
    const mb = Number(bytes) / (1024 ** 2);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${mb.toFixed(0)} MB`;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RADIUS Accounting</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} sessions · {activeOnly ? "Active only" : "All sessions"}
          </p>
        </div>
        <Button
          variant={activeOnly ? "default" : "outline"}
          size="sm"
          className="gap-2"
          onClick={() => { setActiveOnly(!activeOnly); setPage(1); }}
        >
          <Wifi className="size-4" /> {activeOnly ? "Active Only" : "All Sessions"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="size-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Username</label>
              <Input placeholder="Search by username…" value={username} onChange={(e) => { setUsername(e.target.value); setPage(1); }} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">NAS IP</label>
              <Input placeholder="Search by NAS IP…" value={nasIp} onChange={(e) => { setNasIp(e.target.value); setPage(1); }} className="h-9 text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
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
                    <TableHead>Start</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s: any) => {
                    const isActive = !s.acctstoptime;
                    return (
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
                          {isActive ? (
                            <Badge variant="outline" className="text-[9px] border-emerald-500/30 bg-emerald-500/5 text-emerald-600">
                              <div className="size-1.5 rounded-full bg-emerald-500 mr-1 cryptsk-pulse-dot" /> Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] border-muted text-muted-foreground">
                              {s.acctterminatecause || "Stopped"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {sessions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                        No RADIUS accounting records found. FreeRADIUS will write to this table when sessions start.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} total sessions</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
