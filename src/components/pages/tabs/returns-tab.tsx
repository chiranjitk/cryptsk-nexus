"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Search, Eye, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Wrench, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

interface ReturnItem {
  id: string; equipmentId: string; equipment: { id: string; name: string; category: string; serialNumber: string } | null;
  returnDate: string; condition: string; inspectionNotes: string; status: string; createdAt: string;
}

const RETURN_STATUS_STYLES: Record<string, string> = {
  PENDING_INSPECTION: "bg-yellow-100 text-yellow-700 border-yellow-200",
  INSPECTED: "bg-teal-100 text-teal-700 border-teal-200",
  REPAIRED: "bg-purple-100 text-purple-700 border-purple-200",
  SCRAPPED: "bg-red-100 text-red-700 border-red-200",
  RESTOCKED: "bg-green-100 text-green-700 border-green-200",
};

const CONDITION_STYLES: Record<string, string> = {
  GOOD: "bg-green-100 text-green-700 border-green-200",
  FAIR: "bg-yellow-100 text-yellow-700 border-yellow-200",
  POOR: "bg-red-100 text-red-700 border-red-200",
};

const TRANSITIONS: Record<string, string[]> = {
  PENDING_INSPECTION: ["INSPECTED", "SCRAPPED"],
  INSPECTED: ["REPAIRED", "SCRAPPED", "RESTOCKED"],
  REPAIRED: ["RESTOCKED", "SCRAPPED"],
};

export default function ReturnsTab() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [returnDialog, setReturnDialog] = useState(false);
  const [returnEquipId, setReturnEquipId] = useState("");
  const [returnCondition, setReturnCondition] = useState("FAIR");
  const [returnNotes, setReturnNotes] = useState("");

  const { data, isLoading } = useQuery<{ items: ReturnItem[]; pagination: { page: number; total: number; totalPages: number } }>({
    queryKey: ["equipment-returns", filterStatus, search, page],
    queryFn: () => apiFetch(`/api/equipment/returns?status=${filterStatus}&search=${encodeURIComponent(search)}&page=${page}&limit=20`),
  });

  const { data: detail } = useQuery<{ return: ReturnItem & { inspectedById: string | null } }>({
    queryKey: ["return-detail", detailId],
    queryFn: () => apiFetch(`/api/equipment/returns/${detailId}`),
    enabled: !!detailId,
  });

  const items = data?.items || [];
  const pagination = data?.pagination;

  const createMutation = useMutation({
    mutationFn: (body: { equipmentId: string; condition: string; inspectionNotes: string }) => apiFetch("/api/equipment/returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Return created"); setReturnDialog(false); setReturnEquipId(""); setReturnNotes(""); queryClient.invalidateQueries({ queryKey: ["equipment-returns"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to create return"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, inspectionNotes }: { id: string; status: string; inspectionNotes?: string }) => apiFetch(`/api/equipment/returns/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, inspectionNotes }) }),
    onSuccess: () => { toast.success("Return updated"); queryClient.invalidateQueries({ queryKey: ["equipment-returns"] }); queryClient.invalidateQueries({ queryKey: ["return-detail"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to update return"),
  });

  const handleReturn = () => {
    if (!returnEquipId) { toast.error("Equipment is required"); return; }
    createMutation.mutate({ equipmentId: returnEquipId, condition: returnCondition, inspectionNotes: returnNotes });
  };

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="flex gap-2 items-center flex-1 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search returns..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-9 text-sm" />
          </div>
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING_INSPECTION">Pending</SelectItem>
              <SelectItem value="INSPECTED">Inspected</SelectItem>
              <SelectItem value="REPAIRED">Repaired</SelectItem>
              <SelectItem value="SCRAPPED">Scrapped</SelectItem>
              <SelectItem value="RESTOCKED">Restocked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => setReturnDialog(true)}><RotateCcw className="h-4 w-4 mr-1.5" /> Return Equipment</Button>
      </div>

      {items.length === 0 ? (
        <Card className="border shadow-sm"><CardContent className="py-8 text-center text-sm text-muted-foreground">No returns found.</CardContent></Card>
      ) : (
        <>
          <Card className="border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Equipment</TableHead>
                  <TableHead className="text-xs">Condition</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Return Date</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium">{r.equipment?.name || "—"} <span className="text-xs text-muted-foreground ml-1">{r.equipment?.serialNumber}</span></TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${CONDITION_STYLES[r.condition] || ""}`}>{r.condition}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${RETURN_STATUS_STYLES[r.status] || ""}`}>{r.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.returnDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setDetailId(r.id)}><Eye className="h-3.5 w-3.5 mr-1" />View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-3">
              <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-xs text-muted-foreground">Page {page} of {pagination.totalPages}</span>
              <Button variant="outline" size="sm" className="h-8" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </>
      )}

      {/* Return Dialog */}
      <Dialog open={returnDialog} onOpenChange={setReturnDialog}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Return Equipment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Equipment ID *</Label><Input value={returnEquipId} onChange={(e) => setReturnEquipId(e.target.value)} placeholder="Enter equipment ID" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Condition</Label>
              <Select value={returnCondition} onValueChange={setReturnCondition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="GOOD">Good</SelectItem><SelectItem value="FAIR">Fair</SelectItem><SelectItem value="POOR">Poor</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Inspection Notes</Label><Textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={3} placeholder="Notes about the return..." /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReturnDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleReturn}>Create Return</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-lg">
          <DialogHeader><DialogTitle className="text-base">Return Detail</DialogTitle></DialogHeader>
          {detail?.return ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Equipment</p><p className="text-sm font-medium">{detail.return.equipment?.name || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Serial Number</p><p className="text-sm font-medium">{detail.return.equipment?.serialNumber || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Condition</p><Badge variant="outline" className={`text-xs ${CONDITION_STYLES[detail.return.condition] || ""}`}>{detail.return.condition}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className={`text-xs ${RETURN_STATUS_STYLES[detail.return.status] || ""}`}>{detail.return.status.replace("_", " ")}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Return Date</p><p className="text-sm">{new Date(detail.return.returnDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p></div>
                <div><p className="text-xs text-muted-foreground">Inspection Notes</p><p className="text-sm">{detail.return.inspectionNotes || "—"}</p></div>
              </div>
              {TRANSITIONS[detail.return.status]?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2">Status Workflow</p>
                  <div className="flex gap-2 flex-wrap">
                    {TRANSITIONS[detail.return.status].map((next) => (
                      <Button key={next} size="sm" variant="outline" className={`text-xs h-8 ${next === "SCRAPPED" ? "border-red-200 text-red-600 hover:bg-red-50" : next === "RESTOCKED" ? "border-green-200 text-green-600 hover:bg-green-50" : "hover:bg-muted"}`} onClick={() => updateMutation.mutate({ id: detail.return.id, status: next })}>
                        {next === "SCRAPPED" ? <XCircle className="h-3.5 w-3.5 mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}{next.replace("_", " ")}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : <div className="py-4 text-center text-sm text-muted-foreground">Loading...</div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
