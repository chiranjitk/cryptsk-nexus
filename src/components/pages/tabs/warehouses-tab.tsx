"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Warehouse, Plus, Pencil, Trash2, Search, Building2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";

interface WarehouseItem {
  id: string; name: string; address: string; city: string; state: string; pincode: string; isDefault: boolean; status: string; createdAt: string;
}

interface WarehouseSummary {
  id: string; name: string; city: string; state: string; isDefault: boolean; totalItems: number; categoryBreakdown: Record<string, number>; statusBreakdown: Record<string, number>;
}

const emptyForm = { name: "", address: "", city: "", state: "", pincode: "", isDefault: false, status: "ACTIVE" };

export default function WarehousesTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data, isLoading } = useQuery<{ warehouses: WarehouseItem[] }>({
    queryKey: ["warehouses", filterStatus, search],
    queryFn: () => apiFetch(`/api/warehouses?status=${filterStatus}&search=${encodeURIComponent(search)}`),
  });

  const { data: summaryData } = useQuery<{ summary: WarehouseSummary[] }>({
    queryKey: ["warehouse-summary"],
    queryFn: () => apiFetch("/api/warehouses/summary"),
  });

  const warehouses = data?.warehouses || [];
  const summary = summaryData?.summary || [];

  const createMutation = useMutation({
    mutationFn: (body: typeof emptyForm) => apiFetch("/api/warehouses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Warehouse created"); setDialogOpen(false); setForm(emptyForm); setEditId(null); queryClient.invalidateQueries({ queryKey: ["warehouses"] }); queryClient.invalidateQueries({ queryKey: ["warehouse-summary"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to create warehouse"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: typeof emptyForm & { id: string }) => apiFetch(`/api/warehouses/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Warehouse updated"); setDialogOpen(false); setForm(emptyForm); setEditId(null); queryClient.invalidateQueries({ queryKey: ["warehouses"] }); queryClient.invalidateQueries({ queryKey: ["warehouse-summary"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to update warehouse"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/warehouses/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Warehouse deleted"); setDeleteId(null); queryClient.invalidateQueries({ queryKey: ["warehouses"] }); queryClient.invalidateQueries({ queryKey: ["warehouse-summary"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to delete warehouse"),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (editId) updateMutation.mutate({ id: editId, ...form });
    else createMutation.mutate(form);
  };

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;

  return (
    <>
      {summary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {summary.slice(0, 6).map((w) => (
            <Card key={w.id} className="border shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{w.name}</p>
                      <p className="text-xs text-muted-foreground">{w.city}{w.state ? `, ${w.state}` : ""} · {w.totalItems} items</p>
                    </div>
                  </div>
                  {w.isDefault && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">Default</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Object.entries(w.statusBreakdown).map(([s, c]) => (
                    <Badge key={s} variant="outline" className="text-[10px]">{s.replace("_", " ")}: {c}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="flex gap-2 items-center flex-1 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search warehouses..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="INACTIVE">Inactive</SelectItem></SelectContent>
          </Select>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white" size="sm" onClick={() => { setForm(emptyForm); setEditId(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> Add Warehouse</Button>
      </div>

      {warehouses.length === 0 ? (
        <Card className="border shadow-sm"><CardContent className="py-8 text-center text-sm text-muted-foreground">No warehouses found.</CardContent></Card>
      ) : (
        <Card className="border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Location</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Default</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="text-sm font-medium">{w.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{[w.city, w.state, w.pincode].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${w.status === "ACTIVE" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>{w.status}</Badge></TableCell>
                  <TableCell>{w.isDefault ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-gray-300" />}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setForm({ name: w.name, address: w.address, city: w.city, state: w.state, pincode: w.pincode, isDefault: w.isDefault, status: w.status }); setEditId(w.id); setDialogOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => setDeleteId(w.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-base">{editId ? "Edit" : "Add"} Warehouse</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Pincode</Label><Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Set as Default</Label>
              <Switch checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v })} />
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="INACTIVE">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleSubmit}>{editId ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Warehouse</AlertDialogTitle><AlertDialogDescription>Are you sure? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
