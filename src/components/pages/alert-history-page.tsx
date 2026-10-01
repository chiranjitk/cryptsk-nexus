"use client";

// ═══════════════════════════════════════════════════════════════
// Alert History — resolved/archived alerts with filters + CSV export
// ═══════════════════════════════════════════════════════════════
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { History, Download, ChevronLeft, ChevronRight, Search, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { formatTimestamp } from "@/components/integrations/shared";

interface HistoryItem {
  id: string;
  title: string;
  message: string;
  severity: string;
  source: string;
  status: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolution: string;
  createdAt: string;
}

const sevBadge = (sev: string) => (
  <Badge className={`text-[10px] ${sev === "CRITICAL" ? "bg-red-100 text-red-700 border-red-200" : sev === "HIGH" ? "bg-orange-100 text-orange-700 border-orange-200" : sev === "MEDIUM" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"}`}>{sev}</Badge>
);

export function AlertHistoryPage() {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ search, severity: severity === "all" ? "" : severity, status: status === "all" ? "" : status, page: String(page), limit: "25" });
  const { data, isLoading } = useQuery<{ history: HistoryItem[]; total: number; totalPages: number }>({
    queryKey: ["alert-history", search, severity, status, page],
    queryFn: () => apiFetch(`/api/alerts/history?${params.toString()}`),
    refetchInterval: 30000,
  });
  const rows = data?.history ?? [];
  const totalPages = data?.totalPages ?? 1;

  function exportCsv() {
    toast.info("Preparing CSV export…");
    const url = `/api/alerts/export?search=${encodeURIComponent(search)}&severity=${severity === "all" ? "" : severity}&status=${status === "all" ? "" : status}`;
    fetch(url).then((r) => { if (!r.ok) throw new Error("Export failed"); return r.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `alert-history-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success("Export downloaded");
      })
      .catch((e: Error) => toast.error(e.message || "Export failed"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><History className="h-5 w-5 text-primary" />Alert History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Archive of acknowledged and resolved alerts with full audit trail. {data?.total ?? 0} records.</p>
        </div>
        <Button size="sm" variant="outline" className="text-xs h-8" onClick={exportCsv}><Download className="h-3 w-3 mr-1" />Export CSV</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search title, source…" className="h-8 text-xs pl-8" />
        </div>
        <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(1); }}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All severities</SelectItem>{["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{["RESOLVED", "ACKNOWLEDGED", "ACTIVE", "SUPPRESSED"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card className="border">
        <CardContent className="p-0">
          <div className="rounded-lg overflow-x-auto max-h-[60vh] overflow-y-auto nice-scroll">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10"><TableRow className="bg-muted/50">
                <TableHead className="text-xs">Alert</TableHead>
                <TableHead className="text-xs">Severity</TableHead>
                <TableHead className="text-xs">Source</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Created</TableHead>
                <TableHead className="text-xs">Resolved</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-10"><Skeleton className="h-20 w-full" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-12 text-center"><History className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm font-medium">No history records</p><p className="text-xs text-muted-foreground mt-1">Resolved alerts will appear here.</p></TableCell></TableRow>
                ) : rows.map((h) => (
                  <TableRow key={h.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs max-w-[220px]"><p className="font-medium truncate">{h.title || "—"}</p><p className="text-muted-foreground truncate">{h.message}</p></TableCell>
                    <TableCell>{sevBadge(h.severity)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.source || "—"}</TableCell>
                    <TableCell className="text-xs">{h.status === "RESOLVED" ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Resolved</Badge> : <Badge variant="outline" className="text-[10px]">{h.status.toLowerCase()}</Badge>}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(h.createdAt)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{h.resolvedAt ? formatTimestamp(h.resolvedAt) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t">
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{page <= 1 ? <Loader2 className="h-3 w-3 opacity-0" /> : <ChevronLeft className="h-3.5 w-3.5" />}</Button>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AlertHistoryPage;
