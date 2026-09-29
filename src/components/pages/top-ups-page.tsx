"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Zap, Plus, Search, Edit, Trash2, ShoppingBag, History,
  Loader2, CheckCircle2, Package, Clock, Gauge, Database, AlertTriangle,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────
type TopUpType = "DATA" | "TIME" | "SPEED_BOOST";
type PurchaseStatus = "ACTIVE" | "USED" | "EXPIRED";

interface TopUpProduct {
  id: string;
  name: string;
  type: TopUpType;
  value: string;
  validity: string;
  price: number;
  active: boolean;
  purchaseCount: number;
}

interface TopUpPurchase {
  id: string;
  subscriberCode: string;
  subscriberName: string;
  product: string;
  productType: TopUpType;
  purchasedAt: string;
  expiresAt: string;
  totalValue: number;
  usedValue: number;
  remainingValue: number;
  status: PurchaseStatus;
  price: number;
}

interface TopUpFormData {
  name: string;
  type: TopUpType;
  value: string;
  validity: string;
  price: number;
}

const FALLBACK_PRODUCTS: TopUpProduct[] = [
  { id: "tp-1", name: "50 GB Data Boost", type: "DATA", value: "50 GB", validity: "30 days", price: 199, active: true, purchaseCount: 142 },
  { id: "tp-2", name: "100 GB Data Boost", type: "DATA", value: "100 GB", validity: "30 days", price: 349, active: true, purchaseCount: 89 },
  { id: "tp-3", name: "500 GB Data Pack", type: "DATA", value: "500 GB", validity: "60 days", price: 999, active: true, purchaseCount: 34 },
  { id: "tp-4", name: "24-Hour Unlimited", type: "TIME", value: "24 hours", validity: "24 hours", price: 49, active: true, purchaseCount: 256 },
  { id: "tp-5", name: "7-Day Unlimited", type: "TIME", value: "7 days", validity: "7 days", price: 149, active: true, purchaseCount: 178 },
  { id: "tp-6", name: "Speed Boost 200 Mbps", type: "SPEED_BOOST", value: "200 Mbps", validity: "24 hours", price: 99, active: true, purchaseCount: 312 },
  { id: "tp-7", name: "Speed Boost 500 Mbps", type: "SPEED_BOOST", value: "500 Mbps", validity: "6 hours", price: 69, active: true, purchaseCount: 198 },
  { id: "tp-8", name: "1 TB Data Mega Pack", type: "DATA", value: "1 TB", validity: "90 days", price: 1799, active: false, purchaseCount: 12 },
];

const FALLBACK_PURCHASES: TopUpPurchase[] = [
  { id: "pu-1", subscriberCode: "CRY-00104", subscriberName: "Arun Mehta", product: "50 GB Data Boost", productType: "DATA", purchasedAt: "2025-01-14", expiresAt: "2025-02-13", totalValue: 50, usedValue: 32.5, remainingValue: 17.5, status: "ACTIVE", price: 199 },
  { id: "pu-2", subscriberCode: "CRY-00104", subscriberName: "Arun Mehta", product: "Speed Boost 200 Mbps", productType: "SPEED_BOOST", purchasedAt: "2025-01-15", expiresAt: "2025-01-16", totalValue: 24, usedValue: 8, remainingValue: 16, status: "ACTIVE", price: 99 },
  { id: "pu-3", subscriberCode: "CRY-00218", subscriberName: "Priya Sharma", product: "100 GB Data Boost", productType: "DATA", purchasedAt: "2025-01-01", expiresAt: "2025-01-31", totalValue: 100, usedValue: 100, remainingValue: 0, status: "USED", price: 349 },
  { id: "pu-4", subscriberCode: "CRY-00156", subscriberName: "Rahul Verma", product: "7-Day Unlimited", productType: "TIME", purchasedAt: "2024-12-20", expiresAt: "2024-12-27", totalValue: 168, usedValue: 168, remainingValue: 0, status: "EXPIRED", price: 149 },
  { id: "pu-5", subscriberCode: "CRY-00089", subscriberName: "Kiran Joshi", product: "500 GB Data Pack", productType: "DATA", purchasedAt: "2025-01-10", expiresAt: "2025-03-11", totalValue: 500, usedValue: 87.2, remainingValue: 412.8, status: "ACTIVE", price: 999 },
  { id: "pu-6", subscriberCode: "CRY-00301", subscriberName: "Sunita Devi", product: "24-Hour Unlimited", productType: "TIME", purchasedAt: "2025-01-14", expiresAt: "2025-01-15", totalValue: 24, usedValue: 24, remainingValue: 0, status: "EXPIRED", price: 49 },
  { id: "pu-7", subscriberCode: "CRY-00175", subscriberName: "Deepak Singh", product: "Speed Boost 500 Mbps", productType: "SPEED_BOOST", purchasedAt: "2025-01-15", expiresAt: "2025-01-15", totalValue: 6, usedValue: 2, remainingValue: 4, status: "ACTIVE", price: 69 },
];

