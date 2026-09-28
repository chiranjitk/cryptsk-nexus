"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const REPLY_TYPES = [
  "Access-Accept",
  "Access-Reject",
];

export function RadiusPostAuthPanel() {
  const [page, setPage] = React.useState(1);
  const [username, setUsername] = React.useState("");
  const [reply, setReply] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["radius-postauth", page, username, reply],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (username) params.set("username", username);
      if (reply) params.set("reply", reply);
      const res = await fetch(`/api/radius/postauth?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const events = data?.events || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RADIUS Auth Log</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} authentication events · Success + Failure
          </p>
        </div>
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
              <label className="text-xs font-medium text-muted-foreground">Reply</label>
              <select value={reply} onChange={(e) => { setReply(e.target.value); setPage(1); }} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">All replies</option>
                {REPLY_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
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
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Reply</TableHead>
                    <TableHead>NAS IP</TableHead>
                    <TableHead>Port</TableHead>
                    <TableHead>MAC Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e: any) => {
                    const isAccept = e.reply === "Access-Accept";
                    return (
                      <TableRow key={e.id} className="hover:bg-muted/50">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(e.authdate).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-6">
                              <AvatarFallback className={`text-[9px] font-bold ${isAccept ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                                {(e.username || "?").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-mono">{e.username}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isAccept ? (
                            <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/5 text-emerald-600 gap-1">
                              <CheckCircle className="size-3" /> Access-Accept
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-rose-500/30 bg-rose-500/5 text-rose-600 gap-1">
                              <XCircle className="size-3" /> {e.reply || "Access-Reject"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{e.nasipaddress || "—"}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{e.nasportid || "—"}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{e.callingstationid || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {events.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        No RADIUS auth events found. FreeRADIUS will write to this table when authentication requests arrive.
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
        <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} total events</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
