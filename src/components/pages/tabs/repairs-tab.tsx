"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wrench, Search, Eye, ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";

interface RepairItem {
  id: string; equipmentId: string; equipment: { id: string; name: string; category: string; serialNumber: string } | null;
  reportedIssue: string; repairType: string; estimatedCost: number; actualCost: number; status: string;
  repairNotes: string; assignedTo: string | null; startedAt: string | null; completedAt: string | null; createdAt: string;
}

const REPAIR_STATUS_STYLES: Record<string, string> = {
  REPORTED: "bg-yellow-100 text-yellow-700 border-yellow-200",
  DIAGNOSED: "bg-teal-100 text-teal-700 border-teal-200",
  REPAIRING: "bg-purple-100 text-purple-700 border-purple-200",
  COMPLETED: "bg-green-100 text-green-700 border-green-200",
  CANCELLED: "bg-gray-100 text-gray-600 border-gray-200",
};

const TRANSITIONS: Record<string, string[]> = {
  REPORTED: ["DIAGNOSED", "CANCELLED"],
  DIAGNOSED: ["REPAIRING", "CANCELLED"],
  REPAIRING: ["COMPLETED", "CANCELLED"],
};

export default function RepairsTab() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [repairDialog, setRepairDialog] = useState(false);
  const [repairEquipId, setRepairEquipId] = useState("");
  const [repairIssue, setRepairIssue] = useState("");
  const [repairType, setRepairType] = useState("HARDWARE");
  const [repairEstCost, setRepairEstCost] = useState(0);
  const [repairNotes, setRepairNotes] = useState("");

  const { data, isLoading } = useQuery<{ items: RepairItem[]; pagination: { page: number; total: number; totalPages: number } }>({
    queryKey: ["equipment-repairs", filterStatus, search, page],
    queryFn: () => apiFetch(`/api/equipment/repairs?status=${filterStatus}&search=${encodeURIComponent(search)}&page=${page}&limit=20`),
  });

  const { data: detail } = useQuery<{ repair: RepairItem }>({
    queryKey: ["repair-detail", detailId],
    queryFn: () => apiFetch(`/api/equipment/repairs/${detailId}`),
    enabled: !!detailId,
  });

  const items = data?.items || [];
  const pagination = data?.pagination;

  const createMutation = useMutation({
    mutationFn: (body: { equipmentId: string; reportedIssue: string; repairType: string; estimatedCost: number; repairNotes: string }) => apiFetch("/api/equipment/repairs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Repair reported"); setRepairDialog(false); setRepairEquipId(""); setRepairIssue(""); setRepairNotes(""); queryClient.invalidateQueries({ queryKey: ["equipment-repairs"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to report repair"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, actualCost, repairNotes }: { id: string; status: string; actualCost?: number; repairNotes?: string }) => apiFetch(`/api/equipment/repairs/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, actualCost, repairNotes }) }),
    onSuccess: () => { toast.success("Repair updated"); queryClient.invalidateQueries({ queryKey: ["equipment-repairs"] }); queryClient.invalidateQueries({ queryKey: ["repair-detail"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to update repair"),
  });

  const handleCreate = () => {
    if (!repairEquipId) { toast.error("Equipment ID is required"); return; }
    createMutation.mutate({ equipmentId: repairEquipId, reportedIssue: repairIssue, repairType, estimatedCost: repairEstCost, repairNotes });
  };

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="flex gap-2 items-center flex-1 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search repairs..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-9 text-sm" />
          </div>
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="REPORTED">Reported</SelectItem>
              <SelectItem value="DIAGNOSED">Diagnosed</SelectItem>
              <SelectItem value="REPAIRING">Repairing</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => setRepairDialog(true)}><Wrench className="h-4 w-4 mr-1.5" /> Report Damage</Button>
      </div>

      {items.length === 0 ? (
        <Card className="border shadow-sm"><CardContent className="py-8 text-center text-sm text-muted-foreground">No repairs found.</CardContent></Card>
      ) : (
        <>
          <Card className="border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Equipment</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Est. Cost</TableHead>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium">{r.equipment?.name || "—"} <span className="text-xs text-muted-foreground ml-1">{r.equipment?.serialNumber}</span></TableCell>
                    <TableCell className="text-xs">{r.repairType}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${REPAIR_STATUS_STYLES[r.status] || ""}`}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs">{r.estimatedCost > 0 ? formatINR(r.estimatedCost) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</TableCell>
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

      {/* Report Damage Dialog */}
      <Dialog open={repairDialog} onOpenChange={setRepairDialog}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Report Damage</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Equipment ID *</Label><Input value={repairEquipId} onChange={(e) => setRepairEquipId(e.target.value)} placeholder="Enter equipment ID" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Repair Type</Label>
              <Select value={repairType} onValueChange={setRepairType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="HARDWARE">Hardware</SelectItem><SelectItem value="FIRMWARE">Firmware</SelectItem><SelectItem value="PHYSICAL">Physical</SelectItem><SelectItem value="ELECTRICAL">Electrical</SelectItem><SelectItem value="OTHER">Other</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Issue Description</Label><Textarea value={repairIssue} onChange={(e) => setRepairIssue(e.target.value)} rows={2} placeholder="Describe the issue..." /></div>
            <div className="space-y-1.5"><Label className="text-xs">Estimated Cost (₹)</Label><Input type="number" min="0" value={repairEstCost} onChange={(e) => setRepairEstCost(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={repairNotes} onChange={(e) => setRepairNotes(e.target.value)} rows={2} placeholder="Additional notes..." /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setRepairDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCreate}>Report Damage</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-lg">
          <DialogHeader><DialogTitle className="text-base">Repair Detail</DialogTitle></DialogHeader>
          {detail?.repair ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Equipment</p><p className="text-sm font-medium">{detail.repair.equipment?.name || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Serial</p><p className="text-sm font-medium">{detail.repair.equipment?.serialNumber || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Type</p><p className="text-sm">{detail.repair.repairType}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className={`text-xs ${REPAIR_STATUS_STYLES[detail.repair.status] || ""}`}>{detail.repair.status}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Estimated Cost</p><p className="text-sm">{detail.repair.estimatedCost > 0 ? formatINR(detail.repair.estimatedCost) : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Actual Cost</p><p className="text-sm">{detail.repair.actualCost > 0 ? formatINR(detail.repair.actualCost) : "—"}</p></div>
              </div>
              {detail.repair.reportedIssue && (
                <div><p className="text-xs text-muted-foreground mb-1">Issue Description</p><p className="text-sm bg-muted/50 p-2 rounded">{detail.repair.reportedIssue}</p></div>
              )}
              {detail.repair.repairNotes && (
                <div><p className="text-xs text-muted-foreground mb-1">Repair Notes</p><p className="text-sm bg-muted/50 p-2 rounded">{detail.repair.repairNotes}</p></div>
              )}
              <div className="text-xs text-muted-foreground">
                {detail.repair.startedAt && <span>Started: {new Date(detail.repair.startedAt).toLocaleDateString("en-IN")} · </span>}
                {detail.repair.completedAt && <span>Completed: {new Date(detail.repair.completedAt).toLocaleDateString("en-IN")}</span>}
              </div>
              {TRANSITIONS[detail.repair.status]?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2">Status Workflow</p>
                  <div className="flex gap-2 flex-wrap">
                    {TRANSITIONS[detail.repair.status].map((next) => (
                      <Button key={next} size="sm" variant="outline" className={`text-xs h-8 ${next === "CANCELLED" ? "border-red-200 text-red-600 hover:bg-red-50" : next === "COMPLETED" ? "border-green-200 text-green-600 hover:bg-green-50" : "hover:bg-muted"}`} onClick={() => updateMutation.mutate({ id: detail.repair.id, status: next })}>
                        {next === "CANCELLED" ? <XCircle className="h-3.5 w-3.5 mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}{next}
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