const PAGE_SIZE = 8;
const emptyForm: TopUpFormData = { name: "", type: "DATA", value: "", validity: "", price: 0 };

// ─── Helpers ────────────────────────────────────────────────────
function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function getTypeBadge(type: TopUpType) {
  switch (type) {
    case "DATA": return <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 w-fit"><Database className="h-2.5 w-2.5" />DATA</Badge>;
    case "TIME": return <Badge className="text-[10px] bg-green-600 hover:bg-green-700 text-white flex items-center gap-1 w-fit"><Clock className="h-2.5 w-2.5" />TIME</Badge>;
    case "SPEED_BOOST": return <Badge className="text-[10px] bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-1 w-fit"><Gauge className="h-2.5 w-2.5" />SPEED</Badge>;
    default: return <Badge variant="secondary" className="text-[10px]">{type}</Badge>;
  }
}

function getPurchaseStatusBadge(status: PurchaseStatus) {
  switch (status) {
    case "ACTIVE": return <Badge className="text-[10px] bg-green-600 hover:bg-green-700 text-white">Active</Badge>;
    case "USED": return <Badge variant="secondary" className="text-[10px]">Used</Badge>;
    case "EXPIRED": return <Badge variant="outline" className="text-[10px] border-gray-400 text-gray-500">Expired</Badge>;
    default: return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  }
}

function getProgressClass(percent: number): string {
  if (percent >= 90) return "[&>div]:bg-red-500";
  if (percent >= 70) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-green-500";
}

