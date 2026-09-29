"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Building2, User, MoreHorizontal, Eye, Edit, Trash2,
  UserPlus, KeyRound, Copy, Check, CheckCircle, AlertTriangle, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Customer360Dialog } from "@/components/admin/customer-360-dialog";

type Customer = {
  id: string; customerCode: string; type: string; status: string;
  displayName: string; email: string | null; phone: string | null;
  companyName: string | null; gstin: string | null; pan: string | null; kycVerified: boolean;
  createdAt: string; _count: { subscribers: number; subscriptions: number; portalUsers?: number };
};

// POST /api/portal-users/bulk response shapes (backend T10-a)
type BulkProvisionCreated = {
  customerId: string; customerCode: string; displayName: string; email: string; tempPassword: string;
};
type BulkProvisionSkipped = {
  customerId: string; customerCode: string; displayName: string; reason: string;
};
type BulkProvisionResult = { created: BulkProvisionCreated[]; skipped: BulkProvisionSkipped[] };

const SKIPPED_REASONS: Record<string, string> = {
  "not-found": "Customer no longer exists",
  "no-email": "Customer has no email address to log in with",
  "already-provisioned": "Portal login already exists",
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

export function CustomersPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [view360Id, setView360Id] = React.useState<string | null>(null);
  const [editTarget, setEditTarget] = React.useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Customer | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = React.useState<BulkProvisionResult | null>(null);
  const [bulkError, setBulkError] = React.useState<string | null>(null);

  // Selection tracks the VISIBLE (filtered) list — a new search invalidates it.
  React.useEffect(() => { setSelected(new Set()); }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/customers?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(body.error || "Failed to delete customer") as Error & { code?: string; details?: Record<string, number> };
        err.code = body.code;
        err.details = body.details;
        throw err;
      }
      return body;
    },
    onSuccess: () => {
      toast({ title: "Customer deleted" });
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err: any) => {
      if (err.code === "FK_CONSTRAINT") {
        const d = err.details || {};
        toast({
          title: "Cannot delete customer",
          description: `${d.subscribers || 0} subscriber(s) and ${d.unpaidInvoices || 0} unpaid invoice(s) are still linked. Remove the subscribers and settle or cancel the invoices first.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
  });

  const customers: Customer[] = data?.customers || [];

  // Bulk provisioning bookkeeping. portalUsers is additive from the backend
  // (T10-a) — treat a missing count as 0 so rows stay eligible-safe.
  const withoutPortal = customers.filter((c) => (c._count.portalUsers ?? 0) === 0).length;
  const eligibleCount = customers.filter((c) => selected.has(c.id) && (c._count.portalUsers ?? 0) === 0).length;
  const allVisibleSelected = customers.length > 0 && customers.every((c) => selected.has(c.id));
  const someVisibleSelected = customers.some((c) => selected.has(c.id));

  const provisionBulk = useMutation({
    mutationFn: async (customerIds: string[]) => {
      const res = await fetch("/api/portal-users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Bulk provisioning failed");
      return body as BulkProvisionResult;
    },
    onSuccess: (result) => setBulkResult(result),
    onError: (err: Error) => {
      // Server message verbatim — destructive toast AND inline in the dialog.
      setBulkError(err.message);
      toast({ title: "Provisioning failed", description: err.message, variant: "destructive" });
    },
  });

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    const next = new Set<string>();
    if (checked) customers.forEach((c) => next.add(c.id));
    setSelected(next);
  }

  function getTypeIcon(type: string) {
    return type === "individual" ? <User className="size-3" /> : <Building2 className="size-3" />;
  }

  function getStatusColor(status: string) {
    if (status === "active") return "border-emerald-500/30 bg-emerald-500/5 text-emerald-600";
    if (status === "suspended") return "border-amber-500/30 bg-amber-500/5 text-amber-600";
    if (status === "blacklisted") return "border-rose-500/30 bg-rose-500/5 text-rose-600";
    return "border-muted bg-muted/50 text-muted-foreground";
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers / Subscribers</h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} customers · Single source for RADIUS users{withoutPortal > 0 ? ` · ${withoutPortal} without portal login` : ""}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" /> Add Customer
        </Button>
      </div>

      {/* Bulk action bar — sticky above the table while a selection exists */}
      {selected.size > 0 && (
        <div
          className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 cryptsk-fade-in"
          role="region"
          aria-label="Bulk actions"
        >
          <p className="text-sm"><strong>{selected.size} selected</strong></p>
          <p className="text-xs text-muted-foreground">
            {eligibleCount} of {selected.size} selected need provisioning
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 disabled:pointer-events-auto disabled:cursor-not-allowed"
              disabled={provisionBulk.isPending || eligibleCount === 0}
              title={eligibleCount === 0 ? "All selected customers already have a portal login" : undefined}
              onClick={() => provisionBulk.mutate([...selected])}
            >
              {provisionBulk.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              Provision portal access
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Customers</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, email, phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-64 pl-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="size-6 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[36px]">
                      <Checkbox
                        aria-label="Select all customers"
                        checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                        onCheckedChange={(v) => toggleAll(v === true)}
                      />
                    </TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Subscribers</TableHead>
                    <TableHead>Subscriptions</TableHead>
                    <TableHead>Portal</TableHead>
                    <TableHead>GST</TableHead>
                    <TableHead>KYC</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => {
                    const portalUsers = c._count.portalUsers ?? 0;
                    return (
                      <TableRow key={c.id} className={selected.has(c.id) ? "bg-primary/[0.04] hover:bg-muted/50" : "hover:bg-muted/50"}>
                        <TableCell>
                          <Checkbox
                            aria-label={`Select ${c.displayName}`}
                            checked={selected.has(c.id)}
                            onCheckedChange={(v) => toggleRow(c.id, v === true)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-8">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                {c.displayName.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{c.displayName}</p>
                              <p className="text-xs text-muted-foreground">{c.email || c.phone || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{c.customerCode}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] gap-1">
                            {getTypeIcon(c.type)}
                            {c.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${getStatusColor(c.status)}`}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums font-medium">{c._count.subscribers}</TableCell>
                        <TableCell className="text-sm tabular-nums font-medium">{c._count.subscriptions}</TableCell>
                        <TableCell>
                          {portalUsers > 0 ? (
                            <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 bg-emerald-500/5 text-emerald-600">
                              <KeyRound className="size-2.5" />
                              {portalUsers} login{portalUsers === 1 ? "" : "s"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">No portal login</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{c.gstin || "—"}</TableCell>
                        <TableCell>
                          {c.kycVerified ? (
                            <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-600">✓</Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setView360Id(c.id)}>
                                <Eye className="mr-2 size-4" /> View 360°
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditTarget(c)}>
                                <Edit className="mr-2 size-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-rose-600 focus:text-rose-600 focus:bg-rose-500/10"
                                onClick={() => setDeleteTarget(c)}
                              >
                                <Trash2 className="mr-2 size-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {customers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                        No customers found. Click "Add Customer" to create one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <CreateCustomerDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["customers"] }); }} />
      )}

      {/* 360° full-detail dialog */}
      <Customer360Dialog
        customerId={view360Id}
        open={!!view360Id}
        onOpenChange={(o) => { if (!o) setView360Id(null); }}
      />

      {/* Edit dialog */}
      {editTarget && (
        <EditCustomerDialog
          customer={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            qc.invalidateQueries({ queryKey: ["customers"] });
            qc.invalidateQueries({ queryKey: ["customer-360", editTarget.id] });
          }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the customer record{deleteTarget?.customerCode ? ` (${deleteTarget.customerCode})` : ""} along with its contacts and addresses.
              Deletion is blocked if the customer still has subscribers or unpaid invoices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteCustomer.mutate(deleteTarget.id);
              }}
            >
              {deleteCustomer.isPending ? "Deleting…" : "Delete Customer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk portal provisioning result — credentials are one-time secrets */}
      {(bulkResult || bulkError) && (
        <BulkProvisionResultDialog
          result={bulkResult}
          error={bulkError}
          onClose={() => {
            setBulkResult(null);
            setBulkError(null);
            setSelected(new Set());
            qc.invalidateQueries({ queryKey: ["customers"] });
          }}
        />
      )}
    </div>
  );
}

function EditCustomerDialog({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = React.useState(customer.displayName);
  const [email, setEmail] = React.useState(customer.email || "");
  const [phone, setPhone] = React.useState(customer.phone || "");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [companyName, setCompanyName] = React.useState(customer.companyName || "");
  const [gstin, setGstin] = React.useState(customer.gstin || "");
  const [pan, setPan] = React.useState(customer.pan || "");
  const [status, setStatus] = React.useState(customer.status);
  const [kycVerified, setKycVerified] = React.useState(customer.kycVerified);
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName, email: email || null, phone: phone || null,
          companyName: companyName || null, gstin: gstin || null, pan: pan || null,
          status, kycVerified,
          // list API doesn't return these — only send when user provided a value
          ...(whatsapp ? { whatsappNumber: whatsapp } : {}),
          ...(notes ? { notes } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update customer");
      }
      toast({ title: "Customer updated" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription>Update customer details ({customer.customerCode})</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Display Name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Company Name</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="suspended">suspended</option>
                <option value="blacklisted">blacklisted</option>
                <option value="prospect">prospect</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">GSTIN</Label>
              <Input value={gstin} onChange={(e) => setGstin(e.target.value)} className="h-9 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">PAN</Label>
              <Input value={pan} onChange={(e) => setPan(e.target.value)} className="h-9 font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">WhatsApp Number</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="h-9" placeholder="Only filled value is saved" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">KYC Verified</p>
              <p className="text-xs text-muted-foreground">Identity documents verified</p>
            </div>
            <Switch checked={kycVerified} onCheckedChange={setKycVerified} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Only filled value is saved" className="text-sm" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save Changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateCustomerDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [type, setType] = React.useState("individual");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [gstin, setGstin] = React.useState("");
  const [pan, setPan] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, firstName, lastName, companyName, gstin, pan, email, phone, whatsappNumber: whatsapp }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast({ title: "Customer created" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
          <DialogDescription>Create a customer record (single source for RADIUS users)</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Customer Type</Label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="individual">Individual</option>
              <option value="business">Business</option>
              <option value="government">Government</option>
              <option value="reseller">Reseller</option>
              <option value="lco">LCO / Partner</option>
            </select>
          </div>
          {type === "individual" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">First Name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last Name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-9" />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Company Name</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="h-9" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">GSTIN</Label>
                  <Input value={gstin} onChange={(e) => setGstin(e.target.value)} className="h-9 font-mono" placeholder="27ABCDE1234F1Z5" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">PAN</Label>
                  <Input value={pan} onChange={(e) => setPan(e.target.value)} className="h-9 font-mono" placeholder="ABCDE1234F" />
                </div>
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" placeholder="+91 98765 43210" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">WhatsApp Number</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="h-9" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Create Customer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- bulk portal provisioning result (temp passwords are one-time secrets) ----------

function BulkProvisionResultDialog({ result, error, onClose }: { result: BulkProvisionResult | null; error: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const [copiedAll, setCopiedAll] = React.useState(false);
  const [copiedRow, setCopiedRow] = React.useState<string | null>(null);
  const created = result?.created || [];
  const skipped = result?.skipped || [];

  async function handleCopyAll() {
    if (created.length === 0) return;
    const ok = await copyToClipboard(created.map((r) => `${r.email} — ${r.tempPassword}`).join("\n"));
    if (ok) {
      setCopiedAll(true);
      toast({ title: `Copied ${created.length} credentials` });
      window.setTimeout(() => setCopiedAll(false), 2500);
    } else {
      toast({ title: "Copy failed", description: "Select the credentials below and copy them manually.", variant: "destructive" });
    }
  }

  async function handleCopyRow(row: BulkProvisionCreated) {
    const ok = await copyToClipboard(row.tempPassword);
    if (ok) {
      setCopiedRow(row.customerId);
      window.setTimeout(() => setCopiedRow((cur) => (cur === row.customerId ? null : cur)), 2000);
    } else {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {created.length > 0 ? (
              <><CheckCircle className="size-4 text-emerald-500" /> Portal access provisioned</>
            ) : (
              "Bulk provisioning failed"
            )}
          </DialogTitle>
          <DialogDescription>
            {created.length > 0 || skipped.length > 0
              ? `${created.length} portal account${created.length === 1 ? "" : "s"} created${skipped.length > 0 ? ` · ${skipped.length} skipped` : ""}.`
              : "No changes were made."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        {created.length > 0 && (
          <>
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="text-xs font-medium text-amber-600">
                Temporary passwords are shown once. Hand them to the customer securely.
              </p>
            </div>
            <div className="max-h-96 overflow-y-auto rounded-md border cryptsk-scrollbar" aria-label="Created portal credentials">
              <ul className="divide-y">
                {created.map((r) => (
                  <li key={r.customerId} className="flex items-center justify-between gap-2 p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                      <p className="font-mono text-xs font-semibold tracking-wide">{r.tempPassword}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() => handleCopyRow(r)}
                      aria-label={`Copy password for ${r.displayName}`}
                      title="Copy password"
                    >
                      {copiedRow === r.customerId ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {skipped.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-3 cryptsk-scrollbar" aria-label="Skipped customers">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Skipped</p>
            <ul className="space-y-1.5">
              {skipped.map((r) => (
                <li key={r.customerId} className="text-xs text-muted-foreground">
                  <span className="font-mono">{r.customerCode}</span> · {r.displayName} — {SKIPPED_REASONS[r.reason] || r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          {created.length > 0 && (
            <Button variant="outline" className="gap-1.5" onClick={handleCopyAll}>
              {copiedAll ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              Copy all ({created.length})
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
