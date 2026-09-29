"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Users, Wifi, Clock, Download, Upload, Server, FileText, Lock, AlertTriangle,
  CheckCircle2, XCircle, Activity, Radio,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Helpers ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

// ─── Component ──────────────────────────────────────────────────

export default function FreeRadiusLivePanel() {
  const [frTab, setFrTab] = useState("overview");

  const { data: overview, isLoading: ovLoading } = useQuery<{
    overview: {
      totalUsers: number; totalGroups: number; activeSessions: number;
      totalSessions: number; totalAuthSuccess: number; totalAuthFailed: number;
      totalNas: number; totalDataDownloaded: number; totalDataUploaded: number;
    };
  }>({
    queryKey: ["freeradius-overview"],
    queryFn: () => fetch("/api/freeradius?tab=overview").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const { data: frUsers, isLoading: usersLoading } = useQuery<{ users: any[] }>({
    queryKey: ["freeradius-users"],
    queryFn: () => fetch("/api/freeradius?tab=users").then((r) => r.json()),
    enabled: frTab === "users",
  });

  const { data: frGroups, isLoading: groupsLoading } = useQuery<{ groups: any[] }>({
    queryKey: ["freeradius-groups"],
    queryFn: () => fetch("/api/freeradius?tab=groups").then((r) => r.json()),
    enabled: frTab === "groups",
  });

  const { data: frSessions, isLoading: sessLoading } = useQuery<{ sessions: any[]; active: number }>({
    queryKey: ["freeradius-sessions"],
    queryFn: () => fetch("/api/freeradius?tab=sessions").then((r) => r.json()),
    refetchInterval: 10000,
    enabled: frTab === "sessions",
  });

  const { data: frAuthLog, isLoading: authLoading } = useQuery<{ authLogs: any[]; total: number }>({
    queryKey: ["freeradius-authlog"],
    queryFn: () => fetch("/api/freeradius?tab=authlog").then((r) => r.json()),
    enabled: frTab === "authlog",
  });

  const { data: frNas, isLoading: nasLoading } = useQuery<{ nas: any[] }>({
    queryKey: ["freeradius-nas"],
    queryFn: () => fetch("/api/freeradius?tab=nas").then((r) => r.json()),
    enabled: frTab === "nas",
  });

  const o = overview?.overview;

  return (
    <div className="space-y-4">
      {/* Server Status Banner */}
      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
              <Radio className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                FreeRADIUS 3.2.7
                <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.5">RUNNING</Badge>
              </h3>
              <p className="text-xs text-muted-foreground">
                Auth: 1812 · Acct: 1813 · CoA: 3799 · PostgreSQL Backend
              </p>
            </div>
          </div>
          <div className="flex gap-3 text-xs">
            <div className="text-center">
              <p className="font-bold text-emerald-700 dark:text-emerald-300">{o?.totalAuthSuccess || 0}</p>
              <p className="text-muted-foreground">Accepted</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-red-600">{o?.totalAuthFailed || 0}</p>
              <p className="text-muted-foreground">Rejected</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-blue-600">{o?.activeSessions || 0}</p>
              <p className="text-muted-foreground">Active</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      {ovLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={<Users className="h-4 w-4" />} label="RADIUS Users" value={o?.totalUsers || 0} color="teal" />
          <StatCard icon={<Layers className="h-4 w-4" />} label="Groups" value={o?.totalGroups || 0} color="blue" />
          <StatCard icon={<Wifi className="h-4 w-4" />} label="Active Sessions" value={o?.activeSessions || 0} color="green" />
          <StatCard icon={<Server className="h-4 w-4" />} label="NAS Devices" value={o?.totalNas || 0} color="purple" />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Total Sessions" value={o?.totalSessions || 0} color="amber" />
        </div>
      )}

      {/* Data Transfer Cards */}
      {!ovLoading && o && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-0 rounded-xl ring-1 ring-sky-200/60 bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/20 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sky-500"><Download className="h-4 w-4 text-white" /></div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{formatBytes(o.totalDataDownloaded)}</p>
                  <p className="text-xs text-muted-foreground">Total Download</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 rounded-xl ring-1 ring-orange-200/60 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500"><Upload className="h-4 w-4 text-white" /></div>
                <div>
                  <p className="text-lg font-bold tabular-nums">{formatBytes(o.totalDataUploaded)}</p>
                  <p className="text-xs text-muted-foreground">Total Upload</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sub-Tabs */}
      <Tabs value={frTab} onValueChange={setFrTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="users" className="text-xs">RADIUS Users</TabsTrigger>
          <TabsTrigger value="groups" className="text-xs">Group Policies</TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs">Live Sessions</TabsTrigger>
          <TabsTrigger value="authlog" className="text-xs">Auth Log</TabsTrigger>
          <TabsTrigger value="nas" className="text-xs">NAS Devices</TabsTrigger>
        </TabsList>

        {/* ─── RADIUS Users (from radcheck/radreply) ─── */}
        <TabsContent value="users" className="space-y-4">
          {usersLoading ? <Skeleton className="h-64" /> : (
            <Card className="border shadow-sm"><CardContent className="p-0">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Username</TableHead>
                      <TableHead className="text-xs">Password</TableHead>
                      <TableHead className="text-xs">Group</TableHead>
                      <TableHead className="text-xs">Reply Attr</TableHead>
                      <TableHead className="text-xs">Reply Value</TableHead>
                      <TableHead className="text-xs">Subscriber</TableHead>
                      <TableHead className="text-xs">Plan</TableHead>
                      <TableHead className="text-xs">Speed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(frUsers?.users || []).length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No RADIUS users found</TableCell></TableRow>
                    ) : (frUsers?.users || []).map((u: any, i: number) => (
                      <TableRow key={u.username + i}>
                        <TableCell className="font-mono text-xs font-medium">{u.username}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">••••••</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{u.groupname || "—"}</Badge></TableCell>
                        <TableCell className="text-xs font-mono">{u.reply_attr || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{u.reply_value || "—"}</TableCell>
                        <TableCell className="text-xs">
                          <div>{u.subscriber_name || "—"}</div>
                          <Badge variant={u.subscriber_status === "ACTIVE" ? "default" : "secondary"} className="text-[9px]">{u.subscriber_status || "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{u.plan_name || "—"}</TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {u.speedLimitDown ? `${u.speedLimitDown / 1024}M/${u.speedLimitUp / 1024}M` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* ─── Group Policies (radgroupcheck/radgroupreply) ─── */}
        <TabsContent value="groups" className="space-y-4">
          {groupsLoading ? <Skeleton className="h-64" /> : (
            <Card className="border shadow-sm"><CardContent className="p-0">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Group</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Attribute</TableHead>
                      <TableHead className="text-xs">Value</TableHead>
                      <TableHead className="text-xs">Users</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(frGroups?.groups || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No group policies configured</TableCell></TableRow>
                    ) : (frGroups?.groups || []).map((g: any, i: number) => (
                      <TableRow key={g.groupname + g.check_attr + g.reply_attr + i}>
                        <TableCell className="font-medium text-xs">{g.groupname}</TableCell>
                        <TableCell>
                          {g.check_attr ? <Badge className="bg-blue-100 text-blue-700 text-[10px]">Check</Badge> : null}
                          {g.reply_attr ? <Badge className="bg-green-100 text-green-700 text-[10px] ml-1">Reply</Badge> : null}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{g.check_attr || g.reply_attr}</TableCell>
                        <TableCell className="text-xs font-mono">{g.check_value || g.reply_value}</TableCell>
                        <TableCell className="text-xs tabular-nums">{g.user_count || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* ─── Live Sessions (radacct) ─── */}
        <TabsContent value="sessions" className="space-y-4">
          {sessLoading ? <Skeleton className="h-64" /> : (
            <Card className="border shadow-sm"><CardContent className="p-0">
              <CardHeader className="pb-2 px-4 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wifi className="h-4 w-4" />Live Sessions
                    <Badge className="bg-green-600 text-white text-[10px]">{frSessions?.active || 0} active</Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Auto-refresh: 10s</p>
                </div>
              </CardHeader>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Username</TableHead>
                      <TableHead className="text-xs">NAS IP</TableHead>
                      <TableHead className="text-xs">Framed IP</TableHead>
                      <TableHead className="text-xs">Start Time</TableHead>
                      <TableHead className="text-xs">Duration</TableHead>
                      <TableHead className="text-xs">Download</TableHead>
                      <TableHead className="text-xs">Upload</TableHead>
                      <TableHead className="text-xs">MAC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(frSessions?.sessions || []).length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No sessions found</TableCell></TableRow>
                    ) : (frSessions?.sessions || []).map((s: any, i: number) => (
                      <TableRow key={s.acctuniqueid || i} className={s.is_active ? "bg-green-50/50 dark:bg-green-950/10" : ""}>
                        <TableCell>
                          {s.is_active
                            ? <Badge className="bg-green-600 text-white text-[10px]">Active</Badge>
                            : <Badge variant="secondary" className="text-[10px]">Closed</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium">{s.username || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{s.nasipaddress || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{s.framedipaddress || "—"}</TableCell>
                        <TableCell className="text-xs">{formatDate(s.acctstarttime)}</TableCell>
                        <TableCell className="text-xs tabular-nums">{formatDuration(s.acctsessiontime)}</TableCell>
                        <TableCell className="text-xs tabular-nums text-blue-600">{formatBytes(s.acctinputoctets)}</TableCell>
                        <TableCell className="text-xs tabular-nums text-orange-600">{formatBytes(s.acctoutputoctets)}</TableCell>
                        <TableCell className="text-xs font-mono">{s.callingstationid || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* ─── Auth Log (radpostauth) ─── */}
        <TabsContent value="authlog" className="space-y-4">
          {authLoading ? <Skeleton className="h-64" /> : (
            <Card className="border shadow-sm"><CardContent className="p-0">
              <CardHeader className="pb-2 px-4 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />Authentication Logs
                    <Badge variant="outline" className="text-[10px]">{frAuthLog?.total || 0} total</Badge>
                  </CardTitle>
                </div>
              </CardHeader>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Result</TableHead>
                      <TableHead className="text-xs">Username</TableHead>
                      <TableHead className="text-xs">Password</TableHead>
                      <TableHead className="text-xs">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(frAuthLog?.authLogs || []).length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No auth logs found</TableCell></TableRow>
                    ) : (frAuthLog?.authLogs || []).map((l: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>
                          {l.reply === "Access-Accept"
                            ? <Badge className="bg-green-600 text-white text-[10px] flex items-center gap-1 w-fit"><CheckCircle2 className="h-3 w-3" />Accept</Badge>
                            : <Badge className="bg-red-600 text-white text-[10px] flex items-center gap-1 w-fit"><XCircle className="h-3 w-3" />Reject</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium">{l.username || "(empty)"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">••••••</TableCell>
                        <TableCell className="text-xs">{formatDate(l.authdate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* ─── NAS Devices ─── */}
        <TabsContent value="nas" className="space-y-4">
          {nasLoading ? <Skeleton className="h-64" /> : (
            <Card className="border shadow-sm"><CardContent className="p-0">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">NAS Name</TableHead>
                      <TableHead className="text-xs">IP Address</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Short Name</TableHead>
                      <TableHead className="text-xs">Secret</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(frNas?.nas || []).length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No NAS devices configured</TableCell></TableRow>
                    ) : (frNas?.nas || []).map((n: any, i: number) => (
                      <TableRow key={n.id || i}>
                        <TableCell className="font-medium text-xs">{n.nasname}</TableCell>
                        <TableCell className="font-mono text-xs">{n.nasname}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{n.type}</Badge></TableCell>
                        <TableCell className="text-xs">{n.shortname || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">••••••••</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{n.description || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* ─── Overview tab: combined summary ─── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Recent Auth */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Lock className="h-4 w-4" />Recent Authentication</CardTitle></CardHeader>
              <CardContent>
                {authLoading ? <Skeleton className="h-32" /> : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(frAuthLog?.authLogs || []).slice(0, 8).map((l: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          {l.reply === "Access-Accept"
                            ? <CheckCircle2 className="h-3 w-3 text-green-600" />
                            : <XCircle className="h-3 w-3 text-red-600" />}
                          <span className="font-mono">{l.username || "(empty)"}</span>
                        </div>
                        <span className="text-muted-foreground">{formatDate(l.authdate)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Sessions Summary */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />Session Summary</CardTitle></CardHeader>
              <CardContent>
                {sessLoading ? <Skeleton className="h-32" /> : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Active Sessions</span><span className="font-bold text-green-600">{frSessions?.active || 0}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Closed Sessions</span><span className="font-bold">{(frSessions?.sessions?.length || 0) - (frSessions?.active || 0)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total Download</span><span className="font-bold text-blue-600">{formatBytes(o?.totalDataDownloaded || 0)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total Upload</span><span className="font-bold text-orange-600">{formatBytes(o?.totalDataUploaded || 0)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Auth Accept Rate</span>
                      <span className="font-bold">
                        {((o?.totalAuthSuccess || 0) + (o?.totalAuthFailed || 0)) > 0
                          ? `${Math.round(((o?.totalAuthSuccess || 0) / ((o?.totalAuthSuccess || 0) + (o?.totalAuthFailed || 0))) * 100)}%`
                          : "N/A"}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* NAS Summary */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4" />NAS Devices ({o?.totalNas || 0})</CardTitle></CardHeader>
              <CardContent>
                {nasLoading ? <Skeleton className="h-32" /> : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {(frNas?.nas || []).map((n: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                        <span className="font-medium">{n.nasname}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px]">{n.type}</Badge>
                          <span className="text-muted-foreground font-mono">{n.shortname}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Group Summary */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" />Group Policies ({o?.totalGroups || 0})</CardTitle></CardHeader>
              <CardContent>
                {groupsLoading ? <Skeleton className="h-32" /> : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {(frGroups?.groups || []).filter((g: any, i: number, arr: any[]) => arr.findIndex((a: any) => a.groupname === g.groupname) === i).map((g: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                        <span className="font-medium">{g.groupname}</span>
                        <div className="flex items-center gap-2">
                          {g.check_attr && <Badge className="bg-blue-100 text-blue-700 text-[9px]">C: {g.check_attr}</Badge>}
                          {g.reply_attr && <Badge className="bg-green-100 text-green-700 text-[9px]">R: {g.reply_attr}</Badge>}
                          <span className="text-muted-foreground">{g.user_count} users</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    teal: "from-teal-500 to-teal-600 shadow-teal-500/25 ring-teal-200/60 dark:ring-teal-800/40",
    green: "from-green-500 to-emerald-600 shadow-green-500/25 ring-green-200/60 dark:ring-green-800/40",
    blue: "from-blue-500 to-blue-600 shadow-blue-500/25 ring-blue-200/60 dark:ring-blue-800/40",
    purple: "from-purple-500 to-violet-600 shadow-purple-500/25 ring-purple-200/60 dark:ring-purple-800/40",
    amber: "from-amber-500 to-orange-600 shadow-amber-500/25 ring-amber-200/60 dark:ring-amber-800/40",
    red: "from-red-500 to-rose-600 shadow-red-500/25 ring-red-200/60 dark:ring-red-800/40",
  };
  const gradient = colorMap[color] || colorMap.teal;

  return (
    <Card className="border-0 rounded-xl ring-1 bg-gradient-to-br shadow-sm hover:scale-[1.02] transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${gradient} shadow-sm`}>{icon}</div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Need Layers icon
function Layers(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22.54 12.43-1.89-.86-8.58 3.91a2 2 0 0 1-1.66 0l-8.58-3.9-1.89.87a1 1 0 0 0 0 1.82l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22.54 16.43-1.89-.86-8.58 3.91a2 2 0 0 1-1.66 0l-8.58-3.9-1.89.87a1 1 0 0 0 0 1.82l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    </svg>
  );
}
