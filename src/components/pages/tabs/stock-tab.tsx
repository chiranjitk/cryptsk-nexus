"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calculator, Search, Plus, ChevronLeft, ChevronRight, History } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { apiFetch } from "@/lib/utils";

interface AdjustmentItem {
  id: string; equipmentId: string; equipment: { id: string; name: string; category: string; serialNumber: string } | null;
  adjustedBy: string | null; previousQty: number; newQty: number; reason: string; notes: string; createdAt: string;
}

const REASON_STYLES: Record<string, string> = {
  CORRECTION: "bg-teal-100 text-teal-700 border-teal-200",
  DAMAGE: "bg-red-100 text-red-700 border-red-200",
  TRANSFER: "bg-purple-100 text-purple-700 border-purple-200",
  AUDIT: "bg-green-100 text-green-700 border-green-200",
  OTHER: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function StockTab() {
  const queryClient = useQueryClient();
  const [filterReason, setFilterReason] = useState("all");
  const [page, setPage] = useState(1);
  const [adjustDialog, setAdjustDialog] = useState(false);
  const [adjustEquipId, setAdjustEquipId] = useState("");
  const [adjustNewQty, setAdjustNewQty] = useState(1);
  const [adjustReason, setAdjustReason] = useState("CORRECTION");
  const [adjustNotes, setAdjustNotes] = useState("");

  const { data, isLoading } = useQuery<{ items: AdjustmentItem[]; pagination: { page: number; total: number; totalPages: number } }>({
    queryKey: ["equipment-adjustments", filterReason, page],
    queryFn: () => apiFetch(`/api/equipment/adjustments?reason=${filterReason}&page=${page}&limit=20`),
  });

  const { data: historyData } = useQuery<{ history: AdjustmentItem[] }>({
    queryKey: ["adjustment-history"],
    queryFn: () => apiFetch("/api/equipment/adjustments/history?limit=50"),
  });

  const items = data?.items || [];
  const history = historyData?.history || [];
  const pagination = data?.pagination;

  const createMutation = useMutation({
    mutationFn: (body: { equipmentId: string; newQty: number; reason: string; notes: string }) => apiFetch("/api/equipment/adjustments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Stock adjusted"); setAdjustDialog(false); setAdjustEquipId(""); setAdjustNotes(""); queryClient.invalidateQueries({ queryKey: ["equipment-adjustments"] }); queryClient.invalidateQueries({ queryKey: ["adjustment-history"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to adjust stock"),
  });

  const handleAdjust = () => {
    if (!adjustEquipId) { toast.error("Equipment ID is required"); return; }
    createMutation.mutate({ equipmentId: adjustEquipId, newQty: adjustNewQty, reason: adjustReason, notes: adjustNotes });
  };

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="flex gap-2 items-center flex-1 w-full sm:w-auto">
          <Select value={filterReason} onValueChange={(v) => { setFilterReason(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reasons</SelectItem>
              <SelectItem value="CORRECTION">Correction</SelectItem>
              <SelectItem value="DAMAGE">Damage</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
              <SelectItem value="AUDIT">Audit</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => setAdjustDialog(true)}><Plus className="h-4 w-4 mr-1.5" /> Adjust Stock</Button>
      </div>

      {items.length === 0 && history.length === 0 ? (
        <Card className="border shadow-sm"><CardContent className="py-8 text-center text-sm text-muted-foreground">No stock adjustments found.</CardContent></Card>
      ) : (
        <>
          <Card className="border shadow-sm">
            <CardHeader className="pb-2"><p className="text-sm font-semibold flex items-center gap-2"><History className="h-4 w-4 text-red-600" /> Adjustment History</p></CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Equipment</TableHead>
                      <TableHead className="text-xs">Previous</TableHead>
                      <TableHead className="text-xs">New</TableHead>
                      <TableHead className="text-xs">Reason</TableHead>
                      <TableHead className="text-xs">Notes</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(items.length > 0 ? items : history).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm font-medium">{a.equipment?.name || "—"} <span className="text-xs text-muted-foreground ml-1">{a.equipment?.serialNumber}</span></TableCell>
                        <TableCell className="text-xs">{a.previousQty}</TableCell>
                        <TableCell className="text-xs font-semibold">{a.newQty}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${REASON_STYLES[a.reason] || ""}`}>{a.reason}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{a.notes || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {pagination && pagination.totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-3">
                  <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-xs text-muted-foreground">Page {page} of {pagination.totalPages}</span>
                  <Button variant="outline" size="sm" className="h-8" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Adjust Stock Dialog */}
      <Dialog open={adjustDialog} onOpenChange={setAdjustDialog}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4 text-red-600" /> Adjust Stock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Equipment ID *</Label><Input value={adjustEquipId} onChange={(e) => setAdjustEquipId(e.target.value)} placeholder="Enter equipment ID" /></div>
            <div className="space-y-1.5"><Label className="text-xs">New Quantity *</Label><Input type="number" min="0" value={adjustNewQty} onChange={(e) => setAdjustNewQty(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Reason</Label>
              <Select value={adjustReason} onValueChange={setAdjustReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORRECTION">Correction</SelectItem>
                  <SelectItem value="DAMAGE">Damage</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                  <SelectItem value="AUDIT">Audit</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} rows={2} placeholder="Reason for adjustment..." /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAdjustDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleAdjust}>Adjust Stock</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