// ─── Component ────────────────────────────────────────────────────
export default function TopUpsPage() {
  const [productSearch, setProductSearch] = useState("");
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [page, setPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<TopUpProduct[]>([]);
  const [purchases, setPurchases] = useState<TopUpPurchase[]>([]);

  // Product CRUD
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TopUpFormData>(emptyForm);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // ─── Data Fetching ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/top-ups");
        if (!res.ok) throw new Error("Failed to fetch top-ups");
        const data = await res.json();
        if (data && typeof data === "object") {
          setProducts(Array.isArray(data.products) ? data.products : FALLBACK_PRODUCTS);
          setPurchases(Array.isArray(data.purchases) ? data.purchases : FALLBACK_PURCHASES);
        } else {
          setProducts(FALLBACK_PRODUCTS);
          setPurchases(FALLBACK_PURCHASES);
        }
      } catch (err) {
        // logger
        setError(err instanceof Error ? err.message : "Unknown error");
        setProducts(FALLBACK_PRODUCTS);
        setPurchases(FALLBACK_PURCHASES);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (typeFilter !== "ALL" && p.type !== typeFilter) return false;
      if (productSearch) {
        const q = productSearch.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, productSearch, typeFilter]);

  const filteredPurchases = useMemo(() => {
    if (!purchaseSearch) return purchases;
    const q = purchaseSearch.toLowerCase();
    return purchases.filter((p) => p.subscriberName.toLowerCase().includes(q) || p.subscriberCode.toLowerCase().includes(q) || p.product.toLowerCase().includes(q));
  }, [purchases, purchaseSearch]);

  const totalProductPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const paginatedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPurchasePages = Math.ceil(filteredPurchases.length / PAGE_SIZE);
  const paginatedPurchases = filteredPurchases.slice((purchasePage - 1) * PAGE_SIZE, purchasePage * PAGE_SIZE);

  async function handleSave(isEdit: boolean) {
    if (!form.name.trim()) { toast.error("Product name is required"); return; }
    if (!form.value.trim()) { toast.error("Value is required"); return; }
    if (!form.validity.trim()) { toast.error("Validity is required"); return; }
    if (form.price < 1) { toast.error("Price must be at least ₹1"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/top-ups", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: selectedId }),
      });
      if (!res.ok) throw new Error("Failed to save product");
      if (isEdit) { setProducts((prev) => prev.map((p) => p.id === selectedId ? { ...p, ...form } : p)); setEditOpen(false); setSelectedId(null); }
      else { setProducts((prev) => [...prev, { ...form, id: `tp-${Date.now()}`, active: true, purchaseCount: 0 }] as TopUpProduct[]); setAddOpen(false); }
      setForm(emptyForm);
      toast.success(isEdit ? "Product updated successfully" : "Product created successfully");
    } catch {
      toast.error("Failed to save product");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    try {
      await fetch(`/api/top-ups?id=${selectedId}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== selectedId));
      setDeleteOpen(false);
      setSelectedId(null);
      toast.success("Product deleted successfully");
    } catch {
      toast.error("Failed to delete product");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(product: TopUpProduct) {
    setSelectedId(product.id);
    setForm({ name: product.name, type: product.type, value: product.value, validity: product.validity, price: product.price });
    setEditOpen(true);
  }

  const totalRevenue = purchases.reduce((sum, p) => sum + p.price, 0);
  const activePurchases = purchases.filter((p) => p.status === "ACTIVE").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Top-Ups"
        description="Manage top-up products and view subscriber purchase history."
        icon={Zap}
        actions={
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { setForm(emptyForm); setAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Add Product
          </Button>
        }
      />

      {/* Error Banner */}
      {error && (
        <Card className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">Showing demo data — API unavailable: {error}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="h-16 w-full rounded-lg" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="border-0 rounded-xl ring-1 ring-teal-200/60 dark:ring-teal-800/40 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/50 dark:to-cyan-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-sm shadow-teal-500/25"><Package className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">{products.filter((p) => p.active).length}</p><p className="text-xs text-muted-foreground font-medium">Active Products</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-green-200/60 dark:ring-green-800/40 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-500/25"><ShoppingBag className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">{purchases.length}</p><p className="text-xs text-muted-foreground font-medium">Total Purchases</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-amber-200/60 dark:ring-amber-800/40 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 shadow-sm shadow-amber-500/25"><CheckCircle2 className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{activePurchases}</p><p className="text-xs text-muted-foreground font-medium">Active Top-Ups</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-purple-200/60 dark:ring-purple-800/40 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/50 dark:to-violet-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-sm shadow-purple-500/25"><Zap className="h-4 w-4 text-white" /></div><div><p className="text-lg font-bold tabular-nums text-purple-700 dark:text-purple-300">{formatINR(totalRevenue)}</p><p className="text-xs text-muted-foreground font-medium">Total Revenue</p></div></div></CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="products" className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Products</TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" />Purchase History</TabsTrigger>
        </TabsList>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="DATA">Data</SelectItem>
                <SelectItem value="TIME">Time</SelectItem>
                <SelectItem value="SPEED_BOOST">Speed Boost</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Product Name</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Value</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Validity</TableHead>
                          <TableHead className="text-xs">Price</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Purchases</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedProducts.length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No products found.</TableCell></TableRow>
                        ) : (
                          paginatedProducts.map((product) => (
                            <TableRow key={product.id} className="hover:bg-muted/50 transition-colors duration-150">
                              <TableCell className="text-xs font-medium">{product.name}</TableCell>
                              <TableCell>{getTypeBadge(product.type)}</TableCell>
                              <TableCell className="text-xs font-medium tabular-nums">{product.value}</TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{product.validity}</TableCell>
                              <TableCell className="text-sm font-bold tabular-nums">{formatINR(product.price)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden md:table-cell tabular-nums">{product.purchaseCount}</TableCell>
                              <TableCell>
                                <Badge variant={product.active ? "default" : "secondary"} className="text-[10px]">{product.active ? "Active" : "Inactive"}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(product)}><Edit className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => { setSelectedId(product.id); setDeleteOpen(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {totalProductPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <p className="text-xs text-muted-foreground">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredProducts.length)} of {filteredProducts.length}</p>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                        {Array.from({ length: totalProductPages }, (_, i) => i + 1).map((p) => (
                          <Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs" onClick={() => setPage(p)}>{p}</Button>
                        ))}
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalProductPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchase History Tab */}
        <TabsContent value="history" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search subscriber name, code, or product..." value={purchaseSearch} onChange={(e) => { setPurchaseSearch(e.target.value); setPurchasePage(1); }} className="pl-9" />
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Subscriber</TableHead>
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Purchased</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Expires</TableHead>
                          <TableHead className="text-xs">Usage</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs text-right">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedPurchases.length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No purchases found.</TableCell></TableRow>
                        ) : (
                          paginatedPurchases.map((purchase) => {
                            const usagePercent = purchase.totalValue > 0 ? Math.round((purchase.usedValue / purchase.totalValue) * 100) : 0;
                            return (
                              <TableRow key={purchase.id} className="hover:bg-muted/50 transition-colors duration-150">
                                <TableCell>
                                  <div>
                                    <div className="text-xs font-medium">{purchase.subscriberName}</div>
                                    <div className="text-[10px] text-muted-foreground font-mono">{purchase.subscriberCode}</div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs font-medium">{purchase.product}</span>
                                    {getTypeBadge(purchase.productType)}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{new Date(purchase.purchasedAt).toLocaleDateString()}</TableCell>
                                <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{new Date(purchase.expiresAt).toLocaleDateString()}</TableCell>
                                <TableCell>
                                  <div className="space-y-1 min-w-[120px]">
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-muted-foreground">{purchase.usedValue} / {purchase.totalValue}</span>
                                      <span className={`font-medium tabular-nums ${usagePercent >= 90 ? "text-red-600" : usagePercent >= 70 ? "text-amber-600" : "text-green-600"}`}>{usagePercent}%</span>
                                    </div>
                                    <Progress value={usagePercent} className={`h-2 ${getProgressClass(usagePercent)}`} />
                                  </div>
                                </TableCell>
                                <TableCell>{getPurchaseStatusBadge(purchase.status)}</TableCell>
                                <TableCell className="text-right text-sm font-bold tabular-nums">{formatINR(purchase.price)}</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {totalPurchasePages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <p className="text-xs text-muted-foreground">Showing {(purchasePage - 1) * PAGE_SIZE + 1}–{Math.min(purchasePage * PAGE_SIZE, filteredPurchases.length)} of {filteredPurchases.length}</p>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={purchasePage <= 1} onClick={() => setPurchasePage((p) => p - 1)}>Prev</Button>
                        {Array.from({ length: totalPurchasePages }, (_, i) => i + 1).map((p) => (
                          <Button key={p} variant={p === purchasePage ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs" onClick={() => setPurchasePage(p)}>{p}</Button>
                        ))}
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={purchasePage >= totalPurchasePages} onClick={() => setPurchasePage((p) => p + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Product Dialog */}
      <Dialog open={addOpen || editOpen} onOpenChange={(open) => { if (!open) { setAddOpen(false); setEditOpen(false); setSelectedId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5" />{editOpen ? "Edit Product" : "Add Product"}</DialogTitle>
            <DialogDescription>{editOpen ? "Update the top-up product details." : "Create a new top-up product."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Product Name</Label><Input placeholder="e.g. 50 GB Data Boost" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Type</Label><Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as TopUpType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DATA">Data</SelectItem><SelectItem value="TIME">Time</SelectItem><SelectItem value="SPEED_BOOST">Speed Boost</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Value</Label><Input placeholder="e.g. 50 GB" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Validity</Label><Input placeholder="e.g. 30 days" value={form.validity} onChange={(e) => setForm((p) => ({ ...p, validity: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Price (₹)</Label><Input type="number" min={1} value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: parseInt(e.target.value) || 0 }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setEditOpen(false); }}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleSave(!!editOpen)} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              {editOpen ? "Update" : "Create"} Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this product? Active subscribers using this product will not be affected, but no new purchases will be allowed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
