"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Wifi, Zap, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Plan = { id: string; planCode: string; name: string; billingCycle: string; basePrice: number; currency: string; status: string };
type Product = {
  id: string; productCode: string; name: string; type: string; status: string;
  downloadSpeed: number | null; uploadSpeed: number | null;
  dataLimitGb: number | null; radiusGroupName: string | null;
  plans: Plan[]; _count: { plans: number };
};

export function ProductsPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["products", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const products: Product[] = data?.products || [];

  function fmtSpeed(kbps: number | null) {
    if (!kbps) return "—";
    const mbps = kbps / 1000;
    return mbps >= 1000 ? `${(mbps / 1000).toFixed(1)} Gbps` : `${mbps} Mbps`;
  }

  function getStatusColor(status: string) {
    if (status === "active") return "border-emerald-500/30 bg-emerald-500/5 text-emerald-600";
    if (status === "draft") return "border-amber-500/30 bg-amber-500/5 text-amber-600";
    if (status === "deprecated") return "border-rose-500/30 bg-rose-500/5 text-rose-600";
    return "border-muted bg-muted/50 text-muted-foreground";
  }

  function fmtPrice(price: number, currency: string) {
    const symbol = currency === "INR" ? "₹" : currency + " ";
    return `${symbol}${price.toLocaleString("en-IN")}`;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products & Packages</h1>
          <p className="text-sm text-muted-foreground">
            {products.length} products · Single source for RADIUS groups
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" /> Add Product
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Products</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-48 pl-8 text-sm" />
            </div>
          </div>
        </CardHeader>
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
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Speed (D/U)</TableHead>
                    <TableHead>Data Limit</TableHead>
                    <TableHead>RADIUS Group</TableHead>
                    <TableHead>Plans</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <Collapsible key={p.id} asChild>
                      <React.Fragment>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell>
                            {p.plans.length > 0 && (
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7 group">
                                  <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                                </Button>
                              </CollapsibleTrigger>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                                {p.type === "broadband" ? <Wifi className="size-4 text-primary" /> : <Zap className="size-4 text-primary" />}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{p.name}</p>
                                <p className="text-[10px] text-muted-foreground">{p.type}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-mono">{p.productCode}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{p.type}</Badge></TableCell>
                          <TableCell className="text-xs tabular-nums">
                            <span className="text-emerald-600 font-medium">{fmtSpeed(p.downloadSpeed)}</span>
                            <span className="text-muted-foreground mx-1">/</span>
                            <span className="text-blue-600 font-medium">{fmtSpeed(p.uploadSpeed)}</span>
                          </TableCell>
                          <TableCell className="text-xs">{p.dataLimitGb ? `${p.dataLimitGb} GB` : <span className="text-emerald-600 font-medium">Unlimited</span>}</TableCell>
                          <TableCell className="text-xs font-mono text-violet-600">{p.radiusGroupName || "—"}</TableCell>
                          <TableCell className="text-sm tabular-nums font-medium">{p._count.plans}</TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${getStatusColor(p.status)}`}>{p.status}</Badge></TableCell>
                        </TableRow>
                        <CollapsibleContent>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={9} className="py-2">
                              <div className="pl-12 space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Pricing Plans ({p.plans.length})</p>
                                {p.plans.map((plan) => (
                                  <div key={plan.id} className="flex items-center justify-between rounded border bg-card p-2">
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs font-mono">{plan.planCode}</span>
                                      <span className="text-sm font-medium">{plan.name}</span>
                                      <Badge variant="secondary" className="text-[9px]">{plan.billingCycle}</Badge>
                                      <Badge variant="outline" className={`text-[9px] ${getStatusColor(plan.status)}`}>{plan.status}</Badge>
                                    </div>
                                    <span className="text-sm font-bold tabular-nums">{fmtPrice(plan.basePrice, plan.currency)}</span>
                                  </div>
                                ))}
                                {p.plans.length === 0 && <p className="text-xs text-muted-foreground">No active plans. Create one in the Plans section.</p>}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </React.Fragment>
                    </Collapsible>
                  ))}
                  {products.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        No products found. Click "Add Product" to create one.
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
        <CreateProductDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["products"] }); }} />
      )}
    </div>
  );
}

function CreateProductDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState("broadband");
  const [downloadSpeed, setDownloadSpeed] = React.useState("50000");
  const [uploadSpeed, setUploadSpeed] = React.useState("25000");
  const [dataLimitGb, setDataLimitGb] = React.useState("");
  const [radiusGroupName, setRadiusGroupName] = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, downloadSpeed, uploadSpeed, dataLimitGb: dataLimitGb || null, radiusGroupName }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Product created" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
          <DialogDescription>Products sync to RADIUS groups (radgroupcheck) in Phase 3</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Product Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Broadband 50Mbps" className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="broadband">Broadband</option>
                <option value="voip">VoIP</option>
                <option value="iptv">IPTV</option>
                <option value="addon">Add-on</option>
                <option value="hardware">Hardware</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RADIUS Group Name</Label>
              <Input value={radiusGroupName} onChange={(e) => setRadiusGroupName(e.target.value)} placeholder="BB-50Mbps" className="h-9 font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Download Speed (kbps)</Label>
              <Input type="number" value={downloadSpeed} onChange={(e) => setDownloadSpeed(e.target.value)} className="h-9" placeholder="50000 = 50Mbps" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Upload Speed (kbps)</Label>
              <Input type="number" value={uploadSpeed} onChange={(e) => setUploadSpeed(e.target.value)} className="h-9" placeholder="25000 = 25Mbps" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data Limit (GB, blank = unlimited)</Label>
            <Input type="number" value={dataLimitGb} onChange={(e) => setDataLimitGb(e.target.value)} className="h-9" placeholder="100" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Create Product</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
