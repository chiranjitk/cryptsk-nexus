"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Building2, User, MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react";
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
import { Customer360Dialog } from "@/components/admin/customer-360-dialog";

type Customer = {
  id: string; customerCode: string; type: string; status: string;
  displayName: string; email: string | null; phone: string | null;
  companyName: string | null; gstin: string | null; kycVerified: boolean;
  createdAt: string; _count: { subscribers: number; subscriptions: number };
};

export function CustomersPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [view360Id, setView360Id] = React.useState<string | null>(null);
  const [editTarget, setEditTarget] = React.useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Customer | null>(null);

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
            {customers.length} customers · Single source for RADIUS users
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" /> Add Customer
        </Button>
      </div>

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
                    <TableHead>Customer</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Subscribers</TableHead>
                    <TableHead>Subscriptions</TableHead>
                    <TableHead>GST</TableHead>
                    <TableHead>KYC</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/50">
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
                  ))}
                  {customers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
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
