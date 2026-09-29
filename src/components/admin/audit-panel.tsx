"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const ACTIONS = [
  "create", "update", "delete", "login", "login_failed", "logout",
  "export", "approve", "execute", "config_change", "permission_change", "role_change",
];

const RESULTS = ["success", "failure", "denied"];

export function AuditPanel() {
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState("");
  const [result, setResult] = React.useState("");
  const [resource, setResource] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audit", page, action, result, resource],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (action) params.set("action", action);
      if (result) params.set("result", result);
      if (resource) params.set("resource", resource);
      const res = await fetch(`/api/audit?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const events = data?.events || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  function getActionColor(action: string) {
    if (action === "login_failed" || action === "delete") return "text-rose-600 bg-rose-500/10";
    if (action === "create") return "text-emerald-600 bg-emerald-500/10";
    if (action === "update" || action === "config_change") return "text-blue-600 bg-blue-500/10";
    if (action === "login" || action === "logout") return "text-violet-600 bg-violet-500/10";
    return "text-muted-foreground bg-muted";
  }

  function getResultColor(result: string) {
    if (result === "success") return "text-emerald-600";
    if (result === "failure") return "text-rose-600";
    if (result === "denied") return "text-amber-600";
    return "text-muted-foreground";
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} events · Immutable record of all actions
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="size-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="size-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Action</label>
              <select
                value={action}
                onChange={(e) => { setAction(e.target.value); setPage(1); }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All actions</option>
                {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Result</label>
              <select
                value={result}
                onChange={(e) => { setResult(e.target.value); setPage(1); }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All results</option>
                {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Resource</label>
              <Input
                placeholder="e.g. user, auth, system_setting"
                value={resource}
                onChange={(e) => { setResource(e.target.value); setPage(1); }}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events table */}
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
                    <TableHead className="w-[160px]">Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event: any) => (
                    <TableRow key={event.id} className="hover:bg-muted/50">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(event.createdAt).toLocaleString("en-IN", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        {event.user ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="size-6">
                              <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-bold">
                                {(event.user.name || event.user.email).charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-xs font-medium">{event.user.name || event.user.email}</p>
                              <p className="text-[10px] text-muted-foreground">{event.user.email}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">System</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] ${getActionColor(event.action)}`}>
                          {event.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-mono">{event.resource}</span>
                        {event.resourceName && (
                          <span className="text-xs text-muted-foreground ml-1">/ {event.resourceName}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${getResultColor(event.result)}`}>
                          {event.result}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {event.ipAddress || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs">
                        {event.errorMessage || event.metadata || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {events.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        No audit events found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages} · {total.toLocaleString()} total events
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
